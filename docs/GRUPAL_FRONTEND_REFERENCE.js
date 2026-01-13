/**
 * PIANO LINK GRUPAL - Código de Referencia Frontend
 * ===================================================
 * Este archivo contiene las implementaciones propuestas para el cliente.
 * NO ES UN ARCHIVO DE PRODUCCIÓN - Es documentación de código.
 */

// ==============================================================================
// SECCIÓN 1: COMPONENTE TeacherDashboard
// ==============================================================================

/**
 * TeacherDashboard.js
 * Componente principal para la vista del profesor en modo grupal
 */
class TeacherDashboard {
    constructor(config) {
        this.bus = config.bus;
        this.socket = config.socket;
        this.videoManager = config.videoManager;
        
        // Estado
        this.students = new Map();     // socketId -> StudentData
        this.focusedStudent = null;    // socketId del alumno enfocado
        this.phase = 'INDIVIDUAL';
        this.gamificationMode = null;
        
        // Referencias DOM
        this.container = null;
        this.gridContainer = null;
        this.focusedContainer = null;
        
        // Configuración
        this.MAX_THUMBNAILS = 10;
        this.ACTIVITY_UPDATE_INTERVAL = 500;
        
        this.init();
    }
    
    init() {
        this._createDOM();
        this._bindSocketEvents();
        this._bindBusEvents();
        
        console.log('[TeacherDashboard] Inicializado');
    }
    
    /**
     * Crea la estructura DOM del dashboard
     * @private
     */
    _createDOM() {
        this.container = document.createElement('div');
        this.container.id = 'teacher-dashboard';
        this.container.className = 'teacher-dashboard';
        
        this.container.innerHTML = `
            <div class="dashboard-header">
                <h2>📋 Panel de Control</h2>
                <div class="phase-controls">
                    <button id="btn-phase-individual" class="phase-btn active">
                        👤 Individual
                    </button>
                    <button id="btn-phase-global" class="phase-btn">
                        🌐 Global
                    </button>
                </div>
                <div class="gamification-controls" style="display: none;">
                    <button data-mode="SYNC" class="game-btn">🎯 Sincronización</button>
                    <button data-mode="BATTLE" class="game-btn">⚔️ Batalla</button>
                    <button data-mode="FREE" class="game-btn">🎸 Jam Session</button>
                </div>
            </div>
            
            <div class="dashboard-main">
                <!-- Vista del alumno enfocado -->
                <div id="focused-view" class="focused-view" style="display: none;">
                    <div class="focused-header">
                        <span id="focused-name">Alumno</span>
                        <button id="btn-unfocus" class="unfocus-btn">✕ Volver al grid</button>
                    </div>
                    <div id="focused-video" class="focused-video-container"></div>
                    <div class="focused-controls">
                        <div class="midi-activity-large">
                            <div id="focused-activity-bar" class="activity-bar-large"></div>
                            <span id="focused-notes-count">0 notas</span>
                        </div>
                    </div>
                </div>
                
                <!-- Grid de miniaturas -->
                <div id="student-grid" class="student-grid"></div>
            </div>
            
            <div class="dashboard-footer">
                <div class="stats">
                    <span id="connected-count">0</span> alumnos conectados
                </div>
                <button id="btn-end-class" class="danger-btn">❌ Cerrar Clase</button>
            </div>
        `;
        
        // Guardar referencias
        this.gridContainer = this.container.querySelector('#student-grid');
        this.focusedContainer = this.container.querySelector('#focused-view');
        
        // Insertar en el DOM
        const mainStage = document.querySelector('.main-stage');
        if (mainStage) {
            mainStage.insertBefore(this.container, mainStage.firstChild);
        }
        
        this._bindDOMEvents();
    }
    
