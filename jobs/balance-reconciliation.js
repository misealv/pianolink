/**
 * jobs/balance-reconciliation.js
 * Sprint 2 — Tarea 2.4
 * 
 * Job de reconciliación que detecta desincronizaciones de saldo
 * entre las múltiples ubicaciones de classesRemaining.
 * 
 * Ejecutar manualmente: node jobs/balance-reconciliation.js
 * Ejecutar con fix:      node jobs/balance-reconciliation.js --fix
 * Ejecutar dry-run:      node jobs/balance-reconciliation.js --dry-run
 * Cron recomendado:      Diario a las 3:00 AM (0 3 * * *)
 * 
 * Qué hace:
 *   1. Busca usuarios con User.classesRemaining > 0
 *   2. Compara vs StudentSubscription.classesRemaining (fuente de verdad)
 *   3. Reporta discrepancias
 *   4. Opcionalmente corrige sincronizando User → StudentSubscription
 */

const START_STANDALONE = !module.parent;

if (START_STANDALONE) {
    require('dotenv').config();
}

const mongoose = require('mongoose');
const User = require('../models/User');
const StudentSubscription = require('../models/StudentSubscription');
const StudentEnrollment = require('../models/StudentEnrollment');
const Enrollment = require('../models/Enrollment');

const FIX_MODE = process.argv.includes('--fix');
const DRY_RUN = process.argv.includes('--dry-run');

/**
 * Ejecuta la reconciliación de saldo.
 * Exportado como función para uso desde CronService.
 * 
 * @param {Object} [options]
 * @param {boolean} [options.fix=false] - Si true, corrige desincronizaciones
 * @param {boolean} [options.silent=false] - Si true, no imprime a consola
 * @returns {Object} Reporte de reconciliación
 */
