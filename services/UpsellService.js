/**
 * services/UpsellService.js
 * 
 * Lógica de upsell automático para profesores free.
 * Cuando un profesor free acumula >= 5 alumnos de plataforma,
 * se dispara una notificación mostrando cuánto ha pagado en comisiones
 * y cuánto ahorraría con Premium.
 * 
 * Fase 4 — v5.0
 */

const User = require('../models/User');
const StudentEnrollment = require('../models/StudentEnrollment');
const GlobalConfig = require('../models/GlobalConfig');
const CommissionService = require('./CommissionService');

// Umbral mínimo de alumnos para disparar upsell
const UPSELL_THRESHOLD = 5;

class UpsellService {

    /**
     * Verifica si un profesor free es elegible para upsell.
     * @param {string} teacherId - ID del profesor
     * @returns {Object} { eligible, data }
     */
    static async checkEligibility(teacherId) {
        try {
            const teacher = await User.findById(teacherId);
            if (!teacher || teacher.role !== 'teacher') {
                return { eligible: false, reason: 'not_teacher' };
            }

            const plan = teacher.teacherData?.plan || 'free';
            if (plan !== 'free') {
                return { eligible: false, reason: 'already_paid_plan' };
            }

            // Contar alumnos de plataforma activos
            const platformStudents = await StudentEnrollment.countDocuments({
                teacher: teacherId,
                source: { $ne: 'private_invite' },
                status: { $in: ['active', 'confirmed'] }
            });

            if (platformStudents < UPSELL_THRESHOLD) {
                return { eligible: false, reason: 'below_threshold', studentCount: platformStudents };
            }

            // Calcular comisiones pagadas y ahorro potencial
            const savingsData = await this._calculateSavings(teacherId, teacher);

            return {
                eligible: true,
                data: {
                    studentCount: platformStudents,
                    totalCommissionsPaid: savingsData.totalPaid,
                    monthlySavings: savingsData.monthlySavings,
                    annualSavings: savingsData.annualSavings,
                    membershipCost: savingsData.membershipCost,
                    netSavings: savingsData.netSavings
                }
            };
        } catch (error) {
            console.error('[UpsellService] Error checkEligibility:', error);
            return { eligible: false, reason: 'error' };
        }
    }

    /**
     * Calcula cuánto ha pagado un profesor en comisiones y cuánto ahorraría.
     * @param {string} teacherId
     * @param {Object} teacher - Documento del profesor
     * @returns {Object} Datos de ahorro
     */
    static async _calculateSavings(teacherId, teacher) {
        try {
            const config = await GlobalConfig.findOne();
            const plans = config?.memberships?.teacherPlans || {};

            const freeCommission = plans.free?.platformCommission || 25;
            const premiumCommission = plans.premium?.platformCommission || 15;
            const premiumPrice = (plans.premium?.price || 1900) / 100; // USD

            // Buscar pagos/sesiones del profesor para calcular ingresos
            const enrollments = await StudentEnrollment.find({
                teacher: teacherId,
                source: { $ne: 'private_invite' }
            }).select('purchaseHistory');

            // Sumar ingresos brutos de todas las compras
            let totalRevenue = 0;
            let monthlyRevenue = 0;
            const now = new Date();
            const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

            for (const enrollment of enrollments) {
                if (enrollment.purchaseHistory) {
                    for (const purchase of enrollment.purchaseHistory) {
                        const amount = (purchase.amountPaid || 0) / 100; // centavos → USD
                        totalRevenue += amount;
                        if (purchase.purchasedAt && new Date(purchase.purchasedAt) >= thirtyDaysAgo) {
                            monthlyRevenue += amount;
                        }
                    }
                }
            }

            // Comisiones pagadas con plan free (25%)
            const totalPaid = Math.round(totalRevenue * (freeCommission / 100) * 100) / 100;

            // Comisiones que pagaría con premium (15%)
            const wouldPayPremium = Math.round(totalRevenue * (premiumCommission / 100) * 100) / 100;

            // Ahorro por comisiones (mensual estimado)
            const monthlyCommissionFree = Math.round(monthlyRevenue * (freeCommission / 100) * 100) / 100;
            const monthlyCommissionPremium = Math.round(monthlyRevenue * (premiumCommission / 100) * 100) / 100;
            const monthlySavings = Math.round((monthlyCommissionFree - monthlyCommissionPremium) * 100) / 100;

            // Ahorro neto = ahorro comisiones - costo membresía
            const netSavings = Math.round((monthlySavings - premiumPrice) * 100) / 100;

            return {
                totalPaid,
                monthlySavings,
                annualSavings: Math.round(monthlySavings * 12 * 100) / 100,
                membershipCost: premiumPrice,
                netSavings
            };
        } catch (error) {
            console.error('[UpsellService] Error _calculateSavings:', error);
            return {
                totalPaid: 0,
                monthlySavings: 0,
                annualSavings: 0,
                membershipCost: 19,
                netSavings: 0
            };
        }
    }

    /**
     * Obtiene datos de ahorro para la calculadora de la página de pricing.
     * @param {string} teacherId
     * @returns {Object} Datos para mostrar en la calculadora
     */
    static async getSavingsForPricing(teacherId) {
        try {
            const teacher = await User.findById(teacherId);
            if (!teacher) return null;

            const plan = teacher.teacherData?.plan || 'free';
            const savings = await this._calculateSavings(teacherId, teacher);

            return {
                currentPlan: plan,
                ...savings,
                // Mensaje contextual
                message: savings.netSavings > 0
                    ? `Con Premium ahorrarías $${savings.netSavings.toFixed(2)} USD/mes neto`
                    : plan === 'free'
                        ? 'Sigue creciendo — Premium se paga solo cuando facturas más de $190 USD/mes'
                        : null
            };
        } catch (error) {
            console.error('[UpsellService] Error getSavingsForPricing:', error);
            return null;
        }
    }

    /**
     * Registra evento de upsell en el sistema (para CRM/analytics).
     * @param {string} teacherId
     * @param {string} triggerType - 'auto_5_students' | 'pricing_page' | 'dashboard_banner'
     */
    static async logUpsellEvent(teacherId, triggerType) {
        try {
            // Registrar en teacherData para no repetir notificaciones
            await User.findByIdAndUpdate(teacherId, {
                $push: {
                    'teacherData.upsellEvents': {
                        type: triggerType,
                        timestamp: new Date()
                    }
                },
                $set: {
                    'teacherData.lastUpsellShown': new Date()
                }
            });
        } catch (error) {
            console.error('[UpsellService] Error logUpsellEvent:', error);
        }
    }

    /**
     * Verifica si se debe mostrar notificación de upsell (no más de 1 cada 7 días).
     * @param {string} teacherId
     * @returns {boolean}
     */
    static async shouldShowUpsell(teacherId) {
        try {
            const teacher = await User.findById(teacherId).select('teacherData.lastUpsellShown teacherData.plan');
            if (!teacher) return false;
            if ((teacher.teacherData?.plan || 'free') !== 'free') return false;

            const lastShown = teacher.teacherData?.lastUpsellShown;
            if (!lastShown) return true;

            const daysSinceLastShown = (Date.now() - new Date(lastShown)) / (1000 * 60 * 60 * 24);
            return daysSinceLastShown >= 7;
        } catch (error) {
            return false;
        }
    }
}

module.exports = UpsellService;
