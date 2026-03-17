/**
 * services/CronService.js
 * Tareas programadas - PianoLink v2.0
 */

const cron = require('node-cron');
const RoomService = require('./RoomService');
const SubscriptionService = require('./SubscriptionService');
const PayoutCronService = require('./PayoutCronService');
const MembershipReminderService = require('./MembershipReminderService');
const packageExpirationJob = require('../jobs/package-expiration');
const balanceReconciliationJob = require('../jobs/balance-reconciliation');
const PlanPermissionService = require('./PlanPermissionService');
const TeacherInvite = require('../models/TeacherInvite');
const User = require('../models/User');
const Enrollment = require('../models/Enrollment');
const emailService = require('./EmailService');

// CRM: Runner de secuencias (lazy load para no impactar si el módulo CRM no existe)
let CrmSequenceRunner = null;
function getSequenceRunner() {
    if (!CrmSequenceRunner) {
        try {
            CrmSequenceRunner = require('../crm/services/CrmSequenceRunner');
        } catch (e) {
            // Módulo CRM no disponible, silenciar
        }
    }
    return CrmSequenceRunner;
}

// CRM Fase 3: Tracking Dispatcher — despacha conversiones a Meta/Google/GA4
let CrmTrackingDispatcher = null;
function getTrackingDispatcher() {
    if (!CrmTrackingDispatcher) {
        try { CrmTrackingDispatcher = require('../crm/services/CrmTrackingDispatcher'); } catch (e) { /* no disponible */ }
    }
    return CrmTrackingDispatcher;
}

// CRM Fase 3: Ads Spend Sync — sincroniza gasto real desde Meta/Google APIs
let CrmAdsSpendSyncService = null;
function getAdsSpendSync() {
    if (!CrmAdsSpendSyncService) {
        try { CrmAdsSpendSyncService = require('../crm/services/CrmAdsSpendSyncService'); } catch (e) { /* no disponible */ }
    }
    return CrmAdsSpendSyncService;
}

// CRM Fase 3: Alert Service — verifica umbrales de CPA, ROAS, presupuesto
let CrmAlertService = null;
function getAlertService() {
    if (!CrmAlertService) {
        try { CrmAlertService = require('../crm/services/CrmAlertService'); } catch (e) { /* no disponible */ }
    }
    return CrmAlertService;
}

// CRM: Broadcast Scheduler — envía emails broadcast programados por fecha
let CrmBroadcastScheduler = null;
function getBroadcastScheduler() {
    if (!CrmBroadcastScheduler) {
        try { CrmBroadcastScheduler = require('../crm/services/CrmBroadcastScheduler'); } catch (e) { /* no disponible */ }
    }
    return CrmBroadcastScheduler;
}

// CRM: Abandoned Cart — detecta clicks sin pago y envía trigger email
let CrmAbandonedCartService = null;
function getAbandonedCartService() {
    if (!CrmAbandonedCartService) {
        try { CrmAbandonedCartService = require('../crm/services/CrmAbandonedCartService'); } catch (e) { /* no disponible */ }
    }
    return CrmAbandonedCartService;
}

// CRM: Email Follow-Up — tareas automáticas basadas en engagement de email
let CrmEmailFollowUpService = null;
function getEmailFollowUpService() {
    if (!CrmEmailFollowUpService) {
        try { CrmEmailFollowUpService = require('../crm/services/CrmEmailFollowUpService'); } catch (e) { /* no disponible */ }
    }
    return CrmEmailFollowUpService;
}

// CRM: Reactivation Service — envío diario de emails a leads fríos
let CrmReactivationService = null;
function getReactivationService() {
    if (!CrmReactivationService) {
        try { CrmReactivationService = require('../crm/services/CrmReactivationService'); } catch (e) { /* no disponible */ }
    }
    return CrmReactivationService;
}

class CronService {
    static jobs = [];

