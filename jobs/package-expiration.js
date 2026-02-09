/**
 * jobs/package-expiration.js
 * Cron job para enviar avisos de expiración de paquetes de clases
 * 
 * Ejecutar manualmente: node jobs/package-expiration.js
 * Cron recomendado: una vez al día a las 9:00 AM (0 9 * * *)
 * 
 * Proceso:
 * 1. Busca enrollments con clases sin usar que expiran en 7, 3, 1, 0 días
 * 2. Envía emails de aviso a estudiante y profesor
 * 3. Cuando expiran (día 0), las clases restantes se pierden
 * 4. Marca los avisos como enviados para evitar duplicados
 */

require('dotenv').config();
const mongoose = require('mongoose');

const StudentEnrollment = require('../models/StudentEnrollment');
const User = require('../models/User');
const EmailService = require('../services/EmailService');
const generateBaseEmail = require('../templates/emails/_baseTemplate');

// Configuración
const DRY_RUN = process.argv.includes('--dry-run');

/**
 * Calcula los días restantes hasta la expiración
 */
function getDaysUntilExpiration(expiresAt) {
    if (!expiresAt) return null;
    const now = new Date();
    const expiry = new Date(expiresAt);
    const diffTime = expiry.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
}

/**
 * Genera el HTML del email de aviso de expiración para el ESTUDIANTE
 */
function generateStudentExpirationEmail(data) {
    const {
        studentName,
        teacherName,
        classesRemaining,
        daysRemaining,
        expiresAt,
        teacherSlug,
        isExpired
    } = data;
    
    const firstName = studentName ? studentName.split(' ')[0] : 'Estudiante';
    const frontendUrl = process.env.FRONTEND_URL || 'https://pianolink.net';
    const bookingUrl = `${frontendUrl}/profesor/${teacherSlug}`;
    
    let emoji, title, urgencyColor, message;
    
    if (isExpired) {
        emoji = '⚠️';
        title = 'Tus clases han expirado';
        urgencyColor = '#ef4444';
        message = `Lamentablemente, tus <strong>${classesRemaining} clases</strong> con ${teacherName} han expirado y ya no están disponibles.`;
    } else if (daysRemaining <= 1) {
        emoji = '🚨';
        title = '¡Último día para usar tus clases!';
        urgencyColor = '#ef4444';
        message = `¡Atención! Tienes <strong>${classesRemaining} clases</strong> que expiran <strong>mañana</strong>. Agenda ahora para no perderlas.`;
    } else if (daysRemaining <= 3) {
        emoji = '⏰';
        title = '¡Tus clases expiran en 3 días!';
        urgencyColor = '#f59e0b';
        message = `Tienes <strong>${classesRemaining} clases</strong> que expiran en <strong>${daysRemaining} días</strong>. ¡No las pierdas!`;
    } else {
        emoji = '📅';
        title = 'Recordatorio: Clases por vencer';
        urgencyColor = '#3b82f6';
        message = `Tienes <strong>${classesRemaining} clases</strong> con ${teacherName} que expiran en <strong>${daysRemaining} días</strong>.`;
    }
    
    const expiryDate = new Date(expiresAt).toLocaleDateString('es-CL', { 
        weekday: 'long', 
        day: 'numeric', 
        month: 'long' 
    });
    
    const content = `
        <div style="text-align: center; margin-bottom: 25px;">
            <span style="font-size: 48px;">${emoji}</span>
        </div>
        
        <h2 style="margin: 0 0 20px 0; color: #1a1a1a; font-size: 24px; font-weight: 700; text-align: center;">
            ${title}
        </h2>
        
        <p style="margin: 0 0 16px 0; color: #333333; font-size: 16px; line-height: 1.6;">
            Hola <strong>${firstName}</strong>,
        </p>
        
        <p style="margin: 0 0 20px 0; color: #333333; font-size: 16px; line-height: 1.6;">
            ${message}
        </p>
        
        <!-- Card con detalles -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin: 0 0 25px 0;">
            <tr>
                <td style="padding: 25px; background-color: #f8f9fa; border-radius: 12px; border-left: 4px solid ${urgencyColor};">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                        <tr>
                            <td style="padding: 8px 0;">
                                <span style="color: #666; font-size: 14px;">Profesor:</span><br>
                                <strong style="color: #1a1a1a; font-size: 16px;">${teacherName}</strong>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0;">
                                <span style="color: #666; font-size: 14px;">Clases disponibles:</span><br>
                                <strong style="color: ${urgencyColor}; font-size: 24px;">${classesRemaining}</strong>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0;">
                                <span style="color: #666; font-size: 14px;">${isExpired ? 'Expiraron el:' : 'Expiran el:'}</span><br>
                                <strong style="color: #1a1a1a; font-size: 16px;">${expiryDate}</strong>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
        
        ${!isExpired ? `
        <!-- CTA -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin: 0 0 25px 0;">
            <tr>
                <td align="center">
                    <a href="${bookingUrl}" 
                       style="display: inline-block; padding: 16px 40px; background: linear-gradient(135deg, #ff764d 0%, #ff5722 100%); color: #ffffff; text-decoration: none; font-weight: 700; font-size: 16px; border-radius: 8px; box-shadow: 0 4px 15px rgba(255,118,77,0.3);">
                        📅 Agendar Clase Ahora
                    </a>
                </td>
            </tr>
        </table>
        ` : `
        <!-- CTA para comprar más -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin: 0 0 25px 0;">
            <tr>
                <td align="center">
                    <a href="${bookingUrl}" 
                       style="display: inline-block; padding: 16px 40px; background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); color: #ffffff; text-decoration: none; font-weight: 700; font-size: 16px; border-radius: 8px;">
                        🎹 Comprar Nuevo Paquete
                    </a>
                </td>
            </tr>
        </table>
        `}
        
        <p style="margin: 0; color: #666; font-size: 14px; text-align: center;">
            ${isExpired 
                ? 'Para continuar tus clases, compra un nuevo paquete.' 
                : '¡No dejes pasar la oportunidad de seguir aprendiendo!'}
        </p>
    `;
    
    return generateBaseEmail({
        title: title,
        preheader: isExpired 
            ? `Tus ${classesRemaining} clases han expirado` 
            : `Tienes ${classesRemaining} clases que expiran en ${daysRemaining} días`,
        content: content,
        footerText: 'Recibiste este email porque tienes clases sin usar en PianoLink.'
    });
}

