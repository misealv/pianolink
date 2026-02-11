/**
 * AudioStateManager.js - PianoLink v1.0
 * 
 * 3 PERFILES DE AUDIO PARA AGORA.IO:
 * - MIDI_HYBRID: Para clases de piano (AEC ON, ANS OFF, AGC ON)
 * - CONVERSATION: Para conversación pura (SPEECH_STANDARD, filtros agresivos)
 * - EMERGENCY: Sin procesamiento (MUSIC_HIGH_QUALITY_STEREO, todo OFF)
 * 
 * CONTROL REMOTO:
 * - Profesor puede cambiar modo de audio del estudiante
 * - Profesor puede mutear remotamente al estudiante
 * - Integración con Smart Audio Bridge (ducking MIDI)
 * 
 * @author Miguel Antonio Sepúlveda Alvarez
 * @copyright 2024 PianoLink
 */

(function(global) {
    'use strict';

    // ============================================================
    // PERFILES DE AUDIO PREDEFINIDOS
    // ============================================================
    
    /**
     * MIDI_HYBRID: Óptimo para clases de piano con micrófono
     * - AEC: ON - Elimina eco del audio reproducido
     * - ANS: OFF - NO elimina "ruido" (el piano es "ruido" útil)
     * - AGC: ON - Normaliza volumen para el estudiante remoto
     * - Echo gate: delegado a EchoGateManager.js (lado alumno)
     */
    var PROFILE_MIDI_HYBRID = {
        name: 'MIDI_HYBRID',
        displayName: '🎹 Piano + Voz',
        description: 'Óptimo para clases de piano. Captura piano real sin filtrar.',
        config: {
            AEC: true,              // Echo cancellation ON
            ANS: false,             // Noise suppression OFF (piano = señal, no ruido)
            AGC: true,              // Auto gain control ON (normaliza para remoto)
            echoCancellation: true  // Extra browser echo cancellation
        },
        icon: '🎹'
    };
    
    /**
     * CONVERSATION: Para hablar sin tocar piano
     * - Profile: SPEECH_STANDARD de Agora
     * - ANS: Agresivo para eliminar ruido ambiental
     * - AGC: ON para voz consistente
     */
    var PROFILE_CONVERSATION = {
        name: 'CONVERSATION',
        displayName: '💬 Solo Voz',
        description: 'Para conversar sin piano. Máxima claridad de voz.',
        config: {
            AEC: true,              // Echo cancellation ON
            ANS: true,              // Noise suppression ON (agresivo)
            AGC: true,              // Auto gain control ON
            echoCancellation: true
        },
        icon: '💬'
    };
    
    /**
     * EMERGENCY: Sin ningún filtro, audio RAW
     * - Para debug o grabación de alta calidad
     * - Profile: MUSIC_HIGH_QUALITY_STEREO
     * - Todo OFF para latencia mínima
     */
    var PROFILE_EMERGENCY = {
        name: 'EMERGENCY',
        displayName: '🔴 Sin Filtros',
        description: 'Audio sin procesar. Usar solo para emergencias/debug.',
        config: {
            AEC: false,             // Echo cancellation OFF
            ANS: false,             // Noise suppression OFF
            AGC: false,             // Auto gain control OFF
            echoCancellation: false
        },
        encoderConfig: 'music_standard', // Alta calidad, stereo si disponible
        icon: '🔴'
    };

    // Mapa de perfiles disponibles
    var AUDIO_PROFILES = {
        MIDI_HYBRID: PROFILE_MIDI_HYBRID,
        CONVERSATION: PROFILE_CONVERSATION,
        EMERGENCY: PROFILE_EMERGENCY
    };

    // ============================================================
    // CONSTRUCTOR
    // ============================================================
    
    /**
     * @constructor
     * @param {Object} config
     * @param {Object} config.bus - Event bus para comunicación
     * @param {Object} config.socket - Socket.io para control remoto
     * @param {Object} config.videoManager - VideoManager instance (Agora)
     */
    function AudioStateManager(config) {
        this.bus = config.bus;
        this.socket = config.socket;
        this.videoManager = config.videoManager;
        
        // Estado actual
        this.currentProfile = 'MIDI_HYBRID';
        this.isRemoteMuted = false;
        this.isLocalMuted = false;
        this.isInitialized = false;
        
        // Rol del usuario (para permisos de control)
        this.userRole = 'student';  // Se setea desde Main.js
        this.userId = null;
        
        // Cache de listeners para cleanup
        this._socketListeners = [];
        
        console.log('[AudioStateManager] Instancia creada con perfil:', this.currentProfile);
    }

    // ============================================================
    // INICIALIZACIÓN
    // ============================================================
    
    /**
     * Inicializa el manager y conecta con Socket.io
     * @param {string} role - 'teacher', 'student', 'admin'
     * @param {string} userId - ID único del usuario
     */
    AudioStateManager.prototype.init = function(role, userId) {
        var self = this;
        
        this.userRole = role;
        this.userId = userId;
        
        // Escuchar eventos de control remoto (solo estudiantes responden)
        this._setupSocketListeners();
        
        // Escuchar eventos del bus interno
        this._setupBusListeners();
        
        this.isInitialized = true;
        
        console.log('[AudioStateManager] ✅ Inicializado');
        console.log('  - Rol:', role);
        console.log('  - Perfil inicial:', this.currentProfile);
        console.log('  - Perfiles disponibles:', Object.keys(AUDIO_PROFILES).join(', '));
    };

    /**
     * Configura listeners de Socket.io para control remoto
     * @private
     */
    AudioStateManager.prototype._setupSocketListeners = function() {
        var self = this;
        
        if (!self.socket) {
            console.warn('[AudioStateManager] Socket no disponible, control remoto deshabilitado');
            return;
        }
        
        // ====== ESTUDIANTE: Recibir cambio de modo ======
        var onChangeAudioMode = function(data) {
            console.log('[AudioStateManager] 📡 Comando remoto: change-audio-mode', data);
            
            // Solo estudiantes responden a comandos remotos
            if (self.userRole === 'teacher' || self.userRole === 'admin') {
                console.log('[AudioStateManager] Ignorando comando (soy profesor/admin)');
                return;
            }
            
            // Verificar que el comando viene de un profesor de la sala
            if (data.fromRole !== 'teacher' && data.fromRole !== 'admin') {
                console.warn('[AudioStateManager] ⚠️ Comando rechazado: origen no autorizado');
                return;
            }
            
            // Aplicar nuevo perfil
            self.setProfile(data.profile, true); // true = remotely triggered
        };
        
        // ====== ESTUDIANTE: Recibir mute remoto ======
        var onRemoteMute = function(data) {
            console.log('[AudioStateManager] 📡 Comando remoto: remote-mute', data);
            
            // Solo estudiantes responden
            if (self.userRole === 'teacher' || self.userRole === 'admin') {
                return;
            }
            
            // Verificar origen autorizado
            if (data.fromRole !== 'teacher' && data.fromRole !== 'admin') {
                console.warn('[AudioStateManager] ⚠️ Mute rechazado: origen no autorizado');
                return;
            }
            
            self._applyRemoteMute(data.muted);
        };
        
        // ====== PROFESOR: Confirmación de cambio ======
        var onAudioModeConfirmed = function(data) {
            console.log('[AudioStateManager] ✅ Estudiante confirmó cambio de modo:', data);
            self.bus.emit('audio-mode-change-confirmed', data);
        };
        
        // ====== PROFESOR: Confirmación de mute ======
        var onRemoteMuteConfirmed = function(data) {
            console.log('[AudioStateManager] ✅ Estudiante confirmó mute:', data);
            self.bus.emit('remote-mute-confirmed', data);
        };
        
        // Registrar listeners
        self.socket.on('change-audio-mode', onChangeAudioMode);
        self.socket.on('remote-mute', onRemoteMute);
        self.socket.on('audio-mode-confirmed', onAudioModeConfirmed);
        self.socket.on('remote-mute-confirmed', onRemoteMuteConfirmed);
        
        // Guardar referencias para cleanup
        self._socketListeners.push(
            { event: 'change-audio-mode', handler: onChangeAudioMode },
            { event: 'remote-mute', handler: onRemoteMute },
            { event: 'audio-mode-confirmed', handler: onAudioModeConfirmed },
            { event: 'remote-mute-confirmed', handler: onRemoteMuteConfirmed }
        );
        
        console.log('[AudioStateManager] ✅ Socket listeners configurados');
    };

    /**
     * Configura listeners del event bus interno
     * @private
     */
    AudioStateManager.prototype._setupBusListeners = function() {
        var self = this;
        
        // Cuando VideoManager está listo, aplicar perfil inicial
        self.bus.on('video-joined-channel', function() {
            console.log('[AudioStateManager] VideoManager unido al canal, aplicando perfil:', self.currentProfile);
            self._applyProfileToTrack(AUDIO_PROFILES[self.currentProfile]);
        });
    };

    // ============================================================
    // CAMBIO DE PERFIL
    // ============================================================
    
    /**
     * Cambia el perfil de audio actual
     * @param {string} profileName - 'MIDI_HYBRID', 'CONVERSATION', 'EMERGENCY'
     * @param {boolean} remoteTriggered - Si fue activado remotamente
     * @returns {boolean} - true si se cambió exitosamente
     */
    AudioStateManager.prototype.setProfile = function(profileName, remoteTriggered) {
        var self = this;
        
        // Validar perfil
        if (!AUDIO_PROFILES[profileName]) {
            console.error('[AudioStateManager] ❌ Perfil no válido:', profileName);
            console.log('Perfiles disponibles:', Object.keys(AUDIO_PROFILES));
            return false;
        }
        
        var profile = AUDIO_PROFILES[profileName];
        var previousProfile = self.currentProfile;
        
        console.log('[AudioStateManager] 🔄 Cambiando perfil:', previousProfile, '→', profileName);
        
        // Aplicar configuración al track de Agora
        var success = self._applyProfileToTrack(profile);
        
        if (success) {
            self.currentProfile = profileName;
            
            // Emitir evento interno
            self.bus.emit('audio-profile-changed', {
                previous: previousProfile,
                current: profileName,
                profile: profile,
                remoteTriggered: remoteTriggered || false
            });
            
            // Si fue remoto, confirmar al profesor
            if (remoteTriggered && self.socket) {
                self.socket.emit('audio-mode-confirmed', {
                    userId: self.userId,
                    profile: profileName,
                    success: true
                });
            }
            
            console.log('[AudioStateManager] ✅ Perfil cambiado a:', profile.displayName);
            
            // Mostrar feedback visual al estudiante
            self._showProfileFeedback(profile);
        }
        
        return success;
    };

    /**
     * Aplica configuración de perfil al audio track de Agora
     * @param {Object} profile - Perfil a aplicar
     * @private
     */
    AudioStateManager.prototype._applyProfileToTrack = function(profile) {
        var self = this;
        
        if (!self.videoManager || !self.videoManager.localAudioTrack) {
            console.warn('[AudioStateManager] ⚠️ Audio track no disponible todavía');
            return false;
        }
        
        try {
            var track = self.videoManager.localAudioTrack;
            
            // Agora Web SDK 4.x: Recrear track con nueva configuración
            // NOTA: No se puede cambiar AEC/ANS/AGC en runtime, hay que recrear el track
            
            console.log('[AudioStateManager] 🔧 Aplicando configuración:', profile.config);
            
            // Echo gate delegado a EchoGateManager.js (lado alumno)
            // Asegurar volumen al 100% — nunca mutear el mic del profesor
            if (track.setVolume) {
                track.setVolume(100);
            }
            
            console.log('[AudioStateManager] ✅ Perfil aplicado (parcial, sin recrear track)');
            console.log('[AudioStateManager] 💡 Para cambio completo de AEC/ANS/AGC, requiere reconexión');
            
            return true;
            
        } catch (error) {
            console.error('[AudioStateManager] ❌ Error aplicando perfil:', error);
            return false;
        }
    };

    /**
     * Recrea el audio track con nueva configuración
     * Requiere unpublish -> create -> publish
     * @param {Object} profile - Perfil a aplicar
     * @returns {Promise<boolean>}
     */
    AudioStateManager.prototype.recreateTrackWithProfile = async function(profileName) {
        var self = this;
        
        if (!self.videoManager || !self.videoManager.client) {
            console.error('[AudioStateManager] VideoManager no disponible');
            return false;
        }
        
        var profile = AUDIO_PROFILES[profileName];
        if (!profile) {
            console.error('[AudioStateManager] Perfil inválido:', profileName);
            return false;
        }
        
        try {
            console.log('[AudioStateManager] 🔄 Recreando audio track con perfil:', profileName);
            
            var vm = self.videoManager;
            var client = vm.client;
            
            // 1. Despublicar track actual
            if (vm.localAudioTrack) {
                console.log('[AudioStateManager] Despublicando track actual...');
                await client.unpublish([vm.localAudioTrack]);
                vm.localAudioTrack.stop();
                vm.localAudioTrack.close();
            }
            
            // 2. Crear nuevo track con configuración del perfil
            console.log('[AudioStateManager] Creando nuevo track con config:', profile.config);
            vm.localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack(profile.config);
            
            // 3. Publicar nuevo track
            console.log('[AudioStateManager] Publicando nuevo track...');
            await client.publish([vm.localAudioTrack]);
            
            // 4. Actualizar estado interno
            self.currentProfile = profileName;
            
            // 5. Reconectar monitor de audio
            if (vm._startAudioLevelMonitor) {
                if (vm.audioLevelInterval) {
                    clearInterval(vm.audioLevelInterval);
                }
                vm._startAudioLevelMonitor();
            }
            
            console.log('[AudioStateManager] ✅ Track recreado con perfil:', profile.displayName);
            
            self.bus.emit('audio-track-recreated', {
                profile: profileName,
                success: true
            });
            
            return true;
            
        } catch (error) {
            console.error('[AudioStateManager] ❌ Error recreando track:', error);
            return false;
        }
    };

    // ============================================================
    // MUTE REMOTO
    // ============================================================
    
    /**
     * Aplica mute remoto (llamado por comando del profesor)
     * @param {boolean} muted
     * @private
     */
    AudioStateManager.prototype._applyRemoteMute = function(muted) {
        var self = this;
        
        self.isRemoteMuted = muted;
        
        if (self.videoManager && self.videoManager.muteAudio) {
            self.videoManager.muteAudio(muted);
        }
        
        // Confirmar al profesor
        if (self.socket) {
            self.socket.emit('remote-mute-confirmed', {
                userId: self.userId,
                muted: muted,
                success: true
            });
        }
        
        console.log('[AudioStateManager]', muted ? '🔇 MUTEADO remotamente' : '🔊 DESMUTEADO remotamente');
        
        // Feedback visual al estudiante
        self._showMuteFeedback(muted);
        
        self.bus.emit('remote-mute-applied', { muted: muted });
    };

    // ============================================================
    // COMANDOS DEL PROFESOR (para enviar a estudiantes)
    // ============================================================
    
    /**
     * [PROFESOR] Envía comando para cambiar modo de audio de un estudiante
     * @param {string} targetUserId - ID del estudiante target
     * @param {string} profileName - Perfil a aplicar
     */
    AudioStateManager.prototype.sendChangeMode = function(targetUserId, profileName) {
        var self = this;
        
        if (self.userRole !== 'teacher' && self.userRole !== 'admin') {
            console.error('[AudioStateManager] ❌ Solo profesores pueden enviar comandos');
            return;
        }
        
        if (!AUDIO_PROFILES[profileName]) {
            console.error('[AudioStateManager] ❌ Perfil inválido:', profileName);
            return;
        }
        
        if (!self.socket) {
            console.error('[AudioStateManager] Socket no disponible');
            return;
        }
        
        console.log('[AudioStateManager] 📤 Enviando change-audio-mode a:', targetUserId, '→', profileName);
        
        self.socket.emit('change-audio-mode', {
            targetUserId: targetUserId,
            profile: profileName,
            fromUserId: self.userId,
            fromRole: self.userRole
        });
    };

    /**
     * [PROFESOR] Envía comando de mute remoto a un estudiante
     * @param {string} targetUserId - ID del estudiante target
     * @param {boolean} muted - true para mutear
     */
    AudioStateManager.prototype.sendRemoteMute = function(targetUserId, muted) {
        var self = this;
        
        if (self.userRole !== 'teacher' && self.userRole !== 'admin') {
            console.error('[AudioStateManager] ❌ Solo profesores pueden mutear remotamente');
            return;
        }
        
        if (!self.socket) {
            console.error('[AudioStateManager] Socket no disponible');
            return;
        }
        
        console.log('[AudioStateManager] 📤 Enviando remote-mute a:', targetUserId, '→', muted);
        
        self.socket.emit('remote-mute', {
            targetUserId: targetUserId,
            muted: muted,
            fromUserId: self.userId,
            fromRole: self.userRole
        });
    };

    // ============================================================
    // UI FEEDBACK
    // ============================================================
    
    /**
     * Muestra feedback visual cuando cambia el perfil
     * @param {Object} profile
     * @private
     */
    AudioStateManager.prototype._showProfileFeedback = function(profile) {
        // Toast temporal de feedback
        var toast = document.createElement('div');
        toast.className = 'audio-profile-toast';
        toast.innerHTML = profile.icon + ' ' + profile.displayName;
        toast.style.cssText = `
            position: fixed;
            bottom: 100px;
            right: 20px;
            background: linear-gradient(135deg, rgba(48,53,103,0.95), rgba(30,34,70,0.95));
            color: white;
            padding: 12px 24px;
            border-radius: 12px;
            font-size: 14px;
            font-weight: 600;
            box-shadow: 0 8px 32px rgba(0,0,0,0.4);
            z-index: 10000;
            animation: slideInRight 0.3s ease;
            border: 1px solid rgba(255,255,255,0.1);
        `;
        
        document.body.appendChild(toast);
        
        // Remover después de 3s
        setTimeout(function() {
            toast.style.animation = 'fadeOut 0.3s ease';
            setTimeout(function() {
                toast.remove();
            }, 300);
        }, 3000);
    };

    /**
     * Muestra feedback visual de mute remoto
     * @param {boolean} muted
     * @private
     */
    AudioStateManager.prototype._showMuteFeedback = function(muted) {
        var toast = document.createElement('div');
        toast.innerHTML = muted ? '🔇 Tu micrófono fue silenciado por el profesor' 
                                : '🔊 Tu micrófono fue activado por el profesor';
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: ${muted ? 'rgba(244,67,54,0.95)' : 'rgba(76,175,80,0.95)'};
            color: white;
            padding: 16px 32px;
            border-radius: 12px;
            font-size: 16px;
            font-weight: 600;
            box-shadow: 0 8px 32px rgba(0,0,0,0.4);
            z-index: 10001;
            animation: bounceIn 0.5s ease;
        `;
        
        document.body.appendChild(toast);
        
        setTimeout(function() {
            toast.style.animation = 'fadeOut 0.5s ease';
            setTimeout(function() {
                toast.remove();
            }, 500);
        }, 4000);
    };

    // ============================================================
    // GETTERS
    // ============================================================
    
    /**
     * Obtiene el perfil actual
     * @returns {Object}
     */
    AudioStateManager.prototype.getProfile = function() {
        return AUDIO_PROFILES[this.currentProfile];
    };

    /**
     * Obtiene todos los perfiles disponibles
     * @returns {Object}
     */
    AudioStateManager.prototype.getAvailableProfiles = function() {
        return AUDIO_PROFILES;
    };

    /**
     * Verifica si el audio está muteado (local o remoto)
     * @returns {boolean}
     */
    AudioStateManager.prototype.isMuted = function() {
        return this.isLocalMuted || this.isRemoteMuted;
    };

    // ============================================================
    // CLEANUP
    // ============================================================
    
    /**
     * Limpia recursos y listeners
     */
    AudioStateManager.prototype.destroy = function() {
        var self = this;
        
        // Remover socket listeners
        if (self.socket) {
            self._socketListeners.forEach(function(listener) {
                self.socket.off(listener.event, listener.handler);
            });
        }
        
        self._socketListeners = [];
        self.isInitialized = false;
        
        console.log('[AudioStateManager] 🧹 Recursos limpiados');
    };

    // ============================================================
    // EXPORTAR
    // ============================================================
    
    global.AudioStateManager = AudioStateManager;
    
    // También exportar perfiles como constante pública
    global.AUDIO_PROFILES = AUDIO_PROFILES;

})(window);
