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
        'payments': { icon: '💰', text: 'Pagos' }
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
        
        renderLeadsTable(allLeadsData);
    } catch (error) {
        console.error('Error loading leads:', error);
        document.getElementById('leads-table-body').innerHTML = 
            '<tr><td colspan="8" style="text-align:center; padding:40px; color:#ff4444;">Error al cargar leads</td></tr>';
    }
}

function renderLeadsTable(leads) {
    const tbody = document.getElementById('leads-table-body');
    
    if (!leads || leads.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:40px; color:#666;">No hay leads registrados</td></tr>';
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
        
        const source = lead.utmSource || lead.source || 'landing';
        const date = new Date(lead.createdAt).toLocaleDateString('es-ES');
        
        const whatsappClean = lead.whatsapp.replace(/[^\d]/g, '');
        const whatsappMsg = encodeURIComponent(`Hola ${lead.name.split(' ')[0]}, te escribo desde Piano Link.`);
        const whatsappLink = `https://wa.me/${whatsappClean}?text=${whatsappMsg}`;
        
        return `
            <tr>
                <td><strong style="color:#fff;">${lead.name}</strong></td>
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
    document.getElementById('create-lead-form').reset();
    openModal('create-lead-modal');
}

async function createLead(e) {
    e.preventDefault();
    
    const formData = {
        name: document.getElementById('new-lead-name').value.trim(),
        email: document.getElementById('new-lead-email').value.trim(),
        whatsapp: document.getElementById('new-lead-whatsapp').value.trim(),
        background: document.getElementById('new-lead-background').value.trim(),
        status: document.getElementById('new-lead-status').value,
        utmSource: 'manual',
        isManual: true
    };
    
    try {
        const res = await fetch('/api/leads', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });
        
        if (res.ok) {
            closeModal('create-lead-modal');
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
