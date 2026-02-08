/* routes/bookingRoutes.js */
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const BookingService = require('../services/BookingService');
const EmailService = require('../services/EmailService');
const Booking = require('../models/Booking');
const TimeSlot = require('../models/TimeSlot');

// ==================== RESERVAS ====================

/**
 * POST /api/bookings
 * Crear una nueva reserva
 */
router.post('/', protect, async (req, res) => {
    try {
        const { slotId, studentId, timezone } = req.body;
        
        // Determinar quién es el estudiante y quién paga
        const actualStudentId = studentId || req.user._id;
        const clientId = req.user.role === 'client' ? req.user._id : null;
        
        const result = await BookingService.bookSlot(
            slotId,
            actualStudentId,
            clientId,
            timezone || req.user.timezone || 'America/Santiago'
        );
        
        res.status(201).json(result);
    } catch (error) {
        console.error('Error creando reserva:', error);
        
        // Errores específicos
        if (error.message === 'SLOT_UNAVAILABLE') {
            return res.status(409).json({ message: 'Este horario ya no está disponible' });
        }
        if (error.message === 'INSUFFICIENT_CLASSES') {
            return res.status(402).json({ message: 'No tienes clases disponibles' });
        }
        
        res.status(500).json({ message: error.message });
    }
});

/**
 * GET /api/bookings/my
 * Obtener mis reservas (estudiante)
 */
router.get('/my', protect, async (req, res) => {
    try {
        const { type, page, limit } = req.query;
        
        let bookings;
        if (type === 'history') {
            bookings = await BookingService.getBookingHistory(
                req.user._id,
                parseInt(page) || 1,
                parseInt(limit) || 20
            );
        } else {
            bookings = await BookingService.getUpcomingBookings(
                req.user._id,
                parseInt(limit) || 10
            );
        }
        
        res.json(bookings);
    } catch (error) {
        console.error('Error obteniendo reservas:', error);
        res.status(500).json({ message: error.message });
    }
});

/**
 * GET /api/bookings/my-classes
 * Obtener clases del estudiante separadas en upcoming/past para mis-clases.html
 */
router.get('/my-classes', protect, async (req, res) => {
    try {
        const userId = req.user._id;
        const now = new Date();

        // Buscar reservas donde el usuario es estudiante o cliente
        const query = {
            $or: [
                { studentId: userId },
                { clientId: userId }
            ],
            status: { $ne: 'draft' }
        };

        const bookings = await Booking.find(query)
            .populate('teacherId', 'name branding.profilePhotoUrl slug')
            .populate('slotId', 'startTime endTime midiSession.roomUrl')
            .sort({ scheduledStart: -1 })
            .limit(100)
            .lean();

        // Separar en upcoming y past
        const upcoming = [];
        const past = [];

        for (const booking of bookings) {
            const classTime = booking.slotId?.startTime || booking.scheduledStart;
            const isUpcoming = new Date(classTime) > now && 
                ['pending', 'confirmed', 'in_progress'].includes(booking.status);
            
            if (isUpcoming) {
                upcoming.push(booking);
            } else {
                past.push(booking);
            }
        }

        // Ordenar upcoming de más próximo a más lejano
        upcoming.sort((a, b) => {
            const aTime = a.slotId?.startTime || a.scheduledStart;
            const bTime = b.slotId?.startTime || b.scheduledStart;
            return new Date(aTime) - new Date(bTime);
        });

        // Ordenar past de más reciente a más antiguo
        past.sort((a, b) => {
            const aTime = a.slotId?.startTime || a.scheduledStart;
            const bTime = b.slotId?.startTime || b.scheduledStart;
            return new Date(bTime) - new Date(aTime);
        });

        res.json({ upcoming, past });
    } catch (error) {
        console.error('Error obteniendo mis clases:', error);
        res.status(500).json({ message: error.message });
    }
});

/**
 * GET /api/bookings/pending-trial-rating
 * Obtener clase de prueba pendiente de calificación
 */
