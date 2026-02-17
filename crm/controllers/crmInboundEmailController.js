/**
 * crm/controllers/crmInboundEmailController.js
 * Controlador para recibir emails entrantes vía webhook de Resend
 * y para la API de lectura desde el panel CRM.
 *
 * Webhook: Resend envía un POST con el email completo.
 * Formato Resend Inbound:
 *   { from, to, subject, text, html, headers, ... }
 *
 * Seguridad webhook: se valida con RESEND_WEBHOOK_SECRET si está configurado.
 */
const crypto = require('crypto');

// === Lazy loaders (RAM-friendly) ===
let _CrmInboundEmail = null;
function getCrmInboundEmail() {
    if (!_CrmInboundEmail) _CrmInboundEmail = require('../models/CrmInboundEmail');
    return _CrmInboundEmail;
}

let _CrmLead = null;
function getCrmLead() {
    if (!_CrmLead) _CrmLead = require('../models/CrmLead');
    return _CrmLead;
}

let _Lead = null;
function getLead() {
    if (!_Lead) _Lead = require('../../models/Lead');
    return _Lead;
}

let _CrmInteraction = null;
function getCrmInteraction() {
    if (!_CrmInteraction) _CrmInteraction = require('../models/CrmInteraction');
    return _CrmInteraction;
}

// =========================================================================
// WEBHOOK — Recibir email entrante de Resend
// =========================================================================

/**
 * POST /api/crm/webhooks/resend/inbound
 * Resend envía el email entrante como JSON.
 * No requiere auth (llamado por Resend directamente).
 *
 * Payload de Resend inbound webhook:
 * {
 *   "type": "email.received",
 *   "data": {
 *     "from": "user@example.com",
 *     "to": ["hola@pianolink.net"],
 *     "subject": "Re: Tu clase de piano",
 *     "text": "Hola, me interesa...",
 *     "html": "<p>Hola, me interesa...</p>",
 *     "headers": [...],
 *     "created_at": "2024-01-01T00:00:00.000Z"
 *   }
 * }
 */