    /**
     * Iniciar todas las tareas programadas
     */
    static start() {
        console.log('[CronService] Iniciando tareas programadas...');

        // 1. Limpiar salas inactivas - Diario a las 3 AM
        const cleanupJob = cron.schedule('0 3 * * *', async () => {
            console.log('[Cron] Ejecutando limpieza de salas inactivas...');
            try {
                const days = parseInt(process.env.ROOM_CLEANUP_DAYS) || 30;
                const cleaned = await RoomService.cleanupInactiveRooms(days);
                console.log(`[Cron] ✅ Limpieza completada: ${cleaned} salas`);
            } catch (error) {
                console.error('[Cron] ❌ Error en limpieza:', error);
            }
        }, {
            timezone: 'America/Buenos_Aires'
        });
        this.jobs.push(cleanupJob);

        // 2. Marcar suscripciones expiradas - Cada hora
        const expireJob = cron.schedule('0 * * * *', async () => {
            console.log('[Cron] Verificando suscripciones expiradas...');
            try {
                const expired = await SubscriptionService.markExpiredSubscriptions();
                if (expired > 0) {
                    console.log(`[Cron] ⚠️ ${expired} suscripciones marcadas como expiradas`);
                }
            } catch (error) {
                console.error('[Cron] ❌ Error marcando expiradas:', error);
            }
        });
        this.jobs.push(expireJob);

        // 3. Notificar suscripciones por vencer - Diario a las 10 AM
        const notifyJob = cron.schedule('0 10 * * *', async () => {
            console.log('[Cron] Verificando suscripciones por vencer...');
            try {
                const expiring = await SubscriptionService.getExpiringSoon(5);
                if (expiring.length > 0) {
                    console.log(`[Cron] 📧 ${expiring.length} suscripciones vencen en 5 días`);
                    // TODO: Enviar emails de recordatorio
                    // await EmailService.sendExpirationReminders(expiring);
                }
            } catch (error) {
                console.error('[Cron] ❌ Error notificando:', error);
            }
        }, {
            timezone: 'America/Buenos_Aires'
        });
        this.jobs.push(notifyJob);

        // ============================================
        // JOBS DE SUSCRIPCIONES Y PAGOS
        // ============================================

        // 4. Auto-confirmar clases pendientes (48h) - Cada hora
        const autoConfirmJob = cron.schedule('30 * * * *', async () => {
            console.log('[Cron] Verificando clases para auto-confirmar...');
            try {
                const result = await PayoutCronService.autoConfirmExpiredSessions();
                if (result.processed > 0) {
                    console.log(`[Cron] ✅ Auto-confirmadas ${result.processed} clases`);
                }
            } catch (error) {
                console.error('[Cron] ❌ Error auto-confirmando:', error);
            }
        });
        this.jobs.push(autoConfirmJob);

        // 5. Generar payouts mensuales - Día 1 de cada mes a las 00:00 UTC
        const monthlyPayoutJob = cron.schedule('0 0 1 * *', async () => {
            console.log('[Cron] 💰 Generando payouts mensuales...');
            try {
                const result = await PayoutCronService.generateMonthlyPayouts();
                console.log(`[Cron] ✅ Payouts generados: ${result.payoutsGenerated}, sesiones: ${result.sessionsProcessed}`);
            } catch (error) {
                console.error('[Cron] ❌ Error generando payouts:', error);
            }
        }, {
            timezone: 'UTC'
        });
        this.jobs.push(monthlyPayoutJob);

        // 6. Procesar renovaciones automáticas - Diario a las 06:00 UTC
        const renewalJob = cron.schedule('0 6 * * *', async () => {
            console.log('[Cron] 🔄 Procesando renovaciones automáticas...');
            try {
                const result = await PayoutCronService.processAutoRenewals();
                console.log(`[Cron] ✅ Renovaciones: ${result.renewed}/${result.processed}`);
            } catch (error) {
                console.error('[Cron] ❌ Error renovando:', error);
            }
        }, {
            timezone: 'UTC'
        });
        this.jobs.push(renewalJob);

        // 7. Escalar disputas sin resolver - Domingos a las 12:00 UTC
        const disputeEscalationJob = cron.schedule('0 12 * * 0', async () => {
            console.log('[Cron] ⚠️ Verificando disputas sin resolver...');
            try {
                const result = await PayoutCronService.escalateUnresolvedDisputes();
                if (result.unresolvedCount > 0) {
                    console.log(`[Cron] ⚠️ ${result.unresolvedCount} disputas pendientes de más de 7 días`);
                }
            } catch (error) {
                console.error('[Cron] ❌ Error escalando disputas:', error);
            }
        }, {
            timezone: 'UTC'
        });
        this.jobs.push(disputeEscalationJob);

        // 8. Recordatorios de renovación de membresía profesor - Diario a las 09:00 Chile
        const membershipReminderJob = cron.schedule('0 9 * * *', async () => {
            console.log('[Cron] 📧 Verificando membresías de profesores...');
            try {
                const result = await MembershipReminderService.runDailyCheck();
                if (result.sent > 0) {
                    console.log(`[Cron] ✅ ${result.sent} recordatorios de membresía enviados`);
                }
                if (result.errors.length > 0) {
                    console.log(`[Cron] ⚠️ ${result.errors.length} errores enviando recordatorios`);
                }
            } catch (error) {
                console.error('[Cron] ❌ Error en recordatorios de membresía:', error);
            }
        }, {
            timezone: 'America/Santiago'
        });
        this.jobs.push(membershipReminderJob);

        // 9. Avisos de expiración de paquetes de clases - Diario a las 10:00 Chile
        const packageExpirationCron = cron.schedule('0 10 * * *', async () => {
            console.log('[Cron] 📦 Verificando paquetes de clases por expirar...');
            try {
                const result = await packageExpirationJob.processExpirationWarnings();
                console.log(`[Cron] ✅ Paquetes: ${result.enrollmentsProcessed} revisados, ${result.emailsSent} emails, ${result.classesExpired} clases expiradas`);
            } catch (error) {
                console.error('[Cron] ❌ Error en expiración de paquetes:', error);
            }
        }, {
            timezone: 'America/Santiago'
        });
        this.jobs.push(packageExpirationCron);

        // 10. CRM: Procesar secuencias de email - Cada 10 minutos
        const sequenceRunnerJob = cron.schedule('*/10 * * * *', async () => {
            const runner = getSequenceRunner();
            if (!runner) return; // Módulo CRM no disponible
            try {
                const result = await runner.processAll();
                if (result.sent > 0 || result.errors > 0) {
                    console.log(`[Cron] 📧 Secuencias: ${result.sent} emails, ${result.errors} errores, ${result.skipped} saltados`);
                }
            } catch (error) {
                console.error('[Cron] ❌ Error procesando secuencias CRM:', error);
            }
        }, {
            timezone: 'UTC'
        });
        this.jobs.push(sequenceRunnerJob);

        // 11. CRM Fase 3: Despachar conversiones a Meta/Google/GA4 — Cada 15 minutos (offset con secuencias)
        const trackingDispatchJob = cron.schedule('5,20,35,50 * * * *', async () => {
            const dispatcher = getTrackingDispatcher();
            if (!dispatcher) return;
            try {
                const result = await dispatcher.processAll();
                const total = (result.meta?.sent || 0) + (result.google?.sent || 0) + (result.ga4?.sent || 0);
                if (total > 0) {
                    console.log(`[Cron] 📡 Tracking dispatch: Meta=${result.meta?.sent||0} Google=${result.google?.sent||0} GA4=${result.ga4?.sent||0} (${result.duration}ms)`);
                }
            } catch (error) {
                console.error('[Cron] ❌ Error despacho tracking CRM:', error);
            }
        }, {
            timezone: 'UTC'
        });
        this.jobs.push(trackingDispatchJob);

        // 12. CRM Fase 3: Sincronizar gasto publicitario desde Meta/Google — Diario a las 04:00 UTC
        const adsSpendSyncJob = cron.schedule('0 4 * * *', async () => {
            const syncService = getAdsSpendSync();
            if (!syncService) return;
            console.log('[Cron] 💸 Sincronizando gasto publicitario...');
            try {
                const result = await syncService.syncAll();
                console.log(`[Cron] ✅ Ads sync: ${result.synced} campañas, ${result.errors} errores`);
            } catch (error) {
                console.error('[Cron] ❌ Error sync gasto ads:', error);
            }
        }, {
            timezone: 'UTC'
        });
        this.jobs.push(adsSpendSyncJob);

        // 13. CRM Fase 3: Alertas automáticas de campañas — Diario a las 08:00 UTC
        const alertCheckJob = cron.schedule('0 8 * * *', async () => {
            const alertService = getAlertService();
            if (!alertService) return;
            try {
                const result = await alertService.runAll();
                if (result.alerts?.length > 0) {
                    console.log(`[Cron] ⚠️ CRM Alertas: ${result.alerts.length} alertas generadas (${result.duration}ms)`);
                }
            } catch (error) {
                console.error('[Cron] ❌ Error alertas CRM:', error);
            }
        }, {
            timezone: 'UTC'
        });
        this.jobs.push(alertCheckJob);

        // 13b. CRM: Broadcast Scheduler — Envía emails broadcast programados — Cada 15 min (offset)
        const broadcastSchedulerJob = cron.schedule('7,22,37,52 * * * *', async () => {
            const scheduler = getBroadcastScheduler();
            if (!scheduler) return;
            try {
                const result = await scheduler.processAll();
                if (result.totalEnviados > 0) {
                    console.log(`[Cron] 📧 Broadcast scheduler: ${result.totalEnviados} emails enviados en ${result.campanasEnviadas} campañas (${result.duration}ms)`);
                }
            } catch (error) {
                console.error('[Cron] ❌ Error broadcast scheduler:', error);
            }
        }, {
            timezone: 'UTC'
        });
        this.jobs.push(broadcastSchedulerJob);

        // 13c. CRM: Abandoned Cart — Detecta clicks sin pago y envía email trigger — Cada 15 min (offset)
        const abandonedCartJob = cron.schedule('3,18,33,48 * * * *', async () => {
            const service = getAbandonedCartService();
            if (!service) return;
            try {
                const result = await service.processAll();
                if (result.sent > 0) {
                    console.log(`[Cron] 🛒 Carrito abandonado: ${result.sent} emails enviados de ${result.checked} detectados`);
                }
            } catch (error) {
                console.error('[Cron] ❌ Error carrito abandonado:', error);
            }
        }, {
            timezone: 'UTC'
        });
        this.jobs.push(abandonedCartJob);

        // 13d. CRM: Email Follow-Up — Tareas automáticas por engagement — Diario 9AM Chile (12:00 UTC)
        const emailFollowUpJob = cron.schedule('0 12 * * *', async () => {
            const service = getEmailFollowUpService();
            if (!service) return;
            try {
                const result = await service.runAll();
                if (result.totalTasks > 0) {
                    console.log(`[Cron] 📬 Email follow-up: ${result.totalTasks} tareas creadas (R1:${result.rule1} R2:${result.rule2} R3:${result.rule3}) en ${result.duration}ms`);
                }
            } catch (error) {
                console.error('[Cron] ❌ Error email follow-up:', error);
            }
        }, {
            timezone: 'UTC'
        });
        this.jobs.push(emailFollowUpJob);

        // 13e. CRM: Reactivation — Envío diario de email a 500 leads fríos — 10AM Chile (13:00 UTC)
        const reactivationJob = cron.schedule('0 13 * * *', async () => {
            const service = getReactivationService();
            if (!service) return;
            try {
                const result = await service.processDailyBatch();
                if (result.sent > 0 || result.errors > 0) {
                    console.log(`[Cron] 🔄 Reactivación: ${result.sent} enviados, ${result.errors} errores, ${result.remaining} restantes`);
                }
            } catch (error) {
                console.error('[Cron] ❌ Error reactivación:', error);
            }
        }, {
            timezone: 'UTC'
        });
        this.jobs.push(reactivationJob);

        // ============================================
        // JOBS FASE 3: PERMISOS Y PLANES
        // ============================================

        // 14. Downgrade automático de planes expirados — Diario a las 00:30 UTC
        const planDowngradeJob = cron.schedule('30 0 * * *', async () => {
            console.log('[Cron] 📉 Verificando planes expirados para downgrade...');
            try {
                const result = await CronService._processPlanDowngrades();
                if (result.downgraded > 0) {
                    console.log(`[Cron] ⚠️ ${result.downgraded} profesores degradados a plan free`);
                }
                if (result.graceExpired > 0) {
                    console.log(`[Cron] ⚠️ ${result.graceExpired} alumnos privados cambiaron comisión (grace period expirado)`);
                }
            } catch (error) {
                console.error('[Cron] ❌ Error en downgrade de planes:', error);
            }
        }, {
            timezone: 'UTC'
        });
        this.jobs.push(planDowngradeJob);

        // 15. Limpiar invitaciones expiradas — Diario a las 02:00 UTC
        const cleanInvitesJob = cron.schedule('0 2 * * *', async () => {
            console.log('[Cron] 🧹 Limpiando invitaciones expiradas...');
            try {
                const result = await CronService._cleanExpiredInvites();
                if (result.cleaned > 0) {
                    console.log(`[Cron] ✅ ${result.cleaned} invitaciones expiradas marcadas`);
                }
            } catch (error) {
                console.error('[Cron] ❌ Error limpiando invitaciones:', error);
            }
        }, {
            timezone: 'UTC'
        });
        this.jobs.push(cleanInvitesJob);

        // 18. Reconciliación de saldo de clases - Diario a las 3:00 AM UTC
        const balanceReconciliationCron = cron.schedule('0 3 * * *', async () => {
            console.log('[Cron] 🔄 Ejecutando reconciliación de saldo de clases...');
            try {
                const result = await balanceReconciliationJob({ silent: false });
                const s = result.summary;
                if (s.discrepancies > 0 || s.orphanedBalances > 0) {
                    console.log(`[Cron] ⚠️ Reconciliación: ${s.discrepancies} discrepancias, ${s.orphanedBalances} saldos huérfanos`);
                } else {
                    console.log('[Cron] ✅ Reconciliación: sin discrepancias encontradas');
                }
            } catch (error) {
                console.error('[Cron] ❌ Error en reconciliación de saldo:', error);
            }
        }, {
            timezone: 'UTC'
        });
        this.jobs.push(balanceReconciliationCron);

        console.log(`[CronService] ✅ ${this.jobs.length} tareas programadas iniciadas`);
    }

