/**
 * routes/studentInviteRoutes.js
 * Rutas para el sistema de invitación gratuita de estudiantes.
 * 
 * Flujo:
 * 1. Admin envía invitación desde CRM → POST /send (auth admin)
 * 2. Estudiante abre link → GET /validate/:token (público)
 * 3. Estudiante se registra → POST /register/:token (público)
 *    → Crea User (role: client), WelcomeKit (gift_invite, $0), actualiza CrmLead
 * 4. Admin puede listar invitaciones → GET /list (auth admin)
 */
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const StudentInvite = require('../models/StudentInvite');
const User = require('../models/User');
const WelcomeKit = require('../models/WelcomeKit');
const CrmLead = require('../crm/models/CrmLead');

const { protect, adminOnly } = require('../middleware/authMiddleware');

// ==================== RUTAS PÚBLICAS ====================

/**
 * GET /validate/:token — Verifica si un token de invitación es válido
 * Retorna datos básicos para prellenar el form
 */
router.get('/validate/:token', async (req, res) => {
    try {
        const invite = await StudentInvite.findValidByToken(req.params.token);
        if (!invite) {
            return res.status(404).json({
                valid: false,
                message: 'Invitación no válida, expirada o ya utilizada.'
            });
        }

        // Marcar como abierta si es la primera vez
        if (invite.status === 'sent' || invite.status === 'pending') {
            await invite.markAsOpened();
        }

        return res.json({
            valid: true,
            recipientName: invite.recipientName,
            recipientEmail: invite.recipientEmail,
            expiresAt: invite.expiresAt
        });
    } catch (error) {
        console.error('[StudentInvite] Error validando token:', error.message);
        return res.status(500).json({ valid: false, message: 'Error del servidor.' });
    }
});

/**
 * POST /register/:token — Registra al estudiante con la invitación
 * Body: { name, email, password }
 * Crea: User (role: client) + WelcomeKit (gift_invite, $0)
 * Retorna: JWT para auto-login + datos del usuario
 */
router.post('/register/:token', async (req, res) => {
    try {
        const invite = await StudentInvite.findValidByToken(req.params.token);
        if (!invite) {
            return res.status(400).json({
                success: false,
                message: 'Invitación no válida, expirada o ya utilizada.'
            });
        }

        const { name, email, password } = req.body;

        // Validaciones
        if (!name || !email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Nombre, email y contraseña son obligatorios.'
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'La contraseña debe tener al menos 6 caracteres.'
            });
        }

        const cleanEmail = email.toLowerCase().trim();

        // Verificar que el email no esté registrado
        const existingUser = await User.findOne({ email: cleanEmail });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'Este email ya está registrado. Intenta iniciar sesión.'
            });
        }

        // === Crear usuario (role: client) ===
        const nameParts = name.trim().split(/\s+/);
        const firstName = nameParts[0] || name;
        const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';

        const user = await User.create({
            name: firstName,
            lastName,
            email: cleanEmail,
            password,
            role: 'client',
            kitPurchased: true,
            kitPurchaseDate: new Date(),
            mustChangePassword: false,
            clientData: {
                accountType: 'individual',
                managedStudents: []
            },
            classesRemaining: 1,
            classesCompleted: 0,
            studentData: {
                source: 'gift_invite',
                level: 'beginner'
            }
        });

        console.log(`[StudentInvite] ✅ Usuario creado: ${user.email} (${user._id})`);

        // === Crear WelcomeKit (gratuito, V2 pipeline) ===
        const welcomeKit = await WelcomeKit.create({
            clientId: user._id,
            clientName: name,
            clientEmail: cleanEmail,
            payment: {
                provider: 'gift_invite',
                externalOrderId: `gift_${invite.token.substring(0, 16)}`,
                amount: 0,
                currency: 'USD',
                paidAt: new Date()
            },
            kitType: 'setup_only',
            shipping: {
                status: 'not_required',
                address: { country: 'N/A' }
            },
            overallStatus: 'entrevista_pendiente'
        });

        console.log(`[StudentInvite] ✅ WelcomeKit creado: ${welcomeKit._id} (gift_invite)`);

        // === Marcar invitación como registrada ===
        await invite.markAsRegistered(user._id, welcomeKit._id);

        // === Actualizar CrmLead ===
        if (invite.crmLeadId) {
            try {
                const crmLead = await CrmLead.findById(invite.crmLeadId);
                if (crmLead) {
                    crmLead.pipelineStudent = 'enrolled';
                    crmLead.lifecycleStage = 'customer';
                    // Sumar score por conversión
                    const newScore = Math.min(100, (crmLead.score || 0) + 25);
                    crmLead.updateScore(newScore, 'Registro vía invitación gratuita');
                    crmLead.convertedUserId = user._id;
                    crmLead.convertedAt = new Date();
                    await crmLead.save();
                    console.log(`[StudentInvite] 🔄 CrmLead actualizado: ${crmLead.email} → enrolled`);
                }
            } catch (leadErr) {
                console.warn('[StudentInvite] ⚠️ Error actualizando CrmLead:', leadErr.message);
            }
        }

        // === Generar JWT para auto-login ===
        const token = jwt.sign(
            { id: user._id },
            process.env.JWT_SECRET,
            { expiresIn: '30d' }
        );

        return res.status(201).json({
            success: true,
            message: '¡Cuenta creada! Tu Kit de Bienvenida está listo.',
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role
            },
            welcomeKitId: welcomeKit._id,
            redirectTo: '/mi-kit'
        });

    } catch (error) {
        console.error('[StudentInvite] ❌ Error en registro:', error.message, error.stack);
        return res.status(500).json({
            success: false,
            message: 'Error al crear la cuenta. Intenta de nuevo.'
        });
    }
});

