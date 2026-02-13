// @ts-check
const { BasePage } = require('./BasePage');

/**
 * AvailabilityPage - Page Object para configuración de calendario/disponibilidad
 * 
 * Maneja:
 * - Configuración de días disponibles
 * - Configuración de horarios
 * - Slots específicos
 * 
 * IMPORTANTE: Todos los horarios se guardan en UTC en el backend
 */
class AvailabilityPage extends BasePage {
  constructor(page) {
    super(page);
    
    this.selectors = {
      // Días de la semana
      dayCheckboxes: '.day-checkbox, input[name="days[]"], [data-day]',
      mondayCheckbox: '#day-monday, input[value="monday"], [data-day="1"]',
      tuesdayCheckbox: '#day-tuesday, input[value="tuesday"], [data-day="2"]',
      wednesdayCheckbox: '#day-wednesday, input[value="wednesday"], [data-day="3"]',
      thursdayCheckbox: '#day-thursday, input[value="thursday"], [data-day="4"]',
      fridayCheckbox: '#day-friday, input[value="friday"], [data-day="5"]',
      saturdayCheckbox: '#day-saturday, input[value="saturday"], [data-day="6"]',
      sundayCheckbox: '#day-sunday, input[value="sunday"], [data-day="0"]',
      
      // Horarios
      startTimeInput: '#start-time, input[name="startTime"], .time-start',
      endTimeInput: '#end-time, input[name="endTime"], .time-end',
      
      // Slots
      slotDuration: '#slot-duration, select[name="duration"]',
      
      // Acciones
      saveButton: '#save-availability, button[type="submit"], .save-btn',
      addSlotButton: '#add-slot, .add-slot-btn',
      
      // Calendario visual
      calendarGrid: '.calendar-grid, #calendar, .availability-calendar',
      availableSlot: '.slot-available, .slot.free',
      bookedSlot: '.slot-booked, .slot.busy',
      
      // Mensajes
      successMessage: '.alert-success, .success-message',
      errorMessage: '.alert-danger, .error-message',
      
      // Timezone info
      timezoneIndicator: '.timezone-info, #current-timezone',
    };
    
    // Mapeo de días para facilitar selección
    this.dayMap = {
      monday: this.selectors.mondayCheckbox,
      tuesday: this.selectors.tuesdayCheckbox,
      wednesday: this.selectors.wednesdayCheckbox,
      thursday: this.selectors.thursdayCheckbox,
      friday: this.selectors.fridayCheckbox,
      saturday: this.selectors.saturdayCheckbox,
      sunday: this.selectors.sundayCheckbox,
    };
  }

  /**
   * Navegar a página de disponibilidad
   */
  async goto() {
    await this.navigate('/teacher-availability.html');
    await this.wait(1000); // Esperar carga de calendario
  }

  /**
   * Seleccionar días disponibles
   * @param {string[]} days - Array de días (ej: ['monday', 'wednesday', 'friday'])
   */
  async selectDays(days) {
    for (const day of days) {
      const selector = this.dayMap[day.toLowerCase()];
      if (selector) {
        const checkbox = this.page.locator(selector);
        if (await checkbox.isVisible()) {
          // Verificar si ya está checked
          const isChecked = await checkbox.isChecked();
          if (!isChecked) {
            await checkbox.click();
          }
        }
      }
    }
  }

  /**
   * Deseleccionar todos los días
   */
  async clearAllDays() {
    for (const day of Object.keys(this.dayMap)) {
      const checkbox = this.page.locator(this.dayMap[day]);
      if (await checkbox.isVisible()) {
        const isChecked = await checkbox.isChecked();
        if (isChecked) {
          await checkbox.click();
        }
      }
    }
  }

  /**
   * Configurar horario de disponibilidad
   * @param {string} startTime - Hora inicio (formato 24h: "09:00")
   * @param {string} endTime - Hora fin (formato 24h: "18:00")
   */
  async setTimeRange(startTime, endTime) {
    const startInput = this.page.locator(this.selectors.startTimeInput);
    const endInput = this.page.locator(this.selectors.endTimeInput);
    
    if (await startInput.isVisible()) {
      await startInput.fill(startTime);
    }
    
    if (await endInput.isVisible()) {
      await endInput.fill(endTime);
    }
  }

  /**
   * Configurar duración de slots
   * @param {number} minutes - Duración en minutos (30, 45, 60, 90)
   */
  async setSlotDuration(minutes) {
    const durationSelect = this.page.locator(this.selectors.slotDuration);
    if (await durationSelect.isVisible()) {
      await durationSelect.selectOption(String(minutes));
    }
  }

  /**
   * Guardar configuración de disponibilidad
   */
  async save() {
    await this.click(this.selectors.saveButton);
    // Esperar respuesta
    await this.wait(2000);
  }

  /**
   * Flujo completo: configurar disponibilidad estándar
   * Lunes a Viernes, 9:00-18:00, slots de 60 minutos
   */
  async configureStandardAvailability() {
    await this.goto();
    
    // Seleccionar días laborales
    await this.selectDays(['monday', 'tuesday', 'wednesday', 'thursday', 'friday']);
    
    // Horario 9 a 18
    await this.setTimeRange('09:00', '18:00');
    
    // Slots de 1 hora
    await this.setSlotDuration(60);
    
    // Guardar
    await this.save();
  }

  /**
   * Configurar disponibilidad personalizada
   */
  async configureCustomAvailability(options) {
    await this.goto();
    
    if (options.days) {
      await this.clearAllDays();
      await this.selectDays(options.days);
    }
    
    if (options.startTime && options.endTime) {
      await this.setTimeRange(options.startTime, options.endTime);
    }
    
    if (options.slotDuration) {
      await this.setSlotDuration(options.slotDuration);
    }
    
    await this.save();
  }

  /**
   * Obtener mensaje de éxito/error
   */
  async getSaveResult() {
    const success = await this.getText(this.selectors.successMessage).catch(() => null);
    const error = await this.getText(this.selectors.errorMessage).catch(() => null);
    
    return {
      success: !!success,
      message: success || error,
    };
  }

  /**
   * Verificar que calendario muestra zona horaria correcta
   */
  async getDisplayedTimezone() {
    try {
      return await this.getText(this.selectors.timezoneIndicator);
    } catch {
      return null;
    }
  }

  /**
   * Contar slots disponibles visibles
   */
  async countAvailableSlots() {
    const slots = this.page.locator(this.selectors.availableSlot);
    return await slots.count();
  }

  /**
   * Contar slots ocupados
   */
  async countBookedSlots() {
    const slots = this.page.locator(this.selectors.bookedSlot);
    return await slots.count();
  }
}

module.exports = { AvailabilityPage };