    /**
     * Detener todas las tareas
     */
    static stop() {
        this.jobs.forEach(job => job.stop());
        this.jobs = [];
        console.log('[CronService] Tareas detenidas');
    }

    /**
     * Ejecutar limpieza manualmente (para testing)
     */
    static async runCleanupNow() {
        const days = parseInt(process.env.ROOM_CLEANUP_DAYS) || 30;
        return RoomService.cleanupInactiveRooms(days);
    }

    /**
     * Ejecutar marcado de expiradas manualmente
     */
    static async runExpireCheckNow() {
        return SubscriptionService.markExpiredSubscriptions();
    }

    /**
     * Ejecutar auto-confirmación de clases manualmente
     */
    static async runAutoConfirmNow() {
        return PayoutCronService.autoConfirmExpiredSessions();
    }

    /**
     * Ejecutar generación de payouts manualmente
     */
    static async runMonthlyPayoutsNow() {
        return PayoutCronService.generateMonthlyPayouts();
    }

    /**
     * Ejecutar renovaciones manualmente
     */
    static async runRenewalsNow() {
        return PayoutCronService.processAutoRenewals();
    }

    /**
     * Ejecutar chequeo de expiración de paquetes manualmente
     */
    static async runPackageExpirationNow() {
        return packageExpirationJob.processExpirationWarnings();
    }

