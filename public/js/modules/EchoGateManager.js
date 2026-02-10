/**
 * EchoGateManager.js — Gate de eco inteligente para clases de piano (Fase 2)
 * 
 * PROBLEMA RESUELTO:
 * Cuando el profesor toca piano, su audio llega por los parlantes del alumno.
 * El micrófono del alumno recoge ese audio y lo envía de vuelta → ECO.
 * 
 * SOLUCIÓN:
 * Cuando el profesor está tocando (señal vía socket), se activa un gate en 
 * el micrófono del alumno que distingue entre:
 *   - Voz humana del alumno → DEJA PASAR (el profesor necesita oírlo)
 *   - Eco de piano → MUTEA (es audio repetido del profesor)
 * 
 * FASE 1: Detección por energía espectral (FFT) — FALLBACK
 * FASE 2: VAD con Silero (@ricky0123/vad-web) — PRIMARIO
 *   - Modelo ONNX ejecutado en el browser (~2% CPU)
 *   - Precisión >95% distinguiendo voz humana de otros sonidos
 *   - onFrameProcessed da probabilidad de voz cada ~96ms
 * 
 * @module EchoGateManager
 */

(function(global) {
    'use strict';

    // ================================================
    // CONFIGURACIÓN
    // ================================================
    const CONFIG = {
        // --- Activación por señal del profesor ---
        teacherActivityDebounce: 500,   // ms para considerar "profesor tocando"
        releaseGraceMs: 2000,           // ms después de que el profesor deja de tocar

        // --- VAD Silero (Fase 2 — detección primaria) ---
        vad: {
            positiveSpeechThreshold: 0.45,  // Probabilidad para considerar "voz" (0-1)
            negativeSpeechThreshold: 0.20,  // Probabilidad para considerar "no voz"
            redemptionMs: 600,              // ms de gracia antes de declarar fin de habla
            minSpeechMs: 150,               // Segmento mínimo para considerar "habla real"
            preSpeechPadMs: 100,            // Audio previo al inicio de habla
            // Rutas CDN para assets del modelo ONNX
            onnxWASMBasePath: 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/',
            baseAssetPath: 'https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.29/dist/',
        },

        // --- Gate por energía espectral (Fase 1 — fallback) ---
        energyThreshold: -45,           // dBFS mínimo para considerar "sonido"
        voiceEnergyThreshold: -30,      // dBFS mínimo para considerar "voz fuerte"
        fftSize: 2048,                  // Tamaño de FFT para AnalyserNode
        voiceMinHz: 300,                // Límite inferior de formantes vocales
        voiceMaxHz: 3400,               // Límite superior de formantes vocales
        attackMs: 30,                   // Rapidez de apertura (voz detectada)
        releaseMs: 200,                 // Rapidez de cierre (evitar cortes abruptos)

        voiceRatioThreshold: 0.35,      // Ratio energía vocal/total para "voz"

        // --- Histéresis (ambos modos) ---
        consecutiveFramesForVoice: 2,   // Frames con voz para abrir gate
        consecutiveFramesForMute: 4,    // Frames sin voz para cerrar gate

        // --- Análisis (solo fallback FFT) ---
        analysisIntervalMs: 50,         // Cada cuánto analiza en modo FFT (20/seg)
    };

    // ================================================
    // CONSTRUCTOR
    // ================================================

    /**
     * @param {Object} options
     * @param {EventBus} options.bus - Event bus central de PianoLink
     * @param {string} options.userRole - 'teacher' | 'student' | 'admin'
     */
    function EchoGateManager(options) {
        this.bus = options.bus;
        this.userRole = options.userRole || 'student';

        // --- Estado ---
        this._teacherPlaying = false;       // Flag directo del servidor
        this._gateOpen = true;              // true = audio pasa, false = muteado
        this._initialized = false;
        this._destroyed = false;

        // --- Modo de detección ---
        this._mode = 'none';                // 'vad' | 'fft' | 'none'
        this._vadInstance = null;            // MicVAD instance (Silero)
        this._vadReady = false;             // VAD cargó correctamente
        this._vadSpeaking = false;          // Estado actual del VAD

        // --- Timers ---
        this._releaseTimer = null;          // Timer de gracia al dejar de tocar
        this._analysisInterval = null;      // Intervalo de análisis FFT (fallback)

        // --- Web Audio (fallback FFT) ---
        this._audioContext = null;
        this._analyser = null;
        this._sourceNode = null;
        this._frequencyData = null;

        // --- Contadores de frames (histéresis para FFT) ---
        this._voiceFrameCount = 0;
        this._silenceFrameCount = 0;

        // --- Métricas (diagnóstico) ---
        this._metrics = {
            gateActivations: 0,
            voiceDetections: 0,
            echoBlocks: 0,
            lastSpeechProb: 0,              // Última probabilidad VAD (0-1)
            lastEnergy: 0,                  // Último nivel de energía FFT
            lastVoiceRatio: 0,              // Último ratio vocal FFT
            avgLatency: 0,                  // Latencia promedio flag teacher→gate
            vadLoadTimeMs: 0,               // Tiempo que tardó en cargar VAD
            mode: 'none'                    // Modo activo
        };

        // --- Referencia al Agora track ---
        this._agoraAudioTrack = null;

        console.log('[EchoGate] 🎛️ Instancia creada (rol:', this.userRole + ', Fase 2 con VAD Silero)');
    }

    // ================================================
    // INICIALIZACIÓN
    // ================================================

    /**
     * Inicializa el EchoGate y conecta los listeners del bus.
     * Solo se activa si el usuario es ESTUDIANTE (el eco viene de su mic).
     * Intenta cargar VAD Silero; si falla, usa FFT como fallback.
     */
    EchoGateManager.prototype.init = function() {
        if (this._initialized) return;
        this._initialized = true;

        // Solo los estudiantes necesitan el Echo Gate
        if (this.userRole === 'teacher' || this.userRole === 'admin') {
            console.log('[EchoGate] ℹ️ Rol profesor/admin — gate deshabilitado (no aplica)');
            return;
        }

        this._bindBusEvents();

        // Intentar cargar VAD Silero (async, no bloquea)
        this._initVAD();

        console.log('[EchoGate] ✅ Inicializado para estudiante');
    };

    // ================================================
    // VAD SILERO (Fase 2 — detección primaria)
    // ================================================

    /**
     * Carga el modelo Silero VAD vía @ricky0123/vad-web.
     * Si falla, el sistema cae a fallback FFT automáticamente.
     * @private
     */
    EchoGateManager.prototype._initVAD = function() {
        const self = this;
        const startTime = performance.now();

        // Verificar que la librería esté disponible (cargada por CDN)
        if (typeof vad === 'undefined' || !vad.MicVAD) {
            console.warn('[EchoGate] ⚠️ @ricky0123/vad-web no disponible — usando fallback FFT');
            self._mode = 'fft';
            self._metrics.mode = 'fft';
            return;
        }

        console.log('[EchoGate] ⏳ Cargando modelo Silero VAD...');

        // Crear instancia de MicVAD con config personalizada
        vad.MicVAD.new({
            // Umbrales de detección de voz
            positiveSpeechThreshold: CONFIG.vad.positiveSpeechThreshold,
            negativeSpeechThreshold: CONFIG.vad.negativeSpeechThreshold,

            // Timing
            redemptionFrames: Math.ceil(CONFIG.vad.redemptionMs / 96),
            minSpeechFrames: Math.ceil(CONFIG.vad.minSpeechMs / 96),
            preSpeechPadFrames: Math.ceil(CONFIG.vad.preSpeechPadMs / 96),

            // Rutas CDN para assets ONNX
            onnxWASMBasePath: CONFIG.vad.onnxWASMBasePath,
            baseAssetPath: CONFIG.vad.baseAssetPath,

            // NO iniciar escuchando (lo activamos manualmente cuando el profesor toca)
            startOnLoad: false,

            // === CALLBACKS ===

            // Llamado cada frame (~96ms) con la probabilidad de voz
            onFrameProcessed: function(probabilities) {
                self._onVADFrame(probabilities);
            },

            // Inicio de segmento de habla confirmado
            onSpeechStart: function() {
                self._onVADSpeechStart();
            },

            // Fin de segmento de habla confirmado
            onSpeechEnd: function(audio) {
                self._onVADSpeechEnd();
            }

        }).then(function(micVAD) {
            self._vadInstance = micVAD;
            self._vadReady = true;
            self._mode = 'vad';
            self._metrics.mode = 'vad';
            self._metrics.vadLoadTimeMs = Math.round(performance.now() - startTime);

            console.log('[EchoGate] ✅ VAD Silero cargado en', self._metrics.vadLoadTimeMs + 'ms');
            console.log('[EchoGate]    Modo: VAD (primario), FFT (no necesario)');

            // Si el profesor ya estaba tocando cuando el VAD terminó de cargar, activar
            if (self._teacherPlaying) {
                self._startVADListening();
            }

        }).catch(function(err) {
            console.error('[EchoGate] ❌ Error cargando VAD Silero:', err);
            console.log('[EchoGate] ↩️ Fallback a detección por FFT');
            self._mode = 'fft';
            self._metrics.mode = 'fft';
        });
    };

    /**
     * Inicia la escucha del VAD (activar micrófono para análisis)
     * @private
     */
    EchoGateManager.prototype._startVADListening = function() {
        if (!this._vadInstance || !this._vadReady) return;

        try {
            this._vadInstance.start();
            console.log('[EchoGate] 🎤 VAD escuchando');
        } catch (err) {
            console.error('[EchoGate] ❌ Error iniciando VAD:', err);
        }
    };

    /**
     * Pausa la escucha del VAD (liberar micrófono)
     * @private
     */
    EchoGateManager.prototype._stopVADListening = function() {
        if (!this._vadInstance) return;

        try {
            this._vadInstance.pause();
            this._vadSpeaking = false;
            console.log('[EchoGate] ⏸️ VAD pausado');
        } catch (err) {
            console.error('[EchoGate] ❌ Error pausando VAD:', err);
        }
    };

    /**
     * Callback: cada frame de audio procesado (~96ms)
     * Recibe probabilidad de voz entre 0 y 1.
     * @param {Object} probabilities - { isSpeech: number, notSpeech: number }
     * @private
     */
    EchoGateManager.prototype._onVADFrame = function(probabilities) {
        if (!this._teacherPlaying || this._destroyed) return;

        const speechProb = probabilities.isSpeech || 0;
        this._metrics.lastSpeechProb = speechProb;

        // El VAD maneja internamente la histéresis con redemptionFrames.
        // Aquí solo actualizamos el gate basándonos en el estado de speaking.
        // Los callbacks onSpeechStart/onSpeechEnd manejan las transiciones.
    };

    /**
     * Callback: el alumno empezó a hablar → abrir el gate
     * @private
     */
    EchoGateManager.prototype._onVADSpeechStart = function() {
        if (!this._teacherPlaying || this._destroyed) return;

        this._vadSpeaking = true;
        this._metrics.voiceDetections++;

        // Abrir gate: el alumno quiere hablar, dejarlo pasar
        this._openGate();
    };

    /**
     * Callback: el alumno dejó de hablar → cerrar el gate (eco detectado)
     * @private
     */
    EchoGateManager.prototype._onVADSpeechEnd = function() {
        if (!this._teacherPlaying || this._destroyed) return;

        this._vadSpeaking = false;
        this._metrics.echoBlocks++;

        // Cerrar gate: no hay voz, cualquier sonido es eco del piano del profesor
        this._closeGate();
    };

    /**
     * Conecta los listeners del EventBus
     * @private
     */
    EchoGateManager.prototype._bindBusEvents = function() {
        const self = this;

        // --- Señal del servidor: el profesor está tocando/dejó de tocar ---
        this.bus.on('teacher-playing-state', function(data) {
            if (self._destroyed) return;

            const isPlaying = data && data.playing;
            const timestamp = data && data.timestamp;

            // Calcular latencia del flag (diagnóstico)
            if (timestamp) {
                const latency = Date.now() - timestamp;
                self._metrics.avgLatency = self._metrics.avgLatency * 0.8 + latency * 0.2;
            }

            if (isPlaying) {
                self._onTeacherStartPlaying();
            } else {
                self._onTeacherStopPlaying();
            }
        });

        // --- Cuando Agora publica el audio track, conectar el gate ---
        this.bus.on('video-joined-channel', function() {
            // Intentar conectar con pequeño delay (el track puede tardar)
            setTimeout(function() {
                self._tryConnectToAgoraTrack();
            }, 1000);
        });

        // --- Cleanup al desconectar ---
        this.bus.on('video-left-channel', function() {
            self._disconnectAudioProcessing();
        });
    };

    // ================================================
    // CONTROL DEL GATE POR ACTIVIDAD DEL PROFESOR
    // ================================================

    /**
     * El profesor empezó a tocar → activar el Echo Gate
     * @private
     */
    EchoGateManager.prototype._onTeacherStartPlaying = function() {
        // Cancelar timer de gracia si estaba por desactivarse
        if (this._releaseTimer) {
            clearTimeout(this._releaseTimer);
            this._releaseTimer = null;
        }

        if (this._teacherPlaying) return; // Ya estaba activo

        this._teacherPlaying = true;
        this._metrics.gateActivations++;
        this._startAnalysis();

        console.log('[EchoGate] 🎹 Profesor tocando → gate ACTIVADO (#' + this._metrics.gateActivations + ')');
    };

    /**
     * El profesor dejó de tocar → iniciar timer de gracia antes de desactivar
     * @private
     */
    EchoGateManager.prototype._onTeacherStopPlaying = function() {
        if (!this._teacherPlaying) return;

        const self = this;

        // Gracia: no desactivar inmediatamente (puede haber notas con sustain)
        this._releaseTimer = setTimeout(function() {
            self._teacherPlaying = false;
            self._stopAnalysis();
            self._openGate(); // Restaurar audio normal
            console.log('[EchoGate] 🔇 Profesor dejó de tocar → gate DESACTIVADO');
        }, CONFIG.releaseGraceMs);
    };

    // ================================================
    // AUDIO ANALYSIS (Fase 1: Detección por energía)
    // ================================================

    /**
     * Intenta conectar el EchoGate al track de audio de Agora
     * @private
     */
    EchoGateManager.prototype._tryConnectToAgoraTrack = function() {
        // Buscar el VideoManager global para acceder al track de audio
        if (typeof window !== 'undefined' && window.videoManager) {
            const vm = window.videoManager;
            if (vm.localAudioTrack) {
                this._agoraAudioTrack = vm.localAudioTrack;
                this._setupAudioProcessing();
                console.log('[EchoGate] ✅ Conectado al audio track de Agora');
                return;
            }
        }
        console.warn('[EchoGate] ⚠️ Audio track de Agora no disponible aún');
    };

    /**
     * Configura el Web Audio processing chain para análisis espectral.
     * NO reemplaza la ruta de audio existente — solo añade un AnalyserNode en paralelo.
     * El control de volumen se hace vía la API de Agora (setVolume).
     * @private
     */
    EchoGateManager.prototype._setupAudioProcessing = function() {
        try {
            // Crear AudioContext si no existe
            if (!this._audioContext) {
                this._audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }

            // Crear AnalyserNode para FFT
            this._analyser = this._audioContext.createAnalyser();
            this._analyser.fftSize = CONFIG.fftSize;
            this._analyser.smoothingTimeConstant = 0.3; // Respuesta rápida

            // Buffer para datos de frecuencia
            this._frequencyData = new Float32Array(this._analyser.frequencyBinCount);

            // Conectar el mic al analyser (solo para lectura, no modifica la ruta)
            if (this._agoraAudioTrack && this._agoraAudioTrack.getMediaStreamTrack) {
                const mediaStreamTrack = this._agoraAudioTrack.getMediaStreamTrack();
                if (mediaStreamTrack) {
                    const stream = new MediaStream([mediaStreamTrack]);
                    this._sourceNode = this._audioContext.createMediaStreamSource(stream);
                    this._sourceNode.connect(this._analyser);
                    // NO conectar al destination (solo queremos analizar, no duplicar audio)
                    console.log('[EchoGate] ✅ Audio processing chain configurado');
                }
            }
        } catch (err) {
            console.error('[EchoGate] ❌ Error configurando audio processing:', err);
        }
    };

    /**
     * Desconecta el procesamiento de audio
     * @private
     */
    EchoGateManager.prototype._disconnectAudioProcessing = function() {
        this._stopAnalysis();

        if (this._sourceNode) {
            try { this._sourceNode.disconnect(); } catch (e) { /* ignorar */ }
            this._sourceNode = null;
        }
        if (this._analyser) {
            try { this._analyser.disconnect(); } catch (e) { /* ignorar */ }
            this._analyser = null;
        }
        // No cerramos el AudioContext (puede ser reutilizado)

        this._openGate(); // Restaurar audio
        console.log('[EchoGate] 🔌 Audio processing desconectado');
    };

    /**
     * Inicia el análisis de audio según el modo disponible.
     * VAD (primario) o FFT (fallback).
     * @private
     */
    EchoGateManager.prototype._startAnalysis = function() {
        // Modo VAD: usar Silero (más preciso, ~96ms por frame)
        if (this._mode === 'vad' && this._vadReady) {
            this._startVADListening();
            // Cerrar gate al inicio (se abre solo si detecta voz)
            this._closeGate();
            return;
        }

        // Modo FFT fallback: análisis espectral manual
        if (this._analysisInterval) return; // Ya está corriendo

        if (!this._analyser) {
            this._tryConnectToAgoraTrack();
            if (!this._analyser) {
                console.warn('[EchoGate] ⚠️ Sin analyser ni VAD — aplicando mute directo');
                this._closeGate();
                return;
            }
        }

        const self = this;
        this._analysisInterval = setInterval(function() {
            self._analyzeFrame();
        }, CONFIG.analysisIntervalMs);

        // Cerrar gate al inicio (se abre solo si detecta voz)
        this._closeGate();
    };

    /**
     * Detiene el análisis de audio (ambos modos)
     * @private
     */
    EchoGateManager.prototype._stopAnalysis = function() {
        // Parar VAD si está activo
        if (this._mode === 'vad') {
            this._stopVADListening();
        }

        // Parar FFT si está activo
        if (this._analysisInterval) {
            clearInterval(this._analysisInterval);
            this._analysisInterval = null;
        }
        this._voiceFrameCount = 0;
        this._silenceFrameCount = 0;
    };

    /**
     * Analiza un frame de audio para detectar voz vs eco de piano.
     * 
     * ALGORITMO (Fase 1 — por energía espectral):
     * 1. Obtener espectro de frecuencia vía FFT
     * 2. Calcular energía total y energía en banda de voz (300-3400Hz)
     * 3. Si la ratio voz/total supera umbral → voz detectada → abrir gate
     * 4. Si no → eco o silencio → cerrar gate
     * 
     * El piano tiene energía distribuida uniformemente (27Hz-4186Hz).
     * La voz concentra energía en formantes (300-3400Hz).
     * 
     * @private
     */
    EchoGateManager.prototype._analyzeFrame = function() {
        if (!this._analyser || !this._frequencyData) return;

        // Obtener datos de frecuencia en dB
        this._analyser.getFloatFrequencyData(this._frequencyData);

        const sampleRate = this._audioContext.sampleRate;
        const binCount = this._analyser.frequencyBinCount;
        const binSize = sampleRate / (binCount * 2); // Hz por bin

        // Rangos de bins para voz humana
        const voiceMinBin = Math.floor(CONFIG.voiceMinHz / binSize);
        const voiceMaxBin = Math.min(Math.ceil(CONFIG.voiceMaxHz / binSize), binCount - 1);

        // Calcular energía total y energía en banda vocal
        let totalEnergy = 0;
        let voiceEnergy = 0;
        let totalBins = 0;
        let voiceBins = 0;

        for (let i = 0; i < binCount; i++) {
            const power = this._frequencyData[i];
            // Solo considerar bins con energía significativa (> -100 dBFS)
            if (power > -100) {
                // Convertir dB a lineal para sumar correctamente
                const linear = Math.pow(10, power / 20);
                totalEnergy += linear;
                totalBins++;

                if (i >= voiceMinBin && i <= voiceMaxBin) {
                    voiceEnergy += linear;
                    voiceBins++;
                }
            }
        }

        // Calcular ratio de energía vocal
        const voiceRatio = totalEnergy > 0 ? voiceEnergy / totalEnergy : 0;

        // Nivel de energía total en dB (para threshold absoluto)
        const avgEnergyDb = totalBins > 0
            ? 20 * Math.log10(totalEnergy / totalBins)
            : -100;

        // Actualizar métricas
        this._metrics.lastEnergy = avgEnergyDb;
        this._metrics.lastVoiceRatio = voiceRatio;

        // --- Decisión: ¿hay voz humana real? ---
        const hasSignificantEnergy = avgEnergyDb > CONFIG.energyThreshold;
        const hasVoiceCharacteristics = voiceRatio > CONFIG.voiceRatioThreshold;
        const isLoudEnough = avgEnergyDb > CONFIG.voiceEnergyThreshold;

        // Voz = energía suficiente + concentrada en banda vocal
        const isVoice = hasSignificantEnergy && hasVoiceCharacteristics && isLoudEnough;

        // --- Histéresis (evitar flickering) ---
        if (isVoice) {
            this._voiceFrameCount++;
            this._silenceFrameCount = 0;

            if (this._voiceFrameCount >= CONFIG.consecutiveFramesForVoice) {
                if (!this._gateOpen) {
                    this._openGate();
                    this._metrics.voiceDetections++;
                }
            }
        } else {
            this._silenceFrameCount++;
            this._voiceFrameCount = 0;

            if (this._silenceFrameCount >= CONFIG.consecutiveFramesForMute) {
                if (this._gateOpen) {
                    this._closeGate();
                    this._metrics.echoBlocks++;
                }
            }
        }
    };

    // ================================================
    // CONTROL DEL GATE (ABRIR / CERRAR)
    // ================================================

    /**
     * Abre el gate → el audio del alumno pasa normalmente
     * @private
     */
    EchoGateManager.prototype._openGate = function() {
        if (this._gateOpen) return;
        this._gateOpen = true;

        // Usar API de Agora para restaurar volumen
        if (this._agoraAudioTrack && typeof this._agoraAudioTrack.setVolume === 'function') {
            this._agoraAudioTrack.setVolume(100);
        }

        this.bus.emit('echo-gate-state', { open: true });
    };

    /**
     * Cierra el gate → el audio del alumno se mutea (eco detectado)
     * @private
     */
    EchoGateManager.prototype._closeGate = function() {
        if (!this._gateOpen) return;
        this._gateOpen = false;

        // Usar API de Agora para mutear
        if (this._agoraAudioTrack && typeof this._agoraAudioTrack.setVolume === 'function') {
            this._agoraAudioTrack.setVolume(0);
        }

        this.bus.emit('echo-gate-state', { open: false });
    };

    // ================================================
    // API PÚBLICA
    // ================================================

    /**
     * Asigna el audio track de Agora (llamar cuando cambie)
     * @param {Object} agoraTrack - Track de audio local de Agora
     */
    EchoGateManager.prototype.setAudioTrack = function(agoraTrack) {
        this._agoraAudioTrack = agoraTrack;
        if (agoraTrack) {
            this._setupAudioProcessing();
        }
    };

    /**
     * Habilita/deshabilita el Echo Gate manualmente
     * @param {boolean} enabled
     */
    EchoGateManager.prototype.setEnabled = function(enabled) {
        this._enabled = enabled;
        if (!enabled) {
            this._stopAnalysis();
            this._openGate();
        }
        console.log('[EchoGate] ' + (enabled ? '✅ Habilitado' : '❌ Deshabilitado') + ' manualmente');
    };

    /**
     * Retorna métricas del gate para diagnóstico
     * @returns {Object}
     */
    EchoGateManager.prototype.getMetrics = function() {
        return Object.assign({}, this._metrics, {
            isActive: this._teacherPlaying,
            gateOpen: this._gateOpen,
            hasAnalyser: !!this._analyser,
            vadReady: this._vadReady,
            vadSpeaking: this._vadSpeaking,
            mode: this._mode
        });
    };

    /**
     * Retorna el modo de detección activo
     * @returns {string} 'vad' | 'fft' | 'none'
     */
    EchoGateManager.prototype.getMode = function() {
        return this._mode;
    };

    /**
     * Destruye el manager y libera recursos (incluido VAD)
     */
    EchoGateManager.prototype.destroy = function() {
        this._destroyed = true;

        // Destruir VAD Silero
        if (this._vadInstance) {
            try {
                this._vadInstance.pause();
                this._vadInstance.destroy();
            } catch (e) { /* ignorar */ }
            this._vadInstance = null;
            this._vadReady = false;
        }

        this._disconnectAudioProcessing();

        if (this._releaseTimer) {
            clearTimeout(this._releaseTimer);
            this._releaseTimer = null;
        }

        if (this._audioContext && this._audioContext.state !== 'closed') {
            try { this._audioContext.close(); } catch (e) { /* ignorar */ }
        }

        this._agoraAudioTrack = null;
        console.log('[EchoGate] 💀 Destruido (modo era:', this._mode + ')');
    };

    // ================================================
    // EXPORT
    // ================================================
    global.EchoGateManager = EchoGateManager;

})(typeof window !== 'undefined' ? window : this);
