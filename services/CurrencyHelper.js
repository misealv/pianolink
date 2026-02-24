/**
 * services/CurrencyHelper.js
 * Sprint 2 — Tarea 2.5
 * 
 * Helper centralizado para conversiones monetarias.
 * 
 * CONVENCIÓN DE UNIDADES EN PIANOLINK:
 * ┌────────────────────────────┬──────────┬─────────────────────────────────┐
 * │ Campo                      │ Unidad   │ Ejemplo                         │
 * ├────────────────────────────┼──────────┼─────────────────────────────────┤
 * │ User.teacherData.hourlyRate│ DÓLARES  │ 25 = $25.00 USD                 │
 * │ User.teacherData.trialPrice│ CENTAVOS │ 1500 = $15.00 USD               │
 * │ Booking.payment.amountCents│ CENTAVOS │ 2500 = $25.00 USD               │
 * │ ClassSession.pricing.*     │ CENTAVOS │ 2500 = $25.00 USD               │
 * │ StudentSubscription.*USD   │ CENTAVOS │ 10000 = $100.00 USD             │
 * │ TeacherPackage.priceUSD    │ CENTAVOS │ 10000 = $100.00 USD             │
 * │ StudentEnrollment.frozenRate│ DÓLARES │ 25 = $25.00 USD                 │
 * │ GlobalConfig.minHourlyRate │ DÓLARES  │ 15 = $15.00 USD                 │
 * └────────────────────────────┴──────────┴─────────────────────────────────┘
 * 
 * USO:
 *   const { rateToCents, centsToDollars, dollarsToCents, formatUSD } = require('./CurrencyHelper');
 *   
 *   // Convertir hourlyRate (USD) a centavos para cálculos
 *   const priceCents = rateToCents(teacher.teacherData.hourlyRate);
 *   
 *   // Mostrar centavos como dólares
 *   const display = formatUSD(1500); // "$15.00"
 */

class CurrencyHelper {

    /**
     * Convierte dólares a centavos.
     * Usa Math.round para evitar errores de punto flotante.
     * 
     * @param {number} dollars - Cantidad en dólares (ej: 25.50)
     * @returns {number} Cantidad en centavos (ej: 2550)
     * 
     * @example
     * dollarsToCents(25)    // 2500
     * dollarsToCents(15.50) // 1550
     * dollarsToCents(0)     // 0
     */
    static dollarsToCents(dollars) {
        if (typeof dollars !== 'number' || isNaN(dollars)) {
            console.warn(`[CurrencyHelper] dollarsToCents recibió valor inválido: ${dollars}`);
            return 0;
        }
        return Math.round(dollars * 100);
    }

    /**
     * Convierte centavos a dólares.
     * 
     * @param {number} cents - Cantidad en centavos (ej: 2500)
     * @returns {number} Cantidad en dólares (ej: 25.00)
     * 
     * @example
     * centsToDollars(2500) // 25
     * centsToDollars(1550) // 15.5
     */
    static centsToDollars(cents) {
        if (typeof cents !== 'number' || isNaN(cents)) {
            console.warn(`[CurrencyHelper] centsToDollars recibió valor inválido: ${cents}`);
            return 0;
        }
        return cents / 100;
    }

    /**
     * Convierte la tarifa por hora del profesor (en USD) a centavos.
     * Alias semántico de dollarsToCents, para mayor claridad en contexto de tarifas.
     * 
     * @param {number} hourlyRate - Tarifa en dólares (ej: 25)
     * @returns {number} Tarifa en centavos (ej: 2500)
     * 
     * @example
     * // En User.js, hourlyRate es 25 (dólares)
     * rateToCents(teacher.teacherData.hourlyRate) // 2500
     */
    static rateToCents(hourlyRate) {
        return this.dollarsToCents(hourlyRate);
    }

    /**
     * Calcula el precio que paga el estudiante a partir de la tarifa del profesor.
     * Aplica la comisión de la plataforma.
     * 
     * @param {number} hourlyRate - Tarifa del profesor en DÓLARES
     * @param {number} teacherPercent - Porcentaje que se queda el profesor (ej: 75, 80, 85)
     * @returns {number} Precio para el estudiante en CENTAVOS
     * 
     * @example
     * // Profesor cobra $25/hr con 75% (plan free)
     * studentPriceCents(25, 75) // 3333 ($33.33)
     * // Profesor cobra $25/hr con 85% (plan founder)
     * studentPriceCents(25, 85) // 2941 ($29.41)
     */
    static studentPriceCents(hourlyRate, teacherPercent) {
        if (!hourlyRate || !teacherPercent) return 0;
        // Precio estudiante = tarifa profesor / (teacherPercent/100)
        // Ej: $25 / 0.75 = $33.33 → 3333 centavos
        return Math.round((hourlyRate / (teacherPercent / 100)) * 100);
    }

    /**
     * Formatea centavos como string de dólares para display.
     * 
     * @param {number} cents - Cantidad en centavos
     * @param {string} [locale='en-US'] - Locale para formateo
     * @returns {string} Cantidad formateada (ej: "$25.00")
     * 
     * @example
     * formatUSD(2500)  // "$25.00"
     * formatUSD(1550)  // "$15.50"
     * formatUSD(0)     // "$0.00"
     */
    static formatUSD(cents, locale = 'en-US') {
        const dollars = this.centsToDollars(cents);
        return new Intl.NumberFormat(locale, {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 2
        }).format(dollars);
    }

    /**
     * Verifica si un valor parece estar en centavos cuando debería ser dólares, o viceversa.
     * Útil para detectar errores de unidad en runtime.
     * 
     * @param {number} value - Valor a verificar
     * @param {'dollars'|'cents'} expectedUnit - Unidad esperada
     * @returns {{ ok: boolean, warning?: string }}
     * 
     * @example
     * // hourlyRate debería ser en dólares (15-200 rango normal)
     * validateUnit(2500, 'dollars') // { ok: false, warning: '2500 parece estar en centavos...' }
     * validateUnit(25, 'dollars')   // { ok: true }
     */
    static validateUnit(value, expectedUnit) {
        if (typeof value !== 'number' || isNaN(value)) {
            return { ok: false, warning: `Valor inválido: ${value}` };
        }

        if (expectedUnit === 'dollars') {
            // Para hourlyRate: rango normal $15-$200
            if (value > 500) {
                return { 
                    ok: false, 
                    warning: `${value} parece estar en centavos (no dólares). ¿Debería ser ${value / 100}?` 
                };
            }
        }

        if (expectedUnit === 'cents') {
            // Para trialPrice: rango normal 500-20000 centavos ($5-$200)
            if (value > 0 && value < 5) {
                return { 
                    ok: false, 
                    warning: `${value} parece estar en dólares (no centavos). ¿Debería ser ${value * 100}?` 
                };
            }
        }

        return { ok: true };
    }
}

module.exports = CurrencyHelper;
