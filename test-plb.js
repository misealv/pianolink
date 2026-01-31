/**
 * test-plb.js - Script de prueba para PLB
 * 
 * Simula transcripciones de audio para probar el sistema PLB
 * sin necesidad de usar el navegador.
 * 
 * USO: node test-plb.js
 */

require('dotenv').config();
const io = require('socket.io-client');

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';
const TEST_EMAIL = 'demo@pianolink.com'; // Usuario permitido para PLB

console.log('🧪 Test PLB - Piano Link Brain');
console.log('================================');
console.log(`📡 Conectando a: ${SERVER_URL}`);
console.log(`📧 Usuario de prueba: ${TEST_EMAIL}`);
console.log('');

// Conectar al servidor
const socket = io(SERVER_URL, {
    transports: ['websocket'],
    reconnection: false
});

socket.on('connect', () => {
    console.log('✅ Conectado al servidor');
    console.log(`   Socket ID: ${socket.id}`);
    console.log('');
    
    // 1. Crear sala
    console.log('📍 Creando sala de prueba...');
    socket.emit('create-room', {
        roomCode: 'TESTPLB',
        username: 'Profesor Demo'
    });
});

socket.on('room-created', (roomCode) => {
    console.log(`✅ Sala creada: ${roomCode}`);
    console.log('');
    
    // 2. Registrar email para PLB
    console.log('📧 Registrando email para PLB...');
    socket.emit('plb-register', { email: TEST_EMAIL });
});

socket.on('plb-status', (data) => {
    console.log('📊 Status PLB:', data);
    
    if (data.enabled) {
        console.log('✅ PLB habilitado para este usuario');
        console.log('');
        
        // 3. Simular conversación
        console.log('🎤 Simulando conversación...');
        simulateConversation();
    } else {
        console.log('❌ PLB NO habilitado para este usuario');
        console.log('   Verifica que el email esté en la lista permitida.');
        process.exit(1);
    }
});

socket.on('plb-hint', (data) => {
    console.log('');
    console.log('═══════════════════════════════════════════════════════');
    console.log('💡 HINT RECIBIDO DE PLB:');
    console.log('───────────────────────────────────────────────────────');
    console.log(data.hint);
    console.log('───────────────────────────────────────────────────────');
    console.log(`⏱️  Latencia: ${data.latency}ms`);
    console.log('═══════════════════════════════════════════════════════');
    console.log('');
    console.log('✅ Test completado exitosamente!');
    console.log('');
    
    // Cerrar conexión después del test
    setTimeout(() => {
        socket.disconnect();
        process.exit(0);
    }, 1000);
});

socket.on('connect_error', (error) => {
    console.error('❌ Error de conexión:', error.message);
    process.exit(1);
});

socket.on('disconnect', () => {
    console.log('🔌 Desconectado del servidor');
});

// Simular una conversación de demostración
function simulateConversation() {
    const conversation = [
        { speaker: 'teacher', text: 'Bienvenido a Piano Link, la plataforma para clases de piano online.' },
        { speaker: 'guest', text: 'Gracias, se ve interesante. ¿Cómo funciona?' },
        { speaker: 'teacher', text: 'Es muy simple. Conectas tu piano por USB y podemos tocar juntos en tiempo real.' },
        { speaker: 'guest', text: 'Ah interesante. Actualmente uso Zoom para mis clases, pero tiene problemas de latencia.' },
        { speaker: 'teacher', text: 'Exacto, ese es el problema que resolvemos. El MIDI viaja sincronizado.' },
        { speaker: 'guest', text: '¿Y cuánto cuesta esto? Zoom es gratuito.' }
    ];
    
    let index = 0;
    
    const sendNext = () => {
        if (index >= conversation.length) {
            console.log('');
            console.log('⏳ Esperando respuesta de Gemini...');
            console.log('   (El servidor tiene throttle de 15s, puede tardar)');
            return;
        }
        
        const msg = conversation[index];
        console.log(`   [${msg.speaker}]: "${msg.text}"`);
        
        socket.emit('plb-transcript', {
            text: msg.text,
            speaker: msg.speaker,
            userEmail: TEST_EMAIL,
            timestamp: Date.now()
        });
        
        index++;
        setTimeout(sendNext, 1500); // 1.5s entre mensajes
    };
    
    sendNext();
}

// Timeout de seguridad
setTimeout(() => {
    console.log('');
    console.log('⚠️ Timeout: No se recibió respuesta de PLB');
    console.log('   Posibles causas:');
    console.log('   - GEMINI_API_KEY no configurada en .env');
    console.log('   - Throttle activo (espera 15s entre llamadas)');
    console.log('   - Error en la API de Gemini');
    console.log('');
    
    // Verificar status
    require('http').get(`${SERVER_URL}/api/plb/status`, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            console.log('📊 Status actual del servidor:');
            console.log(JSON.parse(data));
            process.exit(1);
        });
    }).on('error', () => {
        process.exit(1);
    });
}, 60000); // 60 segundos timeout
