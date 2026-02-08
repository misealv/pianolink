/* templates/emails/trialFollowup.js - Email de seguimiento post-clase de prueba */

const generateBaseEmail = require('./_baseTemplate');

/**
 * Email de seguimiento enviado 24h después de una clase de prueba completada
 * 
 * Objetivo: Convertir al estudiante en cliente pagante
 * 
 * @param {Object} data - Datos para el template
 * @param {string} data.studentName - Nombre del estudiante
 * @param {string} data.studentEmail - Email del estudiante
 * @param {string} data.teacherName - Nombre del profesor
 * @param {string} data.teacherSlug - Slug del profesor (para URL)
 * @param {Array} data.packages - Paquetes disponibles del profesor [{classes, price, discount}]
 * @param {number} data.pricePerClass - Precio por clase individual
 * @returns {string} - HTML del email
 */

module.exports = function generateTrialFollowupEmail(data) {
    const {
        studentName,
        studentEmail,
        teacherName,
        teacherSlug,
        packages = [],
        pricePerClass = 25
    } = data;
    
    const firstName = studentName ? studentName.split(' ')[0] : 'Estudiante';
    const frontendUrl = process.env.FRONTEND_URL || 'https://pianolink.app';
    
    // Generar HTML de paquetes si existen
    let packagesHTML = '';
    if (packages.length > 0) {
        packagesHTML = `
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin: 20px 0;">
                ${packages.map(pkg => `
                    <tr>
                        <td style="padding: 12px 15px; background-color: #f8f9fa; border-radius: 8px; margin-bottom: 8px;">
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                                <tr>
                                    <td style="color: #333; font-size: 14px;">
                                        <strong>${pkg.classes} clases</strong>
                                        ${pkg.discount > 0 ? `<span style="background: #ffc107; color: #000; padding: 2px 6px; border-radius: 4px; font-size: 11px; margin-left: 8px;">-${pkg.discount}%</span>` : ''}
                                    </td>
                                    <td style="text-align: right; color: #4ade80; font-size: 16px; font-weight: 600;">
                                        $${pkg.price} USD
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    <tr><td style="height: 8px;"></td></tr>
                `).join('')}
            </table>
        `;
    }
    
    // Contenido específico del email
    const content = `
        <div style="text-align: center; margin-bottom: 25px;">
            <span style="font-size: 48px;">🌟</span>
        </div>
        
        <h2 style="margin: 0 0 20px 0; color: #1a1a1a; font-size: 26px; font-weight: 700; text-align: center;">
            ¿Cómo estuvo tu clase?
        </h2>
        
        <p style="margin: 0 0 16px 0; color: #333333; font-size: 16px; line-height: 1.6;">
            Hola <strong>${firstName}</strong>,
        </p>
        
        <p style="margin: 0 0 20px 0; color: #333333; font-size: 16px; line-height: 1.6;">
            Esperamos que hayas disfrutado tu clase de prueba con <strong>${teacherName}</strong>. 
            ¡Tu viaje musical apenas comienza! 🎹
        </p>
        
        <!-- CTA para continuar -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin: 0 0 25px 0;">
            <tr>
                <td style="padding: 25px; background: linear-gradient(135deg, #6366f1 0%, #818cf8 100%); border-radius: 12px; text-align: center;">
                    <p style="margin: 0 0 15px 0; color: #ffffff; font-size: 18px; font-weight: 600;">
                        ¿Listo para seguir aprendiendo?
                    </p>
                    <p style="margin: 0 0 20px 0; color: rgba(255,255,255,0.9); font-size: 14px;">
                        Reserva más clases con ${teacherName} y alcanza tus metas musicales.
                    </p>
                    <a href="${frontendUrl}/profesor/${teacherSlug}" style="display: inline-block; padding: 14px 30px; background-color: #ffffff; color: #6366f1; text-decoration: none; font-size: 15px; font-weight: 600; border-radius: 8px;">
                        Ver Paquetes de Clases →
                    </a>
                </td>
            </tr>
        </table>
        
        ${packages.length > 0 ? `
        <!-- Paquetes disponibles -->
        <p style="margin: 0 0 12px 0; color: #333333; font-size: 15px; font-weight: 600;">
            📦 Paquetes de ${teacherName}:
        </p>
        ${packagesHTML}
        ` : `
        <!-- Precio por clase -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin: 0 0 25px 0;">
            <tr>
                <td style="padding: 20px; background-color: #f8f9fa; border-radius: 8px; text-align: center;">
                    <p style="margin: 0 0 8px 0; color: #666; font-size: 13px;">Precio por clase</p>
                    <p style="margin: 0; color: #4ade80; font-size: 28px; font-weight: 700;">$${pricePerClass} USD</p>
                </td>
            </tr>
        </table>
        `}
        
        <!-- Beneficios -->
        <p style="margin: 25px 0 12px 0; color: #333333; font-size: 15px; font-weight: 600;">
            ✨ Por qué continuar con PianoLink:
        </p>
        <ul style="margin: 0 0 25px 0; padding-left: 20px; color: #555555; font-size: 14px; line-height: 1.8;">
            <li>Clases en vivo con audio profesional</li>
            <li>Tu profesor puede ver todo lo que tocas en tiempo real</li>
            <li>Horarios flexibles que se adaptan a ti</li>
            <li>Progreso garantizado con metodología probada</li>
        </ul>
        
        <!-- Calificar clase -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin: 0 0 20px 0;">
            <tr>
                <td style="padding: 15px 20px; background-color: #fff8e1; border-radius: 8px; text-align: center;">
                    <p style="margin: 0 0 10px 0; color: #f57c00; font-size: 14px;">
                        ⭐ Tu opinión nos importa
                    </p>
                    <a href="${frontendUrl}/mis-clases.html" style="color: #6366f1; font-size: 14px; text-decoration: none; font-weight: 500;">
                        Calificar mi clase de prueba →
                    </a>
                </td>
            </tr>
        </table>
        
        <p style="margin: 0; color: #888888; font-size: 13px; line-height: 1.5; text-align: center;">
            ¿Preguntas? Responde a este email y te ayudamos.
        </p>
    `;
    
    // Usar template base
    return generateBaseEmail({
        title: '🌟 ¿Listo para tu siguiente clase? - PianoLink',
        preheader: `Tu clase de prueba con ${teacherName} fue un éxito. ¿Continuamos?`,
        content,
        showCTA: false,
        recipientEmail: studentEmail
    });
};
