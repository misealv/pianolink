/**
 * crm/services/CrmSequenceService.js
 * Lógica de negocio para secuencias de email automatizadas.
 * 
 * Responsabilidades:
 * - CRUD de secuencias
 * - Enrollar/desenrollar leads
 * - Métricas agregadas
 * - Duplicación de secuencias
 * 
 * NO ejecuta los pasos — eso lo hace CrmSequenceRunner.
 */
const CrmSequence = require('../models/CrmSequence');
const CrmLead = require('../models/CrmLead');
const CrmInteraction = require('../models/CrmInteraction');
const mongoose = require('mongoose');

class CrmSequenceService {

    // =========================================================================
    // CRUD
    // =========================================================================

    /**
     * Listar secuencias con filtros opcionales.
     * @param {Object} query - { status, type, page, limit }
     */
    static async list(query = {}) {
        try {
            const { status, type, page = 1, limit = 20 } = query;
            const filter = {};

            if (status) filter.status = status;
            if (type) filter.type = type;

            const skip = (Number(page) - 1) * Number(limit);

            const [sequences, total] = await Promise.all([
                CrmSequence.find(filter)
                    .sort({ updatedAt: -1 })
                    .skip(skip)
                    .limit(Number(limit))
                    .populate('createdBy', 'name email')
                    .lean(),
                CrmSequence.countDocuments(filter)
            ]);

            return {
                success: true,
                data: sequences,
                pagination: {
                    page: Number(page),
                    limit: Number(limit),
                    total,
                    pages: Math.ceil(total / Number(limit))
                }
            };
        } catch (error) {
            console.error('[CrmSequenceService] Error en list:', error);
            return { success: false, status: 500, message: 'Error al listar secuencias' };
        }
    }

    /**
     * Obtener secuencia por ID con estadísticas de leads inscritos.
     */
    static async getById(sequenceId) {
        try {
            if (!mongoose.Types.ObjectId.isValid(sequenceId)) {
                return { success: false, status: 400, message: 'ID de secuencia inválido' };
            }

            const sequence = await CrmSequence.findById(sequenceId)
                .populate('createdBy', 'name email')
                .lean();

            if (!sequence) {
                return { success: false, status: 404, message: 'Secuencia no encontrada' };
            }

            // Contar leads activos en esta secuencia
            const enrolledCount = await CrmLead.countDocuments({
                'activeSequences.sequenceId': sequenceId,
                'activeSequences.status': 'active'
            });

            return {
                success: true,
                data: { ...sequence, enrolledCount }
            };
        } catch (error) {
            console.error('[CrmSequenceService] Error en getById:', error);
            return { success: false, status: 500, message: 'Error al obtener secuencia' };
        }
    }

    /**
     * Crear nueva secuencia.
     * @param {Object} data - Datos de la secuencia
     * @param {string} createdBy - ID del usuario admin
     */
    static async create(data, createdBy) {
        try {
            const { name, type, targetAudience, steps, trigger } = data;

            if (!name || !name.trim()) {
                return { success: false, status: 400, message: 'El nombre es obligatorio' };
            }

            // Validar y numerar pasos si no vienen con order
            const processedSteps = (steps || []).map((step, idx) => ({
                ...step,
                order: step.order ?? idx + 1
            }));

            const sequence = await CrmSequence.create({
                name: name.trim(),
                type: type || 'custom',
                status: 'draft', // Siempre inicia como borrador
                targetAudience: targetAudience || 'all',
                steps: processedSteps,
                trigger: trigger || { event: 'manual' },
                createdBy
            });

            return { success: true, data: sequence };
        } catch (error) {
            console.error('[CrmSequenceService] Error en create:', error);
            if (error.name === 'ValidationError') {
                return { success: false, status: 400, message: error.message };
            }
            return { success: false, status: 500, message: 'Error al crear secuencia' };
        }
    }

