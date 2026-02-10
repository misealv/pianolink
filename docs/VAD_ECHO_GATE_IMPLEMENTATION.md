# VAD + Echo Gate — Documentación de Implementación

## Resumen Ejecutivo

PianoLink implementa un sistema de **Voice Activity Detection (VAD)** combinado con un **Echo Gate inteligente** para resolver el problema de eco en clases de piano online. Cuando el profesor toca piano, su audio llega al alumno por Agora, sale por los parlantes del alumno, y el micrófono del alumno lo recoge enviándolo de vuelta como eco. La solución detecta si el alumno está **hablando** (dejar pasar) o si solo captura **eco de piano** (mutear).

---

## 1. El Problema Original

```
Profesor toca piano
  → Audio viaja vía Agora al alumno
  → Sale por parlantes del alumno
  → Micrófono del alumno lo captura
  → Se envía de vuelta al profesor como ECO
  → El profesor escucha su propio piano con delay → inusable
```

### Sistema anterior (Smart Audio Bridge — `_handleMidiDucking`)

El enfoque legacy en `VideoManager.js` muteaba el micrófono del **propio tocador** al detectar MIDI local. Esto era incorrecto: muteaba al profesor mientras tocaba, pero el eco real viene del lado del alumno.

```
ANTES (incorrecto):
  Profesor toca → su propio mic se mutea → no resuelve el eco del alumno
```

---

## 2. Arquitectura de la Solución

### Flujo completo

```
┌─────────── SERVIDOR (server.js) ──────────────────────────┐
│                                                            │
│  Profesor toca MIDI → teacherActiveNotes.add(noteId)       │
│                     → teacherActiveNotes.size > 0          │
│                     → emit('teacher-playing-state', {      │
│                         playing: true,                     │
│                         noteCount: N,                      │
│                         timestamp: Date.now()              │
│                       })                                   │
│                                                            │
│  Profesor suelta → teacherActiveNotes.delete(noteId)       │
│                  → teacherActiveNotes.size === 0           │
│                  → emit('teacher-playing-state', {         │
│                      playing: false, ...                   │
│                    })                                      │
└────────────────────────────────────────────────────────────┘
                          │ socket.io
                          ▼
┌─────────── ALUMNO (browser) ──────────────────────────────┐
│                                                            │
│  SocketClient.js                                           │
│    └→ bus.emit('teacher-playing-state', data)               │
│                          │                                 │
│  EchoGateManager.js      ▼                                 │
│    ┌────────────────────────────────────┐                   │
│    │  Profesor tocando?                │                   │
│    │    SÍ → Activar análisis          │                   │
│    │         ┌──────────────────┐      │                   │
│    │         │ Silero VAD (ONNX)│      │                   │
│    │         │ ~96ms/frame      │      │                   │
│    │         │ P(voz) > 0.45?   │      │                   │
│    │         └────┬────┬────────┘      │                   │
│    │           SÍ │    │ NO            │                   │
│    │              ▼    ▼               │                   │
│    │         ABRIR   CERRAR            │                   │
│    │         GATE    GATE              │                   │
│    │    NO → Gate abierto (normal)     │                   │
│    └────────────────────────────────────┘                   │
│                          │                                 │
│    agoraAudioTrack.setVolume(100 ó 0)                      │
└────────────────────────────────────────────────────────────┘
```

### Componentes involucrados

