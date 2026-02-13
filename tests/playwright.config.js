// @ts-check
const { defineConfig, devices } = require('@playwright/test');

/**
 * Configuración de Playwright para PianoLink QA Suite
 * 
 * Variables de entorno:
 * - TEST_URL: URL base (default: https://pianolink.net)
 * - MONGODB_URI: Conexión a MongoDB para validaciones
 * - SLOW_MO: Milisegundos de delay entre acciones (debug)
 */

module.exports = defineConfig({
  // Directorio de tests
  testDir: './e2e',
  
  // Timeout global por test (2 minutos para flujos complejos)
  timeout: 120_000,
  
  // Timeout de expect
  expect: {
    timeout: 10_000,
  },
  
  // Ejecutar tests en paralelo
  fullyParallel: false, // Secuencial para flujos dependientes
  
  // Fallar el build si hay test.only en CI
  forbidOnly: !!process.env.CI,
  
  // Reintentos en CI
  retries: process.env.CI ? 2 : 0,
  
  // Workers
  workers: process.env.CI ? 1 : 1,
  
  // Reporter
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['list'],
  ],
  
  // Configuración global compartida
  use: {
    // URL base
    baseURL: process.env.TEST_URL || 'https://pianolink.net',
    
    // Auto-waiting: Playwright espera automáticamente
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    
    // Capturas en fallo
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
    
    // Headers personalizados
    extraHTTPHeaders: {
      'X-Test-Agent': 'PianoLink-QA-Playwright',
    },
    
    // Slow motion para debug
    launchOptions: {
      slowMo: parseInt(process.env.SLOW_MO || '0'),
    },
  },

  // Proyectos: diferentes navegadores y viewports
  projects: [
    // Setup: crear usuarios de prueba (se ejecuta primero)
    {
      name: 'setup',
      testMatch: /global\.setup\.js/,
    },
    
    // Chrome Desktop
    {
      name: 'chromium',
      use: { 
        ...devices['Desktop Chrome'],
      },
      dependencies: ['setup'],
    },
    
    // Mobile Chrome
    {
      name: 'mobile-chrome',
      use: { 
        ...devices['Pixel 5'],
      },
      dependencies: ['setup'],
    },
    
    // Safari Desktop
    {
      name: 'webkit',
      use: { 
        ...devices['Desktop Safari'],
      },
      dependencies: ['setup'],
    },
  ],
});
