/**
 * services/LeadService.js
 * Servicio centralizado de lógica de negocio para Leads.
 * Separa la lógica del controlador (rutas) para reutilización y testing.
 * 
 * Soporta dos embudos:
 *   - teacher: Profesor que quiere usar la plataforma
 *   - client:  Estudiante/apoderado que quiere clases
 */
const Lead = require('../models/Lead');
const eventService = require('./EventService');
const emailService = require('./EmailService');
const generateLeadConfirmationEmail = require('../templates/emails/leadConfirmation');
const { detectCountryFromPhone } = require('../utils/timezoneHelper');

// CalendarService lazy load (googleapis ~60MB)
let _calendarService = null;
function getCalendarService() {
    if (!_calendarService) {
        _calendarService = require('./CalendarService');
    }
    return _calendarService;
}

// Mapa de fuentes válidas
const SOURCE_MAP = {
    'manual': 'other',
    'landing': 'landing',
    'referral': 'referral',
    'social': 'social',
    'event': 'other',
    'ads': 'other',
    'other': 'other'
};

class LeadService {

    /**
     * Crea o actualiza un lead.
     * Si el email ya existe, actualiza los datos en vez de duplicar.
     * @param {Object} data - Datos del lead
     * @param {boolean} isManual - Si viene del admin (true) o landing (false)
     * @returns {Object} { success, message, lead, isExisting }
     */
    static async createOrUpdate(data, isManual = false) {
        const {
            name, email, whatsapp, background,
            utmSource, utmMedium, utmCampaign, notes,
            trackingData, country, timezone, status,
            type, clientType, beneficiaries
        } = data;

        // Validación básica
        if (!email) {
            return { success: false, status: 400, message: 'Email es requerido' };
        }
        // Para leads manuales (admin), requerir nombre y whatsapp
        if (isManual && (!name || !whatsapp)) {
            return { success: false, status: 400, message: 'Nombre, email y WhatsApp son requeridos' };
        }

        // Verificar duplicado
        const existing = await Lead.findOne({ email: email.toLowerCase() });
        if (existing) {
            return await this._updateExisting(existing, data, isManual);
        }

        // Crear nuevo lead
        return await this._createNew(data, isManual);
    }

    /**
     * Actualiza un lead existente (por email duplicado)
     * @private
     */
    static async _updateExisting(lead, data, isManual) {
        lead.name = data.name;
        lead.whatsapp = data.whatsapp;
        if (data.background) lead.background = data.background;
        if (data.notes) lead.notes = data.notes;
        if (data.country) lead.country = data.country;
        if (data.timezone) lead.timezone = data.timezone;
        if (data.status) lead.status = data.status;
        if (data.type) lead.type = data.type;
        if (data.clientType) lead.clientType = data.clientType;
        if (data.beneficiaries) lead.beneficiaries = data.beneficiaries;

        if (data.trackingData) {
            lead.trackingData = {
                ...lead.trackingData,
                ...data.trackingData,
                landingPageViews: (lead.trackingData.landingPageViews || 0) + 1
            };
        }

        await lead.save();
        console.log(`[LeadService] 📧 Lead existente actualizado: ${lead.email} (type: ${lead.type})`);

        return {
            success: true,
            status: 200,
            message: isManual
                ? 'Lead actualizado exitosamente.'
                : 'Gracias, ya tenemos tu información registrada.',
            lead,
            isExisting: true
        };
    }

