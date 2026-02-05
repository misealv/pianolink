/**
 * middleware/gatekeeper.js
 * Control de Acceso por Suscripción - PianoLink v2.0
 * 
 * ⚠️ CRÍTICO: Este middleware decide quién puede acceder a las salas
 */

const jwt = require('jsonwebtoken');
const Room = require('../models/Room');
const Enrollment = require('../models/Enrollment');
const SubscriptionService = require('../services/SubscriptionService');
const RoomService = require('../services/RoomService');

/**
 * Middleware para rutas HTTP que requieren suscripción activa
 */
const requireSubscription = async (req, res, next) => {
    try {
        // Ya debe haber pasado por authMiddleware
        if (!req.user) {
            return res.status(401).json({ error: 'No autenticado' });
        }

        const { role, _id: userId } = req.user;

        // Profesores y admins pasan directo
        if (role === 'teacher' || role === 'admin') {
            return next();
        }

        // Para estudiantes, verificar suscripción
        const roomCode = req.params.roomCode || req.body.roomCode || req.query.roomCode;
        
        if (!roomCode) {
            return res.status(400).json({ error: 'Código de sala requerido' });
        }

        const room = await Room.findByCode(roomCode);
        if (!room) {
            return res.status(404).json({ error: 'Sala no encontrada' });
        }

        // Verificar acceso
        const accessCheck = await SubscriptionService.canStudentAccess(userId, room.teacherId);

        if (!accessCheck.allowed) {
            return res.status(403).json({
                error: 'Suscripción requerida',
                reason: accessCheck.reason,
                expiresAt: accessCheck.expiresAt
            });
        }

        // Adjuntar info al request
        req.room = room;
        req.subscription = accessCheck.subscription;
        next();

    } catch (error) {
        console.error('[Gatekeeper] Error:', error);
        res.status(500).json({ error: 'Error de verificación' });
    }
};

/**
 * Verificar acceso a sala para WebSocket
 * Retorna objeto con resultado (no middleware)
 * 
 * @param {Object} params
 * @param {string} params.token - JWT token
 * @param {string} params.roomCode - Código de sala
 * @param {string} params.guestName - Nombre si es invitado (sin token)
 * @returns {Promise<Object>} { allowed, reason, user, room, accessType }
 */
const verifySocketAccess = async ({ token, roomCode, guestName }) => {
    try {
        // 1. Buscar sala
        const room = await Room.findByCode(roomCode);
        if (!room) {
            return { allowed: false, reason: 'ROOM_NOT_FOUND' };
        }

        // 2. Si no hay token, es invitado
        if (!token) {
            // Invitados solo pueden entrar si el profesor está presente
            if (!room.isLive) {
                return { 
                    allowed: false, 
                    reason: 'TEACHER_NOT_PRESENT',
                    message: 'El profesor no está en la sala'
                };
            }

            if (!room.settings.allowGuestAccess) {
                return { 
                    allowed: false, 
                    reason: 'GUESTS_NOT_ALLOWED',
                    message: 'Esta sala no permite invitados'
                };
            }

            return {
                allowed: true,
                reason: 'GUEST',
                accessType: 'guest',
                user: { name: guestName || 'Invitado', role: 'guest' },
                room
            };
        }

        // 3. Verificar token
        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);
        } catch (err) {
            return { allowed: false, reason: 'INVALID_TOKEN' };
        }

        const User = require('../models/User');
        const user = await User.findById(decoded.id).select('-password');
        
        if (!user) {
            return { allowed: false, reason: 'USER_NOT_FOUND' };
        }

        // 4. Profesor/Admin - verificar que sea dueño
        if (user.role === 'teacher' || user.role === 'admin') {
            const isOwner = room.teacherId.toString() === user._id.toString();
            
            if (!isOwner) {
                return { 
                    allowed: false, 
                    reason: 'NOT_ROOM_OWNER',
                    message: 'Esta no es tu sala'
                };
            }

            // 4.1 Verificar membresía activa del profesor (excepto admin)
            if (user.role === 'teacher') {
                const membershipStatus = user.teacherData?.subscriptionStatus;
                const isActive = membershipStatus === 'active';
                
                if (!isActive) {
                    return {
                        allowed: false,
                        reason: 'MEMBERSHIP_INACTIVE',
                        message: 'Tu membresía no está activa. Actívala para acceder a tu sala.',
                        membershipStatus: membershipStatus || 'none'
                    };
                }
            }

            return {
                allowed: true,
                reason: 'OWNER',
                accessType: 'teacher',
                user,
                room
            };
        }

        // 5. Estudiante - verificar enrollment y suscripción
        const enrollment = await Enrollment.findOne({
            studentId: user._id,
            roomId: room._id,
            status: 'active'
        });

        if (!enrollment) {
            // No está inscrito, pero puede entrar como invitado si el profe está
            if (room.isLive && room.settings.allowGuestAccess) {
                return {
                    allowed: true,
                    reason: 'GUEST_LOGGED',
                    accessType: 'guest',
                    user,
                    room
                };
            }
            return { 
                allowed: false, 
                reason: 'NOT_ENROLLED',
                message: 'No estás inscrito con este profesor'
            };
        }

        // 6. Verificar suscripción
        const subscriptionCheck = await SubscriptionService.canStudentAccess(
            user._id, 
            room.teacherId
        );

        if (!subscriptionCheck.allowed) {
            // Suscripción vencida - puede entrar solo si el profe está
            if (room.isLive) {
                return {
                    allowed: true,
                    reason: 'EXPIRED_BUT_LIVE',
                    accessType: 'student_limited',
                    user,
                    room,
                    subscription: subscriptionCheck.subscription,
                    warning: 'Tu suscripción expiró. Renueva para acceso completo.'
                };
            }

            return {
                allowed: false,
                reason: subscriptionCheck.reason,
                message: 'Tu suscripción ha expirado',
                expiresAt: subscriptionCheck.expiresAt
            };
        }

        // 7. Todo OK - acceso completo
        return {
            allowed: true,
            reason: 'SUBSCRIBED',
            accessType: 'student',
            user,
            room,
            subscription: subscriptionCheck.subscription
        };

    } catch (error) {
        console.error('[Gatekeeper] Error en verifySocketAccess:', error);
        return { allowed: false, reason: 'SERVER_ERROR' };
    }
};

/**
 * Middleware para Socket.io
 * Se usa en socket.use() o al momento del handshake
 */
const socketGatekeeper = async (socket, next) => {
    try {
        const { token, roomCode, guestName } = socket.handshake.auth;

        if (!roomCode) {
            return next(new Error('ROOM_CODE_REQUIRED'));
        }

        const result = await verifySocketAccess({ token, roomCode, guestName });

        if (!result.allowed) {
            return next(new Error(result.reason));
        }

        // Adjuntar info al socket
        socket.user = result.user;
        socket.room = result.room;
        socket.accessType = result.accessType;
        socket.roomCode = roomCode;

        if (result.warning) {
            socket.accessWarning = result.warning;
        }

        next();
    } catch (error) {
        console.error('[Gatekeeper Socket] Error:', error);
        next(new Error('GATEKEEPER_ERROR'));
    }
};

module.exports = {
    requireSubscription,
    verifySocketAccess,
    socketGatekeeper
};