async function runBalanceReconciliation(options = {}) {
    const fix = options.fix || FIX_MODE;
    const silent = options.silent || false;

    const log = silent ? () => {} : console.log;

    log('🔄 [BalanceReconciliation] Iniciando reconciliación de saldo...\n');

    const report = {
        timestamp: new Date().toISOString(),
        mode: fix ? 'FIX' : (DRY_RUN ? 'DRY_RUN' : 'AUDIT'),
        discrepancies: [],
        orphanedBalances: [],  // Saldo en User sin suscripción ni enrollment
        fixes: [],
        summary: {}
    };

    // ==================== 1. USUARIOS CON SALDO DIRECTO ====================
    const usersWithBalance = await User.find({
        classesRemaining: { $gt: 0 },
        role: { $in: ['student', 'client'] }
    }).select('_id name email role classesRemaining clientData').lean();

    log(`📊 Usuarios con User.classesRemaining > 0: ${usersWithBalance.length}`);

    for (const user of usersWithBalance) {
        // Buscar suscripciones activas
        const subs = await StudentSubscription.find({
            studentId: user._id,
            status: { $in: ['active', 'paused'] }
        }).select('classesRemaining teacherId status').lean();

        const subBalance = subs.reduce((sum, s) => sum + (s.classesRemaining || 0), 0);

        // Buscar enrollments v5 activos
        const enrollments = await StudentEnrollment.find({
            student: user._id,
            status: 'active',
            classesRemaining: { $gt: 0 }
        }).select('classesRemaining teacher').lean();

        const enrBalance = enrollments.reduce((sum, e) => sum + (e.classesRemaining || 0), 0);

        // Enrollments legacy
        const legacyEnrollments = await Enrollment.find({
            studentId: user._id,
            status: 'active',
            classesRemaining: { $gt: 0 }
        }).select('classesRemaining teacherId').lean();

        const legacyBalance = legacyEnrollments.reduce((sum, e) => sum + (e.classesRemaining || 0), 0);

        const truthBalance = subBalance || enrBalance;

        if (user.classesRemaining !== truthBalance) {
            const entry = {
                userId: user._id,
                email: user.email,
                name: user.name,
                role: user.role,
                userBalance: user.classesRemaining,
                subscriptionBalance: subBalance,
                enrollmentBalance: enrBalance,
                legacyEnrollmentBalance: legacyBalance,
                truthBalance,
                delta: user.classesRemaining - truthBalance
            };

            if (truthBalance === 0 && user.classesRemaining > 0) {
                // Saldo huérfano — existe en User pero no hay fuente moderna
                entry.type = 'orphaned';
                report.orphanedBalances.push(entry);
                log(`  ⚠️  HUÉRFANO: ${user.email} tiene ${user.classesRemaining} clases en User sin suscripción/enrollment activo`);
            } else {
                entry.type = 'mismatch';
                report.discrepancies.push(entry);
                log(`  🔴 MISMATCH: ${user.email} — User=${user.classesRemaining} vs Truth=${truthBalance} (Δ ${entry.delta})`);
            }

            // Corregir si está en modo fix
            if (fix && truthBalance > 0) {
                await User.findByIdAndUpdate(user._id, {
                    $set: { classesRemaining: truthBalance }
                });
                report.fixes.push({
                    userId: user._id,
                    email: user.email,
                    oldBalance: user.classesRemaining,
                    newBalance: truthBalance,
                    source: subBalance > 0 ? 'StudentSubscription' : 'StudentEnrollment'
                });
                log(`    ✅ CORREGIDO: ${user.classesRemaining} → ${truthBalance}`);
            }
        }
    }

    // ==================== 2. GUARDIANS CON managedStudents ====================
    const guardians = await User.find({
        role: 'client',
        'clientData.accountType': 'guardian',
        'clientData.managedStudents.classesRemaining': { $gt: 0 }
    }).select('_id name email clientData.managedStudents').lean();

    log(`\n📊 Guardians con managedStudents con saldo: ${guardians.length}`);

    for (const guardian of guardians) {
        for (const ms of guardian.clientData.managedStudents) {
            if ((ms.classesRemaining || 0) <= 0) continue;

            // Buscar suscripción del guardian
            const subs = await StudentSubscription.find({
                studentId: guardian._id,
                status: { $in: ['active', 'paused'] },
                classesRemaining: { $gt: 0 }
            }).select('classesRemaining teacherId').lean();

            const subBalance = subs.reduce((sum, s) => sum + (s.classesRemaining || 0), 0);

            if (subBalance === 0) {
                report.orphanedBalances.push({
                    userId: guardian._id,
                    email: guardian.email,
                    type: 'orphaned_managed',
                    managedStudentName: ms.name,
                    managedStudentId: ms._id,
                    balance: ms.classesRemaining
                });
                log(`  ⚠️  HUÉRFANO (managed): ${guardian.email} → "${ms.name}" tiene ${ms.classesRemaining} clases sin suscripción`);
            }
        }
    }

    // ==================== 3. ENROLLMENTS LEGACY CON SALDO ====================
    const legacyWithBalance = await Enrollment.find({
        status: 'active',
        classesRemaining: { $gt: 0 }
    }).select('studentId teacherId classesRemaining').lean();

    log(`\n📊 Enrollment (legacy) activos con saldo > 0: ${legacyWithBalance.length}`);

    for (const enr of legacyWithBalance) {
        // Verificar si tiene contraparte moderna
        const hasSub = await StudentSubscription.exists({
            studentId: enr.studentId,
            teacherId: enr.teacherId,
            status: { $in: ['active', 'paused'] }
        });

        const hasSE = await StudentEnrollment.exists({
            student: enr.studentId,
            teacher: enr.teacherId,
            status: 'active'
        });

        if (!hasSub && !hasSE) {
            report.orphanedBalances.push({
                type: 'legacy_enrollment_only',
                enrollmentId: enr._id,
                studentId: enr.studentId,
                teacherId: enr.teacherId,
                balance: enr.classesRemaining,
                note: 'Solo existe en Enrollment legacy — necesita migración a StudentEnrollment'
            });
            log(`  ⚠️  LEGACY ONLY: Enrollment ${enr._id} (student=${enr.studentId}, ${enr.classesRemaining} clases) sin contrapartida v5`);
        }
    }

    // ==================== 4. RESUMEN ====================
    report.summary = {
        usersChecked: usersWithBalance.length,
        guardiansChecked: guardians.length,
        legacyEnrollmentsWithBalance: legacyWithBalance.length,
        discrepancies: report.discrepancies.length,
        orphanedBalances: report.orphanedBalances.length,
        fixesApplied: report.fixes.length
    };

    log('\n═══════════════════════════════════════════════════════════');
    log('   RESUMEN RECONCILIACIÓN DE SALDO');
    log('═══════════════════════════════════════════════════════════');
    log(`  Modo:                          ${report.mode}`);
    log(`  Usuarios verificados:          ${report.summary.usersChecked}`);
    log(`  Guardians verificados:         ${report.summary.guardiansChecked}`);
    log(`  Legacy enrollments con saldo:  ${report.summary.legacyEnrollmentsWithBalance}`);
    log(`  Discrepancias encontradas:     ${report.summary.discrepancies}`);
    log(`  Saldos huérfanos:              ${report.summary.orphanedBalances}`);
    log(`  Correcciones aplicadas:        ${report.summary.fixesApplied}`);
    log('═══════════════════════════════════════════════════════════\n');

    if (report.summary.discrepancies > 0 && !fix) {
        log('💡 Para corregir automáticamente, ejecuta con --fix');
    }

    return report;
}

// Ejecución standalone
if (START_STANDALONE) {
    (async () => {
        try {
            const uri = process.env.MONGODB_URI;
            if (!uri) {
                console.error('❌ Falta MONGODB_URI en .env');
                process.exit(1);
            }
            await mongoose.connect(uri);
            console.log('✅ Conectado a MongoDB\n');

            await runBalanceReconciliation({ fix: FIX_MODE });

            await mongoose.disconnect();
        } catch (err) {
            console.error('❌ Error en reconciliación:', err);
            process.exit(1);
        }
    })();
}

module.exports = runBalanceReconciliation;
