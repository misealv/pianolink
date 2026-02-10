/**
 * DecayConfigManager.js — Gestor centralizado de timers de persistencia visual
 * 
 * Centraliza TODOS los timers de decay/cleanup de notas que antes estaban
 * dispersos en UIManager, Whiteboard, MidiStateManager y AudioEngine.
 * 
 * El profesor puede elegir un preset desde la UI o ajustar valores manualmente.
 * Los valores se sincronizan a todos los módulos vía EventBus.
 * 
 * Presets basados en feedback de Esteban (Uruguay, Feb 2026):
 *   FAST     → Práctica rápida, muchas notas
 *   NORMAL   → Clase estándar  
 *   SLOW     → Análisis de armonía, dictado lento
 *   PERSIST  → Dictado, transcripción (notas quedan mucho tiempo)
 * 
 * @module DecayConfigManager
 */

(function(global) {
    'use strict';

    // ================================================
    // PRESETS DE DECAY
    // ================================================

    /**
     * Cada preset define tiempos en milisegundos.
     * null = sin timeout (la nota persiste hasta NoteOff explícito).
     * 
     * Timers controlados:
     *   uiWatchdogMs      → UIManager: TTL de tecla visual antes de auto-apagar
     *   staleKeyMs        → UIManager: umbral para considerar tecla "zombie"
     *   whiteboardTTLMs   → Whiteboard: TTL de nota en pentagrama VexFlow
     *   hangThresholdMs   → MidiStateManager: umbral para detectar nota colgada
     *   silentPanicMs     → AudioEngine: umbral para matar notas zombie de audio
     *   pedalWatchdogMs   → AudioEngine: TTL máximo de pedal sustain
     */
    const PRESETS = {
        FAST: {
            label: 'Rápido (práctica)',
            icon: '⚡',
            description: 'Notas desaparecen rápido. Ideal para escalas y ejercicios.',
            uiWatchdogMs:     2000,
            staleKeyMs:       1500,
            whiteboardTTLMs:  4000,
            hangThresholdMs:  2000,
            silentPanicMs:    8000,
            pedalWatchdogMs:  10000
        },
        NORMAL: {
            label: 'Normal',
            icon: '🎵',
            description: 'Balance estándar. Bueno para la mayoría de clases.',
            uiWatchdogMs:     3000,
            staleKeyMs:       2000,
            whiteboardTTLMs:  8000,
            hangThresholdMs:  3000,
            silentPanicMs:    12000,
            pedalWatchdogMs:  15000
        },
        SLOW: {
            label: 'Lento (análisis)',
            icon: '🔍',
            description: 'Notas persisten más. Para analizar acordes y armonía.',
            uiWatchdogMs:     6000,
            staleKeyMs:       4000,
            whiteboardTTLMs:  15000,
            hangThresholdMs:  5000,
            silentPanicMs:    20000,
            pedalWatchdogMs:  25000
        },
        PERSIST: {
            label: 'Persistente (dictado)',
            icon: '📝',
            description: 'Notas quedan visibles mucho tiempo. Para dictado y transcripción.',
            uiWatchdogMs:     15000,
            staleKeyMs:       10000,
            whiteboardTTLMs:  30000,
            hangThresholdMs:  10000,
            silentPanicMs:    45000,
            pedalWatchdogMs:  30000
        }
    };

    // ================================================
    // CONSTRUCTOR
    // ================================================

    /**
     * @param {Object} options
     * @param {EventBus} options.bus - Event bus central de PianoLink
     */
    function DecayConfigManager(options) {
        this.bus = options.bus;
        this._currentPreset = 'NORMAL';
        this._currentValues = Object.assign({}, PRESETS.NORMAL);
        this._initialized = false;
        this._uiCreated = false;

        console.log('[DecayConfig] 🎛️ Instancia creada');
    }

    // ================================================
    // INICIALIZACIÓN
    // ================================================

    /**
     * Inicializa el manager y emite los valores iniciales.
     * @param {string} [userRole='student'] - Rol del usuario
     */
    DecayConfigManager.prototype.init = function(userRole) {
        if (this._initialized) return;
        this._initialized = true;

        // Restaurar preset guardado (si existe)
        try {
            const saved = localStorage.getItem('pianolink_decay_preset');
            if (saved && PRESETS[saved]) {
                this._currentPreset = saved;
                this._currentValues = Object.assign({}, PRESETS[saved]);
                console.log('[DecayConfig] ♻️ Preset restaurado:', saved);
            }
        } catch (e) { /* ignorar */ }

        // Emitir valores iniciales a todos los módulos
        this._broadcastValues();

        // Solo profesores pueden cambiar los presets
        if (userRole === 'teacher' || userRole === 'admin') {
            this._createUI();
        }

        console.log('[DecayConfig] ✅ Inicializado (preset:', this._currentPreset + ')');
    };

    // ================================================
    // GESTIÓN DE PRESETS
    // ================================================

    /**
     * Cambia al preset indicado y notifica a todos los módulos.
     * @param {string} presetName - 'FAST' | 'NORMAL' | 'SLOW' | 'PERSIST'
     */
    DecayConfigManager.prototype.setPreset = function(presetName) {
        if (!PRESETS[presetName]) {
            console.warn('[DecayConfig] ⚠️ Preset desconocido:', presetName);
            return;
        }

        this._currentPreset = presetName;
        this._currentValues = Object.assign({}, PRESETS[presetName]);

        // Persistir elección
        try { localStorage.setItem('pianolink_decay_preset', presetName); } catch (e) { /* ignorar */ }

        this._broadcastValues();
        this._updateUISelection();

        console.log('[DecayConfig] 🔄 Preset cambiado a:', presetName, '(' + PRESETS[presetName].label + ')');
    };

    /**
     * Retorna los valores actuales del decay.
     * @returns {Object}
     */
    DecayConfigManager.prototype.getValues = function() {
        return Object.assign({}, this._currentValues);
    };

    /**
     * Retorna el nombre del preset actual.
     * @returns {string}
     */
    DecayConfigManager.prototype.getCurrentPreset = function() {
        return this._currentPreset;
    };

    /**
     * Retorna todos los presets disponibles.
     * @returns {Object}
     */
    DecayConfigManager.prototype.getPresets = function() {
        return PRESETS;
    };

    // ================================================
    // BROADCAST A MÓDULOS
    // ================================================

    /**
     * Emite los valores actuales al EventBus para que cada módulo los aplique.
     * @private
     */
    DecayConfigManager.prototype._broadcastValues = function() {
        const values = this.getValues();

        // Evento genérico con todos los valores
        this.bus.emit('decay-config-changed', {
            preset: this._currentPreset,
            values: values
        });

        console.log('[DecayConfig] 📡 Valores emitidos:', JSON.stringify({
            preset: this._currentPreset,
            ui: values.uiWatchdogMs,
            wb: values.whiteboardTTLMs,
            hang: values.hangThresholdMs,
            panic: values.silentPanicMs
        }));
    };

    // ================================================
    // UI — Panel de selección (solo profesores)
    // ================================================

    /**
     * Crea el panel de selección de presets en la UI del profesor.
     * Se inserta como un grupo de botones compacto.
     * @private
     */
    DecayConfigManager.prototype._createUI = function() {
        if (this._uiCreated) return;

        // Buscar contenedor padre (toolbar o panel de controles)
        const toolbar = document.getElementById('drawing-toolbar')
            || document.getElementById('teacher-controls')
            || document.querySelector('.toolbar-extra');

        if (!toolbar) {
            console.warn('[DecayConfig] ⚠️ No se encontró toolbar para insertar UI');
            return;
        }

        // Crear contenedor
        const container = document.createElement('div');
        container.id = 'decay-config-panel';
        container.style.cssText = 'display:flex;align-items:center;gap:4px;padding:4px 8px;border-left:1px solid rgba(255,255,255,0.2);margin-left:8px;';

        // Label
        const label = document.createElement('span');
        label.textContent = '🎵 Notas:';
        label.style.cssText = 'font-size:11px;color:rgba(255,255,255,0.7);white-space:nowrap;';
        container.appendChild(label);

        // Botones de preset
        const self = this;
        const presetKeys = Object.keys(PRESETS);

        presetKeys.forEach(function(key) {
            const preset = PRESETS[key];
            const btn = document.createElement('button');
            btn.dataset.preset = key;
            btn.textContent = preset.icon;
            btn.title = preset.label + ' — ' + preset.description;
            btn.className = 'decay-preset-btn';
            btn.style.cssText = 'padding:3px 6px;border:1px solid rgba(255,255,255,0.3);border-radius:4px;background:transparent;color:white;cursor:pointer;font-size:12px;min-width:28px;transition:all 0.2s;';

            // Highlight si es el preset activo
            if (key === self._currentPreset) {
                btn.style.background = 'rgba(59,130,246,0.5)';
                btn.style.borderColor = 'rgba(59,130,246,0.8)';
            }

            btn.addEventListener('click', function() {
                self.setPreset(key);
            });

            // Hover
            btn.addEventListener('mouseenter', function() {
                if (key !== self._currentPreset) {
                    btn.style.background = 'rgba(255,255,255,0.1)';
                }
            });
            btn.addEventListener('mouseleave', function() {
                if (key !== self._currentPreset) {
                    btn.style.background = 'transparent';
                }
            });

            container.appendChild(btn);
        });

        toolbar.appendChild(container);
        this._uiCreated = true;

        console.log('[DecayConfig] 🖼️ UI de presets creada en toolbar');
    };

    /**
     * Actualiza el highlight del botón activo.
     * @private
     */
    DecayConfigManager.prototype._updateUISelection = function() {
        const buttons = document.querySelectorAll('.decay-preset-btn');
        const self = this;

        buttons.forEach(function(btn) {
            if (btn.dataset.preset === self._currentPreset) {
                btn.style.background = 'rgba(59,130,246,0.5)';
                btn.style.borderColor = 'rgba(59,130,246,0.8)';
            } else {
                btn.style.background = 'transparent';
                btn.style.borderColor = 'rgba(255,255,255,0.3)';
            }
        });
    };

    // ================================================
    // EXPORT
    // ================================================
    global.DecayConfigManager = DecayConfigManager;
    global.DECAY_PRESETS = PRESETS;

})(typeof window !== 'undefined' ? window : this);
