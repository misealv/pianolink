/**
 * /public/js/modules/SocketClient.js
 * Adaptador de Red con Middleware de Estado y Hibernación Limpia (Fase 3)
 * HIGH-PRIORITY MIDI STREAM (Fase 5)
 */
import { MidiProtocol } from '../core/MidiProtocol.js';
import { MidiProtocolV2 } from '../core/MidiProtocolV2.js';
import { MidiBundler } from '../core/MidiBundler.js';

export class SocketClient {
    constructor(eventBus) {
        this.bus = eventBus;
        this.socket = io({ 
            transports: ['websocket', 'polling'],
            upgrade: true,
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            timeout: 20000
        });
        this.protocol = new MidiProtocol();
        this.protocolV2 = new MidiProtocolV2(); // NUEVO: Protocolo de bundles
        this.roomCode = null;
        this._heartbeatInterval = null; // Heartbeat manual adicional
        this._lastHeartbeatResponse = Date.now();
        this._heartbeatMissedCount = 0; // Contador de heartbeats perdidos
        
        // --- FASE 3: MIDDLEWARE DE ESTADO ---
        this._connectionState = 'disconnected'; // 'disconnected', 'connecting', 'connected', 'hibernating'
        this._pendingMessages = [];
        this._isDisposed = false;
        this._reconnectHandler = null;
        this._connectErrorHandler = null;
        
        // === HIGH-PRIORITY MIDI STREAM (FASE 5) ===
        this.midiBundler = new MidiBundler((bundle) => {
            this._sendMidiBundle(bundle);
        });
        
        this.initListeners();
    }

