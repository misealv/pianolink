/**
 * jobs/booking-reminders.js
 * Cron job para enviar recordatorios de clases programadas
 * 
 * Ejecutar manualmente: node jobs/booking-reminders.js
 * Cron recomendado: cada 15 minutos (0,15,30,45 * * * *)
 * 
 * Proceso:
 * 1. Busca bookings confirmados con clase en las proximas 24h (sin reminder enviado)
 * 2. Busca bookings confirmados con clase en la proxima 1h (sin reminder enviado)
 * 3. Envia emails de recordatorio a estudiante y profesor
 * 4. Marca los recordatorios como enviados
 */

require('dotenv').config();
const mongoose = require('mongoose');

const Booking = require('../models/Booking');
const User = require('../models/User');
const EmailService = require('../services/EmailService');
const generateBaseEmail = require('../templates/emails/_baseTemplate');

// Configuración
const DRY_RUN = process.argv.includes('--dry-run');

/**
 * Genera el HTML del email de recordatorio
 */
function generateReminderEmail(data, isStudent = true) {
    const {
        recipientName,
        recipientEmail,
        otherPartyName,
        classDate,
        classTime,
        duration,
        timezone,
        roomUrl,
        reminderType // '24h' o '1h'
    } = data;
    
    const firstName = recipientName ? recipientName.split(' ')[0] : 'Usuario';
    const frontendUrl = process.env.FRONTEND_URL || 'https://pianolink.app';
    
    const urgencyText = reminderType === '1h' 
        ? '¡En menos de 1 hora!' 
        : 'En las próximas 24 horas';
    
    const urgencyColor = reminderType === '1h' ? '#ef4444' : '#f59e0b';
    
    const content = `
        <div style="text-align: center; margin-bottom: 25px;">
            <span style="font-size: 48px;">${reminderType === '1h' ? '⏰' : '📅'}</span>
        </div>
        
        <h2 style="margin: 0 0 20px 0; color: #1a1a1a; font-size: 24px; font-weight: 700; text-align: center;">
            ${reminderType === '1h' ? '¡Tu clase comienza pronto!' : 'Recordatorio de Clase'}
        </h2>
        
        <p style="margin: 0 0 16px 0; color: #333333; font-size: 16px; line-height: 1.6;">
            Hola <strong>${firstName}</strong>,
        </p>
        
        <p style="margin: 0 0 20px 0; color: #333333; font-size: 16px; line-height: 1.6;">
            ${isStudent 
                ? `Tu clase con <strong>${otherPartyName}</strong> está programada para:` 
                : `Tu clase con el estudiante <strong>${otherPartyName}</strong> está programada para:`}
        </p>
        
        <!-- Card con detalles -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin: 0 0 25px 0;">
            <tr>
                <td style="padding: 25px; background-color: #f8f9fa; border-radius: 12px; border-left: 4px solid ${urgencyColor};">
                    
                    <p style="margin: 0 0 15px 0; color: ${urgencyColor}; font-size: 14px; font-weight: 700; text-transform: uppercase;">
                        ${urgencyText}
                    </p>
                    
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                        <tr>
                            <td style="padding: 8px 0; color: #555; font-size: 14px;">
                                📅 <strong>Fecha:</strong>
                            </td>
                            <td style="padding: 8px 0; color: #333; font-size: 14px;">
                                ${classDate}
                            </td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #555; font-size: 14px;">
                                🕐 <strong>Hora:</strong>
                            </td>
                            <td style="padding: 8px 0; color: #333; font-size: 14px;">
                                ${classTime} (${timezone})
                            </td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #555; font-size: 14px;">
                                ⏱️ <strong>Duración:</strong>
                            </td>
                            <td style="padding: 8px 0; color: #333; font-size: 14px;">
                                ${duration} minutos
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
        
        ${reminderType === '1h' ? `
        <!-- Recordatorio urgente -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin: 0 0 20px 0;">
            <tr>
                <td style="padding: 15px 20px; background-color: #fef3c7; border-radius: 8px; text-align: center;">
                    <p style="margin: 0; color: #92400e; font-size: 14px;">
                        ⚡ <strong>Prepárate:</strong> La sala estará disponible en unos minutos
                    </p>
                </td>
            </tr>
        </table>
        ` : `
        <!-- Tips para prepararse -->
        <p style="margin: 0 0 12px 0; color: #333; font-size: 14px; font-weight: 600;">
            ✨ Antes de la clase:
        </p>
        <ul style="margin: 0 0 20px 0; padding-left: 20px; color: #555; font-size: 13px; line-height: 1.8;">
            ${isStudent ? `
            <li>Conecta tu piano MIDI al computador</li>
            <li>Verifica tu conexión a internet</li>
            <li>Usa audífonos para mejor calidad</li>
            ` : `
            <li>Prepara el material de la clase</li>
            <li>Verifica tu conexión a internet</li>
            <li>Ingresa 5 minutos antes</li>
            `}
        </ul>
        `}
    `;
    
    return generateBaseEmail({
        title: reminderType === '1h' 
            ? '⏰ ¡Tu clase comienza pronto! - PianoLink'
            : '📅 Recordatorio de Clase - PianoLink',
        preheader: `Tu clase ${isStudent ? 'con ' + otherPartyName : ''} es ${reminderType === '1h' ? 'en menos de 1 hora' : 'mañana'}`,
        content,
        showCTA: true,
        ctaText: isStudent ? '📅 Ver Mis Clases' : '📅 Ver Mi Dashboard',
        ctaUrl: isStudent ? `${frontendUrl}/mis-clases.html` : `${frontendUrl}/dashboard.html`,
        recipientEmail
    });
}

