/* services/AvailabilityService.js */
const moment = require('moment-timezone');
const AvailabilityTemplate = require('../models/AvailabilityTemplate');
const TimeSlot = require('../models/TimeSlot');

/**
 * Servicio para gestionar la disponibilidad de profesores.
 * Genera slots concretos a partir de plantillas recurrentes.
 */
class AvailabilityService {
    
    /**
     * Genera TimeSlots concretos desde una plantilla para un rango de fechas.
     * @param {ObjectId} templateId - ID de la plantilla
     * @param {Date} fromDate - Fecha inicio (UTC)
     * @param {Date} toDate - Fecha fin (UTC)
     * @returns {Array<TimeSlot>} Slots creados
     */
    static async generateSlotsFromTemplate(templateId, fromDate, toDate) {
        const template = await AvailabilityTemplate.findById(templateId);
        if (!template || !template.isActive) {
            throw new Error('TEMPLATE_NOT_FOUND');
        }
        
        const createdSlots = [];
        const timezone = template.timezone;
        
        // Iterar cada día en el rango
        let currentDate = moment.tz(fromDate, timezone).startOf('day');
        const endDate = moment.tz(toDate, timezone).endOf('day');
        
        while (currentDate.isSameOrBefore(endDate)) {
            const dayOfWeek = currentDate.day(); // 0=Dom, 1=Lun...
            
            // Verificar si es una excepción
            if (template.isDateException(currentDate.toDate())) {
                currentDate.add(1, 'day');
                continue;
            }
            
            // Obtener slots configurados para este día
            const daySlots = template.getSlotsForDay(dayOfWeek);
            
            for (const daySlot of daySlots) {
                const slots = await this._generateDaySlots(
                    template,
                    currentDate.clone(),
                    daySlot
                );
                createdSlots.push(...slots);
            }
            
            currentDate.add(1, 'day');
        }
        
        return createdSlots;
    }
    
    /**
     * Genera slots para un día específico según la configuración.
     */
    static async _generateDaySlots(template, dayMoment, daySlotConfig) {
        const slots = [];
        const timezone = template.timezone;
        const duration = daySlotConfig.slotDuration || template.defaultDuration;
        const bufferMinutes = template.bufferMinutes;
        
        // Parsear horarios
        const [startHour, startMin] = daySlotConfig.startTime.split(':').map(Number);
        const [endHour, endMin] = daySlotConfig.endTime.split(':').map(Number);
        
        // Momento de inicio/fin en timezone del profesor
        let slotStart = dayMoment.clone().hour(startHour).minute(startMin);
        const dayEnd = dayMoment.clone().hour(endHour).minute(endMin);
        
        // Generar slots hasta llenar el rango
        while (slotStart.clone().add(duration, 'minutes').isSameOrBefore(dayEnd)) {
            const slotEnd = slotStart.clone().add(duration, 'minutes');
            
            // Verificar si ya existe este slot (evitar duplicados y re-creación de cancelados)
            const existingSlot = await TimeSlot.findOne({
                teacherId: template.teacherId,
                startTime: slotStart.utc().toDate(),
                status: { $in: ['available', 'pending', 'booked', 'cancelled'] }
            });
            
            if (!existingSlot) {
                const newSlot = await TimeSlot.create({
                    teacherId: template.teacherId,
                    templateId: template._id,
                    startTime: slotStart.utc().toDate(),
                    endTime: slotEnd.utc().toDate(),
                    duration,
                    status: 'available',
                    classType: daySlotConfig.maxStudents > 1 ? 'group' : 'individual',
                    maxParticipants: daySlotConfig.maxStudents
                });
                slots.push(newSlot);
            }
            
            // Siguiente slot = fin actual + buffer
            slotStart = slotEnd.clone().add(bufferMinutes, 'minutes');
        }
        
        return slots;
    }
    
