/**
 * services/WelcomeKitTransitionService.js
 * 
 * Máquina de estados simplificada para el flujo WelcomeKit.
 * 
 * Estados simplificados (6 vs 11 anteriores):
 *   onboarding → setup → trial_ready → trial_done → active
 *                                                 → refunded
 * 
 * Cada transición valida origen→destino y dispara side-effects
 * automáticos (emails, actualización de sub-documentos) sin importar
 * si el cambio lo dispara el sistema o un admin manualmente.
 */

const WelcomeKitEmailService = require('./WelcomeKitEmailService');
const GlobalConfig = require('../models/GlobalConfig');

// ==================== MAPEO DE ESTADOS LEGACY → NUEVOS ====================

const LEGACY_TO_NEW = {
    'paid':                 'onboarding',
    'entrevista_pendiente': 'onboarding',
    'entrevista_agendada':  'onboarding',
    'esperando_equipo':     'onboarding',
    'shipping':             'onboarding',   // legacy cable flow
    'delivered':            'onboarding',   // legacy cable flow
    'setup_pending':        'setup',
    'setup_scheduled':      'setup',
    'trial_available':      'trial_ready',
    'trial_scheduled':      'trial_ready',
    'trial_completed':      'trial_done',
    'completed':            'active',
    'refunded':             'refunded',
    'disputed':             'refunded'
};

// ==================== TRANSICIONES VÁLIDAS ====================

const VALID_TRANSITIONS = {
    'onboarding': ['setup', 'refunded'],
    'setup':      ['trial_ready', 'onboarding', 'refunded'],  // onboarding = rollback por si hay problema
    'trial_ready':['trial_done', 'setup', 'refunded'],        // setup = rollback
    'trial_done': ['active', 'trial_ready', 'refunded'],      // trial_ready = rollback
    'active':     ['refunded'],
    'refunded':   ['onboarding']   // re-activar caso excepcional
};

// ==================== ESTADOS Y SUS LABELS ====================

const STATUS_LABELS = {
    'onboarding':  '📋 Onboarding',
    'setup':       '⚙️ Setup Técnico',
    'trial_ready': '🎹 Clase de Prueba',
    'trial_done':  '⭐ Prueba Completada',
    'active':      '✅ Activo',
    'refunded':    '💸 Reembolsado'
};

const ALL_STATUSES = Object.keys(STATUS_LABELS);

// ==================== HELPER: datos del admin para emails ====================

async function _getAdminEmailData() {
    try {
        const profile = await GlobalConfig.getAdminProfile();
        return {
            adminName: profile.name || 'Equipo PianoLink',
            adminEmail: profile.email || 'hola@pianolink.net',
            notificationEmail: profile.notificationEmail || profile.email || 'hola@pianolink.net',
            whatsappNumber: profile.whatsapp || '+56959089770',
            adminWhatsapp: profile.whatsapp || '+56959089770'
        };
    } catch (err) {
        console.error('[WKTransition] Error cargando perfil admin:', err.message);
        return {
            adminName: 'Equipo PianoLink',
            adminEmail: 'hola@pianolink.net',
            notificationEmail: 'hola@pianolink.net',
            whatsappNumber: '+56959089770',
            adminWhatsapp: '+56959089770'
        };
    }
}

// ==================== SIDE-EFFECTS POR TRANSICIÓN ====================

/**
 * Side-effects que se ejecutan DESPUÉS de guardar el nuevo estado.
 * Cada función recibe (kit, options) y retorna { success, detail }.
 * Los errores de side-effects se loguean pero NO impiden la transición.
 */
