/* models/TimeSlot.js */
const mongoose = require('mongoose');

/**
 * Instancia concreta de un slot de disponibilidad.
 * Representa un horario específico que puede ser reservado.
 */
const timeSlotSchema = mongoose.Schema({
    teacherId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    
    // Referencia a la plantilla que lo generó (null si fue manual)
    templateId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AvailabilityTemplate',
        default: null
    },
    
    // ==================== TIEMPO (TODO EN UTC) ====================
    startTime: {
        type: Date,
        required: true
    },
    endTime: {
        type: Date,
        required: true
    },
    duration: {
        type: Number,  // minutos
        required: true
    },
    
    // ==================== ESTADO ====================
    status: {
        type: String,
        enum: ['available', 'pending', 'booked', 'in_progress', 'completed', 'cancelled', 'no_show'],
        default: 'available'
    },
    
    // ==================== PAGO PENDIENTE (marketplace) ====================
    pendingPaymentId: {
        type: String,
        default: null  // Stripe PaymentIntent ID cuando está en pending
    },
    pendingUntil: {
        type: Date,
        default: null  // Tiempo límite para completar el pago
    },
    
    // ==================== TIPO DE CLASE ====================
    classType: {
        type: String,
        enum: ['individual', 'group'],
        default: 'individual'
    },
    maxParticipants: {
        type: Number,
        default: 1,
        min: 1
    },
    currentParticipants: {
        type: Number,
        default: 0
    },
    
    // ==================== RESERVA (cuando status !== 'available') ====================
    booking: {
        // Para clases individuales
        studentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        studentName: String,  // Cache para UI rápida
        clientId: {           // Apoderado si es menor
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        
        bookedAt: Date,
        confirmedAt: Date,
        notes: String,
        
        // Para clases grupales (array de participantes)
        participants: [{
            studentId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
            },
            studentName: String,
            clientId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
            },
            joinedAt: {
                type: Date,
                default: Date.now
            },
            status: {
                type: String,
                enum: ['pending', 'confirmed', 'cancelled'],
                default: 'confirmed'
            }
        }]
    },
    
    // ==================== SESIÓN MIDI ====================
    midiSession: {
        sessionId: String,      // UUID único para la sesión
        channelName: String,    // Canal Agora
        
        // Tokens por participante
        teacherToken: String,
        teacherUid: Number,
        
        studentTokens: [{
            odId: mongoose.Schema.Types.ObjectId,
            uid: Number,
            token: String,
            joined: Boolean,
            joinedAt: Date
        }],
        
        tokenExpiry: Date,
        roomUrl: String,        // URL completa para unirse
        
        // Configuración MIDI
        midiConfig: {
            teacherIsMaster: {
                type: Boolean,
                default: true
            },
            allowStudentMidi: {
                type: Boolean,
                default: false
            },
            syncMode: {
                type: String,
                enum: ['broadcast', 'selective', 'mirror'],
                default: 'mirror'
            }
        }
    },
    
    // ==================== METADATA ====================
    // Para optimistic locking (prevenir double-booking)
    version: {
        type: Number,
        default: 0
    },
    
    // Notas del profesor
    teacherNotes: String,
    
    // Flags
    isRecurring: {
        type: Boolean,
        default: false
    },
    recurringGroupId: String,  // Para identificar slots de una serie
    
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// ==================== ÍNDICES ====================
// Búsqueda de disponibilidad del profesor
timeSlotSchema.index({ teacherId: 1, startTime: 1, status: 1 });

// Búsqueda global de slots disponibles
timeSlotSchema.index({ startTime: 1, status: 1 });

// Reservas del estudiante
timeSlotSchema.index({ 'booking.studentId': 1, startTime: 1 });

// Prevención de double-booking (índice único parcial)
// Solo aplica a slots activos (no cancelados/completados)
timeSlotSchema.index(
    { teacherId: 1, startTime: 1 },
    { 
        unique: true, 
        partialFilterExpression: { 
            status: { $in: ['available', 'pending', 'booked', 'in_progress'] } 
        } 
    }
);

// ==================== HOOKS ====================
timeSlotSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

// ==================== MÉTODOS ====================
timeSlotSchema.methods.isAvailable = function() {
    return this.status === 'available';
};

timeSlotSchema.methods.canBeBooked = function() {
    if (this.classType === 'individual') {
        return this.status === 'available';
    }
    // Clase grupal: disponible si hay espacio
    return this.status === 'available' || 
           (this.status === 'booked' && this.currentParticipants < this.maxParticipants);
};

timeSlotSchema.methods.addParticipant = function(studentId, studentName, clientId = null) {
    if (!this.canBeBooked()) {
        throw new Error('SLOT_FULL');
    }
    
    if (this.classType === 'individual') {
        this.booking.studentId = studentId;
        this.booking.studentName = studentName;
        this.booking.clientId = clientId;
        this.booking.bookedAt = new Date();
        this.status = 'booked';
    } else {
        // Clase grupal
        this.booking.participants.push({
            studentId,
            studentName,
            clientId,
            joinedAt: new Date(),
            status: 'confirmed'
        });
        this.currentParticipants++;
        this.status = 'booked';
    }
    
    this.version++;
};

timeSlotSchema.methods.generateMidiSession = function() {
    const sessionId = `pl_${this._id}_${Date.now()}`;
    this.midiSession = {
        sessionId,
        channelName: sessionId,
        roomUrl: `/class/${sessionId}`,
        midiConfig: {
            teacherIsMaster: true,
            allowStudentMidi: false,
            syncMode: 'mirror'
        }
    };
    return this.midiSession;
};

// ==================== STATICS ====================
timeSlotSchema.statics.findAvailableForTeacher = function(teacherId, fromDate, toDate) {
    return this.find({
        teacherId,
        startTime: { $gte: fromDate, $lte: toDate },
        status: 'available'
    }).sort({ startTime: 1 });
};

timeSlotSchema.statics.findBookedForStudent = function(studentId, fromDate = null) {
    const query = {
        'booking.studentId': studentId,
        status: { $in: ['booked', 'in_progress'] }
    };
    if (fromDate) {
        query.startTime = { $gte: fromDate };
    }
    return this.find(query).sort({ startTime: 1 });
};

// Método atómico para reservar (previene race conditions)
timeSlotSchema.statics.atomicBook = async function(slotId, studentId, studentName, clientId = null) {
    const slot = await this.findOneAndUpdate(
        { 
            _id: slotId, 
            status: 'available'
        },
        { 
            $set: { 
                status: 'pending',
                'booking.studentId': studentId,
                'booking.studentName': studentName,
                'booking.clientId': clientId,
                'booking.bookedAt': new Date()
            },
            $inc: { version: 1 }
        },
        { new: true }
    );
    
    if (!slot) {
        throw new Error('SLOT_UNAVAILABLE');
    }
    
    return slot;
};

module.exports = mongoose.model('TimeSlot', timeSlotSchema);
