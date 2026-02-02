/**
 * routes/leadRoutes.js
 * API para gestión de leads (profesores interesados)
 */
const express = require('express');
const router = express.Router();
const Lead = require('../models/Lead');
const CalendarService = require('../services/CalendarService');
const { detectCountryFromPhone } = require('../utils/timezoneHelper');

/**
 * POST /api/leads
 * Registra un nuevo lead desde la landing page o manualmente desde admin
 */
router.post('/', async (req, res) => {
    try {
        const { name, email, whatsapp, background, utmSource, utmMedium, utmCampaign, notes, isManual, trackingData, country, timezone, status } = req.body;
        
        // Validación básica
        if (!name || !email || !whatsapp) {
            return res.status(400).json({
                success: false,
                message: 'Todos los campos son requeridos'
            });
        }
        
        // Verificar si ya existe
        const existingLead = await Lead.findOne({ email: email.toLowerCase() });
        if (existingLead) {
            // Si ya existe, actualizar datos pero no crear duplicado
            existingLead.name = name;
            existingLead.whatsapp = whatsapp;
            if (background) existingLead.background = background;
            if (notes) existingLead.notes = notes;
            if (country) existingLead.country = country;
            if (timezone) existingLead.timezone = timezone;
            if (status) existingLead.status = status;
            
            // Actualizar tracking data si se proporciona
            if (trackingData) {
                existingLead.trackingData = {
                    ...existingLead.trackingData,
                    ...trackingData,
                    landingPageViews: (existingLead.trackingData.landingPageViews || 0) + 1
                };
            }
            
            await existingLead.save();
            
            console.log(`[Lead] 📧 Lead existente actualizado: ${email}`);
            
            return res.status(200).json({
                success: true,
                message: isManual 
                    ? 'Lead actualizado exitosamente.' 
                    : 'Gracias, Maestro. Ya tenemos tu información registrada.',
                isExisting: true
            });
        }
        
        // Determinar el source correcto
        let sourceValue = 'landing';
        if (isManual && utmSource) {
            // Mapear los valores del select al enum del modelo
            const sourceMap = {
                'manual': 'other',
                'landing': 'landing',
                'referral': 'referral',
                'social': 'social',
                'event': 'other',
                'ads': 'ads',
                'other': 'other'
            };
            sourceValue = sourceMap[utmSource] || 'other';
        }
        
        // Crear nuevo lead
        const leadData = {
            name: name.trim(),
            email: email.toLowerCase().trim(),
            whatsapp: whatsapp.trim(),
            background: background ? background.trim() : '',
            source: sourceValue,
            utmSource: utmSource || '',
            utmMedium: utmMedium || '',
            utmCampaign: utmCampaign || '',
            notes: notes ? notes.trim() : ''
        };
        
        // Si se proporciona país y timezone desde el formulario (manual), usarlos
        if (country && timezone) {
            leadData.country = country.trim();
            leadData.timezone = timezone.trim();
            console.log(`[Lead] 🌍 País manual: ${country} (${timezone})`);
        } else {
            // Detectar país y timezone desde WhatsApp solo si no se proporcionaron
            const detected = detectCountryFromPhone(whatsapp);
            if (detected.country) {
                leadData.country = detected.country;
                leadData.timezone = detected.timezone;
                console.log(`[Lead] 🌍 País detectado: ${detected.country} (${detected.timezone})`);
            }
        }
        
        // Establecer estado si se proporciona
        if (status) {
            leadData.status = status;
        }
        
        // Agregar tracking data si existe
        if (trackingData) {
            leadData.trackingData = {
                fbClickId: trackingData.fbClickId || '',
                gClientId: trackingData.gClientId || '',
                landingPageViews: 1,
                formStarted: trackingData.formStarted || false,
                referrer: trackingData.referrer || ''
            };
        }
        
        // Auto-programar primer seguimiento en 2 días si no es manual
        if (!isManual) {
            const firstFollowUp = new Date();
            firstFollowUp.setDate(firstFollowUp.getDate() + 2);
            leadData.nextFollowUp = firstFollowUp;
        }
        
        const lead = await Lead.create(leadData);
        
        console.log(`[Lead] ✅ Nuevo lead registrado${isManual ? ' (manual)' : ''}: ${name} (${email})`);
        
        res.status(201).json({
            success: true,
            message: isManual 
                ? 'Lead registrado exitosamente.' 
                : 'Postulación recibida. Revisaremos tu perfil y te contactaremos en 48 horas.',
            leadId: lead._id
        });
        
    } catch (error) {
        console.error('[Lead] ❌ Error al registrar lead:', error.message);
        
        // Error de validación de Mongoose
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(e => e.message);
            return res.status(400).json({
                success: false,
                message: messages.join('. ')
            });
        }
        
        // Error de duplicado (email único)
        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                message: 'Este email ya está registrado.'
            });
        }
        
        res.status(500).json({
            success: false,
            message: 'Error interno. Por favor intenta de nuevo.'
        });
    }
});