const TRANSITION_EFFECTS = {
    /**
     * → setup: El cliente confirmó su equipo y está listo para setup técnico.
     * Side-effect: Email de confirmación de equipo listo.
     */
    'setup': async (kit, options = {}) => {
        const effects = [];

        // Actualizar sub-documento de setup
        kit.setupSession = kit.setupSession || {};
        if (kit.setupSession.status !== 'scheduled') {
            kit.setupSession.status = 'not_scheduled';
        }

        // Marcar confirmación de equipo si no estaba
        kit.shipping = kit.shipping || {};
        if (!kit.shipping.clientConfirmedReceipt) {
            kit.shipping.clientConfirmedReceipt = true;
            kit.shipping.clientConfirmedAt = new Date();
        }

        // Enviar email de confirmación
        if (!options.skipEmail) {
            try {
                const adminData = await _getAdminEmailData();
                await WelcomeKitEmailService.sendEquipmentReadyConfirmation({
                    to: kit.clientEmail,
                    clientName: kit.clientName || 'Estudiante',
                    adminName: adminData.adminName,
                    adminWhatsapp: adminData.adminWhatsapp
                });
                effects.push('email_equipment_ready_sent');
                console.log(`[WKTransition] 📧 Email equipo listo enviado a ${kit.clientEmail}`);
            } catch (err) {
                console.error(`[WKTransition] ⚠️ Error email equipo listo:`, err.message);
                effects.push('email_equipment_ready_failed');
            }
        }

        return { success: true, effects };
    },

    /**
     * → trial_ready: El setup técnico fue completado, puede agendar clase de prueba.
     * Side-effect: Email invitando a elegir profesor y agendar clase.
     */
    'trial_ready': async (kit, options = {}) => {
        const effects = [];

        // Actualizar sub-documentos
        kit.setupSession = kit.setupSession || {};
        kit.setupSession.status = 'completed';
        kit.setupSession.completedAt = kit.setupSession.completedAt || new Date();

        kit.trialClass = kit.trialClass || {};
        if (!kit.trialClass.status || kit.trialClass.status === 'not_available') {
            kit.trialClass.status = 'available';
            kit.trialClass.unlockedAt = new Date();
        }

        // Enviar email de invitación a clase de prueba
        if (!options.skipEmail) {
            try {
                const adminData = await _getAdminEmailData();
                await WelcomeKitEmailService.sendTrialClassInvitation({
                    to: kit.clientEmail,
                    clientName: kit.clientName || 'Estudiante',
                    adminName: adminData.adminName
                });
                effects.push('email_trial_invitation_sent');
                console.log(`[WKTransition] 📧 Email trial enviado a ${kit.clientEmail}`);
            } catch (err) {
                console.error(`[WKTransition] ⚠️ Error email trial:`, err.message);
                effects.push('email_trial_invitation_failed');
            }
        }

        return { success: true, effects };
    },

    /**
     * → trial_done: La clase de prueba fue completada, pendiente calificación/conversión.
     */
    'trial_done': async (kit, options = {}) => {
        kit.trialClass = kit.trialClass || {};
        kit.trialClass.status = 'completed';
        kit.trialClass.completedAt = kit.trialClass.completedAt || new Date();
        return { success: true, effects: ['trial_marked_complete'] };
    },

    /**
     * → active: Todo el onboarding completado exitosamente.
     */
    'active': async (kit, options = {}) => {
        kit.trialClass = kit.trialClass || {};
        kit.trialClass.status = 'completed';
        kit.trialClass.completedAt = kit.trialClass.completedAt || new Date();
        return { success: true, effects: ['onboarding_completed'] };
    },

    /**
     * → refunded: Reembolso o disputa.
     */
    'refunded': async (kit, options = {}) => {
        if (options.isDispute) {
            kit.dispute = kit.dispute || {};
            kit.dispute.isActive = true;
            kit.dispute.openedAt = kit.dispute.openedAt || new Date();
            if (options.reason) kit.dispute.reason = options.reason;
            if (options.description) kit.dispute.description = options.description;
        }
        return { success: true, effects: ['marked_refunded'] };
    },

    /**
     * → onboarding: Rollback o re-activación.
     */
    'onboarding': async (kit, options = {}) => {
        return { success: true, effects: ['rolled_back_to_onboarding'] };
    }
};

// ==================== SERVICIO PRINCIPAL ====================

class WelcomeKitTransitionService {

    /**
     * Obtiene el mapeo de estado legacy a nuevo.
     * Útil para la migración de datos.
     */
    static get LEGACY_TO_NEW() {
        return LEGACY_TO_NEW;
    }

    static get ALL_STATUSES() {
        return ALL_STATUSES;
    }

    static get STATUS_LABELS() {
        return STATUS_LABELS;
    }

    static get VALID_TRANSITIONS() {
        return VALID_TRANSITIONS;
    }

    /**
     * Convierte un estado legacy al nuevo estado simplificado.
     * @param {string} legacyStatus 
     * @returns {string} Nuevo estado simplificado
     */
    static mapLegacyStatus(legacyStatus) {
        return LEGACY_TO_NEW[legacyStatus] || legacyStatus;
    }

    /**
     * Verifica si una transición de estado es válida.
     * @param {string} from - Estado actual
     * @param {string} to - Estado objetivo
     * @returns {boolean}
     */
    static isValidTransition(from, to) {
        // Permitir "misma estado" como no-op
        if (from === to) return true;
        const allowed = VALID_TRANSITIONS[from];
        return allowed ? allowed.includes(to) : false;
    }

