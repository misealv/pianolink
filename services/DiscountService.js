/**
 * services/DiscountService.js
 * 
 * Servicio centralizado para gestionar cupones y descuentos.
 * Usado por todos los checkouts para aplicar descuentos automáticamente.
 * 
 * Flujo:
 *   1. Lead se registra en waitlist → createWaitlistCoupon(email)
 *   2. Lead compra algo → getApplicableDiscount(email, purchaseType)
 *   3. Checkout aplica el descuento al precio
 *   4. Después del pago → recordUsage(couponId, paymentId, ...)
 */

const Coupon = require('../models/Coupon');

class DiscountService {

    /**
     * Crear cupón automático de waitlist (15% x 3 compras).
     * Si ya existe uno activo para este email, no duplica.
     * 
     * @param {string} email - Email del lead
     * @returns {Object} - { created: boolean, coupon: Coupon }
     */
    static async createWaitlistCoupon(email) {
        if (!email) return { created: false, reason: 'Email vacío' };

        const normalizedEmail = email.toLowerCase().trim();

        // Verificar si ya existe un cupón waitlist activo para este email
        const existing = await Coupon.findOne({
            assignedToEmail: normalizedEmail,
            source: 'waitlist',
            isActive: true
        });

        if (existing) {
            console.log(`[DiscountService] Cupón waitlist ya existe para ${normalizedEmail}: ${existing.code}`);
            return { created: false, reason: 'Ya tiene cupón waitlist', coupon: existing };
        }

        // Generar código único
        let code;
        let attempts = 0;
        do {
            code = Coupon.generateCode('WL');
            const dup = await Coupon.findByCode(code);
            if (!dup) break;
            attempts++;
        } while (attempts < 5);

        // Crear cupón: 15% en 3 compras, aplica a todo, 6 meses de vigencia
        const expiresAt = new Date();
        expiresAt.setMonth(expiresAt.getMonth() + 6);

        const coupon = await Coupon.create({
            code,
            discountType: 'percentage',
            discountValue: 15,
            description: `Descuento waitlist automático para ${normalizedEmail}`,
            applicableTo: ['class_payment', 'kit_purchase', 'membership', 'early_bird_kit'],
            maxUses: 3,
            usesRemaining: 3,
            assignedToEmail: normalizedEmail,
            source: 'waitlist',
            isActive: true,
            expiresAt
        });

        console.log(`[DiscountService] ✅ Cupón waitlist creado: ${code} → ${normalizedEmail} (15% x 3, exp: ${expiresAt.toISOString().split('T')[0]})`);

        return { created: true, coupon };
    }

    /**
     * Buscar descuento aplicable para un email o userId + tipo de compra.
     * Devuelve null si no hay descuento disponible.
     * 
     * @param {Object} params
     * @param {string} [params.email] - Email del comprador
     * @param {string} [params.userId] - ID del usuario (si está autenticado)
     * @param {string} params.purchaseType - Tipo: class_payment, kit_purchase, membership, early_bird_kit
     * @param {number} params.amountCents - Monto original en centavos USD
     * @returns {Object|null} - { coupon, discountCents, finalAmountCents, discountPercent, couponCode }
     */
    static async getApplicableDiscount({ email, userId, purchaseType, amountCents }) {
        if (!amountCents || amountCents <= 0) return null;

        let coupon = null;

        // Buscar primero por userId, luego por email
        if (userId) {
            coupon = await Coupon.findActiveByUserId(userId, purchaseType);
        }
        if (!coupon && email) {
            coupon = await Coupon.findActiveByEmail(email, purchaseType);
        }

        if (!coupon) return null;

        // Validar cupón
        const validation = coupon.isValid(purchaseType, amountCents);
        if (!validation.valid) {
            console.log(`[DiscountService] Cupón ${coupon.code} no válido: ${validation.reason}`);
            return null;
        }

        // Calcular descuento
        const discountCents = coupon.calculateDiscount(amountCents);
        const finalAmountCents = amountCents - discountCents;

        return {
            coupon,
            couponCode: coupon.code,
            couponId: coupon._id,
            discountPercent: coupon.discountType === 'percentage' ? coupon.discountValue : null,
            discountCents,
            finalAmountCents,
            originalAmountCents: amountCents,
            usesRemaining: coupon.usesRemaining
        };
    }

    /**
     * Registrar uso del cupón después de un pago exitoso.
     * 
     * @param {string} couponId - ID del cupón
     * @param {string} paymentId - ID del Payment registrado
     * @param {string} purchaseType - Tipo de compra
     * @param {number} originalAmountCents - Monto original
     * @param {number} finalAmountCents - Monto final cobrado
     */
    static async recordUsage(couponId, paymentId, purchaseType, originalAmountCents, finalAmountCents) {
        if (!couponId) return;

        try {
            const coupon = await Coupon.findById(couponId);
            if (!coupon) {
                console.warn(`[DiscountService] Cupón ${couponId} no encontrado al registrar uso`);
                return;
            }

            await coupon.recordUsage(paymentId, purchaseType, originalAmountCents, finalAmountCents);
            console.log(`[DiscountService] ✅ Uso registrado: ${coupon.code} (quedan ${coupon.usesRemaining} usos)`);
        } catch (err) {
            // No fallar el flujo de pago por un error de cupón
            console.error(`[DiscountService] Error registrando uso del cupón ${couponId}:`, err.message);
        }
    }

    /**
     * Vincular un cupón de email a un userId (cuando el lead crea cuenta).
     * 
     * @param {string} email
     * @param {string} userId
     */
    static async linkCouponToUser(email, userId) {
        if (!email || !userId) return;

        try {
            const result = await Coupon.updateMany(
                { assignedToEmail: email.toLowerCase().trim(), isActive: true },
                { $set: { assignedToUserId: userId } }
            );

            if (result.modifiedCount > 0) {
                console.log(`[DiscountService] ${result.modifiedCount} cupón(es) vinculados a userId ${userId}`);
            }
        } catch (err) {
            console.error(`[DiscountService] Error vinculando cupones:`, err.message);
        }
    }

    /**
     * Obtener resumen de cupones para un email (API admin / CRM).
     * 
     * @param {string} email
     * @returns {Array}
     */
    static async getCouponsForEmail(email) {
        return Coupon.find({ assignedToEmail: email.toLowerCase().trim() })
            .sort({ createdAt: -1 });
    }

    /**
     * Helper: Convertir dólares a centavos
     */
    static dollarsToCents(dollars) {
        return Math.round(dollars * 100);
    }

    /**
     * Helper: Convertir centavos a dólares
     */
    static centsToDollars(cents) {
        return cents / 100;
    }
}

module.exports = DiscountService;
