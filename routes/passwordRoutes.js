/**
 * routes/passwordRoutes.js
 * Rutas para Magic Link, Recuperación y Cambio de Contraseña
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const EmailService = require('../services/EmailService');

// Generar token seguro
const generateToken = () => crypto.randomBytes(32).toString('hex');

// Generar JWT
const generateJWT = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '30d' });
};

/**
 * POST /api/password/send-magic-link
 * Envía un magic link al email del usuario
 */
router.post('/send-magic-link', async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({ message: 'Email requerido' });
        }

        const user = await User.findOne({ email: email.toLowerCase() });
        
        if (!user) {
            // Por seguridad, no revelamos si el email existe o no
            return res.json({ message: 'Si el email está registrado, recibirás un enlace de acceso.' });
        }

        // Generar token y expiración (24 horas)
        const token = generateToken();
        user.magicLinkToken = token;
        user.magicLinkExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
        await user.save();

        // Generar URL
        const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        const magicLinkUrl = `${baseUrl}/acceso/${token}`;

        // Enviar email
        const emailHtml = generateMagicLinkEmail(user.name, magicLinkUrl);
        await EmailService.sendSafe({
            to: user.email,
            subject: '🔐 Tu enlace de acceso a PianoLink',
            html: emailHtml
        });

        console.log(`[MagicLink] 📧 Enviado a: ${user.email}`);
        
        res.json({ message: 'Si el email está registrado, recibirás un enlace de acceso.' });
    } catch (error) {
        console.error('[MagicLink] Error:', error);
        res.status(500).json({ message: 'Error enviando enlace' });
    }
});

/**
 * GET /api/password/verify-magic-link/:token
 * Verifica el magic link y devuelve datos para establecer contraseña
 */
router.get('/verify-magic-link/:token', async (req, res) => {
    try {
        const { token } = req.params;

        const user = await User.findOne({
            magicLinkToken: token,
            magicLinkExpires: { $gt: new Date() }
        });

        if (!user) {
            return res.status(400).json({ 
                valid: false, 
                message: 'Enlace inválido o expirado' 
            });
        }

        res.json({
            valid: true,
            email: user.email,
            name: user.name,
            mustSetPassword: true
        });
    } catch (error) {
        console.error('[MagicLink] Error verificando:', error);
        res.status(500).json({ message: 'Error verificando enlace' });
    }
});

/**
 * POST /api/password/set-password
 * Establece la contraseña usando el magic link token
 */
router.post('/set-password', async (req, res) => {
    try {
        const { token, password, confirmPassword } = req.body;

        if (!token || !password) {
            return res.status(400).json({ message: 'Token y contraseña requeridos' });
        }

        if (password !== confirmPassword) {
            return res.status(400).json({ message: 'Las contraseñas no coinciden' });
        }

        if (password.length < 6) {
            return res.status(400).json({ message: 'La contraseña debe tener al menos 6 caracteres' });
        }

        const user = await User.findOne({
            magicLinkToken: token,
            magicLinkExpires: { $gt: new Date() }
        });

        if (!user) {
            return res.status(400).json({ message: 'Enlace inválido o expirado' });
        }

        // Establecer nueva contraseña
        user.password = password; // Se hashea automáticamente en el pre-save
        user.magicLinkToken = undefined;
        user.magicLinkExpires = undefined;
        user.mustChangePassword = false;
        user.lastPasswordChange = new Date();
        await user.save();

        // Generar token JWT para login automático
        const jwtToken = generateJWT(user._id);

        console.log(`[Password] ✅ Contraseña establecida para: ${user.email}`);

        res.json({
            success: true,
            message: 'Contraseña establecida correctamente',
            token: jwtToken,
            user: {
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });
    } catch (error) {
        console.error('[Password] Error estableciendo:', error);
        res.status(500).json({ message: 'Error estableciendo contraseña' });
    }
});

/**
 * POST /api/password/forgot
 * Envía email de recuperación de contraseña
 */
router.post('/forgot', async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ message: 'Email requerido' });
        }

        const user = await User.findOne({ email: email.toLowerCase() });

        if (!user) {
            // Por seguridad, misma respuesta
            return res.json({ message: 'Si el email está registrado, recibirás instrucciones para recuperar tu contraseña.' });
        }

        // Generar token de reset (válido por 1 hora)
        const token = generateToken();
        user.resetPasswordToken = token;
        user.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hora
        await user.save();

        // Generar URL
        const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        const resetUrl = `${baseUrl}/recuperar/${token}`;

        // Enviar email
        const emailHtml = generateResetPasswordEmail(user.name, resetUrl);
        await EmailService.sendSafe({
            to: user.email,
            subject: '🔑 Recupera tu contraseña - PianoLink',
            html: emailHtml
        });

        console.log(`[Password] 📧 Email de recuperación enviado a: ${user.email}`);

        res.json({ message: 'Si el email está registrado, recibirás instrucciones para recuperar tu contraseña.' });
    } catch (error) {
        console.error('[Password] Error en forgot:', error);
        res.status(500).json({ message: 'Error procesando solicitud' });
    }
});

/**
 * GET /api/password/verify-reset/:token
 * Verifica si el token de reset es válido
 */
