/**
 * routes/leadRoutes.js
 * API para gestión de leads — delegada a LeadService.js
 * 
 * Endpoints:
 *   POST   /api/leads                    — Crear/actualizar lead
 *   GET    /api/leads/stats              — Estadísticas por estado
 *   GET    /api/leads/export             — Exportar todos
 *   GET    /api/leads/follow-ups/due     — Seguimientos de hoy
 *   GET    /api/leads/follow-ups/overdue — Leads atrasados
 *   GET    /api/leads/:id               — Obtener lead por ID
 *   PATCH  /api/leads/:id/notes          — Actualizar notas
 *   PATCH  /api/leads/:id/status         — Cambiar estado
 *   PATCH  /api/leads/:id               — Editar datos
 *   DELETE /api/leads/:id               — Eliminar
 *   POST   /api/leads/:id/follow-up     — Agregar seguimiento
 *   POST   /api/leads/:id/schedule-demo — Programar demo
 *   GET    /api/leads/funnel/:type       — Métricas de embudo
 */
const express = require('express');
const router = express.Router();
const LeadService = require('../services/LeadService');

// ==================== CREAR / ACTUALIZAR ====================

router.post('/', async (req, res) => {
    try {
        const { isManual } = req.body;
        const result = await LeadService.createOrUpdate(req.body, !!isManual);
        res.status(result.status || 200).json(result);
    } catch (error) {
        console.error('[Lead] ❌ Error:', error.message);

        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(e => e.message);
            return res.status(400).json({ success: false, message: messages.join('. ') });
        }
        if (error.code === 11000) {
            return res.status(400).json({ success: false, message: 'Este email ya está registrado.' });
        }
        res.status(500).json({ success: false, message: 'Error interno. Por favor intenta de nuevo.' });
    }
});

// ==================== LECTURA ====================

router.get('/stats', async (req, res) => {
    try {
        const { type } = req.query;
        const stats = await LeadService.getStats(type || null);
        res.json({ success: true, ...stats });
    } catch (error) {
        console.error('[Lead] Error stats:', error);
        res.status(500).json({ success: false, message: 'Error interno' });
    }
});

router.get('/export', async (req, res) => {
    try {
        const { type } = req.query;
        const data = await LeadService.export(type || null);
        console.log(`[Lead] 📊 Exportando ${data.total} leads`);
        res.json({ success: true, ...data });
    } catch (error) {
        console.error('[Lead] Error export:', error);
        res.status(500).json({ success: false, message: 'Error al exportar' });
    }
});

router.get('/follow-ups/due', async (req, res) => {
    try {
        const leads = await LeadService.getFollowUpsDue();
        res.json({ success: true, count: leads.length, leads });
    } catch (error) {
        console.error('[Lead] Error follow-ups:', error);
        res.status(500).json({ success: false, message: 'Error interno' });
    }
});

router.get('/follow-ups/overdue', async (req, res) => {
    try {
        const leads = await LeadService.getFollowUpsOverdue();
        res.json({ success: true, count: leads.length, leads });
    } catch (error) {
        console.error('[Lead] Error overdue:', error);
        res.status(500).json({ success: false, message: 'Error interno' });
    }
});

// ==================== MÉTRICAS DE EMBUDO ====================

router.get('/funnel/:type', async (req, res) => {
    try {
        const metrics = await LeadService.getFunnelMetrics(req.params.type);
        res.json({ success: true, metrics });
    } catch (error) {
        console.error('[Lead] Error funnel:', error);
        res.status(500).json({ success: false, message: 'Error interno' });
    }
});

// ==================== OBTENER POR ID ====================

router.get('/:id', async (req, res) => {
    try {
        const lead = await LeadService.getById(req.params.id);
        if (!lead) return res.status(404).json({ success: false, message: 'Lead no encontrado' });
        res.json({ success: true, lead });
    } catch (error) {
        console.error('[Lead] Error getById:', error);
        res.status(500).json({ success: false, message: 'Error interno' });
    }
});

// ==================== ACTUALIZACIÓN ====================

router.patch('/:id/notes', async (req, res) => {
    try {
        const result = await LeadService.updateNotes(req.params.id, req.body.notes);
        res.status(result.status || 200).json(result);
    } catch (error) {
        console.error('[Lead] Error notas:', error);
        res.status(500).json({ success: false, message: 'Error interno' });
    }
});

router.patch('/:id/status', async (req, res) => {
    try {
        const result = await LeadService.changeStatus(req.params.id, req.body.status);
        res.status(result.status || 200).json(result);
    } catch (error) {
        console.error('[Lead] Error status:', error);
        res.status(500).json({ success: false, message: 'Error interno' });
    }
});

router.patch('/:id', async (req, res) => {
    try {
        const result = await LeadService.update(req.params.id, req.body);
        res.status(result.status || 200).json(result);
    } catch (error) {
        console.error('[Lead] Error edit:', error);
        res.status(500).json({ success: false, message: 'Error interno' });
    }
});

// ==================== ELIMINAR ====================

router.delete('/:id', async (req, res) => {
    try {
        const result = await LeadService.delete(req.params.id);
        res.status(result.status || 200).json(result);
    } catch (error) {
        console.error('[Lead] Error delete:', error);
        res.status(500).json({ success: false, message: 'Error interno' });
    }
});

// ==================== SEGUIMIENTOS Y DEMOS ====================

router.post('/:id/follow-up', async (req, res) => {
    try {
        const result = await LeadService.addFollowUp(req.params.id, req.body);
        res.status(result.status || 200).json(result);
    } catch (error) {
        console.error('[Lead] Error follow-up:', error);
        res.status(500).json({ success: false, message: 'Error interno' });
    }
});

router.post('/:id/schedule-demo', async (req, res) => {
    try {
        const result = await LeadService.scheduleDemo(req.params.id, req.body);
        res.status(result.status || 200).json(result);
    } catch (error) {
        console.error('[Lead] Error demo:', error);
        res.status(500).json({ success: false, message: 'Error interno' });
    }
});

module.exports = router;
