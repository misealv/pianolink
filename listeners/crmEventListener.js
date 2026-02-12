/**
 * listeners/crmEventListener.js
 * Registra los listeners del módulo CRM en el EventService del core.
 * 
 * Se importa y ejecuta en server.js durante el arranque.
 * Es el único punto de contacto entre el core y el CRM.
 */

function registerCrmListeners(eventService) {
    try {
        const CrmBridgeService = require('../crm/services/CrmBridgeService');
        CrmBridgeService.registerListeners(eventService);
        console.log('[CRM Listener] ✅ Bridge de eventos registrado');
    } catch (error) {
        // Si el módulo CRM no existe o falla, el core sigue funcionando
        console.warn('[CRM Listener] ⚠️ No se pudo cargar el módulo CRM:', error.message);
    }
}

module.exports = { registerCrmListeners };
