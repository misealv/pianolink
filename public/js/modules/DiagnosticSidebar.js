/**
 * DiagnosticSidebar.js - Fase 4.5 (UX Enhancement)
 * Panel de telemetría en tiempo real para el profesor
 * 
 * Características:
 * - Métricas en tiempo real (latencia, salud MIDI, actividad)
 * - Controles de acción rápida (pánico, resincronización)
 * - Glassmorphism UI
 * - Optimizado con requestAnimationFrame
 */

export class DiagnosticSidebar {
    constructor(eventBus, audioEngine, socketClient) {
        this.bus = eventBus;
        this.audioEngine = audioEngine;
        this.socketClient = socketClient;
        
        // --- STATE ---
        this.isOpen = false;
        this.latency = 0;
        this.messagesPerSecond = 0;
        this._messageCount = 0;
        this._lastMessageTime = performance.now();
        
        // --- DOM ELEMENTS ---
        this.sidebar = null;
        this.toggleButton = null;
        
        // --- ANIMATION LOOP ---
        this._animationFrameId = null;
        this._updateInterval = null;
        
        // --- LIFECYCLE ---
        this._isDisposed = false;
        
        this.init();
    }
    
    /**
     * Inicializa el sidebar
     */
    init() {
        this.createUI();
        this.attachEventListeners();
        this.startUpdateLoop();
        
        console.log('[DiagnosticSidebar] Inicializado.');
    }
    
