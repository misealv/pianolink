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
        this.intervalId = null;
        
        // Escuchar mensajes de red que llegan del NetworkTransport
        // Usamos un listener global para desacoplarlo
        document.addEventListener('timesync-msg', (e) => this._handleMessage(e.detail));
        
        // También escuchamos directamente si el transporte emite datos JSON (alternativa)
        // Pero en nuestra arquitectura actual, NetworkTransport maneja el JSON y dispara el evento.
    }

    /**
     * Inicia el proceso. El Profesor es Master, el Alumno es Slave.
     */
    start(isMaster) {
        this.isMaster = isMaster;
        
        // Limpiar intervalo previo si existe
        if (this.intervalId) clearInterval(this.intervalId);

        if (!this.isMaster) {
            // El alumno empieza a preguntar la hora
            console.log("⏳ Iniciando sincronización de relojes...");
            
            // Primer ping inmediato para quitar el offset 0 cuanto antes
            this._sendPing();
            
            // Repetir cada 2 segundos para mantener precisión (drift)
            this.intervalId = setInterval(() => this._sendPing(), 2000);
        }
    }

    /**
     * Devuelve el TIEMPO GLOBAL ACTUAL (High Resolution)
     * Esta es la función crítica para los timestamps.
     */
    getNow() {
        // Tiempo local + La diferencia calculada con el profesor
        return performance.now() + this.offset;
    }

    // --- LÓGICA PRIVADA NTP ---

    _sendPing() {
        if (this.network.dataChannel && this.network.dataChannel.readyState === 'open') {
            const pingMsg = {
                type: 'SYNC_PING',
                t0: performance.now() // Tiempo de salida cliente
            };
            this.network.dataChannel.send(JSON.stringify(pingMsg));
        }
    }

    _handleMessage(msg) {
        // Ignorar si no es mensaje de sync
        if (!msg || !msg.type) return;

        if (this.isMaster) {
            // SOY PROFESOR: Recibo Ping, devuelvo Pong con mi hora
            if (msg.type === 'SYNC_PING') {
                const pongMsg = {
                    type: 'SYNC_PONG',
                    t0: msg.t0,            // Devolvemos su t0 para que identifique el paquete
                    t1: performance.now()  // Mi hora actual (Hora "Verdadera")
                };
                this.network.dataChannel.send(JSON.stringify(pongMsg));
            }
        } else {
            // SOY ALUMNO: Recibo Pong, calculo el Offset
            if (msg.type === 'SYNC_PONG') {
                const t0 = msg.t0;           // Cuando salió
                const t1 = msg.t1;           // Hora del profe
                const t3 = performance.now();// Cuando volvió (Ahora)

                // 1. Cálculo de Latencia (RTT)
                const rtt = t3 - t0;
                const jitter = Math.abs(rtt - this.rtt);
                this.rtt = rtt;

                // 2. Algoritmo NTP: Offset = t1 - (t0 + RTT/2)
                // Asumimos simetría en la red (ida y vuelta tardan lo mismo)
                const newOffset = t1 - (t0 + (rtt / 2));

                // 3. Lógica de Convergencia (CORRECCIÓN CRÍTICA)
                // Si es la primera vez (0) o si el cambio es > 1000ms (tu caso de 4s),
                // actualizamos de golpe. Si es pequeño, suavizamos.
                if (this.offset === 0 || Math.abs(newOffset - this.offset) > 1000) {
                    console.log(`🔄 Sync: Ajuste brusco de reloj detectado: ${(newOffset - this.offset).toFixed(1)}ms`);
                    this.offset = newOffset;
                } else {
                    // Promedio ponderado (80% histórico, 20% nuevo) para estabilidad
                    this.offset = (this.offset * 0.8) + (newOffset * 0.2);
                }

                // 4. Actualizar UI (HUD)
                document.dispatchEvent(new CustomEvent('stats-update', {
                    detail: {
                        rtt: this.rtt.toFixed(1),
                        offset: this.offset.toFixed(1),
                        jitter: jitter.toFixed(1)
                    }
                }));
            }
        }
    }
}