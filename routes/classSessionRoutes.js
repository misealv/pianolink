/**
 * routes/classSessionRoutes.js
 * API para gestión de sesiones de clase y validación
 * 
 * Endpoints:
 * - GET /api/class-sessions/pending - Clases pendientes de validación
 * - POST /api/class-sessions/:id/teacher-complete - Profesor marca completada
 * - POST /api/class-sessions/:id/student-confirm - Estudiante confirma
 * - POST /api/class-sessions/:id/student-noshow - Marcar no-show estudiante
 * - POST /api/class-sessions/:id/teacher-noshow - Marcar no-show profesor
 * - POST /api/class-sessions/:id/dispute - Abrir disputa
 */

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const ClassSession = require('../models/ClassSession');
const StudentSubscription = require('../models/StudentSubscription');
const TeacherPayout = require('../models/TeacherPayout');
const Booking = require('../models/Booking');
const { authMiddleware } = require('../middleware/auth');

// Ventana de disputa en horas
const DISPUTE_WINDOW_HOURS = 48;
// Horas para auto-confirmación si estudiante no responde
const AUTO_CONFIRM_HOURS = 48;

/**
 * GET /api/class-sessions/pending
 * Clases pendientes de validación (para profesor o estudiante)
 */
router.get('/pending', authMiddleware, async (req, res) => {
    try {
        const query = {
            status: { $in: ['pending-validation', 'disputed'] }
        };

        // Filtrar según rol
        if (req.user.role === 'teacher') {
            query.teacherId = req.user._id;
        } else {
            query.studentId = req.user._id;
        }

        const sessions = await ClassSession.find(query)
            .populate('studentId', 'name email')
            .populate('teacherId', 'name email')
            .populate('subscriptionId', 'category')
            .sort({ scheduledAt: -1 });

        res.json({
            success: true,
            sessions,
            count: sessions.length
        });
    } catch (error) {
        console.error('[ClassSessions] Error:', error);
        res.status(500).json({ success: false, error: 'Error interno' });
    }
});

/**
 * GET /api/class-sessions/my
 * Historial de clases del usuario
 */
router.get('/my', authMiddleware, async (req, res) => {
    try {
        const query = {};
        
        if (req.user.role === 'teacher') {
            query.teacherId = req.user._id;
        } else {
            query.studentId = req.user._id;
        }

        const limit = parseInt(req.query.limit) || 20;
        const skip = parseInt(req.query.skip) || 0;

        const sessions = await ClassSession.find(query)
            .populate('studentId', 'name email')
            .populate('teacherId', 'name email')
            .populate('subscriptionId', 'category packageId')
            .sort({ scheduledAt: -1 })
            .skip(skip)
            .limit(limit);

        const total = await ClassSession.countDocuments(query);

        res.json({
            success: true,
            sessions,
            total,
            hasMore: skip + sessions.length < total
        });
    } catch (error) {
        console.error('[ClassSessions] Error:', error);
        res.status(500).json({ success: false, error: 'Error interno' });
    }
});

/**
 * POST /api/class-sessions/create-from-booking
 * Crear sesión desde un booking completado (llamado internamente)
 */
router.post('/create-from-booking', authMiddleware, async (req, res) => {
    try {
        const { bookingId } = req.body;
        
        const booking = await Booking.findById(bookingId);
        if (!booking) {
            return res.status(404).json({ 
                success: false, 
                error: 'Booking no encontrado' 
            });
        }

        // Verificar que no exista ya una sesión para este booking
        const existing = await ClassSession.findOne({ bookingId: booking._id });
        if (existing) {
            return res.json({
                success: true,
                session: existing,
                message: 'Sesión ya existe'
            });
        }

        // Buscar suscripción activa
        const subscription = await StudentSubscription.findOne({
            studentId: booking.studentId,
            teacherId: booking.teacherId,
            status: { $in: ['active', 'paused'] }
        });

        if (!subscription) {
            return res.status(400).json({ 
                success: false, 
                error: 'No hay suscripción activa para esta clase' 
            });
        }

        // Calcular montos (80% profesor, 20% plataforma)
        const pricePerClass = Math.round(subscription.totalPaidUSD / subscription.classesTotal);
        const platformFee = Math.round(pricePerClass * 0.20);
        const teacherPayout = pricePerClass - platformFee;

        const session = new ClassSession({
            subscriptionId: subscription._id,
            bookingId: booking._id,
            studentId: booking.studentId,
            teacherId: booking.teacherId,
            
            scheduledAt: booking.scheduledStart,
            category: subscription.category,
            
            status: 'scheduled',
            
            pricePerClassUSD: pricePerClass,
            teacherPayoutUSD: teacherPayout,
            platformFeeUSD: platformFee
        });

        await session.save();

        res.json({
            success: true,
            session,
            message: 'Sesión creada'
        });
    } catch (error) {
        console.error('[ClassSessions] Error creando sesión:', error);
        res.status(500).json({ success: false, error: 'Error interno' });
    }
});

