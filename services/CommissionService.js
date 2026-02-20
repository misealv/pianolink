/**
 * services/CommissionService.js
 * Fuente única de verdad para cálculo de comisiones.
 * 
 * Reemplaza todos los 0.20 / 0.80 hardcodeados en el sistema.
 * Lee porcentajes desde GlobalConfig.memberships.teacherPlans.
 * 
 * Casos:
 *   - Alumno PLATAFORMA + profesor FREE    → 25/75
 *   - Alumno PLATAFORMA + profesor PREMIUM  → 15/85
 *   - Alumno PLATAFORMA + profesor FOUNDER  → 15/85
 *   - Alumno PRIVADO    + profesor PREMIUM  → 0/100
 *   - Alumno PRIVADO    + profesor FOUNDER  → 0/100
 */

const User = require('../models/User');
const GlobalConfig = require('../models/GlobalConfig');

class CommissionService {

    /**
     * Calcular comisión para una transacción
     * @param {string|ObjectId} teacherId - ID del profesor
     * @param {string} studentSource - 'platform' | 'private_invite'
     * @returns {Object} { platformPercent, teacherPercent, reason, plan }
     */
    static async calculateCommission(teacherId, studentSource = 'platform') {
        // Obtener profesor
        const teacher = await User.findById(teacherId).select('teacherData.plan teacherData.subscriptionStatus teacherData.subscriptionExpiresAt isFoundingMember');
        
        if (!teacher) {
            throw new Error(`Profesor no encontrado: ${teacherId}`);
        }

        // Determinar plan efectivo (puede degradar si membresía expirada)
        const effectivePlan = this._getEffectivePlan(teacher);

        // Obtener tabla de comisiones desde GlobalConfig
        const config = await this._getCommissionConfig();
        const planConfig = config[effectivePlan];

        if (!planConfig) {
            // Fallback seguro si la config no existe
            console.warn(`[CommissionService] Plan "${effectivePlan}" no encontrado en config, usando free`);
            return {
                platformPercent: 25,
                teacherPercent: 75,
                reason: 'fallback_free_plan',
                plan: 'free'
            };
        }

        // Determinar comisión según origen del alumno
        if (studentSource === 'private_invite') {
            // Alumnos privados: 0% comisión plataforma (solo premium/founder)
            return {
                platformPercent: planConfig.privateStudentCommission || 0,
                teacherPercent: 100 - (planConfig.privateStudentCommission || 0),
                reason: `${effectivePlan}_private_invite`,
                plan: effectivePlan
            };
        }

        // Alumnos de plataforma: comisión según plan
        return {
            platformPercent: planConfig.platformCommission,
            teacherPercent: planConfig.teacherCommission,
            reason: `${effectivePlan}_plan_platform`,
            plan: effectivePlan
        };
    }

    /**
     * Calcular comisión de forma síncrona cuando ya se tiene el plan
     * Útil para evitar queries extra cuando ya tenemos los datos
     * @param {string} plan - 'free' | 'premium' | 'founder'
     * @param {string} studentSource - 'platform' | 'private_invite'
     * @param {Object} planConfig - Configuración del plan desde GlobalConfig
     * @returns {Object} { platformPercent, teacherPercent, reason }
     */
    static calculateCommissionSync(plan, studentSource, planConfig) {
        if (!planConfig) {
            return {
                platformPercent: 25,
                teacherPercent: 75,
                reason: 'fallback_free_plan'
            };
        }

        if (studentSource === 'private_invite') {
            const privateFee = planConfig.privateStudentCommission || 0;
            return {
                platformPercent: privateFee,
                teacherPercent: 100 - privateFee,
                reason: `${plan}_private_invite`
            };
        }

        return {
            platformPercent: planConfig.platformCommission,
            teacherPercent: planConfig.teacherCommission,
            reason: `${plan}_plan_platform`
        };
    }

