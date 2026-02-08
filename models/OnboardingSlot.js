/**
 * models/OnboardingSlot.js
 * Slots de disponibilidad para entrevistas de bienvenida y sesiones de setup.
 * Modelo ligero independiente del sistema de clases (TimeSlot/Booking).
 * Soporta múltiples miembros del staff (escalable).
 */
const mongoose = require('mongoose');

const onboardingSlotSchema = new mongoose.Schema({
    // Quién da la entrevista/setup
    staffId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    staffName: { type: String },

    // Tipo de slot
    purpose: {
        type: String,
        enum: ['interview', 'setup'],
        required: true
    },

    // Horario (siempre UTC en BD)
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    duration: { type: Number, default: 15 }, // minutos

    // Estado del slot
    status: {
        type: String,
        enum: ['available', 'booked', 'completed', 'cancelled', 'no_show'],
        default: 'available'
    },

    // Datos de la reserva (se llenan al agendar)
    booking: {
        kitId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'WelcomeKit'
        },
        clientId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        clientName: { type: String },
        clientEmail: { type: String },
        bookedAt: { type: Date }
    },

    // Link de reunión (Google Meet, Zoom, etc.)
    meetingLink: { type: String, default: '' },

    // Timezone del staff (para display)
    timezone: { type: String, default: 'America/Santiago' },

    // Control de concurrencia
    version: { type: Number, default: 0 }
}, {
    timestamps: true
});

// Índices para consultas eficientes
// Previene doble-booking: un staff no puede tener dos slots activos al mismo tiempo
onboardingSlotSchema.index(
    { staffId: 1, startTime: 1, purpose: 1 },
    { unique: true, partialFilterExpression: { status: { $in: ['available', 'booked'] } } }
);
onboardingSlotSchema.index({ purpose: 1, status: 1, startTime: 1 });
onboardingSlotSchema.index({ 'booking.kitId': 1 });
onboardingSlotSchema.index({ 'booking.clientId': 1 });

module.exports = mongoose.model('OnboardingSlot', onboardingSlotSchema);
