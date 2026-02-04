/* services/BookingService.js */
const mongoose = require('mongoose');
const TimeSlot = require('../models/TimeSlot');
const Booking = require('../models/Booking');
const User = require('../models/User');

/**
 * Servicio para gestionar reservas de clases.
 * Implementa transacciones atómicas para prevenir double-booking.
 */
class BookingService {
    
    /**
     * Reserva un slot para un estudiante.
     * Usa transacción MongoDB para garantizar atomicidad.
     * 
     * @param {ObjectId} slotId - ID del TimeSlot
     * @param {ObjectId} studentId - ID del estudiante
     * @param {ObjectId} clientId - ID del apoderado (opcional)
     * @param {String} studentTimezone - Timezone del estudiante
     * @returns {Object} { booking, slot, joinUrl }
     */
    static async bookSlot(slotId, studentId, clientId = null, studentTimezone = 'America/Santiago') {
        const session = await mongoose.startSession();
        session.startTransaction();
        
        try {
            // 1. Obtener el slot de forma atómica
            const slot = await TimeSlot.findOneAndUpdate(
                { 
                    _id: slotId, 
                    status: 'available'
                },
                { 
                    $set: { 
                        status: 'pending',
                        'booking.studentId': studentId,
                        'booking.clientId': clientId,
                        'booking.bookedAt': new Date()
                    },
                    $inc: { version: 1 }
                },
                { new: true, session }
            ).populate('teacherId', 'name timezone');
            
            if (!slot) {
                await session.abortTransaction();
                throw new Error('SLOT_UNAVAILABLE');
            }
            
            // 2. Verificar saldo de clases
            const payerId = clientId || studentId;
            const payer = await User.findById(payerId).session(session);
            
            if (!payer) {
                await session.abortTransaction();
                throw new Error('USER_NOT_FOUND');
            }
            
            // Calcular clases disponibles (del pagador)
            let availableClasses = 0;
            if (payer.role === 'client' && payer.clientData?.accountType === 'guardian') {
                // Buscar clases del estudiante específico en managedStudents
                const student = await User.findById(studentId);
                const managedStudent = payer.clientData.managedStudents?.find(
                    s => s.name.toLowerCase() === student?.name?.toLowerCase()
                );
                availableClasses = managedStudent?.classesRemaining || 0;
            } else {
                availableClasses = payer.classesRemaining || 0;
            }
            
            if (availableClasses <= 0) {
                // Revertir el slot a disponible
                await TimeSlot.findByIdAndUpdate(slotId, {
                    status: 'available',
                    $unset: { booking: 1 }
                }, { session });
                
                await session.abortTransaction();
                throw new Error('INSUFFICIENT_CLASSES');
            }
            
            // 3. Descontar clase del saldo
            if (payer.role === 'client' && payer.clientData?.accountType === 'guardian') {
                // Descontar del estudiante específico
                const student = await User.findById(studentId).select('name');
                const studentName = student?.name?.toLowerCase() || '';
                const studentIndex = payer.clientData.managedStudents.findIndex(
                    s => s.name.toLowerCase() === studentName
                );
                if (studentIndex >= 0) {
                    payer.clientData.managedStudents[studentIndex].classesRemaining--;
                    payer.markModified('clientData.managedStudents');
                }
            } else {
                payer.classesRemaining--;
            }
            await payer.save({ session });
            
            // 4. Obtener info del estudiante
            const student = await User.findById(studentId).select('name timezone');
            
            // 5. Actualizar slot a booked y generar sesión MIDI
            slot.status = 'booked';
            slot.booking.studentName = student.name;
            slot.booking.confirmedAt = new Date();
            slot.generateMidiSession();
            await slot.save({ session });
            
            // 6. Crear registro de Booking
            const booking = await Booking.create([{
                slotId: slot._id,
                teacherId: slot.teacherId._id,
                studentId,
                clientId,
                scheduledStart: slot.startTime,
                scheduledEnd: slot.endTime,
                duration: slot.duration,
                teacherTimezone: slot.teacherId.timezone || 'America/Santiago',
                studentTimezone,
                status: 'confirmed',
                classConsumed: true,
                midiSessionId: slot.midiSession.sessionId,
                statusHistory: [{
                    status: 'confirmed',
                    changedAt: new Date()
                }]
            }], { session });
            
            // 7. Commit
            await session.commitTransaction();
            
            // 8. Enviar notificaciones (async, fuera de transacción)
            this._sendBookingNotifications(booking[0], slot, student);
            
            return {
                success: true,
                booking: booking[0],
                slot,
                joinUrl: slot.midiSession.roomUrl
            };
            
        } catch (error) {
            await session.abortTransaction();
            throw error;
        } finally {
            session.endSession();
        }
    }
    
