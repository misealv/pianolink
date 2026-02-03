/**
 * services/SubscriptionService.js
 * Gestión de Suscripciones - PianoLink v2.0
 */

const Subscription = require('../models/Subscription');
const Enrollment = require('../models/Enrollment');
const Room = require('../models/Room');

class SubscriptionService {
    
    /**
     * ⚠️ GATEKEEPER - Verificar si alumno puede acceder
     * Esta es LA función crítica para control de acceso
     */
    static async canStudentAccess(studentId, teacherId) {
        const subscription = await Subscription.findOne({
            studentId,
            teacherId,
            status: 'active'
        });

        if (!subscription) {
            return {
                allowed: false,
                reason: 'NO_SUBSCRIPTION',
                subscription: null
            };
        }

        if (!subscription.isValid()) {
            return {
                allowed: false,
                reason: 'SUBSCRIPTION_EXPIRED',
                subscription,
                expiresAt: subscription.expiresAt
            };
        }

        return {
            allowed: true,
            reason: 'ACTIVE',
            subscription,
            expiresAt: subscription.expiresAt
        };
    }

    /**
     * Crear nueva suscripción (después de primer pago)
     */
    static async createSubscription(data) {
        const {
            studentId,
            teacherId,
            paymentProvider,
            amount,
            currency = 'ARS',
            externalSubscriptionId,
            daysValid = 30
        } = data;

        // Calcular fecha de expiración
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + daysValid);

        // Verificar si ya existe
        let subscription = await Subscription.findOne({ studentId, teacherId });

        if (subscription) {
            // Extender existente
            await subscription.extend(daysValid);
            return subscription;
        }

        // Crear nueva
        subscription = await Subscription.create({
            studentId,
            teacherId,
            paymentProvider,
            amount,
            currency,
            externalSubscriptionId,
            expiresAt,
            lastPaymentAt: new Date(),
            status: 'active'
        });

        // Auto-crear enrollment si no existe
        await this.ensureEnrollment(studentId, teacherId);

        console.log(`[SubscriptionService] Nueva suscripción creada para ${studentId} con ${teacherId}`);
        return subscription;
    }

    /**
     * Extender suscripción (después de pago recurrente)
     */
    static async extendSubscription(subscriptionId, days = 30) {
        const subscription = await Subscription.findById(subscriptionId);
        if (!subscription) {
            throw new Error('Suscripción no encontrada');
        }

        await subscription.extend(days);
        console.log(`[SubscriptionService] Suscripción ${subscriptionId} extendida ${days} días`);
        return subscription;
    }

    /**
     * Extender por external ID (desde webhook)
     */
    static async extendByExternalId(externalSubscriptionId, days = 30) {
        const subscription = await Subscription.findOne({ externalSubscriptionId });
        if (!subscription) {
            console.error(`[SubscriptionService] Suscripción externa no encontrada: ${externalSubscriptionId}`);
            return null;
        }

        await subscription.extend(days);
        return subscription;
    }

    /**
     * Cancelar suscripción
     */
    static async cancelSubscription(subscriptionId) {
        return Subscription.findByIdAndUpdate(subscriptionId, {
            status: 'cancelled'
        }, { new: true });
    }

    /**
     * Obtener suscripción activa del alumno
     */
    static async getActiveSubscription(studentId) {
        return Subscription.getActiveSubscription(studentId);
    }

    /**
     * Obtener todas las suscripciones de un profesor (sus alumnos)
     */
    static async getSubscriptionsByTeacher(teacherId) {
        return Subscription.find({ teacherId })
            .populate('studentId', 'name email')
            .sort({ expiresAt: 1 });
    }

    /**
     * Obtener suscripciones por vencer (para enviar recordatorios)
     */
    static async getExpiringSoon(days = 5) {
        return Subscription.getExpiringSoon(days);
    }

    /**
     * Asegurar que existe enrollment cuando se crea suscripción
     */
    static async ensureEnrollment(studentId, teacherId) {
        const existing = await Enrollment.findOne({ studentId, teacherId });
        if (existing) return existing;

        // Obtener sala del profesor
        const room = await Room.findByTeacher(teacherId);
        if (!room) {
            console.error(`[SubscriptionService] Profesor ${teacherId} no tiene sala`);
            return null;
        }

        // Crear enrollment
        const enrollment = await Enrollment.create({
            studentId,
            teacherId,
            roomId: room._id,
            status: 'active'
        });

        console.log(`[SubscriptionService] Enrollment auto-creado para ${studentId}`);
        return enrollment;
    }

    /**
     * Marcar suscripciones expiradas (cron job)
     */
    static async markExpiredSubscriptions() {
        const result = await Subscription.updateMany(
            {
                status: 'active',
                expiresAt: { $lt: new Date() }
            },
            {
                status: 'expired'
            }
        );

        if (result.modifiedCount > 0) {
            console.log(`[SubscriptionService] ${result.modifiedCount} suscripciones marcadas como expiradas`);
        }

        return result.modifiedCount;
    }
}

module.exports = SubscriptionService;
