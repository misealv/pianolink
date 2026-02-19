/**
 * templates/emails/classCancelledByTeacher.js
 * Email enviado al estudiante cuando el profesor cancela una clase.
 * Incluye: motivo, reembolso confirmado, enlace para reagendar.
 */

const generateBaseEmail = require('./_baseTemplate');

/**
 * @param {Object} data
 * @param {string} data.studentName - Nombre del estudiante
 * @param {string} data.studentEmail - Email del estudiante
 * @param {string} data.teacherName - Nombre del profesor
 * @param {string} data.classDate - Fecha de la clase (formato legible)
 * @param {string} data.classTime - Hora de la clase
 * @param {string} data.reason - Motivo de cancelación del profesor
 * @param {string} data.rescheduleUrl - URL para reagendar
 * @returns {string} HTML del email
 */
module.exports = function generateClassCancelledByTeacherEmail(data) {
    const {
        studentName,
        studentEmail,
        teacherName,
        classDate,
        classTime,
        reason,
        rescheduleUrl
    } = data;

    const firstName = studentName.split(' ')[0];
    const reasonText = reason && reason.trim()
        ? reason.replace('[Profesor] ', '')
        : 'Motivo no especificado';

    const content = `
        <h2 style="margin: 0 0 20px 0; color: #1a1a1a; font-size: 28px; font-weight: 600;">
            📅 Clase cancelada
        </h2>
        
        <p style="margin: 0 0 16px 0; color: #333333; font-size: 16px; line-height: 1.6;">
            Hola <strong>${firstName}</strong>,
        </p>
        
        <p style="margin: 0 0 16px 0; color: #333333; font-size: 16px; line-height: 1.6;">
            Tu profesor <strong>${teacherName}</strong> canceló la clase programada. No te preocupes — <strong>tu clase ya fue devuelta</strong> y puedes reagendarla cuando quieras.
        </p>
        
        <!-- Detalles -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin: 0 0 20px 0;">
            <tr>
                <td style="padding: 20px; background-color: #fff3f3; border-radius: 8px; border-left: 4px solid #ef4444;">
                    <p style="margin: 0 0 12px 0; color: #ef4444; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                        Clase cancelada
                    </p>
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                        <tr>
                            <td style="padding: 4px 0; color: #666666; font-size: 14px;"><strong>Profesor:</strong></td>
                            <td style="padding: 4px 0; color: #333333; font-size: 14px;">${teacherName}</td>
                        </tr>
                        <tr>
                            <td style="padding: 4px 0; color: #666666; font-size: 14px;"><strong>Fecha:</strong></td>
                            <td style="padding: 4px 0; color: #333333; font-size: 14px;">${classDate}</td>
                        </tr>
                        <tr>
                            <td style="padding: 4px 0; color: #666666; font-size: 14px;"><strong>Hora:</strong></td>
                            <td style="padding: 4px 0; color: #333333; font-size: 14px;">${classTime}</td>
                        </tr>
                        <tr>
                            <td style="padding: 4px 0; color: #666666; font-size: 14px;"><strong>Motivo:</strong></td>
                            <td style="padding: 4px 0; color: #333333; font-size: 14px;">${reasonText}</td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
        
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin: 0 0 20px 0;">
            <tr>
                <td style="padding: 16px 20px; background-color: #f0fdf4; border-radius: 8px; border-left: 4px solid #22c55e;">
                    <p style="margin: 0; color: #166534; font-size: 14px;">
                        ✅ <strong>Tu clase ha sido devuelta</strong> — puedes reagendar a un nuevo horario disponible.
                    </p>
                </td>
            </tr>
        </table>
        
        <p style="margin: 0; color: #888888; font-size: 13px; line-height: 1.5;">
            Si necesitas ayuda, escríbenos a <a href="mailto:hola@pianolink.net" style="color: #00B8CC;">hola@pianolink.net</a>
        </p>
    `;

    return generateBaseEmail({
        title: 'Clase cancelada - PianoLink',
        preheader: `Tu clase con ${teacherName} del ${classDate} fue cancelada. Tu clase fue devuelta.`,
        content,
        showCTA: !!rescheduleUrl,
        ctaText: '📅 Reagendar mi clase',
        ctaUrl: rescheduleUrl || '#',
        recipientEmail: studentEmail
    });
};