router.get('/pending-trial-rating', protect, async (req, res) => {
    try {
        const userId = req.user._id;

        // Buscar booking de prueba completado y pendiente de calificación
        const pendingTrial = await Booking.findOne({
            $or: [
                { studentId: userId },
                { clientId: userId }
            ],
            bookingType: 'trial',
            status: 'completed',
            trialPendingRating: true
        })
        .populate('teacherId', 'name branding.profilePhotoUrl slug')
        .lean();

        if (!pendingTrial) {
            return res.json({ hasPendingRating: false, booking: null });
        }

        // Buscar paquetes del profesor para sugerir
        const TeacherPackage = require('../models/TeacherPackage');
        const packages = await TeacherPackage.find({
            teacherId: pendingTrial.teacherId._id,
            isActive: true
        }).sort({ classCount: 1 }).lean();

        res.json({
            hasPendingRating: true,
            booking: pendingTrial,
            suggestedPackages: packages
        });
    } catch (error) {
        console.error('Error obteniendo trial pendiente:', error);
        res.status(500).json({ message: error.message });
    }
});

/**
 * GET /api/bookings/teacher
 * Obtener reservas del profesor
 */
router.get('/teacher', protect, async (req, res) => {
    try {
        const { from, to, status } = req.query;
        
        const query = {
            teacherId: req.user._id
        };
        
        if (from || to) {
            query.scheduledStart = {};
            if (from) query.scheduledStart.$gte = new Date(from);
            if (to) query.scheduledStart.$lte = new Date(to);
        }
        
        if (status) {
            query.status = status;
        }
        
        const bookings = await Booking.find(query)
            .populate('studentId', 'name email')
            .sort({ scheduledStart: 1 })
            .limit(50);
        
        res.json(bookings);
    } catch (error) {
        console.error('Error obteniendo reservas del profesor:', error);
        res.status(500).json({ message: error.message });
    }
});

/**
 * GET /api/bookings/my-next
 * Obtener la próxima clase del usuario (estudiante o profesor)
 */
