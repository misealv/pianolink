/* templates/emails/trialConfirmedStudent.js - Email confirmación clase de prueba al estudiante */

const generateBaseEmail = require('./_baseTemplate');

/**
 * Email de confirmación de clase de prueba para el ESTUDIANTE
 * 
 * Se envía inmediatamente después de que el estudiante reserva
 * una clase de prueba gratuita con un profesor.
 * 
 * @param {Object} data - Datos para el template
 * @param {string} data.studentName - Nombre del estudiante
 * @param {string} data.studentEmail - Email del estudiante
 * @param {string} data.teacherName - Nombre del profesor
 * @param {string} data.teacherPhoto - URL foto del profesor (opcional)
 * @param {string} data.classDate - Fecha formateada (ej: "Lunes 15 de Febrero")
 * @param {string} data.classTime - Hora formateada (ej: "18:00")
 * @param {number} data.duration - Duración en minutos
 * @param {string} data.timezone - Zona horaria del estudiante
 * @param {string} data.roomUrl - URL de la sala (se activa 15 min antes)
 * @param {string} data.bookingId - ID de la reserva
 * @returns {string} - HTML del email
 */

module.exports = function generateTrialConfirmedStudentEmail(data) {
    const {
        studentName,
        studentEmail,
        teacherName,
        teacherPhoto,
        classDate,
        classTime,
        duration = 30,
        timezone = 'tu hora local',
        roomUrl,
        bookingId
    } = data;
    
    const firstName = studentName ? studentName.split(' ')[0] : 'Estudiante';
    const frontendUrl = process.env.FRONTEND_URL || 'https://pianolink.app';
    
    // Contenido específico del email
    const content = `
        <div style="text-align: center; margin-bottom: 25px;">
            <span style="font-size: 48px;">🎹</span>
        </div>
        
        <h2 style="margin: 0 0 20px 0; color: #1a1a1a; font-size: 26px; font-weight: 700; text-align: center;">
            ¡Tu Clase de Prueba Está Confirmada!
        </h2>
        
        <p style="margin: 0 0 16px 0; color: #333333; font-size: 16px; line-height: 1.6;">
            Hola <strong>${firstName}</strong>,
        </p>
        
        <p style="margin: 0 0 20px 0; color: #333333; font-size: 16px; line-height: 1.6;">
            ¡Excelente noticia! Tu clase de prueba <strong style="color: #4ade80;">GRATUITA</strong> con 
            <strong>${teacherName}</strong> ha sido reservada exitosamente.
        </p>
        
        <!-- Card con detalles de la clase -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin: 0 0 25px 0;">
            <tr>
                <td style="padding: 25px; background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%); border-radius: 12px; border: 1px solid #dee2e6;">
                    
                    <!-- Info del profesor -->
                    ${teacherPhoto ? `
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom: 20px;">
                        <tr>
                            <td width="60" style="vertical-align: top;">
                                <img src="${teacherPhoto}" alt="${teacherName}" width="50" height="50" style="border-radius: 10px; object-fit: cover;">
                            </td>
                            <td style="vertical-align: middle; padding-left: 12px;">
                                <p style="margin: 0; color: #333; font-size: 16px; font-weight: 600;">${teacherName}</p>
                                <p style="margin: 4px 0 0 0; color: #888; font-size: 13px;">Tu profesor de piano</p>
                            </td>
                        </tr>
                    </table>
                    ` : ''}
                    
                    <p style="margin: 0 0 15px 0; color: #ff764d; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                        📋 Detalles de tu Clase
                    </p>
                    
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                        <tr>
                            <td style="padding: 8px 0; color: #666666; font-size: 14px; width: 100px;">
                                📅 <strong>Fecha:</strong>
                            </td>
                            <td style="padding: 8px 0; color: #333333; font-size: 14px;">
                                ${classDate}
                            </td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #666666; font-size: 14px;">
                                🕐 <strong>Hora:</strong>
                            </td>
                            <td style="padding: 8px 0; color: #333333; font-size: 14px;">
                                ${classTime} (${timezone})
                            </td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #666666; font-size: 14px;">
                                ⏱️ <strong>Duración:</strong>
                            </td>
                            <td style="padding: 8px 0; color: #333333; font-size: 14px;">
                                ${duration} minutos
                            </td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #666666; font-size: 14px;">
                                💰 <strong>Precio:</strong>
                            </td>
                            <td style="padding: 8px 0; color: #4ade80; font-size: 14px; font-weight: 600;">
                                ¡GRATIS!
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
        
        <!-- Nota importante sobre el acceso -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin: 0 0 25px 0;">
            <tr>
                <td style="padding: 15px 20px; background-color: #fff3cd; border-radius: 8px; border-left: 4px solid #ffc107;">
                    <p style="margin: 0; color: #856404; font-size: 14px; line-height: 1.5;">
                        ⚠️ <strong>Importante:</strong> El botón para entrar a la clase se activará 
                        <strong>15 minutos antes</strong> de la hora programada.
                    </p>
                </td>
            </tr>
        </table>
        
        <!-- Consejos antes de la clase -->
        <p style="margin: 0 0 12px 0; color: #333333; font-size: 15px; font-weight: 600;">
            ✨ Prepárate para tu clase:
        </p>
        <ul style="margin: 0 0 25px 0; padding-left: 20px; color: #555555; font-size: 14px; line-height: 1.8;">
            <li>Conecta tu piano MIDI al computador (si tienes uno)</li>
            <li>Asegúrate de tener buena conexión a internet</li>
            <li>Usa audífonos para mejor calidad de audio</li>
            <li>Ingresa 5 minutos antes para verificar todo</li>
        </ul>
        
        <p style="margin: 0; color: #888888; font-size: 13px; line-height: 1.5; text-align: center;">
            ¿Necesitas cancelar? Puedes hacerlo desde tu panel hasta 24h antes de la clase.
        </p>
    `;
    
    // Usar template base
    return generateBaseEmail({
        title: '🎹 ¡Clase de Prueba Confirmada! - PianoLink',
        preheader: `Tu clase con ${teacherName} está confirmada para el ${classDate} a las ${classTime}`,
        content,
        showCTA: true,
        ctaText: '📅 Ver Mis Clases',
        ctaUrl: `${frontendUrl}/mis-clases.html`,
        recipientEmail: studentEmail
    });
};
