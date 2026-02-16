/**
 * scripts/migratePlans.js
 * Migración de Planes de Profesor — PianoLink v5.0 (Fase 1)
 * 
 * Asigna el campo `plan` y `permissions` a todos los profesores existentes:
 *   - isFounder: true  → plan: 'founder', permisos premium
 *   - subscriptionStatus: 'active' → plan: 'premium', permisos premium (si pagaban membresía)
 *   - Resto → plan: 'free', permisos básicos
 * 
 * USO:
 *   node scripts/migratePlans.js              # Dry run (solo muestra qué haría)
 *   node scripts/migratePlans.js --execute    # Ejecutar migración real
 * 
 * SEGURIDAD: Siempre ejecutar primero sin --execute para verificar.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

// Permisos según plan
const PERMISSIONS_BY_PLAN = {
    free: {
        canInvitePrivateStudents: false,
        hasPriorityQueue: false,
        maxActiveStudents: -1
    },
    premium: {
        canInvitePrivateStudents: true,
        hasPriorityQueue: true,
        maxActiveStudents: -1
    },
    founder: {
        canInvitePrivateStudents: true,
        hasPriorityQueue: true,
        maxActiveStudents: -1
    }
};

async function migratePlans(isDryRun = true) {
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!mongoUri) {
        console.error('❌ No se encontró MONGODB_URI ni MONGO_URI en variables de entorno');
        process.exit(1);
    }

    await mongoose.connect(mongoUri);
    console.log('✅ Conectado a MongoDB');
    console.log(`🔧 Modo: ${isDryRun ? 'DRY RUN (sin cambios)' : 'EJECUCIÓN REAL'}\n`);

    // Obtener todos los profesores
    const teachers = await User.find({ role: 'teacher' }).lean();
    console.log(`📊 Total profesores encontrados: ${teachers.length}\n`);

    const stats = { founder: 0, premium: 0, free: 0, alreadyMigrated: 0, errors: 0 };
    const changes = [];

    for (const teacher of teachers) {
        try {
            // Si ya tiene plan asignado (no undefined), saltar
            if (teacher.teacherData?.plan && ['free', 'premium', 'founder'].includes(teacher.teacherData.plan)) {
                stats.alreadyMigrated++;
                continue;
            }

            let plan = 'free';
            let reason = '';

            // Regla 1: Fundadores → plan founder
            if (teacher.isFounder || teacher.isFoundingMember) {
                plan = 'founder';
                reason = `isFounder=${teacher.isFounder}, isFoundingMember=${teacher.isFoundingMember}`;
            }
            // Regla 2: Suscripción activa con pago → plan premium
            // (Profesores que pagaban la membresía de $20 USD)
            else if (teacher.teacherData?.subscriptionStatus === 'active' && 
                     (teacher.teacherData?.stripeSubscriptionId || teacher.teacherData?.stripeCustomerId)) {
                plan = 'premium';
                reason = `subscriptionStatus=active, stripeSubscriptionId=${teacher.teacherData.stripeSubscriptionId}`;
            }
            // Regla 3: Todos los demás → plan free
            else {
                plan = 'free';
                reason = `subscriptionStatus=${teacher.teacherData?.subscriptionStatus || 'none'}`;
            }

            const permissions = PERMISSIONS_BY_PLAN[plan];

            changes.push({
                id: teacher._id,
                name: teacher.name,
                email: teacher.email,
                oldStatus: teacher.teacherData?.subscriptionStatus || 'none',
                isFounder: teacher.isFounder || false,
                newPlan: plan,
                reason,
                permissions
            });

            stats[plan]++;

            if (!isDryRun) {
                await User.updateOne(
                    { _id: teacher._id },
                    {
                        $set: {
                            'teacherData.plan': plan,
                            'teacherData.permissions': permissions,
                            ...(plan !== 'free' ? { 'teacherData.planActivatedAt': teacher.createdAt || new Date() } : {})
                        }
                    }
                );
            }
        } catch (error) {
            stats.errors++;
            console.error(`❌ Error procesando ${teacher.email}: ${error.message}`);
        }
    }

    // Resumen
    console.log('═══════════════════════════════════════════════════');
    console.log('                RESUMEN DE MIGRACIÓN');
    console.log('═══════════════════════════════════════════════════');
    console.log(`  Founder  → ${stats.founder} profesores`);
    console.log(`  Premium  → ${stats.premium} profesores`);
    console.log(`  Free     → ${stats.free} profesores`);
    console.log(`  Ya migrados (sin cambio) → ${stats.alreadyMigrated}`);
    console.log(`  Errores  → ${stats.errors}`);
    console.log('═══════════════════════════════════════════════════\n');

    // Detalle de cambios
    if (changes.length > 0) {
        console.log('📋 Detalle de cambios:');
        console.log('───────────────────────────────────────────────────');
        for (const change of changes) {
            const icon = change.newPlan === 'founder' ? '🏆' : change.newPlan === 'premium' ? '⭐' : '📝';
            console.log(`  ${icon} ${change.name} (${change.email})`);
            console.log(`     Status anterior: ${change.oldStatus} | isFounder: ${change.isFounder}`);
            console.log(`     Plan asignado: ${change.newPlan} | Razón: ${change.reason}`);
            console.log(`     Permisos: invite=${change.permissions.canInvitePrivateStudents}, priority=${change.permissions.hasPriorityQueue}`);
            console.log('');
        }
    }

    if (isDryRun && changes.length > 0) {
        console.log('⚠️  DRY RUN completado. Para aplicar cambios ejecuta:');
        console.log('    node scripts/migratePlans.js --execute\n');
    } else if (!isDryRun) {
        console.log('✅ Migración ejecutada exitosamente.\n');
    }

    await mongoose.connection.close();
    console.log('🔌 Conexión cerrada.');
}

// Ejecutar
const isExecute = process.argv.includes('--execute');
migratePlans(!isExecute)
    .catch(err => {
        console.error('❌ Error fatal:', err);
        process.exit(1);
    });
