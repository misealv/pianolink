/* templates/emails/_baseTemplate.js - Template Base Reutilizable */

/**
 * Template base para todos los emails de PianoLink
 * 
 * Este template proporciona una estructura consistente que puede ser
 * reutilizada por todos los emails de la plataforma.
 * 
 * CARACTERÍSTICAS:
 * - Header y footer consistentes
 * - Estilos responsive
 * - Branding de PianoLink
 * - Compatible con clientes de email
 * 
 * @param {Object} options - Opciones del template
 * @param {string} options.title - Título del email
 * @param {string} options.preheader - Texto preview (aparece en inbox)
 * @param {string} options.content - Contenido HTML del email
 * @param {boolean} [options.showCTA=true] - Mostrar botón CTA
 * @param {string} [options.ctaText] - Texto del botón
 * @param {string} [options.ctaUrl] - URL del botón
 * @returns {string} - HTML completo del email
 */

module.exports = function generateBaseEmail(options) {
    const {
        title,
        preheader = '',
        content,
        showCTA = true,
        ctaText = 'Ir al Dashboard',
        ctaUrl = process.env.FRONTEND_URL || 'https://pianolink.com/dashboard.html',
        recipientEmail = ''
    } = options;
    
    const currentYear = new Date().getFullYear();
    
    return `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <title>${title}</title>
    <!--[if mso]>
    <style type="text/css">
        body, table, td {font-family: Arial, Helvetica, sans-serif !important;}
    </style>
    <![endif]-->
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f4; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
    
    <!-- Preheader (texto preview en inbox) -->
    <div style="display: none; max-height: 0px; overflow: hidden;">
        ${preheader}
    </div>
    
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
                    
                    <!-- Contenido principal (inyectado) -->
                    <tr>
                        <td style="padding: 40px 40px 20px 40px;">
                            ${content}
                        </td>
                    </tr>
                    
                    ${showCTA ? `
                    <!-- Call to Action -->
                    <tr>
                        <td align="center" style="padding: 20px 40px 40px 40px;">
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                                <tr>
                                    <td align="center" style="border-radius: 8px; background: linear-gradient(135deg, #ff764d 0%, #ff5733 100%);">
                                        <a href="${ctaUrl}" target="_blank" style="display: inline-block; padding: 16px 40px; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; letter-spacing: 0.3px;">
                                            ${ctaText}
                                        </a>
                                    </td>
                                </tr>
                            </table>
                            
                            <p style="margin: 20px 0 0 0; color: #888888; font-size: 13px; line-height: 1.5;">
                                O copia esta URL en tu navegador:<br>
                                <a href="${ctaUrl}" style="color: #ff764d; text-decoration: none; word-break: break-all;">${ctaUrl}</a>
                            </p>
                        </td>
                    </tr>
                    ` : ''}
                    
                    <!-- Separador -->
                    <tr>
                        <td style="padding: 0 40px;">
                            <div style="height: 1px; background-color: #e0e0e0;"></div>
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td align="center" style="padding: 30px 40px 40px 40px; background-color: #f8f9fa; border-radius: 0 0 12px 12px;">
                            ${recipientEmail ? `
                            <p style="margin: 0 0 8px 0; color: #888888; font-size: 13px; line-height: 1.5;">
                                Este email fue enviado a <strong>${recipientEmail}</strong>
                            </p>
                            ` : ''}
                            <p style="margin: 0 0 16px 0; color: #888888; font-size: 13px; line-height: 1.5;">
                                © ${currentYear} PianoLink. Todos los derechos reservados.
                            </p>
                            
                            <p style="margin: 0 0 8px 0; color: #888888; font-size: 12px;">
                                <a href="${process.env.FRONTEND_URL || 'https://pianolink.com'}/help" style="color: #ff764d; text-decoration: none;">Centro de Ayuda</a> • 
                                <a href="${process.env.FRONTEND_URL || 'https://pianolink.com'}/privacy" style="color: #ff764d; text-decoration: none;">Privacidad</a> • 
                                <a href="${process.env.FRONTEND_URL || 'https://pianolink.com'}/terms" style="color: #ff764d; text-decoration: none;">Términos</a>
                            </p>
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
