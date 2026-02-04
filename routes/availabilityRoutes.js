/* routes/availabilityRoutes.js */
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const AvailabilityService = require('../services/AvailabilityService');
const AvailabilityTemplate = require('../models/AvailabilityTemplate');
const TimeSlot = require('../models/TimeSlot');

// ==================== PLANTILLAS (PROFESOR) ====================

/**
 * GET /api/availability/templates
 * Obtener todas las plantillas del profesor autenticado
 */
router.get('/templates', protect, async (req, res) => {
    try {
        const templates = await AvailabilityTemplate.find({ 
            teacherId: req.user._id 
        }).sort({ createdAt: -1 });
        
        res.json(templates);
    } catch (error) {
        console.error('Error obteniendo plantillas:', error);
        res.status(500).json({ message: error.message });
    }
});

/**
 * Valida que los horarios de inicio sean menores que los de término
 */
function validateWeeklySlots(weeklySlots) {
    if (!weeklySlots || !Array.isArray(weeklySlots)) return { valid: true };
    
    for (const slot of weeklySlots) {
        if (slot.startTime && slot.endTime) {
            const [startH, startM] = slot.startTime.split(':').map(Number);
            const [endH, endM] = slot.endTime.split(':').map(Number);
            const startMinutes = startH * 60 + startM;
            const endMinutes = endH * 60 + endM;
            
            if (startMinutes >= endMinutes) {
                const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
                return {
                    valid: false,
                    message: `${dayNames[slot.dayOfWeek]}: El horario de inicio (${slot.startTime}) debe ser menor que el de término (${slot.endTime})`
                };
            }
        }
    }
    return { valid: true };
}

/**
 * POST /api/availability/templates
 * Crear nueva plantilla de disponibilidad
 */
router.post('/templates', protect, async (req, res) => {
    try {
        const { name, timezone, bufferMinutes, defaultDuration, weeklySlots } = req.body;
        
        // Validar horarios
        const validation = validateWeeklySlots(weeklySlots);
        if (!validation.valid) {
            return res.status(400).json({ message: validation.message });
        }
        
        // Desactivar plantillas anteriores si esta es la principal
        if (req.body.isActive) {
            await AvailabilityTemplate.updateMany(
                { teacherId: req.user._id },
                { isActive: false }
            );
        }
        
        const template = await AvailabilityTemplate.create({
            teacherId: req.user._id,
            name: name || 'Mi Horario',
            timezone: timezone || req.user.timezone || 'America/Santiago',
            bufferMinutes: bufferMinutes || 10,
            defaultDuration: defaultDuration || 45,
            weeklySlots: weeklySlots || [],
            isActive: true
        });
        
        res.status(201).json(template);
    } catch (error) {
        console.error('Error creando plantilla:', error);
        res.status(500).json({ message: error.message });
    }
});

/**
 * PUT /api/availability/templates/:id
 * Actualizar plantilla
 */
router.put('/templates/:id', protect, async (req, res) => {
    try {
        // Validar horarios si se envían
        if (req.body.weeklySlots) {
            const validation = validateWeeklySlots(req.body.weeklySlots);
            if (!validation.valid) {
                return res.status(400).json({ message: validation.message });
            }
        }
        
        const template = await AvailabilityTemplate.findOne({
            _id: req.params.id,
            teacherId: req.user._id
        });
        
        if (!template) {
            return res.status(404).json({ message: 'Plantilla no encontrada' });
        }
        
        const allowedUpdates = ['name', 'timezone', 'bufferMinutes', 'defaultDuration', 'weeklySlots', 'exceptions', 'isActive'];
        allowedUpdates.forEach(field => {
            if (req.body[field] !== undefined) {
                template[field] = req.body[field];
            }
        });
        
        await template.save();
        res.json(template);
    } catch (error) {
        console.error('Error actualizando plantilla:', error);
        res.status(500).json({ message: error.message });
    }
});

/**
 * DELETE /api/availability/templates/:id
 * Eliminar plantilla
 */
