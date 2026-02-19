/**
 * routes/invite.js
 * CRUD de Invitaciones de Alumnos Particulares - PianoLink v5.0 (Fase 3)
 * 
 * Endpoints protegidos (profesor premium/founder):
 *   POST   /api/invite/generate         - Generar nueva invitación
 *   GET    /api/invite/my-invites        - Listar invitaciones del profesor
 *   DELETE /api/invite/:code             - Revocar invitación
 * 
 * Endpoint público (sin auth):
 *   GET    /api/invite/validate/:code    - Validar código de invitación
 *   POST   /api/invite/register/:code    - Registrar alumno por invitación
 */

const express = require('express');
const router = express.Router();
const { protect, teacherOrAdmin } = require('../middleware/authMiddleware');
const requirePermission = require('../middleware/requirePermission');
const TeacherInvite = require('../models/TeacherInvite');
const User = require('../models/User');
const Enrollment = require('../models/Enrollment');
const CommissionService = require('../services/CommissionService');
const PlanPermissionService = require('../services/PlanPermissionService');
const emailService = require('../services/EmailService');

// ==================== RUTAS PROTEGIDAS (profesor premium/founder) ====================

/**
 * POST /api/invite/generate
 * Generar nueva invitación para alumno particular
 * 
 * Body: { expiresInDays?: number } (default: 7 días)
 * Requiere: plan premium o founder con permiso canInvitePrivateStudents
 */
router.post('/generate',
    protect,
    teacherOrAdmin,
    requirePermission('canInvitePrivateStudents'),
    async (req, res) => {
        try {
            const teacher = req.user;
            const { expiresInDays = 7, preloadedClasses = 0 } = req.body;

            // Validar límite de 3 invitaciones activas simultáneas
            const activeCount = await TeacherInvite.countActiveByTeacher(teacher._id);
            if (activeCount >= 3) {
                return res.status(400).json({
                    success: false,
                    message: 'Ya tienes 3 invitaciones activas. Revoca o espera que expiren antes de crear otra.',
                    activeCount
                });
            }

            // Validar rango de expiración (1-30 días)
            const days = Math.min(Math.max(parseInt(expiresInDays) || 7, 1), 30);

            // Validar clases pre-pagadas (0-50)
            const classes = Math.min(Math.max(parseInt(preloadedClasses) || 0, 0), 50);

            // Generar código único
            const code = TeacherInvite.generateCode(teacher.name);

            // Calcular fecha de expiración
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + days);

            // Crear invitación
            const invite = new TeacherInvite({
                teacherId: teacher._id,
                code,
                type: 'private_student',
                status: 'active',
                preloadedClasses: classes,
                expiresAt
            });

            await invite.save();

            // Construir URL de invitación
            const baseUrl = process.env.BASE_URL || 'https://pianolink.net';
            const inviteUrl = `${baseUrl}/invite/${code}`;

            console.log(`[Invite] Profesor ${teacher.email} generó invitación: ${code}`);

            res.status(201).json({
                success: true,
                invite: {
                    code: invite.code,
                    url: inviteUrl,
                    expiresAt: invite.expiresAt,
                    status: invite.status,
                    preloadedClasses: invite.preloadedClasses,
                    createdAt: invite.createdAt
                }
            });
        } catch (error) {
            console.error('[Invite] Error generando invitación:', error.message);

            // Manejar código duplicado (raro pero posible)
            if (error.code === 11000) {
                return res.status(409).json({
                    success: false,
                    message: 'Error generando código único. Intenta de nuevo.'
                });
            }

            res.status(500).json({
                success: false,
                message: 'Error interno al generar invitación'
            });
        }
    }
);

/**
 * GET /api/invite/my-invites
 * Listar todas las invitaciones del profesor autenticado
 */
router.get('/my-invites',
    protect,
    teacherOrAdmin,
    requirePermission('canInvitePrivateStudents'),
    async (req, res) => {
        try {
            const invites = await TeacherInvite.getByTeacher(req.user._id);
            const activeCount = await TeacherInvite.countActiveByTeacher(req.user._id);
            const baseUrl = process.env.BASE_URL || 'https://pianolink.net';

            const result = invites.map(inv => ({
                code: inv.code,
                url: `${baseUrl}/invite/${inv.code}`,
                status: inv.status,
                preloadedClasses: inv.preloadedClasses || 0,
                expiresAt: inv.expiresAt,
                createdAt: inv.createdAt,
                usedBy: inv.usedBy ? {
                    name: inv.usedBy.name,
                    email: inv.usedBy.email
                } : null,
                usedAt: inv.usedAt
            }));

            res.json({
                success: true,
                count: result.length,
                activeCount,
                maxActive: 3,
                invites: result
            });
        } catch (error) {
            console.error('[Invite] Error listando invitaciones:', error.message);
            res.status(500).json({
                success: false,
                message: 'Error al obtener invitaciones'
            });
        }
    }
);

