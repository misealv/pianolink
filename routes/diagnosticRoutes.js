/**
 * diagnosticRoutes.js - API para control de auditoría de diagnóstico
 * 
 * Solo accesible para administradores
 */

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const DiagnosticAuditService = require('../services/DiagnosticAuditService');
const DiagnosticAudit = require('../models/DiagnosticAudit');

// Middleware de autenticación admin
const adminAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Token requerido' });
        }
        
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        const user = await User.findById(decoded.id).select('role email name');
        if (!user || user.role !== 'admin') {
            return res.status(403).json({ error: 'Acceso denegado - Solo administradores' });
        }
        
        req.user = user;
        next();
    } catch (error) {
        console.error('[DiagnosticRoutes] Error de auth:', error);
        res.status(401).json({ error: 'Token inválido' });
    }
};

// =============================================
// ESTADO ACTUAL
// =============================================

/**
 * GET /api/diagnostic/status
 * Obtiene el estado actual de la auditoría
 */
router.get('/status', adminAuth, (req, res) => {
    try {
        const isActive = DiagnosticAuditService.isActive();
        const stats = DiagnosticAuditService.getCurrentStats();
        
        res.json({
            isActive,
            ...(stats || {}),
            currentAudit: isActive ? DiagnosticAuditService.getCurrentAudit() : null
        });
    } catch (error) {
        console.error('[DiagnosticRoutes] Error getting status:', error);
        res.status(500).json({ error: error.message });
    }
});

// =============================================
// CONTROL DE AUDITORÍA
// =============================================

/**
 * POST /api/diagnostic/start
 * Inicia una nueva auditoría
 */
router.post('/start', adminAuth, async (req, res) => {
    try {
        const config = req.body.config || {};
        const audit = await DiagnosticAuditService.startAudit(req.user._id, config);
        
        res.json({
            success: true,
            message: 'Auditoría iniciada',
            audit: {
                auditId: audit.auditId,
                startedAt: audit.startedAt,
                captureConfig: audit.captureConfig,
                filters: audit.filters
            }
        });
    } catch (error) {
        console.error('[DiagnosticRoutes] Error starting audit:', error);
        res.status(400).json({ error: error.message });
    }
});

/**
 * POST /api/diagnostic/stop
 * Detiene la auditoría actual
 */
router.post('/stop', adminAuth, async (req, res) => {
    try {
        const notes = req.body.notes || '';
        const result = await DiagnosticAuditService.stopAudit(notes);
        
        res.json({
            success: true,
            message: 'Auditoría completada',
            ...result
        });
    } catch (error) {
        console.error('[DiagnosticRoutes] Error stopping audit:', error);
        res.status(400).json({ error: error.message });
    }
});

// =============================================
// HISTORIAL DE AUDITORÍAS
// =============================================

/**
 * GET /api/diagnostic/history
 * Obtiene historial de auditorías
 */
