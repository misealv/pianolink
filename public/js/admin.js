/**
 * PianoLink Admin Panel - JavaScript
 * Módulo CRM
 */

// ==================== INICIALIZACIÓN ====================
const userSession = JSON.parse(localStorage.getItem('pianoUser'));
if (!userSession || userSession.role !== 'admin') {
    window.location.href = 'login.html';
}

// ==================== ESTADO GLOBAL ====================
let allLeadsData = [];
let currentFilter = 'all';
let currentLeadId = null;

// ==================== NAVEGACIÓN ====================
function switchModule(moduleName) {
    // Ocultar todos los módulos
    document.querySelectorAll('.module-view').forEach(m => m.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    
    // Mostrar módulo seleccionado
    const module = document.getElementById(`module-${moduleName}`);
    if (module) module.classList.add('active');
    
    // Activar nav item
    const navItem = document.querySelector(`[data-module="${moduleName}"]`);
    if (navItem) navItem.classList.add('active');
    
    // Actualizar título
    updateContentTitle(moduleName);
    
    // Cargar datos del módulo
    loadModuleData(moduleName);
}

function updateContentTitle(moduleName) {
    const titles = {
        'dashboard': { icon: '📊', text: 'Dashboard' },
        'leads': { icon: '🎯', text: 'Leads' },
        'tracking': { icon: '📈', text: 'Tracking Pixels' },
        'calendar': { icon: '📅', text: 'Google Calendar' },
        'teachers': { icon: '👨‍🏫', text: 'Profesores' },
        'founder-messages': { icon: '💬', text: 'Mensajes Fundadores' },
        'students': { icon: '👨‍🎓', text: 'Estudiantes' },
        'clients': { icon: '👨‍👧‍👦', text: 'Clientes / Apoderados' },
        'payments': { icon: '💰', text: 'Pagos' },
        'welcome-kits': { icon: '📦', text: 'Welcome Kits' },
        'admin-profile': { icon: '👤', text: 'Mi Perfil' },
        'pricing': { icon: '💰', text: 'Configuración de Precios' }
    };
    
    const titleEl = document.getElementById('content-title');
    if (titleEl && titles[moduleName]) {
        titleEl.innerHTML = `<span>${titles[moduleName].icon}</span> ${titles[moduleName].text}`;
    }
}

function loadModuleData(moduleName) {
    switch(moduleName) {
        case 'dashboard': loadDashboard(); break;
        case 'leads': loadLeads(); break;
        case 'tracking': loadTrackingScripts(); break;
        case 'calendar': loadCalendarConfig(); break;
        case 'teachers': loadTeachers(); break;
        case 'founder-messages': loadFounderMessages(); break;
        case 'students': loadStudents(); break;
        case 'clients': loadClients(); break;
        case 'payments': loadPaymentsDashboard(); break;
        case 'payouts': loadPayouts(); break;
        case 'welcome-kits': loadWelcomeKits(); break;
        case 'admin-profile': loadAdminProfile(); break;
        case 'pricing': loadPricingConfig(); loadKitV2Price(); break;
    }
}

// ==================== TABS ====================
function switchTab(tabGroup, tabName) {
    const container = document.querySelector(`[data-tab-group="${tabGroup}"]`);
    if (!container) return;
    
    container.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
    container.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    
    container.querySelector(`[data-tab="${tabName}"]`)?.classList.add('active');
    container.querySelector(`#tab-${tabName}`)?.classList.add('active');
}

// ==================== UTILIDADES ====================
// Actualizar badge de mensajes fundadores sin recargar toda la tabla
async function updateFounderMessagesBadge() {
    try {
        const res = await fetch('/admin/feedbacks');
        const messages = await res.json();
        const unreadCount = messages.filter(m => m.status === 'unread').length;
        
        const badge = document.getElementById('founder-messages-badge');
        if (badge) {
            badge.textContent = unreadCount;
            badge.style.display = unreadCount > 0 ? 'inline-block' : 'none';
        }
    } catch (e) {
        console.error('Error updating founder messages badge:', e);
    }
}

// ==================== DASHBOARD ====================
async function loadDashboard() {
    try {
        // Cargar stats de leads
        const leadsRes = await fetch('/api/leads/export');
        const leadsData = await leadsRes.json();
        
        document.getElementById('stat-leads-new').textContent = leadsData.stats?.new || 0;
        document.getElementById('stat-leads-contacted').textContent = leadsData.stats?.contacted || 0;
        document.getElementById('stat-leads-qualified').textContent = leadsData.stats?.qualified || 0;
        document.getElementById('stat-leads-converted').textContent = leadsData.stats?.converted || 0;
        
        // Actualizar badge de leads nuevos
        const newCount = leadsData.stats?.new || 0;
        const badge = document.getElementById('leads-badge');
        if (badge) {
            badge.textContent = newCount;
            badge.style.display = newCount > 0 ? 'block' : 'none';
        }
        
        // Cargar stats de profesores
        const teachersRes = await fetch('/api/auth/teachers');
        const teachers = await teachersRes.json();
        document.getElementById('stat-teachers').textContent = teachers.length || 0;
        
        // Actualizar badge de mensajes fundadores
        updateFounderMessagesBadge();
        
    } catch (e) {
        console.error('Error loading dashboard:', e);
    }
}

// ==================== LEADS ====================
let currentTypeFilter = 'all';
let currentStatusFilter = 'all';

async function loadLeads() {
    try {
        const res = await fetch('/api/leads/export');
        const data = await res.json();
        allLeadsData = data.leads || [];
        
        // Actualizar estadísticas
        document.getElementById('stat-new').textContent = data.stats?.new || 0;
        document.getElementById('stat-contacted').textContent = data.stats?.contacted || 0;
        document.getElementById('stat-qualified').textContent = data.stats?.qualified || 0;
        document.getElementById('stat-converted').textContent = data.stats?.converted || 0;
        
        // Actualizar badge
        const newCount = data.stats?.new || 0;
        const badge = document.getElementById('leads-badge');
        if (badge) {
            badge.textContent = newCount;
            badge.style.display = newCount > 0 ? 'block' : 'none';
        }
        
        applyLeadFilters();
    } catch (error) {
        console.error('Error loading leads:', error);
        document.getElementById('leads-table-body').innerHTML = 
            '<tr><td colspan="9" style="text-align:center; padding:40px; color:#ff4444;">Error al cargar leads</td></tr>';
    }
}

function applyLeadFilters() {
    let filtered = [...allLeadsData];
    
    // Filtrar por tipo
    if (currentTypeFilter !== 'all') {
        filtered = filtered.filter(l => (l.type || 'teacher') === currentTypeFilter);
    }
    
    // Filtrar por estado
    if (currentStatusFilter !== 'all') {
        filtered = filtered.filter(l => l.status === currentStatusFilter);
    }
    
    // Filtrar por búsqueda
    const query = document.getElementById('search-leads')?.value?.toLowerCase() || '';
    if (query) {
        filtered = filtered.filter(l => 
            l.name.toLowerCase().includes(query) ||
            l.email.toLowerCase().includes(query) ||
            l.whatsapp.includes(query)
        );
    }
    
    renderLeadsTable(filtered);
}

function filterLeads() {
    currentTypeFilter = document.getElementById('filter-lead-type')?.value || 'all';
    applyLeadFilters();
}

function filterLeadsByStatus(status) {
    currentStatusFilter = status;
    
    document.querySelectorAll('#module-leads .filter-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`#module-leads [data-filter="${status}"]`)?.classList.add('active');
    
    applyLeadFilters();
}

function searchLeads() {
    applyLeadFilters();
}

function renderLeadsTable(leads) {
    const tbody = document.getElementById('leads-table-body');
    
    if (!leads || leads.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:40px; color:#666;">No hay leads registrados</td></tr>';
        return;
    }
    
    tbody.innerHTML = leads.map(lead => {
        const statusClass = `status-${lead.status}`;
        const statusText = {
            'new': 'Nuevo',
            'contacted': 'Contactado',
            'qualified': 'Calificado',
            'converted': 'Convertido',
            'rejected': 'Rechazado'
        }[lead.status] || lead.status;
        
        const leadType = lead.type || 'teacher';
        const typeIcon = leadType === 'teacher' ? '👨‍🏫' : '👤';
        const typeLabel = leadType === 'teacher' ? 'Profesor' : 'Cliente';
        const typeClass = leadType === 'teacher' ? 'type-teacher' : 'type-client';
        
        // Info adicional para clientes
        let clientInfo = '';
        if (leadType === 'client' && lead.clientType) {
            const benefCount = lead.beneficiaries?.length || 0;
            if (lead.clientType === 'guardian' && benefCount > 0) {
                clientInfo = `<span style="color:#888;font-size:11px;display:block;">👶 ${benefCount} beneficiario${benefCount > 1 ? 's' : ''}</span>`;
            }
        }
        
        const source = lead.utmSource || lead.source || 'landing';
        const date = new Date(lead.createdAt).toLocaleDateString('es-ES');
        
        const whatsappClean = lead.whatsapp.replace(/[^\d]/g, '');
        const whatsappMsg = encodeURIComponent(`Hola ${lead.name.split(' ')[0]}, te escribo desde Piano Link.`);
        const whatsappLink = `https://wa.me/${whatsappClean}?text=${whatsappMsg}`;
        
        return `
            <tr>
                <td>
                    <span class="lead-type-badge ${typeClass}" title="${typeLabel}">
                        ${typeIcon}
                    </span>
                </td>
                <td>
                    <strong style="color:#fff;">${lead.name}</strong>
                    ${clientInfo}
                </td>
                <td style="color:#aaa;">${lead.email}</td>
                <td>
                    <a href="${whatsappLink}" target="_blank" class="whatsapp-link">
                        📱 ${lead.whatsapp}
                    </a>
                </td>
                <td style="color:#888;">${lead.country || '-'}</td>
                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                <td style="color:#666; text-transform:uppercase; font-size:11px;">${source}</td>
                <td style="color:#666;">${date}</td>
                <td>
                    <div class="actions-menu">
                        <button class="actions-btn" onclick="toggleLeadMenu('${lead._id}')">⋮</button>
                        <div class="actions-dropdown" id="menu-${lead._id}">
                            <div class="action-item" onclick="viewLead('${lead._id}')">
                                <span>📋</span> Ver postulación
                            </div>
                            <div class="action-item" onclick="openDemoModal('${lead._id}', '${lead.name.replace(/'/g, "\\'")}', '${lead.email}')">
                                <span>📅</span> Agendar demo
                            </div>
                            <div class="action-item" onclick="editLead('${lead._id}')">
                                <span>✏️</span> Editar
                            </div>
                            <div class="action-item" onclick="openStatusModal('${lead._id}')">
                                <span>🔄</span> Cambiar estado
                            </div>
                            <div class="action-item" onclick="openNotesModal('${lead._id}')">
                                <span>📝</span> Notas
                            </div>
                            <div class="action-item danger" onclick="deleteLead('${lead._id}', '${lead.name.replace(/'/g, "\\'")}')">
                                <span>🗑️</span> Eliminar
                            </div>
                        </div>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function filterLeads(status) {
    currentFilter = status;
    
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`[data-filter="${status}"]`)?.classList.add('active');
    
    let filtered = status === 'all' ? allLeadsData : allLeadsData.filter(l => l.status === status);
    renderLeadsTable(filtered);
}

function searchLeads() {
    const query = document.getElementById('search-leads').value.toLowerCase();
    let filtered = currentFilter === 'all' ? allLeadsData : allLeadsData.filter(l => l.status === currentFilter);
    
    if (query) {
        filtered = filtered.filter(l => 
            l.name.toLowerCase().includes(query) ||
            l.email.toLowerCase().includes(query) ||
            l.whatsapp.includes(query)
        );
    }
    
    renderLeadsTable(filtered);
}

function toggleLeadMenu(leadId) {
    closeAllMenus();
    const menu = document.getElementById(`menu-${leadId}`);
    if (menu) {
        menu.classList.toggle('show');
        // Detectar si hay espacio para mostrar hacia abajo
        if (menu.classList.contains('show')) {
            const rect = menu.getBoundingClientRect();
            const spaceBelow = window.innerHeight - rect.top;
            // Si no hay suficiente espacio abajo, mostrar hacia arriba
            if (spaceBelow < rect.height + 50) {
                menu.classList.add('dropup');
            } else {
                menu.classList.remove('dropup');
            }
        }
    }
}

function closeAllMenus() {
    document.querySelectorAll('.actions-dropdown').forEach(m => {
        m.classList.remove('show');
        m.classList.remove('dropup');
    });
}

document.addEventListener('click', (e) => {
    if (!e.target.closest('.actions-menu')) closeAllMenus();
});

// ==================== MODALES DE LEADS ====================
function viewLead(leadId) {
    const lead = allLeadsData.find(l => l._id === leadId);
    if (!lead) return;
    
    document.getElementById('view-lead-name').textContent = lead.name;
    document.getElementById('view-lead-email').textContent = lead.email;
    document.getElementById('view-lead-whatsapp').textContent = lead.whatsapp;
    document.getElementById('view-lead-background').textContent = lead.background || '(Sin información adicional)';
    
    const statusText = { 'new': 'Nuevo', 'contacted': 'Contactado', 'qualified': 'Calificado', 'converted': 'Convertido', 'rejected': 'Rechazado' }[lead.status] || lead.status;
    document.getElementById('view-lead-status').innerHTML = `<span class="status-badge status-${lead.status}">${statusText}</span>`;
    
    openModal('view-lead-modal');
}

function openNotesModal(leadId) {
    const lead = allLeadsData.find(l => l._id === leadId);
    if (!lead) return;
    
    currentLeadId = leadId;
    document.getElementById('notes-lead-name').textContent = lead.name;
    document.getElementById('lead-notes').value = lead.notes || '';
    openModal('notes-modal');
}

async function saveLeadNotes() {
    if (!currentLeadId) return;
    
    const notes = document.getElementById('lead-notes').value.trim();
    
    try {
        const res = await fetch(`/api/leads/${currentLeadId}/notes`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ notes })
        });
        
        if (res.ok) {
            const lead = allLeadsData.find(l => l._id === currentLeadId);
            if (lead) lead.notes = notes;
            closeModal('notes-modal');
            showNotification('Notas guardadas', 'success');
        } else {
            showNotification('Error guardando notas', 'error');
        }
    } catch (e) {
        console.error('Error:', e);
        showNotification('Error de conexión', 'error');
    }
}

function openStatusModal(leadId) {
    currentLeadId = leadId;
    const lead = allLeadsData.find(l => l._id === leadId);
    if (!lead) return;
    
    document.getElementById('status-lead-name').textContent = lead.name;
    openModal('status-modal');
}

async function changeLeadStatus(newStatus) {
    if (!currentLeadId) return;
    
    try {
        const res = await fetch(`/api/leads/${currentLeadId}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus })
        });
        
        if (res.ok) {
            closeModal('status-modal');
            loadLeads();
            showNotification(`Estado actualizado: ${newStatus}`, 'success');
        } else {
            showNotification('Error actualizando estado', 'error');
        }
    } catch (e) {
        console.error('Error:', e);
        showNotification('Error de conexión', 'error');
    }
}

async function deleteLead(leadId, leadName) {
    if (!confirm(`¿Eliminar a "${leadName}"?\n\nEsta acción no se puede deshacer.`)) return;
    
    try {
        const res = await fetch(`/api/leads/${leadId}`, { method: 'DELETE' });
        
        if (res.ok) {
            loadLeads();
            showNotification('Lead eliminado', 'success');
        } else {
            showNotification('Error eliminando', 'error');
        }
    } catch (e) {
        console.error('Error:', e);
        showNotification('Error de conexión', 'error');
    }
}

// ==================== CREAR LEAD ====================
function openCreateLeadModal() {
    const form = document.getElementById('create-lead-form');
    if (form) form.reset();
    
    // Resetear a profesor por defecto
    const teacherRadio = document.querySelector('input[name="lead-type"][value="teacher"]');
    if (teacherRadio) teacherRadio.checked = true;
    
    // Resetear tipo de cliente a adulto
    const adultRadio = document.querySelector('input[name="client-type"][value="adult_learner"]');
    if (adultRadio) adultRadio.checked = true;
    
    // Mostrar campos de profesor
    toggleLeadTypeFields();
    
    openModal('create-lead-modal');
}

// ==================== LEAD TYPE HANDLING ====================
function toggleLeadTypeFields() {
    const leadType = document.querySelector('input[name="lead-type"]:checked')?.value || 'teacher';
    const clientFields = document.getElementById('client-fields');
    const teacherFields = document.getElementById('teacher-fields');
    
    if (leadType === 'teacher') {
        if (clientFields) clientFields.style.display = 'none';
        if (teacherFields) teacherFields.style.display = 'block';
    } else {
        if (clientFields) clientFields.style.display = 'block';
        if (teacherFields) teacherFields.style.display = 'none';
    }
}

function toggleClientType() {
    const clientType = document.querySelector('input[name="client-type"]:checked')?.value;
    const beneficiariesSection = document.getElementById('beneficiaries-section');
    
    if (clientType === 'guardian' && beneficiariesSection) {
        beneficiariesSection.style.display = 'block';
    } else if (beneficiariesSection) {
        beneficiariesSection.style.display = 'none';
    }
}

function addBeneficiary() {
    const container = document.getElementById('beneficiaries-container');
    if (!container) return;
    
    const newRow = document.createElement('div');
    newRow.className = 'beneficiary-row';
    newRow.style.cssText = 'display:grid; grid-template-columns:2fr 1fr 1fr auto; gap:10px; align-items:end; margin-bottom:10px;';
    newRow.innerHTML = `
        <div>
            <label style="font-size:11px; color:var(--text-muted);">Nombre</label>
            <input type="text" class="beneficiary-name" placeholder="Nombre del estudiante">
        </div>
        <div>
            <label style="font-size:11px; color:var(--text-muted);">Edad</label>
            <input type="number" class="beneficiary-age" placeholder="Edad" min="3" max="99">
        </div>
        <div>
            <label style="font-size:11px; color:var(--text-muted);">Nivel</label>
            <select class="beneficiary-level">
                <option value="beginner">Principiante</option>
                <option value="intermediate">Intermedio</option>
                <option value="advanced">Avanzado</option>
            </select>
        </div>
        <button type="button" class="btn btn-small" onclick="removeBeneficiary(this)" style="padding:8px; background:rgba(255,82,82,0.2); color:#ff5252;">✕</button>
    `;
    container.appendChild(newRow);
}

function removeBeneficiary(btn) {
    const row = btn.closest('.beneficiary-row');
    const container = document.getElementById('beneficiaries-container');
    // No eliminar si es el único
    if (container && container.querySelectorAll('.beneficiary-row').length > 1) {
        row.remove();
    } else {
        showNotification('Debe haber al menos un beneficiario', 'warning');
    }
}

function collectBeneficiaries() {
    const container = document.getElementById('beneficiaries-container');
    if (!container) return [];
    
    const rows = container.querySelectorAll('.beneficiary-row');
    const beneficiaries = [];
    
    rows.forEach((row) => {
        const name = row.querySelector('.beneficiary-name')?.value?.trim();
        const age = row.querySelector('.beneficiary-age')?.value;
        const level = row.querySelector('.beneficiary-level')?.value;
        
        if (name) {
            beneficiaries.push({
                name,
                age: age ? parseInt(age) : null,
                relationship: 'child',
                level: level || 'beginner',
                instrument: 'piano'
            });
        }
    });
    
    return beneficiaries;
}

async function createLead(e) {
    e.preventDefault();
    
    const leadType = document.querySelector('input[name="lead-type"]:checked')?.value || 'teacher';
    const clientType = leadType === 'client' ? 
        (document.querySelector('input[name="client-type"]:checked')?.value || 'adult_learner') : null;
    
    const formData = {
        name: document.getElementById('new-lead-name').value.trim(),
        email: document.getElementById('new-lead-email').value.trim(),
        whatsapp: document.getElementById('new-lead-whatsapp').value.trim(),
        background: document.getElementById('new-lead-background').value.trim(),
        status: document.getElementById('new-lead-status').value,
        type: leadType,
        clientType: clientType,
        utmSource: 'manual',
        isManual: true
    };
    
    // Agregar beneficiarios si es apoderado
    if (leadType === 'client' && clientType === 'guardian') {
        formData.beneficiaries = collectBeneficiaries();
    }
    
    try {
        const res = await fetch('/api/leads', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });
        
        if (res.ok) {
            closeModal('create-lead-modal');
            document.getElementById('create-lead-form')?.reset();
            loadLeads();
            showNotification('Lead creado exitosamente', 'success');
        } else {
            const data = await res.json();
            showNotification(data.message || 'Error creando lead', 'error');
        }
    } catch (e) {
        console.error('Error:', e);
        showNotification('Error de conexión', 'error');
    }
}

// ==================== AGENDAR DEMO ====================
let demoLeadId = null;

function openDemoModal(leadId, leadName, leadEmail) {
    demoLeadId = leadId;
    document.getElementById('demo-lead-name').textContent = leadName;
    document.getElementById('demo-lead-email').textContent = leadEmail;
    
    // Fecha por defecto: mañana 10am
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);
    document.getElementById('demo-datetime').value = tomorrow.toISOString().slice(0, 16);
    
    openModal('demo-modal');
}

async function scheduleDemo() {
    if (!demoLeadId) return;
    
    const datetime = document.getElementById('demo-datetime').value;
    const duration = document.getElementById('demo-duration').value;
    
    if (!datetime) {
        showNotification('Selecciona fecha y hora', 'error');
        return;
    }
    
    try {
        const res = await fetch(`/api/leads/${demoLeadId}/schedule-demo`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                demoDate: new Date(datetime).toISOString(),
                duration: parseInt(duration)
            })
        });
        
        const data = await res.json();
        
        if (res.ok) {
            closeModal('demo-modal');
            loadLeads();
            showNotification('Demo agendada correctamente', 'success');
        } else {
            showNotification(data.message || 'Error agendando', 'error');
        }
    } catch (e) {
        console.error('Error:', e);
        showNotification('Error de conexión', 'error');
    }
}

// ==================== TRACKING SCRIPTS ====================
async function loadTrackingScripts() {
    try {
        const res = await fetch('/admin/tracking-scripts');
        const data = await res.json();
        document.getElementById('facebook-pixel').value = data.facebookPixel || '';
        document.getElementById('google-analytics').value = data.googleAnalytics || '';
    } catch (e) {
        console.error('Error loading tracking:', e);
    }
}

async function saveTrackingScripts() {
    const facebookPixel = document.getElementById('facebook-pixel').value.trim();
    const googleAnalytics = document.getElementById('google-analytics').value.trim();
    
    try {
        const res = await fetch('/admin/tracking-scripts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ facebookPixel, googleAnalytics })
        });
        
        if (res.ok) {
            showNotification('Scripts guardados', 'success');
        } else {
            showNotification('Error guardando', 'error');
        }
    } catch (e) {
        console.error('Error:', e);
        showNotification('Error de conexión', 'error');
    }
}

// ==================== GOOGLE CALENDAR ====================
async function loadCalendarConfig() {
    try {
        const res = await fetch('/admin/google-calendar');
        const data = await res.json();
        document.getElementById('calendar-client-id').value = data.clientId || '';
        document.getElementById('calendar-client-secret').value = data.clientSecret || '';
        document.getElementById('calendar-redirect-uri').value = data.redirectUri || 'https://pianolink.onrender.com/api/calendar/oauth2callback';
        document.getElementById('calendar-refresh-token').value = data.refreshToken || '';
    } catch (e) {
        console.error('Error loading calendar:', e);
    }
}