    initListeners() {
        // --- LIFECYCLE: CONNECT ---
        this.socket.on("connect", () => {
            this._connectionState = 'connected';
            this.bus.emit("net-status", "ONLINE");
            console.log('[SocketClient] ✅ Conectado. Estado:', this._connectionState);
            
            // Procesar mensajes pendientes (si los hay)
            this._flushPendingMessages();
        });
        
        // --- LIFECYCLE: DISCONNECT ---
        this.socket.on("disconnect", (reason) => {
            console.warn(`[SocketClient] 🔴 Desconectado. Razón: ${reason}`);
            this.stopHeartbeat(); // Detener keepalive
            this._enterHibernation();
            this.bus.emit("net-status", "OFFLINE");
            this.bus.emit("net-disconnect-cleanup");
            
            // NUEVO: Si la desconexión es por el servidor, forzar reconexión más agresiva
            if (reason === 'io server disconnect' || reason === 'transport close') {
                console.warn('[SocketClient] Desconexión forzada del servidor, reconectando inmediatamente...');
                setTimeout(() => {
                    if (!this.socket.connected) {
                        this.socket.connect();
                    }
                }, 100);
            }
        });
        
        // --- LIFECYCLE: RECONNECTING ---
        this._reconnectHandler = (attemptNumber) => {
            console.log(`[SocketClient] 🔄 Reintentando conexión... Intento ${attemptNumber}`);
            this._connectionState = 'connecting';
            this.bus.emit("net-status", "RECONNECTING");
        };
        this.socket.io.on("reconnect_attempt", this._reconnectHandler);
        
        // --- LIFECYCLE: RECONNECT SUCCESS ---
        this.socket.io.on("reconnect", (attemptNumber) => {
            console.log(`[SocketClient] ✅ Reconectado después de ${attemptNumber} intentos.`);
            this._connectionState = 'connected';
            
            // Intentar recuperar sala desde localStorage si se perdió
            if (!this.roomCode) {
                const savedRoom = localStorage.getItem('pianolink-last-room');
                if (savedRoom) {
                    console.log(`[SocketClient] 🔄 Recuperando sala: ${savedRoom}`);
                    this.roomCode = savedRoom;
                    
                    // Notificar a Main.js para que re-una al usuario
                    this.bus.emit("net-room-recovery", savedRoom);
                }
            }
            
            this.bus.emit("net-status", "ONLINE");
            this.bus.emit("net-reconnected"); // Trigger MIDI re-initialization
            this.bus.emit("net-midi-recovery"); // NUEVO: Trigger full MIDI recovery
            
            if (this.roomCode) {
                this.startHeartbeat(); // Reactivar keepalive
            }
        });
        
        // --- LIFECYCLE: CONNECT ERROR ---
        this._connectErrorHandler = (error) => {
            console.error('[SocketClient] ❌ Error de conexión:', error);
            this.bus.emit("net-status", "ERROR");
        };
        this.socket.io.on("connect_error", this._connectErrorHandler);

        // --- DATA: MIDI BINARY (Soporta individual Y bundles) ---
        this.socket.on("midi-binary", (packet) => {
            // Solo procesar si no estamos en hibernación
            if (this._connectionState !== 'hibernating') {
                // Decodificar con MidiProtocolV2 (soporta bundles)
                const messages = MidiProtocolV2.decode(packet.dat);
                
                // Procesar cada mensaje del bundle
                messages.forEach(decoded => {
                    if (decoded) {
                        this.bus.emit("remote-note", { 
                            ...decoded, 
                            fromId: packet.src,
                            userId: packet.userId
                        });
                    }
                });
            }
        });

        this.socket.on("latency-pong", (startTime) => {
            const rtt = Date.now() - startTime;
            this.bus.emit("net-latency", rtt); // Notificar al sistema el RTT (Round Trip Time)
        });
        
        // NUEVO: Heartbeat de reconciliación (self-healing)
        this.socket.on("midi-heartbeat", (activeNotes) => {
            this.bus.emit("midi-reconcile", activeNotes);
        });
        
        // NUEVO: Snapshot protocol (Fase 2)
        this.socket.on("midi-snapshot", (snapshot) => {
            this.bus.emit("midi-snapshot", snapshot);
        });
        
        // NUEVO: Clock sync response (NTP básico)
        this.socket.on("clock-sync-response", (data) => {
            this.bus.emit("clock-sync-response", data);
        });
        
        this.socket.on("room-users", (users) => this.bus.emit("room-users", users));
        this.socket.on("class-status", (status) => this.bus.emit("class-status", status));
        this.socket.on("user-pdf-updated", (data) => this.bus.emit("remote-pdf", data));
        
        this.socket.on("room-created", (code) => { this.roomCode = code; this.bus.emit("room-created", code); });
        this.socket.on("room-joined", (code) => { this.roomCode = code; this.bus.emit("room-joined", code); });
        //  Escuchar cambio de Broadcaster
        this.socket.on("broadcaster-changed", (id) => this.bus.emit("net-broadcaster-changed", id));
        // 👇 NUEVO: Escuchar orden de expulsión (GoodBye)
        this.socket.on("force-disconnect", () => {
            this.bus.emit("app-force-exit"); 
        });
    }
    sendPing() {
        if (this.socket.connected) {
            this.socket.emit("latency-ping", Date.now());
        }
    }
    
