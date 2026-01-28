/* listeners/emailListeners.js - Listeners para Eventos de Email */

const eventService = require('../services/EventService');
const emailService = require('../services/EmailService');
const generateWelcomeTeacherEmail = require('../templates/emails/welcomeTeacher');

/**
 * ARCHITECTURE PATTERN: Event-Driven Email Notifications
 * 
 * Este módulo registra todos los listeners relacionados con el envío de emails.
 * Cada listener es independiente y puede fallar sin afectar otros procesos.
 * 
 * VENTAJAS:
 * - El controlador no tiene que conocer la lógica de emails
 * - Fácil agregar nuevos listeners (ej. notificar a admin)
 * - Los errores de email no bloquean el registro del profesor
 * - Escalable: podemos agregar más acciones sin modificar el controlador
 * 
 * EVENTOS ESCUCHADOS:
 * - teacher.created: Envía email de bienvenida al nuevo profesor
 * 
 * FUTUROS EVENTOS (Expandible):
 * - teacher.updated: Confirmación de cambios de perfil
 * - teacher.deleted: Email de despedida
 * - class.scheduled: Recordatorio de clase
 * - payment.received: Recibo de pago
 * - student.enrolled: Notificación de nueva inscripción
 */

/**
 * Listener: Envía email de bienvenida cuando se crea un nuevo profesor
 * 
 * @param {Object} data - Datos del evento
 * @param {Object} data.teacher - Objeto con los datos del profesor
 * @param {string} data.teacher._id - ID del profesor
 * @param {string} data.teacher.name - Nombre completo
 * @param {string} data.teacher.email - Email
 * @param {string} data.teacher.slug - URL personalizada
 */
async function onTeacherCreated(data) {
    const { teacher } = data;
    
    console.log(`[EMAIL LISTENER] 👂 Nuevo profesor creado: ${teacher.name} (${teacher.email})`);
    
    // Generar el HTML del email
    const emailHtml = generateWelcomeTeacherEmail({
        teacherName: teacher.name,
        teacherEmail: teacher.email,
        dashboardUrl: process.env.FRONTEND_URL 
            ? `${process.env.FRONTEND_URL}/dashboard.html` 
            : 'https://pianolink.com/dashboard.html'
    });
    
    // Enviar el email (usando sendSafe para que no bloquee si falla)
    const sent = await emailService.sendSafe({
        to: teacher.email,
        subject: '¡Bienvenido a PianoLink! 🎹 Tu cuenta está lista',
        html: emailHtml
    });
    
    if (sent) {
        console.log(`[EMAIL LISTENER] ✅ Email de bienvenida enviado a ${teacher.email}`);
    } else {
        console.log(`[EMAIL LISTENER] ⚠️  No se pudo enviar email a ${teacher.email} (no crítico)`);
    }
}

/**
 * Listener: Notifica al admin cuando se crea un nuevo profesor (ejemplo futuro)
 * 
 * Este es un ejemplo de cómo puedes agregar múltiples listeners al mismo evento
 * sin modificar el controlador ni otros listeners.
 */
async function notifyAdminOnTeacherCreated(data) {
    const { teacher } = data;
    
    // Solo en producción
    if (process.env.NODE_ENV !== 'production') {
        return;
    }
    
    const adminEmail = process.env.ADMIN_EMAIL;
    if (!adminEmail) {
        return; // No hay admin configurado
    }
    
    console.log(`[EMAIL LISTENER] 📢 Notificando a admin sobre nuevo profesor: ${teacher.name}`);
    
    const emailHtml = `
        <h2>Nuevo Profesor Registrado</h2>
        <ul>
            <li><strong>Nombre:</strong> ${teacher.name}</li>
            <li><strong>Email:</strong> ${teacher.email}</li>
            <li><strong>Slug:</strong> ${teacher.slug || 'No asignado'}</li>
            <li><strong>Fecha:</strong> ${new Date().toLocaleString('es-ES')}</li>
        </ul>
    `;
    
    await emailService.sendSafe({
        to: adminEmail,
        subject: `[PianoLink] Nuevo profesor: ${teacher.name}`,
        html: emailHtml
    });
}

/**
 * Registra todos los listeners de email
 * Debe ser llamado al iniciar la aplicación (en server.js)
 */
function registerEmailListeners() {
    // Listener principal: Email de bienvenida
    eventService.registerListener(
        'teacher.created',
        onTeacherCreated,
        'sendWelcomeEmail'
    );
    
    // Listener secundario: Notificar a admin (descomentado si lo necesitas)
    // eventService.registerListener(
    //     'teacher.created',
    //     notifyAdminOnTeacherCreated,
    //     'notifyAdminNewTeacher'
    // );
    
    console.log('[EMAIL LISTENERS] 📬 Listeners de email registrados correctamente');
}

// ============================================================================
// EJEMPLOS DE LISTENERS FUTUROS (para cuando necesites expandir)
// ============================================================================

/**
 * Ejemplo: Enviar recordatorio de clase
 * Escucharía el evento: 'class.scheduled'
 */
async function onClassScheduled(data) {
    const { classData, teacher, student } = data;
    
    // Email al profesor
    await emailService.sendSafe({
        to: teacher.email,
        subject: `Clase confirmada: ${classData.date}`,
        html: `<p>Tu clase con ${student.name} está confirmada para el ${classData.date}</p>`
    });
    
    // Email al estudiante
    await emailService.sendSafe({
        to: student.email,
        subject: `Tu clase de piano con ${teacher.name}`,
        html: `<p>Tu clase está confirmada para el ${classData.date}</p>`
    });
}

/**
 * Ejemplo: Enviar recibo de pago
 * Escucharía el evento: 'payment.received'
 */
async function onPaymentReceived(data) {
    const { payment, user } = data;
    
    await emailService.sendSafe({
        to: user.email,
        subject: 'Recibo de pago - PianoLink',
        html: `<p>Hemos recibido tu pago de $${payment.amount}. Gracias!</p>`
    });
}

// ============================================================================

module.exports = {
    registerEmailListeners,
    // Exportamos las funciones individuales por si las necesitas en tests
    onTeacherCreated,
    notifyAdminOnTeacherCreated,
    // Futuros listeners (descomenta cuando los implementes):
    // onClassScheduled,
    // onPaymentReceived,
};
