/* services/EmailService.js - Servicio de Envío de Correos con Resend */

const { Resend } = require('resend');

/**
 * EmailService - Servicio robusto para envío de correos electrónicos
 * 
 * CARACTERÍSTICAS:
 * - Integración con Resend API
 * - Manejo robusto de errores
 * - Sistema de reintentos automáticos
 * - Logging detallado
 * - Validación de configuración
 * - Modo de prueba (evita envíos reales en desarrollo)
 * 
 * CONFIGURACIÓN REQUERIDA (.env):
 * - RESEND_API_KEY: Tu API key de Resend (https://resend.com/api-keys)
 * - EMAIL_FROM: Email del remitente (debe estar verificado en Resend)
 * - EMAIL_FROM_NAME: Nombre del remitente (ej. "PianoLink Team")
 * - NODE_ENV: 'production' para envíos reales, 'development' para simulación
 */

class EmailService {
    constructor() {
        this.resend = null;
        this.config = {
            apiKey: process.env.RESEND_API_KEY,
            from: process.env.EMAIL_FROM || 'onboarding@resend.dev', // Email por defecto de Resend
            fromName: process.env.EMAIL_FROM_NAME || 'PianoLink',
            maxRetries: 3,
            retryDelay: 2000, // 2 segundos
            isDevelopment: process.env.NODE_ENV !== 'production'
        };
        
        this._initialize();
    }
    
    /**
     * Inicializa el cliente de Resend
     * @private
     */
    _initialize() {
        if (!this.config.apiKey) {
            console.warn(
                '[EMAIL] ⚠️  RESEND_API_KEY no configurado. ' +
                'Emails no se enviarán. Agrega la variable en .env'
            );
            return;
        }
        
        try {
            this.resend = new Resend(this.config.apiKey);
            console.log('[EMAIL] ✅ Servicio de email inicializado correctamente');
        } catch (error) {
            console.error('[EMAIL] ❌ Error al inicializar Resend:', error.message);
        }
    }
    
    /**
     * Envía un email con reintentos automáticos
     * @param {Object} emailData - Datos del email
     * @param {string} emailData.to - Email del destinatario
     * @param {string} emailData.subject - Asunto del email
     * @param {string} emailData.html - Contenido HTML del email
     * @param {string} [emailData.text] - Versión en texto plano (opcional)
     * @param {number} [retryCount=0] - Contador de reintentos (uso interno)
     * @returns {Promise<Object>} - Resultado del envío
     */
    async send(emailData, retryCount = 0) {
        const { to, subject, html, text } = emailData;
        
        // Validación de datos
        if (!to || !subject || !html) {
            throw new Error('Faltan datos requeridos: to, subject y html son obligatorios');
        }
        
        // Modo desarrollo: simular envío sin consumir API
        if (this.config.isDevelopment) {
            console.log(`[EMAIL] 📧 [SIMULADO] Email a: ${to}`);
            console.log(`[EMAIL] 📧 Asunto: ${subject}`);
            console.log(`[EMAIL] 📧 HTML length: ${html.length} caracteres`);
            return {
                success: true,
                mode: 'simulated',
                id: `dev-${Date.now()}`,
                to,
                subject
            };
        }
        
        // Validar que Resend esté configurado
        if (!this.resend) {
            throw new Error('Resend no está configurado. Verifica RESEND_API_KEY en .env');
        }
        
        try {
            console.log(`[EMAIL] 📤 Enviando email a: ${to} | Asunto: ${subject}`);
            
            const response = await this.resend.emails.send({
                from: `${this.config.fromName} <${this.config.from}>`,
                to: [to],
                subject: subject,
                html: html,
                text: text || this._stripHtml(html), // Fallback: generar texto desde HTML
                headers: {
                    'List-Unsubscribe': '<mailto:hola@pianolink.net?subject=unsubscribe>',
                    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
                }
            });
            
            console.log(`[EMAIL] ✅ Email enviado exitosamente. ID: ${response.data?.id}`);
            
            return {
                success: true,
                id: response.data?.id,
                to,
                subject
            };
            
        } catch (error) {
            console.error(`[EMAIL] ❌ Error al enviar email (intento ${retryCount + 1}):`, error.message);
            
            // Sistema de reintentos
            if (retryCount < this.config.maxRetries) {
                console.log(`[EMAIL] 🔄 Reintentando en ${this.config.retryDelay / 1000}s...`);
                
                await this._sleep(this.config.retryDelay);
                return this.send(emailData, retryCount + 1);
            }
            
            // Si agotamos los reintentos, lanzar error
            throw new Error(
                `No se pudo enviar el email después de ${this.config.maxRetries + 1} intentos: ${error.message}`
            );
        }
    }
    
