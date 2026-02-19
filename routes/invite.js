/**
 * routes/invite.js
 * Invitaciones Privadas por Email - PianoLink v6.0
 * 
 * Endpoints protegidos (profesor premium/founder):
 *   POST   /api/invite/send              - Enviar invitación por email
 *   GET    /api/invite/my-invites        - Listar invitaciones del profesor
 *   DELETE /api/invite/:code             - Revocar invitación
 *   POST   /api/invite/:code/resend      - Reenviar email de invitación
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

// ==================== HELPERS ====================

/**
 * Genera el HTML del email de invitación formal
 */
function buildInviteEmailHtml(teacherName, studentName, inviteUrl, preloadedClasses) {
    const classesSection = preloadedClasses > 0 
        ? `<tr><td style="padding: 16px 30px;">
               <div style="background: #f0f4ff; border-radius: 8px; padding: 14px 18px; border-left: 4px solid #6366f1;">
                   <p style="margin: 0; font-size: 14px; color: #4338ca; font-weight: 600;">
                       🎁 ${preloadedClasses} clase${preloadedClasses > 1 ? 's' : ''} ya pagada${preloadedClasses > 1 ? 's' : ''} te esperan
                   </p>
                   <p style="margin: 6px 0 0; font-size: 13px; color: #555;">
                       Tu profesor ya dejó preparadas tus primeras clases. Solo necesitas crear tu cuenta para comenzar.
                   </p>
               </div>
           </td></tr>` 
        : '';

    return `
    <div style="background: #f5f5f5; padding: 40px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
        <table cellpadding="0" cellspacing="0" style="max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
            <!-- Header con gradiente -->
            <tr>
                <td style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 32px 30px; text-align: center;">
                    <div style="font-size: 28px; margin-bottom: 8px;">🎹</div>
                    <h1 style="color: #ffffff; font-size: 20px; margin: 0; font-weight: 700; letter-spacing: -0.5px;">PianoLink</h1>
                    <p style="color: rgba(255,255,255,0.6); font-size: 12px; margin: 4px 0 0; text-transform: uppercase; letter-spacing: 1.5px;">Invitación Privada</p>
                </td>
            </tr>
            <!-- Cuerpo -->
            <tr>
                <td style="padding: 30px 30px 10px;">
                    <p style="font-size: 16px; color: #1e293b; margin: 0 0 6px;">Hola <strong>${studentName}</strong>,</p>
                    <p style="font-size: 15px; color: #475569; line-height: 1.6; margin: 0;">
                        El profesor <strong style="color: #1e293b;">${teacherName}</strong> te ha invitado personalmente a ser parte de su estudio en PianoLink.
                    </p>
                </td>
            </tr>
            <tr>
                <td style="padding: 10px 30px 6px;">
                    <p style="font-size: 14px; color: #64748b; line-height: 1.6; margin: 0;">
                        Al aceptar esta invitación, tendrás acceso a clases personalizadas de piano con atención directa de tu profesor, 
                        herramientas interactivas y seguimiento de tu progreso.
                    </p>
                </td>
            </tr>
            ${classesSection}
            <!-- Botón CTA -->
            <tr>
                <td style="padding: 24px 30px; text-align: center;">
                    <a href="${inviteUrl}" style="display: inline-block; background: linear-gradient(135deg, #4f46e5, #6366f1); color: #ffffff; text-decoration: none; padding: 14px 40px; border-radius: 10px; font-size: 15px; font-weight: 700; letter-spacing: 0.3px; box-shadow: 0 4px 14px rgba(99,102,241,0.4);">
                        Aceptar Invitación
                    </a>
                </td>
            </tr>
            <!-- Nota -->
            <tr>
                <td style="padding: 0 30px 24px; text-align: center;">
                    <p style="font-size: 12px; color: #94a3b8; margin: 0;">
                        Este enlace expira en 7 días. Si no solicitaste esta invitación, puedes ignorar este correo.
                    </p>
                </td>
            </tr>
            <!-- Footer -->
            <tr>
                <td style="background: #f8fafc; padding: 18px 30px; text-align: center; border-top: 1px solid #e2e8f0;">
                    <p style="font-size: 11px; color: #94a3b8; margin: 0;">
                        © ${new Date().getFullYear()} PianoLink · Plataforma de clases de piano en vivo
                    </p>
                </td>
            </tr>
        </table>
    </div>`;
}

// ==================== RUTAS PROTEGIDAS ====================

/**
 * POST /api/invite/send
 * Enviar invitación formal por email a un alumno
 * 
 * Body: { studentName, studentEmail, preloadedClasses? (0-4) }
 */
