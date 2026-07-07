/**
 * _send_welcome_jose.js
 * Envía email de bienvenida a José Wilhelmy con magic link para crear contraseña.
 * Copia (bcc) a miseal@gmail.com.
 *
 * Uso: node _send_welcome_jose.js [--dry-run]
 */

require('dotenv').config();
const mongoose = require('mongoose');
const crypto = require('crypto');
const { Resend } = require('resend');

const DRY_RUN = process.argv.includes('--dry-run');
const JOSE_ID = '69f458a4ed8946b42b2f2abe';
const BCC_EMAIL = 'miseal@gmail.com';

// Incluye el modelo directamente para no depender del resto del stack
const User = require('./models/User');

// ==================== PLANTILLA ====================

function generateWelcomeEmail({ name, magicLinkUrl }) {
    const firstName = name.split(' ')[0];

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bienvenido a PianoLink</title>
</head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0" style="padding:48px 20px;">
    <tr><td align="center">

      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

        <!-- HEADER -->
        <tr>
          <td style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 60%,#0f3460 100%);padding:40px 40px 36px;text-align:center;">
            <p style="margin:0 0 8px 0;font-size:30px;">🎹</p>
            <h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:700;letter-spacing:-0.5px;">PianoLink</h1>
            <p style="margin:8px 0 0 0;color:#94a3b8;font-size:13px;letter-spacing:1px;text-transform:uppercase;">Plataforma de Clases de Piano</p>
          </td>
        </tr>

        <!-- CUERPO -->
        <tr>
          <td style="padding:44px 40px 36px;">

            <h2 style="margin:0 0 20px 0;color:#1e293b;font-size:22px;font-weight:600;">
              Hola, ${firstName} 👋
            </h2>

            <p style="margin:0 0 16px 0;color:#475569;font-size:16px;line-height:1.7;">
              Nos alegra mucho tenerte en <strong style="color:#1e293b;">PianoLink</strong>. Tu acceso al nuevo sistema de clases ya está listo.
            </p>

            <p style="margin:0 0 28px 0;color:#475569;font-size:16px;line-height:1.7;">
              Para comenzar, haz clic en el botón de abajo — te llevará directamente a crear tu contraseña personal y, desde ahí, podrás ver los horarios disponibles y agendar tu primera clase con tu profesor.
            </p>

            <!-- CTA -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 32px 0;">
              <tr>
                <td align="center">
                  <a href="${magicLinkUrl}"
                     style="display:inline-block;background:linear-gradient(135deg,#ff764d,#ff5c2b);color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;padding:18px 44px;border-radius:10px;letter-spacing:0.2px;box-shadow:0 4px 14px rgba(255,118,77,0.4);">
                    🔐 &nbsp;Crear mi contraseña y acceder
                  </a>
                </td>
              </tr>
            </table>

            <!-- INFO BOX -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 32px 0;">
              <tr>
                <td style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:22px 24px;">
                  <p style="margin:0 0 10px 0;color:#0f172a;font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;">📋 Cómo funciona</p>
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="padding:6px 0;color:#475569;font-size:14px;line-height:1.6;">
                        <strong style="color:#1e293b;">1.</strong> &nbsp;Haz clic en el botón de arriba para crear tu contraseña.
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:6px 0;color:#475569;font-size:14px;line-height:1.6;">
                        <strong style="color:#1e293b;">2.</strong> &nbsp;Inicia sesión en <a href="https://pianolink.net/cliente" style="color:#ff764d;text-decoration:none;font-weight:600;">pianolink.net/cliente</a> con tu email y contraseña nueva.
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:6px 0;color:#475569;font-size:14px;line-height:1.6;">
                        <strong style="color:#1e293b;">3.</strong> &nbsp;Desde tu panel podrás ver los horarios disponibles y agendar clases con un solo clic.
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <!-- HORARIOS BOX -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 32px 0;">
              <tr>
                <td style="background:#fffbeb;border:1px solid #fde68a;border-left:4px solid #f59e0b;border-radius:0 10px 10px 0;padding:18px 20px;">
                  <p style="margin:0 0 6px 0;color:#92400e;font-size:14px;font-weight:700;">⏰ ¿Necesitas un horario diferente?</p>
                  <p style="margin:0;color:#78350f;font-size:14px;line-height:1.6;">
                    Si los horarios disponibles no se ajustan a tu rutina, no dudes en escribirle directamente a tu profesor 
                    <strong>Miguel Antonio</strong> para que agregue nuevas alternativas. Está disponible para coordinar el mejor horario contigo.
                  </p>
                </td>
              </tr>
            </table>

            <!-- AVISO EXPIRA -->
            <p style="margin:0;color:#94a3b8;font-size:13px;line-height:1.6;text-align:center;">
              🔒 &nbsp;Este enlace es personal e intransferible. Expira en <strong>24 horas</strong>.<br>
              Si no lo solicitaste, puedes ignorar este correo de forma segura.
            </p>

          </td>
        </tr>

        <!-- SEPARADOR -->
        <tr>
          <td style="padding:0 40px;"><hr style="border:none;border-top:1px solid #e2e8f0;"></td>
        </tr>

        <!-- FOOTER -->
        <tr>
          <td style="padding:24px 40px;text-align:center;">
            <p style="margin:0 0 4px 0;color:#64748b;font-size:13px;">
              © 2026 PianoLink · <a href="https://pianolink.net" style="color:#ff764d;text-decoration:none;">pianolink.net</a>
            </p>
            <p style="margin:0;color:#cbd5e1;font-size:12px;">
              Si el botón no funciona, copia este enlace en tu navegador:<br>
              <a href="${magicLinkUrl}" style="color:#ff764d;word-break:break-all;text-decoration:none;font-size:11px;">${magicLinkUrl}</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>

</body>
</html>`;
}

// ==================== MAIN ====================

async function main() {
    console.log('='.repeat(60));
    console.log('📧 BIENVENIDA A JOSÉ WILHELMY — PianoLink');
    console.log(`Modo: ${DRY_RUN ? '🔍 DRY RUN' : '🚀 PRODUCCIÓN'}`);
    console.log('='.repeat(60));

    await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
    console.log('✅ MongoDB conectado');

    // 1. Cargar usuario
    const user = await User.findById(JOSE_ID).select('name email magicLinkToken magicLinkExpires');
    if (!user) throw new Error(`Usuario ${JOSE_ID} no encontrado`);
    console.log(`👤 Usuario: ${user.name} <${user.email}>`);

    // 2. Generar token (válido 72h, suficiente margen)
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 72 * 60 * 60 * 1000);

    if (!DRY_RUN) {
        user.magicLinkToken = token;
        user.magicLinkExpires = expires;
        await user.save();
        console.log(`🔑 Token generado, expira: ${expires.toISOString()}`);
    } else {
        console.log('🔍 [DRY RUN] Token no guardado en DB');
    }

    const baseUrl = process.env.FRONTEND_URL || 'https://pianolink.net';
    const magicLinkUrl = `${baseUrl}/acceso/${token}`;
    console.log(`🔗 Magic link: ${magicLinkUrl}`);

    // 3. Generar HTML
    const html = generateWelcomeEmail({ name: user.name, magicLinkUrl });

    // 4. Enviar con Resend directamente (para poder añadir bcc)
    if (DRY_RUN) {
        console.log('\n✅ [DRY RUN] Email no enviado. HTML generado correctamente.');
        await mongoose.disconnect();
        return;
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error('RESEND_API_KEY no configurada en .env');

    const resend = new Resend(apiKey);
    const from = `${process.env.EMAIL_FROM_NAME || 'PianoLink'} <${process.env.EMAIL_FROM || 'hola@pianolink.net'}>`;

    const result = await resend.emails.send({
        from,
        to: [user.email],
        bcc: [BCC_EMAIL],
        subject: '🎹 Tu acceso a PianoLink está listo — crea tu contraseña',
        html,
        headers: {
            'List-Unsubscribe': '<mailto:hola@pianolink.net?subject=unsubscribe>',
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
        }
    });

    if (result.error) {
        throw new Error(`Resend error: ${JSON.stringify(result.error)}`);
    }

    console.log(`\n✅ Email enviado! ID: ${result.data?.id}`);
    console.log(`   Para: ${user.email}`);
    console.log(`   BCC:  ${BCC_EMAIL}`);

    await mongoose.disconnect();
    console.log('✅ Desconectado');
}

main().catch(err => {
    console.error('❌ Error:', err.message);
    mongoose.disconnect();
    process.exit(1);
});
