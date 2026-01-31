/**
 * PLBHud.js - Heads-Up Display para sugerencias de PLB
 * 
 * Muestra sugerencias de venta/pedagógicas de forma minimalista
 * en la esquina inferior derecha de la pantalla.
 * 
 * CARACTERÍSTICAS:
 * - Solo visible para profesores
 * - Auto-dismiss después de 15 segundos
 * - Animaciones suaves
 * - Historial de hints
 */

export class PLBHud {
    constructor(eventBus, socket) {
        this.bus = eventBus;
        this.socket = socket;
        this.container = null;
        this.isVisible = false;
        this.dismissTimeout = null;
        
        // Configuración
        this.config = {
            autoDismissMs: 15000, // 15 segundos
            maxHistory: 10,
            position: 'bottom-right'
        };
        
        // Historial de hints
        this.history = [];
        
        // Solo inicializar para profesores
        if (this._isTeacher()) {
            this._createContainer();
            this._bindEvents();
            console.log('[PLB HUD] ✅ Inicializado para profesor');
        } else {
            console.log('[PLB HUD] ℹ️ No inicializado (solo para profesores)');
        }
    }
    
    /**
     * Verifica si el usuario actual es profesor
     */
    _isTeacher() {
        try {
            const user = JSON.parse(localStorage.getItem('pianoUser') || '{}');
            return user.role === 'teacher' || user.role === 'admin';
        } catch (e) {
            return false;
        }
    }
    
    /**
     * Crea el contenedor del HUD
     */
    _createContainer() {
        // Verificar si ya existe
        if (document.getElementById('plb-hud')) {
            this.container = document.getElementById('plb-hud');
            return;
        }
        
        // Guardar contexto actual para feedback
        this.currentContext = null;
        this.currentHint = null;
        
        // Crear contenedor principal
        this.container = document.createElement('div');
        this.container.id = 'plb-hud';
        this.container.innerHTML = `
            <div class="plb-hud-inner">
                <div class="plb-hud-header">
                    <span class="plb-hud-icon">🧠</span>
                    <span class="plb-hud-title">PLB</span>
                    <button class="plb-hud-close" title="Cerrar">×</button>
                </div>
                <div class="plb-hud-content">
                    <p class="plb-hud-hint"></p>
                </div>
                <div class="plb-hud-feedback" style="display:none;">
                    <span class="plb-feedback-label">¿Te sirvió?</span>
                    <button class="plb-btn-good" title="Buena respuesta">✓ Buena</button>
                    <button class="plb-btn-improve" title="Mejorar respuesta">✏️ Mejorar</button>
                </div>
                <div class="plb-hud-footer">
                    <span class="plb-hud-status">🎤 Escuchando...</span>
                    <button class="plb-hud-history-btn" title="Historial">📜</button>
                </div>
            </div>
            <div class="plb-hud-history" style="display:none;">
                <div class="plb-hud-history-header">
                    <span>Historial de sugerencias</span>
                    <button class="plb-hud-history-close">×</button>
                </div>
                <div class="plb-hud-history-list"></div>
            </div>
            <div class="plb-improve-modal" style="display:none;">
                <div class="plb-modal-header">
                    <span>✏️ Mejorar respuesta</span>
                    <button class="plb-modal-close">×</button>
                </div>
                <div class="plb-modal-body">
                    <label>Respuesta original:</label>
                    <p class="plb-original-response"></p>
                    <label>Tu respuesta mejorada:</label>
                    <textarea class="plb-improved-input" rows="3" placeholder="Escribe una mejor respuesta..."></textarea>
                </div>
                <div class="plb-modal-footer">
                    <button class="plb-modal-cancel">Cancelar</button>
                    <button class="plb-modal-save">💾 Guardar</button>
                </div>
            </div>
        `;
        
        // Agregar estilos
        this._injectStyles();
        
        // Agregar al DOM
        document.body.appendChild(this.container);
        
        // Bind eventos del HUD
        this._bindHudEvents();
    }
    