async function saveCalendarConfig() {
    const config = {
        clientId: document.getElementById('calendar-client-id').value.trim(),
        clientSecret: document.getElementById('calendar-client-secret').value.trim(),
        redirectUri: document.getElementById('calendar-redirect-uri').value.trim(),
        refreshToken: document.getElementById('calendar-refresh-token').value.trim()
    };
    
    if (!config.clientId || !config.clientSecret) {
        showNotification('Faltan campos requeridos', 'error');
        return;
    }
    
    try {
        const res = await fetch('/admin/google-calendar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        });
        
        if (res.ok) {
            showNotification('Configuración guardada', 'success');
        } else {
            showNotification('Error guardando', 'error');
        }
    } catch (e) {
        console.error('Error:', e);
        showNotification('Error de conexión', 'error');
    }
}

async function testCalendarConnection() {
    try {
        const res = await fetch('/api/calendar/test');
        const data = await res.json();
        
        if (data.success) {
            showNotification('Conexión exitosa con Google Calendar', 'success');
        } else {
            showNotification('Calendar no configurado', 'error');
        }
    } catch (e) {
        showNotification('Error probando conexión', 'error');
    }
}

// ==================== PROFESORES ====================
let allTeachersData = [];
let currentTeacherId = null;

async function loadTeachers() {
    try {
        const res = await fetch('/api/auth/teachers');
        allTeachersData = await res.json();
        
        // Actualizar stats
        const founders = allTeachersData.filter(t => t.isFoundingMember).length;
        document.getElementById('stat-teachers-total').textContent = allTeachersData.length;
        document.getElementById('stat-teachers-founders').textContent = founders;
        
        renderTeachersTable(allTeachersData);
    } catch (e) {
        console.error('Error loading teachers:', e);
        document.getElementById('teachers-table-body').innerHTML = 
            '<tr><td colspan="7" style="text-align:center; padding:40px; color:#ff4444;">Error al cargar profesores</td></tr>';
    }
}

function renderTeachersTable(teachers) {
    const tbody = document.getElementById('teachers-table-body');
    
    if (!teachers || teachers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:40px; color:#666;">No hay profesores registrados</td></tr>';
        return;
    }
    
    tbody.innerHTML = teachers.map(t => {
        const founderBadge = t.isFoundingMember 
            ? '<span class="status-badge" style="background:linear-gradient(135deg,#bf953f,#fcf6ba,#b38728);color:#3e2723;border:none;">★ FUNDADOR</span>'
            : '<span class="status-badge status-inactive">Regular</span>';
        
        const country = t.country || '-';
        const whatsapp = t.whatsapp 
            ? `<a href="https://wa.me/${t.whatsapp.replace(/[^0-9]/g, '')}" target="_blank" class="whatsapp-link">📱 ${t.whatsapp}</a>` 
            : '-';
        const slug = t.slug ? `<a href="/?sala=${t.slug}" target="_blank" style="color:var(--accent-blue);">/c/${t.slug}</a>` : '-';
        
        return `
            <tr>
                <td>
                    <strong style="color:#fff;">${t.name}</strong>
                    <div style="font-size:11px; color:#666;">${country}</div>
                </td>
                <td style="color:#aaa;">${t.email}</td>
                <td>${whatsapp}</td>
                <td>${slug}</td>
                <td>${founderBadge}</td>
                <td>
                    <span class="status-badge ${t.subscriptionStatus === 'active' ? 'status-active' : 'status-inactive'}">
                        ${t.subscriptionStatus === 'active' ? 'Activa' : 'Sin suscripción'}
                    </span>
                </td>
                <td>
                    <div class="actions-menu">
                        <button class="actions-btn" onclick="toggleTeacherMenu('${t._id}')">⋮</button>
                        <div class="actions-dropdown" id="teacher-menu-${t._id}">
                            <div class="action-item" onclick="editTeacher('${t._id}')">
                                <span>✏️</span> Editar
                            </div>
                            <div class="action-item" onclick="toggleFounder('${t._id}', ${t.isFoundingMember})">
                                <span>${t.isFoundingMember ? '⭐' : '★'}</span> 
                                ${t.isFoundingMember ? 'Quitar Fundador' : 'Hacer Fundador'}
                            </div>
                            <div class="action-item" onclick="viewTeacherStats('${t._id}')">
                                <span>📊</span> Estadísticas
                            </div>
                            <div class="action-item" onclick="messageTeacher('${t._id}', '${t.name.replace(/'/g, "\\'")}')">
                                <span>✉️</span> Enviar mensaje
                            </div>
                            <div class="action-item danger" onclick="deleteTeacher('${t._id}', '${t.name.replace(/'/g, "\\'")}')">
                                <span>🗑️</span> Eliminar
                            </div>
                        </div>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function searchTeachers() {
    const query = document.getElementById('search-teachers').value.toLowerCase();
    let filtered = allTeachersData;
    
    if (query) {
        filtered = allTeachersData.filter(t => 
            t.name.toLowerCase().includes(query) ||
            t.email.toLowerCase().includes(query) ||
            (t.slug && t.slug.toLowerCase().includes(query))
        );
    }
    
    renderTeachersTable(filtered);
}

function filterTeachers(filter) {
    document.querySelectorAll('#module-teachers .filter-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`#module-teachers [data-filter="${filter}"]`)?.classList.add('active');
    
    let filtered = allTeachersData;
    if (filter === 'founders') {
        filtered = allTeachersData.filter(t => t.isFoundingMember);
    } else if (filter === 'regular') {
        filtered = allTeachersData.filter(t => !t.isFoundingMember);
    }
    
    renderTeachersTable(filtered);
}

function toggleTeacherMenu(teacherId) {
    closeAllMenus();
    const menu = document.getElementById(`teacher-menu-${teacherId}`);
    if (menu) {
        menu.classList.toggle('show');
        // Detectar si hay espacio para mostrar hacia abajo
        if (menu.classList.contains('show')) {
            const rect = menu.getBoundingClientRect();
            const spaceBelow = window.innerHeight - rect.top;
            // Si no hay suficiente espacio abajo, mostrar hacia arriba
            if (spaceBelow < rect.height + 50) {
                menu.classList.add('dropup');
            } else {
                menu.classList.remove('dropup');
            }
        }
    }
}

// Crear profesor
function openCreateTeacherModal() {
    document.getElementById('create-teacher-form').reset();
    document.getElementById('teacher-modal-title').textContent = 'Nuevo Profesor';
    currentTeacherId = null;
    openModal('create-teacher-modal');
}

async function createTeacher(e) {
    e.preventDefault();
    
    const formData = {
        name: document.getElementById('teacher-name').value.trim(),
        email: document.getElementById('teacher-email').value.trim(),
        password: document.getElementById('teacher-password').value,
        country: document.getElementById('teacher-country').value.trim() || undefined,
        whatsapp: document.getElementById('teacher-whatsapp').value.trim() || undefined,
        slug: document.getElementById('teacher-slug').value.trim() || undefined,
        isFoundingMember: document.getElementById('teacher-founder').checked
    };
    
    if (!formData.password && !currentTeacherId) {
        showNotification('La contraseña es requerida', 'error');
        return;
    }
    
    try {
        let res;
        if (currentTeacherId) {
            // Editar usando ruta admin
            const updateData = { 
                name: formData.name,
                email: formData.email,
                country: formData.country,
                whatsapp: formData.whatsapp,
                slug: formData.slug,
                isFoundingMember: formData.isFoundingMember
            };
            if (formData.password) updateData.password = formData.password;
            
            res = await fetch(`/admin/users/${currentTeacherId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updateData)
            });
        } else {
            // Crear
            res = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
        }
        
        if (res.ok) {
            closeModal('create-teacher-modal');
            loadTeachers();
            showNotification(currentTeacherId ? 'Profesor actualizado' : 'Profesor creado', 'success');
        } else {
            const data = await res.json();
            showNotification(data.message || 'Error', 'error');
        }
    } catch (e) {
        console.error('Error:', e);
        showNotification('Error de conexión', 'error');
    }
}

function editTeacher(teacherId) {
    const teacher = allTeachersData.find(t => t._id === teacherId);
    if (!teacher) return;
    
    currentTeacherId = teacherId;
    document.getElementById('teacher-modal-title').textContent = 'Editar Profesor';
    document.getElementById('teacher-name').value = teacher.name;
    document.getElementById('teacher-email').value = teacher.email;
    document.getElementById('teacher-country').value = teacher.country || '';
    document.getElementById('teacher-whatsapp').value = teacher.whatsapp || '';
    document.getElementById('teacher-slug').value = teacher.slug || '';
    document.getElementById('teacher-password').value = '';
    document.getElementById('teacher-founder').checked = teacher.isFoundingMember;
    
    openModal('create-teacher-modal');
}

async function toggleFounder(teacherId, isCurrentlyFounder) {
    const action = isCurrentlyFounder ? 'quitar el estatus de Fundador a' : 'hacer Fundador a';
    const teacher = allTeachersData.find(t => t._id === teacherId);
    
    if (!confirm(`¿${action} ${teacher?.name}?`)) return;
    
    try {
        const res = await fetch(`/admin/users/${teacherId}/toggle-founder`, {
            method: 'POST'
        });
        
        if (res.ok) {
            loadTeachers();
            showNotification('Estado actualizado', 'success');
        } else {
            showNotification('Error actualizando', 'error');
        }
    } catch (e) {
        console.error('Error:', e);
        showNotification('Error de conexión', 'error');
    }
}

async function deleteTeacher(teacherId, teacherName) {
    if (!confirm(`⚠️ ¿Eliminar a "${teacherName}"?\n\nEsta acción NO se puede deshacer.`)) return;
    
    try {
        const res = await fetch(`/api/auth/delete/${teacherId}`, { method: 'DELETE' });
        
        if (res.ok) {
            loadTeachers();
            showNotification('Profesor eliminado', 'success');
        } else {
            showNotification('Error eliminando', 'error');
        }
    } catch (e) {
        console.error('Error:', e);
        showNotification('Error de conexión', 'error');
    }
}

function messageTeacher(teacherId, teacherName) {
    currentTeacherId = teacherId;
    document.getElementById('message-recipient').textContent = teacherName;
    document.getElementById('teacher-message').value = '';
    openModal('message-modal');
}

async function sendTeacherMessage() {
    if (!currentTeacherId) return;
    
    const content = document.getElementById('teacher-message').value.trim();
    if (!content) {
        showNotification('Escribe un mensaje', 'error');
        return;
    }
    
    try {
        const res = await fetch('/admin/message/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ recipientId: currentTeacherId, content })
        });
        
        if (res.ok) {
            closeModal('message-modal');
            showNotification('Mensaje enviado', 'success');
        } else {
            showNotification('Error enviando', 'error');
        }
    } catch (e) {
        console.error('Error:', e);
        showNotification('Error de conexión', 'error');
    }
}

function viewTeacherStats(teacherId) {
    // Placeholder - se puede expandir
    showNotification('Estadísticas próximamente', 'info');
}

// ==================== WELCOME KITS ====================
let allKitsData = [];
let currentKitFilter = 'all';

async function loadWelcomeKits() {
    // Cargar el nuevo módulo rediseñado
    loadWelcomeKitsModule();
}

function filterKits(status) {
    currentKitFilter = status;
    
    document.querySelectorAll('#module-welcome-kits .filter-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`#module-welcome-kits [data-filter="${status}"]`)?.classList.add('active');
    
    let filtered = [...allKitsData];
    
    if (status !== 'all') {
        filtered = filtered.filter(k => k.overallStatus === status);
    }
    
    renderKitsTable(filtered);
}

function searchKits() {
    const query = document.getElementById('search-kits')?.value?.toLowerCase() || '';
    
    let filtered = [...allKitsData];
    
    if (currentKitFilter !== 'all') {
        filtered = filtered.filter(k => k.overallStatus === currentKitFilter);
    }
    
    if (query) {
        filtered = filtered.filter(k => 
            k.clientId?.name?.toLowerCase().includes(query) ||
            k.clientId?.email?.toLowerCase().includes(query) ||
            k.shipping?.trackingNumber?.toLowerCase().includes(query)
        );
    }
    
    renderKitsTable(filtered);
}

function renderKitsTable(kits) {
    const tbody = document.getElementById('kits-table-body');
    
    if (!kits || kits.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:40px; color:#666;">No hay Welcome Kits</td></tr>';
        return;
    }
    
    const statusLabels = {
        'paid': { text: '💳 Pagado', class: 'status-new' },
        'shipping': { text: '📦 Enviado', class: 'status-contacted' },
        'delivered': { text: '✅ Entregado', class: 'status-qualified' },
        'setup_pending': { text: '🔧 Setup', class: 'status-qualified' },
        'setup_scheduled': { text: '📅 Setup', class: 'status-contacted' },
        'trial_available': { text: '🎹 Prueba', class: 'status-contacted' },
        'trial_scheduled': { text: '📅 Prueba', class: 'status-contacted' },
        'completed': { text: '🎉 Completado', class: 'status-converted' },
        'refunded': { text: '↩️ Reembolsado', class: 'status-rejected' }
    };
    
    const countryFlags = {
        'CL': '🇨🇱', 'AR': '🇦🇷', 'ES': '🇪🇸', 'MX': '🇲🇽', 'US': '🇺🇸'
    };
    
    tbody.innerHTML = kits.map(kit => {
        const client = kit.clientId || {};
        const shipping = kit.shipping || {};
        const address = shipping.address || {};
        const status = statusLabels[kit.overallStatus] || { text: kit.overallStatus, class: '' };
        const date = new Date(kit.createdAt).toLocaleDateString('es-ES');
        const flag = countryFlags[address.country] || '🌎';
        
        const addressText = `${address.street || ''}, ${address.city || ''}`.substring(0, 30);
        const trackingText = shipping.trackingNumber 
            ? `<a href="${shipping.trackingUrl || '#'}" target="_blank" style="color:var(--accent-orange);">${shipping.trackingNumber}</a>`
            : '<span style="color:#666;">Sin tracking</span>';
        
        return `
            <tr>
                <td>
                    <strong style="color:#fff;">${client.name || 'N/A'}</strong>
                    <div style="font-size:11px; color:#888;">${client.email || ''}</div>
                    ${client.whatsapp ? `<div style="font-size:11px; color:#888;">📱 ${client.whatsapp}</div>` : ''}
                </td>
                <td style="font-size:20px; text-align:center;">${flag}</td>
                <td style="color:#aaa; font-size:12px;">${addressText}...</td>
                <td><span class="status-badge ${status.class}">${status.text}</span></td>
                <td>${trackingText}</td>
                <td style="color:#666;">${date}</td>
                <td>
                    <div class="actions-menu">
                        <button class="actions-btn" onclick="toggleKitMenu('${kit._id}')">⋮</button>
                        <div class="actions-dropdown" id="kit-menu-${kit._id}">
                            <div class="action-item" onclick="openShippingModal('${kit._id}')">
                                <span>📦</span> Actualizar envío
                            </div>
                            <div class="action-item" onclick="viewKitDetails('${kit._id}')">
                                <span>📋</span> Ver detalles
                            </div>
                            <div class="action-item" onclick="contactKitClient('${client.whatsapp}', '${client.name}')">
                                <span>📱</span> WhatsApp
                            </div>
                        </div>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function toggleKitMenu(kitId) {
    const menu = document.getElementById(`kit-menu-${kitId}`);
    document.querySelectorAll('.actions-dropdown').forEach(m => {
        if (m.id !== `kit-menu-${kitId}`) m.style.display = 'none';
    });
    menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
}

function openShippingModal(kitId) {
    const kit = allKitsData.find(k => k._id === kitId);
    if (!kit) {
        console.error('Kit no encontrado:', kitId);
        showNotification('Error: Orden no encontrada', 'error');
        return;
    }
    
    // Guardar país para auto-complete
    window.currentShippingCountry = kit.country || 'CL';
    
    document.getElementById('shipping-kit-id').value = kitId;
    document.getElementById('shipping-client-name').textContent = kit.customerName || 'Cliente';
    document.getElementById('shipping-client-address').textContent = 
        `${kit.address || ''}, ${kit.city || ''}, ${kit.country || ''}`;
    
    document.getElementById('shipping-status').value = kit.shippingStatus || 'processing';
    document.getElementById('shipping-carrier').value = kit.carrier || '';
    document.getElementById('shipping-tracking').value = kit.trackingNumber || '';
    document.getElementById('shipping-url').value = kit.trackingUrl || '';
    
    // Limpiar detección previa
    document.getElementById('tracking-detected').style.display = 'none';
    document.getElementById('delivery-range').textContent = '';
    
    if (kit.estimatedDelivery) {
        document.getElementById('shipping-estimated').value = 
            new Date(kit.estimatedDelivery).toISOString().split('T')[0];
    } else {
        document.getElementById('shipping-estimated').value = '';
    }
    
    document.querySelectorAll('.actions-dropdown').forEach(m => m.style.display = 'none');
    openModal('shipping-modal');
}

/**
 * Auto-completar tracking: detecta carrier, genera URL y calcula fecha
 */
async function autoCompleteTracking() {
    const trackingNumber = document.getElementById('shipping-tracking').value.trim();
    
    if (!trackingNumber) {
        showNotification('Ingresa el número de tracking primero', 'warning');
        return;
    }
    
    try {
        const res = await fetch('/api/welcome-kit/admin/shipping/auto-complete', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${userSession.token}`
            },
            body: JSON.stringify({
                trackingNumber,
                countryCode: window.currentShippingCountry || 'CL'
            })
        });
        
        const result = await res.json();
        
        if (result.success) {
            const data = result.data;
            
            // Llenar campos
            document.getElementById('shipping-carrier').value = data.carrierLabel;
            document.getElementById('shipping-url').value = data.trackingUrl;
            document.getElementById('shipping-estimated').value = 
                new Date(data.estimatedDelivery).toISOString().split('T')[0];
            
            // Cambiar estado a "Enviado" automáticamente
            document.getElementById('shipping-status').value = 'shipped';
            
            // Mostrar info detectada
            const detectedDiv = document.getElementById('tracking-detected');
            detectedDiv.innerHTML = `
                <div style="color:#22c55e; font-weight:600; margin-bottom:4px;">✓ Tracking detectado</div>
                <div>📦 <strong>${data.carrierLabel}</strong></div>
                <div>📅 Entrega estimada: <strong>${data.deliveryRange}</strong></div>
                <div style="margin-top:6px;">
                    <a href="${data.trackingUrl}" target="_blank" style="color:#3b82f6;">
                        🔗 Ver en 17Track →
                    </a>
                </div>
            `;
            detectedDiv.style.display = 'block';
            
            // Mostrar rango de días
            document.getElementById('delivery-range').textContent = 
                `⏱️ Aprox. ${data.deliveryRange} a ${window.currentShippingCountry || 'destino'}`;
            
            showNotification('Tracking detectado correctamente', 'success');
        } else {
            showNotification(result.error || 'Error detectando tracking', 'error');
        }
    } catch (error) {
        console.error('Error auto-complete:', error);
        showNotification('Error de conexión', 'error');
    }
}

async function saveShipping() {
    const kitId = document.getElementById('shipping-kit-id').value;
    
    const data = {
        status: document.getElementById('shipping-status').value,
        carrier: document.getElementById('shipping-carrier').value,
        trackingNumber: document.getElementById('shipping-tracking').value,
        trackingUrl: document.getElementById('shipping-url').value,
        estimatedDelivery: document.getElementById('shipping-estimated').value
    };
    
    try {
        const res = await fetch(`/api/welcome-kit/admin/${kitId}/shipping`, {
            method: 'PUT',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${userSession.token}`
            },
            body: JSON.stringify(data)
        });
        
        const result = await res.json();
        
        if (result.success) {
            closeModal('shipping-modal');
            loadWelcomeKits();
            showNotification('Envío actualizado correctamente', 'success');
        } else {
            showNotification(result.error || 'Error actualizando envío', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showNotification('Error de conexión', 'error');
    }
}

function viewKitDetails(kitId) {
    const kit = allKitsData.find(k => k._id === kitId);
    if (!kit) return;
    
    alert(`
Welcome Kit: ${kitId}
Cliente: ${kit.customerName || 'N/A'}
Email: ${kit.email || 'N/A'}
País: ${kit.country || 'N/A'}
Estado: ${kit.shippingStatus}
Carrier: ${kit.carrier || 'N/A'}
Tracking: ${kit.trackingNumber || 'N/A'}
Pagado: $${kit.total}
    `);
}

function contactKitClient(whatsapp, name) {
    if (!whatsapp) {
        showNotification('Sin número de WhatsApp', 'warning');
        return;
    }
    const clean = whatsapp.replace(/[^\d]/g, '');
    const msg = encodeURIComponent(`Hola ${name}, te escribimos desde PianoLink respecto a tu Welcome Kit.`);
    window.open(`https://wa.me/${clean}?text=${msg}`, '_blank');
}

// ==================== PRECIOS REGIONALES ====================
let regionalPricing = [];
let kitProducts = [];
let currentProductFilter = 'all';

function switchKitsTab(tabName) {
    document.querySelectorAll('[data-tab-group="welcome-kits"] .tab-btn').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('[data-tab-group="welcome-kits"] .tab-content').forEach(c => c.classList.remove('active'));
    
    document.querySelector(`[data-tab-group="welcome-kits"] [data-tab="${tabName}"]`)?.classList.add('active');
    document.getElementById(`tab-${tabName}`)?.classList.add('active');
    
    if (tabName === 'kits-pricing') {
        loadPricing();
    } else if (tabName === 'kits-fulfillment') {
        loadCJDashboard();
    } else if (tabName === 'kits-products') {
        loadKitProducts();
    } else if (tabName === 'kits-dsers') {
        loadDSersTab();
    }
}

async function loadPricing() {
    try {
        // Cargar precios regionales desde GlobalConfig
        const res = await fetch('/api/welcome-kit/admin/pricing', {
            headers: { 'Authorization': `Bearer ${userSession.token}` }
        });
        const data = await res.json();
        
        if (data.success && data.setupOnlyPricing) {
            // Usar setupOnly pricing (Sesión Setup + Clase)
            regionalPricing = data.setupOnlyPricing.map(p => ({
                regionCode: p.regionCode,
                regionName: getCountryName(p.regionCode),
                flag: getCountryFlag(p.regionCode),
                price: p.price || 10,
                currency: p.currency || 'USD'
            }));
            
            renderPricingGrid();
        } else {
            // Defaults: $10 USD por defecto
            regionalPricing = [
                { regionCode: 'DEFAULT', regionName: 'Por Defecto', flag: '🌍', price: 10, currency: 'USD' },
                { regionCode: 'CL', regionName: 'Chile', flag: '🇨🇱', price: 8, currency: 'USD' },
                { regionCode: 'US', regionName: 'Estados Unidos', flag: '🇺🇸', price: 15, currency: 'USD' },
                { regionCode: 'MX', regionName: 'México', flag: '🇲🇽', price: 8, currency: 'USD' },
                { regionCode: 'AR', regionName: 'Argentina', flag: '🇦🇷', price: 6, currency: 'USD' },
                { regionCode: 'CO', regionName: 'Colombia', flag: '🇨🇴', price: 8, currency: 'USD' },
                { regionCode: 'ES', regionName: 'España', flag: '🇪🇸', price: 12, currency: 'EUR' }
            ];
            renderPricingGrid();
        }
    } catch (error) {
        console.error('Error loading pricing:', error);
        showNotification('Error cargando precios', 'error');
    }
}

function getCountryName(code) {
    const names = {
        'default': 'Por Defecto',
        'CL': 'Chile',
        'US': 'Estados Unidos',
        'MX': 'México',
        'AR': 'Argentina',
        'CO': 'Colombia',
        'ES': 'España',
        'PE': 'Perú',
        'BR': 'Brasil',
        'UY': 'Uruguay'
    };
    return names[code] || code;
}

function getCountryFlag(code) {
    const flags = {
        'default': '🌍',
        'CL': '🇨🇱',
        'US': '🇺🇸',
        'MX': '🇲🇽',
        'AR': '🇦🇷',
        'CO': '🇨🇴',
        'ES': '🇪🇸',
        'PE': '🇵🇪',
        'BR': '🇧🇷',
        'UY': '🇺🇾'
    };
    return flags[code] || '🌍';
}

// Variable global para setup only pricing
let setupOnlyPricing = [];

function renderPricingGrid() {
    const grid = document.getElementById('pricing-grid');
    
    if (!regionalPricing || regionalPricing.length === 0) {
        grid.innerHTML = '<p style="color:#888; text-align:center; padding:40px;">No hay precios configurados</p>';
        return;
    }
    
    grid.innerHTML = regionalPricing.map((p, idx) => {
        return `
        <div class="pricing-card" data-index="${idx}">
            <div class="pricing-header">
                <span class="pricing-flag">${p.flag || '🌍'}</span>
                <span class="pricing-country">${p.regionName || p.regionCode}</span>
                ${p.regionCode !== 'DEFAULT' ? `<button class="btn-delete" onclick="removeServiceCountry(${idx})" title="Eliminar">✕</button>` : ''}
            </div>
            <div class="pricing-body">
                <div style="padding:15px; background:linear-gradient(135deg, rgba(59,130,246,0.1), rgba(34,197,94,0.1)); border-radius:8px;">
                    <div style="font-size:12px; color:#888; margin-bottom:10px; text-align:center;">
                        🎓 SESIÓN SETUP + CLASE DE PRUEBA
                    </div>
                    <div style="font-size:11px; color:#666; margin-bottom:12px; text-align:center;">
                        30 minutos • Configuración técnica + Clase demo
                    </div>
                    <div style="display:flex; align-items:center; justify-content:center; gap:10px;">
                        <input type="number" value="${p.price}" 
                               onchange="updateServicePricing(${idx}, 'price', this.value)" 
                               style="width:80px; padding:10px; font-size:20px; font-weight:700; text-align:center; border-radius:8px; border:2px solid #333;" 
                               min="0" step="0.5">
                        <select onchange="updateServicePricing(${idx}, 'currency', this.value)" 
                                style="padding:10px; font-size:14px; border-radius:8px; background:#1a1a2e; color:white; border:2px solid #333;">
                            <option value="USD" ${p.currency === 'USD' ? 'selected' : ''}>USD</option>
                            <option value="EUR" ${p.currency === 'EUR' ? 'selected' : ''}>EUR</option>
                        </select>
                    </div>
                </div>
                <div style="margin-top:12px; padding:8px; background:rgba(255,255,255,0.03); border-radius:4px; font-size:10px; color:#666; text-align:center;">
                    💡 Precio del servicio sin productos físicos
                </div>
            </div>
        </div>
    `}).join('');
}

function updateServicePricing(index, field, value) {
    if (field === 'price') {
        regionalPricing[index].price = parseFloat(value) || 0;
    } else if (field === 'currency') {
        regionalPricing[index].currency = value;
    }
}

function removeServiceCountry(index) {
    if (confirm('¿Eliminar este país de la configuración?')) {
        regionalPricing.splice(index, 1);
        renderPricingGrid();
    }
}

function addNewServiceCountry() {
    const code = document.getElementById('new-country-code')?.value?.trim().toUpperCase();
    const name = document.getElementById('new-country-name')?.value?.trim();
    const price = parseFloat(document.getElementById('new-country-price')?.value) || 10;
    const currency = document.getElementById('new-country-currency')?.value || 'USD';
    
    if (!code || !name) {
        showNotification('⚠️ Completa código y nombre del país', 'error');
        return;
    }
    
    // Verificar que no exista ya
    if (regionalPricing.find(p => p.regionCode === code)) {
        showNotification(`⚠️ El código ${code} ya existe`, 'error');
        return;
    }
    
    regionalPricing.push({
        regionCode: code,
        regionName: name,
        flag: getCountryFlag(code),
        price,
        currency
    });
    
    // Limpiar inputs
    if (document.getElementById('new-country-code')) document.getElementById('new-country-code').value = '';
    if (document.getElementById('new-country-name')) document.getElementById('new-country-name').value = '';
    if (document.getElementById('new-country-price')) document.getElementById('new-country-price').value = '';
    
    renderPricingGrid();
    showNotification(`✅ País ${name} agregado`, 'success');
}

async function saveServicePricing() {
    try {
        // Convertir regionalPricing a formato setupOnly
        const setupOnlyData = regionalPricing.map(p => ({
            regionCode: p.regionCode,
            price: p.price,
            currency: p.currency,
            description: 'Setup técnico + Clase de prueba 30min'
        }));
        
        showNotification('Guardando...', 'info');
        
        const res = await fetch('/api/welcome-kit/admin/pricing', {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${userSession.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                setupOnlyPricing: setupOnlyData
            })
        });
        
        const data = await res.json();
        
        if (data.success) {
            showNotification('✅ Precios guardados correctamente', 'success');
        } else {
            showNotification(`❌ Error: ${data.error}`, 'error');
        }
    } catch (error) {
        console.error('Error saving service pricing:', error);
        showNotification('❌ Error al guardar', 'error');
    }
}

function addNewCountry() {
    const code = document.getElementById('new-country-code').value.toUpperCase().trim();
    const name = document.getElementById('new-country-name').value.trim();
    const price = parseFloat(document.getElementById('new-country-price').value);
    const currency = document.getElementById('new-country-currency').value;
    const days = document.getElementById('new-country-days').value.trim();
    const shipping = document.getElementById('new-country-shipping').value === 'true';
    
    if (!code || !name || !price) {
        showNotification('Código, nombre y precio son requeridos', 'error');
        return;
    }
    
    // Verificar que no exista
    if (regionalPricing.find(p => p.regionCode === code)) {
        showNotification('Este código de país ya existe', 'error');
        return;
    }
    
    const flags = { 'PE': '🇵🇪', 'CO': '🇨🇴', 'BR': '🇧🇷', 'UY': '🇺🇾', 'EC': '🇪🇨', 'BO': '🇧🇴', 'PY': '🇵🇾', 'VE': '🇻🇪', 'CR': '🇨🇷', 'PA': '🇵🇦', 'GT': '🇬🇹', 'HN': '🇭🇳', 'NI': '🇳🇮', 'SV': '🇸🇻', 'DO': '🇩🇴', 'CU': '🇨🇺', 'PR': '🇵🇷', 'UK': '🇬🇧', 'CA': '🇨🇦', 'FR': '🇫🇷', 'DE': '🇩🇪', 'IT': '🇮🇹', 'PT': '🇵🇹' };
    
    // Agregar precio kit completo
    regionalPricing.push({
        regionCode: code,
        regionName: name,
        flag: flags[code] || '🏳️',
        price: price,
        currency: currency,
        shippingDays: days || '7-15 días',
        includesShipping: shipping
    });
    
    // Agregar también precio setup only (50% del precio completo como default)
    setupOnlyPricing.push({
        regionCode: code,
        regionName: name,
        flag: flags[code] || '🏳️',
        price: Math.round(price * 0.5),
        currency: currency
    });
    
    // Limpiar form
    document.getElementById('new-country-code').value = '';
    document.getElementById('new-country-name').value = '';
    document.getElementById('new-country-price').value = '';
    document.getElementById('new-country-days').value = '';
    
    renderPricingGrid();
    showNotification(`País ${name} agregado`, 'success');
}

async function savePricing() {
    try {
        const res = await fetch('/api/welcome-kit/admin/pricing', {
            method: 'PUT',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${userSession.token}`
            },
            body: JSON.stringify({ 
                pricing: regionalPricing,
                setupOnlyPricing: setupOnlyPricing
            })
        });
        
        const data = await res.json();
        
        if (data.success) {
            showNotification('✅ Precios guardados correctamente', 'success');
        } else {
            showNotification(data.error || 'Error guardando precios', 'error');
        }
    } catch (error) {
        console.error('Error saving pricing:', error);
        showNotification('Error de conexión', 'error');
    }
}

// ==================== MENSAJES FUNDADORES ====================
let allFounderMessages = [];
let currentFounderFilter = 'all';

async function loadFounderMessages() {
    try {
        const res = await fetch('/admin/feedbacks');
        allFounderMessages = await res.json();
        
        // Actualizar badge de mensajes sin leer
        const unreadCount = allFounderMessages.filter(m => m.status === 'unread').length;
        const badge = document.getElementById('founder-messages-badge');
        if (badge) {
            badge.textContent = unreadCount;
            badge.style.display = unreadCount > 0 ? 'inline-block' : 'none';
        }
        
        // Actualizar stats
        document.getElementById('stat-messages-total').textContent = allFounderMessages.length;
        document.getElementById('stat-messages-unread').textContent = unreadCount;
        
        renderFounderMessages(allFounderMessages);
    } catch (e) {
        console.error('Error loading founder messages:', e);
        document.getElementById('founder-messages-table-body').innerHTML = 
            '<tr><td colspan="5" style="text-align:center; padding:40px; color:#ff4444;">Error al cargar mensajes</td></tr>';
    }
}

function renderFounderMessages(messages) {
    const tbody = document.getElementById('founder-messages-table-body');
    
    if (!messages || messages.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:40px; color:#666;">No hay mensajes de fundadores</td></tr>';
        return;
    }
    
    tbody.innerHTML = messages.map(msg => {
        const date = new Date(msg.createdAt).toLocaleString('es-CL', { 
            day: '2-digit', 
            month: 'short', 
            year: 'numeric',
            hour: '2-digit', 
            minute: '2-digit' 
        });
        
        const statusBadge = msg.status === 'unread' 
            ? '<span class="status-badge status-active">Nuevo</span>'
            : '<span class="status-badge">Leído</span>';
        
        const userName = msg.user ? msg.user.name : 'Usuario desconocido';
        const userEmail = msg.user ? msg.user.email : 'N/A';
        
        return `
            <tr class="${msg.status === 'unread' ? 'unread-message' : ''}">
                <td>
                    <strong style="color:#fff;">${userName}</strong>
                    <div style="font-size:11px; color:#666;">${userEmail}</div>
                </td>
                <td style="color:#aaa; max-width: 400px;">
                    <div style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                        ${msg.content}
                    </div>
                </td>
                <td style="color:#666; font-size: 12px;">${date}</td>
                <td>${statusBadge}</td>
                <td>
                    <div class="actions-menu">
                        <button class="actions-btn" onclick="toggleMessageMenu('${msg._id}')">⋮</button>
                        <div class="actions-dropdown" id="message-menu-${msg._id}">
                            <div class="action-item" onclick="viewMessageDetail('${msg._id}')">
                                <span>👁️</span> Ver completo
                            </div>
                            ${msg.user ? `
                            <div class="action-item" onclick="replyToFounder('${msg.user._id}', '${userName.replace(/'/g, "\\'")}')">
                                <span>↩️</span> Responder
                            </div>` : ''}
                            ${msg.status === 'unread' ? `
                            <div class="action-item" onclick="markAsRead('${msg._id}')">
                                <span>✓</span> Marcar leído
                            </div>` : ''}
                            <div class="action-item danger" onclick="deleteMessage('${msg._id}')">
                                <span>🗑️</span> Eliminar
                            </div>
                        </div>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function filterFounderMessages(filter) {
    currentFounderFilter = filter;
    document.querySelectorAll('#module-founder-messages .filter-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`#module-founder-messages [data-filter="${filter}"]`)?.classList.add('active');
    
    let filtered = allFounderMessages;
    if (filter === 'unread') {
        filtered = allFounderMessages.filter(m => m.status === 'unread');
    } else if (filter === 'read') {
        filtered = allFounderMessages.filter(m => m.status === 'read');
    }
    
    renderFounderMessages(filtered);
}

function toggleMessageMenu(messageId) {
    closeAllMenus();
    const menu = document.getElementById(`message-menu-${messageId}`);
    if (menu) menu.classList.toggle('show');
}

function viewMessageDetail(messageId) {
    const message = allFounderMessages.find(m => m._id === messageId);
    if (!message) return;
    
    const userName = message.user ? message.user.name : 'Usuario desconocido';
    const date = new Date(message.createdAt).toLocaleString('es-CL', { 
        day: '2-digit', 
        month: 'long', 
        year: 'numeric',
        hour: '2-digit', 
        minute: '2-digit' 
    });
    
    showNotification(
        `<strong>${userName}</strong><br>
        <span style="font-size:11px; color:#888;">${date}</span><br><br>
        ${message.content}`,
        'info',
        8000
    );
    
    closeAllMenus();
    
    // Si no estaba leído, marcarlo como leído
    if (message.status === 'unread') {
        markAsRead(messageId);
    }
}

async function markAsRead(messageId) {
    try {
        await fetch('/admin/feedbacks/mark-read', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: messageId })
        });
        
        showNotification('Mensaje marcado como leído', 'success');
        loadFounderMessages(); // Recargar
        closeAllMenus();
    } catch (error) {
        console.error('Error marking as read:', error);
        showNotification('Error al actualizar estado', 'error');
    }
}

async function markAllAsRead() {
    if (!confirm('¿Marcar todos los mensajes como leídos?')) return;
    
    try {
        await fetch('/admin/feedbacks/mark-read', {
            method: 'POST'
        });
        
        showNotification('Todos los mensajes marcados como leídos', 'success');
        loadFounderMessages(); // Recargar
    } catch (error) {
        console.error('Error marking all as read:', error);
        showNotification('Error al actualizar mensajes', 'error');
    }
}

function replyToFounder(userId, userName) {
    // Implementar modal de respuesta o redirigir a conversación
    showNotification(`Función de respuesta a ${userName} en desarrollo`, 'info');
    closeAllMenus();
}

async function deleteMessage(messageId) {
    const message = allFounderMessages.find(m => m._id === messageId);
    if (!message) return;
    
    const userName = message.user ? message.user.name : 'este mensaje';
    if (!confirm(`¿Eliminar mensaje de ${userName}?`)) return;
    
    try {
        const res = await fetch(`/admin/feedbacks/${messageId}`, {
            method: 'DELETE'
        });
        
        if (res.ok) {
            showNotification('Mensaje eliminado', 'success');
            loadFounderMessages(); // Recargar
        } else {
            throw new Error('Error en respuesta');
        }
        closeAllMenus();
    } catch (error) {
        console.error('Error deleting message:', error);
        showNotification('Error al eliminar mensaje', 'error');
    }
}

// ==================== ESTUDIANTES ====================
let allStudentsData = [];
let currentStudentFilter = 'all';
let currentStudentId = null;

async function loadStudents() {
    try {
        const res = await fetch('/api/auth/students');
        const students = await res.json();
        allStudentsData = students;
        
        // Calcular stats
        const total = students.length;
        const active = students.filter(s => s.subscription?.status === 'active').length;
        const pending = students.filter(s => s.subscription?.status === 'pending').length;
        const expired = students.filter(s => s.subscription?.status === 'expired').length;
        
        document.getElementById('stat-students-total').textContent = total;
        document.getElementById('stat-students-active').textContent = active;
        document.getElementById('stat-students-pending').textContent = pending;
        document.getElementById('stat-students-expired').textContent = expired;
        
        renderStudentsTable(students);
    } catch (error) {
        console.error('Error cargando estudiantes:', error);
        showNotification('Error cargando estudiantes', 'error');
    }
}

function renderStudentsTable(students) {
    const tbody = document.getElementById('students-table-body');
    
    if (!students || students.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:40px; color:#666;">No hay estudiantes registrados</td></tr>';
        return;
    }
    
    tbody.innerHTML = students.map(student => {
        const subStatus = student.subscription?.status || 'none';
        const statusBadge = getSubscriptionBadge(subStatus);
        const expiresAt = student.subscription?.expiresAt 
            ? new Date(student.subscription.expiresAt).toLocaleDateString('es-ES')
            : '-';
        
        return `
            <tr>
                <td>
                    <div style="font-weight:500; color:var(--text-primary);">${student.name}</div>
                </td>
                <td style="color:var(--text-secondary);">${student.email}</td>
                <td style="color:var(--text-secondary);">${student.teacher?.name || '<span style="color:#666;">Sin asignar</span>'}</td>
                <td>
                    ${student.room ? `<span style="background:var(--bg-dark); padding:3px 8px; border-radius:4px; font-size:12px;">${student.room.code || student.room.name}</span>` : '-'}
                </td>
                <td>${statusBadge}</td>
                <td style="color:var(--text-muted); font-size:13px;">${expiresAt}</td>
                <td>
                    <div class="action-menu">
                        <button class="action-btn" onclick="toggleActionMenu(this)">⋮</button>
                        <div class="action-dropdown">
                            <div onclick="viewStudentDetails('${student._id}')">👁️ Ver detalles</div>
                            <div onclick="editStudent('${student._id}')">✏️ Editar</div>
                            <div onclick="openAssignTeacherModal('${student._id}')">👨‍🏫 Asignar profesor</div>
                            <div onclick="messageStudent('${student._id}')">✉️ Mensaje</div>
                            <div onclick="deleteStudent('${student._id}')" style="color:#ff5252;">🗑️ Eliminar</div>
                        </div>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function getSubscriptionBadge(status) {
    const badges = {
        'active': '<span class="status-badge status-converted">✅ Activa</span>',
        'pending': '<span class="status-badge status-contacted">⏳ Pendiente</span>',
        'expired': '<span class="status-badge status-lost">⚠️ Expirada</span>',
        'cancelled': '<span class="status-badge status-lost">❌ Cancelada</span>',
        'none': '<span class="status-badge" style="background:rgba(100,100,100,0.2); color:#999;">Sin suscripción</span>'
    };
    return badges[status] || badges['none'];
}

function filterStudents(filter) {
    currentStudentFilter = filter;
    
    // Update buttons
    document.querySelectorAll('#module-students .filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === filter);
    });
    
    let filtered = [...allStudentsData];
    
    switch(filter) {
        case 'active':
            filtered = filtered.filter(s => s.subscription?.status === 'active');
            break;
        case 'pending':
            filtered = filtered.filter(s => s.subscription?.status === 'pending');
            break;
        case 'expired':
            filtered = filtered.filter(s => s.subscription?.status === 'expired');
            break;
        case 'no-subscription':
            filtered = filtered.filter(s => !s.subscription);
            break;
    }
    
    renderStudentsTable(filtered);
}

function searchStudents() {
    const query = document.getElementById('search-students').value.toLowerCase();
    
    let filtered = allStudentsData.filter(s => 
        s.name.toLowerCase().includes(query) || 
        s.email.toLowerCase().includes(query) ||
        (s.teacher?.name || '').toLowerCase().includes(query)
    );
    
    // Apply current filter too
    if (currentStudentFilter !== 'all') {
        switch(currentStudentFilter) {
            case 'active':
                filtered = filtered.filter(s => s.subscription?.status === 'active');
                break;
            case 'pending':
                filtered = filtered.filter(s => s.subscription?.status === 'pending');
                break;
            case 'expired':
                filtered = filtered.filter(s => s.subscription?.status === 'expired');
                break;
            case 'no-subscription':
                filtered = filtered.filter(s => !s.subscription);
                break;
        }
    }
    
    renderStudentsTable(filtered);
}

async function openCreateStudentModal() {
    // Redirigir a crear desde Clientes
    showNotification('Para crear estudiantes, usa la sección Clientes', 'info');
    switchModule('clients');
    setTimeout(() => openCreateClientModal(), 300);
}

async function loadTeachersDropdown(selectId) {
    try {
        const res = await fetch('/api/auth/teachers');
        const teachers = await res.json();
        
        const select = document.getElementById(selectId);
        select.innerHTML = '<option value="">Sin asignar</option>';
        
        teachers.forEach(t => {
            select.innerHTML += `<option value="${t._id}">${t.name} (${t.email})</option>`;
        });
    } catch (e) {
        console.error('Error loading teachers:', e);
    }
}

async function createStudent(event) {
    event.preventDefault();
    
    const name = document.getElementById('student-name').value.trim();
    const email = document.getElementById('student-email').value.trim();
    const password = document.getElementById('student-password').value;
    const teacherId = document.getElementById('student-teacher').value;
    
    if (!name || !email) {
        showNotification('Nombre y email requeridos', 'error');
        return;
    }
    
    try {
        if (currentStudentId) {
            // Update existing
            const res = await fetch(`/admin/users/${currentStudentId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    name, 
                    email,
                    ...(password && { password })
                })
            });
            
            if (res.ok) {
                closeModal('create-student-modal');
                loadStudents();
                showNotification('Estudiante actualizado', 'success');
            } else {
                const data = await res.json();
                showNotification(data.message || 'Error actualizando', 'error');
            }
        } else {
            // Create new
            if (!password || password.length < 6) {
                showNotification('La contraseña debe tener al menos 6 caracteres', 'error');
                return;
            }
            
            const res = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, email, password, role: 'student' })
            });
            
            if (res.ok) {
                closeModal('create-student-modal');
                loadStudents();
                showNotification('Estudiante creado exitosamente', 'success');
            } else {
                const data = await res.json();
                showNotification(data.message || 'Error creando', 'error');
            }
        }
    } catch (e) {
        console.error('Error:', e);
        showNotification('Error de conexión', 'error');
    }
}

function editStudent(studentId) {
    const student = allStudentsData.find(s => s._id === studentId);
    if (!student) return;
    
    currentStudentId = studentId;
    document.getElementById('student-modal-title').textContent = '✏️ Editar Estudiante';
    document.getElementById('student-name').value = student.name;
    document.getElementById('student-email').value = student.email;
    document.getElementById('student-password').value = '';
    document.getElementById('student-password').placeholder = 'Dejar vacío para mantener';
    
    // Load teachers and set current
    loadTeachersDropdown('student-teacher').then(() => {
        if (student.teacher?._id) {
            document.getElementById('student-teacher').value = student.teacher._id;
        }
    });
    
    openModal('create-student-modal');
}

function viewStudentDetails(studentId) {
    const student = allStudentsData.find(s => s._id === studentId);
    if (!student) return;
    
    document.getElementById('view-student-name').textContent = student.name;
    document.getElementById('view-student-email').textContent = student.email;
    document.getElementById('view-student-teacher').textContent = student.teacher?.name || 'Sin asignar';
    document.getElementById('view-student-room').textContent = student.room?.code || student.room?.name || 'Sin sala';
    document.getElementById('view-student-created').textContent = new Date(student.createdAt).toLocaleDateString('es-ES');
    
    // Subscription details
    const subEl = document.getElementById('view-student-subscription');
    if (student.subscription) {
        const sub = student.subscription;
        subEl.innerHTML = `
            <div style="display:grid; gap:8px;">
                <div style="display:flex; justify-content:space-between;">
                    <span>Estado:</span>
                    ${getSubscriptionBadge(sub.status)}
                </div>
                <div style="display:flex; justify-content:space-between;">
                    <span style="color:var(--text-muted);">Monto:</span>
                    <span>${sub.amount} ${sub.currency}</span>
                </div>
                <div style="display:flex; justify-content:space-between;">
                    <span style="color:var(--text-muted);">Expira:</span>
                    <span>${new Date(sub.expiresAt).toLocaleDateString('es-ES')}</span>
                </div>
                <div style="display:flex; justify-content:space-between;">
                    <span style="color:var(--text-muted);">Proveedor:</span>
                    <span style="text-transform:capitalize;">${sub.paymentProvider}</span>
                </div>
            </div>
        `;
    } else {
        subEl.innerHTML = '<span style="color:#999;">Sin suscripción activa</span>';
    }
    
    openModal('view-student-modal');
}

async function openAssignTeacherModal(studentId) {
    const student = allStudentsData.find(s => s._id === studentId);
    if (!student) return;
    
    currentStudentId = studentId;
    document.getElementById('assign-student-name').textContent = student.name;
    
    await loadTeachersDropdown('assign-teacher-select');
    if (student.teacher?._id) {
        document.getElementById('assign-teacher-select').value = student.teacher._id;
    }
    
    openModal('assign-teacher-modal');
}

async function assignTeacherToStudent() {
    const teacherId = document.getElementById('assign-teacher-select').value;
    
    if (!teacherId) {
        showNotification('Selecciona un profesor', 'error');
        return;
    }
    
    // Note: This would need a backend endpoint to create/update enrollment
    // For now, show a message
    showNotification('Funcionalidad de asignación próximamente', 'info');
    closeModal('assign-teacher-modal');
}

function messageStudent(studentId) {
    const student = allStudentsData.find(s => s._id === studentId);
    if (!student) return;
    
    currentStudentId = studentId;
    document.getElementById('student-message-recipient').textContent = student.name;
    document.getElementById('student-message-content').value = '';
    openModal('student-message-modal');
}

async function sendStudentMessage() {
    const content = document.getElementById('student-message-content').value.trim();
    
    if (!content) {
        showNotification('Escribe un mensaje', 'error');
        return;
    }
    
    try {
        const res = await fetch('/admin/message/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ recipientId: currentStudentId, content })
        });
        
        if (res.ok) {
            closeModal('student-message-modal');
            showNotification('Mensaje enviado', 'success');
        } else {
            showNotification('Error enviando', 'error');
        }
    } catch (e) {
        console.error('Error:', e);
        showNotification('Error de conexión', 'error');
    }
}

