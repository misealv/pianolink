/**
 * services/StudentAssignmentService.js
 * Cola de asignación de alumnos con prioridad - PianoLink v5.0 (Fase 3)
 * 
 * Cuando un alumno nuevo llega buscando profesor (source: 'platform'),
 * el sistema prioriza profesores premium/founder sobre free.
 * 
 * Orden de prioridad:
 *   1º Founders activos (plan='founder' + suscripción activa)
 *   2º Premium activos  (plan='premium' + suscripción activa)
 *   3º Free             (plan='free')
 * 
 * Dentro de cada grupo:
 *   - Menor carga actual (menos alumnos activos primero)
 *   - Mayor antigüedad   (createdAt ASC, premiar fidelidad)
 */

const User = require('../models/User');
const Enrollment = require('../models/Enrollment');
const CommissionService = require('./CommissionService');
const emailService = require('./EmailService');

class StudentAssignmentService {

    /**
     * Obtener profesores compatibles ordenados por prioridad
     * @param {Object} preferences - Preferencias del alumno
     * @param {string} [preferences.instrument] - Instrumento (ej: 'piano')
     * @param {string[]} [preferences.languages] - Idiomas (ej: ['es', 'en'])
     * @param {string} [preferences.country] - País del alumno (para timezone)
     * @param {string[]} [preferences.availableDays] - Días disponibles
     * @param {number} [limit=3] - Cantidad de candidatos a retornar
     * @returns {Object[]} Top N profesores candidatos con metadata
     */
    static async getMatchingTeachers(preferences = {}, limit = 3) {
        try {
            // Filtro base: profesores activos con perfil público
            const baseFilter = {
                role: 'teacher',
                'teacherData.subscriptionStatus': { $nin: ['cancelled'] },
                // Solo profesores con perfil visible
                $or: [
                    { 'teacherData.profile.isPublic': true },
                    { 'teacherData.profile.isPublic': { $exists: false } } // Compatibilidad legacy
                ]
            };

            // Filtro por idioma si hay preferencia
            if (preferences.languages && preferences.languages.length > 0) {
                baseFilter['teacherData.languages'] = { $in: preferences.languages };
            }

            // Obtener todos los profesores candidatos
            const teachers = await User.find(baseFilter)
                .select('name email country teacherData.plan teacherData.subscriptionStatus teacherData.subscriptionExpiresAt teacherData.permissions teacherData.profile createdAt')
                .lean();

            if (!teachers.length) {
                return [];
            }

            // Obtener carga actual de cada profesor (alumnos activos)
            const teacherIds = teachers.map(t => t._id);
            const enrollmentCounts = await Enrollment.aggregate([
                {
                    $match: {
                        teacherId: { $in: teacherIds },
                        status: 'active'
                    }
                },
                {
                    $group: {
                        _id: '$teacherId',
                        activeStudents: { $sum: 1 }
                    }
                }
            ]);

            // Mapa de carga: teacherId → cantidad de alumnos activos
            const loadMap = {};
            enrollmentCounts.forEach(ec => {
                loadMap[ec._id.toString()] = ec.activeStudents;
            });

            // Asignar prioridad numérica a cada plan
            const planPriority = {
                founder: 0,   // Máxima prioridad
                premium: 1,
                free: 2       // Menor prioridad
            };

            // Enriquecer y ordenar profesores
            const ranked = teachers.map(teacher => {
                const plan = teacher.teacherData?.plan || 'free';
                const status = teacher.teacherData?.subscriptionStatus || 'trial';
                const expiresAt = teacher.teacherData?.subscriptionExpiresAt;

                // Si la membresía expiró, tratar como free
                let effectivePlan = plan;
                if (plan !== 'free' && status !== 'active' && status !== 'trial') {
                    effectivePlan = 'free';
                }
                if (plan !== 'free' && expiresAt && new Date(expiresAt) < new Date()) {
                    effectivePlan = 'free';
                }

                return {
                    teacherId: teacher._id,
                    name: teacher.name,
                    email: teacher.email,
                    country: teacher.country,
                    plan: effectivePlan,
                    originalPlan: plan,
                    priority: planPriority[effectivePlan] ?? 2,
                    activeStudents: loadMap[teacher._id.toString()] || 0,
                    memberSince: teacher.createdAt,
                    hasPriorityQueue: teacher.teacherData?.permissions?.hasPriorityQueue || false
                };
            });

            // Ordenar: prioridad ASC → carga ASC → antigüedad ASC
            ranked.sort((a, b) => {
                // 1. Prioridad del plan (founder=0 > premium=1 > free=2)
                if (a.priority !== b.priority) return a.priority - b.priority;
                // 2. Menor carga primero
                if (a.activeStudents !== b.activeStudents) return a.activeStudents - b.activeStudents;
                // 3. Mayor antigüedad primero (createdAt menor = más antiguo)
                return new Date(a.memberSince) - new Date(b.memberSince);
            });

            // Retornar top N
            return ranked.slice(0, limit).map(t => ({
                teacherId: t.teacherId,
                name: t.name,
                country: t.country,
                plan: t.plan,
                activeStudents: t.activeStudents,
                hasPriorityQueue: t.hasPriorityQueue,
                memberSince: t.memberSince
            }));

        } catch (error) {
            console.error('[StudentAssignmentService] Error buscando profesores:', error.message);
            throw error;
        }
    }

