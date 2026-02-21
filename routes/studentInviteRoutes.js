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

        // === Notificar al admin por email ===
        try {
            const GlobalConfig = require('../models/GlobalConfig');
            const EmailService = require('../services/EmailService');
            const profile = await GlobalConfig.getAdminProfile();
            const notifEmail = profile.notificationEmail || profile.email || 'hola@pianolink.net';

            await EmailService.sendSafe({
                to: notifEmail,
                subject: `🎉 Nueva cuenta creada — ${name}`,
                html: `
                <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:20px;">
                    <h2 style="color:#22c55e;margin-bottom:20px;">🎉 Nuevo estudiante registrado</h2>
                    <table style="width:100%;border-collapse:collapse;">
                        <tr><td style="padding:8px 0;color:#888;width:120px;">Nombre:</td><td style="padding:8px 0;color:#333;font-weight:600;">${name}</td></tr>
                        <tr><td style="padding:8px 0;color:#888;">Email:</td><td style="padding:8px 0;color:#333;">${cleanEmail}</td></tr>
                        <tr><td style="padding:8px 0;color:#888;">Origen:</td><td style="padding:8px 0;color:#333;">Invitación gratuita</td></tr>
                        <tr><td style="padding:8px 0;color:#888;">Kit:</td><td style="padding:8px 0;color:#333;">${welcomeKit._id}</td></tr>
                        <tr><td style="padding:8px 0;color:#888;">Estado:</td><td style="padding:8px 0;color:#f59e0b;font-weight:600;">Entrevista pendiente</td></tr>
                    </table>
                    <p style="color:#888;font-size:12px;margin-top:20px;">El estudiante necesita agendar su entrevista de bienvenida.</p>
                </div>`
            });
            console.log(`[StudentInvite] 📧 Notificación enviada a admin: ${notifEmail}`);
        } catch (notifErr) {
            console.warn('[StudentInvite] ⚠️ Error notificando al admin:', notifErr.message);
        }

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
/**
 * POST /preview — Genera preview del email para editar en el modal
 * Body: { crmLeadId }
 * Retorna: { subject, body, recipientName, recipientEmail }
 */
router.post('/preview', protect, adminOnly, async (req, res) => {
    try {
        const { crmLeadId } = req.body;
        if (!crmLeadId) {
            return res.status(400).json({ success: false, message: 'crmLeadId es obligatorio.' });
        }

        const crmLead = await CrmLead.findById(crmLeadId).populate('leadRef', 'name email');
        if (!crmLead || !crmLead.leadRef) {
            return res.status(404).json({ success: false, message: 'Lead no encontrado.' });
        }

        const leadEmail = crmLead.leadRef.email;
        const leadName = crmLead.leadRef.name || leadEmail.split('@')[0];

        return res.json({
            success: true,
            recipientName: leadName,
            recipientEmail: leadEmail,
            subject: 'Te invito a una clase de piano gratis',
            body: _getDefaultEmailBody(leadName)
        });
    } catch (error) {
        console.error('[StudentInvite] Error en preview:', error.message);
        return res.status(500).json({ success: false, message: 'Error generando preview.' });
    }
});

/**
 * POST /send — Envía invitación a un CrmLead
 * Body: { crmLeadId, adminNote?, subject?, body? }
 * Crea StudentInvite + envía email con enlace
 */