// ==================== RUTAS ADMIN (protegidas) ====================

/**
 * POST /send — Envía invitación a un CrmLead
 * Body: { crmLeadId, adminNote? }
 * Crea StudentInvite + envía email con enlace
 */
router.post('/send', protect, adminOnly, async (req, res) => {
    try {
        const { crmLeadId, adminNote } = req.body;

        if (!crmLeadId) {
            return res.status(400).json({ success: false, message: 'crmLeadId es obligatorio.' });
        }

        // Buscar CrmLead
        const crmLead = await CrmLead.findById(crmLeadId);
        if (!crmLead) {
            return res.status(404).json({ success: false, message: 'Lead no encontrado.' });
        }

        // Verificar que no esté ya registrado
        const existingUser = await User.findOne({ email: crmLead.email });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: `${crmLead.email} ya tiene una cuenta registrada.`
            });
        }

        // Crear invitación (reutiliza si ya hay una activa)
        const invite = await StudentInvite.createForCrmLead(crmLead, adminNote);

        // Construir URL de invitación
        const baseUrl = process.env.APP_URL || process.env.FRONTEND_URL || 'https://pianolink.net';
        const inviteUrl = `${baseUrl}/student-invite/${invite.token}`;

        // Enviar email
        let emailResult = { success: false, simulated: true };
        try {
            const { getInstance } = require('../crm/services/CrmResendService');
            const resendService = getInstance();

            if (resendService && resendService.isConfigured()) {
                const recipientName = invite.recipientName || 'amigo/a';
                const html = _buildInviteEmailHtml(recipientName, inviteUrl);
                emailResult = await resendService.sendEmail(
                    invite.recipientEmail,
                    '🎹 ¡Invitación especial a PianoLink! Tu Kit de Bienvenida gratis',
                    html,
                    { nombre: recipientName }
                );
            }
        } catch (emailErr) {
            console.warn('[StudentInvite] ⚠️ Error enviando email:', emailErr.message);
        }

        // Marcar como enviada
        if (emailResult.success || emailResult.simulated) {
            await invite.markAsSent(emailResult.id || null);
        }

        // Registrar interacción en CrmLead
        try {
            const CrmInteraction = require('../crm/models/CrmInteraction');
            await CrmInteraction.create({
                crmLeadId: crmLead._id,
                type: 'email',
                direction: 'outbound',
                subject: 'Invitación gratuita al Kit de Bienvenida',
                content: `Invitación enviada. Link: ${inviteUrl}`,
                channel: 'email',
                metadata: {
                    inviteId: invite._id,
                    inviteToken: invite.token
                }
            });
        } catch (intErr) {
            console.warn('[StudentInvite] ⚠️ Error creando interacción:', intErr.message);
        }

        // Actualizar pipeline del lead
        if (crmLead.pipelineStudent !== 'enrolled') {
            crmLead.pipelineStudent = crmLead.pipelineStudent || 'contacted';
            const newScore = Math.min(100, (crmLead.score || 0) + 10);
            crmLead.updateScore(newScore, 'Invitación gratuita enviada');
            await crmLead.save();
        }

        console.log(`[StudentInvite] 📧 Invitación enviada a ${invite.recipientEmail} (token: ${invite.token.substring(0, 8)}...)`);

        return res.json({
            success: true,
            invite: {
                id: invite._id,
                recipientEmail: invite.recipientEmail,
                recipientName: invite.recipientName,
                status: invite.status,
                expiresAt: invite.expiresAt,
                inviteUrl
            },
            emailSent: emailResult.success || emailResult.simulated
        });

    } catch (error) {
        console.error('[StudentInvite] ❌ Error enviando invitación:', error.message, error.stack);
        return res.status(500).json({ success: false, message: 'Error al enviar la invitación.' });
    }
});