    /**
     * Crea la estructura del UI
     */
    createUI() {
        // --- BOTÓN FLOTANTE DE TOGGLE ---
        this.toggleButton = document.createElement('button');
        this.toggleButton.id = 'diagnosticToggle';
        this.toggleButton.className = 'diagnostic-toggle';
        this.toggleButton.innerHTML = `
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
            </svg>
        `;
        this.toggleButton.title = 'Diagnóstico (D)';
        
        // --- SIDEBAR ---
        this.sidebar = document.createElement('div');
        this.sidebar.id = 'diagnosticSidebar';
        this.sidebar.className = 'diagnostic-sidebar';
        this.sidebar.innerHTML = `
            <div class="diagnostic-header">
                <h3>🔬 Diagnóstico del Sistema</h3>
                <button class="diagnostic-close" title="Cerrar (D)">×</button>
            </div>
            
            <div class="diagnostic-content">
                <!-- LATENCIA -->
                <div class="diagnostic-section">
                    <div class="diagnostic-label">Latencia (RTT)</div>
                    <div class="diagnostic-metric">
                        <div class="latency-indicator" id="diagnosticLatencyIndicator">
                            <div class="latency-light"></div>
                        </div>
                        <span class="latency-value" id="diagnosticLatencyValue">-- ms</span>
                    </div>
                </div>
                
                <!-- SALUD MIDI -->
                <div class="diagnostic-section">
                    <div class="diagnostic-label">Salud MIDI</div>
                    <div class="diagnostic-stats">
                        <div class="stat-item">
                            <span class="stat-label">Echos Bloqueados</span>
                            <span class="stat-value" id="echoesBlocked">0</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">Notas Rescatadas</span>
                            <span class="stat-value" id="notesRescued">0</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">Auto-Liberaciones</span>
                            <span class="stat-value" id="autoReleases">0</span>
                        </div>
                    </div>
                </div>
                
                <!-- ACTIVIDAD -->
                <div class="diagnostic-section">
                    <div class="diagnostic-label">Actividad</div>
                    <div class="diagnostic-metric">
                        <div class="activity-bar">
                            <div class="activity-fill" id="activityFill"></div>
                        </div>
                        <span class="activity-value" id="activityValue">0 msg/s</span>
                    </div>
                </div>
                
                <!-- DISPOSITIVO DE SALIDA -->
                <div class="diagnostic-section">
                    <div class="diagnostic-label">Dispositivo de Salida</div>
                    <div class="device-info" id="deviceInfo">
                        <span class="device-name">No seleccionado</span>
                    </div>
                </div>
                
                <!-- ESTADO DE CONEXIÓN -->
                <div class="diagnostic-section">
                    <div class="diagnostic-label">Estado de Conexión</div>
                    <div class="connection-status" id="connectionStatus">
                        <span class="status-indicator"></span>
                        <span class="status-text">Conectado</span>
                    </div>
                </div>
                
                <!-- CONTROLES DE ACCIÓN -->
                <div class="diagnostic-actions">
                    <button class="action-btn panic-btn" id="panicBtn" title="Silenciar todas las notas">
                        🚨 PÁNICO
                    </button>
                    <button class="action-btn resync-btn" id="resyncBtn" title="Forzar sincronización completa">
                        🔄 Resincronizar
                    </button>
                </div>
                
                <!-- ESTADÍSTICAS ADICIONALES -->
                <div class="diagnostic-section diagnostic-footer">
                    <div class="diagnostic-label">Estadísticas Detalladas</div>
                    <div class="detailed-stats">
                        <div class="stat-row">
                            <span>Mensajes enviados</span>
                            <span id="messagesSent">0</span>
                        </div>
                        <div class="stat-row">
                            <span>Mensajes filtrados</span>
                            <span id="messagesFiltered">0</span>
                        </div>
                        <div class="stat-row">
                            <span>Cambios de dispositivo</span>
                            <span id="deviceSwitches">0</span>
                        </div>
                        <div class="stat-row">
                            <span>Estado AudioContext</span>
                            <span id="audioContextState">--</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Agregar al DOM
        document.body.appendChild(this.toggleButton);
        document.body.appendChild(this.sidebar);
    }
    
    /**
     * Adjunta event listeners
     */
    attachEventListeners() {
        // Toggle button
        this.toggleButton.addEventListener('click', () => this.toggle());
        
        // Close button
        const closeBtn = this.sidebar.querySelector('.diagnostic-close');
        closeBtn.addEventListener('click', () => this.close());
        
        // Keyboard shortcut (D key)
        document.addEventListener('keydown', (e) => {
            if (e.key === 'd' || e.key === 'D') {
                // Solo si no estamos escribiendo en un input
                if (document.activeElement.tagName !== 'INPUT' && 
                    document.activeElement.tagName !== 'TEXTAREA') {
                    this.toggle();
                }
            }
        });
        
        // Action buttons
        const panicBtn = document.getElementById('panicBtn');
        panicBtn.addEventListener('click', () => this.handlePanic());
        
        const resyncBtn = document.getElementById('resyncBtn');
        resyncBtn.addEventListener('click', () => this.handleResync());
        
        // Escuchar cambios de latencia
        this.bus.on('net-latency', (rtt) => {
            this.latency = rtt;
        });
        
        // Escuchar cambios de estado de conexión
        this.bus.on('net-status', (status) => {
            this.updateConnectionStatus(status);
        });
    }
    
    /**
     * Inicia el loop de actualización
     */
    startUpdateLoop() {
        // Actualización cada 500ms para métricas pesadas
        this._updateInterval = setInterval(() => {
            if (this.isOpen) {
                this.updateMetrics();
            }
        }, 500);
        
        // Animación suave con requestAnimationFrame
        const animate = () => {
            if (!this._isDisposed) {
                if (this.isOpen) {
                    this.updateVisualIndicators();
                }
                this._animationFrameId = requestAnimationFrame(animate);
            }
        };
        animate();
    }
    
    /**
     * Actualiza las métricas del sistema
     */
    updateMetrics() {
        // --- ESTADÍSTICAS DE AUDIO ENGINE ---
        try {
            // NULL-CHECK: Verificar que los elementos DOM existan
            const echoesBlockedEl = document.getElementById('echoesBlocked');
            const notesRescuedEl = document.getElementById('notesRescued');
            const autoReleasesEl = document.getElementById('autoReleases');
            const messagesSentEl = document.getElementById('messagesSent');
            const messagesFilteredEl = document.getElementById('messagesFiltered');
            const deviceSwitchesEl = document.getElementById('deviceSwitches');
            const audioContextStateEl = document.getElementById('audioContextState');
            const deviceInfo = document.getElementById('deviceInfo');
            
            if (!echoesBlockedEl || !notesRescuedEl || !autoReleasesEl) {
                console.warn('[DiagnosticSidebar] Elementos DOM no listos todavía.');
                return;
            }
            
            const stateStats = this.audioEngine.getStats();
            if (stateStats) {
                echoesBlockedEl.textContent = 
                    this.audioEngine.getOutputStats()?.echoesBlocked || 0;
                notesRescuedEl.textContent = 
                    stateStats.notesRescuedBySnapshot || 0;
                autoReleasesEl.textContent = 
                    stateStats.autoReleases || 0;
            }
            
            const outputStats = this.audioEngine.getOutputStats();
            if (outputStats && messagesSentEl && messagesFilteredEl && deviceSwitchesEl) {
                messagesSentEl.textContent = outputStats.messagesSent;
                messagesFilteredEl.textContent = outputStats.messagesFiltered;
                deviceSwitchesEl.textContent = outputStats.deviceSwitches;
            }
            
            // Estado del AudioContext
            if (this.audioEngine.scheduler && this.audioEngine.scheduler.ctx && audioContextStateEl) {
                audioContextStateEl.textContent = this.audioEngine.scheduler.ctx.state;
            }
            
            // Dispositivo actual
            if (deviceInfo) {
                const currentOutput = this.audioEngine.getCurrentMidiOutput();
                if (currentOutput) {
                    deviceInfo.innerHTML = `
                        <span class="device-name">✅ ${currentOutput.name}</span>
                    `;
                } else {
                    deviceInfo.innerHTML = `
                        <span class="device-name">⚠️ No seleccionado</span>
                    `;
                }
            }
            
        } catch (error) {
            console.warn('[DiagnosticSidebar] Error actualizando métricas:', error);
        }
    }
    
    /**
     * Actualiza indicadores visuales (animaciones suaves)
     */
    updateVisualIndicators() {
        // --- LATENCY INDICATOR ---
        const latencyIndicator = document.getElementById('diagnosticLatencyIndicator');
        const latencyValue = document.getElementById('diagnosticLatencyValue');
        
        // NULL-CHECK: Solo actualizar si los elementos existen
        if (latencyIndicator && latencyValue) {
            // Siempre mostrar, incluso si es 0
            latencyValue.textContent = this.latency > 0 ? this.latency + ' ms' : '-- ms';
            
            // Color según latencia
            if (this.latency < 50 && this.latency > 0) {
                latencyIndicator.className = 'latency-indicator latency-good';
            } else if (this.latency < 150 && this.latency > 0) {
                latencyIndicator.className = 'latency-indicator latency-fair';
            } else if (this.latency > 0) {
                latencyIndicator.className = 'latency-indicator latency-poor';
            } else {
                latencyIndicator.className = 'latency-indicator';
            }
        }
        
        // --- ACTIVITY BAR ---
        const activityFill = document.getElementById('activityFill');
        const activityValue = document.getElementById('activityValue');
        
        // NULL-CHECK y calcular MPS
        if (activityFill && activityValue) {
            const outputStats = this.audioEngine.getOutputStats();
            if (outputStats) {
                // Aproximación basada en mensajes enviados
                const mps = Math.min(100, (outputStats.messagesSent % 100));
                activityFill.style.width = mps + '%';
                activityValue.textContent = mps + ' msg/s';
            }
        }
    }
    
    /**
     * Actualiza el estado de conexión
     */
    updateConnectionStatus(status) {
        const connectionStatus = document.getElementById('connectionStatus');
        if (!connectionStatus) return; // NULL-CHECK
        
        const indicator = connectionStatus.querySelector('.status-indicator');
        const text = connectionStatus.querySelector('.status-text');
        
        if (!indicator || !text) return; // NULL-CHECK
        
        switch (status) {
            case 'ONLINE':
                indicator.className = 'status-indicator status-online';
                text.textContent = 'Conectado';
                break;
            case 'OFFLINE':
                indicator.className = 'status-indicator status-offline';
                text.textContent = 'Desconectado';
                break;
            case 'RECONNECTING':
                indicator.className = 'status-indicator status-reconnecting';
                text.textContent = 'Reconectando...';
                break;
            case 'ERROR':
                indicator.className = 'status-indicator status-error';
                text.textContent = 'Error';
                break;
            default:
                indicator.className = 'status-indicator';
                text.textContent = status;
        }
    }
    
    /**
     * Maneja el botón de pánico
     */
    handlePanic() {
        console.log('[DiagnosticSidebar] 🚨 PÁNICO ejecutado.');
        this.bus.emit('ui-panic');
        
        // Feedback visual (con null-check)
        const panicBtn = document.getElementById('panicBtn');
        if (panicBtn) {
            panicBtn.classList.add('btn-active');
            setTimeout(() => panicBtn.classList.remove('btn-active'), 300);
        }
    }
    
    /**
     * Maneja el botón de resincronización
     */
    handleResync() {
        console.log('[DiagnosticSidebar] 🔄 Resincronización forzada.');
        
        // Solicitar sincronización de reloj
        if (this.socketClient && this.socketClient.requestClockSync) {
            this.socketClient.requestClockSync();
        } else {
            console.warn('[DiagnosticSidebar] SocketClient no disponible para resync.');
        }
        
        // Feedback visual (con null-check)
        const resyncBtn = document.getElementById('resyncBtn');
        if (resyncBtn) {
            resyncBtn.classList.add('btn-active');
            setTimeout(() => resyncBtn.classList.remove('btn-active'), 300);
        }
    }
    
    /**
     * Abre el sidebar
     */
    open() {
        this.isOpen = true;
        this.sidebar.classList.add('open');
        this.toggleButton.classList.add('hidden');
    }
    
    /**
     * Cierra el sidebar
     */
    close() {
        this.isOpen = false;
        this.sidebar.classList.remove('open');
        this.toggleButton.classList.remove('hidden');
    }
    
    /**
     * Toggle del sidebar
     */
    toggle() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }
    
    /**
     * Dispose pattern
     */
    dispose() {
        if (this._isDisposed) return;
        
        console.log('[DiagnosticSidebar] Limpiando recursos...');
        
        // Detener loops
        if (this._updateInterval) {
            clearInterval(this._updateInterval);
            this._updateInterval = null;
        }
        
        if (this._animationFrameId) {
            cancelAnimationFrame(this._animationFrameId);
            this._animationFrameId = null;
        }
        
        // Remover del DOM
        if (this.sidebar) {
            this.sidebar.remove();
        }
        if (this.toggleButton) {
            this.toggleButton.remove();
        }
        
        this._isDisposed = true;
        console.log('[DiagnosticSidebar] ✅ Recursos liberados.');
    }
}
