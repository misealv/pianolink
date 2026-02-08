/* services/BookingService.js */
const mongoose = require('mongoose');
const TimeSlot = require('../models/TimeSlot');
const Booking = require('../models/Booking');
const User = require('../models/User');
const ClassSession = require('../models/ClassSession');
const StudentSubscription = require('../models/StudentSubscription');

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
        
        let transactionCommitted = false;
        
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
                throw new Error('SLOT_UNAVAILABLE');
            }
            
            const teacherId = slot.teacherId._id;
            const payerId = clientId || studentId;
            const payer = await User.findById(payerId).session(session);
            
            if (!payer) {
                throw new Error('USER_NOT_FOUND');
            }
            
            // 2. PRIORIDAD: Verificar suscripción activa con este profesor
            let subscription = null;
            let availableClasses = 0;
            let managedStudentIndex = -1;
            let studentName = '';
            let useSubscription = false;
            
            // Buscar suscripción activa con el profesor de este slot
            subscription = await StudentSubscription.findOne({
                studentId: payerId,
                teacherId: teacherId,
                status: 'active',
                classesRemaining: { $gt: 0 },
                validUntil: { $gt: new Date() }
            }).session(session);
            
            if (subscription) {
                // Usar suscripción
                useSubscription = true;
                availableClasses = subscription.classesRemaining;
                studentName = payer.name;
                console.log(`[BookingService] Usando suscripción ${subscription._id} con ${availableClasses} clases restantes`);
            } else {
                // Fallback: sistema legacy de clases sueltas
                if (payer.role === 'client' && payer.clientData?.accountType === 'guardian') {
                    // Para guardians, studentId puede ser:
                    // 1. El _id del subdocumento managedStudent
                    // 2. El nombre del estudiante
                    const managedStudents = payer.clientData.managedStudents || [];
                    
                    // Buscar por _id del subdocumento primero
                    managedStudentIndex = managedStudents.findIndex(
                        s => s._id && s._id.toString() === studentId?.toString()
                    );
                    
                    // Si no encontró por ID, buscar por nombre
                    if (managedStudentIndex === -1 && studentId) {
                        managedStudentIndex = managedStudents.findIndex(
                            s => s.name?.toLowerCase() === studentId?.toLowerCase()
                        );
                    }
                    
                    // Si todavía no encontró y solo hay un estudiante, usar ese
                    if (managedStudentIndex === -1 && managedStudents.length === 1) {
                        managedStudentIndex = 0;
                    }
                    
                    if (managedStudentIndex >= 0) {
                        availableClasses = managedStudents[managedStudentIndex].classesRemaining || 0;
                        studentName = managedStudents[managedStudentIndex].name;
                    }
                } else {
                    availableClasses = payer.classesRemaining || 0;
                    studentName = payer.name;
                }
            }
            
            if (availableClasses <= 0) {
                throw new Error('INSUFFICIENT_CLASSES');
            }
            
            // 3. Descontar clase del saldo correspondiente
            if (useSubscription) {
                // Descontar de la suscripción
                subscription.classesRemaining--;
                if (subscription.classesRemaining <= 0) {
                    subscription.status = 'exhausted';
                }
                await subscription.save({ session });
                console.log(`[BookingService] Clase descontada de suscripción. Restantes: ${subscription.classesRemaining}`);
            } else if (payer.role === 'client' && payer.clientData?.accountType === 'guardian' && managedStudentIndex >= 0) {
                payer.clientData.managedStudents[managedStudentIndex].classesRemaining--;
                payer.clientData.managedStudents[managedStudentIndex].classesUsed = 
                    (payer.clientData.managedStudents[managedStudentIndex].classesUsed || 0) + 1;
                payer.markModified('clientData.managedStudents');
                await payer.save({ session });
            } else {
                payer.classesRemaining--;
                await payer.save({ session });
            }
            
            // 4. Actualizar slot a booked y generar sesión MIDI
            slot.status = 'booked';
            slot.booking.studentName = studentName;
            slot.booking.confirmedAt = new Date();
            slot.generateMidiSession();
            await slot.save({ session });
            
            // 5. Crear registro de Booking
            const booking = await Booking.create([{
                slotId: slot._id,
                teacherId: teacherId,
                studentId: payerId, // Guardar el ID del pagador como referencia
                clientId,
                subscriptionId: useSubscription ? subscription._id : null, // Referencia a suscripción si aplica
                studentName, // Guardar el nombre del estudiante
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
            
            // 6. Commit
            await session.commitTransaction();
            transactionCommitted = true;
            
            // 7. Enviar notificaciones (async, fuera de transacción)
            this._sendBookingNotifications(booking[0], slot, { name: studentName });
            
            return {
                success: true,
                booking: booking[0],
                slot,
                joinUrl: slot.midiSession.roomUrl
            };
            
        } catch (error) {
            if (!transactionCommitted) {
                await session.abortTransaction();
            }
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
                // PRIORIDAD: Si la reserva usó suscripción, devolver ahí
                if (booking.subscriptionId) {
                    const subscription = await StudentSubscription.findById(booking.subscriptionId).session(session);
                    if (subscription) {
                        subscription.classesRemaining++;
                        // Si estaba exhausted, reactivar
                        if (subscription.status === 'exhausted' && subscription.validUntil > new Date()) {
                            subscription.status = 'active';
                        }
                        await subscription.save({ session });
                        console.log(`[BookingService] Clase devuelta a suscripción ${subscription._id}. Restantes: ${subscription.classesRemaining}`);
                    }
                } else {
                    // Fallback: sistema legacy
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
     * Si hay una suscripción activa, crea ClassSession para validación y pago.
     */
    static async completeClass(bookingId, teacherId, notes = '', topics = []) {
        const booking = await Booking.findOne({
            _id: bookingId,
            teacherId,
            status: 'in_progress'
        }).populate('studentId', 'name email');
        
        if (!booking) {
            throw new Error('BOOKING_NOT_FOUND');
        }
        
        booking.markAsCompleted();
        booking.teacherNotes = notes;
        booking.topics = topics;
        
        // Para clases de prueba, marcar como pendiente de calificación
        if (booking.bookingType === 'trial') {
            booking.trialCompletedAt = new Date();
            booking.trialPendingRating = true;
        }
        
        await booking.save();
        
        // Actualizar slot
        await TimeSlot.findByIdAndUpdate(booking.slotId, {
            status: 'completed'
        });

        // === SI ES CLASE TRIAL, ACTUALIZAR WELCOME KIT ===
        if (booking.bookingType === 'trial') {
            try {
                const WelcomeKit = require('../models/WelcomeKit');
                // Buscar WelcomeKit por clientId (el estudiante)
                const kit = await WelcomeKit.findOne({
                    clientId: booking.clientId || booking.studentId,
                    overallStatus: 'trial_available'
                });
                
                if (kit) {
                    kit.overallStatus = 'trial_completed';
                    kit.trialClass = {
                        bookingId: booking._id,
                        teacherId: booking.teacherId,
                        completedAt: new Date(),
                        notes: notes
                    };
                    await kit.save();
                    console.log(`[BookingService] WelcomeKit ${kit._id} actualizado a trial_completed`);
                }
            } catch (err) {
                console.error('[BookingService] Error actualizando WelcomeKit:', err.message);
            }
        }

        // === CREAR CLASS SESSION SI HAY SUSCRIPCIÓN ===
        try {
            // Usar subscriptionId del booking si existe, sino buscar
            let subscription = null;
            if (booking.subscriptionId) {
                subscription = await StudentSubscription.findById(booking.subscriptionId);
            } else {
                subscription = await StudentSubscription.findOne({
                    studentId: booking.studentId,
                    teacherId: booking.teacherId,
                    status: { $in: ['active', 'paused', 'exhausted'] }
                });
            }

            if (subscription) {
                // Verificar que no exista ya una sesión
                const existingSession = await ClassSession.findOne({ bookingId: booking._id });
                
                if (!existingSession) {
                    // Calcular montos (80% profesor, 20% plataforma)
                    const pricePerClass = Math.round(subscription.totalPaidUSD / subscription.classesTotal);
                    const platformFee = Math.round(pricePerClass * 0.20);
                    const teacherPayout = pricePerClass - platformFee;

                    const session = new ClassSession({
                        subscriptionId: subscription._id,
                        bookingId: booking._id,
                        studentId: booking.studentId,
                        teacherId: booking.teacherId,
                        
                        scheduledAt: booking.scheduledStart,
                        startedAt: booking.actualStart,
                        endedAt: new Date(),
                        durationMinutes: booking.actualDuration || booking.duration,
                        
                        category: subscription.category,
                        status: 'pending-validation',
                        
                        teacherMarkedComplete: true,
                        teacherMarkedAt: new Date(),
                        teacherNotes: notes,
                        
                        // Auto-confirmar en 48h si estudiante no responde
                        autoConfirmAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
                        disputeWindowEndsAt: new Date(Date.now() + 96 * 60 * 60 * 1000),
                        
                        pricePerClassUSD: pricePerClass,
                        teacherPayoutUSD: teacherPayout,
                        platformFeeUSD: platformFee
                    });

                    await session.save();
                    console.log(`[BookingService] ClassSession creada: ${session._id} para booking ${booking._id}`);
                }
            }
        } catch (err) {
            // No fallar la operación principal si la creación de session falla
            console.error('[BookingService] Error creando ClassSession:', err.message);
        }
        
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

    /**
     * Cancelación por profesor (sin restricción de 24h).
     * El profesor puede cancelar en cualquier momento.
     * @param {ObjectId} bookingId 
     * @param {ObjectId} teacherId 
     * @param {String} reason 
     * @returns {Object}
     */
    static async cancelByTeacher(bookingId, teacherId, reason = '') {
        const session = await mongoose.startSession();
        session.startTransaction();
        
        try {
            const booking = await Booking.findOne({
                _id: bookingId,
                teacherId,
                status: { $in: ['pending', 'confirmed'] }
            }).session(session);
            
            if (!booking) {
                throw new Error('BOOKING_NOT_FOUND');
            }
            
            // Siempre reembolsamos cuando el profesor cancela
            booking.cancel(teacherId, `[Profesor] ${reason}`, true);
            await booking.save({ session });
            
            // Liberar el slot
            await TimeSlot.findByIdAndUpdate(booking.slotId, {
                status: 'available',
                $unset: { booking: 1, midiSession: 1 }
            }, { session });
            
            // Reembolsar clase (priorizar suscripción si aplica)
            if (booking.subscriptionId) {
                const subscription = await StudentSubscription.findById(booking.subscriptionId).session(session);
                if (subscription) {
                    subscription.classesRemaining++;
                    // Además, el profesor debe una clase de compensación por cancelar
                    subscription.classesCancelledByTeacher = (subscription.classesCancelledByTeacher || 0) + 1;
                    subscription.compensationClassesOwed = (subscription.compensationClassesOwed || 0) + 1;
                    if (subscription.status === 'exhausted' && subscription.validUntil > new Date()) {
                        subscription.status = 'active';
                    }
                    await subscription.save({ session });
                    console.log(`[BookingService] Clase devuelta a suscripción por cancelación del profesor. Compensación adeudada: ${subscription.compensationClassesOwed}`);
                }
            } else {
                // Fallback: sistema legacy
                const payerId = booking.clientId || booking.studentId;
                const payer = await User.findById(payerId).session(session);
                
                if (payer) {
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
            }
            
            await session.commitTransaction();
            
            console.log(`📧 Notificación: Clase cancelada por profesor`);
            console.log(`   Booking: ${bookingId}`);
            console.log(`   Clase reembolsada: Sí`);
            
            return {
                success: true,
                refunded: true,
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
     * Reagendar una reserva a otro horario.
     * Solo permitido con 24h de anticipación.
     * @param {ObjectId} bookingId 
     * @param {ObjectId} newSlotId 
     * @param {ObjectId} userId - Quien reagenda
     * @returns {Object}
     */
    static async rescheduleBooking(bookingId, newSlotId, userId) {
        const session = await mongoose.startSession();
        session.startTransaction();
        
        try {
            // 1. Obtener la reserva actual
            const booking = await Booking.findById(bookingId).session(session);
            
            if (!booking) {
                throw new Error('BOOKING_NOT_FOUND');
            }
            
            // 2. Verificar que se puede reagendar (24h antes)
            if (!booking.canBeCancelled()) {
                throw new Error('CANNOT_RESCHEDULE_LESS_THAN_24H');
            }
            
            // 3. Intentar reservar el nuevo slot
            const newSlot = await TimeSlot.findOneAndUpdate(
                { 
                    _id: newSlotId, 
                    status: 'available',
                    teacherId: booking.teacherId
                },
                { 
                    $set: { 
                        status: 'booked',
                        'booking.studentId': booking.studentId,
                        'booking.clientId': booking.clientId,
                        'booking.bookedAt': new Date(),
                        'booking.studentName': booking.studentName,
                        'booking.confirmedAt': new Date()
                    },
                    $inc: { version: 1 }
                },
                { new: true, session }
            );
            
            if (!newSlot) {
                throw new Error('NEW_SLOT_UNAVAILABLE');
            }
            
            // 4. Generar sesión MIDI para el nuevo slot
            newSlot.generateMidiSession();
            await newSlot.save({ session });
            
            // 5. Liberar el slot antiguo
            await TimeSlot.findByIdAndUpdate(booking.slotId, {
                status: 'available',
                $unset: { booking: 1, midiSession: 1 }
            }, { session });
            
            // 6. Actualizar el booking con los nuevos datos
            const oldDate = booking.scheduledStart;
            booking.slotId = newSlot._id;
            booking.scheduledStart = newSlot.startTime;
            booking.scheduledEnd = newSlot.endTime;
            booking.midiSession = {
                sessionCode: newSlot.midiSession.sessionId,
                roomUrl: newSlot.midiSession.roomUrl
            };
            booking.statusHistory.push({
                status: 'rescheduled',
                changedAt: new Date(),
                changedBy: userId,
                note: `Reagendado de ${oldDate.toISOString()} a ${newSlot.startTime.toISOString()}`
            });
            await booking.save({ session });
            
            await session.commitTransaction();
            
            console.log(`📧 Notificación: Clase reagendada`);
            console.log(`   De: ${oldDate}`);
            console.log(`   A: ${newSlot.startTime}`);
            
            return {
                success: true,
                booking,
                newSlot,
                previousDate: oldDate
            };
            
        } catch (error) {
            await session.abortTransaction();
            throw error;
        } finally {
            session.endSession();
        }
    }
}

module.exports = BookingService;