router.get('/history', adminAuth, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 20;
        const skip = parseInt(req.query.skip) || 0;
        const status = req.query.status; // 'active', 'completed', 'archived'
        
        let query = {};
        if (status) query.status = status;
        
        const [audits, total] = await Promise.all([
            DiagnosticAudit.find(query)
                .select('-events')
                .sort({ startedAt: -1 })
                .limit(limit)
                .skip(skip)
                .populate('activatedBy', 'name email')
                .lean(),
            DiagnosticAudit.countDocuments(query)
        ]);
        
        res.json({
            audits,
            total,
            hasMore: skip + audits.length < total
        });
    } catch (error) {
        console.error('[DiagnosticRoutes] Error getting history:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/diagnostic/audit/:auditId
 * Obtiene detalles de una auditoría específica
 */
router.get('/audit/:auditId', adminAuth, async (req, res) => {
    try {
        const { auditId } = req.params;
        const includeEvents = req.query.includeEvents !== 'false';
        
        const audit = await DiagnosticAuditService.getAudit(auditId, includeEvents);
        
        if (!audit) {
            return res.status(404).json({ error: 'Auditoría no encontrada' });
        }
        
        res.json(audit);
    } catch (error) {
        console.error('[DiagnosticRoutes] Error getting audit:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/diagnostic/audit/:auditId/events
 * Obtiene eventos filtrados de una auditoría
 */
router.get('/audit/:auditId/events', adminAuth, async (req, res) => {
    try {
        const { auditId } = req.params;
        const filters = {
            category: req.query.category,
            severity: req.query.severity,
            roomCode: req.query.roomCode,
            limit: parseInt(req.query.limit) || 1000,
            skip: parseInt(req.query.skip) || 0
        };
        
        const events = await DiagnosticAuditService.getAuditEvents(auditId, filters);
        
        res.json({
            auditId,
            events,
            count: events.length,
            filters
        });
    } catch (error) {
        console.error('[DiagnosticRoutes] Error getting events:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/diagnostic/audit/:auditId/summary
 * Obtiene resumen analítico de una auditoría
 */
router.get('/audit/:auditId/summary', adminAuth, async (req, res) => {
    try {
        const { auditId } = req.params;
        
        const audit = await DiagnosticAudit.findOne({ auditId })
            .select('summary startedAt endedAt durationSeconds status captureConfig')
            .lean();
        
        if (!audit) {
            return res.status(404).json({ error: 'Auditoría no encontrada' });
        }
        
        res.json(audit);
    } catch (error) {
        console.error('[DiagnosticRoutes] Error getting summary:', error);
        res.status(500).json({ error: error.message });
    }
});

// =============================================
// GESTIÓN DE AUDITORÍAS
// =============================================

/**
 * PATCH /api/diagnostic/audit/:auditId/archive
 * Archiva una auditoría
 */
router.patch('/audit/:auditId/archive', adminAuth, async (req, res) => {
    try {
        const { auditId } = req.params;
        const audit = await DiagnosticAuditService.archiveAudit(auditId);
        
        if (!audit) {
            return res.status(404).json({ error: 'Auditoría no encontrada' });
        }
        
        res.json({ success: true, audit });
    } catch (error) {
        console.error('[DiagnosticRoutes] Error archiving:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * PATCH /api/diagnostic/audit/:auditId/notes
 * Actualiza notas de una auditoría
 */
router.patch('/audit/:auditId/notes', adminAuth, async (req, res) => {
    try {
        const { auditId } = req.params;
        const { notes, tags } = req.body;
        
        const update = {};
        if (notes !== undefined) update.notes = notes;
        if (tags !== undefined) update.tags = tags;
        
        const audit = await DiagnosticAudit.findOneAndUpdate(
            { auditId },
            update,
            { new: true }
        ).select('-events');
        
        if (!audit) {
            return res.status(404).json({ error: 'Auditoría no encontrada' });
        }
        
        res.json({ success: true, audit });
    } catch (error) {
        console.error('[DiagnosticRoutes] Error updating notes:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/diagnostic/audit/:auditId
 * Elimina una auditoría y sus eventos
 */
router.delete('/audit/:auditId', adminAuth, async (req, res) => {
    try {
        const { auditId } = req.params;
        
        // No permitir eliminar auditoría activa
        if (DiagnosticAuditService.isActive() && 
            DiagnosticAuditService.getCurrentAudit()?.auditId === auditId) {
            return res.status(400).json({ error: 'No se puede eliminar una auditoría activa' });
        }
        
        const result = await DiagnosticAuditService.deleteAudit(auditId);
        res.json(result);
    } catch (error) {
        console.error('[DiagnosticRoutes] Error deleting:', error);
        res.status(500).json({ error: error.message });
    }
});

// =============================================
// ANÁLISIS EN TIEMPO REAL
// =============================================

/**
 * GET /api/diagnostic/live
 * Obtiene estadísticas en tiempo real de la auditoría activa
 */
router.get('/live', adminAuth, (req, res) => {
    try {
        if (!DiagnosticAuditService.isActive()) {
            return res.json({ isActive: false });
        }
        
        const stats = DiagnosticAuditService.getCurrentStats();
        res.json(stats);
    } catch (error) {
        console.error('[DiagnosticRoutes] Error getting live stats:', error);
        res.status(500).json({ error: error.message });
    }
});

// =============================================
// EXPORTAR DATOS
// =============================================

/**
 * GET /api/diagnostic/audit/:auditId/export
 * Exporta una auditoría completa como JSON
 */
router.get('/audit/:auditId/export', adminAuth, async (req, res) => {
    try {
        const { auditId } = req.params;
        const audit = await DiagnosticAuditService.getAudit(auditId, true);
        
        if (!audit) {
            return res.status(404).json({ error: 'Auditoría no encontrada' });
        }
        
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${auditId}.json"`);
        res.json(audit);
    } catch (error) {
        console.error('[DiagnosticRoutes] Error exporting:', error);
        res.status(500).json({ error: error.message });
    }
});

// =============================================
// HERRAMIENTAS DE RED
// =============================================

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

/**
 * POST /api/diagnostic/traceroute
 * Ejecuta traceroute hacia un host
 * Body: { host: "pianolink.net", maxHops?: 30 }
 */
router.post('/traceroute', adminAuth, async (req, res) => {
    try {
        const { host, maxHops = 20 } = req.body;
        
        // Validación de host (prevenir inyección de comandos)
        if (!host || typeof host !== 'string') {
            return res.status(400).json({ error: 'Host requerido' });
        }
        
        // Solo permitir hostnames válidos o IPs
        const hostRegex = /^[a-zA-Z0-9][a-zA-Z0-9.-]*[a-zA-Z0-9]$|^\d{1,3}(\.\d{1,3}){3}$/;
        if (!hostRegex.test(host) || host.length > 253) {
            return res.status(400).json({ error: 'Host inválido' });
        }
        
        // Limitar maxHops
        const hops = Math.min(Math.max(parseInt(maxHops) || 20, 5), 30);
        
        console.log(`[DiagnosticRoutes] 🔍 Traceroute a ${host} (max ${hops} hops)`);
        
        // Usar tracepath (no requiere root) con fallback a traceroute
        let result;
        let command;
        
        try {
            // Intentar primero con tracepath (más común en contenedores)
            command = `tracepath -m ${hops} ${host} 2>&1`;
            result = await execAsync(command, { timeout: 60000 });
        } catch (tracepathError) {
            // Fallback a traceroute
            try {
                command = `traceroute -m ${hops} -w 2 ${host} 2>&1`;
                result = await execAsync(command, { timeout: 60000 });
            } catch (tracerouteError) {
                // Si ambos fallan, intentar con ping como último recurso
                command = `ping -c 5 ${host} 2>&1`;
                result = await execAsync(command, { timeout: 30000 });
            }
        }
        
        // Parsear output
        const lines = result.stdout.split('\n').filter(l => l.trim());
        const hopsData = [];
        
        lines.forEach((line, index) => {
            // Detectar líneas de hop (ej: "1:  gateway  0.123ms")
            const hopMatch = line.match(/^\s*(\d+)[:\s]+(.+)/);
            if (hopMatch) {
                const hopNum = parseInt(hopMatch[1]);
                const details = hopMatch[2].trim();
                
                // Extraer latencia si existe
                const latencyMatch = details.match(/([\d.]+)\s*ms/);
                const latency = latencyMatch ? parseFloat(latencyMatch[1]) : null;
                
                // Extraer hostname/IP
                const hostMatch = details.match(/^([^\s(]+)/);
                const hopHost = hostMatch ? hostMatch[1] : details;
                
                hopsData.push({
                    hop: hopNum,
                    host: hopHost,
                    latency,
                    raw: line.trim()
                });
            } else if (line.includes('ms') || line.includes('*')) {
                // Línea de traceroute tradicional
                hopsData.push({
                    hop: hopsData.length + 1,
                    raw: line.trim()
                });
            }
        });
        
        res.json({
            success: true,
            host,
            command: command.split(' ')[0], // Solo mostrar el comando usado
            timestamp: new Date().toISOString(),
            hops: hopsData,
            raw: result.stdout
        });
        
    } catch (error) {
        console.error('[DiagnosticRoutes] Error en traceroute:', error);
        res.status(500).json({ 
            error: 'Error ejecutando traceroute',
            details: error.message,
            stderr: error.stderr || null
        });
    }
});

/**
 * POST /api/diagnostic/ping
 * Ejecuta ping hacia un host
 * Body: { host: "pianolink.net", count?: 5 }
 */
router.post('/ping', adminAuth, async (req, res) => {
    try {
        const { host, count = 5 } = req.body;
        
        // Validación de host
        if (!host || typeof host !== 'string') {
            return res.status(400).json({ error: 'Host requerido' });
        }
        
        const hostRegex = /^[a-zA-Z0-9][a-zA-Z0-9.-]*[a-zA-Z0-9]$|^\d{1,3}(\.\d{1,3}){3}$/;
        if (!hostRegex.test(host) || host.length > 253) {
            return res.status(400).json({ error: 'Host inválido' });
        }
        
        const pingCount = Math.min(Math.max(parseInt(count) || 5, 1), 20);
        
        console.log(`[DiagnosticRoutes] 📡 Ping a ${host} (${pingCount} paquetes)`);
        
        const command = `ping -c ${pingCount} ${host} 2>&1`;
        const result = await execAsync(command, { timeout: 30000 });
        
        // Parsear estadísticas
        const statsMatch = result.stdout.match(/(\d+) packets transmitted, (\d+) (?:packets )?received/);
        const rttMatch = result.stdout.match(/rtt min\/avg\/max\/mdev = ([\d.]+)\/([\d.]+)\/([\d.]+)\/([\d.]+)/);
        
        res.json({
            success: true,
            host,
            timestamp: new Date().toISOString(),
            stats: statsMatch ? {
                transmitted: parseInt(statsMatch[1]),
                received: parseInt(statsMatch[2]),
                lossPercent: ((1 - parseInt(statsMatch[2]) / parseInt(statsMatch[1])) * 100).toFixed(1)
            } : null,
            rtt: rttMatch ? {
                min: parseFloat(rttMatch[1]),
                avg: parseFloat(rttMatch[2]),
                max: parseFloat(rttMatch[3]),
                mdev: parseFloat(rttMatch[4])
            } : null,
            raw: result.stdout
        });
        
    } catch (error) {
        console.error('[DiagnosticRoutes] Error en ping:', error);
        res.status(500).json({ 
            error: 'Error ejecutando ping',
            details: error.message
        });
    }
});

module.exports = router;
