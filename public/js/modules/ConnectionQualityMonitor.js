/**
 * ConnectionQualityMonitor.js - Monitor de Calidad de Conexión
 * 
 * Detecta y alerta sobre problemas de red en tiempo real:
 * - Pérdida de paquetes
 * - Alta latencia
 * - Jitter excesivo
 * - Desconexiones
 * 
 * Muestra alerta visual prominente cuando la calidad baja
 */

export class ConnectionQualityMonitor {
    constructor(eventBus, socketClient) {
        this.bus = eventBus;
        this.socketClient = socketClient;
        
        // === MÉTRICAS ===
        this.metrics = {
            latencyHistory: [],      // Últimas 20 latencias
            packetsSent: 0,
            packetsReceived: 0,
            packetsLost: 0,
            lastPingTime: 0,
            lastPongTime: 0,
            missedPings: 0,
            jitter: 0,
            avgLatency: 0,
            packetLossPercent: 0,
            quality: 'excellent'     // excellent, good, fair, poor, critical
        };
        
        // === CONFIGURACIÓN ===
        this.config = {
            pingInterval: 3000,      // Ping cada 3 segundos
            historySize: 20,         // Mantener 20 muestras
            thresholds: {
                latency: {
                    excellent: 50,
                    good: 100,
                    fair: 200,
                    poor: 400
                },
                jitter: {
                    excellent: 20,
                    good: 50,
                    fair: 100,
                    poor: 200
                },
                packetLoss: {
                    excellent: 0,
                    good: 2,
                    fair: 5,
                    poor: 10
                }
            }
        };
        
        // === UI ELEMENTS ===
        this.alertBanner = null;
        this.qualityIndicator = null;
        
        // === LIFECYCLE ===
        this._pingInterval = null;
        this._sequenceNumber = 0;
        this._pendingPings = new Map(); // sequence -> timestamp
        this._isDisposed = false;
        
        this.init();
    }
    
    init() {
        this.createUI();
        this.attachEventListeners();
        this.startMonitoring();
        
        console.log('[ConnectionQuality] ✅ Monitor inicializado');
    }
    
    createUI() {
        // === BANNER DE ALERTA (arriba de todo) ===
        this.alertBanner = document.createElement('div');
        this.alertBanner.id = 'connectionAlertBanner';
        this.alertBanner.className = 'connection-alert-banner hidden';
        this.alertBanner.innerHTML = `
            <div class="alert-content">
                <span class="alert-icon">⚠️</span>
                <span class="alert-message">Conexión inestable detectada</span>
                <span class="alert-details"></span>
            </div>
            <button class="alert-dismiss" title="Cerrar">×</button>
        `;
        
        // === INDICADOR FLOTANTE (siempre visible) ===
        this.qualityIndicator = document.createElement('div');
        this.qualityIndicator.id = 'connectionQualityIndicator';
        this.qualityIndicator.className = 'connection-quality-indicator quality-excellent';
        this.qualityIndicator.innerHTML = `
            <div class="quality-bars">
                <div class="bar bar-1"></div>
                <div class="bar bar-2"></div>
                <div class="bar bar-3"></div>
                <div class="bar bar-4"></div>
            </div>
            <div class="quality-tooltip">
                <div class="tooltip-row">
                    <span>Latencia:</span>
                    <span id="qLatency">--</span>
                </div>
                <div class="tooltip-row">
                    <span>Jitter:</span>
                    <span id="qJitter">--</span>
                </div>
                <div class="tooltip-row">
                    <span>Pérdida:</span>
                    <span id="qPacketLoss">0%</span>
                </div>
            </div>
        `;
        
        // Agregar estilos
        this.injectStyles();
        
        // Agregar al DOM
        document.body.appendChild(this.alertBanner);
        document.body.appendChild(this.qualityIndicator);
        
        // Event listener para cerrar banner
        this.alertBanner.querySelector('.alert-dismiss').addEventListener('click', () => {
            this.hideBanner();
        });
    }
    
