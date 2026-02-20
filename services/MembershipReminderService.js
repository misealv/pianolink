/**
 * services/MembershipReminderService.js
 * Servicio para enviar recordatorios de renovación de membresía a profesores
 * 
 * Envía emails:
 * - 7 días antes de vencer
 * - 3 días antes de vencer
 * - 1 día antes de vencer
 * - El día que vence
 * - 3 días después de vencer (último aviso)
 */

const { Resend } = require('resend');
const User = require('../models/User');

class MembershipReminderService {
    constructor() {
        this.resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
        this.fromEmail = 'PianoLink Team <hola@pianolink.net>';
    }

    isConfigured() {
        return !!this.resend;
    }

    /**
     * Ejecutar verificación de membresías y enviar recordatorios
     * Llamar desde un cron job diario
     */
    async runDailyCheck() {
        if (!this.isConfigured()) {
            console.log('[MembershipReminder] ⚠️ Resend no configurado, saltando...');
            return { sent: 0, errors: [] };
        }

        console.log('[MembershipReminder] 🔄 Iniciando verificación diaria de membresías...');
        
        const results = {
            sent: 0,
            errors: [],
            details: []
        };

        try {
            // Buscar profesores con membresía - CORREGIDO: usar teacherData
            const teachers = await User.find({
                role: 'teacher',
                'teacherData.subscriptionStatus': { $in: ['active', 'expired', 'cancelled', 'past_due'] }
            });

            console.log(`[MembershipReminder] Encontrados ${teachers.length} profesores con membresía`);

            const now = new Date();
            now.setHours(0, 0, 0, 0);

            for (const teacher of teachers) {
                try {
                    const expiresAt = teacher.teacherData?.subscriptionExpiresAt;
                    if (!expiresAt) continue;

                    const expiryDate = new Date(expiresAt);
                    expiryDate.setHours(0, 0, 0, 0);
                    
                    const daysUntilExpiry = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));
                    
                    // Determinar qué recordatorio enviar
                    let reminderType = null;
                    
                    if (daysUntilExpiry === 7) reminderType = '7_days';
                    else if (daysUntilExpiry === 3) reminderType = '3_days';
                    else if (daysUntilExpiry === 1) reminderType = '1_day';
                    else if (daysUntilExpiry === 0) reminderType = 'today';
                    else if (daysUntilExpiry === -3) reminderType = 'expired_3_days';

                    if (reminderType) {
                        // Verificar si ya se envió este recordatorio
                        const lastReminder = teacher.teacherData?.lastReminderSent;
                        const lastReminderType = teacher.teacherData?.lastReminderType;
                        
                        if (lastReminderType === reminderType) {
                            console.log(`[MembershipReminder] Ya se envió ${reminderType} a ${teacher.email}`);
                            continue;
                        }

                        // Enviar recordatorio
                        const sent = await this.sendReminder(teacher, reminderType, daysUntilExpiry);
                        
                        if (sent) {
                            // Actualizar último recordatorio enviado
                            await User.findByIdAndUpdate(teacher._id, {
                                'teacherData.lastReminderSent': new Date(),
                                'teacherData.lastReminderType': reminderType
                            });
                            
                            results.sent++;
                            results.details.push({
                                email: teacher.email,
                                type: reminderType,
                                daysUntilExpiry
                            });
                        }
                    }
                } catch (err) {
                    console.error(`[MembershipReminder] Error procesando ${teacher.email}:`, err.message);
                    results.errors.push({ email: teacher.email, error: err.message });
                }
            }

