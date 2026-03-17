/**
 * services/TwilioService.js
 * Servicio para envío outbound de WhatsApp via Twilio REST API.
 * Usado por el CRM para enviar mensajes proactivos de Mía a leads calientes.
 */
const twilio = require('twilio');

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
     * Enviar mensaje WhatsApp a un número.
     * @param {string} to - Número destino (ej: "+56912345678")
     * @param {string} body - Texto del mensaje
     * @returns {{ success: boolean, sid?: string, error?: string }}
     */
    async sendWhatsApp(to, body) {
        if (!this.client) {
            return { success: false, error: 'Twilio no configurado' };
        }

        // Normalizar número
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