    /**
     * Crea un lead nuevo
     * @private
     */
    static async _createNew(data, isManual) {
        const sourceValue = isManual && data.utmSource
            ? (SOURCE_MAP[data.utmSource] || 'other')
            : 'landing';

        const leadData = {
            name: data.name.trim(),
            email: data.email.toLowerCase().trim(),
            whatsapp: data.whatsapp.trim(),
            background: data.background ? data.background.trim() : '',
            availability: Array.isArray(data.availability) ? data.availability : [],
            source: sourceValue,
            utmSource: data.utmSource || '',
            utmMedium: data.utmMedium || '',
            utmCampaign: data.utmCampaign || '',
            notes: data.notes ? data.notes.trim() : '',
            type: data.type || 'teacher',
            clientType: data.type === 'client' ? (data.clientType || 'adult_learner') : null,
            beneficiaries: data.type === 'client' && data.beneficiaries ? data.beneficiaries : []
        };

        // Detectar país
        if (data.country && data.timezone) {
            leadData.country = data.country.trim();
            leadData.timezone = data.timezone.trim();
        } else {
            const detected = detectCountryFromPhone(data.whatsapp);
            if (detected.country) {
                leadData.country = detected.country;
                leadData.timezone = detected.timezone;
            }
        }

        // Estado inicial
        if (data.status) leadData.status = data.status;

        // Tracking data
        if (data.trackingData) {
            leadData.trackingData = {
                fbClickId: data.trackingData.fbClickId || '',
                gClientId: data.trackingData.gClientId || '',
                landingPageViews: 1,
                formStarted: data.trackingData.formStarted || false,
                referrer: data.trackingData.referrer || ''
            };
        }

        // Auto-programar primer seguimiento en 2 días (solo desde landing)
        if (!isManual) {
            const firstFollowUp = new Date();
            firstFollowUp.setDate(firstFollowUp.getDate() + 2);
            leadData.nextFollowUp = firstFollowUp;
        }

        const lead = await Lead.create(leadData);
        const typeLabel = leadData.type === 'teacher' ? '👨‍🏫 Profesor' : '👤 Cliente';
        console.log(`[LeadService] ✅ Nuevo lead ${typeLabel}${isManual ? ' (manual)' : ''}: ${lead.name} (${lead.email})`);

        // Emitir evento para CRM Bridge
        eventService.emitSafe('lead.created', {
            leadId: lead._id,
            name: lead.name,
            email: lead.email,
            type: lead.type,
            source: lead.source,
            isManual
        });

        // Enviar email de confirmación al profesor (solo desde landing, no manual)
        if (!isManual && leadData.type === 'teacher') {
            try {
                const html = generateLeadConfirmationEmail({ name: lead.name });
                await emailService.send({
                    to: lead.email,
                    subject: '🎹 Tu postulación a PianoLink fue recibida',
                    html
                });
                console.log(`[LeadService] 📧 Email confirmación enviado: ${lead.email}`);
            } catch (emailErr) {
                // No bloquear el flujo si falla el email
                console.error(`[LeadService] ⚠️ Error enviando email confirmación a ${lead.email}:`, emailErr.message);
            }
        }

        return {
            success: true,
            status: 201,
            message: isManual
                ? 'Lead registrado exitosamente.'
                : leadData.type === 'teacher'
                    ? 'Postulación recibida. Revisaremos tu perfil y te contactaremos en 48 horas.'
                    : '¡Gracias por tu interés! Te contactaremos pronto para agendar tu primera clase.',
            lead,
            isExisting: false
        };
    }

    /**
     * Obtiene estadísticas por estado, opcionalmente filtrado por tipo
     * @param {string|null} type - 'teacher', 'client', o null para todos
     */
    static async getStats(type = null) {
        const match = type ? { type } : {};
        const statsData = await Lead.aggregate([
            { $match: match },
            { $group: { _id: '$status', count: { $sum: 1 } } }
        ]);

        const stats = { new: 0, contacted: 0, qualified: 0, converted: 0, rejected: 0 };
        statsData.forEach(s => { stats[s._id] = s.count; });

        const total = Object.values(stats).reduce((a, b) => a + b, 0);
        const recent = await Lead.find(match)
            .sort({ createdAt: -1 })
            .limit(5)
            .select('name email status type createdAt');

        return { total, byStatus: stats, recent };
    }

    /**
     * Obtiene todos los leads con filtros opcionales
     * @param {Object} filters - { type, status, search, page, limit }
     */
    static async getAll(filters = {}) {
        const query = {};

        if (filters.type && filters.type !== 'all') {
            query.type = filters.type;
        }
        if (filters.status && filters.status !== 'all') {
            query.status = filters.status;
        }
        if (filters.search) {
            const s = filters.search.toLowerCase();
            query.$or = [
                { name: { $regex: s, $options: 'i' } },
                { email: { $regex: s, $options: 'i' } },
                { whatsapp: { $regex: s, $options: 'i' } }
            ];
        }

        const leads = await Lead.find(query)
            .sort({ createdAt: -1 })
            .lean();

        return leads;
    }

    /**
     * Obtiene un lead por ID
     */
    static async getById(id) {
        return await Lead.findById(id);
    }

    /**
     * Actualiza notas de un lead
     */
    static async updateNotes(id, notes) {
        const lead = await Lead.findById(id);
        if (!lead) return { success: false, status: 404, message: 'Lead no encontrado' };

        lead.notes = notes;
        await lead.save();
        console.log(`[LeadService] 📝 Notas actualizadas: ${lead.email}`);

        return { success: true, lead };
    }

