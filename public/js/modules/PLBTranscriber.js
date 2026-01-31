/**
 * PLBTranscriber.js - Captura de Audio con Web Speech API
 * 
 * Este módulo convierte audio del micrófono en texto usando
 * el reconocimiento de voz nativo del navegador.
 * 
 * CARACTERÍSTICAS:
 * - Procesamiento LOCAL (no envía audio al servidor)
 * - Auto-reinicio después de pausas
 * - Detección de hablante (profesor/invitado)
 * - Throttling de envío
 */

export class PLBTranscriber {
    constructor(eventBus, socket) {
        this.bus = eventBus;
        this.socket = socket;
        this.recognition = null;
        this.isListening = false;
        this.isEnabled = false; // Controlado por el servidor
        this.userEmail = null;
        
        // Configuración
        this.config = {
            lang: 'es-ES', // Español por defecto
            continuous: true,
            interimResults: false, // Solo resultados finales
            maxAlternatives: 1
        };
        
        // Buffer local para evitar envíos duplicados
        this.lastTranscript = '';
        this.lastSendTime = 0;
        this.MIN_SEND_INTERVAL = 2000; // 2 segundos entre envíos
        
        // Métricas
        this.metrics = {
            transcriptsGenerated: 0,
            errorCount: 0,
            restarts: 0
        };
        
        // Detectar soporte
        this.isSupported = this._checkSupport();
        
        if (this.isSupported) {
            this._initRecognition();
        }
    }
    
    /**
     * Verifica si Web Speech API está soportada
     */
    _checkSupport() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        
        if (!SpeechRecognition) {
            console.warn('[PLB Transcriber] ⚠️ Web Speech API no soportada en este navegador');
            return false;
        }
        
        console.log('[PLB Transcriber] ✅ Web Speech API disponible');
        return true;
    }
    
    /**
     * Inicializa el reconocedor de voz
     */
    _initRecognition() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        
        this.recognition = new SpeechRecognition();
        this.recognition.lang = this.config.lang;
        this.recognition.continuous = this.config.continuous;
        this.recognition.interimResults = this.config.interimResults;
        this.recognition.maxAlternatives = this.config.maxAlternatives;
        
        // === EVENT HANDLERS ===
        
        this.recognition.onstart = () => {
            this.isListening = true;
            console.log('[PLB Transcriber] 🎤 Escuchando...');
            this.bus.emit('plb-listening-changed', { isListening: true });
        };
        
        this.recognition.onend = () => {
            this.isListening = false;
            console.log('[PLB Transcriber] 🔇 Pausa en escucha');
            this.bus.emit('plb-listening-changed', { isListening: false });
            
            // Auto-reinicio si PLB sigue habilitado
            if (this.isEnabled) {
                setTimeout(() => {
                    if (this.isEnabled && !this.isListening) {
                        this.metrics.restarts++;
                        this._safeStart();
                    }
                }, 500);
            }
        };
        
        this.recognition.onresult = (event) => {
            const result = event.results[event.results.length - 1];
            
            if (result.isFinal) {
                const transcript = result[0].transcript.trim();
                
                if (transcript && transcript.length > 3) {
                    this._handleTranscript(transcript);
                }
            }
        };
        
        this.recognition.onerror = (event) => {
            this.metrics.errorCount++;
            
            // Ignorar errores comunes que no son críticos
            if (event.error === 'no-speech' || event.error === 'aborted') {
                return;
            }
            
            console.warn('[PLB Transcriber] ⚠️ Error:', event.error);
            
            // Si es error de permisos, desactivar completamente
            if (event.error === 'not-allowed') {
                console.error('[PLB Transcriber] ❌ Permisos de micrófono denegados');
                this.isEnabled = false;
                this.bus.emit('plb-error', { 
                    type: 'permission-denied',
                    message: 'Permisos de micrófono denegados'
                });
            }
        };
    }
    
    /**
     * Procesa y envía una transcripción
     */
    _handleTranscript(transcript) {
        const now = Date.now();
        
        // Evitar duplicados
        if (transcript === this.lastTranscript && 
            now - this.lastSendTime < this.MIN_SEND_INTERVAL) {
            return;
        }
        
        this.lastTranscript = transcript;
        this.lastSendTime = now;
        this.metrics.transcriptsGenerated++;
        
        // Detectar hablante (heurística simple)
        // TODO: En el futuro, usar diarización de audio real
        const speaker = this._detectSpeaker();
        
        console.log(`[PLB Transcriber] 📝 [${speaker}]: "${transcript.substring(0, 50)}..."`);
        
        // Emitir evento local
        this.bus.emit('plb-transcript-local', { text: transcript, speaker });
        
        // Enviar al servidor
        if (this.socket && this.socket.connected) {
            this.socket.emit('plb-transcript', {
                text: transcript,
                speaker: speaker,
                userEmail: this.userEmail,
                timestamp: now
            });
        }
    }
    
    /**
     * Detecta quién está hablando (profesor o invitado)
     * Por ahora usa el rol del usuario actual
     */
    _detectSpeaker() {
        try {
            const user = JSON.parse(localStorage.getItem('pianoUser') || '{}');
            if (user.role === 'teacher' || user.role === 'admin') {
                return 'teacher';
            }
            return 'guest';
        } catch (e) {
            return 'unknown';
        }
    }
    
    /**
     * Intenta iniciar el reconocimiento de forma segura
     */
    _safeStart() {
        if (!this.isSupported || !this.recognition) return;
        
        try {
            this.recognition.start();
        } catch (e) {
            // Ya está corriendo, ignorar
            if (e.name !== 'InvalidStateError') {
                console.warn('[PLB Transcriber] Error al iniciar:', e.message);
            }
        }
    }
    
    /**
     * Activa el transcriber
     */
    start(userEmail) {
        if (!this.isSupported) {
            console.warn('[PLB Transcriber] No se puede iniciar - no soportado');
            return false;
        }
        
        this.userEmail = userEmail;
        this.isEnabled = true;
        
        console.log(`[PLB Transcriber] 🚀 Activando para: ${userEmail}`);
        
        // Registrar email en el servidor
        if (this.socket && this.socket.connected) {
            this.socket.emit('plb-register', { email: userEmail });
        }
        
        this._safeStart();
        return true;
    }
    
    /**
     * Desactiva el transcriber
     */
    stop() {
        this.isEnabled = false;
        
        if (this.recognition && this.isListening) {
            try {
                this.recognition.stop();
            } catch (e) {
                // Ignorar errores al detener
            }
        }
        
        console.log('[PLB Transcriber] 🛑 Detenido');
    }
    
    /**
     * Cambia el idioma del reconocimiento
     */
    setLanguage(lang) {
        this.config.lang = lang;
        if (this.recognition) {
            this.recognition.lang = lang;
        }
        console.log(`[PLB Transcriber] 🌍 Idioma cambiado a: ${lang}`);
    }
    
    /**
     * Obtiene métricas del transcriber
     */
    getMetrics() {
        return {
            ...this.metrics,
            isSupported: this.isSupported,
            isListening: this.isListening,
            isEnabled: this.isEnabled
        };
    }
    
    /**
     * Destruye el transcriber
     */
    destroy() {
        this.stop();
        this.recognition = null;
        console.log('[PLB Transcriber] 💀 Destruido');
    }
}