/**
 * Genera el HTML del email de aviso para el PROFESOR
 */
function generateTeacherExpirationEmail(data) {
    const {
        teacherName,
        studentName,
        studentEmail,
        classesRemaining,
        daysRemaining,
        expiresAt,
        isExpired
    } = data;
    
    const firstName = teacherName ? teacherName.split(' ')[0] : 'Profesor';
    
    let emoji, title, urgencyColor, message;
    
    if (isExpired) {
        emoji = '📊';
        title = 'Clases expiradas de un estudiante';
        urgencyColor = '#ef4444';
        message = `Las <strong>${classesRemaining} clases</strong> de <strong>${studentName}</strong> han expirado sin ser utilizadas.`;
    } else if (daysRemaining <= 1) {
        emoji = '🚨';
        title = '¡Último día! Estudiante con clases por perder';
        urgencyColor = '#ef4444';
        message = `<strong>${studentName}</strong> tiene <strong>${classesRemaining} clases</strong> que expiran <strong>mañana</strong>. Contáctalo para que agende.`;
    } else if (daysRemaining <= 3) {
        emoji = '⏰';
        title = 'Estudiante con clases por vencer';
        urgencyColor = '#f59e0b';
        message = `<strong>${studentName}</strong> tiene <strong>${classesRemaining} clases</strong> que expiran en <strong>${daysRemaining} días</strong>.`;
    } else {
        emoji = '📅';
        title = 'Aviso: Estudiante con clases por vencer';
        urgencyColor = '#3b82f6';
        message = `<strong>${studentName}</strong> tiene <strong>${classesRemaining} clases</strong> que expiran en <strong>${daysRemaining} días</strong>.`;
    }
    
    const expiryDate = new Date(expiresAt).toLocaleDateString('es-CL', { 
        weekday: 'long', 
        day: 'numeric', 
        month: 'long' 
    });
    
    const content = `
        <div style="text-align: center; margin-bottom: 25px;">
            <span style="font-size: 48px;">${emoji}</span>
        </div>
        
        <h2 style="margin: 0 0 20px 0; color: #1a1a1a; font-size: 24px; font-weight: 700; text-align: center;">
            ${title}
        </h2>
        
        <p style="margin: 0 0 16px 0; color: #333333; font-size: 16px; line-height: 1.6;">
            Hola <strong>${firstName}</strong>,
        </p>
        
        <p style="margin: 0 0 20px 0; color: #333333; font-size: 16px; line-height: 1.6;">
            ${message}
        </p>
        
        <!-- Card con detalles -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin: 0 0 25px 0;">
            <tr>
                <td style="padding: 25px; background-color: #f8f9fa; border-radius: 12px; border-left: 4px solid ${urgencyColor};">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                        <tr>
                            <td style="padding: 8px 0;">
                                <span style="color: #666; font-size: 14px;">Estudiante:</span><br>
                                <strong style="color: #1a1a1a; font-size: 16px;">${studentName}</strong>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0;">
                                <span style="color: #666; font-size: 14px;">Email:</span><br>
                                <a href="mailto:${studentEmail}" style="color: #ff764d; font-size: 16px; text-decoration: none;">${studentEmail}</a>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0;">
                                <span style="color: #666; font-size: 14px;">Clases sin usar:</span><br>
                                <strong style="color: ${urgencyColor}; font-size: 24px;">${classesRemaining}</strong>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0;">
                                <span style="color: #666; font-size: 14px;">${isExpired ? 'Expiraron el:' : 'Expiran el:'}</span><br>
                                <strong style="color: #1a1a1a; font-size: 16px;">${expiryDate}</strong>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
        
        ${!isExpired ? `
        <p style="margin: 0 0 20px 0; color: #333333; font-size: 16px; line-height: 1.6; text-align: center;">
            <strong>💡 Sugerencia:</strong> Contacta a tu estudiante para recordarle agendar sus clases.
        </p>
        ` : `
        <p style="margin: 0; color: #666; font-size: 14px; text-align: center;">
            Las clases expiradas quedan registradas en el historial del estudiante.
        </p>
        `}
    `;
    
    return generateBaseEmail({
        title: title,
        preheader: isExpired 
            ? `${studentName} perdió ${classesRemaining} clases por expiración` 
            : `${studentName} tiene ${classesRemaining} clases que expiran en ${daysRemaining} días`,
        content: content,
        footerText: 'Recibiste este email porque eres profesor en PianoLink.'
    });
}