    /**
     * Cambia el estado de un lead con timestamps automáticos
     */
    static async changeStatus(id, newStatus) {
        const validStatuses = ['new', 'contacted', 'qualified', 'converted', 'rejected'];
        if (!validStatuses.includes(newStatus)) {
            return { success: false, status: 400, message: 'Estado inválido' };
        }

        const lead = await Lead.findById(id);
        if (!lead) return { success: false, status: 404, message: 'Lead no encontrado' };

        const oldStatus = lead.status; // Guardar estado anterior para evento

        if (newStatus === 'contacted' && !lead.contactedAt) {
            lead.contactedAt = new Date();
        }
        if (newStatus === 'converted' && !lead.convertedAt) {
            lead.convertedAt = new Date();
        }

        lead.status = newStatus;
        await lead.save();
        console.log(`[LeadService] ✅ ${lead.email} → ${newStatus}`);

        // Emitir evento para CRM Bridge
        eventService.emitSafe('lead.statusChanged', {
            leadId: lead._id,
            email: lead.email,
            oldStatus,
            newStatus
        });

        return { success: true, lead };
    }

    /**
     * Edita datos generales de un lead
     * Solo nombre y email son obligatorios; el resto es opcional
     */
    static async update(id, data) {
        const { name, email } = data;
        if (!name || !email) {
            return { success: false, status: 400, message: 'Nombre y email son requeridos' };
        }

        // Verificar email duplicado en otro lead
        const dup = await Lead.findOne({ email: email.toLowerCase(), _id: { $ne: id } });
        if (dup) return { success: false, status: 400, message: 'Ya existe otro lead con ese email' };

        const updateData = {
            name: name.trim(),
            email: email.toLowerCase().trim()
        };

        // Campos opcionales
        if (data.whatsapp !== undefined) updateData.whatsapp = data.whatsapp.trim();
        if (data.background !== undefined) updateData.background = data.background.trim();
        if (data.country) updateData.country = data.country.trim();
        if (data.timezone) updateData.timezone = data.timezone.trim();
        if (data.status !== undefined) updateData.status = data.status;
        if (data.type !== undefined) updateData.type = data.type;
        if (data.notes !== undefined) updateData.notes = data.notes;
        if (data.source !== undefined) updateData.source = data.source;
        if (data.utmSource !== undefined) {
            updateData.utmSource = data.utmSource;
            updateData.source = SOURCE_MAP[data.utmSource] || 'other';
        }

        const lead = await Lead.findByIdAndUpdate(id, updateData, { new: true, runValidators: true });
        if (!lead) return { success: false, status: 404, message: 'Lead no encontrado' };

        console.log(`[LeadService] ✏️ Lead editado: ${lead.email}`);
        return { success: true, lead };
    }

    /**
     * Elimina un lead y su CrmLead asociado (cascada)
     */
    static async delete(id) {
        const lead = await Lead.findByIdAndDelete(id);
        if (!lead) return { success: false, status: 404, message: 'Lead no encontrado' };

        // Limpiar CrmLead, interacciones y conversiones asociadas
        try {
            const CrmLead = require('../crm/models/CrmLead');
            const CrmInteraction = require('../crm/models/CrmInteraction');
            const CrmConversion = require('../crm/models/CrmConversion');

            const crmLead = await CrmLead.findOneAndDelete({ leadRef: id });
            if (crmLead) {
                await CrmInteraction.deleteMany({ leadRef: crmLead._id });
                await CrmConversion.deleteMany({ leadRef: crmLead._id });
                console.log(`[LeadService] 🗑️ CrmLead y datos asociados eliminados`);
            }
        } catch (e) {
            // CRM no disponible — no bloquear el borrado del lead
            console.warn(`[LeadService] ⚠️ No se pudo limpiar CRM para lead ${id}:`, e.message);
        }

        console.log(`[LeadService] 🗑️ Lead eliminado: ${lead.email}`);
        return { success: true, message: 'Lead eliminado correctamente' };
    }

    /**
     * Agrega un seguimiento al historial de un lead
     */
    static async addFollowUp(id, { action, notes, result, nextDate }) {
        const lead = await Lead.findById(id);
        if (!lead) return { success: false, status: 404, message: 'Lead no encontrado' };

        await lead.addFollowUp(action, notes, result, nextDate ? new Date(nextDate) : null);
        console.log(`[LeadService] 📝 Seguimiento: ${lead.email} → ${action}`);

        return { success: true, lead };
    }