    /**
     * Vincula eventos del DOM
     * @private
     */
    _bindDOMEvents() {
        // Botones de fase
        const btnIndividual = this.container.querySelector('#btn-phase-individual');
        const btnGlobal = this.container.querySelector('#btn-phase-global');
        
        btnIndividual?.addEventListener('click', () => this.setPhase('INDIVIDUAL'));
        btnGlobal?.addEventListener('click', () => this.setPhase('GLOBAL'));
        
        // Botón unfocus
        const btnUnfocus = this.container.querySelector('#btn-unfocus');
        btnUnfocus?.addEventListener('click', () => this.unfocusStudent());
        
        // Botones de gamificación
        this.container.querySelectorAll('.game-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const mode = e.target.dataset.mode;
                this.startGamification(mode);
            });
        });
        
        // Botón cerrar clase
        const btnEnd = this.container.querySelector('#btn-end-class');
        btnEnd?.addEventListener('click', () => {
            if (confirm('¿Seguro que quieres cerrar la clase para todos?')) {
                this.bus.emit('ui-end-class');
            }
        });
    }
    
    /**
     * Vincula eventos del socket
     * @private
     */
    _bindSocketEvents() {
        // Actualización de lista de usuarios
        this.socket.on('room-users', (data) => {
            this._updateStudentList(data.users || data);
            if (data.meta) {
                this._updateRoomMeta(data.meta);
            }
        });
        
        // Actualizaciones de actividad MIDI
        this.socket.on('midi-activity-update', (activityMap) => {
            this._updateMidiActivity(activityMap);
        });
        
        // Cambio de fase confirmado
        this.socket.on('phase-changed', (data) => {
            this._handlePhaseChange(data);
        });
        
        // MIDI Flush recibido
        this.socket.on('midi-flush', (data) => {
            this.bus.emit('midi-flush', data);
        });
    }
    
    /**
     * Vincula eventos del bus
     * @private
     */
    _bindBusEvents() {
        // Cuando el profesor hace clic en un alumno desde otra parte de la UI
        this.bus.on('ui-spy-user', (data) => {
            if (data.userId) {
                this.focusStudent(data.userId);
            }
        });
    }
    
    /**
     * Actualiza la lista de estudiantes
     * @private
     */
    _updateStudentList(users) {
        // Filtrar solo estudiantes
        const students = users.filter(u => u.role === 'student');
        
        // Actualizar contador
        const countEl = this.container.querySelector('#connected-count');
        if (countEl) countEl.textContent = students.length;
        
        // Actualizar Map interno
        this.students.clear();
        students.forEach(s => this.students.set(s.socketId, s));
        
        // Renderizar grid
        this._renderGrid(students);
    }
    
    /**
     * Renderiza el grid de miniaturas
     * @private
     */
    _renderGrid(students) {
        this.gridContainer.innerHTML = '';
        
        students.slice(0, this.MAX_THUMBNAILS).forEach(student => {
            const thumbnail = this._createThumbnail(student);
            this.gridContainer.appendChild(thumbnail);
        });
    }
    
    /**
     * Crea un elemento de miniatura para un estudiante
     * @private
     */
    _createThumbnail(student) {
        const div = document.createElement('div');
        div.className = 'student-thumbnail';
        div.dataset.studentId = student.socketId;
        
        // Clases según estado
        if (student.isBeingObserved) {
            div.classList.add('focused');
        }
        if (student.hasRecentActivity) {
            div.classList.add('active');
        }
        
        div.innerHTML = `
            <div class="thumbnail-video" id="thumb-video-${student.socketId}">
                <!-- Video insertado por Agora -->
                <div class="placeholder">📹</div>
            </div>
            <div class="thumbnail-info">
                <span class="student-name">${student.name}</span>
                <span class="student-state">${this._getStateIcon(student.state)}</span>
            </div>
            <div class="thumbnail-activity">
                <div class="activity-bar" id="activity-${student.socketId}"></div>
            </div>
        `;
        
        // Click para enfocar
        div.addEventListener('click', () => {
            this.focusStudent(student.socketId);
        });
        
        return div;
    }
    
    /**
     * Obtiene el icono según el estado del estudiante
     * @private
     */
    _getStateIcon(state) {
        switch (state) {
            case 'PRACTICING': return '🎹';
            case 'FOCUSED': return '👁️';
            case 'GLOBAL': return '🌐';
            default: return '❓';
        }
    }
    
    /**
     * Actualiza las barras de actividad MIDI
     * @private
     */
    _updateMidiActivity(activityMap) {
        Object.entries(activityMap).forEach(([studentId, data]) => {
            const bar = document.getElementById(`activity-${studentId}`);
            if (bar) {
                const percentage = Math.round(data.level * 100);
                bar.style.width = `${percentage}%`;
                
                // Color según nivel
                if (percentage > 70) {
                    bar.style.backgroundColor = '#2ecc71';
                } else if (percentage > 30) {
                    bar.style.backgroundColor = '#f1c40f';
                } else {
                    bar.style.backgroundColor = '#e74c3c';
                }
            }
            
            // Si es el estudiante enfocado, actualizar también su vista
            if (studentId === this.focusedStudent) {
                const focusedBar = document.getElementById('focused-activity-bar');
                const notesCount = document.getElementById('focused-notes-count');
                
                if (focusedBar) {
                    focusedBar.style.width = `${data.level * 100}%`;
                }
                if (notesCount) {
                    notesCount.textContent = `${data.activeNotes} notas`;
                }
            }
        });
    }
    
    /**
     * Enfoca a un estudiante específico
     */
    focusStudent(studentId) {
        const student = this.students.get(studentId);
        if (!student) {
            console.error('[Dashboard] Estudiante no encontrado:', studentId);
            return;
        }
        
        // Guardar referencia
        this.focusedStudent = studentId;
        
        // Emitir evento al servidor
        this.socket.emit('focus-student', studentId);
        
        // Actualizar UI
        this._showFocusedView(student);
        
        // Actualizar calidad de video
        if (this.videoManager) {
            this.videoManager.setHighQualityStream(studentId);
        }
        
        console.log('[Dashboard] Enfocando a:', student.name);
    }
    
    /**
     * Deja de enfocar al estudiante actual
     */
    unfocusStudent() {
        if (!this.focusedStudent) return;
        
        // Emitir al servidor
        this.socket.emit('focus-student', null);
        
        // Ocultar vista enfocada
        this.focusedContainer.style.display = 'none';
        this.gridContainer.style.display = 'grid';
        
        // Resetear calidad de video
        if (this.videoManager) {
            this.videoManager.setThumbnailQuality(this.focusedStudent);
        }
        
        this.focusedStudent = null;
        
        console.log('[Dashboard] Volviendo a vista de grid');
    }
    
    /**
     * Muestra la vista enfocada de un estudiante
     * @private
     */
    _showFocusedView(student) {
        // Actualizar nombre
        const nameEl = document.getElementById('focused-name');
        if (nameEl) nameEl.textContent = student.name;
        
        // Mostrar/ocultar contenedores
        this.focusedContainer.style.display = 'flex';
        this.gridContainer.style.display = 'none';
        
        // Mover video a la vista enfocada
        const videoContainer = document.getElementById('focused-video');
        // El VideoManager moverá el stream aquí
    }
    
    /**
     * Cambia la fase de la clase
     */
    setPhase(phase) {
        if (phase === this.phase) return;
        
        // Confirmar si va a GLOBAL
        if (phase === 'GLOBAL') {
            if (!confirm('¿Activar modo global? Todos los alumnos podrán escucharse entre sí.')) {
                return;
            }
        }
        
        // Emitir al servidor
        this.socket.emit('set-phase', { 
            phase: phase,
            gamificationMode: null 
        });
        
        console.log('[Dashboard] Solicitando cambio de fase:', phase);
    }
    
    /**
     * Inicia un modo de gamificación
     */
    startGamification(mode) {
        this.socket.emit('set-phase', {
            phase: 'GLOBAL',
            gamificationMode: mode
        });
        
        console.log('[Dashboard] Iniciando gamificación:', mode);
    }
    
    /**
     * Maneja el cambio de fase confirmado por el servidor
     * @private
     */
    _handlePhaseChange(data) {
        this.phase = data.phase;
        this.gamificationMode = data.gamificationMode;
        
        // Actualizar botones
        const btnIndividual = this.container.querySelector('#btn-phase-individual');
        const btnGlobal = this.container.querySelector('#btn-phase-global');
        const gamificationControls = this.container.querySelector('.gamification-controls');
        
        if (data.phase === 'INDIVIDUAL') {
            btnIndividual?.classList.add('active');
            btnGlobal?.classList.remove('active');
            gamificationControls.style.display = 'none';
        } else {
            btnIndividual?.classList.remove('active');
            btnGlobal?.classList.add('active');
            gamificationControls.style.display = 'flex';
        }
        
        // Si hay gamificación activa, mostrar panel
        if (data.gamificationMode) {
            this._showGamificationPanel(data.gamificationMode);
        }
        
        console.log('[Dashboard] Fase actualizada:', data.phase);
    }
    
    /**
     * Muestra el panel de gamificación
     * @private
     */
    _showGamificationPanel(mode) {
        // TODO: Implementar panel de gamificación
        console.log('[Dashboard] Gamificación activada:', mode);
    }
    
    /**
     * Destruye el componente y limpia recursos
     */
    destroy() {
        this.container?.remove();
        this.students.clear();
        console.log('[TeacherDashboard] Destruido');
    }
}