    /**
     * Cancela una reserva.
     * @param {ObjectId} bookingId 
     * @param {ObjectId} cancelledBy - Quien cancela (profesor o estudiante)
     * @param {String} reason 
     * @returns {Object}
     */
    static async cancelBooking(bookingId, cancelledBy, reason = '') {
        const session = await mongoose.startSession();
        session.startTransaction();
        
        try {
            const booking = await Booking.findById(bookingId).session(session);
            
            if (!booking) {
                throw new Error('BOOKING_NOT_FOUND');
            }
            
            if (!booking.canBeCancelled()) {
                throw new Error('CANNOT_CANCEL');
            }
            
            // Calcular si debe reembolsar clases (24h antes = sí)
            const hoursUntilClass = (booking.scheduledStart - new Date()) / (1000 * 60 * 60);
            const refundClasses = hoursUntilClass >= 24;
            
            // Actualizar booking
            booking.cancel(cancelledBy, reason, refundClasses);
            await booking.save({ session });
            
            // Liberar el slot
            await TimeSlot.findByIdAndUpdate(booking.slotId, {
                status: 'available',
                $unset: { booking: 1, midiSession: 1 }
            }, { session });
            
            // Reembolsar clase si aplica
            if (refundClasses) {
                const payerId = booking.clientId || booking.studentId;
                const payer = await User.findById(payerId).session(session);
                
                if (payer.role === 'client' && payer.clientData?.accountType === 'guardian') {
                    const student = await User.findById(booking.studentId);
                    const studentIndex = payer.clientData.managedStudents.findIndex(
                        s => s.name.toLowerCase() === student?.name?.toLowerCase()
                    );
                    if (studentIndex >= 0) {
                        payer.clientData.managedStudents[studentIndex].classesRemaining++;
                        payer.markModified('clientData.managedStudents');
                    }
                } else {
                    payer.classesRemaining++;
                }
                await payer.save({ session });
            }
            
            await session.commitTransaction();
            
            return {
                success: true,
                refunded: refundClasses,
                booking
            };
            
        } catch (error) {
            await session.abortTransaction();
            throw error;
        } finally {
            session.endSession();
        }
    }
    
    /**
     * Obtiene las próximas reservas de un estudiante.
     */
    static async getUpcomingBookings(studentId, limit = 10) {
        return Booking.getUpcomingForStudent(studentId, limit);
    }
    
    /**
     * Obtiene el historial de clases de un estudiante.
     */
    static async getBookingHistory(studentId, page = 1, limit = 20) {
        return Booking.getHistoryForStudent(studentId, page, limit);
    }
    
    /**
     * Marca una clase como iniciada.
     */
    static async startClass(bookingId, teacherId) {
        const booking = await Booking.findOne({
            _id: bookingId,
            teacherId,
            status: 'confirmed'
        });
        
        if (!booking) {
            throw new Error('BOOKING_NOT_FOUND');
        }
        
        booking.status = 'in_progress';
        booking.actualStart = new Date();
        booking.sessionMetrics = {
            teacherJoinedAt: new Date()
        };
        await booking.save();
        
        // Actualizar slot
        await TimeSlot.findByIdAndUpdate(booking.slotId, {
            status: 'in_progress'
        });
        
        return booking;
    }
    
    /**
     * Marca una clase como completada.
     */
    static async completeClass(bookingId, teacherId, notes = '', topics = []) {
        const booking = await Booking.findOne({
            _id: bookingId,
            teacherId,
            status: 'in_progress'
        });
        
        if (!booking) {
            throw new Error('BOOKING_NOT_FOUND');
        }
        
        booking.markAsCompleted();
        booking.teacherNotes = notes;
        booking.topics = topics;
        await booking.save();
        
        // Actualizar slot
        await TimeSlot.findByIdAndUpdate(booking.slotId, {
            status: 'completed'
        });
        
        return booking;
    }
    
    /**
     * Envía notificaciones de reserva (email, push).
     * @private
     */
    static async _sendBookingNotifications(booking, slot, student) {
        // TODO: Implementar con servicio de email
        console.log(`📧 Notificación: Clase reservada para ${student.name}`);
        console.log(`   Fecha: ${booking.scheduledStart}`);
        console.log(`   Sesión: ${slot.midiSession.sessionId}`);
    }
}

module.exports = BookingService;