async function deleteStudent(studentId) {
    const student = allStudentsData.find(s => s._id === studentId);
    if (!student) return;
    
    if (!confirm(`¿Eliminar a ${student.name}? Esta acción no se puede deshacer.`)) return;
    
    try {
        const res = await fetch(`/api/auth/delete/${studentId}`, { method: 'DELETE' });
        
        if (res.ok) {
            loadStudents();
            showNotification('Estudiante eliminado', 'success');
        } else {
            showNotification('Error eliminando', 'error');
        }
    } catch (e) {
        console.error('Error:', e);
        showNotification('Error de conexión', 'error');
    }
}

// ==================== PAGOS ====================
let allPaymentsData = [];
let allSubscriptionsData = [];
let allProductsData = [];
let allWebhooksData = [];
let currentSubscriptionId = null;
let currentProductId = null;

async function loadPaymentsDashboard() {
    try {
        // Load dashboard stats
        const dashRes = await fetch('/api/admin/payments/dashboard', {
            headers: { 'Authorization': 'Bearer admin' }
        });
        
        if (dashRes.ok) {
            const data = await dashRes.json();
            const dash = data.dashboard;
            
            document.getElementById('stat-revenue-month').textContent = `$${(dash.thisMonth?.revenue || 0).toFixed(2)}`;
            document.getElementById('stat-transactions-month').textContent = dash.thisMonth?.transactions || 0;
            document.getElementById('stat-active-subs').textContent = dash.activeSubscriptions || 0;
        }
        
        // Load products count
        const prodRes = await fetch('/api/admin/payments/products', {
            headers: { 'Authorization': 'Bearer admin' }
        });
        
        if (prodRes.ok) {
            const prodData = await prodRes.json();
            document.getElementById('stat-products-count').textContent = prodData.products?.length || 0;
        }
        
        // Load initial tab data
        loadPayments();
    } catch (error) {
        console.error('Error loading payments dashboard:', error);
    }
}

function switchPaymentTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('[data-tab-group="payments"] .tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    
    // Update tab content
    document.querySelectorAll('[data-tab-group="payments"] .tab-content').forEach(content => {
        content.classList.toggle('active', content.id === `tab-${tabName}`);
    });
    
    // Load tab data
    switch(tabName) {
        case 'transactions': loadPayments(); break;
        case 'subscriptions': loadSubscriptions(); break;
        case 'products': loadProducts(); break;
        case 'webhooks': loadWebhooks(); break;
    }
}

// ==================== TRANSACTIONS ====================
async function loadPayments() {
    try {
        const status = document.getElementById('filter-payment-status')?.value || '';
        const provider = document.getElementById('filter-payment-provider')?.value || '';
        
        let url = '/api/admin/payments/payments?limit=50';
        if (status) url += `&status=${status}`;
        if (provider) url += `&provider=${provider}`;
        
        const res = await fetch(url, {
            headers: { 'Authorization': 'Bearer admin' }
        });
        
        if (res.ok) {
            const data = await res.json();
            allPaymentsData = data.payments || [];
            renderPaymentsTable(allPaymentsData);
        }
    } catch (error) {
        console.error('Error loading payments:', error);
    }
}

function filterPayments() {
    loadPayments();
}

function renderPaymentsTable(payments) {
    const tbody = document.getElementById('payments-table-body');
    
    if (!payments || payments.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:40px; color:#666;">No hay transacciones</td></tr>';
        return;
    }
    
    tbody.innerHTML = payments.map(p => {
        const statusBadge = getPaymentStatusBadge(p.status);
        const date = new Date(p.createdAt).toLocaleDateString('es-ES', { 
            day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' 
        });
        
        return `
            <tr>
                <td style="color:var(--text-muted); font-size:13px;">${date}</td>
                <td>
                    <div style="font-weight:500; color:var(--text-primary);">${p.studentId?.name || 'N/A'}</div>
                    <div style="font-size:11px; color:var(--text-muted);">${p.studentId?.email || ''}</div>
                </td>
                <td style="color:var(--text-secondary);">${p.teacherId?.name || '-'}</td>
                <td style="font-weight:bold; color:var(--accent-orange);">$${p.amount?.toFixed(2) || '0.00'}</td>
                <td>
                    <span style="text-transform:capitalize; background:var(--bg-dark); padding:3px 8px; border-radius:4px; font-size:12px;">
                        ${p.provider || 'N/A'}
                    </span>
                </td>
                <td>${statusBadge}</td>
            </tr>
        `;
    }).join('');
}

function getPaymentStatusBadge(status) {
    const badges = {
        'approved': '<span class="status-badge status-converted">✅ Aprobado</span>',
        'pending': '<span class="status-badge status-contacted">⏳ Pendiente</span>',
        'rejected': '<span class="status-badge status-lost">❌ Rechazado</span>',
        'refunded': '<span class="status-badge" style="background:rgba(156,39,176,0.2);color:#ce93d8;">↩️ Reembolsado</span>'
    };
    return badges[status] || '<span class="status-badge">-</span>';
}

// ==================== SUBSCRIPTIONS ====================
async function loadSubscriptions() {
    try {
        const status = document.getElementById('filter-sub-status')?.value || '';
        
        let url = '/api/admin/payments/subscriptions?limit=50';
        if (status) url += `&status=${status}`;
        
        const res = await fetch(url, {
            headers: { 'Authorization': 'Bearer admin' }
        });
        
        if (res.ok) {
            const data = await res.json();
            allSubscriptionsData = data.subscriptions || [];
            renderSubscriptionsTable(allSubscriptionsData);
        }
    } catch (error) {
        console.error('Error loading subscriptions:', error);
    }
}

function filterSubscriptions() {
    loadSubscriptions();
}

function renderSubscriptionsTable(subscriptions) {
    const tbody = document.getElementById('subscriptions-table-body');
    
    if (!subscriptions || subscriptions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:40px; color:#666;">No hay suscripciones</td></tr>';
        return;
    }
    
    tbody.innerHTML = subscriptions.map(s => {
        const statusBadge = getSubscriptionBadge(s.status);
        const expiresAt = s.expiresAt ? new Date(s.expiresAt).toLocaleDateString('es-ES') : '-';
        const isExpired = s.expiresAt && new Date(s.expiresAt) < new Date();
        
        return `
            <tr>
                <td>
                    <div style="font-weight:500; color:var(--text-primary);">${s.studentId?.name || 'N/A'}</div>
                    <div style="font-size:11px; color:var(--text-muted);">${s.studentId?.email || ''}</div>
                </td>
                <td style="color:var(--text-secondary);">${s.teacherId?.name || '-'}</td>
                <td style="font-weight:bold; color:var(--accent-orange);">$${s.amount?.toFixed(2) || '0.00'} ${s.currency || ''}</td>
                <td>
                    <span style="text-transform:capitalize; background:var(--bg-dark); padding:3px 8px; border-radius:4px; font-size:12px;">
                        ${s.paymentProvider || 'N/A'}
                    </span>
                </td>
                <td>${statusBadge}</td>
                <td style="color:${isExpired ? '#ff5252' : 'var(--text-muted)'}; font-size:13px;">${expiresAt}</td>
                <td>
                    ${s.status === 'active' ? `
                        <button class="btn btn-small" style="background:rgba(255,82,82,0.2); color:#ff5252; padding:5px 10px; font-size:11px;" onclick="openCancelSubscriptionModal('${s._id}')">
                            Cancelar
                        </button>
                    ` : '-'}
                </td>
            </tr>
        `;
    }).join('');
}

function openCancelSubscriptionModal(subId) {
    const sub = allSubscriptionsData.find(s => s._id === subId);
    if (!sub) return;
    
    currentSubscriptionId = subId;
    document.getElementById('cancel-sub-student').textContent = sub.studentId?.name || 'N/A';
    document.getElementById('cancel-reason').value = '';
    openModal('cancel-subscription-modal');
}

async function confirmCancelSubscription() {
    if (!currentSubscriptionId) return;
    
    const reason = document.getElementById('cancel-reason').value.trim();
    
    try {
        const res = await fetch(`/api/admin/payments/subscriptions/${currentSubscriptionId}/cancel`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': 'Bearer admin'
            },
            body: JSON.stringify({ reason })
        });
        
        if (res.ok) {
            closeModal('cancel-subscription-modal');
            loadSubscriptions();
            showNotification('Suscripción cancelada', 'success');
        } else {
            showNotification('Error cancelando suscripción', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showNotification('Error de conexión', 'error');
    }
}

// ==================== PRODUCTS ====================
async function loadProducts() {
    try {
        const res = await fetch('/api/admin/payments/products', {
            headers: { 'Authorization': 'Bearer admin' }
        });
        
        if (res.ok) {
            const data = await res.json();
            allProductsData = data.products || [];
            renderProductsGrid(allProductsData);
        }
    } catch (error) {
        console.error('Error loading products:', error);
    }
}

function filterProducts() {
    const type = document.getElementById('filter-product-type')?.value || '';
    let filtered = [...allProductsData];
    
    if (type) {
        filtered = filtered.filter(p => p.type === type);
    }
    
    renderProductsGrid(filtered);
}

function renderProductsGrid(products) {
    const grid = document.getElementById('products-grid');
    
    if (!products || products.length === 0) {
        grid.innerHTML = '<div style="text-align:center; padding:40px; color:#666; grid-column:1/-1;">No hay productos configurados</div>';
        return;
    }
    
    grid.innerHTML = products.map(p => {
        const typeBadge = p.type === 'subscription' 
            ? '<span class="product-type-badge subscription">Suscripción</span>'
            : '<span class="product-type-badge one-time">Pago único</span>';
        
        const interval = p.type === 'subscription' 
            ? `/${p.billingIntervalCount > 1 ? p.billingIntervalCount : ''} ${p.billingInterval === 'month' ? 'mes' : p.billingInterval === 'year' ? 'año' : 'semana'}` 
            : '';
        
        return `
            <div class="product-card ${p.isActive ? '' : 'inactive'}">
                <div class="product-header">
                    <div class="product-name">${p.name}</div>
                    ${typeBadge}
                </div>
                <div class="product-price">
                    $${p.price?.toFixed(2) || '0.00'} <small>${p.currency || 'USD'}${interval}</small>
                </div>
                <div class="product-meta">
                    <div>👤 Para: <strong>${p.targetRole === 'teacher' ? 'Profesores' : 'Estudiantes'}</strong></div>
                    <div>🔗 Slug: <code style="background:var(--bg-dark); padding:2px 6px; border-radius:3px;">${p.slug}</code></div>
                    ${p.paypalProductId ? '<div style="color:#4fc3f7;">✓ Sincronizado con PayPal</div>' : ''}
                </div>
                <div class="product-stats">
                    <div class="product-stat">
                        <div class="product-stat-value">${p.stats?.totalSales || 0}</div>
                        <div class="product-stat-label">Ventas</div>
                    </div>
                    <div class="product-stat">
                        <div class="product-stat-value">$${(p.stats?.totalRevenue || 0).toFixed(0)}</div>
                        <div class="product-stat-label">Ingresos</div>
                    </div>
                </div>
                <div class="product-actions">
                    <button class="btn btn-secondary" onclick="toggleProductStatus('${p._id}')">
                        ${p.isActive ? '⏸️ Pausar' : '▶️ Activar'}
                    </button>
                    <button class="btn btn-secondary" onclick="editProduct('${p._id}')">✏️ Editar</button>
                </div>
            </div>
        `;
    }).join('');
}

function openCreateProductModal() {
    currentProductId = null;
    document.getElementById('product-modal-title').textContent = '➕ Nuevo Producto';
    document.getElementById('product-name').value = '';
    document.getElementById('product-slug').value = '';
    document.getElementById('product-description').value = '';
    document.getElementById('product-type').value = 'subscription';
    document.getElementById('product-target').value = 'student';
    document.getElementById('product-price').value = '';
    document.getElementById('product-currency').value = 'USD';
    document.getElementById('product-billing-interval').value = 'month';
    document.getElementById('product-billing-count').value = '1';
    document.getElementById('product-create-paypal').checked = true;
    document.getElementById('billing-interval-group').style.display = 'grid';
    openModal('create-product-modal');
}

// Show/hide billing interval based on product type
document.getElementById('product-type')?.addEventListener('change', function() {
    document.getElementById('billing-interval-group').style.display = 
        this.value === 'subscription' ? 'grid' : 'none';
});

async function createProduct(event) {
    event.preventDefault();
    
    const productData = {
        name: document.getElementById('product-name').value.trim(),
        slug: document.getElementById('product-slug').value.trim(),
        description: document.getElementById('product-description').value.trim(),
        type: document.getElementById('product-type').value,
        targetRole: document.getElementById('product-target').value,
        price: parseFloat(document.getElementById('product-price').value),
        currency: document.getElementById('product-currency').value,
        billingInterval: document.getElementById('product-billing-interval').value,
        billingIntervalCount: parseInt(document.getElementById('product-billing-count').value) || 1,
        createInPayPal: document.getElementById('product-create-paypal').checked
    };
    
    if (!productData.name || !productData.slug || !productData.price) {
        showNotification('Completa todos los campos requeridos', 'error');
        return;
    }
    
    try {
        const res = await fetch('/api/admin/payments/products', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': 'Bearer admin'
            },
            body: JSON.stringify(productData)
        });
        
        const data = await res.json();
        
        if (res.ok && data.success) {
            closeModal('create-product-modal');
            loadProducts();
            showNotification('Producto creado exitosamente', 'success');
        } else {
            showNotification(data.error || 'Error creando producto', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showNotification('Error de conexión', 'error');
    }
}

function editProduct(productId) {
    const product = allProductsData.find(p => p._id === productId);
    if (!product) return;
    
    currentProductId = productId;
    document.getElementById('product-modal-title').textContent = '✏️ Editar Producto';
    document.getElementById('product-name').value = product.name || '';
    document.getElementById('product-slug').value = product.slug || '';
    document.getElementById('product-description').value = product.description || '';
    document.getElementById('product-type').value = product.type || 'subscription';
    document.getElementById('product-target').value = product.targetRole || 'student';
    document.getElementById('product-price').value = product.price || '';
    document.getElementById('product-currency').value = product.currency || 'USD';
    document.getElementById('product-billing-interval').value = product.billingInterval || 'month';
    document.getElementById('product-billing-count').value = product.billingIntervalCount || 1;
    document.getElementById('product-create-paypal').checked = false;
    document.getElementById('billing-interval-group').style.display = 
        product.type === 'subscription' ? 'grid' : 'none';
    
    openModal('create-product-modal');
}

async function toggleProductStatus(productId) {
    // This would need a backend endpoint to toggle product status
    showNotification('Funcionalidad próximamente', 'info');
}

// ==================== WEBHOOKS ====================
async function loadWebhooks() {
    try {
        const provider = document.getElementById('filter-webhook-provider')?.value || '';
        
        let url = '/api/admin/payments/webhooks?limit=50';
        if (provider) url += `&provider=${provider}`;
        
        const res = await fetch(url, {
            headers: { 'Authorization': 'Bearer admin' }
        });
        
        if (res.ok) {
            const data = await res.json();
            allWebhooksData = data.webhooks || [];
            renderWebhooksTable(allWebhooksData);
        }
    } catch (error) {
        console.error('Error loading webhooks:', error);
    }
}

function filterWebhooks() {
    loadWebhooks();
}

function renderWebhooksTable(webhooks) {
    const tbody = document.getElementById('webhooks-table-body');
    
    if (!webhooks || webhooks.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:40px; color:#666;">No hay webhooks registrados</td></tr>';
        return;
    }
    
    tbody.innerHTML = webhooks.map(w => {
        const date = new Date(w.createdAt).toLocaleDateString('es-ES', { 
            day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' 
        });
        
        const signatureBadge = w.signatureValid 
            ? '<span style="color:#81c784;">✅ Válida</span>'
            : '<span style="color:#ff5252;">❌ Inválida</span>';
        
        const resultBadge = w.processingResult === 'success'
            ? '<span class="status-badge status-converted">✅ Éxito</span>'
            : w.processingResult === 'error'
            ? '<span class="status-badge status-lost">❌ Error</span>'
            : '<span class="status-badge status-contacted">⏳ Pendiente</span>';
        
        return `
            <tr>
                <td style="color:var(--text-muted); font-size:13px;">${date}</td>
                <td>
                    <span style="text-transform:capitalize; background:var(--bg-dark); padding:3px 8px; border-radius:4px; font-size:12px;">
                        ${w.provider || 'N/A'}
                    </span>
                </td>
                <td style="color:var(--text-secondary); font-family:monospace; font-size:12px;">${w.eventType || '-'}</td>
                <td>${signatureBadge}</td>
                <td>${resultBadge}</td>
            </tr>
        `;
    }).join('');
}

// ==================== UTILIDADES ====================
function openModal(modalId) {
    document.getElementById(modalId)?.classList.add('active');
}