    /**
     * Ejecuta una transición de estado con validación y side-effects.
     * 
     * @param {Object} kit - Documento WelcomeKit de Mongoose (no guardado aún)
     * @param {string} toStatus - Nuevo estado objetivo
     * @param {Object} options - Opciones adicionales
     * @param {boolean} options.skipEmail - No enviar emails (útil para migración)
     * @param {boolean} options.force - Saltar validación de transición (solo admin)
     * @param {boolean} options.isDispute - Marcar como disputa al ir a refunded
     * @param {string} options.reason - Razón de disputa/reembolso
     * @param {string} options.description - Descripción de disputa
     * @param {string} options.notes - Notas del admin
     * @returns {Object} { success, previousStatus, newStatus, effects, error }
     */
    static async transition(kit, toStatus, options = {}) {
        const rawStatus = kit.overallStatus;
        
        // Normalizar estado legacy → nuevo antes de validar
        const previousStatus = LEGACY_TO_NEW[rawStatus] || rawStatus;
        
        // Si el kit tiene estado legacy, actualizarlo al normalizado antes de continuar
        if (rawStatus !== previousStatus) {
            console.log(`[WKTransition] 🔄 Normalizando estado legacy: ${rawStatus} → ${previousStatus}`);
            kit.overallStatus = previousStatus;
        }

        // Validar que el estado destino es válido
        if (!ALL_STATUSES.includes(toStatus)) {
            return {
                success: false,
                error: `Estado inválido: "${toStatus}". Válidos: ${ALL_STATUSES.join(', ')}`,
                previousStatus
            };
        }

        // No-op si es el mismo estado
        if (previousStatus === toStatus) {
            return {
                success: true,
                previousStatus,
                newStatus: toStatus,
                effects: ['no_change'],
                message: 'Sin cambios — ya está en ese estado'
            };
        }

        // Validar transición (a menos que sea forzada)
        if (!options.force && !this.isValidTransition(previousStatus, toStatus)) {
            return {
                success: false,
                error: `Transición no permitida: ${previousStatus} → ${toStatus}. Permitidas desde "${previousStatus}": ${(VALID_TRANSITIONS[previousStatus] || []).join(', ')}`,
                previousStatus
            };
        }

        // Aplicar el nuevo estado
        kit.overallStatus = toStatus;

        // Guardar notas del admin si se proporcionan
        if (options.notes) {
            kit.setupSession = kit.setupSession || {};
            const timestamp = new Date().toLocaleDateString('es-CL');
            const existingNotes = kit.setupSession.technicianNotes || '';
            kit.setupSession.technicianNotes = existingNotes
                ? `${existingNotes}\n\n---\n${timestamp}: ${options.notes}`
                : `${timestamp}: ${options.notes}`;
        }

        // Ejecutar side-effects
        let effects = [];
        const effectFn = TRANSITION_EFFECTS[toStatus];
        if (effectFn) {
            try {
                const result = await effectFn(kit, options);
                effects = result.effects || [];
            } catch (err) {
                console.error(`[WKTransition] Error en side-effect para → ${toStatus}:`, err.message);
                effects.push(`side_effect_error: ${err.message}`);
            }
        }

        // Guardar el kit (el llamador puede optar por guardar después si necesita hacer más cambios)
        if (!options.deferSave) {
            await kit.save();
        }

        console.log(`[WKTransition] ✅ ${previousStatus} → ${toStatus} | Kit: ${kit._id} | Effects: ${effects.join(', ')}`);

        return {
            success: true,
            previousStatus,
            newStatus: toStatus,
            effects,
            message: `Estado actualizado: ${STATUS_LABELS[previousStatus] || previousStatus} → ${STATUS_LABELS[toStatus] || toStatus}`
        };
    }