    /**
     * Inyecta los estilos CSS del HUD
     */
    _injectStyles() {
        if (document.getElementById('plb-hud-styles')) return;
        
        const styles = document.createElement('style');
        styles.id = 'plb-hud-styles';
        styles.textContent = `
            #plb-hud {
                position: fixed;
                bottom: 20px;
                right: 20px;
                z-index: 9000;
                font-family: 'Inter', -apple-system, sans-serif;
                opacity: 0;
                transform: translateY(20px);
                transition: opacity 0.3s ease, transform 0.3s ease;
                pointer-events: none;
                width: auto;
                height: auto;
            }
            
            #plb-hud.visible {
                opacity: 1;
                transform: translateY(0);
            }
            
            .plb-hud-inner {
                pointer-events: auto;
                background: rgba(26, 26, 26, 0.95);
                backdrop-filter: blur(10px);
                border: 1px solid #ff764d;
                border-radius: 12px;
                box-shadow: 0 4px 20px rgba(255, 118, 77, 0.3);
                max-width: 350px;
                min-width: 280px;
                overflow: hidden;
            }
            
            .plb-hud-header {
                display: flex;
                align-items: center;
                padding: 10px 15px;
                background: rgba(255, 118, 77, 0.1);
                border-bottom: 1px solid rgba(255, 118, 77, 0.3);
            }
            
            .plb-hud-icon {
                font-size: 18px;
                margin-right: 8px;
            }
            
            .plb-hud-title {
                font-weight: 600;
                color: #ff764d;
                font-size: 12px;
                text-transform: uppercase;
                letter-spacing: 1px;
                flex: 1;
            }
            
            .plb-hud-close {
                background: none;
                border: none;
                color: #888;
                font-size: 20px;
                cursor: pointer;
                padding: 0 5px;
                line-height: 1;
                transition: color 0.2s;
            }
            
            .plb-hud-close:hover {
                color: #ff764d;
            }
            
            .plb-hud-content {
                padding: 15px;
            }
            
            .plb-hud-hint {
                color: #e0e0e0;
                font-size: 14px;
                line-height: 1.5;
                margin: 0;
            }
            
            .plb-hud-footer {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 8px 15px;
                background: rgba(0, 0, 0, 0.2);
                border-top: 1px solid rgba(255, 255, 255, 0.05);
            }
            
            .plb-hud-status {
                font-size: 11px;
                color: #888;
            }
            
            .plb-hud-history-btn {
                background: none;
                border: none;
                font-size: 14px;
                cursor: pointer;
                padding: 2px 5px;
                opacity: 0.6;
                transition: opacity 0.2s;
            }
            
            .plb-hud-history-btn:hover {
                opacity: 1;
            }
            
            /* Historial */
            .plb-hud-history {
                background: rgba(26, 26, 26, 0.98);
                border: 1px solid #444;
                border-radius: 12px;
                margin-top: 10px;
                max-height: 300px;
                overflow: hidden;
            }
            
            .plb-hud-history-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 10px 15px;
                background: rgba(255, 255, 255, 0.05);
                border-bottom: 1px solid #333;
                font-size: 12px;
                color: #aaa;
            }
            
            .plb-hud-history-close {
                background: none;
                border: none;
                color: #888;
                font-size: 16px;
                cursor: pointer;
            }
            
            .plb-hud-history-list {
                max-height: 250px;
                overflow-y: auto;
                padding: 10px;
            }
            
            .plb-history-item {
                padding: 10px;
                background: rgba(255, 255, 255, 0.03);
                border-radius: 6px;
                margin-bottom: 8px;
                font-size: 13px;
                color: #ccc;
            }
            
            .plb-history-item:last-child {
                margin-bottom: 0;
            }
            
            .plb-history-time {
                font-size: 10px;
                color: #666;
                display: block;
                margin-top: 5px;
            }
            
            /* Feedback buttons */
            .plb-hud-feedback {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 8px 15px;
                background: rgba(255, 118, 77, 0.05);
                border-top: 1px solid rgba(255, 118, 77, 0.2);
            }
            
            .plb-feedback-label {
                font-size: 11px;
                color: #888;
                flex: 1;
            }
            
            .plb-btn-good, .plb-btn-improve {
                padding: 4px 10px;
                border: 1px solid #444;
                border-radius: 4px;
                background: rgba(255, 255, 255, 0.05);
                color: #ccc;
                font-size: 11px;
                cursor: pointer;
                transition: all 0.2s;
            }
            
            .plb-btn-good:hover {
                background: rgba(76, 175, 80, 0.2);
                border-color: #4CAF50;
                color: #4CAF50;
            }
            
            .plb-btn-improve:hover {
                background: rgba(255, 152, 0, 0.2);
                border-color: #FF9800;
                color: #FF9800;
            }
            
            /* Improve Modal */
            .plb-improve-modal {
                pointer-events: auto;
                background: rgba(26, 26, 26, 0.98);
                border: 1px solid #ff764d;
                border-radius: 12px;
                margin-top: 10px;
                max-width: 350px;
            }
            
            .plb-modal-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 12px 15px;
                background: rgba(255, 118, 77, 0.1);
                border-bottom: 1px solid rgba(255, 118, 77, 0.3);
                font-size: 13px;
                color: #ff764d;
                font-weight: 600;
            }
            
            .plb-modal-close {
                background: none;
                border: none;
                color: #888;
                font-size: 18px;
                cursor: pointer;
            }
            
            .plb-modal-body {
                padding: 15px;
            }
            
            .plb-modal-body label {
                display: block;
                font-size: 11px;
                color: #888;
                margin-bottom: 5px;
                text-transform: uppercase;
            }
            
            .plb-original-response {
                font-size: 12px;
                color: #999;
                background: rgba(0, 0, 0, 0.3);
                padding: 8px 10px;
                border-radius: 6px;
                margin-bottom: 12px;
                font-style: italic;
            }
            
            .plb-improved-input {
                width: 100%;
                padding: 10px;
                border: 1px solid #444;
                border-radius: 6px;
                background: rgba(0, 0, 0, 0.3);
                color: #e0e0e0;
                font-size: 13px;
                resize: vertical;
                font-family: inherit;
            }
            
            .plb-improved-input:focus {
                outline: none;
                border-color: #ff764d;
            }
            
            .plb-modal-footer {
                display: flex;
                justify-content: flex-end;
                gap: 10px;
                padding: 12px 15px;
                background: rgba(0, 0, 0, 0.2);
                border-top: 1px solid rgba(255, 255, 255, 0.05);
            }
            
            .plb-modal-cancel, .plb-modal-save {
                padding: 6px 14px;
                border: none;
                border-radius: 4px;
                font-size: 12px;
                cursor: pointer;
                transition: all 0.2s;
            }
            
            .plb-modal-cancel {
                background: #333;
                color: #aaa;
            }
            
            .plb-modal-cancel:hover {
                background: #444;
            }
            
            .plb-modal-save {
                background: #ff764d;
                color: white;
                font-weight: 600;
            }
            
            .plb-modal-save:hover {
                background: #ff8866;
            }
            
            /* Animación de pulso para nuevos hints */
            @keyframes plb-pulse {
                0% { box-shadow: 0 4px 20px rgba(255, 118, 77, 0.3); }
                50% { box-shadow: 0 4px 30px rgba(255, 118, 77, 0.6); }
                100% { box-shadow: 0 4px 20px rgba(255, 118, 77, 0.3); }
            }
            
            #plb-hud.new-hint .plb-hud-inner {
                animation: plb-pulse 1s ease-in-out;
            }
        `;
        
        document.head.appendChild(styles);
    }
    
