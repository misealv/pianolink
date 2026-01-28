#!/usr/bin/env node
/* scripts/testEmail.js - Script para Probar el Sistema de Emails */

/**
 * Script de prueba manual del sistema de emails
 * 
 * USO:
 * node scripts/testEmail.js [tu-email@example.com]
 * 
 * EJEMPLOS:
 * node scripts/testEmail.js                          # Modo simulado
 * node scripts/testEmail.js juan@gmail.com           # Envío real
 * NODE_ENV=production node scripts/testEmail.js      # Forzar envío real
 */

require('dotenv').config();
const emailService = require('../services/EmailService');
const generateWelcomeTeacherEmail = require('../templates/emails/welcomeTeacher');

// Colores para la consola
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
    bold: '\x1b[1m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

async function testEmail() {
    log('\n' + '='.repeat(60), 'cyan');
    log('  📧 PIANOLINK - TEST DE SISTEMA DE EMAILS', 'bold');
    log('='.repeat(60) + '\n', 'cyan');
    
    // Verificar configuración
    log('🔍 Verificando configuración...', 'cyan');
    const status = emailService.getStatus();
    
    console.log('   • Configurado:', status.configured ? '✅' : '❌');
    console.log('   • Modo:', status.isDevelopment ? 'Desarrollo (simulado)' : 'Producción (real)');
    console.log('   • Remitente:', status.from);
    console.log('   • Reintentos máximos:', status.maxRetries);
    
    if (!status.configured) {
        log('\n❌ ERROR: RESEND_API_KEY no está configurado', 'red');
        log('   Agrega la API key en tu archivo .env:', 'yellow');
        log('   RESEND_API_KEY=re_tu_api_key_aqui\n', 'yellow');
        process.exit(1);
    }
    
    // Obtener email destino de argumentos o usar uno de prueba
    const destinationEmail = process.argv[2] || 'test@example.com';
    
    log(`\n📤 Preparando email de prueba para: ${destinationEmail}`, 'cyan');
    
    // Datos de prueba
    const testData = {
        teacherName: 'Juan Pérez García',
        teacherEmail: destinationEmail,
        dashboardUrl: process.env.FRONTEND_URL || 'http://localhost:3000/dashboard.html'
    };
    
    // Generar HTML
    log('🎨 Generando template HTML...', 'cyan');
    const emailHtml = generateWelcomeTeacherEmail(testData);
    log(`   ✅ Template generado (${emailHtml.length} caracteres)`, 'green');
    
    // Preparar email
    const emailData = {
        to: destinationEmail,
        subject: '🧪 TEST - ¡Bienvenido a PianoLink! 🎹',
        html: emailHtml
    };
    
    // Enviar
    log('\n📮 Enviando email...', 'cyan');
    
    try {
        const result = await emailService.send(emailData);
        
        log('\n✅ ¡Email enviado exitosamente!', 'green');
        
        if (result.mode === 'simulated') {
            log('\n⚠️  MODO SIMULACIÓN: El email NO se envió realmente', 'yellow');
            log('   Para enviar emails reales:', 'yellow');
            log('   1. Configura NODE_ENV=production en .env', 'yellow');
            log('   2. O ejecuta: NODE_ENV=production node scripts/testEmail.js', 'yellow');
        } else {
            log('\n📬 Email enviado a:', 'cyan');
            log(`   • Destinatario: ${result.to}`, 'cyan');
            log(`   • ID: ${result.id}`, 'cyan');
            log(`   • Asunto: ${emailData.subject}`, 'cyan');
            log('\n💡 Revisa tu bandeja de entrada (puede tardar unos segundos)', 'yellow');
            log('   Si no lo ves, revisa SPAM', 'yellow');
        }
        
        log('\n' + '='.repeat(60), 'cyan');
        log('  ✅ TEST COMPLETADO', 'bold');
        log('='.repeat(60) + '\n', 'cyan');
        
    } catch (error) {
        log('\n❌ ERROR al enviar email:', 'red');
        log(`   ${error.message}\n`, 'red');
        
        // Ayuda para errores comunes
        if (error.message.includes('401')) {
            log('💡 Solución:', 'yellow');
            log('   Tu API Key es inválida. Genera una nueva en:', 'yellow');
            log('   https://resend.com/api-keys\n', 'yellow');
        } else if (error.message.includes('403')) {
            log('💡 Solución:', 'yellow');
            log('   Dominio no verificado. Usa:', 'yellow');
            log('   EMAIL_FROM=onboarding@resend.dev\n', 'yellow');
        } else if (error.message.includes('not configured')) {
            log('💡 Solución:', 'yellow');
            log('   Agrega RESEND_API_KEY en .env\n', 'yellow');
        }
        
        process.exit(1);
    }
}

// Ejecutar test
testEmail().catch(error => {
    log(`\n❌ Error crítico: ${error.message}\n`, 'red');
    process.exit(1);
});
