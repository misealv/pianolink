/**
 * BookingCalendar.js
 * Calendario interactivo para mostrar slots disponibles de un profesor
 * y permitir reservar clase de prueba
 */

class BookingCalendar {
    constructor(options = {}) {
        this.teacherId = options.teacherId;
        this.teacherName = options.teacherName || 'Profesor';
        this.teacherPhoto = options.teacherPhoto || null;
        this.containerId = options.containerId || 'bookingCalendar';
        this.onSlotSelect = options.onSlotSelect || null;
        
        this.slots = [];
        this.selectedSlot = null;
        this.currentWeekStart = this.getWeekStart(new Date());
        this.studentTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        
        this.init();
    }
    
    init() {
        this.container = document.getElementById(this.containerId);
        if (!this.container) {
            console.error('[BookingCalendar] Contenedor no encontrado:', this.containerId);
            return;
        }
        this.render();
        this.loadSlots();
    }
    
    getWeekStart(date) {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Lunes como inicio
        d.setDate(diff);
        d.setHours(0, 0, 0, 0);
        return d;
    }
    
    async loadSlots() {
        try {
            const from = this.currentWeekStart.toISOString();
            const to = new Date(this.currentWeekStart.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();
            
            const response = await fetch(
                `/api/availability/teacher/${this.teacherId}?from=${from}&to=${to}&timezone=${this.studentTimezone}`
            );
            
            if (!response.ok) throw new Error('Error cargando disponibilidad');
            
            this.slots = await response.json();
            this.renderSlots();
            
        } catch (error) {
            console.error('[BookingCalendar] Error:', error);
            this.showError('No se pudo cargar la disponibilidad');
        }
    }
    
    render() {
        this.container.innerHTML = `
            <div class="booking-calendar">
                <div class="calendar-header">
                    <button class="nav-btn" id="prevWeek">‹</button>
                    <span class="week-label" id="weekLabel"></span>
                    <button class="nav-btn" id="nextWeek">›</button>
                </div>
                <div class="calendar-grid" id="calendarGrid">
                    <div class="loading-slots">
                        <div class="spinner-small"></div>
                        Cargando horarios...
                    </div>
                </div>
                <div class="timezone-info">
                    🌍 Horarios en tu zona: ${this.getTimezoneLabel()}
                </div>
            </div>
        `;
        
        this.updateWeekLabel();
        this.bindEvents();
    }
    
    bindEvents() {
        document.getElementById('prevWeek')?.addEventListener('click', () => this.changeWeek(-1));
        document.getElementById('nextWeek')?.addEventListener('click', () => this.changeWeek(1));
    }
    
    changeWeek(direction) {
        this.currentWeekStart = new Date(
            this.currentWeekStart.getTime() + direction * 7 * 24 * 60 * 60 * 1000
        );
        
        // No permitir navegar al pasado
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (this.currentWeekStart < today) {
            this.currentWeekStart = this.getWeekStart(today);
        }
        
        this.updateWeekLabel();
        this.loadSlots();
    }
    
    updateWeekLabel() {
        const endOfWeek = new Date(this.currentWeekStart.getTime() + 6 * 24 * 60 * 60 * 1000);
        const options = { day: 'numeric', month: 'short' };
        const label = document.getElementById('weekLabel');
        if (label) {
            label.textContent = `${this.currentWeekStart.toLocaleDateString('es', options)} - ${endOfWeek.toLocaleDateString('es', options)}`;
        }
    }
    
    getTimezoneLabel() {
        const tz = this.studentTimezone;
        // Simplificar nombre de timezone
        return tz.replace('_', ' ').split('/').pop();
    }
    
    renderSlots() {
        const grid = document.getElementById('calendarGrid');
        if (!grid) return;
        
        // Filtrar slots pasados (solo mostrar los que son en el futuro)
        const now = new Date();
        const futureSlots = (this.slots || []).filter(slot => {
            const slotTime = new Date(slot.startTime);
            return slotTime > now;
        });
        
        if (futureSlots.length === 0) {
            grid.innerHTML = `
                <div class="no-slots">
                    <p>😔 No hay horarios disponibles esta semana</p>
                    <button class="btn-secondary" onclick="bookingCalendar.changeWeek(1)">
                        Ver próxima semana →
                    </button>
                </div>
            `;
            return;
        }
        
        // Agrupar slots por día
        const slotsByDay = {};
        const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
        
        futureSlots.forEach(slot => {
            const date = new Date(slot.startTime);
            const dayKey = date.toDateString();
            if (!slotsByDay[dayKey]) {
                slotsByDay[dayKey] = {
                    date: date,
                    dayName: dayNames[date.getDay()],
                    dayNum: date.getDate(),
                    month: date.toLocaleDateString('es', { month: 'short' }),
                    slots: []
                };
            }
            slotsByDay[dayKey].slots.push(slot);
        });
        
        // Ordenar por hora dentro de cada día
        Object.values(slotsByDay).forEach(day => {
            day.slots.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
        });
        
        // Renderizar
        let html = '<div class="days-container">';
        
        Object.values(slotsByDay)
            .sort((a, b) => a.date - b.date)
            .forEach(day => {
                const isToday = new Date().toDateString() === day.date.toDateString();
                
                html += `
                    <div class="day-column ${isToday ? 'today' : ''}">
                        <div class="day-header">
                            <span class="day-name">${day.dayName}</span>
                            <span class="day-num">${day.dayNum}</span>
                            <span class="day-month">${day.month}</span>
                        </div>
                        <div class="slots-list">
                            ${day.slots.map(slot => this.renderSlot(slot)).join('')}
                        </div>
                    </div>
                `;
            });
        
        html += '</div>';
        grid.innerHTML = html;
        
        // Bind eventos de slots
        grid.querySelectorAll('.slot-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const slotId = e.currentTarget.dataset.slotId;
                const slot = this.slots.find(s => s._id === slotId);
                if (slot) this.selectSlot(slot);
            });
        });
    }
    
    renderSlot(slot) {
        const time = new Date(slot.startTime);
        const timeStr = time.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
        const isSelected = this.selectedSlot?._id === slot._id;
        
        return `
            <button class="slot-btn ${isSelected ? 'selected' : ''}" 
                    data-slot-id="${slot._id}">
                ${timeStr}
            </button>
        `;
    }
    
    selectSlot(slot) {
        this.selectedSlot = slot;
        
        // Actualizar UI
        this.container.querySelectorAll('.slot-btn').forEach(btn => {
            btn.classList.toggle('selected', btn.dataset.slotId === slot._id);
        });
        
        // Callback
        if (this.onSlotSelect) {
            this.onSlotSelect(slot);
        }
    }
    
    getSelectedSlot() {
        return this.selectedSlot;
    }
    
    showError(message) {
        const grid = document.getElementById('calendarGrid');
        if (grid) {
            grid.innerHTML = `
                <div class="calendar-error">
                    <p>⚠️ ${message}</p>
                    <button class="btn-secondary" onclick="bookingCalendar.loadSlots()">
                        Reintentar
                    </button>
                </div>
            `;
        }
    }
}