    /**
     * Ejecutar runner de secuencias CRM manualmente
     */
    static async runSequenceRunnerNow() {
        const runner = getSequenceRunner();
        if (!runner) return { error: 'Módulo CRM no disponible' };
        return runner.processAll();
    }

    /**
     * Ejecutar tracking dispatch manualmente (Fase 3)
     */
    static async runTrackingDispatchNow() {
        const dispatcher = getTrackingDispatcher();
        if (!dispatcher) return { error: 'Módulo CRM no disponible' };
        return dispatcher.processAll();
    }

    /**
     * Ejecutar sync de gasto publicitario manualmente (Fase 3)
     */
    static async runAdsSpendSyncNow() {
        const syncService = getAdsSpendSync();
        if (!syncService) return { error: 'Módulo CRM no disponible' };
        return syncService.syncAll();
    }

    /**
     * Ejecutar alertas CRM manualmente (Fase 3)
     */
    static async runAlertCheckNow() {
        const alertService = getAlertService();
        if (!alertService) return { error: 'Módulo CRM no disponible' };
        return alertService.runAll();
    }

    /**
     * Procesar downgrades automáticos de planes expirados
     * Llamado por cron diario y disponible para ejecución manual
     */
    static async _processPlanDowngrades() {
        const result = { downgraded: 0, graceExpired: 0, errors: [] };

        try {
            // Buscar profesores con plan de pago y membresía expirada
            const expiredTeachers = await User.find({
                role: 'teacher',
                'teacherData.plan': { $in: ['premium', 'founder'] },
                'teacherData.subscriptionStatus': { $in: ['expired', 'cancelled', 'past_due'] },
                'teacherData.subscriptionExpiresAt': { $lt: new Date() }
            }).select('name email teacherData.plan teacherData.subscriptionStatus teacherData.subscriptionExpiresAt');

            for (const teacher of expiredTeachers) {
                try {
                    const previousPlan = teacher.teacherData.plan;

                    // Degradar plan y sincronizar permisos
                    await PlanPermissionService.downgradeToPlan(teacher._id, 'free');

                    // Enviar email de aviso
                    try {
                        await emailService.sendSafe({
                            to: teacher.email,
                            subject: '⚠️ Tu membresía PianoLink ha expirado',
                            html: `
                                <h2>Tu membresía ${previousPlan} ha expirado</h2>
                                <p>Hola ${teacher.name},</p>
                                <p>Tu plan <strong>${previousPlan}</strong> ha expirado y tu cuenta ha sido cambiada al plan <strong>free</strong>.</p>
                                <h3>¿Qué cambia?</h3>
                                <ul>
                                    <li>Ya no puedes generar nuevas invitaciones para alumnos privados</li>
                                    <li>La comisión de la plataforma pasa de 15% a 25% para alumnos de plataforma</li>
                                    <li>Tus alumnos privados <strong>existentes mantienen 0% comisión por 30 días</strong> (período de gracia)</li>
                                    <li>Ya no tienes prioridad en la asignación de nuevos alumnos</li>
                                </ul>
                                <p>Renueva tu membresía para recuperar todos los beneficios.</p>
                            `
                        });
                    } catch (emailErr) {
                        console.error(`[PlanDowngrade] Error email a ${teacher.email}:`, emailErr.message);
                    }

                    console.log(`[PlanDowngrade] ${teacher.email}: ${previousPlan} → free`);
                    result.downgraded++;

                } catch (teacherErr) {
                    console.error(`[PlanDowngrade] Error procesando ${teacher.email}:`, teacherErr.message);
                    result.errors.push({ email: teacher.email, error: teacherErr.message });
                }
            }

            // Verificar grace period de comisiones para alumnos privados
            // Después de 30 días del downgrade, cambiar comisión de 0% a 25/75
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

            const graceExpiredEnrollments = await Enrollment.find({
                source: 'private_invite',
                'appliedCommission.platformPercent': 0,
                // El profesor ahora es free
            }).populate('teacherId', 'teacherData.plan teacherData.subscriptionExpiresAt');

            for (const enrollment of graceExpiredEnrollments) {
                try {
                    const teacher = enrollment.teacherId;
                    if (!teacher || !teacher.teacherData) continue;

                    // Solo procesar si el profesor es free Y la membresía expiró hace más de 30 días
                    if (teacher.teacherData.plan !== 'free') continue;

                    const expiredAt = teacher.teacherData.subscriptionExpiresAt;
                    if (!expiredAt || new Date(expiredAt) > thirtyDaysAgo) continue;

                    // Actualizar comisión del enrollment
                    enrollment.appliedCommission.platformPercent = 25;
                    enrollment.appliedCommission.teacherPercent = 75;
                    enrollment.appliedCommission.reason = 'free_plan_grace_expired';
                    await enrollment.save();

                    result.graceExpired++;
                } catch (err) {
                    result.errors.push({ enrollmentId: enrollment._id, error: err.message });
                }
            }

        } catch (error) {
            console.error('[PlanDowngrade] Error general:', error.message);
            result.errors.push({ general: error.message });
        }

        return result;
    }