    /**
     * Bind eventos del HUD (botones, etc.)
     */
    _bindHudEvents() {
        if (!this.container) return;
        
        // Botón cerrar
        const closeBtn = this.container.querySelector('.plb-hud-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.hide());
        }
        
        // Botón historial
        const historyBtn = this.container.querySelector('.plb-hud-history-btn');
        const historyPanel = this.container.querySelector('.plb-hud-history');
        const historyClose = this.container.querySelector('.plb-hud-history-close');
        
        if (historyBtn && historyPanel) {
            historyBtn.addEventListener('click', () => {
                historyPanel.style.display = historyPanel.style.display === 'none' ? 'block' : 'none';
                this._updateHistoryList();
            });
        }
        
        if (historyClose && historyPanel) {
            historyClose.addEventListener('click', () => {
                historyPanel.style.display = 'none';
            });
        }
        
        // === FEEDBACK BUTTONS ===
        const btnGood = this.container.querySelector('.plb-btn-good');
        const btnImprove = this.container.querySelector('.plb-btn-improve');
        const feedbackSection = this.container.querySelector('.plb-hud-feedback');
        const improveModal = this.container.querySelector('.plb-improve-modal');
        const modalClose = this.container.querySelector('.plb-modal-close');
        const modalCancel = this.container.querySelector('.plb-modal-cancel');
        const modalSave = this.container.querySelector('.plb-modal-save');
        
        // Botón "Buena" - simplemente oculta feedback
        if (btnGood) {
            btnGood.addEventListener('click', () => {
                feedbackSection.style.display = 'none';
                console.log('[PLB HUD] ✓ Respuesta marcada como buena');
                // Opcionalmente podríamos guardar esto también para refuerzo positivo
            });
        }
        
        // Botón "Mejorar" - abre modal
        if (btnImprove && improveModal) {
            btnImprove.addEventListener('click', () => {
                // CANCELAR auto-dismiss mientras el usuario escribe
                if (this.dismissTimeout) {
                    clearTimeout(this.dismissTimeout);
                    this.dismissTimeout = null;
                }
                
                const originalResp = this.container.querySelector('.plb-original-response');
                if (originalResp) {
                    originalResp.textContent = this.currentHint || '';
                }
                improveModal.style.display = 'block';
                feedbackSection.style.display = 'none';
                
                // Focus en textarea
                const textarea = this.container.querySelector('.plb-improved-input');
                if (textarea) {
                    textarea.value = '';
                    textarea.focus();
                }
            });
        }
        
        // Cerrar modal
        if (modalClose && improveModal) {
            modalClose.addEventListener('click', () => {
                improveModal.style.display = 'none';
                // Reactivar auto-dismiss al cerrar
                this._scheduleAutoDismiss();
            });
        }
        
        if (modalCancel && improveModal) {
            modalCancel.addEventListener('click', () => {
                improveModal.style.display = 'none';
                // Reactivar auto-dismiss al cancelar
                this._scheduleAutoDismiss();
            });
        }
        
        // Guardar mejora
        if (modalSave && improveModal) {
            modalSave.addEventListener('click', () => {
                const textarea = this.container.querySelector('.plb-improved-input');
                const improvedText = textarea?.value?.trim();
                
                if (!improvedText) {
                    alert('Por favor escribe una respuesta mejorada');
                    return;
                }
                
                // Obtener email del usuario (múltiples fuentes)
                const user = JSON.parse(localStorage.getItem('pianoUser') || '{}');
                const userEmail = user.email || 
                                  localStorage.getItem('userEmail') || 
                                  window.userEmail ||
                                  'demo@pianolink.com'; // Fallback para demo
                
                console.log('[PLB HUD] 📧 Email para mejora:', userEmail);
                
                // Enviar al servidor
                if (this.socket) {
                    this.socket.emit('plb-improve', {
                        context: this.currentContext,
                        originalResponse: this.currentHint,
                        improvedResponse: improvedText,
                        userEmail: userEmail
                    });
                    
                    console.log('[PLB HUD] 📚 Enviando mejora al servidor...');
                    
                    // Escuchar respuesta
                    this.socket.once('plb-improve-result', (result) => {
                        if (result.success) {
                            console.log('[PLB HUD] ✅ Mejora guardada!');
                            improveModal.style.display = 'none';
                            // Ocultar HUD después de guardar
                            this.hide();
                        } else {
                            console.error('[PLB HUD] ❌ Error:', result.error);
                            alert('Error guardando mejora: ' + result.error);
                        }
                    });
                }
            });
        }
    }
    
