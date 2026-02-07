/**
 * services/PayoutNotificationService.js
 * Notificaciones por email relacionadas con pagos a profesores
 */

const emailService = require('./EmailService');
const User = require('../models/User');

class PayoutNotificationService {

    /**
     * Notificar al profesor que su payout mensual está listo
     */
    static async notifyPayoutReady(payout, teacher) {
        if (!teacher) {
            teacher = await User.findById(payout.teacherId);
        }
        if (!teacher?.email) return { success: false, error: 'No teacher email' };

        const amount = (payout.finalPayoutUSD / 100).toFixed(2);
        const period = payout.periodLabel || 'Este período';

        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #1a1a1a; color: #fff; margin: 0; padding: 20px; }
                .container { max-width: 600px; margin: 0 auto; background: #252525; border-radius: 16px; overflow: hidden; }
                .header { background: linear-gradient(135deg, #ff764d 0%, #ff9f7e 100%); padding: 30px; text-align: center; }
                .header h1 { margin: 0; font-size: 24px; }
                .content { padding: 30px; }
                .amount-box { background: #1a1a1a; border-radius: 12px; padding: 20px; text-align: center; margin: 20px 0; border: 1px solid #4ade80; }
                .amount { font-size: 36px; font-weight: 700; color: #4ade80; }
                .label { color: #888; font-size: 14px; margin-top: 5px; }
                .steps { background: #1a1a1a; border-radius: 12px; padding: 20px; margin: 20px 0; }
                .step { display: flex; align-items: flex-start; gap: 15px; margin-bottom: 15px; }
                .step-num { background: #ff764d; color: white; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; flex-shrink: 0; }
                .step-text { color: #ccc; font-size: 14px; line-height: 1.5; }
                .btn { display: inline-block; background: linear-gradient(135deg, #ff764d 0%, #ff9f7e 100%); color: white; padding: 14px 30px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 10px; }
                .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>💰 Tu pago está listo</h1>
                </div>
                <div class="content">
                    <p>Hola <strong>${teacher.name || 'Profesor'}</strong>,</p>
                    <p>Tu pago correspondiente a <strong>${period}</strong> ya está listo para ser procesado.</p>
                    
                    <div class="amount-box">
                        <div class="amount">$${amount} USD</div>
                        <div class="label">${payout.totalClassesPaid || 0} clases completadas</div>
                    </div>

                    <div class="steps">
                        <p style="color: white; font-weight: 600; margin: 0 0 15px;">Próximos pasos:</p>
                        <div class="step">
                            <div class="step-num">1</div>
                            <div class="step-text">Ingresa a tu dashboard y elige tu <strong>método de retiro</strong> (transferencia, PayPal, Wise, etc.)</div>
                        </div>
                        <div class="step">
                            <div class="step-num">2</div>
                            <div class="step-text">Sube tu <strong>documento tributario</strong> (boleta de honorarios, factura o invoice)</div>
                        </div>
                        <div class="step">
                            <div class="step-num">3</div>
                            <div class="step-text">Una vez verificado el documento, procesaremos tu pago en 24-48 horas</div>
                        </div>
                    </div>

                    <p style="text-align: center;">
                        <a href="https://www.pianolink.net/dashboard.html" class="btn">Ver mi pago →</a>
                    </p>
                </div>
                <div class="footer">
                    © ${new Date().getFullYear()} PianoLink - Conectando profesores y estudiantes de piano
                </div>
            </div>
        </body>
        </html>
        `;

        return await emailService.sendSafe({
            to: teacher.email,
            subject: `💰 Tu pago de ${period} está listo - $${amount} USD`,
            html
        });
    }

    /**
     * Notificar al profesor que su documento fue verificado
     */
    static async notifyInvoiceVerified(payout, teacher) {
        if (!teacher) {
            teacher = await User.findById(payout.teacherId);
        }
        if (!teacher?.email) return { success: false, error: 'No teacher email' };

        const amount = ((payout.finalAmountAfterFees || payout.finalPayoutUSD) / 100).toFixed(2);
        const invoiceNum = payout.invoice?.number || 'N/A';

        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #1a1a1a; color: #fff; margin: 0; padding: 20px; }
                .container { max-width: 600px; margin: 0 auto; background: #252525; border-radius: 16px; overflow: hidden; }
                .header { background: linear-gradient(135deg, #22c55e 0%, #4ade80 100%); padding: 30px; text-align: center; }
                .header h1 { margin: 0; font-size: 24px; color: white; }
                .content { padding: 30px; }
                .success-box { background: rgba(34, 197, 94, 0.1); border: 1px solid #22c55e; border-radius: 12px; padding: 20px; text-align: center; margin: 20px 0; }
                .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>✅ Documento Verificado</h1>
                </div>
                <div class="content">
                    <p>Hola <strong>${teacher.name || 'Profesor'}</strong>,</p>
                    <p>Tu documento tributario <strong>#${invoiceNum}</strong> ha sido verificado exitosamente.</p>
                    
                    <div class="success-box">
                        <p style="color: #4ade80; font-size: 18px; margin: 0;">🎉 Tu pago de <strong>$${amount} USD</strong> será procesado en las próximas 24-48 horas.</p>
                    </div>

                    <p style="color: #888;">Te enviaremos otra notificación cuando el pago haya sido enviado.</p>
                </div>
                <div class="footer">
                    © ${new Date().getFullYear()} PianoLink
                </div>
            </div>
        </body>
        </html>
        `;

        return await emailService.sendSafe({
            to: teacher.email,
            subject: `✅ Documento verificado - Tu pago será procesado`,
            html
        });
    }

    /**
     * Notificar al profesor que su documento fue rechazado
     */
    static async notifyInvoiceRejected(payout, teacher, reason) {
        if (!teacher) {
            teacher = await User.findById(payout.teacherId);
        }
        if (!teacher?.email) return { success: false, error: 'No teacher email' };

        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #1a1a1a; color: #fff; margin: 0; padding: 20px; }
                .container { max-width: 600px; margin: 0 auto; background: #252525; border-radius: 16px; overflow: hidden; }
                .header { background: linear-gradient(135deg, #ef4444 0%, #f87171 100%); padding: 30px; text-align: center; }
                .header h1 { margin: 0; font-size: 24px; color: white; }
                .content { padding: 30px; }
                .reason-box { background: rgba(239, 68, 68, 0.1); border: 1px solid #ef4444; border-radius: 12px; padding: 20px; margin: 20px 0; }
                .reason-label { color: #ef4444; font-size: 12px; text-transform: uppercase; margin-bottom: 8px; }
                .reason-text { color: #fff; font-size: 14px; }
                .btn { display: inline-block; background: linear-gradient(135deg, #ff764d 0%, #ff9f7e 100%); color: white; padding: 14px 30px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 10px; }
                .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>❌ Documento Rechazado</h1>
                </div>
                <div class="content">
                    <p>Hola <strong>${teacher.name || 'Profesor'}</strong>,</p>
                    <p>Tu documento tributario no pudo ser verificado. Por favor revisa la razón y envía un nuevo documento.</p>
                    
                    <div class="reason-box">
                        <div class="reason-label">Razón del rechazo:</div>
                        <div class="reason-text">${reason || 'No especificada'}</div>
                    </div>

                    <p>Por favor ingresa a tu dashboard para enviar un documento corregido.</p>

                    <p style="text-align: center;">
                        <a href="https://www.pianolink.net/dashboard.html" class="btn">Ir a mi Dashboard →</a>
                    </p>
                </div>
                <div class="footer">
                    © ${new Date().getFullYear()} PianoLink
                </div>
            </div>
        </body>
        </html>
        `;

        return await emailService.sendSafe({
            to: teacher.email,
            subject: `❌ Documento rechazado - Acción requerida`,
            html
        });
    }

    /**
     * Notificar al profesor que su pago fue enviado
     */
    static async notifyPaymentSent(payout, teacher) {
        if (!teacher) {
            teacher = await User.findById(payout.teacherId);
        }
        if (!teacher?.email) return { success: false, error: 'No teacher email' };

        const amount = ((payout.finalAmountAfterFees || payout.finalPayoutUSD) / 100).toFixed(2);
        const method = payout.withdrawalMethod || 'transferencia';
        const methodLabels = {
            bank_transfer: 'Transferencia Bancaria',
            mercadopago: 'MercadoPago',
            paypal: 'PayPal',
            wise: 'Wise',
            crypto: 'Crypto',
            manual: 'Manual'
        };

        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #1a1a1a; color: #fff; margin: 0; padding: 20px; }
                .container { max-width: 600px; margin: 0 auto; background: #252525; border-radius: 16px; overflow: hidden; }
                .header { background: linear-gradient(135deg, #22c55e 0%, #4ade80 100%); padding: 30px; text-align: center; }
                .header h1 { margin: 0; font-size: 24px; color: white; }
                .content { padding: 30px; }
                .amount-box { background: #1a1a1a; border-radius: 12px; padding: 25px; text-align: center; margin: 20px 0; border: 2px solid #4ade80; }
                .amount { font-size: 42px; font-weight: 700; color: #4ade80; }
                .method { color: #888; font-size: 14px; margin-top: 10px; }
                .confetti { font-size: 48px; text-align: center; margin: 20px 0; }
                .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>💸 ¡Pago Enviado!</h1>
                </div>
                <div class="content">
                    <div class="confetti">🎉</div>
                    
                    <p>Hola <strong>${teacher.name || 'Profesor'}</strong>,</p>
                    <p>¡Excelentes noticias! Tu pago ha sido enviado exitosamente.</p>
                    
                    <div class="amount-box">
                        <div class="amount">$${amount} USD</div>
                        <div class="method">Enviado vía ${methodLabels[method] || method}</div>
                    </div>

                    <p style="color: #888;">El tiempo de llegada depende del método de pago:</p>
                    <ul style="color: #888; font-size: 14px;">
                        <li><strong>Transferencia bancaria:</strong> 1-2 días hábiles</li>
                        <li><strong>MercadoPago:</strong> Instantáneo</li>
                        <li><strong>PayPal:</strong> Instantáneo</li>
                        <li><strong>Wise:</strong> 1-3 días hábiles</li>
                    </ul>

                    <p>¡Gracias por ser parte de PianoLink! 🎹</p>
                </div>
                <div class="footer">
                    © ${new Date().getFullYear()} PianoLink - Conectando profesores y estudiantes de piano
                </div>
            </div>
        </body>
        </html>
        `;

        return await emailService.sendSafe({
            to: teacher.email,
            subject: `💸 ¡Pago enviado! $${amount} USD en camino`,
            html
        });
    }

    /**
     * Notificar al profesor que tiene clases pendientes de validación
     */
    static async notifyPendingClasses(teacher, classCount) {
        if (!teacher?.email) return { success: false, error: 'No teacher email' };

        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #1a1a1a; color: #fff; margin: 0; padding: 20px; }
                .container { max-width: 600px; margin: 0 auto; background: #252525; border-radius: 16px; overflow: hidden; }
                .header { background: linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%); padding: 30px; text-align: center; }
                .header h1 { margin: 0; font-size: 24px; color: white; }
                .content { padding: 30px; }
                .count-box { background: #1a1a1a; border-radius: 12px; padding: 20px; text-align: center; margin: 20px 0; border: 1px solid #f59e0b; }
                .count { font-size: 48px; font-weight: 700; color: #f59e0b; }
                .btn { display: inline-block; background: linear-gradient(135deg, #ff764d 0%, #ff9f7e 100%); color: white; padding: 14px 30px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 10px; }
                .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>⏳ Clases Pendientes</h1>
                </div>
                <div class="content">
                    <p>Hola <strong>${teacher.name || 'Profesor'}</strong>,</p>
                    <p>Tienes clases completadas que aún no has marcado para validación.</p>
                    
                    <div class="count-box">
                        <div class="count">${classCount}</div>
                        <div style="color: #888;">clases pendientes</div>
                    </div>

                    <p>Recuerda marcar tus clases como completadas para que tus estudiantes puedan confirmarlas y puedas recibir tu pago.</p>

                    <p style="text-align: center;">
                        <a href="https://www.pianolink.net/dashboard.html" class="btn">Ver mis clases →</a>
                    </p>
                </div>
                <div class="footer">
                    © ${new Date().getFullYear()} PianoLink
                </div>
            </div>
        </body>
        </html>
        `;

        return await emailService.sendSafe({
            to: teacher.email,
            subject: `⏳ Tienes ${classCount} clases pendientes de marcar`,
            html
        });
    }
}

module.exports = PayoutNotificationService;