/**
 * DELETE /api/invite/:code
 * Revocar una invitación activa
 */
router.delete('/:code',
    protect,
    teacherOrAdmin,
    requirePermission('canInvitePrivateStudents'),
    async (req, res) => {
        try {
            const { code } = req.params;

            const invite = await TeacherInvite.findOne({
                code,
                teacherId: req.user._id
            });

            if (!invite) {
                return res.status(404).json({
                    success: false,
                    message: 'Invitación no encontrada'
                });
            }

            if (invite.status !== 'active') {
                return res.status(400).json({
                    success: false,
                    message: `No se puede revocar una invitación con estado "${invite.status}"`
                });
            }

            await invite.revoke();

            console.log(`[Invite] Profesor ${req.user.email} revocó invitación: ${code}`);

            res.json({
                success: true,
                message: 'Invitación revocada correctamente'
            });
        } catch (error) {
            console.error('[Invite] Error revocando invitación:', error.message);
            res.status(500).json({
                success: false,
                message: 'Error al revocar invitación'
            });
        }
    }
);

// ==================== RUTAS PÚBLICAS (sin auth) ====================

/**
 * GET /api/invite/validate/:code
 * Validar si un código de invitación es válido (sin registrar)
 * Usado por el frontend para mostrar info del profesor antes del registro
 */
router.get('/validate/:code', async (req, res) => {
    try {
        const { code } = req.params;

        const invite = await TeacherInvite.findValidByCode(code);

        if (!invite) {
            return res.status(404).json({
                success: false,
                valid: false,
                message: 'Enlace de invitación inválido o expirado'
            });
        }

        // Verificar que el profesor aún tenga permiso de invitar
        const teacher = invite.teacherId;
        const hasPermission = await PlanPermissionService.hasPermission(
            teacher._id,
            'canInvitePrivateStudents'
        );

        if (!hasPermission) {
            return res.status(410).json({
                success: false,
                valid: false,
                message: 'El profesor ya no tiene habilitada la invitación de alumnos'
            });
        }

        res.json({
            success: true,
            valid: true,
            teacher: {
                name: teacher.name,
                plan: teacher.teacherData?.plan
            },
            expiresAt: invite.expiresAt
        });
    } catch (error) {
        console.error('[Invite] Error validando código:', error.message);
        res.status(500).json({
            success: false,
            message: 'Error al validar invitación'
        });
    }
});

/**
 * POST /api/invite/register/:code
 * Registrar un nuevo alumno usando un código de invitación
 * 
 * Body: {
 *   name: string (requerido),
 *   email: string (requerido),
 *   password: string (requerido, min 6 chars),
 *   country?: string (código ISO)
 * }
 * 
 * Flujo:
 *   1. Validar código de invitación
 *   2. Verificar permisos del profesor
 *   3. Crear usuario alumno
 *   4. Crear enrollment con source='private_invite' y comisión 0%
 *   5. Marcar invitación como usada
 *   6. Notificar al profesor
 */