    // Heartbeat manual para prevenir timeout por inactividad
    startHeartbeat() {
        if (this._heartbeatInterval) return; // Ya está iniciado
        
        this._lastHeartbeatResponse = Date.now();
        this._heartbeatMissedCount = 0;
        
        this._heartbeatInterval = setInterval(() => {
            if (this.socket.connected && this.roomCode) {
                // Verificar si el servidor respondió al último heartbeat
                const timeSinceLastResponse = Date.now() - this._lastHeartbeatResponse;
                
                // Después de 35 segundos sin respuesta (3.5 heartbeats), advertir
                if (timeSinceLastResponse > 35000) {
                    this._heartbeatMissedCount++;
                    console.warn(`[SocketClient] ⚠️ Heartbeat #${this._heartbeatMissedCount} perdido (${(timeSinceLastResponse/1000).toFixed(1)}s sin respuesta)`);
                    this.bus.emit("net-status", "WARNING");
                    
                    // Después de 50 segundos, forzar reconexión
                    if (timeSinceLastResponse > 50000) {
                        console.error('[SocketClient] ❌ Conexión zombie detectada, forzando reconexión...');
                        this.bus.emit("net-status", "RECONNECTING");
                        this.socket.disconnect();
                        setTimeout(() => this.socket.connect(), 500);
                        return;
                    }
                }
                
                // Enviar heartbeat
                this.socket.emit('client-heartbeat', { 
                    roomCode: this.roomCode, 
                    timestamp: Date.now() 
                });
                
                console.debug(`[SocketClient] 💓 Heartbeat enviado (${this._heartbeatMissedCount} perdidos)`);
            }
        }, 10000); // Cada 10s (más frecuente para detectar problemas antes)
        
        // Escuchar respuesta del servidor
        this.socket.on('heartbeat-ack', () => {
            const responseTime = Date.now() - this._lastHeartbeatResponse;
            this._lastHeartbeatResponse = Date.now();
            
            // Si teníamos heartbeats perdidos, notificar recuperación
            if (this._heartbeatMissedCount > 0) {
                console.log(`[SocketClient] ✅ Heartbeat recuperado después de ${this._heartbeatMissedCount} fallos`);
                this.bus.emit("net-status", "ONLINE");
            }
            
            this._heartbeatMissedCount = 0;
            console.debug(`[SocketClient] 💚 Heartbeat ACK recibido (${responseTime}ms)`);
        });
        
        console.log('[SocketClient] ❤️ Heartbeat iniciado (intervalo: 10s)');
    }
    
    stopHeartbeat() {
        if (this._heartbeatInterval) {
            clearInterval(this._heartbeatInterval);
            this._heartbeatInterval = null;
            console.log('[SocketClient] 💔 Heartbeat detenido');
        }
    }
    joinRoom(code, name, role) {
        this.roomCode = code;
        
        // Guardar en localStorage para recuperación
        if (this.roomCode) {
            localStorage.setItem('pianolink-last-room', this.roomCode);
        }
        
        this.socket.emit("join-room", { roomCode: code, username: name, userRole: role });
        this.startHeartbeat(); // Iniciar keepalive
        console.log('[SocketClient] 🚪 Unido a sala, heartbeat iniciado');
    }

    createRoom(payload) {
        this.roomCode = payload.code || null;
        
        // Guardar en localStorage para recuperación
        if (this.roomCode) {
            localStorage.setItem('pianolink-last-room', this.roomCode);
        }
        
        this.socket.emit("create-room", { 
            username: payload.name, 
            userRole: "teacher",
            roomCode: payload.code 
        });
        
        // Iniciar heartbeat después de crear sala
        this.startHeartbeat();
        console.log('[SocketClient] 🏠 Sala creada, heartbeat iniciado');
    }

    // 👇 NUEVO: Método para que el profe cierre la clase
    endClass() {
        if (this.roomCode) {
            this.socket.emit("end-class", this.roomCode);
            
            // Limpiar sala guardada
            localStorage.removeItem('pianolink-last-room');
            this.roomCode = null;
            this.stopHeartbeat();
        }
    }

    //  Activar alumno estrella
    setBroadcaster(userId) {
        if (this.roomCode) {
            this.socket.emit("set-broadcaster", userId);
        }
    }

    sendMidi(status, data1, data2) {
        if (!this.roomCode) return;
        
        // === HIGH-PRIORITY MIDI STREAM ===
        // Agregar al bundler en lugar de enviar inmediatamente
        // El bundler decide cuándo enviar (inmediato para notas, agrupado para CC)
        this.midiBundler.addMessage(status, data1, data2);
    }
    
