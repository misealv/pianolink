/**
 * services/PayoutCronService.js
 * Jobs automáticos para el sistema de suscripciones
 * 
 * - Auto-confirmar clases después de 48h sin respuesta del estudiante
 * - Generar payouts mensuales para profesores
 * - Procesar renovaciones automáticas
 */

const ClassSession = require('../models/ClassSession');
const StudentSubscription = require('../models/StudentSubscription');
const TeacherPayout = require('../models/TeacherPayout');
const TeacherPackage = require('../models/TeacherPackage');
const User = require('../models/User');
const PayoutNotificationService = require('./PayoutNotificationService');

class PayoutCronService {
    
    /**
     * Auto-confirmar clases pendientes después de 48h
     * Ejecutar cada hora
     */
    static async autoConfirmExpiredSessions() {
        const now = new Date();
        
        try {
            const expiredSessions = await ClassSession.find({
                status: 'pending-validation',
                autoConfirmAt: { $lte: now }
            });

            console.log(`[Cron] Encontradas ${expiredSessions.length} clases para auto-confirmar`);

            for (const session of expiredSessions) {
                try {
                    await session.autoConfirm();
                    console.log(`[Cron] Auto-confirmada sesión ${session._id}`);
                } catch (err) {
                    console.error(`[Cron] Error auto-confirmando ${session._id}:`, err.message);
                }
            }

            return {
                processed: expiredSessions.length,
                success: true
            };
        } catch (error) {
            console.error('[Cron] Error en autoConfirmExpiredSessions:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Generar payouts mensuales para profesores
     * Ejecutar el día 1 de cada mes a las 00:00 UTC
     */
    static async generateMonthlyPayouts() {
        try {
            // Período: mes anterior completo
            const now = new Date();
            const periodEnd = new Date(now.getFullYear(), now.getMonth(), 1); // Primer día del mes actual
            const periodStart = new Date(periodEnd);
            periodStart.setMonth(periodStart.getMonth() - 1); // Primer día del mes anterior

            console.log(`[Cron] Generando payouts para ${periodStart.toISOString()} - ${periodEnd.toISOString()}`);

            // Buscar todas las sesiones completadas del período anterior
            const sessions = await ClassSession.find({
                status: { $in: ['completed', 'student-noshow'] },
                payoutStatus: 'pending',
                validatedAt: {
                    $gte: periodStart,
                    $lt: periodEnd
                }
            });

            console.log(`[Cron] ${sessions.length} sesiones pendientes de pago`);

            // Agrupar por profesor
            const byTeacher = {};
            for (const session of sessions) {
                const tid = session.teacherId.toString();
                if (!byTeacher[tid]) {
                    byTeacher[tid] = [];
                }
                byTeacher[tid].push(session);
            }

            // Crear/actualizar payout para cada profesor
            const payouts = [];
            for (const [teacherId, teacherSessions] of Object.entries(byTeacher)) {
                try {
                    const payout = await TeacherPayout.getOrCreateForPeriod(
                        teacherId,
                        periodStart,
                        periodEnd
                    );

                    // Agregar sesiones al payout
                    for (const session of teacherSessions) {
                        await payout.addSession(session);
                        
                        // Marcar sesión como incluida en batch
                        session.payoutStatus = 'included-in-batch';
                        session.payoutBatchId = payout._id;
                        await session.save();
                    }

                    // Marcar payout como listo para revisión
                    payout.status = 'pending-review';
                    await payout.save();

                    // Notificar al profesor por email
                    try {
                        const teacher = await User.findById(teacherId);
                        if (teacher) {
                            await PayoutNotificationService.notifyPayoutReady(payout, teacher);
                            console.log(`[Cron] Email enviado a ${teacher.email}`);
                        }
                    } catch (emailErr) {
                        console.error(`[Cron] Error enviando email:`, emailErr.message);
                    }

                    payouts.push(payout);
                    console.log(`[Cron] Payout generado para profesor ${teacherId}: $${(payout.netPayoutUSD/100).toFixed(2)}`);
                } catch (err) {
                    console.error(`[Cron] Error generando payout para ${teacherId}:`, err.message);
                }
            }

            return {
                success: true,
                payoutsGenerated: payouts.length,
                sessionsProcessed: sessions.length
            };
        } catch (error) {
            console.error('[Cron] Error en generateMonthlyPayouts:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Procesar renovaciones automáticas
     * Ejecutar diariamente a las 06:00 UTC
     */
    static async processAutoRenewals() {
        const now = new Date();
        
        try {
            // Buscar suscripciones con autoRenew que:
            // 1. Tienen classesRemaining = 0 y status = exhausted
            // 2. O están por expirar en los próximos 3 días
            const expiringDate = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

            const subscriptions = await StudentSubscription.find({
                autoRenew: true,
                paymentMethodToken: { $ne: '' },
                $or: [
                    { status: 'exhausted' },
                    { 
                        status: 'active',
                        expiresAt: { $lte: expiringDate }
                    }
                ]
            }).populate('packageId');

            console.log(`[Cron] ${subscriptions.length} suscripciones para renovar`);

            const results = {
                processed: 0,
                renewed: 0,
                failed: 0,
                errors: []
            };

            for (const sub of subscriptions) {
                results.processed++;
                
                try {
                    const package_ = sub.packageId;
                    if (!package_ || !package_.isActive) {
                        console.log(`[Cron] Paquete ${sub.packageId} no disponible para renovación`);
                        continue;
                    }

                    // TODO: Procesar cobro con paymentMethodToken
                    // Por ahora solo loggeamos
                    console.log(`[Cron] Renovación pendiente: ${sub._id} - ${package_.name} - $${(package_.priceUSD/100).toFixed(2)}`);

                    // Simulación de cobro exitoso (descomentar cuando se integre el pago real)
                    // await sub.renew(package_);
                    // results.renewed++;

                } catch (err) {
                    results.failed++;
                    results.errors.push({
                        subscriptionId: sub._id,
                        error: err.message
                    });
                    console.error(`[Cron] Error renovando ${sub._id}:`, err.message);
                }
            }

            return {
                success: true,
                ...results
            };
        } catch (error) {
            console.error('[Cron] Error en processAutoRenewals:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Limpiar disputas vencidas sin resolución
     * Ejecutar semanalmente
     */
    static async escalateUnresolvedDisputes() {
        const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        
        try {
            const oldDisputes = await ClassSession.find({
                'dispute.isDisputed': true,
                'dispute.resolvedAt': null,
                'dispute.raisedAt': { $lte: oneWeekAgo }
            }).populate('studentId teacherId', 'name email');

            console.log(`[Cron] ${oldDisputes.length} disputas antiguas sin resolver`);

            // TODO: Enviar notificación a admin para revisar disputas urgentes

            return {
                success: true,
                unresolvedCount: oldDisputes.length,
                disputes: oldDisputes.map(d => ({
                    sessionId: d._id,
                    student: d.studentId?.name,
                    teacher: d.teacherId?.name,
                    raisedAt: d.dispute.raisedAt,
                    reason: d.dispute.reason
                }))
            };
        } catch (error) {
            console.error('[Cron] Error en escalateUnresolvedDisputes:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Ejecutar todos los jobs (para testing)
     */
    static async runAll() {
        console.log('[Cron] Ejecutando todos los jobs...');
        
        const results = {
            autoConfirm: await this.autoConfirmExpiredSessions(),
            renewals: await this.processAutoRenewals(),
            disputes: await this.escalateUnresolvedDisputes()
        };

        console.log('[Cron] Resultados:', JSON.stringify(results, null, 2));
        return results;
    }
}

module.exports = PayoutCronService;