router.post('/register/:code', async (req, res) => {
    try {
        const { code } = req.params;
        const { name, email, password, country } = req.body;

        // Validaciones básicas
        if (!name || !email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Nombre, email y contraseña son requeridos'
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'La contraseña debe tener al menos 6 caracteres'
            });
        }

        // 1. Validar código de invitación
        const invite = await TeacherInvite.findValidByCode(code);
        if (!invite) {
            return res.status(404).json({
                success: false,
                message: 'Enlace de invitación inválido o expirado'
            });
        }

        // 2. Verificar que el profesor aún pueda invitar
        const teacher = invite.teacherId;
        const hasPermission = await PlanPermissionService.hasPermission(
            teacher._id,
            'canInvitePrivateStudents'
        );

        if (!hasPermission) {
            return res.status(410).json({
                success: false,
                message: 'El profesor ya no tiene habilitada la invitación de alumnos'
            });
        }

        // Verificar si el email ya existe
        const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: 'Ya existe una cuenta con este email. Inicia sesión para contactar al profesor.'
            });
        }

        // 3. Crear usuario alumno
        const bcrypt = require('bcryptjs');
        const hashedPassword = await bcrypt.hash(password, 10);

        const student = new User({
            name: name.trim(),
            email: email.toLowerCase().trim(),
            password: hashedPassword,
            role: 'student',
            country: country || '',
            studentData: {
                source: 'invited',
                assignedTeacher: teacher._id
            }
        });

        await student.save();

        // 4. Crear enrollment con comisión 0% (alumno privado)
        const commission = await CommissionService.calculateCommission(teacher._id, 'private_invite');

        // Clases pre-pagadas que el profesor asignó al generar el enlace
        const preloaded = invite.preloadedClasses || 0;

        const enrollment = new Enrollment({
            studentId: student._id,
            teacherId: teacher._id,
            roomId: null, // Se asigna sala después, cuando el profesor configure
            source: 'private_invite',
            inviteCode: code,
            preloadedClasses: preloaded,
            classesRemaining: preloaded,
            appliedCommission: {
                platformPercent: commission.platformPercent,
                teacherPercent: commission.teacherPercent,
                reason: commission.reason
            },
            status: 'active'
        });

        // Intentar guardar enrollment (roomId puede ser null en este flujo)
        // Si la sala es required, buscar sala del profesor o crear una
        try {
            await enrollment.save();
        } catch (enrollErr) {
            // Si falla por roomId required, buscar la sala activa del profesor
            if (enrollErr.errors?.roomId) {
                const Room = require('../models/Room');
                const teacherRoom = await Room.findOne({
                    teacherId: teacher._id,
                    status: 'active'
                });

                if (teacherRoom) {
                    enrollment.roomId = teacherRoom._id;
                    await enrollment.save();
                } else {
                    // Crear sin room por ahora, se asigna después
                    console.warn(`[Invite] Profesor ${teacher.email} sin sala activa. Enrollment sin room.`);
                    enrollment.schema.path('roomId').required(false);
                    await enrollment.save();
                }
            } else {
                throw enrollErr;
            }
        }

        // 5. Marcar invitación como usada
        await invite.markAsUsed(student._id);

        // 6. Notificar al profesor por email
        try {
            await emailService.sendSafe({
                to: teacher.email,
                subject: '🎹 Nuevo alumno privado registrado en PianoLink',
                html: `
                    <h2>¡Nuevo alumno registrado!</h2>
                    <p>Tu alumno <strong>${student.name}</strong> (${student.email}) se ha registrado 
                    usando tu enlace de invitación.</p>
                    ${preloaded > 0 ? `<p>Se le asignaron <strong>${preloaded} clases pre-pagadas</strong> según lo que configuraste al generar el enlace.</p>` : ''}
                    <p>Como alumno privado, <strong>PianoLink no cobra comisión</strong> por las clases con este alumno.</p>
                    <p>Ya puedes verlo en tu panel de alumnos.</p>
                `
            });
        } catch (emailErr) {
            // No bloquear el registro si falla el email
            console.error('[Invite] Error enviando notificación al profesor:', emailErr.message);
        }

        console.log(`[Invite] Alumno ${student.email} registrado por invitación de ${teacher.email} (código: ${code})`);

        // Generar JWT para el alumno (login automático)
        const jwt = require('jsonwebtoken');
        const token = jwt.sign(
            { id: student._id },
            process.env.JWT_SECRET,
            { expiresIn: '30d' }
        );

        res.status(201).json({
            success: true,
            message: 'Registro exitoso',
            student: {
                id: student._id,
                name: student.name,
                email: student.email,
                role: student.role
            },
            teacher: {
                name: teacher.name
            },
            enrollment: {
                source: enrollment.source,
                commission: enrollment.appliedCommission,
                preloadedClasses: enrollment.preloadedClasses,
                classesRemaining: enrollment.classesRemaining
            },
            token
        });
    } catch (error) {
        console.error('[Invite] Error en registro por invitación:', error.message);

        // Si hubo error después de crear el usuario, intentar limpiar
        // (evitar usuarios huérfanos)
        if (error.message !== 'Ya existe una cuenta con este email') {
            // No limpiar — mejor dejar el usuario y que el admin investigue
            console.error('[Invite] Error post-creación. Revisar manualmente.');
        }

        res.status(500).json({
            success: false,
            message: 'Error interno al procesar el registro'
        });
    }
});

module.exports = router;
