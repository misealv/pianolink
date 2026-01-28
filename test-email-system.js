/* test-email-system.js - Script de diagnóstico del sistema de emails */

require('dotenv').config();

console.log('\n=================================');
console.log('🔍 DIAGNÓSTICO DEL SISTEMA DE EMAILS');
console.log('=================================\n');

// 1. Verificar variables de entorno
console.log('📋 VARIABLES DE ENTORNO:');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('RESEND_API_KEY:', process.env.RESEND_API_KEY ? '✅ Configurada' : '❌ NO configurada');
console.log('EMAIL_FROM:', process.env.EMAIL_FROM);
console.log('EMAIL_FROM_NAME:', process.env.EMAIL_FROM_NAME);
console.log('FRONTEND_URL:', process.env.FRONTEND_URL);
console.log('');

// 2. Probar EventService
console.log('📡 PROBANDO EVENT SERVICE:');
const eventService = require('./services/EventService');
console.log('EventService cargado:', typeof eventService);
console.log('');

// 3. Probar EmailService
console.log('📧 PROBANDO EMAIL SERVICE:');
const emailService = require('./services/EmailService');
const emailStatus = emailService.getStatus();
console.log('EmailService status:', JSON.stringify(emailStatus, null, 2));
console.log('');

// 4. Registrar listeners
console.log('👂 REGISTRANDO LISTENERS:');
const { registerEmailListeners } = require('./listeners/emailListeners');
registerEmailListeners();
console.log('Listener count para teacher.created:', eventService.listenerCount('teacher.created'));
console.log('');

// 5. Simular evento de creación de profesor
console.log('🎯 SIMULANDO CREACIÓN DE PROFESOR:');
const testTeacher = {
    _id: 'test-123',
    name: 'Profesor de Prueba',
    email: process.env.TEST_EMAIL || 'test@example.com',
    slug: 'profesor-prueba',
    isFoundingMember: false
};

console.log('Datos del profesor:', JSON.stringify(testTeacher, null, 2));
console.log('');

// Emitir el evento
console.log('🚀 EMITIENDO EVENTO teacher.created...');
eventService.emitSafe('teacher.created', { teacher: testTeacher });

// Esperar un poco para que se procese
setTimeout(() => {
    console.log('\n=================================');
    console.log('✅ DIAGNÓSTICO COMPLETADO');
    console.log('=================================\n');
    console.log('Si ves errores arriba, ese es el problema.');
    console.log('Si NO ves errores pero tampoco el log [EMAIL] 📤, entonces el listener no se ejecutó.');
    console.log('\nRevisa los logs de Render para ver estos mismos mensajes.\n');
    process.exit(0);
}, 5000);
