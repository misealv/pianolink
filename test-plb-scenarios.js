/**
 * test-plb-scenarios.js - Pruebas de diferentes escenarios para PLB
 * 
 * Simula múltiples conversaciones para validar la IA de ventas
 * 
 * USO: node test-plb-scenarios.js
 */

require('dotenv').config();
const io = require('socket.io-client');

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';
const TEST_EMAIL = 'demo@pianolink.com';

console.log('🧪 PLB - Test de Escenarios Múltiples');
console.log('======================================');
console.log(`📡 Servidor: ${SERVER_URL}`);
console.log('');

// Definir escenarios de prueba
const scenarios = [
    {
        name: '💰 Escenario 1: Pregunta directa sobre precio',
        conversation: [
            { speaker: 'teacher', text: 'Hola, bienvenido a Piano Link. ¿Qué te pareció la demo?' },
            { speaker: 'guest', text: 'Me gustó mucho. ¿Cuánto cuesta?' },
            { speaker: 'teacher', text: 'Excelente pregunta.' }
        ]
    },
    {
        name: '🔄 Escenario 2: Comparación con competencia',
        conversation: [
            { speaker: 'teacher', text: 'Piano Link simplifica las clases online con MIDI sincronizado.' },
            { speaker: 'guest', text: 'Actualmente uso OBS con Zoom. ¿Por qué debería cambiarme?' },
            { speaker: 'teacher', text: 'Es una buena pregunta.' }
        ]
    },
    {
        name: '🎹 Escenario 3: Interés en funcionalidades',
        conversation: [
            { speaker: 'teacher', text: 'Puedes tocar en tiempo real y compartir partituras.' },
            { speaker: 'guest', text: 'Suena interesante. ¿Qué más ofrece la plataforma?' },
            { speaker: 'teacher', text: 'Tenemos varias características.' }
        ]
    },
    {
        name: '🆓 Escenario 4: Pregunta por prueba gratuita',
        conversation: [
            { speaker: 'teacher', text: 'La plataforma está en beta y queremos feedback de profesores.' },
            { speaker: 'guest', text: '¿Puedo probarlo gratis antes de pagar?' },
            { speaker: 'teacher', text: 'Por supuesto.' }
        ]
    },
    {
        name: '⚡ Escenario 5: Cliente indeciso',
        conversation: [
            { speaker: 'teacher', text: 'Piano Link resuelve los problemas de latencia del MIDI.' },
            { speaker: 'guest', text: 'Me interesa pero no sé si es para mí. Debo pensarlo.' },
            { speaker: 'teacher', text: 'Entiendo perfectamente.' }
        ]
    }
];

let currentScenario = 0;
let hintsReceived = [];

const socket = io(SERVER_URL, {
    transports: ['websocket'],
    reconnection: false
});

socket.on('connect', () => {
    console.log('✅ Conectado al servidor');
    console.log('');
    
    // Crear sala única
    socket.emit('create-room', {
        roomCode: 'PLBTEST',
        username: 'Profesor Demo'
    });
});

socket.on('room-created', (roomCode) => {
    console.log(`📍 Sala creada: ${roomCode}`);
    
    // Registrar email
    socket.emit('plb-register', { email: TEST_EMAIL });
});

socket.on('plb-status', (data) => {
    if (data.enabled) {
        console.log('✅ PLB habilitado');
        console.log('');
        console.log('🎬 Iniciando escenarios de prueba...');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('');
        
        // Comenzar con el primer escenario
        setTimeout(() => runNextScenario(), 2000);
    } else {
        console.log('❌ PLB no habilitado');
        process.exit(1);
    }
});

socket.on('plb-hint', (data) => {
    console.log('');
    console.log('   ┌────────────────────────────────────────────────────┐');
    console.log('   │ 💡 SUGERENCIA PLB                                  │');
    console.log('   ├────────────────────────────────────────────────────┤');
    const lines = wrapText(data.hint, 48);
    lines.forEach(line => {
        console.log(`   │ ${line.padEnd(50)} │`);
    });
    console.log('   ├────────────────────────────────────────────────────┤');
    console.log(`   │ ⏱️  Latencia: ${data.latency}ms`.padEnd(53) + '│');
    console.log('   └────────────────────────────────────────────────────┘');
    console.log('');
    
    // Guardar hint
    hintsReceived.push({
        scenario: currentScenario,
        hint: data.hint,
        latency: data.latency
    });
    
    // Continuar con el siguiente escenario después de 12 segundos (respetando throttle)
    console.log('⏸️  Esperando 12s antes del siguiente escenario (respetando throttle)...');
    setTimeout(() => runNextScenario(), 12000);
});

function runNextScenario() {
    if (currentScenario >= scenarios.length) {
        // Terminar test
        showSummary();
        return;
    }
    
    const scenario = scenarios[currentScenario];
    
    console.log(`\n${scenario.name}`);
    console.log('─'.repeat(60));
    
    let index = 0;
    const sendNext = () => {
        if (index >= scenario.conversation.length) {
            console.log('');
            console.log('⏳ Esperando respuesta de PLB (throttle de 10s entre llamadas)...');
            currentScenario++;
            // Esperar más tiempo para el siguiente escenario (respetando el throttle)
            return;
        }
        
        const msg = scenario.conversation[index];
        const emoji = msg.speaker === 'teacher' ? '👨‍🏫' : '👤';
        console.log(`${emoji} [${msg.speaker}]: "${msg.text}"`);
        
        socket.emit('plb-transcript', {
            text: msg.text,
            speaker: msg.speaker,
            userEmail: TEST_EMAIL,
            timestamp: Date.now()
        });
        
        index++;
        setTimeout(sendNext, 1500);
    };
    
    sendNext();
}

function showSummary() {
    console.log('');
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 RESUMEN DE PRUEBAS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log(`✅ Escenarios probados: ${scenarios.length}`);
    console.log(`💡 Hints generados: ${hintsReceived.length}`);
    
    if (hintsReceived.length > 0) {
        const avgLatency = hintsReceived.reduce((sum, h) => sum + h.latency, 0) / hintsReceived.length;
        console.log(`⏱️  Latencia promedio: ${avgLatency.toFixed(0)}ms`);
        console.log('');
        console.log('📝 Hints por escenario:');
        console.log('');
        
        hintsReceived.forEach((h, i) => {
            console.log(`   ${i + 1}. ${scenarios[h.scenario].name}`);
            console.log(`      → "${h.hint.substring(0, 60)}..."`);
            console.log('');
        });
    }
    
    console.log('✅ Test completado exitosamente!');
    console.log('');
    
    socket.disconnect();
    process.exit(0);
}

function wrapText(text, maxWidth) {
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';
    
    words.forEach(word => {
        if ((currentLine + word).length <= maxWidth) {
            currentLine += (currentLine ? ' ' : '') + word;
        } else {
            if (currentLine) lines.push(currentLine);
            currentLine = word;
        }
    });
    
    if (currentLine) lines.push(currentLine);
    return lines;
}

socket.on('connect_error', (error) => {
    console.error('❌ Error de conexión:', error.message);
    process.exit(1);
});

// Timeout de seguridad
setTimeout(() => {
    console.log('');
    console.log('⚠️ Timeout: El test tomó más de 3 minutos');
    console.log('');
    showSummary();
}, 180000); // 3 minutos