    /**
     * Actualizar secuencia (solo si está en draft o paused).
     */
    static async update(sequenceId, data) {
        try {
            if (!mongoose.Types.ObjectId.isValid(sequenceId)) {
                return { success: false, status: 400, message: 'ID de secuencia inválido' };
            }

            const sequence = await CrmSequence.findById(sequenceId);
            if (!sequence) {
                return { success: false, status: 404, message: 'Secuencia no encontrada' };
            }

            // Solo editar si no está activa (evitar cambios en vivo sin pausa)
            if (sequence.status === 'active') {
                return {
                    success: false,
                    status: 400,
                    message: 'Pausa la secuencia antes de editarla'
                };
            }

            // Campos editables
            const editableFields = ['name', 'type', 'targetAudience', 'steps', 'trigger'];
            for (const field of editableFields) {
                if (data[field] !== undefined) {
                    sequence[field] = data[field];
                }
            }

            // Re-numerar pasos
            if (data.steps) {
                sequence.steps = data.steps.map((step, idx) => ({
                    ...step,
                    order: step.order ?? idx + 1
                }));
            }

            sequence.updatedAt = new Date();
            await sequence.save();

            return { success: true, data: sequence };
        } catch (error) {
            console.error('[CrmSequenceService] Error en update:', error);
            return { success: false, status: 500, message: 'Error al actualizar secuencia' };
        }
    }

    /**
     * Cambiar estado de la secuencia.
     * Transiciones válidas: draft→active, active→paused, paused→active, *→archived
     */
    static async updateStatus(sequenceId, newStatus) {
        try {
            const sequence = await CrmSequence.findById(sequenceId);
            if (!sequence) {
                return { success: false, status: 404, message: 'Secuencia no encontrada' };
            }

            const validTransitions = {
                draft: ['active', 'archived'],
                active: ['paused', 'archived'],
                paused: ['active', 'archived'],
                archived: [] // Estado final
            };

            const allowed = validTransitions[sequence.status] || [];
            if (!allowed.includes(newStatus)) {
                return {
                    success: false,
                    status: 400,
                    message: `Transición inválida: ${sequence.status} → ${newStatus}. Permitidas: ${allowed.join(', ') || 'ninguna'}`
                };
            }

            // Validar que tenga al menos un paso con email para activar
            if (newStatus === 'active') {
                const hasEmailStep = (sequence.steps || []).some(s => s.action === 'send_email');
                if (!hasEmailStep) {
                    return {
                        success: false,
                        status: 400,
                        message: 'La secuencia necesita al menos un paso de tipo send_email para activarse'
                    };
                }
            }

            sequence.status = newStatus;
            sequence.updatedAt = new Date();
            await sequence.save();

            console.log(`[CrmSequenceService] Secuencia "${sequence.name}" → ${newStatus}`);
            return { success: true, data: sequence };
        } catch (error) {
            console.error('[CrmSequenceService] Error en updateStatus:', error);
            return { success: false, status: 500, message: 'Error al cambiar estado' };
        }
    }

    /**
     * Eliminar secuencia (solo draft o archived).
     */
    static async remove(sequenceId) {
        try {
            const sequence = await CrmSequence.findById(sequenceId);
            if (!sequence) {
                return { success: false, status: 404, message: 'Secuencia no encontrada' };
            }

            if (!['draft', 'archived'].includes(sequence.status)) {
                return {
                    success: false,
                    status: 400,
                    message: 'Solo se pueden eliminar secuencias en draft o archived'
                };
            }

            // Limpiar referencias en leads
            await CrmLead.updateMany(
                { 'activeSequences.sequenceId': sequenceId },
                { $pull: { activeSequences: { sequenceId } } }
            );

            await CrmSequence.findByIdAndDelete(sequenceId);

            return { success: true, message: 'Secuencia eliminada' };
        } catch (error) {
            console.error('[CrmSequenceService] Error en remove:', error);
            return { success: false, status: 500, message: 'Error al eliminar secuencia' };
        }
    }

