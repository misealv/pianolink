/**
 * services/CronService.js
 * Tareas programadas - PianoLink v2.0
 */

const cron = require('node-cron');
const RoomService = require('./RoomService');
const SubscriptionService = require('./SubscriptionService');

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
}

module.exports = CronService;
