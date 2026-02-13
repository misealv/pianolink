// @ts-check
const { BasePage } = require('./BasePage');

/**
 * LoginPage - Page Object para login
 * 
 * Maneja autenticación de todos los roles
 */
class LoginPage extends BasePage {
  constructor(page) {
    super(page);
    
    this.selectors = {
      emailInput: '#email, input[name="email"], #login-email',
      passwordInput: '#password, input[name="password"], #login-password',
      submitButton: 'button[type="submit"], #login-btn, .login-button',
      errorMessage: '.alert-danger, .error-message, #login-error',
      forgotPasswordLink: 'a[href*="reset"], a[href*="forgot"], .forgot-password',
      registerLink: 'a[href*="register"], .register-link',
    };
  }

  /**
   * Navegar a login
   */
  async goto() {
    await this.navigate('/login.html');
    await this.waitForVisible(this.selectors.emailInput);
  }

  /**
   * Login con credenciales
   */
  async login(email, password) {
    await this.page.locator(this.selectors.emailInput).first().fill(email);
    await this.page.locator(this.selectors.passwordInput).first().fill(password);
    await this.page.locator(this.selectors.submitButton).first().click();
  }

  /**
   * Login completo de profesor
   */
  async loginAsTeacher(email, password) {
    await this.goto();
    await this.login(email, password);
    await this.page.waitForURL('**/dashboard**', { timeout: 15000 });
  }

  /**
   * Login completo de estudiante
   */
  async loginAsStudent(email, password) {
    await this.goto();
    await this.login(email, password);
    await this.page.waitForURL('**/cliente**', { timeout: 15000 });
  }

  /**
   * Login completo de admin
   */
  async loginAsAdmin(email, password) {
    await this.goto();
    await this.login(email, password);
    await this.page.waitForURL('**/admin**', { timeout: 15000 });
  }

  /**
   * Obtener error de login
   */
  async getErrorMessage() {
    try {
      await this.waitForVisible(this.selectors.errorMessage, 5000);
      return await this.getText(this.selectors.errorMessage);
    } catch {
      return null;
    }
  }

  /**
   * Intentar login con credenciales inválidas
   */
  async attemptInvalidLogin(email, password) {
    await this.goto();
    await this.login(email, password);
    
    // No debería redirigir, debería mostrar error
    await this.wait(2000);
    const currentUrl = this.getCurrentURL();
    const error = await this.getErrorMessage();
    
    return {
      stayedOnPage: currentUrl.includes('login'),
      errorMessage: error,
    };
  }
}

module.exports = { LoginPage };
