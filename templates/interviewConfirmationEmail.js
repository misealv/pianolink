/**
 * templates/interviewConfirmationEmail.js
 * Template de email para confirmar la entrevista de bienvenida agendada.
 */

function generateInterviewConfirmationEmail(data) {
    const {
        clientName,
        clientEmail,
        interviewDate,      // Fecha formateada en timezone del cliente (ej: "Lunes 10 de Febrero, 2026")
        interviewTime,      // Hora formateada (ej: "10:00 AM")
        interviewTimezone,  // Timezone display (ej: "Chile (GMT-3)")
        meetingLink,
        staffName,
        whatsappNumber,
        adminName,           // Nombre dinámico del administrador
        adminEmail           // Email dinámico del administrador
    } = data;

    // Nombre del staff que conduce la entrevista (prioriza staffName del slot, luego adminName)
    const displayStaffName = staffName || adminName || 'Equipo PianoLink';

    const whatsappUrl = whatsappNumber
        ? `https://wa.me/${whatsappNumber.replace(/[^0-9]/g, '')}`
        : 'https://wa.me/56959089770';

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0; padding:0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; background:#0d0d1a; color:#e0e0e0;">
    <div style="max-width:600px; margin:0 auto; background:linear-gradient(135deg, #1a1a2e, #16213e); border-radius:16px; overflow:hidden; border:1px solid #d4af3740;">
        
        <!-- Header -->
        <div style="background:linear-gradient(135deg, #d4af37, #b8941f); padding:30px 32px; text-align:center;">
            <h1 style="margin:0; color:#1a1a2e; font-size:24px; font-weight:700;">
                📅 ¡Entrevista Confirmada!
            </h1>
            <p style="margin:8px 0 0; color:#1a1a2e; opacity:0.8; font-size:14px;">
                Tu entrevista de bienvenida está agendada
            </p>
        </div>

        <!-- Contenido -->
        <div style="padding:32px;">
            
            <!-- Saludo -->
            <p style="font-size:16px; color:#e0e0e0; margin:0 0 20px;">
                ¡Hola <strong>${clientName}</strong>! 👋
            </p>
            <p style="color:#aaa; font-size:14px; margin:0 0 24px; line-height:1.6;">
                Tu entrevista de bienvenida ha sido agendada exitosamente. En esta reunión evaluaremos tu equipo musical y te daremos recomendaciones personalizadas.
            </p>

            <!-- Card de la cita -->
            <div style="background:#0d0d1a; border:1px solid #d4af3740; border-radius:12px; padding:24px; margin-bottom:24px;">
                <div style="text-align:center; margin-bottom:16px;">
                    <div style="font-size:48px; margin-bottom:8px;">🎹</div>
                    <h2 style="color:#d4af37; margin:0; font-size:20px;">Entrevista de Bienvenida</h2>
                </div>
                
                <div style="display:block; margin-bottom:12px; padding:12px; background:rgba(212,175,55,0.1); border-radius:8px;">
                    <div style="color:#888; font-size:12px; text-transform:uppercase; margin-bottom:4px;">📅 Fecha</div>
                    <div style="color:#fff; font-size:16px; font-weight:600;">${interviewDate}</div>
                </div>
                
                <div style="display:block; margin-bottom:12px; padding:12px; background:rgba(212,175,55,0.1); border-radius:8px;">
                    <div style="color:#888; font-size:12px; text-transform:uppercase; margin-bottom:4px;">🕐 Hora</div>
                    <div style="color:#fff; font-size:16px; font-weight:600;">${interviewTime} (${interviewTimezone})</div>
                </div>

                <div style="display:block; margin-bottom:12px; padding:12px; background:rgba(212,175,55,0.1); border-radius:8px;">
                    <div style="color:#888; font-size:12px; text-transform:uppercase; margin-bottom:4px;">⏱️ Duración</div>
                    <div style="color:#fff; font-size:16px; font-weight:600;">15 minutos</div>
                </div>

                <div style="display:block; padding:12px; background:rgba(212,175,55,0.1); border-radius:8px;">
                    <div style="color:#888; font-size:12px; text-transform:uppercase; margin-bottom:4px;">👤 Con</div>
                    <div style="color:#fff; font-size:16px; font-weight:600;">${displayStaffName}</div>
                </div>
            </div>

            ${meetingLink ? `
            <!-- Botón de reunión -->
            <div style="text-align:center; margin-bottom:24px;">
                <a href="${meetingLink}" target="_blank" style="display:inline-block; background:linear-gradient(135deg, #4285f4, #3367d6); color:white; padding:14px 32px; border-radius:8px; text-decoration:none; font-weight:600; font-size:15px;">
                    🎥 Unirse a la Reunión
                </a>
                <p style="color:#888; font-size:12px; margin:8px 0 0;">
                    Haz clic en el botón el día de tu entrevista
                </p>
            </div>
            ` : ''}

            <!-- Qué preparar -->
            <div style="background:#0d0d1a; border-radius:12px; padding:20px; margin-bottom:24px; border-left:3px solid #d4af37;">
                <h3 style="color:#d4af37; margin:0 0 12px; font-size:15px;">📋 ¿Qué preparar?</h3>
                <ul style="color:#aaa; font-size:14px; margin:0; padding-left:20px; line-height:1.8;">
                    <li>Ten tu teclado/piano a la mano</li>
                    <li>Si ya tienes cable MIDI, tenlo conectado</li>
                    <li>Usa un computador (no celular)</li>
                    <li>Ten acceso a internet estable</li>
                </ul>
            </div>

            <!-- WhatsApp -->
            <div style="text-align:center; padding-top:16px; border-top:1px solid #333;">
                <p style="color:#888; font-size:13px; margin:0 0 12px;">
                    ¿Necesitas reagendar? Contáctanos:
                </p>
                <a href="${whatsappUrl}" style="display:inline-block; background:#25D366; color:white; padding:10px 24px; border-radius:8px; text-decoration:none; font-weight:600; font-size:14px;">
                    💬 WhatsApp
                </a>
            </div>
        </div>

        <!-- Footer -->
        <div style="background:#0d0d1a; padding:20px 32px; text-align:center; border-top:1px solid #333;">
            <p style="color:#888; font-size:13px; margin:0 0 4px;">
                ${displayStaffName} — PianoLink 🎹
            </p>
            <p style="color:#666; font-size:12px; margin:0;">
                Clases de piano en tiempo real
            </p>
        </div>
    </div>
</body>
</html>
    `.trim();
}

module.exports = { generateInterviewConfirmationEmail };