router.get('/my-next', protect, async (req, res) => {
    try {
        const userId = req.user._id;
        const now = new Date();
        
        // Buscar próxima clase (pendiente o confirmada, no cancelada)
        let query = {
            scheduledStart: { $gte: new Date(now.getTime() - 30 * 60 * 1000) }, // Desde 30 min atrás (por si ya empezó)
            status: { $in: ['pending', 'confirmed', 'in_progress'] }
        };
        
        // Dependiendo del rol
        if (req.user.role === 'teacher') {
            query.teacherId = userId;
        } else {
            query.$or = [
                { studentId: userId },
                { clientId: userId }
            ];
        }
        
        const nextBooking = await Booking.findOne(query)
            .sort({ scheduledStart: 1 })
            .populate('teacherId', 'name branding.profilePhotoUrl slug')
            .populate('studentId', 'name')
            .lean();
        
        if (!nextBooking) {
            return res.json({ 
                success: true, 
                hasNext: false,
                booking: null 
            });
        }
        
        // Calcular si puede entrar (15 min antes)
        const canJoinAt = new Date(nextBooking.scheduledStart.getTime() - 15 * 60 * 1000);
        const canJoinNow = now >= canJoinAt;
        const minutesUntilClass = Math.round((nextBooking.scheduledStart - now) / 60000);
        
        res.json({
            success: true,
            hasNext: true,
            booking: {
                _id: nextBooking._id,
                scheduledStart: nextBooking.scheduledStart,
                scheduledEnd: nextBooking.scheduledEnd,
                duration: nextBooking.duration,
                status: nextBooking.status,
                teacher: nextBooking.teacherId,
                student: nextBooking.studentId
            },
            canJoinNow,
            canJoinAt,
            minutesUntilClass
        });
        
    } catch (error) {
        console.error('Error obteniendo próxima clase:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * GET /api/bookings/:id
 * Obtener detalle de una reserva
 */
router.get('/:id', protect, async (req, res) => {
    try {
        const booking = await Booking.findById(req.params.id)
            .populate('teacherId', 'name branding.profilePhotoUrl timezone')
            .populate('studentId', 'name timezone')
            .populate('slotId');
        
        if (!booking) {
            return res.status(404).json({ message: 'Reserva no encontrada' });
        }
        
        // Verificar acceso
        const isTeacher = booking.teacherId._id.toString() === req.user._id.toString();
        const isStudent = booking.studentId._id.toString() === req.user._id.toString();
        const isClient = booking.clientId?.toString() === req.user._id.toString();
        
        if (!isTeacher && !isStudent && !isClient && req.user.role !== 'admin') {
            return res.status(403).json({ message: 'No tienes acceso a esta reserva' });
        }
        
        res.json(booking);
    } catch (error) {
        console.error('Error obteniendo reserva:', error);
        res.status(500).json({ message: error.message });
    }
});

/**
 * DELETE /api/bookings/:id
 * Cancelar una reserva (estudiante/cliente - requiere 24h anticipación)
 */
router.delete('/:id', protect, async (req, res) => {
    try {
        const { reason } = req.body;
        
        const result = await BookingService.cancelBooking(
            req.params.id,
            req.user._id,
            reason || ''
        );
        
        res.json(result);
    } catch (error) {
        console.error('Error cancelando reserva:', error);
        
        if (error.message === 'BOOKING_NOT_FOUND') {
            return res.status(404).json({ message: 'Reserva no encontrada' });
        }
        if (error.message === 'CANNOT_CANCEL') {
            return res.status(400).json({ message: 'No puedes cancelar con menos de 24 horas de anticipación' });
        }
        
        res.status(500).json({ message: error.message });
    }
});

/**
 * DELETE /api/bookings/:id/teacher
 * Cancelar una reserva (profesor - sin restricción de tiempo)
 */
router.delete('/:id/teacher', protect, async (req, res) => {
    try {
        const { reason } = req.body;
        
        // Verificar que es profesor
        if (req.user.role !== 'teacher' && req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Solo profesores pueden usar esta ruta' });
        }
        
        const result = await BookingService.cancelByTeacher(
            req.params.id,
            req.user._id,
            reason || ''
        );
        
        res.json(result);
    } catch (error) {
        console.error('Error cancelando reserva (profesor):', error);
        
        if (error.message === 'BOOKING_NOT_FOUND') {
            return res.status(404).json({ message: 'Reserva no encontrada o no te pertenece' });
        }
        
        res.status(500).json({ message: error.message });
    }
});

/**
 * PUT /api/bookings/:id/reschedule
 * Reagendar una reserva a otro horario (requiere 24h anticipación)
 */
router.put('/:id/reschedule', protect, async (req, res) => {
    try {
        const { newSlotId } = req.body;
        
        if (!newSlotId) {
            return res.status(400).json({ message: 'Debes seleccionar un nuevo horario' });
        }
        
        const result = await BookingService.rescheduleBooking(
            req.params.id,
            newSlotId,
            req.user._id
        );
        
        res.json(result);
    } catch (error) {
        console.error('Error reagendando reserva:', error);
        
        if (error.message === 'BOOKING_NOT_FOUND') {
            return res.status(404).json({ message: 'Reserva no encontrada' });
        }
        if (error.message === 'CANNOT_RESCHEDULE_LESS_THAN_24H') {
            return res.status(400).json({ message: 'No puedes reagendar con menos de 24 horas de anticipación' });
        }
        if (error.message === 'NEW_SLOT_UNAVAILABLE') {
            return res.status(409).json({ message: 'El nuevo horario ya no está disponible' });
        }
        
        res.status(500).json({ message: error.message });
    }
});

// ==================== SESIÓN DE CLASE ====================

/**
 * POST /api/bookings/:id/start
 * Iniciar una clase (profesor)
 */
router.post('/:id/start', protect, async (req, res) => {
    try {
        const booking = await BookingService.startClass(
            req.params.id,
            req.user._id
        );
        
        res.json({
            success: true,
            booking,
            message: 'Clase iniciada'
        });
    } catch (error) {
        console.error('Error iniciando clase:', error);
        res.status(500).json({ message: error.message });
    }
});

/**
 * POST /api/bookings/:id/complete
 * Marcar clase como completada (profesor)
 */
router.post('/:id/complete', protect, async (req, res) => {
    try {
        const { notes, topics } = req.body;
        
        const booking = await BookingService.completeClass(
            req.params.id,
            req.user._id,
            notes,
            topics || []
        );
        
        res.json({
            success: true,
            booking,
            message: 'Clase completada'
        });
    } catch (error) {
        console.error('Error completando clase:', error);
        res.status(500).json({ message: error.message });
    }
});

/**
 * POST /api/bookings/:id/no-show
 * Marcar como no-show
 */
router.post('/:id/no-show', protect, async (req, res) => {
    try {
        const booking = await Booking.findById(req.params.id);
        
        if (!booking) {
            return res.status(404).json({ message: 'Reserva no encontrada' });
        }
        
        // Verificar que es el profesor
        if (booking.teacherId.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Solo el profesor puede marcar no-show' });
        }
        
        booking.markAsNoShow(true);
        await booking.save();
        
        // Actualizar slot
        await TimeSlot.findByIdAndUpdate(booking.slotId, {
            status: 'no_show'
        });
        
        res.json({
            success: true,
            booking,
            message: 'Marcado como no-show'
        });
    } catch (error) {
        console.error('Error marcando no-show:', error);
        res.status(500).json({ message: error.message });
    }
});

/**
 * POST /api/bookings/:id/join
 * Obtener credenciales para unirse a la sesión MIDI
 */
router.post('/:id/join', protect, async (req, res) => {
    try {
        const booking = await Booking.findById(req.params.id)
            .populate('slotId');
        
        if (!booking) {
            return res.status(404).json({ message: 'Reserva no encontrada' });
        }
        
        // Verificar acceso
        const isTeacher = booking.teacherId.toString() === req.user._id.toString();
        const isStudent = booking.studentId.toString() === req.user._id.toString();
        
        if (!isTeacher && !isStudent) {
            return res.status(403).json({ message: 'No tienes acceso a esta clase' });
        }
        
        // Verificar que la clase está próxima (15 min antes hasta fin)
        const now = new Date();
        const canJoinFrom = new Date(booking.scheduledStart.getTime() - 15 * 60000);
        const canJoinUntil = booking.scheduledEnd;
        
        if (now < canJoinFrom) {
            return res.status(400).json({ 
                message: 'La clase aún no está disponible',
                canJoinAt: canJoinFrom
            });
        }
        
        if (now > canJoinUntil && booking.status !== 'in_progress') {
            return res.status(400).json({ message: 'La clase ya terminó' });
        }
        
        // Obtener sesión MIDI del slot
        const slot = booking.slotId;
        
        if (!slot.midiSession?.sessionId) {
            // Generar si no existe
            slot.generateMidiSession();
            await slot.save();
        }
        
        res.json({
            sessionId: slot.midiSession.sessionId,
            channelName: slot.midiSession.channelName,
            roomUrl: slot.midiSession.roomUrl,
            role: isTeacher ? 'teacher' : 'student',
            booking: {
                id: booking._id,
                scheduledStart: booking.scheduledStart,
                scheduledEnd: booking.scheduledEnd,
                duration: booking.duration
            }
        });
    } catch (error) {
        console.error('Error obteniendo credenciales:', error);
        res.status(500).json({ message: error.message });
    }
});

/**
 * POST /api/bookings/:id/rate
 * Calificar una clase (estudiante)
 */
router.post('/:id/rate', protect, async (req, res) => {
    try {
        const { rating, feedback } = req.body;
        
        const booking = await Booking.findById(req.params.id)
            .populate('teacherId', 'name branding.profilePhotoUrl slug');
        
        if (!booking) {
            return res.status(404).json({ message: 'Reserva no encontrada' });
        }
        
        // Verificar que es el estudiante o cliente
        const isStudent = booking.studentId.toString() === req.user._id.toString();
        const isClient = booking.clientId?.toString() === req.user._id.toString();
        
        if (!isStudent && !isClient) {
            return res.status(403).json({ message: 'Solo el estudiante puede calificar' });
        }
        
        if (booking.status !== 'completed') {
            return res.status(400).json({ message: 'Solo puedes calificar clases completadas' });
        }
        
        booking.studentRating = rating;
        booking.studentFeedback = feedback || '';
        
        // Si era clase de prueba, marcar como calificada
        if (booking.bookingType === 'trial' && booking.trialPendingRating) {
            booking.trialPendingRating = false;
            booking.trialRatedAt = new Date();
            
            // Actualizar WelcomeKit a completed
            const WelcomeKit = require('../models/WelcomeKit');
            const kit = await WelcomeKit.findOne({
                clientId: booking.clientId || booking.studentId,
                overallStatus: 'trial_completed'
            });
            
            if (kit) {
                kit.trialClass.studentRating = rating;
                kit.trialClass.studentFeedback = feedback || '';
                kit.trialClass.ratedAt = new Date();
                kit.overallStatus = 'completed';
                await kit.save();
                console.log(`[BookingRoutes] WelcomeKit ${kit._id} completado tras calificación`);
            }
        }
        
        await booking.save();
        
        res.json({
            success: true,
            message: 'Gracias por tu calificación',
            teacher: booking.teacherId,
            isTrialClass: booking.bookingType === 'trial'
        });
    } catch (error) {
        console.error('Error calificando:', error);
        res.status(500).json({ message: error.message });
    }
});

/**
 * GET /api/bookings/:id/room-access
 * Verificar si el usuario puede acceder a la sala de una reserva
 */
router.get('/:id/room-access', protect, async (req, res) => {
    try {
        const booking = await Booking.findById(req.params.id)
            .populate('teacherId', 'name branding.profilePhotoUrl slug')
            .populate('studentId', 'name');
        
        if (!booking) {
            return res.status(404).json({ 
                success: false, 
                canAccess: false,
                error: 'Reserva no encontrada' 
            });
        }
        
        // Verificar que es participante
        const isTeacher = booking.teacherId._id.toString() === req.user._id.toString();
        const isStudent = booking.studentId._id.toString() === req.user._id.toString();
        const isClient = booking.clientId?.toString() === req.user._id.toString();
        
        if (!isTeacher && !isStudent && !isClient) {
            return res.status(403).json({ 
                success: false, 
                canAccess: false,
                error: 'No tienes acceso a esta clase' 
            });
        }
        
        // Verificar estado
        if (['cancelled', 'no_show', 'completed'].includes(booking.status)) {
            return res.json({ 
                success: true, 
                canAccess: false,
                error: `Esta clase está ${booking.status === 'completed' ? 'finalizada' : 'cancelada'}`,
                booking: {
                    _id: booking._id,
                    status: booking.status
                }
            });
        }
        
        // Verificar tiempo (15 min antes)
        const now = new Date();
        const canJoinAt = new Date(booking.scheduledStart.getTime() - 15 * 60 * 1000);
        const canJoinNow = now >= canJoinAt;
        const minutesUntilClass = Math.round((booking.scheduledStart - now) / 60000);
        
        // Determinar rol del usuario en esta clase
        const userRole = isTeacher ? 'teacher' : 'student';
        
        // Generar roomId basado en booking
        const roomId = `class-${booking._id}`;
        
        res.json({
            success: true,
            canAccess: canJoinNow,
            waitTime: canJoinNow ? 0 : Math.round((canJoinAt - now) / 60000),
            minutesUntilClass,
            userRole,
            roomId,
            booking: {
                _id: booking._id,
                scheduledStart: booking.scheduledStart,
                scheduledEnd: booking.scheduledEnd,
                duration: booking.duration,
                status: booking.status,
                teacher: booking.teacherId,
                student: booking.studentId
            }
        });
        
    } catch (error) {
        console.error('Error verificando acceso:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==================== CLASE DE PRUEBA (MARKETPLACE) ====================

const GlobalConfig = require('../models/GlobalConfig');
const User = require('../models/User');

/**
 * POST /api/bookings/trial-class
 * Reservar clase de prueba GRATUITA
 * 
 * Flujo:
 * 1. Verificar que el profesor acepta clases de prueba
 * 2. Verificar que el slot esté disponible
 * 3. Verificar que el estudiante no tenga trial previo con este profesor
 * 4. Reservar slot directamente (status: confirmed)
 * 5. Generar sesión MIDI
 */
router.post('/trial-class', protect, async (req, res) => {
    try {
        const { teacherId, slotId, timezone } = req.body;
        const studentId = req.user._id;
        
        // Validaciones básicas
        if (!teacherId || !slotId) {
            return res.status(400).json({ 
                success: false, 
                message: 'teacherId y slotId son requeridos' 
            });
        }
        
        // Verificar que el profesor existe y acepta clases de prueba
        const teacher = await User.findById(teacherId).select('name email timezone teacherData branding');
        if (!teacher) {
            return res.status(404).json({ success: false, message: 'Profesor no encontrado' });
        }
        if (teacher.teacherData?.profile?.acceptsTrialClass === false) {
            return res.status(400).json({ 
                success: false, 
                message: 'Este profesor no ofrece clases de prueba actualmente' 
            });
        }
        
        // Verificar que el slot esté disponible
        const slot = await TimeSlot.findById(slotId);
        if (!slot) {
            return res.status(404).json({ success: false, message: 'Horario no encontrado' });
        }
        if (slot.status !== 'available') {
            return res.status(409).json({ 
                success: false, 
                message: 'Este horario ya no está disponible' 
            });
        }
        if (slot.teacherId.toString() !== teacherId) {
            return res.status(400).json({ success: false, message: 'El slot no pertenece al profesor' });
        }
        
        // Verificar que el estudiante no haya tomado clase de prueba con este profesor
        const existingTrial = await Booking.findOne({
            studentId,
            teacherId,
            bookingType: 'trial',
            status: { $nin: ['cancelled'] }
        });
        if (existingTrial) {
            return res.status(409).json({ 
                success: false, 
                message: 'Ya has tomado una clase de prueba con este profesor' 
            });
        }
        
        // Reservar slot directamente (clase gratuita)
        slot.status = 'booked';
        slot.bookedBy = studentId;
        
        // Generar sesión MIDI si el método existe
        if (typeof slot.generateMidiSession === 'function') {
            slot.generateMidiSession();
        }
        await slot.save();
        
        // Crear booking confirmado
        const booking = await Booking.create({
            slotId: slot._id,
            teacherId,
            studentId,
            scheduledStart: slot.startTime,
            scheduledEnd: slot.endTime,
            duration: slot.duration,
            teacherTimezone: slot.timezone || 'America/Santiago',
            studentTimezone: timezone || req.user.timezone || 'America/Santiago',
            bookingType: 'trial',
            status: 'confirmed',
            midiSessionId: slot.midiSession?.sessionId
        });
        
        // Actualizar slot con referencia al booking
        slot.bookingId = booking._id;
        await slot.save();
        
        console.log(`[TrialClass] ✅ Clase de prueba reservada: ${booking._id}`);
        
        // Enviar emails de confirmación (async, no bloquea respuesta)
        const slotDate = new Date(slot.startTime);
        const dateFormatted = slotDate.toLocaleDateString('es-ES', {
            weekday: 'long',
            day: 'numeric',
            month: 'long'
        });
        const timeFormatted = slotDate.toLocaleTimeString('es-ES', {
            hour: '2-digit',
            minute: '2-digit'
        });
        
        // Email al estudiante
        EmailService.sendTrialConfirmationToStudent({
            studentName: req.user.name,
            studentEmail: req.user.email,
            teacherName: teacher.name,
            teacherPhoto: teacher.branding?.profilePhotoUrl,
            classDate: dateFormatted,
            classTime: timeFormatted,
            duration: slot.duration || 30,
            timezone: timezone || 'tu hora local',
            roomUrl: slot.midiSession?.roomUrl,
            bookingId: booking._id
        }).catch(err => console.error('[TrialClass] Error enviando email al estudiante:', err.message));
        
        // Email al profesor
        EmailService.sendTrialConfirmationToTeacher({
            teacherName: teacher.name,
            teacherEmail: teacher.email,
            studentName: req.user.name,
            studentEmail: req.user.email,
            classDate: dateFormatted,
            classTime: timeFormatted,
            duration: slot.duration || 30,
            timezone: teacher.timezone || 'America/Santiago',
            roomUrl: slot.midiSession?.roomUrl,
            bookingId: booking._id
        }).catch(err => console.error('[TrialClass] Error enviando email al profesor:', err.message));
        
        res.status(201).json({
            success: true,
            message: '¡Clase de prueba reservada!',
            bookingId: booking._id,
            booking: {
                _id: booking._id,
                scheduledStart: booking.scheduledStart,
                scheduledEnd: booking.scheduledEnd,
                duration: booking.duration,
                status: booking.status
            },
            teacher: {
                name: teacher.name,
                photo: teacher.branding?.profilePhotoUrl
            },
            slot: {
                start: slot.startTime,
                end: slot.endTime
            },
            midiSession: slot.midiSession ? {
                roomUrl: slot.midiSession.roomUrl,
                sessionId: slot.midiSession.sessionId
            } : null
        });
        
    } catch (error) {
        console.error('[TrialClass] Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * GET /api/bookings/trial-class/info
 * Información sobre la clase de prueba (es gratuita)
 */
router.get('/trial-class/info', async (req, res) => {
    res.json({
        success: true,
        isFree: true,
        description: 'La primera clase de prueba es gratuita',
        duration: 30, // minutos
        currency: 'USD'
    });
});

module.exports = router;
