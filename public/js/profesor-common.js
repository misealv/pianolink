/**
 * JS Compartido — Dashboard Profesor (Sprint 4)
 * Extraído del monolito dashboard.html para reutilizarse en todas las sub-vistas.
 * 
 * Provee: autenticación, sidebar, brand, mensajes admin, ganancias, 
 *         membresía básica, navegación, founder chat, helpers.
 */

// ============================================
// 1. AUTENTICACIÓN Y BOOTSTRAP
// ============================================

// Verificar Stripe redirect ANTES de comprobar login
(function checkStripeRedirect() {
    const urlParams = new URLSearchParams(window.location.search);
    const pendingSessionId = urlParams.get('session_id');
    if (urlParams.get('subscription') === 'success' && pendingSessionId) {
        localStorage.setItem('pendingStripeSession', pendingSessionId);
        console.log('[PL] 💾 Session ID guardado:', pendingSessionId);
        window.history.replaceState({}, document.title, window.location.pathname);
    }
})();

/** Usuario autenticado (o null si no existe) */
const user = JSON.parse(localStorage.getItem('pianoUser'));
if (!user || user.role !== 'teacher') {
    console.log('[PL] ⚠️ No hay usuario teacher, redirigiendo a login');
    window.location.href = '/login.html';
}

/** URL base de la API del profesor */
const API_URL = '/api/teacher';

/** Token de autenticación (para headers Authorization) */
function getToken() {
    return user?.token || localStorage.getItem('token') || '';
}

/** Headers estándar para fetch con JSON */
function authHeaders(json = true) {
    const h = { 'Authorization': `Bearer ${getToken()}` };
    if (json) h['Content-Type'] = 'application/json';
    return h;
}

/** Wrapper para fetch con manejo de errores básico */
async function apiFetch(url, options = {}) {
    if (!options.headers) options.headers = authHeaders(false);
    try {
        const res = await fetch(url, options);
        return await res.json();
    } catch (err) {
        console.error('[PL] API error:', url, err);
        return { success: false, error: 'Error de conexión' };
    }
}

// ============================================
// 2. FUNCIONES GLOBALES DE UI
// ============================================

function logout() {
    localStorage.removeItem('pianoUser');
    window.location.href = '/login.html';
}

