/* templates/emails/trialConfirmedTeacher.js - Email notificación clase de prueba al profesor */

const generateBaseEmail = require('./_baseTemplate');

/**
 * Email de notificación de nueva clase de prueba para el PROFESOR
 * 
 * Se envía al profesor cuando un estudiante reserva una clase
 * de prueba gratuita con él/ella.
 * 
 * @param {Object} data - Datos para el template
 * @param {string} data.teacherName - Nombre del profesor
 * @param {string} data.teacherEmail - Email del profesor
 * @param {string} data.studentName - Nombre del estudiante
 * @param {string} data.studentEmail - Email del estudiante (para contacto)
 * @param {string} data.classDate - Fecha formateada (ej: "Lunes 15 de Febrero")
 * @param {string} data.classTime - Hora formateada (ej: "18:00")
 * @param {number} data.duration - Duración en minutos
 * @param {string} data.timezone - Zona horaria del profesor
 * @param {string} data.roomUrl - URL de la sala
 * @param {string} data.bookingId - ID de la reserva
 * @returns {string} - HTML del email
 */

module.exports = function generateTrialConfirmedTeacherEmail(data) {
    const {
        teacherName,
        teacherEmail,
        studentName,
        studentEmail,
        classDate,
        classTime,
        duration = 30,
        timezone = 'tu hora local',
        roomUrl,
        bookingId
    } = data;
    
    const firstName = teacherName ? teacherName.split(' ')[0] : 'Profesor';
    const frontendUrl = process.env.FRONTEND_URL || 'https://pianolink.app';
    
    // Contenido específico del email
    const content = `
        <div style="text-align: center; margin-bottom: 25px;">
            <span style="font-size: 48px;">🎉</span>
        </div>
        
        <h2 style="margin: 0 0 20px 0; color: #1a1a1a; font-size: 26px; font-weight: 700; text-align: center;">
            ¡Nueva Clase de Prueba Reservada!
        </h2>
        
        <p style="margin: 0 0 16px 0; color: #333333; font-size: 16px; line-height: 1.6;">
            Hola <strong>${firstName}</strong>,
        </p>
        
        <p style="margin: 0 0 20px 0; color: #333333; font-size: 16px; line-height: 1.6;">
            ¡Buenas noticias! <strong>${studentName}</strong> ha reservado una clase de prueba contigo.
            Esta es una excelente oportunidad para ganar un nuevo estudiante. 🚀
        </p>
        
        <!-- Card con detalles de la clase -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin: 0 0 25px 0;">
            <tr>
                <td style="padding: 25px; background: linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%); border-radius: 12px; border: 1px solid #a5d6a7;">
                    
                    <p style="margin: 0 0 15px 0; color: #2e7d32; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                        📋 Detalles de la Clase
                    </p>
                    
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                        <tr>
                            <td style="padding: 8px 0; color: #555555; font-size: 14px; width: 110px;">
                                👤 <strong>Estudiante:</strong>
                            </td>
                            <td style="padding: 8px 0; color: #333333; font-size: 14px;">
                                ${studentName}
                            </td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #555555; font-size: 14px;">
                                📧 <strong>Email:</strong>
                            </td>
                            <td style="padding: 8px 0; color: #333333; font-size: 14px;">
                                <a href="mailto:${studentEmail}" style="color: #6366f1; text-decoration: none;">${studentEmail}</a>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #555555; font-size: 14px;">
                                📅 <strong>Fecha:</strong>
                            </td>
                            <td style="padding: 8px 0; color: #333333; font-size: 14px;">
                                ${classDate}
                            </td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #555555; font-size: 14px;">
                                🕐 <strong>Hora:</strong>
                            </td>
                            <td style="padding: 8px 0; color: #333333; font-size: 14px;">
                                ${classTime} (${timezone})
                            </td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #555555; font-size: 14px;">
                                ⏱️ <strong>Duración:</strong>
                            </td>
                            <td style="padding: 8px 0; color: #333333; font-size: 14px;">
                                ${duration} minutos
                            </td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #555555; font-size: 14px;">
                                🏷️ <strong>Tipo:</strong>
                            </td>
                            <td style="padding: 8px 0; color: #ff764d; font-size: 14px; font-weight: 600;">
                                Clase de Prueba (Gratuita)
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
        
        <!-- Tips para la clase de prueba -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin: 0 0 25px 0;">
            <tr>
                <td style="padding: 20px; background-color: #f8f9fa; border-radius: 8px;">
                    <p style="margin: 0 0 12px 0; color: #333333; font-size: 15px; font-weight: 600;">
                        💡 Tips para una clase de prueba exitosa:
                    </p>
                    <ul style="margin: 0; padding-left: 20px; color: #555555; font-size: 14px; line-height: 1.8;">
                        <li>Saluda cálidamente al estudiante al inicio</li>
                        <li>Pregunta sobre su experiencia y objetivos</li>
                        <li>Muestra un adelanto de tu metodología</li>
                        <li>Deja tiempo para preguntas al final</li>
                        <li>Menciona tus paquetes de clases disponibles</li>
                    </ul>
                </td>
            </tr>
        </table>
        
        <!-- Recordatorio -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin: 0 0 20px 0;">
            <tr>
                <td style="padding: 15px 20px; background-color: #e3f2fd; border-radius: 8px; border-left: 4px solid #2196f3;">
                    <p style="margin: 0; color: #1565c0; font-size: 14px; line-height: 1.5;">
                        📌 <strong>Recuerda:</strong> La sala de clase estará disponible desde tu dashboard
                        15 minutos antes de la hora programada.
                    </p>
                </td>
            </tr>
        </table>
        
        <p style="margin: 0; color: #888888; font-size: 13px; line-height: 1.5; text-align: center;">
            Si necesitas cancelar, por favor hazlo con al menos 24h de anticipación.
        </p>
    `;
    
    // Usar template base
    return generateBaseEmail({
        title: '🎉 Nueva Clase de Prueba - PianoLink',
        preheader: `${studentName} ha reservado una clase de prueba contigo para el ${classDate}`,
        content,
        showCTA: true,
        ctaText: '📅 Ver en Mi Dashboard',
        ctaUrl: `${frontendUrl}/dashboard.html`,
        recipientEmail: teacherEmail
    });
};
