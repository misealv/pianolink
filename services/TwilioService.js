/**
 * services/TwilioService.js
 * Servicio para envío outbound de WhatsApp via Twilio REST API.
 * Usado por el CRM para enviar mensajes proactivos de Mía a leads calientes.
 */
const twilio = require('twilio');

// Template aprobado por Meta para mensajes fuera de la ventana de 24h
const TEMPLATE_MIA_REACTIVACION = 'HX440ba076d6586ed7b0eeeaa2538019a2';

class TwilioService {
    constructor() {
        const sid = process.env.TWILIO_ACCOUNT_SID;
        const token = process.env.TWILIO_AUTH_TOKEN;
        this.from = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+15167168719';

        if (sid && token) {
            this.client = twilio(sid, token);
            console.log('[TwilioService] ✅ Cliente inicializado');
        } else {
            console.warn('[TwilioService] ⚠️ Credenciales Twilio no configuradas');
            this.client = null;
        }
    }

    isConfigured() {
        return !!this.client;
    }

    /**
     * Enviar mensaje WhatsApp usando Content Template (para mensajes fuera de ventana 24h).
     * @param {string} to - Número destino (ej: "+56912345678")
     * @param {object} variables - Variables del template (ej: { "1": "Juan" })
     * @param {string} [templateSid] - SID del template (default: mia_reactivacion)
     */
    async sendWhatsAppTemplate(to, variables = {}, templateSid = TEMPLATE_MIA_REACTIVACION) {
        if (!this.client) {
            return { success: false, error: 'Twilio no configurado' };
        }

        const toNum = to.startsWith('whatsapp:') ? to : `whatsapp:${to.startsWith('+') ? to : '+' + to}`;

        try {
            const msg = await this.client.messages.create({
                from: this.from,
                to: toNum,
                contentSid: templateSid,
                contentVariables: JSON.stringify(variables)
            });
            console.log(`[TwilioService] ✅ WA template enviado a ${to} → SID: ${msg.sid}`);
            return { success: true, sid: msg.sid };
        } catch (err) {
            console.error(`[TwilioService] ❌ Error template a ${to}:`, err.message);
            return { success: false, error: err.message };
        }
    }

    /**
     * Enviar mensaje WhatsApp libre (solo funciona dentro de ventana 24h o sandbox).
     * @param {string} to - Número destino
     * @param {string} body - Texto del mensaje
     */
    async sendWhatsApp(to, body) {
        if (!this.client) {
            return { success: false, error: 'Twilio no configurado' };
        }

        const toNum = to.startsWith('whatsapp:') ? to : `whatsapp:${to.startsWith('+') ? to : '+' + to}`;

        try {
            const msg = await this.client.messages.create({
                from: this.from,
                to: toNum,
                body
            });
            console.log(`[TwilioService] ✅ WA enviado a ${to} → SID: ${msg.sid}`);
            return { success: true, sid: msg.sid };
        } catch (err) {
            console.error(`[TwilioService] ❌ Error enviando a ${to}:`, err.message);
            return { success: false, error: err.message };
        }
    }
}

// Singleton
let instance = null;
module.exports = {
    getInstance() {
        if (!instance) instance = new TwilioService();
        return instance;
    }
};
