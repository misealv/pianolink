/**
 * routes/founderInviteRoutes.js
 * Rutas para el sistema de invitación de profesores fundadores.
 * 
 * Endpoints públicos:
 *   GET  /api/founder-invite/validate/:token  — Valida token y retorna datos
 *   POST /api/founder-invite/register/:token  — Registra profesor con invitación
 * 
 * Endpoints protegidos (admin):
 *   POST /api/founder-invite/send             — Envía invitación a un lead
 *   POST /api/founder-invite/send-batch       — Envío masivo a leads
 *   GET  /api/founder-invite/list             — Lista todas las invitaciones
 */
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const FounderInvite = require('../models/FounderInvite');
const User = require('../models/User');
const Lead = require('../models/Lead');
const emailService = require('../services/EmailService');
const eventService = require('../services/EventService');
const { protect, adminOnly } = require('../middleware/authMiddleware');

const BASE_URL = process.env.APP_URL || process.env.FRONTEND_URL || 'https://pianolink.net';

// =====================================================================
// PÚBLICOS — Para el profesor que recibe la invitación
// =====================================================================

/**
 * GET /validate/:token — Valida un token de invitación
 * Retorna nombre y email del invitado si el token es válido.
 */
router.get('/validate/:token', async (req, res) => {
    try {
        const invite = await FounderInvite.findValidByToken(req.params.token);
        if (!invite) {
            return res.status(404).json({
                valid: false,
                message: 'Invitación no encontrada, expirada o ya utilizada.'
            });
        }

        // Marcar como abierta (tracking)
        await invite.markAsOpened();

        res.json({
            valid: true,
            recipientName: invite.recipientName,
            recipientEmail: invite.recipientEmail,
            expiresAt: invite.expiresAt
        });
    } catch (error) {
        console.error('[FounderInvite] Error validando token:', error);
        res.status(500).json({ message: 'Error interno' });
    }
});

/**
 * POST /register/:token — Registra un profesor usando la invitación
 * Body: { name, email, password, slug, country, whatsapp }
 */
router.post('/register/:token', async (req, res) => {
    try {
        const invite = await FounderInvite.findValidByToken(req.params.token);
        if (!invite) {
            return res.status(400).json({
                message: 'Invitación no válida, expirada o ya utilizada.'
            });
        }

        const { name, email, password, slug, country, whatsapp } = req.body;

        // Validaciones básicas
        if (!name || !email || !password) {
            return res.status(400).json({ message: 'Nombre, email y contraseña son obligatorios.' });
        }

        if (password.length < 6) {
            return res.status(400).json({ message: 'La contraseña debe tener al menos 6 caracteres.' });
        }

        // Verificar email único
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: 'Este email ya está registrado. Intenta iniciar sesión.' });
        }

        // Verificar slug único si se proporcionó
        if (slug) {
            const slugExists = await User.findOne({ slug });
            if (slugExists) {
                return res.status(400).json({ message: 'Esa URL de perfil ya está en uso.' });
            }
        }

        // Crear el profesor con beneficios de fundador
        const user = await User.create({
            name,
            email,
            password,
            slug: slug || name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
            country: country || '',
            whatsapp: whatsapp || '',
            role: 'teacher',
            isFounder: true,
            isFoundingMember: true,
            teacherData: {
                subscriptionStatus: 'active',
                plan: 'founder',
                planActivatedAt: new Date(),
                subscriptionExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 año inicial
                hourlyRate: 2500, // $25 USD default
                trialPrice: 1500, // $15 USD clase de prueba
                permissions: {
                    canInvitePrivateStudents: true,
                    hasPriorityQueue: true,
                    maxActiveStudents: -1 // Ilimitado
                }
            },
            branding: {
                country: country || '🏳️ Internacional',
                colors: { base: '#ff764d', bg: '#1a1a1a', panel: '#262626' }
            }
        });

        // Marcar invitación como usada
        await invite.markAsRegistered(user._id);

        // Actualizar el lead original si existe
        if (invite.leadRef) {
            try {
                const lead = await Lead.findById(invite.leadRef);
                if (lead) {
                    lead.status = 'converted';
                    lead.convertedToUserId = user._id;
                    lead.convertedAt = new Date();
                    await lead.save();
                }
            } catch (e) {
                console.warn('[FounderInvite] No se pudo actualizar lead:', e.message);
            }
        }

        // Emitir evento para el CRM Bridge
        eventService.emitSafe('teacher.created', {
            teacher: {
                _id: user._id,
                name: user.name,
                email: user.email,
                slug: user.slug,
                isFoundingMember: true
            }
        });

        // Enviar email de bienvenida
        try {
            const generateWelcome = require('../templates/emails/welcomeTeacher');
            const html = generateWelcome({
                teacherName: user.name,
                teacherEmail: user.email,
                dashboardUrl: `${BASE_URL}/dashboard.html`
            });
            await emailService.sendSafe({
                to: user.email,
                subject: '🎹 ¡Bienvenido a PianoLink, Profesor Fundador!',
                html
            });
        } catch (e) {
            console.warn('[FounderInvite] Error enviando email de bienvenida:', e.message);
        }

        console.log(`[FounderInvite] ✅ Profesor fundador registrado: ${user.email}`);

        res.status(201).json({
            success: true,
            message: '¡Cuenta creada exitosamente! Ya eres Profesor Fundador.',
            user: {
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                slug: user.slug,
                isFounder: true,
                plan: 'founder'
            }
        });

    } catch (error) {
        console.error('[FounderInvite] Error en registro:', error);
        res.status(500).json({ message: error.message || 'Error interno al crear la cuenta' });
    }
});

