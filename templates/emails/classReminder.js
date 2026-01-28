/* templates/emails/classReminder.js - Ejemplo de Email con Template Base */

const generateBaseEmail = require('./_baseTemplate');

/**
 * Email de recordatorio de clase (EJEMPLO para futura implementación)
 * 
 * Este es un ejemplo de cómo usar el template base para crear
 * nuevos emails fácilmente.
 * 
 * PARA IMPLEMENTAR:
 * 1. Agregar listener en listeners/emailListeners.js
 * 2. Emitir evento 'class.scheduled' desde el controlador de clases
 * 
 * @param {Object} data - Datos para el template
 * @param {string} data.studentName - Nombre del estudiante
 * @param {string} data.studentEmail - Email del estudiante
 * @param {string} data.teacherName - Nombre del profesor
 * @param {string} data.classDate - Fecha de la clase (formato: "Lunes 15 de Enero")
 * @param {string} data.classTime - Hora de la clase (formato: "18:00")
 * @param {string} data.classUrl - URL de la sala de clase
 * @returns {string} - HTML del email
 */

module.exports = function generateClassReminderEmail(data) {
    const {
        studentName,
        studentEmail,
        teacherName,
        classDate,
        classTime,
        classUrl
    } = data;
    
    const firstName = studentName.split(' ')[0];
    
    // Contenido específico del email
    const content = `
        <h2 style="margin: 0 0 20px 0; color: #1a1a1a; font-size: 28px; font-weight: 600;">
            📅 Recordatorio de Clase
        </h2>
        
        <p style="margin: 0 0 16px 0; color: #333333; font-size: 16px; line-height: 1.6;">
            Hola <strong>${firstName}</strong>,
        </p>
        
        <p style="margin: 0 0 16px 0; color: #333333; font-size: 16px; line-height: 1.6;">
            Te recordamos que tienes una clase de piano programada con <strong>${teacherName}</strong>.
        </p>
        
        <!-- Detalles de la clase -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin: 0 0 20px 0;">
            <tr>
                <td style="padding: 20px; background-color: #f8f9fa; border-radius: 8px; border-left: 4px solid #ff764d;">
                    <p style="margin: 0 0 12px 0; color: #ff764d; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                        📋 Detalles de la Clase
                    </p>
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                        <tr>
                            <td style="padding: 4px 0; color: #666666; font-size: 14px;">
                                <strong>Profesor:</strong>
                            </td>
                            <td style="padding: 4px 0; color: #333333; font-size: 14px;">
                                ${teacherName}
                            </td>
                        </tr>
                        <tr>
                            <td style="padding: 4px 0; color: #666666; font-size: 14px;">
                                <strong>Fecha:</strong>
                            </td>
                            <td style="padding: 4px 0; color: #333333; font-size: 14px;">
                                ${classDate}
                            </td>
                        </tr>
                        <tr>
                            <td style="padding: 4px 0; color: #666666; font-size: 14px;">
                                <strong>Hora:</strong>
                            </td>
                            <td style="padding: 4px 0; color: #333333; font-size: 14px;">
                                ${classTime}
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
        
        <!-- Consejos antes de la clase -->
        <p style="margin: 0 0 12px 0; color: #333333; font-size: 15px; font-weight: 600;">
            ✨ Antes de la clase:
        </p>
        <ul style="margin: 0 0 20px 0; padding-left: 20px; color: #555555; font-size: 14px; line-height: 1.8;">
            <li>Conecta tu piano MIDI al computador</li>
            <li>Asegúrate de tener buena conexión a internet</li>
            <li>Prepara tu material de estudio</li>
            <li>Ingresa 5 minutos antes para verificar audio</li>
        </ul>
        
        <p style="margin: 0; color: #888888; font-size: 13px; line-height: 1.5;">
            💡 Sugerencia: Guarda la URL de la sala en tus favoritos para acceder rápidamente.
        </p>
    `;
    
    // Usar el template base
    return generateBaseEmail({
        title: 'Recordatorio de Clase - PianoLink',
        preheader: `Tu clase con ${teacherName} es el ${classDate} a las ${classTime}`,
        content: content,
        showCTA: true,
        ctaText: '🎹 Ir a la Sala de Clase',
        ctaUrl: classUrl,
        recipientEmail: studentEmail
    });
};
