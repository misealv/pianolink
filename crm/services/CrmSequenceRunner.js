/**
 * crm/services/CrmSequenceRunner.js
 * Motor de ejecución de secuencias de email.
 * 
 * Responsabilidades:
 * - Buscar leads con pasos pendientes de ejecutar
 * - Evaluar delays y condiciones
 * - Ejecutar acciones (enviar email, actualizar tags/score)
 * - Registrar interacciones y actualizar métricas
 * 
 * Se invoca desde un job cron cada N minutos.
 * Diseñado para ser idempotente y seguro en caso de restart.
 */
const CrmSequence = require('../models/CrmSequence');
const CrmLead = require('../models/CrmLead');
const CrmInteraction = require('../models/CrmInteraction');
// EmailService exporta una instancia singleton, no la clase
const emailService = require('../../services/EmailService');

/**
 * URL base del servidor para construir enlaces de tracking.
 * En producción usa APP_URL, en dev cae en localhost.
 */
function getBaseUrl() {
    return process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:3000';
}

/**
 * Genera un trackingId codificado en base64url para identificar
 * un email específico (lead + secuencia + paso).
 * @param {string} crmLeadId
 * @param {string} sequenceId
 * @param {number} stepOrder
 * @returns {string} base64url token
 */
function buildTrackingId(crmLeadId, sequenceId, stepOrder) {
    const payload = JSON.stringify({ lid: crmLeadId, sid: sequenceId, step: stepOrder });
    return Buffer.from(payload)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

/**
 * Inyecta tracking pixel (1x1) antes de </body> en el HTML del email.
 * @param {string} html
 * @param {string} trackingId
 * @returns {string} HTML con pixel insertado
 */
function injectTrackingPixel(html, trackingId) {
    const baseUrl = getBaseUrl();
    const pixelUrl = `${baseUrl}/api/crm/tracking/email/open/${trackingId}`;
    const pixelTag = `<img src="${pixelUrl}" width="1" height="1" alt="" style="display:none;width:1px;height:1px;border:0" />`;

    // Insertar antes de </body> si existe, si no al final
    if (html.includes('</body>')) {
        return html.replace('</body>', `${pixelTag}</body>`);
    }
    return html + pixelTag;
}

/**
 * Envuelve todos los <a href="..."> del HTML con redirect de tracking de clicks.
 * Excepciones: mailto:, tel:, #anchors, y enlaces de unsubscribe propios.
 * @param {string} html
 * @param {string} trackingId
 * @returns {string} HTML con links envueltos
 */
function wrapLinksWithTracking(html, trackingId) {
    const baseUrl = getBaseUrl();
    const clickBase = `${baseUrl}/api/crm/tracking/email/click/${trackingId}`;

    // Regex para <a href="URL"> — captura la URL
    return html.replace(/<a\s([^>]*?)href=["']([^"']+)["']([^>]*?)>/gi, (match, before, url, after) => {
        // No envolver mailto:, tel:, anchors, ni nuestros propios links de tracking
        if (url.startsWith('mailto:') || url.startsWith('tel:') || url.startsWith('#') || 
            url.includes('/api/crm/tracking/')) {
            return match;
        }
        const trackedUrl = `${clickBase}?url=${encodeURIComponent(url)}`;
        return `<a ${before}href="${trackedUrl}"${after}>`;
    });
}

/**
 * Añade link de desuscripción al final del HTML del email.
 * @param {string} html
 * @param {string} trackingId
 * @returns {string} HTML con link de unsub
 */
function appendUnsubscribeLink(html, trackingId) {
    const baseUrl = getBaseUrl();
    const unsubUrl = `${baseUrl}/api/crm/tracking/email/unsubscribe/${trackingId}`;
    const unsubBlock = `
<div style="text-align:center;padding:20px 0 10px;margin-top:20px;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af">
    <p>¿No quieres recibir más emails? <a href="${unsubUrl}" style="color:#6b7280;text-decoration:underline">Desuscribirme</a></p>
</div>`;

    if (html.includes('</body>')) {
        return html.replace('</body>', `${unsubBlock}</body>`);
    }
    return html + unsubBlock;
}

class CrmSequenceRunner {

    /**
     * Punto de entrada principal. Procesa todos los leads con secuencias activas.
     * Llamar desde cron cada 5-15 minutos.
     * 
     * @returns {Object} { processed, sent, errors, skipped }
     */
    static async processAll() {
        const stats = { processed: 0, sent: 0, errors: 0, skipped: 0 };

        try {
            // Buscar secuencias activas
            const activeSequences = await CrmSequence.find({ status: 'active' }).lean();

            if (activeSequences.length === 0) {
                return stats;
            }

            const sequenceIds = activeSequences.map(s => s._id);

            // Buscar leads que tengan al menos una secuencia activa
            const leads = await CrmLead.find({
                'activeSequences': {
                    $elemMatch: {
                        sequenceId: { $in: sequenceIds },
                        status: 'active'
                    }
                },
                'emailPreferences.unsubscribed': { $ne: true },
                'emailPreferences.bounced': { $ne: true }
            })
            .populate('leadRef', 'name email phone type')
            .limit(100); // Procesar en lotes de 100 para no saturar RAM

            if (leads.length === 0) {
                return stats;
            }

            // Crear mapa de secuencias para acceso rápido
            const sequenceMap = {};
            for (const seq of activeSequences) {
                sequenceMap[seq._id.toString()] = seq;
            }

            // Procesar cada lead
            for (const lead of leads) {
                for (const enrollment of lead.activeSequences) {
                    if (enrollment.status !== 'active') continue;

                    const seqId = enrollment.sequenceId?.toString();
                    const sequence = sequenceMap[seqId];
                    if (!sequence) continue;

                    try {
                        const result = await CrmSequenceRunner._processLeadStep(
                            lead, enrollment, sequence
                        );
                        stats.processed++;

                        if (result === 'sent') stats.sent++;
                        else if (result === 'skipped') stats.skipped++;
                        // 'completed' ya se contabilizó en processed, no incrementar de nuevo
                    } catch (stepError) {
                        console.error(`[SequenceRunner] Error procesando lead ${lead._id}:`, stepError.message);
                        stats.errors++;
                    }
                }
            }

            if (stats.sent > 0 || stats.errors > 0) {
                console.log(`[SequenceRunner] Ciclo completado:`, stats);
            }
        } catch (error) {
            console.error('[SequenceRunner] Error fatal en processAll:', error);
        }

        return stats;
    }

    /**
     * Procesa un paso específico para un lead en una secuencia.
     * @returns {string} 'sent' | 'skipped' | 'completed' | 'waiting'
     */
    static async _processLeadStep(lead, enrollment, sequence) {
        const steps = sequence.steps || [];
        const currentStepIndex = enrollment.currentStep || 0;

        // ¿Ya completó todos los pasos?
        if (currentStepIndex >= steps.length) {
            await CrmSequenceRunner._completeEnrollment(lead, enrollment, sequence);
            return 'completed';
        }

        const step = steps[currentStepIndex];
        if (!step) {
            await CrmSequenceRunner._completeEnrollment(lead, enrollment, sequence);
            return 'completed';
        }

        // Evaluar si el delay ya se cumplió (pasar allSteps para cálculo acumulativo)
        const ready = CrmSequenceRunner._isStepReady(enrollment, step, currentStepIndex, steps);
        if (!ready) {
            return 'waiting';
        }

        // Ejecutar la acción del paso
        let result = 'skipped';

        switch (step.action) {
            case 'send_email':
                result = await CrmSequenceRunner._executeSendEmail(lead, step, sequence);
                break;

            case 'wait':
                // El wait solo consume delay, ya evaluado arriba
                result = 'sent'; // Se "ejecutó" el wait
                break;

            case 'condition':
                result = await CrmSequenceRunner._executeCondition(lead, enrollment, step, steps);
                break;

            case 'update_tag':
                result = await CrmSequenceRunner._executeUpdateTag(lead, step);
                break;

            case 'update_score':
                result = await CrmSequenceRunner._executeUpdateScore(lead, step);
                break;

            default:
                console.warn(`[SequenceRunner] Acción desconocida: ${step.action}`);
                result = 'skipped';
        }

        // Si la condición redirigió a otro paso, no avanzar linealmente
        if (step.action === 'condition' && result === 'redirected') {
            await lead.save();
            return 'sent';
        }

        // Avanzar al siguiente paso
        enrollment.currentStep = currentStepIndex + 1;

        // ¿Era el último paso?
        if (enrollment.currentStep >= steps.length) {
            await CrmSequenceRunner._completeEnrollment(lead, enrollment, sequence);
            return 'completed';
        }

        await lead.save();

        // Actualizar métricas del paso en la secuencia
        if (result === 'sent' && step.action === 'send_email') {
            await CrmSequence.updateOne(
                { _id: sequence._id, 'steps._id': step._id },
                { $inc: { 'steps.$.metrics.sent': 1 } }
            );
        }

        return result;
    }

    /**
     * Evalúa si un paso está listo para ejecutarse según su delay.
     */
    static _isStepReady(enrollment, step, stepIndex, allSteps) {
        const delayHours = step.delayHours || 0;
        if (delayHours === 0 && stepIndex === 0) return true; // Primer paso sin delay

        const now = new Date();
        const referenceTime = enrollment.startedAt;
        if (!referenceTime) return true;

        let totalDelayHours = 0;

        switch (step.delayType) {
            case 'after_trigger':
                // Solo el delay de este paso desde el inicio de la secuencia
                totalDelayHours = delayHours;
                break;
            case 'after_previous':
            default:
                // Sumar delays acumulativos de todos los pasos anteriores + el actual
                if (allSteps && allSteps.length > 0) {
                    for (let i = 0; i <= stepIndex; i++) {
                        totalDelayHours += (allSteps[i]?.delayHours || 0);
                    }
                } else {
                    totalDelayHours = delayHours;
                }
                break;
        }

        const totalDelayMs = totalDelayHours * 60 * 60 * 1000;
        const readyAt = new Date(referenceTime.getTime() + totalDelayMs);

        return now >= readyAt;
    }

    // =========================================================================
    // EJECUTORES DE ACCIONES
    // =========================================================================

    /**
     * Envía un email del paso de la secuencia.
     * Inyecta pixel de tracking, envuelve links, y añade link de unsub.
     */
    static async _executeSendEmail(lead, step, sequence) {
        try {
            const leadData = lead.leadRef;
            if (!leadData || !leadData.email) {
                console.warn(`[SequenceRunner] Lead ${lead._id} sin email, saltando`);
                return 'skipped';
            }

            // Renderizar variables en subject y body
            const variables = CrmSequenceRunner._buildVariables(lead);
            const subject = CrmSequenceRunner._renderTemplate(step.email?.subject || '', variables);
            let html = CrmSequenceRunner._renderTemplate(step.email?.bodyHtml || '', variables);

            if (!subject || !html) {
                console.warn(`[SequenceRunner] Paso sin subject/body, saltando`);
                return 'skipped';
            }

            // === EMAIL ANALYTICS: inyectar tracking ===
            const trackingId = buildTrackingId(
                lead._id.toString(),
                sequence._id.toString(),
                step.order
            );

            // 1. Añadir link de desuscripción (antes del pixel para orden correcto)
            html = appendUnsubscribeLink(html, trackingId);
            // 2. Envolver links con redirect de tracking de clicks
            html = wrapLinksWithTracking(html, trackingId);
            // 3. Inyectar pixel de tracking de apertura (1x1 GIF)
            html = injectTrackingPixel(html, trackingId);

            // Enviar via EmailService — capturar el ID de Resend
            const sendResult = await emailService.send({
                to: leadData.email,
                subject,
                html
            });
            const resendEmailId = sendResult?.id || '';

            // Registrar interacción con emailId de Resend vinculado
            await CrmInteraction.create({
                leadRef: lead._id,
                type: 'email_sent',
                channel: 'email',
                metadata: {
                    emailId: resendEmailId,
                    emailSubject: subject,
                    emailSequenceId: sequence._id,
                    emailStepNumber: step.order,
                    notes: `Secuencia: ${sequence.name} — Paso ${step.order}`
                },
                timestamp: new Date()
            });

            return 'sent';
        } catch (error) {
            console.error(`[SequenceRunner] Error enviando email:`, error.message);

            // Si bounced, marcar el lead
            if (error.message?.includes('bounce') || error.statusCode === 400) {
                lead.emailPreferences.bounced = true;
                lead.emailPreferences.bouncedAt = new Date();
                await lead.save();
            }

            return 'skipped';
        }
    }

    /**
     * Evalúa una condición y redirige al paso correspondiente.
     * Pre-carga datos asíncronos como emailOpened si es necesario.
     */
    static async _executeCondition(lead, enrollment, step, allSteps) {
        try {
            const { field, operator, value, ifTrueStep, ifFalseStep } = step.condition || {};

            if (!field || !operator) {
                return 'skipped';
            }

            // Pre-cargar emailOpened desde DB si la condición lo requiere
            if (field === 'emailOpened') {
                const openCount = await CrmInteraction.countDocuments({
                    leadRef: lead._id,
                    type: 'email_open',
                    'metadata.emailSequenceId': enrollment.sequenceId
                });
                lead._emailOpenedCache = openCount > 0;
            }

            const leadValue = CrmSequenceRunner._getLeadField(lead, field);
            const conditionMet = CrmSequenceRunner._evaluateCondition(leadValue, operator, value);

            // Determinar siguiente paso (ifTrueStep/ifFalseStep almacenan step.order, 1-based)
            const targetStepOrder = conditionMet
                ? (ifTrueStep >= 1 ? ifTrueStep : -1)
                : (ifFalseStep >= 1 ? ifFalseStep : -1);

            if (targetStepOrder >= 1) {
                // Buscar el paso por su campo order (1-based)
                const targetIndex = allSteps.findIndex(s => s.order === targetStepOrder);
                if (targetIndex >= 0 && targetIndex < allSteps.length) {
                    enrollment.currentStep = targetIndex;
                    return 'redirected';
                }
            }

            // Si no hay redirección válida, avanzar normalmente
            return 'sent';
        } catch (error) {
            console.error('[SequenceRunner] Error en condición:', error.message);
            return 'skipped';
        }
    }

    /**
     * Añadir o remover tag del lead.
     */
    static async _executeUpdateTag(lead, step) {
        try {
            const { action, tag } = step.tagAction || {};
            if (!tag) return 'skipped';

            if (action === 'add' && !lead.tags.includes(tag)) {
                lead.tags.push(tag);
            } else if (action === 'remove') {
                lead.tags = lead.tags.filter(t => t !== tag);
            }

            await lead.save();
            return 'sent';
        } catch (error) {
            console.error('[SequenceRunner] Error actualizando tag:', error.message);
            return 'skipped';
        }
    }

    /**
     * Incrementar/decrementar score del lead.
     */
    static async _executeUpdateScore(lead, step) {
        try {
            const { delta, reason } = step.scoreAction || {};
            if (!delta) return 'skipped';

            const newScore = Math.max(0, Math.min(100, (lead.score || 0) + delta));
            lead.score = newScore;
            lead.scoreHistory.push({
                date: new Date(),
                score: newScore,
                reason: reason || `sequence_step`
            });

            await lead.save();
            return 'sent';
        } catch (error) {
            console.error('[SequenceRunner] Error actualizando score:', error.message);
            return 'skipped';
        }
    }

    // =========================================================================
    // HELPERS
    // =========================================================================

    /**
     * Marca un enrollment como completado.
     */
    static async _completeEnrollment(lead, enrollment, sequence) {
        enrollment.status = 'completed';
        enrollment.completedAt = new Date();
        await lead.save();

        await CrmSequence.findByIdAndUpdate(sequence._id, {
            $inc: { 'stats.totalCompleted': 1 }
        });

        console.log(`[SequenceRunner] Lead ${lead._id} completó secuencia "${sequence.name}"`);
    }

    /**
     * Construye un mapa de variables para renderizar templates.
     */
    static _buildVariables(lead) {
        const leadData = lead.leadRef || {};
        const firstName = (leadData.name || 'Usuario').split(' ')[0];
        return {
            // Variables con prefijo lead.
            'lead.name': leadData.name || 'Usuario',
            'lead.firstName': firstName,
            'lead.email': leadData.email || '',
            'lead.phone': leadData.phone || '',
            'lead.type': leadData.type || '',
            'lead.score': String(lead.score || 0),
            'lead.segment': lead.segment || 'cold',
            'lead.locale': lead.locale || 'es',
            'lead.tags': (lead.tags || []).join(', '),
            // Aliases directos para uso en templates
            'nombre': firstName,
            'name': leadData.name || 'Usuario',
            'email': leadData.email || '',
            'firstName': firstName
        };
    }

    /**
     * Renderiza un template reemplazando {{variable}} con su valor.
     */
    static _renderTemplate(template, variables) {
        if (!template) return '';
        return template.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
            const trimmedKey = key.trim();
            return variables[trimmedKey] !== undefined ? variables[trimmedKey] : match;
        });
    }

    /**
     * Obtiene un campo del lead para evaluación de condiciones.
     * emailOpened consulta interacciones reales de tracking.
     */
    static _getLeadField(lead, fieldName) {
        switch (fieldName) {
            case 'score': return lead.score;
            case 'segment': return lead.segment;
            case 'tag': return lead.tags;
            case 'tags': return lead.tags;
            case 'lifecycleStage': return lead.lifecycleStage;
            case 'emailOpened':
                // Buscar si existe interacción email_open para este lead (síncrono: usa cache si existe)
                // Para evaluación en tiempo real, se consulta en _executeCondition
                return lead._emailOpenedCache || false;
            default: return undefined;
        }
    }

    /**
     * Evalúa una condición simple.
     */
    static _evaluateCondition(fieldValue, operator, conditionValue) {
        switch (operator) {
            case 'eq': return fieldValue === conditionValue;
            case 'ne': return fieldValue !== conditionValue;
            case 'gt': return Number(fieldValue) > Number(conditionValue);
            case 'lt': return Number(fieldValue) < Number(conditionValue);
            case 'contains':
                if (Array.isArray(fieldValue)) return fieldValue.includes(conditionValue);
                return String(fieldValue).includes(String(conditionValue));
            case 'not_contains':
                if (Array.isArray(fieldValue)) return !fieldValue.includes(conditionValue);
                return !String(fieldValue).includes(String(conditionValue));
            default: return false;
        }
    }

    // =========================================================================
    // PROCESAMIENTO INMEDIATO (para paso 0 sin delay)
    // =========================================================================

    /**
     * Procesa inmediatamente los pasos pendientes de un lead específico.
     * Se usa después de auto-enrollar para enviar el Email 1 sin esperar el cron.
     * Solo procesa pasos con delayHours === 0 (inmediatos).
     * @param {string} crmLeadId - ID del CrmLead
     */
    static async processLeadImmediate(crmLeadId) {
        try {
            const lead = await CrmLead.findById(crmLeadId)
                .populate('leadRef', 'name email phone type');

            if (!lead || !lead.activeSequences || lead.activeSequences.length === 0) return;

            // Buscar secuencias activas de este lead
            const activeEnrollments = lead.activeSequences.filter(e => e.status === 'active');
            if (activeEnrollments.length === 0) return;

            const seqIds = activeEnrollments.map(e => e.sequenceId);
            const sequences = await CrmSequence.find({ _id: { $in: seqIds }, status: 'active' }).lean();
            const seqMap = {};
            for (const s of sequences) seqMap[s._id.toString()] = s;

            for (const enrollment of activeEnrollments) {
                const seq = seqMap[enrollment.sequenceId?.toString()];
                if (!seq) continue;

                const stepIndex = enrollment.currentStep || 0;
                const step = seq.steps?.[stepIndex];
                if (!step) continue;

                // Solo procesar si es step 0 con delay 0 (inmediato)
                if (stepIndex === 0 && (step.delayHours || 0) === 0) {
                    const result = await CrmSequenceRunner._processLeadStep(lead, enrollment, seq);
                    if (result === 'sent') {
                        console.log(`[SequenceRunner] ⚡ Email inmediato enviado a ${lead.leadRef?.email || lead._id} (secuencia: ${seq.name})`);
                    }
                }
            }
        } catch (error) {
            console.error(`[SequenceRunner] Error en processLeadImmediate(${crmLeadId}):`, error.message);
        }
    }
}

module.exports = CrmSequenceRunner;