/**
 * Formatea fecha para email
 */
function formatDateForEmail(date, timezone = 'America/Santiago') {
    const d = new Date(date);
    
    const dateStr = d.toLocaleDateString('es-ES', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        timeZone: timezone
    });
    
    const timeStr = d.toLocaleTimeString('es-ES', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: timezone
    });
    
    return { dateStr, timeStr };
}

/**
 * Envía recordatorio a un booking
 */
async function sendReminder(booking, reminderType) {
    try {
        // Obtener datos completos
        const student = await User.findById(booking.studentId).select('name email timezone');
        const teacher = await User.findById(booking.teacherId).select('name email timezone');
        
        if (!student || !teacher) {
            console.log(`   ⚠️ Usuario no encontrado para booking ${booking._id}`);
            return false;
        }
        
        // Formatear fechas para cada zona horaria
        const studentTz = student.timezone || booking.studentTimezone || 'America/Santiago';
        const teacherTz = teacher.timezone || booking.teacherTimezone || 'America/Santiago';
        
        const studentDate = formatDateForEmail(booking.scheduledStart, studentTz);
        const teacherDate = formatDateForEmail(booking.scheduledStart, teacherTz);
        
        // Email al estudiante
        const studentHtml = generateReminderEmail({
            recipientName: student.name,
            recipientEmail: student.email,
            otherPartyName: teacher.name,
            classDate: studentDate.dateStr,
            classTime: studentDate.timeStr,
            duration: booking.duration || 30,
            timezone: studentTz.split('/').pop().replace('_', ' '),
            reminderType
        }, true);
        
        await EmailService.sendSafe({
            to: student.email,
            subject: reminderType === '1h' 
                ? `⏰ ¡Tu clase con ${teacher.name} comienza pronto!`
                : `📅 Recordatorio: Clase con ${teacher.name} mañana`,
            html: studentHtml
        });
        
        // Email al profesor
        const teacherHtml = generateReminderEmail({
            recipientName: teacher.name,
            recipientEmail: teacher.email,
            otherPartyName: student.name,
            classDate: teacherDate.dateStr,
            classTime: teacherDate.timeStr,
            duration: booking.duration || 30,
            timezone: teacherTz.split('/').pop().replace('_', ' '),
            reminderType
        }, false);
        
        await EmailService.sendSafe({
            to: teacher.email,
            subject: reminderType === '1h' 
                ? `⏰ Clase con ${student.name} en menos de 1 hora`
                : `📅 Recordatorio: Clase mañana con ${student.name}`,
            html: teacherHtml
        });
        
        return true;
        
    } catch (error) {
        console.error(`   ❌ Error enviando reminder:`, error.message);
        return false;
    }
}

/**
 * Proceso principal
 */