    /**
     * Bind eventos del EventBus y Socket
     */
    _bindEvents() {
        // Eventos del bus local
        this.bus.on('plb-listening-changed', (data) => {
            this._updateStatus(data.isListening);
        });
        
        // Eventos del servidor
        if (this.socket) {
            this.socket.on('plb-hint', (data) => {
                // Pasar contexto para poder dar feedback
                this.showHint(data.hint, data.latency, data.context);
            });
            
            this.socket.on('plb-status', (data) => {
                console.log('[PLB HUD] Status:', data);
            });
        }
    }
    
    /**
     * Muestra un hint en el HUD
     */
    showHint(hint, latency = 0, context = null) {
        if (!this.container || !this._isTeacher()) return;
        
        // Guardar hint actual para feedback
        this.currentHint = hint;
        this.currentContext = context;
        
        const hintElement = this.container.querySelector('.plb-hud-hint');
        if (hintElement) {
            hintElement.textContent = hint;
        }
        
        // Mostrar botones de feedback
        const feedbackSection = this.container.querySelector('.plb-hud-feedback');
        if (feedbackSection) {
            feedbackSection.style.display = 'flex';
        }
        
        // Ocultar modal si estaba abierto
        const improveModal = this.container.querySelector('.plb-improve-modal');
        if (improveModal) {
            improveModal.style.display = 'none';
        }
        
        // Agregar al historial
        this.history.unshift({
            hint: hint,
            timestamp: Date.now(),
            latency: latency,
            context: context
        });
        
        // Limitar historial
        if (this.history.length > this.config.maxHistory) {
            this.history.pop();
        }
        
        // Mostrar HUD
        this.show();
        
        // Agregar clase de nuevo hint para animación
        this.container.classList.add('new-hint');
        setTimeout(() => {
            this.container.classList.remove('new-hint');
        }, 1000);
        
        // Auto-dismiss
        this._scheduleAutoDismiss();
        
        console.log(`[PLB HUD] 💡 Hint mostrado (${latency}ms): ${hint.substring(0, 50)}...`);
    }
    
