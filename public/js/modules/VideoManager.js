/**
 * VideoManager.js - Fase 0: Infraestructura Resiliente con Circuit Breaker
 * 
 * Sistema de gestión de video con protección anti-bloqueo:
 * - AbortController con timeout de 4 segundos
 * - Manejo graceful de errores de red, permisos y credenciales
 * - NUNCA bloquea el sistema MIDI/Logs
 * 
 * Arquitectura Indestructible:
 * 1. Si fetch falla → sistema continúa sin video
 * 2. Si Agora SDK falla → error graceful en consola
 * 3. Si permisos de cámara fallan → notificación al usuario
 */

(function(global) {
    'use strict';

    /**
     * Constructor del VideoManager
     * @param {Object} config - Configuración inicial
     * @param {EventEmitter} config.bus - Event bus de Main.js
     */
    function VideoManager(config) {
        this.bus = config.bus;
        this.appId = null;
        this.client = null;
        this.isInitialized = false;
        this.hasUIElements = false; // Flag para elementos DOM creados
        this.draggableVideo = null; // Instancia de DraggableVideo
        
        // Agora RTC properties
        this.channelName = null;
        this.uid = null;
        this.isJoined = false;
        
        // Tracks
        this.localAudioTrack = null;
        this.localVideoTrack = null;
        this.remoteUsers = {}; // Map de usuarios remotos
        
        // === SMART AUDIO BRIDGE (Simplified - Agora setVolume) ===
        this.duckingEnabled = true;
        this.normalVolume = 1.0;         // 100% cuando solo se habla
        this.duckedVolume = 0.0;         // 0% cuando MIDI activo (silencio total para evitar eco)
        this.duckingTimeoutId = null;
        this.fadeInIntervalId = null;    // Para fade-in gradual
        this.MIDI_SILENCE_THRESHOLD_MS = 1000; // 1s sin MIDI para restaurar
        this.FADE_IN_DURATION_MS = 1500; // 1.5s para fade-in suave
        
        // State
        this.isMidiActive = false;       // Flag de actividad MIDI
        
        // State
        this.isMuted = {
            audio: false,
            video: false
        };
        
        console.log('[VideoManager] Módulo creado (Fase 2 - Streaming + Audio Bridge)');
    }

    /**
     * Inicializa el VideoManager con Circuit Breaker
     * @returns {Promise<void>}
     */
    VideoManager.prototype.initialize = function() {
        var self = this;
        
        return new Promise(function(resolve, reject) {
            console.log('[VideoManager] 🔄 Iniciando con Circuit Breaker...');
            
            // ========================================
            // VALIDACIÓN 1: Verificar SDK de Agora
            // ========================================
            if (typeof AgoraRTC === 'undefined') {
                var error = new Error('Agora SDK no está cargado en el DOM');
                console.error('[VideoManager] ❌', error.message);
                return reject(error);
            }
            
            // ========================================
            // VALIDACIÓN 2: Fetch con AbortController (Timeout 4s)
            // ========================================
            var controller = new AbortController();
            var timeoutId = setTimeout(function() {
                controller.abort();
                console.error('[VideoManager] ⏱️ Timeout: fetch de credenciales tardó más de 4 segundos');
            }, 4000);
            
            fetch('/api/agora/credentials', { 
                signal: controller.signal,
                headers: { 'Content-Type': 'application/json' }
            })
            .then(function(response) {
                clearTimeout(timeoutId);
                
                if (!response.ok) {
                    throw new Error('Server error: ' + response.status);
                }
                
                return response.json();
            })
            .then(function(data) {
                console.log('[VideoManager] 📦 Credenciales recibidas:', {
                    success: data.success,
                    hasAppId: !!data.appId,
                    hasToken: data.hasToken
                });
                
                // ========================================
                // VALIDACIÓN 3: Verificar que AppId existe
                // ========================================
                if (!data.success || !data.appId) {
                    throw new Error('AGORA_APP_ID no configurado en el servidor');
                }
                
                // Guardar appId
                self.appId = data.appId;
                self.isInitialized = true;
                
                // Logging detallado
                console.log('[VideoManager] ✅ Inicializado correctamente');
                console.log('[VideoManager] 📍 App ID guardado:');
                console.log('  - Primeros 8 chars:', self.appId.substring(0, 8) + '...');
                console.log('  - Length:', self.appId.length);
                console.log('  - Type:', typeof self.appId);
                console.log('[VideoManager] ⚠️  UI no creada - esperando activación por usuario');
                
                // ========================================
                // FASE 2: Crear cliente Agora RTC
                // ========================================
                self._createAgoraClient();
                
                resolve();
            })
            .catch(function(error) {
                clearTimeout(timeoutId);
                
                // ========================================
                // MANEJO DE ERRORES GRACEFUL
                // ========================================
                var errorMessage = '';
                
                if (error.name === 'AbortError') {
                    errorMessage = '⏱️ Circuit Breaker activado: fetch tardó más de 4 segundos';
                } else if (error.message.includes('Failed to fetch')) {
                    errorMessage = '🌐 Error de red: no se pudo conectar al servidor';
                } else if (error.message.includes('AGORA_APP_ID')) {
                    errorMessage = '🔑 Credenciales no configuradas en .env';
                } else {
                    errorMessage = '❌ Error desconocido: ' + error.message;
                }
                
                console.error('[VideoManager]', errorMessage);
                console.warn('[VideoManager] ⚠️ Sistema de video deshabilitado (MIDI/Logs NO afectados)');
                
                // Emitir evento de error para UI (opcional)
                self.bus.emit('video-init-failed', { 
                    error: errorMessage,
                    timestamp: Date.now()
                });
                
                reject(new Error(errorMessage));
            });
        });
    };
    
    /**
     * Método auxiliar para verificar estado
     * @returns {boolean}
     */
    VideoManager.prototype.isReady = function() {
        return this.isInitialized && this.appId !== null;
    };
    
    /**
     * Activa la UI de video (crea ventanas on-demand)
     * Solo se llama cuando usuario hace click en botón de video
     * @param {string} roomCode - Código de sala para el canal
     * @returns {Promise<boolean>} - true si se creó correctamente
     */
    VideoManager.prototype.activateUI = async function(roomCode) {
        var self = this;
        
        if (!self.isInitialized) {
            console.error('[VideoManager] No se puede activar UI - no inicializado');
            return false;
        }
        
        if (self.hasUIElements) {
            console.warn('[VideoManager] UI ya está activa');
            return true;
        }
        
        try {
            console.log('[VideoManager] 🎨 Activando UI de video...');
            
            // Crear ventanas
            self._createVideoContainers();
            
            // Inicializar drag & drop
            self._initDraggableSystem();
            
            console.log('[VideoManager] ✅ UI activada correctamente');
            
            // Unirse al canal automáticamente
            if (roomCode) {
                console.log('[VideoManager] 📡 Uniéndose automáticamente al canal:', roomCode);
                await self.joinChannel(roomCode);
            }
            
            return true;
            
        } catch (error) {
            console.error('[VideoManager] ❌ Error activando UI:', error);
            
            // Error handling silencioso
            self.bus.emit('video-error', {
                type: 'ui-activation-failed',
                message: error.message,
                silent: true
            });
            
            return false;
        }
    };
    
    /**
     * Destruye el sistema de arrastre (para futuros releases)
     */
    VideoManager.prototype.destroy = function() {
        console.log('[VideoManager] 🧹 Limpiando recursos...');
        
        // Destruir sistema de arrastre
        if (this.draggableVideo) {
            this.draggableVideo.destroy();
            this.draggableVideo = null;
        }
        
        // Remover elementos del DOM
        this._removeVideoContainers();
        
        this.appId = null;
        this.isInitialized = false;
        this.hasUIElements = false;
    };

    /**
     * Crea los contenedores de video dinámicamente (ON-DEMAND)
     * Solo se ejecuta si VideoManager inicializa correctamente
     * @private
     */
    VideoManager.prototype._createVideoContainers = function() {
        var self = this;
        
        console.log('[VideoManager] 🎨 Creando contenedores de video...');
        
        // Verificar que no existan ya
        if (document.getElementById('local-video')) {
            console.warn('[VideoManager] Contenedores ya existen, saltando creación');
            self.hasUIElements = true;
            return;
        }
        
        // Crear ventana local
        var localWindow = self._createLocalWindow();
        document.body.appendChild(localWindow);
        
        // Crear ventana remota
        var remoteWindow = self._createRemoteWindow();
        document.body.appendChild(remoteWindow);
        
        self.hasUIElements = true;
        console.log('[VideoManager] ✅ Contenedores creados correctamente');
    };

    /**
     * Crea la ventana de video local
     * @private
     * @returns {HTMLElement}
     */
    VideoManager.prototype._createLocalWindow = function() {
        var container = document.createElement('div');
        container.id = 'local-video';
        container.className = 'video-window';
        container.style.cssText = 'left: 20px; top: 100px;'; // Posición inicial
        
        container.innerHTML = `
            <div class="video-header">
                <span class="video-title">📹 Mi Cámara</span>
                <div class="video-controls">
                    <button id="local-mute-audio" class="video-btn" title="Mute Audio">🎤</button>
                    <button id="local-mute-video" class="video-btn" title="Mute Video">📹</button>
                    <button id="local-minimize" class="video-btn" title="Minimizar">−</button>
                </div>
            </div>
            <div class="video-body">
                <div id="local-video-container" class="video-player"></div>
                <div style="padding: 8px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 11px; color: #888;">🎤 Nivel:</span>
                        <div style="flex: 1; background: #333; height: 8px; border-radius: 4px; overflow: hidden;">
                            <div id="audio-level-bar" style="width: 0%; height: 100%; background: linear-gradient(90deg, #4CAF50, #FFC107, #F44336); transition: width 0.1s;"></div>
                        </div>
                        <span id="audio-level-text" style="font-size: 11px; color: #888; min-width: 30px;">0%</span>
                    </div>
                </div>
                <div id="local-status" class="video-status">Desconectado</div>
            </div>
        `;
        
        return container;
    };

    /**
     * Crea la ventana de video remota
     * INCLUYE: Barra de control de audio integrada (solo visible para profesores)
     * @private
     * @returns {HTMLElement}
     */
    VideoManager.prototype._createRemoteWindow = function() {
        var self = this;
        var container = document.createElement('div');
        container.id = 'remote-video';
        container.className = 'video-window';
        container.style.cssText = 'right: 20px; top: 100px;'; // Posición inicial
        
        // Detectar si es profesor para mostrar controles de audio
        var isTeacher = false;
        try {
            var saved = JSON.parse(localStorage.getItem('pianoUser') || '{}');
            isTeacher = saved.role === 'teacher' || saved.role === 'admin';
        } catch(e) {}
        
        // Barra de control de audio (solo profesores)
        var audioControlsHTML = isTeacher ? `
            <div class="audio-control-bar">
                <div class="audio-modes">
                    <button id="audio-mode-midi" class="audio-mode-btn active" data-mode="MIDI_HYBRID" title="Piano + Voz (AEC ON, ANS OFF)">
                        🎹
                    </button>
                    <button id="audio-mode-voice" class="audio-mode-btn" data-mode="CONVERSATION" title="Solo Voz (filtros agresivos)">
                        💬
                    </button>
                    <button id="audio-mode-raw" class="audio-mode-btn" data-mode="EMERGENCY" title="Sin Filtros (audio raw)">
                        🔴
                    </button>
                </div>
                <div class="audio-actions">
                    <button id="remote-mute-btn" class="audio-mute-mini" title="Silenciar estudiante">
                        🔊
                    </button>
                    <div class="audio-level-mini">
                        <div id="remote-audio-level" class="audio-level-fill"></div>
                    </div>
                </div>
            </div>
            <div id="audio-control-status" class="audio-control-status">
                <span class="mode-indicator">🎹 Piano + Voz</span>
            </div>
        ` : '';
        
        container.innerHTML = `
            <div class="video-header">
                <span class="video-title" id="remote-video-title">👥 Remoto</span>
                <div class="video-controls">
                    <button id="remote-minimize" class="video-btn" title="Minimizar">−</button>
                </div>
            </div>
            <div class="video-body">
                <div id="remote-video-container" class="video-player"></div>
                ${audioControlsHTML}
                <div id="remote-status" class="video-status">Esperando...</div>
            </div>
        `;
        
        return container;
    };

    /**
     * Remueve los contenedores del DOM (cleanup)
     * @private
     */
    VideoManager.prototype._removeVideoContainers = function() {
        var local = document.getElementById('local-video');
        var remote = document.getElementById('remote-video');
        
        if (local) {
            local.remove();
            console.log('[VideoManager] 🗑️ Contenedor local removido');
        }
        
        if (remote) {
            remote.remove();
            console.log('[VideoManager] 🗑️ Contenedor remoto removido');
        }
        
        this.hasUIElements = false;
    };

    /**
     * Inicializa el sistema de arrastre para las ventanas
     * @private
     */
    VideoManager.prototype._initDraggableSystem = function() {
        var self = this;
        
        // Verificar que DraggableVideo esté disponible
        if (typeof DraggableVideo === 'undefined') {
            console.warn('[VideoManager] ⚠️ DraggableVideo no disponible, ventanas no serán draggables');
            return;
        }
        
        // Crear instancia y configurar
        self.draggableVideo = new DraggableVideo();
        
        // Inicializar con los selectores de ventanas
        self.draggableVideo.init(['#local-video', '#remote-video']);
        
        console.log('[VideoManager] ✅ Sistema de arrastre inicializado');
    };

    // ==================================================
    // FASE 2: AGORA RTC - STREAMING METHODS
    // ==================================================

    /**
     * Crea y configura el cliente Agora RTC
     * @private
     */
    VideoManager.prototype._createAgoraClient = function() {
        var self = this;
        
        try {
            // Crear cliente RTC
            self.client = AgoraRTC.createClient({
                mode: 'rtc',
                codec: 'vp8'
            });
            
            // ====== NUEVO: Habilitar indicador de volumen para monitoreo ======
            self.client.enableAudioVolumeIndicator();
            console.log('[VideoManager] 📊 Indicador de volumen habilitado');
            
            // Event listeners del cliente
            self._setupAgoraEventListeners();
            
            console.log('[VideoManager] ✅ Cliente Agora creado');
        } catch (error) {
            console.error('[VideoManager] ❌ Error creando cliente Agora:', error);
            self.bus.emit('video-error', {
                type: 'client-creation-failed',
                message: error.message
            });
        }
    };

    /**
     * Configura event listeners del cliente Agora
     * @private
     */
    VideoManager.prototype._setupAgoraEventListeners = function() {
        var self = this;
        
        // ====== NUEVO: Usuario remoto se unió (tracking temprano) ======
        self.client.on('user-joined', function(user) {
            console.log('[VideoManager] 👤 Usuario remoto se unió. UID:', user.uid);
            self._updateRemoteStatus('connecting');
            self.bus.emit('video-user-joined', { uid: user.uid });
        });
        
        // Usuario remoto publicó tracks
        self.client.on('user-published', async function(user, mediaType) {
            console.log('[VideoManager] 📡 Usuario remoto publicó:', mediaType, 'UID:', user.uid);
            
            // Retry logic para suscripción
            var maxRetries = 3;
            var retryDelay = 1000;
            
            for (var attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    // Suscribirse al track
                    await self.client.subscribe(user, mediaType);
                    console.log('[VideoManager] ✅ Suscrito a', mediaType, 'de UID:', user.uid, '(intento', attempt + ')');
                    
                    // Guardar usuario
                    if (!self.remoteUsers[user.uid]) {
                        self.remoteUsers[user.uid] = user;
                    }
                    
                    // Renderizar según tipo de media
                    if (mediaType === 'video') {
                        self._playRemoteVideo(user);
                        self._updateRemoteStatus('connected');
                    }
                    
                    if (mediaType === 'audio') {
                        // ====== NUEVO: Verificar que audioTrack existe ======
                        if (!user.audioTrack) {
                            console.warn('[VideoManager] ⚠️ audioTrack es null, esperando...');
                            await new Promise(function(resolve) { setTimeout(resolve, 500); });
                        }
                        
                        if (user.audioTrack) {
                            // ====== NUEVO: Manejo de autoplay policy ======
                            try {
                                await user.audioTrack.play();
                                console.log('[VideoManager] 🔊 Audio remoto reproduciéndose');
                                self.bus.emit('video-remote-audio-playing', { uid: user.uid });
                            } catch (playError) {
                                console.warn('[VideoManager] ⚠️ Autoplay bloqueado, requiere interacción del usuario');
                                console.warn('[VideoManager] Error:', playError.message);
                                
                                // Guardar track para reproducir después de interacción
                                self._pendingAudioTrack = user.audioTrack;
                                self._pendingAudioUid = user.uid;
                                
                                // Notificar a UI para mostrar botón de "Activar Audio"
                                self.bus.emit('video-audio-blocked', { 
                                    uid: user.uid,
                                    reason: 'autoplay-policy'
                                });
                                
                                // Intentar reproducir en próxima interacción del usuario
                                self._setupAudioUnblockListener();
                            }
                        } else {
                            console.error('[VideoManager] ❌ audioTrack sigue siendo null después de esperar');
                        }
                    }
                    
                    // Éxito - salir del loop de retry
                    break;
                    
                } catch (error) {
                    console.error('[VideoManager] ❌ Error suscribiendo a usuario (intento ' + attempt + '):', error.message);
                    
                    if (attempt < maxRetries) {
                        console.log('[VideoManager] 🔄 Reintentando en ' + retryDelay + 'ms...');
                        await new Promise(function(resolve) { setTimeout(resolve, retryDelay); });
                        retryDelay *= 2; // Backoff exponencial
                    } else {
                        console.error('[VideoManager] ❌ Falló después de ' + maxRetries + ' intentos');
                        self.bus.emit('video-subscription-failed', {
                            uid: user.uid,
                            mediaType: mediaType,
                            error: error.message
                        });
                    }
                }
            }
        });
        
        // Usuario remoto dejó de publicar
        self.client.on('user-unpublished', function(user, mediaType) {
            console.log('[VideoManager] 📴 Usuario remoto dejó de publicar:', mediaType);
            
            if (mediaType === 'video') {
                var container = document.getElementById('remote-video-container');
                if (container) {
                    container.innerHTML = '';
                }
            }
            
            if (mediaType === 'audio') {
                console.log('[VideoManager] 🔇 Audio remoto detenido');
                self.bus.emit('video-remote-audio-stopped', { uid: user.uid });
            }
        });
        
        // Usuario remoto se fue
        self.client.on('user-left', function(user) {
            console.log('[VideoManager] 👋 Usuario remoto se fue. UID:', user.uid);
            delete self.remoteUsers[user.uid];
            
            var container = document.getElementById('remote-video-container');
            if (container) {
                container.innerHTML = '';
            }
            self._updateRemoteStatus('waiting');
        });
        
        // Connection state changed
        self.client.on('connection-state-change', function(curState, prevState) {
            console.log('[VideoManager] 🔌 Estado conexión:', prevState, '→', curState);
            self.bus.emit('video-connection-state', { current: curState, previous: prevState });
            
            // ====== NUEVO: Manejar reconexión ======
            if (curState === 'DISCONNECTED') {
                console.warn('[VideoManager] ⚠️ Desconectado de Agora');
                self._updateLocalStatus('disconnected');
                self._updateRemoteStatus('disconnected');
            } else if (curState === 'RECONNECTING') {
                console.warn('[VideoManager] 🔄 Reconectando a Agora...');
                self._updateLocalStatus('reconnecting');
            } else if (curState === 'CONNECTED' && prevState === 'RECONNECTING') {
                console.log('[VideoManager] ✅ Reconexión exitosa');
                self._updateLocalStatus('connected');
            }
        });
        
        // ====== NUEVO: Listener de excepciones de Agora ======
        self.client.on('exception', function(event) {
            console.error('[VideoManager] ⚠️ Excepción Agora:', event.code, event.msg);
            
            // Códigos específicos de audio
            var audioErrorCodes = [
                'AUDIO_INPUT_LEVEL_TOO_LOW',
                'AUDIO_OUTPUT_BLOCKED', 
                'MICROPHONE_IS_MUTED',
                'NO_AUDIO_INPUT_DEVICE'
            ];
            
            if (audioErrorCodes.includes(event.code)) {
                console.error('[VideoManager] 🔊 Error de audio detectado:', event.code);
                self.bus.emit('video-audio-exception', {
                    code: event.code,
                    message: event.msg
                });
            }
        });
        
        // ====== NUEVO: Monitoreo de calidad de red ======
        self.client.on('network-quality', function(stats) {
            // Solo loguear si la calidad es mala
            if (stats.uplinkNetworkQuality >= 4 || stats.downlinkNetworkQuality >= 4) {
                console.warn('[VideoManager] ⚠️ Calidad de red baja - Uplink:', stats.uplinkNetworkQuality, 'Downlink:', stats.downlinkNetworkQuality);
                self.bus.emit('video-network-quality', {
                    uplink: stats.uplinkNetworkQuality,
                    downlink: stats.downlinkNetworkQuality,
                    warning: true
                });
            }
        });
        
        // ====== NUEVO: Listener de volumen de audio remoto ======
        self.client.on('volume-indicator', function(volumes) {
            volumes.forEach(function(volume) {
                if (volume.uid && volume.level > 0) {
                    // Audio remoto detectado
                    self.bus.emit('video-remote-audio-level', {
                        uid: volume.uid,
                        level: volume.level
                    });
                }
            });
        });
    };
    
    /**
     * NUEVO: Configura listener para desbloquear audio después de interacción del usuario
     * @private
     */
    VideoManager.prototype._setupAudioUnblockListener = function() {
        var self = this;
        
        // Si ya hay listener, no agregar otro
        if (self._audioUnblockListenerAdded) return;
        
        var unblockAudio = async function() {
            if (self._pendingAudioTrack) {
                try {
                    console.log('[VideoManager] 🔓 Intentando reproducir audio después de interacción...');
                    await self._pendingAudioTrack.play();
                    console.log('[VideoManager] 🔊 Audio remoto desbloqueado y reproduciéndose');
                    self.bus.emit('video-remote-audio-playing', { uid: self._pendingAudioUid });
                    
                    // Limpiar
                    self._pendingAudioTrack = null;
                    self._pendingAudioUid = null;
                    
                    // Remover listener
                    document.removeEventListener('click', unblockAudio);
                    document.removeEventListener('keydown', unblockAudio);
                    self._audioUnblockListenerAdded = false;
                } catch (error) {
                    console.error('[VideoManager] ❌ Error reproduciendo audio:', error);
                }
            }
        };
        
        document.addEventListener('click', unblockAudio, { once: true });
        document.addEventListener('keydown', unblockAudio, { once: true });
        self._audioUnblockListenerAdded = true;
        
        console.log('[VideoManager] 👆 Esperando interacción del usuario para desbloquear audio...');
    };

    /**
     * Une al usuario al canal de Agora
     * @param {string} channelName - Nombre del canal (roomCode del MIDI)
     * @param {string} [token=null] - Token de autenticación (opcional)
     * @returns {Promise<void>}
     */
    VideoManager.prototype.joinChannel = async function(channelName, token) {
        var self = this;
        
        if (!self.isInitialized || !self.client) {
            throw new Error('VideoManager no inicializado o cliente no creado');
        }
        
        if (self.isJoined) {
            console.warn('[VideoManager] Ya estás en un canal');
            return;
        }
        
        // VALIDACIÓN CRÍTICA: Verificar appId
        if (!self.appId) {
            console.error('[VideoManager] ❌ CRÍTICO: appId es undefined o null');
            throw new Error('AppId no disponible. Verifica AGORA_APP_ID en .env');
        }
        
        console.log('[VideoManager] 🔍 Validación pre-join:');
        console.log('  - AppId:', self.appId ? (self.appId.substring(0, 8) + '... (length: ' + self.appId.length + ')') : 'UNDEFINED');
        console.log('  - Channel:', channelName);
        console.log('  - Token:', token || 'null');
        
        try {
            console.log('[VideoManager] 📡 Uniéndose al canal:', channelName);
            
            // Join al canal
            self.uid = await self.client.join(
                self.appId,
                channelName,
                token || null,
                null // UID automático
            );
            
            self.channelName = channelName;
            self.isJoined = true;
            
            console.log('[VideoManager] ✅ Unido al canal:', channelName, '| UID:', self.uid);
            
            // Crear y publicar tracks
            await self._createAndPublishTracks();
            
            self._updateLocalStatus('connected');
            self.bus.emit('video-joined-channel', { channelName: channelName, uid: self.uid });
            
        } catch (error) {
            console.error('[VideoManager] ❌ Error uniéndose al canal:', error);
            console.error('[VideoManager] 🔍 Debug info:');
            console.error('  - self.appId:', self.appId);
            console.error('  - typeof self.appId:', typeof self.appId);
            console.error('  - channelName:', channelName);
            
            self.bus.emit('video-error', {
                type: 'join-failed',
                message: error.message
            });
            throw error;
        }
    };

    /**
     * Crea tracks de audio/video y los publica
     * @private
     */
    VideoManager.prototype._createAndPublishTracks = async function() {
        var self = this;
        
        try {
            // === CREAR VIDEO TRACK (720p_1) ===
            console.log('[VideoManager] 📹 Creando video track (720p_1)...');
            self.localVideoTrack = await AgoraRTC.createCameraVideoTrack({
                encoderConfig: '720p_1', // 1280x720, 15fps - Óptimo para Dell
                optimizationMode: 'detail' // Mejor calidad para partitur as
            });
            console.log('[VideoManager] ✅ Video track creado');
            
            // === CREAR AUDIO TRACK (Sin ANS/AGC para piano natural) ===
            console.log('[VideoManager] 🎤 Creando audio track (natural piano)...');
            self.localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack({
                AEC: true,  // Echo cancellation SI (evitar feedback)
                ANS: false, // Noise suppression NO (piano es "ruido")
                AGC: false, // Auto gain control NO (piano tiene dinámicas naturales)
                echoCancellation: true // Echo cancellation adicional del navegador
            });
            console.log('[VideoManager] ✅ Audio track creado');
            
            // === CONFIGURAR AUDIO BRIDGE CON DUCKING ===
            self._setupAudioBridge();
            
            // === INICIAR MONITOR DE NIVEL DE AUDIO ===
            self._startAudioLevelMonitor();
            
            // === PUBLICAR TRACKS ===
            console.log('[VideoManager] 📤 Publicando tracks...');
            await self.client.publish([self.localVideoTrack, self.localAudioTrack]);
            console.log('[VideoManager] ✅ Tracks publicados');
            
            // === RENDERIZAR VIDEO LOCAL ===
            self._playLocalVideo();
            
        } catch (error) {
            console.error('[VideoManager] ❌ Error creando/publicando tracks:', error);
            
            // Error handling silencioso - notificar pero no bloquear MIDI
            self.bus.emit('video-error', {
                type: 'track-creation-failed',
                message: error.message,
                silent: true // No mostrar alert, solo log en diagnóstico
            });
            
            throw error;
        }
    };

    /**
     * SMART AUDIO BRIDGE - Simplified Implementation
     * Usa setVolume() de Agora para ducking MIDI-aware
     * @private
     */
    VideoManager.prototype._setupAudioBridge = function() {
        var self = this;
        
        if (!self.localAudioTrack) {
            console.warn('[VideoManager] ❌ No hay audio track para Smart Audio Bridge');
            return;
        }
        
        try {
            console.log('[VideoManager] 🔧 Iniciando Smart Audio Bridge (Agora setVolume)...');
            
            // Establecer volumen normal inicial
            self.localAudioTrack.setVolume(Math.round(self.normalVolume * 100));
            
            console.log('[VideoManager] ✅ Smart Audio Bridge activo:');
            console.log('  - Ducking: 100% → 0% cuando MIDI activo (silencio total)');
            console.log('  - Recovery: 0% → 100% fade-in gradual 1.5s tras 1s silencio');
            
            // CONECTAR CON MIDI STATE MANAGER
            self._connectMidiDucking();
            
            // NOTA: Los osciladores web están permanentemente deshabilitados
            // No es necesario silenciar AudioScheduler porque ya no genera tonos
            
        } catch (error) {
            console.error('[VideoManager] ❌ Error en Smart Audio Bridge:', error);
            console.error('Fallback: Continuando sin procesamiento DSP');
        }
    };

    /**
     * SMART MIDI DUCKING - Conecta con MidiStateManager
     * Usa setVolume() de Agora para atenuación limpia
     * @private
     */
    VideoManager.prototype._connectMidiDucking = function() {
        var self = this;
        
        if (!self.localAudioTrack) {
            console.warn('[VideoManager] ⚠️ Audio track no disponible, ducking deshabilitado');
            return;
        }
        
        // Escuchar eventos MIDI del bus (emitidos por MidiStateManager)
        self.bus.on('local-note', function(data) {
            if (!self.duckingEnabled || !self.localAudioTrack) return;
            
            // === MIDI ACTIVITY DETECTED ===
            self.isMidiActive = true;
            
            // DUCKING INSTANTÁNEO: 100% → 0% (SILENCIO TOTAL)
            self.localAudioTrack.setVolume(0); // 0% para eliminar eco completamente
            
            // Cancelar recovery anterior
            if (self.duckingTimeoutId) {
                clearTimeout(self.duckingTimeoutId);
            }
            
            // Cancelar fade-in anterior si existe
            if (self.fadeInIntervalId) {
                clearInterval(self.fadeInIntervalId);
                self.fadeInIntervalId = null;
            }
            
            // === PROGRAMAR RECOVERY AUTOMÁTICA ===
            // Esperar 1 segundo de silencio MIDI antes de restaurar
            self.duckingTimeoutId = setTimeout(function() {
                if (!self.localAudioTrack || self.isMuted.audio) return;
                
                // FADE-IN GRADUAL: 0% → 100% en 1.5 segundos
                var currentVolume = 0;
                var targetVolume = 100;
                var steps = 30; // 30 pasos para suavidad
                var stepDuration = self.FADE_IN_DURATION_MS / steps; // ~50ms por paso
                var volumeIncrement = targetVolume / steps; // ~3.33% por paso
                
                self.fadeInIntervalId = setInterval(function() {
                    if (!self.localAudioTrack || self.isMuted.audio) {
                        clearInterval(self.fadeInIntervalId);
                        self.fadeInIntervalId = null;
                        return;
                    }
                    
                    currentVolume += volumeIncrement;
                    
                    if (currentVolume >= targetVolume) {
                        // Llegamos al 100%
                        self.localAudioTrack.setVolume(targetVolume);
                        clearInterval(self.fadeInIntervalId);
                        self.fadeInIntervalId = null;
                        self.isMidiActive = false;
                        console.log('[VideoManager] 🎤 Micrófono restaurado a 100% (fade-in completo)');
                    } else {
                        // Incremento gradual
                        self.localAudioTrack.setVolume(Math.round(currentVolume));
                    }
                }, stepDuration);
                
                console.log('[VideoManager] 🎤 Iniciando fade-in gradual (1.5s)');
                
            }, self.MIDI_SILENCE_THRESHOLD_MS);
        });
        
        console.log('[VideoManager] ✅ Smart MIDI Ducking conectado');
        console.log('  - Ducked Level: 0% (silencio total)');
        console.log('  - Recovery: fade-in gradual 1.5s tras 1s silencio');
    };

    /**
     * AUDIO LEVEL MONITOR - Muestra nivel de audio en tiempo real
     * Ayuda a verificar que el micrófono está funcionando
     * @private
     */
    VideoManager.prototype._startAudioLevelMonitor = function() {
        var self = this;
        
        if (!self.localAudioTrack) {
            console.warn('[VideoManager] No hay audio track para monitorear');
            return;
        }
        
        var audioLevelBar = document.getElementById('audio-level-bar');
        var audioLevelText = document.getElementById('audio-level-text');
        
        if (!audioLevelBar || !audioLevelText) {
            console.warn('[VideoManager] Elementos de UI de nivel de audio no encontrados');
            return;
        }
        
        // Monitor de nivel cada 100ms
        self.audioLevelInterval = setInterval(function() {
            if (!self.localAudioTrack || self.isMuted.audio) {
                audioLevelBar.style.width = '0%';
                audioLevelText.textContent = '0%';
                return;
            }
            
            // Obtener nivel de volumen (0-100)
            var level = self.localAudioTrack.getVolumeLevel();
            var percentage = Math.round(level * 100);
            
            // Actualizar UI
            audioLevelBar.style.width = percentage + '%';
            audioLevelText.textContent = percentage + '%';
            
        }, 100);
        
        console.log('[VideoManager] ✅ Monitor de nivel de audio iniciado');
    };

    /**
     * ZERO LATENCY EXPERIENCE - Silencia AudioScheduler local
     * El profesor escucha su piano físico directamente, sin tonos web
     * El alumno recibe el audio digital procesado por Agora
     * @param {boolean} mute - true para silenciar, false para activar
     * @private
     */
    VideoManager.prototype._muteLocalAudioScheduler = function(mute) {
        var self = this;
        
        try {
            console.log('[VideoManager] 📢 Emitiendo evento video-mute-audio-scheduler:', mute);
            self.bus.emit('video-mute-audio-scheduler', { muted: mute });
            console.log('[VideoManager] 🎹 AudioScheduler local:', mute ? 'SILENCIADO' : 'ACTIVO');
        } catch (error) {
            console.error('[VideoManager] ❌ Error controlando AudioScheduler:', error);
        }
    };

    /**
     * Renderiza video local en el contenedor
     * @private
     */
    VideoManager.prototype._playLocalVideo = function() {
        var container = document.getElementById('local-video-container');
        
        if (!container) {
            console.warn('[VideoManager] Contenedor local no encontrado');
            return;
        }
        
        if (!this.localVideoTrack) {
            console.warn('[VideoManager] No hay video track local');
            return;
        }
        
        // Limpiar contenedor
        container.innerHTML = '';
        
        // Play video track
        this.localVideoTrack.play(container);
        
        console.log('[VideoManager] ✅ Video local renderizado');
    };

    /**
     * Renderiza video remoto en el contenedor
     * @private
     */
    VideoManager.prototype._playRemoteVideo = function(user) {
        var container = document.getElementById('remote-video-container');
        
        if (!container) {
            console.warn('[VideoManager] Contenedor remoto no encontrado');
            return;
        }
        
        if (!user.videoTrack) {
            console.warn('[VideoManager] Usuario remoto no tiene video track');
            return;
        }
        
        // Limpiar contenedor
        container.innerHTML = '';
        
        // Play video track
        user.videoTrack.play(container);
        
        console.log('[VideoManager] ✅ Video remoto renderizado. UID:', user.uid);
    };

    /**
     * Actualiza estado visual del contenedor local
     * @private
     */
    VideoManager.prototype._updateLocalStatus = function(status) {
        var statusEl = document.getElementById('local-status');
        if (statusEl) {
            statusEl.textContent = status === 'connected' ? 'Conectado' : 'Desconectado';
            statusEl.className = 'video-status' + (status === 'connected' ? ' connected' : '');
        }
    };

    /**
     * Actualiza estado visual del contenedor remoto
     * @private
     */
    VideoManager.prototype._updateRemoteStatus = function(status) {
        var statusEl = document.getElementById('remote-status');
        if (statusEl) {
            var text = status === 'connected' ? 'Conectado' : 
                       status === 'waiting' ? 'Esperando...' : 'Desconectado';
            statusEl.textContent = text;
            statusEl.className = 'video-status' + (status === 'connected' ? ' connected' : '');
        }
    };

    /**
     * Mute/unmute audio local
     * @param {boolean} mute - true para mutear
     */
    VideoManager.prototype.muteAudio = async function(mute) {
        if (!this.localAudioTrack) {
            console.warn('[VideoManager] No hay audio track');
            return;
        }
        
        try {
            await this.localAudioTrack.setEnabled(!mute);
            this.isMuted.audio = mute;
            console.log('[VideoManager] Audio', mute ? 'muteado' : 'activado');
            this.bus.emit('video-audio-muted', mute);
        } catch (error) {
            console.error('[VideoManager] Error mute audio:', error);
        }
    };

    /**
     * Mute/unmute video local
     * @param {boolean} mute - true para mutear
     */
    VideoManager.prototype.muteVideo = async function(mute) {
        if (!this.localVideoTrack) {
            console.warn('[VideoManager] No hay video track');
            return;
        }
        
        try {
            await this.localVideoTrack.setEnabled(!mute);
            this.isMuted.video = mute;
            console.log('[VideoManager] Video', mute ? 'muteado' : 'activado');
            this.bus.emit('video-video-muted', mute);
        } catch (error) {
            console.error('[VideoManager] Error mute video:', error);
        }
    };

    /**
     * Sale del canal y limpia recursos
     */
    VideoManager.prototype.leaveChannel = async function() {
        var self = this;
        
        if (!self.isJoined) {
            console.warn('[VideoManager] No estás en un canal');
            return;
        }
        
        try {
            console.log('[VideoManager] 📴 Saliendo del canal...');
            
            // Detener tracks locales
            if (self.localAudioTrack) {
                self.localAudioTrack.stop();
                self.localAudioTrack.close();
                self.localAudioTrack = null;
            }
            
            if (self.localVideoTrack) {
                self.localVideoTrack.stop();
                self.localVideoTrack.close();
                self.localVideoTrack = null;
            }
            
            // Leave channel
            await self.client.leave();
            
            self.isJoined = false;
            self.channelName = null;
            self.uid = null;
            self.remoteUsers = {};
            
            // === REACTIVAR AUDIO SCHEDULER LOCAL ===
            // NOTA: Los osciladores web están permanentemente deshabilitados
            // No es necesario reactivar nada
            
            // === LIMPIAR SMART AUDIO BRIDGE ===
            if (self.duckingTimeoutId) {
                clearTimeout(self.duckingTimeoutId);
                self.duckingTimeoutId = null;
            }
            
            if (self.fadeInIntervalId) {
                clearInterval(self.fadeInIntervalId);
                self.fadeInIntervalId = null;
            }
            
            // === DETENER MONITOR DE AUDIO ===
            if (self.audioLevelInterval) {
                clearInterval(self.audioLevelInterval);
                self.audioLevelInterval = null;
            }
            
            console.log('[VideoManager] 🔧 Smart Audio Bridge desconectado');
            
            // Limpiar UI
            self._updateLocalStatus('disconnected');
            self._updateRemoteStatus('disconnected');
            
            var localContainer = document.getElementById('local-video-container');
            var remoteContainer = document.getElementById('remote-video-container');
            if (localContainer) localContainer.innerHTML = '';
            if (remoteContainer) remoteContainer.innerHTML = '';
            
            console.log('[VideoManager] ✅ Salido del canal correctamente');
            self.bus.emit('video-left-channel');
            
        } catch (error) {
            console.error('[VideoManager] ❌ Error saliendo del canal:', error);
            throw error;
        }
    };
    
    // ==================================================
    // NUEVO: MÉTODOS DE DIAGNÓSTICO
    // ==================================================
    
    /**
     * Obtiene diagnóstico completo del estado de video/audio
     * Útil para debugging durante demos
     * @returns {Object} Estado completo del VideoManager
     */
    VideoManager.prototype.getDiagnostics = function() {
        var self = this;
        
        var diagnostics = {
            timestamp: new Date().toISOString(),
            initialized: self.isInitialized,
            joined: self.isJoined,
            channelName: self.channelName,
            uid: self.uid,
            hasAppId: !!self.appId,
            hasClient: !!self.client,
            localTracks: {
                audio: !!self.localAudioTrack,
                video: !!self.localVideoTrack,
                audioEnabled: self.localAudioTrack ? self.localAudioTrack.enabled : false,
                videoEnabled: self.localVideoTrack ? self.localVideoTrack.enabled : false,
                audioMuted: self.isMuted.audio,
                videoMuted: self.isMuted.video
            },
            remoteUsers: Object.keys(self.remoteUsers).map(function(uid) {
                var user = self.remoteUsers[uid];
                return {
                    uid: uid,
                    hasAudio: !!user.audioTrack,
                    hasVideo: !!user.videoTrack,
                    audioPlaying: user.audioTrack ? !user.audioTrack.isPlaying : false
                };
            }),
            pendingAudio: {
                hasPendingTrack: !!self._pendingAudioTrack,
                pendingUid: self._pendingAudioUid
            },
            ducking: {
                enabled: self.duckingEnabled,
                midiActive: self.isMidiActive
            }
        };
        
        console.log('[VideoManager] 📊 DIAGNÓSTICO:', JSON.stringify(diagnostics, null, 2));
        return diagnostics;
    };
    
    /**
     * Fuerza reproducción de audio remoto (para debugging)
     * Usar en consola: videoManager.forcePlayRemoteAudio()
     */
    VideoManager.prototype.forcePlayRemoteAudio = async function() {
        var self = this;
        
        console.log('[VideoManager] 🔧 Forzando reproducción de audio remoto...');
        
        // Intentar reproducir audio pendiente primero
        if (self._pendingAudioTrack) {
            try {
                await self._pendingAudioTrack.play();
                console.log('[VideoManager] ✅ Audio pendiente reproducido');
                self._pendingAudioTrack = null;
                return true;
            } catch (e) {
                console.error('[VideoManager] ❌ Error reproduciendo audio pendiente:', e);
            }
        }
        
        // Buscar en usuarios remotos
        for (var uid in self.remoteUsers) {
            var user = self.remoteUsers[uid];
            if (user.audioTrack) {
                try {
                    await user.audioTrack.play();
                    console.log('[VideoManager] ✅ Audio de UID', uid, 'reproducido');
                    return true;
                } catch (e) {
                    console.error('[VideoManager] ❌ Error reproduciendo audio de UID', uid, ':', e);
                }
            }
        }
        
        console.warn('[VideoManager] ⚠️ No hay audio remoto disponible para reproducir');
        return false;
    };
    
    /**
     * Re-suscribe a todos los usuarios remotos (para recuperación de audio)
     */
    VideoManager.prototype.resubscribeAll = async function() {
        var self = this;
        
        console.log('[VideoManager] 🔄 Re-suscribiendo a todos los usuarios remotos...');
        
        for (var uid in self.remoteUsers) {
            var user = self.remoteUsers[uid];
            
            try {
                // Re-suscribir audio si existe
                if (user.hasAudio) {
                    await self.client.subscribe(user, 'audio');
                    if (user.audioTrack) {
                        await user.audioTrack.play();
                    }
                    console.log('[VideoManager] ✅ Re-suscrito audio de UID', uid);
                }
                
                // Re-suscribir video si existe
                if (user.hasVideo) {
                    await self.client.subscribe(user, 'video');
                    self._playRemoteVideo(user);
                    console.log('[VideoManager] ✅ Re-suscrito video de UID', uid);
                }
            } catch (e) {
                console.error('[VideoManager] ❌ Error re-suscribiendo UID', uid, ':', e);
            }
        }
    };

    // Exportar al contexto global
    global.VideoManager = VideoManager;

})(window);
