/**
 * /engine/TimeSync.js
 * Sincronización de tiempo global (Algoritmo NTP Simplificado)
 * Referencia SRS: REQ-NET-02
 */
export class TimeSync {
    constructor(networkTransport) {
        this.network = networkTransport;
        this.offset = 0; // Diferencia de tiempo con el maestro (ms)
        this.rtt = 0;    // Latencia ida y vuelta (Round Trip Time)
        this.isMaster = false;
        
        // Escuchar mensajes de red que llegan del NetworkTransport
        document.addEventListener('timesync-msg', (e) => this._handleMessage(e.detail));
    }

    /**
     * Inicia el proceso. El Profesor es Master, el Alumno es Slave.
     */
    start(isMaster) {
        this.isMaster = isMaster;
        if (!this.isMaster) {
            // El alumno empieza a preguntar la hora
            console.log("⏳ Iniciando sincronización de relojes...");
            this._sendPing();
            
            // Repetir cada 2 segundos para mantener precisión (drift)
            setInterval(() => this._sendPing(), 2000);
        }
    }

    /**
     * Devuelve el TIEMPO GLOBAL ACTUAL (High Resolution)
     * Esta es la función que usará el MidiProtocol para poner timestamps.
     */
    getNow() {
        // Tiempo local + La diferencia calculada con el profesor
        return performance.now() + this.offset;
    }

    // --- LÓGICA PRIVADA NTP ---

    _sendPing() {
        const pingMsg = {
            type: 'SYNC_PING',
            t0: performance.now() // Tiempo de salida cliente
        };
        // Enviar como texto JSON
        this.network.dataChannel.send(JSON.stringify(pingMsg));
    }

    _handleMessage(msg) {
        if (this.isMaster) {
            // SOY PROFESOR: Recibo Ping, devuelvo Pong con mi hora
            if (msg.type === 'SYNC_PING') {
                const pongMsg = {
                    type: 'SYNC_PONG',
                    t0: msg.t0,
                    t1: performance.now()
                };
                this.network.dataChannel.send(JSON.stringify(pongMsg));
            }
        } else {
            // SOY ALUMNO: Recibo Pong, calculo el Offset
            if (msg.type === 'SYNC_PONG') {
                const t0 = msg.t0;
                const t1 = msg.t1;
                const t3 = performance.now();

                // Cálculo de Latencia (RTT)
                const rtt = t3 - t0;
                
                // (Opcional) Calculamos Jitter antes de actualizar el rtt histórico
                const jitter = Math.abs(rtt - this.rtt); // <--- NUEVO

                this.rtt = rtt;

                // Algoritmo NTP: Offset = t1 - (t0 + RTT/2)
                const newOffset = t1 - (t0 + (rtt / 2));

                // Suavizado simple
                if (this.offset === 0) {
                    this.offset = newOffset;
                } else {
                    this.offset = (this.offset * 0.8) + (newOffset * 0.2);
                }

                // --- INICIO CÓDIGO NUEVO PARA EL HUD ---
                // REQ-UX-01: Emitimos evento para que index.html actualice la vista
                document.dispatchEvent(new CustomEvent('stats-update', {
                    detail: {
                        rtt: this.rtt.toFixed(1),
                        offset: this.offset.toFixed(1),
                        jitter: jitter.toFixed(1)
                    }
                }));
                // --- FIN CÓDIGO NUEVO ---
            }
        }
    }
}