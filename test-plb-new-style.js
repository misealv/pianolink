/**
 * test-plb-new-style.js - Test del nuevo estilo de PLB (coach en vez de vendedor)
 * 
 * Verifica que PLB ahora da sugerencias cortas y concretas,
 * sin intentar vender directamente.
 * 
 * USO: node test-plb-new-style.js
 */

require('dotenv').config();
const io = require('socket.io-client');

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';
const TEST_EMAIL = 'demo@pianolink.com';

console.log('🧪 Test PLB - Nuevo Estilo de Coach');
console.log('====================================');
console.log(`📡 Servidor: ${SERVER_URL}\n`);

// Escenarios para probar el nuevo estilo
const scenarios = [
    {
        name: '🤔 Objeción: "Zoom es gratis"',
        conversation: [
            { speaker: 'teacher', text: 'Piano Link facilita las clases online' },
            { speaker: 'guest', text: 'Pero Zoom es gratis, ¿por qué pagaría?' }
        ],
        expectedStyle: 'Sugerencia corta para manejar objeción (sin mencionar precio)'
    },
    {
        name: '💭 Cliente indeciso',
        conversation: [
            { speaker: 'teacher', text: 'Puedes ver las teclas en tiempo real' },
            { speaker: 'guest', text: 'Interesante, pero no sé si es para mí' }
        ],
        expectedStyle: 'Sugerencia para explorar necesidades (no cierre de venta)'
    },
    {
        name: '🔍 Pregunta directa sobre precio',
        conversation: [
            { speaker: 'teacher', text: 'Es una plataforma completa' },
            { speaker: 'guest', text: '¿Cuánto cuesta?' }
        ],
        expectedStyle: 'Puede mencionar precio si pregunta directamente'
    },
    {
        name: '⚡ Comparación con Zoom',
        conversation: [
            { speaker: 'teacher', text: 'Tenemos MIDI sincronizado' },
            { speaker: 'guest', text: '¿Qué ventaja tiene sobre Zoom?' }
        ],
        expectedStyle: 'Resaltar diferencia específica (setup, audio, etc)'
    }
];

let currentScenario = 0;
let hintsReceived = [];

const socket = io(SERVER_URL, {
    transports: ['websocket'],
    reconnection: false
});

socket.on('connect', () => {
    console.log('✅ Conectado\n');
    
    socket.emit('create-room', {
        roomCode: 'STYLETEST',
        username: 'Test User'
    });
});

socket.on('room-created', () => {
    socket.emit('plb-register', { email: TEST_EMAIL });
});

socket.on('plb-status', (data) => {
    if (data.enabled) {
        console.log('✅ PLB habilitado\n');
        runNextScenario();
    } else {
        console.log('❌ PLB no habilitado');
        process.exit(1);
    }
});

socket.on('plb-hint', (data) => {
    const scenario = scenarios[currentScenario - 1];
    
    console.log('\n┌─────────────────────────────────────────────────────┐');
    console.log('│ 💡 SUGERENCIA DE PLB                                │');
    console.log('└─────────────────────────────────────────────────────┘');
    console.log(`\n"${data.hint}"\n`);
    
    // Analizar la respuesta
    const hint = data.hint;
    const wordCount = hint.split(' ').length;
    const lines = hint.split('\n').length;
    
    console.log('📊 ANÁLISIS:');
    console.log(`   Palabras: ${wordCount}`);
    console.log(`   Líneas: ${lines}`);
    
    // Verificaciones del nuevo estilo
    const checks = {
        'Corta (≤30 palabras)': wordCount <= 30,
        'NO menciona "$10" sin contexto': !hint.includes('$10') || scenario.name.includes('precio'),
        'NO tiene frases de cierre agresivo': !hint.toLowerCase().includes('¿te gustaría') && 
                                               !hint.toLowerCase().includes('asegurar tu'),
        'Tono de sugerencia (no venta directa)': hint.includes('Resalta') || 
                                                   hint.includes('Menciona') ||
                                                   hint.includes('Pregunta') ||
                                                   hint.includes('Enfatiza') ||
                                                   hint.toLowerCase().includes('podrías')
    };
    
    console.log('\n✓ VERIFICACIONES:');
    let passed = 0;
    Object.entries(checks).forEach(([name, result]) => {
        const icon = result ? '✅' : '❌';
        console.log(`   ${icon} ${name}`);
        if (result) passed++;
    });
    
    console.log(`\n   ${passed}/${Object.keys(checks).length} verificaciones pasadas`);
    console.log(`   Estilo esperado: ${scenario.expectedStyle}\n`);
    
    hintsReceived.push({ scenario: scenario.name, hint, passed, total: Object.keys(checks).length });
    
    // Esperar antes del siguiente escenario
    setTimeout(() => {
        runNextScenario();
    }, 2000);
});

function runNextScenario() {
    if (currentScenario >= scenarios.length) {
        showFinalReport();
        return;
    }
    
    const scenario = scenarios[currentScenario];
    currentScenario++;
    
    console.log('═'.repeat(60));
    console.log(`${currentScenario}/${scenarios.length} - ${scenario.name}`);
    console.log('═'.repeat(60));
    console.log(`📋 Estilo esperado: ${scenario.expectedStyle}\n`);
    
    let index = 0;
    
    const sendNext = () => {
        if (index >= scenario.conversation.length) {
            console.log('\n⏳ Esperando sugerencia de PLB...');
            return;
        }
        
        const msg = scenario.conversation[index];
        console.log(`[${msg.speaker}]: "${msg.text}"`);
        
        socket.emit('plb-transcript', {
            speaker: msg.speaker,
            text: msg.text,
            timestamp: Date.now()
        });
        
        index++;
        setTimeout(sendNext, 1000);
    };
    
    sendNext();
}

function showFinalReport() {
    console.log('\n' + '═'.repeat(60));
    console.log('📊 REPORTE FINAL - NUEVO ESTILO DE PLB');
    console.log('═'.repeat(60) + '\n');
    
    const totalChecks = hintsReceived.reduce((sum, h) => sum + h.total, 0);
    const totalPassed = hintsReceived.reduce((sum, h) => sum + h.passed, 0);
    const percentage = Math.round((totalPassed / totalChecks) * 100);
    
    hintsReceived.forEach((h, i) => {
        console.log(`${i + 1}. ${h.scenario}`);
        console.log(`   Score: ${h.passed}/${h.total}`);
        console.log(`   "${h.hint.substring(0, 80)}..."\n`);
    });
    
    console.log('═'.repeat(60));
    console.log(`✨ RESULTADO GLOBAL: ${totalPassed}/${totalChecks} (${percentage}%)`);
    console.log('═'.repeat(60));
    
    if (percentage >= 80) {
        console.log('\n🎉 ¡EXCELENTE! PLB ahora tiene un estilo de coach');
        console.log('   Las respuestas son cortas, concretas y no agresivas\n');
    } else if (percentage >= 60) {
        console.log('\n✅ BIEN - PLB mejoró, pero puede ser más conciso\n');
    } else {
        console.log('\n⚠️  NECESITA AJUSTES - Las respuestas aún son muy largas o agresivas\n');
    }
    
    socket.disconnect();
    process.exit(0);
}

// Timeout
setTimeout(() => {
    console.log('\n⏱️  Timeout - Test incompleto');
    socket.disconnect();
    process.exit(1);
}, 60000);
