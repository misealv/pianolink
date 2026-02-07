/**
 * services/CronService.js
 * Tareas programadas - PianoLink v2.0
 */

const cron = require('node-cron');
const RoomService = require('./RoomService');
const SubscriptionService = require('./SubscriptionService');
const PayoutCronService = require('./PayoutCronService');

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
                { name: 'disputes', schedule: '0 12 * * 0', description: 'Escalar disputas' }
            ]
        };
    }
}

module.exports = CronService;
