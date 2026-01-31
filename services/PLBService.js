/**
 * PLBService.js - Piano Link Brain (Motor IA)
 * Servicio de IA para asistencia de ventas usando Gemini 1.5 Flash
 * 
 * RESTRICCIONES DE SEGURIDAD:
 * - Solo activo para demo@pianolink.com (feature flag)
 * - Throttling de 15 segundos entre llamadas
 * - Buffer circular de 20 mensajes máximo
 * 
 * APRENDIZAJE CONTINUO:
 * - Carga ejemplos "dorados" de la BD (few-shot learning)
 * - El profesor puede mejorar respuestas y se guardan
 */

// === LAZY LOADING DEL SDK GEMINI ===
let GoogleGenerativeAI = null;
let geminiModel = null;

// === MODELO DE EJEMPLOS ===
const PLBExample = require('../models/PLBExample');

// === CACHE DE EJEMPLOS (se recarga cada 5 minutos) ===
let cachedExamples = [];
let lastExampleLoad = 0;
const EXAMPLE_CACHE_TTL = 5 * 60 * 1000; // 5 minutos

// === CONFIGURACIÓN ===
const PLB_CONFIG = {
    // Feature flag: Solo estos emails pueden usar PLB
    ALLOWED_EMAILS: ['demo@pianolink.com'],
    
    // Throttling (optimizado para reducir costos)
    MIN_INTERVAL_MS: 10000, // 10 segundos entre llamadas (modo demo)
    
    // Buffer
    MAX_BUFFER_SIZE: 20, // Máximo mensajes en buffer
    MIN_MESSAGES_FOR_CALL: 1, // Respuesta inmediata en modo demo
    
    // Gemini
    MODEL_NAME: 'gemini-2.0-flash', // Modelo más reciente (Enero 2026)
    MAX_OUTPUT_TOKENS: 150, // Más tokens para respuestas completas
    
    // Sistema
    ENABLED: true // Kill switch global
};

// === SYSTEM PROMPT (Playbook de ventas completo) ===
const SYSTEM_PROMPT = `Eres PLB (Piano Link Brain), asistente de ventas inteligente para Piano Link.

═══════════════════════════════════════════════════════════
SOBRE PIANO LINK
═══════════════════════════════════════════════════════════
FUNDADOR: Miguel Ángel (Miseal), músico y desarrollador de Colombia.
MISIÓN: Democratizar las clases de piano online eliminando la complejidad técnica.
HISTORIA: Nació de la frustración de profesores que perdían horas configurando OBS, 
         interfaces de audio y routing MIDI solo para dar una clase simple.

═══════════════════════════════════════════════════════════
PRODUCTO PRINCIPAL
═══════════════════════════════════════════════════════════
Plataforma web para clases de piano online con MIDI sincronizado en tiempo real.
- Video HD bidireccional
- Visualización de teclas MIDI en tiempo real (el alumno ve qué tocas)
- Partituras sincronizadas automáticamente
- Whiteboard colaborativo para anotaciones
- Sin instalaciones - funciona directo en el navegador (Chrome recomendado)

═══════════════════════════════════════════════════════════
PRECIOS
═══════════════════════════════════════════════════════════
PLAN ESTÁNDAR: $10 USD/mes (mensual, cancela cuando quieras)
PROMO FUNDADORES: $10 USD/mes PERPETUO (precio fijo de por vida)
  → Solo 10 lugares disponibles para los primeros usuarios
  → Incluye acceso a todas las funciones actuales y futuras
  → Sin aumentos de precio nunca

═══════════════════════════════════════════════════════════
VS COMPETENCIA (ZOOM/OBS/SKYPE)
═══════════════════════════════════════════════════════════
PROBLEMA CON ZOOM/OBS:
- Requiere: Piano → Cable MIDI → Interfaz de audio → DAW → OBS → Streaming
- Configurar audio routing toma 30-60 minutos
- Zoom comprime el audio (destruye matices del piano)
- No pueden ver qué teclas tocas en tiempo real
- Compartir pantalla de partituras es estático y consume recursos

PIANO LINK RESUELVE TODO:
- Setup: Conecta piano USB/MIDI → Abre navegador → Listo (2 minutos)
- MIDI en alta definición sin compresión
- Alumno ve teclas iluminándose en tiempo real
- Partituras se sincronizan automáticamente
- Whiteboard para anotar encima de la partitura
- Latencia optimizada para música (< 100ms)

═══════════════════════════════════════════════════════════
FAQ - OBJECIONES COMUNES
═══════════════════════════════════════════════════════════
"¿Por qué no uso Zoom gratis?"
→ Zoom degrada el audio, no muestra teclas, requiere OBS para setup profesional.

"¿Funciona con mi piano?"
→ Sí, cualquier piano/teclado con salida MIDI o USB funciona.

"¿Necesito instalar algo?"
→ No, funciona 100% en el navegador. Solo Chrome o Edge.

"¿Puedo probarlo antes?"
→ Sí, hay demo gratuita. Agenda una sesión de prueba.

"¿Qué pasa si cancelo?"
→ Sin compromisos, cancelas cuando quieras. Los fundadores mantienen su precio.

═══════════════════════════════════════════════════════════
REGLAS DE RESPUESTA
═══════════════════════════════════════════════════════════
- Máximo 2 oraciones concisas y naturales
- Responde EXACTAMENTE lo que preguntan
- Usa datos específicos (precios, tiempos, comparaciones)
- Si preguntan por el fundador, menciona a Miguel Ángel (Miseal)
- Si no hay oportunidad clara de venta: responde "null"
- Tono: profesional pero cercano, como un colega que ayuda`;