/**
 * POST /api/class-sessions/:id/start
 * Marcar inicio de clase
 */
router.post('/:id/start', authMiddleware, async (req, res) => {
    try {
        const session = await ClassSession.findById(req.params.id);
        
        if (!session) {
            return res.status(404).json({ 
                success: false, 
                error: 'Sesión no encontrada' 
            });
        }

        // Solo profesor puede iniciar
        if (session.teacherId.toString() !== req.user._id.toString()) {
            return res.status(403).json({ 
                success: false, 
                error: 'Solo el profesor puede iniciar la clase' 
            });
        }

        session.status = 'in-progress';
        session.startedAt = new Date();
        await session.save();

        res.json({
            success: true,
            session,
            message: 'Clase iniciada'
        });
    } catch (error) {
        console.error('[ClassSessions] Error iniciando:', error);
        res.status(500).json({ success: false, error: 'Error interno' });
    }
});

/**
 * POST /api/class-sessions/:id/teacher-complete
 * Profesor marca la clase como completada
 */
router.post('/:id/teacher-complete', authMiddleware, async (req, res) => {
    try {
        const session = await ClassSession.findById(req.params.id);
        
        if (!session) {
            return res.status(404).json({ 
                success: false, 
                error: 'Sesión no encontrada' 
            });
        }

        if (session.teacherId.toString() !== req.user._id.toString()) {
            return res.status(403).json({ 
                success: false, 
                error: 'Solo el profesor puede marcar como completada' 
            });
        }

        if (!['scheduled', 'in-progress'].includes(session.status)) {
            return res.status(400).json({ 
                success: false, 
                error: `No se puede completar una clase en estado: ${session.status}` 
            });
        }

        session.endedAt = new Date();
        if (session.startedAt) {
            session.durationMinutes = Math.round(
                (session.endedAt - session.startedAt) / (1000 * 60)
            );
        }

        await session.teacherMarkComplete(req.body.notes || '');

        // Consumir clase de la suscripción
        const subscription = await StudentSubscription.findById(session.subscriptionId);
        if (subscription) {
            await subscription.consumeClass('completed');
        }

        res.json({
            success: true,
            session,
            message: 'Clase marcada como completada. Esperando confirmación del estudiante.',
            autoConfirmAt: session.autoConfirmAt
        });
    } catch (error) {
        console.error('[ClassSessions] Error completando:', error);
        res.status(500).json({ success: false, error: 'Error interno' });
    }
});

/**
 * POST /api/class-sessions/:id/student-confirm
 * Estudiante confirma que la clase se realizó
 */
router.post('/:id/student-confirm', authMiddleware, async (req, res) => {
    try {
        const session = await ClassSession.findById(req.params.id);
        
        if (!session) {
            return res.status(404).json({ 
                success: false, 
                error: 'Sesión no encontrada' 
            });
        }

        if (session.studentId.toString() !== req.user._id.toString()) {
            return res.status(403).json({ 
                success: false, 
                error: 'Solo el estudiante puede confirmar' 
            });
        }

        if (session.status !== 'pending-validation') {
            return res.status(400).json({ 
                success: false, 
                error: 'Esta clase no está pendiente de validación' 
            });
        }

        const { rating, feedback } = req.body;
        await session.studentConfirm(rating, feedback);

        res.json({
            success: true,
            session,
            message: 'Clase confirmada. ¡Gracias por tu feedback!'
        });
    } catch (error) {
        console.error('[ClassSessions] Error confirmando:', error);
        res.status(500).json({ success: false, error: 'Error interno' });
    }
});

/**
 * POST /api/class-sessions/:id/student-noshow
 * Profesor reporta que el estudiante no apareció
 */
router.post('/:id/student-noshow', authMiddleware, async (req, res) => {
    try {
        const session = await ClassSession.findById(req.params.id);
        
        if (!session) {
            return res.status(404).json({ 
                success: false, 
                error: 'Sesión no encontrada' 
            });
        }

        if (session.teacherId.toString() !== req.user._id.toString()) {
            return res.status(403).json({ 
                success: false, 
                error: 'Solo el profesor puede reportar no-show' 
            });
        }

        // Marcar no-show (el profesor cobra igual)
        await ClassSession.markStudentNoShow(session._id, req.user._id);

        // Consumir clase de la suscripción (estudiante pierde la clase)
        const subscription = await StudentSubscription.findById(session.subscriptionId);
        if (subscription) {
            await subscription.consumeClass('student-noshow');
        }

        res.json({
            success: true,
            message: 'No-show registrado. La clase se descontará del paquete del estudiante.'
        });
    } catch (error) {
        console.error('[ClassSessions] Error marcando no-show:', error);
        res.status(500).json({ success: false, error: 'Error interno' });
    }
});

