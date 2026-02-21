/**
 * crm/services/CrmResendService.js
 * Servicio de email marketing con Resend.
 * 
 * Funcionalidades:
 * - Envío de emails individuales
 * - Envío de campañas masivas (batches)
 * - Emails transaccionales (confirmaciones)
 * - Gestión de contactos en Resend Audiences
 * 
 * COMPLETADO: Servicio de Resend para lanzamiento Día 88
 */
const { Resend } = require('resend');
const CrmEmailCampaign = require('../models/CrmEmailCampaign');
const CrmLead = require('../models/CrmLead');
const Lead = require('../../models/Lead');

class CrmResendService {
    constructor() {
        this.resend = null;
        this.config = {
            apiKey: process.env.RESEND_API_KEY,
            from: this._buildFromAddress(),
            replyTo: process.env.EMAIL_REPLY_TO || 'hola@pianolink.net',
            batchSize: 50,
            batchDelay: 1500, // ms entre batches (rate limit de Resend)
        };
        this._initialize();
    }

    /**
     * Construye el campo from con formato "Nombre <email>"
     * Si EMAIL_FROM ya contiene '<', se usa tal cual.
     * Si no, se combina con EMAIL_FROM_NAME.
     */
    _buildFromAddress() {
        const raw = process.env.EMAIL_FROM || 'hola@pianolink.net';
        if (raw.includes('<')) return raw; // Ya tiene formato "Name <email>"
        const name = process.env.EMAIL_FROM_NAME || 'PianoLink';
        return `${name} <${raw}>`;
    }

    _initialize() {
        if (!this.config.apiKey) {
            console.warn('[CRM Resend] ⚠️ RESEND_API_KEY no configurado');
            return;
        }
        
        try {
            this.resend = new Resend(this.config.apiKey);
            console.log('[CRM Resend] ✅ Servicio inicializado');
        } catch (error) {
            console.error('[CRM Resend] ❌ Error al inicializar:', error.message);
        }
    }

    /**
     * Verificar si el servicio está configurado
     */
    isConfigured() {
        return !!this.resend;
    }