    injectStyles() {
        if (document.getElementById('connection-quality-styles')) return;
        
        const styles = document.createElement('style');
        styles.id = 'connection-quality-styles';
        styles.textContent = `
            /* === BANNER DE ALERTA === */
            .connection-alert-banner {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                background: linear-gradient(135deg, #ff6b6b 0%, #ee5a5a 100%);
                color: white;
                padding: 12px 20px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                z-index: 10000;
                box-shadow: 0 4px 20px rgba(0,0,0,0.3);
                transform: translateY(0);
                transition: transform 0.3s ease, opacity 0.3s ease;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            }
            
            .connection-alert-banner.hidden {
                transform: translateY(-100%);
                opacity: 0;
                pointer-events: none;
            }
            
            .connection-alert-banner.warning {
                background: linear-gradient(135deg, #ffa726 0%, #fb8c00 100%);
            }
            
            .connection-alert-banner.critical {
                background: linear-gradient(135deg, #f44336 0%, #d32f2f 100%);
                animation: pulse-critical 1s infinite;
            }
            
            @keyframes pulse-critical {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.8; }
            }
            
            .alert-content {
                display: flex;
                align-items: center;
                gap: 12px;
            }
            
            .alert-icon {
                font-size: 1.5em;
            }
            
            .alert-message {
                font-weight: 600;
                font-size: 1em;
            }
            
            .alert-details {
                font-size: 0.9em;
                opacity: 0.9;
            }
            
            .alert-dismiss {
                background: rgba(255,255,255,0.2);
                border: none;
                color: white;
                font-size: 1.5em;
                width: 32px;
                height: 32px;
                border-radius: 50%;
                cursor: pointer;
                transition: background 0.2s;
            }
            
            .alert-dismiss:hover {
                background: rgba(255,255,255,0.4);
            }
            
            /* === INDICADOR DE CALIDAD FLOTANTE === */
            .connection-quality-indicator {
                position: fixed;
                bottom: 20px;
                left: 20px;
                background: rgba(30, 30, 40, 0.95);
                backdrop-filter: blur(10px);
                border-radius: 12px;
                padding: 8px 12px;
                z-index: 9999;
                cursor: pointer;
                transition: all 0.3s ease;
                border: 1px solid rgba(255,255,255,0.1);
            }
            
            .connection-quality-indicator:hover .quality-tooltip {
                opacity: 1;
                visibility: visible;
                transform: translateY(0);
            }
            
            .quality-bars {
                display: flex;
                gap: 3px;
                align-items: flex-end;
                height: 20px;
            }
            
            .quality-bars .bar {
                width: 6px;
                background: #444;
                border-radius: 2px;
                transition: all 0.3s ease;
            }
            
            .quality-bars .bar-1 { height: 5px; }
            .quality-bars .bar-2 { height: 10px; }
            .quality-bars .bar-3 { height: 15px; }
            .quality-bars .bar-4 { height: 20px; }
            
            /* Estados de calidad */
            .quality-excellent .bar { background: #4caf50; }
            .quality-good .bar-1, .quality-good .bar-2, .quality-good .bar-3 { background: #8bc34a; }
            .quality-fair .bar-1, .quality-fair .bar-2 { background: #ffc107; }
            .quality-poor .bar-1 { background: #ff9800; }
            .quality-critical .bar { background: #f44336; animation: blink 0.5s infinite; }
            
            @keyframes blink {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.3; }
            }
            
            .quality-tooltip {
                position: absolute;
                bottom: 100%;
                left: 0;
                background: rgba(20, 20, 30, 0.98);
                border-radius: 8px;
                padding: 10px 14px;
                margin-bottom: 8px;
                min-width: 150px;
                opacity: 0;
                visibility: hidden;
                transform: translateY(10px);
                transition: all 0.2s ease;
                border: 1px solid rgba(255,255,255,0.1);
            }
            
            .tooltip-row {
                display: flex;
                justify-content: space-between;
                font-size: 12px;
                color: #ccc;
                padding: 3px 0;
            }
            
            .tooltip-row span:last-child {
                font-weight: 600;
                color: white;
            }
        `;
        
        document.head.appendChild(styles);
    }
    
