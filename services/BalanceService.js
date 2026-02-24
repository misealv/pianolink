/**
 * services/BalanceService.js
 * Sprint 2 — Tarea 2.3
 * 
 * FUENTE DE VERDAD ÚNICA para saldo de clases.
 * 
 * Prioridad de consulta:
 *   1. StudentSubscription.classesRemaining (fuente primaria)
 *   2. StudentEnrollment.classesRemaining (fallback v5 — alumnos invitados sin suscripción)
 *   3. User.classesRemaining / managedStudents[].classesRemaining (fallback legacy — DEPRECADO)
 * 
 * Problema que resuelve:
 *   El saldo de clases estaba disperso en 4 modelos:
 *   - User.classesRemaining
 *   - clientData.managedStudents[].classesRemaining
 *   - Enrollment.classesRemaining
 *   - StudentEnrollment.classesRemaining
 *   - StudentSubscription.classesRemaining
 *   
 *   Esto causaba desincronización. Este servicio centraliza la lectura y
 *   escritura del saldo para que todas las operaciones pasen por un punto único.
 */

const StudentSubscription = require('../models/StudentSubscription');
const StudentEnrollment = require('../models/StudentEnrollment');
const Enrollment = require('../models/Enrollment');
const User = require('../models/User');

class BalanceService {

    /**
     * Obtiene el saldo de clases de un estudiante con un profesor específico.
     * Consulta en orden de prioridad: Subscription → StudentEnrollment → User legacy.
     * 
     * @param {ObjectId} studentId - ID del estudiante (o cliente/guardian)
     * @param {ObjectId} teacherId - ID del profesor
     * @param {Object} [options] - Opciones adicionales
     * @param {string} [options.managedStudentId] - ID del subdocumento managedStudent (guardians)
     * @returns {Object} { balance, source, sourceId, details }
     */
    static async getBalance(studentId, teacherId, options = {}) {
        // 1. Buscar en StudentSubscription (fuente primaria)
        const subscription = await StudentSubscription.findOne({
            studentId,
            teacherId,
            status: { $in: ['active', 'paused'] },
            classesRemaining: { $gt: 0 }
        }).sort({ classesRemaining: -1 }); // La que tenga más clases

        if (subscription) {
            return {
                balance: subscription.classesRemaining,
                source: 'StudentSubscription',
                sourceId: subscription._id,
                details: {
                    total: subscription.classesTotal,
                    remaining: subscription.classesRemaining,
                    completed: subscription.classesCompleted,
                    status: subscription.status,
                    expiresAt: subscription.expiresAt
                }
            };
        }

        // 2. Buscar en StudentEnrollment (v5 — alumnos invitados con clases)
        const enrollment = await StudentEnrollment.findOne({
            student: studentId,
            teacher: teacherId,
            status: 'active',
            classesRemaining: { $gt: 0 }
        });

        if (enrollment) {
            return {
                balance: enrollment.classesRemaining,
                source: 'StudentEnrollment',
                sourceId: enrollment._id,
                details: {
                    purchased: enrollment.classesPurchased,
                    remaining: enrollment.classesRemaining,
                    completed: enrollment.classesCompleted,
                    frozenRate: enrollment.frozenRate,
                    expiresAt: enrollment.classesExpiresAt
                }
            };
        }

        // 3. Fallback legacy: User.classesRemaining o managedStudents
        const user = await User.findById(studentId).select(
            'classesRemaining role clientData.accountType clientData.managedStudents'
        );

        if (!user) {
            return { balance: 0, source: 'none', sourceId: null, details: {} };
        }

        // Guardian con managedStudents
        if (user.role === 'client' && user.clientData?.accountType === 'guardian') {
            const managedStudents = user.clientData.managedStudents || [];
            
            if (options.managedStudentId) {
                const ms = managedStudents.find(s => s._id?.toString() === options.managedStudentId);
                if (ms && ms.classesRemaining > 0) {
                    return {
                        balance: ms.classesRemaining,
                        source: 'User.managedStudents (LEGACY)',
                        sourceId: user._id,
                        details: {
                            studentName: ms.name,
                            remaining: ms.classesRemaining,
                            used: ms.classesUsed || 0
                        },
                        _deprecated: true
                    };
                }
            }

            // Buscar cualquier managedStudent con saldo
            const msWithBalance = managedStudents.find(s => (s.classesRemaining || 0) > 0);
            if (msWithBalance) {
                return {
                    balance: msWithBalance.classesRemaining,
                    source: 'User.managedStudents (LEGACY)',
                    sourceId: user._id,
                    details: {
                        studentName: msWithBalance.name,
                        remaining: msWithBalance.classesRemaining,
                        used: msWithBalance.classesUsed || 0
                    },
                    _deprecated: true
                };
            }
        }

        // User.classesRemaining directo
        if (user.classesRemaining > 0) {
            return {
                balance: user.classesRemaining,
                source: 'User.classesRemaining (LEGACY)',
                sourceId: user._id,
                details: { remaining: user.classesRemaining },
                _deprecated: true
            };
        }

        return { balance: 0, source: 'none', sourceId: null, details: {} };
    }