// ==============================================================================
// SECCIÓN 2: COMPONENTE StudentObservationIndicator
// ==============================================================================

/**
 * Indicador visual cuando el profesor está observando al estudiante
 */
class StudentObservationIndicator {
    constructor(config) {
        this.bus = config.bus;
        this.socket = config.socket;
        
        this.isBeingObserved = false;
        this.observingTeacher = null;
        
        this.banner = null;
        
        this.init();
    }
    
    init() {
        this._createBanner();
        this._bindSocketEvents();
    }
    
    _createBanner() {
        this.banner = document.createElement('div');
        this.banner.id = 'observation-banner';
        this.banner.className = 'observation-banner';
        this.banner.style.display = 'none';
        
        this.banner.innerHTML = `
            <span class="observation-icon">👁️</span>
            <span class="observation-text">El profesor está observando tu clase</span>
        `;
        
        document.body.appendChild(this.banner);
    }
    
    _bindSocketEvents() {
        this.socket.on('observation-started', (data) => {
            this.isBeingObserved = true;
            this.observingTeacher = data.teacherName;
            
            this.banner.querySelector('.observation-text').textContent = 
                `${data.teacherName} está observando tu clase`;
            this.banner.style.display = 'flex';
            
            // Añadir efecto visual al stage
            document.querySelector('.main-stage')?.classList.add('being-observed');
            
            // Sonido de notificación sutil
            this._playNotificationSound();
        });
        
        this.socket.on('observation-ended', (data) => {
            this.isBeingObserved = false;
            this.observingTeacher = null;
            
            this.banner.style.display = 'none';
            document.querySelector('.main-stage')?.classList.remove('being-observed');
            
            // Toast discreto
            this._showToast('El profesor continuó con otro alumno');
        });
    }
    
