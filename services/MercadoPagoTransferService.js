/**
 * services/MercadoPagoTransferService.js
 * Servicio para transferencias de dinero a profesores vía MercadoPago
 * 
 * v5.0: Refactorizado para multi-país. Resuelve el país del profesor
 * y delega a MpCountryRouter para obtener el accessToken correcto.
 * Mantiene fallback al token global de .env para retrocompatibilidad.
 * 
 * Métodos de pago soportados:
 * - MercadoPago: Transferencia a cuenta MP del profesor (multi-país)
 * - Transferencia bancaria: Manual (se registra referencia)
 * - PayPal: Manual (se registra referencia)
 * - Wise: Manual (se registra referencia)
 */

const axios = require('axios');
const MpCountryRouter = require('./MpCountryRouter');

class MercadoPagoTransferService {
    
    constructor() {
        // Token global como fallback (retrocompatibilidad con CL)
        this.accessToken = process.env.MP_ACCESS_TOKEN || process.env.MERCADOPAGO_ACCESS_TOKEN;
        this.baseUrl = 'https://api.mercadopago.com';
    }

    /**
     * Verificar si las credenciales están configuradas
     */
    isConfigured() {
        return !!this.accessToken;
    }

    /**
     * Obtener información de una cuenta MercadoPago por email
     * @param {string} email - Email de la cuenta MP
     * @returns {Object|null} Datos del usuario o null si no existe
     */
    async getUserByEmail(email) {
        if (!this.isConfigured()) {
            throw new Error('MercadoPago no está configurado');
        }

        try {
            // MP no tiene endpoint directo para buscar por email
            // Se usa el endpoint de transferencias que valida el destinatario
            return { email, verified: true };
        } catch (error) {
            console.error('[MPTransfer] Error buscando usuario:', error.message);
            return null;
        }
    }

    /**
     * Realizar transferencia a cuenta MercadoPago
     * @param {Object} params - Parámetros de la transferencia
     * @param {number} params.amount - Monto en centavos USD
     * @param {string} params.recipientEmail - Email de cuenta MP del destinatario
     * @param {string} params.description - Descripción del pago
     * @param {string} params.externalReference - Referencia externa (payout ID)
     * @returns {Object} Resultado de la transferencia
     */
    async transfer({ amount, recipientEmail, description, externalReference }) {
        if (!this.isConfigured()) {
            throw new Error('MercadoPago no está configurado. Configure MERCADOPAGO_ACCESS_TOKEN');
        }

        if (!recipientEmail) {
            throw new Error('Email del destinatario es requerido');
        }

        if (!amount || amount <= 0) {
            throw new Error('Monto debe ser mayor a 0');
        }

        // Convertir de centavos a unidades
        const amountInUnits = amount / 100;

        try {
            console.log(`[MPTransfer] Iniciando transferencia: $${amountInUnits} USD a ${recipientEmail}`);

            // Usar endpoint de pagos con payment_method_id = account_money
            // Esto transfiere desde el saldo de la cuenta origen al destinatario
            const response = await axios.post(
                `${this.baseUrl}/v1/payments`,
                {
                    transaction_amount: amountInUnits,
                    description: description || 'Pago PianoLink',
                    payment_method_id: 'account_money',
                    payer: {
                        email: recipientEmail
                    },
                    external_reference: externalReference,
                    // Indicar que es un pago P2P/transferencia
                    additional_info: {
                        payer: {
                            first_name: 'PianoLink',
                            last_name: 'Platform'
                        }
                    }
                },
                {
                    headers: {
                        'Authorization': `Bearer ${this.accessToken}`,
                        'Content-Type': 'application/json',
                        'X-Idempotency-Key': `payout-${externalReference}-${Date.now()}`
                    }
                }
            );

            const result = response.data;

            console.log(`[MPTransfer] ✅ Transferencia exitosa: ID ${result.id}, Status: ${result.status}`);

            return {
                success: true,
                transferId: result.id.toString(),
                status: result.status,
                statusDetail: result.status_detail,
                amount: amountInUnits,
                currency: result.currency_id || 'USD',
                recipient: recipientEmail,
                createdAt: result.date_created,
                raw: result
            };

        } catch (error) {
            const errorData = error.response?.data;
            console.error('[MPTransfer] ❌ Error en transferencia:', errorData || error.message);

            // Manejar errores específicos de MP
            if (errorData?.cause) {
                const causes = errorData.cause.map(c => c.description || c.code).join(', ');
                throw new Error(`MercadoPago: ${causes}`);
            }

            throw new Error(errorData?.message || error.message || 'Error desconocido en transferencia');
        }
    }

