/**
 * FASE 5 — Auditoría post-migración
 *
 * Verifica que:
 *   1. No quedan saldos no-guardian en User.classesRemaining
 *   2. Cada usuario migrado tiene su StudentSubscription activa con campos correctos
 *   3. La migración es idempotente (re-ejecutar dry-run no propone cambios)
 *   4. Los marcadores de deprecación están en su lugar
 *   5. BookingService tiene el warn de legacy fallback
 *   6. El Payment model NO tiene registros huérfanos del flujo manual
 *
 * Uso: node scripts/fase5-audit.js
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

let passed = 0;
let failed = 0;
const failures = [];

function assert(label, condition, detail = '') {
    if (condition) {
        console.log(`  ✅ ${label}`);
        passed++;
    } else {
        console.log(`  ❌ ${label}${detail ? ' — ' + detail : ''}`);
        failed++;
        failures.push(label);
    }
}

async function run() {
    await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);

    const User                = require('../models/User');
    const StudentSubscription = require('../models/StudentSubscription');

    // ─────────────────────────────────────────────────────
    console.log('\n== TEST 1: Saldos legacy no-guardian eliminados ==');
    // ─────────────────────────────────────────────────────
    const usersWithBalance = await User.find({ classesRemaining: { $gt: 0 } }, 'name email role clientData.accountType').lean();
    const nonGuardianBalance = usersWithBalance.filter(
        u => !(u.role === 'client' && u.clientData?.accountType === 'guardian')
    );
    assert(`No-guardians con classesRemaining > 0 = 0`,
        nonGuardianBalance.length === 0,
        nonGuardianBalance.map(u => u.email).join(', '));

    // ─────────────────────────────────────────────────────
    console.log('\n== TEST 2: Cada usuario migrado tiene StudentSubscription activa ==');
    // ─────────────────────────────────────────────────────
    const migratedEmails = [
        'miseal@gmail.com', 'dastorga.consultoria@gmail.com', 'ompalma@gmail.com',
        'josewilhelmy@gmail.com', 'jacque.irene.santos@gmail.com',
        'felipejorquera365@gmail.com', 'erikaromerojana21@gmail.com', 'jcajalesc@gmail.com'
    ];

    let subsOk = 0;
    for (const email of migratedEmails) {
        const u = await User.findOne({ email }, '_id classesRemaining').lean();
        if (!u) {
            console.log(`     ⚠️  ${email} no encontrado`);
            continue;
        }
        const sub = await StudentSubscription.findOne({
            studentId: u._id,
            status: 'active',
            paymentProvider: 'manual',
            classesRemaining: { $gt: 0 }
        }).lean();
        if (sub && u.classesRemaining === 0) subsOk++;
    }
    assert(`8/8 migrados tienen sub activa + classesRemaining=0`,
        subsOk === migratedEmails.length,
        `${subsOk}/${migratedEmails.length}`);

    // ─────────────────────────────────────────────────────
    console.log('\n== TEST 3: Subs migradas tienen campos correctos ==');
    // ─────────────────────────────────────────────────────
    const manualSubs = await StudentSubscription.find({ paymentProvider: 'manual' }).lean();
    assert(`Subs manuales creadas = 8`, manualSubs.length === 8, `fueron ${manualSubs.length}`);

    const teacherIds = new Set(manualSubs.map(s => s.teacherId.toString()));
    assert(`Todas con teacherId = Miguel`,
        teacherIds.size === 1 && teacherIds.has('693dcdfb8189f12ab33f4747'),
        Array.from(teacherIds).join(', '));

    const allInactiveRenew = manualSubs.every(s => s.autoRenew === false);
    assert(`autoRenew = false en todas`, allInactiveRenew);

    const allActive = manualSubs.every(s => s.status === 'active');
    assert(`status = active en todas`, allActive);

    const allFutureExpiry = manualSubs.every(s => new Date(s.expiresAt) > new Date());
    assert(`expiresAt en el futuro en todas`, allFutureExpiry);

    const allHistoryEntries = manualSubs.every(s =>
        Array.isArray(s.statusHistory) && s.statusHistory.some(h => h.reason?.includes('FASE 5'))
    );
    assert(`statusHistory con reason "FASE 5"`, allHistoryEntries);

    // ─────────────────────────────────────────────────────
    console.log('\n== TEST 4: Idempotencia — re-ejecutar migración no propone nuevos cambios ==');
    // ─────────────────────────────────────────────────────
    // Simulamos la query del script: si retorna 0 no-guardians migrables → idempotente
    const candidates = await User.find({
        $or: [
            { classesRemaining: { $gt: 0 } },
            { 'clientData.managedStudents.classesRemaining': { $gt: 0 } }
        ]
    }).lean();
    const nonGuardianCandidates = candidates.filter(
        u => !(u.role === 'client' && u.clientData?.accountType === 'guardian')
    );
    assert(`Re-ejecución no migraría más no-guardians`,
        nonGuardianCandidates.length === 0,
        `quedarían ${nonGuardianCandidates.length}`);

    // ─────────────────────────────────────────────────────
    console.log('\n== TEST 5: Marcadores de deprecación en código ==');
    // ─────────────────────────────────────────────────────
    const subsRoute = fs.readFileSync(path.join(__dirname, '../routes/subscription.js'), 'utf8');
    assert(`routes/subscription.js tiene @deprecated`, subsRoute.includes('@deprecated'));
    assert(`routes/subscription.js menciona FASE 5`, subsRoute.includes('FASE 5'));

    const adminCtrl = fs.readFileSync(path.join(__dirname, '../controllers/adminController.js'), 'utf8');
    assert(`adminController.addClassesToClient tiene @deprecated`,
        adminCtrl.includes('@deprecated FASE 5'));
    assert(`addClassesToClient emite console.warn DEPRECATED`,
        /addClassesToClient[\s\S]*?\[DEPRECATED\]/.test(adminCtrl));

    const bookingSvc = fs.readFileSync(path.join(__dirname, '../services/BookingService.js'), 'utf8');
    assert(`BookingService tiene warn LEGACY FALLBACK`,
        bookingSvc.includes('[LEGACY FALLBACK]'));

    // ─────────────────────────────────────────────────────
    console.log('\n== TEST 6: Payment registros huérfanos del manual-grant ==');
    // ─────────────────────────────────────────────────────
    const Payment = require('../models/Payment');
    // En la migración del script NO se crearon Payments (solo el endpoint manualGrantSubscription los crea).
    // Verificamos que no haya Payments con externalPaymentId tipo manual_* sin subscriptionId vinculada.
    const orphans = await Payment.find({
        provider: 'manual',
        externalPaymentId: { $regex: '^manual_' },
        subscriptionId: { $in: [null, undefined] }
    }).lean();
    assert(`No hay Payments manual_* huérfanos`, orphans.length === 0,
        `${orphans.length} encontrados`);

    // ─────────────────────────────────────────────────────
    console.log('\n== TEST 7: Guardians siguen con ruta legacy intacta ==');
    // ─────────────────────────────────────────────────────
    const guardians = await User.find({
        role: 'client',
        'clientData.accountType': 'guardian',
        'clientData.managedStudents.classesRemaining': { $gt: 0 }
    }, 'name email clientData.managedStudents').lean();
    assert(`Guardians con managedStudents.classesRemaining > 0 = 2`,
        guardians.length === 2, `fueron ${guardians.length}`);

    const dalila = guardians.find(g => g.email === 'dalyalva54@gmail.com');
    const alejandro = guardians.find(g => g.email === 'alejandro.sepulvedaa@gmail.com');
    assert(`Dalila presente con managedStudents`,
        !!dalila && dalila.clientData.managedStudents.some(s => s.classesRemaining > 0));
    assert(`Alejandro presente con managedStudents`,
        !!alejandro && alejandro.clientData.managedStudents.some(s => s.classesRemaining > 0));

    // ─────────────────────────────────────────────────────
    console.log(`\n${'='.repeat(50)}`);
    console.log(`AUDITORIA FASE 5: ${passed} passed | ${failed} failed`);
    if (failed === 0) {
        console.log('✅ FASE 5 — VERIFICADA');
    } else {
        console.log('❌ FALLOS:');
        failures.forEach(f => console.log('  - ' + f));
        process.exitCode = 1;
    }
    console.log('='.repeat(50));

    await mongoose.disconnect();
}

run().catch(e => { console.error(e); process.exit(1); });