function closeModal(modalId) {
    document.getElementById(modalId)?.classList.remove('active');
    currentLeadId = null;
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

function logout() {
    localStorage.removeItem('pianoUser');
    window.location.href = 'login.html';
}

// ==================== KIT PRODUCTS ====================

async function loadKitProducts() {
    const grid = document.getElementById('kit-products-grid');
    if (!grid) return;
    
    try {
        grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:40px; color:#666;">Cargando...</div>';
        
        const res = await fetch('/api/kit-products/admin/all', {
            headers: { 'Authorization': `Bearer ${userSession.token}` }
        });
        const data = await res.json();
        
        if (data.success) {
            kitProducts = data.products || [];
            renderKitProducts();
        } else {
            grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:40px; color:#ef4444;">Error: ${data.error}</div>`;
        }
    } catch (err) {
        console.error('Error loading kit products:', err);
        grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:40px; color:#ef4444;">Error al cargar productos</div>';
    }
}

function renderKitProducts() {
    const grid = document.getElementById('kit-products-grid');
    if (!grid) return;
    
    let filtered = kitProducts;
    if (currentProductFilter !== 'all') {
        filtered = kitProducts.filter(p => p.category === currentProductFilter);
    }
    
    if (filtered.length === 0) {
        grid.innerHTML = `
            <div style="grid-column:1/-1; text-align:center; padding:60px; color:#666;">
                <div style="font-size:48px; margin-bottom:15px;">📦</div>
                <div style="font-size:16px; margin-bottom:10px;">No hay productos</div>
                <div style="font-size:13px;">Haz clic en "Cargar Ejemplos" para agregar productos de muestra<br>o "Nuevo Producto" para crear uno.</div>
            </div>
        `;
        return;
    }
    
    grid.innerHTML = filtered.map(product => {
        const categoryIcons = {
            keyboard: '🎹',
            stand: '🪜',
            pedal: '🦶',
            cable: '🔌',
            accessory: '🎧',
            bundle: '📦'
        };
        const categoryNames = {
            keyboard: 'Teclado',
            stand: 'Soporte',
            pedal: 'Pedal',
            cable: 'Cable',
            accessory: 'Accesorio',
            bundle: 'Bundle'
        };
        
        const icon = categoryIcons[product.category] || '📦';
        const categoryName = categoryNames[product.category] || product.category;
        const imageUrl = product.images?.[0]?.url || '';
        const costPrice = product.fulfillment?.costPrice || 0;
        const margin = product.defaultPrice - costPrice;
        const marginPercent = costPrice > 0 ? Math.round((margin / product.defaultPrice) * 100) : 0;
        
        return `
            <div class="product-card ${!product.isActive ? 'inactive' : ''}" data-id="${product._id}">
                <div class="product-card-image">
                    ${imageUrl 
                        ? `<img src="${imageUrl}" alt="${product.name}" onerror="this.parentElement.innerHTML='${icon}'">`
                        : icon
                    }
                    <div class="product-card-badges">
                        ${product.isFeatured ? '<span class="product-badge featured">⭐ Destacado</span>' : ''}
                        ${!product.isActive ? '<span class="product-badge inactive">Inactivo</span>' : ''}
                    </div>
                </div>
                <div class="product-card-body">
                    <div class="product-card-category">${icon} ${categoryName}</div>
                    <div class="product-card-title">${product.name}</div>
                    <div class="product-card-desc">${product.shortDescription || product.description || ''}</div>
                    <div class="product-card-price">
                        $${product.defaultPrice} USD
                        ${costPrice > 0 ? `<span class="cost">Costo: $${costPrice} (${marginPercent}% margen)</span>` : ''}
                    </div>
                    <div class="product-card-actions">
                        <button class="btn-edit" onclick="editKitProduct('${product._id}')">✏️ Editar</button>
                        <button class="btn-toggle" onclick="toggleKitProduct('${product._id}')">${product.isActive ? '⏸️' : '▶️'}</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function filterKitProducts(category) {
    currentProductFilter = category;
    
    // Update filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.category === category);
    });
    
    renderKitProducts();
}

function openProductModal(productId = null) {
    const modal = document.getElementById('kit-product-modal');
    const title = document.getElementById('kit-product-modal-title');
    const form = document.getElementById('kit-product-form');
    
    // Reset form
    form.reset();
    document.getElementById('kit-product-id').value = '';
    document.getElementById('kit-product-active').checked = true;
    document.getElementById('keyboard-specs').style.display = 'none';
    
    if (productId) {
        title.textContent = '✏️ Editar Producto';
        const product = kitProducts.find(p => p._id === productId);
        if (product) {
            fillProductForm(product);
        }
    } else {
        title.textContent = '➕ Nuevo Producto';
    }
    
    modal.classList.add('active');
    
    // Listen for category change to show/hide keyboard specs
    document.getElementById('kit-product-category').addEventListener('change', function() {
        document.getElementById('keyboard-specs').style.display = 
            this.value === 'keyboard' ? 'block' : 'none';
    });
}

function fillProductForm(product) {
    document.getElementById('kit-product-id').value = product._id;
    document.getElementById('kit-product-name').value = product.name || '';
    document.getElementById('kit-product-category').value = product.category || '';
    document.getElementById('kit-product-short-desc').value = product.shortDescription || '';
    document.getElementById('kit-product-description').value = product.description || '';
    document.getElementById('kit-product-default-price').value = product.defaultPrice || '';
    document.getElementById('kit-product-cost').value = product.fulfillment?.costPrice || '';
    document.getElementById('kit-product-weight').value = product.fulfillment?.weight || '';
    document.getElementById('kit-product-provider').value = product.fulfillment?.provider || 'cjdropshipping';
    document.getElementById('kit-product-sku').value = product.fulfillment?.cjSku || product.fulfillment?.affiliateUrl || '';
    document.getElementById('kit-product-image').value = product.images?.[0]?.url || '';
    document.getElementById('kit-product-tags').value = (product.tags || []).join(', ');
    document.getElementById('kit-product-active').checked = product.isActive;
    document.getElementById('kit-product-featured').checked = product.isFeatured;
    
    // Keyboard specs
    if (product.category === 'keyboard') {
        document.getElementById('keyboard-specs').style.display = 'block';
        document.getElementById('kit-product-brand').value = product.specs?.brand || '';
        document.getElementById('kit-product-model').value = product.specs?.model || '';
        document.getElementById('kit-product-keys').value = product.specs?.keys || '';
        document.getElementById('kit-product-sounds').value = product.specs?.sounds || '';
        document.getElementById('kit-product-weighted').checked = product.specs?.weighted || false;
        document.getElementById('kit-product-touch-sensitive').checked = product.specs?.touchSensitive || false;
    }
}

function editKitProduct(productId) {
    openProductModal(productId);
}

async function saveKitProduct(event) {
    event.preventDefault();
    
    const productId = document.getElementById('kit-product-id').value;
    const category = document.getElementById('kit-product-category').value;
    
    const productData = {
        name: document.getElementById('kit-product-name').value.trim(),
        category: category,
        shortDescription: document.getElementById('kit-product-short-desc').value.trim(),
        description: document.getElementById('kit-product-description').value.trim(),
        defaultPrice: parseFloat(document.getElementById('kit-product-default-price').value) || 0,
        fulfillment: {
            provider: document.getElementById('kit-product-provider').value,
            costPrice: parseFloat(document.getElementById('kit-product-cost').value) || 0,
            weight: parseFloat(document.getElementById('kit-product-weight').value) || 0
        },
        isActive: document.getElementById('kit-product-active').checked,
        isFeatured: document.getElementById('kit-product-featured').checked,
        tags: document.getElementById('kit-product-tags').value.split(',').map(t => t.trim()).filter(Boolean)
    };
    
    // SKU or affiliate URL
    const skuValue = document.getElementById('kit-product-sku').value.trim();
    if (productData.fulfillment.provider === 'affiliate') {
        productData.fulfillment.affiliateUrl = skuValue;
    } else {
        productData.fulfillment.cjSku = skuValue;
    }
    
    // Image
    const imageUrl = document.getElementById('kit-product-image').value.trim();
    if (imageUrl) {
        productData.images = [{ url: imageUrl, isPrimary: true }];
    }
    
    // Keyboard specs
    if (category === 'keyboard') {
        productData.specs = {
            brand: document.getElementById('kit-product-brand').value.trim(),
            model: document.getElementById('kit-product-model').value.trim(),
            keys: parseInt(document.getElementById('kit-product-keys').value) || null,
            sounds: parseInt(document.getElementById('kit-product-sounds').value) || null,
            weighted: document.getElementById('kit-product-weighted').checked,
            touchSensitive: document.getElementById('kit-product-touch-sensitive').checked
        };
    }
    
    try {
        showNotification('Guardando...', 'info');
        
        const url = productId 
            ? `/api/kit-products/admin/${productId}` 
            : '/api/kit-products/admin';
        const method = productId ? 'PUT' : 'POST';
        
        const res = await fetch(url, {
            method,
            headers: {
                'Authorization': `Bearer ${userSession.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(productData)
        });
        const data = await res.json();
        
        if (data.success) {
            showNotification(productId ? '✅ Producto actualizado' : '✅ Producto creado', 'success');
            closeModal('kit-product-modal');
            loadKitProducts();
        } else {
            showNotification(`Error: ${data.error}`, 'error');
        }
    } catch (err) {
        console.error('Error saving product:', err);
        showNotification('Error al guardar', 'error');
    }
}

async function toggleKitProduct(productId) {
    try {
        const res = await fetch(`/api/kit-products/admin/${productId}/toggle`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${userSession.token}` }
        });
        const data = await res.json();
        
        if (data.success) {
            showNotification(data.message, 'success');
            loadKitProducts();
        } else {
            showNotification(`Error: ${data.error}`, 'error');
        }
    } catch (err) {
        console.error('Error toggling product:', err);
        showNotification('Error al cambiar estado', 'error');
    }
}

async function seedKitProducts() {
    if (!confirm('¿Cargar productos de ejemplo? (Yamaha PSR-E373, P-45, soportes, pedales, etc.)')) {
        return;
    }
    
    try {
        showNotification('Cargando productos de ejemplo...', 'info');
        
        const res = await fetch('/api/kit-products/admin/seed', {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${userSession.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ force: false })
        });
        const data = await res.json();
        
        if (data.success) {
            showNotification(`✅ ${data.products?.length || 0} productos creados`, 'success');
            loadKitProducts();
        } else {
            if (data.existingCount > 0) {
                showNotification(`Ya existen ${data.existingCount} productos`, 'warning');
            } else {
                showNotification(`Error: ${data.error}`, 'error');
            }
        }
    } catch (err) {
        console.error('Error seeding products:', err);
        showNotification('Error al cargar ejemplos', 'error');
    }
}

// ==================== CJDROPSHIPPING FULFILLMENT ====================

// Variable global para almacenar la configuración completa
let cjConfigCache = null;

async function loadCJDashboard() {
    loadCJConfig();
    loadCJStats();
    loadCJPendingReview();
}

async function loadCJConfig() {
    try {
        const res = await fetch('/api/welcome-kit/admin/cj/config', {
            headers: { 'Authorization': `Bearer ${userSession.token}` }
        });
        const data = await res.json();
        
        if (data.success) {
            const config = data.config;
            
            // Estado del servicio
            const enabledToggle = document.getElementById('cj-enabled-toggle');
            const serviceStatus = document.getElementById('cj-service-status');
            const apiPreview = document.getElementById('cj-api-preview');
            const statusCard = document.getElementById('cj-status-card');
            
            if (enabledToggle) enabledToggle.checked = config.enabled;
            
            if (serviceStatus) {
                if (config.enabled && data.apiKeyConfigured) {
                    serviceStatus.textContent = '✅ Activo';
                    serviceStatus.style.color = '#10b981';
                    statusCard.style.borderColor = '#10b981';
                } else if (!data.apiKeyConfigured) {
                    serviceStatus.textContent = '⚠️ Sin API Key';
                    serviceStatus.style.color = '#f59e0b';
                    statusCard.style.borderColor = '#f59e0b';
                } else {
                    serviceStatus.textContent = '⏸️ Desactivado';
                    serviceStatus.style.color = '#888';
                    statusCard.style.borderColor = '#333';
                }
            }
            
            if (apiPreview) {
                apiPreview.textContent = data.apiKeyPreview || 'No configurada';
                apiPreview.style.color = data.apiKeyConfigured ? '#10b981' : '#ef4444';
            }
            
            // SKUs
            const skuUsbB = document.getElementById('cj-sku-usb-b');
            const skuMidi5pin = document.getElementById('cj-sku-midi-5pin');
            const skuMicroUsb = document.getElementById('cj-sku-micro-usb');
            const skuUsbC = document.getElementById('cj-sku-usb-c');
            
            if (skuUsbB) skuUsbB.value = config.skus?.USB_B || '';
            if (skuMidi5pin) skuMidi5pin.value = config.skus?.MIDI_5PIN || '';
            if (skuMicroUsb) skuMicroUsb.value = config.skus?.MICRO_USB || '';
            if (skuUsbC) skuUsbC.value = config.skus?.USB_C || '';
            
            // Configuración de Pricing
            const pricing = config.pricing || {};
            const dynamicPricingToggle = document.getElementById('cj-dynamic-pricing');
            if (dynamicPricingToggle) {
                dynamicPricingToggle.checked = pricing.useDynamicPricing !== false;
            }
            
            // Guardar config completo en cache
            cjConfigCache = config;
            
            // Cargar precios del país por defecto
            const countrySelector = document.getElementById('cj-country-selector');
            if (countrySelector) {
                countrySelector.value = 'default';
                loadCountryPricing();
            }
            
            // Márgenes por categoría
            const margins = pricing.marginByCategory || {};
            document.getElementById('cj-margin-cable')?.setAttribute('value', margins.cable ?? 40);
            document.getElementById('cj-margin-keyboard')?.setAttribute('value', margins.keyboard ?? 25);
            document.getElementById('cj-margin-stand')?.setAttribute('value', margins.stand ?? 35);
            document.getElementById('cj-margin-pedal')?.setAttribute('value', margins.pedal ?? 40);
            document.getElementById('cj-margin-accessory')?.setAttribute('value', margins.accessory ?? 35);
            document.getElementById('cj-margin-bundle')?.setAttribute('value', margins.bundle ?? 20);
            
            // También establecer el value directamente
            if (document.getElementById('cj-margin-cable')) document.getElementById('cj-margin-cable').value = margins.cable ?? 40;
            if (document.getElementById('cj-margin-keyboard')) document.getElementById('cj-margin-keyboard').value = margins.keyboard ?? 25;
            if (document.getElementById('cj-margin-stand')) document.getElementById('cj-margin-stand').value = margins.stand ?? 35;
            if (document.getElementById('cj-margin-pedal')) document.getElementById('cj-margin-pedal').value = margins.pedal ?? 40;
            if (document.getElementById('cj-margin-accessory')) document.getElementById('cj-margin-accessory').value = margins.accessory ?? 35;
            if (document.getElementById('cj-margin-bundle')) document.getElementById('cj-margin-bundle').value = margins.bundle ?? 20;
            
            // Balance (si está configurado)
            if (data.apiKeyConfigured && config.enabled) {
                loadCJBalance();
            } else {
                const balanceAmount = document.getElementById('cj-balance-amount');
                if (balanceAmount) balanceAmount.textContent = '-';
            }
        }
    } catch (err) {
        console.error('Error loading CJ config:', err);
    }
}

function toggleDynamicPricing() {
    const dynamicToggle = document.getElementById('cj-dynamic-pricing');
    const marginsSection = document.querySelectorAll('[id^="cj-margin-"]');
    
    // Visual feedback para indicar si márgenes están activos
    marginsSection.forEach(input => {
        if (dynamicToggle?.checked) {
            input.style.opacity = '1';
            input.disabled = false;
        } else {
            input.style.opacity = '0.5';
            input.disabled = true;
        }
    });
}

function loadCountryPricing() {
    if (!cjConfigCache || !cjConfigCache.pricing || !cjConfigCache.pricing.servicePricesByCountry) {
        return;
    }
    
    const countrySelector = document.getElementById('cj-country-selector');
    const selectedCountry = countrySelector?.value || 'default';
    
    const prices = cjConfigCache.pricing.servicePricesByCountry[selectedCountry] || 
                   cjConfigCache.pricing.servicePricesByCountry['default'] || 
                   { setupSession: 15, trialClass: 10 };
    
    const priceSetup = document.getElementById('cj-price-setup');
    const priceTrial = document.getElementById('cj-price-trial');
    
    if (priceSetup) priceSetup.value = prices.setupSession;
    if (priceTrial) priceTrial.value = prices.trialClass;
}

function loadCountryPricing() {
    if (!cjConfigCache) return;
    
    const countrySelector = document.getElementById('cj-country-selector');
    const selectedCountry = countrySelector?.value || 'default';
    
    const priceSetup = document.getElementById('cj-price-setup');
    const priceTrial = document.getElementById('cj-price-trial');
    
    // servicePricesByCountry es un objeto, no un Map cuando viene del servidor
    const servicePrices = cjConfigCache.pricing?.servicePricesByCountry?.[selectedCountry] || 
                          cjConfigCache.pricing?.servicePricesByCountry?.['default'] || 
                          { setupSession: 15, trialClass: 10 };
    
    if (priceSetup) priceSetup.value = servicePrices.setupSession ?? 15;
    if (priceTrial) priceTrial.value = servicePrices.trialClass ?? 10;
}

async function loadCJBalance() {
    const balanceCard = document.getElementById('cj-balance-card');
    const balanceAmount = document.getElementById('cj-balance-amount');
    
    if (!balanceAmount) return;
    
    try {
        balanceAmount.textContent = '...';
        
        const res = await fetch('/api/welcome-kit/admin/cj/balance', {
            headers: { 'Authorization': `Bearer ${userSession.token}` }
        });
        const data = await res.json();
        
        if (data.success) {
            balanceAmount.textContent = `$${data.balance.toFixed(2)} USD`;
            
            // Color según balance
            if (balanceCard) {
                if (data.balance < 50) {
                    balanceCard.style.borderColor = '#ef4444';
                } else if (data.balance < 200) {
                    balanceCard.style.borderColor = '#f59e0b';
                } else {
                    balanceCard.style.borderColor = '#10b981';
                }
            }
        } else {
            balanceAmount.textContent = 'Error';
        }
    } catch (err) {
        console.error('Error loading CJ balance:', err);
        balanceAmount.textContent = 'Error';
    }
}

async function toggleCJService() {
    const enabledToggle = document.getElementById('cj-enabled-toggle');
    if (!enabledToggle) return;
    
    const enabled = enabledToggle.checked;
    
    try {
        const res = await fetch('/api/welcome-kit/admin/cj/config', {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${userSession.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ enabled })
        });
        const data = await res.json();
        
        if (data.success) {
            showNotification(enabled ? '✅ CJDropshipping activado' : '⏸️ CJDropshipping desactivado', 'success');
            loadCJConfig();
        } else {
            showNotification(`Error: ${data.error}`, 'error');
            enabledToggle.checked = !enabled; // Revertir
        }
    } catch (err) {
        console.error('Error toggling CJ service:', err);
        showNotification('Error al cambiar estado', 'error');
        enabledToggle.checked = !enabled;
    }
}

async function saveCJConfig() {
    const skus = {
        USB_B: document.getElementById('cj-sku-usb-b')?.value?.trim() || '',
        MIDI_5PIN: document.getElementById('cj-sku-midi-5pin')?.value?.trim() || '',
        MICRO_USB: document.getElementById('cj-sku-micro-usb')?.value?.trim() || '',
        USB_C: document.getElementById('cj-sku-usb-c')?.value?.trim() || ''
    };
    
    // Actualizar precios del país seleccionado en el cache
    const countrySelector = document.getElementById('cj-country-selector');
    const selectedCountry = countrySelector?.value || 'default';
    
    const setupPrice = parseFloat(document.getElementById('cj-price-setup')?.value) || 15;
    const trialPrice = parseFloat(document.getElementById('cj-price-trial')?.value) || 10;
    
    // Inicializar servicePricesByCountry si no existe
    if (!cjConfigCache) cjConfigCache = { pricing: {} };
    if (!cjConfigCache.pricing) cjConfigCache.pricing = {};
    if (!cjConfigCache.pricing.servicePricesByCountry) {
        cjConfigCache.pricing.servicePricesByCountry = {
            'default': { setupSession: 15, trialClass: 10 }
        };
    }
    
    // Actualizar el país actual
    cjConfigCache.pricing.servicePricesByCountry[selectedCountry] = {
        setupSession: setupPrice,
        trialClass: trialPrice
    };
    
    // Configuración de pricing
    const pricing = {
        useDynamicPricing: document.getElementById('cj-dynamic-pricing')?.checked ?? true,
        servicePricesByCountry: cjConfigCache.pricing.servicePricesByCountry,
        marginByCategory: {
            cable: parseFloat(document.getElementById('cj-margin-cable')?.value) || 40,
            keyboard: parseFloat(document.getElementById('cj-margin-keyboard')?.value) || 25,
            stand: parseFloat(document.getElementById('cj-margin-stand')?.value) || 35,
            pedal: parseFloat(document.getElementById('cj-margin-pedal')?.value) || 40,
            accessory: parseFloat(document.getElementById('cj-margin-accessory')?.value) || 35,
            bundle: parseFloat(document.getElementById('cj-margin-bundle')?.value) || 20
        }
    };
    
    try {
        showNotification('Guardando...', 'info');
        
        const res = await fetch('/api/welcome-kit/admin/cj/config', {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${userSession.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ skus, pricing })
        });
        const data = await res.json();
        
        if (data.success) {
            showNotification(`✅ Configuración guardada (${selectedCountry})`, 'success');
        } else {
            showNotification(`Error: ${data.error}`, 'error');
        }
    } catch (err) {
        console.error('Error saving CJ config:', err);
        showNotification('Error al guardar', 'error');
    }
}

async function testCJConnection() {
    try {
        showNotification('Probando conexión...', 'info');
        
        const res = await fetch('/api/welcome-kit/admin/cj/test-connection', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${userSession.token}` }
        });
        const data = await res.json();
        
        if (data.success) {
            showNotification(`✅ Conexión exitosa! Balance: $${data.balance.toFixed(2)}`, 'success');
            loadCJBalance();
        } else {
            showNotification(`❌ ${data.error}`, 'error');
        }
    } catch (err) {
        console.error('Error testing CJ connection:', err);
        showNotification('Error de conexión', 'error');
    }
}

async function loadCJStats() {
    try {
        const res = await fetch('/api/welcome-kit/admin/cj/orders?source=local', {
            headers: { 'Authorization': `Bearer ${userSession.token}` }
        });
        const data = await res.json();
        
        if (data.success && data.orders) {
            // Contar por estado
            const stats = {
                created: 0,
                unpaid: 0,
                shipped: 0,
                delivered: 0
            };
            
            data.orders.forEach(order => {
                const status = order.shipping?.fulfillment?.status?.toLowerCase() || '';
                if (status.includes('created') || status.includes('cart')) {
                    stats.created++;
                } else if (status.includes('unpaid')) {
                    stats.unpaid++;
                } else if (status.includes('shipped') || status.includes('unshipped')) {
                    stats.shipped++;
                } else if (status.includes('delivered')) {
                    stats.delivered++;
                }
            });
            
            // Actualizar UI
            const statCreated = document.getElementById('cj-stat-created');
            const statUnpaid = document.getElementById('cj-stat-unpaid');
            const statShipped = document.getElementById('cj-stat-shipped');
            const statDelivered = document.getElementById('cj-stat-delivered');
            
            if (statCreated) statCreated.textContent = stats.created;
            if (statUnpaid) statUnpaid.textContent = stats.unpaid;
            if (statShipped) statShipped.textContent = stats.shipped;
            if (statDelivered) statDelivered.textContent = stats.delivered;
        }
    } catch (err) {
        console.error('Error loading CJ stats:', err);
    }
}

async function loadCJPendingReview() {
    const tbody = document.getElementById('cj-pending-tbody');
    if (!tbody) return;
    
    try {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;">Cargando...</td></tr>';
        
        const res = await fetch('/api/welcome-kit/admin/cj/orders?pendingReview=true', {
            headers: { 'Authorization': `Bearer ${userSession.token}` }
        });
        const data = await res.json();
        
        if (data.success && data.orders && data.orders.length > 0) {
            tbody.innerHTML = data.orders.map(kit => `
                <tr>
                    <td>${kit.studentName || 'N/A'}</td>
                    <td>${kit.shipping?.country || 'N/A'}</td>
                    <td>
                        <span class="cable-badge">${getCableIcon(kit.shipping?.cableType)} ${formatCableType(kit.shipping?.cableType)}</span>
                    </td>
                    <td style="color:#ef4444;font-size:0.85rem;max-width:200px;overflow:hidden;text-overflow:ellipsis;">
                        ${kit.shipping?.fulfillment?.errorMessage || 'Error desconocido'}
                    </td>
                    <td>
                        <button class="btn-icon" onclick="retryCJOrder('${kit._id}')" title="Reintentar">
                            🔄
                        </button>
                        <button class="btn-icon" onclick="createManualCJOrder('${kit._id}')" title="Crear manual">
                            ✏️
                        </button>
                    </td>
                </tr>
            `).join('');
        } else {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;color:#10b981;">✓ No hay órdenes pendientes de revisión</td></tr>';
        }
    } catch (err) {
        console.error('Error loading pending review:', err);
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;color:#ef4444;">Error al cargar</td></tr>';
    }
}

async function retryCJOrder(kitId) {
    if (!confirm('¿Reintentar crear orden en CJDropshipping?')) return;
    
    try {
        showNotification('Reintentando...', 'info');
        
        const res = await fetch(`/api/welcome-kit/admin/cj/retry/${kitId}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${userSession.token}` }
        });
        const data = await res.json();
        
        if (data.success) {
            showNotification('✓ Orden creada exitosamente', 'success');
            loadCJDashboard();
            loadKits(); // Actualizar lista principal
        } else {
            showNotification(`Error: ${data.error}`, 'error');
        }
    } catch (err) {
        console.error('Error retrying CJ order:', err);
        showNotification('Error al reintentar', 'error');
    }
}

async function syncAllCJOrders() {
    if (!confirm('¿Sincronizar estado de todas las órdenes activas con CJDropshipping?')) return;
    
    try {
        showNotification('Sincronizando...', 'info');
        
        const res = await fetch('/api/welcome-kit/admin/cj/sync-all', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${userSession.token}` }
        });
        const data = await res.json();
        
        if (data.success) {
            showNotification(`✓ ${data.synced} órdenes sincronizadas`, 'success');
            loadCJDashboard();
            loadKits();
        } else {
            showNotification(`Error: ${data.error}`, 'error');
        }
    } catch (err) {
        console.error('Error syncing CJ orders:', err);
        showNotification('Error al sincronizar', 'error');
    }
}

async function createManualCJOrder(kitId) {
    // Por ahora solo muestra info - en el futuro podría abrir un modal
    alert('Para crear una orden manual, ve a CJDropshipping.com y crea la orden directamente. Luego sincroniza con el botón "Sincronizar Todo".');
}

function getCableIcon(cableType) {
    const icons = {
        'USB_B': '🔌',
        'MIDI_5PIN': '🎹',
        'MICRO_USB': '📱',
        'USB_C': '⚡'
    };
    return icons[cableType] || '🔌';
}

function formatCableType(cableType) {
    const names = {
        'USB_B': 'USB-B',
        'MIDI_5PIN': 'MIDI 5-Pin',
        'MICRO_USB': 'Micro USB',
        'USB_C': 'USB-C'
    };
    return names[cableType] || cableType || 'No especificado';
}

// ==================== DSERS / ALIEXPRESS ====================

async function loadDSersTab() {
    try {
        // Cargar configuración
        const configRes = await fetch('/api/welcome-kit/admin/dsers/config', {
            headers: { 'Authorization': `Bearer ${userSession.token}` }
        });
        const configData = await configRes.json();
        
        if (configData.success) {
            const config = configData.config;
            document.getElementById('dsers-enabled-toggle').checked = config.enabled;
            document.getElementById('dsers-affiliate-id').value = config.affiliateTrackingId || '';
            document.getElementById('dsers-default-margin').value = config.defaultMargin || 40;
            
            document.getElementById('dsers-status').innerHTML = config.enabled 
                ? '✅ Activo' 
                : '⏸️ No Configurado';
            document.getElementById('dsers-status').style.color = config.enabled 
                ? 'var(--accent-green)' 
                : 'var(--accent-orange)';
            
            document.getElementById('dsers-affiliate-preview').textContent = 
                config.affiliateTrackingId || 'No configurado';
        }
        
        // Cargar productos de AliExpress
        await loadAliExpressProducts();
        
    } catch (error) {
        console.error('Error cargando DSers:', error);
    }
}

async function loadAliExpressProducts() {
    try {
        const res = await fetch('/api/welcome-kit/admin/products/aliexpress', {
            headers: { 'Authorization': `Bearer ${userSession.token}` }
        });
        const data = await res.json();
        
        const container = document.getElementById('aliexpress-products-list');
        
        if (!data.success || data.products.length === 0) {
            container.innerHTML = `
                <div style="text-align:center; padding:40px; color:#666;">
                    No hay productos de AliExpress configurados aún.<br>
                    <button class="btn btn-primary" onclick="openAddAliProductModal()" style="margin-top:15px;">
                        ➕ Agregar Primer Producto
                    </button>
                </div>
            `;
            return;
        }
        
        let html = '<div style="display:grid; gap:15px;">';
        data.products.forEach(product => {
            html += `
                <div style="background:var(--bg-dark); border:1px solid #333; border-radius:8px; padding:15px; display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <div style="font-weight:600; color:#fff; margin-bottom:5px;">${product.name}</div>
                        <div style="font-size:12px; color:#888;">
                            Categoría: ${product.category} | Precio: $${product.defaultPrice}
                        </div>
                        <a href="${product.fulfillment.aliexpressUrl}" target="_blank" style="font-size:11px; color:var(--accent-blue);">
                            Ver en AliExpress →
                        </a>
                    </div>
                    <div style="display:flex; gap:10px;">
                        <button class="btn btn-secondary" onclick="editAliProduct('${product._id}')">✏️</button>
                        <button class="btn btn-danger" onclick="deleteAliProduct('${product._id}')">🗑️</button>
                    </div>
                </div>
            `;
        });
        html += '</div>';
        
        container.innerHTML = html;
        
    } catch (error) {
        console.error('Error cargando productos AliExpress:', error);
    }
}

function openAddAliProductModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.innerHTML = `
        <div class="modal-content" style="max-width:600px;">
            <div class="modal-header">
                <h3>🛒 Agregar Producto de AliExpress</h3>
                <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label>Nombre del Producto</label>
                    <input type="text" id="ali-product-name" class="form-input" placeholder="Ej: Cable MIDI USB para Teclado">
                </div>
                
                <div class="form-group">
                    <label>URL de AliExpress</label>
                    <input type="url" id="ali-product-url" class="form-input" placeholder="https://www.aliexpress.com/item/...">
                    <small style="color:#888; font-size:11px;">Copia la URL completa del producto desde AliExpress</small>
                </div>
                
                <div class="form-group">
                    <label>Precio en AliExpress ($USD)</label>
                    <input type="number" id="ali-product-price" class="form-input" placeholder="2.50" step="0.01" min="0">
                </div>
                
                <div class="form-group">
                    <label>Margen de Ganancia (%)</label>
                    <input type="number" id="ali-product-margin" class="form-input" value="40" min="0" max="300">
                    <small style="color:#888; font-size:11px;">Ej: 40% = El precio final será $2.50 × 1.40 = $3.50</small>
                </div>
                
                <div class="form-group">
                    <label>Categoría</label>
                    <select id="ali-product-category" class="form-input">
                        <option value="cable">🔌 Cable</option>
                        <option value="keyboard">🎹 Teclado</option>
                        <option value="stand">🪜 Soporte</option>
                        <option value="pedal">🦶 Pedal</option>
                        <option value="accessory">🎧 Accesorio</option>
                    </select>
                </div>
                
                <div style="background:rgba(59,130,246,0.1); border:1px solid var(--accent-blue); border-radius:8px; padding:12px; margin-top:15px;">
                    <div style="font-size:13px; color:#888;">
                        <strong style="color:var(--accent-blue);">💡 Precio calculado:</strong>
                        <div id="ali-price-preview" style="font-size:18px; font-weight:700; color:#fff; margin-top:5px;">
                            -
                        </div>
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
                <button class="btn btn-primary" onclick="saveAliProduct()">💾 Agregar Producto</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Actualizar preview de precio al cambiar valores
    const priceInput = document.getElementById('ali-product-price');
    const marginInput = document.getElementById('ali-product-margin');
    const preview = document.getElementById('ali-price-preview');
    
    function updatePreview() {
        const price = parseFloat(priceInput.value) || 0;
        const margin = parseFloat(marginInput.value) || 0;
        const finalPrice = price * (1 + margin / 100);
        preview.textContent = price > 0 ? `$${finalPrice.toFixed(2)} USD` : '-';
    }
    
    priceInput.addEventListener('input', updatePreview);
    marginInput.addEventListener('input', updatePreview);
}

async function saveAliProduct() {
    const name = document.getElementById('ali-product-name').value.trim();
    const url = document.getElementById('ali-product-url').value.trim();
    const price = parseFloat(document.getElementById('ali-product-price').value);
    const margin = parseFloat(document.getElementById('ali-product-margin').value);
    const category = document.getElementById('ali-product-category').value;
    
    if (!name || !url || !price || price <= 0) {
        showNotification('Por favor completa todos los campos requeridos', 'error');
        return;
    }
    
    if (!url.includes('aliexpress.com')) {
        showNotification('La URL debe ser de aliexpress.com', 'error');
        return;
    }
    
    try {
        const res = await fetch('/api/welcome-kit/admin/products/aliexpress', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${userSession.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name,
                aliexpressUrl: url,
                price,
                margin,
                category
            })
        });
        
        const data = await res.json();
        
        if (data.success) {
            showNotification('✅ Producto agregado exitosamente', 'success');
            document.querySelector('.modal-overlay.active').remove();
            await loadAliExpressProducts();
        } else {
            showNotification(data.error || 'Error al agregar producto', 'error');
        }
        
    } catch (error) {
        console.error('Error guardando producto:', error);
        showNotification('Error al guardar producto', 'error');
    }
}

async function toggleDSersService() {
    const enabled = document.getElementById('dsers-enabled-toggle').checked;
    
    try {
        const res = await fetch('/api/welcome-kit/admin/dsers/config', {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${userSession.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ enabled })
        });
        
        const data = await res.json();
        
        if (data.success) {
            showNotification(enabled ? 'DSers activado' : 'DSers desactivado', 'success');
            await loadDSersTab();
        }
        
    } catch (error) {
        console.error('Error toggling DSers:', error);
        showNotification('Error al cambiar estado', 'error');
    }
}

async function saveDSersConfig() {
    const affiliateId = document.getElementById('dsers-affiliate-id').value.trim();
    const defaultMargin = parseFloat(document.getElementById('dsers-default-margin').value);
    
    try {
        const res = await fetch('/api/welcome-kit/admin/dsers/config', {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${userSession.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                affiliateTrackingId: affiliateId,
                defaultMargin
            })
        });
        
        const data = await res.json();
        
        if (data.success) {
            showNotification('✅ Configuración guardada', 'success');
            await loadDSersTab();
        } else {
            showNotification(data.error || 'Error al guardar', 'error');
        }
        
    } catch (error) {
        console.error('Error guardando config DSers:', error);
        showNotification('Error al guardar configuración', 'error');
    }
}

async function exportDSersCSV() {
    try {
        const res = await fetch('/api/welcome-kit/admin/dsers/export-csv', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${userSession.token}`
            }
        });
        
        if (res.ok) {
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `dsers-orders-${Date.now()}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            
            showNotification('✅ CSV exportado. Ahora súbelo a DSers.com', 'success');
        } else {
            const data = await res.json();
            showNotification(data.message || 'No hay pedidos para exportar', 'info');
        }
        
    } catch (error) {
        console.error('Error exportando CSV:', error);
        showNotification('Error al exportar CSV', 'error');
    }
}

async function deleteAliProduct(productId) {
    if (!confirm('¿Eliminar este producto de AliExpress?')) return;
    
    try {
        const res = await fetch(`/api/welcome-kit/admin/products/${productId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${userSession.token}`
            }
        });
        
        const data = await res.json();
        
        if (data.success) {
            showNotification('Producto eliminado', 'success');
            await loadKitProductsList();
        } else {
            showNotification(data.error || 'Error al eliminar', 'error');
        }
        
    } catch (error) {
        console.error('Error eliminando producto:', error);
        showNotification('Error al eliminar producto', 'error');
    }
}

function editAliProduct(productId) {
    showNotification('Función en desarrollo. Por ahora elimina y crea uno nuevo.', 'info');
}

// ==================== WELCOME KIT - NUEVO DISEÑO ====================

function switchSimpleKitTab(tabName) {
    document.querySelectorAll('.simple-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.kit-tab-content').forEach(c => c.classList.remove('active'));
    
    document.querySelector(`[data-kit-tab="${tabName}"]`)?.classList.add('active');
    document.getElementById(`kit-tab-${tabName}`)?.classList.add('active');
    
    if (tabName === 'onboarding') {
        loadV2OrdersList();
    } else if (tabName === 'products') {
        loadKitProductsList();
    } else if (tabName === 'orders') {
        loadKitOrdersList();
    } else if (tabName === 'interviews') {
        loadInterviewCalendar();
    } else if (tabName === 'pricing') {
        loadServicePricing();
    }
}

// ==================== ONBOARDING V2 ($44 USD) ====================
let v2Orders = [];
let currentV2Filter = 'all';

async function loadV2OrdersList() {
    const container = document.getElementById('v2-orders-list');
    container.innerHTML = '<div style="text-align:center; padding:40px; color:#888;"><div class="spinner"></div><p>Cargando...</p></div>';
    
    try {
        const res = await fetch('/api/welcome-kit/v2/orders', {
            headers: { 'Authorization': `Bearer ${userSession.token}` }
        });
        const data = await res.json();
        
        if (!data.success) throw new Error(data.error);
        
        v2Orders = data.orders || [];
        renderV2Orders();
    } catch (error) {
        console.error('Error cargando órdenes V2:', error);
        container.innerHTML = `<div style="text-align:center; padding:40px; color:#ff5252;">Error: ${error.message}</div>`;
    }
}

function filterV2Orders(status) {
    currentV2Filter = status;
    document.querySelectorAll('[data-v2-filter]').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`[data-v2-filter="${status}"]`)?.classList.add('active');
    renderV2Orders();
}

