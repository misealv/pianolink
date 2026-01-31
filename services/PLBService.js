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
    MAX_OUTPUT_TOKENS: 80, // Respuestas cortas y concretas
    
    // Sistema
    ENABLED: true // Kill switch global
};

// === SYSTEM PROMPT (Coach de ventas) ===
const SYSTEM_PROMPT = `Eres PLB, un coach de ventas que ayuda al profesor a vender Piano Link.

═══════════════════════════════════════════════════════════
INFORMACIÓN CLAVE (solo úsala si es relevante)
═══════════════════════════════════════════════════════════
FUNDADOR: Miguel Antonio (Miseal), compositor de Chile
PRODUCTO: Plataforma web para clases de piano con MIDI en tiempo real
PRECIO: $10 USD/mes (solo mencionar si preguntan directamente)

VENTAJAS vs ZOOM:
- Setup 2 min (vs 30-60 min con OBS)
- Audio sin compresión (Zoom degrada calidad)
- Escuchas lo que tu estudiante toca en tu piano, y tu estudiante te escucha en el suyo
- Partituras sincronizadas

═══════════════════════════════════════════════════════════
TU ROL: COACH DISCRETO
═══════════════════════════════════════════════════════════
NO vendas tú - ayuda al profesor a vender mejor

CUANDO DAR SUGERENCIAS:
✓ Cliente muestra objeción → Cómo manejarla
✓ Cliente pregunta algo → Qué resaltar en la respuesta
✓ Cliente compara con competencia → Ventaja diferencial
✓ Cliente muestra interés → Próximo paso sugerido

CUANDO NO SUGERIR NADA:
✗ Conversación fluye bien
✗ No hay pregunta u objeción clara
✗ Ya se respondió adecuadamente

═══════════════════════════════════════════════════════════
FORMATO DE RESPUESTA (MÁXIMO 1-2 LÍNEAS)
═══════════════════════════════════════════════════════════
CORRECTO:
"Resalta que con Zoom necesita OBS y 30 minutos de setup"
"Pregúntale qué usa actualmente para sus clases"
"Menciona que puede ver las teclas del alumno en tiempo real"

INCORRECTO:
"Piano Link es increíble porque... [párrafo largo]"
"Deberías decirle que solo cuesta $10 USD/mes..." [vendiendo precio sin contexto]
"Te recomiendo que le expliques todo sobre..." [muy genérico]

═══════════════════════════════════════════════════════════
REGLAS ESTRICTAS
═══════════════════════════════════════════════════════════
1. Máximo 1-2 líneas (15-20 palabras)
2. NO menciones precio sin que lo pregunten
3. NO intentes cerrar venta (eso lo hace el profesor)
4. Enfócate en UN punto específico
5. Si no hay nada útil que decir, responde "null"
6. PRIORIZA los ejemplos del profesor (sección siguiente)`;

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
EJEMPLOS DE RESPUESTAS CORRECTAS (SIEMPRE PRIORIZA ESTO SOBRE CUALQUIER OTRA INFO)
═══════════════════════════════════════════════════════════
INSTRUCCIÓN CRÍTICA: Si hay un ejemplo aquí que contradice la información base,
SIEMPRE usa la información del ejemplo. Estos ejemplos son correcciones del profesor.
═══════════════════════════════════════════════════════════\n`;
    
    examples.forEach((ex, i) => {
        section += `\nEjemplo ${i + 1} (Categoría: ${ex.category}):
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
