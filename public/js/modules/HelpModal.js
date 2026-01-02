/**
 * HelpModal.js - Sistema de Ayuda Interactivo PianoLink
 * Diseño Bento Grid con Gamificación
 */

class HelpModal {
    constructor() {
        this.modal = null;
        this.role = this.detectRole();
        this.init();
    }

    detectRole() {
        try {
            const user = JSON.parse(localStorage.getItem('pianoUser') || '{}');
            return user.role === 'teacher' || user.role === 'admin' ? 'teacher' : 'student';
        } catch (e) {
            return 'student';
        }
    }

    init() {
        // Crear el modal en el DOM
        this.createModal();
        this.bindEvents();
    }

    createModal() {
        const modal = document.createElement('div');
        modal.id = 'help-modal';
        modal.className = 'help-modal';
        modal.innerHTML = `
            <div class="help-modal-content">
                <div class="help-header">
                    <div class="help-title">
                        <span class="help-emoji">📚</span>
                        <h2>${this.role === 'teacher' ? 'Manual del Profesor' : 'Guía del Estudiante'}</h2>
                    </div>
                    <div class="help-actions">
                        <button class="help-print-btn" onclick="window.helpModal.print()">
                            🖨️ Imprimir / PDF
                        </button>
                        <button class="help-close-btn" onclick="window.helpModal.close()">✕</button>
                    </div>
                </div>

                <div class="help-body">
                    ${this.role === 'teacher' ? this.getTeacherContent() : this.getStudentContent()}
                </div>

                <div class="help-footer">
                    <div class="help-tip">
                        💡 <strong>Tip:</strong> Puedes imprimir esta guía como PDF para consultarla offline
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        this.modal = modal;
    }

    // ========================================
    // CONTENIDO DEL PROFESOR
    // ========================================
    getTeacherContent() {
        return `
            <div class="bento-grid">
                <!-- TARJETA 1: Primeros Pasos -->
                <div class="bento-card bento-wide gradient-blue">
                    <div class="card-icon">🚀</div>
                    <h3>Primeros Pasos</h3>
                    <div class="card-content">
                        <div class="step-list">
                            <div class="step">
                                <span class="step-num">1</span>
                                <span>Al entrar, permite acceso a <strong>cámara y micrófono</strong></span>
                            </div>
                            <div class="step">
                                <span class="step-num">2</span>
                                <span>Conecta tu <strong>piano MIDI por USB</strong> al computador</span>
                            </div>
                            <div class="step">
                                <span class="step-num">3</span>
                                <span>Comparte el <strong>código de sala</strong> con tu alumno</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- TARJETA 2: Subir Partituras -->
                <div class="bento-card gradient-purple">
                    <div class="card-icon">🎵</div>
                    <h3>Subir Partituras</h3>
                    <div class="card-content">
                        <p>Haz clic en <strong>📁 Biblioteca</strong></p>
                        <p>Arrastra un PDF o haz clic en "Subir"</p>
                        <div class="mini-tip">
                            <span>💾</span> Se guardan en la nube para siempre
                        </div>
                    </div>
                </div>

                <!-- TARJETA 3: Láser -->
                <div class="bento-card gradient-red">
                    <div class="card-icon">🔴</div>
                    <h3>Puntero Láser</h3>
                    <div class="card-content">
                        <p>Selecciona <strong>🔴 Láser</strong> en el toolbar</p>
                        <p>Mueve el mouse sobre la partitura</p>
                        <div class="mini-tip">
                            <span>👁️</span> ¡Tu alumno ve el punto rojo!
                        </div>
                    </div>
                </div>

                <!-- TARJETA DESTACADA: Regla de Oro -->
                <div class="bento-card bento-full gradient-gold rule-card">
                    <div class="rule-header">
                        <span class="rule-badge">⭐ REGLA DE ORO</span>
                    </div>
                    <div class="rule-grid">
                        <div class="rule-item rule-permanent">
                            <div class="rule-icon">📄</div>
                            <h4>Modo Partitura (PDF)</h4>
                            <p class="rule-text">¡Lo que dibujas aquí <strong>SE GUARDA</strong> para siempre!</p>
                            <div class="rule-badge-small">💾 Permanente</div>
                        </div>
                        <div class="rule-divider">VS</div>
                        <div class="rule-item rule-temporary">
                            <div class="rule-icon">🧼</div>
                            <h4>Modo Pizarra Libre</h4>
                            <p class="rule-text">¡OJO! Esto es <strong>TEMPORAL</strong>. Se borra al terminar la clase.</p>
                            <div class="rule-badge-small">⏱️ Temporal</div>
                        </div>
                    </div>
                </div>

                <!-- TARJETA 4: Herramientas -->
                <div class="bento-card gradient-green">
                    <div class="card-icon">✏️</div>
                    <h3>Herramientas de Dibujo</h3>
                    <div class="card-content">
                        <div class="tool-list">
                            <div class="tool-item"><span>✏️</span> Lápiz</div>
                            <div class="tool-item"><span>🗑️</span> Borrador</div>
                            <div class="tool-item"><span>📝</span> Texto</div>
                            <div class="tool-item"><span>🎼</span> Notación</div>
                        </div>
                    </div>
                </div>

                <!-- TARJETA 5: Modo Espía -->
                <div class="bento-card gradient-cyan">
                    <div class="card-icon">👁️</div>
                    <h3>Modo Espía</h3>
                    <div class="card-content">
                        <p>Haz clic en el <strong>👁️ ojo</strong> junto al nombre del alumno</p>
                        <p>Verás su partitura en tiempo real</p>
                        <div class="mini-tip">
                            <span>⭐</span> Proyecta a toda la clase
                        </div>
                    </div>
                </div>

                <!-- TARJETA 6: Troubleshooting -->
                <div class="bento-card bento-wide gradient-orange">
                    <div class="card-icon">🆘</div>
                    <h3>¿Algo Falló?</h3>
                    <div class="card-content troubleshoot-grid">
                        <div class="troubleshoot-item">
                            <strong>🎥 No se ve la cámara</strong>
                            <p>Recarga la página (F5) o revisa permisos en el candado 🔒 de la URL</p>
                        </div>
                        <div class="troubleshoot-item">
                            <strong>🎹 No suena el piano</strong>
                            <p>Verifica conexión USB y recarga. Chrome/Edge solamente.</p>
                        </div>
                        <div class="troubleshoot-item">
                            <strong>🔴 Teclas pegadas</strong>
                            <p>Haz clic en el botón <strong>PANIC</strong> (Ctrl+P) para silenciar todo</p>
                        </div>
                    </div>
                </div>

                <!-- TARJETA 7: Atajos -->
                <div class="bento-card gradient-pink">
                    <div class="card-icon">⌨️</div>
                    <h3>Atajos de Teclado</h3>
                    <div class="card-content">
                        <div class="shortcut-list">
                            <div class="shortcut"><kbd>Ctrl</kbd>+<kbd>D</kbd> Diagnóstico</div>
                            <div class="shortcut"><kbd>Ctrl</kbd>+<kbd>P</kbd> Panic</div>
                            <div class="shortcut"><kbd>←</kbd><kbd>→</kbd> Páginas</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    // ========================================
    // CONTENIDO DEL ESTUDIANTE
    // ========================================
    getStudentContent() {
        return `
            <div class="bento-grid">
                <!-- TARJETA 1: Bienvenida -->
                <div class="bento-card bento-wide gradient-blue">
                    <div class="card-icon">🎹</div>
                    <h3>¡Bienvenido a tu Clase de Piano!</h3>
                    <div class="card-content">
                        <div class="step-list">
                            <div class="step">
                                <span class="step-num">1</span>
                                <span>Permite acceso a <strong>cámara y micrófono</strong> cuando pregunte</span>
                            </div>
                            <div class="step">
                                <span class="step-num">2</span>
                                <span>Conecta tu <strong>piano MIDI</strong> por USB</span>
                            </div>
                            <div class="step">
                                <span class="step-num">3</span>
                                <span>¡Listo! El profesor verá lo que tocas 🎶</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- TARJETA 2: Qué Verás -->
                <div class="bento-card gradient-purple">
                    <div class="card-icon">👀</div>
                    <h3>Qué Verás en Pantalla</h3>
                    <div class="card-content">
                        <div class="visual-list">
                            <p>🎥 <strong>Video</strong> de tu profesor</p>
                            <p>📄 <strong>Partitura</strong> sincronizada</p>
                            <p>🔴 <strong>Puntero láser</strong> del profesor</p>
                        </div>
                    </div>
                </div>

                <!-- TARJETA 3: Piano -->
                <div class="bento-card gradient-green">
                    <div class="card-icon">🎵</div>
                    <h3>Tu Piano Virtual</h3>
                    <div class="card-content">
                        <p>Cuando toques tu piano físico:</p>
                        <p>✨ El profesor <strong>escucha</strong> las notas</p>
                        <p>✨ Las teclas brillan en su pantalla</p>
                    </div>
                </div>

                <!-- TARJETA DESTACADA: Regla de Oro -->
                <div class="bento-card bento-full gradient-gold rule-card">
                    <div class="rule-header">
                        <span class="rule-badge">⭐ IMPORTANTE</span>
                    </div>
                    <div class="rule-grid">
                        <div class="rule-item rule-permanent">
                            <div class="rule-icon">📄</div>
                            <h4>Dibujos sobre Partitura</h4>
                            <p class="rule-text">Lo que dibuja el profesor <strong>SE GUARDA</strong>. Podrás verlo después.</p>
                            <div class="rule-badge-small">💾 Permanente</div>
                        </div>
                        <div class="rule-divider">VS</div>
                        <div class="rule-item rule-temporary">
                            <div class="rule-icon">🧼</div>
                            <h4>Pizarra Libre</h4>
                            <p class="rule-text">Es para explicaciones rápidas. <strong>Se borra</strong> al terminar la clase.</p>
                            <div class="rule-badge-small">⏱️ Temporal</div>
                        </div>
                    </div>
                </div>

                <!-- TARJETA 4: Troubleshooting -->
                <div class="bento-card bento-wide gradient-orange">
                    <div class="card-icon">🆘</div>
                    <h3>¿Algo Falló? No te preocupes</h3>
                    <div class="card-content troubleshoot-grid">
                        <div class="troubleshoot-item">
                            <strong>🎥 No veo al profesor</strong>
                            <p>Recarga la página con <kbd>F5</kbd></p>
                        </div>
                        <div class="troubleshoot-item">
                            <strong>🔇 No me escucha</strong>
                            <p>Revisa el ícono de micrófono 🎤 esté activo</p>
                        </div>
                        <div class="troubleshoot-item">
                            <strong>🎹 El piano no funciona</strong>
                            <p>Desconecta y vuelve a conectar el USB. Luego recarga.</p>
                        </div>
                    </div>
                </div>

                <!-- TARJETA 5: Navegador -->
                <div class="bento-card gradient-red">
                    <div class="card-icon">🌐</div>
                    <h3>Navegador Recomendado</h3>
                    <div class="card-content">
                        <p>Usa <strong>Google Chrome</strong> o <strong>Microsoft Edge</strong></p>
                        <div class="mini-tip warning">
                            <span>⚠️</span> Firefox y Safari NO funcionan con MIDI
                        </div>
                    </div>
                </div>

                <!-- TARJETA 6: Disfruta -->
                <div class="bento-card gradient-cyan">
                    <div class="card-icon">🎶</div>
                    <h3>¡Disfruta tu Clase!</h3>
                    <div class="card-content">
                        <p class="enjoy-text">
                            La música conecta corazones. <br>
                            Tu profesor te guiará paso a paso.
                        </p>
                        <p class="enjoy-emoji">🎹 ❤️ 🎵</p>
                    </div>
                </div>
            </div>
        `;
    }

    bindEvents() {
        // Cerrar al hacer clic fuera
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.close();
            }
        });

        // Cerrar con Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.modal.classList.contains('active')) {
                this.close();
            }
        });
    }

    open() {
        this.modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    close() {
        this.modal.classList.remove('active');
        document.body.style.overflow = '';
    }

    print() {
        window.print();
    }
}

// Inicializar globalmente
window.helpModal = null;

function initHelpModal() {
    if (!window.helpModal) {
        window.helpModal = new HelpModal();
    }
}

// Auto-inicializar cuando el DOM esté listo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHelpModal);
} else {
    initHelpModal();
}