    /**
     * Obtiene el saldo TOTAL de un estudiante con TODOS sus profesores.
     * 
     * @param {ObjectId} studentId
     * @returns {Object} { totalBalance, byTeacher[] }
     */
    static async getTotalBalance(studentId) {
        // Suscripciones activas
        const subscriptions = await StudentSubscription.find({
            studentId,
            status: { $in: ['active', 'paused'] },
            classesRemaining: { $gt: 0 }
        }).populate('teacherId', 'name email');

        // Enrollments v5 activos
        const enrollments = await StudentEnrollment.find({
            student: studentId,
            status: 'active',
            classesRemaining: { $gt: 0 }
        }).populate('teacher', 'name email');

        const byTeacher = [];
        const teacherSeen = new Set();

        // Agregar suscripciones
        for (const sub of subscriptions) {
            const tid = sub.teacherId._id.toString();
            teacherSeen.add(tid);
            byTeacher.push({
                teacherId: sub.teacherId._id,
                teacherName: sub.teacherId.name,
                balance: sub.classesRemaining,
                source: 'StudentSubscription',
                sourceId: sub._id,
                expiresAt: sub.expiresAt
            });
        }

        // Agregar enrollments que no estén ya cubiertos por suscripciones
        for (const enr of enrollments) {
            const tid = enr.teacher._id.toString();
            if (!teacherSeen.has(tid)) {
                byTeacher.push({
                    teacherId: enr.teacher._id,
                    teacherName: enr.teacher.name,
                    balance: enr.classesRemaining,
                    source: 'StudentEnrollment',
                    sourceId: enr._id,
                    expiresAt: enr.classesExpiresAt
                });
            }
        }

        const totalBalance = byTeacher.reduce((sum, t) => sum + t.balance, 0);

        return { totalBalance, byTeacher };
    }

    /**
     * Detecta desincronizaciones de saldo para un estudiante.
     * Compara User.classesRemaining vs la suma de suscripciones activas.
     * 
     * @param {ObjectId} studentId
     * @returns {Object|null} Discrepancia encontrada, o null si todo está sincronizado
     */
    static async detectDesync(studentId) {
        const user = await User.findById(studentId).select(
            'classesRemaining name email role clientData'
        ).lean();

        if (!user) return null;

        // Suma de suscripciones activas
        const subTotal = await StudentSubscription.aggregate([
            { 
                $match: { 
                    studentId: new (require('mongoose').Types.ObjectId)(studentId),
                    status: { $in: ['active', 'paused'] }
                }
            },
            { $group: { _id: null, total: { $sum: '$classesRemaining' } } }
        ]);
        const subscriptionBalance = subTotal[0]?.total || 0;

        // Suma de enrollments v5
        const enrTotal = await StudentEnrollment.aggregate([
            {
                $match: {
                    student: new (require('mongoose').Types.ObjectId)(studentId),
                    status: 'active'
                }
            },
            { $group: { _id: null, total: { $sum: '$classesRemaining' } } }
        ]);
        const enrollmentBalance = enrTotal[0]?.total || 0;

        const userBalance = user.classesRemaining || 0;
        
        // Saldo en managedStudents
        let managedBalance = 0;
        if (user.clientData?.managedStudents) {
            managedBalance = user.clientData.managedStudents.reduce(
                (sum, ms) => sum + (ms.classesRemaining || 0), 0
            );
        }

        // Hay desincronización si User.classesRemaining difiere de la fuente de verdad
        const truthBalance = subscriptionBalance || enrollmentBalance;
        const hasDesync = (userBalance > 0 && userBalance !== truthBalance) || 
                          (managedBalance > 0 && subscriptionBalance === 0 && enrollmentBalance === 0);

        if (!hasDesync) return null;

        return {
            userId: user._id,
            email: user.email,
            name: user.name,
            role: user.role,
            balances: {
                'User.classesRemaining': userBalance,
                'managedStudents.classesRemaining': managedBalance,
                'Σ StudentSubscription': subscriptionBalance,
                'Σ StudentEnrollment': enrollmentBalance
            },
            recommendation: subscriptionBalance > 0
                ? `Sincronizar User.classesRemaining a ${subscriptionBalance} (desde StudentSubscription)`
                : enrollmentBalance > 0
                    ? `Sincronizar User.classesRemaining a ${enrollmentBalance} (desde StudentEnrollment)`
                    : `Verificar manualmente — saldo legacy sin fuente de verdad moderna`
        };
    }

    /**
     * Sincroniza User.classesRemaining desde la fuente de verdad (StudentSubscription/StudentEnrollment).
     * Solo actualiza si hay desincronización real.
     * 
     * @param {ObjectId} studentId
     * @param {Object} [options]
     * @param {boolean} [options.dryRun=false] - Si true, no modifica nada
     * @returns {Object|null} Cambio realizado, o null si no se necesitaba
     */
    static async syncBalance(studentId, options = { dryRun: false }) {
        const desync = await this.detectDesync(studentId);
        if (!desync) return null;

        // Calcular balance correcto desde fuente de verdad
        const subTotal = await StudentSubscription.aggregate([
            {
                $match: {
                    studentId: new (require('mongoose').Types.ObjectId)(studentId),
                    status: { $in: ['active', 'paused'] }
                }
            },
            { $group: { _id: null, total: { $sum: '$classesRemaining' } } }
        ]);
        const correctBalance = subTotal[0]?.total || 0;

        if (options.dryRun) {
            return {
                action: 'dry-run',
                userId: studentId,
                currentBalance: desync.balances['User.classesRemaining'],
                correctBalance,
                desync
            };
        }

        await User.findByIdAndUpdate(studentId, {
            $set: { classesRemaining: correctBalance }
        });

        console.log(`[BalanceService] Sincronizado ${desync.email}: ${desync.balances['User.classesRemaining']} → ${correctBalance}`);

        return {
            action: 'synced',
            userId: studentId,
            previousBalance: desync.balances['User.classesRemaining'],
            newBalance: correctBalance,
            desync
        };
    }
}

module.exports = BalanceService;
