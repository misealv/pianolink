/**
 * Template de Email: Bienvenida Welcome Kit
 * 
 * Este email se envía cuando un cliente compra el Welcome Kit
 * Incluye: confirmación de compra, datos del estudiante, próximos pasos
 */

/**
 * Genera el HTML del email de bienvenida
 * @param {Object} data - Datos para el email
 * @param {string} data.clientName - Nombre del cliente/apoderado
 * @param {string} data.clientEmail - Email del cliente
 * @param {string} data.magicLinkUrl - URL del magic link para establecer contraseña
 * @param {Array} data.students - Array de estudiantes [{name, age, classesRemaining}]
 * @param {string} data.kitType - Tipo de kit: 'setup_only' o 'full'
 * @param {number} data.totalPaid - Monto pagado
 * @param {string} data.currency - Moneda (USD, CLP, etc)
 * @param {string} data.orderId - ID de la orden
 * @param {string} [data.whatsappNumber] - Número de WhatsApp para contacto
 * @returns {string} HTML del email
 */
function generateWelcomeKitEmail(data) {
    const {
        clientName = 'Cliente',
        clientEmail,
        magicLinkUrl,
        students = [],
        kitType = 'setup_only',
        totalPaid,
        currency = 'USD',
        orderId,
        whatsappNumber = '+56912345678'
    } = data;

    const isGuardian = students.length > 0;
    const studentCount = students.length || 1;
    
    // Generar lista de estudiantes
    const studentsHtml = students.length > 0 
        ? students.map(s => `
            <tr>
                <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">
                    <strong>${s.name}</strong>
                    ${s.age ? `<br><span style="color: #6b7280; font-size: 14px;">${s.age} años</span>` : ''}
                </td>
                <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">
                    <span style="background: #dbeafe; color: #1e40af; padding: 4px 12px; border-radius: 12px; font-weight: 600;">
                        ${s.classesRemaining || 1} clase${(s.classesRemaining || 1) > 1 ? 's' : ''}
                    </span>
                </td>
            </tr>
        `).join('')
        : '';

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>¡Bienvenido a PianoLink!</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f3f4f6;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 20px;">
        <tr>
            <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                    
                    <!-- Header -->
                    <tr>
                        <td style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); padding: 40px; text-align: center;">
                            <h1 style="color: #ffffff; margin: 0; font-size: 32px;">🎹 ¡Bienvenido a PianoLink!</h1>
                            <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px;">
                                Tu viaje musical comienza ahora
                            </p>
                        </td>
                    </tr>
                    
                    <!-- Greeting -->
                    <tr>
                        <td style="padding: 40px 40px 20px 40px;">
                            <h2 style="color: #1f2937; margin: 0 0 15px 0; font-size: 24px;">
                                ¡Hola ${clientName}! 👋
                            </h2>
                            <p style="color: #4b5563; font-size: 16px; line-height: 1.6; margin: 0;">
                                Gracias por tu compra. Estamos emocionados de comenzar este viaje musical 
                                ${isGuardian ? 'junto a tu familia' : 'contigo'}.
                            </p>
                        </td>
                    </tr>
                    
                    <!-- Order Summary -->
                    <tr>
                        <td style="padding: 0 40px 30px 40px;">
                            <div style="background: #f8fafc; border-radius: 12px; padding: 20px; border: 1px solid #e2e8f0;">
                                <h3 style="color: #1f2937; margin: 0 0 15px 0; font-size: 18px;">
                                    📋 Resumen de tu compra
                                </h3>
                                <table width="100%" cellpadding="0" cellspacing="0">
                                    <tr>
                                        <td style="color: #6b7280; padding: 5px 0;">Orden:</td>
                                        <td style="color: #1f2937; font-weight: 600; text-align: right;">#${orderId ? orderId.substring(0, 8).toUpperCase() : 'N/A'}</td>
                                    </tr>
                                    <tr>
                                        <td style="color: #6b7280; padding: 5px 0;">Servicio:</td>
                                        <td style="color: #1f2937; font-weight: 600; text-align: right;">Setup + Clase de Prueba</td>
                                    </tr>
                                    <tr>
                                        <td style="color: #6b7280; padding: 5px 0;">Estudiantes:</td>
                                        <td style="color: #1f2937; font-weight: 600; text-align: right;">${studentCount}</td>
                                    </tr>
                                    ${totalPaid ? `
                                    <tr>
                                        <td style="color: #6b7280; padding: 5px 0;">Total pagado:</td>
                                        <td style="color: #059669; font-weight: 700; text-align: right; font-size: 18px;">$${totalPaid} ${currency}</td>
                                    </tr>
                                    ` : ''}
                                </table>
                            </div>
                        </td>
                    </tr>
                    
                    <!-- Magic Link - Acceso a la cuenta -->
                    ${magicLinkUrl ? `
                    <tr>
                        <td style="padding: 0 40px 30px 40px;">
                            <div style="background: linear-gradient(135deg, #fef3c7, #fde68a); border-radius: 12px; padding: 25px; border: 1px solid #fcd34d;">
                                <h3 style="color: #92400e; margin: 0 0 15px 0; font-size: 18px;">
                                    🔐 Accede a tu cuenta
                                </h3>
                                <p style="color: #78350f; margin: 0 0 20px 0; font-size: 14px; line-height: 1.6;">
                                    Haz clic en el botón para crear tu contraseña y acceder a tu panel donde podrás ver tus clases, agendar sesiones y más.
                                </p>
                                <div style="text-align: center;">
                                    <a href="${magicLinkUrl}" 
                                       style="display: inline-block; background: #f59e0b; color: white; padding: 16px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px rgba(245, 158, 11, 0.3);">
                                        🚀 Crear mi contraseña y acceder
                                    </a>
                                </div>
                                <p style="color: #92400e; margin: 20px 0 0 0; font-size: 12px; text-align: center;">
                                    ⏰ Este enlace expira en 7 días
                                </p>
                            </div>
                        </td>
                    </tr>
                    ` : ''}
                    
                    ${isGuardian ? `
                    <!-- Students List (for guardians) -->
                    <tr>
                        <td style="padding: 0 40px 30px 40px;">
                            <h3 style="color: #1f2937; margin: 0 0 15px 0; font-size: 18px;">
                                👨‍👧‍👦 Estudiantes registrados
                            </h3>
                            <table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
                                <tr style="background: #f9fafb;">
                                    <th style="padding: 12px; text-align: left; color: #6b7280; font-weight: 500;">Nombre</th>
                                    <th style="padding: 12px; text-align: center; color: #6b7280; font-weight: 500;">Clases</th>
                                </tr>
                                ${studentsHtml}
                            </table>
                        </td>
                    </tr>
                    ` : ''}
                    
                    <!-- Next Steps -->
                    <tr>
                        <td style="padding: 0 40px 30px 40px;">
                            <h3 style="color: #1f2937; margin: 0 0 20px 0; font-size: 18px;">
                                🎯 Próximos pasos
                            </h3>
                            
                            <table width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td style="padding: 15px; background: #f0fdf4; border-radius: 8px; margin-bottom: 10px;">
                                        <table cellpadding="0" cellspacing="0">
                                            <tr>
                                                <td style="width: 40px; vertical-align: top;">
                                                    <div style="background: #22c55e; color: white; width: 28px; height: 28px; border-radius: 50%; text-align: center; line-height: 28px; font-weight: bold;">1</div>
                                                </td>
                                                <td>
                                                    <strong style="color: #166534;">Te contactaremos por WhatsApp</strong>
                                                    <p style="color: #4b5563; margin: 5px 0 0 0; font-size: 14px;">
                                                        En las próximas 24 horas te escribiremos para agendar tu sesión.
                                                    </p>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                                <tr><td style="height: 10px;"></td></tr>
                                <tr>
                                    <td style="padding: 15px; background: #eff6ff; border-radius: 8px;">
                                        <table cellpadding="0" cellspacing="0">
                                            <tr>
                                                <td style="width: 40px; vertical-align: top;">
                                                    <div style="background: #3b82f6; color: white; width: 28px; height: 28px; border-radius: 50%; text-align: center; line-height: 28px; font-weight: bold;">2</div>
                                                </td>
                                                <td>
                                                    <strong style="color: #1e40af;">Sesión de Setup + Clase de prueba</strong>
                                                    <p style="color: #4b5563; margin: 5px 0 0 0; font-size: 14px;">
                                                        30 minutos donde configuraremos todo y ${isGuardian ? 'tus hijos tendrán' : 'tendrás'} una mini-clase.
                                                    </p>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                                <tr><td style="height: 10px;"></td></tr>
                                <tr>
                                    <td style="padding: 15px; background: #fdf4ff; border-radius: 8px;">
                                        <table cellpadding="0" cellspacing="0">
                                            <tr>
                                                <td style="width: 40px; vertical-align: top;">
                                                    <div style="background: #a855f7; color: white; width: 28px; height: 28px; border-radius: 50%; text-align: center; line-height: 28px; font-weight: bold;">3</div>
                                                </td>
                                                <td>
                                                    <strong style="color: #7e22ce;">¡A tocar piano!</strong>
                                                    <p style="color: #4b5563; margin: 5px 0 0 0; font-size: 14px;">
                                                        Después de la sesión, ${isGuardian ? 'estarán listos' : 'estarás listo'} para comenzar las clases regulares.
                                                    </p>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    
                    <!-- WhatsApp CTA -->
                    <tr>
                        <td style="padding: 0 40px 40px 40px; text-align: center;">
                            <p style="color: #6b7280; margin: 0 0 15px 0;">
                                ¿Tienes preguntas? Escríbenos directamente:
                            </p>
                            <a href="https://wa.me/${whatsappNumber.replace(/[^0-9]/g, '')}" 
                               style="display: inline-block; background: #25D366; color: white; padding: 14px 30px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
                                💬 Escribir por WhatsApp
                            </a>
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td style="background: #f9fafb; padding: 30px 40px; border-top: 1px solid #e5e7eb;">
                            <table width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td style="text-align: center;">
                                        <p style="color: #9ca3af; font-size: 14px; margin: 0 0 10px 0;">
                                            🎹 PianoLink - Clases de piano online personalizadas
                                        </p>
                                        <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                                            Este email fue enviado a ${clientEmail}
                                        </p>
                                    </td>
                                </tr>
                            </table>
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

module.exports = { generateWelcomeKitEmail };
