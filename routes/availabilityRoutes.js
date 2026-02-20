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
        
        // Máximo 336 días (48 semanas = 1 año)
        const daysDiff = (to - from) / (1000 * 60 * 60 * 24);
        if (daysDiff > 336) {
            return res.status(400).json({ message: 'Máximo 336 días (48 semanas) por generación' });
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
 * DELETE /api/availability/slots/bulk
 * Eliminar slots disponibles en lote con filtros
 * Body: { fromDate, toDate, daysOfWeek?, fromTime?, toTime? }
 * NOTA: Debe estar ANTES de /slots/:id para que Express no capture "bulk" como :id
 */
router.delete('/slots/bulk', protect, async (req, res) => {
    try {
        if (req.user.role !== 'teacher') {
            return res.status(403).json({ message: 'Solo profesores pueden eliminar slots' });
        }

        const { fromDate, toDate, daysOfWeek, fromTime, toTime } = req.body;

        if (!fromDate || !toDate) {
            return res.status(400).json({ message: 'Rango de fechas requerido (fromDate, toDate)' });
        }

        const startRange = new Date(fromDate + 'T00:00:00.000Z');
        const endRange = new Date(toDate + 'T23:59:59.999Z');

        // Buscar slots disponibles en el rango (solo available, nunca booked)
        const query = {
            teacherId: req.user._id,
            status: 'available',
            startTime: { $gte: startRange, $lte: endRange }
        };

        // Obtener candidatos para filtrar por día/hora en JS
        let candidates = await TimeSlot.find(query).lean();

        // Filtrar por días de la semana si se especificaron
        if (daysOfWeek && Array.isArray(daysOfWeek) && daysOfWeek.length > 0) {
            candidates = candidates.filter(s => daysOfWeek.includes(new Date(s.startTime).getDay()));
        }

        // Filtrar por rango de hora si se especificó
        if (fromTime) {
            const [fh, fm] = fromTime.split(':').map(Number);
            const fromMinutes = fh * 60 + fm;
            candidates = candidates.filter(s => {
                const d = new Date(s.startTime);
                return (d.getHours() * 60 + d.getMinutes()) >= fromMinutes;
            });
        }
        if (toTime) {
            const [th, tm] = toTime.split(':').map(Number);
            const toMinutes = th * 60 + tm;
            candidates = candidates.filter(s => {
                const d = new Date(s.startTime);
                return (d.getHours() * 60 + d.getMinutes()) <= toMinutes;
            });
        }

        if (candidates.length === 0) {
            return res.json({ success: true, deleted: 0, message: 'No se encontraron slots con esos filtros' });
        }

        const ids = candidates.map(s => s._id);

        // Marcar como cancelled en vez de borrar físicamente
        const result = await TimeSlot.updateMany(
            { _id: { $in: ids } },
            { $set: { status: 'cancelled' } }
        );

        res.json({
            success: true,
            deleted: result.modifiedCount,
            message: `${result.modifiedCount} slots eliminados`
        });

    } catch (error) {
        console.error('Error eliminando slots en lote:', error);
        res.status(500).json({ message: error.message });
    }
});

/**
 * GET /api/availability/slots/bulk-preview
 * Previsualizar cuántos slots se eliminarían con los filtros dados
 */
router.get('/slots/bulk-preview', protect, async (req, res) => {
    try {
        const { fromDate, toDate, daysOfWeek, fromTime, toTime } = req.query;

        if (!fromDate || !toDate) {
            return res.json({ count: 0 });
        }

        const startRange = new Date(fromDate + 'T00:00:00.000Z');
        const endRange = new Date(toDate + 'T23:59:59.999Z');

        const query = {
            teacherId: req.user._id,
            status: 'available',
            startTime: { $gte: startRange, $lte: endRange }
        };

        let candidates = await TimeSlot.find(query).lean();

        // Filtrar por días
        if (daysOfWeek) {
            const days = daysOfWeek.split(',').map(Number);
            candidates = candidates.filter(s => days.includes(new Date(s.startTime).getDay()));
        }

        // Filtrar por hora
        if (fromTime) {
            const [fh, fm] = fromTime.split(':').map(Number);
            const fromMinutes = fh * 60 + fm;
            candidates = candidates.filter(s => {
                const d = new Date(s.startTime);
                return (d.getHours() * 60 + d.getMinutes()) >= fromMinutes;
            });
        }
        if (toTime) {
            const [th, tm] = toTime.split(':').map(Number);
            const toMinutes = th * 60 + tm;
            candidates = candidates.filter(s => {
                const d = new Date(s.startTime);
                return (d.getHours() * 60 + d.getMinutes()) <= toMinutes;
            });
        }

        res.json({ count: candidates.length });

    } catch (error) {
        console.error('Error en preview bulk:', error);
        res.json({ count: 0 });
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

/**
 * POST /api/availability/slots
 * Crear slots manualmente (único o en lote)
 * Body: { slots: [{ date, startTime, endTime }] } o { date, startTime, endTime } para uno solo
 */
router.post('/slots', protect, async (req, res) => {
    try {
        if (req.user.role !== 'teacher') {
            return res.status(403).json({ message: 'Solo profesores pueden crear slots' });
        }
        
        let slotsToCreate = [];
        
        // Soportar formato único o en lote
        if (req.body.slots && Array.isArray(req.body.slots)) {
            slotsToCreate = req.body.slots;
        } else if (req.body.date && req.body.startTime) {
            slotsToCreate = [req.body];
        } else {
            return res.status(400).json({ message: 'Formato inválido. Envía { date, startTime, endTime } o { slots: [...] }' });
        }
        
        // Obtener plantilla activa para duración default
        const template = await AvailabilityTemplate.findOne({
            teacherId: req.user._id,
            isActive: true
        });
        
        const defaultDuration = template?.defaultDuration || 45;
        const bufferMinutes = template?.bufferMinutes || 10;
        const createdSlots = [];
        const errors = [];
        
        for (const slotData of slotsToCreate) {
            try {
                const { date, startTime, endTime } = slotData;
                
                if (!date || !startTime) {
                    errors.push({ slot: slotData, error: 'Fecha y hora de inicio requeridas' });
                    continue;
                }
                
                // Construir datetime completo
                const startDateTime = new Date(`${date}T${startTime}:00`);
                
                // Si no hay endTime, usar duración default
                let endDateTime;
                if (endTime) {
                    endDateTime = new Date(`${date}T${endTime}:00`);
                } else {
                    endDateTime = new Date(startDateTime.getTime() + defaultDuration * 60 * 1000);
                }
                
                // Validar que no sea en el pasado
                if (startDateTime < new Date()) {
                    errors.push({ slot: slotData, error: 'No puedes crear slots en el pasado' });
                    continue;
                }
                
                // Validar que no haya conflictos
                const conflict = await TimeSlot.findOne({
                    teacherId: req.user._id,
                    status: { $in: ['available', 'booked'] },
                    $or: [
                        { startTime: { $lt: endDateTime, $gte: startDateTime } },
                        { endTime: { $gt: startDateTime, $lte: endDateTime } },
                        { startTime: { $lte: startDateTime }, endTime: { $gte: endDateTime } }
                    ]
                });
                
                if (conflict) {
                    errors.push({ slot: slotData, error: `Conflicto con slot existente (${conflict.startTime.toLocaleTimeString('es-CL')})` });
                    continue;
                }
                
                // Crear el slot
                const newSlot = await TimeSlot.create({
                    teacherId: req.user._id,
                    startTime: startDateTime,
                    endTime: endDateTime,
                    duration: Math.round((endDateTime - startDateTime) / 60000),
                    status: 'available',
                    source: 'manual'
                });
                
                createdSlots.push(newSlot);
                
            } catch (err) {
                errors.push({ slot: slotData, error: err.message });
            }
        }
        
        res.json({
            success: true,
            created: createdSlots.length,
            errors: errors.length,
            slots: createdSlots,
            errorDetails: errors
        });
        
    } catch (error) {
        console.error('Error creando slots:', error);
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

// ==================== BLOQUEO DE FECHAS ====================

/**
 * POST /api/availability/block-date
 * Bloquear una fecha específica (elimina slots existentes y previene generación futura)
 */
router.post('/block-date', protect, async (req, res) => {
    try {
        const { date, reason } = req.body;
        
        if (!date) {
            return res.status(400).json({ message: 'Fecha requerida' });
        }
        
        // Validar que es profesor
        if (req.user.role !== 'teacher') {
            return res.status(403).json({ message: 'Solo profesores pueden bloquear fechas' });
        }
        
        // Crear rango de inicio y fin del día
        const blockDate = new Date(date + 'T00:00:00');
        const dayStart = new Date(blockDate);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(blockDate);
        dayEnd.setHours(23, 59, 59, 999);
        
        // Eliminar todos los slots disponibles (no reservados) de ese día
        const deleteResult = await TimeSlot.deleteMany({
            teacherId: req.user._id,
            startTime: { $gte: dayStart, $lte: dayEnd },
            status: 'available'
        });
        
        // Guardar la fecha bloqueada en el template activo
        const template = await AvailabilityTemplate.findOne({
            teacherId: req.user._id,
            isActive: true
        });
        
        if (template) {
            // Agregar a excepciones si no existe
            if (!template.exceptions) {
                template.exceptions = [];
            }
            
            const existingException = template.exceptions.find(
                e => e.date && new Date(e.date).toDateString() === blockDate.toDateString()
            );
            
            if (!existingException) {
                template.exceptions.push({
                    date: blockDate,
                    isBlocked: true,
                    reason: reason || 'Bloqueado por el profesor'
                });
                await template.save();
            }
        }
        
        res.json({ 
            success: true, 
            deletedSlots: deleteResult.deletedCount,
            message: `Fecha bloqueada. ${deleteResult.deletedCount} slot(s) eliminado(s).`
        });
        
    } catch (error) {
        console.error('Error bloqueando fecha:', error);
        res.status(500).json({ message: error.message });
    }
});

/**
 * GET /api/availability/blocked-dates
 * Obtener fechas bloqueadas del profesor
 */
router.get('/blocked-dates', protect, async (req, res) => {
    try {
        const template = await AvailabilityTemplate.findOne({
            teacherId: req.user._id,
            isActive: true
        });
        
        if (!template || !template.exceptions) {
            return res.json({ blockedDates: [] });
        }
        
        // Filtrar solo las fechas bloqueadas futuras
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        
        const blockedDates = template.exceptions
            .filter(e => e.isBlocked && new Date(e.date) >= now)
            .map(e => ({
                date: e.date.toISOString().split('T')[0],
                reason: e.reason
            }))
            .sort((a, b) => new Date(a.date) - new Date(b.date));
        
        res.json({ blockedDates });
        
    } catch (error) {
        console.error('Error obteniendo fechas bloqueadas:', error);
        res.status(500).json({ message: error.message });
    }
});

/**
 * DELETE /api/availability/block-date/:date
 * Desbloquear una fecha
 */
router.delete('/block-date/:date', protect, async (req, res) => {
    try {
        const template = await AvailabilityTemplate.findOne({
            teacherId: req.user._id,
            isActive: true
        });
        
        if (!template) {
            return res.status(404).json({ message: 'No hay plantilla activa' });
        }
        
        const dateToUnblock = new Date(req.params.date + 'T12:00:00');
        
        // Remover la excepción
        template.exceptions = (template.exceptions || []).filter(e => {
            const exDate = new Date(e.date);
            return exDate.toDateString() !== dateToUnblock.toDateString();
        });
        
        await template.save();
        
        res.json({ success: true, message: 'Fecha desbloqueada' });
        
    } catch (error) {
        console.error('Error desbloqueando fecha:', error);
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
