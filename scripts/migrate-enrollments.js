/**
 * scripts/migrate-enrollments.js
 * Sprint 2 — Tarea 2.2
 * 
 * Migra registros activos de Enrollment (legacy) a StudentEnrollment (v5)
 * donde no exista un StudentEnrollment equivalente.
 * 
 * Uso:
 *   node scripts/migrate-enrollments.js --dry-run      # Solo muestra qué haría
 *   node scripts/migrate-enrollments.js                 # Ejecuta la migración
 *   node scripts/migrate-enrollments.js --force         # Migra incluso inactivos
 */

require('dotenv').config();
const mongoose = require('mongoose');

const Enrollment = require('../models/Enrollment');
const StudentEnrollment = require('../models/StudentEnrollment');
const User = require('../models/User');

const DRY_RUN = process.argv.includes('--dry-run');
const FORCE = process.argv.includes('--force');

async function migrateEnrollments() {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        console.error('❌ Falta MONGODB_URI en .env');
        process.exit(1);
    }

    await mongoose.connect(uri);
    console.log('✅ Conectado a MongoDB');
    console.log(`📋 Modo: ${DRY_RUN ? 'DRY RUN (sin cambios)' : 'EJECUCIÓN REAL'}\n`);

    // Buscar enrollments que necesitan migración
    const statusFilter = FORCE ? {} : { status: 'active' };
    const legacyEnrollments = await Enrollment.find(statusFilter).lean();

    console.log(`📊 Enrollment (legacy) encontrados: ${legacyEnrollments.length}`);

    // Obtener StudentEnrollment existentes para comparar
    const existingPairs = await StudentEnrollment.find({}).select('student teacher').lean();
    const existingSet = new Set(existingPairs.map(se => `${se.student}_${se.teacher}`));

    const toMigrate = legacyEnrollments.filter(enr => {
        const key = `${enr.studentId}_${enr.teacherId}`;
        return !existingSet.has(key);
    });

    console.log(`🔄 Requieren migración: ${toMigrate.length}\n`);

    if (toMigrate.length === 0) {
        console.log('✅ No hay enrollments pendientes de migrar.');
        await mongoose.disconnect();
        return;
    }

    let migrated = 0;
    let skipped = 0;
    let errored = 0;
    const errors = [];

    for (const enr of toMigrate) {
        try {
            // Obtener datos del profesor para la tarifa
            const teacher = await User.findById(enr.teacherId).select('teacherData.hourlyRate teacherData.plan name').lean();
            const student = await User.findById(enr.studentId).select('name role studentData.source clientData.accountType').lean();

            if (!teacher || !student) {
                console.log(`  ⏭️  Skipping ${enr._id}: usuario(s) no encontrado(s) (teacher=${!!teacher}, student=${!!student})`);
                skipped++;
                continue;
            }

            // Calcular tarifa congelada (en USD - como lo maneja StudentEnrollment)
            const hourlyRate = teacher.teacherData?.hourlyRate || 25;

            // Mapear source
            const seSource = enr.source === 'private_invite' ? 'private_invite' : 'platform';

            // Verificar si es un dependiente (guardian)
            let dependentName = '';
            if (student.clientData?.accountType === 'guardian') {
                // Si el student tiene managedStudents, el enrollment podría ser para uno de ellos
                // En el modelo legacy esto no se distingue claramente
                dependentName = '';
            }

            const newEnrollmentData = {
                student: enr.studentId,
                teacher: enr.teacherId,
                dependentName,
                frozenRate: hourlyRate,
                rateFrozenAt: enr.startDate || enr.createdAt || new Date(),
                rateLockedUntil: new Date((enr.startDate || enr.createdAt || new Date()).getTime() + 365 * 24 * 60 * 60 * 1000),
                rateHistory: [{
                    rate: hourlyRate,
                    changedAt: enr.startDate || enr.createdAt || new Date(),
                    changedBy: 'migration'
                }],
                classesPurchased: (enr.preloadedClasses || 0) + (enr.classesRemaining || 0),
                classesRemaining: enr.classesRemaining || 0,
                classesCompleted: Math.max(0, (enr.preloadedClasses || 0) - (enr.classesRemaining || 0)),
                classesCancelled: 0,
                trialClassTaken: false,
                source: seSource,
                inviteCode: enr.inviteCode || '',
                appliedCommission: {
                    platformPercent: enr.appliedCommission?.platformPercent || 20,
                    teacherPercent: enr.appliedCommission?.teacherPercent || 80,
                    reason: enr.appliedCommission?.reason || 'migrated_from_legacy'
                },
                status: enr.status === 'active' ? 'active' : (enr.status === 'paused' ? 'paused' : 'cancelled'),
                teacherNotes: enr.notes || '',
                level: 'beginner',
                enrolledAt: enr.startDate || enr.createdAt || new Date()
            };

            if (DRY_RUN) {
                console.log(`  📝 [DRY RUN] Migraría: student=${enr.studentId} → teacher=${enr.teacherId} (${enr.classesRemaining || 0} clases, source=${seSource})`);
            } else {
                const newSE = new StudentEnrollment(newEnrollmentData);
                await newSE.save();
                console.log(`  ✅ Migrado: ${enr._id} → StudentEnrollment ${newSE._id} (${enr.classesRemaining || 0} clases)`);
            }

            migrated++;
        } catch (err) {
            if (err.code === 11000) {
                // Duplicado — ya existe (race condition o dato sucio)
                console.log(`  ⏭️  ${enr._id}: ya existe StudentEnrollment para este par (duplicate key)`);
                skipped++;
            } else {
                console.error(`  ❌ Error migrando ${enr._id}:`, err.message);
                errors.push({ enrollmentId: enr._id, error: err.message });
                errored++;
            }
        }
    }

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('   RESULTADO DE MIGRACIÓN');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`  ${DRY_RUN ? '(DRY RUN)' : ''}`);
    console.log(`  Total candidatos:    ${toMigrate.length}`);
    console.log(`  Migrados:            ${migrated}`);
    console.log(`  Omitidos:            ${skipped}`);
    console.log(`  Con error:           ${errored}`);

    if (errors.length > 0) {
        console.log('\n  Errores:');
        for (const e of errors) {
            console.log(`    ${e.enrollmentId}: ${e.error}`);
        }
    }

    if (DRY_RUN) {
        console.log('\n  💡 Para ejecutar realmente, corre sin --dry-run');
    }

    console.log('');
    await mongoose.disconnect();
}

migrateEnrollments().catch(err => {
    console.error('❌ Error en migración:', err);
    process.exit(1);
});
