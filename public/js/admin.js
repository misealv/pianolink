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
        'students': { icon: '👨‍🎓', text: 'Alumnos' },
        'payments': { icon: '💰', text: 'Pagos' },
        'welcome-kits': { icon: '📦', text: 'Welcome Kits' }
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
        case 'students': loadStudents(); break;
        case 'payments': loadPaymentsDashboard(); break;
        case 'welcome-kits': loadWelcomeKits(); break;
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
    if (menu) menu.classList.toggle('show');
}

function closeAllMenus() {
    document.querySelectorAll('.actions-dropdown').forEach(m => m.classList.remove('show'));
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
            <input type="text" class="beneficiary-name" placeholder="Nombre del alumno">
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
            '<tr><td colspan="6" style="text-align:center; padding:40px; color:#ff4444;">Error al cargar profesores</td></tr>';
    }
}

function renderTeachersTable(teachers) {
    const tbody = document.getElementById('teachers-table-body');
    
    if (!teachers || teachers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:40px; color:#666;">No hay profesores registrados</td></tr>';
        return;
    }
    
    tbody.innerHTML = teachers.map(t => {
        const founderBadge = t.isFoundingMember 
            ? '<span class="status-badge" style="background:linear-gradient(135deg,#bf953f,#fcf6ba,#b38728);color:#3e2723;border:none;">★ FUNDADOR</span>'
            : '<span class="status-badge status-inactive">Regular</span>';
        
        const country = (t.branding && t.branding.country) || '-';
        const slug = t.slug ? `<a href="/?sala=${t.slug}" target="_blank" style="color:var(--accent-blue);">/c/${t.slug}</a>` : '-';
        
        return `
            <tr>
                <td>
                    <strong style="color:#fff;">${t.name}</strong>
                    <div style="font-size:11px; color:#666;">${country}</div>
                </td>
                <td style="color:#aaa;">${t.email}</td>
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
    if (menu) menu.classList.toggle('show');
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
    if (!kit) return;
    
    // Guardar país para auto-complete
    window.currentShippingCountry = kit.shipping?.address?.country || kit.country || 'CL';
    
    document.getElementById('shipping-kit-id').value = kitId;
    document.getElementById('shipping-client-name').textContent = kit.clientId?.name || 'Cliente';
    document.getElementById('shipping-client-address').textContent = 
        `${kit.shipping?.address?.street || ''}, ${kit.shipping?.address?.city || ''}, ${kit.shipping?.address?.country || ''}`;
    
    document.getElementById('shipping-status').value = kit.shipping?.status || 'processing';
    document.getElementById('shipping-carrier').value = kit.shipping?.carrier || '';
    document.getElementById('shipping-tracking').value = kit.shipping?.trackingNumber || '';
    document.getElementById('shipping-url').value = kit.shipping?.trackingUrl || '';
    
    // Limpiar detección previa
    document.getElementById('tracking-detected').style.display = 'none';
    document.getElementById('delivery-range').textContent = '';
    
    if (kit.shipping?.estimatedDelivery) {
        document.getElementById('shipping-estimated').value = 
            new Date(kit.shipping.estimatedDelivery).toISOString().split('T')[0];
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
Cliente: ${kit.clientId?.name || 'N/A'}
Email: ${kit.clientId?.email || 'N/A'}
País: ${kit.shipping?.address?.country || 'N/A'}
Estado: ${kit.overallStatus}
Carrier: ${kit.shipping?.carrier || 'N/A'}
Tracking: ${kit.shipping?.trackingNumber || 'N/A'}
Pagado: ${kit.payment?.amount} ${kit.payment?.currency}
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

// ==================== ALUMNOS ====================
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
        console.error('Error cargando alumnos:', error);
        showNotification('Error cargando alumnos', 'error');
    }
}

function renderStudentsTable(students) {
    const tbody = document.getElementById('students-table-body');
    
    if (!students || students.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:40px; color:#666;">No hay alumnos registrados</td></tr>';
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
    currentStudentId = null;
    document.getElementById('student-modal-title').textContent = '➕ Nuevo Alumno';
    document.getElementById('student-name').value = '';
    document.getElementById('student-email').value = '';
    document.getElementById('student-password').value = '';
    document.getElementById('student-password').placeholder = 'Mínimo 6 caracteres';
    
    // Load teachers for dropdown
    await loadTeachersDropdown('student-teacher');
    
    openModal('create-student-modal');
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
                showNotification('Alumno actualizado', 'success');
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
                showNotification('Alumno creado exitosamente', 'success');
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
    document.getElementById('student-modal-title').textContent = '✏️ Editar Alumno';
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
            showNotification('Alumno eliminado', 'success');
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
                    <div>👤 Para: <strong>${p.targetRole === 'teacher' ? 'Profesores' : 'Alumnos'}</strong></div>
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
    
    if (tabName === 'products') {
        loadKitProductsList();
    } else if (tabName === 'orders') {
        loadKitOrdersList();
    } else if (tabName === 'pricing') {
        loadServicePricing();
    }
}

async function loadWelcomeKitsModule() {
    // Cargar stats rápidos
    try {
        const [productsRes, ordersRes] = await Promise.all([
            fetch('/api/welcome-kit/admin/products', {
                headers: { 'Authorization': `Bearer ${userSession.token}` }
            }),
            fetch('/api/welcome-kit/admin/orders', {
                headers: { 'Authorization': `Bearer ${userSession.token}` }
            })
        ]);
        
        const productsData = await productsRes.json();
        const ordersData = await ordersRes.json();
        
        // Actualizar stats
        document.getElementById('kit-stat-products').textContent = productsData.products?.length || 0;
        
        if (ordersData.success && ordersData.orders) {
            const orders = ordersData.orders;
            const pending = orders.filter(o => o.shippingStatus === 'pending' || o.shippingStatus === 'paid').length;
            const transit = orders.filter(o => o.shippingStatus === 'shipped').length;
            const delivered = orders.filter(o => o.shippingStatus === 'delivered').length;
            
            document.getElementById('kit-stat-pending').textContent = pending;
            document.getElementById('kit-stat-transit').textContent = transit;
            document.getElementById('kit-stat-delivered').textContent = delivered;
            
            // Calcular revenue del mes
            const thisMonth = new Date().getMonth();
            const revenue = orders
                .filter(o => new Date(o.createdAt).getMonth() === thisMonth && o.paymentStatus === 'completed')
                .reduce((sum, o) => sum + (o.total || 0), 0);
            document.getElementById('kit-stat-revenue').textContent = `$${revenue.toFixed(0)}`;
        }
    } catch (error) {
        console.error('Error cargando stats:', error);
    }
    
    // Cargar productos por defecto
    loadKitProductsList();
    
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
            return;
        }
        
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

// ==================== CERRAR MODALES CON ESC ====================
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
    }
});

// ==================== INICIALIZAR ====================
document.addEventListener('DOMContentLoaded', () => {
    // Cargar dashboard por defecto
    switchModule('dashboard');
});
