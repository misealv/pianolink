// @ts-check
const { BasePage } = require('./BasePage');

/**
 * RegisterPage - Page Object para registro de usuarios
 * 
 * Maneja el flujo de registro para profesores y estudiantes
 */
class RegisterPage extends BasePage {
  constructor(page) {
    super(page);
    
    // Selectores del formulario de registro
    this.selectors = {
      // Campos del formulario
      nameInput: '#name, input[name="name"], #register-name',
      emailInput: '#email, input[name="email"], #register-email',
      passwordInput: '#password, input[name="password"], #register-password',
      phoneInput: '#phone, input[name="phone"], #whatsapp',
      roleSelect: '#role, select[name="role"], #user-role',
      
      // Botones
      submitButton: 'button[type="submit"], #register-btn, .register-button',
      
      // Mensajes
      errorMessage: '.alert-danger, .error-message, #register-error',
      successMessage: '.alert-success, .success-message',
      
      // Links
      loginLink: 'a[href*="login"], .login-link',
    };
  }

  /**
   * Navegar a la página de registro
   */
  async goto() {
    await this.navigate('/register.html');
    // Esperar a que el formulario esté listo
    await this.waitForVisible(this.selectors.nameInput);
  }

  /**
   * Registrar un profesor
   * @param {Object} data - Datos del profesor
   */
  async registerTeacher(data) {
    await this.page.getByTestId('name').or(this.page.locator(this.selectors.nameInput)).first().fill(data.name);
    await this.page.getByTestId('email').or(this.page.locator(this.selectors.emailInput)).first().fill(data.email);
    await this.page.getByTestId('password').or(this.page.locator(this.selectors.passwordInput)).first().fill(data.password);
    
    // Teléfono si existe
    const phoneField = this.page.locator(this.selectors.phoneInput);
    if (await phoneField.isVisible()) {
      await phoneField.fill(data.phone || '+56912345678');
    }
    
    // Seleccionar rol profesor
    const roleField = this.page.locator(this.selectors.roleSelect);
    if (await roleField.isVisible()) {
      await roleField.selectOption('teacher');
    } else {
      // Buscar radio button o checkbox para rol
      const teacherRadio = this.page.locator('input[value="teacher"], #role-teacher');
      if (await teacherRadio.isVisible()) {
        await teacherRadio.click();
      }
    }
  }

  /**
   * Registrar un estudiante
   * @param {Object} data - Datos del estudiante
   */
  async registerStudent(data) {
    await this.page.getByTestId('name').or(this.page.locator(this.selectors.nameInput)).first().fill(data.name);
    await this.page.getByTestId('email').or(this.page.locator(this.selectors.emailInput)).first().fill(data.email);
    await this.page.getByTestId('password').or(this.page.locator(this.selectors.passwordInput)).first().fill(data.password);
    
    const phoneField = this.page.locator(this.selectors.phoneInput);
    if (await phoneField.isVisible()) {
      await phoneField.fill(data.phone || '+56912345678');
    }
    
    // Seleccionar rol estudiante
    const roleField = this.page.locator(this.selectors.roleSelect);
    if (await roleField.isVisible()) {
      await roleField.selectOption('student');
    } else {
      const studentRadio = this.page.locator('input[value="student"], #role-student');
      if (await studentRadio.isVisible()) {
        await studentRadio.click();
      }
    }
  }

  /**
   * Enviar formulario de registro
   */
  async submit() {
    await this.page.locator(this.selectors.submitButton).first().click();
  }

  /**
   * Flujo completo: registrar profesor
   */
  async completeTeacherRegistration(data) {
    await this.goto();
    await this.registerTeacher(data);
    await this.submit();
    
    // Esperar redirección al dashboard de profesor
    await this.page.waitForURL('**/dashboard**', { timeout: 15000 });
  }

  /**
   * Flujo completo: registrar estudiante
   */
  async completeStudentRegistration(data) {
    await this.goto();
    await this.registerStudent(data);
    await this.submit();
    
    // Esperar redirección al dashboard de estudiante
    await this.page.waitForURL('**/cliente**', { timeout: 15000 });
  }

  /**
   * Verificar error de registro
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
   * Intentar registro con email duplicado (para test de edge case)
   */
  async attemptDuplicateRegistration(data) {
    await this.goto();
    await this.registerTeacher(data);
    await this.submit();
    
    // Debería mostrar error, no redirigir
    const error = await this.getErrorMessage();
    return error;
  }
}

module.exports = { RegisterPage };