exports.receiveInbound = async (req, res) => {
    // Responder 200 inmediatamente (Resend espera respuesta rápida)
    res.status(200).json({ received: true });

    try {
        // Verificar firma Svix (si está configurada y los headers existen)
        const secret = process.env.RESEND_WEBHOOK_SECRET;
        let signatureVerified = false;

        if (secret) {
            const svixId = req.headers['svix-id'];
            const svixTimestamp = req.headers['svix-timestamp'];
            const svixSignature = req.headers['svix-signature'];

            if (svixId && svixTimestamp && svixSignature) {
                // Verificar timestamp (tolerancia de 5 minutos)
                const now = Math.floor(Date.now() / 1000);
                const ts = parseInt(svixTimestamp, 10);
                if (Math.abs(now - ts) > 300) {
                    console.warn('[CRM Inbound] ⚠️ Timestamp Svix expirado, procesando de todas formas');
                } else {
                    // Verificar firma HMAC
                    const rawBody = JSON.stringify(req.body);
                    const toSign = `${svixId}.${svixTimestamp}.${rawBody}`;
                    const expectedSig = crypto
                        .createHmac('sha256', secret.startsWith('whsec_') ? Buffer.from(secret.slice(6), 'base64') : secret)
                        .update(toSign)
                        .digest('base64');

                    const signatures = svixSignature.split(' ').map(s => s.replace(/^v1,/, ''));
                    signatureVerified = signatures.includes(expectedSig);
                    if (!signatureVerified) {
                        console.warn('[CRM Inbound] ⚠️ Firma Svix no coincide, procesando de todas formas');
                    }
                }
            } else {
                console.warn('[CRM Inbound] ⚠️ Webhook sin headers Svix (normal para algunos eventos Resend)');
            }
        }

        const body = req.body;
        if (!body) return;

        // Resend puede enviar distintos tipos de eventos
        const eventType = body.type;
        const data = body.data || body;

        console.log(`[CRM Inbound] 📨 Evento recibido: ${eventType || 'sin tipo'} | firma: ${signatureVerified ? '✅' : '⚠️ no verificada'}`);

        // Eventos de tracking (no son emails entrantes, pero los logueamos)
        const trackingEvents = ['email.sent', 'email.delivered', 'email.opened', 'email.clicked', 'email.bounced', 'email.complained'];
        if (eventType && trackingEvents.includes(eventType)) {
            console.log(`[CRM Inbound] 📊 Evento tracking: ${eventType} | to: ${data.to || '?'} | subject: ${data.subject || '?'}`);
            return;
        }

        // Para email.received O eventos sin tipo (compatibilidad), procesar como email entrante
        if (eventType && eventType !== 'email.received') {
            console.log(`[CRM Inbound] Evento no reconocido ignorado: ${eventType}`);
            return;
        }

        // Extraer datos del email
        const fromEmail = _extractEmail(data.from || '');
        const fromFull = data.from || '';
        const to = Array.isArray(data.to) ? data.to.join(', ') : (data.to || '');
        const subject = data.subject || '(sin asunto)';
        const textBody = data.text || '';
        const htmlBody = data.html || '';
        const headers = data.headers || [];

        // Extraer headers relevantes
        const messageId = _findHeader(headers, 'message-id');
        const inReplyTo = _findHeader(headers, 'in-reply-to');
        const references = _findHeader(headers, 'references');

        console.log(`[CRM Inbound] 📩 Email entrante de: ${fromEmail} | Asunto: ${subject}`);

        // Buscar lead vinculado por email
        const Lead = getLead();
        const CrmLead = getCrmLead();

        let leadRef = null;
        let leadName = '';

        const coreLead = await Lead.findOne({ email: fromEmail }).lean();
        if (coreLead) {
            leadName = coreLead.name || '';
            const crmLead = await CrmLead.findOne({ leadRef: coreLead._id }).lean();
            if (crmLead) {
                leadRef = crmLead._id;
            }
        }

        // Guardar email entrante
        const CrmInboundEmail = getCrmInboundEmail();
        const inbound = await CrmInboundEmail.create({
            from: fromFull,
            to,
            subject,
            textBody,
            htmlBody,
            messageId,
            inReplyTo,
            references,
            leadRef,
            leadName: leadName || _extractName(fromFull),
            resendEventId: body.id || '',
            rawHeaders: headers
        });

        // Registrar interacción si hay lead vinculado
        if (leadRef) {
            const CrmInteraction = getCrmInteraction();
            await CrmInteraction.create({
                leadRef,
                type: 'email_reply',
                channel: 'email',
                metadata: {
                    emailSubject: subject,
                    notes: `Respuesta de email recibida: "${subject.substring(0, 80)}"`
                }
            });
        }

        console.log(`[CRM Inbound] ✅ Email guardado: id=${inbound._id}${leadRef ? ` (lead vinculado)` : ' (sin lead)'}`);

    } catch (error) {
        console.error('[CRM Inbound] ❌ Error procesando email entrante:', error.message);
    }
};

// =========================================================================
// API — Listar respuestas para el panel CRM
// =========================================================================

/**
 * GET /api/crm/inbound
 * Lista emails entrantes con paginación y filtros.
 * Query params: page, limit, unreadOnly
 */
exports.list = async (req, res) => {
    try {
        const CrmInboundEmail = getCrmInboundEmail();

        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 30));
        const unreadOnly = req.query.unreadOnly === 'true';

        const filter = {};
        if (unreadOnly) filter.read = false;

        const [emails, total, unreadCount] = await Promise.all([
            CrmInboundEmail.listPaginated(page, limit, filter),
            CrmInboundEmail.countDocuments(filter),
            CrmInboundEmail.getUnreadCount()
        ]);

        res.json({
            success: true,
            data: emails,
            pagination: { page, limit, total, pages: Math.ceil(total / limit) },
            unreadCount
        });
    } catch (error) {
        console.error('[CRM Inbound] Error listando emails:', error.message);
        res.status(500).json({ success: false, error: 'Error al listar emails entrantes' });
    }
};