router.delete('/templates/:id', protect, async (req, res) => {
    try {
        const result = await AvailabilityTemplate.findOneAndDelete({
            _id: req.params.id,
            teacherId: req.user._id
        });
        
        if (!result) {
            return res.status(404).json({ message: 'Plantilla no encontrada' });
        }
        
        res.json({ success: true, message: 'Plantilla eliminada' });
    } catch (error) {
        console.error('Error eliminando plantilla:', error);
        res.status(500).json({ message: error.message });
    }
});

// ==================== GENERACIÓN DE SLOTS ====================

/**
 * POST /api/availability/generate
 * Genera slots concretos a partir de una plantilla
 */
router.post('/generate', protect, async (req, res) => {
    try {
        const { templateId, fromDate, toDate } = req.body;
        
        // Validar fechas
        const from = new Date(fromDate);
        const to = new Date(toDate);
        
        if (isNaN(from.getTime()) || isNaN(to.getTime())) {
            return res.status(400).json({ message: 'Fechas inválidas' });
        }
        
        // Máximo 30 días a la vez
        const daysDiff = (to - from) / (1000 * 60 * 60 * 24);
        if (daysDiff > 30) {
            return res.status(400).json({ message: 'Máximo 30 días por generación' });
        }
        
        const slots = await AvailabilityService.generateSlotsFromTemplate(
            templateId,
            from,
            to
        );
        
        res.json({
            success: true,
            slotsCreated: slots.length,
            slots
        });
    } catch (error) {
        console.error('Error generando slots:', error);
        res.status(500).json({ message: error.message });
    }
});

// ==================== CALENDARIO DEL PROFESOR ====================

/**
 * GET /api/availability/my-calendar
 * Obtener calendario completo del profesor
 */
router.get('/my-calendar', protect, async (req, res) => {
    try {
        const { from, to } = req.query;
        
        const fromDate = from ? new Date(from) : new Date();
        const toDate = to ? new Date(to) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        
        const calendar = await AvailabilityService.getTeacherCalendar(
            req.user._id,
            fromDate,
            toDate
        );
        
        res.json(calendar);
    } catch (error) {
        console.error('Error obteniendo calendario:', error);
        res.status(500).json({ message: error.message });
    }
});

// ==================== GESTIÓN DE SLOTS INDIVIDUALES ====================

/**
 * POST /api/availability/slots/block
 * Bloquear un rango de horarios manualmente
 */
router.post('/slots/block', protect, async (req, res) => {
    try {
        const { startTime, endTime, reason } = req.body;
        
        const result = await AvailabilityService.blockSlot(
            req.user._id,
            new Date(startTime),
            new Date(endTime),
            reason
        );
        
        res.json(result);
    } catch (error) {
        console.error('Error bloqueando slot:', error);
        res.status(500).json({ message: error.message });
    }
});

/**
 * DELETE /api/availability/slots/:id
 * Eliminar/cancelar un slot específico
 */
router.delete('/slots/:id', protect, async (req, res) => {
    try {
        const slot = await TimeSlot.findOne({
            _id: req.params.id,
            teacherId: req.user._id
        });
        
        if (!slot) {
            return res.status(404).json({ message: 'Slot no encontrado' });
        }
        
        if (slot.status === 'booked') {
            return res.status(400).json({ message: 'No puedes eliminar un slot con reserva activa' });
        }
        
        slot.status = 'cancelled';
        await slot.save();
        
        res.json({ success: true, message: 'Slot cancelado' });
    } catch (error) {
        console.error('Error cancelando slot:', error);
        res.status(500).json({ message: error.message });
    }
});

// ==================== DISPONIBILIDAD PÚBLICA (ESTUDIANTES) ====================

/**
 * GET /api/availability/teachers
 * Obtener lista de profesores con disponibilidad (para que guardian elija)
 * Query params: dayOfWeek (0-6), timeRange (morning, afternoon, evening)
 */
