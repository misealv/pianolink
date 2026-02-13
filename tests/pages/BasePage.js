// @ts-check

/**
 * BasePage - Clase base para Page Object Model
 * 
 * Proporciona métodos comunes para todas las páginas:
 * - Navegación con auto-waiting
 * - Helpers para formularios
 * - Verificaciones de estado
 */
class BasePage {
  /**
   * @param {import('@playwright/test').Page} page 
   */
  constructor(page) {
    this.page = page;
    this.baseURL = process.env.TEST_URL || 'https://pianolink.net';
  }

  // ============================================
  // NAVEGACIÓN
  // ============================================

  /**
   * Navegar a una ruta específica
   * Auto-waiting: espera a que la página cargue completamente
   */
  async navigate(path = '/') {
    await this.page.goto(path, { waitUntil: 'networkidle' });
  }

  /**
   * Esperar a que la URL contenga un patrón
   */
  async waitForURL(pattern) {
    await this.page.waitForURL(pattern);
  }

  /**
   * Obtener URL actual
   */
  getCurrentURL() {
    return this.page.url();
  }

  // ============================================
  // FORMULARIOS
  // ============================================

  /**
   * Llenar campo de texto con auto-waiting
   * Limpia el campo antes de escribir
   */
  async fillField(selector, value) {
    const locator = this.page.locator(selector);
    await locator.waitFor({ state: 'visible' });
    await locator.clear();
    await locator.fill(value);
  }

  /**
   * Seleccionar opción de dropdown
   */
  async selectOption(selector, value) {
    const locator = this.page.locator(selector);
    await locator.waitFor({ state: 'visible' });
    await locator.selectOption(value);
  }

  /**
   * Hacer click en elemento con auto-waiting
   */
  async click(selector) {
    const locator = this.page.locator(selector);
    await locator.waitFor({ state: 'visible' });
    await locator.click();
  }

  /**
   * Click en botón y esperar navegación
   */
  async clickAndNavigate(selector) {
    await Promise.all([
      this.page.waitForNavigation({ waitUntil: 'networkidle' }),
      this.click(selector),
    ]);
  }

  /**
   * Submit de formulario
   */
  async submitForm(buttonSelector = 'button[type="submit"]') {
    await this.click(buttonSelector);
  }

  // ============================================
  // VERIFICACIONES
  // ============================================

  /**
   * Verificar que elemento es visible
   */
  async isVisible(selector) {
    const locator = this.page.locator(selector);
    return await locator.isVisible();
  }

  /**
   * Esperar a que elemento sea visible
   */
  async waitForVisible(selector, timeout = 10000) {
    const locator = this.page.locator(selector);
    await locator.waitFor({ state: 'visible', timeout });
  }

  /**
   * Esperar a que elemento desaparezca
   */
  async waitForHidden(selector, timeout = 10000) {
    const locator = this.page.locator(selector);
    await locator.waitFor({ state: 'hidden', timeout });
  }

  /**
   * Obtener texto de elemento
   */
  async getText(selector) {
    const locator = this.page.locator(selector);
    await locator.waitFor({ state: 'visible' });
    return await locator.textContent();
  }

  /**
   * Obtener valor de input
   */
  async getValue(selector) {
    const locator = this.page.locator(selector);
    await locator.waitFor({ state: 'visible' });
    return await locator.inputValue();
  }

  // ============================================
  // ALERTAS Y MENSAJES
  // ============================================

  /**
   * Esperar mensaje de éxito
   */
  async waitForSuccessMessage(timeout = 10000) {
    // Buscar diferentes tipos de mensajes de éxito
    const successSelectors = [
      '.alert-success',
      '.success-message',
      '[data-testid="success"]',
      '.toast-success',
      '.notification-success',
    ];
    
    for (const selector of successSelectors) {
      try {
        await this.page.locator(selector).waitFor({ 
          state: 'visible', 
          timeout: timeout / successSelectors.length 
        });
        return await this.getText(selector);
      } catch {
        continue;
      }
    }
    return null;
  }

  /**
   * Esperar mensaje de error
   */
  async waitForErrorMessage(timeout = 10000) {
    const errorSelectors = [
      '.alert-danger',
      '.error-message',
      '[data-testid="error"]',
      '.toast-error',
      '.notification-error',
    ];
    
    for (const selector of errorSelectors) {
      try {
        await this.page.locator(selector).waitFor({ 
          state: 'visible', 
          timeout: timeout / errorSelectors.length 
        });
        return await this.getText(selector);
      } catch {
        continue;
      }
    }
    return null;
  }

  // ============================================
  // UTILIDADES
  // ============================================

  /**
   * Tomar screenshot (para debugging)
   */
  async screenshot(name) {
    await this.page.screenshot({ path: `screenshots/${name}.png`, fullPage: true });
  }

  /**
   * Esperar milisegundos (usar con moderación)
   */
  async wait(ms) {
    await this.page.waitForTimeout(ms);
  }

  /**
   * Recargar página
   */
  async reload() {
    await this.page.reload({ waitUntil: 'networkidle' });
  }

  /**
   * Verificar que estamos logueados (buscar indicadores comunes)
   */
  async isLoggedIn() {
    const loggedInIndicators = [
      '[data-testid="user-menu"]',
      '.user-avatar',
      '#logout-button',
      '.nav-user',
    ];
    
    for (const selector of loggedInIndicators) {
      if (await this.isVisible(selector)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Obtener token JWT del localStorage
   */
  async getAuthToken() {
    return await this.page.evaluate(() => {
      return localStorage.getItem('token') || 
             localStorage.getItem('authToken') ||
             localStorage.getItem('jwt');
    });
  }
}

module.exports = { BasePage };