// Estilos del calendario (se inyectan una vez)
if (!document.getElementById('bookingCalendarStyles')) {
    const styles = document.createElement('style');
    styles.id = 'bookingCalendarStyles';
    styles.textContent = `
        .booking-calendar {
            background: transparent;
        }
        
        .calendar-header {
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 20px;
            margin-bottom: 24px;
        }
        
        .nav-btn {
            background: rgba(99,102,241,0.1);
            border: 1px solid rgba(99,102,241,0.3);
            color: var(--accent, #6366f1);
            width: 44px;
            height: 44px;
            border-radius: 12px;
            cursor: pointer;
            font-size: 20px;
            font-weight: 600;
            transition: all 0.2s;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .nav-btn:hover {
            background: var(--accent, #6366f1);
            color: white;
            transform: scale(1.05);
        }
        
        .week-label {
            font-weight: 700;
            font-size: 16px;
            color: var(--text-main, #e0e0e0);
            min-width: 180px;
            text-align: center;
        }
        
        .days-container {
            display: grid;
            grid-template-columns: repeat(7, 1fr);
            gap: 12px;
        }
        
        @media (max-width: 900px) {
            .days-container {
                grid-template-columns: repeat(4, 1fr);
            }
        }
        @media (max-width: 600px) {
            .days-container {
                grid-template-columns: repeat(2, 1fr);
            }
        }
        
        .day-column {
            background: rgba(255,255,255,0.02);
            border: 1px solid var(--border, #2a2a2a);
            border-radius: 16px;
            overflow: hidden;
            transition: all 0.2s;
        }
        .day-column:hover {
            border-color: rgba(99,102,241,0.3);
            background: rgba(255,255,255,0.04);
        }
        .day-column.today {
            border-color: var(--accent, #6366f1);
            background: rgba(99,102,241,0.08);
        }
        .day-column.today .day-header {
            background: var(--accent, #6366f1);
            color: white;
        }
        
        .day-header {
            background: rgba(255,255,255,0.05);
            padding: 16px 12px;
            text-align: center;
            border-bottom: 1px solid var(--border, #2a2a2a);
        }
        .day-name {
            display: block;
            font-size: 11px;
            color: var(--text-muted, #888);
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 4px;
        }
        .day-column.today .day-name { color: rgba(255,255,255,0.8); }
        
        .day-num {
            display: block;
            font-size: 28px;
            font-weight: 800;
            line-height: 1.1;
        }
        .day-month {
            display: block;
            font-size: 11px;
            color: var(--text-muted, #888);
            margin-top: 2px;
        }
        .day-column.today .day-month { color: rgba(255,255,255,0.7); }
        
        .slots-list {
            padding: 12px;
            display: flex;
            flex-direction: column;
            gap: 8px;
            max-height: 280px;
            overflow-y: auto;
        }
        .slots-list::-webkit-scrollbar {
            width: 4px;
        }
        .slots-list::-webkit-scrollbar-thumb {
            background: var(--border, #2a2a2a);
            border-radius: 4px;
        }
        
        .slot-btn {
            background: linear-gradient(135deg, rgba(99,102,241,0.1), rgba(129,140,248,0.05));
            border: 1px solid rgba(99,102,241,0.2);
            color: var(--text-main, #e0e0e0);
            padding: 12px 10px;
            border-radius: 10px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 600;
            transition: all 0.2s;
            text-align: center;
        }
        .slot-btn:hover {
            background: rgba(99,102,241,0.2);
            border-color: var(--accent, #6366f1);
            transform: scale(1.02);
        }
        .slot-btn.selected {
            background: linear-gradient(135deg, var(--accent, #6366f1), var(--accent-light, #818cf8));
            border-color: var(--accent, #6366f1);
            color: white;
            box-shadow: 0 4px 15px rgba(99,102,241,0.3);
        }
        
        .no-slots, .calendar-error {
            text-align: center;
            padding: 60px 20px;
            color: var(--text-muted, #888);
        }
        .no-slots p, .calendar-error p {
            margin-bottom: 20px;
            font-size: 16px;
        }
        
        .btn-secondary {
            background: transparent;
            border: 2px solid var(--accent, #6366f1);
            color: var(--accent, #6366f1);
            padding: 12px 24px;
            border-radius: 10px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 600;
            transition: all 0.2s;
        }
        .btn-secondary:hover {
            background: var(--accent, #6366f1);
            color: white;
        }
        
        .loading-slots {
            text-align: center;
            padding: 60px;
            color: var(--text-muted, #888);
        }
        .spinner-small {
            width: 32px;
            height: 32px;
            border: 3px solid var(--border, #2a2a2a);
            border-top-color: var(--accent, #6366f1);
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin: 0 auto 15px;
        }
        
        .timezone-info {
            text-align: center;
            font-size: 12px;
            color: var(--text-muted, #888);
            margin-top: 20px;
            padding-top: 16px;
            border-top: 1px solid var(--border, #2a2a2a);
        }
        
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
    `;
    document.head.appendChild(styles);
}

// Exportar para uso global
window.BookingCalendar = BookingCalendar;