    attachEventListeners() {
        // Escuchar respuestas de latencia
        this.bus.on('net-latency', (rtt) => {
            this.recordLatency(rtt);
        });
        
        // Escuchar cambios de estado
        this.bus.on('net-status', (status) => {
            if (status === 'OFFLINE' || status === 'ERROR') {
                this.showBanner('Conexión perdida', 'Intentando reconectar...', 'critical');
            } else if (status === 'RECONNECTING') {
                this.showBanner('Reconectando', 'Por favor espera...', 'warning');
            } else if (status === 'ONLINE') {
                this.hideBanner();
            }
        });
        
        // Respuesta a nuestros pings de calidad
        this.bus.on('quality-pong', (data) => {
            this.handlePong(data);
        });
    }
    
    startMonitoring() {
        // Ping de calidad cada 3 segundos
        this._pingInterval = setInterval(() => {
            this.sendQualityPing();
            this.checkQuality();
        }, this.config.pingInterval);
    }
    
    sendQualityPing() {
        if (!this.socketClient || !this.socketClient.socket?.connected) {
            this.metrics.missedPings++;
            return;
        }
        
        const seq = ++this._sequenceNumber;
        const timestamp = performance.now();
        
        this._pendingPings.set(seq, timestamp);
        this.metrics.packetsSent++;
        
        // Enviar ping (se espera que el servidor responda)
        this.socketClient.sendPing();
        this.metrics.lastPingTime = timestamp;
        
        // Timeout: si no recibimos respuesta en 5 segundos, contar como perdido
        setTimeout(() => {
            if (this._pendingPings.has(seq)) {
                this._pendingPings.delete(seq);
                this.metrics.packetsLost++;
                this.metrics.missedPings++;
                console.warn(`[ConnectionQuality] ⚠️ Ping #${seq} perdido (timeout 5s)`);
            }
        }, 5000);
    }
    
    recordLatency(rtt) {
        // Marcar como recibido
        this.metrics.packetsReceived++;
        this.metrics.lastPongTime = performance.now();
        this.metrics.missedPings = 0; // Reset contador de pings perdidos
        
        // Limpiar ping pendiente más antiguo
        if (this._pendingPings.size > 0) {
            const oldestSeq = Math.min(...this._pendingPings.keys());
            this._pendingPings.delete(oldestSeq);
        }
        
        // Agregar a historial
        this.metrics.latencyHistory.push(rtt);
        if (this.metrics.latencyHistory.length > this.config.historySize) {
            this.metrics.latencyHistory.shift();
        }
        
        // Calcular métricas
        this.calculateMetrics();
        this.updateUI();
    }
    
    calculateMetrics() {
        const history = this.metrics.latencyHistory;
        if (history.length === 0) return;
        
        // Latencia promedio
        this.metrics.avgLatency = Math.round(
            history.reduce((a, b) => a + b, 0) / history.length
        );
        
        // Jitter (desviación estándar simplificada)
        if (history.length >= 2) {
            let sumDiff = 0;
            for (let i = 1; i < history.length; i++) {
                sumDiff += Math.abs(history[i] - history[i - 1]);
            }
            this.metrics.jitter = Math.round(sumDiff / (history.length - 1));
        }
        
        // Pérdida de paquetes
        const total = this.metrics.packetsSent;
        if (total > 0) {
            this.metrics.packetLossPercent = Math.round(
                (this.metrics.packetsLost / total) * 100 * 10
            ) / 10; // 1 decimal
        }
        
        // Determinar calidad
        this.metrics.quality = this.determineQuality();
    }
    
