/**
 * test-plb-founder.js - Test específico para verificar aprendizaje sobre el fundador
 * 
 * Este script prueba que PLB ahora responde correctamente sobre quién es el fundador
 * después de haber agregado el ejemplo de corrección a la base de datos.
 * 
 * USO: node test-plb-founder.js
 */

require('dotenv').config();
const io = require('socket.io-client');

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';
const TEST_EMAIL = 'demo@pianolink.com';

console.log('🧪 Test PLB - Verificación de Aprendizaje sobre Fundador');
console.log('=========================================================');
console.log(`📡 Servidor: ${SERVER_URL}`);
console.log('');

const socket = io(SERVER_URL, {
    transports: ['websocket'],
    reconnection: false
});

socket.on('connect', () => {
    console.log('✅ Conectado al servidor\n');
    
    socket.emit('create-room', {
        roomCode: 'FOUNDERTEST',
        username: 'Test User'
    });
});

socket.on('room-created', () => {
    console.log('✅ Sala creada\n');
    socket.emit('plb-register', { email: TEST_EMAIL });
});

socket.on('plb-status', (data) => {
    if (data.enabled) {
        console.log('✅ PLB habilitado para este usuario\n');
        console.log('🎬 Iniciando conversación sobre el fundador...\n');
        
        // Simular una conversación sobre el fundador
        const conversation = [
            { speaker: 'guest', text: 'Hola, me interesa Piano Link' },
            { speaker: 'teacher', text: 'Genial, es una plataforma para clases de piano' },
            { speaker: 'guest', text: '¿Quién es el creador de Piano Link?' }
        ];
        
        let index = 0;
        
        const sendNext = () => {
            if (index >= conversation.length) {
                console.log('⏳ Esperando respuesta de PLB...\n');
                return;
            }
            
            const msg = conversation[index];
            console.log(`[${msg.speaker}]: "${msg.text}"`);
            
            socket.emit('plb-transcript', {
                speaker: msg.speaker,
                text: msg.text,
                timestamp: Date.now()
            });
            
            index++;
            setTimeout(sendNext, 1500);
        };
        
        sendNext();
    } else {
        console.log('❌ PLB no habilitado');
        process.exit(1);
    }
});

socket.on('plb-hint', (data) => {
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('🧠 RESPUESTA DE PLB:');
    console.log('═══════════════════════════════════════════════════════');
    console.log(data.hint);
    console.log('═══════════════════════════════════════════════════════\n');
    
    // Verificar si la respuesta contiene la información correcta
    const hint = data.hint.toLowerCase();
    
    console.log('🔍 Verificando respuesta...\n');
    
    const checks = [
        { 
            name: 'Nombre correcto (Miguel Antonio)', 
            test: hint.includes('miguel antonio') || hint.includes('miseal'),
            expected: true
        },
        { 
            name: 'País correcto (Chile)', 
            test: hint.includes('chile'),
            expected: true
        },
        { 
            name: 'NO menciona Colombia', 
            test: !hint.includes('colombia'),
            expected: true
        },
        { 
            name: 'NO menciona Miguel Ángel', 
            test: !hint.includes('miguel ángel') && !hint.includes('miguel angel'),
            expected: true
        }
    ];
    
    let passed = 0;
    let failed = 0;
    
    checks.forEach(check => {
        const status = check.test === check.expected ? '✅' : '❌';
        console.log(`${status} ${check.name}`);
        
        if (check.test === check.expected) {
            passed++;
        } else {
            failed++;
        }
    });
    
    console.log('\n═══════════════════════════════════════════════════════');
    console.log(`RESULTADO: ${passed}/${checks.length} verificaciones pasaron`);
    console.log('═══════════════════════════════════════════════════════\n');
    
    if (failed === 0) {
        console.log('🎉 ¡ÉXITO! PLB ahora responde correctamente sobre el fundador');
        console.log('✅ El sistema de aprendizaje funciona correctamente\n');
    } else {
        console.log('⚠️  Algunas verificaciones fallaron');
        console.log('💡 Puede tomar hasta 5 minutos para que el cache se actualice');
        console.log('💡 O reinicia el servidor para forzar la recarga del cache\n');
    }
    
    socket.disconnect();
    process.exit(failed === 0 ? 0 : 1);
});

socket.on('connect_error', (error) => {
    console.error('❌ Error de conexión:', error.message);
    process.exit(1);
});

socket.on('disconnect', () => {
    console.log('🔌 Desconectado');
});

// Timeout de 30 segundos
setTimeout(() => {
    console.log('\n⏱️  Timeout - No se recibió respuesta de PLB');
    console.log('💡 Asegúrate de que el servidor esté corriendo');
    socket.disconnect();
    process.exit(1);
}, 30000);