/** Escapar HTML para prevenir XSS */
function escHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/** Escapar atributos HTML */
function escAttr(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/** Obtener iniciales de un nombre */
function getInitials(name) {
    if (!name) return '?';
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

// ============================================
// 3. SIDEBAR — GENERACIÓN DINÁMICA
// ============================================

/**
 * Genera e inyecta el sidebar del profesor.
 * Reutiliza un <aside id="sidebarContainer"> existente o crea uno nuevo.
 * @param {string} activePage - Identificador de la página activa (dashboard|calendario|estudiantes|validar|perfil)
 */
function renderSidebar(activePage = 'dashboard') {
    // Reutilizar contenedor existente o crear uno nuevo
    let aside = document.getElementById('sidebarContainer');
    if (!aside) {
        aside = document.createElement('aside');
        aside.id = 'sidebarContainer';
        document.body.prepend(aside);
    }
    aside.className = 'sidebar';
    aside.innerHTML = `
    <div class="sidebar-header" id="sidebarBrand">
        <div class="brand-fallback">🎹 PIANO LINK</div>
    </div>

    <div class="sidebar-content">
        <div class="user-summary">
            <div class="welcome-text">Bienvenido</div>
            <div id="welcomeName" class="user-name">${escHtml(user?.name || 'Profesor')}</div>
            <div id="founderBadge" class="gold-badge">★ PROFESOR FUNDADOR</div>
        </div>

        <!-- 💰 MIS GANANCIAS (resumen) -->
        <div id="earningsCard" style="background: linear-gradient(135deg, #1e2e1e 0%, #2d442d 100%); border-radius: 10px; padding: 14px; border: 1px solid #3d5c3d; margin-bottom: 15px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <div style="color: #4ade80; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">💰 Mis Ganancias</div>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                <div style="background: rgba(0,0,0,0.2); border-radius: 6px; padding: 8px; text-align: center;">
                    <div id="earningsEscrow" style="color: #fbbf24; font-size: 18px; font-weight: 800;">$0</div>
                    <div style="color: #888; font-size: 9px;">En escrow</div>
                </div>
                <div style="background: rgba(0,0,0,0.2); border-radius: 6px; padding: 8px; text-align: center;">
                    <div id="earningsPaid" style="color: #4ade80; font-size: 18px; font-weight: 800;">$0</div>
                    <div style="color: #888; font-size: 9px;">Total pagado</div>
                </div>
            </div>
            <div id="earningsPending" style="margin-top: 8px; text-align: center; color: #888; font-size: 10px;">
                <span id="pendingValidationCount">0</span> clases por validar
            </div>
        </div>

        <!-- Acciones rápidas -->
        <div>
            <button id="btnOpenRoom" class="action-btn btn-primary" onclick="window.open('/c/${escAttr(user?.slug || '')}', '_blank')">
                ⚡ IR A MI SALA
            </button>
            <button onclick="copyInviteLink()" class="action-btn btn-secondary">
                🔗 COPIAR LINK ALUMNO
            </button>
            <button onclick="window.location.href='/teacher-availability.html'" class="action-btn btn-secondary">
                📅 MI DISPONIBILIDAD
            </button>
        </div>

        <!-- Navegación entre sub-vistas -->
        <nav class="profesor-nav" style="flex-direction: column; gap: 4px;">
            <a href="/dashboard.html" class="${activePage === 'dashboard' ? 'active' : ''}">🏠 Resumen</a>
            <a href="/profesor/calendario.html" class="${activePage === 'calendario' ? 'active' : ''}">📅 Mi Agenda</a>
            <a href="/profesor/estudiantes.html" class="${activePage === 'estudiantes' ? 'active' : ''}">👥 Mis Estudiantes</a>
            <a href="/profesor/validar.html" class="${activePage === 'validar' ? 'active' : ''}">
                ✅ Validar Clases
                <span id="validationsCount" style="display: none; background: #ef4444; color: white; font-size: 10px; font-weight: bold; padding: 2px 6px; border-radius: 10px; min-width: 18px;">0</span>
            </a>
            <a href="/profesor/perfil.html" class="${activePage === 'perfil' ? 'active' : ''}">🌐 Mi Perfil Público</a>
        </nav>

        <div id="copyFeedback" style="font-size: 10px; color: #b4e080; text-align: center; margin-top: 5px; min-height: 15px;"></div>

        <!-- Chat fundador (se muestra si es founder) -->
        <div id="founderSection" style="display:none; margin-top: auto;">
            <div class="founder-chat-container">
                <div class="founder-chat-header">👑 Soporte Directo</div>
                <div id="founderChatHistory" class="founder-chat-history">
                    <div style="text-align:center; color:#444; font-size:10px; margin-top:10px;">Cargando historial...</div>
                </div>
                <div class="chat-input-box">
                    <input type="text" id="founderChatInput" placeholder="Escribir..." onkeydown="if(event.key==='Enter') sendFounderMsg()">
                    <button class="chat-btn-mini" onclick="sendFounderMsg()">➤</button>
                </div>
            </div>
        </div>

        <button class="action-btn btn-secondary" onclick="logout()" style="border-color: #ff4d4d; color: #ff4d4d;">
            Cerrar Sesión
        </button>
    </div>
    `;
}

// ============================================
// 4. CARGA DE DATOS COMUNES
// ============================================

/** Cargar logo y marca global */
async function loadGlobalBrand() {
    try {
        const res = await fetch('/api/auth/platform-public');
        const config = await res.json();
        if (config.logoUrl) {
            const brandContainer = document.getElementById('sidebarBrand');
            if (brandContainer) brandContainer.innerHTML = `<img src="${config.logoUrl}" alt="Piano Link Logo">`;
        }
        if (config.faviconUrl) {
            let link = document.querySelector("link[rel~='icon']");
            if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
            link.href = config.faviconUrl;
        }
        if (config.name) document.title = document.title.replace('Piano Link', config.name);
    } catch (e) { console.log('[PL] Usando marca por defecto'); }
}

/** Cargar info básica del profesor (founder, branding) */
async function loadTeacherBasicData() {
    try {
        const res = await fetch(`${API_URL}/me?email=${user.email}`);
        const data = await res.json();
        if (data.isFoundingMember) {
            const badge = document.getElementById('founderBadge');
            const section = document.getElementById('founderSection');
            if (badge) badge.style.display = 'inline-flex';
            if (section) { section.style.display = 'block'; loadFounderChat(); setInterval(loadFounderChat, 5000); }
        }
        // Mensajes admin
        if (data.adminMessages && data.adminMessages.length > 0) {
            const msgSection = document.getElementById('adminMessagesSection');
            const msgList = document.getElementById('messagesList');
            if (msgSection && msgList) {
                msgSection.style.display = 'block';
                msgList.innerHTML = data.adminMessages.map(m =>
                    `<div style="padding: 8px 0; border-bottom: 1px solid #333;">
                        <span style="color:#5dade2;">${new Date(m.date).toLocaleDateString()}</span>: ${m.content}
                    </div>`
                ).join('');
            }
        }
        return data;
    } catch (e) {
        console.error('[PL] Error cargando datos del profesor:', e);
        return null;
    }
}

// ============================================
// 5. GANANCIAS DEL PROFESOR
// ============================================

let teacherEarnings = null;

async function loadTeacherEarnings() {
    try {
        const res = await fetch('/api/class-sessions/teacher-earnings', {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        const data = await res.json();
        if (data.success) {
            teacherEarnings = data.earnings;
            updateEarningsDisplay();
        }
    } catch (err) {
        console.error('[PL] Error cargando ganancias:', err);
    }
}

function updateEarningsDisplay() {
    if (!teacherEarnings) return;
    const escrow = (teacherEarnings.escrow / 100).toFixed(0);
    const paid = (teacherEarnings.totalPaid / 100).toFixed(0);
    const pending = teacherEarnings.classesPendingValidation;

    const elEscrow = document.getElementById('earningsEscrow');
    const elPaid = document.getElementById('earningsPaid');
    const elPending = document.getElementById('pendingValidationCount');
    if (elEscrow) elEscrow.textContent = `$${escrow}`;
    if (elPaid) elPaid.textContent = `$${paid}`;
    if (elPending) elPending.textContent = pending;
}

// ============================================
// 6. CONTEO DE VALIDACIONES PENDIENTES
// ============================================

async function loadValidationsCount() {
    try {
        const res = await fetch('/api/class-sessions/pending-validations', {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        const data = await res.json();
        if (data.success) {
            const count = data.sessions ? data.sessions.length : 0;
            const badge = document.getElementById('validationsCount');
            if (badge && count > 0) {
                badge.textContent = count;
                badge.style.display = 'inline-block';
            }
        }
    } catch (err) {
        console.error('[PL] Error cargando conteo validaciones:', err);
    }
}

// ============================================
// 7. FOUNDER CHAT
// ============================================

async function loadFounderChat() {
    const container = document.getElementById('founderChatHistory');
    if (!container) return;
    try {
        const res = await fetch(`${API_URL}/conversation?email=${user.email}`);
        const messages = await res.json();
        container.innerHTML = '';
        if (messages.length === 0) {
            container.innerHTML = '<div style="text-align:center; color:#444; font-size:10px; margin-top:20px;">Habla con soporte aquí.</div>';
            return;
        }
        messages.forEach(msg => {
            const div = document.createElement('div');
            if (msg.sender === 'admin') {
                div.className = 'bubble-admin';
                div.innerHTML = `<strong>SOPORTE:</strong> ${msg.content}`;
            } else {
                div.className = 'bubble-me';
                div.innerText = msg.content;
            }
            container.appendChild(div);
        });
        container.scrollTop = container.scrollHeight;
    } catch (e) { /* silencioso */ }
}

async function sendFounderMsg() {
    const input = document.getElementById('founderChatInput');
    if (!input) return;
    const content = input.value.trim();
    if (!content) return;
    const history = document.getElementById('founderChatHistory');
    const tempDiv = document.createElement('div');
    tempDiv.className = 'bubble-me';
    tempDiv.style.opacity = '0.5';
    tempDiv.innerText = content;
    history.appendChild(tempDiv);
    history.scrollTop = history.scrollHeight;
    input.value = '';
    try {
        const res = await fetch(`${API_URL}/feedback`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: user.email, content })
        });
        if (res.ok) loadFounderChat();
    } catch (e) { /* silencioso */ }
}

// ============================================
// 8. COPIAR LINK DE INVITACIÓN
// ============================================

function copyInviteLink() {
    const link = `${window.location.origin}/reservar/${user.slug || user.email}`;
    navigator.clipboard.writeText(link).then(() => {
        const feedback = document.getElementById('copyFeedback');
        if (feedback) {
            feedback.textContent = '✅ Link copiado al portapapeles';
            setTimeout(() => { feedback.textContent = ''; }, 3000);
        }
    }).catch(() => {
        // Fallback para navegadores que no soportan clipboard API
        const ta = document.createElement('textarea');
        ta.value = link;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        const feedback = document.getElementById('copyFeedback');
        if (feedback) {
            feedback.textContent = '✅ Link copiado';
            setTimeout(() => { feedback.textContent = ''; }, 3000);
        }
    });
}

// ============================================
// 9. INICIALIZACIÓN COMÚN
// ============================================

/**
 * Inicializa componentes comunes del dashboard del profesor.
 * Llamar después de que el DOM esté listo.
 * @param {string} activePage - Página activa para resaltar en sidebar nav
 */
async function initProfesorCommon(activePage = 'dashboard') {
    // Renderizar sidebar dinámico
    renderSidebar(activePage);

    // Cargar datos en paralelo
    await Promise.all([
        loadGlobalBrand(),
        loadTeacherBasicData(),
        loadTeacherEarnings(),
        loadValidationsCount()
    ]);
}
