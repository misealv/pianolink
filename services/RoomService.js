/**
 * services/RoomService.js
 * Gestión de Salas Persistentes - PianoLink v2.0
 */

const Room = require('../models/Room');
const Enrollment = require('../models/Enrollment');

class RoomService {
    
    /**
     * Crear o obtener sala para un profesor
     * Cada profesor tiene UNA sala (por ahora)
     */
    static async getOrCreateRoom(teacherId, teacherName) {
        let room = await Room.findByTeacher(teacherId);
        
        if (!room) {
            const code = this.generateCode();
            room = await Room.create({
                code,
                teacherId,
                name: `Sala de ${teacherName}`
            });
            console.log(`[RoomService] Nueva sala creada: ${code} para ${teacherName}`);
        }
        
        return room;
    }

    /**
     * Obtener sala por código
     */
    static async getRoomByCode(code) {
        return Room.findByCode(code);
    }

    /**
     * Marcar sala como "en vivo" (profesor conectado)
     */
    static async setLive(roomId, isLive = true) {
        return Room.findByIdAndUpdate(roomId, {
            isLive,
            lastActivityAt: new Date()
        }, { new: true });
    }

    /**
     * Actualizar actividad de la sala
     */
    static async updateActivity(roomId) {
        return Room.findByIdAndUpdate(roomId, {
            lastActivityAt: new Date()
        });
    }

    /**
     * Guardar estado del PDF actual
     */
    static async setCurrentPDF(roomId, pdfData, userId) {
        return Room.findByIdAndUpdate(roomId, {
            currentPDF: {
                ...pdfData,
                loadedBy: userId,
                loadedAt: new Date()
            },
            lastActivityAt: new Date()
        }, { new: true });
    }

    /**
     * Obtener estado del PDF actual
     */
    static async getCurrentPDF(roomId) {
        const room = await Room.findById(roomId).select('currentPDF');
        return room?.currentPDF || null;
    }

    /**
     * Guardar estado del piano
     */
    static async savePianoState(roomId, pianoState) {
        return Room.findByIdAndUpdate(roomId, {
            pianoState,
            lastActivityAt: new Date()
        });
    }

    /**
     * Agregar PDF a la biblioteca
     */
    static async addToLibrary(roomId, pdfData, userId) {
        return Room.findByIdAndUpdate(roomId, {
            $push: {
                library: {
                    ...pdfData,
                    uploadedBy: userId,
                    uploadedAt: new Date()
                }
            },
            lastActivityAt: new Date()
        }, { new: true });
    }

    /**
     * Eliminar PDF de la biblioteca
     */
    static async removeFromLibrary(roomId, pdfId) {
        return Room.findByIdAndUpdate(roomId, {
            $pull: { library: { _id: pdfId } }
        }, { new: true });
    }

    /**
     * Obtener biblioteca de la sala
     */
    static async getLibrary(roomId) {
        const room = await Room.findById(roomId).select('library');
        return room?.library || [];
    }

    /**
     * Limpiar salas inactivas (para cron job)
     */
    static async cleanupInactiveRooms(days = 30) {
        const rooms = await Room.getInactiveRooms(days);
        
        let cleaned = 0;
        for (const room of rooms) {
            await room.cleanupState();
            cleaned++;
        }
        
        console.log(`[RoomService] Limpiadas ${cleaned} salas inactivas`);
        return cleaned;
    }

    /**
     * Generar código único de sala
     */
    static generateCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Sin I, O, 0, 1 para evitar confusión
        let code = '';
        for (let i = 0; i < 4; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    }

    /**
     * Verificar si un usuario puede acceder a una sala
     */
    static async canAccess(userId, userRole, roomCode) {
        const room = await Room.findByCode(roomCode);
        if (!room) return { allowed: false, reason: 'ROOM_NOT_FOUND' };

        // Profesor: solo puede acceder a SU sala
        if (userRole === 'teacher' || userRole === 'admin') {
            const isOwner = room.teacherId.toString() === userId.toString();
            return { 
                allowed: isOwner, 
                reason: isOwner ? 'OWNER' : 'NOT_OWNER',
                room 
            };
        }

        // Alumno registrado: verificar enrollment
        const enrollment = await Enrollment.findOne({
            studentId: userId,
            roomId: room._id,
            status: 'active'
        });

        if (enrollment) {
            return { allowed: true, reason: 'ENROLLED', room };
        }

        // Invitado: solo si el profesor está en vivo
        if (room.isLive && room.settings.allowGuestAccess) {
            return { allowed: true, reason: 'GUEST', room };
        }

        return { 
            allowed: false, 
            reason: room.isLive ? 'GUEST_NOT_ALLOWED' : 'TEACHER_NOT_PRESENT',
            room
        };
    }
}

module.exports = RoomService;