/**
 * GET /api/leads/stats
 * Obtiene estadísticas de leads (solo admin)
 */
router.get('/stats', async (req, res) => {
    try {
        const stats = await Lead.getStats();
        const total = await Lead.countDocuments();
        const recent = await Lead.find()
            .sort({ createdAt: -1 })
            .limit(5)
            .select('name email status createdAt');
        
        res.json({
            success: true,
            total,
            byStatus: stats,
            recent
        });
    } catch (error) {
        console.error('[Lead] Error obteniendo stats:', error);
        res.status(500).json({ success: false, message: 'Error interno' });
    }
});

/**
 * GET /api/leads/export
 * Exporta todos los leads con stats para Excel/CSV
 */
router.get('/export', async (req, res) => {
    try {
        // Obtener estadísticas
        const statsData = await Lead.aggregate([
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 }
                }
            }
        ]);

        const stats = {
            new: 0,
            contacted: 0,
            qualified: 0,
            converted: 0,
            rejected: 0
        };

        statsData.forEach(stat => {
            stats[stat._id] = stat.count;
        });

        // Obtener todos los leads
        const leads = await Lead.find()
            .select('name email whatsapp background status source utmSource utmMedium utmCampaign notes createdAt contactedAt convertedAt')
            .sort({ createdAt: -1 })
            .lean();

        console.log(`[Lead] 📊 Exportando ${leads.length} leads`);

        res.json({
            success: true,
            stats,
            leads,
            total: leads.length
        });

    } catch (error) {
        console.error('[Lead] Error exportando leads:', error);
        res.status(500).json({ success: false, message: 'Error al exportar' });
    }
});

/**
 * PATCH /api/leads/:id/notes
 * Actualiza las notas de un lead
 */
router.patch('/:id/notes', async (req, res) => {
    try {
        const { id } = req.params;
        const { notes } = req.body;

        const lead = await Lead.findById(id);
        if (!lead) {
            return res.status(404).json({
                success: false,
                message: 'Lead no encontrado'
            });
        }

        lead.notes = notes;
        await lead.save();

        console.log(`[Lead] 📝 Notas actualizadas: ${lead.email}`);

        res.json({
            success: true,
            message: 'Notas actualizadas',
            lead
        });

    } catch (error) {
        console.error('[Lead] Error actualizando notas:', error);
        res.status(500).json({ success: false, message: 'Error al actualizar' });
    }
});

/**
 * PATCH /api/leads/:id/status
 * Actualiza el estado de un lead
 */