    _playNotificationSound() {
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.frequency.value = 880; // A5
            oscillator.type = 'sine';
            
            gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
            
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.3);
        } catch (e) {
            // Ignorar si no hay AudioContext
        }
    }
    
    _showToast(message) {
        const toast = document.createElement('div');
        toast.className = 'toast-notification';
        toast.textContent = message;
        document.body.appendChild(toast);
        
        setTimeout(() => toast.classList.add('visible'), 10);
        setTimeout(() => {
            toast.classList.remove('visible');
            setTimeout(() => toast.remove(), 300);
        }, 2000);
    }
    
    destroy() {
        this.banner?.remove();
    }
}


// ==============================================================================
// SECCIÓN 3: CSS PARA COMPONENTES
// ==============================================================================

const GRUPAL_STYLES = `
/* Dashboard del profesor */
.teacher-dashboard {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: #1a1a2e;
    color: white;
}

.dashboard-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 20px;
    background: #16213e;
    border-bottom: 1px solid #0f3460;
}

.phase-controls {
    display: flex;
    gap: 10px;
}

.phase-btn {
    padding: 8px 16px;
    border: 1px solid #0f3460;
    background: transparent;
    color: #888;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s;
}

.phase-btn:hover {
    background: #0f3460;
    color: white;
}

.phase-btn.active {
    background: #e94560;
    border-color: #e94560;
    color: white;
}

.student-grid {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 12px;
    padding: 20px;
    overflow-y: auto;
}

.student-thumbnail {
    background: #16213e;
    border-radius: 8px;
    overflow: hidden;
    cursor: pointer;
    transition: transform 0.2s, box-shadow 0.2s;
    border: 2px solid transparent;
}

.student-thumbnail:hover {
    transform: scale(1.05);
    box-shadow: 0 4px 20px rgba(233, 69, 96, 0.3);
}

.student-thumbnail.focused {
    border-color: #e94560;
}

.student-thumbnail.active {
    animation: pulse-active 1s infinite;
}

@keyframes pulse-active {
    0%, 100% { box-shadow: 0 0 0 0 rgba(46, 204, 113, 0.4); }
    50% { box-shadow: 0 0 0 8px rgba(46, 204, 113, 0); }
}

.thumbnail-video {
    aspect-ratio: 4/3;
    background: #0f3460;
    display: flex;
    align-items: center;
    justify-content: center;
}

.thumbnail-info {
    display: flex;
    justify-content: space-between;
    padding: 8px;
    font-size: 12px;
}

.thumbnail-activity {
    height: 4px;
    background: #0f3460;
}

.activity-bar {
    height: 100%;
    width: 0%;
    background: #2ecc71;
    transition: width 0.3s, background-color 0.3s;
}

/* Vista enfocada */
.focused-view {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 20px;
}

.focused-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
}

.focused-video-container {
    flex: 1;
    background: #0f3460;
    border-radius: 8px;
    min-height: 400px;
}

.unfocus-btn {
    background: #e94560;
    border: none;
    color: white;
    padding: 8px 16px;
    border-radius: 4px;
    cursor: pointer;
}

/* Banner de observación (estudiante) */
.observation-banner {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    padding: 12px 20px;
    background: linear-gradient(135deg, #3498db, #2980b9);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    z-index: 1000;
    animation: slide-down 0.3s ease-out;
}

@keyframes slide-down {
    from { transform: translateY(-100%); }
    to { transform: translateY(0); }
}

.observation-icon {
    font-size: 24px;
    animation: pulse-icon 2s infinite;
}

@keyframes pulse-icon {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
}

/* Efecto en el stage cuando está siendo observado */
.main-stage.being-observed {
    box-shadow: inset 0 0 0 3px rgba(52, 152, 219, 0.5);
    animation: pulse-border 2s infinite;
}

@keyframes pulse-border {
    0%, 100% { box-shadow: inset 0 0 0 3px rgba(52, 152, 219, 0.5); }
    50% { box-shadow: inset 0 0 0 3px rgba(52, 152, 219, 0.8); }
}

/* Toast notifications */
.toast-notification {
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%) translateY(100px);
    background: rgba(0, 0, 0, 0.8);
    color: white;
    padding: 12px 24px;
    border-radius: 8px;
    opacity: 0;
    transition: all 0.3s;
    z-index: 1001;
}

.toast-notification.visible {
    transform: translateX(-50%) translateY(0);
    opacity: 1;
}
`;

