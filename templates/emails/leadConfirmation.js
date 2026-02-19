/**
 * templates/emails/leadConfirmation.js
 * Email de confirmación cuando un profesor postula desde la landing.
 * Se envía automáticamente al crear el lead.
 */
module.exports = function generateLeadConfirmationEmail(data) {
    const {
        name = 'Profesor',
    } = data;

    const firstName = name.split(' ')[0];

    return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Postulación recibida — PianoLink</title>
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
                            <p style="color: #00B8CC; font-size: 14px; letter-spacing: 2px; text-transform: uppercase; margin: 0;">
                                Postulación Recibida
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

                            <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
                                Hemos recibido tu postulación para ser profesor en PianoLink. Gracias por tu interés en formar parte de nuestra comunidad.
                            </p>

                            <div style="background-color: #f0fdf4; border-left: 4px solid #00B8CC; padding: 20px; border-radius: 0 8px 8px 0; margin: 24px 0;">
                                <p style="color: #1a1a2e; font-size: 15px; font-weight: 600; margin: 0 0 8px;">
                                    ¿Qué sigue?
                                </p>
                                <ol style="color: #4a5568; font-size: 14px; line-height: 1.8; margin: 0; padding-left: 20px;">
                                    <li>Revisaremos tu perfil en detalle</li>
                                    <li>Te contactaremos por <strong>WhatsApp</strong> para agendar una breve entrevista</li>
                                    <li>Te haremos una demo de la plataforma y la tecnología MIDI</li>
                                    <li>Si todo va bien, recibirás tu invitación para crear tu cuenta</li>
                                </ol>
                            </div>

                            <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin: 24px 0 0;">
                                El proceso normalmente toma entre <strong style="color: #1a1a2e;">24 y 72 horas</strong>. 
                                Mientras tanto, asegúrate de tener tu WhatsApp activo para que podamos comunicarnos contigo.
                            </p>

                        </td>
                    </tr>

                    <!-- Divider -->
                    <tr>
                        <td style="background-color: #ffffff; padding: 0 40px;">
                            <div style="border-top: 1px solid #e2e8f0;"></div>
                        </td>
                    </tr>

                    <!-- Info adicional -->
                    <tr>
                        <td style="background-color: #ffffff; padding: 24px 40px 40px;">
                            <p style="color: #718096; font-size: 14px; line-height: 1.6; margin: 0;">
                                💡 <strong style="color: #4a5568;">Tip:</strong> Si tienes un piano digital con conexión MIDI USB, 
                                tenlo listo para la demo. Te mostraremos cómo funciona el Espejo MIDI en tiempo real.
                            </p>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="background-color: #1a1a2e; border-radius: 0 0 16px 16px; padding: 30px 40px; text-align: center;">
                            <p style="color: #a0aec0; font-size: 13px; margin: 0 0 8px;">
                                © ${new Date().getFullYear()} PianoLink — Tecnología para la enseñanza musical
                            </p>
                            <p style="color: #718096; font-size: 12px; margin: 0;">
                                Este email fue enviado porque postulaste como profesor en pianolink.net
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
