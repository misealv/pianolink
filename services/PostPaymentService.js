/**
 * services/PostPaymentService.js
 * 
 * Servicio unificado de post-pago.
 * Se invoca desde CUALQUIER checkout (Early Bird, Kit V2, Stripe, MP, PayPal)
 * después de confirmar el pago.
 * 
 * Responsabilidades:
 *   1. Crear o actualizar el User
 *   2. Generar magic link (si es usuario nuevo)
 *   3. Enviar email de bienvenida con magic link
 *   4. Devolver datos del usuario + magic link URL
 * 
 * Uso:
 *   const PostPaymentService = require('../services/PostPaymentService');
 *   const result = await PostPaymentService.processSuccessfulPayment({
 *       email: 'user@example.com',
 *       name: 'Juan Pérez',
 *       whatsapp: '+569...',
 *       country: 'CL',
 *       studentType: 'self',        // 'self' o 'child'
 *       beneficiaries: [],           // [{name, age}] si studentType === 'child'
 *       paymentProvider: 'mercadopago', // 'stripe', 'paypal', 'mercadopago'
 *       paymentId: '12345',          // ID externo del pago
 *       amount: 14,                  // Monto pagado (en la unidad mostrada, ej: 14 USD)
 *       currency: 'USD',
 *       kitType: 'welcome_kit_v2',
 *       source: 'early_bird',        // Para logs/metadata (no afecta User.studentData.source)
 *   });
 */

const crypto = require('crypto');
const User = require('../models/User');
const GlobalConfig = require('../models/GlobalConfig');
const EmailService = require('./EmailService');
const { generateWelcomeKitEmail } = require('../templates/welcomeKitEmail');

// Duración del magic link: 7 días
const MAGIC_LINK_DAYS = 7;

class PostPaymentService {

    /**
     * Procesa un pago exitoso: crea/actualiza usuario, genera magic link, envía email.
     * 
     * @param {Object} opts
     * @param {string} opts.email           - Email del comprador (requerido)
     * @param {string} [opts.name]          - Nombre completo
     * @param {string} [opts.whatsapp]      - WhatsApp del comprador
     * @param {string} [opts.country]       - Código de país (ej: 'CL')
     * @param {string} [opts.studentType]   - 'self' o 'child' (default: 'self')
     * @param {Array}  [opts.beneficiaries] - [{name, age}] si studentType === 'child'
     * @param {string} [opts.paymentProvider] - 'stripe', 'paypal', 'mercadopago'
     * @param {string} [opts.paymentId]     - ID externo del pago
     * @param {number} [opts.amount]        - Monto pagado
     * @param {string} [opts.currency]      - Moneda (default: 'USD')
     * @param {string} [opts.kitType]       - Tipo de kit (default: 'welcome_kit_v2')
     * @param {string} [opts.source]        - Origen del checkout (para logs, no para schema)
     * @returns {Object} { success, user, isNewUser, magicLinkUrl }
     */
    static async processSuccessfulPayment(opts) {
        const {
            email,
            name: rawName,
            whatsapp = '',
            country = 'CL',
            studentType = 'self',
            beneficiaries = [],
            paymentProvider = 'unknown',
            paymentId = '',
            amount,
            currency = 'USD',
            kitType = 'welcome_kit_v2',
            source = 'checkout'
        } = opts;

        if (!email) {
            console.error('[PostPayment] ❌ Email requerido');
            return { success: false, error: 'Email requerido' };
        }

        const cleanEmail = email.toLowerCase().trim();
        // Nombre: priorizar parámetro, fallback a parte antes del @
        const name = rawName || cleanEmail.split('@')[0];

        console.log(`[PostPayment] 🎯 Procesando pago exitoso — ${cleanEmail} (${source}/${paymentProvider})`);

        try {
            let user = await User.findOne({ email: cleanEmail });
            let isNewUser = false;
            let magicLinkToken = null;
            let magicLinkUrl = null;

            // === Datos del admin para el email ===
            const adminData = await this._getAdminEmailData();
            const frontendUrl = process.env.FRONTEND_URL || process.env.APP_URL || 'https://pianolink.net';

            if (!user) {
                // ============================
                // USUARIO NUEVO — crear cuenta
                // ============================
                isNewUser = true;
                magicLinkToken = crypto.randomBytes(32).toString('hex');
                const magicLinkExpires = new Date(Date.now() + MAGIC_LINK_DAYS * 24 * 60 * 60 * 1000);
                const tempPassword = crypto.randomBytes(16).toString('hex');

                // Separar nombre/apellido
                const nameParts = name.trim().split(/\s+/);
                const firstName = nameParts[0] || name;
                const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';

                const isGuardian = studentType === 'child' && beneficiaries.length > 0;

                // Todos los compradores son role 'client' (para que admin pueda editarlos/eliminarlos)
                const userData = {
                    name: firstName,
                    lastName,
                    email: cleanEmail,
                    password: tempPassword,
                    whatsapp: whatsapp || '',
                    country: country || 'CL',
                    role: 'client',
                    kitPurchased: true,
                    kitPurchaseDate: new Date(),
                    magicLinkToken,
                    magicLinkExpires,
                    mustChangePassword: true
                };

                // Datos específicos según tipo
                if (isGuardian) {
                    userData.clientData = {
                        accountType: 'guardian',
                        managedStudents: beneficiaries
                            .filter(b => b.name)
                            .map(b => ({
                                name: b.name,
                                age: b.age || null,
                                classesRemaining: 1,
                                classesUsed: 0
                            }))
                    };
                } else {
                    userData.clientData = {
                        accountType: 'individual',
                        managedStudents: []
                    };
                    userData.classesRemaining = 1;
                    userData.classesCompleted = 0;
                    userData.studentData = {
                        source: 'platform',
                        level: 'beginner'
                    };
                }

                // Referencia al pago según proveedor
                if (paymentProvider === 'stripe') {
                    userData.stripeSessionId = paymentId;
                } else if (paymentProvider === 'paypal') {
                    userData.paypalOrderId = paymentId;
                }

                user = await User.create(userData);
                magicLinkUrl = `${frontendUrl}/acceso/${magicLinkToken}`;

                console.log(`[PostPayment] ✅ Cliente ${isGuardian ? 'guardian' : 'individual'} creado: ${user.email}`);
                if (isGuardian) {
                    const students = userData.clientData.managedStudents;
                    students.forEach(s => console.log(`[PostPayment]    👶 ${s.name}`));
                }

            } else {
                // ================================
                // USUARIO EXISTENTE — actualizar
                // ================================
                user.kitPurchased = true;
                user.kitPurchaseDate = new Date();

                // Si es guardian con nuevos beneficiarios, agregarlos
                if (studentType === 'child' && beneficiaries.length > 0) {
                    user.clientData = user.clientData || { accountType: 'guardian', managedStudents: [] };
                    user.clientData.accountType = 'guardian';
                    user.clientData.managedStudents = user.clientData.managedStudents || [];

                    for (const b of beneficiaries) {
                        if (!b.name) continue;
                        const exists = user.clientData.managedStudents.some(
                            s => s.name.toLowerCase() === b.name.toLowerCase()
                        );
                        if (!exists) {
                            user.clientData.managedStudents.push({
                                name: b.name,
                                age: b.age || null,
                                classesRemaining: 1,
                                classesUsed: 0
                            });
                        }
                    }
                    user.markModified('clientData');
                }

                await user.save();
                console.log(`[PostPayment] ✅ Usuario existente actualizado: ${user.email}`);
            }

            // === ENVIAR EMAIL ===
            await this._sendPostPaymentEmail({
                user,
                isNewUser,
                magicLinkUrl,
                students: user.clientData?.managedStudents || [],
                kitType,
                amount,
                currency,
                paymentId,
                adminData
            });

            return {
                success: true,
                user: {
                    id: user._id,
                    email: user.email,
                    name: user.name,
                    role: user.role
                },
                isNewUser,
                magicLinkUrl
            };

        } catch (error) {
            console.error(`[PostPayment] ❌ Error procesando pago para ${cleanEmail}:`, error.message, error.stack);
            return { success: false, error: error.message };
        }
    }