// =====================================================================
// ADMIN — Generar y enviar invitaciones
// =====================================================================

/**
 * POST /send — Envía invitación a un lead específico
 * Body: { leadId }
 */
router.post('/send', protect, adminOnly, async (req, res) => {
    try {
        const { leadId } = req.body;
        if (!leadId) return res.status(400).json({ message: 'leadId es obligatorio' });

        const lead = await Lead.findById(leadId);
        if (!lead) return res.status(404).json({ message: 'Lead no encontrado' });

        // Crear o recuperar invitación
        const invite = await FounderInvite.createForLead(lead);
        const inviteUrl = `${BASE_URL}/founder-invite/${invite.token}`;

        // Enviar email
        const generateEmail = require('../templates/emails/founderInvitation');
        const html = generateEmail({
            teacherName: lead.name,
            inviteUrl,
            recipientEmail: lead.email
        });

        const result = await emailService.send({
            to: lead.email,
            subject: `🎹 ${lead.name.split(' ')[0]}, te invitamos a ser Profesor Fundador de PianoLink`,
            html
        });

        // Marcar como enviada
        await invite.markAsSent(result?.id);

        // Actualizar lead
        if (lead.status === 'new') {
            lead.status = 'contacted';
            lead.contactedAt = new Date();
        }
        await lead.addFollowUp?.('email_sent', 'Invitación de Profesor Fundador enviada', 'pending');

        console.log(`[FounderInvite] 📧 Invitación enviada a: ${lead.email}`);

        res.json({
            success: true,
            message: `Invitación enviada a ${lead.email}`,
            inviteUrl,
            inviteId: invite._id
        });
    } catch (error) {
        console.error('[FounderInvite] Error enviando invitación:', error);
        res.status(500).json({ message: error.message });
    }
});

/**
 * POST /send-batch — Envía invitaciones a múltiples leads
 * Body: { leadIds: [...] } o { filter: 'pending' } para todos los no contactados
 */
