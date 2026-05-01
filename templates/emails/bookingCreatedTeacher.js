/**
 * templates/emails/bookingCreatedTeacher.js
 * Email enviado al profesor cuando un alumno agenda una clase.
 */

const generateBaseEmail = require('./_baseTemplate');

/**
 * @param {Object} data
 * @param {string} data.teacherName  - Nombre del profesor (destinatario)
 * @param {string} data.studentName  - Nombre del alumno que agendó
 * @param {string} data.classDate    - Fecha legible (ej. "lunes 5 de mayo de 2026")
 * @param {string} data.classTime    - Hora legible (ej. "18:30")
 * @param {string} data.timezone     - Timezone usada para mostrar la hora
 * @param {number} data.duration     - Duración en minutos
 * @param {string} data.dashboardUrl - URL al dashboard del profesor
 * @returns {string} HTML
 */
module.exports = function generateBookingCreatedTeacherEmail(data) {
    const {
        teacherName,
        studentName,
        classDate,
        classTime,
        timezone,
        duration,
        dashboardUrl
    } = data;

    const firstName = (teacherName || '').split(' ')[0] || 'Profesor';

    const content = `
        <h2 style="margin: 0 0 20px 0; color: #1a1a1a; font-size: 26px; font-weight: 600;">
            📅 Nueva clase agendada
        </h2>

        <p style="margin: 0 0 16px 0; color: #333333; font-size: 16px; line-height: 1.6;">
            Hola <strong>${firstName}</strong>,
        </p>

        <p style="margin: 0 0 20px 0; color: #333333; font-size: 16px; line-height: 1.6;">
            <strong>${studentName}</strong> reservó una clase contigo. Aquí tienes los detalles:
        </p>

        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin: 0 0 24px 0;">
            <tr>
                <td style="padding: 20px; background-color: #f0f9ff; border-radius: 8px; border-left: 4px solid #2563eb;">
                    <p style="margin: 0 0 12px 0; color: #2563eb; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                        Detalles de la clase
                    </p>
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                        <tr>
                            <td style="padding: 4px 0; color: #666666; font-size: 14px;"><strong>Alumno:</strong></td>
                            <td style="padding: 4px 0; color: #333333; font-size: 14px;">${studentName}</td>
                        </tr>
                        <tr>
                            <td style="padding: 4px 0; color: #666666; font-size: 14px;"><strong>Fecha:</strong></td>
                            <td style="padding: 4px 0; color: #333333; font-size: 14px;">${classDate}</td>
                        </tr>
                        <tr>
                            <td style="padding: 4px 0; color: #666666; font-size: 14px;"><strong>Hora:</strong></td>
                            <td style="padding: 4px 0; color: #333333; font-size: 14px;">${classTime} (${timezone})</td>
                        </tr>
                        <tr>
                            <td style="padding: 4px 0; color: #666666; font-size: 14px;"><strong>Duración:</strong></td>
                            <td style="padding: 4px 0; color: #333333; font-size: 14px;">${duration} minutos</td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>

        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin: 0 0 24px 0;">
            <tr>
                <td align="center">
                    <a href="${dashboardUrl}" style="display: inline-block; padding: 14px 32px; background-color: #2563eb; color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 600;">
                        Ver en mi dashboard
                    </a>
                </td>
            </tr>
        </table>

        <p style="margin: 0; color: #888888; font-size: 13px; line-height: 1.5;">
            Recibirás un recordatorio antes de la clase. Si necesitas reprogramar, hazlo desde tu dashboard con la mayor anticipación posible.
        </p>
    `;

    return generateBaseEmail({
        title: 'Nueva clase agendada',
        preheader: `${studentName} agendó una clase el ${classDate} a las ${classTime}`,
        content
    });
};