| Componente | Archivo | Rol |
|------------|---------|-----|
| **Tracking MIDI del profesor** | [server.js](../server.js#L822) | Rastrea `teacherActiveNotes` y emite `teacher-playing-state` |
| **Relay del evento** | [SocketClient.js](../public/js/modules/SocketClient.js#L188) | Recibe el socket event y lo publica en el EventBus |
| **Echo Gate Manager** | [EchoGateManager.js](../public/js/modules/EchoGateManager.js) | Módulo principal: VAD + gate |
| **Carga de assets** | [index.html](../public/index.html#L666) | Scripts CDN de ONNX Runtime + vad-web + EchoGateManager |
| **Legacy (deshabilitado)** | [VideoManager.js](../public/js/modules/VideoManager.js#L920) | `_connectMidiDucking()` ahora es no-op |

---

## 3. Detección de Voz: Dos Modos

### 3.1 Modo Primario — Silero VAD (`@ricky0123/vad-web`)

Modelo de red neuronal ONNX ejecutado directamente en el browser del alumno.

**Librería:** `@ricky0123/vad-web@0.0.29`  
**Runtime:** `onnxruntime-web@1.22.0`  
**Modelo:** Silero VAD (pre-entrenado, ~2MB)  
**Precisión:** >95% distinguiendo voz humana de otros sonidos  
**Consumo CPU:** ~2%  
**Latencia por frame:** ~96ms

#### Carga del modelo

```javascript
// CDN en index.html
<script src="https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/ort.wasm.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.29/dist/bundle.min.js"></script>
```

#### Inicialización

```javascript
vad.MicVAD.new({
    positiveSpeechThreshold: 0.45,  // P(voz) ≥ 0.45 → voz detectada
    negativeSpeechThreshold: 0.20,  // P(voz) ≤ 0.20 → no es voz
    redemptionFrames: 7,            // ~600ms de gracia antes de declarar "fin"
    minSpeechFrames: 2,             // ~150ms mínimo para confirmar habla
    preSpeechPadFrames: 2,          // ~100ms de audio previo al inicio
    startOnLoad: false,             // Se activa manualmente cuando el profesor toca
    
    // Callbacks
    onFrameProcessed: function(probabilities) { ... },
    onSpeechStart: function() { ... },     // → abrir gate
    onSpeechEnd: function(audio) { ... }   // → cerrar gate
});
```

#### Parámetros clave

| Parámetro | Valor | Significado |
|-----------|-------|-------------|
| `positiveSpeechThreshold` | 0.45 | Probabilidad mínima para declarar "voz presente" |
| `negativeSpeechThreshold` | 0.20 | Probabilidad máxima para declarar "no hay voz" |
| `redemptionMs` | 600 | Gracia antes de confirmar fin de habla (evita cortes entre palabras) |
| `minSpeechMs` | 150 | Duración mínima para que un sonido se considere "habla real" |
| `preSpeechPadMs` | 100 | Audio previo que se incluye al detectar inicio de habla |

La **zona muerta** entre 0.20 y 0.45 genera histéresis: evita que el gate oscile rápidamente entre abierto/cerrado.

### 3.2 Modo Fallback — Análisis Espectral (FFT)

Si Silero VAD no carga (CDN caído, browser incompatible, etc.), el sistema cae automáticamente a análisis por energía espectral con `AnalyserNode` de Web Audio API.

**Algoritmo:**
1. FFT de 2048 puntos sobre el audio del micrófono
2. Calcula energía total vs energía en la banda de voz humana (300–3400 Hz)
3. Si el ratio `voiceEnergy / totalEnergy > 0.35` y la energía total supera -30 dBFS → voz detectada
4. Histéresis por frames: necesita 2 frames consecutivos con voz para abrir, 4 sin voz para cerrar

**Lógica de la diferenciación:**
- **Piano:** energía distribuida uniformemente entre 27 Hz y 4186 Hz (todas las teclas)
- **Voz humana:** energía concentrada en formantes entre 300 Hz y 3400 Hz
- **Clave:** si >35% de la energía total está en la banda vocal → probablemente es voz, no piano

#### Parámetros FFT

| Parámetro | Valor | Significado |
|-----------|-------|-------------|
| `fftSize` | 2048 | Resolución espectral |
| `voiceMinHz` | 300 | Límite inferior de formantes vocales |
| `voiceMaxHz` | 3400 | Límite superior de formantes vocales |
| `energyThreshold` | -45 dBFS | Umbral mínimo para considerar "hay sonido" |
| `voiceEnergyThreshold` | -30 dBFS | Umbral para considerar "voz fuerte" |
| `voiceRatioThreshold` | 0.35 | Ratio energía vocal / total |
| `analysisIntervalMs` | 50 | Frecuencia de análisis (20 veces/seg) |
| `consecutiveFramesForVoice` | 2 | Frames seguidos con voz para abrir gate |
| `consecutiveFramesForMute` | 4 | Frames seguidos sin voz para cerrar gate |

---

## 4. Señal del Servidor: `teacher-playing-state`

### Emisión (server.js)

El servidor rastrea las notas MIDI activas del profesor en un `Set` por sala:

```javascript
// Dentro del handler de 'midi-data'
if (stateChanged && socket.userRole === 'teacher') {
    const isTeacherPlaying = room.teacherActiveNotes.size > 0;
    
    // Solo emitir cambios de estado (no en cada nota)
    if (room._lastTeacherPlayingState !== isTeacherPlaying) {
        room._lastTeacherPlayingState = isTeacherPlaying;
        socket.broadcast.to(roomCode).emit('teacher-playing-state', {
            playing: isTeacherPlaying,
            noteCount: room.teacherActiveNotes.size,
            timestamp: Date.now()
        });
    }
}
```

**Optimización:** solo emite cuando cambia el estado (`playing: true → false` o viceversa), no en cada nota individual. Esto reduce tráfico de socket significativamente.

**Seguridad:** `teacherActiveNotes` tiene un límite de 128 notas para prevenir memory leaks (notas "pegadas" por pedal sustain o MIDI perdido).

### Recepción (SocketClient.js → EchoGateManager.js)

```javascript
// SocketClient.js
this.socket.on("teacher-playing-state", (data) => {
    this.bus.emit("teacher-playing-state", data);
});

// EchoGateManager.js escucha el evento del bus
this.bus.on('teacher-playing-state', function(data) {
    if (data.playing) {
        self._onTeacherStartPlaying();
    } else {
        self._onTeacherStopPlaying();
    }
});
```

---

## 5. Control del Gate

### Apertura (alumno habla)

```javascript
EchoGateManager.prototype._openGate = function() {
    if (this._gateOpen) return;
    this._gateOpen = true;
    
    // Restaurar volumen del track de Agora
    this._agoraAudioTrack.setVolume(100);
    this.bus.emit('echo-gate-state', { open: true });
};
```

### Cierre (eco detectado)

```javascript
EchoGateManager.prototype._closeGate = function() {
    if (!this._gateOpen) return;
    this._gateOpen = false;
    
    // Mutear track de Agora
    this._agoraAudioTrack.setVolume(0);
    this.bus.emit('echo-gate-state', { open: false });
};
```

### Gracia al soltar notas

Cuando el profesor deja de tocar, hay un **release timer de 2000ms** antes de desactivar el gate. Esto cubre:
- Sustain/resonancia del piano que sigue sonando
- Pausas breves entre frases musicales
- Delay de red en la señal `teacher-playing-state`

```javascript
this._releaseTimer = setTimeout(function() {
    self._teacherPlaying = false;
    self._stopAnalysis();
    self._openGate(); // Restaurar audio normal
}, CONFIG.releaseGraceMs); // 2000ms
```

---

## 6. Ciclo de Vida del Módulo

```
1. Main.js instancia EchoGateManager({ bus, userRole })
2. .init()
   ├─ Si userRole === 'teacher' → NO-OP (el profesor no necesita gate)
   └─ Si userRole === 'student' →
       ├─ _bindBusEvents()         // Conectar listeners
       └─ _initVAD()              // Cargar Silero (async)
           ├─ OK → modo = 'vad'
           └─ FAIL → modo = 'fft' (fallback)
3. Evento 'video-joined-channel' → _tryConnectToAgoraTrack()
4. Evento 'teacher-playing-state' (playing: true)
   ├─ modo 'vad' → _startVADListening() + _closeGate()
   └─ modo 'fft' → setInterval(_analyzeFrame, 50ms) + _closeGate()
5. VAD: onSpeechStart → _openGate()  |  onSpeechEnd → _closeGate()
   FFT: voiceRatio > 0.35 → _openGate()  |  < 0.35 → _closeGate()
6. Evento 'teacher-playing-state' (playing: false)
   → 2s gracia → _stopAnalysis() + _openGate()
7. .destroy() → libera VAD, AudioContext, timers, AnalyserNode
```

---

## 7. Métricas y Diagnóstico

El módulo expone `getMetrics()` para debug en consola:

```javascript
echoGateManager.getMetrics();
// →
{
    gateActivations: 12,      // Veces que se activó el gate
    voiceDetections: 8,       // Veces que detectó voz del alumno
    echoBlocks: 45,           // Veces que bloqueó eco de piano
    lastSpeechProb: 0.72,     // Última probabilidad VAD (0-1)
    lastEnergy: -28.5,        // Último nivel de energía FFT (dBFS)
    lastVoiceRatio: 0.41,     // Último ratio vocal/total FFT
    avgLatency: 85,           // Latencia promedio del flag (ms)
    vadLoadTimeMs: 1250,      // Tiempo de carga del modelo Silero
    mode: 'vad',              // Modo activo: 'vad' | 'fft' | 'none'
    isActive: true,           // ¿Profesor tocando?
    gateOpen: false,          // ¿Gate abierto? (false = muteado)
    hasAnalyser: true,        // ¿AnalyserNode conectado?
    vadReady: true,           // ¿Modelo Silero cargado?
    vadSpeaking: false        // ¿VAD detecta habla ahora?
}
```

---

## 8. Dependencias Externas

| Librería | Versión | CDN | Tamaño | Propósito |
|----------|---------|-----|--------|-----------|
| `onnxruntime-web` | 1.22.0 | jsDelivr | ~2.5MB (WASM) | Runtime para ejecutar modelo ONNX en browser |
| `@ricky0123/vad-web` | 0.0.29 | jsDelivr | ~2MB (modelo Silero) | Wrapper de Silero VAD para Web |

Ambas se cargan vía CDN en [index.html](../public/index.html#L666):

```html
<script src="https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/ort.wasm.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.29/dist/bundle.min.js"></script>
<script src="/js/modules/EchoGateManager.js"></script>
```

---

## 9. Integración con el Resto del Sistema

### Legacy Deshabilitado

`VideoManager._connectMidiDucking()` fue reemplazado por un **no-op**:

```javascript
// VideoManager.js — línea 930
VideoManager.prototype._connectMidiDucking = function() {
    console.log('[VideoManager] ℹ️ Ducking MIDI legacy deshabilitado — delegado a EchoGateManager');
};
```

### EventBus Events

| Evento | Dirección | Payload | Usado por |
|--------|-----------|---------|-----------|
| `teacher-playing-state` | Server → Alumno | `{ playing: bool, noteCount: int, timestamp: int }` | EchoGateManager |
| `echo-gate-state` | Local (alumno) | `{ open: bool }` | UI, diagnóstico |
| `video-joined-channel` | Local | — | EchoGateManager (conectar track) |
| `video-left-channel` | Local | — | EchoGateManager (cleanup) |

### API Pública

```javascript
echoGateManager.init();                     // Inicializar
echoGateManager.setAudioTrack(agoraTrack);  // Cambiar track
echoGateManager.setEnabled(false);          // Deshabilitar manualmente
echoGateManager.getMetrics();               // Diagnóstico
echoGateManager.getMode();                  // 'vad' | 'fft' | 'none'
echoGateManager.destroy();                  // Liberar recursos
```

---

## 10. Resumen de Decisiones de Diseño

| Decisión | Justificación |
|----------|---------------|
| **Gate en el alumno, no en el profesor** | El eco se origina en el micrófono del alumno. Mutear al profesor no resuelve nada. |
| **Silero VAD como primario** | >95% precisión distinguiendo voz de música. Modelo pre-entrenado con millones de muestras. |
| **FFT como fallback** | Garantiza funcionamiento aunque falle el CDN o el browser no soporte WASM/ONNX. |
| **`startOnLoad: false`** | El VAD solo escucha cuando el profesor toca, no permanentemente. Ahorra CPU. |
| **señal basada en estado (no en notas)** | Solo emitimos cambios `true→false` / `false→true`, no cada `noteOn/noteOff`. Reduce tráfico. |
| **Release grace de 2s** | Cubre sustain de piano + pausas musicales cortas. El eco no desaparece instantáneamente al soltar una tecla. |
| **Histéresis en ambos modos** | Evita "flickering" del gate (abrir-cerrar-abrir rápidamente). El VAD usa `redemptionFrames`, el FFT usa contadores de frames consecutivos. |
| **Control vía `setVolume()` de Agora** | Más simple y compatible que insertar un `GainNode` en la cadena de audio. No requiere modificar el routing de WebRTC. |
| **Solo activo para rol `student`** | Profesores y admins no necesitan el gate porque no recogen eco. |

---

*Implementado: Febrero 2026*  
*Módulo principal: `public/js/modules/EchoGateManager.js` (742 líneas)*