/**
 * Procesa los enrollments que necesitan avisos
 */
async function processExpirationWarnings() {
    const now = new Date();
    
    // Buscar enrollments con clases sin usar y fecha de expiración definida
    const enrollments = await StudentEnrollment.find({
        classesRemaining: { $gt: 0 },
        classesExpiresAt: { $exists: true, $ne: null },
        status: 'active'
    }).populate('student', 'name email')
      .populate('teacher', 'name email slug teacherData.profile.slug');
    
    console.log(`[PackageExpiration] Encontrados ${enrollments.length} enrollments con clases por expirar`);
    
    let emailsSent = 0;
    let classesExpired = 0;
    
    for (const enrollment of enrollments) {
        const daysRemaining = getDaysUntilExpiration(enrollment.classesExpiresAt);
        
        if (daysRemaining === null) continue;
        
        const student = enrollment.student;
        const teacher = enrollment.teacher;
        
        if (!student || !teacher) {
            console.log(`[PackageExpiration] Enrollment ${enrollment._id} sin student o teacher poblado`);
            continue;
        }
        
        const teacherSlug = teacher.teacherData?.profile?.slug || teacher.slug || teacher._id;
        
        const emailData = {
            studentName: student.name,
            studentEmail: student.email,
            teacherName: teacher.name,
            teacherSlug: teacherSlug,
            classesRemaining: enrollment.classesRemaining,
            daysRemaining: daysRemaining,
            expiresAt: enrollment.classesExpiresAt,
            isExpired: false
        };
        
        // Determinar qué aviso enviar
        let shouldSendEmail = false;
        let warningType = null;
        
        if (daysRemaining <= 0 && !enrollment.expirationWarnings?.expiredSent) {
            // EXPIRADO - marcar clases como perdidas
            emailData.isExpired = true;
            warningType = 'expiredSent';
            shouldSendEmail = true;
            
            // Registrar clases perdidas
            const lostClasses = enrollment.classesRemaining;
            enrollment.classesRemaining = 0;
            classesExpired += lostClasses;
            
            console.log(`[PackageExpiration] ⚠️ ${student.name}: ${lostClasses} clases expiradas`);
            
        } else if (daysRemaining === 1 && !enrollment.expirationWarnings?.day1Sent) {
            warningType = 'day1Sent';
            shouldSendEmail = true;
            
        } else if (daysRemaining <= 3 && daysRemaining > 1 && !enrollment.expirationWarnings?.day3Sent) {
            warningType = 'day3Sent';
            shouldSendEmail = true;
            
        } else if (daysRemaining <= 7 && daysRemaining > 3 && !enrollment.expirationWarnings?.day7Sent) {
            warningType = 'day7Sent';
            shouldSendEmail = true;
        }
        
        if (shouldSendEmail && warningType) {
            console.log(`[PackageExpiration] 📧 Enviando aviso ${warningType} a ${student.name} (${daysRemaining} días)`);
            
            if (!DRY_RUN) {
                try {
                    // Email al estudiante
                    const studentHtml = generateStudentExpirationEmail(emailData);
                    await EmailService.send({
                        to: student.email,
                        subject: emailData.isExpired 
                            ? `⚠️ Tus clases con ${teacher.name} han expirado`
                            : `${daysRemaining <= 1 ? '🚨' : '📅'} Tienes ${enrollment.classesRemaining} clases que ${daysRemaining <= 1 ? 'expiran mañana' : `expiran en ${daysRemaining} días`}`,
                        html: studentHtml
                    });
                    emailsSent++;
                    
                    // Email al profesor
                    const teacherHtml = generateTeacherExpirationEmail({
                        ...emailData,
                        teacherName: teacher.name
                    });
                    await EmailService.send({
                        to: teacher.email,
                        subject: emailData.isExpired 
                            ? `📊 Clases expiradas de ${student.name}`
                            : `${daysRemaining <= 1 ? '🚨' : '📅'} ${student.name} tiene clases que ${daysRemaining <= 1 ? 'expiran mañana' : `expiran en ${daysRemaining} días`}`,
                        html: teacherHtml
                    });
                    emailsSent++;
                    
                    // Marcar aviso como enviado
                    if (!enrollment.expirationWarnings) {
                        enrollment.expirationWarnings = {};
                    }
                    enrollment.expirationWarnings[warningType] = true;
                    
                } catch (emailError) {
                    console.error(`[PackageExpiration] Error enviando email:`, emailError.message);
                }
            } else {
                console.log(`[DRY-RUN] Se enviaría email a ${student.email} y ${teacher.email}`);
            }
            
            await enrollment.save();
        }
    }
    
    return { emailsSent, classesExpired, enrollmentsProcessed: enrollments.length };
}