router.post('/send',
    protect,
    teacherOrAdmin,
    requirePermission('canInvitePrivateStudents'),
    async (req, res) => {
        try {
            const teacher = req.user;
            const { studentName, studentEmail, preloadedClasses = 0 } = req.body;

            // Validaciones
            if (!studentName?.trim() || !studentEmail?.trim()) {
                return res.status(400).json({
                    success: false,
                    message: 'El nombre y email del alumno son requeridos.'
                });
            }

            // Validar formato email básico
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(studentEmail.trim())) {
                return res.status(400).json({
                    success: false,
                    message: 'El email ingresado no es válido.'
                });
            }

            // Verificar que el alumno no tenga cuenta ya
            const existingUser = await User.findOne({ email: studentEmail.toLowerCase().trim() });
            if (existingUser) {
                return res.status(409).json({
                    success: false,
                    message: `Ya existe una cuenta con el email ${studentEmail}. El alumno puede iniciar sesión directamente.`
                });
            }

            // Verificar que no haya invitación activa para este email
            const existingInvite = await TeacherInvite.findOne({
                teacherId: teacher._id,
                studentEmail: studentEmail.toLowerCase().trim(),
                status: 'active',
                expiresAt: { $gt: new Date() }
            });
            if (existingInvite) {
                return res.status(409).json({
                    success: false,
                    message: `Ya tienes una invitación activa para ${studentEmail}. Puedes reenviarla.`
                });
            }

            // Límite de 3 invitaciones activas simultáneas
            const activeCount = await TeacherInvite.countActiveByTeacher(teacher._id);
            if (activeCount >= 3) {
                return res.status(400).json({
                    success: false,
                    message: 'Ya tienes 3 invitaciones pendientes. Espera a que acepten o revoca alguna.',
                    activeCount
                });
            }

            // Validar clases pre-pagadas (máximo 4)
            const classes = Math.min(Math.max(parseInt(preloadedClasses) || 0, 0), 4);

            // Generar código e invitación
            const code = TeacherInvite.generateCode(teacher.name);
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 7);

            const invite = new TeacherInvite({
                teacherId: teacher._id,
                code,
                type: 'private_student',
                status: 'active',
                studentName: studentName.trim(),
                studentEmail: studentEmail.toLowerCase().trim(),
                preloadedClasses: classes,
                expiresAt
            });

            await invite.save();

            // Enviar email de invitación formal
            const baseUrl = process.env.BASE_URL || 'https://pianolink.net';
            const inviteUrl = `${baseUrl}/invite/${code}`;

            try {
                await emailService.sendSafe({
                    to: studentEmail.toLowerCase().trim(),
                    subject: `🎹 ${teacher.name} te invita a PianoLink`,
                    html: buildInviteEmailHtml(teacher.name, studentName.trim(), inviteUrl, classes)
                });
                invite.emailSentAt = new Date();
                await invite.save();
            } catch (emailErr) {
                console.error('[Invite] Error enviando email de invitación:', emailErr.message);
                // No fallar — la invitación se creó, el email puede reenviarse
            }

            console.log(`[Invite] ${teacher.email} invitó a ${studentEmail} (código: ${code}, clases: ${classes})`);

            res.status(201).json({
                success: true,
                message: `Invitación enviada a ${studentEmail}`,
                invite: {
                    code: invite.code,
                    studentName: invite.studentName,
                    studentEmail: invite.studentEmail,
                    preloadedClasses: invite.preloadedClasses,
                    expiresAt: invite.expiresAt,
                    status: invite.status,
                    emailSentAt: invite.emailSentAt
                }
            });
        } catch (error) {
            console.error('[Invite] Error enviando invitación:', error.message);
            if (error.code === 11000) {
                return res.status(409).json({ success: false, message: 'Error generando código. Intenta de nuevo.' });
            }
            res.status(500).json({ success: false, message: 'Error interno al enviar invitación' });
        }
    }
);

// Mantener /generate como alias por compatibilidad
router.post('/generate',
    protect,
    teacherOrAdmin,
    requirePermission('canInvitePrivateStudents'),
    async (req, res) => {
        // Redirigir al nuevo endpoint
        req.url = '/send';
        router.handle(req, res);
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

            const result = invites.map(inv => ({
                code: inv.code,
                status: inv.status,
                studentName: inv.studentName || '',
                studentEmail: inv.studentEmail || '',
                preloadedClasses: inv.preloadedClasses || 0,
                emailSentAt: inv.emailSentAt || null,
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
 * POST /api/invite/:code/resend
 * Reenviar email de invitación
 */
router.post('/:code/resend',
    protect,
    teacherOrAdmin,
    requirePermission('canInvitePrivateStudents'),
    async (req, res) => {
        try {
            const invite = await TeacherInvite.findOne({
                code: req.params.code,
                teacherId: req.user._id,
                status: 'active'
            });

            if (!invite) {
                return res.status(404).json({ success: false, message: 'Invitación no encontrada o ya no está activa.' });
            }

            const baseUrl = process.env.BASE_URL || 'https://pianolink.net';
            const inviteUrl = `${baseUrl}/invite/${invite.code}`;

            await emailService.sendSafe({
                to: invite.studentEmail,
                subject: `🎹 Recordatorio: ${req.user.name} te invita a PianoLink`,
                html: buildInviteEmailHtml(req.user.name, invite.studentName, inviteUrl, invite.preloadedClasses)
            });

            invite.emailSentAt = new Date();
            await invite.save();

            res.json({ success: true, message: `Email reenviado a ${invite.studentEmail}` });
        } catch (error) {
            console.error('[Invite] Error reenviando email:', error.message);
            res.status(500).json({ success: false, message: 'Error al reenviar email' });
        }
    }
);

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

        // Clases pre-pagadas que el profesor asignó al generar el enlace
        const preloaded = invite.preloadedClasses || 0;

        const student = new User({
            name: name.trim(),
            email: email.toLowerCase().trim(),
            password: hashedPassword,
            role: 'student',
            country: country || '',
            classesRemaining: preloaded, // Sincronizar con enrollment para que BookingService las vea
            studentData: {
                source: 'invited',
                assignedTeacher: teacher._id
            }
        });

        await student.save();

        // 4. Crear enrollment con comisión 0% (alumno privado)
        const commission = await CommissionService.calculateCommission(teacher._id, 'private_invite');

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
