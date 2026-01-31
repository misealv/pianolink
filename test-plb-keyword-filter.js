/**
 * test-plb-keyword-filter.js - Test del pre-filtro de keywords
 * Verifica que el sistema no llame a Gemini sin keywords relevantes
 */

require('dotenv').config();
const io = require('socket.io-client');

const SERVER_URL = 'http://localhost:3000';
const TEST_EMAIL = 'demo@pianolink.com';

console.log('🧪 Test de Pre-filtro de Keywords');
console.log('==================================\n');

let hintsReceived = 0;

const socket = io(SERVER_URL, {
    transports: ['websocket'],
    reconnection: false
});

socket.on('connect', () => {
    console.log('✅ Conectado\n');
    
    socket.emit('create-room', {
        roomCode: 'KEYWORDTEST',
        username: 'Test User'
    });
});

socket.on('room-created', () => {
    socket.emit('plb-register', { email: TEST_EMAIL });
});

socket.on('plb-status', (data) => {
    if (data.enabled) {
        console.log('🎬 Test 1: Conversación SIN keywords relevantes');
        console.log('   (NO debería llamar a Gemini)\n');
        
        // Conversación genérica sin keywords de venta
        setTimeout(() => sendMessage('teacher', 'Hola, buenos días'), 0);
        setTimeout(() => sendMessage('guest', 'Hola, ¿cómo estás?'), 1500);
        setTimeout(() => sendMessage('teacher', 'Muy bien, gracias'), 3000);
        setTimeout(() => sendMessage('guest', 'Qué lindo día hace hoy'), 4500);
        
        // Después de 8 segundos, probar con keywords
        setTimeout(() => {
            console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
            console.log('🎬 Test 2: Conversación CON keywords relevantes');
            console.log('   (SÍ debería llamar a Gemini)\n');
            
            sendMessage('guest', 'Me interesa saber cuánto cuesta esto');
            
            // Esperar 20s para recibir respuesta
            setTimeout(() => {
                console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
                console.log('📊 RESULTADOS:');
                console.log(`   Hints recibidos: ${hintsReceived}`);
                
                if (hintsReceived === 1) {
                    console.log('   ✅ Pre-filtro funcionando correctamente');
                    console.log('   (Solo llamó a Gemini con keywords relevantes)\n');
                } else if (hintsReceived === 0) {
                    console.log('   ⚠️  No se recibió hint (puede ser throttle o error)\n');
                } else {
                    console.log('   ❌ Recibió más hints de lo esperado\n');
                }
                
                socket.disconnect();
                process.exit(0);
            }, 20000);
            
        }, 8000);
    }
});

socket.on('plb-hint', (data) => {
    hintsReceived++;
    console.log('   💡 HINT RECIBIDO:', data.hint.substring(0, 60) + '...');
});

function sendMessage(speaker, text) {
    console.log(`   ${speaker === 'teacher' ? '👨‍🏫' : '👤'} [${speaker}]: "${text}"`);
    
    socket.emit('plb-transcript', {
        text: text,
        speaker: speaker,
        userEmail: TEST_EMAIL,
        timestamp: Date.now()
    });
}

socket.on('connect_error', (error) => {
    console.error('❌ Error:', error.message);
    process.exit(1);
});

// Timeout
setTimeout(() => {
    console.log('\n⚠️ Timeout\n');
    socket.disconnect();
    process.exit(1);
}, 35000);
