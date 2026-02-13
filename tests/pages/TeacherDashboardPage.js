// @ts-check
const { BasePage } = require('./BasePage');

/**
 * TeacherDashboardPage - Page Object para dashboard de profesor
 * 
 * Maneja:
 * - Visualización de estado de membresía
 * - Navegación a configuración de calendario
 * - Activación de membresía con MercadoPago
 */
class TeacherDashboardPage extends BasePage {
  constructor(page) {
    super(page);
    
    this.selectors = {
      // Banners de membresía
      membershipBanner: '.membership-banner, #membership-status, [data-testid="membership"]',
      activeMembershipBadge: '.badge-success, .membership-active',
      trialBanner: '.trial-banner, .alert-warning',
      expiredBanner: '.expired-banner, .alert-danger',
      renewalBanner: '.renewal-banner',
      
      // Botones de acción
      activateMembershipBtn: '#btn-activate-membership, .activate-membership, [data-action="activate"]',
      mercadoPagoBtn: '#btn-mercadopago, .mercadopago-btn, [data-payment="mercadopago"]',
      
      // Navegación
      availabilityLink: 'a[href*="availability"], #link-availability, .nav-availability',
      studentsLink: 'a[href*="alumnos"], #link-students',
      earningsLink: 'a[href*="ganancias"], #link-earnings',
      roomLink: 'a[href*="room"], .start-room-btn',
      
      // Stats
      totalEarnings: '.total-earnings, #earnings-total',
      pendingPayouts: '.pending-payouts, #payouts-pending',
      upcomingClasses: '.upcoming-classes, #classes-upcoming',
      
      // Perfil
      teacherName: '.teacher-name, #profile-name',
      teacherEmail: '.teacher-email, #profile-email',
    };
  }

  /**
   * Navegar al dashboard
   */
  async goto() {
    await this.navigate('/dashboard.html');
    // Esperar a que cargue contenido dinámico
    await this.wait(1000);
  }

  /**
   * Verificar estado de membresía
   * @returns {'active' | 'trial' | 'expired' | 'unknown'}
   */
  async getMembershipStatus() {
    // Verificar badge activo
    if (await this.isVisible(this.selectors.activeMembershipBadge)) {
      return 'active';
    }
    
    // Verificar banner trial
    if (await this.isVisible(this.selectors.trialBanner)) {
      const text = await this.getText(this.selectors.trialBanner);
      if (text?.toLowerCase().includes('trial') || text?.toLowerCase().includes('prueba')) {
        return 'trial';
      }
    }
    
    // Verificar banner expirado
    if (await this.isVisible(this.selectors.expiredBanner)) {
      return 'expired';
    }
    
    return 'unknown';
  }

  /**
   * Verificar si necesita renovar (banner amarillo visible)
   */
  async needsRenewal() {
    return await this.isVisible(this.selectors.renewalBanner);
  }

  /**
   * Ir a configuración de disponibilidad/calendario
   */
  async goToAvailability() {
    // Buscar link de disponibilidad
    const link = this.page.locator(this.selectors.availabilityLink);
    if (await link.isVisible()) {
      await link.click();
    } else {
      // Navegar directamente
      await this.navigate('/teacher-availability.html');
    }
    await this.page.waitForURL('**/availability**');
  }

  /**
   * Intentar iniciar sala virtual
   */
  async tryStartRoom() {
    const roomBtn = this.page.locator(this.selectors.roomLink);
    if (await roomBtn.isVisible()) {
      await roomBtn.click();
      return true;
    }
    return false;
  }

  /**
   * Click en botón de activar membresía con MercadoPago
   */
  async clickActivateMembership() {
    // Primero buscar botón específico de activación
    let btn = this.page.locator(this.selectors.activateMembershipBtn);
    if (!await btn.isVisible()) {
      btn = this.page.locator(this.selectors.mercadoPagoBtn);
    }
    
    await btn.waitFor({ state: 'visible' });
    await btn.click();
    
    // Esperar redirección a MercadoPago o popup
    await this.wait(2000);
  }

  /**
   * Verificar que botón Stripe NO está visible
   */
  async isStripeHidden() {
    const stripeSelectors = [
      '#btn-stripe',
      '.stripe-btn',
      '[data-payment="stripe"]',
      'button:has-text("Stripe")',
      'button:has-text("stripe")',
    ];
    
    for (const selector of stripeSelectors) {
      if (await this.isVisible(selector)) {
        return false; // Stripe está visible = mal
      }
    }
    return true; // Stripe oculto = bien
  }

  /**
   * Obtener ganancias totales (en centavos)
   */
  async getTotalEarnings() {
    try {
      const text = await this.getText(this.selectors.totalEarnings);
      // Extraer número, convertir a centavos
      const match = text?.match(/[\d.,]+/);
      if (match) {
        // Remover puntos de miles, reemplazar coma por punto
        const normalized = match[0].replace(/\./g, '').replace(',', '.');
        return Math.round(parseFloat(normalized) * 100);
      }
    } catch {
      // Elemento no encontrado
    }
    return 0;
  }

  /**
   * Verificar que puede acceder a sala (membresía activa)
   */
  async canAccessRoom() {
    const status = await this.getMembershipStatus();
    return status === 'active';
  }
}

module.exports = { TeacherDashboardPage };