/**
 * GET /api/crm/inbound/:id
 * Obtiene un email entrante por ID y lo marca como leído.
 */
exports.getById = async (req, res) => {
    try {
        const CrmInboundEmail = getCrmInboundEmail();
        const email = await CrmInboundEmail.findById(req.params.id)
            .populate({
                path: 'leadRef',
                populate: { path: 'leadRef', select: 'name email type' }
            });

        if (!email) {
            return res.status(404).json({ success: false, error: 'Email no encontrado' });
        }

        // Marcar como leído automáticamente
        if (!email.read) {
            email.read = true;
            email.readAt = new Date();
            email.readBy = req.user?._id || null;
            await email.save();
        }

        res.json({ success: true, data: email });
    } catch (error) {
        console.error('[CRM Inbound] Error obteniendo email:', error.message);
        res.status(500).json({ success: false, error: 'Error al obtener email' });
    }
};

/**
 * PATCH /api/crm/inbound/:id/read
 * Toggle estado de lectura.
 */
exports.toggleRead = async (req, res) => {
    try {
        const CrmInboundEmail = getCrmInboundEmail();
        const email = await CrmInboundEmail.findById(req.params.id);
        if (!email) {
            return res.status(404).json({ success: false, error: 'Email no encontrado' });
        }

        email.read = !email.read;
        email.readAt = email.read ? new Date() : null;
        email.readBy = email.read ? (req.user?._id || null) : null;
        await email.save();

        res.json({ success: true, data: { read: email.read } });
    } catch (error) {
        console.error('[CRM Inbound] Error toggle read:', error.message);
        res.status(500).json({ success: false, error: 'Error al actualizar estado' });
    }
};

/**
 * PATCH /api/crm/inbound/mark-all-read
 * Marca todos los emails como leídos.
 */
exports.markAllRead = async (req, res) => {
    try {
        const CrmInboundEmail = getCrmInboundEmail();
        const result = await CrmInboundEmail.updateMany(
            { read: false },
            { $set: { read: true, readAt: new Date(), readBy: req.user?._id || null } }
        );
        res.json({ success: true, data: { modified: result.modifiedCount } });
    } catch (error) {
        console.error('[CRM Inbound] Error mark all read:', error.message);
        res.status(500).json({ success: false, error: 'Error al marcar como leídos' });
    }
};

/**
 * GET /api/crm/inbound/unread-count
 * Devuelve solo el conteo de no leídos (para badge en sidebar).
 */
exports.unreadCount = async (req, res) => {
    try {
        const CrmInboundEmail = getCrmInboundEmail();
        const count = await CrmInboundEmail.getUnreadCount();
        res.json({ success: true, data: { count } });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Error contando no leídos' });
    }
};

// =========================================================================
// HELPERS
// =========================================================================

/**
 * Extrae el email de un string tipo "Nombre <email@domain.com>"
 */
function _extractEmail(str) {
    const match = str.match(/<([^>]+)>/);
    if (match) return match[1].toLowerCase().trim();
    // Si no tiene formato "Nombre <email>", asumir que es el email directo
    return str.toLowerCase().trim();
}

/**
 * Extrae el nombre de un string tipo "Nombre <email@domain.com>"
 */
function _extractName(str) {
    const match = str.match(/^([^<]+)</);
    if (match) return match[1].trim();
    return '';
}

/**
 * Busca un header por nombre en el array de headers de Resend.
 * Resend envía headers como: [{ name: "Message-ID", value: "<abc@...>" }, ...]
 */
function _findHeader(headers, name) {
    if (!Array.isArray(headers)) return '';
    const h = headers.find(h => h.name && h.name.toLowerCase() === name.toLowerCase());
    return h ? (h.value || '') : '';
}