    /**
     * Aplicar comisión a un monto
     * @param {number} grossAmountCents - Monto bruto en centavos
     * @param {number} platformPercent - % que retiene la plataforma
     * @returns {Object} { grossAmount, platformFee, teacherEarnings }
     */
    static applySplit(grossAmountCents, platformPercent) {
        const platformFee = Math.round(grossAmountCents * (platformPercent / 100));
        const teacherEarnings = grossAmountCents - platformFee;

        return {
            grossAmount: grossAmountCents,
            platformFee,
            teacherEarnings
        };
    }

    /**
     * Calcular y aplicar split completo en un solo paso
     * @param {string|ObjectId} teacherId
     * @param {string} studentSource
     * @param {number} grossAmountCents
     * @returns {Object} { grossAmount, platformFee, teacherEarnings, platformPercent, teacherPercent, reason, plan }
     */
    static async calculateAndApply(teacherId, studentSource, grossAmountCents) {
        const commission = await this.calculateCommission(teacherId, studentSource);
        const split = this.applySplit(grossAmountCents, commission.platformPercent);

        return {
            ...split,
            platformPercent: commission.platformPercent,
            teacherPercent: commission.teacherPercent,
            reason: commission.reason,
            plan: commission.plan
        };
    }

    // ==================== MÉTODOS PRIVADOS ====================

    /**
     * Determinar plan efectivo del profesor
     * Si la membresía premium/founder expiró → se trata como free
     */
    static _getEffectivePlan(teacher) {
        const td = teacher.teacherData || {};
        const plan = td.plan || 'free';

        // Free no requiere membresía activa
        if (plan === 'free') return 'free';

        // Founder: verificar elegibilidad con isFoundingMember
        if (plan === 'founder') {
            if (teacher.isFoundingMember) {
                const status = td.subscriptionStatus;
                if (status === 'active' || status === 'trial') return 'founder';
                // Grace period: si expiró hace menos de 7 días
                if (td.subscriptionExpiresAt) {
                    const daysSinceExpiry = (Date.now() - new Date(td.subscriptionExpiresAt).getTime()) / (1000 * 60 * 60 * 24);
                    if (daysSinceExpiry <= 7) return 'founder';
                }
            }
            // Si no es founding member o membresía expiró, tratar como free
            return 'free';
        }

        // Premium: verificar membresía activa
        if (plan === 'premium') {
            const status = td.subscriptionStatus;
            if (status === 'active' || status === 'trial') return 'premium';
            // Grace period de 7 días para premium
            if (td.subscriptionExpiresAt) {
                const daysSinceExpiry = (Date.now() - new Date(td.subscriptionExpiresAt).getTime()) / (1000 * 60 * 60 * 24);
                if (daysSinceExpiry <= 7) return 'premium';
            }
            // Membresía expirada → tratar como free
            console.warn(`[CommissionService] Profesor ${teacher._id} plan premium pero membresía ${status}. Usando free.`);
            return 'free';
        }

        return 'free';
    }

    /**
     * Obtener configuración de comisiones desde GlobalConfig
     * Cachea en memoria por 5 minutos para evitar queries repetidas
     */
    static async _getCommissionConfig() {
        const now = Date.now();
        
        // Cache de 5 minutos
        if (this._configCache && this._configCacheExpiry > now) {
            return this._configCache;
        }

        try {
            const config = await GlobalConfig.findOne({});
            const teacherPlans = config?.memberships?.teacherPlans;

            if (teacherPlans) {
                this._configCache = teacherPlans;
                this._configCacheExpiry = now + 5 * 60 * 1000;
                return teacherPlans;
            }
        } catch (error) {
            console.error('[CommissionService] Error leyendo GlobalConfig:', error.message);
        }

        // Fallback hardcodeado si no hay config
        return {
            free: { platformCommission: 25, teacherCommission: 75, privateStudentCommission: 0 },
            premium: { platformCommission: 15, teacherCommission: 85, privateStudentCommission: 0 },
            founder: { platformCommission: 15, teacherCommission: 85, privateStudentCommission: 0 }
        };
    }

    /**
     * Invalidar cache de configuración (llamar cuando admin actualice comisiones)
     */
    static invalidateCache() {
        this._configCache = null;
        this._configCacheExpiry = 0;
    }
}

module.exports = CommissionService;
