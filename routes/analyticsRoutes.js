/* routes/analyticsRoutes.js */
const express = require('express');
const router = express.Router();
const Session = require('../models/Session');
const User = require('../models/User');
const SessionTracker = require('../services/SessionTracker');

/**
 * GET /api/analytics/sessions
 * Obtiene todas las sesiones con filtros opcionales
 */
router.get('/sessions', async (req, res) => {
    try {
        const { teacherId, startDate, endDate, limit = 50, page = 1 } = req.query;
        
        const query = {};
        if (teacherId) query.teacherId = teacherId;
        if (startDate) query.startTime = { $gte: new Date(startDate) };
        if (endDate) {
            query.endTime = query.endTime || {};
            query.endTime.$lte = new Date(endDate);
        }
        
        const skip = (page - 1) * limit;
        
        const sessions = await Session.find(query)
            .sort({ startTime: -1 })
            .limit(parseInt(limit))
            .skip(skip)
            .select('-__v');
        
        const total = await Session.countDocuments(query);
        
        res.json({
            sessions,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('[Analytics] Error obteniendo sesiones:', error);
        res.status(500).json({ message: 'Error al obtener sesiones' });
    }
});

/**
 * GET /api/analytics/teacher/:teacherId/stats
 * Obtiene estadísticas agregadas de un profesor
 */
router.get('/teacher/:teacherId/stats', async (req, res) => {
    try {
        const { teacherId } = req.params;
        const { startDate, endDate, period = 'all' } = req.query;
        
        // Calcular fechas según período
        let start, end;
        end = new Date();
        
        switch (period) {
            case 'today':
                start = new Date();
                start.setHours(0, 0, 0, 0);
                break;
            case 'week':
                start = new Date();
                start.setDate(start.getDate() - 7);
                break;
            case 'month':
                start = new Date();
                start.setMonth(start.getMonth() - 1);
                break;
            case 'year':
                start = new Date();
                start.setFullYear(start.getFullYear() - 1);
                break;
            default:
                start = startDate ? new Date(startDate) : null;
                end = endDate ? new Date(endDate) : end;
        }
        
        // Obtener estadísticas del modelo
        const stats = await Session.getTeacherStats(teacherId, start, end);
        
        // Obtener información del profesor
        const teacher = await User.findById(teacherId).select('name email branding.country isFoundingMember');
        
        // Obtener sesiones recientes para detalles adicionales
        const recentSessions = await Session.find({
            teacherId,
            ...(start && { startTime: { $gte: start, $lte: end } })
        })
        .sort({ startTime: -1 })
        .limit(10)
        .select('startTime duration totalStudents midiStats.notesPlayed roomCode');
        
        // Calcular métricas adicionales
        const sessionsWithVideo = await Session.countDocuments({
            teacherId,
            'videoStats.cameraEnabled': true,
            ...(start && { startTime: { $gte: start, $lte: end } })
        });
        
        const sessionsWithPLB = await Session.countDocuments({
            teacherId,
            'interactions.plbQueriesCount': { $gt: 0 },
            ...(start && { startTime: { $gte: start, $lte: end } })
        });
        
        res.json({
            teacher: {
                id: teacherId,
                name: teacher?.name || 'Desconocido',
                email: teacher?.email,
                country: teacher?.branding?.country,
                isFoundingMember: teacher?.isFoundingMember
            },
            period: {
                start: start?.toISOString(),
                end: end.toISOString(),
                label: period
            },
            stats: {
                ...stats,
                sessionsWithVideo,
                sessionsWithPLB,
                videoUsageRate: stats.totalSessions > 0 
                    ? Math.round((sessionsWithVideo / stats.totalSessions) * 100) 
                    : 0,
                plbUsageRate: stats.totalSessions > 0 
                    ? Math.round((sessionsWithPLB / stats.totalSessions) * 100) 
                    : 0
            },
            recentSessions
        });
    } catch (error) {
        console.error('[Analytics] Error obteniendo stats de profesor:', error);
        res.status(500).json({ message: 'Error al obtener estadísticas' });
    }
});

/**
 * GET /api/analytics/teachers/ranking
 * Obtiene ranking de profesores por actividad
 */
router.get('/teachers/ranking', async (req, res) => {
    try {
        const { period = 'month', metric = 'sessions', limit = 10 } = req.query;
        
        // Calcular fecha de inicio según período
        const startDate = new Date();
        switch (period) {
            case 'week':
                startDate.setDate(startDate.getDate() - 7);
                break;
            case 'month':
                startDate.setMonth(startDate.getMonth() - 1);
                break;
            case 'year':
                startDate.setFullYear(startDate.getFullYear() - 1);
                break;
        }
        
        // Agregación según métrica
        let groupBy, sortBy;
        
        switch (metric) {
            case 'sessions':
                groupBy = { $sum: 1 };
                sortBy = 'totalSessions';
                break;
            case 'duration':
                groupBy = { $sum: '$duration' };
                sortBy = 'totalDuration';
                break;
            case 'students':
                groupBy = { $sum: '$totalStudents' };
                sortBy = 'totalStudents';
                break;
            case 'midiNotes':
                groupBy = { $sum: '$midiStats.notesPlayed' };
                sortBy = 'totalNotes';
                break;
            default:
                groupBy = { $sum: 1 };
                sortBy = 'totalSessions';
        }
        
        const ranking = await Session.aggregate([
            {
                $match: {
                    startTime: { $gte: startDate }
                }
            },
            {
                $group: {
                    _id: '$teacherId',
                    teacherName: { $first: '$teacherName' },
                    teacherEmail: { $first: '$teacherEmail' },
                    [sortBy]: groupBy,
                    avgDuration: { $avg: '$duration' },
                    avgStudents: { $avg: '$totalStudents' }
                }
            },
            {
                $sort: { [sortBy]: -1 }
            },
            {
                $limit: parseInt(limit)
            }
        ]);
        
        res.json({
            period,
            metric,
            ranking: ranking.map((r, index) => ({
                rank: index + 1,
                teacherId: r._id,
                teacherName: r.teacherName,
                teacherEmail: r.teacherEmail,
                value: r[sortBy],
                avgDuration: Math.round(r.avgDuration || 0),
                avgStudents: Math.round((r.avgStudents || 0) * 10) / 10
            }))
        });
    } catch (error) {
        console.error('[Analytics] Error obteniendo ranking:', error);
        res.status(500).json({ message: 'Error al obtener ranking' });
    }
});

/**
 * GET /api/analytics/active-sessions
 * Obtiene sesiones actualmente en curso
 */
router.get('/active-sessions', (req, res) => {
    try {
        const activeSessions = SessionTracker.getActiveSessions();
        
        res.json({
            count: activeSessions.length,
            sessions: activeSessions.map(session => ({
                roomCode: session.roomCode,
                teacherName: session.teacherName,
                startTime: session.startTime,
                duration: Math.round((Date.now() - session.startTime) / 1000 / 60),
                students: session.students.length,
                midiActivity: session.midiStats.notesPlayed,
                videoEnabled: session.videoStats.cameraEnabled
            }))
        });
    } catch (error) {
        console.error('[Analytics] Error obteniendo sesiones activas:', error);
        res.status(500).json({ message: 'Error al obtener sesiones activas' });
    }
});

/**
 * GET /api/analytics/session/:sessionId
 * Obtiene detalles completos de una sesión específica
 */
router.get('/session/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        
        const session = await Session.findById(sessionId);
        
        if (!session) {
            return res.status(404).json({ message: 'Sesión no encontrada' });
        }
        
        res.json(session);
    } catch (error) {
        console.error('[Analytics] Error obteniendo sesión:', error);
        res.status(500).json({ message: 'Error al obtener sesión' });
    }
});