function renderV2Orders() {
    const container = document.getElementById('v2-orders-list');
    
    let filtered = v2Orders;
    if (currentV2Filter !== 'all') {
        filtered = v2Orders.filter(o => o.overallStatus === currentV2Filter);
    }
    
    if (filtered.length === 0) {
        container.innerHTML = `
            <div style="text-align:center; padding:60px 20px; color:#666;">
                <div style="font-size:48px; margin-bottom:15px;">🎹</div>
                <p>No hay órdenes ${currentV2Filter !== 'all' ? 'en este estado' : 'de onboarding aún'}</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = filtered.map(order => {
        const statusInfo = getV2StatusInfo(order.overallStatus);
        const createdDate = new Date(order.createdAt).toLocaleDateString('es-CL');
        
        return `
            <div class="v2-order-card" style="background:var(--bg-card); border-radius:12px; padding:20px; border-left:4px solid ${statusInfo.color};">
                <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:15px;">
                    <div>
                        <div style="font-size:16px; font-weight:600; color:#fff;">
                            ${order.clientName || 'Sin nombre'}
                        </div>
                        <div style="font-size:13px; color:#888; margin-top:4px;">
                            ${order.clientEmail || ''} • ${order.clientWhatsapp || 'Sin WhatsApp'}
                        </div>
                        <div style="font-size:11px; color:#666; margin-top:4px;">
                            Pagado: ${createdDate} • $${(order.payment?.amount || 0) / 100} ${order.payment?.currency || 'USD'}
                        </div>
                    </div>
                    <div style="text-align:right;">
                        <span style="background:${statusInfo.bgColor}; color:${statusInfo.color}; padding:4px 12px; border-radius:20px; font-size:11px; font-weight:500;">
                            ${statusInfo.icon} ${statusInfo.label}
                        </span>
                    </div>
                </div>
                
                ${order.cable?.keyboardModel ? `
                <div style="background:rgba(212,175,55,0.1); padding:10px 15px; border-radius:8px; margin-bottom:15px; font-size:12px; color:#d4af37;">
                    🎹 Teclado: <strong>${order.cable.keyboardModel}</strong> 
                    • Conexión: <strong>${order.cable.type || 'USB_B'}</strong>
                </div>
                ` : ''}
                
                <div style="display:flex; gap:10px; flex-wrap:wrap;">
                    ${renderV2Actions(order)}
                </div>
            </div>
        `;
    }).join('');
}

function getV2StatusInfo(status) {
    const statuses = {
        'paid': { label: 'Pagado', icon: '💳', color: '#3b82f6', bgColor: 'rgba(59,130,246,0.15)' },
        'entrevista_pendiente': { label: 'Entrevista Pendiente', icon: '📞', color: '#f59e0b', bgColor: 'rgba(245,158,11,0.15)' },
        'entrevista_agendada': { label: 'Entrevista Agendada', icon: '📅', color: '#3b82f6', bgColor: 'rgba(59,130,246,0.15)' },
        'esperando_equipo': { label: 'Esperando Equipo', icon: '🛒', color: '#8b5cf6', bgColor: 'rgba(139,92,246,0.15)' },
        'setup_pending': { label: 'Setup Pendiente', icon: '⚙️', color: '#f97316', bgColor: 'rgba(249,115,22,0.15)' },
        'setup_scheduled': { label: 'Setup Agendado', icon: '📅', color: '#06b6d4', bgColor: 'rgba(6,182,212,0.15)' },
        'trial_available': { label: 'Clase Disponible', icon: '🎓', color: '#10b981', bgColor: 'rgba(16,185,129,0.15)' },
        'trial_scheduled': { label: 'Clase Agendada', icon: '📆', color: '#14b8a6', bgColor: 'rgba(20,184,166,0.15)' },
        'completed': { label: 'Completado', icon: '✅', color: '#22c55e', bgColor: 'rgba(34,197,94,0.15)' }
    };
    return statuses[status] || { label: status, icon: '❓', color: '#888', bgColor: 'rgba(136,136,136,0.15)' };
}

function renderV2Actions(order) {
    const status = order.overallStatus;
    const orderId = order._id;
    
    // Acciones según estado
    let actions = [];
    
    // WhatsApp siempre disponible
    if (order.clientWhatsapp) {
        const phone = order.clientWhatsapp.replace(/[^0-9]/g, '');
        actions.push(`<a href="https://wa.me/${phone}" target="_blank" class="btn btn-secondary" style="font-size:11px; padding:6px 12px;">💬 WhatsApp</a>`);
    }
    
    // Acciones específicas por estado
    if (status === 'paid' || status === 'entrevista_pendiente') {
        actions.push(`<button class="btn btn-primary" style="font-size:11px; padding:6px 12px;" onclick="openSendRecommendationsModal('${orderId}')">📧 Enviar Recomendaciones</button>`);
    }
    
    if (status === 'esperando_equipo') {
        actions.push(`<button class="btn btn-secondary" style="font-size:11px; padding:6px 12px;" onclick="resendRecommendations('${orderId}')">📧 Reenviar Email</button>`);
    }
    
    if (status === 'setup_pending') {
        actions.push(`<button class="btn btn-primary" style="font-size:11px; padding:6px 12px;" onclick="updateV2Status('${orderId}', 'setup_scheduled')">📅 Marcar Agendado</button>`);
    }
    
    if (status === 'setup_scheduled') {
        actions.push(`<button class="btn btn-primary" style="font-size:11px; padding:6px 12px;" onclick="updateV2Status('${orderId}', 'trial_available')">✅ Setup Completado</button>`);
    }
    
    if (status === 'trial_available') {
        actions.push(`<button class="btn btn-primary" style="font-size:11px; padding:6px 12px;" onclick="updateV2Status('${orderId}', 'trial_scheduled')">📅 Clase Agendada</button>`);
    }
    
    if (status === 'trial_scheduled') {
        actions.push(`<button class="btn btn-primary" style="font-size:11px; padding:6px 12px;" onclick="updateV2Status('${orderId}', 'completed')">✅ Completar</button>`);
    }
    
    // Cambiar estado manual
    actions.push(`<button class="btn" style="font-size:11px; padding:6px 12px; background:#333; color:#888;" onclick="openChangeStatusModal('${orderId}', '${status}')">⚙️ Estado</button>`);
    
    return actions.join('');
}

// Modal para enviar recomendaciones
function openSendRecommendationsModal(orderId) {
    const order = v2Orders.find(o => o._id === orderId);
    if (!order) return;
    
    // Crear modal dinámico
    const modalHtml = `
        <div id="send-recommendations-modal" class="modal-overlay" style="display:flex;">
            <div class="modal-content" style="max-width:700px; max-height:90vh; overflow-y:auto;">
                <div class="modal-header">
                    <h3>📧 Enviar Recomendaciones de Equipo</h3>
                    <button class="modal-close" onclick="closeSendRecommendationsModal()">×</button>
                </div>
                <div class="modal-body">
                    <div style="background:var(--bg-dark); padding:15px; border-radius:8px; margin-bottom:20px;">
                        <div style="color:#d4af37; font-weight:600;">${order.clientName}</div>
                        <div style="color:#888; font-size:13px;">${order.clientEmail}</div>
                    </div>
                    
                    <div class="form-group" style="margin-bottom:15px;">
                        <label>🎹 Marca/Modelo del teclado</label>
                        <input type="text" id="rec-keyboard-brand" class="form-input" placeholder="Ej: Yamaha PSR-E373">
                    </div>
                    
                    <div class="form-group" style="margin-bottom:15px;">
                        <label>🔌 Tipo de conexión</label>
                        <select id="rec-connection-type" class="form-input" onchange="prefillRecommendationLinks()">
                            <option value="USB-B">USB-B (Yamaha, Roland, Casio)</option>
                            <option value="USB-C">USB-C (Teclados modernos)</option>
                            <option value="MIDI 5-pin">MIDI 5-pin (Clásico)</option>
                            <option value="Bluetooth">Bluetooth</option>
                        </select>
                    </div>
                    
                    <!-- Productos recomendados editables -->
                    <div style="border:1px solid var(--border-color); border-radius:12px; padding:20px; margin-bottom:15px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                            <h4 style="color:#d4af37; margin:0;">🛒 Productos recomendados</h4>
                            <button type="button" class="btn" style="font-size:11px; padding:5px 10px; background:#333;" onclick="addRecommendationItem()">+ Agregar producto</button>
                        </div>
                        <div id="rec-products-list">
                            <!-- Se llena dinámicamente -->
                        </div>
                        <button type="button" onclick="prefillRecommendationLinks()" style="background:none; border:1px dashed #555; color:#888; padding:8px; border-radius:6px; width:100%; cursor:pointer; font-size:12px; margin-top:8px;">
                            🔄 Recargar productos por defecto según conexión
                        </button>
                    </div>
                    
                    <div class="form-group" style="margin-bottom:15px;">
                        <label>📝 Notas adicionales para el alumno (opcional)</label>
                        <textarea id="rec-notes" class="form-input" rows="3" placeholder="Consejos especiales, observaciones de la entrevista..."></textarea>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="closeSendRecommendationsModal()">Cancelar</button>
                    <button class="btn btn-primary" id="btn-send-rec" onclick="sendRecommendationsEmail('${orderId}')">📧 Enviar Email de Recomendaciones</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    // Pre-cargar productos por defecto
    prefillRecommendationLinks();
}

// Productos por defecto según tipo de conexión
const DEFAULT_RECOMMENDATIONS = {
    'USB-B': [
        { name: 'Cable USB-B a USB-A (2m)', description: 'Cable estándar para Yamaha, Roland, Casio', price: '$5-8 USD', priority: 'required', links: [
            { store: 'Amazon', url: 'https://www.amazon.com/s?k=usb+b+cable+printer+2m' },
            { store: 'AliExpress', url: 'https://www.aliexpress.com/w/wholesale-usb-b-cable-2m.html' },
            { store: 'MercadoLibre', url: 'https://listado.mercadolibre.cl/cable-usb-tipo-b-impresora' }
        ]}
    ],
    'USB-C': [
        { name: 'Cable USB-C a USB-A (2m)', description: 'Para teclados modernos con puerto USB-C', price: '$6-10 USD', priority: 'required', links: [
            { store: 'Amazon', url: 'https://www.amazon.com/s?k=usb+c+cable+2m' },
            { store: 'AliExpress', url: 'https://www.aliexpress.com/w/wholesale-usb-c-cable-2m.html' },
            { store: 'MercadoLibre', url: 'https://listado.mercadolibre.cl/cable-usb-c-2-metros' }
        ]}
    ],
    'MIDI 5-pin': [
        { name: 'Interfaz MIDI USB', description: 'Convierte MIDI de 5 pines a USB', price: '$10-20 USD', priority: 'required', links: [
            { store: 'Amazon', url: 'https://www.amazon.com/s?k=midi+to+usb+interface' },
            { store: 'AliExpress', url: 'https://www.aliexpress.com/w/wholesale-midi-usb-interface.html' },
            { store: 'MercadoLibre', url: 'https://listado.mercadolibre.cl/interfaz-midi-usb' }
        ]}
    ],
    'Bluetooth': [
        { name: 'Adaptador Bluetooth MIDI', description: 'Si solo tiene Bluetooth, considera un cable USB como respaldo', price: '$15-25 USD', priority: 'optional', links: [
            { store: 'Amazon', url: 'https://www.amazon.com/s?k=bluetooth+midi+adapter' }
        ]}
    ]
};

// Productos comunes para todos
const COMMON_RECOMMENDATIONS = [
    { name: 'Pedal de Sustain', description: 'Esencial para tocar piano. Cualquier pedal genérico funciona.', price: '$10-20 USD', priority: 'recommended', links: [
        { store: 'Amazon', url: 'https://www.amazon.com/s?k=sustain+pedal+keyboard' },
        { store: 'MercadoLibre', url: 'https://listado.mercadolibre.cl/pedal-sustain' }
    ]},
    { name: 'Audífonos con cable', description: 'Para escuchar al profesor sin eco. Cualquier audífono sirve.', price: 'Ya tienes probablemente', priority: 'recommended', links: [] }
];

/**
 * Pre-llena la lista de productos según el tipo de conexión seleccionado
 */
function prefillRecommendationLinks() {
    const connType = document.getElementById('rec-connection-type').value;
    const container = document.getElementById('rec-products-list');
    container.innerHTML = '';
    
    const products = [...(DEFAULT_RECOMMENDATIONS[connType] || []), ...COMMON_RECOMMENDATIONS];
    products.forEach(p => addRecommendationItem(p));
}

/**
 * Agrega un item editable de producto recomendado
 */
function addRecommendationItem(prefill = null) {
    const container = document.getElementById('rec-products-list');
    const idx = container.children.length;
    
    const linksHtml = (prefill?.links || []).map(l => `${l.store}|${l.url}`).join('\n');
    const priorityOptions = ['required', 'recommended', 'optional'].map(p => 
        `<option value="${p}" ${prefill?.priority === p ? 'selected' : ''}>${p === 'required' ? '🔴 Necesario' : p === 'recommended' ? '🟡 Recomendado' : '⚪ Opcional'}</option>`
    ).join('');
    
    const itemHtml = `
        <div class="rec-product-item" style="background:var(--bg-dark); border:1px solid var(--border-color); border-radius:8px; padding:15px; margin-bottom:12px; position:relative;">
            <button type="button" onclick="this.closest('.rec-product-item').remove()" style="position:absolute; top:8px; right:8px; background:none; border:none; color:#666; cursor:pointer; font-size:16px;" title="Eliminar">×</button>
            
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:10px;">
                <div>
                    <label style="font-size:11px; color:#888; display:block; margin-bottom:3px;">Nombre del producto</label>
                    <input type="text" class="rec-prod-name form-input" value="${prefill?.name || ''}" placeholder="Ej: Cable USB-B" style="font-size:13px;">
                </div>
                <div>
                    <label style="font-size:11px; color:#888; display:block; margin-bottom:3px;">Precio referencial</label>
                    <input type="text" class="rec-prod-price form-input" value="${prefill?.price || ''}" placeholder="Ej: $5-10 USD" style="font-size:13px;">
                </div>
            </div>
            
            <div style="margin-bottom:10px;">
                <label style="font-size:11px; color:#888; display:block; margin-bottom:3px;">Descripción</label>
                <input type="text" class="rec-prod-desc form-input" value="${prefill?.description || ''}" placeholder="Descripción breve" style="font-size:13px;">
            </div>
            
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:10px;">
                <div>
                    <label style="font-size:11px; color:#888; display:block; margin-bottom:3px;">Prioridad</label>
                    <select class="rec-prod-priority form-input" style="font-size:13px;">
                        ${priorityOptions}
                    </select>
                </div>
            </div>
            
            <div>
                <label style="font-size:11px; color:#888; display:block; margin-bottom:3px;">Links de compra (uno por línea: Tienda|URL)</label>
                <textarea class="rec-prod-links form-input" rows="2" placeholder="Amazon|https://amazon.com/..." style="font-size:12px; font-family:monospace;">${linksHtml}</textarea>
            </div>
        </div>
    `;
    
    container.insertAdjacentHTML('beforeend', itemHtml);
}

/**
 * Recolecta los productos del modal y los convierte a la estructura que espera el backend
 */
function collectRecommendationProducts() {
    const items = document.querySelectorAll('.rec-product-item');
    const products = [];
    
    items.forEach(item => {
        const name = item.querySelector('.rec-prod-name').value.trim();
        if (!name) return; // Ignorar items sin nombre
        
        const linksText = item.querySelector('.rec-prod-links').value.trim();
        const links = linksText.split('\n').filter(l => l.includes('|')).map(l => {
            const [store, ...urlParts] = l.split('|');
            return { store: store.trim(), url: urlParts.join('|').trim() };
        });
        
        products.push({
            name,
            description: item.querySelector('.rec-prod-desc').value.trim(),
            price: item.querySelector('.rec-prod-price').value.trim(),
            priority: item.querySelector('.rec-prod-priority').value,
            image: '🔌',
            links
        });
    });
    
    return products;
}

function closeSendRecommendationsModal() {
    document.getElementById('send-recommendations-modal')?.remove();
}

async function sendRecommendationsEmail(orderId) {
    const keyboardBrand = document.getElementById('rec-keyboard-brand').value;
    const connectionType = document.getElementById('rec-connection-type').value;
    const notes = document.getElementById('rec-notes').value;
    const recommendations = collectRecommendationProducts();
    
    if (!keyboardBrand) {
        showNotification('Por favor ingresa el modelo del teclado', 'error');
        return;
    }
    
    // Deshabilitar botón mientras envía
    const btn = document.getElementById('btn-send-rec');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Enviando...'; }
    
    try {
        const res = await fetch(`/api/welcome-kit/v2/${orderId}/send-recommendations`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${userSession.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                keyboardBrand,
                connectionType,
                notes,
                recommendations
            })
        });
        
        const data = await res.json();
        
        if (!data.success) throw new Error(data.error);
        
        showNotification('✅ Email de recomendaciones enviado y estado actualizado a "Esperando Equipo"', 'success');
        closeSendRecommendationsModal();
        loadV2OrdersList();
    } catch (error) {
        showNotification('Error: ' + error.message, 'error');
        if (btn) { btn.disabled = false; btn.textContent = '📧 Enviar Email de Recomendaciones'; }
    }
}

async function updateV2Status(orderId, newStatus) {
    try {
        const res = await fetch(`/api/welcome-kit/v2/${orderId}/status`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${userSession.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ status: newStatus })
        });
        
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
        
        showNotification(`✅ Estado actualizado a: ${newStatus}`, 'success');
        loadV2OrdersList();
    } catch (error) {
        showNotification('Error: ' + error.message, 'error');
    }
}

function openChangeStatusModal(orderId, currentStatus) {
    const statuses = [
        { value: 'entrevista_pendiente', label: '📞 Entrevista Pendiente' },
        { value: 'entrevista_agendada', label: '📅 Entrevista Agendada' },
        { value: 'esperando_equipo', label: '🛒 Esperando Equipo' },
        { value: 'setup_pending', label: '⚙️ Setup Pendiente' },
        { value: 'setup_scheduled', label: '📅 Setup Agendado' },
        { value: 'trial_available', label: '🎓 Clase Disponible' },
        { value: 'trial_scheduled', label: '📆 Clase Agendada' },
        { value: 'completed', label: '✅ Completado' }
    ];
    
    const options = statuses.map(s => 
        `<option value="${s.value}" ${s.value === currentStatus ? 'selected' : ''}>${s.label}</option>`
    ).join('');
    
    const modalHtml = `
        <div id="change-status-modal" class="modal-overlay" style="display:flex;">
            <div class="modal-content" style="max-width:400px;">
                <div class="modal-header">
                    <h3>⚙️ Cambiar Estado</h3>
                    <button class="modal-close" onclick="closeChangeStatusModal()">×</button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label>Nuevo estado</label>
                        <select id="new-v2-status" class="form-input">
                            ${options}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Notas (opcional)</label>
                        <textarea id="status-change-notes" class="form-input" rows="2"></textarea>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="closeChangeStatusModal()">Cancelar</button>
                    <button class="btn btn-primary" onclick="confirmStatusChange('${orderId}')">💾 Guardar</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function closeChangeStatusModal() {
    document.getElementById('change-status-modal')?.remove();
}

async function confirmStatusChange(orderId) {
    const newStatus = document.getElementById('new-v2-status').value;
    const notes = document.getElementById('status-change-notes').value;
    
    // Si cambia a 'esperando_equipo', redirigir al modal de recomendaciones
    if (newStatus === 'esperando_equipo') {
        closeChangeStatusModal();
        openSendRecommendationsModal(orderId);
        showNotification('📧 Completa las recomendaciones para enviar el email al alumno', 'info');
        return;
    }
    
    try {
        const res = await fetch(`/api/welcome-kit/v2/${orderId}/status`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${userSession.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ status: newStatus, notes })
        });
        
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
        
        showNotification(`✅ Estado actualizado`, 'success');
        closeChangeStatusModal();
        loadV2OrdersList();
    } catch (error) {
        showNotification('Error: ' + error.message, 'error');
    }
}

async function resendRecommendations(orderId) {
    const order = v2Orders.find(o => o._id === orderId);
    if (!order) return;
    
    // Abrir el modal pre-llenado con datos guardados
    openSendRecommendationsModal(orderId);
    
    // Pre-llenar con datos guardados
    setTimeout(() => {
        if (order.cable?.keyboardModel) {
            document.getElementById('rec-keyboard-brand').value = order.cable.keyboardModel;
        }
        if (order.cable?.type) {
            const typeMap = { 'USB_B': 'USB-B', 'USB_C': 'USB-C', 'MIDI_5PIN': 'MIDI 5-pin' };
            document.getElementById('rec-connection-type').value = typeMap[order.cable.type] || 'USB-B';
        }
    }, 100);
}

async function loadWelcomeKitsModule() {
    // Cargar stats rápidos
    try {
        const [productsRes, ordersRes, v2Res] = await Promise.all([
            fetch('/api/welcome-kit/admin/products', {
                headers: { 'Authorization': `Bearer ${userSession.token}` }
            }),
            fetch('/api/welcome-kit/admin/orders', {
                headers: { 'Authorization': `Bearer ${userSession.token}` }
            }),
            fetch('/api/welcome-kit/v2/orders', {
                headers: { 'Authorization': `Bearer ${userSession.token}` }
            })
        ]);
        
        const productsData = await productsRes.json();
        const ordersData = await ordersRes.json();
        const v2Data = await v2Res.json();
        
        // Actualizar stats
        document.getElementById('kit-stat-products').textContent = productsData.products?.length || 0;
        
        // Stats de V2 Onboarding
        if (v2Data.success && v2Data.orders) {
            const v2orders = v2Data.orders;
            const pending = v2orders.filter(o => ['paid', 'entrevista_pendiente'].includes(o.overallStatus)).length;
            const waitingEquip = v2orders.filter(o => o.overallStatus === 'esperando_equipo').length;
            const setupReady = v2orders.filter(o => ['setup_pending', 'setup_scheduled'].includes(o.overallStatus)).length;
            const completed = v2orders.filter(o => o.overallStatus === 'completed').length;
            
            document.getElementById('kit-stat-pending').textContent = pending;
            document.getElementById('kit-stat-transit').textContent = waitingEquip;
            document.getElementById('kit-stat-delivered').textContent = setupReady;
            
            // Calcular revenue del mes (V2 orders)
            const thisMonth = new Date().getMonth();
            const revenue = v2orders
                .filter(o => new Date(o.createdAt).getMonth() === thisMonth)
                .reduce((sum, o) => sum + ((o.payment?.amount || 0) / 100), 0);
            document.getElementById('kit-stat-revenue').textContent = `$${revenue.toFixed(0)}`;
        } else if (ordersData.success && ordersData.orders) {
            // Fallback a legacy orders
            const orders = ordersData.orders;
            const pending = orders.filter(o => o.shippingStatus === 'pending' || o.shippingStatus === 'paid').length;
            const transit = orders.filter(o => o.shippingStatus === 'shipped').length;
            const delivered = orders.filter(o => o.shippingStatus === 'delivered').length;
            
            document.getElementById('kit-stat-pending').textContent = pending;
            document.getElementById('kit-stat-transit').textContent = transit;
            document.getElementById('kit-stat-delivered').textContent = delivered;
            
            const thisMonth = new Date().getMonth();
            const revenue = orders
                .filter(o => new Date(o.createdAt).getMonth() === thisMonth && o.paymentStatus === 'completed')
                .reduce((sum, o) => sum + (o.total || 0), 0);
            document.getElementById('kit-stat-revenue').textContent = `$${revenue.toFixed(0)}`;
        }
    } catch (error) {
        console.error('Error cargando stats:', error);
    }
    
    // Cargar V2 Onboarding por defecto (nuevo flujo)
    loadV2OrdersList();
    
    // Cargar config DSers
    loadDSersConfig();
}

async function loadKitProductsList() {
    const container = document.getElementById('kit-products-list');
    
    try {
        const res = await fetch('/api/welcome-kit/admin/products', {
            headers: { 'Authorization': `Bearer ${userSession.token}` }
        });
        const data = await res.json();
        
        if (!data.success || !data.products || data.products.length === 0) {
            container.innerHTML = `
                <div style="text-align:center; padding:60px 20px; color:#666;">
                    <div style="font-size:48px; margin-bottom:15px;">📦</div>
                    <p>No hay productos aún</p>
                    <p style="font-size:12px;">Agrega tu primer producto pegando una URL de AliExpress arriba</p>
                </div>
            `;
            return;
        }
        
        let html = '';
        data.products.forEach(product => {
            const provider = product.fulfillment?.provider || 'manual';
            const providerIcon = provider === 'aliexpress' ? '🛒' : provider === 'cjdropshipping' ? '📦' : '📝';
            const cost = product.fulfillment?.costPrice || 0;
            const margin = product.defaultPrice ? ((product.defaultPrice - cost) / product.defaultPrice * 100).toFixed(0) : 0;
            
            // Usar placeholder si no hay imagen o es inválida
            const hasImage = product.imageUrl && product.imageUrl.startsWith('http');
            const imageHtml = hasImage 
                ? `<img src="${product.imageUrl}" class="product-row-image" loading="lazy" 
                       onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                   <div class="product-row-placeholder" style="display:none;">📦</div>`
                : `<div class="product-row-placeholder">📦</div>`;
            
            html += `
                <div class="product-row">
                    <div class="product-row-img-container">
                        ${imageHtml}
                    </div>
                    <div class="product-row-info">
                        <div class="product-row-name">${product.name}</div>
                        <div class="product-row-meta">
                            <span>${providerIcon} ${provider}</span>
                            <span>💰 Costo: $${cost.toFixed(2)}</span>
                            <span>📈 Margen: ${margin}%</span>
                        </div>
                    </div>
                    <div class="product-row-price">$${(product.defaultPrice || 0).toFixed(2)}</div>
                    <div class="product-row-actions">
                        <button onclick="editKitProduct('${product._id}')" title="Editar">✏️</button>
                        <button class="delete" onclick="deleteKitProduct('${product._id}')" title="Eliminar">🗑️</button>
                    </div>
                </div>
            `;
        });
        
        container.innerHTML = html;
        
    } catch (error) {
        console.error('Error cargando productos:', error);
        container.innerHTML = '<p style="color:#666; text-align:center; padding:40px;">Error al cargar productos</p>';
    }
}

async function loadKitOrdersList() {
    const container = document.getElementById('kit-orders-list');
    const statsContainer = document.getElementById('orders-quick-stats');
    
    try {
        const res = await fetch('/api/welcome-kit/admin/orders', {
            headers: { 'Authorization': `Bearer ${userSession.token}` }
        });
        const data = await res.json();
        
        if (!data.success || !data.orders || data.orders.length === 0) {
            container.innerHTML = `
                <div style="text-align:center; padding:60px 20px; color:#666; background:#1a1a1a;">
                    <div style="font-size:48px; margin-bottom:15px;">🧾</div>
                    <p>No hay órdenes aún</p>
                    <p style="font-size:12px; color:#555;">Las órdenes aparecerán aquí cuando los clientes compren</p>
                </div>
            `;
            if (statsContainer) statsContainer.innerHTML = '';
            allKitsData = [];
            return;
        }
        
        // Guardar datos para uso en modales
        allKitsData = data.orders;
        
        // Calcular estadísticas
        const stats = {
            total: data.orders.length,
            pending: data.orders.filter(o => ['pending', 'paid', 'processing'].includes(o.shippingStatus)).length,
            shipped: data.orders.filter(o => o.shippingStatus === 'shipped').length,
            delivered: data.orders.filter(o => o.shippingStatus === 'delivered').length,
            revenue: data.orders.reduce((sum, o) => sum + (o.total || 0), 0)
        };
        
        // Mostrar stats rápidos
        if (statsContainer) {
            statsContainer.innerHTML = `
                <div style="background:#1a1a2e; padding:6px 12px; border-radius:6px; color:#888;">
                    <span style="color:#fff; font-weight:600;">${stats.total}</span> órdenes
                </div>
                <div style="background:rgba(34,197,94,0.1); padding:6px 12px; border-radius:6px; color:#22c55e;">
                    <span style="font-weight:600;">$${stats.revenue.toFixed(2)}</span> total
                </div>
            `;
        }
        
        renderOrdersTable(data.orders);
        
    } catch (error) {
        console.error('Error cargando órdenes:', error);
        container.innerHTML = '<p style="color:#666; text-align:center; padding:40px; background:#1a1a1a;">Error al cargar órdenes</p>';
    }
}

function renderOrdersTable(orders) {
    const container = document.getElementById('kit-orders-list');
    
    const statusConfig = {
        'pending_payment': { icon: '⏳', label: 'Pago pendiente', color: '#ef4444' },
        'pending': { icon: '💳', label: 'Por enviar', color: '#f59e0b' },
        'paid': { icon: '💳', label: 'Por enviar', color: '#f59e0b' },
        'processing': { icon: '📦', label: 'Preparando', color: '#f59e0b' },
        'shipped': { icon: '🚚', label: 'En camino', color: '#3b82f6' },
        'delivered': { icon: '✅', label: 'Entregado', color: '#22c55e' }
    };
    
    let html = '';
    orders.forEach((order, index) => {
        const status = statusConfig[order.shippingStatus] || statusConfig['pending'];
        const date = new Date(order.createdAt).toLocaleDateString('es-CL', { day: '2-digit', month: 'short' });
        const isEven = index % 2 === 0;
        
        // Shipping info
        let shippingHtml = '';
        if (order.trackingNumber) {
            const trackingLink = order.trackingUrl 
                ? `<a href="${order.trackingUrl}" target="_blank" style="color:#3b82f6; text-decoration:none; font-weight:500;">${order.trackingNumber}</a>`
                : `<span style="font-family:monospace;">${order.trackingNumber}</span>`;
            
            shippingHtml = `
                <div style="font-size:12px;">
                    <div style="color:#888; font-size:10px; text-transform:uppercase;">${order.carrier || 'Tracking'}</div>
                    ${trackingLink}
                </div>
            `;
            
            // Estimated delivery
            if (order.estimatedDelivery && order.shippingStatus !== 'delivered') {
                const estDate = new Date(order.estimatedDelivery).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' });
                shippingHtml += `<div style="font-size:10px; color:#666; margin-top:2px;">📅 Est: ${estDate}</div>`;
            }
            if (order.deliveredAt) {
                const delDate = new Date(order.deliveredAt).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' });
                shippingHtml += `<div style="font-size:10px; color:#22c55e; margin-top:2px;">✓ ${delDate}</div>`;
            }
        } else {
            shippingHtml = `<span style="color:#555; font-size:11px;">Sin tracking</span>`;
        }
        
        // Products info
        const productCount = order.products?.length || 0;
        const productNames = order.products?.map(p => p.name).join(', ') || 'Servicio';
        const productsHtml = productCount > 0 
            ? `<div style="font-size:12px; color:#fff;">${productCount} producto${productCount > 1 ? 's' : ''}</div>
               <div style="font-size:10px; color:#666; max-width:100px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${productNames}">${productNames}</div>`
            : `<span style="color:#666; font-size:11px;">Solo servicio</span>`;
        
        // Client confirmation badge
        let confirmBadge = '';
        if (order.clientConfirmedReceipt) {
            confirmBadge = `<div style="width:8px; height:8px; background:#22c55e; border-radius:50%; margin-left:4px;" title="Cliente confirmó recepción"></div>`;
        }
        
        // Location
        const location = [order.city, order.country].filter(Boolean).join(', ') || 'N/A';
        
        html += `
            <div class="order-row" data-order-id="${order._id}" data-status="${order.shippingStatus}" 
                style="display:grid; grid-template-columns: 50px 1.5fr 1fr 120px 100px 90px 50px; gap:12px; align-items:center; padding:14px 16px; background:${isEven ? '#1a1a1a' : '#151515'}; border-bottom:1px solid #2a2a2a; cursor:pointer; transition:background 0.2s;"
                onmouseover="this.style.background='#252525'" onmouseout="this.style.background='${isEven ? '#1a1a1a' : '#151515'}'"
                onclick="toggleOrderDetails('${order._id}')">
                
                <!-- Status Icon -->
                <div style="width:40px; height:40px; border-radius:10px; display:flex; align-items:center; justify-content:center; font-size:18px; background:${status.color}15; border:1px solid ${status.color}30;">
                    ${status.icon}
                </div>
                
                <!-- Cliente -->
                <div style="min-width:0;">
                    <div style="display:flex; align-items:center; gap:4px;">
                        <span style="font-weight:600; color:#fff; font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${order.customerName}</span>
                        ${confirmBadge}
                    </div>
                    <div style="font-size:11px; color:#666; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${order.email}</div>
                    <div style="font-size:10px; color:#555; margin-top:2px;">📍 ${location}</div>
                </div>
                
                <!-- Envío -->
                <div style="min-width:0;">
                    ${shippingHtml}
                </div>
                
                <!-- Productos -->
                <div>
                    ${productsHtml}
                </div>
                
                <!-- Total -->
                <div style="text-align:right;">
                    <div style="font-weight:700; color:#fff; font-size:14px;">$${(order.total || 0).toFixed(2)}</div>
                    <div style="font-size:10px; color:#555;">${date}</div>
                </div>
                
                <!-- Estado -->
                <div style="padding:5px 10px; border-radius:6px; font-size:10px; font-weight:600; background:${status.color}15; color:${status.color}; text-align:center; white-space:nowrap;">
                    ${status.label}
                </div>
                
                <!-- Acciones -->
                <button onclick="event.stopPropagation(); openShippingModal('${order._id}')" 
                    style="padding:8px 10px; background:#2a2a2a; border:none; border-radius:6px; color:#888; cursor:pointer; font-size:12px; transition:all 0.2s;"
                    onmouseover="this.style.background='#3b82f6'; this.style.color='#fff';" 
                    onmouseout="this.style.background='#2a2a2a'; this.style.color='#888';"
                    title="Actualizar envío">
                    ✏️
                </button>
            </div>
            
            <!-- Detalles expandibles -->
            <div id="order-details-${order._id}" class="order-details-panel" style="display:none; padding:16px 20px 16px 66px; background:#111; border-bottom:1px solid #2a2a2a;">
                <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:20px;">
                    <!-- Info de contacto -->
                    <div>
                        <div style="font-size:10px; color:#666; text-transform:uppercase; margin-bottom:6px;">Contacto</div>
                        <div style="font-size:12px; color:#fff;">${order.phone || 'Sin teléfono'}</div>
                        <div style="font-size:11px; color:#888; margin-top:4px;">${order.email}</div>
                    </div>
                    
                    <!-- Dirección -->
                    <div>
                        <div style="font-size:10px; color:#666; text-transform:uppercase; margin-bottom:6px;">Dirección de Envío</div>
                        <div style="font-size:12px; color:#fff;">${order.address || 'N/A'}</div>
                        <div style="font-size:11px; color:#888;">${[order.city, order.state, order.postalCode, order.country].filter(Boolean).join(', ')}</div>
                    </div>
                    
                    <!-- Kit Type -->
                    <div>
                        <div style="font-size:10px; color:#666; text-transform:uppercase; margin-bottom:6px;">Tipo de Kit</div>
                        <div style="font-size:12px; color:#fff;">${order.kitType || 'standard'}</div>
                    </div>
                    
                    <!-- Confirmación cliente -->
                    <div>
                        <div style="font-size:10px; color:#666; text-transform:uppercase; margin-bottom:6px;">Confirmación Cliente</div>
                        ${order.clientConfirmedReceipt 
                            ? `<div style="display:inline-flex; align-items:center; gap:6px; padding:4px 10px; background:rgba(34,197,94,0.15); color:#22c55e; border-radius:6px; font-size:11px; font-weight:500;">
                                ✓ Confirmado ${order.clientConfirmedAt ? new Date(order.clientConfirmedAt).toLocaleDateString('es-CL') : ''}
                               </div>`
                            : `<div style="font-size:12px; color:#666;">Pendiente</div>`
                        }
                    </div>
                </div>
                
                <!-- Productos detallados -->
                ${order.products && order.products.length > 0 ? `
                    <div style="margin-top:16px; padding-top:16px; border-top:1px solid #2a2a2a;">
                        <div style="font-size:10px; color:#666; text-transform:uppercase; margin-bottom:8px;">Productos del Kit</div>
                        <div style="display:flex; flex-wrap:wrap; gap:8px;">
                            ${order.products.map(p => `
                                <div style="display:flex; align-items:center; gap:8px; padding:6px 10px; background:#1a1a1a; border-radius:6px;">
                                    ${p.image ? `<img src="${p.image}" style="width:24px; height:24px; object-fit:cover; border-radius:4px;">` : ''}
                                    <span style="font-size:11px; color:#fff;">${p.name}</span>
                                    <span style="font-size:10px; color:#666;">x${p.quantity || 1}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
    });
    
    container.innerHTML = html;
}

function toggleOrderDetails(orderId) {
    const panel = document.getElementById(`order-details-${orderId}`);
    if (panel) {
        const isVisible = panel.style.display !== 'none';
        // Cerrar todos los demás
        document.querySelectorAll('.order-details-panel').forEach(p => p.style.display = 'none');
        // Toggle este
        panel.style.display = isVisible ? 'none' : 'block';
    }
}

function filterKitOrders(filter) {
    document.querySelectorAll('[data-order-filter]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.orderFilter === filter);
    });
    // Cargar órdenes con filtro
    loadKitOrdersListFiltered(filter);
}

async function loadKitOrdersListFiltered(filter = 'all') {
    const container = document.getElementById('kit-orders-list');
    
    try {
        let url = '/api/welcome-kit/admin/orders';
        if (filter !== 'all') {
            url += `?status=${filter}`;
        }
        
        const res = await fetch(url, {
            headers: { 'Authorization': `Bearer ${userSession.token}` }
        });
        const data = await res.json();
        
        if (!data.success || !data.orders || data.orders.length === 0) {
            container.innerHTML = `
                <div style="text-align:center; padding:60px 20px; color:#666; background:#1a1a1a;">
                    <div style="font-size:48px; margin-bottom:15px;">🧾</div>
                    <p>No hay órdenes ${filter !== 'all' ? 'con este filtro' : 'aún'}</p>
                </div>
            `;
            return;
        }
        
        // Filtrar localmente si es necesario (clientConfirmed)
        let orders = data.orders;
        if (filter === 'confirmed') {
            orders = orders.filter(o => o.clientConfirmedReceipt === true);
        }
        
        if (orders.length === 0) {
            container.innerHTML = `
                <div style="text-align:center; padding:60px 20px; color:#666; background:#1a1a1a;">
                    <div style="font-size:48px; margin-bottom:15px;">🧾</div>
                    <p>No hay órdenes con este filtro</p>
                </div>
            `;
            return;
        }
        
        // Usar la misma función de renderizado
        renderOrdersTable(orders);
        
    } catch (error) {
        console.error('Error cargando órdenes:', error);
        container.innerHTML = '<p style="color:#666; text-align:center; padding:40px; background:#1a1a1a;">Error al cargar órdenes</p>';
    }
}

