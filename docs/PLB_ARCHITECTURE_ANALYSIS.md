# 🧠 PLB (Piano Link Brain) - Análisis de Arquitectura IA

**Fecha:** 30 de Enero 2026  
**Versión:** 1.0 - DISEÑO PRE-IMPLEMENTACIÓN  
**Objetivo:** Integrar Gemini 1.5 Flash como asistente de ventas/pedagógico SIN degradar MIDI

---

## 📊 RESUMEN EJECUTIVO

| Aspecto | Evaluación | Riesgo |
|---------|------------|--------|
| **Impacto en MIDI** | ✅ NULO | 🟢 Bajo |
| **Carga Servidor Render** | ⚠️ MODERADO | 🟡 Medio |
| **Carga Cliente** | ⚠️ VARIABLE | 🟡 Medio |
| **Factibilidad** | ✅ VIABLE | 🟢 Bajo |

**Veredicto:** El sistema es VIABLE si se implementa con las optimizaciones propuestas.

---

## 🏗️ FASE 1: DISEÑO DE ARQUITECTURA

### 1.1 Diagrama de Flujo de Datos

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        PLB - FLUJO DE DATOS                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                  │
│  │   PROFESOR   │    │   INVITADO   │    │   DEMO USER  │                  │
│  │  (Micrófono) │    │  (Micrófono) │    │ demo@piano.. │                  │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘                  │
│         │                   │                   │                          │
│         ▼                   ▼                   ▼                          │
│  ┌─────────────────────────────────────────────────────────────┐           │
│  │              WEB SPEECH API (CLIENTE)                       │           │
│  │   • SpeechRecognition (nativo navegador)                    │           │
│  │   • Procesa audio → texto LOCAL                             │           │
│  │   • NO envía audio al servidor                              │           │
│  └─────────────────────────────────────────────────────────────┘           │
│                              │                                             │
│                              │ Solo TEXTO (muy ligero)                     │
│                              ▼                                             │
│  ┌─────────────────────────────────────────────────────────────┐           │
│  │              SOCKET.IO (Evento: 'plb-transcript')           │           │
│  │   Payload: { text: "...", speaker: "teacher|guest" }        │           │
│  │   Tamaño típico: 50-200 bytes                               │           │
│  └─────────────────────────────────────────────────────────────┘           │
│                              │                                             │
│                              ▼                                             │
│  ┌─────────────────────────────────────────────────────────────┐           │
│  │              MIDDLEWARE IA (server.js)                      │           │
│  │                                                             │           │
│  │   1. GATE: ¿Es demo@pianolink.com? ───NO──→ [IGNORAR]      │           │
│  │                    │                                        │           │
│  │                   YES                                       │           │
│  │                    ▼                                        │           │
│  │   2. BUFFER: Acumular ~10s de conversación                 │           │
│  │                    │                                        │           │
│  │                    ▼                                        │           │
│  │   3. THROTTLE: ¿Pasaron 15s desde última llamada?          │           │
│  │                    │                                        │           │
│  │                   YES                                       │           │
│  │                    ▼                                        │           │
│  │   4. GEMINI API: Enviar contexto + transcripción           │           │
│  │                    │                                        │           │
│  │                    ▼                                        │           │
│  │   5. RESPONSE: Sugerencia de venta/pedagógica              │           │
│  │                                                             │           │
│  └─────────────────────────────────────────────────────────────┘           │
│                              │                                             │
│                              ▼                                             │
│  ┌─────────────────────────────────────────────────────────────┐           │
│  │              HUD (Cliente - Solo para profesor)             │           │
│  │                                                             │           │
│  │   ┌─────────────────────────────────────────────────┐      │           │
│  │   │  💡 Sugerencia PLB:                             │      │           │
│  │   │  "El invitado mencionó 'precio'. Momento ideal  │      │           │
│  │   │   para mencionar los $10 USD vs OBS/Zoom"       │      │           │
│  │   └─────────────────────────────────────────────────┘      │           │
│  │                                                             │           │
│  └─────────────────────────────────────────────────────────────┘           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Arquitectura de Componentes

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     ARQUITECTURA PLB - COMPONENTES                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ╔═══════════════════════════════════════════════════════════════════════╗ │
│  ║                         CLIENTE (Navegador)                            ║ │
│  ╠═══════════════════════════════════════════════════════════════════════╣ │
│  ║                                                                        ║ │
│  ║  ┌────────────────────┐    ┌────────────────────┐                     ║ │
│  ║  │  PLBTranscriber.js │    │   PLBHud.js        │                     ║ │
│  ║  │  ─────────────────  │    │  ─────────────────  │                     ║ │
│  ║  │  • Web Speech API   │    │  • Overlay UI       │                     ║ │
│  ║  │  • Audio → Texto    │───▶│  • Muestra tips     │                     ║ │
│  ║  │  • Buffer local     │    │  • Animación sutil  │                     ║ │
│  ║  │  • Throttling       │    │  • Auto-dismiss     │                     ║ │
│  ║  └────────────────────┘    └────────────────────┘                     ║ │
│  ║           │                         ▲                                  ║ │
│  ║           │ Socket.io               │ Socket.io                        ║ │
│  ║           ▼                         │                                  ║ │
│  ╚═══════════════════════════════════════════════════════════════════════╝ │
│                              │         │                                    │
│                              │         │                                    │
│  ╔═══════════════════════════════════════════════════════════════════════╗ │
│  ║                         SERVIDOR (Node.js)                             ║ │
│  ╠═══════════════════════════════════════════════════════════════════════╣ │
│  ║                                                                        ║ │
│  ║  ┌─────────────────────────────────────────────────────────────────┐  ║ │
│  ║  │                   PLBMiddleware.js                               │  ║ │
│  ║  │  ───────────────────────────────────────────────────────────────  │  ║ │
│  ║  │                                                                   │  ║ │
│  ║  │   1. FEATURE FLAG                                                 │  ║ │
│  ║  │      ┌─────────────────────────────────────────┐                 │  ║ │
│  ║  │      │ if (user.email !== 'demo@pianolink.com')│                 │  ║ │
│  ║  │      │     return; // EARLY EXIT               │                 │  ║ │
│  ║  │      └─────────────────────────────────────────┘                 │  ║ │
│  ║  │                                                                   │  ║ │
│  ║  │   2. CONVERSATION BUFFER (Map por sala)                          │  ║ │
│  ║  │      ┌─────────────────────────────────────────┐                 │  ║ │
│  ║  │      │ plbBuffers = new Map()                  │                 │  ║ │
│  ║  │      │ // roomCode → { messages: [], lastCall }│                 │  ║ │
│  ║  │      └─────────────────────────────────────────┘                 │  ║ │
│  ║  │                                                                   │  ║ │
│  ║  │   3. GEMINI CLIENT (Lazy-loaded)                                 │  ║ │
│  ║  │      ┌─────────────────────────────────────────┐                 │  ║ │
│  ║  │      │ const genAI = new GoogleGenerativeAI() │                 │  ║ │
│  ║  │      │ model: 'gemini-1.5-flash'              │                 │  ║ │
│  ║  │      │ maxOutputTokens: 150                    │                 │  ║ │
│  ║  │      └─────────────────────────────────────────┘                 │  ║ │
│  ║  │                                                                   │  ║ │
│  ║  └─────────────────────────────────────────────────────────────────┘  ║ │
│  ║                                                                        ║ │
│  ╚═══════════════════════════════════════════════════════════════════════╝ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.3 Diseño del HUD Minimalista

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     SALA DE CLASES - CON HUD PLB                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                                                                        │ │
│  │     ╔════════════════════════════════════════════════════════════╗    │ │
│  │     ║                      PARTITURA PDF                          ║    │ │
│  │     ║                                                             ║    │ │
│  │     ║                                                             ║    │ │
│  │     ║                                                             ║    │ │
│  │     ║                                                             ║    │ │
│  │     ║                                                             ║    │ │
│  │     ║                                                             ║    │ │
│  │     ╚════════════════════════════════════════════════════════════╝    │ │
│  │                                                                        │ │
│  │  ┌────────────────────────────────────────────────────────────────┐   │ │
│  │  │ 🎹 Piano Virtual / MIDI Visualizer                              │   │ │
│  │  └────────────────────────────────────────────────────────────────┘   │ │
│  │                                                                        │ │
│  │  ┌──────────────────────────────────────────────────────────────────┐ │ │
│  │  │                                                                   │ │ │
│  │  │  ╭─────────────────────────────────────────────────────────────╮ │ │ │
│  │  │  │ 💡 PLB: El invitado preguntó por "alternativas". Ideal para │ │ │ │
│  │  │  │    mencionar que Piano Link elimina la necesidad de OBS.    │ │ │ │
│  │  │  ╰─────────────────────────────────────────────────────────────╯ │ │ │
│  │  │         ▲                                                         │ │ │
│  │  │         │ HUD: Posición fija, bottom-right                       │ │ │
│  │  │         │ Aparece con fade-in, desaparece en 15s                 │ │ │
│  │  │         │ Solo visible para rol: teacher                         │ │ │
│  │  │                                                                   │ │ │
│  │  └──────────────────────────────────────────────────────────────────┘ │ │
│  │                                                                        │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

