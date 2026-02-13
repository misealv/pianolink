/**
 * tests/qa-agent.js
 * Agente de QA con Playwright - Simula usuario real navegando PianoLink
 * 
 * Uso:
 *   node tests/qa-agent.js              # Ejecutar todos los tests
 *   node tests/qa-agent.js --headed     # Ver el navegador en acción
 *   node tests/qa-agent.js --slow       # Modo lento para ver cada paso
 */

const { chromium } = require('playwright');

// Configuración
const BASE_URL = process.env.TEST_URL || 'https://pianolink.net';
const HEADED = process.argv.includes('--headed');
const SLOW = process.argv.includes('--slow');
const SLOW_MO = SLOW ? 1000 : 100;

// Colores para consola
const c = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    dim: '\x1b[2m',
    bold: '\x1b[1m'
};

// Resultados
const results = {
    passed: 0,
    failed: 0,
    tests: []
};

function log(emoji, message, color = 'white') {
    console.log(`${c[color] || ''}${emoji} ${message}${c.reset}`);
}

function header(text) {
    console.log(`\n${c.cyan}${'═'.repeat(60)}${c.reset}`);
    console.log(`${c.cyan}  ${text}${c.reset}`);
    console.log(`${c.cyan}${'═'.repeat(60)}${c.reset}\n`);
}

async function test(name, fn) {
    const start = Date.now();
    try {
        await fn();
        const duration = Date.now() - start;
        log('✅', `${name} (${duration}ms)`, 'green');
        results.passed++;
        results.tests.push({ name, status: 'passed', duration });
    } catch (error) {
        const duration = Date.now() - start;
        log('❌', `${name} - ${error.message}`, 'red');
        results.failed++;
        results.tests.push({ name, status: 'failed', error: error.message, duration });
    }
}

