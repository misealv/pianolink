/**
 * /public/js/modules/SocketClient.js
 * Adaptador de Red.
 */
import { MidiProtocol } from '../core/MidiProtocol.js';

export class SocketClient {
    constructor(eventBus) {
        this.bus = eventBus;
        this.socket = io({ transports: ['websocket'], upgrade: false });
        this.protocol = new MidiProtocol();
        this.roomCode = null;
        
        this.initListeners();
    }

    initListeners() {
        this.socket.on("connect", () => this.bus.emit("net-status", "ONLINE"));
        this.socket.on("disconnect", () => this.bus.emit("net-status", "OFFLINE"));

        this.socket.on("midi-binary", (packet) => {
            const decoded = MidiProtocol.decode(packet.dat);
            if (decoded) this.bus.emit("remote-note", { ...decoded, fromId: packet.src });
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
}