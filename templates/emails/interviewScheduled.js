/**
 * templates/emails/interviewScheduled.js
 * Email de confirmación cuando se agenda una entrevista con un profesor.
 * Se envía como respaldo/complemento a la invitación de Google Calendar.
 */
module.exports = function generateInterviewScheduledEmail(data) {
    const {
        name = 'Profesor',
        dateFormatted = '',
        duration = 20,
        meetingLink = '',
    } = data;

    const firstName = name.split(' ')[0];

    return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Entrevista Agendada — PianoLink</title>
</head>
<body style="margin:0; padding:0; background-color:#f8f9fa; font-family: 'Helvetica Neue', Arial, sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f8f9fa;">
        <tr>
            <td align="center" style="padding: 40px 20px;">
                <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px; width:100%;">
                    
                    <!-- Header -->
                    <tr>
                        <td style="background: linear-gradient(135deg, #1a1a2e 0%, #0f3460 100%); border-radius: 16px 16px 0 0; padding: 40px 40px 30px; text-align: center;">
                            <div style="font-size: 32px; margin-bottom: 8px;">📅</div>
                            <h1 style="color: #ffffff; font-size: 24px; font-weight: 700; margin: 0 0 8px;">
                                PianoLink
                            </h1>
                            <p style="color: #00B8CC; font-size: 14px; letter-spacing: 2px; text-transform: uppercase; margin: 0;">
                                Entrevista Agendada
                            </p>
                        </td>
                    </tr>

                    <!-- Body -->
                    <tr>
                        <td style="background-color: #ffffff; padding: 40px;">
                            
                            <h2 style="color: #1a1a2e; font-size: 22px; font-weight: 600; margin: 0 0 20px;">
                                ¡Hola ${firstName}! 🎹
                            </h2>

                            <div style="width: 60px; height: 3px; background: linear-gradient(90deg, #00B8CC, #7700CC); margin-bottom: 24px; border-radius: 2px;"></div>

                            <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
                                Tu entrevista con PianoLink ha sido confirmada. Nos reuniremos para conocernos, 
                                responder tus dudas y hacer una breve demo de la plataforma.
                            </p>

                            <!-- Detalles de la entrevista -->
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin: 24px 0;">
                                <tr>
                                    <td style="background: linear-gradient(135deg, rgba(0,184,204,0.08), rgba(119,0,204,0.05)); border: 1px solid rgba(0,184,204,0.2); border-radius: 12px; padding: 24px;">
                                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                                            <tr>
                                                <td style="padding: 0 0 12px;">
                                                    <span style="color: #718096; font-size: 13px;">📅 Fecha y hora</span><br>
                                                    <strong style="color: #1a1a2e; font-size: 16px;">${dateFormatted}</strong>
                                                </td>
                                            </tr>
                                            <tr>
                                                <td style="padding: 0 0 12px;">
                                                    <span style="color: #718096; font-size: 13px;">⏱️ Duración</span><br>
                                                    <strong style="color: #1a1a2e; font-size: 16px;">${duration} minutos</strong>
                                                </td>
                                            </tr>
                                            ${meetingLink ? `<tr>
                                                <td style="padding: 0;">
                                                    <span style="color: #718096; font-size: 13px;">🔗 Sala de demostración</span><br>
                                                    <a href="${meetingLink}" style="color: #00B8CC; font-size: 14px; text-decoration: none; font-weight: 600;">${meetingLink}</a>
                                                </td>
                                            </tr>` : ''}
                                        </table>
                                    </td>
                                </tr>
                            </table>

                            <!-- Qué preparar -->
                            <h3 style="color: #1a1a2e; font-size: 16px; font-weight: 600; margin: 28px 0 16px;">
                                ¿Qué necesitas tener listo?
                            </h3>

                            <table role="presentation" cellspacing="0" cellpadding="0" style="margin-bottom: 24px;">
                                <tr>
                                    <td style="padding: 6px 0; color: #4a5568; font-size: 14px;">
                                        ✅ Piano digital con cable MIDI USB conectado
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding: 6px 0; color: #4a5568; font-size: 14px;">
                                        ✅ Chrome o Edge actualizado
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding: 6px 0; color: #4a5568; font-size: 14px;">
                                        ✅ Cámara y micrófono funcionando
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding: 6px 0; color: #4a5568; font-size: 14px;">
                                        ✅ Conexión a internet estable
                                    </td>
                                </tr>
                            </table>

                            <p style="color: #4a5568; font-size: 14px; line-height: 1.6; margin: 0 0 24px;">
                                También deberías haber recibido una invitación de Google Calendar. 
                                Si no la ves, revisa tu carpeta de spam.
                            </p>

                            <!-- CTA -->
                            <table role="presentation" cellspacing="0" cellpadding="0" style="margin: 0 auto;">
                                <tr>
                                    <td style="border-radius: 12px; background: linear-gradient(135deg, #00B8CC 0%, #7700CC 100%);">
                                        <a href="https://pianolink-v4.fly.dev/landing.html" 
                                           style="display: inline-block; padding: 14px 32px; color: #ffffff; font-size: 15px; font-weight: 700; text-decoration: none; letter-spacing: 0.5px;">
                                            Conocer más sobre PianoLink →
                                        </a>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="background-color: #f1f5f9; border-radius: 0 0 16px 16px; padding: 24px 40px; text-align: center;">
                            <p style="color: #94a3b8; font-size: 12px; line-height: 1.5; margin: 0;">
                                Este email fue enviado por PianoLink.<br>
                                Si tienes dudas, responde directamente a este correo.
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