// === KEYWORDS PARA PRE-FILTRO (reduce llamadas innecesarias -40%) ===
const SALES_KEYWORDS = [
    'precio', 'costo', 'pagar', 'gratis', 'free', 'cuanto', 'mensualidad',
    'obs', 'zoom', 'skype', 'alternativa', 'comparar', 'diferencia', 'mejor', 'peor',
    'funciona', 'característica', 'ventaja', 'beneficio', 'ofrece', 'incluye',
    'probar', 'demo', 'prueba', 'trial',
    'interesa', 'duda', 'pensar', 'decidir',
    'setup', 'configurar', 'instalar', 'complejo', 'fácil', 'difícil',
    'calidad', 'audio', 'latencia', 'delay', 'sincronizar',
    'partitura', 'midi', 'piano', 'teclas', 'anotar'
];

/**
 * Pre-filtro inteligente: verifica si la conversación tiene keywords de venta
 * Reduce llamadas innecesarias a Gemini en ~40%
 */
function hasRelevantKeywords(buffer) {
    const recentText = buffer.buffer
        .slice(-3) // Solo últimos 3 mensajes
        .map(m => m.text.toLowerCase())
        .join(' ');
    
    return SALES_KEYWORDS.some(keyword => recentText.includes(keyword));
}

// === BUFFER CIRCULAR ===
class CircularBuffer {
    constructor(maxSize = 20) {
        this.buffer = [];
        this.maxSize = maxSize;
    }
    
    push(item) {
        this.buffer.push(item);
        if (this.buffer.length > this.maxSize) {
            this.buffer.shift();
        }
    }
    
    getContext() {
        return this.buffer.map(m => `[${m.speaker}]: ${m.text}`).join('\n');
    }
    
    clear() {
        this.buffer = [];
    }
    
    get length() {
        return this.buffer.length;
    }
}

// === ESTADO POR SALA ===
const roomStates = new Map(); // roomCode → { buffer, lastCall, enabled }

// === MÉTRICAS ===
const metrics = {
    transcriptsReceived: 0,
    geminiCalls: 0,
    hintsGenerated: 0,
    throttledCalls: 0,
    errors: 0,
    lastError: null
};

// === FUNCIONES PRINCIPALES ===

/**
 * Carga ejemplos "dorados" de la base de datos
 * Usa cache para evitar queries constantes
 */
async function loadExamples() {
    const now = Date.now();
    
    // Usar cache si aún es válido
    if (cachedExamples.length > 0 && (now - lastExampleLoad) < EXAMPLE_CACHE_TTL) {
        return cachedExamples;
    }
    
    try {
        cachedExamples = await PLBExample.getActiveExamples(10);
        lastExampleLoad = now;
        console.log(`[PLB] 📚 ${cachedExamples.length} ejemplos cargados del profesor`);
        return cachedExamples;
    } catch (error) {
        console.warn('[PLB] ⚠️ Error cargando ejemplos:', error.message);
        return cachedExamples; // Retornar cache anterior si hay error
    }
}

/**
 * Construye la sección de ejemplos para el prompt
 */