router.get('/teachers', async (req, res) => {
    try {
        const User = require('../models/User');
        const { dayOfWeek, timeRange } = req.query;
        
        // Buscar profesores que tengan slots disponibles próximamente
        const fromDate = new Date();
        const toDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
        
        // Construir match con filtros
        const matchStage = {
            status: 'available',
            startTime: { $gte: fromDate, $lte: toDate }
        };
        
        // Agregar condiciones de filtro para el aggregation
        const addFieldsStage = {};
        const filterConditions = [];
        
        // Filtro por día de la semana (0=Dom, 1=Lun, etc)
        if (dayOfWeek !== undefined && dayOfWeek !== '') {
            addFieldsStage.dayOfWeek = { $dayOfWeek: '$startTime' };
            // MongoDB: 1=Sunday, 2=Monday... JavaScript: 0=Sunday, 1=Monday...
            // Convertir JS dayOfWeek a MongoDB format
            const mongoDayOfWeek = parseInt(dayOfWeek) + 1;
            filterConditions.push({ $eq: ['$dayOfWeek', mongoDayOfWeek === 8 ? 1 : mongoDayOfWeek] });
        }
        
        // Filtro por rango horario
        if (timeRange) {
            addFieldsStage.hour = { $hour: '$startTime' };
            let hourMin, hourMax;
            switch (timeRange) {
                case 'morning':
                    hourMin = 8; hourMax = 12;
                    break;
                case 'afternoon':
                    hourMin = 12; hourMax = 18;
                    break;
                case 'evening':
                    hourMin = 18; hourMax = 22;
                    break;
            }
            if (hourMin !== undefined) {
                filterConditions.push({ $gte: ['$hour', hourMin] });
                filterConditions.push({ $lt: ['$hour', hourMax] });
            }
        }
        
        // Pipeline de aggregation
        const pipeline = [
            { $match: matchStage }
        ];
        
        // Añadir campos calculados si hay filtros
        if (Object.keys(addFieldsStage).length > 0) {
            pipeline.push({ $addFields: addFieldsStage });
        }
        
        // Añadir filtro si hay condiciones
        if (filterConditions.length > 0) {
            pipeline.push({
                $match: {
                    $expr: { $and: filterConditions }
                }
            });
        }
        
        // Agrupar por profesor
        pipeline.push({
            $group: {
                _id: '$teacherId',
                slotsCount: { $sum: 1 },
                nextSlot: { $min: '$startTime' },
                filteredSlots: { $sum: 1 }
            }
        });
        
        const availableSlots = await TimeSlot.aggregate(pipeline);
        
        if (availableSlots.length === 0) {
            return res.json([]);
        }
        
        // Obtener info de los profesores
        const teacherIds = availableSlots.map(s => s._id);
        const teachers = await User.find({
            _id: { $in: teacherIds },
            role: 'teacher'
        }).select('name branding.profilePhotoUrl branding.brandName timezone');
        
        // Combinar info
        const hasFilters = dayOfWeek !== undefined || timeRange;
        const result = teachers.map(teacher => {
            const slotInfo = availableSlots.find(s => s._id.toString() === teacher._id.toString());
            return {
                _id: teacher._id,
                name: teacher.name,
                brandName: teacher.branding?.brandName || teacher.name,
                photoUrl: teacher.branding?.profilePhotoUrl,
                slotsAvailable: slotInfo?.slotsCount || 0,
                nextAvailable: slotInfo?.nextSlot,
                filteredSlots: hasFilters ? slotInfo?.filteredSlots : null
            };
        });
        
        // Ordenar por próxima disponibilidad
        result.sort((a, b) => new Date(a.nextAvailable) - new Date(b.nextAvailable));
        
        res.json(result);
    } catch (error) {
        console.error('Error obteniendo profesores:', error);
        res.status(500).json({ message: error.message });
    }
});

/**
 * GET /api/availability/teacher/:teacherId
 * Obtener disponibilidad de un profesor (para estudiantes)
 */
router.get('/teacher/:teacherId', async (req, res) => {
    try {
        const { from, to, timezone } = req.query;
        
        const fromDate = from ? new Date(from) : new Date();
        const toDate = to ? new Date(to) : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
        const studentTimezone = timezone || 'America/Santiago';
        
        const slots = await AvailabilityService.getAvailableSlots(
            req.params.teacherId,
            fromDate,
            toDate,
            studentTimezone
        );
        
        res.json(slots);
    } catch (error) {
        console.error('Error obteniendo disponibilidad:', error);
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