    /**
     * Envía un email sin lanzar errores (fire and forget)
     * Útil para notificaciones no críticas que no deben bloquear el flujo
     * @param {Object} emailData - Datos del email
     * @returns {Promise<boolean>} - True si se envió, false si falló
     */
    async sendSafe(emailData) {
        try {
            await this.send(emailData);
            return true;
        } catch (error) {
            console.error('[EMAIL] ⚠️  Error al enviar email (silenciado):', error.message);
            
            // En producción, registrar en servicio de monitoreo
            if (!this.config.isDevelopment) {
                // TODO: Enviar a Sentry/Datadog
            }
            
            return false;
        }
    }
    
    /**
     * Elimina etiquetas HTML básicas para generar texto plano
     * @private
     * @param {string} html - Contenido HTML
     * @returns {string} - Texto plano
     */
    _stripHtml(html) {
        return html
            .replace(/<style[^>]*>.*<\/style>/gm, '')
            .replace(/<script[^>]*>.*<\/script>/gm, '')
            .replace(/<[^>]+>/gm, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }
    
    /**
     * Pausa la ejecución (para reintentos)
     * @private
     * @param {number} ms - Milisegundos a esperar
     * @returns {Promise<void>}
     */
    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    /**
     * Verifica si el servicio está correctamente configurado
     * @returns {boolean}
     */
    isConfigured() {
        return !!this.config.apiKey;
    }
    
    /**
     * Obtiene el estado del servicio
     * @returns {Object}
     */
    getStatus() {
        return {
            configured: this.isConfigured(),
            isDevelopment: this.config.isDevelopment,
            from: `${this.config.fromName} <${this.config.from}>`,
            maxRetries: this.config.maxRetries
        };
    }
    
    /**
     * Envía email de confirmación de clase de prueba al ESTUDIANTE
     * @param {Object} data - Datos de la reserva
     * @returns {Promise<boolean>}
     */
    async sendTrialConfirmationToStudent(data) {
        try {
            const generateEmail = require('../templates/emails/trialConfirmedStudent');
            const html = generateEmail(data);
            
            return await this.sendSafe({
                to: data.studentEmail,
                subject: `🎹 ¡Clase de Prueba Confirmada con ${data.teacherName}!`,
                html
            });
        } catch (error) {
            console.error('[EMAIL] Error enviando confirmación al estudiante:', error.message);
            return false;
        }
    }
    
    /**
     * Envía email de notificación de clase de prueba al PROFESOR
     * @param {Object} data - Datos de la reserva
     * @returns {Promise<boolean>}
     */
    async sendTrialConfirmationToTeacher(data) {
        try {
            const generateEmail = require('../templates/emails/trialConfirmedTeacher');
            const html = generateEmail(data);
            
            return await this.sendSafe({
                to: data.teacherEmail,
                subject: `🎉 Nueva Clase de Prueba: ${data.studentName}`,
                html
            });
        } catch (error) {
            console.error('[EMAIL] Error enviando notificación al profesor:', error.message);
            return false;
        }
    }
    
    /**
     * Envía email de seguimiento post-clase de prueba
     * @param {Object} data - Datos del estudiante y profesor
     * @returns {Promise<boolean>}
     */
    async sendTrialFollowup(data) {
        try {
            const generateEmail = require('../templates/emails/trialFollowup');
            const html = generateEmail(data);
            
            return await this.sendSafe({
                to: data.studentEmail,
                subject: `🌟 ¿Listo para tu siguiente clase con ${data.teacherName}?`,
                html
            });
        } catch (error) {
            console.error('[EMAIL] Error enviando followup:', error.message);
            return false;
        }
    }

    /**
     * Envía invitación de Profesor Fundador
     * @param {Object} data - { teacherName, recipientEmail, inviteUrl }
     * @returns {Promise<Object>} - Resultado del envío con id del mensaje
     */
    async sendFounderInvitation(data) {
        try {
            const generateEmail = require('../templates/emails/founderInvitation');
            const html = generateEmail({
                teacherName: data.teacherName,
                inviteUrl: data.inviteUrl,
                recipientEmail: data.recipientEmail
            });

            const firstName = data.teacherName.split(' ')[0];
            return await this.send({
                to: data.recipientEmail,
                subject: `🎹 ${firstName}, te invitamos a ser Profesor Fundador de PianoLink`,
                html
            });
        } catch (error) {
            console.error('[EMAIL] Error enviando invitación fundador:', error.message);
            throw error;
        }
    }

    /**
     * Envía notificación al estudiante cuando el profesor cancela una clase
     * @param {Object} data - { studentName, studentEmail, teacherName, classDate, classTime, reason, rescheduleUrl }
     */
    async sendClassCancelledByTeacher(data) {
        try {
            const generateEmail = require('../templates/emails/classCancelledByTeacher');
            const html = generateEmail(data);

            return await this.sendSafe({
                to: data.studentEmail,
                subject: `📅 Clase cancelada — ${data.teacherName} no podrá asistir el ${data.classDate}`,
                html
            });
        } catch (error) {
            console.error('[EMAIL] Error enviando email cancelación por profesor:', error.message);
            return false;
        }
    }
}

// Singleton: una única instancia compartida
const emailService = new EmailService();

module.exports = emailService;