    /**
     * Actualiza el estado de escucha
     */
    _updateStatus(isListening) {
        if (!this.container) return;
        
        const statusElement = this.container.querySelector('.plb-hud-status');
        if (statusElement) {
            statusElement.textContent = isListening ? '🎤 Escuchando...' : '🔇 Pausado';
        }
    }
    
    /**
     * Actualiza la lista del historial
     */
    _updateHistoryList() {
        if (!this.container) return;
        
        const listElement = this.container.querySelector('.plb-hud-history-list');
        if (!listElement) return;
        
        if (this.history.length === 0) {
            listElement.innerHTML = '<div class="plb-history-item" style="color:#666;">Sin sugerencias aún</div>';
            return;
        }
        
        listElement.innerHTML = this.history.map(item => {
            const time = new Date(item.timestamp).toLocaleTimeString();
            return `
                <div class="plb-history-item">
                    ${item.hint}
                    <span class="plb-history-time">${time} · ${item.latency}ms</span>
                </div>
            `;
        }).join('');
    }
    
    /**
     * Programa el auto-dismiss
     */
    _scheduleAutoDismiss() {
        if (this.dismissTimeout) {
            clearTimeout(this.dismissTimeout);
        }
        
        this.dismissTimeout = setTimeout(() => {
            this.hide();
        }, this.config.autoDismissMs);
    }
    
    /**
     * Muestra el HUD
     */
    show() {
        if (!this.container) return;
        
        this.container.classList.add('visible');
        this.isVisible = true;
    }
    
    /**
     * Oculta el HUD
     */
    hide() {
        if (!this.container) return;
        
        this.container.classList.remove('visible');
        this.isVisible = false;
        
        if (this.dismissTimeout) {
            clearTimeout(this.dismissTimeout);
            this.dismissTimeout = null;
        }
    }
    
    /**
     * Obtiene el historial de hints
     */
    getHistory() {
        return this.history;
    }
    
    /**
     * Destruye el HUD
     */
    destroy() {
        this.hide();
        
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
        
        this.container = null;
        console.log('[PLB HUD] 💀 Destruido');
    }
}
