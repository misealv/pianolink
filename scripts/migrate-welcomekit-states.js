/**
 * scripts/migrate-welcomekit-states.js
 * 
 * Sprint 3 — Migración de estados WelcomeKit: 11 estados legacy → 6 simplificados.
 * 
 * Mapeo:
 *   paid, entrevista_pendiente, entrevista_agendada, esperando_equipo, shipping, delivered → onboarding
 *   setup_pending, setup_scheduled → setup
 *   trial_available, trial_scheduled → trial_ready
 *   trial_completed → trial_done
 *   completed → active
 *   refunded, disputed → refunded
 * 
 * El estado legacy se preserva en el campo `_legacyStatus` dentro de setupSession.technicianNotes
 * para trazabilidad.
 * 
 * Uso:
 *   DRY_RUN=1 node scripts/migrate-welcomekit-states.js   # Solo muestra qué haría
 *   node scripts/migrate-welcomekit-states.js              # Ejecuta la migración
 */

require('dotenv').config();
const mongoose = require('mongoose');
const WelcomeKit = require('../models/WelcomeKit');

const LEGACY_TO_NEW = {
    'paid':                 'onboarding',
    'entrevista_pendiente': 'onboarding',
    'entrevista_agendada':  'onboarding',
    'esperando_equipo':     'onboarding',
    'shipping':             'onboarding',
    'delivered':            'onboarding',
    'setup_pending':        'setup',
    'setup_scheduled':      'setup',
    'trial_available':      'trial_ready',
    'trial_scheduled':      'trial_ready',
    'trial_completed':      'trial_done',
    'completed':            'active',
    'disputed':             'refunded'
    // 'refunded' ya existe en el nuevo esquema, no necesita mapeo
};