    /**
     * Envía un bundle de mensajes MIDI (llamado por MidiBundler)
     * @private
     */
    _sendMidiBundle(messages) {
        if (!this.roomCode || messages.length === 0) return;
        
        // Empaquetar bundle con protocolo V2
        const buffer = this.protocolV2.encodeBundle(messages);
        
        if (buffer) {
            // Emitir bundle (sin opciones adicionales)
            this.socket.emit("midi-binary", buffer);
        }
    }
    
    updatePdfState(url, page) {
        if(this.roomCode) this.socket.emit("update-pdf-state", { url, page });
    }
    
    // NUEVO: Solicitar sincronización de reloj
    requestClockSync() {
        if (this.socket.connected) {
            this.socket.emit("clock-sync-request", Date.now());
        }
    }
    
    // ==================================================
    // FASE 3: MIDDLEWARE DE ESTADO E HIBERNACIÓN
    // ==================================================
    
    /**
     * Entra en modo hibernación al desconectarse
     * @private
     */
    _enterHibernation() {
        console.log('[SocketClient] 💤 Entrando en hibernación limpia...');
        this._connectionState = 'hibernating';
        
        // Limpiar buffers pendientes para evitar ráfagas al reconectar
        const droppedMessages = this._pendingMessages.length;
        this._pendingMessages = [];
        
        if (droppedMessages > 0) {
            console.warn(`[SocketClient] 🗑️ ${droppedMessages} mensajes pendientes descartados.`);
        }
    }
    
    /**
     * Procesa mensajes que quedaron en cola
     * @private
     */
    _flushPendingMessages() {
        if (this._pendingMessages.length === 0) return;
        
        console.log(`[SocketClient] 📤 Enviando ${this._pendingMessages.length} mensajes pendientes...`);
        
        this._pendingMessages.forEach(msg => {
            this.socket.emit(msg.event, msg.data);
        });
        
        this._pendingMessages = [];
    }
    
    /**
     * Envía mensaje con manejo de estado
     * @private
     */
    _sendWithStateCheck(event, data) {
        if (this._connectionState === 'connected') {
            this.socket.emit(event, data);
        } else if (this._connectionState === 'connecting') {
            // Encolar mensaje
            this._pendingMessages.push({ event, data });
            console.debug(`[SocketClient] Mensaje encolado: ${event}`);
        } else {
            // Hibernando o desconectado, descartar
            console.warn(`[SocketClient] Mensaje descartado (estado: ${this._connectionState}): ${event}`);
        }
    }
    
    /**
     * Obtiene el estado actual de la conexión
     */
    getConnectionState() {
        return this._connectionState;
    }
    
    /**
     * DISPOSE PATTERN: Limpieza completa
     */
    dispose() {
        if (this._isDisposed) {
            console.warn('[SocketClient] Ya fue disposed.');
            return;
        }
        
        console.log('[SocketClient] Iniciando limpieza de recursos...');
        
        // 0. Detener heartbeat y bundler
        this.stopHeartbeat();
        
        if (this.midiBundler) {
            this.midiBundler.dispose();
            this.midiBundler = null;
        }
        
        // 1. Remover listeners de Socket.IO
        if (this.socket) {
            this.socket.removeAllListeners();
            
            if (this.socket.io) {
                if (this._reconnectHandler) {
                    this.socket.io.off("reconnect_attempt", this._reconnectHandler);
                }
                if (this._connectErrorHandler) {
                    this.socket.io.off("connect_error", this._connectErrorHandler);
                }
            }
            
            // Desconectar socket
            this.socket.disconnect();
            this.socket = null;
        }
        
        // 2. Limpiar mensajes pendientes
        this._pendingMessages = [];
        
        // 3. Limpiar referencia al bus
        this.bus = null;
        
        this._isDisposed = true;
        this._connectionState = 'disposed';
        console.log('[SocketClient] ✅ Recursos liberados completamente.');
    }
}