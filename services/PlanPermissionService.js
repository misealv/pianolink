/**
 * services/PlanPermissionService.js
 * Sincroniza los feature flags (permissions) del profesor según su plan.
 * 
 * Regla: permissions se calculan SIEMPRE desde el campo `plan`.
 * Nunca se editan manualmente.
 */

const User = require('../models/User');

// Mapa de permisos por plan
const PLAN_PERMISSIONS = {
    free: {
        canInvitePrivateStudents: false,
        hasPriorityQueue: false,
        maxActiveStudents: -1   // -1 = ilimitado
    },
    premium: {
        canInvitePrivateStudents: true,
        hasPriorityQueue: true,
        maxActiveStudents: -1
    },
    founder: {
        canInvitePrivateStudents: true,
        hasPriorityQueue: true,
        maxActiveStudents: -1
    }
};

class PlanPermissionService {

    /**
     * Obtener permisos correspondientes a un plan
     * @param {string} plan - 'free' | 'premium' | 'founder'
     * @returns {Object} Permisos del plan
     */
    static getPermissionsForPlan(plan) {
        return PLAN_PERMISSIONS[plan] || PLAN_PERMISSIONS.free;
    }

    /**
     * Sincronizar permisos de un profesor según su plan actual
     * @param {string|ObjectId} teacherId
     * @returns {Object} { success, plan, permissions }
     */
    static async syncPermissions(teacherId) {
        try {
            const teacher = await User.findById(teacherId);
            
            if (!teacher || teacher.role !== 'teacher') {
                return { success: false, error: 'Profesor no encontrado o rol incorrecto' };
            }

            const plan = teacher.teacherData?.plan || 'free';
            const permissions = this.getPermissionsForPlan(plan);

            // Actualizar permisos en el documento
            if (!teacher.teacherData) {
                teacher.teacherData = {};
            }
            if (!teacher.teacherData.permissions) {
                teacher.teacherData.permissions = {};
            }

            teacher.teacherData.permissions.canInvitePrivateStudents = permissions.canInvitePrivateStudents;
            teacher.teacherData.permissions.hasPriorityQueue = permissions.hasPriorityQueue;
            teacher.teacherData.permissions.maxActiveStudents = permissions.maxActiveStudents;

            await teacher.save();

            console.log(`[PlanPermissionService] Permisos sincronizados para ${teacher.email}: plan=${plan}`);

            return {
                success: true,
                plan,
                permissions
            };
        } catch (error) {
            console.error('[PlanPermissionService] Error sincronizando permisos:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Activar plan para un profesor
     * @param {string|ObjectId} teacherId
     * @param {string} newPlan - 'free' | 'premium' | 'founder'
     * @param {Object} options - Opciones adicionales
     * @param {string} options.paymentProvider - 'mercadopago' | 'paypal'
     * @param {string} options.subscriptionId - ID de suscripción del proveedor
     * @returns {Object} { success, previousPlan, newPlan, permissions }
     */
    static async activatePlan(teacherId, newPlan, options = {}) {
        try {
            const teacher = await User.findById(teacherId);
            
            if (!teacher || teacher.role !== 'teacher') {
                return { success: false, error: 'Profesor no encontrado o rol incorrecto' };
            }

            const previousPlan = teacher.teacherData?.plan || 'free';
            const permissions = this.getPermissionsForPlan(newPlan);

            // Actualizar plan y permisos
            teacher.teacherData.plan = newPlan;
            teacher.teacherData.planActivatedAt = new Date();
            teacher.teacherData.permissions = {
                canInvitePrivateStudents: permissions.canInvitePrivateStudents,
                hasPriorityQueue: permissions.hasPriorityQueue,
                maxActiveStudents: permissions.maxActiveStudents
            };

            // Actualizar subscriptionStatus
            if (newPlan !== 'free') {
                teacher.teacherData.subscriptionStatus = 'active';
                // 30 días de membresía
                const expiresAt = new Date();
                expiresAt.setDate(expiresAt.getDate() + 30);
                teacher.teacherData.subscriptionExpiresAt = expiresAt;
            }

            // Guardar proveedor de pago si se especifica
            if (options.paymentProvider) {
                teacher.teacherData.membershipPaymentProvider = options.paymentProvider;
            }
            if (options.subscriptionId) {
                if (options.paymentProvider === 'mercadopago') {
                    teacher.teacherData.mpSubscriptionId = options.subscriptionId;
                } else if (options.paymentProvider === 'paypal') {
                    teacher.teacherData.paypalSubscriptionId = options.subscriptionId;
                }
            }

            await teacher.save();

            console.log(`[PlanPermissionService] Plan activado: ${teacher.email} ${previousPlan} → ${newPlan}`);

            return {
                success: true,
                previousPlan,
                newPlan,
                permissions,
                expiresAt: teacher.teacherData.subscriptionExpiresAt
            };
        } catch (error) {
            console.error('[PlanPermissionService] Error activando plan:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Downgrade de plan (cuando membresía expira)
     * @param {string|ObjectId} teacherId
     * @returns {Object} { success, previousPlan, newPlan }
     */
    static async downgradeToPlan(teacherId, targetPlan = 'free') {
        try {
            const teacher = await User.findById(teacherId);
            
            if (!teacher || teacher.role !== 'teacher') {
                return { success: false, error: 'Profesor no encontrado' };
            }

            const previousPlan = teacher.teacherData?.plan || 'free';
            
            if (previousPlan === targetPlan) {
                return { success: true, previousPlan, newPlan: targetPlan, noChange: true };
            }

            const permissions = this.getPermissionsForPlan(targetPlan);

            teacher.teacherData.plan = targetPlan;
            teacher.teacherData.permissions = {
                canInvitePrivateStudents: permissions.canInvitePrivateStudents,
                hasPriorityQueue: permissions.hasPriorityQueue,
                maxActiveStudents: permissions.maxActiveStudents
            };

            if (targetPlan === 'free') {
                teacher.teacherData.subscriptionStatus = 'expired';
            }

            await teacher.save();

            console.log(`[PlanPermissionService] Downgrade: ${teacher.email} ${previousPlan} → ${targetPlan}`);

            return {
                success: true,
                previousPlan,
                newPlan: targetPlan,
                permissions
            };
        } catch (error) {
            console.error('[PlanPermissionService] Error en downgrade:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Verificar si un profesor tiene un permiso específico
     * @param {string|ObjectId} teacherId
     * @param {string} permissionKey - Clave del permiso (ej: 'canInvitePrivateStudents')
     * @returns {boolean}
     */
    static async hasPermission(teacherId, permissionKey) {
        try {
            const teacher = await User.findById(teacherId)
                .select(`teacherData.permissions.${permissionKey} teacherData.plan`);
            
            if (!teacher) return false;

            // Verificar directamente el permiso almacenado
            return teacher.teacherData?.permissions?.[permissionKey] === true;
        } catch (error) {
            console.error('[PlanPermissionService] Error verificando permiso:', error.message);
            return false;
        }
    }
}

module.exports = PlanPermissionService;