    /**
     * Obtiene slots disponibles de un profesor, aplicando buffer times.
     * @param {ObjectId} teacherId 
     * @param {Date} fromDate 
     * @param {Date} toDate 
     * @param {String} studentTimezone - Para convertir la respuesta
     * @returns {Array} Slots con horarios en timezone del estudiante
     */
    static async getAvailableSlots(teacherId, fromDate, toDate, studentTimezone = 'UTC') {
        // Obtener todos los slots del profesor en el rango
        const allSlots = await TimeSlot.find({
            teacherId,
            startTime: { $gte: fromDate, $lte: toDate },
            status: { $in: ['available', 'booked'] }
        }).sort({ startTime: 1 }).lean();
        
        // Obtener plantilla para conocer el buffer
        const template = await AvailabilityTemplate.findOne({
            teacherId,
            isActive: true
        });
        const bufferMinutes = template?.bufferMinutes || 10;
        
        // Filtrar slots disponibles considerando buffer con slots reservados
        const bookedSlots = allSlots.filter(s => s.status === 'booked');
        const availableSlots = allSlots.filter(s => s.status === 'available');
        
        const filteredSlots = availableSlots.filter(slot => {
            const slotStart = new Date(slot.startTime);
            const slotEnd = new Date(slot.endTime);
            
            // Verificar conflicto con buffer de cada slot reservado
            for (const booked of bookedSlots) {
                const bookedStart = new Date(booked.startTime);
                const bookedEnd = new Date(booked.endTime);
                
                // Calcular zona de exclusión (slot reservado + buffer)
                const excludeFrom = new Date(bookedStart.getTime() - bufferMinutes * 60000);
                const excludeUntil = new Date(bookedEnd.getTime() + bufferMinutes * 60000);
                
                // Si el slot disponible intersecta con la zona de exclusión, no es válido
                if (slotStart < excludeUntil && slotEnd > excludeFrom) {
                    return false;
                }
            }
            
            return true;
        });
        
        // Convertir horarios a timezone del estudiante para display
        return filteredSlots.map(slot => ({
            ...slot,
            displayStart: moment(slot.startTime).tz(studentTimezone).format('YYYY-MM-DD HH:mm'),
            displayEnd: moment(slot.endTime).tz(studentTimezone).format('HH:mm'),
            displayDate: moment(slot.startTime).tz(studentTimezone).format('dddd D [de] MMMM'),
            studentTimezone
        }));
    }
    
    /**
     * Bloquea un slot manualmente (profesor necesita tiempo libre).
     */
    static async blockSlot(teacherId, startTime, endTime, reason = '') {
        // Verificar que no haya reservas en ese horario
        const existingBooking = await TimeSlot.findOne({
            teacherId,
            startTime: { $lt: endTime },
            endTime: { $gt: startTime },
            status: 'booked'
        });
        
        if (existingBooking) {
            throw new Error('SLOT_HAS_BOOKING');
        }
        
        // Marcar slots como cancelados
        await TimeSlot.updateMany(
            {
                teacherId,
                startTime: { $gte: startTime, $lt: endTime },
                status: 'available'
            },
            {
                $set: { 
                    status: 'cancelled',
                    teacherNotes: reason || 'Bloqueado manualmente'
                }
            }
        );
        
        return { blocked: true };
    }
    
    /**
     * Obtiene el calendario completo del profesor (disponibles + reservados).
     */
    static async getTeacherCalendar(teacherId, fromDate, toDate) {
        const slots = await TimeSlot.find({
            teacherId,
            startTime: { $gte: fromDate, $lte: toDate },
            status: { $ne: 'cancelled' }
        })
        .populate('booking.studentId', 'name')
        .sort({ startTime: 1 })
        .lean();
        
        // Obtener timezone del profesor
        const User = require('../models/User');
        const teacher = await User.findById(teacherId).select('timezone');
        const timezone = teacher?.timezone || 'America/Santiago';
        
        return slots.map(slot => ({
            ...slot,
            displayStart: moment(slot.startTime).tz(timezone).format('HH:mm'),
            displayEnd: moment(slot.endTime).tz(timezone).format('HH:mm'),
            displayDate: moment(slot.startTime).tz(timezone).format('YYYY-MM-DD'),
            displayDayName: moment(slot.startTime).tz(timezone).format('dddd')
        }));
    }
}

module.exports = AvailabilityService;