    /**
     * Envía email de bienvenida (usuario nuevo) o confirmación (usuario existente).
     * @private
     */
    static async _sendPostPaymentEmail({ user, isNewUser, magicLinkUrl, students, kitType, amount, currency, paymentId, adminData }) {
        try {
            const emailHtml = generateWelcomeKitEmail({
                clientName: user.name,
                clientEmail: user.email,
                magicLinkUrl: isNewUser ? magicLinkUrl : null,
                students: students || [],
                kitType: kitType || 'welcome_kit_v2',
                totalPaid: amount,
                currency: currency || 'USD',
                orderId: paymentId ? String(paymentId) : null,
                ...adminData
            });

            const subject = isNewUser
                ? '🎹 ¡Bienvenido a PianoLink! Activa tu cuenta'
                : '🎹 ¡Compra confirmada! Tu kit de PianoLink está listo';

            await EmailService.sendSafe({
                to: user.email,
                subject,
                html: emailHtml
            });

            console.log(`[PostPayment] 📧 Email ${isNewUser ? 'de bienvenida' : 'de confirmación'} enviado a: ${user.email}`);
        } catch (emailError) {
            // Fire-and-forget: no bloquear el flujo por un error de email
            console.error('[PostPayment] ⚠️ Error enviando email:', emailError.message);
        }
    }

    /**
     * Obtiene datos del admin desde GlobalConfig (whatsapp, nombre, email).
     * @private
     */
    static async _getAdminEmailData() {
        try {
            const profile = await GlobalConfig.getAdminProfile();
            return {
                adminName: profile.name || 'Equipo PianoLink',
                adminEmail: profile.email || 'hola@pianolink.net',
                whatsappNumber: profile.whatsapp || '+56959089770',
                adminWhatsapp: profile.whatsapp || '+56959089770'
            };
        } catch (err) {
            return {
                adminName: 'Equipo PianoLink',
                adminEmail: 'hola@pianolink.net',
                whatsappNumber: '+56959089770',
                adminWhatsapp: '+56959089770'
            };
        }
    }
}

module.exports = PostPaymentService;