router.get('/verify-reset/:token', async (req, res) => {
    try {
        const { token } = req.params;

        const user = await User.findOne({
            resetPasswordToken: token,
            resetPasswordExpires: { $gt: new Date() }
        });

        if (!user) {
            return res.status(400).json({
                valid: false,
                message: 'Enlace inválido o expirado'
            });
        }

        res.json({
            valid: true,
            email: user.email
        });
    } catch (error) {
        console.error('[Password] Error verificando reset:', error);
        res.status(500).json({ message: 'Error verificando enlace' });
    }
});

/**
 * POST /api/password/reset
 * Restablece la contraseña con el token de reset
 */
router.post('/reset', async (req, res) => {
    try {
        const { token, password, confirmPassword } = req.body;

        if (!token || !password) {
            return res.status(400).json({ message: 'Token y contraseña requeridos' });
        }

        if (password !== confirmPassword) {
            return res.status(400).json({ message: 'Las contraseñas no coinciden' });
        }

        if (password.length < 6) {
            return res.status(400).json({ message: 'La contraseña debe tener al menos 6 caracteres' });
        }

        const user = await User.findOne({
            resetPasswordToken: token,
            resetPasswordExpires: { $gt: new Date() }
        });

        if (!user) {
            return res.status(400).json({ message: 'Enlace inválido o expirado' });
        }

        // Actualizar contraseña
        user.password = password;
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        user.mustChangePassword = false;
        user.lastPasswordChange = new Date();
        await user.save();

        console.log(`[Password] ✅ Contraseña restablecida para: ${user.email}`);

        res.json({
            success: true,
            message: 'Contraseña actualizada correctamente. Ya puedes iniciar sesión.'
        });
    } catch (error) {
        console.error('[Password] Error en reset:', error);
        res.status(500).json({ message: 'Error restableciendo contraseña' });
    }
});

// ==================== TEMPLATES DE EMAIL ====================

function generateMagicLinkEmail(name, magicLinkUrl) {
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f3f4f6;">
    <table width="100%" cellpadding="0" cellspacing="0" style="padding: 40px 20px;">
        <tr>
            <td align="center">
                <table width="500" cellpadding="0" cellspacing="0" style="background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                    
                    <!-- Header -->
                    <tr>
                        <td style="background: linear-gradient(135deg, #ff764d, #ff9f7e); padding: 30px; text-align: center;">
                            <h1 style="color: #fff; margin: 0; font-size: 24px;">🎹 PianoLink</h1>
                        </td>
                    </tr>
                    
                    <!-- Content -->
                    <tr>
                        <td style="padding: 40px;">
                            <h2 style="color: #1f2937; margin: 0 0 20px 0;">¡Hola ${name}! 👋</h2>
                            
                            <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
                                Has solicitado acceso a tu cuenta de PianoLink. Haz clic en el botón para establecer tu contraseña y acceder:
                            </p>
                            
                            <div style="text-align: center; margin: 30px 0;">
                                <a href="${magicLinkUrl}" 
                                   style="display: inline-block; background: #ff764d; color: white; padding: 16px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
                                    🔐 Acceder a mi cuenta
                                </a>
                            </div>
                            
                            <p style="color: #9ca3af; font-size: 14px; margin-top: 30px;">
                                Este enlace expira en <strong>24 horas</strong>.<br>
                                Si no solicitaste esto, puedes ignorar este email.
                            </p>
                            
                            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
                            
                            <p style="color: #9ca3af; font-size: 12px; text-align: center;">
                                Si el botón no funciona, copia este enlace:<br>
                                <a href="${magicLinkUrl}" style="color: #ff764d; word-break: break-all;">${magicLinkUrl}</a>
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
    `.trim();
}

function generateResetPasswordEmail(name, resetUrl) {
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f3f4f6;">
    <table width="100%" cellpadding="0" cellspacing="0" style="padding: 40px 20px;">
        <tr>
            <td align="center">
                <table width="500" cellpadding="0" cellspacing="0" style="background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                    
                    <!-- Header -->
                    <tr>
                        <td style="background: #1f2937; padding: 30px; text-align: center;">
                            <h1 style="color: #fff; margin: 0; font-size: 24px;">🔑 Recuperar Contraseña</h1>
                        </td>
                    </tr>
                    
                    <!-- Content -->
                    <tr>
                        <td style="padding: 40px;">
                            <h2 style="color: #1f2937; margin: 0 0 20px 0;">Hola ${name},</h2>
                            
                            <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
                                Recibimos una solicitud para restablecer tu contraseña. Haz clic en el botón para crear una nueva:
                            </p>
                            
                            <div style="text-align: center; margin: 30px 0;">
                                <a href="${resetUrl}" 
                                   style="display: inline-block; background: #3b82f6; color: white; padding: 16px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
                                    🔐 Restablecer contraseña
                                </a>
                            </div>
                            
                            <div style="background: #fef3c7; border-radius: 8px; padding: 15px; margin: 20px 0;">
                                <p style="color: #92400e; margin: 0; font-size: 14px;">
                                    ⚠️ Este enlace expira en <strong>1 hora</strong>.<br>
                                    Si no solicitaste cambiar tu contraseña, ignora este email.
                                </p>
                            </div>
                            
                            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
                            
                            <p style="color: #9ca3af; font-size: 12px; text-align: center;">
                                Si el botón no funciona, copia este enlace:<br>
                                <a href="${resetUrl}" style="color: #3b82f6; word-break: break-all;">${resetUrl}</a>
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
    `.trim();
}

module.exports = router;