/**
 * GET /list — Lista todas las invitaciones (admin)
 */
router.get('/list', protect, adminOnly, async (req, res) => {
    try {
        const { status, page = 1, limit = 20 } = req.query;
        const filter = {};
        if (status) filter.status = status;

        const total = await StudentInvite.countDocuments(filter);
        const invites = await StudentInvite.find(filter)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(parseInt(limit))
            .populate('registeredUserId', 'name email')
            .populate('welcomeKitId', 'overallStatus')
            .lean();

        return res.json({
            success: true,
            invites,
            pagination: {
                total,
                page: parseInt(page),
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('[StudentInvite] Error listando invitaciones:', error.message);
        return res.status(500).json({ success: false, message: 'Error al listar invitaciones.' });
    }
});

/**
 * DELETE /revoke/:id — Revoca una invitación pendiente (admin)
 */
router.delete('/revoke/:id', protect, adminOnly, async (req, res) => {
    try {
        const invite = await StudentInvite.findById(req.params.id);
        if (!invite) {
            return res.status(404).json({ success: false, message: 'Invitación no encontrada.' });
        }
        if (invite.status === 'registered') {
            return res.status(400).json({ success: false, message: 'No se puede revocar una invitación ya utilizada.' });
        }
        invite.status = 'revoked';
        await invite.save();
        return res.json({ success: true, message: 'Invitación revocada.' });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Error al revocar.' });
    }
});

// ==================== EMAIL HTML ====================

/**
 * Genera el HTML del email de invitación gratuita
 */
function _buildInviteEmailHtml(name, inviteUrl) {
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Segoe UI',Arial,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 20px;">
        <tr>
            <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.08);">
                    <!-- Header -->
                    <tr>
                        <td style="background:linear-gradient(135deg,#ff764d,#ff5722);padding:30px 40px;text-align:center;">
                            <h1 style="color:#ffffff;margin:0;font-size:28px;">🎹 PianoLink</h1>
                            <p style="color:rgba(255,255,255,0.9);margin:8px 0 0;font-size:14px;">Invitación especial</p>
                        </td>
                    </tr>
                    <!-- Body -->
                    <tr>
                        <td style="padding:40px;">
                            <h2 style="color:#333;margin:0 0 16px;font-size:22px;">¡Hola ${name}! 🎉</h2>
                            <p style="color:#555;font-size:16px;line-height:1.6;margin:0 0 20px;">
                                Has sido seleccionado para recibir el <strong>Kit de Bienvenida de PianoLink</strong> totalmente <strong style="color:#ff764d;">GRATIS</strong>.
                            </p>
                            <p style="color:#555;font-size:16px;line-height:1.6;margin:0 0 24px;">
                                Esto incluye:
                            </p>
                            <ul style="color:#555;font-size:15px;line-height:1.8;margin:0 0 24px;padding-left:20px;">
                                <li>✅ Entrevista de bienvenida personalizada</li>
                                <li>✅ Sesión de Setup técnico (te ayudamos a configurar todo)</li>
                                <li>✅ Una clase de prueba con un profesor real</li>
                            </ul>
                            <p style="color:#555;font-size:16px;line-height:1.6;margin:0 0 30px;">
                                Solo necesitas crear tu cuenta (nombre, email y contraseña) y estarás listo para comenzar.
                            </p>
                            <!-- CTA Button -->
                            <table width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td align="center">
                                        <a href="${inviteUrl}" style="display:inline-block;background:#ff764d;color:#ffffff;text-decoration:none;padding:16px 40px;border-radius:8px;font-size:18px;font-weight:bold;letter-spacing:0.5px;">
                                            Crear mi cuenta gratis →
                                        </a>
                                    </td>
                                </tr>
                            </table>
                            <p style="color:#999;font-size:13px;text-align:center;margin:20px 0 0;">
                                Este enlace expira en 7 días.
                            </p>
                        </td>
                    </tr>
                    <!-- Footer -->
                    <tr>
                        <td style="background:#fafafa;padding:20px 40px;text-align:center;border-top:1px solid #eee;">
                            <p style="color:#999;font-size:12px;margin:0;">
                                PianoLink — Aprende piano online con profesores reales 🎶
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;
}

module.exports = router;
