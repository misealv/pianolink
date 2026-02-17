/**
 * templates/emails/founderInvitation.js
 * Email de invitación a profesores para unirse como Fundadores de PianoLink
 * 
 * Explica el modelo de marketplace y la oferta de membresía congelada.
 */

module.exports = function generateFounderInvitationEmail(data) {
    const {
        teacherName = 'Profesor',
        inviteUrl,
        recipientEmail = ''
    } = data;

    const firstName = teacherName.split(' ')[0];
    const currentYear = new Date().getFullYear();

    return `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <title>Invitación Exclusiva — PianoLink Marketplace</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f4; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">

    <!-- Preheader -->
    <div style="display: none; max-height: 0px; overflow: hidden;">
        ${firstName}, te invitamos a ser Profesor Fundador del primer marketplace de clases de piano en tiempo real.
    </div>

    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f4f4f4;">
        <tr>
            <td align="center" style="padding: 40px 20px;">

                <!-- Container -->
                <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">

                    <!-- Header -->
                    <tr>
                        <td align="center" style="padding: 40px 40px 30px 40px; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%); border-radius: 12px 12px 0 0;">
                            <h1 style="margin: 0; color: #ffffff; font-size: 32px; font-weight: 700;">
                                🎹 PianoLink
                            </h1>
                            <p style="margin: 8px 0 0 0; color: #e0a858; font-size: 16px; font-weight: 600;">
                                Invitación Exclusiva — Profesores Fundadores
                            </p>
                        </td>
                    </tr>

                    <!-- Saludo -->
                    <tr>
                        <td style="padding: 40px 40px 10px 40px;">
                            <h2 style="margin: 0 0 20px 0; color: #1a1a1a; font-size: 24px; font-weight: 600;">
                                Hola ${firstName} 👋
                            </h2>

                            <p style="margin: 0 0 16px 0; color: #333; font-size: 16px; line-height: 1.7;">
                                Cuando conversamos, te mostré algo que seguramente te llamó la atención: una sala virtual donde el sonido de tu piano viaja en tiempo real, con baja latencia y calidad profesional.
                            </p>

                            <p style="margin: 0 0 16px 0; color: #333; font-size: 16px; line-height: 1.7;">
                                Bueno, eso fue solo el comienzo. <strong>PianoLink evolucionó</strong> y hoy te escribo para contarte hacia dónde vamos y por qué necesitamos profesores como tú.
                            </p>
                        </td>
                    </tr>

                    <!-- Separador -->
                    <tr>
                        <td style="padding: 0 40px;">
                            <div style="height: 2px; background: linear-gradient(to right, #ff764d, #e0a858, #ff764d);"></div>
                        </td>
                    </tr>

                    <!-- Sección: El Marketplace -->
                    <tr>
                        <td style="padding: 30px 40px 10px 40px;">
                            <h3 style="margin: 0 0 16px 0; color: #0f3460; font-size: 20px;">
                                🌐 PianoLink Marketplace — Tu academia dentro de una plataforma global
                            </h3>

                            <p style="margin: 0 0 16px 0; color: #333; font-size: 15px; line-height: 1.7;">
                                Estamos construyendo el <strong>primer marketplace dedicado a clases de piano en tiempo real</strong>. Piensa en esto:
                            </p>

                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom: 16px;">
                                <tr>
                                    <td style="padding: 12px 16px; background-color: #f8f9fa; border-radius: 8px; border-left: 4px solid #ff764d;">
                                        <p style="margin: 0 0 8px 0; color: #333; font-size: 15px; line-height: 1.6;">
                                            🎯 <strong>Alumnos llegan solos</strong> — La plataforma atrae estudiantes y los conecta contigo según tu especialidad, horario y ubicación.
                                        </p>
                                        <p style="margin: 0 0 8px 0; color: #333; font-size: 15px; line-height: 1.6;">
                                            🎹 <strong>Sala virtual profesional</strong> — Audio de baja latencia, partitura compartida, piano virtual sincronizado.
                                        </p>
                                        <p style="margin: 0 0 8px 0; color: #333; font-size: 15px; line-height: 1.6;">
                                            📅 <strong>Gestión automática</strong> — Calendario, cobros, recordatorios y seguimiento. Tú solo enseñas.
                                        </p>
                                        <p style="margin: 0; color: #333; font-size: 15px; line-height: 1.6;">
                                            💰 <strong>Cobras por clase</strong> — Tú pones tu tarifa. Sin límites de alumnos.
                                        </p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- Sección: Oferta Fundador -->
                    <tr>
                        <td style="padding: 10px 40px 10px 40px;">
                            <h3 style="margin: 0 0 16px 0; color: #0f3460; font-size: 20px;">
                                ⭐ Oferta Profesor Fundador — Solo para los primeros
                            </h3>

                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                                <tr>
                                    <td style="padding: 20px; background: linear-gradient(135deg, #1a1a2e, #16213e); border-radius: 12px;">
                                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                                            <tr>
                                                <td width="50%" style="padding-right: 10px; vertical-align: top;">
                                                    <p style="margin: 0 0 4px 0; color: #e0a858; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">Plan Fundador</p>
                                                    <p style="margin: 0; color: #fff; font-size: 36px; font-weight: 700;">$10<span style="font-size: 16px; opacity: 0.8;">/mes</span></p>
                                                    <p style="margin: 4px 0 0 0; color: #4ade80; font-size: 14px; font-weight: 600;">Precio congelado de por vida</p>
                                                </td>
                                                <td width="50%" style="padding-left: 10px; vertical-align: top;">
                                                    <p style="margin: 0 0 6px 0; color: #ccc; font-size: 13px;">✅ Comisión reducida (15%)</p>
                                                    <p style="margin: 0 0 6px 0; color: #ccc; font-size: 13px;">✅ Alumnos privados sin comisión</p>
                                                    <p style="margin: 0 0 6px 0; color: #ccc; font-size: 13px;">✅ Prioridad en el catálogo</p>
                                                    <p style="margin: 0 0 6px 0; color: #ccc; font-size: 13px;">✅ Soporte directo</p>
                                                    <p style="margin: 0; color: #ccc; font-size: 13px;">✅ Alumnos ilimitados</p>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>

                            <p style="margin: 16px 0 0 0; color: #666; font-size: 14px; line-height: 1.6; text-align: center;">
                                💡 <em>También puedes comenzar gratis y activar la membresía cuando quieras.</em>
                            </p>
                        </td>
                    </tr>

                    <!-- Sección: Cómo funciona -->
                    <tr>
                        <td style="padding: 20px 40px 10px 40px;">
                            <h3 style="margin: 0 0 16px 0; color: #0f3460; font-size: 20px;">
                                🚀 ¿Cómo empiezo?
                            </h3>

                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                                <tr>
                                    <td style="padding: 10px 0;">
                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                                            <tr>
                                                <td style="padding-right: 12px; vertical-align: top;">
                                                    <div style="width: 32px; height: 32px; background: #ff764d; border-radius: 50%; text-align: center; line-height: 32px; color: #fff; font-weight: 700; font-size: 14px;">1</div>
                                                </td>
                                                <td style="vertical-align: top;">
                                                    <p style="margin: 0; color: #333; font-size: 15px; line-height: 1.6;"><strong>Crea tu cuenta gratis</strong> — Usa el enlace de abajo, es exclusivo para ti.</p>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding: 10px 0;">
                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                                            <tr>
                                                <td style="padding-right: 12px; vertical-align: top;">
                                                    <div style="width: 32px; height: 32px; background: #ff764d; border-radius: 50%; text-align: center; line-height: 32px; color: #fff; font-weight: 700; font-size: 14px;">2</div>
                                                </td>
                                                <td style="vertical-align: top;">
                                                    <p style="margin: 0; color: #333; font-size: 15px; line-height: 1.6;"><strong>Arma tu perfil</strong> — Agrega tu experiencia, especialidades, horarios y tarifa.</p>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding: 10px 0;">
                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                                            <tr>
                                                <td style="padding-right: 12px; vertical-align: top;">
                                                    <div style="width: 32px; height: 32px; background: #ff764d; border-radius: 50%; text-align: center; line-height: 32px; color: #fff; font-weight: 700; font-size: 14px;">3</div>
                                                </td>
                                                <td style="vertical-align: top;">
                                                    <p style="margin: 0; color: #333; font-size: 15px; line-height: 1.6;"><strong>Comienza a recibir alumnos</strong> — Apareces en el catálogo y los estudiantes te encuentran.</p>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- CTA Principal -->
                    <tr>
                        <td align="center" style="padding: 30px 40px;">
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                                <tr>
                                    <td align="center" style="border-radius: 10px; background: linear-gradient(135deg, #ff764d 0%, #ff5733 100%); box-shadow: 0 4px 15px rgba(255, 87, 51, 0.4);">
                                        <a href="${inviteUrl}" target="_blank" style="display: inline-block; padding: 18px 48px; color: #ffffff; text-decoration: none; font-size: 18px; font-weight: 700; letter-spacing: 0.5px;">
                                            Crear mi cuenta de Profesor →
                                        </a>
                                    </td>
                                </tr>
                            </table>

                            <p style="margin: 16px 0 0 0; color: #888; font-size: 13px; line-height: 1.5;">
                                O copia este enlace:<br>
                                <a href="${inviteUrl}" style="color: #ff764d; text-decoration: none; word-break: break-all;">${inviteUrl}</a>
                            </p>

                            <p style="margin: 12px 0 0 0; color: #aaa; font-size: 12px;">
                                ⏳ Este enlace es personal y expira en 30 días.
                            </p>
                        </td>
                    </tr>

                    <!-- Separador -->
                    <tr>
                        <td style="padding: 0 40px;">
                            <div style="height: 1px; background-color: #e0e0e0;"></div>
                        </td>
                    </tr>

                    <!-- Cierre personal -->
                    <tr>
                        <td style="padding: 30px 40px 20px 40px;">
                            <p style="margin: 0 0 12px 0; color: #333; font-size: 15px; line-height: 1.7;">
                                Cualquier duda, responde este email directamente o escríbeme por WhatsApp. Estoy aquí para ayudarte.
                            </p>
                            <p style="margin: 0; color: #333; font-size: 15px; line-height: 1.7;">
                                Un abrazo,<br>
                                <strong>Miguel — Fundador de PianoLink</strong>
                            </p>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td align="center" style="padding: 30px 40px; background-color: #f8f9fa; border-radius: 0 0 12px 12px;">
                            ${recipientEmail ? `<p style="margin: 0 0 8px 0; color: #888; font-size: 13px;">Este email fue enviado a <strong>${recipientEmail}</strong></p>` : ''}
                            <p style="margin: 0 0 8px 0; color: #888; font-size: 13px;">
                                © ${currentYear} PianoLink. Todos los derechos reservados.
                            </p>
                            <p style="margin: 0; color: #aaa; font-size: 12px;">
                                Recibes este email porque conversaste con nosotros sobre PianoLink.
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
};
