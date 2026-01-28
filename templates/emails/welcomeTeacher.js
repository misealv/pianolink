/* templates/emails/welcomeTeacher.js - Template de Bienvenida para Profesores */

/**
 * Genera el HTML del email de bienvenida para nuevos profesores
 * 
 * CARACTERÍSTICAS:
 * - Diseño profesional y moderno
 * - Responsive (se adapta a móviles)
 * - Compatible con clientes de email (Gmail, Outlook, Apple Mail)
 * - Variables dinámicas (nombre del profesor)
 * - CTA (Call To Action) claro
 * - Branding consistente con PianoLink
 * 
 * @param {Object} data - Datos para el template
 * @param {string} data.teacherName - Nombre del profesor
 * @param {string} data.teacherEmail - Email del profesor (para personalizaciones futuras)
 * @param {string} [data.dashboardUrl] - URL al dashboard (opcional)
 * @returns {string} - HTML del email
 */

module.exports = function generateWelcomeTeacherEmail(data) {
    const {
        teacherName = 'Profesor',
        teacherEmail,
        dashboardUrl = process.env.FRONTEND_URL || 'https://pianolink.com/dashboard.html'
    } = data;
    
    const firstName = teacherName.split(' ')[0]; // Solo el primer nombre
    const currentYear = new Date().getFullYear();
    
    return `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <title>Bienvenido a PianoLink</title>
    <!--[if mso]>
    <style type="text/css">
        body, table, td {font-family: Arial, Helvetica, sans-serif !important;}
    </style>
    <![endif]-->
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f4; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
    
    <!-- Wrapper principal -->
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f4f4f4;">
        <tr>
            <td align="center" style="padding: 40px 20px;">
                
                <!-- Container principal -->
                <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
                    
                    <!-- Header con logo -->
                    <tr>
                        <td align="center" style="padding: 40px 40px 30px 40px; background: linear-gradient(135deg, #ff764d 0%, #ff5733 100%); border-radius: 12px 12px 0 0;">
                            <h1 style="margin: 0; color: #ffffff; font-size: 32px; font-weight: 700; letter-spacing: -0.5px;">
                                🎹 PianoLink
                            </h1>
                            <p style="margin: 8px 0 0 0; color: #ffffff; font-size: 16px; opacity: 0.95;">
                                Enseñanza Musical en Tiempo Real
                            </p>
                        </td>
                    </tr>
                    
                    <!-- Contenido principal -->
                    <tr>
                        <td style="padding: 40px 40px 20px 40px;">
                            <h2 style="margin: 0 0 20px 0; color: #1a1a1a; font-size: 28px; font-weight: 600;">
                                ¡Bienvenido, ${firstName}! 🎉
                            </h2>
                            
                            <p style="margin: 0 0 16px 0; color: #333333; font-size: 16px; line-height: 1.6;">
                                Nos emociona tenerte como parte de la comunidad de <strong>PianoLink</strong>.
                            </p>
                            
                            <p style="margin: 0 0 16px 0; color: #333333; font-size: 16px; line-height: 1.6;">
                                Tu cuenta ha sido creada exitosamente y ya puedes comenzar a transformar la forma 
                                en que enseñas música, conectando con tus estudiantes a través de nuestra plataforma 
                                de <strong>transmisión MIDI en tiempo real</strong>.
                            </p>
                        </td>
                    </tr>
                    
                    <!-- Sección de características -->
                    <tr>
                        <td style="padding: 0 40px 20px 40px;">
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                                <tr>
                                    <td style="padding: 16px; background-color: #f8f9fa; border-radius: 8px; border-left: 4px solid #ff764d;">
                                        <p style="margin: 0 0 8px 0; color: #ff764d; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                                            ✨ Qué puedes hacer
                                        </p>
                                        <ul style="margin: 0; padding-left: 20px; color: #555555; font-size: 15px; line-height: 1.8;">
                                            <li><strong>Transmitir MIDI</strong> en tiempo real a tus estudiantes</li>
                                            <li><strong>Compartir partituras</strong> y anotaciones en vivo</li>
                                            <li><strong>Video y audio</strong> sincronizado con alta calidad</li>
                                            <li><strong>Pizarra colaborativa</strong> para explicaciones visuales</li>
                                            <li><strong>Gestionar tu perfil</strong> y personalizar tu sala de clase</li>
                                        </ul>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    
                    <!-- Call to Action -->
                    <tr>
                        <td align="center" style="padding: 20px 40px 40px 40px;">
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                                <tr>
                                    <td align="center" style="border-radius: 8px; background: linear-gradient(135deg, #ff764d 0%, #ff5733 100%);">
                                        <a href="${dashboardUrl}" target="_blank" style="display: inline-block; padding: 16px 40px; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; letter-spacing: 0.3px;">
                                            🚀 Ir a Mi Dashboard
                                        </a>
                                    </td>
                                </tr>
                            </table>
                            
                            <p style="margin: 20px 0 0 0; color: #888888; font-size: 13px; line-height: 1.5;">
                                O copia esta URL en tu navegador:<br>
                                <a href="${dashboardUrl}" style="color: #ff764d; text-decoration: none;">${dashboardUrl}</a>
                            </p>
                        </td>
                    </tr>
                    
                    <!-- Separador -->
                    <tr>
                        <td style="padding: 0 40px;">
                            <div style="height: 1px; background-color: #e0e0e0;"></div>
                        </td>
                    </tr>
                    
                    <!-- Sección de ayuda -->
                    <tr>
                        <td style="padding: 30px 40px;">
                            <p style="margin: 0 0 12px 0; color: #333333; font-size: 15px; font-weight: 600;">
                                ¿Necesitas ayuda para comenzar?
                            </p>
                            <p style="margin: 0 0 16px 0; color: #555555; font-size: 14px; line-height: 1.6;">
                                Consulta nuestra <a href="${process.env.FRONTEND_URL || 'https://pianolink.com'}/help" style="color: #ff764d; text-decoration: none; font-weight: 500;">guía de inicio rápido</a> 
                                o contáctanos directamente respondiendo a este email. Estamos aquí para ayudarte.
                            </p>
                            
                            <p style="margin: 0; color: #555555; font-size: 14px; line-height: 1.6;">
                                <strong>💡 Consejo:</strong> Conecta tu piano MIDI a través de USB y verifica que tu navegador 
                                tenga permisos para acceder a dispositivos MIDI (Chrome/Edge recomendados).
                            </p>
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td align="center" style="padding: 30px 40px 40px 40px; background-color: #f8f9fa; border-radius: 0 0 12px 12px;">
                            <p style="margin: 0 0 8px 0; color: #888888; font-size: 13px; line-height: 1.5;">
                                Este email fue enviado a <strong>${teacherEmail}</strong>
                            </p>
                            <p style="margin: 0 0 16px 0; color: #888888; font-size: 13px; line-height: 1.5;">
                                © ${currentYear} PianoLink. Todos los derechos reservados.
                            </p>
                            
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center">
                                <tr>
                                    <td style="padding: 0 8px;">
                                        <a href="https://twitter.com/pianolink" style="color: #888888; text-decoration: none; font-size: 20px;">𝕏</a>
                                    </td>
                                    <td style="padding: 0 8px;">
                                        <a href="https://instagram.com/pianolink" style="color: #888888; text-decoration: none; font-size: 20px;">📷</a>
                                    </td>
                                    <td style="padding: 0 8px;">
                                        <a href="https://facebook.com/pianolink" style="color: #888888; text-decoration: none; font-size: 20px;">👍</a>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    
                </table>
                <!-- Fin del container principal -->
                
            </td>
        </tr>
    </table>
    <!-- Fin del wrapper principal -->
    
</body>
</html>
    `.trim();
};
