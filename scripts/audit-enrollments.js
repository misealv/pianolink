/**
 * scripts/audit-enrollments.js
 * Sprint 2 — Tarea 2.1
 * 
 * Audita qué registros de Enrollment (legacy) tienen contrapartida
 * en StudentEnrollment (v5). Genera reporte de discrepancias.
 * 
 * Uso:
 *   node scripts/audit-enrollments.js
 *   node scripts/audit-enrollments.js --verbose
 *   node scripts/audit-enrollments.js --json > audit-result.json
 */

require('dotenv').config();
const mongoose = require('mongoose');

const Enrollment = require('../models/Enrollment');
const StudentEnrollment = require('../models/StudentEnrollment');
const StudentSubscription = require('../models/StudentSubscription');
const User = require('../models/User');

const VERBOSE = process.argv.includes('--verbose');
const JSON_OUTPUT = process.argv.includes('--json');

async function auditEnrollments() {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        console.error('❌ Falta MONGODB_URI en .env');
        process.exit(1);
    }

    await mongoose.connect(uri);
    console.log('✅ Conectado a MongoDB\n');

    // ==================== 1. AUDITORÍA DE ENROLLMENT vs StudentEnrollment ====================
    const allEnrollments = await Enrollment.find({}).lean();
    const allStudentEnrollments = await StudentEnrollment.find({}).lean();

    console.log(`📊 Enrollment (legacy): ${allEnrollments.length} registros`);
    console.log(`📊 StudentEnrollment (v5): ${allStudentEnrollments.length} registros\n`);

    // Crear mapa de StudentEnrollment por student+teacher
    const seMap = new Map();
    for (const se of allStudentEnrollments) {
        const key = `${se.student}_${se.teacher}`;
        seMap.set(key, se);
    }

    // Clasificar enrollments
    const results = {
        totalEnrollments: allEnrollments.length,
        totalStudentEnrollments: allStudentEnrollments.length,
        enrollmentsWithCounterpart: [],     // Enrollment que SÍ tiene StudentEnrollment
        enrollmentsWithoutCounterpart: [],  // Enrollment que NO tiene StudentEnrollment (necesitan migración)
        studentEnrollmentsWithoutLegacy: [],// StudentEnrollment sin Enrollment legacy (OK, v5 nativo)
        balanceDiscrepancies: [],           // Pares donde classesRemaining difiere
        activeEnrollmentsToMigrate: [],     // Enrollment activos sin contrapartida → candidatos a migración
    };

    for (const enr of allEnrollments) {
        const key = `${enr.studentId}_${enr.teacherId}`;
        const counterpart = seMap.get(key);

        if (counterpart) {
            results.enrollmentsWithCounterpart.push({
                enrollmentId: enr._id,
                studentEnrollmentId: counterpart._id,
                studentId: enr.studentId,
                teacherId: enr.teacherId,
                status: { enrollment: enr.status, studentEnrollment: counterpart.status },
                classesRemaining: {
                    enrollment: enr.classesRemaining || 0,
                    studentEnrollment: counterpart.classesRemaining || 0
                }
            });

            // Verificar discrepancia de saldo
            const enrBalance = enr.classesRemaining || 0;
            const seBalance = counterpart.classesRemaining || 0;
            if (enrBalance !== seBalance && (enrBalance > 0 || seBalance > 0)) {
                results.balanceDiscrepancies.push({
                    enrollmentId: enr._id,
                    studentEnrollmentId: counterpart._id,
                    studentId: enr.studentId,
                    teacherId: enr.teacherId,
                    enrollmentBalance: enrBalance,
                    studentEnrollmentBalance: seBalance,
                    delta: seBalance - enrBalance
                });
            }
        } else {
            results.enrollmentsWithoutCounterpart.push({
                enrollmentId: enr._id,
                studentId: enr.studentId,
                teacherId: enr.teacherId,
                status: enr.status,
                source: enr.source,
                classesRemaining: enr.classesRemaining || 0,
                preloadedClasses: enr.preloadedClasses || 0,
                roomId: enr.roomId,
                createdAt: enr.createdAt
            });

            if (enr.status === 'active') {
                results.activeEnrollmentsToMigrate.push({
                    enrollmentId: enr._id,
                    studentId: enr.studentId,
                    teacherId: enr.teacherId,
                    classesRemaining: enr.classesRemaining || 0,
                    source: enr.source,
                    appliedCommission: enr.appliedCommission
                });
            }
        }
    }

    // StudentEnrollment sin Enrollment legacy
    const enrMap = new Map();
    for (const enr of allEnrollments) {
        enrMap.set(`${enr.studentId}_${enr.teacherId}`, enr);
    }
    for (const se of allStudentEnrollments) {
        const key = `${se.student}_${se.teacher}`;
        if (!enrMap.has(key)) {
            results.studentEnrollmentsWithoutLegacy.push({
                studentEnrollmentId: se._id,
                studentId: se.student,
                teacherId: se.teacher,
                status: se.status,
                classesRemaining: se.classesRemaining || 0
            });
        }
    }

    // ==================== 2. AUDITORÍA DE SALDO EN 3+ UBICACIONES ====================
    // Buscar usuarios con classesRemaining > 0 en User
    const usersWithBalance = await User.find({
        $or: [
            { classesRemaining: { $gt: 0 } },
            { 'clientData.managedStudents.classesRemaining': { $gt: 0 } }
        ]
    }).select('_id name email role classesRemaining clientData.managedStudents clientData.accountType').lean();

    const balanceAudit = {
        usersWithDirectBalance: [],
        guardiansWithManagedBalance: [],
        subscriptionBalances: []
    };

    for (const user of usersWithBalance) {
        if (user.classesRemaining > 0) {
            // Buscar suscripciones activas del usuario
            const subs = await StudentSubscription.find({
                studentId: user._id,
                status: { $in: ['active', 'paused'] }
            }).lean();

            const totalSubBalance = subs.reduce((sum, s) => sum + (s.classesRemaining || 0), 0);

            balanceAudit.usersWithDirectBalance.push({
                userId: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                userClassesRemaining: user.classesRemaining,
                subscriptionClassesRemaining: totalSubBalance,
                subscriptionCount: subs.length,
                mismatch: user.classesRemaining !== totalSubBalance
            });
        }

        if (user.clientData?.accountType === 'guardian' && user.clientData?.managedStudents?.length > 0) {
            for (const ms of user.clientData.managedStudents) {
                if ((ms.classesRemaining || 0) > 0) {
                    balanceAudit.guardiansWithManagedBalance.push({
                        guardianId: user._id,
                        guardianEmail: user.email,
                        studentName: ms.name,
                        managedStudentId: ms._id,
                        classesRemaining: ms.classesRemaining
                    });
                }
            }
        }
    }

    // Suscripciones activas con saldo
    const activeSubs = await StudentSubscription.find({
        status: { $in: ['active', 'paused'] },
        classesRemaining: { $gt: 0 }
    }).lean();

    balanceAudit.subscriptionBalances = activeSubs.map(s => ({
        subscriptionId: s._id,
        studentId: s.studentId,
        teacherId: s.teacherId,
        classesRemaining: s.classesRemaining,
        classesTotal: s.classesTotal,
        status: s.status
    }));

    // ==================== 3. REPORTE ====================
    const report = {
        timestamp: new Date().toISOString(),
        enrollmentAudit: {
            ...results,
            summary: {
                totalLegacy: results.totalEnrollments,
                totalV5: results.totalStudentEnrollments,
                withCounterpart: results.enrollmentsWithCounterpart.length,
                withoutCounterpart: results.enrollmentsWithoutCounterpart.length,
                v5OnlyNative: results.studentEnrollmentsWithoutLegacy.length,
                balanceDiscrepancies: results.balanceDiscrepancies.length,
                toMigrate: results.activeEnrollmentsToMigrate.length
            }
        },
        balanceAudit: {
            ...balanceAudit,
            summary: {
                usersWithDirectBalance: balanceAudit.usersWithDirectBalance.length,
                guardiansWithManagedBalance: balanceAudit.guardiansWithManagedBalance.length,
                activeSubscriptionsWithBalance: balanceAudit.subscriptionBalances.length,
                mismatchCount: balanceAudit.usersWithDirectBalance.filter(u => u.mismatch).length
            }
        }
    };

    if (JSON_OUTPUT) {
        console.log(JSON.stringify(report, null, 2));
    } else {
        // Reporte legible
        console.log('═══════════════════════════════════════════════════════════');
        console.log('   AUDITORÍA ENROLLMENT vs STUDENT ENROLLMENT');
        console.log('═══════════════════════════════════════════════════════════\n');

        const s = report.enrollmentAudit.summary;
        console.log(`  Enrollment (legacy):             ${s.totalLegacy}`);
        console.log(`  StudentEnrollment (v5):          ${s.totalV5}`);
        console.log(`  Con contrapartida (ambos):       ${s.withCounterpart}`);
        console.log(`  Sin contrapartida (migrar):      ${s.withoutCounterpart}`);
        console.log(`  Solo v5 (nativos):               ${s.v5OnlyNative}`);
        console.log(`  Discrepancias de saldo:          ${s.balanceDiscrepancies}`);
        console.log(`  Activos pendientes de migrar:    ${s.toMigrate}`);

        if (s.balanceDiscrepancies > 0) {
            console.log('\n  ⚠️  DISCREPANCIAS DE SALDO:');
            for (const d of report.enrollmentAudit.balanceDiscrepancies) {
                console.log(`     Student ${d.studentId} ↔ Teacher ${d.teacherId}`);
                console.log(`       Enrollment: ${d.enrollmentBalance} | StudentEnrollment: ${d.studentEnrollmentBalance} | Δ ${d.delta}`);
            }
        }

        if (s.toMigrate > 0) {
            console.log('\n  🔄 ENROLLMENT ACTIVOS A MIGRAR:');
            for (const m of report.enrollmentAudit.activeEnrollmentsToMigrate) {
                console.log(`     ${m.enrollmentId}: student=${m.studentId} → teacher=${m.teacherId} (${m.classesRemaining} clases, source=${m.source})`);
            }
        }

        console.log('\n═══════════════════════════════════════════════════════════');
        console.log('   AUDITORÍA DE SALDO EN MÚLTIPLES UBICACIONES');
        console.log('═══════════════════════════════════════════════════════════\n');

        const b = report.balanceAudit.summary;
        console.log(`  Usuarios con User.classesRemaining > 0:      ${b.usersWithDirectBalance}`);
        console.log(`  Guardians con managedStudents balance > 0:    ${b.guardiansWithManagedBalance}`);
        console.log(`  Suscripciones activas con saldo:              ${b.activeSubscriptionsWithBalance}`);
        console.log(`  Mismatches User vs Subscription:              ${b.mismatchCount}`);

        if (b.mismatchCount > 0) {
            console.log('\n  ⚠️  MISMATCHES (User.classesRemaining ≠ Σ Subscriptions):');
            for (const u of report.balanceAudit.usersWithDirectBalance.filter(u => u.mismatch)) {
                console.log(`     ${u.email} (${u.role}): User=${u.userClassesRemaining} | Subs=${u.subscriptionClassesRemaining} (${u.subscriptionCount} suscripciones)`);
            }
        }

        if (VERBOSE) {
            console.log('\n--- DETALLE COMPLETO ---');
            console.log(JSON.stringify(report, null, 2));
        }

        console.log('\n✅ Auditoría completada.\n');
    }

    await mongoose.disconnect();
}

auditEnrollments().catch(err => {
    console.error('❌ Error en auditoría:', err);
    process.exit(1);
});