async function migrate() {
    const isDryRun = process.env.DRY_RUN === '1';
    
    console.log('='.repeat(60));
    console.log('  MIGRACIÓN WelcomeKit: Estados Legacy → Simplificados');
    console.log(`  Modo: ${isDryRun ? '🔍 DRY RUN (sin cambios)' : '🚀 EJECUCIÓN REAL'}`);
    console.log('='.repeat(60));

    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!mongoUri) {
        console.error('❌ No se encontró MONGODB_URI en .env');
        process.exit(1);
    }

    await mongoose.connect(mongoUri);
    console.log('✅ Conectado a MongoDB\n');

    // 1. Auditoría: contar kits por estado actual
    const statusCounts = await WelcomeKit.aggregate([
        { $group: { _id: '$overallStatus', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
    ]);

    console.log('📊 Estados actuales en producción:');
    console.log('-'.repeat(40));
    let total = 0;
    for (const { _id, count } of statusCounts) {
        const newStatus = LEGACY_TO_NEW[_id] || _id;
        const isLegacy = LEGACY_TO_NEW.hasOwnProperty(_id);
        console.log(`  ${isLegacy ? '⚠️' : '✅'} ${_id}: ${count} kits ${isLegacy ? `→ ${newStatus}` : '(ya es nuevo)'}`);
        total += count;
    }
    console.log(`\n  Total: ${total} kits\n`);

    // 2. Encontrar kits con estados legacy
    const legacyStatuses = Object.keys(LEGACY_TO_NEW);
    const legacyKits = await WelcomeKit.find({
        overallStatus: { $in: legacyStatuses }
    });

    console.log(`🔄 Kits a migrar: ${legacyKits.length}`);

    if (legacyKits.length === 0) {
        console.log('\n✅ No hay kits con estados legacy. Nada que migrar.');
        await mongoose.disconnect();
        return;
    }

    // 3. Migrar
    const results = { success: 0, errors: [] };

    for (const kit of legacyKits) {
        const oldStatus = kit.overallStatus;
        const newStatus = LEGACY_TO_NEW[oldStatus];

        if (!newStatus) {
            console.log(`  ⏭️ ${kit._id} — "${oldStatus}" no tiene mapeo, skip`);
            continue;
        }

        // Preservar datos de sub-estado según el estado legacy
        enrichSubDocuments(kit, oldStatus);

        if (isDryRun) {
            console.log(`  🔍 ${kit._id} | ${kit.clientEmail || 'sin-email'} | ${oldStatus} → ${newStatus}`);
        } else {
            try {
                // Guardar estado legacy en notas para trazabilidad
                kit.setupSession = kit.setupSession || {};
                const timestamp = new Date().toISOString().split('T')[0];
                const prevNotes = kit.setupSession.technicianNotes || '';
                kit.setupSession.technicianNotes = prevNotes
                    ? `${prevNotes}\n\n---\n[Migración ${timestamp}] Estado legacy: ${oldStatus} → ${newStatus}`
                    : `[Migración ${timestamp}] Estado legacy: ${oldStatus} → ${newStatus}`;

                kit.overallStatus = newStatus;
                await kit.save();
                results.success++;
                console.log(`  ✅ ${kit._id} | ${kit.clientEmail || 'sin-email'} | ${oldStatus} → ${newStatus}`);
            } catch (err) {
                results.errors.push({ id: kit._id, error: err.message });
                console.error(`  ❌ ${kit._id} | Error: ${err.message}`);
            }
        }
    }

    // 4. Resumen
    console.log('\n' + '='.repeat(60));
    if (isDryRun) {
        console.log(`  🔍 DRY RUN completado. ${legacyKits.length} kits serían migrados.`);
        console.log(`  Ejecuta sin DRY_RUN=1 para aplicar los cambios.`);
    } else {
        console.log(`  ✅ Migración completada: ${results.success} exitosos, ${results.errors.length} errores`);
        if (results.errors.length > 0) {
            console.log('\n  Errores:');
            results.errors.forEach(e => console.log(`    ❌ ${e.id}: ${e.error}`));
        }
    }
    console.log('='.repeat(60));

    await mongoose.disconnect();
}

/**
 * Enriquece los sub-documentos del kit según el estado legacy.
 * Esto garantiza que la info que antes estaba implícita en el overallStatus
 * quede explícita en los sub-documentos.
 */
function enrichSubDocuments(kit, legacyStatus) {
    switch (legacyStatus) {
        case 'entrevista_agendada':
            // La entrevista fue agendada — el subdoc interview ya debería tener scheduledAt
            break;

        case 'esperando_equipo':
            // La entrevista se completó y se enviaron recomendaciones
            if (kit.interview && !kit.interview.completedAt) {
                kit.interview.completedAt = kit.updatedAt || new Date();
            }
            break;

        case 'delivered':
        case 'setup_pending':
            // El cliente confirmó equipo listo
            kit.shipping = kit.shipping || {};
            if (!kit.shipping.clientConfirmedReceipt) {
                kit.shipping.clientConfirmedReceipt = true;
                kit.shipping.clientConfirmedAt = kit.updatedAt || new Date();
            }
            kit.setupSession = kit.setupSession || {};
            if (!kit.setupSession.status || kit.setupSession.status === 'not_scheduled') {
                kit.setupSession.status = 'not_scheduled';
            }
            break;

        case 'setup_scheduled':
            kit.setupSession = kit.setupSession || {};
            if (kit.setupSession.status !== 'scheduled') {
                kit.setupSession.status = 'scheduled';
            }
            break;

        case 'trial_available':
            kit.setupSession = kit.setupSession || {};
            kit.setupSession.status = 'completed';
            kit.setupSession.completedAt = kit.setupSession.completedAt || kit.updatedAt || new Date();
            kit.trialClass = kit.trialClass || {};
            if (!kit.trialClass.status || kit.trialClass.status === 'not_available') {
                kit.trialClass.status = 'available';
                kit.trialClass.unlockedAt = kit.trialClass.unlockedAt || kit.updatedAt || new Date();
            }
            break;

        case 'trial_scheduled':
            kit.setupSession = kit.setupSession || {};
            kit.setupSession.status = 'completed';
            kit.trialClass = kit.trialClass || {};
            kit.trialClass.status = kit.trialClass.status || 'scheduled';
            break;

        case 'trial_completed':
            kit.trialClass = kit.trialClass || {};
            kit.trialClass.status = 'completed';
            kit.trialClass.completedAt = kit.trialClass.completedAt || kit.updatedAt || new Date();
            break;

        case 'completed':
            kit.trialClass = kit.trialClass || {};
            kit.trialClass.status = 'completed';
            kit.trialClass.completedAt = kit.trialClass.completedAt || kit.updatedAt || new Date();
            break;

        case 'disputed':
            kit.dispute = kit.dispute || {};
            kit.dispute.isActive = true;
            kit.dispute.openedAt = kit.dispute.openedAt || kit.updatedAt || new Date();
            break;
    }
}

migrate().catch(err => {
    console.error('Error fatal en migración:', err);
    process.exit(1);
});