    // =========================================================================
    // ENROLLAMIENTO DE LEADS
    // =========================================================================

    /**
     * Inscribir un lead en una secuencia.
     * - La secuencia debe estar activa
     * - El lead no debe estar ya inscrito (con status active) en esa secuencia
     * - El lead no debe estar unsubscribed globalmente
     */
    static async enrollLead(sequenceId, crmLeadId) {
        try {
            const [sequence, lead] = await Promise.all([
                CrmSequence.findById(sequenceId),
                CrmLead.findById(crmLeadId)
            ]);

            if (!sequence) {
                return { success: false, status: 404, message: 'Secuencia no encontrada' };
            }
            if (!lead) {
                return { success: false, status: 404, message: 'Lead no encontrado' };
            }
            if (sequence.status !== 'active') {
                return { success: false, status: 400, message: 'La secuencia debe estar activa para inscribir leads' };
            }

            // Verificar preferencias de email
            if (lead.emailPreferences?.unsubscribed) {
                return { success: false, status: 400, message: 'El lead se ha desuscrito de emails' };
            }

            // Verificar si ya está inscrito activamente
            const alreadyEnrolled = (lead.activeSequences || []).some(
                s => s.sequenceId?.toString() === sequenceId && s.status === 'active'
            );
            if (alreadyEnrolled) {
                return { success: false, status: 400, message: 'El lead ya está inscrito en esta secuencia' };
            }

            // Inscribir: paso 0 = primer paso
            lead.activeSequences.push({
                sequenceId,
                currentStep: 0,
                startedAt: new Date(),
                status: 'active'
            });
            await lead.save();

            // Actualizar stats de la secuencia
            await CrmSequence.findByIdAndUpdate(sequenceId, {
                $inc: { 'stats.totalEnrolled': 1 }
            });

            // Registrar interacción
            await CrmInteraction.create({
                leadRef: crmLeadId,
                type: 'status_changed',
                channel: 'system',
                metadata: {
                    notes: `Inscrito en secuencia: ${sequence.name}`
                },
                timestamp: new Date()
            });

            console.log(`[CrmSequenceService] Lead ${crmLeadId} inscrito en secuencia "${sequence.name}"`);
            return { success: true, message: 'Lead inscrito en la secuencia' };
        } catch (error) {
            console.error('[CrmSequenceService] Error en enrollLead:', error);
            return { success: false, status: 500, message: 'Error al inscribir lead' };
        }
    }

    /**
     * Desinscribir un lead de una secuencia.
     */
    static async unenrollLead(sequenceId, crmLeadId) {
        try {
            const lead = await CrmLead.findById(crmLeadId);
            if (!lead) {
                return { success: false, status: 404, message: 'Lead no encontrado' };
            }

            const enrollment = (lead.activeSequences || []).find(
                s => s.sequenceId?.toString() === sequenceId && s.status === 'active'
            );

            if (!enrollment) {
                return { success: false, status: 400, message: 'El lead no está inscrito activamente en esta secuencia' };
            }

            // Marcar como completado manualmente
            enrollment.status = 'completed';
            enrollment.completedAt = new Date();
            await lead.save();

            return { success: true, message: 'Lead desinscrito de la secuencia' };
        } catch (error) {
            console.error('[CrmSequenceService] Error en unenrollLead:', error);
            return { success: false, status: 500, message: 'Error al desinscribir lead' };
        }
    }

