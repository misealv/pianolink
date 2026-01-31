/* services/SessionTracker.js */
const Session = require('../models/Session');

class SessionTracker {
    constructor() {
        // Sesiones activas en memoria (roomCode -> sessionDoc)
        this.activeSessions = new Map();
        
        // Buffers para eventos MIDI (para calcular peak activity)
        this.midiBuffers = new Map(); // roomCode -> [{timestamp, count}]
        
        console.log('[SessionTracker] 📊 Servicio inicializado');
    }
    
    /**
     * Inicia una nueva sesión cuando un profesor crea una sala
     */
    async startSession(roomCode, teacherData) {
        try {
            const session = new Session({
                teacherId: teacherData.userId,
                teacherEmail: teacherData.email,
                teacherName: teacherData.name,
                roomCode: roomCode,
                startTime: new Date(),
                students: [],
                totalStudents: 0
            });
            
            await session.save();
            this.activeSessions.set(roomCode, session);
            this.midiBuffers.set(roomCode, []);
            
            console.log(`[SessionTracker] ✅ Sesión iniciada: ${roomCode} - ${teacherData.name}`);
            return session;
        } catch (error) {
            console.error('[SessionTracker] Error iniciando sesión:', error);
            return null;
        }
    }
    
    /**
     * Registra que un estudiante se unió
     */
    async addStudent(roomCode, studentData) {
        const session = this.activeSessions.get(roomCode);
        if (!session) return;
        
        try {
            session.students.push({
                socketId: studentData.socketId,
                name: studentData.name,
                joinTime: new Date(),
                role: studentData.role || 'student'
            });
            
            session.totalStudents = Math.max(session.totalStudents, session.students.length);
            await session.save();
            
            console.log(`[SessionTracker] 👤 Estudiante unido: ${studentData.name} -> ${roomCode}`);
        } catch (error) {
            console.error('[SessionTracker] Error agregando estudiante:', error);
        }
    }
    
    /**
     * Registra que un estudiante salió
     */
    async removeStudent(roomCode, socketId) {
        const session = this.activeSessions.get(roomCode);
        if (!session) return;
        
        try {
            const student = session.students.find(s => s.socketId === socketId);
            if (student && !student.leaveTime) {
                student.leaveTime = new Date();
                student.duration = Math.round((student.leaveTime - student.joinTime) / 1000 / 60);
                await session.save();
                
                console.log(`[SessionTracker] 👋 Estudiante salió: ${student.name}`);
            }
        } catch (error) {
            console.error('[SessionTracker] Error removiendo estudiante:', error);
        }
    }
    
    /**
     * Registra actividad MIDI
     */
    async trackMidi(roomCode, direction, count = 1) {
        const session = this.activeSessions.get(roomCode);
        if (!session) return;
        
        try {
            if (direction === 'sent') {
                session.midiStats.notesPlayed += count;
            } else if (direction === 'received') {
                session.midiStats.notesReceived += count;
            }
            
            session.midiStats.totalMessages += count;
            
            // Buffer para calcular peak activity
            const buffer = this.midiBuffers.get(roomCode) || [];
            buffer.push({ timestamp: Date.now(), count });
            
            // Mantener solo últimos 60 segundos
            const oneMinuteAgo = Date.now() - 60000;
            const recentNotes = buffer.filter(b => b.timestamp > oneMinuteAgo);
            this.midiBuffers.set(roomCode, recentNotes);
            
            // Calcular notas por minuto actual
            const notesPerMinute = recentNotes.reduce((sum, b) => sum + b.count, 0);
            
            // Actualizar peak si es mayor
            if (!session.midiStats.peakActivity || 
                notesPerMinute > session.midiStats.peakActivity.notesPerMinute) {
                session.midiStats.peakActivity = {
                    timestamp: new Date(),
                    notesPerMinute
                };
            }
            
            // Guardar cada 10 mensajes MIDI para no sobrecargar la BD
            if (session.midiStats.totalMessages % 10 === 0) {
                await session.save();
            }
        } catch (error) {
            console.error('[SessionTracker] Error tracking MIDI:', error);
        }
    }
    
    /**
     * Registra uso de video
     */
    async trackVideo(roomCode, enabled) {
        const session = this.activeSessions.get(roomCode);
        if (!session) return;
        
        try {
            session.videoStats.cameraEnabled = enabled;
            session.videoStats.cameraToggleCount++;
            await session.save();
            
            console.log(`[SessionTracker] 📹 Video ${enabled ? 'ON' : 'OFF'}: ${roomCode}`);
        } catch (error) {
            console.error('[SessionTracker] Error tracking video:', error);
        }
    }
    
    /**
     * Registra cambio de modo de audio
     */
    async trackAudioMode(roomCode, mode) {
        const session = this.activeSessions.get(roomCode);
        if (!session) return;
        
        try {
            session.audioStats.audioModeChanges++;
            
            if (!session.audioStats.modesUsed.includes(mode)) {
                session.audioStats.modesUsed.push(mode);
            }
            
            await session.save();
            
            console.log(`[SessionTracker] 🔊 Modo audio cambiado: ${mode} -> ${roomCode}`);
        } catch (error) {
            console.error('[SessionTracker] Error tracking audio mode:', error);
        }
    }
    