    /**
     * Asignar un alumno a un profesor (source: platform)
     * @param {string|ObjectId} studentId - ID del alumno
     * @param {string|ObjectId} teacherId - ID del profesor
     * @param {string} source - 'platform' | 'private_invite'
     * @param {Object} [options]
     * @param {string} [options.inviteCode] - Código de invitación (si source='private_invite')
     * @param {string|ObjectId} [options.roomId] - ID de la sala
     * @returns {Object} { success, enrollment, commission }
     */
    static async assignStudent(studentId, teacherId, source = 'platform', options = {}) {
        try {
            // Verificar que alumno y profesor existan
            const [student, teacher] = await Promise.all([
                User.findById(studentId).select('name email'),
                User.findById(teacherId).select('name email teacherData.plan')
            ]);

            if (!student) {
                return { success: false, error: 'Alumno no encontrado' };
            }
            if (!teacher) {
                return { success: false, error: 'Profesor no encontrado' };
            }

            // Verificar que no exista enrollment duplicado
            const existing = await Enrollment.findOne({ studentId, teacherId });
            if (existing) {
                return {
                    success: false,
                    error: 'El alumno ya está inscrito con este profesor',
                    enrollment: existing
                };
            }

            // Calcular comisión según plan y origen
            const commission = await CommissionService.calculateCommission(teacherId, source);

            // Resolver roomId si no se proporcionó
            let roomId = options.roomId || null;
            if (!roomId) {
                const Room = require('../models/Room');
                const teacherRoom = await Room.findOne({
                    teacherId,
                    status: 'active'
                });
                if (teacherRoom) {
                    roomId = teacherRoom._id;
                }
            }

            // Crear enrollment
            const enrollmentData = {
                studentId,
                teacherId,
                source,
                inviteCode: options.inviteCode || '',
                appliedCommission: {
                    platformPercent: commission.platformPercent,
                    teacherPercent: commission.teacherPercent,
                    reason: commission.reason
                },
                status: 'active'
            };

            if (roomId) {
                enrollmentData.roomId = roomId;
            }

            const enrollment = new Enrollment(enrollmentData);
            await enrollment.save();

            // Notificar al profesor
            try {
                const sourceLabel = source === 'platform'
                    ? 'la plataforma PianoLink'
                    : 'tu enlace de invitación';

                await emailService.sendSafe({
                    to: teacher.email,
                    subject: '🎹 Nuevo alumno asignado en PianoLink',
                    html: `
                        <h2>¡Tienes un nuevo alumno!</h2>
                        <p><strong>${student.name}</strong> (${student.email}) ha sido asignado como tu alumno a través de ${sourceLabel}.</p>
                        <p>Comisión aplicada: PianoLink ${commission.platformPercent}% / Profesor ${commission.teacherPercent}%</p>
                        <p>Ingresa a tu panel para ver sus datos y programar la primera clase.</p>
                    `
                });
            } catch (emailErr) {
                console.error('[StudentAssignment] Error enviando notificación:', emailErr.message);
            }

            console.log(`[StudentAssignment] Alumno ${student.email} asignado a ${teacher.email} (source: ${source}, comisión: ${commission.platformPercent}/${commission.teacherPercent})`);

            return {
                success: true,
                enrollment,
                commission
            };
        } catch (error) {
            console.error('[StudentAssignmentService] Error asignando alumno:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Obtener posición del profesor en la cola de asignación
     * Premium/Founder siempre retornan posición 0 (prioritaria)
     * @param {string|ObjectId} teacherId
     * @returns {Object} { position, plan, isPriority }
     */
    static async getQueuePosition(teacherId) {
        try {
            const teacher = await User.findById(teacherId)
                .select('teacherData.plan teacherData.permissions teacherData.subscriptionStatus');

            if (!teacher) {
                return { position: -1, error: 'Profesor no encontrado' };
            }

            const plan = teacher.teacherData?.plan || 'free';
            const hasPriority = teacher.teacherData?.permissions?.hasPriorityQueue || false;

            // Premium/Founder con membresía activa = posición 0
            if (hasPriority && (teacher.teacherData?.subscriptionStatus === 'active' || teacher.teacherData?.subscriptionStatus === 'trial')) {
                return {
                    position: 0,
                    plan,
                    isPriority: true,
                    message: 'Prioridad máxima — recibes alumnos antes que profesores free'
                };
            }

            // Contar cuántos profesores free hay delante (por antiguedad y carga)
            const freeTeachers = await User.countDocuments({
                role: 'teacher',
                'teacherData.plan': 'free',
                'teacherData.subscriptionStatus': { $nin: ['cancelled'] },
                createdAt: { $lt: teacher.createdAt || new Date() }
            });

            return {
                position: freeTeachers + 1,
                plan,
                isPriority: false,
                message: `Posición ${freeTeachers + 1} en cola estándar. Upgrade a Premium para prioridad máxima.`
            };
        } catch (error) {
            console.error('[StudentAssignmentService] Error obteniendo posición:', error.message);
            return { position: -1, error: error.message };
        }
    }
}

module.exports = StudentAssignmentService;
