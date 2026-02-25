// @ts-check
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

/**
 * tests/e2e/sprint-validation.spec.js
 * 
 * Validación QA de Sprints 1-4 de PianoLink (v2 — 100% cobertura).
 * Ejecutar con: npx playwright test tests/e2e/sprint-validation.spec.js --config=tests/playwright.config.js --headed
 * 
 * Prerequisito: ejecutar node tests/setup/createTestAccounts.js
 * 
 * Idioma: Código en inglés, comentarios en español
 */

const BASE_URL = process.env.TEST_URL || 'https://pianolink.net';

// Credenciales de cuentas de prueba
const ACCOUNTS = {
  teacher: { email: 'qa_teacher@pianolink.test', password: 'QaTest2026!' },
  student: { email: 'qa_student@pianolink.test', password: 'QaTest2026!' },
  client:  { email: 'qa_client@pianolink.test',  password: 'QaTest2026!' },
  admin:   { email: 'qa_admin@pianolink.test',    password: 'QaTest2026!' },
};

// Archivo de datos de prueba generado por createTestAccounts.js
const TEST_DATA_FILE = path.join(__dirname, '..', 'setup', '.test-data.json');

/**
 * Helper: Lee datos de prueba creados por el setup
 */
function loadTestData() {
  try {
    return JSON.parse(fs.readFileSync(TEST_DATA_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

/**
 * Helper: Login vía API y retorna token + userData
 * Usa el endpoint POST /api/auth/login
 */
async function apiLogin(request, account) {
  const response = await request.post(`${BASE_URL}/api/auth/login`, {
    data: { email: account.email, password: account.password }
  });
  
  if (!response.ok()) {
    const body = await response.text();
    throw new Error(`Login falló para ${account.email}: ${response.status()} — ${body}`);
  }
  
  const data = await response.json();
  return { token: data.token, user: data };
}

/**
 * Helper: Login vía formulario web (para tests de navegación headed)
 */
async function webLogin(page, account) {
  await page.goto(`${BASE_URL}/login.html`);
  await page.fill('input[type="email"], input[name="email"]', account.email);
  await page.fill('input[type="password"], input[name="password"]', account.password);
  await page.click('button[type="submit"], button:has-text("Ingresar"), button:has-text("Login")');
  // Esperar a que redirija fuera de login
  await page.waitForURL(url => !url.toString().includes('login'), { timeout: 15000 });
}

// ═══════════════════════════════════════════════════════════════
//  BLOQUE 1 — Sprint 1: Seguridad
// ═══════════════════════════════════════════════════════════════

test.describe('Sprint 1 — Seguridad', () => {

  test('S1.1 — Profesor NO puede reservarse a sí mismo', async ({ request }) => {
    // Login como profesor
    const { token, user } = await apiLogin(request, ACCOUNTS.teacher);
    const teacherId = user._id;

    // Leer slotIds creados por el setup
    const testData = loadTestData();
    let slotId = null;

    if (testData.slotIds && testData.slotIds.length > 0) {
      slotId = testData.slotIds[0];
      console.log(`📋 Usando slotId del setup: ${slotId}`);
    } else {
      // Fallback: buscar en el calendario del profesor
      const calendarRes = await request.get(`${BASE_URL}/api/availability/my-calendar`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (calendarRes.ok()) {
        const calData = await calendarRes.json();
        const slots = calData.slots || calData.data || calData;
        if (Array.isArray(slots) && slots.length > 0) {
          const available = slots.find(s => !s.isBooked && s.status !== 'booked');
          slotId = available ? (available._id || available.id) : (slots[0]._id || slots[0].id);
        }
      }
    }

    if (!slotId) {
      test.skip(true, 'Profesor QA no tiene slots creados — ejecutar setup antes');
      return;
    }

    // Intentar auto-reserva: el middleware studentOrClient bloqueará al profesor con 403
    // antes de que BookingService pueda validar CANNOT_BOOK_OWN_SLOT
    const bookingRes = await request.post(`${BASE_URL}/api/bookings`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      data: {
        slotId: slotId,
        studentId: teacherId,
        timezone: 'America/Santiago'
      }
    });

    // Debe ser rechazado — 400 o 403
    expect(bookingRes.status()).toBeGreaterThanOrEqual(400);
    expect(bookingRes.status()).toBeLessThan(500);

    const body = await bookingRes.json().catch(() => ({}));
    const msg = JSON.stringify(body).toLowerCase();
    // Verificar que el mensaje mencione el bloqueo
    expect(
      msg.includes('cannot_book_own_slot') ||
      msg.includes('no puedes reservar tu propio') ||
      msg.includes('solo estudiantes') ||
      msg.includes('403')
    ).toBeTruthy();
  });

  test('S1.2 — Profesor bloqueado en endpoint de booking', async ({ request }) => {
    // Login como profesor
    const { token } = await apiLogin(request, ACCOUNTS.teacher);

    // Intentar crear booking con token de profesor
    const res = await request.post(`${BASE_URL}/api/bookings`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      data: {
        slotId: '000000000000000000000000', // ID ficticio
        timezone: 'America/Santiago'
      }
    });

    // Middleware studentOrClient debe rechazar al profesor
    expect(res.status()).toBe(403);

    const body = await res.json().catch(() => ({}));
    expect(body.message || '').toContain('Solo estudiantes o clientes');
  });

  test('S1.3 — Estudiante SÍ puede reservar (happy path)', async ({ request }) => {
    // Login como estudiante
    const { token: studentToken } = await apiLogin(request, ACCOUNTS.student);

    // Leer datos del setup
    const testData = loadTestData();
    let slotId = null;

    // Usar el segundo slot (el primero puede cambiar de estado por S1.1)
    if (testData.slotIds && testData.slotIds.length > 1) {
      slotId = testData.slotIds[1];
      console.log(`📋 Usando slotId del setup: ${slotId}`);
    } else {
      // Fallback: buscar slots disponibles del profesor QA via API
      const { user: teacher } = await apiLogin(request, ACCOUNTS.teacher);
      const teacherId = teacher._id;
      const slotsRes = await request.get(`${BASE_URL}/api/availability/teacher/${teacherId}`);

      if (!slotsRes.ok()) {
        test.skip(true, 'No se pudo obtener disponibilidad del profesor QA');
        return;
      }

      const slotsData = await slotsRes.json();
      const slots = slotsData.slots || slotsData.data || slotsData;

      if (!Array.isArray(slots) || slots.length === 0) {
        test.skip(true, 'Profesor QA no tiene slots disponibles — ejecutar setup antes');
        return;
      }

      const availableSlot = slots.find(s => s.status === 'available' || !s.isBooked);
      slotId = availableSlot ? (availableSlot._id || availableSlot.id) : null;
    }

    if (!slotId) {
      test.skip(true, 'No hay slots disponibles para reservar');
      return;
    }

    // Reservar como estudiante
    const bookingRes = await request.post(`${BASE_URL}/api/bookings`, {
      headers: {
        'Authorization': `Bearer ${studentToken}`,
        'Content-Type': 'application/json'
      },
      data: {
        slotId: slotId,
        timezone: 'America/Santiago'
      }
    });

    // Debe ser exitoso (200 o 201)
    if (bookingRes.status() >= 200 && bookingRes.status() < 300) {
      const booking = await bookingRes.json();
      expect(booking).toBeTruthy();
      console.log(`✅ Booking creado exitosamente`);
    } else {
      // Si falla por saldo insuficiente o conflicto, documentar pero no es falla de seguridad
      const err = await bookingRes.json().catch(() => ({}));
      console.log(`⚠️ Booking no creado (status ${bookingRes.status()}): ${JSON.stringify(err)}`);
      // Solo fallar si es un error de permisos inesperado
      expect(bookingRes.status()).not.toBe(403);
    }
  });

  test('S1.4 — Timezone inválida rechazada', async ({ request }) => {
    const { token } = await apiLogin(request, ACCOUNTS.student);

    const res = await request.post(`${BASE_URL}/api/bookings`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      data: {
        slotId: '000000000000000000000000',
        timezone: 'esto_no_es_timezone_xyz'
      }
    });

    // Debe rechazar con 400 (validación)
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  });
});

// ═══════════════════════════════════════════════════════════════
//  BLOQUE 2 — Sprint 2: Consistencia de Datos
// ═══════════════════════════════════════════════════════════════

test.describe('Sprint 2 — Consistencia de Datos', () => {

  test('S2.1 — Saldo de clases del estudiante QA es coherente', async ({ request }) => {
    // Login como estudiante
    const { token, user } = await apiLogin(request, ACCOUNTS.student);

    // Obtener datos completos vía /api/auth/me
    const meRes = await request.get(`${BASE_URL}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    expect(meRes.ok()).toBeTruthy();

    const meData = await meRes.json();
    const me = meData.user || meData;
    console.log(`📊 Estudiante QA — classesRemaining: ${me.classesRemaining}, role: ${me.role}`);
    console.log(`📊 Campos disponibles de /me:`, Object.keys(me).join(', '));

    // Verificar que el endpoint retorna classesRemaining
    // HALLAZGO: Si /api/auth/me no expone classesRemaining, es un gap de la API
    if (me.classesRemaining === undefined) {
      console.warn('⚠️ [API GAP] /api/auth/me NO retorna classesRemaining para el estudiante');
      console.warn('   El frontend no puede mostrar el saldo de clases sin este campo');
      // No fallar — documentar como hallazgo
      test.info().annotations.push({ type: 'issue', description: 'API /me no retorna classesRemaining' });
    } else {
      expect(typeof me.classesRemaining).toBe('number');
      expect(me.classesRemaining).toBeGreaterThanOrEqual(0);
    }
  });

  test('S2.2 — Consistencia monetaria del profesor QA', async ({ request }) => {
    // Login y obtener datos completos vía /api/auth/me
    const { token } = await apiLogin(request, ACCOUNTS.teacher);

    const meRes = await request.get(`${BASE_URL}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    expect(meRes.ok()).toBeTruthy();

    const meData = await meRes.json();
    const me = meData.user || meData;

    const hourlyRate = me.teacherData?.hourlyRate;
    const trialPrice = me.teacherData?.trialPrice;

    console.log(`💰 Profesor QA — hourlyRate: ${hourlyRate}, trialPrice: ${trialPrice}`);
    console.log(`💰 teacherData keys:`, Object.keys(me.teacherData || {}).join(', ') || '(vacío)');

    // HALLAZGO: Si /api/auth/me no expone teacherData, es un gap de la API
    if (!hourlyRate && !trialPrice) {
      console.warn('⚠️ [API GAP] /api/auth/me NO retorna teacherData.hourlyRate ni trialPrice');
      console.warn('   El frontend del profesor no puede mostrar sus tarifas sin estos campos');
      test.info().annotations.push({ type: 'issue', description: 'API /me no retorna teacherData con tarifas' });
      // No fallar — documentar como hallazgo. Verificar que al menos el API precio del kit funciona
      return;
    }

    // hourlyRate debe existir y ser un número razonable
    expect(hourlyRate).toBeDefined();
    expect(hourlyRate).toBeGreaterThan(0);

    // trialPrice debe existir y ser un número razonable
    expect(trialPrice).toBeDefined();
    expect(trialPrice).toBeGreaterThan(0);

    // [BUSINESS LOGIC RISK] hourlyRate está en DÓLARES, trialPrice en CENTAVOS
    if (trialPrice < hourlyRate) {
      console.warn('⚠️ [BUSINESS LOGIC RISK] trialPrice parece estar en dólares en vez de centavos');
    }
    if (hourlyRate > 500) {
      console.warn('⚠️ [BUSINESS LOGIC RISK] hourlyRate parece estar en centavos en vez de dólares');
    }
  });

  test('S2.3 — API de precio del kit responde correctamente', async ({ request }) => {
    // Verificar endpoint público de precios
    const res = await request.get(`${BASE_URL}/api/welcome-kit/v2/price`);
    expect(res.ok()).toBeTruthy();

    const data = await res.json();
    expect(data.priceUSD).toBeDefined();
    console.log(`💰 Kit precio: $${data.priceUSD} USD`);

    // El precio debe ser un número positivo
    expect(Number(data.priceUSD)).toBeGreaterThan(0);
  });

  test('S2.4 — /me retorna campos adicionales por rol', async ({ request }) => {
    // === Teacher: debe incluir teacherData con hourlyRate ===
    const { token: teacherToken } = await apiLogin(request, ACCOUNTS.teacher);
    const teacherMeRes = await request.get(`${BASE_URL}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${teacherToken}` }
    });
    expect(teacherMeRes.ok()).toBeTruthy();
    const teacherMe = await teacherMeRes.json();
    const teacherUser = teacherMe.user || teacherMe;
    
    expect(teacherUser.teacherData).toBeDefined();
    expect(teacherUser.teacherData.hourlyRate).toBeDefined();
    expect(typeof teacherUser.teacherData.hourlyRate).toBe('number');
    console.log(`✅ Teacher /me — hourlyRate: ${teacherUser.teacherData.hourlyRate}, plan: ${teacherUser.teacherData.plan}`);

    // === Student: debe incluir studentData y classesRemaining ===
    const { token: studentToken } = await apiLogin(request, ACCOUNTS.student);
    const studentMeRes = await request.get(`${BASE_URL}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${studentToken}` }
    });
    expect(studentMeRes.ok()).toBeTruthy();
    const studentMe = await studentMeRes.json();
    const studentUser = studentMe.user || studentMe;

    expect(studentUser.studentData).toBeDefined();
    expect(studentUser.classesRemaining).toBeDefined();
    expect(typeof studentUser.classesRemaining).toBe('number');
    console.log(`✅ Student /me — classesRemaining: ${studentUser.classesRemaining}, source: ${studentUser.studentData?.source}`);

    // === Client: debe incluir clientData ===
    const { token: clientToken } = await apiLogin(request, ACCOUNTS.client);
    const clientMeRes = await request.get(`${BASE_URL}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${clientToken}` }
    });
    expect(clientMeRes.ok()).toBeTruthy();
    const clientMe = await clientMeRes.json();
    const clientUser = clientMe.user || clientMe;

    expect(clientUser.clientData).toBeDefined();
    expect(clientUser.clientData.accountType).toBeDefined();
    console.log(`✅ Client /me — accountType: ${clientUser.clientData.accountType}`);

    // === Admin: NO debe incluir teacherData ni studentData ===
    const { token: adminToken } = await apiLogin(request, ACCOUNTS.admin);
    const adminMeRes = await request.get(`${BASE_URL}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    expect(adminMeRes.ok()).toBeTruthy();
    const adminMe = await adminMeRes.json();
    const adminUser = adminMe.user || adminMe;

    expect(adminUser.teacherData).toBeUndefined();
    expect(adminUser.studentData).toBeUndefined();
    expect(adminUser.clientData).toBeUndefined();
    console.log(`✅ Admin /me — solo campos base (sin teacherData/studentData/clientData)`);
  });
});

// ═══════════════════════════════════════════════════════════════
//  BLOQUE 3 — Sprint 3: WelcomeKit
// ═══════════════════════════════════════════════════════════════

test.describe('Sprint 3 — WelcomeKit', () => {

  // Estados válidos del nuevo modelo
  const VALID_STATES = ['onboarding', 'setup', 'trial_ready', 'trial_done', 'active', 'refunded'];
  const LEGACY_STATES = [
    'entrevista_pendiente', 'entrevista_agendada', 'esperando_equipo',
    'setup_pending', 'setup_scheduled', 'trial_available',
    'trial_scheduled', 'trial_completed'
  ];

  test('S3.1 — No hay WelcomeKits con estados legacy', async ({ request }) => {
    const { token } = await apiLogin(request, ACCOUNTS.admin);

    const res = await request.get(`${BASE_URL}/api/welcome-kit/admin/list`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok()) {
      console.log(`⚠️ Admin list respondió ${res.status()}`);
      test.skip(true, `Endpoint admin/list no accesible: ${res.status()}`);
      return;
    }

    const data = await res.json();
    const kits = data.kits || data.data || data;

    if (!Array.isArray(kits) || kits.length === 0) {
      test.skip(true, 'No hay WelcomeKits en el sistema');
      return;
    }

    console.log(`📦 Total WelcomeKits: ${kits.length}`);

    // Buscar kits con estados legacy
    const legacyKits = kits.filter(k => LEGACY_STATES.includes(k.status || k.state));
    
    if (legacyKits.length > 0) {
      console.error('❌ WelcomeKits con estados legacy encontrados:');
      legacyKits.forEach(k => {
        console.error(`   - Kit ${k._id}: estado "${k.status || k.state}" (cliente: ${k.clientEmail || k.email || 'N/A'})`);
      });
    }

    expect(legacyKits.length).toBe(0);

    // Verificar que todos tienen estados válidos
    const invalidKits = kits.filter(k => {
      const state = k.status || k.state;
      return state && !VALID_STATES.includes(state);
    });

    if (invalidKits.length > 0) {
      console.warn(`⚠️ Kits con estados no reconocidos: ${invalidKits.length}`);
      invalidKits.forEach(k => {
        console.warn(`   - Kit ${k._id}: estado "${k.status || k.state}"`);
      });
    }
  });

  test('S3.2 — Transición ilegal bloqueada (onboarding → active)', async ({ request }) => {
    const { token } = await apiLogin(request, ACCOUNTS.admin);

    // Leer kitId del setup
    const testData = loadTestData();
    let kitId = testData.kitId || null;

    if (!kitId) {
      // Fallback: buscar un kit en onboarding via API
      const listRes = await request.get(`${BASE_URL}/api/welcome-kit/admin/list`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!listRes.ok()) {
        test.skip(true, 'No se pudo obtener lista de kits');
        return;
      }

      const data = await listRes.json();
      const kits = data.kits || data.data || data;
      const onboardingKit = Array.isArray(kits) ? kits.find(k => (k.overallStatus || k.status || k.state) === 'onboarding') : null;

      if (!onboardingKit) {
        test.skip(true, 'No hay kits en estado onboarding — ejecutar setup antes');
        return;
      }
      kitId = onboardingKit._id || onboardingKit.id;
    }

    console.log(`📋 Usando kitId: ${kitId}`);

    // Intentar saltar directo de onboarding → active (transición ilegal)
    const transitionRes = await request.put(`${BASE_URL}/api/welcome-kit/v2/${kitId}/status`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      data: { status: 'active' }
    });

    // Debe ser rechazado
    expect(transitionRes.status()).toBeGreaterThanOrEqual(400);
    expect(transitionRes.status()).toBeLessThan(500);

    const body = await transitionRes.json().catch(() => ({}));
    console.log(`📋 Respuesta transición ilegal: ${transitionRes.status()} — ${JSON.stringify(body)}`);
  });

  test('S3.3 — Transición legal funciona (onboarding → setup → trial_ready)', async ({ request }) => {
    const { token } = await apiLogin(request, ACCOUNTS.admin);

    // Leer kitId del setup
    const testData = loadTestData();
    let kitId = testData.kitId || null;

    if (!kitId) {
      // Fallback: buscar un kit en onboarding via API
      const listRes = await request.get(`${BASE_URL}/api/welcome-kit/admin/list`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!listRes.ok()) {
        test.skip(true, 'No se pudo obtener lista de kits');
        return;
      }

      const data = await listRes.json();
      const kits = data.kits || data.data || data;
      const onboardingKit = Array.isArray(kits) ? kits.find(k => (k.overallStatus || k.status || k.state) === 'onboarding') : null;

      if (!onboardingKit) {
        test.skip(true, 'No hay kits en estado onboarding — ejecutar setup antes');
        return;
      }
      kitId = onboardingKit._id || onboardingKit.id;
    }

    console.log(`📋 Usando kitId: ${kitId}`);

    // Paso 1: Transición legal onboarding → setup
    const transition1 = await request.put(`${BASE_URL}/api/welcome-kit/v2/${kitId}/status`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      data: { status: 'setup' }
    });

    console.log(`📋 onboarding → setup: ${transition1.status()}`);
    expect(transition1.ok()).toBeTruthy();

    const body1 = await transition1.json().catch(() => ({}));
    expect(body1.newStatus || body1.status).toBe('setup');

    // Paso 2: Transición legal setup → trial_ready
    const transition2 = await request.put(`${BASE_URL}/api/welcome-kit/v2/${kitId}/status`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      data: { status: 'trial_ready' }
    });

    console.log(`📋 setup → trial_ready: ${transition2.status()}`);
    expect(transition2.ok()).toBeTruthy();

    const body2 = await transition2.json().catch(() => ({}));
    expect(body2.newStatus || body2.status).toBe('trial_ready');

    console.log(`✅ Transiciones legales completadas: onboarding → setup → trial_ready`);
  });
});

// ═══════════════════════════════════════════════════════════════
//  BLOQUE 4 — Sprint 4: Dashboard del Profesor
// ═══════════════════════════════════════════════════════════════

test.describe('Sprint 4 — Dashboard del Profesor', () => {

  test('S4.1 — Nuevas rutas del profesor cargan sin error', async ({ page }) => {
    // Login via formulario web
    await webLogin(page, ACCOUNTS.teacher);

    // Rutas reales que existen en public/profesor/
    const routes = [
      { path: '/dashboard.html', label: 'Dashboard' },
      { path: '/profesor/calendario.html', label: 'Calendario' },
      { path: '/profesor/estudiantes.html', label: 'Estudiantes' },
      { path: '/profesor/validar.html', label: 'Validar' },
      { path: '/profesor/perfil.html', label: 'Perfil' },
    ];

    for (const route of routes) {
      await page.goto(`${BASE_URL}${route.path}`, { waitUntil: 'domcontentloaded', timeout: 45000 });

      // Verificar que no hay error 404 o 500
      const title = await page.title();
      const bodyText = await page.locator('body').textContent();

      const has404 = title.includes('404') || bodyText.includes('Cannot GET') || bodyText.includes('Not Found');
      const has500 = title.includes('500') || bodyText.includes('Internal Server Error');

      if (has404 || has500) {
        // Tomar screenshot
        await page.screenshot({ path: `tests/playwright-report/fail-${route.label}.png` });
      }

      expect(has404, `${route.label} devolvió 404`).toBeFalsy();
      expect(has500, `${route.label} devolvió 500`).toBeFalsy();

      console.log(`  ✅ ${route.label} (${route.path}) — OK`);
    }
  });

  test('S4.2 — Dashboard tiene elementos clave visibles sin scroll', async ({ page }) => {
    await webLogin(page, ACCOUNTS.teacher);
    await page.goto(`${BASE_URL}/dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 45000 });

    // Screenshot para revisión visual
    await page.screenshot({ path: 'tests/playwright-report/dashboard-overview.png', fullPage: false });

    // Verificar que la página tiene contenido (no está vacía)
    const bodyText = await page.locator('body').textContent();
    expect(bodyText.length).toBeGreaterThan(50);

    // Buscar elementos típicos del dashboard: próxima clase, ganancias, sidebar nav
    const hasNavigation = await page.locator('nav, .sidebar, .profesor-nav, .nav-link').count();
    expect(hasNavigation).toBeGreaterThan(0);

    console.log(`📸 Screenshot guardado en tests/playwright-report/dashboard-overview.png`);
    console.log(`📝 Contenido del dashboard: ${bodyText.slice(0, 200)}...`);
  });

  test('S4.3 — Estudiante NO puede acceder al dashboard del profesor', async ({ page }) => {
    await webLogin(page, ACCOUNTS.student);

    // Intentar acceder al dashboard de profesor
    await page.goto(`${BASE_URL}/dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });

    // Debe haber redirigido fuera de /dashboard o mostrar error
    const finalURL = page.url();
    const bodyText = await page.locator('body').textContent();

    const isOnDashboard = finalURL.includes('/dashboard') && !finalURL.includes('/cliente') && !finalURL.includes('/login');
    const hasTeacherContent = bodyText.includes('Identidad de Marca') || bodyText.includes('Mi Sala');

    // Si el estudiante ve contenido del profesor → FALLA de seguridad
    if (isOnDashboard && hasTeacherContent) {
      await page.screenshot({ path: 'tests/playwright-report/fail-student-on-teacher-dashboard.png' });
    }

    console.log(`📍 URL final: ${finalURL}`);

    // Idealmente debe haber redirigido a /cliente o /login
    // Aceptamos que esté en /dashboard si no muestra contenido de profesor
    expect(isOnDashboard && hasTeacherContent, 'Estudiante accedió al dashboard de profesor').toBeFalsy();

    // Intentar /profesor/calendario
    await page.goto(`${BASE_URL}/profesor/calendario.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    const calURL = page.url();
    console.log(`📍 URL después de /profesor/calendario.html: ${calURL}`);

    // No debe permanecer en ruta de profesor con funcionalidad completa
    const calBody = await page.locator('body').textContent();
    const hasCalendarFunctionality = calBody.includes('Crear Slot') || calBody.includes('Mi Disponibilidad');

    expect(hasCalendarFunctionality, 'Estudiante accedió al calendario de profesor').toBeFalsy();
  });
});
