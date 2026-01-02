# 🎛️ Smart Audio Bridge - Implementación Técnica

## 🎯 Filosofía de PianoLink

**PianoLink NO es una videoconferencia convencional**. Es un sistema de transmisión de instrumentos de alta fidelidad donde:

- **MIDI** = Canal puro y digital para la música
- **Agora Audio** = Canal estrictamente vocal para instrucciones

El eco se produce cuando el sonido acústico del piano físico es capturado por el micrófono de Agora, compitiendo con el MIDI limpio.

---

## 🔧 Arquitectura del Smart Audio Bridge

### 1. **Intercepción Web Audio API**

**Ubicación**: `VideoManager.js` → `_setupAudioBridge()`

```javascript
// Obtener MediaStreamTrack del LocalAudioTrack de Agora
var mediaStreamTrack = self.localAudioTrack.getMediaStreamTrack();
var mediaStream = new MediaStream([mediaStreamTrack]);

// Crear cadena de procesamiento DSP
self.micSourceNode = self.audioContext.createMediaStreamSource(mediaStream);
self.micGainNode = self.audioContext.createGain();
self.micFilterNode = self.audioContext.createBiquadFilter();
self.micDestination = self.audioContext.createMediaStreamDestination();
```

**Cadena de procesamiento**:
```
MediaStream → Source → HighPass (400Hz) → Gain → Destination → Agora
```

---

### 2. **High-Pass Filter @ 400Hz**

**Propósito**: Eliminar resonancia grave del piano físico

```javascript
self.micFilterNode.type = 'highpass';
self.micFilterNode.frequency.value = 400; // Hz
self.micFilterNode.Q.value = 0.7;         // Transición suave
```

**Resultado**:
- ❌ Elimina: Impacto de teclas, resonancia del mueble
- ✅ Conserva: Claridad vocal del profesor

---

### 3. **MIDI-Aware Ducking**

**Ubicación**: `VideoManager.js` → `_connectMidiDucking()`

#### 🎹 MIDI Activity Detected → Atenuación Instantánea

```javascript
bus.on('local-note', function(data) {
    // DUCKING: 100% → 10% en 20ms (exponencial)
    self.micGainNode.gain.cancelScheduledValues(currentTime);
    self.micGainNode.gain.exponentialRampToValueAtTime(
        0.1,  // 10% de volumen
        currentTime + 0.02  // 20ms attack
    );
});
```

**Parámetros**:
- **Attack**: 20ms exponencial (evita 'pops')
- **Ducked Level**: 10% (permite instrucciones verbales durante ejecución)

#### 🎤 MIDI Silence → Recuperación Automática

```javascript
// Esperar 1 segundo de silencio MIDI
self.duckingTimeoutId = setTimeout(function() {
    // FADE-IN: 10% → 100% en 800ms (lineal)
    self.micGainNode.gain.linearRampToValueAtTime(
        1.0,  // 100% volumen normal
        recoveryTime + 0.8  // 800ms release
    );
}, 1000);  // 1s threshold
```

**Parámetros**:
- **Silence Threshold**: 1000ms (1 segundo sin notas MIDI)
- **Release**: 800ms lineal (fade-in suave)

---

### 4. **Zero Latency Experience**

**Problema**: El profesor escucha dos fuentes:
1. Piano físico (directo, 0ms latencia)
2. AudioScheduler (tonos web, redundante)

**Solución**: Silenciar AudioScheduler local cuando video está activo

#### En `AudioScheduler.js`:

```javascript
// Master Gain Node
this.masterGain = this.ctx.createGain();
this.masterGain.gain.value = 1.0;
this.masterGain.connect(this.ctx.destination);

// Método de control
setMasterVolume(volume) {
    this.masterGain.gain.value = volume; // 0.0 = mute, 1.0 = normal
}
```

#### En `VideoManager.js`:

```javascript
// Al unirse al canal
self._muteLocalAudioScheduler(true);  // Silencia tonos web locales

// Al salir del canal
self._muteLocalAudioScheduler(false); // Reactiva tonos web
```

#### En `Main.js`:

```javascript
bus.on('video-mute-audio-scheduler', function(data) {
    audio.scheduler.setMasterVolume(data.muted ? 0.0 : 1.0);
});
```

**Resultado**:
- ✅ Profesor escucha solo su piano físico (0ms latencia)
- ✅ Alumno recibe audio procesado por Agora (con ducking + filtro)