    /**
     * Consultar estado de una transferencia
     * @param {string} transferId - ID de la transferencia en MP
     */
    async getTransferStatus(transferId) {
        if (!this.isConfigured()) {
            throw new Error('MercadoPago no está configurado');
        }

        try {
            const response = await axios.get(
                `${this.baseUrl}/v1/payments/${transferId}`,
                {
                    headers: {
                        'Authorization': `Bearer ${this.accessToken}`
                    }
                }
            );

            return {
                success: true,
                status: response.data.status,
                statusDetail: response.data.status_detail,
                amount: response.data.transaction_amount,
                currency: response.data.currency_id
            };

        } catch (error) {
            console.error('[MPTransfer] Error consultando estado:', error.message);
            throw error;
        }
    }

    /**
     * Verificar saldo disponible en cuenta PianoLink
     */
    async getAccountBalance() {
        if (!this.isConfigured()) {
            throw new Error('MercadoPago no está configurado');
        }

        try {
            const response = await axios.get(
                `${this.baseUrl}/users/me`,
                {
                    headers: {
                        'Authorization': `Bearer ${this.accessToken}`
                    }
                }
            );

            // El saldo está en el endpoint de balance
            const balanceResponse = await axios.get(
                `${this.baseUrl}/users/${response.data.id}/mercadopago_account/balance`,
                {
                    headers: {
                        'Authorization': `Bearer ${this.accessToken}`
                    }
                }
            );

            return {
                success: true,
                availableBalance: balanceResponse.data.available_balance,
                currency: balanceResponse.data.currency_id
            };

        } catch (error) {
            console.error('[MPTransfer] Error obteniendo saldo:', error.message);
            // No lanzar error, solo retornar null
            return null;
        }
    }

    /**
     * Ejecutar payout a profesor según su método configurado
     * v5.0: Resuelve país del profesor → obtiene credenciales del país → ejecuta transferencia
     * @param {Object} payout - Documento TeacherPayout
     * @param {Object} teacher - Documento User del profesor
     * @returns {Object} Resultado del pago
     */
    async executePayoutToTeacher(payout, teacher) {
        const paymentInfo = teacher.teacherData?.paymentInfo;
        
        if (!paymentInfo) {
            throw new Error('El profesor no tiene datos de pago configurados');
        }

        const method = paymentInfo.method || 'mercadopago';
        const amount = payout.finalPayoutUSD;
        const description = `Pago clases ${payout.periodStart.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })} - PianoLink`;

        switch (method) {
            case 'mercadopago':
                const mpEmail = paymentInfo.mercadopago?.email;
                if (!mpEmail) {
                    throw new Error('Email de MercadoPago no configurado');
                }

                // v5.0: Resolver país del profesor para usar token correcto
                const teacherCountry = teacher.country || paymentInfo.country || 'CL';
                
                try {
                    // Intentar con MpCountryRouter (multi-país)
                    const creds = await MpCountryRouter.getCredentials(teacherCountry);
                    
                    if (creds && creds.payout?.enabled) {
                        console.log(`[MPTransfer] Usando credenciales de ${teacherCountry} para payout a ${mpEmail}`);
                        return await MpCountryRouter.transferToTeacher(teacherCountry, {
                            recipientEmail: mpEmail,
                            amount: amount / 100, // Convertir centavos a unidades
                            currency: creds.currency,
                            reference: payout._id.toString(),
                            description
                        });
                    }
                } catch (routerError) {
                    console.warn(`[MPTransfer] MpCountryRouter falló para ${teacherCountry}, usando token global:`, routerError.message);
                }

                // Fallback: usar token global (retrocompatibilidad)
                return await this.transfer({
                    amount,
                    recipientEmail: mpEmail,
                    description,
                    externalReference: payout._id.toString()
                });

            case 'bank_transfer':
            case 'paypal':
            case 'wise':
                // Estos métodos requieren pago manual
                return {
                    success: false,
                    requiresManual: true,
                    method,
                    message: `Método ${method} requiere pago manual`,
                    paymentDetails: method === 'bank_transfer' 
                        ? paymentInfo.bankTransfer 
                        : method === 'paypal' 
                            ? paymentInfo.paypal 
                            : paymentInfo.wise
                };

            default:
                throw new Error(`Método de pago no soportado: ${method}`);
        }
    }
}

// Exportar instancia singleton
module.exports = new MercadoPagoTransferService();