/**
 * POST /api/class-sessions/:id/teacher-noshow
 * Estudiante reporta que el profesor no apareció
 */
router.post('/:id/teacher-noshow', authMiddleware, async (req, res) => {
    try {
        const session = await ClassSession.findById(req.params.id);
        
        if (!session) {
            return res.status(404).json({ 
                success: false, 
                error: 'Sesión no encontrada' 
            });
        }

        if (session.studentId.toString() !== req.user._id.toString()) {
            return res.status(403).json({ 
                success: false, 
                error: 'Solo el estudiante puede reportar no-show del profesor' 
            });
        }

        // Marcar no-show (el profesor NO cobra y debe compensar)
        await ClassSession.markTeacherNoShow(session._id, req.user._id);

        res.json({
            success: true,
            message: 'No-show del profesor registrado. Se te devolverá la clase + 1 clase de compensación.'
        });
    } catch (error) {
        console.error('[ClassSessions] Error marcando no-show profesor:', error);
        res.status(500).json({ success: false, error: 'Error interno' });
    }
});

/**
 * POST /api/class-sessions/:id/dispute
 * Abrir una disputa
 */
router.post('/:id/dispute', authMiddleware, async (req, res) => {
    try {
        const session = await ClassSession.findById(req.params.id);
        
        if (!session) {
            return res.status(404).json({ 
                success: false, 
                error: 'Sesión no encontrada' 
            });
        }

        // Verificar que es parte de la sesión
        const isTeacher = session.teacherId.toString() === req.user._id.toString();
        const isStudent = session.studentId.toString() === req.user._id.toString();
        
        if (!isTeacher && !isStudent) {
            return res.status(403).json({ 
                success: false, 
                error: 'No autorizado' 
            });
        }

        const { reason } = req.body;
        if (!reason || reason.length < 10) {
            return res.status(400).json({ 
                success: false, 
                error: 'Debes proporcionar una razón detallada (mínimo 10 caracteres)' 
            });
        }

        const raisedBy = isTeacher ? 'teacher' : 'student';
        await session.openDispute(raisedBy, reason);

        // TODO: Notificar a admin y a la otra parte

        res.json({
            success: true,
            session,
            message: 'Disputa abierta. Un administrador revisará el caso en 24-48 horas.'
        });
    } catch (error) {
        console.error('[ClassSessions] Error abriendo disputa:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message || 'Error interno' 
        });
    }
});

/**
 * GET /api/class-sessions/disputes
 * Obtener disputas pendientes (solo admin)
 */
router.get('/disputes', authMiddleware, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ 
                success: false, 
                error: 'Solo administradores pueden ver disputas' 
            });
        }

        const disputes = await ClassSession.find({
            'dispute.isDisputed': true,
            'dispute.resolvedAt': null
        })
        .populate('studentId', 'name email')
        .populate('teacherId', 'name email')
        .populate('subscriptionId')
        .sort({ 'dispute.raisedAt': 1 });

        res.json({
            success: true,
            disputes,
            count: disputes.length
        });
    } catch (error) {
        console.error('[ClassSessions] Error obteniendo disputas:', error);
        res.status(500).json({ success: false, error: 'Error interno' });
    }
});

/**
 * POST /api/class-sessions/:id/resolve-dispute
 * Resolver disputa (solo admin)
 */
router.post('/:id/resolve-dispute', authMiddleware, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ 
                success: false, 
                error: 'Solo administradores pueden resolver disputas' 
            });
        }

        const session = await ClassSession.findById(req.params.id);
        
        if (!session || !session.dispute.isDisputed) {
            return res.status(404).json({ 
                success: false, 
                error: 'Disputa no encontrada' 
            });
        }

        const { resolution, notes } = req.body;
        if (!['student-favor', 'teacher-favor', 'split', 'void'].includes(resolution)) {
            return res.status(400).json({ 
                success: false, 
                error: 'Resolución inválida' 
            });
        }

        await session.resolveDispute(req.user._id, resolution, notes);

        // Si la resolución favorece al estudiante, devolver la clase
        if (resolution === 'student-favor') {
            const subscription = await StudentSubscription.findById(session.subscriptionId);
            if (subscription) {
                subscription.classesRemaining += 1;
                await subscription.save();
            }
        }

        res.json({
            success: true,
            session,
            message: `Disputa resuelta: ${resolution}`
        });
    } catch (error) {
        console.error('[ClassSessions] Error resolviendo disputa:', error);
        res.status(500).json({ success: false, error: 'Error interno' });
    }
});

module.exports = router;
