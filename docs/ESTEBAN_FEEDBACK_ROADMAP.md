# PianoLink — Documento Técnico de Requerimientos & Roadmap
## Origen: Feedback de Esteban (Uruguay) — Feb 2026

---

## 1. Categorización de Prioridades

| # | Requerimiento | Prioridad | Justificación |
|---|---------------|-----------|---------------|
| 1 | **Refactor Lógica de Eco** (mutear mic estudiante por detección de voz, no mutear al profesor por MIDI) | **P0** | Bloqueante pedagógico. El eco destruye el flujo de clase y confunde al alumno. Sin resolver esto, las clases online no compiten con la presencialidad. |
| 2 | **Visual Piano Decay** (persistencia de notas ajustable) | **P1** | Impacta la legibilidad visual pero no bloquea la clase. Mejora directa de UX con bajo costo de implementación. |
| 3 | **Upgrade Infraestructura Video** (evaluar Zoom SDK / Daily.co vs Agora actual) | **P1** | La latencia de audio es crítica para músicos. Agora ya es un SDK de pago; la pregunta real es si otro proveedor ofrece mejor latencia + "Original Sound". |
| 4 | **Feature Multicámara** (webcam + cenital simultáneas) | **P2** | Alto valor pedagógico pero alta complejidad técnica. Requiere dual-publish en el SDK de video + UX de layout. |
| 5 | **Módulo de Recursos Sincronizados** (Jamming Mode: metrónomo, audio/video compartido) | **P2** | Feature diferenciador de alto impacto, pero la sincronización sub-50ms entre peers es un problema de ingeniería complejo. Requiere la infraestructura de video estable primero. |

---

## 2. Análisis Técnico Detallado

### 2.1 — P0: Refactor de Lógica de Eco

#### Estado Actual (Problema)