---

## 📊 Flujo de Datos

### Escenario: Profesor tocando el piano

```
┌─────────────────────────────────────────────────────────────┐
│ PROFESOR                                                     │
│                                                              │
│  Piano Físico ──→ Escucha Directa (0ms)                    │
│       │                                                      │
│       ├──→ MIDI ──→ Socket ──→ ALUMNO (Digital puro)       │
│       │                                                      │
│       └──→ Micrófono ──→ Smart Audio Bridge ──→ Agora      │
│                           │                                  │
│                           ├─ HighPass 400Hz                 │
│                           ├─ Ducking (10% durante MIDI)     │
│                           └─ Gain Recovery (800ms)          │
│                                                              │
│  AudioScheduler (SILENCIADO - no suena localmente)         │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ ALUMNO                                                       │
│                                                              │
│  Recibe:                                                     │
│   1. MIDI limpio ──→ Piano digital (alta fidelidad)        │
│   2. Audio Agora ──→ Voz del profesor (procesada)          │
│                                                              │
│  Resultado: Música perfecta + instrucciones claras          │
└─────────────────────────────────────────────────────────────┘
```

---

## 🎚️ Parámetros de Configuración

| Parámetro | Valor | Propósito |
|-----------|-------|-----------|
| **High-Pass Frequency** | 400 Hz | Eliminar resonancia grave del piano |
| **High-Pass Q** | 0.7 | Transición suave, sin artefactos |
| **Ducking Attack** | 20 ms | Atenuación instantánea sin 'pops' |
| **Ducking Level** | 10% (0.1) | Permite instrucciones verbales durante ejecución |
| **Ducking Release** | 800 ms | Fade-in suave post-silencio |
| **MIDI Silence Threshold** | 1000 ms | Tiempo sin notas para considerar "silencio" |

---

## ✅ Checklist de Integración

- [x] **VideoManager.js**: Smart Audio Bridge implementado
  - [x] Web Audio API: Source → Filter → Gain → Destination
  - [x] High-Pass Filter @ 400Hz
  - [x] MIDI-aware ducking con exponential/linear ramps
  - [x] Cleanup en `leaveChannel()`

- [x] **AudioScheduler.js**: Master Gain Node
  - [x] `masterGain` creado en `init()`
  - [x] Voces conectadas a `masterGain` en lugar de `destination`
  - [x] Método `setMasterVolume()` expuesto

- [x] **Main.js**: Event listener
  - [x] `bus.on('video-mute-audio-scheduler')` implementado
  - [x] Llama a `audio.scheduler.setMasterVolume()`

---

## 🧪 Testing

### Test 1: Ducking Instantáneo
1. Conectar video
2. Tocar una nota en el piano físico
3. **Resultado esperado**: Micrófono se atenúa a 10% en 20ms

### Test 2: Recuperación Automática
1. Tocar piano y detenerse
2. Esperar 1 segundo
3. **Resultado esperado**: Micrófono vuelve a 100% en 800ms (fade-in suave)

### Test 3: Zero Latency
1. Activar video
2. Tocar piano físico
3. **Resultado esperado**: 
   - Profesor escucha piano directo (no tonos web)
   - Alumno recibe MIDI + audio Agora procesado

### Test 4: High-Pass Filter
1. Golpear teclas fuertemente
2. **Resultado esperado**: Impacto mecánico filtrado (solo voz clara)

---

## 📈 Mejoras Futuras (Opcionales)

1. **Dynamic Filter Adjustment**: Ajustar frecuencia del High-Pass según intensidad MIDI
2. **Spectral Gate**: Suprimir frecuencias específicas del piano en tiempo real
3. **Voice Activity Detection (VAD)**: Desactivar ducking si se detecta voz durante MIDI
4. **Adaptive Ducking**: Nivel de atenuación variable según dinámica del piano

---

## 🚀 Status

**Estado**: ✅ COMPLETADO E INTEGRADO

**Archivos modificados**:
- `public/js/modules/VideoManager.js`
- `public/js/core/AudioScheduler.js`
- `public/js/Main.js`

**Sistema**: Automático e invisible para el usuario. No requiere configuración manual.

---

**Implementado por**: GitHub Copilot (Claude Sonnet 4.5)  
**Fecha**: 28 de Diciembre, 2025  
**Filosofía**: "La música es digital. La comunicación es vocal. Nunca deben competir."