    /**
     * Calcula el sub-estado detallado para el frontend a partir del estado simplificado
     * y los sub-documentos del kit.
     * 
     * Retorna un objeto con la info necesaria para renderizar la UI del cliente.
     * 
     * @param {Object} kit - Documento WelcomeKit
     * @param {Object} context - Contexto adicional { nextClass, pendingTrial }
     * @returns {Object} { status, substep, step, message, action, icon, color }
     */
    static getDetailedStatus(kit, context = {}) {
        if (!kit) return null;

        const status = kit.overallStatus;
        const interview = kit.interview || {};
        const setup = kit.setupSession || {};
        const trial = kit.trialClass || {};
        const { nextClass, pendingTrial, isGuardian } = context;

        switch (status) {
            case 'onboarding': {
                // Sub-estados: sin entrevista, entrevista agendada, entrevista completada, esperando equipo
                if (interview.completedAt) {
                    return {
                        status: 'onboarding',
                        substep: 'waiting_equipment',
                        step: 2,
                        icon: '🛒',
                        title: 'Adquiere tu equipo',
                        message: 'Te enviamos un email con las recomendaciones. Cuando tengas tu cable/adaptador, haz clic en el botón.',
                        color: '#f59e0b',
                        action: 'confirm_equipment'
                    };
                }
                if (interview.scheduledAt) {
                    return {
                        status: 'onboarding',
                        substep: 'interview_scheduled',
                        step: 1,
                        icon: '✅',
                        title: 'Entrevista Agendada',
                        message: '',
                        color: '#8b5cf6',
                        action: null,
                        showInterviewDetails: true
                    };
                }
                return {
                    status: 'onboarding',
                    substep: 'interview_pending',
                    step: 1,
                    icon: '📅',
                    title: 'Agenda tu Entrevista de Bienvenida',
                    message: 'Selecciona un horario disponible para tu entrevista de bienvenida (15 min). Evaluaremos tu equipo y te daremos recomendaciones.',
                    color: '#3b82f6',
                    action: null,
                    showCalendar: true
                };
            }

            case 'setup': {
                if (setup.status === 'scheduled' || setup.scheduledAt) {
                    return {
                        status: 'setup',
                        substep: 'setup_scheduled',
                        step: 3,
                        icon: '✅',
                        title: 'Setup Agendado',
                        message: '',
                        color: '#10b981',
                        action: null,
                        showSetupDetails: true
                    };
                }
                return {
                    status: 'setup',
                    substep: 'setup_pending',
                    step: 3,
                    icon: '⚙️',
                    title: 'Agenda tu Sesión de Setup',
                    message: 'Selecciona un horario para configurar tu equipo MIDI junto a nosotros (15 min).',
                    color: '#f97316',
                    action: null,
                    showSetupCalendar: true
                };
            }

            case 'trial_ready': {
                const hasUpcoming = nextClass?.hasNext;
                if (hasUpcoming || trial.bookingId) {
                    return {
                        status: 'trial_ready',
                        substep: 'trial_scheduled',
                        step: 4,
                        icon: '📅',
                        title: '¡Clase de Prueba Agendada!',
                        message: 'Ya tienes tu clase de prueba agendada. Revisa los detalles abajo.',
                        color: '#6366f1',
                        action: null
                    };
                }
                return {
                    status: 'trial_ready',
                    substep: 'trial_available',
                    step: 4,
                    icon: '🎹',
                    title: '¡Listo para la Clase de Prueba!',
                    message: isGuardian
                        ? 'Tu setup técnico está completado. Agenda una clase de prueba para cada estudiante.'
                        : 'Tu setup técnico está completado. Elige un profesor y agenda tu primera clase de prueba.',
                    color: '#6366f1',
                    action: 'schedule_trial',
                    showTrialAction: true,
                    showStudentsList: isGuardian
                };
            }

            case 'trial_done':
                return {
                    status: 'trial_done',
                    substep: 'pending_rating',
                    step: 4,
                    icon: '⭐',
                    title: '¡Califica tu Clase de Prueba!',
                    message: 'Tu clase de prueba fue completada. Por favor califica tu experiencia.',
                    color: '#22c55e',
                    action: 'rate_trial'
                };

            case 'active':
                return {
                    status: 'active',
                    substep: 'completed',
                    step: 5,
                    icon: '✅',
                    title: '¡Onboarding Completado!',
                    message: 'Ya puedes explorar profesores y agendar clases regulares.',
                    color: '#10b981',
                    action: 'view_teachers'
                };

            case 'refunded':
                return {
                    status: 'refunded',
                    substep: kit.dispute?.isActive ? 'disputed' : 'refunded',
                    step: 0,
                    icon: '💸',
                    title: kit.dispute?.isActive ? 'En Disputa' : 'Reembolsado',
                    message: kit.dispute?.isActive
                        ? 'Tu caso está siendo revisado por nuestro equipo.'
                        : 'Tu compra fue reembolsada.',
                    color: '#ef4444',
                    action: null
                };

            default:
                return {
                    status: status,
                    substep: 'unknown',
                    step: 1,
                    icon: '❓',
                    title: 'Estado desconocido',
                    message: `Estado: ${status}`,
                    color: '#6b7280',
                    action: null
                };
        }
    }

    /**
     * Calcula el progreso total del onboarding (0-100%).
     * @param {Object} kit
     * @returns {number} 0-100
     */
    static getProgress(kit) {
        if (!kit) return 0;
        const progressMap = {
            'onboarding':  20,
            'setup':       50,
            'trial_ready': 75,
            'trial_done':  90,
            'active':      100,
            'refunded':    0
        };
        return progressMap[kit.overallStatus] || 0;
    }
}

module.exports = WelcomeKitTransitionService;
