/* services/EventService.js - Sistema de Eventos Centralizado */

const EventEmitter = require('events');

/**
 * EventService - Sistema centralizado para manejar todos los eventos de la aplicación.
 * 
 * Basado en el patrón Observer/Pub-Sub utilizando el EventEmitter nativo de Node.js.
 * 
 * VENTAJAS:
 * - Desacopla componentes del sistema
 * - Permite múltiples suscriptores para el mismo evento
 * - Facilita la escalabilidad (agregar nuevas funcionalidades sin modificar lógica existente)
 * - Los errores en listeners no bloquean el flujo principal
 * 
 * EVENTOS ACTUALES:
 * - teacher.created: Emitido cuando se registra un nuevo profesor
 * - teacher.updated: Emitido cuando se actualiza un perfil de profesor
 * - teacher.deleted: Emitido cuando se elimina un profesor
 * 
 * EVENTOS FUTUROS (Expandible):
 * - class.scheduled: Notificaciones de clases
 * - payment.received: Recibos de pago
 * - student.enrolled: Confirmaciones de inscripción
 * - feedback.received: Alertas de feedback
 * - lead.created: Notificaciones de nuevos leads
 */

class EventService extends EventEmitter {
    constructor() {
        super();
        
        // Configuración: aumentar límite de listeners (por defecto es 10)
        // Útil cuando múltiples servicios escuchan el mismo evento
        this.setMaxListeners(20);
        
        // Logging de eventos (útil para debug en desarrollo)
        this._setupLogging();
    }
    
    /**
     * Configura logging automático de todos los eventos (solo en desarrollo)
     * @private
     */
    _setupLogging() {
        if (process.env.NODE_ENV !== 'production') {
            const originalEmit = this.emit;
            
            this.emit = function(event, ...args) {
                console.log(`[EVENT] 📡 ${event}`, args[0] ? `(${Object.keys(args[0]).join(', ')})` : '');
                return originalEmit.call(this, event, ...args);
            };
        }
    }
    
    /**
     * Emite un evento de forma segura con manejo de errores
     * @param {string} eventName - Nombre del evento
     * @param {object} data - Datos del evento
     * @returns {boolean} - True si se emitió correctamente
     */
    emitSafe(eventName, data) {
        try {
            return this.emit(eventName, data);
        } catch (error) {
            console.error(`[EVENT] ❌ Error emitiendo evento '${eventName}':`, error.message);
            return false;
        }
    }
    
    /**
     * Registra un listener con manejo automático de errores
     * @param {string} eventName - Nombre del evento
     * @param {Function} handler - Función manejadora
     * @param {string} listenerName - Nombre descriptivo del listener (para logging)
     */
    registerListener(eventName, handler, listenerName = 'anonymous') {
        const wrappedHandler = async (data) => {
            try {
                await handler(data);
            } catch (error) {
                console.error(
                    `[EVENT] ❌ Error en listener '${listenerName}' para evento '${eventName}':`,
                    error.message
                );
                
                // En producción, aquí podrías enviar a un servicio de monitoreo (Sentry, Datadog, etc.)
                if (process.env.NODE_ENV === 'production') {
                    // TODO: Integrar con servicio de monitoreo
                    // Sentry.captureException(error, { extra: { event: eventName, listener: listenerName, data } });
                }
            }
        };
        
        this.on(eventName, wrappedHandler);
        
        if (process.env.NODE_ENV !== 'production') {
            console.log(`[EVENT] ✅ Listener registrado: '${listenerName}' -> '${eventName}'`);
        }
    }
}

// Singleton: una única instancia compartida en toda la aplicación
const eventService = new EventService();

module.exports = eventService;
