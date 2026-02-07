/**
 * jobs/generateMonthlyPayouts.js
 * Cron job para generar payouts mensuales de profesores
 * 
 * Ejecutar: node jobs/generateMonthlyPayouts.js
 * Cron: 0 3 1 * * (día 1 de cada mes a las 3am)
 * 
 * Proceso:
 * 1. Busca todas las ClassSessions confirmadas del mes anterior
 * 2. Agrupa por profesor
 * 3. Crea o actualiza TeacherPayout para cada uno
 * 4. Envía notificación a profesores
 */

require('dotenv').config();
const mongoose = require('mongoose');

const ClassSession = require('../models/ClassSession');
const TeacherPayout = require('../models/TeacherPayout');
const User = require('../models/User');

// Configuración
const DRY_RUN = process.argv.includes('--dry-run');
const FORCE_MONTH = process.argv.find(a => a.startsWith('--month='))?.split('=')[1]; // --month=2026-01

async function generateMonthlyPayouts() {
    console.log('='.repeat(60));
    console.log('🏦 GENERADOR DE PAYOUTS MENSUALES');
    console.log('='.repeat(60));
    console.log(`Modo: ${DRY_RUN ? '🔍 DRY RUN (sin cambios)' : '🚀 PRODUCCIÓN'}`);
    console.log(`Fecha: ${new Date().toISOString()}`);
    console.log('');

    try {
        // Conectar a MongoDB
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Conectado a MongoDB');

        // Calcular período del mes anterior (o forzado)
        let periodStart, periodEnd, periodLabel;
        
        if (FORCE_MONTH) {
            const [year, month] = FORCE_MONTH.split('-').map(Number);
            periodStart = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
            periodEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
        } else {
            const now = new Date();
            periodStart = new Date(Date.UTC(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0));
            periodEnd = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999));
        }

        const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        periodLabel = `${months[periodStart.getMonth()]} ${periodStart.getFullYear()}`;

        console.log(`📅 Período: ${periodLabel}`);
        console.log(`   Desde: ${periodStart.toISOString()}`);
        console.log(`   Hasta: ${periodEnd.toISOString()}`);
        console.log('');

        // Buscar sesiones pagables del período
        const sessions = await ClassSession.find({
            status: { $in: ['completed', 'student-noshow'] },
            confirmedAt: { $gte: periodStart, $lte: periodEnd },
            payoutStatus: 'pending'  // Solo las que no están en ningún batch
        }).populate('teacherId', 'name email');

        console.log(`📚 Sesiones encontradas: ${sessions.length}`);

        if (sessions.length === 0) {
            console.log('ℹ️  No hay sesiones para procesar este mes');
            await mongoose.disconnect();
            return { success: true, payoutsCreated: 0 };
        }

        // Agrupar por profesor
        const sessionsByTeacher = {};
        sessions.forEach(session => {
            const tId = session.teacherId._id.toString();
            if (!sessionsByTeacher[tId]) {
                sessionsByTeacher[tId] = {
                    teacher: session.teacherId,
                    sessions: []
                };
            }
            sessionsByTeacher[tId].sessions.push(session);
        });

        console.log(`👨‍🏫 Profesores con pagos: ${Object.keys(sessionsByTeacher).length}`);
        console.log('');

        // Procesar cada profesor
        const results = {
            created: 0,
            updated: 0,
            errors: [],
            payouts: []
        };

        for (const [teacherId, data] of Object.entries(sessionsByTeacher)) {
            const { teacher, sessions: teacherSessions } = data;
            
            console.log(`\n👤 ${teacher.name} (${teacher.email})`);
            console.log(`   Sesiones: ${teacherSessions.length}`);

            try {
                // Verificar si ya existe payout para este período
                let payout = await TeacherPayout.findOne({
                    teacherId,
                    periodStart: { $lte: periodStart },
                    periodEnd: { $gte: periodEnd }
                });

                const isNew = !payout;

                if (!payout) {
                    payout = new TeacherPayout({
                        teacherId,
                        periodStart,
                        periodEnd,
                        periodLabel,
                        status: 'pending-review'
                    });
                }

                // Agregar sesiones y calcular totales
                let addedCount = 0;
                for (const session of teacherSessions) {
                    if (!payout.sessions.includes(session._id)) {
                        payout.sessions.push(session._id);
                        payout.grossAmountUSD += session.pricePerClassUSD;
                        payout.platformFeeUSD += session.platformFeeUSD;
                        payout.netPayoutUSD += session.teacherPayoutUSD;
                        
                        if (session.status === 'completed') {
                            payout.classesCompleted += 1;
                        } else if (session.status === 'student-noshow') {
                            payout.classesStudentNoShow += 1;
                        }
                        
                        addedCount++;
                    }
                }

                payout.totalClassesPaid = payout.classesCompleted + payout.classesStudentNoShow;
                payout.finalPayoutUSD = payout.netPayoutUSD + payout.totalAdjustmentsUSD;

                // Calcular monto con fee de retiro si hay método seleccionado
                if (payout.withdrawalMethod) {
                    payout.setWithdrawalMethod(payout.withdrawalMethod);
                } else {
                    payout.finalAmountAfterFees = payout.finalPayoutUSD;
                }

                console.log(`   Total bruto: $${(payout.grossAmountUSD / 100).toFixed(2)}`);
                console.log(`   Fee plataforma: $${(payout.platformFeeUSD / 100).toFixed(2)}`);
                console.log(`   Neto profesor: $${(payout.netPayoutUSD / 100).toFixed(2)}`);

                if (!DRY_RUN) {
                    await payout.save();

                    // Marcar sesiones como incluidas en batch
                    await ClassSession.updateMany(
                        { _id: { $in: teacherSessions.map(s => s._id) } },
                        { 
                            payoutStatus: 'included-in-batch',
                            payoutBatchId: payout._id
                        }
                    );

                    if (isNew) {
                        results.created++;
                        console.log(`   ✅ Payout CREADO: ${payout._id}`);
                    } else {
                        results.updated++;
                        console.log(`   ✅ Payout ACTUALIZADO: ${payout._id} (+${addedCount} sesiones)`);
                    }
                } else {
                    console.log(`   🔍 [DRY RUN] Se crearía/actualizaría payout`);
                }

                results.payouts.push({
                    teacherId,
                    teacherName: teacher.name,
                    teacherEmail: teacher.email,
                    payoutId: payout._id,
                    sessions: teacherSessions.length,
                    grossUSD: payout.grossAmountUSD,
                    netUSD: payout.netPayoutUSD,
                    isNew
                });

            } catch (err) {
                console.log(`   ❌ Error: ${err.message}`);
                results.errors.push({
                    teacherId,
                    teacherName: teacher.name,
                    error: err.message
                });
            }
        }

        // Resumen final
        console.log('\n' + '='.repeat(60));
        console.log('📊 RESUMEN');
        console.log('='.repeat(60));
        console.log(`Payouts creados: ${results.created}`);
        console.log(`Payouts actualizados: ${results.updated}`);
        console.log(`Errores: ${results.errors.length}`);
        
        if (results.payouts.length > 0) {
            const totalGross = results.payouts.reduce((s, p) => s + p.grossUSD, 0);
            const totalNet = results.payouts.reduce((s, p) => s + p.netUSD, 0);
            const totalPlatform = totalGross - totalNet;
            
            console.log('');
            console.log(`💰 Total bruto: $${(totalGross / 100).toFixed(2)} USD`);
            console.log(`💰 Total profesores: $${(totalNet / 100).toFixed(2)} USD`);
            console.log(`💰 Total plataforma: $${(totalPlatform / 100).toFixed(2)} USD`);
        }

        if (results.errors.length > 0) {
            console.log('\n❌ ERRORES:');
            results.errors.forEach(e => {
                console.log(`   - ${e.teacherName}: ${e.error}`);
            });
        }

        await mongoose.disconnect();
        console.log('\n✅ Proceso completado');

        return {
            success: true,
            period: periodLabel,
            ...results
        };

    } catch (error) {
        console.error('❌ Error fatal:', error);
        await mongoose.disconnect();
        process.exit(1);
    }
}

// Ejecutar si es llamado directamente
if (require.main === module) {
    generateMonthlyPayouts()
        .then(result => {
            console.log('\nResultado:', JSON.stringify(result, null, 2));
            process.exit(0);
        })
        .catch(err => {
            console.error(err);
            process.exit(1);
        });
}

module.exports = generateMonthlyPayouts;
