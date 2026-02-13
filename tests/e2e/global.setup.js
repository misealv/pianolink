// @ts-check
const { test: setup } = require('@playwright/test');

/**
 * Global Setup - Se ejecuta antes de todos los tests
 * 
 * Propósito:
 * - Verificar que el servidor está accesible
 * - Limpiar datos de prueba anteriores (opcional)
 * - Preparar estado inicial
 */

setup('Verificar conectividad del servidor', async ({ request }) => {
  // Verificar que la API responde
  const response = await request.get('/api/welcome-kit/v2/price');
  
  if (!response.ok()) {
    throw new Error(`Servidor no responde correctamente: ${response.status()}`);
  }
  
  const data = await response.json();
  console.log(`✅ Servidor accesible. Precio Kit: $${data.price} USD`);
});

setup('Verificar páginas principales cargan', async ({ page }) => {
  // Landing
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  console.log('✅ Landing page carga');
  
  // Login
  await page.goto('/login.html');
  await page.waitForLoadState('networkidle');
  console.log('✅ Login page carga');
  
  // Register
  await page.goto('/register.html');
  await page.waitForLoadState('networkidle');
  console.log('✅ Register page carga');
});
