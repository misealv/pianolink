// @ts-check
const { BasePage } = require('./BasePage');

/**
 * BookingPage - Page Object para reserva de clases
 * 
 * Maneja:
 * - Ver perfil de profesor
 * - Ver calendario de disponibilidad
 * - Seleccionar slot
 * - Confirmar reserva
 * 
 * IMPORTANTE: Considera diferencias de zona horaria
 */
class BookingPage extends BasePage {
  constructor(page) {
    super(page);
    
    this.selectors = {
      // Perfil del profesor
      teacherName: '.teacher-name, h1.name, #teacher-name',
      teacherBio: '.teacher-bio, .description',
      teacherRating: '.teacher-rating, .rating-stars',
      teacherPrice: '.teacher-price, .price-info',
      
      // Calendario
      calendarContainer: '.calendar-container, #booking-calendar, .availability-grid',
      calendarMonth: '.calendar-month, .month-selector',
      prevMonthBtn: '.prev-month, #btn-prev',
      nextMonthBtn: '.next-month, #btn-next',
      
      // Slots
      availableSlot: '.slot-available, .time-slot.free, [data-available="true"]',
      unavailableSlot: '.slot-unavailable, .time-slot.busy, [data-available="false"]',
      selectedSlot: '.slot-selected, .time-slot.selected',
      
      // Información del slot seleccionado
      selectedDateTime: '.selected-datetime, #selected-time',
      slotPrice: '.slot-price, #booking-price',
      
      // Acciones
      confirmBookingBtn: '#confirm-booking, .book-now-btn, button:has-text("Reservar")',
      cancelBtn: '.cancel-btn, #btn-cancel',
      
      // Paquetes
      packageSelect: '#select-package, .package-selector',
      noPackageWarning: '.no-package-warning, .buy-package-prompt',
      
      // Mensajes
      successMessage: '.booking-success, .alert-success',
      errorMessage: '.booking-error, .alert-danger',
      conflictMessage: '.slot-conflict, .already-booked',
      
      // Timezone
      timezoneDisplay: '.timezone-display, #user-timezone',
    };
  }

  /**
   * Navegar al perfil/booking de un profesor
   */
  async gotoTeacherProfile(teacherId) {
    await this.navigate(`/profesor/${teacherId}`);
    await this.waitForVisible(this.selectors.calendarContainer);
  }

  /**
   * Buscar y navegar al primer profesor disponible
   */
  async findAndSelectFirstTeacher() {
    await this.navigate('/buscar-profesor.html');
    await this.wait(1000);
    
    // Click en primer profesor de la lista
    const firstTeacher = this.page.locator('.teacher-card, .professor-card').first();
    if (await firstTeacher.isVisible()) {
      await firstTeacher.click();
      await this.wait(1000);
      return true;
    }
    return false;
  }

  /**
   * Seleccionar primer slot disponible
   */
  async selectFirstAvailableSlot() {
    const slots = this.page.locator(this.selectors.availableSlot);
    const count = await slots.count();
    
    if (count > 0) {
      await slots.first().click();
      await this.wait(500);
      return true;
    }
    return false;
  }

  /**
   * Seleccionar slot por fecha y hora específica
   * @param {string} date - Fecha en formato ISO (YYYY-MM-DD)
   * @param {string} time - Hora en formato 24h (HH:MM)
   */
  async selectSlotByDateTime(date, time) {
    // Buscar slot con atributos de datos
    const slotSelector = `[data-date="${date}"][data-time="${time}"], [data-datetime="${date}T${time}"]`;
    const slot = this.page.locator(slotSelector);
    
    if (await slot.isVisible()) {
      await slot.click();
      return true;
    }
    
    // Fallback: buscar por texto
    const slotByText = this.page.locator(`.slot:has-text("${time}")`);
    if (await slotByText.isVisible()) {
      await slotByText.click();
      return true;
    }
    
    return false;
  }

  /**
   * Confirmar la reserva
   */
  async confirmBooking() {
    await this.click(this.selectors.confirmBookingBtn);
    await this.wait(2000);
  }

  /**
   * Flujo completo: buscar profesor y reservar primer slot
   */
  async bookFirstAvailableClass() {
    // Buscar profesor
    const foundTeacher = await this.findAndSelectFirstTeacher();
    if (!foundTeacher) {
      throw new Error('No se encontró ningún profesor');
    }
    
    // Seleccionar slot
    const selectedSlot = await this.selectFirstAvailableSlot();
    if (!selectedSlot) {
      throw new Error('No hay slots disponibles');
    }
    
    // Confirmar
    await this.confirmBooking();
  }

  /**
   * Obtener resultado de la reserva
   */
  async getBookingResult() {
    const success = await this.isVisible(this.selectors.successMessage);
    const error = await this.isVisible(this.selectors.errorMessage);
    const conflict = await this.isVisible(this.selectors.conflictMessage);
    
    let message = '';
    if (success) {
      message = await this.getText(this.selectors.successMessage);
    } else if (error) {
      message = await this.getText(this.selectors.errorMessage);
    } else if (conflict) {
      message = await this.getText(this.selectors.conflictMessage);
    }
    
    return {
      success,
      error,
      conflict,
      message,
    };
  }

  /**
   * Verificar si tiene paquete activo para reservar
   */
  async hasActivePackage() {
    return !(await this.isVisible(this.selectors.noPackageWarning));
  }

  /**
   * Obtener precio mostrado (en centavos)
   */
  async getDisplayedPrice() {
    try {
      const text = await this.getText(this.selectors.slotPrice);
      const match = text?.match(/[\d.,]+/);
      if (match) {
        const normalized = match[0].replace(/\./g, '').replace(',', '.');
        return Math.round(parseFloat(normalized) * 100);
      }
    } catch {
      // No hay precio visible
    }
    return 0;
  }

  /**
   * Contar slots disponibles en el calendario visible
   */
  async countAvailableSlots() {
    const slots = this.page.locator(this.selectors.availableSlot);
    return await slots.count();
  }

  /**
   * Navegar al mes siguiente del calendario
   */
  async goToNextMonth() {
    await this.click(this.selectors.nextMonthBtn);
    await this.wait(500);
  }

  /**
   * Navegar al mes anterior del calendario
   */
  async goToPrevMonth() {
    await this.click(this.selectors.prevMonthBtn);
    await this.wait(500);
  }

  /**
   * Obtener zona horaria mostrada al usuario
   */
  async getDisplayedTimezone() {
    try {
      return await this.getText(this.selectors.timezoneDisplay);
    } catch {
      return null;
    }
  }
}

module.exports = { BookingPage };