    /**
     * Limpiar invitaciones expiradas que no fueron eliminadas por TTL
     * (Respaldo del TTL index de MongoDB)
     */
    static async _cleanExpiredInvites() {
        const result = { cleaned: 0 };

        try {
            const updated = await TeacherInvite.updateMany(
                {
                    status: 'active',
                    expiresAt: { $lt: new Date() }
                },
                {
                    $set: { status: 'expired' }
                }
            );

            result.cleaned = updated.modifiedCount || 0;
        } catch (error) {
            console.error('[CleanInvites] Error:', error.message);
        }

        return result;
    }

    /**
     * Ejecutar downgrade de planes manualmente
     */
    static async runPlanDowngradeNow() {
        return this._processPlanDowngrades();
    }

    /**
     * Ejecutar limpieza de invitaciones manualmente
     */
    static async runCleanInvitesNow() {
        return this._cleanExpiredInvites();
    }

    /**
     * Estado de todos los jobs
     */
    static getStatus() {
        return {
            jobCount: this.jobs.length,
            jobs: [
                { name: 'cleanup', schedule: '0 3 * * *', description: 'Limpiar salas inactivas' },
                { name: 'expire', schedule: '0 * * * *', description: 'Marcar suscripciones expiradas' },
                { name: 'notify', schedule: '0 10 * * *', description: 'Notificar por vencer' },
                { name: 'autoConfirm', schedule: '30 * * * *', description: 'Auto-confirmar clases 48h' },
                { name: 'monthlyPayout', schedule: '0 0 1 * *', description: 'Generar payouts mensuales' },
                { name: 'renewals', schedule: '0 6 * * *', description: 'Renovaciones automáticas' },
                { name: 'disputes', schedule: '0 12 * * 0', description: 'Escalar disputas' },
                { name: 'membershipReminder', schedule: '0 9 * * *', description: 'Recordatorios membresía' },
                { name: 'packageExpiration', schedule: '0 10 * * *', description: 'Avisos expiración paquetes' },
                { name: 'sequenceRunner', schedule: '*/10 * * * *', description: 'CRM: Procesar secuencias email' },
                { name: 'trackingDispatch', schedule: '5,20,35,50 * * * *', description: 'CRM: Despachar conversiones a Meta/Google/GA4' },
                { name: 'adsSpendSync', schedule: '0 4 * * *', description: 'CRM: Sync gasto publicitario' },
                { name: 'alertCheck', schedule: '0 8 * * *', description: 'CRM: Alertas campañas' },
                { name: 'emailFollowUp', schedule: '0 12 * * *', description: 'CRM: Tareas automáticas por email engagement (9AM Chile)' },
                { name: 'planDowngrade', schedule: '30 0 * * *', description: 'Downgrade automático planes expirados' },
                { name: 'cleanInvites', schedule: '0 2 * * *', description: 'Limpiar invitaciones expiradas' },
                { name: 'balanceReconciliation', schedule: '0 3 * * *', description: 'Reconciliación saldo de clases' }
            ]
        };
    }
}

module.exports = CronService;