    /**
     * Registra mute remoto
     */
    async trackRemoteMute(roomCode) {
        const session = this.activeSessions.get(roomCode);
        if (!session) return;
        
        try {
            session.audioStats.remoteMuteCommands++;
            await session.save();
        } catch (error) {
            console.error('[SessionTracker] Error tracking remote mute:', error);
        }
    }
    
    /**
     * Registra uso de PDF
     */
    async trackPDF(roomCode, pdfUrl) {
        const session = this.activeSessions.get(roomCode);
        if (!session) return;
        
        try {
            session.resourcesUsed.pdfsOpened++;
            
            if (!session.resourcesUsed.pdfsList.includes(pdfUrl)) {
                session.resourcesUsed.pdfsList.push(pdfUrl);
            }
            
            await session.save();
            
            console.log(`[SessionTracker] 📄 PDF abierto: ${roomCode}`);
        } catch (error) {
            console.error('[SessionTracker] Error tracking PDF:', error);
        }
    }
    
    /**
     * Registra uso de pizarra
     */
    async trackWhiteboard(roomCode) {
        const session = this.activeSessions.get(roomCode);
        if (!session) return;
        
        try {
            session.resourcesUsed.whiteboardUsed = true;
            session.resourcesUsed.annotationsCount++;
            await session.save();
        } catch (error) {
            console.error('[SessionTracker] Error tracking whiteboard:', error);
        }
    }
    
    /**
     * Registra uso de láser
     */
    async trackLaser(roomCode) {
        const session = this.activeSessions.get(roomCode);
        if (!session) return;
        
        try {
            session.resourcesUsed.laserPointerUsed = true;
            await session.save();
        } catch (error) {
            console.error('[SessionTracker] Error tracking laser:', error);
        }
    }
    
    /**
     * Registra consulta al PLB
     */
    async trackPLBQuery(roomCode) {
        const session = this.activeSessions.get(roomCode);
        if (!session) return;
        
        try {
            session.interactions.plbQueriesCount++;
            await session.save();
        } catch (error) {
            console.error('[SessionTracker] Error tracking PLB query:', error);
        }
    }
    
    /**
     * Registra mejora guardada en PLB
     */
    async trackPLBImprovement(roomCode) {
        const session = this.activeSessions.get(roomCode);
        if (!session) return;
        
        try {
            session.interactions.plbImprovementsCount++;
            await session.save();
        } catch (error) {
            console.error('[SessionTracker] Error tracking PLB improvement:', error);
        }
    }
    
    /**
     * Registra cambio de broadcaster
     */
    async trackBroadcasterChange(roomCode) {
        const session = this.activeSessions.get(roomCode);
        if (!session) return;
        
        try {
            session.interactions.broadcastChanges++;
            await session.save();
        } catch (error) {
            console.error('[SessionTracker] Error tracking broadcaster:', error);
        }
    }
    
    /**
     * Registra activación de la clase
     */
    async trackClassActivation(roomCode) {
        const session = this.activeSessions.get(roomCode);
        if (!session) return;
        
        try {
            session.classStatus.wasActivated = true;
            await session.save();
            
            console.log(`[SessionTracker] ✅ Clase activada: ${roomCode}`);
        } catch (error) {
            console.error('[SessionTracker] Error tracking class activation:', error);
        }
    }
    
    /**
     * Registra reconexión
     */
    async trackReconnection(roomCode) {
        const session = this.activeSessions.get(roomCode);
        if (!session) return;
        
        try {
            session.connectionQuality.reconnections++;
            await session.save();
        } catch (error) {
            console.error('[SessionTracker] Error tracking reconnection:', error);
        }
    }
    
    /**
     * Finaliza una sesión
     */
    async endSession(roomCode, endedByTeacher = false, crashed = false) {
        const session = this.activeSessions.get(roomCode);
        if (!session) return;
        
        try {
            session.endTime = new Date();
            session.classStatus.endedByTeacher = endedByTeacher;
            session.classStatus.crashOrTimeout = crashed;
            
            // Marcar estudiantes restantes como salidos
            session.students.forEach(student => {
                if (!student.leaveTime) {
                    student.leaveTime = session.endTime;
                    student.duration = Math.round((student.leaveTime - student.joinTime) / 1000 / 60);
                }
            });
            
            // Calcular métricas finales
            session.finalize();
            
            await session.save();
            
            this.activeSessions.delete(roomCode);
            this.midiBuffers.delete(roomCode);
            
            console.log(`[SessionTracker] ⏹️ Sesión finalizada: ${roomCode} - Duración: ${session.duration}min`);
            return session;
        } catch (error) {
            console.error('[SessionTracker] Error finalizando sesión:', error);
            return null;
        }
    }
    
    /**
     * Obtiene sesión activa
     */
    getActiveSession(roomCode) {
        return this.activeSessions.get(roomCode);
    }
    
    /**
     * Obtiene todas las sesiones activas
     */
    getActiveSessions() {
        return Array.from(this.activeSessions.values());
    }
}

// Exportar instancia única (singleton)
module.exports = new SessionTracker();
