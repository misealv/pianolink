/**
 * BookingModal.js
 * Modal para confirmar reserva de clase de prueba
 */

class BookingModal {
    constructor(options = {}) {
        this.onSuccess = options.onSuccess || null;
        this.onError = options.onError || null;
        
        this.teacher = null;
        this.slot = null;
        this.isOpen = false;
        this.isLoading = false;
        
        // Datos del estudiante (puede ser el usuario o un managed student)
        this.studentId = null;
        this.studentName = null;
        this.managedStudents = []; // Lista de estudiantes si es guardian
        
        this.createModal();
        this.bindEvents();
    }
    
    createModal() {
        // Evitar duplicados
        if (document.getElementById('bookingModal')) return;
        
        const modal = document.createElement('div');
        modal.id = 'bookingModal';
        modal.className = 'booking-modal-overlay hidden';
        modal.innerHTML = `
            <div class="booking-modal">
                <button class="modal-close" id="closeBookingModal">×</button>
                
                <div class="modal-content" id="bookingModalContent">
                    <!-- Content será inyectado dinámicamente -->
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
    
    bindEvents() {
        document.getElementById('closeBookingModal')?.addEventListener('click', () => this.close());
        document.getElementById('bookingModal')?.addEventListener('click', (e) => {
            if (e.target.id === 'bookingModal') this.close();
        });
        
        // Tecla Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen) this.close();
        });
    }
    
    open(teacher, slot, options = {}) {
        this.teacher = teacher;
        this.slot = slot;
        this.isOpen = true;
        
        // Opciones de estudiante
        this.studentId = options.studentId || null;
        this.studentName = options.studentName || null;
        this.managedStudents = options.managedStudents || [];
        
        // Si es guardian con múltiples estudiantes y no se especificó, mostrar selector
        if (this.managedStudents.length > 1 && !this.studentId) {
            this.renderStudentSelection();
        } else if (this.managedStudents.length === 1 && !this.studentId) {
            // Auto-seleccionar único estudiante
            this.studentId = this.managedStudents[0]._id;
            this.studentName = this.managedStudents[0].name;
            this.renderConfirmation();
        } else {
            this.renderConfirmation();
        }
        
        document.getElementById('bookingModal').classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }
    
    close() {
        this.isOpen = false;
        document.getElementById('bookingModal').classList.add('hidden');
        document.body.style.overflow = '';
    }
    
    // Selector de estudiante para guardians con múltiples hijos
    renderStudentSelection() {
        const content = document.getElementById('bookingModalContent');
        
        content.innerHTML = `
            <div class="modal-header">
                <h2>👶 ¿Para quién es la clase?</h2>
            </div>
            
            <p style="color: #666; margin-bottom: 20px;">Selecciona el estudiante que tomará la clase de prueba:</p>
            
            <div class="student-selection-list" style="display: flex; flex-direction: column; gap: 12px;">
                ${this.managedStudents.map(student => `
                    <button class="student-select-btn" data-id="${student._id}" data-name="${student.name}" style="
                        display: flex; align-items: center; gap: 16px;
                        padding: 16px 20px; border: 2px solid #e5e7eb; border-radius: 12px;
                        background: white; cursor: pointer; transition: all 0.2s;
                        text-align: left;
                    ">
                        <div style="
                            width: 48px; height: 48px; border-radius: 50%;
                            background: linear-gradient(135deg, #6366f1, #4f46e5);
                            color: white; display: flex; align-items: center; justify-content: center;
                            font-size: 18px; font-weight: 700;
                        ">${student.name.charAt(0).toUpperCase()}</div>
                        <div>
                            <div style="font-weight: 700; font-size: 16px; color: #111;">${student.name}</div>
                            <div style="font-size: 13px; color: #666;">
                                ${student.age ? student.age + ' años' : 'Estudiante'}
                                ${student.classesRemaining !== undefined ? ` • ${student.classesRemaining} clases disponibles` : ''}
                            </div>
                        </div>
                    </button>
                `).join('')}
            </div>
        `;
        
        // Bind events
        content.querySelectorAll('.student-select-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.studentId = btn.dataset.id;
                this.studentName = btn.dataset.name;
                this.renderConfirmation();
            });
            
            // Hover effects
            btn.addEventListener('mouseenter', () => {
                btn.style.borderColor = '#6366f1';
                btn.style.background = '#f5f3ff';
            });
            btn.addEventListener('mouseleave', () => {
                btn.style.borderColor = '#e5e7eb';
                btn.style.background = 'white';
            });
        });
    }
    
    renderConfirmation() {
        const content = document.getElementById('bookingModalContent');
        const slotDate = new Date(this.slot.startTime);
        
        const dateFormatted = slotDate.toLocaleDateString('es', {
            weekday: 'long',
            day: 'numeric',
            month: 'long'
        });
        const timeFormatted = slotDate.toLocaleTimeString('es', {
            hour: '2-digit',
            minute: '2-digit'
        });
        
        // Mostrar para quién es la clase si es managed student
        const studentBadge = this.studentName ? `
            <div class="student-badge" style="background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; padding: 10px 14px; margin-bottom: 16px; display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 18px;">👶</span>
                <span style="color: #166534; font-weight: 600;">Clase para: ${this.studentName}</span>
            </div>
        ` : '';
        
        content.innerHTML = `
            <div class="modal-header">
                <h2>🎹 Confirmar Clase de Prueba</h2>
            </div>
            
            <div class="booking-summary">
                ${studentBadge}
                
                <div class="teacher-info">
                    ${this.teacher.photo 
                        ? `<img src="${this.teacher.photo}" class="teacher-photo-small" alt="${this.teacher.name}">`
                        : `<div class="teacher-photo-placeholder">${this.teacher.name.charAt(0)}</div>`
                    }
                    <div>
                        <h3>${this.teacher.name}</h3>
                        <p class="teacher-country">${this.teacher.country || 'Internacional'}</p>
                    </div>
                </div>
                
                <div class="booking-details">
                    <div class="detail-row">
                        <span class="detail-icon">📅</span>
                        <span class="detail-text">${dateFormatted}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-icon">🕐</span>
                        <span class="detail-text">${timeFormatted}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-icon">⏱️</span>
                        <span class="detail-text">${this.slot.duration || 30} minutos</span>
                    </div>
                </div>
                
                <div class="price-info free">
                    <span class="price-label">🎁 Clase de prueba</span>
                    <span class="price-value">GRATIS</span>
                </div>
            </div>
            
            <div class="modal-actions">
                <button class="btn-cancel" id="btnCancelBooking">Cancelar</button>
                <button class="btn-confirm" id="btnConfirmBooking">
                    ✓ Confirmar Reserva
                </button>
            </div>
            
            <p class="modal-note">
                Al confirmar, recibirás un email con los detalles para unirte a la clase.
            </p>
        `;
        
        // Bind botones
        document.getElementById('btnCancelBooking')?.addEventListener('click', () => this.close());
        document.getElementById('btnConfirmBooking')?.addEventListener('click', () => this.confirmBooking());
    }
    
    async confirmBooking() {
        if (this.isLoading) return;
        this.isLoading = true;
        
        const btn = document.getElementById('btnConfirmBooking');
        const originalText = btn.textContent;
        btn.textContent = 'Reservando...';
        btn.disabled = true;
        
        try {
            const token = localStorage.getItem('token');
            if (!token) {
                // Redirigir a login
                this.showLoginRequired();
                return;
            }
            
            const response = await fetch('/api/bookings/trial-class', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    teacherId: this.teacher._id || this.teacher.id,
                    slotId: this.slot._id,
                    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                    studentId: this.studentId || undefined,
                    studentName: this.studentName || undefined
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.showSuccess(data);
                if (this.onSuccess) this.onSuccess(data);
            } else {
                this.showError(data.message || 'Error al reservar');
                if (this.onError) this.onError(data);
            }
            
        } catch (error) {
            console.error('[BookingModal] Error:', error);
            this.showError('Error de conexión. Intenta nuevamente.');
            if (this.onError) this.onError(error);
            
        } finally {
            this.isLoading = false;
            btn.textContent = originalText;
            btn.disabled = false;
        }
    }
    
    showSuccess(data) {
        const content = document.getElementById('bookingModalContent');
        const slotDate = new Date(this.slot.startTime);
        
        content.innerHTML = `
            <div class="success-screen">
                <div class="success-icon">✓</div>
                <h2>¡Clase Reservada!</h2>
                <p>Tu clase de prueba con <strong>${this.teacher.name}</strong> está confirmada.</p>
                
                <div class="success-details">
                    <p>📅 ${slotDate.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
                    <p>🕐 ${slotDate.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}</p>
                </div>
                
                <div class="success-actions">
                    <button class="btn-secondary" onclick="bookingModal.addToCalendar()">
                        📆 Añadir al Calendario
                    </button>
                    <a href="/mis-clases.html" class="btn-primary">
                        Ver Mis Clases
                    </a>
                </div>
                
                <p class="success-note">
                    📧 Te enviamos un email con el enlace para unirte a la clase.
                </p>
            </div>
        `;
    }
    
    showError(message) {
        const content = document.getElementById('bookingModalContent');
        
        content.innerHTML = `
            <div class="error-screen">
                <div class="error-icon">✕</div>
                <h2>No se pudo reservar</h2>
                <p>${message}</p>
                
                <div class="error-actions">
                    <button class="btn-secondary" onclick="bookingModal.close()">Cerrar</button>
                    <button class="btn-primary" onclick="bookingModal.renderConfirmation()">Reintentar</button>
                </div>
            </div>
        `;
    }
    
    showLoginRequired() {
        const content = document.getElementById('bookingModalContent');
        const returnUrl = encodeURIComponent(window.location.pathname + window.location.search);
        
        content.innerHTML = `
            <div class="login-required">
                <div class="login-icon">🔐</div>
                <h2>Inicia sesión para reservar</h2>
                <p>Necesitas una cuenta para agendar tu clase de prueba.</p>
                
                <div class="login-actions">
                    <a href="/login.html?redirect=${returnUrl}" class="btn-primary">
                        Iniciar Sesión
                    </a>
                    <a href="/registro.html?redirect=${returnUrl}" class="btn-secondary">
                        Crear Cuenta
                    </a>
                </div>
            </div>
        `;
        
        this.isLoading = false;
    }
    
    addToCalendar() {
        const slotDate = new Date(this.slot.startTime);
        const endDate = new Date(slotDate.getTime() + (this.slot.duration || 30) * 60000);
        
        // Formato para Google Calendar
        const formatDate = (d) => d.toISOString().replace(/-|:|\.\d+/g, '');
        
        const googleUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE` +
            `&text=${encodeURIComponent('Clase de Piano - PianoLink')}` +
            `&dates=${formatDate(slotDate)}/${formatDate(endDate)}` +
            `&details=${encodeURIComponent(`Clase de prueba con ${this.teacher.name}\n\nAccede desde: https://pianolink.app/mis-clases.html`)}`;
        
        window.open(googleUrl, '_blank');
    }
}

// Estilos del modal
if (!document.getElementById('bookingModalStyles')) {
    const styles = document.createElement('style');
    styles.id = 'bookingModalStyles';
    styles.textContent = `
        .booking-modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.8);
            backdrop-filter: blur(4px);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            padding: 20px;
        }
        .booking-modal-overlay.hidden {
            display: none;
        }
        
        .booking-modal {
            background: var(--bg-card, #141414);
            border: 1px solid var(--border, #2a2a2a);
            border-radius: 20px;
            max-width: 450px;
            width: 100%;
            position: relative;
            animation: modalSlideIn 0.3s ease;
        }
        
        @keyframes modalSlideIn {
            from {
                opacity: 0;
                transform: translateY(-20px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
        
        .modal-close {
            position: absolute;
            top: 15px;
            right: 15px;
            background: none;
            border: none;
            color: var(--text-muted, #888);
            font-size: 28px;
            cursor: pointer;
            width: 36px;
            height: 36px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            transition: all 0.2s;
        }
        .modal-close:hover {
            background: rgba(255,255,255,0.1);
            color: var(--text-main, #e0e0e0);
        }
        
        .modal-content {
            padding: 30px;
        }
        
        .modal-header h2 {
            font-size: 20px;
            font-weight: 700;
            margin-bottom: 25px;
            text-align: center;
        }
        
        .booking-summary {
            background: rgba(255,255,255,0.03);
            border-radius: 12px;
            padding: 20px;
            margin-bottom: 25px;
        }
        
        .teacher-info {
            display: flex;
            align-items: center;
            gap: 15px;
            margin-bottom: 20px;
            padding-bottom: 20px;
            border-bottom: 1px solid var(--border, #2a2a2a);
        }
        .teacher-photo-small {
            width: 60px;
            height: 60px;
            border-radius: 12px;
            object-fit: cover;
        }
        .teacher-photo-placeholder {
            width: 60px;
            height: 60px;
            border-radius: 12px;
            background: linear-gradient(135deg, var(--accent, #6366f1), var(--accent-light, #818cf8));
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 24px;
            font-weight: 700;
            color: white;
        }
        .teacher-info h3 {
            font-size: 16px;
            font-weight: 600;
            margin-bottom: 4px;
        }
        .teacher-country {
            font-size: 13px;
            color: var(--text-muted, #888);
        }
        
        .booking-details {
            display: flex;
            flex-direction: column;
            gap: 12px;
            margin-bottom: 20px;
        }
        .detail-row {
            display: flex;
            align-items: center;
            gap: 12px;
        }
        .detail-icon {
            font-size: 18px;
        }
        .detail-text {
            font-size: 14px;
            color: var(--text-main, #e0e0e0);
        }
        
        .price-info {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 15px;
            background: rgba(255,255,255,0.05);
            border-radius: 10px;
        }
        .price-info.free {
            background: linear-gradient(135deg, rgba(74,222,128,0.1), rgba(34,197,94,0.1));
            border: 1px solid rgba(74,222,128,0.3);
        }
        .price-label {
            font-size: 14px;
            color: var(--text-muted, #888);
        }
        .price-value {
            font-size: 18px;
            font-weight: 700;
            color: var(--success, #4ade80);
        }
        
        .modal-actions {
            display: flex;
            gap: 12px;
        }
        
        .btn-cancel {
            flex: 1;
            padding: 14px;
            background: transparent;
            border: 1px solid var(--border, #2a2a2a);
            color: var(--text-muted, #888);
            border-radius: 10px;
            font-size: 14px;
            cursor: pointer;
            transition: all 0.2s;
        }
        .btn-cancel:hover {
            border-color: var(--text-muted, #888);
            color: var(--text-main, #e0e0e0);
        }
        
        .btn-confirm, .btn-primary {
            flex: 2;
            padding: 14px;
            background: linear-gradient(135deg, var(--accent, #6366f1), var(--accent-light, #818cf8));
            border: none;
            color: white;
            border-radius: 10px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
            text-decoration: none;
            text-align: center;
        }
        .btn-confirm:hover, .btn-primary:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 20px rgba(99,102,241,0.3);
        }
        .btn-confirm:disabled {
            opacity: 0.6;
            cursor: not-allowed;
            transform: none;
        }
        
        .modal-note {
            text-align: center;
            font-size: 12px;
            color: var(--text-muted, #888);
            margin-top: 15px;
        }
        
        /* Success Screen */
        .success-screen, .error-screen, .login-required {
            text-align: center;
            padding: 20px 0;
        }
        .success-icon {
            width: 70px;
            height: 70px;
            background: linear-gradient(135deg, var(--success, #4ade80), #22c55e);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 32px;
            color: white;
            margin: 0 auto 20px;
        }
        .error-icon {
            width: 70px;
            height: 70px;
            background: linear-gradient(135deg, #ef4444, #dc2626);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 32px;
            color: white;
            margin: 0 auto 20px;
        }
        .login-icon {
            font-size: 48px;
            margin-bottom: 20px;
        }
        
        .success-screen h2, .error-screen h2, .login-required h2 {
            font-size: 22px;
            margin-bottom: 10px;
        }
        .success-screen p, .error-screen p, .login-required p {
            color: var(--text-muted, #888);
            margin-bottom: 20px;
        }
        
        .success-details {
            background: rgba(255,255,255,0.05);
            padding: 15px;
            border-radius: 10px;
            margin-bottom: 25px;
        }
        .success-details p {
            margin: 8px 0;
            color: var(--text-main, #e0e0e0);
        }
        
        .success-actions, .error-actions, .login-actions {
            display: flex;
            gap: 12px;
            justify-content: center;
        }
        
        .success-note {
            font-size: 12px;
            color: var(--text-muted, #888);
            margin-top: 20px;
        }
    `;
    document.head.appendChild(styles);
}

// Instancia global
window.BookingModal = BookingModal;