router.post('/send', protect, adminOnly, async (req, res) => {
    try {
        const { crmLeadId, adminNote, subject: customSubject, body: customBody } = req.body;

        if (!crmLeadId) {
            return res.status(400).json({ success: false, message: 'crmLeadId es obligatorio.' });
        }

        // Buscar CrmLead con leadRef populado
        const crmLead = await CrmLead.findById(crmLeadId).populate('leadRef', 'name email');
        if (!crmLead || !crmLead.leadRef) {
            return res.status(404).json({ success: false, message: 'Lead no encontrado.' });
        }

        const leadEmail = crmLead.leadRef.email;
        const leadName = crmLead.leadRef.name || leadEmail.split('@')[0];

        // Verificar que no esté ya registrado
        const existingUser = await User.findOne({ email: leadEmail });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: `${leadEmail} ya tiene una cuenta registrada.`
            });
        }

        // Crear invitación (reutiliza si ya hay una activa)
        const invite = await StudentInvite.createForCrmLead({
            _id: crmLead._id,
            email: leadEmail,
            name: leadName
        }, adminNote);

        // Construir URL de invitación
        const baseUrl = process.env.APP_URL || process.env.FRONTEND_URL || 'https://pianolink.net';
        const inviteUrl = `${baseUrl}/student-invite/${invite.token}`;

        // Construir email: usar cuerpo personalizado o default
        const emailSubject = customSubject || 'Te invito a una clase de piano gratis';
        const emailBody = customBody || _getDefaultEmailBody(invite.recipientName);
        const html = _buildInviteEmailHtml(invite.recipientName, inviteUrl, emailBody);

        // Enviar email
        let emailResult = { success: false, simulated: true };
        try {
            const { getInstance } = require('../crm/services/CrmResendService');
            const resendService = getInstance();

            if (resendService && resendService.isConfigured()) {
                emailResult = await resendService.sendEmail(
                    invite.recipientEmail,
                    emailSubject,
                    html,
                    {
                        nombre: invite.recipientName,
                        from: 'Miguel Antonio Sepulveda <hola@pianolink.net>',
                        replyTo: 'hola@pianolink.net'
                    }
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
                leadRef: crmLead._id,
                type: 'email_sent',
                channel: 'email',
                metadata: {
                    emailId: emailResult.id || '',
                    emailSubject: emailSubject,
                    notes: `Invitación gratuita al Kit. Link: ${inviteUrl}`
                }
            });
        } catch (intErr) {
            console.warn('[StudentInvite] ⚠️ Error creando interacción:', intErr.message);
        }

        // Actualizar pipeline del lead
        if (crmLead.pipelineStudent !== 'enrolled') {
            const newPipeline = crmLead.pipelineStudent || 'contacted';
            const newScore = Math.min(100, (crmLead.score || 0) + 10);
            await CrmLead.updateOne({ _id: crmLead._id }, {
                $set: { pipelineStudent: newPipeline },
                $push: { scoreHistory: { date: new Date(), score: newScore, reason: 'Invitación gratuita enviada' } },
                $min: { score: 100 }
            });
            await CrmLead.updateOne({ _id: crmLead._id }, { $set: { score: newScore } });
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

// ==================== EMAIL HELPERS ====================

/**
 * Cuerpo de texto default del email (editable desde el CRM)
 */
function _getDefaultEmailBody(name) {
    return `Hola ${name} 🎹

Soy Miguel Antonio, fundador de PianoLink.

Vi que recibiste mi mensaje y quería escribirte directamente. Te invito a una clase de prueba gratuita de 30 minutos con un profesor real — antes de empezar te ayudamos a configurar todo para que la experiencia sea perfecta.

Sin compromiso. Solo quiero que lo vivas.

¿Tienes piano o teclado en casa? ¿Cuándo tienes un rato esta semana?`;
}

/**
 * Genera el HTML del email de invitación gratuita.
 * Recibe el cuerpo como texto plano y lo convierte a HTML.
 */
function _buildInviteEmailHtml(name, inviteUrl, bodyText) {
    // Convertir texto plano a párrafos HTML — estilo email personal, no marketing
    const bodyHtml = (bodyText || _getDefaultEmailBody(name))
        .split('\n')
        .map(line => {
            const trimmed = line.trim();
            if (!trimmed) return '<br>';
            return `<p style="color:#333;font-size:15px;line-height:1.7;margin:0 0 4px;font-family:Georgia,'Times New Roman',serif;">${trimmed}</p>`;
        })
        .join('\n');

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#ffffff;font-family:Georgia,'Times New Roman',serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;padding:20px;">
        <tr>
            <td style="max-width:560px;padding:20px 0;">
                ${bodyHtml}
                <br>
                <a href="${inviteUrl}" style="display:inline-block;background:#ff764d;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:6px;font-size:16px;font-weight:bold;font-family:'Segoe UI',Arial,sans-serif;">
                    🎹 Crear mi cuenta gratis
                </a>
                <p style="color:#999;font-size:12px;margin:24px 0 0;font-family:'Segoe UI',Arial,sans-serif;">
                    Este enlace expira en 7 días.
                </p>
                <br>
                <p style="color:#333;font-size:15px;line-height:1.7;margin:0;font-family:Georgia,'Times New Roman',serif;">Un abrazo,</p>
                <p style="color:#333;font-size:15px;line-height:1.7;margin:0;font-family:Georgia,'Times New Roman',serif;"><strong>Miguel Antonio Sepulveda</strong></p>
                <p style="color:#999;font-size:13px;margin:2px 0 0;font-family:'Segoe UI',Arial,sans-serif;">Fundador, PianoLink</p>
            </td>
        </tr>
    </table>
</body>
</html>`;
}

module.exports = router;