router.patch('/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        const validStatuses = ['new', 'contacted', 'qualified', 'converted', 'rejected'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Estado inválido'
            });
        }

        const lead = await Lead.findById(id);
        if (!lead) {
            return res.status(404).json({
                success: false,
                message: 'Lead no encontrado'
            });
        }

        // Actualizar timestamps según estado
        if (status === 'contacted' && !lead.contactedAt) {
            lead.contactedAt = new Date();
        }
        if (status === 'converted' && !lead.convertedAt) {
            lead.convertedAt = new Date();
        }

        lead.status = status;
        await lead.save();

        console.log(`[Lead] ✅ ${lead.email} → ${status}`);

        res.json({
            success: true,
            message: 'Estado actualizado',
            lead
        });

    } catch (error) {
        console.error('[Lead] Error actualizando estado:', error);
        res.status(500).json({ success: false, message: 'Error al actualizar' });
    }
});

/**
 * PATCH /api/leads/:id
 * Edita los datos de un lead
 */
router.patch('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, email, whatsapp, background, country, timezone, status, utmSource } = req.body;
        
        // Validación
        if (!name || !email || !whatsapp) {
            return res.status(400).json({
                success: false,
                message: 'Nombre, email y whatsapp son requeridos'
            });
        }
        
        // Verificar si el nuevo email ya existe en otro lead
        if (email) {
            const existingLead = await Lead.findOne({ 
                email: email.toLowerCase(),
                _id: { $ne: id }
            });
            
            if (existingLead) {
                return res.status(400).json({
                    success: false,
                    message: 'Ya existe otro lead con ese email'
                });
            }
        }
        
        const updateData = {
            name: name.trim(),
            email: email.toLowerCase().trim(),
            whatsapp: whatsapp.trim(),
            background: background ? background.trim() : ''
        };
        
        // Actualizar país y timezone si se proporcionan
        if (country !== undefined) {
            updateData.country = country.trim();
        }
        if (timezone !== undefined) {
            updateData.timezone = timezone.trim();
        }
        
        // Actualizar estado si se proporciona
        if (status !== undefined) {
            updateData.status = status;
        }
        
        // Actualizar origen si se proporciona
        if (utmSource !== undefined) {
            updateData.utmSource = utmSource;
            // Mapear al source enum
            const sourceMap = {
                'manual': 'other',
                'landing': 'landing',
                'referral': 'referral',
                'social': 'social',
                'event': 'other',
                'ads': 'ads',
                'other': 'other'
            };
            updateData.source = sourceMap[utmSource] || 'other';
        }
        
        const lead = await Lead.findByIdAndUpdate(
            id,
            updateData,
            { new: true, runValidators: true }
        );
        
        if (!lead) {
            return res.status(404).json({
                success: false,
                message: 'Lead no encontrado'
            });
        }
        
        console.log(`[Lead] ✏️ Lead editado: ${lead.email}`);
        
        res.json({
            success: true,
            message: 'Lead actualizado correctamente',
            lead
        });
        
    } catch (error) {
        console.error('[Lead] Error editando:', error);
        res.status(500).json({
            success: false,
            message: 'Error al editar lead'
        });
    }
});

/**
 * DELETE /api/leads/:id
 * Elimina un lead por ID
 */
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const lead = await Lead.findByIdAndDelete(id);
        
        if (!lead) {
            return res.status(404).json({
                success: false,
                message: 'Lead no encontrado'
            });
        }
        
        console.log(`[Lead] 🗑️ Lead eliminado: ${lead.email}`);
        
        res.json({
            success: true,
            message: 'Lead eliminado correctamente'
        });
        
    } catch (error) {
        console.error('[Lead] Error eliminando:', error);
        res.status(500).json({
            success: false,
            message: 'Error al eliminar lead'
        });
    }
});

/**
 * POST /api/leads/:id/follow-up
 * Agregar un seguimiento a un lead
 */
