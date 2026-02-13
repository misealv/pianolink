// @ts-check
const { BasePage } = require('./BasePage');
const { PRICES } = require('../fixtures/testFixtures');

/**
 * CheckoutPage - Page Object para flujos de pago
 * 
 * Maneja:
 * - Checkout de Kit de Bienvenida ($44 USD)
 * - Checkout de paquetes de clases
 * - Pago con MercadoPago (Stripe deshabilitado)
 * 
 * IMPORTANTE: Todos los precios en centavos (enteros)
 */
class CheckoutPage extends BasePage {
  constructor(page) {
    super(page);
    
    this.selectors = {
      // Formulario de checkout
      nameInput: '#name, input[name="name"], #checkout-name',
      emailInput: '#email, input[name="email"], #checkout-email',
      phoneInput: '#phone, input[name="phone"], #whatsapp',
      
      // Información del producto
      productName: '.product-name, #item-name',
      productPrice: '.product-price, #item-price, .price-display',
      
      // Botones de pago
      mercadoPagoBtn: '#btn-mercadopago, .mercadopago-btn, [data-payment="mercadopago"]',
      stripeBtn: '#btn-stripe, .stripe-btn, [data-payment="stripe"]',
      submitBtn: 'button[type="submit"], .pay-button',
      
      // Estados de botón
      loadingSpinner: '.loading-spinner, .spinner, .btn-loading',
      buttonDisabled: 'button:disabled, .btn-disabled',
      
      // Mensajes
      successMessage: '.payment-success, .alert-success, #success-message',
      errorMessage: '.payment-error, .alert-danger, #error-message',
      processingMessage: '.processing, .verifying-payment',
      
      // Resumen
      orderSummary: '.order-summary, #checkout-summary',
      totalAmount: '.total-amount, #total-price',
      
      // Kit específico
      kitPrice: '.kit-price, #kit-precio',
    };
  }

  /**
   * Navegar a checkout de Kit de Bienvenida
   */
  async gotoKitCheckout() {
    await this.navigate('/kit-bienvenida-v2.html');
    await this.waitForVisible(this.selectors.nameInput);
  }

  /**
   * Llenar formulario de checkout
   */
  async fillCheckoutForm(data) {
    await this.fillField(this.selectors.nameInput, data.name);
    await this.fillField(this.selectors.emailInput, data.email);
    
    const phoneField = this.page.locator(this.selectors.phoneInput);
    if (await phoneField.isVisible()) {
      await phoneField.fill(data.phone || '+56912345678');
    }
  }

  /**
   * Verificar que precio mostrado es correcto (en centavos)
   */
  async verifyKitPrice() {
    const priceText = await this.getText(this.selectors.productPrice);
    // Buscar $44 o 44 USD
    const has44 = priceText?.includes('44');
    const hasUSD = priceText?.toLowerCase().includes('usd') || priceText?.includes('$');
    
    return has44 && hasUSD;
  }

  /**
   * Obtener precio mostrado en centavos
   */
  async getDisplayedPriceInCents() {
    try {
      const text = await this.getText(this.selectors.productPrice);
      const match = text?.match(/[\d.,]+/);
      if (match) {
        const amount = parseFloat(match[0].replace(',', '.'));
        // Si el precio parece ser en dólares (< 1000), convertir a centavos
        if (amount < 1000) {
          return Math.round(amount * 100);
        }
        // Si es un número grande (ej: pesos chilenos), ya son centavos
        return Math.round(amount);
      }
    } catch {
      // Error obteniendo precio
    }
    return 0;
  }

  /**
   * Click en botón MercadoPago
   */
  async clickMercadoPago() {
    const btn = this.page.locator(this.selectors.mercadoPagoBtn);
    await btn.waitFor({ state: 'visible' });
    
    // Verificar que no está deshabilitado
    const isDisabled = await btn.isDisabled();
    if (isDisabled) {
      throw new Error('Botón MercadoPago está deshabilitado');
    }
    
    await btn.click();
    
    // Esperar procesamiento
    await this.wait(2000);
  }

  /**
   * Verificar que botón Stripe está OCULTO (requisito de negocio)
   */
  async isStripeButtonHidden() {
    const stripeBtn = this.page.locator(this.selectors.stripeBtn);
    const isVisible = await stripeBtn.isVisible();
    return !isVisible;
  }

  /**
   * Verificar que MercadoPago es la única opción visible
   * Busca botones por texto además de selectores
   */
  async isMercadoPagoOnlyOption() {
    // Buscar botón MercadoPago por texto (más robusto)
    const mpByText = this.page.locator('button:has-text("MercadoPago"), button:has-text("Mercado Pago")');
    const mpBySelector = this.page.locator(this.selectors.mercadoPagoBtn);
    
    const mpVisible = (await mpByText.count() > 0) || (await mpBySelector.isVisible());
    const stripeHidden = await this.isStripeButtonHidden();
    
    return mpVisible && stripeHidden;
  }

  /**
   * Flujo completo: checkout de kit con MercadoPago
   * No completa el pago en MP (solo hasta redirección)
   */
  async initiateKitPayment(userData) {
    await this.gotoKitCheckout();
    await this.fillCheckoutForm(userData);
    
    // Verificar precio antes de pagar
    const priceCorrect = await this.verifyKitPrice();
    if (!priceCorrect) {
      console.warn('⚠️ Precio del kit no parece ser $44 USD');
    }
    
    await this.clickMercadoPago();
    
    // Verificar resultado
    const currentUrl = this.getCurrentURL();
    const redirectedToMP = currentUrl.includes('mercadopago') || 
                           currentUrl.includes('mercadolibre');
    
    return {
      redirectedToMercadoPago: redirectedToMP,
      priceVerified: priceCorrect,
    };
  }

  /**
   * Verificar estado después de pago (página de éxito)
   */
  async verifyPaymentSuccess() {
    // Esperar en página de éxito
    try {
      await this.page.waitForURL('**/success**|**/exito**', { timeout: 30000 });
      const successVisible = await this.isVisible(this.selectors.successMessage);
      return successVisible;
    } catch {
      return false;
    }
  }

  /**
   * Simular múltiples clicks en botón de pago (test de doble-click)
   */
  async simulateMultipleClicks(times = 5) {
    const btn = this.page.locator(this.selectors.mercadoPagoBtn);
    await btn.waitFor({ state: 'visible' });
    
    // Hacer clicks rápidos
    const clicks = [];
    for (let i = 0; i < times; i++) {
      clicks.push(btn.click({ force: true }));
    }
    
    await Promise.allSettled(clicks);
    await this.wait(2000);
    
    // Verificar que botón está deshabilitado después del primer click
    const isDisabled = await btn.isDisabled();
    return isDisabled;
  }

  /**
   * Abandonar checkout (cerrar página sin completar)
   */
  async abandonCheckout() {
    // Simplemente navegar fuera
    await this.navigate('/');
  }

  /**
   * Verificar mensaje de procesando
   */
  async isProcessing() {
    return await this.isVisible(this.selectors.processingMessage) ||
           await this.isVisible(this.selectors.loadingSpinner);
  }
}

module.exports = { CheckoutPage };