    /**
     * Listar leads inscritos en una secuencia con su progreso.
     */
    static async getEnrolledLeads(sequenceId, query = {}) {
        try {
            const { status = 'active', page = 1, limit = 20 } = query;
            const skip = (Number(page) - 1) * Number(limit);

            // Usar $elemMatch para garantizar que sequenceId y status coincidan en EL MISMO elemento del array
            const elemMatchCondition = { sequenceId: new mongoose.Types.ObjectId(sequenceId) };
            if (status && status !== 'all') {
                elemMatchCondition.status = status;
            }
            const filter = {
                activeSequences: { $elemMatch: elemMatchCondition }
            };

            const [leads, total] = await Promise.all([
                CrmLead.find(filter)
                    .select('leadRef score segment tags activeSequences emailPreferences')
                    .populate('leadRef', 'name email phone type')
                    .skip(skip)
                    .limit(Number(limit))
                    .lean(),
                CrmLead.countDocuments(filter)
            ]);

            // Extraer solo la info de enrollment relevante
            const enrichedLeads = leads.map(lead => {
                const enrollment = (lead.activeSequences || []).find(
                    s => s.sequenceId?.toString() === sequenceId
                );
                return {
                    _id: lead._id,
                    leadRef: lead.leadRef,
                    score: lead.score,
                    segment: lead.segment,
                    enrollment: enrollment ? {
                        currentStep: enrollment.currentStep,
                        status: enrollment.status,
                        startedAt: enrollment.startedAt,
                        completedAt: enrollment.completedAt
                    } : null
                };
            });

            return {
                success: true,
                data: enrichedLeads,
                pagination: {
                    page: Number(page),
                    limit: Number(limit),
                    total,
                    pages: Math.ceil(total / Number(limit))
                }
            };
        } catch (error) {
            console.error('[CrmSequenceService] Error en getEnrolledLeads:', error);
            return { success: false, status: 500, message: 'Error al listar leads inscritos' };
        }
    }

    // =========================================================================
    // MÉTRICAS Y UTILIDADES
    // =========================================================================

    /**
     * Obtener métricas agregadas de una secuencia.
     */
    static async getMetrics(sequenceId) {
        try {
            const metrics = await CrmSequence.getMetricsSummary(sequenceId);
            if (!metrics) {
                return { success: false, status: 404, message: 'Secuencia no encontrada' };
            }

            // Contar leads por estado de enrollment
            const [activeLeads, pausedLeads, completedLeads] = await Promise.all([
                CrmLead.countDocuments({
                    'activeSequences': {
                        $elemMatch: { sequenceId, status: 'active' }
                    }
                }),
                CrmLead.countDocuments({
                    'activeSequences': {
                        $elemMatch: { sequenceId, status: 'paused' }
                    }
                }),
                CrmLead.countDocuments({
                    'activeSequences': {
                        $elemMatch: { sequenceId, status: 'completed' }
                    }
                })
            ]);

            return {
                success: true,
                data: {
                    ...metrics,
                    leadBreakdown: {
                        active: activeLeads,
                        paused: pausedLeads,
                        completed: completedLeads
                    }
                }
            };
        } catch (error) {
            console.error('[CrmSequenceService] Error en getMetrics:', error);
            return { success: false, status: 500, message: 'Error al obtener métricas' };
        }
    }

    /**
     * Duplicar una secuencia (sin leads inscritos, en estado draft).
     */
    static async duplicate(sequenceId, createdBy) {
        try {
            const original = await CrmSequence.findById(sequenceId).lean();
            if (!original) {
                return { success: false, status: 404, message: 'Secuencia no encontrada' };
            }

            // Resetear métricas de cada paso
            const cleanSteps = (original.steps || []).map(step => ({
                ...step,
                _id: new mongoose.Types.ObjectId(),
                metrics: { sent: 0, opened: 0, clicked: 0, bounced: 0, unsubscribed: 0, skipped: 0 }
            }));

            const copy = await CrmSequence.create({
                name: `${original.name} (copia)`,
                type: original.type,
                status: 'draft',
                targetAudience: original.targetAudience,
                steps: cleanSteps,
                trigger: original.trigger,
                stats: { totalEnrolled: 0, totalCompleted: 0, totalUnsubscribed: 0 },
                createdBy
            });

            return { success: true, data: copy };
        } catch (error) {
            console.error('[CrmSequenceService] Error en duplicate:', error);
            return { success: false, status: 500, message: 'Error al duplicar secuencia' };
        }
    }
}

module.exports = CrmSequenceService;