router.post('/:id/follow-up', async (req, res) => {
    try {
        const { id } = req.params;
        const { action, notes, result, nextDate } = req.body;
        
        const lead = await Lead.findById(id);
        
        if (!lead) {
            return res.status(404).json({
                success: false,
                message: 'Lead no encontrado'
            });
        }
        
        // Agregar seguimiento
        await lead.addFollowUp(action, notes, result, nextDate ? new Date(nextDate) : null);
        
        console.log(`[Lead] 📝 Seguimiento agregado a ${lead.email}: ${action}`);
        
        res.json({
            success: true,
            message: 'Seguimiento registrado correctamente',
            lead
        });
        
    } catch (error) {
        console.error('[Lead] Error agregando seguimiento:', error);
        res.status(500).json({
            success: false,
            message: 'Error al registrar seguimiento'
        });
    }
});

/**
 * GET /api/leads/follow-ups/due
 * Obtener leads que necesitan seguimiento hoy
 */
router.get('/follow-ups/due', async (req, res) => {
    try {
        const leadsDue = await Lead.getFollowUpsDue();
        
        res.json({
            success: true,
            count: leadsDue.length,
            leads: leadsDue
        });
        
    } catch (error) {
        console.error('[Lead] Error obteniendo seguimientos:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener seguimientos'
        });
    }
});

/**
 * GET /api/leads/follow-ups/overdue
 * Obtener leads sin seguimiento programado (más de 3 días)
 */
router.get('/follow-ups/overdue', async (req, res) => {
    try {
        const leadsOverdue = await Lead.getLeadsWithoutFollowUp();
        
        res.json({
            success: true,
            count: leadsOverdue.length,
            leads: leadsOverdue
        });
        
    } catch (error) {
        console.error('[Lead] Error obteniendo leads atrasados:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener leads atrasados'
        });
    }
});

/**
 * POST /api/leads/:id/schedule-demo
 * Programar una demo para un lead con integración a Google Calendar
 */
router.post('/:id/schedule-demo', async (req, res) => {
    try {
        const { id } = req.params;
        const { demoDate, duration = 60 } = req.body; // duration en minutos
        
        const lead = await Lead.findById(id);
        
        if (!lead) {
            return res.status(404).json({
                success: false,
                message: 'Lead no encontrado'
            });
        }
        
        let calendarEventId = '';
        let meetingLink = '';
        
        // Intentar crear evento en Google Calendar
        try {
            const startDateTime = new Date(demoDate);
            const endDateTime = new Date(startDateTime.getTime() + duration * 60000);
            
            // Obtener email del profesor asignado (si existe)
            let teacherEmail = null;
            if (lead.assignedTeacher) {
                const User = require('../models/User');
                const teacher = await User.findById(lead.assignedTeacher);
                if (teacher) {
                    teacherEmail = teacher.email;
                }
            }
            
            const calendarEvent = await CalendarService.createEvent({
                summary: `Demo PianoLink - ${lead.name}`,
                startDateTime: startDateTime.toISOString(),
                endDateTime: endDateTime.toISOString(),
                attendeeEmail: lead.email,
                attendeeName: lead.name,
                teacherEmail: teacherEmail, // Incluir profesor como asistente
                duration: duration, // Pasar duración para el mensaje personalizado
                timezone: lead.timezone || 'America/Santiago' // Zona horaria del lead
            });
            
            calendarEventId = calendarEvent.id || '';
            meetingLink = calendarEvent.meetingLink || calendarEvent.link || '';
            
        } catch (calendarError) {
            console.error('[Lead] ⚠️ Error creando evento en Calendar:', calendarError.message);
            // Continuar sin Calendar, solo guardar en BD
        }
        
        // Programar demo en el lead
        await lead.scheduleDemo(new Date(demoDate), calendarEventId, meetingLink);
        
        console.log(`[Lead] 📅 Demo programada para ${lead.email}: ${demoDate}`);
        
        res.json({
            success: true,
            message: 'Demo programada correctamente',
            lead,
            meetingLink: meetingLink || 'No disponible - agregar manualmente'
        });
        
    } catch (error) {
        console.error('[Lead] Error programando demo:', error);
        res.status(500).json({
            success: false,
            message: 'Error al programar demo'
        });
    }
});

module.exports = router;