    /**
     * Leads con seguimiento programado para hoy
     */
    static async getFollowUpsDue() {
        return await Lead.getFollowUpsDue();
    }

    /**
     * Leads atrasados sin seguimiento (3+ días)
     */
    static async getFollowUpsOverdue() {
        return await Lead.getLeadsWithoutFollowUp();
    }

    /**
     * Exporta todos los leads para descarga
     * @param {string|null} type - filtrar por tipo
     */
    static async export(type = null) {
        const match = type ? { type } : {};
        const statsData = await Lead.aggregate([
            { $match: match },
            { $group: { _id: '$status', count: { $sum: 1 } } }
        ]);

        const stats = { new: 0, contacted: 0, qualified: 0, converted: 0, rejected: 0 };
        statsData.forEach(s => { stats[s._id] = s.count; });

        const leads = await Lead.find(match)
            .select('name email whatsapp background country timezone status source type clientType utmSource utmMedium utmCampaign notes nextFollowUp followUpHistory demoScheduled createdAt contactedAt convertedAt')
            .sort({ createdAt: -1 })
            .lean();

        return { stats, leads, total: leads.length };
    }

    /**
     * Programa una demo con integración a Google Calendar + email de confirmación
     */
    static async scheduleDemo(id, { demoDate, duration = 60 }) {
        const lead = await Lead.findById(id);
        if (!lead) return { success: false, status: 404, message: 'Lead no encontrado' };

        let calendarEventId = '';
        let meetingLink = '';

        try {
            const startDateTime = new Date(demoDate);
            const endDateTime = new Date(startDateTime.getTime() + duration * 60000);

            let teacherEmail = null;
            if (lead.assignedTeacher) {
                const User = require('../models/User');
                const teacher = await User.findById(lead.assignedTeacher);
                if (teacher) teacherEmail = teacher.email;
            }

            const event = await getCalendarService().createEvent({
                summary: `Entrevista PianoLink - ${lead.name}`,
                startDateTime: startDateTime.toISOString(),
                endDateTime: endDateTime.toISOString(),
                attendeeEmail: lead.email,
                attendeeName: lead.name,
                teacherEmail,
                duration,
                timezone: lead.timezone || 'America/Santiago'
            });

            calendarEventId = event.id || '';
            meetingLink = event.meetingLink || event.link || '';
        } catch (err) {
            console.error('[LeadService] ⚠️ Error Calendar:', err.message);
            // Continúa sin Calendar
        }

        await lead.scheduleDemo(new Date(demoDate), calendarEventId, meetingLink);
        console.log(`[LeadService] 📅 Demo: ${lead.email} → ${demoDate}`);

        // Enviar email de confirmación de entrevista (no bloqueante)
        try {
            const generateInterviewEmail = require('../templates/emails/interviewScheduled');
            const d = new Date(demoDate);
            const days = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
            const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
            const dateFormatted = `${days[d.getDay()]} ${d.getDate()} de ${months[d.getMonth()]} a las ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
            
            const html = generateInterviewEmail({
                name: lead.name,
                dateFormatted,
                duration,
                meetingLink: meetingLink || ''
            });

            await emailService.send({
                to: lead.email,
                subject: `📅 Tu entrevista con PianoLink — ${dateFormatted}`,
                html
            });
            console.log(`[LeadService] 📧 Email de entrevista enviado a ${lead.email}`);
        } catch (emailErr) {
            console.error('[LeadService] ⚠️ Error enviando email de entrevista:', emailErr.message);
        }

        return { success: true, lead, meetingLink: meetingLink || 'No disponible' };
    }

    /**
     * Métricas de embudo por tipo
     * @param {string} type - 'teacher' o 'client'
     */
    static async getFunnelMetrics(type) {
        const pipeline = [
            { $match: { type } },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 },
                    avgDaysInStatus: {
                        $avg: {
                            $divide: [
                                { $subtract: [new Date(), '$createdAt'] },
                                1000 * 60 * 60 * 24
                            ]
                        }
                    }
                }
            }
        ];

        const data = await Lead.aggregate(pipeline);
        const metrics = {};
        data.forEach(d => {
            metrics[d._id] = {
                count: d.count,
                avgDays: Math.round(d.avgDaysInStatus)
            };
        });

        // Tasa de conversión
        const total = Object.values(metrics).reduce((a, b) => a + b.count, 0);
        const converted = metrics.converted?.count || 0;
        metrics.conversionRate = total > 0 ? ((converted / total) * 100).toFixed(1) + '%' : '0%';

        return metrics;
    }
}

module.exports = LeadService;