    determineQuality() {
        const { avgLatency, jitter, packetLossPercent } = this.metrics;
        const { latency, jitter: jitterThresh, packetLoss } = this.config.thresholds;
        
        // Prioridad: packet loss > latency > jitter
        if (packetLossPercent > packetLoss.poor || avgLatency > latency.poor) {
            return 'critical';
        }
        if (packetLossPercent > packetLoss.fair || avgLatency > latency.fair || jitter > jitterThresh.poor) {
            return 'poor';
        }
        if (packetLossPercent > packetLoss.good || avgLatency > latency.good || jitter > jitterThresh.fair) {
            return 'fair';
        }
        if (avgLatency > latency.excellent || jitter > jitterThresh.good) {
            return 'good';
        }
        return 'excellent';
    }
    
    checkQuality() {
        const { quality, avgLatency, jitter, packetLossPercent, missedPings } = this.metrics;
        
        // Mostrar alerta si la calidad es mala
        if (quality === 'critical' || missedPings >= 2) {
            this.showBanner(
                '🔴 Conexión muy inestable',
                `Latencia: ${avgLatency}ms | Jitter: ${jitter}ms | Pérdida: ${packetLossPercent}%`,
                'critical'
            );
        } else if (quality === 'poor') {
            this.showBanner(
                '🟠 Conexión inestable',
                `Latencia: ${avgLatency}ms | Jitter: ${jitter}ms | Pérdida: ${packetLossPercent}%`,
                'warning'
            );
        } else if (quality === 'fair' && packetLossPercent > 3) {
            this.showBanner(
                '🟡 Conexión degradada',
                `Detectada pérdida de paquetes: ${packetLossPercent}%`,
                'warning'
            );
        } else {
            // Ocultar si la conexión mejoró
            if (!this.alertBanner.classList.contains('hidden')) {
                this.hideBanner();
            }
        }
        
        // Emitir evento para otros componentes
        this.bus.emit('connection-quality', {
            quality,
            avgLatency,
            jitter,
            packetLossPercent,
            missedPings
        });
    }
    
    updateUI() {
        const { avgLatency, jitter, packetLossPercent, quality } = this.metrics;
        
        // Actualizar indicador flotante
        if (this.qualityIndicator) {
            this.qualityIndicator.className = `connection-quality-indicator quality-${quality}`;
            
            const latencyEl = document.getElementById('qLatency');
            const jitterEl = document.getElementById('qJitter');
            const lossEl = document.getElementById('qPacketLoss');
            
            if (latencyEl) latencyEl.textContent = `${avgLatency}ms`;
            if (jitterEl) jitterEl.textContent = `${jitter}ms`;
            if (lossEl) lossEl.textContent = `${packetLossPercent}%`;
        }
    }
    
    showBanner(message, details, severity = 'warning') {
        if (!this.alertBanner) return;
        
        const messageEl = this.alertBanner.querySelector('.alert-message');
        const detailsEl = this.alertBanner.querySelector('.alert-details');
        
        if (messageEl) messageEl.textContent = message;
        if (detailsEl) detailsEl.textContent = details;
        
        this.alertBanner.className = `connection-alert-banner ${severity}`;
        
        console.warn(`[ConnectionQuality] ${severity.toUpperCase()}: ${message} - ${details}`);
    }
    
    hideBanner() {
        if (this.alertBanner) {
            this.alertBanner.classList.add('hidden');
        }
    }
    
    // Método público para obtener métricas
    getMetrics() {
        return { ...this.metrics };
    }
    
    dispose() {
        if (this._isDisposed) return;
        
        if (this._pingInterval) {
            clearInterval(this._pingInterval);
        }
        
        if (this.alertBanner) {
            this.alertBanner.remove();
        }
        
        if (this.qualityIndicator) {
            this.qualityIndicator.remove();
        }
        
        this._isDisposed = true;
        console.log('[ConnectionQuality] ✅ Recursos liberados');
    }
}