            console.log(`[MembershipReminder] ✅ Completado: ${results.sent} recordatorios enviados`);
            
        } catch (error) {
            console.error('[MembershipReminder] ❌ Error general:', error);
            results.errors.push({ error: error.message });
        }

        return results;
    }

    /**
     * Enviar recordatorio según el tipo
     */
    async sendReminder(teacher, type, daysUntilExpiry) {
        // Determinar tipo de plan desde teacherData.plan (source of truth)
        const teacherPlan = teacher.teacherData?.plan || 'free';
        const isFounderPlan = teacherPlan === 'founder';
        const planName = isFounderPlan ? 'Founder' : 'Premium';
        const price = isFounderPlan ? 10 : 19;
        const renewUrl = 'https://pianolink.net/dashboard.html';

        let subject, title, message, urgency, ctaText;

        switch (type) {
            case '7_days':
                subject = '⏰ Tu membresía PianoLink vence en 7 días';
                title = 'Tu membresía vence pronto';
                message = `Hola ${teacher.name},<br><br>Te recordamos que tu membresía de profesor vence en <strong>7 días</strong>.<br><br>Renueva ahora para seguir recibiendo estudiantes y enseñando sin interrupciones.`;
                urgency = 'low';
                ctaText = 'Renovar Membresía';
                break;

            case '3_days':
                subject = '⚠️ Tu membresía PianoLink vence en 3 días';
                title = '¡Solo quedan 3 días!';
                message = `Hola ${teacher.name},<br><br>Tu membresía de profesor vence en <strong>3 días</strong>.<br><br>No pierdas acceso a tu sala virtual y a tus estudiantes. Renueva hoy.`;
                urgency = 'medium';
                ctaText = 'Renovar Ahora';
                break;

            case '1_day':
                subject = '🚨 ¡Tu membresía PianoLink vence MAÑANA!';
                title = '¡Último día!';
                message = `Hola ${teacher.name},<br><br><strong>Tu membresía vence mañana.</strong><br><br>Renueva hoy para evitar perder acceso a tu sala virtual.`;
                urgency = 'high';
                ctaText = '¡Renovar YA!';
                break;

            case 'today':
                subject = '❌ Tu membresía PianoLink vence HOY';
                title = 'Tu membresía vence hoy';
                message = `Hola ${teacher.name},<br><br><strong>Tu membresía vence hoy.</strong><br><br>Si no renuevas, perderás acceso a tu sala virtual y no podrás recibir nuevos estudiantes.`;
                urgency = 'critical';
                ctaText = 'Renovar Inmediatamente';
                break;

            case 'expired_3_days':
                subject = '💔 Te extrañamos en PianoLink - Tu membresía expiró';
                title = 'Tu membresía ha expirado';
                message = `Hola ${teacher.name},<br><br>Tu membresía de profesor expiró hace 3 días.<br><br>Tus estudiantes no pueden agendar nuevas clases contigo. Reactiva tu membresía para volver a enseñar.`;
                urgency = 'expired';
                ctaText = 'Reactivar Membresía';
                break;

            default:
                return false;
        }

        // Colores según urgencia
        const colors = {
            low: { bg: '#3b82f6', btn: '#2563eb' },
            medium: { bg: '#f59e0b', btn: '#d97706' },
            high: { bg: '#ef4444', btn: '#dc2626' },
            critical: { bg: '#dc2626', btn: '#b91c1c' },
            expired: { bg: '#6b7280', btn: '#4b5563' }
        };
        const color = colors[urgency] || colors.low;

        const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #0f0f0f; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0f0f0f; padding: 40px 20px;">
        <tr>
            <td align="center">
                <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 500px; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); border-radius: 16px; overflow: hidden;">
                    
                    <!-- Header con urgencia -->
                    <tr>
                        <td style="background: ${color.bg}; padding: 30px; text-align: center;">
                            <div style="font-size: 48px; margin-bottom: 12px;">🎹</div>
                            <h1 style="color: white; margin: 0; font-size: 22px; font-weight: 700;">${title}</h1>
                        </td>
                    </tr>
                    
                    <!-- Contenido -->
                    <tr>
                        <td style="padding: 30px;">
                            <p style="color: #e5e5e5; font-size: 15px; line-height: 1.6; margin: 0 0 20px;">
                                ${message}
                            </p>
                            
                            <!-- Precio -->
                            <div style="background: rgba(255,255,255,0.05); border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 25px;">
                                <div style="color: #888; font-size: 12px; margin-bottom: 5px;">Precio mensual</div>
                                <div style="color: white; font-size: 36px; font-weight: 800;">$${price} USD</div>
                                ${isFounderPlan ? '<div style="color: #fbbf24; font-size: 11px; margin-top: 5px;">⭐ Precio exclusivo fundador</div>' : ''}
                            </div>
                            
                            <!-- CTA -->
                            <a href="${renewUrl}" style="display: block; background: ${color.btn}; color: white; text-decoration: none; padding: 16px 24px; border-radius: 10px; font-weight: 700; font-size: 16px; text-align: center;">
                                🇨🇱 ${ctaText}
                            </a>
                            
                            <p style="color: #666; font-size: 11px; text-align: center; margin-top: 20px;">
                                Plan ${planName} · Pago seguro con MercadoPago o PayPal
                            </p>
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td style="padding: 20px 30px; border-top: 1px solid rgba(255,255,255,0.1);">
                            <p style="color: #666; font-size: 11px; text-align: center; margin: 0;">
                                ¿Tienes preguntas? Responde a este email o escríbenos a soporte@pianolink.net
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;

        try {
            const result = await this.resend.emails.send({
                from: this.fromEmail,
                to: teacher.email,
                subject: subject,
                html: html
            });

            console.log(`[MembershipReminder] ✉️ Enviado ${type} a ${teacher.email}`);
            return true;

        } catch (error) {
            console.error(`[MembershipReminder] ❌ Error enviando a ${teacher.email}:`, error.message);
            return false;
        }
    }

    /**
     * Enviar recordatorio manual a un profesor específico
     */
    async sendManualReminder(teacherId) {
        const teacher = await User.findById(teacherId);
        if (!teacher || teacher.role !== 'teacher') {
            throw new Error('Profesor no encontrado');
        }

        const expiresAt = teacher.teacherData?.subscriptionExpiresAt;
        if (!expiresAt) {
            throw new Error('Profesor no tiene membresía');
        }

        const now = new Date();
        const daysUntilExpiry = Math.ceil((new Date(expiresAt) - now) / (1000 * 60 * 60 * 24));

        let type = 'manual';
        if (daysUntilExpiry <= 0) type = 'expired_3_days';
        else if (daysUntilExpiry <= 1) type = '1_day';
        else if (daysUntilExpiry <= 3) type = '3_days';
        else type = '7_days';

        return await this.sendReminder(teacher, type, daysUntilExpiry);
    }
}

module.exports = new MembershipReminderService();