function buildExamplesSection(examples) {
    if (!examples || examples.length === 0) {
        return '';
    }
    
    let section = `\n═══════════════════════════════════════════════════════════
EJEMPLOS DE RESPUESTAS CORRECTAS (aprende de estos)
═══════════════════════════════════════════════════════════\n`;
    
    examples.forEach((ex, i) => {
        section += `\nEjemplo ${i + 1}:
Contexto: "${ex.context}"
Respuesta correcta: "${ex.improvedResponse}"\n`;
    });
    
    return section;
}

/**
 * Guarda una mejora del profesor
 */
async function saveImprovement(data) {
    try {
        const example = new PLBExample({
            context: data.context,
            originalResponse: data.originalResponse,
            improvedResponse: data.improvedResponse,
            teacherEmail: data.teacherEmail,
            category: detectCategory(data.context)
        });
        
        await example.save();
        
        // Invalidar cache para que se cargue en próxima llamada
        lastExampleLoad = 0;
        
        console.log(`[PLB] 💾 Mejora guardada: "${data.improvedResponse.substring(0, 50)}..."`);
        
        return { success: true, id: example._id };
    } catch (error) {
        console.error('[PLB] ❌ Error guardando mejora:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Detecta categoría automáticamente basado en keywords
 */
function detectCategory(text) {
    const lower = text.toLowerCase();
    
    if (lower.includes('precio') || lower.includes('costo') || lower.includes('cuanto') || lower.includes('mensualidad')) {
        return 'precio';
    }
    if (lower.includes('zoom') || lower.includes('obs') || lower.includes('skype') || lower.includes('diferencia')) {
        return 'comparacion';
    }
    if (lower.includes('fundador') || lower.includes('quien') || lower.includes('creó') || lower.includes('miseal')) {
        return 'fundador';
    }
    if (lower.includes('pero') || lower.includes('no se') || lower.includes('gratis')) {
        return 'objecion';
    }
    if (lower.includes('funciona') || lower.includes('característica') || lower.includes('puede')) {
        return 'caracteristica';
    }
    
    return 'otro';
}

/**
 * Inicializa el cliente de Gemini (lazy loading)
 */
async function initGemini() {
    if (geminiModel) return geminiModel;
    
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.warn('[PLB] ⚠️ GEMINI_API_KEY no configurada - PLB deshabilitado');
        PLB_CONFIG.ENABLED = false;
        return null;
    }
    
    try {
        // Dynamic import para lazy loading
        const { GoogleGenerativeAI: GenAI } = await import('@google/generative-ai');
        GoogleGenerativeAI = GenAI;
        
        const genAI = new GoogleGenerativeAI(apiKey);
        geminiModel = genAI.getGenerativeModel({ 
            model: PLB_CONFIG.MODEL_NAME,
            generationConfig: {
                maxOutputTokens: PLB_CONFIG.MAX_OUTPUT_TOKENS,
                temperature: 0.7
            }
        });
        
        console.log(`[PLB] ✅ Gemini inicializado (modelo: ${PLB_CONFIG.MODEL_NAME})`);
        return geminiModel;
    } catch (error) {
        console.error('[PLB] ❌ Error inicializando Gemini:', error.message);
        metrics.errors++;
        metrics.lastError = error.message;
        PLB_CONFIG.ENABLED = false;
        return null;
    }
}

/**
 * Verifica si un usuario puede usar PLB
 */
function isUserAllowed(email) {
    if (!PLB_CONFIG.ENABLED) return false;
    if (!email) return false;
    return PLB_CONFIG.ALLOWED_EMAILS.includes(email.toLowerCase());
}

/**
 * Obtiene o crea el estado de una sala
 */
function getRoomState(roomCode) {
    if (!roomStates.has(roomCode)) {
        roomStates.set(roomCode, {
            buffer: new CircularBuffer(PLB_CONFIG.MAX_BUFFER_SIZE),
            lastCall: 0,
            enabled: true
        });
    }
    return roomStates.get(roomCode);
}

/**
 * Limpia el estado de una sala (cuando termina la clase)
 */
function clearRoomState(roomCode) {
    if (roomStates.has(roomCode)) {
        roomStates.get(roomCode).buffer.clear();
        roomStates.delete(roomCode);
        console.log(`[PLB] 🧹 Estado limpiado para sala: ${roomCode}`);
    }
}

/**
 * Procesa una transcripción y decide si generar un hint
 */
async function processTranscript(roomCode, userEmail, transcript) {
    metrics.transcriptsReceived++;
    
    // 1. Verificar feature flag
    if (!isUserAllowed(userEmail)) {
        return null;
    }
    
    // 2. Obtener estado de la sala
    const state = getRoomState(roomCode);
    
    // 3. Agregar al buffer
    state.buffer.push({
        speaker: transcript.speaker || 'unknown',
        text: transcript.text,
        timestamp: Date.now()
    });
    
    // 4. Verificar throttling
    const now = Date.now();
    if (now - state.lastCall < PLB_CONFIG.MIN_INTERVAL_MS) {
        metrics.throttledCalls++;
        console.log(`[PLB] ⏳ Throttled (${((PLB_CONFIG.MIN_INTERVAL_MS - (now - state.lastCall)) / 1000).toFixed(1)}s restantes)`);
        return null;
    }
    
    // 5. Verificar que hay suficiente contexto
    if (state.buffer.length < PLB_CONFIG.MIN_MESSAGES_FOR_CALL) {
        return null; // Esperar más conversación
    }
    
    // 5.5. PRE-FILTRO: Verificar keywords relevantes (optimización -40% llamadas)
    if (!hasRelevantKeywords(state.buffer)) {
        console.log('[PLB] 💤 Sin keywords relevantes - saltando llamada a Gemini');
        return null;
    }
    
    // 6. Llamar a Gemini
    try {
        state.lastCall = now;
        
        const model = await initGemini();
        if (!model) return null;
        
        // Cargar ejemplos del profesor (few-shot learning)
        const examples = await loadExamples();
        const examplesSection = buildExamplesSection(examples);
        
        const conversationContext = state.buffer.getContext();
        const userPrompt = `Conversación reciente en clase de piano:\n${conversationContext}\n\nSugiere qué decir ahora para cerrar la venta, o responde "null" si no hay oportunidad clara.`;
        
        console.log(`[PLB] 🧠 Llamando a Gemini (${state.buffer.length} msgs, ${examples.length} ejemplos)`);
        
        const startTime = Date.now();
        
        // Construir el prompt completo (system + ejemplos + user)
        const fullPrompt = `${SYSTEM_PROMPT}${examplesSection}\n\n---\n\n${userPrompt}`;
        
        const result = await model.generateContent(fullPrompt);
        
        const latency = Date.now() - startTime;
        metrics.geminiCalls++;
        
        const response = result.response.text().trim();
        
        // Ignorar si Gemini dice "null" o similar
        if (response.toLowerCase() === 'null' || response.length < 10) {
            console.log(`[PLB] 💤 Sin oportunidad detectada (${latency}ms)`);
            return null;
        }
        
        metrics.hintsGenerated++;
        console.log(`[PLB] 💡 Hint generado (${latency}ms): ${response.substring(0, 50)}...`);
        
        return {
            hint: response,
            latency: latency,
            timestamp: Date.now(),
            context: conversationContext // Contexto para feedback/mejora
        };
        
    } catch (error) {
        metrics.errors++;
        metrics.lastError = error.message;
        
        // Detectar errores de cuota específicos
        if (error.message.includes('429') || error.message.includes('RESOURCE_EXHAUSTED') || error.message.includes('quota')) {
            console.warn('[PLB] ⚠️ Cuota de Gemini excedida - esperando reset automático');
            // Aumentar el throttle temporalmente
            state.lastCall = now + 30000; // +30s extra de cooldown
        } else {
            console.error('[PLB] ❌ Error en Gemini:', error.message);
        }
        return null;
    }
}

/**
 * Obtiene métricas del servicio
 */
function getMetrics() {
    return {
        ...metrics,
        config: {
            enabled: PLB_CONFIG.ENABLED,
            allowedEmails: PLB_CONFIG.ALLOWED_EMAILS,
            throttleMs: PLB_CONFIG.MIN_INTERVAL_MS
        },
        activeRooms: roomStates.size
    };
}

/**
 * Toggle del servicio (kill switch)
 */
function setEnabled(enabled) {
    PLB_CONFIG.ENABLED = enabled;
    console.log(`[PLB] ${enabled ? '✅ Habilitado' : '❌ Deshabilitado'}`);
}

// === EXPORTS ===
module.exports = {
    processTranscript,
    isUserAllowed,
    clearRoomState,
    getMetrics,
    setEnabled,
    initGemini,
    PLB_CONFIG,
    saveImprovement,
    loadExamples
};
