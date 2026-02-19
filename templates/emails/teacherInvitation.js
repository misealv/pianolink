/**
 * templates/emails/teacherInvitation.js
 * Email de invitación para que un profesor candidato se registre en PianoLink.
 * Se envía después de la entrevista/demo cuando el admin lo aprueba.
 */
module.exports = function generateTeacherInvitationEmail(data) {
    const {
        teacherName = 'Profesor',
        inviteUrl,
        expiresInDays = 30,
        personalMessage = ''
    } = data;

    const firstName = teacherName.split(' ')[0];

    return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Bienvenido a PianoLink</title>
</head>
<body style="margin:0; padding:0; background-color:#f8f9fa; font-family: 'Helvetica Neue', Arial, sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f8f9fa;">
        <tr>
            <td align="center" style="padding: 40px 20px;">
                <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px; width:100%;">
                    
                    <!-- Header -->
                    <tr>
                        <td style="background: linear-gradient(135deg, #1a1a2e 0%, #0f3460 100%); border-radius: 16px 16px 0 0; padding: 40px 40px 30px; text-align: center;">
                            <div style="font-size: 32px; margin-bottom: 8px;">🎹</div>
                            <h1 style="color: #ffffff; font-size: 24px; font-weight: 700; margin: 0 0 8px;">
                                PianoLink
                            </h1>
                            <p style="color: #e0a858; font-size: 14px; letter-spacing: 2px; text-transform: uppercase; margin: 0;">
                                Invitación Exclusiva
                            </p>
                        </td>
                    </tr>

                    <!-- Body -->
                    <tr>
                        <td style="background-color: #ffffff; padding: 40px;">
                            
                            <h2 style="color: #1a1a2e; font-size: 22px; font-weight: 600; margin: 0 0 20px;">
                                ¡Hola ${firstName}! 👋
                            </h2>

                            <div style="width: 60px; height: 3px; background: linear-gradient(90deg, #00B8CC, #7700CC); margin-bottom: 24px; border-radius: 2px;"></div>

                            <p style="color: #444; font-size: 16px; line-height: 1.7; margin: 0 0 20px;">
                                Después de revisar tu perfil, te invitamos a unirte a <strong>PianoLink</strong> como profesor en nuestra plataforma de educación musical con tecnología MIDI en tiempo real.
                            </p>

                            ${personalMessage ? `
                            <div style="background: #f0f7ff; border-left: 4px solid #00B8CC; padding: 16px 20px; border-radius: 0 8px 8px 0; margin: 0 0 24px;">
                                <p style="color: #1a1a2e; font-size: 14px; line-height: 1.6; margin: 0; font-style: italic;">
                                    "${personalMessage}"
                                </p>
                                <p style="color: #888; font-size: 12px; margin: 8px 0 0; text-align: right;">— Equipo PianoLink</p>
                            </div>
                            ` : ''}

                            <!-- Beneficios -->
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin: 24px 0;">
                                <tr>
                                    <td style="padding: 12px 0;">
                                        <table role="presentation" cellspacing="0" cellpadding="0">
                                            <tr>
                                                <td style="width: 36px; vertical-align: top;">
                                                    <div style="width: 28px; height: 28px; background: #e6f9fc; border-radius: 50%; text-align: center; line-height: 28px; font-size: 14px;">🎵</div>
                                                </td>
                                                <td style="padding-left: 12px;">
                                                    <p style="color: #1a1a2e; font-size: 14px; font-weight: 600; margin: 0;">Sala Virtual con MIDI en Tiempo Real</p>
                                                    <p style="color: #666; font-size: 13px; margin: 4px 0 0;">Tus alumnos ven cada nota que tocas, en vivo.</p>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding: 12px 0;">
                                        <table role="presentation" cellspacing="0" cellpadding="0">
                                            <tr>
                                                <td style="width: 36px; vertical-align: top;">
                                                    <div style="width: 28px; height: 28px; background: #f3e6ff; border-radius: 50%; text-align: center; line-height: 28px; font-size: 14px;">💰</div>
                                                </td>
                                                <td style="padding-left: 12px;">
                                                    <p style="color: #1a1a2e; font-size: 14px; font-weight: 600; margin: 0;">Tú fijas tu tarifa</p>
                                                    <p style="color: #666; font-size: 13px; margin: 4px 0 0;">Cobra por hora lo que consideres justo. Nosotros sumamos una comisión de marketplace.</p>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding: 12px 0;">
                                        <table role="presentation" cellspacing="0" cellpadding="0">
                                            <tr>
                                                <td style="width: 36px; vertical-align: top;">
                                                    <div style="width: 28px; height: 28px; background: #e6f9fc; border-radius: 50%; text-align: center; line-height: 28px; font-size: 14px;">📅</div>
                                                </td>
                                                <td style="padding-left: 12px;">
                                                    <p style="color: #1a1a2e; font-size: 14px; font-weight: 600; margin: 0;">Agenda integrada</p>
                                                    <p style="color: #666; font-size: 13px; margin: 4px 0 0;">Calendario, pagos y gestión de alumnos en un solo lugar.</p>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>

                            <!-- CTA -->
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin: 32px 0;">
                                <tr>
                                    <td align="center">
                                        <a href="${inviteUrl}" 
                                           style="display: inline-block; background: linear-gradient(135deg, #00B8CC 0%, #7700CC 100%); color: #ffffff; font-size: 16px; font-weight: 700; text-decoration: none; padding: 16px 48px; border-radius: 12px; box-shadow: 0 4px 16px rgba(0, 184, 204, 0.3);">
                                            Crear mi cuenta de Profesor →
                                        </a>
                                    </td>
                                </tr>
                            </table>

                            <p style="color: #999; font-size: 13px; text-align: center; margin: 0;">
                                Este enlace es personal y expira en ${expiresInDays} días.
                            </p>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="background-color: #f8f9fa; border-radius: 0 0 16px 16px; padding: 24px 40px; text-align: center; border-top: 1px solid #eee;">
                            <p style="color: #999; font-size: 12px; margin: 0;">
                                © ${new Date().getFullYear()} PianoLink — Educación musical con tecnología.
                            </p>
                            <p style="color: #bbb; font-size: 11px; margin: 8px 0 0;">
                                Si no solicitaste esta invitación, puedes ignorar este correo.
                            </p>
                        </td>
                    </tr>

                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;
};