El sistema tiene **Smart Audio Bridge** en [VideoManager.js](../public/js/modules/VideoManager.js#L910-L985):

```
Flujo ACTUAL (incorrecto para clase de piano):
─────────────────────────────────────────────
Profesor toca piano
  → bus.emit('local-note')
  → Smart Audio Bridge detecta MIDI local
  → localAudioTrack.setVolume(0)  ← MUTEA EL MIC DEL PROPIO TOCADOR
  → 1s sin MIDI → fade-in 1.5s

Problema: Esto mutea al PROFESOR cuando él toca. Pero el eco real viene
del ALUMNO: el audio del piano del profesor sale por los parlantes del
alumno → el micrófono del alumno lo recoge → vuelve al profesor como eco.
```

#### Solución Requerida

```
Flujo CORRECTO:
───────────────
Profesor toca piano
  → Audio llega a los parlantes del alumno
  → Micrófono del alumno recoge ese audio (= eco potencial)
  → SISTEMA DETECTA VOZ vs PIANO en el stream del alumno
  → Si es eco de piano → mutear mic del alumno
  → Si el alumno HABLA → dejar pasar (el profesor necesita oírlo)
```

#### Arquitectura Propuesta: Voice Activity Detection (VAD) + Echo Gate

```
┌─────────────────────────────────────────────────────────┐
│  LADO ESTUDIANTE (browser)                              │
│                                                         │
│  Mic Input ──→ AnalyserNode ──→ VAD Engine              │
│                     │              │                     │
│                     │         ┌────┴────┐               │
│                     │         │ ¿Es voz │               │
│                     │         │ humana? │               │
│                     │         └────┬────┘               │
│                     │          SI  │  NO                 │
│                     │          ▼      ▼                  │
│                     │      PASS   GATE/MUTE             │
│                     │              │                     │
│  Señal de control ◄─┘   Ducking inteligente             │
│  del profesor           (sube vol solo si hay voz)       │
│  (MIDI activity flag)                                   │
└─────────────────────────────────────────────────────────┘
```

**Componentes técnicos:**

| Componente | Tecnología | Detalle |
|------------|------------|---------|
| **VAD (Voice Activity Detection)** | `@ricky0123/vad-web` o `hark.js` | Detecta presencia de voz humana vs ruido/música. `vad-web` usa modelo ONNX (Silero VAD), alta precisión. `hark.js` es más ligero pero menos preciso. |
| **Spectral Analysis** | Web Audio `AnalyserNode` + FFT | El piano tiene armónicos predecibles (frecuencias fundamentales 27.5Hz–4186Hz). La voz humana está en 85Hz–3400Hz pero con formantes específicos. Se puede usar análisis espectral para distinguir piano de voz. |
| **MIDI Activity Flag** | Señal del profesor vía socket | El profesor ya emite `local-note`. El servidor puede redirigir un flag `teacher-is-playing: true/false` al alumno. El alumno activa el gate SOLO cuando el profesor toca. |
| **GainNode Gate** | Web Audio API | `GainNode` entre el mic y el `MediaStreamTrack` de Agora. Se controla con la salida del VAD. |

**Flujo detallado:**

1. Profesor toca → servidor emite `teacher-midi-activity: true` al alumno
2. Alumno recibe el flag → activa el **Echo Gate**
3. Echo Gate analiza el audio del mic del alumno:
   - **VAD detecta voz** → `gainNode.gain.value = 1.0` (deja pasar, el alumno quiere hablar)
   - **VAD NO detecta voz** (solo eco de piano) → `gainNode.gain.value = 0.0` (mutea, es eco)
4. Profesor deja de tocar → 2s de gracia → desactiva Echo Gate → audio normal

**Parámetros sugeridos:**

```javascript
const ECHO_GATE_CONFIG = {
  // Activación
  teacherActivityDebounce: 500,    // ms para considerar "profesor tocando"
  releaseGraceMs: 2000,            // ms después de que el profesor deja de tocar

  // VAD
  vadSensitivity: 0.7,             // 0-1, qué tan sensible a la voz
  vadFrameSize: 1536,              // Samples por frame de análisis

  // Gate
  attackMs: 50,                    // Rapidez de apertura del gate
  releaseMs: 300,                  // Rapidez de cierre (evitar cortes abruptos)

  // Fallback: si no hay VAD, usar simple energy threshold
  energyThreshold: -45,            // dB, umbral de energía para considerar "sonido real"
};
```

**⚠️ [BUSINESS LOGIC RISK]** El ducking actual en `VideoManager.js` mutea al tocador local. Si se refactoriza, hay que:
- Remover el bloque `_handleMidiDucking()` de [VideoManager.js L910-985](../public/js/modules/VideoManager.js#L910-L985)
- Crear un nuevo módulo `EchoGateManager.js` que viva en `public/js/modules/`
- El `AudioStateManager.js` debe integrar el nuevo modo en sus perfiles
- Testear con conexiones reales Uruguay↔Servidor para medir la latencia del flag

---

### 2.2 — P1: Visual Piano Decay

#### Estado Actual

Múltiples timers actúan sobre la persistencia visual:

| Timer | Valor actual | Archivo |
|-------|-------------|---------|
| UI Watchdog | 3s | [UIManager.js L337](../public/js/modules/UIManager.js#L337) |
| Whiteboard TTL | 8s | [Whiteboard.js L46-50](../public/js/modules/Whiteboard.js#L46-L50) |
| MidiState Watchdog | 3s | [MidiStateManager.js L27](../public/js/core/MidiStateManager.js#L27) |
| Silent Panic | 12s | [AudioEngine.js L318-340](../public/js/modules/AudioEngine.js#L318-L340) |
| Stale Keys cleanup | 2s | [UIManager.js L370-385](../public/js/modules/UIManager.js#L370-L385) |

**Nota del usuario (Esteban):** "Las notas se limpian a los 10 segundos" — esto probablemente refiere al **Whiteboard TTL (8s)** o al **Silent Panic (12s)**, percibido como ~10s.

#### Solución Propuesta: Decay Configurable + Algoritmo Inteligente

**Opción A — Control Manual (MVP):**

```javascript
// Nuevo: Panel de configuración del profesor
const DECAY_PRESETS = {
  FAST:     { uiWatchdog: 2000, whiteboardTTL: 4000,  label: 'Rápido (práctica)' },
  NORMAL:   { uiWatchdog: 3000, whiteboardTTL: 8000,  label: 'Normal' },
  SLOW:     { uiWatchdog: 5000, whiteboardTTL: 15000, label: 'Lento (análisis)' },
  PERSIST:  { uiWatchdog: null, whiteboardTTL: 30000, label: 'Persistente (dictado)' },
};
```

**Opción B — Algoritmo Inteligente (V2):**

```javascript
// Decay adaptativo basado en contexto
function calculateDecay(context) {
  // Si el profesor está tocando lento (>500ms entre notas) → más persistencia
  // Si hay mucha actividad (tempo rápido) → decay rápido para legibilidad
  // Si el alumno tiene el sustain pedal pisado → extender TTL
  // Si solo hay 1-4 notas activas → persistir más (están analizando)

  const noteDensity = activeNotes.size;
  const avgInterval = getAverageNoteInterval(last10Notes);

  if (noteDensity <= 4 && avgInterval > 800) return DECAY_PRESETS.PERSIST;
  if (noteDensity > 8 || avgInterval < 200)  return DECAY_PRESETS.FAST;
  return DECAY_PRESETS.NORMAL;
}
```

**Implementación:** Crear `DecayConfigManager.js` en `public/js/core/` que centralice todos los timers y exponga una API para que el profesor los ajuste desde la UI.

---

### 2.3 — P2: Feature Multicámara

#### Requisito

```
┌──────────────────────────────────────────┐
│           Vista del Alumno               │
│                                          │
│  ┌──────────────┐  ┌──────────────────┐  │
│  │  Cámara web  │  │  Piano Visual    │  │
│  │  (profesor)  │  │  (88 teclas +    │  │
│  │              │  │   whiteboard)    │  │
│  └──────────────┘  │                  │  │
│  ┌──────────────┐  │                  │  │
│  │  Cenital     │  │                  │  │
│  │  (manos en   │  │                  │  │
│  │  teclado)    │  │                  │  │
│  └──────────────┘  └──────────────────┘  │
└──────────────────────────────────────────┘
```

#### Viabilidad con Agora

Agora soporta **dual-publish** (publicar dos video tracks simultáneos). El approach:

1. **Profesor** publica 2 tracks de video:
   - Track 1: `createCameraVideoTrack({ cameraId: webcamId })` — cara
   - Track 2: `createCustomVideoTrack(overheadStream)` — cenital vía `getDisplayMedia` o segunda cámara USB

2. **Alumno** se suscribe a ambos tracks del profesor.

3. **Layout**: El `DraggableVideo.js` existente ya soporta ventanas arrastrables. Se extendería para manejar 2 feeds del mismo usuario.

#### Riesgos

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| Ancho de banda x2 | Alto | Cenital a 240p/10fps (100kbps). Webcam mantiene 360p/15fps. Total ~700kbps. |
| Segundo dispositivo USB | Medio | Guía al profesor para configurar la cámara. No es transparente. |
| Complejidad de UI | Medio | Layouts predefinidos ("Cara+Piano", "Solo manos", "Split view"). |
| Costo Agora | Bajo | El dual-publish cuenta como 2 streams pero en 1:1 el costo adicional es marginal. |

---

### 2.4 — P2: Módulo de Recursos Sincronizados (Jamming Mode)

#### El Problema de la Latencia

Para "tocar encima" de un recurso compartido, ambos deben escuchar el audio **al mismo tiempo**. La sincronización perfecta es imposible en internet, pero se puede lograr una experiencia aceptable:

```
Latencia máxima aceptable para Jamming:
  - Ensemble musical: < 25ms (imposible en internet)
  - "Practicable":     < 50ms (posible en LAN / mismo datacenter)
  - "Usable con truco": < 150ms (posible con compensación)

Latencia real PianoLink (Uruguay ↔ Servidor):
  - Socket.io RTT estimado: 80-200ms
  - AudioScheduler jitter buffer: 120ms
  - Total: 200-320ms (NO apto para jamming real)
```

#### Solución: "Fake Sync" (Jamming Local)

En lugar de enviar audio en tiempo real entre ambos, **cada lado reproduce el recurso localmente** con sincronización de reloj:

```
┌──── Profesor ────┐              ┌──── Alumno ─────┐
│                  │   Socket.io  │                  │
│ "Play metrónomo │──────────────►│ "Play metrónomo │
│  @ tempo=120     │  sync msg    │  @ tempo=120     │
│  @ startTime=T"  │              │  @ startTime=T"  │
│                  │              │                  │
│ Audio local ♪    │              │ Audio local ♪    │
│ (sin streaming)  │              │ (sin streaming)  │
└──────────────────┘              └──────────────────┘
```

**Componentes:**

1. **SyncedMetronome.js**: Metrónomo con `AudioContext.currentTime` + offset NTP
   - Ya existe clock sync en Main.js (NTP básico cada 10s) — se reutiliza
   - `startTime = serverTime + 1000` (1s de buffer para que ambos empiecen igual)

2. **SyncedPlayer.js**: Reproductor de audio/video con seek sincronizado
   - Ambos cargan el mismo archivo (URL de Cloudinary)
   - Comandos: `play(serverTimestamp)`, `pause()`, `seek(position)`
   - Compensación: `localPlayPosition = commandedPosition + (localTime - commandTime)`

3. **ResourcePanel.js**: UI para el profesor
   - Subir audio/video → Cloudinary
   - Compartir metrónomo con BPM ajustable
   - Visualización de compás compartido

---

## 3. Evaluación de Proveedor: Agora (actual) vs Zoom Video SDK vs Daily.co

### Contexto

PianoLink **ya usa Agora.io** (no WebRTC nativo). La evaluación es si migrar a otro SDK justifica el costo y esfuerzo.

| Criterio | Agora.io (actual) | Zoom Video SDK | Daily.co |
|----------|-------------------|----------------|----------|
| **Latencia típica** | 200-400ms (modo `rtc`) | 150-300ms | 200-400ms |
| **Original Sound for Musicians** | ❌ No nativo. Se puede simular con `ANS:false, AGC:false`. | ✅ **Sí.** Feature dedicado que desactiva TODA la DSP chain. | ❌ No. Ofrece krisp noise suppression toggle pero no "original sound". |
| **Codec de audio** | Opus (configurable) | Opus + propio | Opus |
| **Sample rate máximo** | 48kHz estéreo (con `musicMode`) | 48kHz estéreo (Original Sound) | 48kHz |
| **Supresión de eco** | Configurable (on/off por track) | Configurable | Configurable |
| **Dual-stream video** | ✅ Sí | ✅ Sí (multi-stream) | ✅ Sí (custom tracks) |
| **Pricing (1:1, por minuto)** | ~$0.99/1000 min (SD) | ~$0.04/min/participant (!!!) | ~$0.08/min participante activo |
| **Pricing mensual (100 clases × 60min = 6000min)** | ~$6-12 USD | **~$480 USD** | ~$480 USD |
| **SDK Size** | ~500KB | ~2MB | ~300KB (iframe) |
| **Server regions SA** | São Paulo ✅ | São Paulo ✅ | São Paulo ✅ |
| **Esfuerzo de migración** | N/A (ya implementado) | 🔴 Alto (API diferente, auth diferente, UI rebuild) | 🟡 Medio (API similar, iframe option) |
| **Community / Soporte** | Bueno | Excelente | Excelente |

### Veredicto

**⚠️ [BUSINESS LOGIC RISK]** Zoom Video SDK es **~40x más caro** que Agora para el volumen actual. El "Original Sound for Musicians" es su killer feature, pero Agora puede aproximarse con `ANS: false, AGC: false, AEC: true` (que ya está configurado en [VideoManager.js L835-845](../public/js/modules/VideoManager.js#L835-L845)).

**Recomendación:** 

1. **Quedarse con Agora** y optimizar la configuración actual:
   - Habilitar `musicMode: true` en el audio track de Agora (desactiva DSP avanzada)
   - Cambiar de `vp8` a `vp9` para mejor compresión a mismo bitrate
   - Explorar Agora `ULTRA_LOW_LATENCY` mode
   - Configurar `audioScenario: 'AUDIO_SCENARIO_HIGH_DEFINITION'`

2. **Si en el futuro** el volumen justifica el costo (>500 alumnos activos), reevaluar Zoom Video SDK por su "Original Sound" nativo.

3. **Daily.co** no ofrece ventajas claras sobre Agora para este caso de uso y es más caro.

---

## 4. Roadmap de Implementación

### Fase MVP (4-6 semanas)

**Objetivo:** Resolver el bloqueante de eco + mejorar la experiencia visual.

| Semana | Tarea | Entregable |
|--------|-------|------------|
| 1-2 | **P0: Echo Gate — Fase 1** | Nuevo módulo `EchoGateManager.js`. Implementar flag `teacher-midi-activity` Server→Alumno. Gate básico con detección de energía (sin VAD aún). |
| 2-3 | **P0: Echo Gate — Fase 2** | Integrar `@ricky0123/vad-web` para detección de voz precisa. Testing con Esteban. |
| 3 | **P0: Cleanup legacy ducking** | Remover `_handleMidiDucking()` de VideoManager.js. Actualizar `AudioStateManager.js` perfiles. |
| 4 | **P1: Decay Configurable — MVP** | `DecayConfigManager.js` con presets (Rápido/Normal/Lento/Persistente). Selector en UI del profesor. |
| 5 | **P1: Agora Audio Hardening** | Activar `musicMode`, probar `AUDIO_SCENARIO_HIGH_DEFINITION`, ajustar codec. |
| 5-6 | **QA + Deploy** | Testing integral con profesor real, ajuste de parámetros. |

### Fase V2 (6-8 semanas, post-MVP)

**Objetivo:** Recursos compartidos y decay inteligente.

| Semana | Tarea | Entregable |
|--------|-------|------------|
| 1-2 | **P2: Metrónomo Sincronizado** | `SyncedMetronome.js` con clock sync NTP existente. UI de control para profesor. |
| 3-4 | **P2: Reproductor Compartido** | `SyncedPlayer.js` — reproducción de audio sincronizada (Cloudinary URLs). |
| 5 | **P1: Decay Inteligente** | Algoritmo adaptativo basado en densidad de notas y tempo. |
| 6-7 | **P2: Resource Panel UI** | Panel lateral para el profesor: metrónomo, archivos, compartir recursos. |
| 8 | **QA + Deploy** | Testing con múltiples profesores. |

### Fase V3 (8-10 semanas, post-V2)

**Objetivo:** Multicámara y features avanzados.

| Semana | Tarea | Entregable |
|--------|-------|------------|
| 1-3 | **P2: Multicámara — Backend** | Dual-publish en Agora. Server tracking de múltiples tracks por usuario. |
| 4-5 | **P2: Multicámara — Frontend** | Extensión de `DraggableVideo.js` para layout multi-feed. Presets de layout. |
| 6-7 | **P2: Video Sync** | Reproducción de video compartido (YouTube embeds sincronizados o Cloudinary). |
| 8-9 | **P2: Jamming Mode** | Integrar metrónomo + reproductor + MIDI en un modo unificado "Jam Session". |
| 10 | **QA + Deploy** | Beta con 5 profesores. |

---

## 5. Riesgos y Dependencias

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|------------|
| VAD consume demasiada CPU en dispositivos viejos del alumno | Media | Alto | Tener fallback a detección por energía simple. Silero VAD ~2% CPU. |
| El clock sync NTP es insuficiente para jamming | Alta | Medio | Implementar NTP más robusto (más muestras, mediana en vez de promedio). Documentar que Jamming Mode requiere <100ms RTT. |
| Profesor no tiene segunda cámara USB | Media | Bajo | Feature multicámara es opt-in. Guía de compra de cámaras cenitales económicas. |
| Alumnos con internet pobre (Uruguay rural) | Media | Alto | Modo "solo audio" exist. Multicámara debe degradar gracefully. |
| Costo de Agora escala con multicámara | Baja | Medio | Cenital a 240p mantiene el costo bajo. Monitor de uso en dashboard admin. |

---

## 6. Métricas de Éxito

| Métrica | Baseline (actual) | Target MVP | Target V3 |
|---------|-------------------|------------|-----------|
| Reportes de eco por semana | ~? (no medido) | 0 | 0 |
| NPS de experiencia de audio | No medido | >7/10 | >8.5/10 |
| Duración promedio de clase | Medir actual | +10% | +20% |
| Profesores usando multicámara | 0 | N/A | >30% |
| Retención mensual de alumnos | Medir actual | +5% | +15% |

---

*Documento generado: Feb 2026 — Feedback Esteban (UY)*
*Stack actual: Node.js + Socket.io + Agora.io + Web MIDI API + VexFlow*