// Inyectar estilos
const styleSheet = document.createElement('style');
styleSheet.textContent = GRUPAL_STYLES;
document.head.appendChild(styleSheet);


// ==============================================================================
// SECCIÓN 4: INTEGRACIÓN EN MAIN.JS
// ==============================================================================

/**
 * Código para agregar en Main.js para integrar el sistema grupal
 */

// Al inicio del bootstrap(), después de verificar rol:
/*
if (checkTeacherRole()) {
    // Inicializar dashboard grupal
    const teacherDashboard = new TeacherDashboard({
        bus: bus,
        socket: socketManager.socket,
        videoManager: videoManager
    });
    
    console.log('✅ [Main] TeacherDashboard inicializado');
} else {
    // Inicializar indicador de observación para estudiantes
    const observationIndicator = new StudentObservationIndicator({
        bus: bus,
        socket: socketManager.socket
    });
    
    console.log('✅ [Main] StudentObservationIndicator inicializado');
}
*/

// Handler para MIDI Flush:
/*
bus.on('midi-flush', (data) => {
    // Apagar todas las notas del alumno anterior
    if (audio && audio.scheduler) {
        audio.scheduler.stopAll();
    }
    
    // Limpiar visualización del piano
    ui.clearPiano();
    
    console.log('[Main] MIDI Flush ejecutado para:', data.targetId);
});
*/

// Integrar focus-student con spy existente:
/*
bus.on("ui-spy-user", function(data) {
    spiedUserId = data.userId; 
    scoreLogic.pageData = {};
    
    // 🆕 Emitir focus-student al servidor
    socketManager.socket.emit('focus-student', data.userId);
    
    if (data.url) {
        console.log('👁️ Entrando en Modo Espía para: ' + data.userId);
        scoreLogic.silentLoad(data.url, data.page, data.scoreId);
    } else {
        alert("El alumno no tiene ninguna partitura abierta.");
    }
});
*/


// ==============================================================================
// EXPORTACIÓN (si se usa como módulo)
// ==============================================================================

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { 
        TeacherDashboard, 
        StudentObservationIndicator 
    };
}