/**
 * GET /api/analytics/dashboard
 * Obtiene métricas generales de la plataforma
 */
router.get('/dashboard', async (req, res) => {
    try {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const weekAgo = new Date(today);
        weekAgo.setDate(weekAgo.getDate() - 7);
        
        // Sesiones activas
        const activeSessions = SessionTracker.getActiveSessions();
        
        // Sesiones hoy
        const sessionsToday = await Session.countDocuments({
            startTime: { $gte: today }
        });
        
        // Sesiones esta semana
        const sessionsThisWeek = await Session.countDocuments({
            startTime: { $gte: weekAgo }
        });
        
        // Total de sesiones
        const totalSessions = await Session.countDocuments();
        
        // Profesores activos (que han dado al menos una clase)
        const activeTeachers = await Session.distinct('teacherId');
        
        // Duración total de clases
        const durationStats = await Session.aggregate([
            {
                $group: {
                    _id: null,
                    totalMinutes: { $sum: '$duration' },
                    avgMinutes: { $avg: '$duration' }
                }
            }
        ]);
        
        // Total de estudiantes atendidos
        const studentStats = await Session.aggregate([
            {
                $group: {
                    _id: null,
                    totalStudents: { $sum: '$totalStudents' }
                }
            }
        ]);
        
        res.json({
            platform: {
                activeSessionsNow: activeSessions.length,
                sessionsToday,
                sessionsThisWeek,
                totalSessions,
                activeTeachers: activeTeachers.length
            },
            usage: {
                totalMinutes: durationStats[0]?.totalMinutes || 0,
                avgSessionMinutes: Math.round(durationStats[0]?.avgMinutes || 0),
                totalStudentsServed: studentStats[0]?.totalStudents || 0
            },
            activeSessions: activeSessions.map(s => ({
                roomCode: s.roomCode,
                teacher: s.teacherName,
                students: s.students.length,
                duration: Math.round((Date.now() - s.startTime) / 1000 / 60)
            }))
        });
    } catch (error) {
        console.error('[Analytics] Error obteniendo dashboard:', error);
        res.status(500).json({ message: 'Error al obtener dashboard' });
    }
});

module.exports = router;