router.post('/send-batch', protect, adminOnly, async (req, res) => {
    try {
        let leads;

        if (req.body.leadIds) {
            leads = await Lead.find({ _id: { $in: req.body.leadIds } });
        } else if (req.body.filter === 'pending') {
            // Todos los teacher leads que no están convertidos
            leads = await Lead.find({
                type: 'teacher',
                status: { $nin: ['converted', 'rejected'] }
            });
        } else {
            return res.status(400).json({ message: 'Envía leadIds o filter: "pending"' });
        }

        const results = { sent: [], failed: [], skipped: [] };

        for (const lead of leads) {
            try {
                // Verificar si ya se registró con este email
                const existingUser = await User.findOne({ email: lead.email });
                if (existingUser) {
                    results.skipped.push({ email: lead.email, reason: 'Ya tiene cuenta' });
                    continue;
                }

                const invite = await FounderInvite.createForLead(lead);
                const inviteUrl = `${BASE_URL}/founder-invite/${invite.token}`;

                const generateEmail = require('../templates/emails/founderInvitation');
                const html = generateEmail({
                    teacherName: lead.name,
                    inviteUrl,
                    recipientEmail: lead.email
                });

                const emailResult = await emailService.send({
                    to: lead.email,
                    subject: `🎹 ${lead.name.split(' ')[0]}, te invitamos a ser Profesor Fundador de PianoLink`,
                    html
                });

                await invite.markAsSent(emailResult?.id);

                if (lead.status === 'new') {
                    lead.status = 'contacted';
                    lead.contactedAt = new Date();
                }
                await lead.addFollowUp?.('email_sent', 'Invitación Fundador (batch)', 'pending');

                results.sent.push({ email: lead.email, name: lead.name });

                // Rate limiting: 500ms entre envíos
                await new Promise(r => setTimeout(r, 500));

            } catch (err) {
                results.failed.push({ email: lead.email, error: err.message });
            }
        }

        console.log(`[FounderInvite] 📧 Batch: ${results.sent.length} enviados, ${results.failed.length} fallidos, ${results.skipped.length} omitidos`);

        res.json({
            success: true,
            total: leads.length,
            ...results
        });
    } catch (error) {
        console.error('[FounderInvite] Error en batch:', error);
        res.status(500).json({ message: error.message });
    }
});

/**
 * GET /list — Lista todas las invitaciones
 */
router.get('/list', protect, adminOnly, async (req, res) => {
    try {
        const invites = await FounderInvite.find()
            .populate('leadRef', 'name email status')
            .populate('registeredUserId', 'name email')
            .sort({ createdAt: -1 });

        res.json({ success: true, invites });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

/**
 * GET /preview-email — Preview del email de invitación (HTML)
 * Query: ?name=Nombre (opcional)
 */
router.get('/preview-email', protect, adminOnly, async (req, res) => {
    try {
        const generateEmail = require('../templates/emails/founderInvitation');
        const html = generateEmail({
            teacherName: req.query.name || 'Profesor Demo',
            inviteUrl: `${BASE_URL}/founder-invite/preview-token-demo`,
            recipientEmail: req.query.email || 'demo@example.com'
        });
        res.setHeader('Content-Type', 'text/html');
        res.send(html);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

/**
 * GET /preview-landing — Redirige a la landing de invitación (preview)
 */
router.get('/preview-landing', protect, adminOnly, async (req, res) => {
    // Crear una invitación temporal de preview
    const token = FounderInvite.generateToken();
    const previewInvite = await FounderInvite.create({
        recipientName: req.query.name || 'Profesor Demo',
        recipientEmail: req.query.email || 'demo@preview.com',
        token,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hora
        campaignTag: 'admin_preview'
    });
    res.json({
        success: true,
        previewUrl: `${BASE_URL}/founder-invite/${token}`,
        note: 'Esta invitación de preview expira en 1 hora'
    });
});

/**
 * GET /eligible-leads — Lista leads elegibles para invitación
 */
router.get('/eligible-leads', protect, adminOnly, async (req, res) => {
    try {
        const leads = await Lead.find({
            type: 'teacher',
            status: { $nin: ['converted', 'rejected'] }
        }).sort({ createdAt: 1 }).lean();

        // Para cada lead, verificar si ya tiene cuenta o invitación
        const enriched = await Promise.all(leads.map(async (lead) => {
            const hasUser = await User.exists({ email: lead.email });
            const invite = await FounderInvite.findOne({
                recipientEmail: lead.email,
                expiresAt: { $gt: new Date() }
            }).lean();

            return {
                _id: lead._id,
                name: lead.name,
                email: lead.email,
                whatsapp: lead.whatsapp,
                status: lead.status,
                country: lead.country,
                source: lead.source,
                createdAt: lead.createdAt,
                hasAccount: !!hasUser,
                invite: invite ? {
                    status: invite.status,
                    sentAt: invite.sentAt,
                    openedAt: invite.openedAt,
                    token: invite.token
                } : null
            };
        }));

        res.json({ success: true, leads: enriched });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