ESPECIFICACIONES HUD:
─────────────────────
• Posición: fixed, bottom: 20px, right: 20px
• Ancho máximo: 350px
• Background: rgba(26, 26, 26, 0.95) con blur(10px)
• Border: 1px solid #ff764d (accent color de Piano Link)
• Animación: fadeIn 0.3s, auto-fadeOut después de 15s
• Z-index: 9000 (debajo de modales, arriba del contenido)
• Solo visible si localStorage.pianoUser.role === 'teacher'
```

---

## 📈 FASE 1: EVALUACIÓN DE IMPACTO EN RENDIMIENTO

### 2.1 Análisis de Latencia MIDI

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PIPELINE MIDI vs PLB - AISLAMIENTO                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  FLUJO MIDI (CRÍTICO - NO TOCAR):                                          │
│  ════════════════════════════════                                          │
│                                                                             │
│  Piano USB ──► WebMIDI ──► MidiBundler ──► Socket.io ──► Server Relay     │
│       │                         │              │                           │
│       │     Latencia actual:    │              │                           │
│       │     ~2-5ms local        │    ~20-40ms  │                           │
│       │                         │    network   │                           │
│       ▼                         ▼              ▼                           │
│   [INTOCABLE]              [INTOCABLE]    [INTOCABLE]                      │
│                                                                             │
│  ═══════════════════════════════════════════════════════════════════════   │
│                                                                             │
│  FLUJO PLB (NUEVO - COMPLETAMENTE SEPARADO):                               │
│  ═══════════════════════════════════════════                               │
│                                                                             │
│  Micrófono ──► Web Speech API ──► Buffer Local ──► Socket.io ──► Gemini   │
│       │              │                  │              │                   │
│       │   Proceso    │    Throttled     │   Evento     │                   │
│       │   nativo     │    cada ~10s     │   separado   │                   │
│       │   navegador  │                  │   'plb-*'    │                   │
│       ▼              ▼                  ▼              ▼                   │
│   [PARALELO]    [NO BLOQUEA]      [ASYNC]       [ASYNC]                   │
│                                                                             │
│  ═══════════════════════════════════════════════════════════════════════   │
│                                                                             │
│  VEREDICTO: ✅ CERO INTERFERENCIA                                          │
│  ──────────────────────────────────                                        │
│  • PLB usa eventos Socket.io DIFERENTES ('plb-transcript', 'plb-hint')     │
│  • MIDI usa eventos BINARIOS ('midi-binary')                               │
│  • NO comparten buffer, NO comparten lógica                                │
│  • Web Speech API corre en thread separado del navegador                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Conclusión MIDI:** El sistema PLB NO añadirá jitter porque:
1. Usa canales Socket.io completamente separados
2. Web Speech API es procesamiento nativo del navegador (no JS main thread)
3. Las llamadas a Gemini son async y no bloquean el event loop de MIDI

### 2.2 Análisis de Carga del Servidor (Render Free Tier)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    RENDER FREE TIER - ANÁLISIS DE RECURSOS                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  LÍMITES RENDER FREE:                                                       │
│  ────────────────────                                                       │
│  • RAM: 512 MB                                                              │
│  • CPU: Compartida (0.1 CPU)                                                │
│  • Bandwidth: 100 GB/mes                                                    │
│  • Sleep: Después de 15 min inactividad                                     │
│                                                                             │
│  ═══════════════════════════════════════════════════════════════════════   │
│                                                                             │
│  CONSUMO ACTUAL (Sin PLB):                                                  │
│  ─────────────────────────                                                  │
│  • RAM base Node.js: ~80 MB                                                 │
│  • Por conexión Socket.io: ~2-5 MB                                          │
│  • Clase activa (2 usuarios): ~90-100 MB                                    │
│  • Clase activa (10 usuarios): ~130-150 MB                                  │
│                                                                             │
│  CONSUMO ESTIMADO PLB:                                                      │
│  ────────────────────                                                       │
│  • Buffer de conversación por sala: ~10 KB (texto)                          │
│  • SDK Gemini (lazy-loaded): ~5 MB una vez                                  │
│  • Memoria por llamada API: ~100 KB temporal                                │
│                                                                             │
│  ═══════════════════════════════════════════════════════════════════════   │
│                                                                             │
│  PROYECCIÓN CON PLB ACTIVO:                                                 │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │                                                                     │    │
│  │   512 MB ──┬──────────────────────────────────────────────────────│    │
│  │            │░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│    │
│  │            │                                                       │    │
│  │   400 MB ──┼───────────────────────────── ZONA SEGURA ────────────│    │
│  │            │▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓                       │    │
│  │            │                                                       │    │
│  │   200 MB ──┼──────────────────────────────────────────────────────│    │
│  │            │████████████████████                                   │    │
│  │            │                                                       │    │
│  │     0 MB ──┴──────────────────────────────────────────────────────│    │
│  │            Sin PLB    Con PLB    Con PLB + 5 salas                │    │
│  │              │          │              │                          │    │
│  │            ~100MB    ~115MB         ~140MB                        │    │
│  │                                                                     │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  ✅ VEREDICTO: VIABLE en Free Tier con restricciones                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Restricciones Recomendadas:**
| Parámetro | Valor | Justificación |
|-----------|-------|---------------|
| Máx. salas con PLB | 3 simultáneas | Evitar saturación |
| Throttle Gemini | 15 segundos | Reducir API calls |
| Buffer máximo | 20 mensajes | Limitar memoria |
| Feature flag | demo@pianolink.com | Solo 1 usuario |

### 2.3 Análisis de Carga del Cliente (MacBook 2011, 4GB RAM)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CLIENTE - IMPACTO EN HARDWARE ANTIGUO                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  PROCESOS ACTUALES (Sin PLB):                                              │
│  ────────────────────────────                                              │
│  • Tab Chrome base: ~150 MB                                                 │
│  • WebRTC Video (Agora): ~200 MB                                            │
│  • AudioContext + MIDI: ~50 MB                                              │
│  • PDF.js Renderer: ~100 MB                                                 │
│  • Socket.io Client: ~20 MB                                                 │
│  ────────────────────────                                                  │
│  TOTAL ACTUAL: ~520 MB                                                      │
│                                                                             │
│  ═══════════════════════════════════════════════════════════════════════   │
│                                                                             │
│  PROCESO PLB ADICIONAL:                                                     │
│  ──────────────────────                                                     │
│  • Web Speech API: ~30-50 MB (proceso nativo del navegador)                │
│  • PLBTranscriber.js: ~5 MB                                                 │
│  • PLBHud.js: ~2 MB                                                         │
│  ────────────────────                                                      │
│  TOTAL PLB: ~40-60 MB adicionales                                          │
│                                                                             │
│  ═══════════════════════════════════════════════════════════════════════   │
│                                                                             │
│  PROYECCIÓN TOTAL: ~580 MB                                                  │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │  MacBook 2011 (4GB RAM):                                           │    │
│  │                                                                     │    │
│  │  4096 MB ──┬────────────────────────────────────────────────────  │    │
│  │            │ Sistema Operativo: ~1.5 GB                            │    │
│  │  2500 MB ──┼────────────────────────────────────────────────────  │    │
│  │            │ Disponible para apps: ~2.5 GB                         │    │
│  │            │                                                       │    │
│  │            │ ┌─────────────────────────────────────┐              │    │
│  │            │ │ Piano Link: ~580 MB                  │              │    │
│  │            │ │ ████████████████████████░░░░░░░░░░░ │              │    │
│  │            │ │         23% del disponible          │              │    │
│  │            │ └─────────────────────────────────────┘              │    │
│  │            │                                                       │    │
│  │     0 MB ──┴────────────────────────────────────────────────────  │    │
│  │                                                                     │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  ⚠️ VEREDICTO: VIABLE CON PRECAUCIONES                                     │
│                                                                             │
│  RIESGOS:                                                                   │
│  • Web Speech API consume CPU constantemente                                │
│  • En hardware muy antiguo, puede causar stuttering de video               │
│                                                                             │
│  MITIGACIÓN PROPUESTA:                                                      │
│  • PLB solo activo cuando NO hay video WebRTC activo                       │
│  • Botón toggle manual para activar/desactivar reconocimiento              │
│  • Detección automática de lag → auto-disable PLB                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🛠️ FASE 1: ESTRATEGIAS DE OPTIMIZACIÓN

### 3.1 Técnicas de Peso Ligero

```javascript
// ═══════════════════════════════════════════════════════════════════════════
// TÉCNICA 1: LAZY LOADING DEL SDK GEMINI
// ═══════════════════════════════════════════════════════════════════════════