/**
 * Función principal
 */
async function main() {
    console.log('='.repeat(60));
    console.log(`[PackageExpiration] Iniciando job - ${new Date().toISOString()}`);
    console.log(`[PackageExpiration] Modo: ${DRY_RUN ? 'DRY-RUN (sin enviar emails)' : 'PRODUCCIÓN'}`);
    console.log('='.repeat(60));
    
    try {
        // Conectar a MongoDB si no está conectado
        if (mongoose.connection.readyState !== 1) {
            await mongoose.connect(process.env.MONGODB_URI);
            console.log('[PackageExpiration] Conectado a MongoDB');
        }
        
        const results = await processExpirationWarnings();
        
        console.log('='.repeat(60));
        console.log('[PackageExpiration] ✅ Job completado');
        console.log(`  - Enrollments revisados: ${results.enrollmentsProcessed}`);
        console.log(`  - Emails enviados: ${results.emailsSent}`);
        console.log(`  - Clases expiradas: ${results.classesExpired}`);
        console.log('='.repeat(60));
        
        return results;
        
    } catch (error) {
        console.error('[PackageExpiration] ❌ Error:', error);
        throw error;
    }
}

// Ejecutar si se llama directamente
if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
}

// Exportar para uso como módulo
module.exports = { main, processExpirationWarnings };
