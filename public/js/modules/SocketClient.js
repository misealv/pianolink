/**
 * /public/js/modules/SocketClient.js
 * Adaptador de Red con Middleware de Estado y Hibernación Limpia (Fase 3)
 */
import { MidiProtocol } from '../core/MidiProtocol.js';

export class SocketClient {
    constructor(eventBus) {
        this.bus = eventBus;
        this.socket = io({ transports: ['websocket'], upgrade: false });
        this.protocol = new MidiProtocol();
        this.roomCode = null;
        
        // --- FASE 3: MIDDLEWARE DE ESTADO ---
        this._connectionState = 'disconnected'; // 'disconnected', 'connecting', 'connected', 'hibernating'
        this._pendingMessages = [];
        this._isDisposed = false;
        this._reconnectHandler = null;
        this._connectErrorHandler = null;
        
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
            this._enterHibernation();
            this.bus.emit("net-status", "OFFLINE");
            this.bus.emit("net-disconnect-cleanup");
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
            this.bus.emit("net-status", "ONLINE");
            this.bus.emit("net-reconnected");
        });
        
        // --- LIFECYCLE: CONNECT ERROR ---
        this._connectErrorHandler = (error) => {
            console.error('[SocketClient] ❌ Error de conexión:', error);
            this.bus.emit("net-status", "ERROR");
        };
        this.socket.io.on("connect_error", this._connectErrorHandler);

        // --- DATA: MIDI BINARY ---
        this.socket.on("midi-binary", (packet) => {
            // Solo procesar si no estamos en hibernación
            if (this._connectionState !== 'hibernating') {
                const decoded = MidiProtocol.decode(packet.dat);
                if (decoded) this.bus.emit("remote-note", { ...decoded, fromId: packet.src });
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
    joinRoom(code, name, role) {
        this.roomCode = code;
        this.socket.emit("join-room", { roomCode: code, username: name, userRole: role });
    }

    createRoom(payload) {
        this.socket.emit("create-room", { 
            username: payload.name, 
            userRole: "teacher",
            roomCode: payload.code 
        });
    }

    // 👇 NUEVO: Método para que el profe cierre la clase
    endClass() {
        if (this.roomCode) {
            this.socket.emit("end-class", this.roomCode);
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
        const buffer = this.protocol.encode(status, data1, data2);
        this.socket.emit("midi-binary", buffer);
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