let geminiClient = null;

async function getGeminiClient() {
    // Solo cargar cuando se necesite (primera llamada)
    if (!geminiClient) {
        const { GoogleGenerativeAI } = await import('@google/generative-ai');
        geminiClient = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    }
    return geminiClient;
}

// ═══════════════════════════════════════════════════════════════════════════
// TÉCNICA 2: THROTTLING INTELIGENTE
// ═══════════════════════════════════════════════════════════════════════════

const plbThrottle = {
    lastCall: 0,
    MIN_INTERVAL: 15000, // 15 segundos mínimo entre llamadas
    
    canCall() {
        const now = Date.now();
        if (now - this.lastCall < this.MIN_INTERVAL) return false;
        this.lastCall = now;
        return true;
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// TÉCNICA 3: BUFFER CIRCULAR (Límite de memoria)
// ═══════════════════════════════════════════════════════════════════════════

class CircularBuffer {
    constructor(maxSize = 20) {
        this.buffer = [];
        this.maxSize = maxSize;
    }
    
    push(item) {
        this.buffer.push(item);
        if (this.buffer.length > this.maxSize) {
            this.buffer.shift(); // FIFO: elimina el más antiguo
        }
    }
    
    getContext() {
        return this.buffer.join('\n');
    }
    
    clear() {
        this.buffer = [];
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// TÉCNICA 4: WEB WORKER PARA TRANSCRIPCIÓN (Cliente)
// ═══════════════════════════════════════════════════════════════════════════

// PLBWorker.js - Aísla el procesamiento del main thread
self.onmessage = function(e) {
    const { type, payload } = e.data;
    
    if (type === 'PROCESS_TRANSCRIPT') {
        // Análisis ligero de keywords (no bloquea UI)
        const keywords = ['precio', 'costo', 'alternativa', 'zoom', 'obs', 'gratis'];
        const found = keywords.filter(k => 
            payload.text.toLowerCase().includes(k)
        );
        
        if (found.length > 0) {
            self.postMessage({ type: 'KEYWORDS_FOUND', keywords: found });
        }
    }
};
```

### 3.2 Inyección de Contexto Óptima

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    OPTIMIZACIÓN DE TOKENS - PLAYBOOK                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ESTRATEGIA: SYSTEM PROMPT COMPACTO + CONTEXTO DINÁMICO                    │
│                                                                             │
│  ═══════════════════════════════════════════════════════════════════════   │
│                                                                             │
│  PUNTO ÓPTIMO DE INYECCIÓN: En la llamada a Gemini (server-side)           │
│                                                                             │
│  ¿Por qué servidor y no cliente?                                           │
│  • El playbook contiene info sensible (precios, estrategia)                │
│  • Evita exponer lógica de ventas en el frontend                           │
│  • Permite actualizar el playbook sin deploy del cliente                   │
│                                                                             │
│  ═══════════════════════════════════════════════════════════════════════   │
│                                                                             │
│  ESTRUCTURA DEL PROMPT (Optimizada para tokens):                           │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │  SYSTEM PROMPT (Fijo - ~150 tokens):                               │    │
│  │  ─────────────────────────────────────                             │    │
│  │  "Eres PLB, asistente de ventas de Piano Link.                     │    │
│  │   Producto: Plataforma de clases de piano online.                  │    │
│  │   Precio: $10 USD/mes. Fundadores: 10 slots a $10/mes de por vida. │    │
│  │   Ventaja vs OBS/Zoom: Sin configuración, MIDI sincronizado,       │    │
│  │   partituras compartidas.                                          │    │
│  │   Responde en 1-2 oraciones. Solo sugerencias, no guiones."       │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │  USER PROMPT (Dinámico - ~100-200 tokens):                         │    │
│  │  ─────────────────────────────────────────                         │    │
│  │  "Conversación reciente:                                           │    │
│  │   [Profe]: Entonces, ¿qué te pareció la clase?                    │    │
│  │   [Invitado]: Me gustó mucho, pero uso Zoom para mis otras clases │    │
│  │   [Profe]: Entiendo, Piano Link tiene ventajas específicas...     │    │
│  │                                                                     │    │
│  │   Sugiere qué decir ahora."                                        │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  TOTAL ESTIMADO: ~350 tokens input + ~50 tokens output = ~400 tokens       │
│  COSTO GEMINI 1.5 FLASH: ~$0.000075 por llamada                            │
│                                                                             │
│  CON THROTTLE DE 15s:                                                       │
│  • Clase de 1 hora = ~240 llamadas máximo                                  │
│  • Costo por clase = ~$0.018 (menos de 2 centavos)                         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 📊 FASE 1: MÉTRICAS DE MONITOREO

### 4.1 Métricas Críticas a Implementar

```javascript
// ═══════════════════════════════════════════════════════════════════════════
// MÉTRICAS SERVIDOR (Node.js)
// ═══════════════════════════════════════════════════════════════════════════

const plbMetrics = {
    // 1. EVENT LOOP LAG (Crítico para MIDI)
    eventLoopLag: {
        current: 0,
        threshold: 50, // ms - Si supera esto, PLB debe pausarse
        
        measure() {
            const start = process.hrtime.bigint();
            setImmediate(() => {
                const lag = Number(process.hrtime.bigint() - start) / 1e6;
                this.current = lag;
                
                if (lag > this.threshold) {
                    console.warn(`[PLB] ⚠️ Event loop lag: ${lag.toFixed(2)}ms`);
                    // Emitir evento para pausar PLB
                }
            });
        }
    },
    
    // 2. MEMORY USAGE
    memory: {
        checkInterval: 30000, // Cada 30s
        warningThreshold: 450 * 1024 * 1024, // 450 MB (de 512 MB)
        
        check() {
            const used = process.memoryUsage();
            const heapUsed = used.heapUsed;
            
            if (heapUsed > this.warningThreshold) {
                console.warn(`[PLB] ⚠️ Memoria alta: ${(heapUsed / 1024 / 1024).toFixed(2)} MB`);
                // Limpiar buffers de PLB
            }
            
            return {
                heapUsed: heapUsed,
                heapTotal: used.heapTotal,
                rss: used.rss,
                external: used.external
            };
        }
    },
    
    // 3. GEMINI API LATENCY
    geminiLatency: {
        samples: [],
        maxSamples: 100,
        
        record(ms) {
            this.samples.push(ms);
            if (this.samples.length > this.maxSamples) {
                this.samples.shift();
            }
        },
        
        getAverage() {
            if (this.samples.length === 0) return 0;
            return this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
        }
    },
    
    // 4. PLB-SPECIFIC COUNTERS
    counters: {
        transcriptsReceived: 0,
        geminiCalls: 0,
        hintsGenerated: 0,
        throttledCalls: 0,
        errors: 0
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// MÉTRICAS CLIENTE (Browser)
// ═══════════════════════════════════════════════════════════════════════════

const clientMetrics = {
    // 1. FRAME RATE (Detectar lag visual)
    fps: {
        frames: 0,
        lastTime: performance.now(),
        current: 60,
        
        tick() {
            this.frames++;
            const now = performance.now();
            if (now - this.lastTime >= 1000) {
                this.current = this.frames;
                this.frames = 0;
                this.lastTime = now;
                
                // Si FPS cae debajo de 30, considerar pausar PLB
                if (this.current < 30) {
                    console.warn(`[PLB Client] ⚠️ FPS bajo: ${this.current}`);
                }
            }
        }
    },
    
    // 2. WEB SPEECH API STATUS
    speechStatus: {
        isListening: false,
        errorCount: 0,
        lastError: null,
        
        onError(error) {
            this.errorCount++;
            this.lastError = error;
            
            if (this.errorCount > 5) {
                // Demasiados errores, desactivar PLB
                console.error('[PLB Client] Speech API fallando, desactivando...');
            }
        }
    }
};
```

### 4.2 Dashboard de Diagnóstico (Integrado al DiagnosticSidebar existente)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    DIAGNOSTIC SIDEBAR - SECCIÓN PLB                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  🧠 PLB Status                                              [ON/OFF] │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │                                                                      │   │
│  │  Speech API:     🟢 Listening                                       │   │
│  │  Last Hint:      12s ago                                            │   │
│  │  Gemini Latency: 234ms avg                                          │   │
│  │  Hints Today:    7                                                   │   │
│  │                                                                      │   │
│  │  ┌──────────────────────────────────────────────────────────────┐  │   │
│  │  │  Server Metrics:                                              │  │   │
│  │  │  • Event Loop Lag: 12ms ✅                                    │  │   │
│  │  │  • Memory: 145/512 MB ✅                                      │  │   │
│  │  │  • Throttled: 3 calls                                         │  │   │
│  │  └──────────────────────────────────────────────────────────────┘  │   │
│  │                                                                      │   │
│  │  [📊 Export Metrics] [🔄 Reset]                                     │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🚀 FASE 2: ESCALABILIDAD FUTURA - ANÁLISIS MIDI

### 5.1 Impacto de Análisis MIDI en Tiempo Real

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    FASE 2: ANÁLISIS MIDI PARA PLB PEDAGÓGICO                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ESCENARIO FUTURO:                                                          │
│  PLB analiza las ráfagas MIDI del estudiante para detectar:                │
│  • Errores de ritmo                                                         │
│  • Notas incorrectas vs partitura                                          │
│  • Patrones de práctica (repeticiones)                                     │
│  • Velocidad/dinámica inconsistente                                        │
│                                                                             │
│  ═══════════════════════════════════════════════════════════════════════   │
│                                                                             │
│  ARQUITECTURA PROPUESTA:                                                    │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │                                                                     │    │
│  │  MIDI In ──►┬──► [RELAY DIRECTO] ──► Otros usuarios (sin cambio)  │    │
│  │             │                                                       │    │
│  │             └──► [COPIA A PLB ANALYZER] ──► Buffer circular        │    │
│  │                         │                                           │    │
│  │                         ▼                                           │    │
│  │                   ┌───────────────┐                                │    │
│  │                   │ MIDI Analyzer │  (Ejecuta cada 5 segundos)     │    │
│  │                   │ ───────────── │                                │    │
│  │                   │ • Note stats  │                                │    │
│  │                   │ • Tempo calc  │                                │    │
│  │                   │ • Error detect│                                │    │
│  │                   └───────┬───────┘                                │    │
│  │                           │                                         │    │
│  │                           ▼                                         │    │
│  │                   [Agregar al contexto de Gemini]                  │    │
│  │                                                                     │    │
│  │  "Conversación: ... | MIDI Stats: 23 notas, 2 errores C4→C#4,     │    │
│  │   tempo 85% del objetivo"                                          │    │
│  │                                                                     │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  ═══════════════════════════════════════════════════════════════════════   │
│                                                                             │
│  IMPACTO EN RENDIMIENTO:                                                    │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────┐      │
│  │  Operación                    │  CPU Impact  │  Memory Impact    │      │
│  ├──────────────────────────────────────────────────────────────────┤      │
│  │  Buffer 500 notas             │  Mínimo      │  ~50 KB           │      │
│  │  Análisis cada 5s             │  2-5ms       │  ~10 KB temporal  │      │
│  │  Comparación vs partitura     │  10-20ms     │  +partitura cargada│     │
│  │  ─────────────────────────────────────────────────────────────────│      │
│  │  TOTAL ADICIONAL              │  ~25ms/5s    │  ~100 KB          │      │
│  └──────────────────────────────────────────────────────────────────┘      │
│                                                                             │
│  ✅ VEREDICTO: VIABLE                                                       │
│  • El análisis es OFFLINE (no en el hot path del MIDI)                     │
│  • Se ejecuta en intervalos, no en cada nota                               │
│  • Buffer circular previene memory leaks                                   │
│                                                                             │
│  ⚠️ CONSIDERACIÓN:                                                         │
│  • Necesitaría partitura en formato analizable (MusicXML o similar)        │
│  • El PDF actual no tiene data estructurada de notas                       │
│  • Posible solución: MIDI file de referencia subido con la partitura       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## ✅ CONCLUSIONES Y RECOMENDACIONES

### Resumen Ejecutivo

| Aspecto | Estado | Recomendación |
|---------|--------|---------------|
| **Latencia MIDI** | ✅ Sin impacto | Arquitectura separada garantiza aislamiento |
| **Servidor Render** | ⚠️ Viable con límites | Feature flag + throttling obligatorio |
| **Cliente antiguo** | ⚠️ Viable con toggle | Botón manual ON/OFF + auto-disable |
| **Costo Gemini** | ✅ Mínimo | ~$0.02/hora de clase |
| **Fase 2 (MIDI AI)** | ✅ Factible | Requiere formato de partitura estructurado |

### Próximos Pasos

1. **Implementar PLB v1** (solo transcripción + hints de venta)
2. **Probar en `demo@pianolink.com`** exclusivamente
3. **Monitorear métricas** por 2 semanas
4. **Evaluar Fase 2** después de validar rendimiento

---

**¿Procedo con la implementación del código?**