async function loadServicePricing() {
    const container = document.getElementById('service-pricing-grid');
    
    try {
        const res = await fetch('/api/welcome-kit/admin/pricing', {
            headers: { 'Authorization': `Bearer ${userSession.token}` }
        });
        const data = await res.json();
        
        // Usar setupOnlyPricing (servicio unificado: Setup + Clase)
        const setupPrices = data.setupOnlyPricing || [
            { regionCode: 'DEFAULT', price: 10, currency: 'USD' }
        ];
        
        const flags = {
            'DEFAULT': '🌍', 'CL': '🇨🇱', 'US': '🇺🇸', 'MX': '🇲🇽', 
            'AR': '🇦🇷', 'CO': '🇨🇴', 'ES': '🇪🇸', 'PE': '🇵🇪', 'BR': '🇧🇷',
            'UY': '🇺🇾', 'EC': '🇪🇨', 'BO': '🇧🇴', 'PY': '🇵🇾', 'VE': '🇻🇪'
        };
        
        const names = {
            'DEFAULT': 'Por Defecto', 'CL': 'Chile', 'US': 'Estados Unidos', 'MX': 'México',
            'AR': 'Argentina', 'CO': 'Colombia', 'ES': 'España', 'PE': 'Perú', 'BR': 'Brasil',
            'UY': 'Uruguay', 'EC': 'Ecuador', 'BO': 'Bolivia', 'PY': 'Paraguay', 'VE': 'Venezuela'
        };
        
        let html = '';
        setupPrices.forEach((p) => {
            const code = p.regionCode;
            html += `
                <div class="service-price-row" data-country="${code}" style="display:flex; align-items:center; gap:12px; padding:12px 15px; background:rgba(59,130,246,0.08); border-radius:8px; border:1px solid #333;">
                    <span style="font-size:20px;">${flags[code] || '🏳️'}</span>
                    <span style="font-weight:600; color:#fff; min-width:120px;">${names[code] || code}</span>
                    <span style="color:#666; font-size:12px;">(${code})</span>
                    <div style="margin-left:auto; display:flex; align-items:center; gap:8px;">
                        <input type="number" class="service-price form-input" value="${p.price || 10}" min="0" step="0.5" 
                               style="width:80px; text-align:center; font-weight:700; font-size:16px;">
                        <select class="service-currency form-input" style="width:70px;">
                            <option value="USD" ${p.currency === 'USD' ? 'selected' : ''}>USD</option>
                            <option value="EUR" ${p.currency === 'EUR' ? 'selected' : ''}>EUR</option>
                        </select>
                        ${code !== 'DEFAULT' ? `<button class="btn btn-icon" onclick="removeServicePrice('${code}')" style="color:#ef4444; padding:5px;" title="Eliminar">✕</button>` : ''}
                    </div>
                </div>
            `;
        });
        
        container.innerHTML = html || '<p style="color:#666; text-align:center; padding:20px;">No hay precios configurados</p>';
        
        // Cargar márgenes desde CJ config
        const cjRes = await fetch('/api/welcome-kit/admin/cj/config', {
            headers: { 'Authorization': `Bearer ${userSession.token}` }
        });
        const cjData = await cjRes.json();
        const margins = cjData.config?.pricing?.margins || {};
        document.getElementById('margin-cable').value = margins.cable || 40;
        document.getElementById('margin-keyboard').value = margins.keyboard || 25;
        document.getElementById('margin-accessory').value = margins.accessory || 35;
        
    } catch (error) {
        console.error('Error cargando precios:', error);
        container.innerHTML = '<p style="color:#ef4444; text-align:center; padding:20px;">Error cargando precios</p>';
    }
}

async function addServicePrice() {
    const country = document.getElementById('new-price-country').value.toUpperCase().trim();
    const countryName = document.getElementById('new-price-country-name').value.trim();
    const price = parseFloat(document.getElementById('new-price-amount').value) || 10;
    const currency = document.getElementById('new-price-currency').value || 'USD';
    
    if (!country || country.length !== 2) {
        showNotification('Ingresa un código de país válido (2 letras)', 'error');
        return;
    }
    
    if (!countryName) {
        showNotification('Ingresa el nombre del país', 'error');
        return;
    }
    
    // Verificar si ya existe
    if (document.querySelector(`.service-price-row[data-country="${country}"]`)) {
        showNotification(`El país ${country} ya existe`, 'error');
        return;
    }
    
    const flags = { 
        'CL': '🇨🇱', 'US': '🇺🇸', 'MX': '🇲🇽', 'AR': '🇦🇷', 'CO': '🇨🇴', 'ES': '🇪🇸', 
        'PE': '🇵🇪', 'BR': '🇧🇷', 'UY': '🇺🇾', 'EC': '🇪🇨', 'BO': '🇧🇴', 'PY': '🇵🇾', 
        'VE': '🇻🇪', 'CR': '🇨🇷', 'PA': '🇵🇦', 'GT': '🇬🇹', 'HN': '🇭🇳', 'NI': '🇳🇮',
        'DO': '🇩🇴', 'CU': '🇨🇺', 'PR': '🇵🇷', 'CA': '🇨🇦', 'UK': '🇬🇧', 'FR': '🇫🇷',
        'DE': '🇩🇪', 'IT': '🇮🇹', 'PT': '🇵🇹'
    };
    
    const container = document.getElementById('service-pricing-grid');
    const newRow = document.createElement('div');
    newRow.className = 'service-price-row';
    newRow.dataset.country = country;
    newRow.style.cssText = 'display:flex; align-items:center; gap:12px; padding:12px 15px; background:rgba(34,197,94,0.1); border-radius:8px; border:1px solid #22c55e;';
    newRow.innerHTML = `
        <span style="font-size:20px;">${flags[country] || '🏳️'}</span>
        <span style="font-weight:600; color:#fff; min-width:120px;">${countryName}</span>
        <span style="color:#666; font-size:12px;">(${country})</span>
        <div style="margin-left:auto; display:flex; align-items:center; gap:8px;">
            <input type="number" class="service-price form-input" value="${price}" min="0" step="0.5" 
                   style="width:80px; text-align:center; font-weight:700; font-size:16px;">
            <select class="service-currency form-input" style="width:70px;">
                <option value="USD" ${currency === 'USD' ? 'selected' : ''}>USD</option>
                <option value="EUR" ${currency === 'EUR' ? 'selected' : ''}>EUR</option>
            </select>
            <button class="btn btn-icon" onclick="removeServicePrice('${country}')" style="color:#ef4444; padding:5px;" title="Eliminar">✕</button>
        </div>
    `;
    container.appendChild(newRow);
    
    // Limpiar inputs
    document.getElementById('new-price-country').value = '';
    document.getElementById('new-price-country-name').value = '';
    document.getElementById('new-price-amount').value = '';
    
    showNotification(`✅ País ${countryName} (${country}) agregado. Guarda para confirmar.`, 'success');
}

function removeServicePrice(country) {
    const row = document.querySelector(`.service-price-row[data-country="${country}"]`);
    if (row) {
        row.remove();
        showNotification(`País ${country} eliminado. Guarda para confirmar.`, 'info');
    }
}

async function saveAllPricing() {
    try {
        showNotification('Guardando precios...', 'info');
        
        // Recolectar precios de servicios del grid
        const setupOnlyPricing = [];
        document.querySelectorAll('.service-price-row').forEach(row => {
            const country = row.dataset.country;
            const price = parseFloat(row.querySelector('.service-price').value) || 10;
            const currency = row.querySelector('.service-currency').value || 'USD';
            setupOnlyPricing.push({
                regionCode: country,
                price: price,
                currency: currency,
                description: 'Setup técnico + Clase de prueba 30min'
            });
        });
        
        // Guardar precios de servicios
        const priceRes = await fetch('/api/welcome-kit/admin/pricing', {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${userSession.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ setupOnlyPricing })
        });
        
        const priceData = await priceRes.json();
        if (!priceData.success) {
            throw new Error(priceData.error || 'Error guardando precios');
        }
        
        // Recolectar y guardar márgenes
        const margins = {
            cable: parseFloat(document.getElementById('margin-cable').value) || 40,
            keyboard: parseFloat(document.getElementById('margin-keyboard').value) || 25,
            accessory: parseFloat(document.getElementById('margin-accessory').value) || 35
        };
        
        // Obtener config actual de CJ
        const getRes = await fetch('/api/welcome-kit/admin/cj/config', {
            headers: { 'Authorization': `Bearer ${userSession.token}` }
        });
        const currentData = await getRes.json();
        
        if (currentData.success) {
            const pricing = currentData.config?.pricing || {};
            pricing.margins = margins;
            
            await fetch('/api/welcome-kit/admin/cj/config', {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${userSession.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    skus: currentData.config?.skus || {},
                    pricing
                })
            });
        }
        
        showNotification('✅ Configuración guardada correctamente', 'success');
        
        // Recargar para reflejar cambios
        loadServicePricing();
        
    } catch (error) {
        console.error('Error guardando precios:', error);
        showNotification(`❌ Error: ${error.message}`, 'error');
    }
}

async function loadDSersConfig() {
    try {
        const res = await fetch('/api/welcome-kit/admin/dsers/config', {
            headers: { 'Authorization': `Bearer ${userSession.token}` }
        });
        const data = await res.json();
        
        if (data.success && data.config) {
            document.getElementById('dsers-config-affiliate').value = data.config.affiliateTrackingId || '';
            document.getElementById('dsers-config-margin').value = data.config.defaultMargin || 40;
        }
    } catch (error) {
        console.error('Error cargando config DSers:', error);
    }
}

async function quickAddFromUrl() {
    const url = document.getElementById('quick-add-url').value.trim();
    
    if (!url) {
        showNotification('Pega una URL de AliExpress', 'error');
        return;
    }
    
    if (!url.includes('aliexpress.com')) {
        showNotification('La URL debe ser de aliexpress.com', 'error');
        return;
    }
    
    // Abrir modal con la URL pre-llenada
    openQuickAddProduct(url);
}

function openQuickAddProduct(prefilledUrl = '') {
    const url = prefilledUrl || document.getElementById('quick-add-url')?.value || '';
    const defaultMargin = parseInt(document.getElementById('dsers-config-margin')?.value) || 40;
    
    // Tipo de cambio CLP -> USD (actualizar según mercado)
    const CLP_TO_USD = 950;
    
    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.innerHTML = `
        <div class="modal-content" style="max-width:520px;">
            <div class="modal-header">
                <h3>➕ Agregar Producto de AliExpress</h3>
                <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
            </div>
            <div class="modal-body" style="display:grid; gap:15px;">
                
                <div style="background:linear-gradient(135deg, #1a1a2e, #16213e); border-radius:10px; padding:15px; border:1px solid #333;">
                    <p style="color:#888; font-size:12px; margin:0 0 10px 0;">
                        📋 <strong>Copia estos datos desde AliExpress:</strong>
                    </p>
                    <ol style="color:#aaa; font-size:11px; margin:0; padding-left:20px; line-height:1.8;">
                        <li>Abre el producto en AliExpress</li>
                        <li>Copia la URL, nombre, precio (CLP) e imagen</li>
                        <li>Pégalos aquí abajo</li>
                    </ol>
                </div>

                <div>
                    <label style="font-size:12px; color:#888;">URL de AliExpress *</label>
                    <input type="url" id="modal-product-url" class="form-input" value="${url}" 
                           placeholder="https://aliexpress.com/item/123456.html">
                </div>
                
                <div>
                    <label style="font-size:12px; color:#888;">Nombre del Producto *</label>
                    <input type="text" id="modal-product-name" class="form-input" 
                           placeholder="Ej: Cable MIDI USB Tipo-C para Teclado Piano">
                </div>
                
                <div>
                    <label style="font-size:12px; color:#888;">URL de Imagen (clic derecho → copiar dirección de imagen)</label>
                    <input type="url" id="modal-product-image" class="form-input" 
                           placeholder="https://ae01.alicdn.com/...">
                </div>
                
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px;">
                    <div>
                        <label style="font-size:12px; color:#888;">💰 Precio AliExpress (CLP) *</label>
                        <input type="number" id="modal-product-price-clp" class="form-input" 
                               placeholder="2500" min="0" style="font-size:16px;">
                        <p style="font-size:10px; color:#666; margin:3px 0 0 0;">El precio que ves en pesos chilenos</p>
                    </div>
                    <div>
                        <label style="font-size:12px; color:#888;">📈 Tu Margen (%)</label>
                        <input type="number" id="modal-product-margin" class="form-input" 
                               value="${defaultMargin}" min="0" max="500" style="font-size:16px;">
                        <p style="font-size:10px; color:#666; margin:3px 0 0 0;">Ganancia sobre el costo</p>
                    </div>
                </div>
                
                <div>
                    <label style="font-size:12px; color:#888;">Categoría</label>
                    <select id="modal-product-category" class="form-input">
                        <option value="cable">🔌 Cable</option>
                        <option value="keyboard">🎹 Teclado</option>
                        <option value="stand">🪜 Soporte</option>
                        <option value="pedal">🦶 Pedal</option>
                        <option value="accessory">🎧 Accesorio</option>
                    </select>
                </div>
                
                <div style="background:rgba(39,174,96,0.15); padding:15px; border-radius:10px; border:1px solid var(--accent-green);">
                    <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; text-align:center;">
                        <div>
                            <div style="font-size:10px; color:#888;">Costo USD</div>
                            <div id="preview-cost-usd" style="font-size:18px; font-weight:600; color:#3498db;">$0.00</div>
                        </div>
                        <div>
                            <div style="font-size:10px; color:#888;">Precio Venta</div>
                            <div id="preview-sale-price" style="font-size:22px; font-weight:700; color:var(--accent-green);">$0.00</div>
                        </div>
                        <div>
                            <div style="font-size:10px; color:#888;">Tu Ganancia</div>
                            <div id="preview-profit" style="font-size:18px; font-weight:600; color:#27ae60;">+$0.00</div>
                        </div>
                    </div>
                    <div style="text-align:center; margin-top:8px;">
                        <span style="font-size:10px; color:#666;">Tipo de cambio: 1 USD = ${CLP_TO_USD} CLP</span>
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
                <button class="btn btn-primary" onclick="saveQuickProduct()">💾 Agregar Producto</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Eventos para actualizar preview
    const clpInput = document.getElementById('modal-product-price-clp');
    const marginInput = document.getElementById('modal-product-margin');
    
    function updatePreview() {
        const clp = parseFloat(clpInput.value) || 0;
        const costUsd = clp / CLP_TO_USD;
        const margin = parseFloat(marginInput.value) || 0;
        const salePrice = costUsd * (1 + margin / 100);
        const profit = salePrice - costUsd;
        
        document.getElementById('preview-cost-usd').textContent = `$${costUsd.toFixed(2)}`;
        document.getElementById('preview-sale-price').textContent = `$${salePrice.toFixed(2)}`;
        document.getElementById('preview-profit').textContent = `+$${profit.toFixed(2)}`;
    }
    
    clpInput.addEventListener('input', updatePreview);
    marginInput.addEventListener('input', updatePreview);
    updatePreview();
}

async function saveQuickProduct() {
    const url = document.getElementById('modal-product-url').value.trim();
    const name = document.getElementById('modal-product-name').value.trim();
    const image = document.getElementById('modal-product-image')?.value.trim() || '';
    const priceCLP = parseFloat(document.getElementById('modal-product-price-clp').value) || 0;
    const margin = parseFloat(document.getElementById('modal-product-margin').value) || 40;
    const category = document.getElementById('modal-product-category').value;
    
    // Convertir CLP a USD
    const CLP_TO_USD = 950;
    const costUSD = priceCLP / CLP_TO_USD;
    
    if (!url || !name || !priceCLP) {
        showNotification('Completa URL, nombre y precio', 'error');
        return;
    }
    
    if (!url.includes('aliexpress')) {
        showNotification('La URL debe ser de AliExpress', 'error');
        return;
    }
    
    try {
        const res = await fetch('/api/welcome-kit/admin/products/aliexpress', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${userSession.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name,
                aliexpressUrl: url,
                imageUrl: image,
                price: costUSD,  // Enviamos en USD
                margin,
                category
            })
        });
        
        const data = await res.json();
        
        if (data.success) {
            showNotification('✅ Producto agregado!', 'success');
            document.querySelector('.modal-overlay.active')?.remove();
            document.getElementById('quick-add-url').value = '';
            loadKitProductsList();
            
            // Actualizar stat
            const statEl = document.getElementById('kit-stat-products');
            statEl.textContent = parseInt(statEl.textContent) + 1;
        } else {
            showNotification(data.error || 'Error al agregar', 'error');
        }
        
    } catch (error) {
        console.error('Error:', error);
        showNotification('Error al agregar producto', 'error');
    }
}

async function deleteKitProduct(productId) {
    if (!confirm('¿Eliminar este producto?')) return;
    
    try {
        const res = await fetch(`/api/welcome-kit/admin/products/${productId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${userSession.token}` }
        });
        
        if (res.ok) {
            showNotification('Producto eliminado', 'success');
            loadKitProductsList();
        }
    } catch (error) {
        showNotification('Error al eliminar', 'error');
    }
}

async function editKitProduct(productId) {
    try {
        // Obtener datos del producto
        const res = await fetch(`/api/welcome-kit/admin/products/${productId}`, {
            headers: { 'Authorization': `Bearer ${userSession.token}` }
        });
        const data = await res.json();
        
        if (!data.success || !data.product) {
            showNotification('No se pudo cargar el producto', 'error');
            return;
        }
        
        const p = data.product;
        const cost = p.fulfillment?.costPrice || 0;
        const margin = p.defaultPrice && cost ? Math.round(((p.defaultPrice / cost) - 1) * 100) : 40;
        
        const modal = document.createElement('div');
        modal.className = 'modal-overlay active';
        modal.innerHTML = `
            <div class="modal-content" style="max-width:520px;">
                <div class="modal-header">
                    <h3>✏️ Editar Producto</h3>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
                </div>
                <div class="modal-body" style="display:grid; gap:15px;">
                    <div>
                        <label style="font-size:12px; color:#888;">Nombre del Producto *</label>
                        <input type="text" id="edit-product-name" class="form-input" value="${p.name || ''}">
                    </div>
                    
                    <div>
                        <label style="font-size:12px; color:#888;">URL de Imagen</label>
                        <input type="url" id="edit-product-image" class="form-input" 
                               value="${p.imageUrl || ''}" placeholder="https://ae01.alicdn.com/...">
                        <p style="font-size:10px; color:#666; margin:3px 0 0 0;">Clic derecho en imagen de AliExpress → Abrir en nueva pestaña → Copiar URL</p>
                    </div>
                    
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px;">
                        <div>
                            <label style="font-size:12px; color:#888;">💰 Costo (USD)</label>
                            <input type="number" id="edit-product-cost" class="form-input" 
                                   value="${cost.toFixed(2)}" step="0.01" min="0">
                        </div>
                        <div>
                            <label style="font-size:12px; color:#888;">📈 Margen (%)</label>
                            <input type="number" id="edit-product-margin" class="form-input" 
                                   value="${margin}" min="0" max="500">
                        </div>
                    </div>
                    
                    <div>
                        <label style="font-size:12px; color:#888;">Categoría</label>
                        <select id="edit-product-category" class="form-input">
                            <option value="cable" ${p.category === 'cable' ? 'selected' : ''}>🔌 Cable</option>
                            <option value="keyboard" ${p.category === 'keyboard' ? 'selected' : ''}>🎹 Teclado</option>
                            <option value="stand" ${p.category === 'stand' ? 'selected' : ''}>🪜 Soporte</option>
                            <option value="pedal" ${p.category === 'pedal' ? 'selected' : ''}>🦶 Pedal</option>
                            <option value="accessory" ${p.category === 'accessory' ? 'selected' : ''}>🎧 Accesorio</option>
                        </select>
                    </div>
                    
                    <div style="background:rgba(52,152,219,0.15); padding:12px; border-radius:8px; border:1px solid #3498db;">
                        <div style="display:flex; justify-content:space-between;">
                            <span style="color:#888; font-size:12px;">Precio de Venta:</span>
                            <span id="edit-price-preview" style="font-weight:700; color:#3498db;">$${(p.defaultPrice || 0).toFixed(2)}</span>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
                    <button class="btn btn-primary" onclick="saveEditedProduct('${productId}')">💾 Guardar</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Actualizar preview de precio
        const costInput = document.getElementById('edit-product-cost');
        const marginInput = document.getElementById('edit-product-margin');
        const preview = document.getElementById('edit-price-preview');
        
        function updateEditPreview() {
            const c = parseFloat(costInput.value) || 0;
            const m = parseFloat(marginInput.value) || 0;
            const price = c * (1 + m / 100);
            preview.textContent = `$${price.toFixed(2)}`;
        }
        
        costInput.addEventListener('input', updateEditPreview);
        marginInput.addEventListener('input', updateEditPreview);
        
    } catch (error) {
        console.error('Error:', error);
        showNotification('Error al cargar producto', 'error');
    }
}

async function saveEditedProduct(productId) {
    const name = document.getElementById('edit-product-name').value.trim();
    const imageUrl = document.getElementById('edit-product-image').value.trim();
    const cost = parseFloat(document.getElementById('edit-product-cost').value) || 0;
    const margin = parseFloat(document.getElementById('edit-product-margin').value) || 40;
    const category = document.getElementById('edit-product-category').value;
    
    if (!name) {
        showNotification('El nombre es requerido', 'error');
        return;
    }
    
    try {
        const res = await fetch(`/api/welcome-kit/admin/products/${productId}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${userSession.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name, imageUrl, cost, margin, category })
        });
        
        const data = await res.json();
        
        if (data.success) {
            showNotification('✅ Producto actualizado', 'success');
            document.querySelector('.modal-overlay.active')?.remove();
            loadKitProductsList();
        } else {
            showNotification(data.error || 'Error al guardar', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showNotification('Error al guardar', 'error');
    }
}

function syncDSersOrders() {
    // Ahora redirige al modal de importar
    openImportTrackingModal();
}

function openImportTrackingModal() {
    document.getElementById('import-tracking-content').value = '';
    document.getElementById('import-tracking-results').style.display = 'none';
    openModal('import-tracking-modal');
}

async function importTrackings() {
    const content = document.getElementById('import-tracking-content').value.trim();
    
    if (!content) {
        showNotification('Pega el contenido del CSV o los trackings', 'warning');
        return;
    }
    
    const resultsDiv = document.getElementById('import-tracking-results');
    resultsDiv.innerHTML = '<div style="color:#888;">⏳ Importando...</div>';
    resultsDiv.style.display = 'block';
    
    try {
        const res = await fetch('/api/welcome-kit/admin/dsers/import-tracking', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${userSession.token}`
            },
            body: JSON.stringify({ csvContent: content })
        });
        
        const result = await res.json();
        
        if (result.success) {
            resultsDiv.innerHTML = `
                <div style="background:rgba(34,197,94,0.15); padding:12px; border-radius:8px;">
                    <div style="color:#22c55e; font-weight:600; margin-bottom:8px;">✅ Importación completada</div>
                    <div style="color:#fff;">• <strong>${result.results.updated}</strong> órdenes actualizadas</div>
                    ${result.results.notFound > 0 ? `<div style="color:#f59e0b;">• ${result.results.notFound} órdenes no encontradas</div>` : ''}
                    ${result.results.errors.length > 0 ? `<div style="color:#ef4444; font-size:11px; margin-top:8px;">${result.results.errors.slice(0,3).join('<br>')}</div>` : ''}
                </div>
            `;
            
            showNotification(`${result.results.updated} trackings importados`, 'success');
            
            // Recargar lista de órdenes
            loadKitOrdersList();
            loadWelcomeKitsModule();
        } else {
            resultsDiv.innerHTML = `
                <div style="background:rgba(239,68,68,0.15); padding:12px; border-radius:8px; color:#ef4444;">
                    ❌ Error: ${result.error}
                </div>
            `;
        }
    } catch (error) {
        console.error('Error importando:', error);
        resultsDiv.innerHTML = `
            <div style="background:rgba(239,68,68,0.15); padding:12px; border-radius:8px; color:#ef4444;">
                ❌ Error de conexión
            </div>
        `;
    }
}

// ==================== MÓDULO DE CLIENTES / APODERADOS ====================
let allClientsData = [];
let currentClientFilter = 'all';
let currentClientId = null;

async function loadClients() {
    try {
        const res = await fetch('/admin/clients', {
            headers: { 'Authorization': `Bearer ${userSession.token}` }
        });
        
        if (!res.ok) throw new Error('Error cargando clientes');
        
        allClientsData = await res.json();
        
        // Calcular stats
        const individuals = allClientsData.filter(c => c.clientData?.accountType !== 'guardian');
        const guardians = allClientsData.filter(c => c.clientData?.accountType === 'guardian');
        
        // Contar hijos totales
        const totalChildren = allClientsData.reduce((sum, c) => {
            return sum + (c.clientData?.managedStudents?.length || 0);
        }, 0);
        
        // Contar clientes con clases activas
        const activeClients = allClientsData.filter(c => {
            if (c.clientData?.accountType === 'guardian') {
                return (c.clientData.managedStudents || []).some(s => s.classesRemaining > 0);
            }
            return c.classesRemaining > 0;
        });
        
        // Contar total de clases disponibles
        const totalClasses = allClientsData.reduce((sum, c) => {
            if (c.clientData?.accountType === 'guardian') {
                return sum + (c.clientData.managedStudents || []).reduce((s, child) => s + (child.classesRemaining || 0), 0);
            }
            return sum + (c.classesRemaining || 0);
        }, 0);
        
        // Actualizar stats
        document.getElementById('stat-clients-individual').textContent = individuals.length;
        document.getElementById('stat-clients-guardians').textContent = guardians.length;
        document.getElementById('stat-clients-children').textContent = totalChildren;
        document.getElementById('stat-clients-active').textContent = activeClients.length;
        document.getElementById('stat-clients-total-classes').textContent = totalClasses;
        
        renderClientsCards(allClientsData);
    } catch (error) {
        console.error('Error loading clients:', error);
        showNotification('Error cargando clientes', 'error');
    }
}

function renderClientsCards(clients) {
    const container = document.getElementById('clients-cards-view');
    
    if (!clients.length) {
        container.innerHTML = `
            <div style="text-align:center; padding:60px; color:#666; background:var(--bg-card); border-radius:12px;">
                <div style="font-size:48px; margin-bottom:15px;">👨‍👧‍👦</div>
                <h3 style="color:#fff; margin-bottom:10px;">No hay clientes registrados</h3>
                <p style="margin-bottom:20px;">Crea tu primer cliente para comenzar a gestionar estudiantes y apoderados</p>
                <button class="btn btn-primary" onclick="openCreateClientModal()">➕ Crear Primer Cliente</button>
            </div>
        `;
        return;
    }
    
    // Separar por tipo para mejor visualización
    const individuals = clients.filter(c => c.clientData?.accountType !== 'guardian');
    const guardians = clients.filter(c => c.clientData?.accountType === 'guardian');
    
    let html = '';
    
    // Sección de Estudiantes Individuales (Adultos)
    if (currentClientFilter === 'all' || currentClientFilter === 'individual' || currentClientFilter === 'active' || currentClientFilter === 'inactive') {
        const filteredIndividuals = filterClientsList(individuals);
        if (filteredIndividuals.length > 0 || currentClientFilter === 'individual') {
            html += `
                <div style="margin-bottom:25px;">
                    <h3 style="color:#3b82f6; margin:0 0 15px 0; font-size:16px; display:flex; align-items:center; gap:10px;">
                        <span style="background:#3b82f6; padding:4px 10px; border-radius:6px;">🎹</span>
                        Estudiantes Adultos (${filteredIndividuals.length})
                        <span style="font-size:12px; font-weight:normal; color:#888;">Pagan y estudian ellos mismos</span>
                    </h3>
                    <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(350px, 1fr)); gap:15px;">
                        ${filteredIndividuals.length ? filteredIndividuals.map(c => renderIndividualCard(c)).join('') : 
                        '<div style="padding:30px; text-align:center; color:#666; grid-column:1/-1;">No hay estudiantes adultos con este filtro</div>'}
                    </div>
                </div>
            `;
        }
    }
    
    // Sección de Apoderados con Hijos
    if (currentClientFilter === 'all' || currentClientFilter === 'guardian' || currentClientFilter === 'children' || currentClientFilter === 'active' || currentClientFilter === 'inactive') {
        const filteredGuardians = filterClientsList(guardians);
        if (filteredGuardians.length > 0 || currentClientFilter === 'guardian') {
            html += `
                <div>
                    <h3 style="color:#a855f7; margin:0 0 15px 0; font-size:16px; display:flex; align-items:center; gap:10px;">
                        <span style="background:#a855f7; padding:4px 10px; border-radius:6px;">👨‍👧</span>
                        Apoderados (${filteredGuardians.length})
                        <span style="font-size:12px; font-weight:normal; color:#888;">Pagan por sus hijos</span>
                    </h3>
                    <div style="display:grid; gap:15px;">
                        ${filteredGuardians.length ? filteredGuardians.map(c => renderGuardianCard(c)).join('') : 
                        '<div style="padding:30px; text-align:center; color:#666;">No hay apoderados con este filtro</div>'}
                    </div>
                </div>
            `;
        }
    }
    
    // Si solo se filtran hijos, mostrar lista expandida
    if (currentClientFilter === 'children') {
        const allChildren = [];
        guardians.forEach(g => {
            (g.clientData?.managedStudents || []).forEach((child, idx) => {
                allChildren.push({
                    ...child,
                    guardianId: g._id,
                    guardianName: g.name,
                    guardianEmail: g.email,
                    childIndex: idx
                });
            });
        });
        
        html = `
            <div>
                <h3 style="color:#f59e0b; margin:0 0 15px 0; font-size:16px; display:flex; align-items:center; gap:10px;">
                    <span style="background:#f59e0b; padding:4px 10px; border-radius:6px;">👶</span>
                    Todos los Hijos/Estudiantes (${allChildren.length})
                </h3>
                <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(300px, 1fr)); gap:12px;">
                    ${allChildren.map(child => renderChildCard(child)).join('')}
                </div>
            </div>
        `;
    }
    
    container.innerHTML = html;
}

function filterClientsList(clients) {
    if (currentClientFilter === 'active') {
        return clients.filter(c => {
            if (c.clientData?.accountType === 'guardian') {
                return (c.clientData.managedStudents || []).some(s => s.classesRemaining > 0);
            }
            return c.classesRemaining > 0;
        });
    }
    if (currentClientFilter === 'inactive') {
        return clients.filter(c => {
            if (c.clientData?.accountType === 'guardian') {
                return !(c.clientData.managedStudents || []).some(s => s.classesRemaining > 0);
            }
            return (c.classesRemaining || 0) <= 0;
        });
    }
    return clients;
}

function renderIndividualCard(client) {
    const classes = client.classesRemaining || 0;
    const hasClasses = classes > 0;
    const levelText = client.studentData?.level === 'beginner' ? 'Principiante' : 
                     client.studentData?.level === 'intermediate' ? 'Intermedio' : 'Avanzado';
    
    return `
        <div style="background:var(--bg-card); border:2px solid ${hasClasses ? 'rgba(59,130,246,0.3)' : 'rgba(239,68,68,0.3)'}; border-radius:12px; padding:15px; position:relative;">
            <div style="position:absolute; top:10px; right:10px;">
                <span style="background:${hasClasses ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}; color:${hasClasses ? '#22c55e' : '#ef4444'}; padding:3px 8px; border-radius:4px; font-size:11px;">
                    ${hasClasses ? '✅ Activo' : '⚠️ Sin clases'}
                </span>
            </div>
            
            <div style="display:flex; gap:12px; align-items:flex-start;">
                <div style="width:50px; height:50px; background:#3b82f6; border-radius:10px; display:flex; align-items:center; justify-content:center; font-size:24px;">
                    🎹
                </div>
                <div style="flex:1; min-width:0;">
                    <div style="font-weight:bold; color:#fff; font-size:15px; margin-bottom:2px;">${client.name}</div>
                    <div style="font-size:12px; color:#888; margin-bottom:5px;">${client.email}</div>
                    <div style="display:flex; gap:10px; font-size:11px; color:#666; flex-wrap:wrap;">
                        ${client.studentData?.age ? `<span>📅 ${client.studentData.age} años</span>` : ''}
                        <span>🎵 ${levelText}</span>
                        ${client.whatsapp ? `<span>📱 ${client.whatsapp}</span>` : ''}
                    </div>
                </div>
                <div style="text-align:center; padding:8px 12px; background:${hasClasses ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)'}; border-radius:8px;">
                    <div style="font-size:24px; font-weight:bold; color:${hasClasses ? '#22c55e' : '#ef4444'};">${classes}</div>
                    <div style="font-size:10px; color:#888;">clases</div>
                </div>
            </div>
            
            <div style="display:flex; gap:8px; margin-top:12px; padding-top:12px; border-top:1px solid #333;">
                <button class="btn btn-small" onclick="viewClientDetails('${client._id}')" style="flex:1; font-size:11px;">👁️ Ver</button>
                <button class="btn btn-small" onclick="editClient('${client._id}')" style="flex:1; font-size:11px;">✏️ Editar</button>
                <button class="btn btn-small" onclick="quickAddClasses('${client._id}')" style="flex:1; font-size:11px; background:rgba(34,197,94,0.2); color:#22c55e;">➕ Clases</button>
                <button class="btn btn-small" onclick="deleteClient('${client._id}')" style="font-size:11px; background:rgba(239,68,68,0.2); color:#ef4444;">🗑️</button>
            </div>
        </div>
    `;
}

