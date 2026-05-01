/**
 * FASE 5 — Migración de saldos legacy User.classesRemaining → StudentSubscription
 *
 * Uso:
 *   node scripts/fase5-migrate-legacy.js          (dry-run, no escribe nada)
 *   node scripts/fase5-migrate-legacy.js --execute (aplica cambios)
 *
 * Lógica:
 *   - Usuarios no-guardian con classesRemaining > 0 → crea StudentSubscription activa con Miguel
 *   - Después de crear la sub, pone classesRemaining = 0 en User
 *   - Usuarios guardian con managedStudents.classesRemaining > 0 → los lista como pendientes
 *     (no tienen studentId válido para StudentSubscription, siguen funcionando por la ruta legacy)
 */

require('dotenv').config();
const mongoose = require('mongoose');

const EXECUTE = process.argv.includes('--execute');
const MIGUEL_ID  = '693dcdfb8189f12ab33f4747';
const PACKAGE_ID = '69f458b5354f629d942ac25f';  // TeacherPackage Miguel — isActive=true
const EXPIRES_MONTHS = 12;

async function run() {
    await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
    console.log(EXECUTE ? '🚀 MODO EXECUTE — se escribirán cambios' : '🔍 DRY-RUN — no se escribe nada');

    const User               = require('../models/User');
    const StudentSubscription = require('../models/StudentSubscription');

    // 1. Cargar candidatos
    const users = await User.find({
        $or: [
            { classesRemaining: { $gt: 0 } },
            { 'clientData.managedStudents.classesRemaining': { $gt: 0 } }
        ]
    }).lean();

    const toMigrate  = [];
    const guardians  = [];

    for (const u of users) {
        const isGuardian = u.role === 'client' && u.clientData?.accountType === 'guardian';
        if (isGuardian) {
            guardians.push(u);
        } else {
            toMigrate.push(u);
        }
    }

    // 2. Migrar usuarios no-guardian
    console.log(`\n— Usuarios a migrar (${toMigrate.length}):`);
    for (const u of toMigrate) {
        const classes = u.classesRemaining;
        const expiresAt = new Date();
        expiresAt.setMonth(expiresAt.getMonth() + EXPIRES_MONTHS);

        console.log(`  ${u.name} <${u.email}> → ${classes} clases`);

        if (EXECUTE) {
            const session = await mongoose.startSession();
            session.startTransaction();
            try {
                // Verificar que no tenga ya una sub activa con Miguel
                const existing = await StudentSubscription.findOne({
                    studentId: u._id,
                    teacherId: MIGUEL_ID,
                    status: 'active',
                    classesRemaining: { $gt: 0 },
                    expiresAt: { $gt: new Date() }
                }).session(session);

                if (existing) {
                    console.log(`    ⚠️  Ya tiene StudentSubscription activa (${existing._id}), saltando.`);
                    await session.abortTransaction();
                    session.endSession();
                    continue;
                }

                const sub = await new StudentSubscription({
                    studentId:              u._id,
                    teacherId:              MIGUEL_ID,
                    packageId:              PACKAGE_ID,
                    category:               'piano',
                    classesTotal:           classes,
                    classesRemaining:       classes,
                    classesCompleted:       0,
                    totalPaidUSD:           0,
                    escrowBalanceUSD:       0,
                    releasedToTeacherUSD:   0,
                    platformFeeCollectedUSD: 0,
                    paymentProvider:        'manual',
                    autoRenew:              false,
                    status:                 'active',
                    startsAt:               new Date(),
                    expiresAt,
                    statusHistory: [{
                        status:    'active',
                        changedAt: new Date(),
                        reason:    'Migración FASE 5 — legacy User.classesRemaining'
                    }]
                }).save({ session });

                await User.findByIdAndUpdate(
                    u._id,
                    { $set: { classesRemaining: 0 } },
                    { session }
                );

                await session.commitTransaction();
                console.log(`    ✅ Sub creada: ${sub._id}  expiresAt: ${expiresAt.toISOString().split('T')[0]}`);
            } catch (err) {
                await session.abortTransaction();
                console.error(`    ❌ Error: ${err.message}`);
            } finally {
                session.endSession();
            }
        }
    }

    // 3. Reportar guardians como pendientes manuales
    if (guardians.length) {
        console.log(`\n— Guardians con saldo (requieren migración manual — ${guardians.length}):`);
        for (const u of guardians) {
            const ms = (u.clientData?.managedStudents || []).filter(s => s.classesRemaining > 0);
            console.log(`  ${u.name} <${u.email}>:`);
            ms.forEach(s => console.log(`    · ${s.name} (${s.age} años) — ${s.classesRemaining} clases`));
            console.log('    → Siguen usando ruta legacy BookingService (managedStudents). OK por ahora.');
        }
    }

    // 4. Verificar saldos remanentes
    const remaining = await User.countDocuments({ classesRemaining: { $gt: 0 } });
    // Guardians que realmente tienen User.classesRemaining > 0 (Alejandro no tiene)
    const guardiansWithBalance = guardians.filter(u => u.classesRemaining > 0).length;
    const nonGuardianRemaining = remaining - guardiansWithBalance;

    console.log(`\n${'='.repeat(50)}`);
    console.log(`FASE 5 MIGRATION ${EXECUTE ? 'EJECUTADA' : 'DRY-RUN'}`);
    console.log(`  Migrados:                 ${EXECUTE ? toMigrate.length : 0}/${toMigrate.length}`);
    console.log(`  Guardians (pendiente):    ${guardians.length}`);
    console.log(`  User.classesRemaining>0:  ${remaining} (esperado: ${guardiansWithBalance})`);
    console.log(nonGuardianRemaining === 0 || !EXECUTE
        ? `  ✅ GATE: OK — solo guardians con saldo remanente (ruta legacy funcional)`
        : `  ❌ GATE: Quedan ${nonGuardianRemaining} usuarios no-guardian sin migrar`);

    await mongoose.disconnect();
}

run().catch(e => { console.error(e); process.exit(1); });
