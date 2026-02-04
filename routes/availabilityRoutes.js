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
 * POST /api/availability/templates
 * Crear nueva plantilla de disponibilidad
 */
router.post('/templates', protect, async (req, res) => {
    try {
        const { name, timezone, bufferMinutes, defaultDuration, weeklySlots } = req.body;
        
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
