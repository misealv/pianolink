/**
 * routes/rooms.js
 * API de Salas Persistentes - PianoLink v2.0
 */

const express = require('express');
const router = express.Router();
const { protect: auth } = require('../middleware/authMiddleware');
const { requireSubscription } = require('../middleware/gatekeeper');
const RoomService = require('../services/RoomService');
const Room = require('../models/Room');
const Enrollment = require('../models/Enrollment');

/**
 * GET /api/rooms/my
 * Obtener mi sala (profesor) o sala de mi profesor (alumno)
 */
router.get('/my', auth, async (req, res) => {
    try {
        if (req.user.role === 'teacher' || req.user.role === 'admin') {
            // Profesor: obtener o crear su sala
            const room = await RoomService.getOrCreateRoom(req.user._id, req.user.name);
            
            return res.json({
                room: {
                    id: room._id,
                    code: room.code,
                    name: room.name,
                    isLive: room.isLive,
                    libraryCount: room.library.length,
                    currentPDF: room.currentPDF,
                    settings: room.settings
                }
            });
        }

        // Alumno: buscar enrollment
        const enrollment = await Enrollment.getTeacherByStudent(req.user._id);
        
        if (!enrollment) {
            return res.json({ 
                room: null,
                message: 'No estás inscrito con ningún profesor'
            });
        }

        const room = enrollment.roomId;
        res.json({
            room: {
                id: room._id,
                code: room.code,
                name: room.name,
                isLive: room.isLive,
                teacher: enrollment.teacherId
            },
            enrollment: {
                status: enrollment.status,
                schedule: enrollment.schedule
            }
        });
    } catch (error) {
        console.error('[Rooms API] Error:', error);
        res.status(500).json({ error: 'Error obteniendo sala' });
    }
});

/**
 * GET /api/rooms/:code
 * Obtener info de una sala por código
 */
router.get('/:code', async (req, res) => {
    try {
        const room = await RoomService.getRoomByCode(req.params.code);
        
        if (!room) {
            return res.status(404).json({ error: 'Sala no encontrada' });
        }

        // Info pública (sin detalles sensibles)
        res.json({
            code: room.code,
            name: room.name,
            isLive: room.isLive,
            allowGuests: room.settings.allowGuestAccess
        });
    } catch (error) {
        console.error('[Rooms API] Error:', error);
        res.status(500).json({ error: 'Error obteniendo sala' });
    }
});

/**
 * POST /api/rooms/access-check
 * Verificar si tengo acceso a una sala
 */
router.post('/access-check', auth, async (req, res) => {
    try {
        const { roomCode } = req.body;
        
        if (!roomCode) {
            return res.status(400).json({ error: 'roomCode requerido' });
        }

        const result = await RoomService.canAccess(
            req.user._id, 
            req.user.role, 
            roomCode
        );

        res.json(result);
    } catch (error) {
        console.error('[Rooms API] Error:', error);
        res.status(500).json({ error: 'Error verificando acceso' });
    }
});

/**
 * PUT /api/rooms/settings
 * Actualizar configuración de mi sala (profesor)
 */
router.put('/settings', auth, async (req, res) => {
    try {
        if (req.user.role !== 'teacher' && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Solo profesores' });
        }

        const room = await Room.findByTeacher(req.user._id);
        if (!room) {
            return res.status(404).json({ error: 'No tienes sala' });
        }

        const { allowGuestAccess, autoSyncPDF, theme, name } = req.body;

        if (allowGuestAccess !== undefined) room.settings.allowGuestAccess = allowGuestAccess;
        if (autoSyncPDF !== undefined) room.settings.autoSyncPDF = autoSyncPDF;
        if (theme) room.settings.theme = theme;
        if (name) room.name = name;

        await room.save();

        res.json({ 
            success: true, 
            settings: room.settings,
            name: room.name
        });
    } catch (error) {
        console.error('[Rooms API] Error:', error);
        res.status(500).json({ error: 'Error actualizando configuración' });
    }
});

/**
 * GET /api/rooms/:code/library
 * Obtener biblioteca de PDFs de una sala
 */
router.get('/:code/library', auth, requireSubscription, async (req, res) => {
    try {
        const library = await RoomService.getLibrary(req.room._id);
        res.json({ library });
    } catch (error) {
        console.error('[Rooms API] Error:', error);
        res.status(500).json({ error: 'Error obteniendo biblioteca' });
    }
});

/**
 * POST /api/rooms/library/add
 * Agregar PDF a biblioteca (profesor)
 */
router.post('/library/add', auth, async (req, res) => {
    try {
        if (req.user.role !== 'teacher' && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Solo profesores' });
        }

        const room = await Room.findByTeacher(req.user._id);
        if (!room) {
            return res.status(404).json({ error: 'No tienes sala' });
        }

        const { filename, url, publicId, metadata } = req.body;

        const updatedRoom = await RoomService.addToLibrary(room._id, {
            filename,
            url,
            publicId,
            metadata
        }, req.user._id);

        res.json({ 
            success: true, 
            libraryCount: updatedRoom.library.length 
        });
    } catch (error) {
        console.error('[Rooms API] Error:', error);
        res.status(500).json({ error: 'Error agregando PDF' });
    }
});

/**
 * DELETE /api/rooms/library/:pdfId
 * Eliminar PDF de biblioteca (profesor)
 */
router.delete('/library/:pdfId', auth, async (req, res) => {
    try {
        if (req.user.role !== 'teacher' && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Solo profesores' });
        }

        const room = await Room.findByTeacher(req.user._id);
        if (!room) {
            return res.status(404).json({ error: 'No tienes sala' });
        }

        await RoomService.removeFromLibrary(room._id, req.params.pdfId);

        res.json({ success: true });
    } catch (error) {
        console.error('[Rooms API] Error:', error);
        res.status(500).json({ error: 'Error eliminando PDF' });
    }
});

/**
 * GET /api/rooms/students
 * Obtener alumnos de mi sala (profesor)
 */
router.get('/students', auth, async (req, res) => {
    try {
        if (req.user.role !== 'teacher' && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Solo profesores' });
        }

        const students = await Enrollment.getStudentsByTeacher(req.user._id);

        res.json({
            count: students.length,
            students: students.map(e => ({
                id: e.studentId._id,
                name: e.studentId.name,
                email: e.studentId.email,
                status: e.status,
                schedule: e.schedule
            }))
        });
    } catch (error) {
        console.error('[Rooms API] Error:', error);
        res.status(500).json({ error: 'Error obteniendo alumnos' });
    }
});

module.exports = router;