    /**
     * Enviar email individual
     * @param {string} to - Email del destinatario
     * @param {string} subject - Asunto
     * @param {string} html - Contenido HTML
     * @param {Object} options - Opciones adicionales
     */
    async sendEmail(to, subject, html, options = {}) {
        if (!this.isConfigured()) {
            console.warn('[CRM Resend] Servicio no configurado, email simulado');
            return { success: true, simulated: true, id: `sim-${Date.now()}` };
        }

        try {
            // Reemplazar variables en el HTML
            const nombre = options.nombre || 'amigo/a';
            const processedHtml = this._replaceVariables(html, { nombre, email: to });
            
            // Agregar link de desuscripción si no existe
            const finalHtml = processedHtml.includes('{{unsubscribe_url}}')
                ? processedHtml.replace(/\{\{unsubscribe_url\}\}/g, this._getUnsubscribeUrl(to))
                : processedHtml;

            const fromAddress = options.from || this.config.from;

            const response = await this.resend.emails.send({
                from: fromAddress,
                to: [to],
                reply_to: options.replyTo || this.config.replyTo,
                subject: subject,
                html: finalHtml,
                headers: {
                    'List-Unsubscribe': `<${this._getUnsubscribeUrl(to)}>, <mailto:hola@pianolink.net?subject=unsubscribe>`,
                    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
                }
            });

            console.log(`[CRM Resend] ✅ Email enviado a ${to}, ID: ${response.data?.id}`);
            return { success: true, id: response.data?.id };

        } catch (error) {
            console.error(`[CRM Resend] ❌ Error enviando a ${to}:`, error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Enviar campaña masiva (broadcast)
     * Soporta broadcast dual: versión A (activos) y B (fríos)
     * @param {string} campaignId - ID de la campaña
     */
    async sendCampaign(campaignId) {
        if (!this.isConfigured()) {
            return { success: false, error: 'Resend no configurado' };
        }

        try {
            // Obtener campaña
            const campaign = await CrmEmailCampaign.findById(campaignId);
            if (!campaign) {
                return { success: false, error: 'Campaña no encontrada' };
            }

            if (campaign.estado !== 'borrador' && campaign.estado !== 'programado') {
                return { success: false, error: 'La campaña no está en estado válido para envío' };
            }

            // Marcar como enviando
            campaign.estado = 'enviando';
            await campaign.save();

            // Obtener suscriptores para envío
            const suscriptores = await this._getSuscriptoresParaCampaign(campaign.targeting);
            
            if (suscriptores.length === 0) {
                campaign.estado = 'borrador';
                await campaign.save();
                return { success: false, error: 'No hay suscriptores para enviar' };
            }

            // Obtener cupos restantes para variable dinámica
            const cuposRestantes = await this._getCuposRestantes();

            console.log(`[CRM Resend] 📤 Enviando campaña "${campaign.nombre}" a ${suscriptores.length} suscriptores`);

            // Broadcast dual: separar activos vs fríos si hay versión para activos
            const tieneVersionDual = !!campaign.contenidoHtmlActivos;

            // Enviar en batches
            let enviados = 0;
            let errores = 0;
            const batches = this._chunkArray(suscriptores, this.config.batchSize);

            for (let i = 0; i < batches.length; i++) {
                const batch = batches[i];
                console.log(`[CRM Resend] Procesando batch ${i + 1}/${batches.length}`);

                const promises = batch.map(async (sub) => {
                    // Elegir contenido según engagement (broadcast dual)
                    let contenido = campaign.contenidoHtml;
                    if (tieneVersionDual && sub.opensCount >= (campaign.umbralEngagement || 4)) {
                        contenido = campaign.contenidoHtmlActivos;
                    }

                    const result = await this.sendEmail(
                        sub.email,
                        campaign.asunto,
                        contenido,
                        { nombre: sub.nombre, cupos_restantes: cuposRestantes }
                    );
                    return result.success;
                });

                const results = await Promise.all(promises);
                enviados += results.filter(r => r).length;
                errores += results.filter(r => !r).length;

                // Rate limiting
                if (i < batches.length - 1) {
                    await this._delay(this.config.batchDelay);
                }
            }

            // Marcar campaña como enviada
            await campaign.marcarEnviado(enviados);

            console.log(`[CRM Resend] ✅ Campaña completada: ${enviados} enviados, ${errores} errores`);
            return { success: true, enviados, errores };

        } catch (error) {
            console.error('[CRM Resend] ❌ Error en sendCampaign:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Enviar email transaccional de confirmación de lista de espera
     * @param {string} email
     * @param {string} nombre
     */
    async sendWaitlistConfirmation(email, nombre) {
        const subject = '✅ Estás en la lista — Te avisamos el 29 de marzo';
        const html = this._getWaitlistConfirmationTemplate(nombre);
        
        return this.sendEmail(email, subject, html, { nombre });
    }

    /**
     * Template de confirmación de waitlist
     */
    _getWaitlistConfirmationTemplate(nombre) {
        return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f5f0;font-family:Georgia,serif;">
<table width="100%" cellpadding="0" cellspacing="0" bgcolor="#f5f5f0">
<tr><td align="center" style="padding:30px 20px;">
<table width="600" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
  <tr><td bgcolor="#0a0a0a" align="center" style="padding:28px 40px;">
    <span style="font-family:Georgia,serif;font-size:22px;color:#c9a84c;letter-spacing:2px;">🎹 PianoLink</span>
  </td></tr>
  <tr><td style="padding:48px 48px 32px;">
    <h1 style="font-family:Georgia,serif;font-size:28px;color:#0a0a0a;margin:0 0 28px;line-height:1.3;">¡Ya estás en la lista, ${nombre}! 🎉</h1>
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 20px;">Gracias por registrarte. Eres parte del grupo exclusivo que tendrá <strong>acceso antes que nadie</strong> al lanzamiento de PianoLink.</p>
    
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
      <tr><td style="border-left:4px solid #c9a84c;background:#f5f5f0;padding:20px 24px;border-radius:0 8px 8px 0;">
        <p style="font-size:15px;color:#333;line-height:1.6;margin:0;">
          <strong>📅 Fecha:</strong> 29 de marzo de 2026 (Día 88 del año)<br>
          <strong>⏰ Hora:</strong> 9:00 AM (hora Chile)<br>
          <strong>🎯 Cupos:</strong> Solo 88 disponibles
        </p>
      </td></tr>
    </table>

    <p style="font-size:16px;color:#333;line-height:1.8;margin:20px 0;">Lo que obtendrás por estar en esta lista:</p>
    <ul style="font-size:15px;color:#333;line-height:1.8;margin:0 0 20px;padding-left:20px;">
      <li>🎁 <strong>15% de descuento</strong> en tus 3 primeras compras</li>
      <li>⚡ Acceso anticipado al link de compra (antes del público general)</li>
      <li>🏅 Badge exclusivo de "Miembro Fundador"</li>
    </ul>

    <p style="font-size:16px;color:#333;line-height:1.8;margin:20px 0;">El 29 de marzo a las 9:00 AM recibirás un email con el link directo para reservar tu Kit de Bienvenida a <strong>$44 USD</strong> (precio normal $90). Incluye cable MIDI — se envía después de la entrevista.</p>

    <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="border-top:2px solid #c9a84c;padding-top:24px;margin-top:24px;"></td></tr></table>

    <p style="font-size:16px;color:#333;margin:0;">Con cariño,<br><strong>Miguel Antonio</strong><br><span style="color:#c9a84c;">Fundador, PianoLink</span></p>
  </td></tr>
  <tr><td bgcolor="#0a0a0a" style="padding:24px 48px;" align="center">
    <p style="color:#888;font-size:12px;margin:0 0 8px;">El 29 de marzo abre PianoLink. Solo 88 cupos.</p>
    <p style="margin:0;"><a href="{{unsubscribe_url}}" style="color:#666;font-size:11px;">Cancelar suscripción</a></p>
    <p style="color:#555;font-size:11px;margin:8px 0 0;">© 2026 PianoLink · hola@pianolink.pro</p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
    }

    /**
     * Obtener suscriptores para una campaña según targeting
     * Incluye opensCount para segmentación por engagement (broadcast dual)
     */
    async _getSuscriptoresParaCampaign(targeting = {}) {
        try {
            // Buscar leads con email válido, no desuscrito, y no convertido
            const filter = {
                'emailPreferences.unsubscribed': { $ne: true },
                'emailPreferences.bounced': { $ne: true }
            };

            // Aplicar filtros de targeting
            if (targeting.tags && targeting.tags.length > 0) {
                filter.tags = { $all: targeting.tags };
            }
            if (targeting.segmentos && targeting.segmentos.length > 0) {
                filter.segment = { $in: targeting.segmentos };
            } else {
                // Si no hay targeting explícito, excluir customers (ya compraron)
                filter.segment = { $nin: ['customer'] };
            }

            const crmLeads = await CrmLead.find(filter)
                .populate('leadRef', 'name email')
                .limit(10000) // Límite de seguridad
                .lean();

            // Extraer email, nombre y opensCount del lead
            return crmLeads
                .filter(l => l.leadRef?.email)
                .map(l => ({
                    email: l.leadRef.email,
                    nombre: l.leadRef.name || 'amigo/a',
                    opensCount: l.emailPreferences?.opensCount || 0
                }));

        } catch (error) {
            console.error('[CRM Resend] Error obteniendo suscriptores:', error.message);
            return [];
        }
    }

    /**
     * Obtener cupos restantes de los 88 disponibles
     * Cuenta compras completadas del Kit de Bienvenida
     */
    async _getCuposRestantes() {
        try {
            const Order = require('../../models/Order');
            // Contar orders completadas del Welcome Kit
            const vendidos = await Order.countDocuments({
                'items.type': 'welcome-kit',
                status: { $in: ['completed', 'paid', 'active'] }
            });
            return Math.max(0, 88 - vendidos);
        } catch (error) {
            // Si no se puede calcular, devolver null (se mostrará '—')
            console.warn('[CRM Resend] No se pudo calcular cupos restantes:', error.message);
            return null;
        }
    }

    /**
     * Reemplazar variables en el HTML
     * Soporta: {{nombre}}, {{email}}, {{cupos_restantes}}
     */
    _replaceVariables(html, data) {
        let result = html;
        result = result.replace(/\{\{nombre\}\}/g, data.nombre || 'amigo/a');
        result = result.replace(/\{\{email\}\}/g, data.email || '');
        // Variable dinámica de cupos restantes (se calcula al momento del envío)
        if (result.includes('{{cupos_restantes}}')) {
            const cupos = data.cupos_restantes != null ? data.cupos_restantes : '—';
            result = result.replace(/\{\{cupos_restantes\}\}/g, String(cupos));
        }
        return result;
    }

    /**
     * Generar URL de desuscripción
     */
    _getUnsubscribeUrl(email) {
        const baseUrl = process.env.SITE_URL || process.env.FRONTEND_URL || 'https://pianolink.net';
        const encoded = Buffer.from(email).toString('base64url');
        return `${baseUrl}/api/crm/tracking/email/unsubscribe?e=${encoded}`;
    }

    /**
     * Dividir array en chunks
     */
    _chunkArray(array, size) {
        const chunks = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    }

    /**
     * Delay helper
     */
    _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Singleton
let instance = null;

module.exports = {
    getInstance: () => {
        if (!instance) {
            instance = new CrmResendService();
        }
        return instance;
    },
    CrmResendService
};
