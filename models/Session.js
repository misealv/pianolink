/* models/Session.js */
const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
    // Identificación
    teacherId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    teacherEmail: { type: String, required: true },
    teacherName: { type: String, required: true },
    roomCode: { type: String, required: true },
    
    // Tiempo
    startTime: { type: Date, required: true, default: Date.now },
    endTime: { type: Date },
    duration: { type: Number }, // Minutos
    
    // Estudiantes
    students: [{
        socketId: String,
        name: String,
        joinTime: Date,
        leaveTime: Date,
        duration: Number, // Minutos con este estudiante
        role: String
    }],
    totalStudents: { type: Number, default: 0 },
    
    // Video y Audio
    videoStats: {
        cameraEnabled: { type: Boolean, default: false },
        cameraToggleCount: { type: Number, default: 0 },
        totalVideoTime: { type: Number, default: 0 } // Minutos
    },
    
    audioStats: {
        microphoneEnabled: { type: Boolean, default: false },
        audioModeChanges: { type: Number, default: 0 },
        modesUsed: [String], // ['MIDI_HYBRID', 'CONVERSATION', 'EMERGENCY']
        remoteMuteCommands: { type: Number, default: 0 }
    },
    
    // MIDI Activity
    midiStats: {
        notesPlayed: { type: Number, default: 0 }, // Notas enviadas por el profesor
        notesReceived: { type: Number, default: 0 }, // Notas recibidas de estudiantes
        totalMessages: { type: Number, default: 0 },
        averageNotesPerMinute: { type: Number, default: 0 },
        peakActivity: { 
            timestamp: Date,
            notesPerMinute: Number
        }
    },
    
    // Recursos Educativos
    resourcesUsed: {
        pdfsOpened: { type: Number, default: 0 },
        pdfsList: [String], // URLs de PDFs usados
        whiteboardUsed: { type: Boolean, default: false },
        annotationsCount: { type: Number, default: 0 },
        laserPointerUsed: { type: Boolean, default: false }
    },
    
    // Interacciones
    interactions: {
        chatMessagesCount: { type: Number, default: 0 },
        plbQueriesCount: { type: Number, default: 0 }, // Consultas al PLB
        plbImprovementsCount: { type: Number, default: 0 }, // Mejoras guardadas en PLB
        broadcastChanges: { type: Number, default: 0 } // Cambios de "alumno estrella"
    },
    
    // Calidad de Conexión
    connectionQuality: {
        averageLatency: { type: Number }, // ms
        reconnections: { type: Number, default: 0 },
        disconnections: { type: Number, default: 0 },
        packetsLost: { type: Number, default: 0 }
    },
    
    // Metadata
    classStatus: {
        wasActivated: { type: Boolean, default: false }, // Si se activó la clase
        endedByTeacher: { type: Boolean, default: false }, // Si el profesor cerró la clase
        crashOrTimeout: { type: Boolean, default: false } // Si terminó por error
    },
    
    // Timestamps
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
}, { 
    timestamps: true 
});

// Índices para queries eficientes
sessionSchema.index({ teacherId: 1, startTime: -1 });
sessionSchema.index({ teacherEmail: 1, startTime: -1 });
sessionSchema.index({ roomCode: 1 });
sessionSchema.index({ createdAt: -1 });

// Método para calcular duración al finalizar
sessionSchema.methods.finalize = function() {
    if (this.endTime && this.startTime) {
        this.duration = Math.round((this.endTime - this.startTime) / 1000 / 60); // Minutos
        
        // Calcular duración de cada estudiante
        this.students = this.students.map(student => {
            if (student.joinTime && student.leaveTime) {
                student.duration = Math.round((student.leaveTime - student.joinTime) / 1000 / 60);
            }
            return student;
        });
        
        // Calcular promedio de notas por minuto
        if (this.duration > 0) {
            this.midiStats.averageNotesPerMinute = Math.round(
                this.midiStats.notesPlayed / this.duration
            );
        }
    }
    this.updatedAt = Date.now();
};

// Método estático para obtener estadísticas de un profesor
sessionSchema.statics.getTeacherStats = async function(teacherId, startDate, endDate) {
    const query = { teacherId };
    if (startDate) query.startTime = { $gte: startDate };
    if (endDate) query.endTime = { $lte: endDate };
    
    const sessions = await this.find(query);
    
    return {
        totalSessions: sessions.length,
        totalDuration: sessions.reduce((sum, s) => sum + (s.duration || 0), 0),
        totalStudents: sessions.reduce((sum, s) => sum + s.totalStudents, 0),
        averageSessionDuration: sessions.length > 0 
            ? Math.round(sessions.reduce((sum, s) => sum + (s.duration || 0), 0) / sessions.length)
            : 0,
        totalNotesPlayed: sessions.reduce((sum, s) => sum + s.midiStats.notesPlayed, 0),
        videoUsageRate: sessions.filter(s => s.videoStats.cameraEnabled).length / sessions.length * 100,
        plbUsageCount: sessions.reduce((sum, s) => sum + s.interactions.plbQueriesCount, 0),
        averageStudentsPerSession: sessions.length > 0
            ? sessions.reduce((sum, s) => sum + s.totalStudents, 0) / sessions.length
            : 0,
        lastSession: sessions.length > 0 ? sessions[sessions.length - 1].startTime : null
    };
};

module.exports = mongoose.model('Session', sessionSchema);