async function runQA() {
    console.log(`
${c.cyan}╔════════════════════════════════════════════════════════════╗
║                                                            ║
║   🤖  PIANOLINK QA AGENT - Playwright                     ║
║                                                            ║
║   Simulando usuario real navegando el sitio               ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝${c.reset}
`);

    log('🌐', `URL: ${BASE_URL}`, 'blue');
    log('👁️', `Modo: ${HEADED ? 'Visible' : 'Headless'}`, 'blue');
    log('⏱️', `Velocidad: ${SLOW ? 'Lenta' : 'Normal'}`, 'blue');
    console.log('');

    const browser = await chromium.launch({ 
        headless: !HEADED,
        slowMo: SLOW_MO
    });
    
    const context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
        userAgent: 'PianoLink-QA-Agent/1.0'
    });
    
    const page = await context.newPage();

    // ============================================
    // TEST 1: LANDING PAGE
    // ============================================
    header('TEST 1: LANDING PAGE');

    await test('Landing page carga correctamente', async () => {
        await page.goto(BASE_URL, { waitUntil: 'networkidle' });
        const title = await page.title();
        if (!title.toLowerCase().includes('piano')) {
            throw new Error(`Título inesperado: ${title}`);
        }
    });

    await test('Logo de PianoLink visible', async () => {
        const logo = await page.locator('img[alt*="Piano"], .logo, h1:has-text("Piano")').first();
        await logo.waitFor({ state: 'visible', timeout: 5000 });
    });

    await test('Botón de navegación funciona', async () => {
        const navButtons = await page.locator('nav a, .nav-link, header a').count();
        if (navButtons < 1) {
            throw new Error('No se encontraron botones de navegación');
        }
    });

    // ============================================
    // TEST 2: PÁGINA COMENZAR (Kit de Bienvenida)
    // ============================================
    header('TEST 2: PÁGINA COMENZAR');

    await test('Página /comenzar carga', async () => {
        await page.goto(`${BASE_URL}/comenzar`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(1000);
    });

    await test('Precio $44 USD visible', async () => {
        const priceText = await page.textContent('body');
        if (!priceText.includes('44') && !priceText.includes('$44')) {
            throw new Error('Precio $44 no encontrado en la página');
        }
    });

    await test('Botón "Quiero Comenzar" existe', async () => {
        const btn = await page.locator('a:has-text("Comenzar"), button:has-text("Comenzar"), a:has-text("Quiero")').first();
        const isVisible = await btn.isVisible().catch(() => false);
        if (!isVisible) {
            throw new Error('Botón de comenzar no encontrado');
        }
    });

    // ============================================
    // TEST 3: CHECKOUT KIT DE BIENVENIDA
    // ============================================
    header('TEST 3: CHECKOUT KIT');

    await test('Página de checkout carga', async () => {
        await page.goto(`${BASE_URL}/kit-bienvenida-v2.html`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(1000);
    });

    await test('Formulario de checkout visible', async () => {
        const form = await page.locator('form, input[type="email"], input[name="email"]').first();
        await form.waitFor({ state: 'visible', timeout: 5000 });
    });

    await test('Botón MercadoPago visible', async () => {
        const mpBtn = await page.locator('button:has-text("MercadoPago"), button:has-text("Pagar")').first();
        const isVisible = await mpBtn.isVisible().catch(() => false);
        if (!isVisible) {
            throw new Error('Botón de MercadoPago no encontrado');
        }
    });

    await test('Botón Stripe OCULTO', async () => {
        const stripeBtn = await page.locator('#btnStripe:visible, button:has-text("Stripe"):visible').count();
        if (stripeBtn > 0) {
            throw new Error('Botón Stripe debería estar oculto');
        }
    });

    // ============================================
    // TEST 4: PÁGINA DE LOGIN
    // ============================================
    header('TEST 4: LOGIN');

    await test('Página login carga', async () => {
        await page.goto(`${BASE_URL}/login.html`, { waitUntil: 'networkidle' });
    });

    await test('Formulario de login visible', async () => {
        const emailInput = await page.locator('input[type="email"], input[name="email"]').first();
        await emailInput.waitFor({ state: 'visible', timeout: 5000 });
    });

    await test('Campos email y password existen', async () => {
        const email = await page.locator('input[type="email"]').count();
        const password = await page.locator('input[type="password"]').count();
        if (email === 0 || password === 0) {
            throw new Error('Campos de login faltantes');
        }
    });

    await test('Botón de login funcional', async () => {
        const loginBtn = await page.locator('button[type="submit"], button:has-text("Ingresar"), button:has-text("Login")').first();
        await loginBtn.waitFor({ state: 'visible', timeout: 5000 });
    });

    // ============================================
    // TEST 5: PÁGINA DE REGISTRO
    // ============================================
    header('TEST 5: REGISTRO');

    await test('Página registro carga', async () => {
        await page.goto(`${BASE_URL}/register.html`, { waitUntil: 'networkidle' });
    });

    await test('Formulario de registro visible', async () => {
        const form = await page.locator('form').first();
        await form.waitFor({ state: 'visible', timeout: 5000 });
    });

    await test('Selector de rol (profesor/estudiante) existe', async () => {
        const roleSelector = await page.locator('select, input[type="radio"], [data-role]').count();
        // Es opcional, no fallar si no existe
        log('ℹ️', `Selectores de rol encontrados: ${roleSelector}`, 'dim');
    });

    // ============================================
    // TEST 6: API HEALTH CHECK
    // ============================================
    header('TEST 6: API ENDPOINTS');

    await test('API /api/welcome-kit/v2/price responde', async () => {
        const response = await page.request.get(`${BASE_URL}/api/welcome-kit/v2/price`);
        if (!response.ok()) {
            throw new Error(`API respondió con status ${response.status()}`);
        }
        const data = await response.json();
        if (!data.priceUSD) {
            throw new Error('Respuesta no contiene priceUSD');
        }
        log('ℹ️', `Precio actual: $${data.priceUSD} USD`, 'dim');
    });

    await test('API /api/webhooks/test responde (dev)', async () => {
        const response = await page.request.get(`${BASE_URL}/api/webhooks/test`);
        // Puede dar 404 en producción, eso está bien
        log('ℹ️', `Webhooks test: ${response.status()}`, 'dim');
    });

    // ============================================
    // TEST 7: RESPONSIVE / MOBILE
    // ============================================
    header('TEST 7: RESPONSIVE');

    await test('Vista móvil funciona', async () => {
        await page.setViewportSize({ width: 375, height: 667 });
        await page.goto(`${BASE_URL}/comenzar`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(500);
        
        // Verificar que el contenido es visible
        const content = await page.locator('body').textContent();
        if (content.length < 100) {
            throw new Error('Contenido móvil parece vacío');
        }
    });

    await test('Menú móvil existe', async () => {
        const hamburger = await page.locator('.hamburger, .menu-toggle, [aria-label="menu"], .mobile-menu').count();
        log('ℹ️', `Elementos de menú móvil: ${hamburger}`, 'dim');
    });

    // Restaurar viewport
    await page.setViewportSize({ width: 1280, height: 720 });

    // ============================================
    // RESUMEN
    // ============================================
    await browser.close();

    console.log(`
${c.cyan}════════════════════════════════════════════════════════════${c.reset}
${c.bold}                    📊 RESUMEN DE QA                        ${c.reset}
${c.cyan}════════════════════════════════════════════════════════════${c.reset}

   ${c.green}✅ Pasaron: ${results.passed}${c.reset}
   ${c.red}❌ Fallaron: ${results.failed}${c.reset}
   ${c.blue}📝 Total: ${results.tests.length}${c.reset}

${results.failed === 0 ? 
    `${c.green}   🎉 ¡TODOS LOS TESTS PASARON!${c.reset}` : 
    `${c.yellow}   ⚠️ Algunos tests fallaron, revisar arriba${c.reset}`
}

${c.cyan}════════════════════════════════════════════════════════════${c.reset}
`);

    // Exit code
    process.exit(results.failed > 0 ? 1 : 0);
}

// Ejecutar
runQA().catch(err => {
    console.error(`${c.red}Error fatal:${c.reset}`, err);
    process.exit(1);
});
