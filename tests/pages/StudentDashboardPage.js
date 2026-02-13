// @ts-check
const { BasePage } = require('./BasePage');

/**
 * StudentDashboardPage - Page Object para dashboard de estudiante
 * 
 * Maneja:
 * - Ver clases pendientes
 * - Confirmar clases tomadas
 * - Navegar a buscar profesores
 * - Ver paquetes comprados
 */
class StudentDashboardPage extends BasePage {
  constructor(page) {
    super(page);
    
    this.selectors = {
      // Clases
      upcomingClasses: '.upcoming-classes, #classes-list, [data-testid="upcoming"]',
      classCard: '.class-card, .booking-item',
      confirmClassBtn: '.confirm-class-btn, [data-action="confirm-class"]',
      cancelClassBtn: '.cancel-class-btn, [data-action="cancel-class"]',
      
      // Paquetes
      activePackages: '.active-packages, #packages-list',
      classesRemaining: '.classes-remaining, #classes-count',
      buyPackageBtn: '.buy-package-btn, #btn-buy-package',
      
      // Navegación
      findTeacherLink: 'a[href*="buscar"], a[href*="profesores"], #find-teacher',
      myClassesLink: 'a[href*="mis-clases"], #my-classes',
      profileLink: 'a[href*="perfil"], #my-profile',
      
      // Confirmación de clase (modal o inline)
      confirmModal: '.confirm-modal, #confirm-class-modal',
      confirmYesBtn: '#confirm-yes, .btn-confirm-yes',
      confirmNoBtn: '#confirm-no, .btn-confirm-no',
      
      // Stats
      totalClasses: '.total-classes, #stats-total',
      completedClasses: '.completed-classes, #stats-completed',
      
      // Mensajes
      noClassesMessage: '.no-classes, .empty-state',
      successMessage: '.alert-success',
    };
  }

  /**
   * Navegar al dashboard de estudiante
   */
  async goto() {
    await this.navigate('/cliente.html');
    await this.wait(1000);
  }

  /**
   * Obtener cantidad de clases restantes
   */
  async getClassesRemaining() {
    try {
      const text = await this.getText(this.selectors.classesRemaining);
      const match = text?.match(/\d+/);
      return match ? parseInt(match[0]) : 0;
    } catch {
      return 0;
    }
  }

  /**
   * Verificar si hay clases pendientes
   */
  async hasUpcomingClasses() {
    const cards = this.page.locator(this.selectors.classCard);
    const count = await cards.count();
    return count > 0;
  }

  /**
   * Confirmar una clase tomada
   * @param {number} index - Índice de la clase (0-based)
   */
  async confirmClass(index = 0) {
    const classCards = this.page.locator(this.selectors.classCard);
    const card = classCards.nth(index);
    
    // Buscar botón de confirmar dentro de la tarjeta
    const confirmBtn = card.locator(this.selectors.confirmClassBtn);
    if (await confirmBtn.isVisible()) {
      await confirmBtn.click();
      
      // Si hay modal de confirmación
      const modal = this.page.locator(this.selectors.confirmModal);
      if (await modal.isVisible()) {
        await this.page.locator(this.selectors.confirmYesBtn).click();
      }
      
      await this.wait(1000);
      return true;
    }
    return false;
  }

  /**
   * Ir a buscar profesores
   */
  async goToFindTeacher() {
    const link = this.page.locator(this.selectors.findTeacherLink);
    if (await link.isVisible()) {
      await link.click();
    } else {
      await this.navigate('/buscar-profesor.html');
    }
    await this.page.waitForURL('**/buscar**|**/profesores**');
  }

  /**
   * Click en comprar paquete
   */
  async clickBuyPackage() {
    await this.click(this.selectors.buyPackageBtn);
  }

  /**
   * Verificar mensaje de "no tienes clases"
   */
  async hasNoClassesMessage() {
    return await this.isVisible(this.selectors.noClassesMessage);
  }

  /**
   * Obtener lista de clases pendientes
   */
  async getUpcomingClassesList() {
    const classes = [];
    const cards = this.page.locator(this.selectors.classCard);
    const count = await cards.count();
    
    for (let i = 0; i < count; i++) {
      const card = cards.nth(i);
      const teacherName = await card.locator('.teacher-name, .professor-name').textContent().catch(() => 'Unknown');
      const dateTime = await card.locator('.class-datetime, .booking-time').textContent().catch(() => 'Unknown');
      
      classes.push({
        teacherName,
        dateTime,
        index: i,
      });
    }
    
    return classes;
  }
}

module.exports = { StudentDashboardPage };