function renderGuardianCard(client) {
    const children = client.clientData?.managedStudents || [];
    const totalClasses = children.reduce((sum, c) => sum + (c.classesRemaining || 0), 0);
    const hasClasses = totalClasses > 0;
    
    return `
        <div style="background:var(--bg-card); border:2px solid ${hasClasses ? 'rgba(168,85,247,0.3)' : 'rgba(239,68,68,0.3)'}; border-radius:12px; overflow:hidden;">
            <!-- Header del Apoderado -->
            <div style="padding:15px; background:rgba(168,85,247,0.1); border-bottom:1px solid rgba(168,85,247,0.2);">
                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                    <div style="display:flex; gap:12px; align-items:center;">
                        <div style="width:45px; height:45px; background:#a855f7; border-radius:10px; display:flex; align-items:center; justify-content:center; font-size:20px;">
                            👨‍👧
                        </div>
                        <div>
                            <div style="font-weight:bold; color:#fff; font-size:15px;">${client.name}</div>
                            <div style="font-size:12px; color:#888;">${client.email}</div>
                            ${client.whatsapp ? `<div style="font-size:11px; color:#666;">📱 ${client.whatsapp}</div>` : ''}
                        </div>
                    </div>
                    <div style="text-align:right;">
                        <span style="background:${hasClasses ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}; color:${hasClasses ? '#22c55e' : '#ef4444'}; padding:3px 8px; border-radius:4px; font-size:11px;">
                            ${hasClasses ? '✅ Activo' : '⚠️ Sin clases'}
                        </span>
                        <div style="font-size:11px; color:#888; margin-top:5px;">${children.length} hijo${children.length !== 1 ? 's' : ''}</div>
                    </div>
                </div>
            </div>
            
            <!-- Lista de Hijos -->
            <div style="padding:12px;">
                <div style="font-size:11px; color:#f59e0b; margin-bottom:10px; font-weight:600;">👶 HIJOS / ESTUDIANTES:</div>
                <div style="display:grid; gap:8px;">
                    ${children.map((child, idx) => `
                        <div style="display:flex; justify-content:space-between; align-items:center; padding:10px; background:rgba(245,158,11,0.1); border-radius:8px; border-left:3px solid #f59e0b;">
                            <div>
                                <div style="font-weight:600; color:#fff; font-size:13px;">${child.name}</div>
                                <div style="font-size:11px; color:#888;">
                                    ${child.age ? child.age + ' años • ' : ''}${child.level === 'beginner' ? 'Principiante' : child.level === 'intermediate' ? 'Intermedio' : 'Avanzado'}
                                </div>
                            </div>
                            <div style="display:flex; align-items:center; gap:10px;">
                                <div style="text-align:center; padding:5px 10px; background:${(child.classesRemaining || 0) > 0 ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)'}; border-radius:6px;">
                                    <div style="font-size:18px; font-weight:bold; color:${(child.classesRemaining || 0) > 0 ? '#22c55e' : '#ef4444'};">${child.classesRemaining || 0}</div>
                                    <div style="font-size:9px; color:#888;">clases</div>
                                </div>
                                <button class="btn btn-small" onclick="quickAddClassesToChild('${client._id}', ${idx})" style="font-size:10px; padding:4px 8px; background:rgba(34,197,94,0.2); color:#22c55e;" title="Agregar clases a ${child.name}">➕</button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
            
            <!-- Footer con acciones -->
            <div style="display:flex; gap:8px; padding:12px; border-top:1px solid #333; background:rgba(0,0,0,0.2);">
                <button class="btn btn-small" onclick="viewClientDetails('${client._id}')" style="flex:1; font-size:11px;">👁️ Ver Detalles</button>
                <button class="btn btn-small" onclick="editClient('${client._id}')" style="flex:1; font-size:11px;">✏️ Editar</button>
                <button class="btn btn-small" onclick="quickAddClasses('${client._id}')" style="flex:1; font-size:11px; background:rgba(34,197,94,0.2); color:#22c55e;">➕ Agregar Clases</button>
                <button class="btn btn-small" onclick="deleteClient('${client._id}')" style="font-size:11px; background:rgba(239,68,68,0.2); color:#ef4444;">🗑️</button>
            </div>
        </div>
    `;
}

function renderChildCard(child) {
    const hasClasses = (child.classesRemaining || 0) > 0;
    const levelText = child.level === 'beginner' ? 'Principiante' : 
                     child.level === 'intermediate' ? 'Intermedio' : 'Avanzado';
    
    return `
        <div style="background:var(--bg-card); border:2px solid rgba(245,158,11,0.3); border-radius:10px; padding:12px;">
            <div style="display:flex; gap:10px; align-items:center;">
                <div style="width:40px; height:40px; background:#f59e0b; border-radius:8px; display:flex; align-items:center; justify-content:center; font-size:18px;">
                    👶
                </div>
                <div style="flex:1;">
                    <div style="font-weight:bold; color:#fff; font-size:14px;">${child.name}</div>
                    <div style="font-size:11px; color:#888;">
                        ${child.age ? child.age + ' años • ' : ''}${levelText}
                    </div>
                    <div style="font-size:10px; color:#a855f7; margin-top:2px;">
                        👨‍👧 Apoderado: ${child.guardianName}
                    </div>
                </div>
                <div style="text-align:center; padding:6px 10px; background:${hasClasses ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)'}; border-radius:6px;">
                    <div style="font-size:20px; font-weight:bold; color:${hasClasses ? '#22c55e' : '#ef4444'};">${child.classesRemaining || 0}</div>
                    <div style="font-size:9px; color:#888;">clases</div>
                </div>
            </div>
            <div style="display:flex; gap:6px; margin-top:10px;">
                <button class="btn btn-small" onclick="viewClientDetails('${child.guardianId}')" style="flex:1; font-size:10px;">👁️ Ver Apoderado</button>
                <button class="btn btn-small" onclick="quickAddClassesToChild('${child.guardianId}', ${child.childIndex})" style="flex:1; font-size:10px; background:rgba(34,197,94,0.2); color:#22c55e;">➕ Clases</button>
            </div>
        </div>
    `;
}

// Función para agregar clases a un hijo específico directamente
function quickAddClassesToChild(clientId, childIndex) {
    const client = allClientsData.find(c => c._id === clientId);
    if (!client) return;
    
    const child = client.clientData?.managedStudents?.[childIndex];
    if (!child) return;
    
    document.getElementById('add-classes-client-id').value = clientId;
    document.getElementById('add-classes-client-name').textContent = `${child.name} (hijo de ${client.name})`;
    document.getElementById('add-classes-amount').value = 4;
    document.getElementById('add-classes-payment').value = '';
    document.getElementById('add-classes-method').value = '';
    document.getElementById('add-classes-notes').value = '';
    
    // Set the select to this specific child
    const select = document.getElementById('add-classes-student-select');
    const students = client.clientData?.managedStudents || [];
    select.innerHTML = students.map((s, idx) => 
        `<option value="${idx}" ${idx === childIndex ? 'selected' : ''}>${s.name} (${s.classesRemaining || 0} clases)</option>`
    ).join('');
    
    openModal('add-classes-modal');
}

function filterClients(filter) {
    currentClientFilter = filter;
    
    document.querySelectorAll('#module-clients .filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === filter);
    });
    
    renderClientsCards(allClientsData);
}

function searchClients() {
    const query = document.getElementById('search-clients').value.toLowerCase();
    
    if (!query) {
        renderClientsCards(allClientsData);
        return;
    }
    
    const filtered = allClientsData.filter(c => 
        c.name.toLowerCase().includes(query) || 
        c.email.toLowerCase().includes(query) ||
        (c.whatsapp || '').includes(query) ||
        (c.clientData?.managedStudents || []).some(s => s.name.toLowerCase().includes(query))
    );
    
    renderClientsCards(filtered);
}

function openCreateClientModal() {
    currentClientId = null;
    document.getElementById('client-modal-title').textContent = '➕ Nuevo Cliente';
    document.getElementById('create-client-form').reset();
    document.getElementById('client-id').value = '';
    
    // Reset type selection
    document.querySelector('input[name="client-account-type"][value="individual"]').checked = true;
    toggleClientTypeFields();
    
    // Clear children container
    document.getElementById('children-container').innerHTML = '';
    addChildRow(); // Add one empty row by default
    
    // Load teachers dropdown
    loadTeachersDropdown('client-teacher');
    
    openModal('create-client-modal');
}

function toggleClientTypeFields() {
    const isGuardian = document.querySelector('input[name="client-account-type"]:checked')?.value === 'guardian';
    
    document.getElementById('client-individual-section').style.display = isGuardian ? 'none' : 'block';
    document.getElementById('client-guardian-section').style.display = isGuardian ? 'block' : 'none';
    
    // Update label styles
    document.getElementById('client-type-individual-label').style.borderColor = !isGuardian ? '#3b82f6' : 'var(--border-color)';
    document.getElementById('client-type-guardian-label').style.borderColor = isGuardian ? '#a855f7' : 'var(--border-color)';
}

function addChildRow(childData = null) {
    const container = document.getElementById('children-container');
    const index = container.children.length;
    
    const row = document.createElement('div');
    row.className = 'child-row';
    row.style.cssText = 'display:grid; grid-template-columns:2fr 1fr 1fr 1fr auto; gap:8px; align-items:end; margin-bottom:10px; padding:10px; background:rgba(168,85,247,0.1); border-radius:6px;';
    
    row.innerHTML = `
        <div>
            <label style="font-size:10px; color:#888;">Nombre del hijo/a *</label>
            <input type="text" class="child-name" value="${childData?.name || ''}" placeholder="María" required>
        </div>
        <div>
            <label style="font-size:10px; color:#888;">Edad</label>
            <input type="number" class="child-age" value="${childData?.age || ''}" min="1" placeholder="8">
        </div>
        <div>
            <label style="font-size:10px; color:#888;">Nivel</label>
            <select class="child-level">
                <option value="beginner" ${childData?.level === 'beginner' ? 'selected' : ''}>Principiante</option>
                <option value="intermediate" ${childData?.level === 'intermediate' ? 'selected' : ''}>Intermedio</option>
                <option value="advanced" ${childData?.level === 'advanced' ? 'selected' : ''}>Avanzado</option>
            </select>
        </div>
        <div>
            <label style="font-size:10px; color:#888;">Clases</label>
            <input type="number" class="child-classes" value="${childData?.classesRemaining || 1}" min="0" placeholder="4">
        </div>
        <button type="button" onclick="removeChildRow(this)" style="padding:6px 10px; background:rgba(239,68,68,0.2); color:#ef4444; border:none; border-radius:4px; cursor:pointer;">✕</button>
    `;
    
    container.appendChild(row);
}

function removeChildRow(btn) {
    const container = document.getElementById('children-container');
    if (container.children.length > 1) {
        btn.closest('.child-row').remove();
    } else {
        showNotification('Debe haber al menos un hijo', 'warning');
    }
}

async function createClient(event) {
    event.preventDefault();
    
    const isGuardian = document.querySelector('input[name="client-account-type"]:checked')?.value === 'guardian';
    const name = document.getElementById('client-name').value.trim();
    const email = document.getElementById('client-email').value.trim();
    const password = document.getElementById('client-password').value;
    const whatsapp = document.getElementById('client-whatsapp').value.trim();
    const country = document.getElementById('client-country').value.trim();
    const teacherId = document.getElementById('client-teacher').value;
    
    // Payment info
    const paymentAmount = document.getElementById('client-payment-amount').value;
    const paymentMethod = document.getElementById('client-payment-method').value;
    const paymentNotes = document.getElementById('client-payment-notes').value.trim();
    
    if (!name || !email) {
        showNotification('Nombre y email son requeridos', 'error');
        return;
    }
    
    // Build client data
    const clientPayload = {
        name,
        email,
        password: password || undefined,
        whatsapp,
        country,
        role: 'client',
        assignedTeacher: teacherId || undefined,
        clientData: {
            accountType: isGuardian ? 'guardian' : 'individual',
            managedStudents: []
        },
        paymentInfo: paymentAmount ? {
            amount: parseFloat(paymentAmount),
            method: paymentMethod,
            notes: paymentNotes,
            date: new Date()
        } : undefined
    };
    
    if (isGuardian) {
        // Get children data
        const childRows = document.querySelectorAll('#children-container .child-row');
        const children = [];
        
        for (const row of childRows) {
            const childName = row.querySelector('.child-name').value.trim();
            if (!childName) continue;
            
            children.push({
                name: childName,
                age: parseInt(row.querySelector('.child-age').value) || null,
                level: row.querySelector('.child-level').value,
                classesRemaining: parseInt(row.querySelector('.child-classes').value) || 0,
                classesUsed: 0
            });
        }
        
        if (children.length === 0) {
            showNotification('Agrega al menos un estudiante dependiente', 'error');
            return;
        }
        
        clientPayload.clientData.managedStudents = children;
    } else {
        // Individual - use self data
        clientPayload.classesRemaining = parseInt(document.getElementById('client-self-classes').value) || 0;
        clientPayload.studentData = {
            age: parseInt(document.getElementById('client-self-age').value) || null,
            level: document.getElementById('client-self-level').value,
            source: 'platform'
        };
    }
    
    try {
        const url = currentClientId 
            ? `/admin/clients/${currentClientId}` 
            : '/admin/clients';
        const method = currentClientId ? 'PUT' : 'POST';
        
        const res = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${userSession.token}`
            },
            body: JSON.stringify(clientPayload)
        });
        
        const data = await res.json();
        
        if (res.ok) {
            closeModal('create-client-modal');
            loadClients();
            showNotification(currentClientId ? 'Cliente actualizado' : 'Cliente creado exitosamente', 'success');
        } else {
            showNotification(data.message || 'Error guardando cliente', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showNotification('Error de conexión', 'error');
    }
}

function viewClientDetails(clientId) {
    const client = allClientsData.find(c => c._id === clientId);
    if (!client) return;
    
    document.getElementById('view-client-id').value = clientId;
    document.getElementById('view-client-name').textContent = client.name;
    document.getElementById('view-client-email').textContent = client.email;
    document.getElementById('view-client-whatsapp').textContent = client.whatsapp || '-';
    document.getElementById('view-client-country').textContent = client.country || '-';
    
    const isGuardian = client.clientData?.accountType === 'guardian';
    document.getElementById('view-client-type-badge').innerHTML = isGuardian
        ? '<span style="background:#a855f7; color:white; padding:4px 12px; border-radius:6px; font-size:12px;">👨‍👧 Apoderado</span>'
        : '<span style="background:#3b82f6; color:white; padding:4px 12px; border-radius:6px; font-size:12px;">🎹 Individual</span>';
    
    // Render students/children
    const studentsDiv = document.getElementById('view-client-students');
    
    if (isGuardian) {
        const students = client.clientData?.managedStudents || [];
        if (students.length === 0) {
            studentsDiv.innerHTML = '<div style="color:#666; text-align:center; padding:20px;">Sin hijos registrados</div>';
        } else {
            studentsDiv.innerHTML = students.map((s, idx) => `
                <div style="display:flex; justify-content:space-between; align-items:center; padding:10px; background:rgba(168,85,247,0.1); border-radius:6px; margin-bottom:8px;">
                    <div>
                        <div style="font-weight:bold; color:#fff;">${s.name}</div>
                        <div style="font-size:11px; color:#888;">
                            ${s.age ? s.age + ' años • ' : ''}${s.level === 'beginner' ? 'Principiante' : s.level === 'intermediate' ? 'Intermedio' : 'Avanzado'}
                        </div>
                    </div>
                    <div style="text-align:right;">
                        <div style="font-size:20px; font-weight:bold; color:${s.classesRemaining > 0 ? '#22c55e' : '#ef4444'};">${s.classesRemaining || 0}</div>
                        <div style="font-size:10px; color:#888;">clases disp.</div>
                    </div>
                </div>
            `).join('');
        }
    } else {
        studentsDiv.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:15px; background:rgba(59,130,246,0.1); border-radius:6px;">
                <div>
                    <div style="font-weight:bold; color:#fff;">${client.name} (él mismo)</div>
                    <div style="font-size:11px; color:#888;">
                        ${client.studentData?.age ? client.studentData.age + ' años • ' : ''}
                        ${client.studentData?.level === 'beginner' ? 'Principiante' : client.studentData?.level === 'intermediate' ? 'Intermedio' : 'Avanzado'}
                    </div>
                </div>
                <div style="text-align:right;">
                    <div style="font-size:24px; font-weight:bold; color:${(client.classesRemaining || 0) > 0 ? '#22c55e' : '#ef4444'};">${client.classesRemaining || 0}</div>
                    <div style="font-size:10px; color:#888;">clases disponibles</div>
                </div>
            </div>
        `;
    }
    
    // Cargar historial de pagos
    loadClientPayments(clientId);
    
    openModal('view-client-modal');
}

// Cargar historial de pagos de un cliente
async function loadClientPayments(clientId) {
    const paymentsDiv = document.getElementById('view-client-payments');
    paymentsDiv.innerHTML = '<div style="text-align:center; color:#666; padding:15px;"><span class="spinner"></span> Cargando pagos...</div>';
    
    try {
        const res = await fetch(`/admin/clients/${clientId}/payments`);
        const payments = await res.json();
        
        if (!payments || payments.length === 0) {
            paymentsDiv.innerHTML = '<div style="text-align:center; color:#666; font-size:13px; padding:20px;">Sin pagos registrados</div>';
            return;
        }
        
        // Calcular total
        const total = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
        
        paymentsDiv.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; padding-bottom:10px; border-bottom:1px solid var(--border-color);">
                <span style="color:#888; font-size:12px;">${payments.length} pago(s)</span>
                <span style="font-weight:bold; color:#22c55e;">Total: $${total.toFixed(2)}</span>
            </div>
            ${payments.map(p => renderPaymentItem(p)).join('')}
        `;
    } catch (error) {
        console.error('Error cargando pagos:', error);
        paymentsDiv.innerHTML = '<div style="text-align:center; color:#ef4444; font-size:13px; padding:20px;">Error cargando pagos</div>';
    }
}

