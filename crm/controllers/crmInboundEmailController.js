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

let _CrmResendService = null;
function getCrmResendService() {
    if (!_CrmResendService) _CrmResendService = require('../services/CrmResendService').getInstance();
    return _CrmResendService;
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

        // Eventos de tracking → guardar como CrmInteraction + scoring/promoción automática
        const trackingEvents = ['email.sent', 'email.delivered', 'email.opened', 'email.clicked', 'email.bounced', 'email.complained'];
        if (eventType && trackingEvents.includes(eventType)) {
            console.log(`[CRM Inbound] 📊 Evento tracking: ${eventType} | to: ${data.to || '?'} | subject: ${data.subject || '?'}`);
            await _processTrackingEvent(eventType, data);
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
        const headers = data.headers || [];

        // Resend inbound webhook NO incluye el body en el payload (diseño oficial).
        // Se usa GET /emails/receiving/:id (HTTP directo, SDK v4 no lo soporta).
        let textBody = '';
        let htmlBody = '';
        const resendEmailId = data.email_id || data.id || '';

        if (resendEmailId) {
            try {
                const apiKey = process.env.RESEND_API_KEY;
                if (apiKey) {
                    console.log(`[CRM Inbound] 📥 Obteniendo body vía receiving API: ${resendEmailId}`);
                    const https = require('https');
                    const emailDetail = await new Promise((resolve, reject) => {
                        const req = https.request({
                            hostname: 'api.resend.com',
                            path: `/emails/receiving/${resendEmailId}`,
                            method: 'GET',
                            headers: { 'Authorization': `Bearer ${apiKey}` }
                        }, (res) => {
                            let body = '';
                            res.on('data', chunk => body += chunk);
                            res.on('end', () => {
                                try { resolve(JSON.parse(body)); }
                                catch (e) { reject(new Error(`Parse error: ${body.substring(0, 200)}`)); }
                            });
                        });
                        req.on('error', reject);
                        req.setTimeout(10000, () => { req.destroy(); reject(new Error('Timeout 10s')); });
                        req.end();
                    });
                    textBody = emailDetail.text || '';
                    htmlBody = emailDetail.html || '';
                    console.log(`[CRM Inbound] ✅ Body obtenido: text=${textBody.length} chars, html=${htmlBody.length} chars`);
                }
            } catch (fetchErr) {
                console.warn(`[CRM Inbound] ⚠️ No se pudo obtener body vía receiving API: ${fetchErr.message}`);
            }
        }

        // Extraer headers relevantes (pueden venir en data directamente o en data.headers)
        const messageId = data.message_id || _findHeader(headers, 'message-id');
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

        // Calcular threadId: buscar thread existente por inReplyTo/references o crear uno nuevo
        let threadId = '';
        if (inReplyTo || references) {
            // Buscar si algún mensaje previo tiene el messageId al que respondemos
            const refIds = [inReplyTo, ...(references || '').split(/\s+/)].filter(Boolean);
            const existing = await CrmInboundEmail.findOne({
                $or: [
                    { messageId: { $in: refIds } },
                    { threadId: { $in: refIds } }
                ]
            }).lean();
            threadId = existing?.threadId || inReplyTo || refIds[0] || '';
        }
        // Si no hay thread, usar el messageId como inicio de thread nuevo
        if (!threadId) threadId = messageId || `thread_${Date.now()}`;

        const inbound = await CrmInboundEmail.create({
            from: fromFull,
            to,
            subject,
            textBody,
            htmlBody,
            direction: 'inbound',
            threadId,
            messageId,
            inReplyTo,
            references,
            leadRef,
            leadName: leadName || _extractName(fromFull),
            resendEventId: body.id || '',
            resendEmailId: resendEmailId,
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

            // Scoring: responder email = +15 puntos
            const CrmLeadService = require('../services/CrmLeadService');
            await CrmLeadService.incrementScore(leadRef, 15, 'email_reply');

            // Promoción automática: responder email = interés alto
            await _promoteLeadOnEngagement(leadRef, 'email_reply');
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

/**
 * GET /api/crm/inbound/thread/:threadId
 * Obtiene toda la conversación (mensajes inbound + outbound) ordenados cronológicamente.
 */
exports.getThread = async (req, res) => {
    try {
        const CrmInboundEmail = getCrmInboundEmail();
        const threadId = req.params.threadId;

        const messages = await CrmInboundEmail.getThread(threadId);

        // Marcar todos los inbound del thread como leídos
        await CrmInboundEmail.updateMany(
            { threadId, read: false, direction: 'inbound' },
            { $set: { read: true, readAt: new Date(), readBy: req.user?._id || null } }
        );

        res.json({ success: true, data: messages });
    } catch (error) {
        console.error('[CRM Inbound] Error obteniendo thread:', error.message);
        res.status(500).json({ success: false, error: 'Error al obtener conversación' });
    }
};

/**
 * POST /api/crm/inbound/:id/reply
 * Envía una respuesta al email y la guarda en el thread.
 * Body: { text }
 */
exports.reply = async (req, res) => {
    try {
        const CrmInboundEmail = getCrmInboundEmail();
        const original = await CrmInboundEmail.findById(req.params.id).lean();
        if (!original) {
            return res.status(404).json({ success: false, error: 'Email original no encontrado' });
        }

        const { text } = req.body;
        if (!text || !text.trim()) {
            return res.status(400).json({ success: false, error: 'El texto de respuesta es requerido' });
        }

        // Extraer email del destinatario
        const toEmail = _extractEmail(original.from);
        if (!toEmail) {
            return res.status(400).json({ success: false, error: 'No se pudo determinar el destinatario' });
        }

        // Construir subject con Re: si no lo tiene
        const reSubject = (original.subject || '').startsWith('Re:')
            ? original.subject
            : `Re: ${original.subject || ''}`;

        // Enviar vía Resend
        const resendService = getCrmResendService();
        if (!resendService.isConfigured()) {
            return res.status(503).json({ success: false, error: 'Servicio de email no configurado' });
        }

        const htmlBody = text.split('\n').map(line => `<p>${line || '&nbsp;'}</p>`).join('');

        const sendResult = await resendService.resend.emails.send({
            from: resendService.config.from,
            to: [toEmail],
            subject: reSubject,
            html: htmlBody,
            text: text,
            reply_to: resendService.config.replyTo,
            headers: {
                'In-Reply-To': original.messageId || '',
                'References': [original.references, original.messageId].filter(Boolean).join(' ')
            }
        });

        if (sendResult.error) {
            console.error('[CRM Inbound] Error enviando reply:', sendResult.error);
            return res.status(500).json({ success: false, error: 'Error al enviar email: ' + (sendResult.error.message || 'desconocido') });
        }

        // Guardar el email enviado en el thread
        const threadId = original.threadId || original.messageId || `thread_${Date.now()}`;
        const reply = await CrmInboundEmail.create({
            from: resendService.config.from,
            to: toEmail,
            subject: reSubject,
            textBody: text,
            htmlBody,
            direction: 'outbound',
            threadId,
            messageId: sendResult.data?.id ? `<${sendResult.data.id}@resend.dev>` : '',
            inReplyTo: original.messageId || '',
            references: [original.references, original.messageId].filter(Boolean).join(' '),
            leadRef: original.leadRef,
            leadName: original.leadName,
            read: true,
            readAt: new Date(),
            resendEmailId: sendResult.data?.id || ''
        });

        // Si el original no tenía threadId, actualizarlo
        if (!original.threadId) {
            await CrmInboundEmail.updateOne(
                { _id: original._id },
                { $set: { threadId } }
            );
        }

        console.log(`[CRM Inbound] ✅ Reply enviado a ${toEmail} | thread: ${threadId}`);

        res.json({ success: true, data: reply });
    } catch (error) {
        console.error('[CRM Inbound] Error en reply:', error.message);
        res.status(500).json({ success: false, error: 'Error al enviar respuesta' });
    }
};

// =========================================================================
// HELPERS
// =========================================================================

// =========================================================================
// HELPERS — Tracking & Promoción automática de leads
// =========================================================================

/**
 * Procesa eventos de tracking de Resend (opened, clicked, etc.)
 * Guarda como CrmInteraction y actualiza score/segment del lead.
 */
async function _processTrackingEvent(eventType, data) {
    try {
        // Extraer email del destinatario
        const toRaw = Array.isArray(data.to) ? data.to[0] : (data.to || '');
        const recipientEmail = _extractEmail(toRaw);
        if (!recipientEmail) return;

        // Buscar lead vinculado
        const Lead = getLead();
        const CrmLead = getCrmLead();
        const coreLead = await Lead.findOne({ email: recipientEmail }).lean();
        if (!coreLead) return;
        const crmLead = await CrmLead.findOne({ leadRef: coreLead._id });
        if (!crmLead) return;

        // Mapear evento Resend → tipo de interacción CRM
        const typeMap = {
            'email.sent': 'email_sent',
            'email.delivered': 'email_sent',
            'email.opened': 'email_open',
            'email.clicked': 'email_click',
            'email.bounced': 'email_bounce',
            'email.complained': 'email_unsubscribe'
        };
        const interactionType = typeMap[eventType];
        if (!interactionType) return;

        // Guardar interacción
        const CrmInteraction = getCrmInteraction();
        await CrmInteraction.create({
            leadRef: crmLead._id,
            type: interactionType,
            channel: 'email',
            metadata: {
                emailSubject: data.subject || '',
                notes: `Evento: ${eventType}`
            }
        });

        // Scoring y promoción automática
        const scoreMap = {
            'email.delivered': 1,
            'email.opened': 5,
            'email.clicked': 10,
            'email.bounced': -5,
            'email.complained': -10
        };
        const points = scoreMap[eventType];
        if (points) {
            const CrmLeadService = require('../services/CrmLeadService');
            await CrmLeadService.incrementScore(crmLead._id, points, eventType.replace('email.', 'email_'));
        }

        // Promoción de segment/lifecycle según engagement
        if (['email.opened', 'email.clicked'].includes(eventType)) {
            await _promoteLeadOnEngagement(crmLead._id, interactionType);
        }

        // Bounce/complaint → marcar preferencias de email
        if (eventType === 'email.bounced') {
            await CrmLead.findByIdAndUpdate(crmLead._id, {
                'emailPreferences.bounced': true,
                'emailPreferences.bouncedAt': new Date()
            });
            console.log(`[CRM Tracking] ⚠️ Lead ${recipientEmail} marcado como bounced`);
        }
        if (eventType === 'email.complained') {
            await CrmLead.findByIdAndUpdate(crmLead._id, {
                'emailPreferences.unsubscribed': true,
                'emailPreferences.unsubscribedAt': new Date()
            });
            console.log(`[CRM Tracking] ⚠️ Lead ${recipientEmail} marcado como unsubscribed (complaint)`);
        }

        console.log(`[CRM Tracking] ✅ ${eventType} → ${recipientEmail} (score +${points || 0})`);

    } catch (err) {
        console.warn(`[CRM Tracking] ⚠️ Error procesando ${eventType}: ${err.message}`);
    }
}

/**
 * Promoción automática de segment y lifecycleStage basada en engagement acumulado.
 * Reglas:
 *   - ≥1 email_click → cold→warm
 *   - ≥3 email_open  → cold→warm
 *   - ≥1 email_reply → warm (si cold), subscriber/lead→mql
 *   - ≥2 email_reply → hot, mql→sql
 *   - Conversión (payment) → customer (manejado por CrmBridgeService)
 */
async function _promoteLeadOnEngagement(crmLeadId, triggerType) {
    try {
        const CrmLead = getCrmLead();
        const CrmInteraction = getCrmInteraction();

        const crmLead = await CrmLead.findById(crmLeadId);
        if (!crmLead) return;

        // No degradar nunca a customer/evangelist
        if (['customer', 'evangelist'].includes(crmLead.segment)) return;

        // Contar interacciones de engagement
        const counts = await CrmInteraction.aggregate([
            { $match: { leadRef: crmLead._id, type: { $in: ['email_open', 'email_click', 'email_reply'] } } },
            { $group: { _id: '$type', count: { $sum: 1 } } }
        ]);
        const c = {};
        counts.forEach(i => { c[i._id] = i.count; });

        const opens = c.email_open || 0;
        const clicks = c.email_click || 0;
        const replies = c.email_reply || 0;

        let newSegment = crmLead.segment;
        let newLifecycle = crmLead.lifecycleStage;

        // Reglas de promoción de segment (nunca degradar)
        const segmentOrder = ['cold', 'warm', 'hot'];
        const currentSegIdx = segmentOrder.indexOf(crmLead.segment);

        if (replies >= 2 && currentSegIdx < 2) {
            newSegment = 'hot';
        } else if ((replies >= 1 || clicks >= 1 || opens >= 3) && currentSegIdx < 1) {
            newSegment = 'warm';
        }

        // Reglas de promoción de lifecycle (nunca degradar)
        const lifecycleOrder = ['subscriber', 'lead', 'mql', 'sql', 'opportunity', 'customer', 'evangelist'];
        const currentLcIdx = lifecycleOrder.indexOf(crmLead.lifecycleStage);

        if (replies >= 2 && currentLcIdx < 3) {
            newLifecycle = 'sql'; // Respondió 2+ veces = Sales Qualified
        } else if (replies >= 1 && currentLcIdx < 2) {
            newLifecycle = 'mql'; // Respondió 1 vez = Marketing Qualified
        } else if ((clicks >= 1 || opens >= 3) && currentLcIdx < 1) {
            newLifecycle = 'lead'; // Engagement pasivo = al menos Lead
        }

        // Aplicar cambios si hubo promoción
        const updates = {};
        if (newSegment !== crmLead.segment) updates.segment = newSegment;
        if (newLifecycle !== crmLead.lifecycleStage) updates.lifecycleStage = newLifecycle;

        if (Object.keys(updates).length > 0) {
            await CrmLead.findByIdAndUpdate(crmLeadId, updates);
            console.log(`[CRM Promoción] 🚀 Lead ${crmLeadId}: segment=${crmLead.segment}→${newSegment}, lifecycle=${crmLead.lifecycleStage}→${newLifecycle} (trigger: ${triggerType})`);
        }

    } catch (err) {
        console.warn(`[CRM Promoción] ⚠️ Error en promoción automática: ${err.message}`);
    }
}

// =========================================================================
// HELPERS — Extracción de datos
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