async function runBookingReminders() {
    console.log('='.repeat(60));
    console.log('📧 JOB DE RECORDATORIOS DE CLASES');
    console.log('='.repeat(60));
    console.log(`Modo: ${DRY_RUN ? '🔍 DRY RUN (sin envíos)' : '🚀 PRODUCCIÓN'}`);
    console.log(`Fecha: ${new Date().toISOString()}`);
    console.log('');

    try {
        // Conectar a MongoDB
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Conectado a MongoDB');
        console.log('');

        const now = new Date();
        let sent24h = 0;
        let sent1h = 0;
        let errors = 0;

        // ========== RECORDATORIOS 24H ==========
        console.log('📨 Buscando clases en las próximas 24 horas...');
        
        const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        const windowStart24 = new Date(in24h.getTime() - 15 * 60 * 1000); // -15 min
        const windowEnd24 = new Date(in24h.getTime() + 15 * 60 * 1000);   // +15 min
        
        const bookings24h = await Booking.find({
            status: 'confirmed',
            scheduledStart: {
                $gte: windowStart24,
                $lte: windowEnd24
            },
            'reminders.sent24h': { $ne: true }
        });
        
        console.log(`   Encontradas: ${bookings24h.length} clases`);
        
        for (const booking of bookings24h) {
            console.log(`   → Booking ${booking._id}...`);
            
            if (!DRY_RUN) {
                const success = await sendReminder(booking, '24h');
                
                if (success) {
                    // Marcar como enviado
                    await Booking.findByIdAndUpdate(booking._id, {
                        $set: { 'reminders.sent24h': true, 'reminders.sent24hAt': new Date() }
                    });
                    sent24h++;
                    console.log(`     ✅ Enviado`);
                } else {
                    errors++;
                    console.log(`     ❌ Error`);
                }
            } else {
                console.log(`     🔍 [DRY RUN] Se enviaría recordatorio 24h`);
                sent24h++;
            }
        }
        
        console.log('');
        
        // ========== RECORDATORIOS 1H ==========
        console.log('📨 Buscando clases en la próxima hora...');
        
        const in1h = new Date(now.getTime() + 60 * 60 * 1000);
        const windowStart1 = new Date(in1h.getTime() - 10 * 60 * 1000); // -10 min
        const windowEnd1 = new Date(in1h.getTime() + 10 * 60 * 1000);   // +10 min
        
        const bookings1h = await Booking.find({
            status: 'confirmed',
            scheduledStart: {
                $gte: windowStart1,
                $lte: windowEnd1
            },
            'reminders.sent1h': { $ne: true }
        });
        
        console.log(`   Encontradas: ${bookings1h.length} clases`);
        
        for (const booking of bookings1h) {
            console.log(`   → Booking ${booking._id}...`);
            
            if (!DRY_RUN) {
                const success = await sendReminder(booking, '1h');
                
                if (success) {
                    // Marcar como enviado
                    await Booking.findByIdAndUpdate(booking._id, {
                        $set: { 'reminders.sent1h': true, 'reminders.sent1hAt': new Date() }
                    });
                    sent1h++;
                    console.log(`     ✅ Enviado`);
                } else {
                    errors++;
                    console.log(`     ❌ Error`);
                }
            } else {
                console.log(`     🔍 [DRY RUN] Se enviaría recordatorio 1h`);
                sent1h++;
            }
        }
        
        // ========== RESUMEN ==========
        console.log('');
        console.log('='.repeat(60));
        console.log('📊 RESUMEN');
        console.log('='.repeat(60));
        console.log(`   Recordatorios 24h enviados: ${sent24h}`);
        console.log(`   Recordatorios 1h enviados:  ${sent1h}`);
        console.log(`   Errores:                    ${errors}`);
        console.log('='.repeat(60));
        
        await mongoose.disconnect();
        console.log('✅ Desconectado de MongoDB');
        
        return { success: true, sent24h, sent1h, errors };
        
    } catch (error) {
        console.error('❌ Error fatal:', error);
        await mongoose.disconnect();
        return { success: false, error: error.message };
    }
}

// Ejecutar si se llama directamente
if (require.main === module) {
    runBookingReminders()
        .then(result => {
            console.log('');
            console.log('Resultado:', JSON.stringify(result, null, 2));
            process.exit(result.success ? 0 : 1);
        })
        .catch(err => {
            console.error('Error no manejado:', err);
            process.exit(1);
        });
}

module.exports = runBookingReminders;