function renderPaymentItem(payment) {
    const date = new Date(payment.date).toLocaleDateString('es-ES', { 
        day: '2-digit', 
        month: 'short', 
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
    
    const typeIcons = {
        'welcome_kit': '📦',
        'subscription': '🔄',
        'subscription_payment': '💳',
        'manual': '✋'
    };
    
    const typeLabels = {
        'welcome_kit': 'Kit de Bienvenida',
        'subscription': 'Suscripción',
        'subscription_payment': 'Pago Suscripción',
        'manual': 'Pago Manual'
    };
    
    const statusColors = {
        'approved': '#22c55e',
        'active': '#22c55e',
        'pending': '#f59e0b',
        'rejected': '#ef4444',
        'cancelled': '#6b7280',
        'expired': '#6b7280'
    };
    
    const providerIcons = {
        'paypal': '🅿️',
        'mercadopago': '💙',
        'manual': '✋',
        'transferencia': '🏦',
        'efectivo': '💵'
    };
    
    return `
        <div style="display:flex; gap:12px; padding:10px; background:var(--bg-dark); border-radius:8px; margin-bottom:8px; align-items:flex-start;">
            <div style="font-size:24px; width:40px; text-align:center;">${typeIcons[payment.type] || '💰'}</div>
            <div style="flex:1; min-width:0;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span style="font-weight:600; color:#fff; font-size:13px;">${payment.description}</span>
                    <span style="font-weight:bold; color:#22c55e; font-size:14px;">$${(payment.amount || 0).toFixed(2)}</span>
                </div>
                <div style="font-size:11px; color:#888; margin-top:4px;">
                    ${date} • ${providerIcons[payment.provider] || ''} ${payment.provider || 'N/A'}
                    <span style="color:${statusColors[payment.status] || '#888'}; margin-left:8px;">● ${payment.status}</span>
                </div>
                ${payment.externalId ? `<div style="font-size:10px; color:#666; margin-top:2px;">ID: ${payment.externalId}</div>` : ''}
                ${payment.details?.kitType ? `<div style="font-size:10px; color:#666;">Kit: ${payment.details.kitType}</div>` : ''}
                ${payment.details?.notes ? `<div style="font-size:10px; color:#888; font-style:italic; margin-top:2px;">"${payment.details.notes}"</div>` : ''}
            </div>
        </div>
    `;
}

function editClient(clientId) {
    const client = allClientsData.find(c => c._id === clientId);
    if (!client) return;
    
    currentClientId = clientId;
    document.getElementById('client-modal-title').textContent = '✏️ Editar Cliente';
    document.getElementById('client-id').value = clientId;
    
    // Fill basic data
    document.getElementById('client-name').value = client.name;
    document.getElementById('client-email').value = client.email;
    document.getElementById('client-password').value = '';
    document.getElementById('client-whatsapp').value = client.whatsapp || '';
    document.getElementById('client-country').value = client.country || '';
    
    // Set type
    const isGuardian = client.clientData?.accountType === 'guardian';
    document.querySelector(`input[name="client-account-type"][value="${isGuardian ? 'guardian' : 'individual'}"]`).checked = true;
    toggleClientTypeFields();
    
    if (isGuardian) {
        // Fill children
        const container = document.getElementById('children-container');
        container.innerHTML = '';
        (client.clientData?.managedStudents || []).forEach(child => {
            addChildRow(child);
        });
        if (container.children.length === 0) addChildRow();
    } else {
        // Fill individual data
        document.getElementById('client-self-age').value = client.studentData?.age || '';
        document.getElementById('client-self-level').value = client.studentData?.level || 'beginner';
        document.getElementById('client-self-classes').value = client.classesRemaining || 0;
    }
    
    // Load teachers dropdown
    loadTeachersDropdown('client-teacher').then(() => {
        if (client.studentData?.assignedTeacher) {
            document.getElementById('client-teacher').value = client.studentData.assignedTeacher;
        }
    });
    
    openModal('create-client-modal');
}

function editClientFromView() {
    const clientId = document.getElementById('view-client-id').value;
    closeModal('view-client-modal');
    editClient(clientId);
}

function quickAddClasses(clientId) {
    const client = allClientsData.find(c => c._id === clientId);
    if (!client) return;
    
    document.getElementById('add-classes-client-id').value = clientId;
    document.getElementById('add-classes-client-name').textContent = client.name;
    document.getElementById('add-classes-amount').value = 4;
    document.getElementById('add-classes-payment').value = '';
    document.getElementById('add-classes-method').value = '';
    document.getElementById('add-classes-notes').value = '';
    
    // Fill student select
    const select = document.getElementById('add-classes-student-select');
    const isGuardian = client.clientData?.accountType === 'guardian';
    
    if (isGuardian) {
        const students = client.clientData?.managedStudents || [];
        select.innerHTML = students.map((s, idx) => 
            `<option value="${idx}">${s.name} (${s.classesRemaining || 0} clases)</option>`
        ).join('');
    } else {
        select.innerHTML = `<option value="self">${client.name} (${client.classesRemaining || 0} clases)</option>`;
    }
    
    openModal('add-classes-modal');
}

function openAddClassesModal() {
    const clientId = document.getElementById('view-client-id').value;
    closeModal('view-client-modal');
    quickAddClasses(clientId);
}

async function confirmAddClasses() {
    const clientId = document.getElementById('add-classes-client-id').value;
    const studentIndex = document.getElementById('add-classes-student-select').value;
    const classesToAdd = parseInt(document.getElementById('add-classes-amount').value) || 0;
    const paymentAmount = document.getElementById('add-classes-payment').value;
    const paymentMethod = document.getElementById('add-classes-method').value;
    const notes = document.getElementById('add-classes-notes').value;
    
    if (classesToAdd <= 0) {
        showNotification('Ingresa una cantidad válida de clases', 'error');
        return;
    }
    
    try {
        const res = await fetch(`/admin/clients/${clientId}/add-classes`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${userSession.token}`
            },
            body: JSON.stringify({
                studentIndex: studentIndex === 'self' ? null : parseInt(studentIndex),
                classesToAdd,
                payment: paymentAmount ? {
                    amount: parseFloat(paymentAmount),
                    method: paymentMethod,
                    notes
                } : null
            })
        });
        
        const data = await res.json();
        
        if (res.ok) {
            closeModal('add-classes-modal');
            loadClients();
            showNotification(`${classesToAdd} clases agregadas exitosamente`, 'success');
        } else {
            showNotification(data.message || 'Error agregando clases', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showNotification('Error de conexión', 'error');
    }
}

async function deleteClient(clientId) {
    if (!confirm('¿Estás seguro de eliminar este cliente? Esta acción no se puede deshacer.')) {
        return;
    }
    
    try {
        const res = await fetch(`/admin/clients/${clientId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${userSession.token}` }
        });
        
        if (res.ok) {
            loadClients();
            showNotification('Cliente eliminado', 'success');
        } else {
            const data = await res.json();
            showNotification(data.message || 'Error eliminando cliente', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showNotification('Error de conexión', 'error');
    }
}

// ==================== CONFIGURACIÓN DE PRECIOS ====================

async function loadPricingConfig() {
    try {
        const res = await fetch('/admin/config/pricing', {
            headers: { 'Authorization': `Bearer ${userSession.token}` }
        });
        
        if (res.ok) {
            const data = await res.json();
            document.getElementById('pricing-founder').value = data.teacherSubscription.founder;
            document.getElementById('pricing-regular').value = data.teacherSubscription.regular;
            
            // Cargar configuración de clase de prueba (marketplace)
            if (data.trialClassPayment) {
                const trialInput = document.getElementById('pricing-trial-class');
                const trialEnabled = document.getElementById('pricing-trial-enabled');
                const trialPreview = document.getElementById('trial-preview-amount');
                
                if (trialInput) trialInput.value = data.trialClassPayment.amountUSD || 10;
                if (trialEnabled) trialEnabled.checked = data.trialClassPayment.enabled !== false;
                if (trialPreview) trialPreview.textContent = data.trialClassPayment.amountUSD || 10;
                
                // Listener para actualizar preview en tiempo real
                if (trialInput && trialPreview) {
                    trialInput.addEventListener('input', (e) => {
                        trialPreview.textContent = e.target.value || '0';
                    });
                }
            }
        } else {
            showNotification('Error cargando configuración de precios', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showNotification('Error de conexión', 'error');
    }
}

// ==================== KIT DE BIENVENIDA V2 PRICING ====================

async function loadKitV2Price() {
    try {
        const res = await fetch('/admin/config', {
            headers: { 'Authorization': `Bearer ${userSession.token}` }
        });
        const config = await res.json();
        
        const priceInput = document.getElementById('pricing-kit-v2');
        const extraChildInput = document.getElementById('pricing-extra-child');
        
        if (priceInput && config.welcomeKitV2) {
            priceInput.value = config.welcomeKitV2.priceUSD || 44;
        }
        if (extraChildInput && config.welcomeKitV2) {
            extraChildInput.value = config.welcomeKitV2.extraChildPriceUSD || 15;
        }
    } catch (error) {
        console.error('Error cargando precio Kit V2:', error);
    }
}

async function saveKitV2Price() {
    const priceInput = document.getElementById('pricing-kit-v2');
    const extraChildInput = document.getElementById('pricing-extra-child');
    const statusDiv = document.getElementById('kit-v2-price-status');
    
    const price = parseFloat(priceInput.value);
    const extraChildPrice = parseFloat(extraChildInput?.value) || 15;
    
    if (isNaN(price) || price < 0.01) {
        showNotification('Por favor ingresa un precio base válido (mínimo $0.01)', 'error');
        return;
    }
    
    if (price > 500) {
        showNotification('El precio base no puede exceder $500 USD', 'error');
        return;
    }
    
    if (extraChildPrice < 0 || extraChildPrice > 100) {
        showNotification('El precio por hijo extra debe estar entre $0 y $100 USD', 'error');
        return;
    }
    
    try {
        const res = await fetch('/admin/config/kit-v2-price', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${userSession.token}`
            },
            body: JSON.stringify({ priceUSD: price, extraChildPriceUSD: extraChildPrice })
        });
        
        const data = await res.json();
        
        if (res.ok) {
            statusDiv.style.display = 'block';
            statusDiv.style.background = '#10b981';
            statusDiv.style.color = 'white';
            statusDiv.textContent = `✅ Precios actualizados: Base $${price} + $${extraChildPrice}/hijo extra`;
            
            setTimeout(() => { statusDiv.style.display = 'none'; }, 3000);
            showNotification('Precios del Kit actualizados', 'success');
        } else {
            statusDiv.style.display = 'block';
            statusDiv.style.background = '#ef4444';
            statusDiv.style.color = 'white';
            statusDiv.textContent = '❌ ' + (data.message || 'Error');
            showNotification(data.message || 'Error guardando precios', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showNotification('Error de conexión', 'error');
    }
}

async function savePricingConfig() {
    const founderInput = document.getElementById('pricing-founder');
    const regularInput = document.getElementById('pricing-regular');
    const trialInput = document.getElementById('pricing-trial-class');
    const trialEnabled = document.getElementById('pricing-trial-enabled');
    const statusDiv = document.getElementById('pricing-status');
    
    const founder = parseFloat(founderInput.value);
    const regular = parseFloat(regularInput.value);
    const trialAmount = trialInput ? parseFloat(trialInput.value) : 10;
    const trialIsEnabled = trialEnabled ? trialEnabled.checked : true;
    
    // Validación
    if (isNaN(founder) || isNaN(regular)) {
        showNotification('Por favor ingresa precios válidos', 'error');
        return;
    }
    
    if (founder < 0 || regular < 0) {
        showNotification('Los precios no pueden ser negativos', 'error');
        return;
    }
    
    if (founder > 1000 || regular > 1000) {
        showNotification('Los precios no pueden exceder $1000 USD', 'error');
        return;
    }
    
    // Validación Trial Class
    if (isNaN(trialAmount) || trialAmount < 0 || trialAmount > 100) {
        showNotification('El pago de clase de prueba debe ser entre $0 y $100', 'error');
        return;
    }
    
    try {
        const res = await fetch('/admin/config/pricing', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${userSession.token}`
            },
            body: JSON.stringify({ 
                founder, 
                regular,
                trialClassPayment: {
                    amountUSD: trialAmount,
                    enabled: trialIsEnabled
                }
            })
        });
        
        const data = await res.json();
        
        if (res.ok) {
            statusDiv.style.display = 'block';
            statusDiv.style.background = '#10b981';
            statusDiv.style.color = 'white';
            statusDiv.textContent = '✅ ' + data.message;
            
            setTimeout(() => {
                statusDiv.style.display = 'none';
            }, 3000);
            
            showNotification('Precios actualizados exitosamente', 'success');
        } else {
            statusDiv.style.display = 'block';
            statusDiv.style.background = '#ef4444';
            statusDiv.style.color = 'white';
            statusDiv.textContent = '❌ ' + data.message;
            showNotification(data.message || 'Error guardando configuración', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        statusDiv.style.display = 'block';
        statusDiv.style.background = '#ef4444';
        statusDiv.style.color = 'white';
        statusDiv.textContent = '❌ Error de conexión';
        showNotification('Error de conexión', 'error');
    }
}

// ==================== PAYOUTS A PROFESORES ====================

let currentPayoutId = null;

// Helpers para payouts
function getMethodIcon(method) {
    const icons = {
        bank_transfer: '🏦',
        mercadopago: '🟦',
        paypal: '💙',
        wise: '🟢',
        crypto: '₿',
        manual: '✋'
    };
    return icons[method] || '💳';
}

function getMethodLabel(method) {
    const labels = {
        bank_transfer: 'Transferencia Bancaria',
        mercadopago: 'MercadoPago',
        paypal: 'PayPal',
        wise: 'Wise',
        crypto: 'Crypto',
        manual: 'Manual'
    };
    return labels[method] || method;
}

function getInvoiceTypeLabel(type) {
    const labels = {
        boleta_honorarios: 'Boleta de Honorarios',
        factura: 'Factura',
        invoice: 'Invoice',
        recibo: 'Recibo',
        otro: 'Otro'
    };
    return labels[type] || type;
}

function getInvoiceStatusBadge(status) {
    const badges = {
        'not_submitted': '<span style="background:#ef4444; color:white; padding:4px 10px; border-radius:12px; font-size:11px;">❌ No enviado</span>',
        'submitted': '<span style="background:#f59e0b; color:white; padding:4px 10px; border-radius:12px; font-size:11px;">⏳ Pendiente verificar</span>',
        'verified': '<span style="background:#22c55e; color:white; padding:4px 10px; border-radius:12px; font-size:11px;">✅ Verificado</span>',
        'rejected': '<span style="background:#ef4444; color:white; padding:4px 10px; border-radius:12px; font-size:11px;">❌ Rechazado</span>'
    };
    return badges[status] || status;
}

function canAutoExecute(payout) {
    // Puede ejecutar automático si tiene documento verificado y método de retiro
    return payout.invoice?.status === 'verified' && payout.withdrawalMethod;
}

async function loadPayouts() {
    try {
        // Cargar resumen
        const summaryRes = await fetch('/api/admin/payouts/summary', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const summaryData = await summaryRes.json();
        
        if (summaryData.success) {
            const s = summaryData.summary;
            document.getElementById('payouts-pending-count').textContent = s.pendingReview;
            document.getElementById('payouts-approved-count').textContent = s.approved;
            document.getElementById('payouts-total-pending').textContent = `$${(s.totalPendingUSD / 100).toFixed(0)}`;
            document.getElementById('payouts-this-month').textContent = `$${(s.paidThisMonthUSD / 100).toFixed(0)}`;
            
            // Actualizar badge
            const badge = document.getElementById('payouts-badge');
            if (badge) {
                badge.textContent = s.pendingReview;
                badge.style.display = s.pendingReview > 0 ? 'inline-block' : 'none';
            }
        }

        // Obtener filtros
        const status = document.getElementById('payouts-filter-status')?.value || '';
        const period = document.getElementById('payouts-filter-period')?.value || '';
        
        let url = '/api/admin/payouts?';
        if (status) url += `status=${status}&`;
        if (period) url += `period=${period}&`;

        const res = await fetch(url, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const data = await res.json();

        const tbody = document.getElementById('payouts-table-body');
        
        if (!data.success || !data.payouts.length) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:40px; color:#666;">No hay payouts para mostrar</td></tr>';
            return;
        }

        tbody.innerHTML = data.payouts.map(p => {
            const teacher = p.teacherId || {};
            const statusBadge = getPayoutStatusBadge(p.status);
            
            return `
                <tr>
                    <td>
                        <div style="display:flex; align-items:center; gap:10px;">
                            <div style="width:36px; height:36px; border-radius:50%; background:linear-gradient(135deg, #ff764d, #ff9f7e); display:flex; align-items:center; justify-content:center; color:white; font-weight:700;">
                                ${(teacher.name || 'P').charAt(0)}
                            </div>
                            <div>
                                <div style="font-weight:600;">${teacher.brandName || teacher.name || 'Profesor'}</div>
                                <div style="font-size:12px; color:#888;">${teacher.email || ''}</div>
                            </div>
                        </div>
                    </td>
                    <td>${p.periodLabel || 'Sin período'}</td>
                    <td>
                        <span style="font-weight:600;">${p.totalClassesPaid || 0}</span>
                        <span style="color:#888; font-size:12px;"> clases</span>
                    </td>
                    <td>$${(p.grossAmountUSD / 100).toFixed(2)}</td>
                    <td style="color:#f59e0b;">-$${(p.platformFeeUSD / 100).toFixed(2)}</td>
                    <td style="font-weight:700; color:#22c55e;">$${(p.finalPayoutUSD / 100).toFixed(2)}</td>
                    <td>${statusBadge}</td>
                    <td>
                        <div style="display:flex; gap:5px;">
                            <button class="btn btn-sm" onclick="openPayoutDetail('${p._id}')" title="Ver detalle">
                                👁️
                            </button>
                            ${p.status === 'pending-review' ? `
                                <button class="btn btn-sm btn-success" onclick="approvePayout('${p._id}')" title="Aprobar">
                                    ✓
                                </button>
                            ` : ''}
                            ${p.status === 'approved' ? `
                                <button class="btn btn-sm btn-primary" onclick="markPayoutPaid('${p._id}')" title="Marcar pagado">
                                    💰
                                </button>
                            ` : ''}
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

    } catch (error) {
        console.error('[Payouts] Error:', error);
        document.getElementById('payouts-table-body').innerHTML = 
            '<tr><td colspan="8" style="text-align:center; padding:40px; color:#ef4444;">Error cargando payouts</td></tr>';
    }
}

function getPayoutStatusBadge(status) {
    const badges = {
        'calculating': '<span style="background:#3b82f6; color:white; padding:4px 10px; border-radius:12px; font-size:11px;">🔄 Calculando</span>',
        'pending-review': '<span style="background:#f59e0b; color:white; padding:4px 10px; border-radius:12px; font-size:11px;">⏳ Pendiente</span>',
        'approved': '<span style="background:#22c55e; color:white; padding:4px 10px; border-radius:12px; font-size:11px;">✓ Aprobado</span>',
        'processing': '<span style="background:#8b5cf6; color:white; padding:4px 10px; border-radius:12px; font-size:11px;">🔄 Procesando</span>',
        'paid': '<span style="background:#10b981; color:white; padding:4px 10px; border-radius:12px; font-size:11px;">💰 Pagado</span>',
        'failed': '<span style="background:#ef4444; color:white; padding:4px 10px; border-radius:12px; font-size:11px;">❌ Error</span>',
        'cancelled': '<span style="background:#6b7280; color:white; padding:4px 10px; border-radius:12px; font-size:11px;">🚫 Cancelado</span>'
    };
    return badges[status] || `<span style="background:#888; color:white; padding:4px 10px; border-radius:12px; font-size:11px;">${status}</span>`;
}

async function openPayoutDetail(payoutId) {
    currentPayoutId = payoutId;
    
    try {
        const res = await fetch(`/api/admin/payouts/${payoutId}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const data = await res.json();
        
        if (!data.success) {
            showNotification('Error cargando payout', 'error');
            return;
        }

        const p = data.payout;
        const teacher = p.teacherId || {};
        const wallet = data.wallet || {};

        const modalBody = document.getElementById('payout-modal-body');
        modalBody.innerHTML = `
            <div style="display:grid; gap:20px;">
                <!-- Info Profesor -->
                <div style="background:var(--bg-secondary); padding:20px; border-radius:12px; display:flex; align-items:center; gap:15px;">
                    <div style="width:60px; height:60px; border-radius:50%; background:linear-gradient(135deg, #ff764d, #ff9f7e); display:flex; align-items:center; justify-content:center; color:white; font-weight:700; font-size:24px;">
                        ${(teacher.name || 'P').charAt(0)}
                    </div>
                    <div>
                        <h3 style="margin:0; color:var(--text-primary);">${teacher.brandName || teacher.name || 'Profesor'}</h3>
                        <div style="color:var(--text-secondary); font-size:14px;">${teacher.email}</div>
                        <div style="color:var(--accent-purple); font-size:13px; margin-top:4px;">
                            ${p.periodLabel}
                        </div>
                    </div>
                    <div style="margin-left:auto;">
                        ${getPayoutStatusBadge(p.status)}
                    </div>
                </div>

                <!-- Resumen Financiero -->
                <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:15px;">
                    <div style="background:var(--bg-card); padding:15px; border-radius:10px; text-align:center; border:1px solid var(--border-color);">
                        <div style="font-size:24px; font-weight:700;">${p.totalClassesPaid}</div>
                        <div style="font-size:12px; color:var(--text-secondary);">Clases pagadas</div>
                    </div>
                    <div style="background:var(--bg-card); padding:15px; border-radius:10px; text-align:center; border:1px solid var(--border-color);">
                        <div style="font-size:24px; font-weight:700;">$${(p.grossAmountUSD / 100).toFixed(2)}</div>
                        <div style="font-size:12px; color:var(--text-secondary);">Bruto</div>
                    </div>
                    <div style="background:var(--bg-card); padding:15px; border-radius:10px; text-align:center; border:1px solid var(--border-color);">
                        <div style="font-size:24px; font-weight:700; color:#f59e0b;">-$${(p.platformFeeUSD / 100).toFixed(2)}</div>
                        <div style="font-size:12px; color:var(--text-secondary);">Comisión (20%)</div>
                    </div>
                    <div style="background:var(--bg-card); padding:15px; border-radius:10px; text-align:center; border:1px solid #22c55e;">
                        <div style="font-size:24px; font-weight:700; color:#22c55e;">$${(p.finalPayoutUSD / 100).toFixed(2)}</div>
                        <div style="font-size:12px; color:var(--text-secondary);">Neto a Pagar</div>
                    </div>
                </div>

                <!-- Método de Retiro elegido por profesor -->
                <div style="background:var(--bg-card); padding:20px; border-radius:12px; border:1px solid var(--border-color);">
                    <h4 style="margin:0 0 15px 0; color:var(--text-primary);">💳 Método de Retiro</h4>
                    ${p.withdrawalMethod ? `
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <div style="display:flex; align-items:center; gap:10px;">
                                <span style="font-size:24px;">${getMethodIcon(p.withdrawalMethod)}</span>
                                <div>
                                    <div style="font-weight:600; text-transform:capitalize;">${getMethodLabel(p.withdrawalMethod)}</div>
                                    ${p.withdrawalFeePercent > 0 ? `
                                        <div style="color:#f59e0b; font-size:12px;">Fee: ${p.withdrawalFeePercent}% (-$${(p.withdrawalFeeUSD / 100).toFixed(2)})</div>
                                    ` : '<div style="color:#22c55e; font-size:12px;">Sin fee</div>'}
                                </div>
                            </div>
                            <div style="text-align:right;">
                                <div style="font-size:20px; font-weight:700; color:#22c55e;">$${((p.finalAmountAfterFees || p.finalPayoutUSD) / 100).toFixed(2)}</div>
                                <div style="font-size:11px; color:var(--text-secondary);">Monto final</div>
                            </div>
                        </div>
                    ` : '<div style="color:#f59e0b;">⚠️ El profesor no ha elegido método de retiro</div>'}
                </div>

                <!-- Documento Tributario -->
                <div style="background:var(--bg-card); padding:20px; border-radius:12px; border:1px solid ${p.invoice?.status === 'verified' ? '#22c55e' : p.invoice?.status === 'submitted' ? '#f59e0b' : '#ef4444'};">
                    <h4 style="margin:0 0 15px 0; color:var(--text-primary);">📄 Documento Tributario</h4>
                    ${p.invoice && p.invoice.number ? `
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <div>
                                <div style="font-weight:600;">${getInvoiceTypeLabel(p.invoice.type)} #${p.invoice.number}</div>
                                <div style="color:var(--text-secondary); font-size:12px;">
                                    Emitido: ${p.invoice.issueDate ? new Date(p.invoice.issueDate).toLocaleDateString('es-CL') : '-'}
                                </div>
                            </div>
                            <div>
                                ${getInvoiceStatusBadge(p.invoice.status)}
                            </div>
                        </div>
                        ${p.invoice.status === 'submitted' ? `
                            <div style="display:flex; gap:10px; margin-top:15px;">
                                <button class="btn btn-success btn-sm" onclick="verifyInvoice('${p._id}')">✓ Verificar Doc</button>
                                <button class="btn btn-danger btn-sm" onclick="rejectInvoice('${p._id}')">✗ Rechazar</button>
                            </div>
                        ` : ''}
                    ` : '<div style="color:#ef4444;">❌ El profesor no ha enviado documento tributario</div>'}
                </div>

                <!-- Método de Pago (info del profesor) -->
                <div style="background:var(--bg-card); padding:20px; border-radius:12px; border:1px solid var(--border-color);">
                    <h4 style="margin:0 0 15px 0; color:var(--text-primary);">🏦 Datos de Pago del Profesor</h4>
                    ${teacher.teacherData?.paymentInfo ? `
                        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; font-size:13px;">
                            <div><strong>País:</strong> ${teacher.teacherData.paymentInfo.country || 'CL'}</div>
                            <div><strong>Método:</strong> ${teacher.teacherData.paymentInfo.method || '-'}</div>
                            ${teacher.teacherData.paymentInfo.bankTransfer?.bankName ? `
                                <div><strong>Banco:</strong> ${teacher.teacherData.paymentInfo.bankTransfer.bankName}</div>
                                <div><strong>Cuenta:</strong> ****${(teacher.teacherData.paymentInfo.bankTransfer.accountNumber || '').slice(-4)}</div>
                            ` : ''}
                            ${teacher.teacherData.paymentInfo.paypal?.email ? `
                                <div><strong>PayPal:</strong> ${teacher.teacherData.paymentInfo.paypal.email}</div>
                            ` : ''}
                            ${teacher.teacherData.paymentInfo.wise?.email ? `
                                <div><strong>Wise:</strong> ${teacher.teacherData.paymentInfo.wise.email}</div>
                            ` : ''}
                        </div>
                    ` : (wallet.preferredMethod ? `
                        <div style="display:flex; align-items:center; gap:10px;">
                            <span style="font-size:24px;">${getMethodIcon(wallet.preferredMethod)}</span>
                            <div>
                                <div style="font-weight:600; text-transform:capitalize;">${wallet.preferredMethod.replace('_', ' ')}</div>
                                <div style="color:var(--text-secondary); font-size:13px;">
                                    ${wallet.paypalEmail || wallet.mercadopagoEmail || (wallet.bankAccount ? `${wallet.bankAccount.bankName} ****${wallet.bankAccount.lastFour}` : 'No configurado')}
                                </div>
                            </div>
                        </div>
                    ` : '<div style="color:#888;">No ha configurado datos de pago</div>')}
                </div>

                <!-- Ajustes -->
                ${p.adjustments && p.adjustments.length > 0 ? `
                <div style="background:var(--bg-card); padding:20px; border-radius:12px; border:1px solid var(--border-color);">
                    <h4 style="margin:0 0 15px 0; color:var(--text-primary);">📝 Ajustes</h4>
                    ${p.adjustments.map(adj => `
                        <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid var(--border-color);">
                            <span>${adj.description}</span>
                            <span style="color:${adj.amountUSD >= 0 ? '#22c55e' : '#ef4444'}; font-weight:600;">
                                ${adj.amountUSD >= 0 ? '+' : ''}$${(adj.amountUSD / 100).toFixed(2)}
                            </span>
                        </div>
                    `).join('')}
                </div>
                ` : ''}

                <!-- Acciones -->
                <div style="display:flex; gap:10px; justify-content:flex-end; flex-wrap:wrap; padding-top:10px; border-top:1px solid var(--border-color);">
                    ${p.status === 'pending-review' || p.status === 'calculating' ? `
                        <button class="btn btn-secondary" onclick="addPayoutAdjustment('${p._id}')">
                            ➕ Agregar Ajuste
                        </button>
                        <button class="btn btn-danger" onclick="rejectPayout('${p._id}')">
                            ❌ Rechazar
                        </button>
                        <button class="btn btn-success" onclick="approvePayout('${p._id}')">
                            ✓ Aprobar Payout
                        </button>
                    ` : ''}
                    ${p.status === 'approved' ? `
                        <button class="btn btn-secondary" onclick="executePayoutAuto('${p._id}')" ${!canAutoExecute(p) ? 'disabled title="Falta doc verificado o método de retiro"' : ''}>
                            ⚡ Pago Automático
                        </button>
                        <button class="btn btn-primary" onclick="markPayoutPaid('${p._id}')">
                            💰 Marcar Pagado Manual
                        </button>
                    ` : ''}
                </div>
            </div>
        `;

        document.getElementById('payout-modal').style.display = 'flex';

    } catch (error) {
        console.error('[Payout Detail] Error:', error);
        showNotification('Error cargando detalle', 'error');
    }
}

function closePayoutModal() {
    document.getElementById('payout-modal').style.display = 'none';
    currentPayoutId = null;
}

async function approvePayout(payoutId) {
    const notes = prompt('Notas de aprobación (opcional):');
    if (notes === null) return; // Canceló

    try {
        const res = await fetch(`/api/admin/payouts/${payoutId}/approve`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ notes })
        });
        
        const data = await res.json();
        
        if (data.success) {
            showNotification('✅ Payout aprobado', 'success');
            closePayoutModal();
            loadPayouts();
        } else {
            showNotification(data.error || 'Error aprobando', 'error');
        }
    } catch (error) {
        showNotification('Error de conexión', 'error');
    }
}

async function rejectPayout(payoutId) {
    const reason = prompt('Razón del rechazo:');
    if (!reason) return;

    try {
        const res = await fetch(`/api/admin/payouts/${payoutId}/reject`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ reason })
        });
        
        const data = await res.json();
        
        if (data.success) {
            showNotification('Payout rechazado', 'success');
            closePayoutModal();
            loadPayouts();
        } else {
            showNotification(data.error || 'Error rechazando', 'error');
        }
    } catch (error) {
        showNotification('Error de conexión', 'error');
    }
}

async function markPayoutPaid(payoutId) {
    const paymentReference = prompt('Referencia de pago (ID de transacción, comprobante, etc.):');
    if (!paymentReference) return;

    const paymentMethod = prompt('Método usado (paypal, mercadopago, bank_transfer, manual):', 'manual');
    if (!paymentMethod) return;

    try {
        const res = await fetch(`/api/admin/payouts/${payoutId}/mark-paid`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ paymentMethod, paymentReference })
        });
        
        const data = await res.json();
        
        if (data.success) {
            showNotification('💰 Payout marcado como pagado', 'success');
            closePayoutModal();
            loadPayouts();
        } else {
            showNotification(data.error || 'Error', 'error');
        }
    } catch (error) {
        showNotification('Error de conexión', 'error');
    }
}

async function addPayoutAdjustment(payoutId) {
    const description = prompt('Descripción del ajuste:');
    if (!description) return;

    const amountStr = prompt('Monto en USD (positivo = bono, negativo = descuento):');
    if (!amountStr) return;

    const amountUSD = Math.round(parseFloat(amountStr) * 100); // Convertir a centavos
    if (isNaN(amountUSD)) {
        showNotification('Monto inválido', 'error');
        return;
    }

    try {
        const res = await fetch(`/api/admin/payouts/${payoutId}/adjustment`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ description, amountUSD })
        });
        
        const data = await res.json();
        
        if (data.success) {
            showNotification('Ajuste agregado', 'success');
            openPayoutDetail(payoutId); // Recargar detalle
        } else {
            showNotification(data.error || 'Error', 'error');
        }
    } catch (error) {
        showNotification('Error de conexión', 'error');
    }
}

async function generateMonthlyPayouts() {
    if (!confirm('¿Generar payouts para el mes anterior? Esto creará payouts para todos los profesores con clases completadas.')) {
        return;
    }

    try {
        const res = await fetch('/api/admin/payouts/generate-monthly', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`,
                'Content-Type': 'application/json'
            }
        });
        
        const data = await res.json();
        
        if (data.success) {
            showNotification(`✅ ${data.message}`, 'success');
            loadPayouts();
        } else {
            showNotification(data.error || 'Error generando payouts', 'error');
        }
    } catch (error) {
        showNotification('Error de conexión', 'error');
    }
}

// Verificar documento tributario
async function verifyInvoice(payoutId) {
    if (!confirm('¿Verificar este documento tributario?')) return;

    try {
        const res = await fetch(`/api/admin/payouts/${payoutId}/verify-invoice`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`,
                'Content-Type': 'application/json'
            }
        });
        
        const data = await res.json();
        
        if (data.success) {
            showNotification('✅ Documento verificado', 'success');
            openPayoutDetail(payoutId);
        } else {
            showNotification(data.error || 'Error', 'error');
        }
    } catch (error) {
        showNotification('Error de conexión', 'error');
    }
}

// Rechazar documento tributario
async function rejectInvoice(payoutId) {
    const reason = prompt('Razón del rechazo del documento:');
    if (!reason) return;

    try {
        const res = await fetch(`/api/admin/payouts/${payoutId}/reject-invoice`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ reason })
        });
        
        const data = await res.json();
        
        if (data.success) {
            showNotification('Documento rechazado', 'success');
            openPayoutDetail(payoutId);
        } else {
            showNotification(data.error || 'Error', 'error');
        }
    } catch (error) {
        showNotification('Error de conexión', 'error');
    }
}

// Ejecutar pago automático
async function executePayoutAuto(payoutId) {
    if (!confirm('¿Ejecutar pago automático? Se intentará transferir usando el método seleccionado por el profesor.')) {
        return;
    }

    showNotification('🔄 Procesando pago...', 'info');

    try {
        const res = await fetch(`/api/admin/payouts/${payoutId}/execute`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ skipInvoiceCheck: false })
        });
        
        const data = await res.json();
        
        if (data.success) {
            showNotification(`💰 ${data.message}`, 'success');
            closePayoutModal();
            loadPayouts();
        } else {
            showNotification(data.error || 'Error ejecutando pago', 'error');
        }
    } catch (error) {
        showNotification('Error de conexión', 'error');
    }
}

// ==================== ENTREVISTAS DE BIENVENIDA ====================

let interviewBlockCount = 0;

/**
 * Agrega un bloque horario semanal para entrevistas
 */
function addInterviewBlock() {
    const container = document.getElementById('interview-weekly-blocks');
    if (!container) return;
    
    const blockId = interviewBlockCount++;
    const blockHtml = `
        <div id="interview-block-${blockId}" style="display:flex; gap:8px; align-items:center; background:#0d0d1a; padding:10px; border-radius:8px;">
            <select id="interview-day-${blockId}" class="form-input" style="flex:1; font-size:12px;">
                <option value="1">Lunes</option>
                <option value="2">Martes</option>
                <option value="3">Miércoles</option>
                <option value="4">Jueves</option>
                <option value="5">Viernes</option>
                <option value="6">Sábado</option>
                <option value="0">Domingo</option>
            </select>
            <input type="time" id="interview-start-${blockId}" class="form-input" value="09:00" style="flex:0.7; font-size:12px;">
            <span style="color:#666;">a</span>
            <input type="time" id="interview-end-${blockId}" class="form-input" value="12:00" style="flex:0.7; font-size:12px;">
            <button onclick="removeInterviewBlock(${blockId})" style="background:none; border:none; color:#f87171; cursor:pointer; font-size:16px;">✕</button>
        </div>
    `;
    container.insertAdjacentHTML('beforeend', blockHtml);
}

function removeInterviewBlock(blockId) {
    document.getElementById(`interview-block-${blockId}`)?.remove();
}

/**
 * Genera slots de entrevista basados en los bloques horarios configurados
 */
async function generateInterviewSlots() {
    const container = document.getElementById('interview-weekly-blocks');
    const blocks = container.querySelectorAll('[id^="interview-block-"]');
    
    if (blocks.length === 0) {
        showNotification('Agrega al menos un bloque horario', 'error');
        return;
    }
    
    const weeklySlots = [];
    blocks.forEach(block => {
        const id = block.id.replace('interview-block-', '');
        const dayOfWeek = parseInt(document.getElementById(`interview-day-${id}`)?.value);
        const startTime = document.getElementById(`interview-start-${id}`)?.value;
        const endTime = document.getElementById(`interview-end-${id}`)?.value;
        
        if (!isNaN(dayOfWeek) && startTime && endTime) {
            weeklySlots.push({ dayOfWeek, startTime, endTime });
        }
    });
    
    if (weeklySlots.length === 0) {
        showNotification('Configura al menos un bloque válido', 'error');
        return;
    }
    
    const meetingLink = document.getElementById('interview-meeting-link')?.value || '';
    const timezone = document.getElementById('interview-timezone')?.value || 'America/Santiago';
    const weeksAhead = parseInt(document.getElementById('interview-weeks-ahead')?.value) || 4;
    
    try {
        const res = await fetch('/api/welcome-kit/v2/interview-availability', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${userSession.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                weeklySlots,
                weeksAhead,
                duration: 15,
                meetingLink,
                timezone
            })
        });
        
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
        
        showNotification(`✅ ${data.message}`, 'success');
        loadInterviewCalendar();
    } catch (error) {
        showNotification('Error: ' + error.message, 'error');
    }
}

/**
 * Carga el calendario de entrevistas del admin
 */
async function loadInterviewCalendar() {
    try {
        const res = await fetch('/api/welcome-kit/v2/interview-calendar', {
            headers: { 'Authorization': `Bearer ${userSession.token}` }
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
        
        // Actualizar stats
        const s = data.stats || {};
        const el = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
        el('interview-stat-available', s.available || 0);
        el('interview-stat-booked', s.booked || 0);
        el('interview-stat-upcoming', s.upcoming || 0);
        el('interview-stat-completed', s.completed || 0);
        
        renderInterviewSlots(data.slots || []);
    } catch (error) {
        console.error('Error cargando entrevistas:', error);
    }
}

/**
 * Renderiza la lista de slots de entrevista
 */
function renderInterviewSlots(slots) {
    const container = document.getElementById('interview-calendar-list');
    if (!container) return;
    
    if (slots.length === 0) {
        container.innerHTML = `
            <div style="text-align:center; padding:40px 20px; color:#666;">
                <div style="font-size:48px; margin-bottom:15px;">📅</div>
                <p>No hay slots de entrevista. Configura tu disponibilidad arriba.</p>
            </div>
        `;
        return;
    }
    
    // Agrupar por fecha
    const grouped = {};
    slots.forEach(slot => {
        const dateKey = new Date(slot.startTime).toLocaleDateString('es-CL', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });
        if (!grouped[dateKey]) grouped[dateKey] = [];
        grouped[dateKey].push(slot);
    });
    
    let html = '';
    for (const [dateLabel, daySlots] of Object.entries(grouped)) {
        const capitalDate = dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1);
        html += `<div style="margin-bottom:20px;">`;
        html += `<h4 style="color:#d4af37; margin:0 0 10px; font-size:14px; border-bottom:1px solid #333; padding-bottom:6px;">📅 ${capitalDate}</h4>`;
        html += `<div style="display:grid; gap:6px;">`;
        
        for (const slot of daySlots) {
            const time = new Date(slot.startTime).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: true });
            const endTime = new Date(slot.endTime).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: true });
            
            let statusBadge = '';
            let actions = '';
            const isSetup = slot.purpose === 'setup';
            const purposeTag = isSetup 
                ? `<span style="background:rgba(249,115,22,0.15); color:#f97316; padding:2px 6px; border-radius:3px; font-size:10px; font-weight:600;">⚙️ SETUP</span>` 
                : '';
            
            if (slot.status === 'available') {
                statusBadge = `<span style="background:rgba(34,197,94,0.15); color:#22c55e; padding:3px 8px; border-radius:4px; font-size:11px;">Disponible</span>`;
                actions = `<button onclick="deleteInterviewSlot('${slot._id}')" style="background:none; border:none; color:#f87171; cursor:pointer; font-size:12px;" title="Eliminar">🗑️</button>`;
            } else if (slot.status === 'booked') {
                const clientName = slot.booking?.clientName || 'Cliente';
                const bookedColor = isSetup ? '#f97316' : '#3b82f6';
                const bookedIcon = isSetup ? '⚙️' : '🎯';
                statusBadge = `<span style="background:${bookedColor}20; color:${bookedColor}; padding:3px 8px; border-radius:4px; font-size:11px;">${bookedIcon} ${clientName}</span>`;
                const completeLabel = isSetup ? '✅ Completar Setup' : '✅ Completar';
                actions = `<button onclick="completeInterview('${slot._id}')" style="background:#10b981; border:none; color:white; padding:4px 10px; border-radius:4px; cursor:pointer; font-size:11px;">${completeLabel}</button>`;
            } else if (slot.status === 'completed') {
                const clientName = slot.booking?.clientName || 'Cliente';
                statusBadge = `<span style="background:rgba(139,92,246,0.15); color:#8b5cf6; padding:3px 8px; border-radius:4px; font-size:11px;">✅ ${clientName}</span>`;
            }
            
            const borderColor = isSetup 
                ? (slot.status === 'booked' ? '#f97316' : slot.status === 'completed' ? '#8b5cf6' : '#22c55e')
                : (slot.status === 'booked' ? '#3b82f6' : slot.status === 'completed' ? '#8b5cf6' : '#22c55e');
            
            html += `
                <div style="display:flex; align-items:center; justify-content:space-between; background:#0d0d1a; padding:10px 14px; border-radius:8px; border-left:3px solid ${borderColor};">
                    <div style="display:flex; align-items:center; gap:12px;">
                        <span style="color:#fff; font-size:13px; font-weight:500;">${time} - ${endTime}</span>
                        ${purposeTag}
                        ${statusBadge}
                    </div>
                    <div>${actions}</div>
                </div>
            `;
        }
        
        html += `</div></div>`;
    }
    
    container.innerHTML = html;
}

/**
 * Elimina un slot de entrevista disponible
 */
async function deleteInterviewSlot(slotId) {
    if (!confirm('¿Eliminar este slot de entrevista?')) return;
    
    try {
        const res = await fetch(`/api/welcome-kit/v2/interview-slots/${slotId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${userSession.token}` }
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
        
        showNotification('Slot eliminado', 'success');
        loadInterviewCalendar();
    } catch (error) {
        showNotification('Error: ' + error.message, 'error');
    }
}

/**
 * Marca una entrevista como completada
 */
async function completeInterview(slotId) {
    const notes = prompt('Notas de la entrevista (opcional):') || '';
    
    try {
        const res = await fetch(`/api/welcome-kit/v2/interview-slots/${slotId}/complete`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${userSession.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ notes })
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
        
        showNotification('✅ Entrevista completada', 'success');
        loadInterviewCalendar();
    } catch (error) {
        showNotification('Error: ' + error.message, 'error');
    }
}

// ==================== PERFIL ADMINISTRADOR ====================

/**
 * Carga el perfil del administrador desde la API y rellena los campos
 */
async function loadAdminProfile() {
    try {
        const res = await fetch('/api/welcome-kit/v2/admin-profile', {
            headers: { 'Authorization': `Bearer ${userSession.token}` }
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
        
        const p = data.profile;
        
        // Rellenar campos
        document.getElementById('admin-profile-name').value = p.name || '';
        document.getElementById('admin-profile-whatsapp').value = p.whatsapp || '';
        document.getElementById('admin-profile-email').value = p.email || '';
        document.getElementById('admin-profile-role').value = p.role || '';
        document.getElementById('admin-profile-meeting').value = p.meetingLink || '';
        document.getElementById('admin-profile-timezone').value = p.timezone || 'America/Santiago';
        document.getElementById('admin-profile-hours').value = p.businessHours || '';
        document.getElementById('admin-profile-instagram').value = p.socialMedia?.instagram || '';
        document.getElementById('admin-profile-youtube').value = p.socialMedia?.youtube || '';
        document.getElementById('admin-profile-tiktok').value = p.socialMedia?.tiktok || '';
        document.getElementById('admin-profile-signature').value = p.signature || '';
        
        // Actualizar preview
        updateAdminProfilePreview();
        
        // Listeners para preview en tiempo real
        ['admin-profile-name', 'admin-profile-whatsapp'].forEach(id => {
            document.getElementById(id).addEventListener('input', updateAdminProfilePreview);
        });
    } catch (error) {
        console.error('Error cargando perfil admin:', error);
        showNotification('Error cargando perfil: ' + error.message, 'error');
    }
}

/**
 * Actualiza la vista previa de cómo se ve el footer en los emails
 */
function updateAdminProfilePreview() {
    const name = document.getElementById('admin-profile-name').value || 'Equipo PianoLink';
    const whatsapp = document.getElementById('admin-profile-whatsapp').value || '+56959089770';
    
    const previewName = document.getElementById('preview-admin-name');
    const previewWA = document.getElementById('preview-admin-whatsapp');
    
    if (previewName) previewName.textContent = `${name} — PianoLink`;
    if (previewWA) previewWA.textContent = `💬 WhatsApp: ${whatsapp}`;
}

/**
 * Guarda el perfil del administrador
 */
async function saveAdminProfile() {
    const statusEl = document.getElementById('admin-profile-status');
    
    try {
        const body = {
            name: document.getElementById('admin-profile-name').value.trim(),
            whatsapp: document.getElementById('admin-profile-whatsapp').value.trim(),
            email: document.getElementById('admin-profile-email').value.trim(),
            role: document.getElementById('admin-profile-role').value.trim(),
            meetingLink: document.getElementById('admin-profile-meeting').value.trim(),
            timezone: document.getElementById('admin-profile-timezone').value,
            businessHours: document.getElementById('admin-profile-hours').value.trim(),
            signature: document.getElementById('admin-profile-signature').value.trim(),
            socialMedia: {
                instagram: document.getElementById('admin-profile-instagram').value.trim(),
                youtube: document.getElementById('admin-profile-youtube').value.trim(),
                tiktok: document.getElementById('admin-profile-tiktok').value.trim()
            }
        };
        
        // Validaciones básicas
        if (!body.name) {
            showNotification('El nombre es obligatorio', 'error');
            return;
        }
        if (!body.whatsapp) {
            showNotification('El WhatsApp es obligatorio', 'error');
            return;
        }
        
        const res = await fetch('/api/welcome-kit/v2/admin-profile', {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${userSession.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });
        
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
        
        // Mostrar confirmación
        if (statusEl) {
            statusEl.style.display = 'block';
            statusEl.style.background = 'rgba(34,197,94,0.15)';
            statusEl.style.color = '#22c55e';
            statusEl.style.border = '1px solid #22c55e40';
            statusEl.innerHTML = '✅ Perfil guardado correctamente. Los próximos emails usarán estos datos.';
            setTimeout(() => { statusEl.style.display = 'none'; }, 5000);
        }
        
        showNotification('✅ Perfil guardado', 'success');
    } catch (error) {
        console.error('Error guardando perfil:', error);
        if (statusEl) {
            statusEl.style.display = 'block';
            statusEl.style.background = 'rgba(239,68,68,0.15)';
            statusEl.style.color = '#ef4444';
            statusEl.style.border = '1px solid #ef444440';
            statusEl.innerHTML = '❌ Error: ' + error.message;
        }
        showNotification('Error guardando perfil: ' + error.message, 'error');
    }
}

