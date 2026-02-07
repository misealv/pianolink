/**
 * routes/adminPayouts.js
 * API de administración para payouts a profesores
 * 
 * Endpoints:
 * - GET /api/admin/payouts - Listar todos los payouts
 * - GET /api/admin/payouts/pending - Payouts pendientes de aprobación
 * - GET /api/admin/payouts/:id - Detalle de un payout
 * - POST /api/admin/payouts/:id/approve - Aprobar payout
 * - POST /api/admin/payouts/:id/reject - Rechazar payout
 * - POST /api/admin/payouts/:id/mark-paid - Marcar como pagado
 * - POST /api/admin/payouts/:id/adjustment - Agregar ajuste
 * - GET /api/admin/payouts/summary - Resumen general
 */

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const TeacherPayout = require('../models/TeacherPayout');
const ClassSession = require('../models/ClassSession');
const User = require('../models/User');
const { protect: authMiddleware } = require('../middleware/authMiddleware');

// Middleware: Solo admins
const adminOnly = async (req, res, next) => {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'Acceso denegado' });
    }
    next();
};

/**
 * GET /api/admin/payouts/summary
 * Resumen general de payouts
 */
router.get('/summary', authMiddleware, adminOnly, async (req, res) => {
    try {
        const [pending, approved, processing, paid] = await Promise.all([
            TeacherPayout.countDocuments({ status: 'pending-review' }),
            TeacherPayout.countDocuments({ status: 'approved' }),
            TeacherPayout.countDocuments({ status: 'processing' }),
            TeacherPayout.countDocuments({ status: 'paid' })
        ]);

        // Totales pendientes de pago
        const pendingPayouts = await TeacherPayout.aggregate([
            { $match: { status: { $in: ['pending-review', 'approved'] } } },
            { $group: { 
                _id: null, 
                total: { $sum: '$finalPayoutUSD' },
                count: { $sum: 1 }
            }}
        ]);

        // Pagados este mes
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const paidThisMonth = await TeacherPayout.aggregate([
            { $match: { status: 'paid', paidAt: { $gte: startOfMonth } } },
            { $group: { 
                _id: null, 
                total: { $sum: '$finalPayoutUSD' },
                count: { $sum: 1 }
            }}
        ]);

        res.json({
            success: true,
            summary: {
                pendingReview: pending,
                approved: approved,
                processing: processing,
                paid: paid,
                totalPendingUSD: pendingPayouts[0]?.total || 0,
                paidThisMonthUSD: paidThisMonth[0]?.total || 0,
                paidThisMonthCount: paidThisMonth[0]?.count || 0
            }
        });
    } catch (error) {
        console.error('[AdminPayouts] Error summary:', error);
        res.status(500).json({ success: false, error: 'Error interno' });
    }
});

/**
 * GET /api/admin/payouts
 * Listar todos los payouts con filtros
 */
router.get('/', authMiddleware, adminOnly, async (req, res) => {
    try {
        const { status, teacherId, period, page = 1, limit = 20 } = req.query;

        const filter = {};
        
        if (status) {
            filter.status = status;
        }
        if (teacherId) {
            filter.teacherId = teacherId;
        }
        if (period) {
            // Formato: "2026-01" para Enero 2026
            const [year, month] = period.split('-').map(Number);
            const startDate = new Date(year, month - 1, 1);
            const endDate = new Date(year, month, 0, 23, 59, 59);
            filter.periodStart = { $gte: startDate };
            filter.periodEnd = { $lte: endDate };
        }

        const skip = (page - 1) * limit;

        const [payouts, total] = await Promise.all([
            TeacherPayout.find(filter)
                .populate('teacherId', 'name email brandName slug')
                .populate('approvedBy', 'name')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit)),
            TeacherPayout.countDocuments(filter)
        ]);

        res.json({
            success: true,
            payouts,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('[AdminPayouts] Error listing:', error);
        res.status(500).json({ success: false, error: 'Error interno' });
    }
});

/**
 * GET /api/admin/payouts/pending
 * Payouts pendientes de aprobación (acceso rápido)
 */
router.get('/pending', authMiddleware, adminOnly, async (req, res) => {
    try {
        const payouts = await TeacherPayout.find({
            status: { $in: ['pending-review', 'approved'] }
        })
        .populate('teacherId', 'name email brandName slug branding')
        .sort({ status: 1, periodEnd: -1 });

        res.json({
            success: true,
            payouts
        });
    } catch (error) {
        console.error('[AdminPayouts] Error pending:', error);
        res.status(500).json({ success: false, error: 'Error interno' });
    }
});

/**
 * GET /api/admin/payouts/:id
 * Detalle completo de un payout
 */
router.get('/:id', authMiddleware, adminOnly, async (req, res) => {
    try {
        const payout = await TeacherPayout.findById(req.params.id)
            .populate('teacherId', 'name email brandName slug branding teacherData')
            .populate('approvedBy', 'name email')
            .populate('reviewedBy', 'name email')
            .populate({
                path: 'sessions',
                populate: [
                    { path: 'studentId', select: 'name email' },
                    { path: 'subscriptionId', select: 'category' }
                ]
            });

        if (!payout) {
            return res.status(404).json({ success: false, error: 'Payout no encontrado' });
        }

        // Obtener info de wallet del profesor para método de pago
        const Wallet = mongoose.model('Wallet');
        const wallet = await Wallet.findOne({ userId: payout.teacherId._id });

        res.json({
            success: true,
            payout,
            wallet: wallet ? {
                preferredMethod: wallet.preferredPayoutMethod,
                paypalEmail: wallet.paypalEmail,
                mercadopagoEmail: wallet.mercadopagoEmail,
                bankAccount: wallet.bankAccount ? {
                    bankName: wallet.bankAccount.bankName,
                    lastFour: wallet.bankAccount.accountNumber?.slice(-4) || '****'
                } : null
            } : null
        });
    } catch (error) {
        console.error('[AdminPayouts] Error detail:', error);
        res.status(500).json({ success: false, error: 'Error interno' });
    }
});

/**
 * POST /api/admin/payouts/:id/review
 * Marcar payout como revisado (listo para aprobación)
 */
router.post('/:id/review', authMiddleware, adminOnly, async (req, res) => {
    try {
        const { notes } = req.body;

        const payout = await TeacherPayout.findById(req.params.id);
        if (!payout) {
            return res.status(404).json({ success: false, error: 'Payout no encontrado' });
        }

        if (payout.status !== 'calculating') {
            return res.status(400).json({ 
                success: false, 
                error: 'Solo se pueden revisar payouts en estado "calculating"' 
            });
        }

        payout.status = 'pending-review';
        payout.reviewedBy = req.user._id;
        payout.reviewedAt = new Date();
        payout.statusHistory.push({
            status: 'pending-review',
            changedBy: req.user._id,
            notes: notes || 'Revisado y listo para aprobación'
        });

        await payout.save();

        res.json({ success: true, payout });
    } catch (error) {
        console.error('[AdminPayouts] Error review:', error);
        res.status(500).json({ success: false, error: 'Error interno' });
    }
});

/**
 * POST /api/admin/payouts/:id/approve
 * Aprobar payout para pago
 */
router.post('/:id/approve', authMiddleware, adminOnly, async (req, res) => {
    try {
        const { notes } = req.body;

        const payout = await TeacherPayout.findById(req.params.id);
        if (!payout) {
            return res.status(404).json({ success: false, error: 'Payout no encontrado' });
        }

        if (!['pending-review', 'calculating'].includes(payout.status)) {
            return res.status(400).json({ 
                success: false, 
                error: `No se puede aprobar un payout en estado "${payout.status}"` 
            });
        }

        await payout.approve(req.user._id, notes || '');

        res.json({ 
            success: true, 
            payout,
            message: 'Payout aprobado exitosamente'
        });
    } catch (error) {
        console.error('[AdminPayouts] Error approve:', error);
        res.status(500).json({ success: false, error: 'Error interno' });
    }
});

/**
 * POST /api/admin/payouts/:id/reject
 * Rechazar payout
 */
router.post('/:id/reject', authMiddleware, adminOnly, async (req, res) => {
    try {
        const { reason } = req.body;

        if (!reason) {
            return res.status(400).json({ success: false, error: 'Se requiere una razón' });
        }

        const payout = await TeacherPayout.findById(req.params.id);
        if (!payout) {
            return res.status(404).json({ success: false, error: 'Payout no encontrado' });
        }

        payout.status = 'cancelled';
        payout.statusHistory.push({
            status: 'cancelled',
            changedBy: req.user._id,
            notes: `Rechazado: ${reason}`
        });

        await payout.save();

        res.json({ 
            success: true, 
            payout,
            message: 'Payout rechazado'
        });
    } catch (error) {
        console.error('[AdminPayouts] Error reject:', error);
        res.status(500).json({ success: false, error: 'Error interno' });
    }
});

/**
 * POST /api/admin/payouts/:id/mark-paid
 * Marcar payout como pagado manualmente
 */
router.post('/:id/mark-paid', authMiddleware, adminOnly, async (req, res) => {
    try {
        const { paymentMethod, paymentReference, notes } = req.body;

        if (!paymentReference) {
            return res.status(400).json({ 
                success: false, 
                error: 'Se requiere referencia de pago' 
            });
        }

        const payout = await TeacherPayout.findById(req.params.id);
        if (!payout) {
            return res.status(404).json({ success: false, error: 'Payout no encontrado' });
        }

        if (!['approved', 'processing'].includes(payout.status)) {
            return res.status(400).json({ 
                success: false, 
                error: `Solo se pueden marcar como pagados payouts aprobados` 
            });
        }

        await payout.markPaid(paymentReference, paymentMethod || 'manual');

        // Agregar nota si existe
        if (notes) {
            payout.statusHistory[payout.statusHistory.length - 1].notes += ` - ${notes}`;
            await payout.save();
        }

        res.json({ 
            success: true, 
            payout,
            message: 'Payout marcado como pagado'
        });
    } catch (error) {
        console.error('[AdminPayouts] Error mark-paid:', error);
        res.status(500).json({ success: false, error: 'Error interno' });
    }
});

/**
 * POST /api/admin/payouts/:id/execute
 * Ejecutar pago automático vía MercadoPago (o mostrar info para pago manual)
 */
router.post('/:id/execute', authMiddleware, adminOnly, async (req, res) => {
    try {
        const MPTransferService = require('../services/MercadoPagoTransferService');
        
        const payout = await TeacherPayout.findById(req.params.id)
            .populate('teacherId', 'name email teacherData');
        
        if (!payout) {
            return res.status(404).json({ success: false, error: 'Payout no encontrado' });
        }

        if (payout.status !== 'approved') {
            return res.status(400).json({ 
                success: false, 
                error: 'Solo se pueden ejecutar payouts aprobados' 
            });
        }

        // Verificar que el documento tributario esté verificado
        const { skipInvoiceCheck } = req.body;
        if (!skipInvoiceCheck) {
            if (!payout.invoice || payout.invoice.status !== 'verified') {
                return res.status(400).json({ 
                    success: false, 
                    error: 'El documento tributario debe estar verificado antes de ejecutar el pago',
                    invoiceStatus: payout.invoice?.status || 'not_submitted',
                    hint: 'Use skipInvoiceCheck=true para omitir esta verificación (no recomendado)'
                });
            }
        }

        const teacher = payout.teacherId;
        if (!teacher) {
            return res.status(400).json({ 
                success: false, 
                error: 'Profesor no encontrado' 
            });
        }

        const paymentInfo = teacher.teacherData?.paymentInfo;
        if (!paymentInfo || !paymentInfo.method) {
            return res.status(400).json({ 
                success: false, 
                error: 'El profesor no tiene método de pago configurado',
                requiresManual: true
            });
        }

        // Marcar como procesando
        payout.status = 'processing';
        payout.statusHistory.push({
            status: 'processing',
            changedBy: req.user._id,
            notes: `Iniciando pago automático vía ${paymentInfo.method}`
        });
        await payout.save();

        try {
            // Intentar ejecutar pago automático
            const result = await MPTransferService.executePayoutToTeacher(payout, teacher);

            if (result.success) {
                // Pago automático exitoso
                await payout.markPaid(result.transferId, `mercadopago-auto`);
                
                console.log(`[AdminPayouts] ✅ Pago automático exitoso: ${payout._id} -> ${teacher.email}`);

                return res.json({
                    success: true,
                    message: 'Pago ejecutado exitosamente vía MercadoPago',
                    transfer: {
                        id: result.transferId,
                        amount: result.amount,
                        currency: result.currency,
                        recipient: result.recipient,
                        status: result.status
                    }
                });
            } else if (result.requiresManual) {
                // Método requiere pago manual
                payout.status = 'approved'; // Revertir a aprobado
                payout.statusHistory.push({
                    status: 'approved',
                    changedBy: req.user._id,
                    notes: `Pago automático no disponible para ${paymentInfo.method}. Requiere pago manual.`
                });
                await payout.save();

                return res.json({
                    success: false,
                    requiresManual: true,
                    method: result.method,
                    message: result.message,
                    paymentDetails: result.paymentDetails,
                    payout: {
                        id: payout._id,
                        amount: (payout.finalPayoutUSD / 100).toFixed(2),
                        teacher: teacher.name
                    }
                });
            }
        } catch (transferError) {
            // Error en transferencia - revertir estado
            payout.status = 'approved';
            payout.statusHistory.push({
                status: 'approved',
                changedBy: req.user._id,
                notes: `Error en pago automático: ${transferError.message}`
            });
            await payout.save();

            console.error('[AdminPayouts] Error en transferencia:', transferError);

            return res.status(500).json({
                success: false,
                error: transferError.message,
                requiresManual: true,
                message: 'Error en pago automático. Use pago manual.',
                paymentInfo: {
                    method: paymentInfo.method,
                    details: paymentInfo[paymentInfo.method === 'bank_transfer' ? 'bankTransfer' : paymentInfo.method]
                }
            });
        }
    } catch (error) {
        console.error('[AdminPayouts] Error execute:', error);
        res.status(500).json({ success: false, error: 'Error interno' });
    }
});

/**
 * GET /api/admin/payouts/:id/payment-info
 * Obtener información de pago del profesor para pago manual
 */
router.get('/:id/payment-info', authMiddleware, adminOnly, async (req, res) => {
    try {
        const payout = await TeacherPayout.findById(req.params.id)
            .populate('teacherId', 'name email teacherData');
        
        if (!payout) {
            return res.status(404).json({ success: false, error: 'Payout no encontrado' });
        }

        const teacher = payout.teacherId;
        const paymentInfo = teacher?.teacherData?.paymentInfo || {};

        res.json({
            success: true,
            payout: {
                id: payout._id,
                amount: payout.finalPayoutUSD,
                amountFormatted: `$${(payout.finalPayoutUSD / 100).toFixed(2)} USD`,
                period: `${payout.periodStart.toLocaleDateString('es-CL')} - ${payout.periodEnd.toLocaleDateString('es-CL')}`,
                classCount: payout.classCount,
                status: payout.status
            },
            teacher: {
                name: teacher?.name,
                email: teacher?.email
            },
            paymentInfo: {
                country: paymentInfo.country || 'No configurado',
                method: paymentInfo.method || 'No configurado',
                mercadopago: paymentInfo.mercadopago || {},
                bankTransfer: paymentInfo.bankTransfer || {},
                paypal: paymentInfo.paypal || {},
                wise: paymentInfo.wise || {},
                taxId: paymentInfo.taxId,
                taxIdType: paymentInfo.taxIdType,
                isVerified: paymentInfo.isVerified
            }
        });
    } catch (error) {
        console.error('[AdminPayouts] Error payment-info:', error);
        res.status(500).json({ success: false, error: 'Error interno' });
    }
});

/**
 * POST /api/admin/payouts/execute-batch
 * Ejecutar múltiples payouts aprobados
 */
router.post('/execute-batch', authMiddleware, adminOnly, async (req, res) => {
    try {
        const { payoutIds } = req.body;

        if (!payoutIds || !Array.isArray(payoutIds) || payoutIds.length === 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'Se requiere array de IDs de payouts' 
            });
        }

        const MPTransferService = require('../services/MercadoPagoTransferService');
        const results = {
            successful: [],
            failed: [],
            requiresManual: []
        };

        for (const payoutId of payoutIds) {
            try {
                const payout = await TeacherPayout.findById(payoutId)
                    .populate('teacherId', 'name email teacherData');

                if (!payout || payout.status !== 'approved') {
                    results.failed.push({
                        payoutId,
                        error: 'Payout no encontrado o no está aprobado'
                    });
                    continue;
                }

                const teacher = payout.teacherId;
                const paymentInfo = teacher?.teacherData?.paymentInfo;

                if (!paymentInfo?.method) {
                    results.requiresManual.push({
                        payoutId,
                        teacherName: teacher?.name,
                        amount: payout.finalPayoutUSD,
                        reason: 'Sin método de pago configurado'
                    });
                    continue;
                }

                // Intentar pago automático
                const result = await MPTransferService.executePayoutToTeacher(payout, teacher);

                if (result.success) {
                    await payout.markPaid(result.transferId, 'mercadopago-auto');
                    results.successful.push({
                        payoutId,
                        teacherName: teacher.name,
                        amount: result.amount,
                        transferId: result.transferId
                    });
                } else if (result.requiresManual) {
                    results.requiresManual.push({
                        payoutId,
                        teacherName: teacher.name,
                        amount: payout.finalPayoutUSD,
                        method: result.method,
                        reason: result.message
                    });
                }
            } catch (err) {
                results.failed.push({
                    payoutId,
                    error: err.message
                });
            }
        }

        res.json({
            success: true,
            summary: {
                total: payoutIds.length,
                successful: results.successful.length,
                failed: results.failed.length,
                requiresManual: results.requiresManual.length
            },
            results
        });
    } catch (error) {
        console.error('[AdminPayouts] Error execute-batch:', error);
        res.status(500).json({ success: false, error: 'Error interno' });
    }
});

/**
 * POST /api/admin/payouts/:id/adjustment
 * Agregar ajuste al payout
 */
router.post('/:id/adjustment', authMiddleware, adminOnly, async (req, res) => {
    try {
        const { description, amountUSD } = req.body;

        if (!description || amountUSD === undefined) {
            return res.status(400).json({ 
                success: false, 
                error: 'Se requiere descripción y monto' 
            });
        }

        const payout = await TeacherPayout.findById(req.params.id);
        if (!payout) {
            return res.status(404).json({ success: false, error: 'Payout no encontrado' });
        }

        if (!['calculating', 'pending-review'].includes(payout.status)) {
            return res.status(400).json({ 
                success: false, 
                error: 'No se pueden agregar ajustes a payouts aprobados o pagados' 
            });
        }

        await payout.addAdjustment(description, amountUSD, req.user._id);

        res.json({ 
            success: true, 
            payout,
            message: `Ajuste de $${amountUSD} USD agregado`
        });
    } catch (error) {
        console.error('[AdminPayouts] Error adjustment:', error);
        res.status(500).json({ success: false, error: 'Error interno' });
    }
});

/**
 * POST /api/admin/payouts/generate-monthly
 * Generar payouts mensuales manualmente (para testing o forzar generación)
 */
router.post('/generate-monthly', authMiddleware, adminOnly, async (req, res) => {
    try {
        const { year, month } = req.body;
        
        // Usar mes anterior si no se especifica
        const targetDate = year && month 
            ? new Date(year, month - 1, 1)
            : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        
        const periodStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
        const periodEnd = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0, 23, 59, 59);

        // Encontrar todas las sesiones pagables del período
        const sessions = await ClassSession.find({
            status: { $in: ['completed', 'student-noshow'] },
            completedAt: { $gte: periodStart, $lte: periodEnd },
            payoutStatus: { $in: ['pending', 'in-batch'] }
        }).populate('teacherId');

        // Agrupar por profesor
        const sessionsByTeacher = {};
        sessions.forEach(session => {
            const tId = session.teacherId._id.toString();
            if (!sessionsByTeacher[tId]) {
                sessionsByTeacher[tId] = [];
            }
            sessionsByTeacher[tId].push(session);
        });

        const results = [];

        for (const [teacherId, teacherSessions] of Object.entries(sessionsByTeacher)) {
            // Obtener o crear payout
            const payout = await TeacherPayout.getOrCreateForPeriod(
                teacherId, periodStart, periodEnd
            );

            // Agregar sesiones
            for (const session of teacherSessions) {
                await payout.addSession(session);
                session.payoutStatus = 'in-batch';
                session.payoutBatchId = payout._id;
                await session.save();
            }

            // Marcar como listo para revisión
            if (payout.status === 'calculating') {
                payout.status = 'pending-review';
                payout.statusHistory.push({
                    status: 'pending-review',
                    notes: 'Generado automáticamente'
                });
                await payout.save();
            }

            results.push({
                teacherId,
                payoutId: payout._id,
                sessions: teacherSessions.length,
                amount: payout.finalPayoutUSD
            });
        }

        res.json({
            success: true,
            message: `Generados ${results.length} payouts para ${periodStart.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })}`,
            results
        });
    } catch (error) {
        console.error('[AdminPayouts] Error generate:', error);
        res.status(500).json({ success: false, error: 'Error interno' });
    }
});

/**
 * GET /api/admin/payouts/platform-earnings
 * Ganancias de la plataforma (comisiones 20%)
 */
router.get('/platform-earnings', authMiddleware, adminOnly, async (req, res) => {
    try {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

        // Comisiones de clases confirmadas (escrow y pagadas)
        const confirmedCommissions = await ClassSession.aggregate([
            { 
                $match: { 
                    status: { $in: ['confirmed', 'paid'] }
                } 
            },
            { 
                $group: { 
                    _id: null, 
                    total: { $sum: '$platformFeeUSD' },
                    count: { $sum: 1 }
                } 
            }
        ]);

        // Comisiones este mes
        const thisMonthCommissions = await ClassSession.aggregate([
            { 
                $match: { 
                    status: { $in: ['confirmed', 'paid'] },
                    confirmedAt: { $gte: startOfMonth }
                } 
            },
            { 
                $group: { 
                    _id: null, 
                    total: { $sum: '$platformFeeUSD' },
                    count: { $sum: 1 }
                } 
            }
        ]);

        // Comisiones mes pasado
        const lastMonthCommissions = await ClassSession.aggregate([
            { 
                $match: { 
                    status: { $in: ['confirmed', 'paid'] },
                    confirmedAt: { $gte: startOfLastMonth, $lte: endOfLastMonth }
                } 
            },
            { 
                $group: { 
                    _id: null, 
                    total: { $sum: '$platformFeeUSD' },
                    count: { $sum: 1 }
                } 
            }
        ]);

        // Comisiones pendientes de confirmación (aún en validación)
        const pendingCommissions = await ClassSession.aggregate([
            { 
                $match: { 
                    status: 'pending-validation'
                } 
            },
            { 
                $group: { 
                    _id: null, 
                    total: { $sum: '$platformFeeUSD' },
                    count: { $sum: 1 }
                } 
            }
        ]);

        // Total pagado a profesores
        const totalPaidToTeachers = await TeacherPayout.aggregate([
            { $match: { status: 'paid' } },
            { $group: { _id: null, total: { $sum: '$finalPayoutUSD' } } }
        ]);

        // Ganancias por mes (últimos 6 meses)
        const monthlyEarnings = await ClassSession.aggregate([
            {
                $match: {
                    status: { $in: ['confirmed', 'paid'] },
                    confirmedAt: { $gte: new Date(now.getFullYear(), now.getMonth() - 5, 1) }
                }
            },
            {
                $group: {
                    _id: {
                        year: { $year: '$confirmedAt' },
                        month: { $month: '$confirmedAt' }
                    },
                    platformFees: { $sum: '$platformFeeUSD' },
                    teacherPayouts: { $sum: '$teacherPayoutUSD' },
                    classCount: { $sum: 1 }
                }
            },
            { $sort: { '_id.year': -1, '_id.month': -1 } }
        ]);

        res.json({
            success: true,
            earnings: {
                // Totales históricos
                totalEarned: confirmedCommissions[0]?.total || 0,
                totalClasses: confirmedCommissions[0]?.count || 0,
                
                // Este mes
                thisMonth: {
                    earned: thisMonthCommissions[0]?.total || 0,
                    classes: thisMonthCommissions[0]?.count || 0
                },
                
                // Mes pasado
                lastMonth: {
                    earned: lastMonthCommissions[0]?.total || 0,
                    classes: lastMonthCommissions[0]?.count || 0
                },
                
                // Pendiente de validación (potencial)
                pending: {
                    potential: pendingCommissions[0]?.total || 0,
                    classes: pendingCommissions[0]?.count || 0
                },
                
                // Pagado a profesores
                paidToTeachers: totalPaidToTeachers[0]?.total || 0,
                
                // Histórico mensual
                monthly: monthlyEarnings.map(m => ({
                    period: `${m._id.year}-${String(m._id.month).padStart(2, '0')}`,
                    platformFees: m.platformFees,
                    teacherPayouts: m.teacherPayouts,
                    classCount: m.classCount
                }))
            }
        });
    } catch (error) {
        console.error('[AdminPayouts] Error platform-earnings:', error);
        res.status(500).json({ success: false, error: 'Error interno' });
    }
});

/**
 * POST /api/admin/payouts/:id/verify-invoice
 * Admin verifica el documento tributario del profesor
 */
router.post('/:id/verify-invoice', authMiddleware, adminOnly, async (req, res) => {
    try {
        const { notes } = req.body;
        
        const payout = await TeacherPayout.findById(req.params.id)
            .populate('teacherId', 'name email');
        
        if (!payout) {
            return res.status(404).json({ success: false, error: 'Payout no encontrado' });
        }

        if (!payout.invoice || payout.invoice.status !== 'submitted') {
            return res.status(400).json({ 
                success: false, 
                error: 'No hay documento pendiente de verificación' 
            });
        }

        // Marcar como verificado
        payout.invoice.status = 'verified';
        payout.invoice.verifiedAt = new Date();
        payout.invoice.verifiedBy = req.user._id;

        payout.statusHistory.push({
            status: payout.status,
            changedBy: req.user._id,
            notes: `Documento verificado: ${payout.invoice.type} #${payout.invoice.number}${notes ? ` - ${notes}` : ''}`
        });

        await payout.save();

        console.log(`[AdminPayouts] Admin ${req.user.email} verificó documento de payout ${payout._id}`);

        res.json({
            success: true,
            message: 'Documento verificado. Ahora puede ejecutar el pago.',
            invoice: payout.invoice
        });
    } catch (error) {
        console.error('[AdminPayouts] Error verify-invoice:', error);
        res.status(500).json({ success: false, error: 'Error interno' });
    }
});

/**
 * POST /api/admin/payouts/:id/reject-invoice
 * Admin rechaza el documento tributario
 */
router.post('/:id/reject-invoice', authMiddleware, adminOnly, async (req, res) => {
    try {
        const { reason } = req.body;
        
        if (!reason) {
            return res.status(400).json({ 
                success: false, 
                error: 'Debe indicar la razón del rechazo' 
            });
        }
        
        const payout = await TeacherPayout.findById(req.params.id)
            .populate('teacherId', 'name email');
        
        if (!payout) {
            return res.status(404).json({ success: false, error: 'Payout no encontrado' });
        }

        if (!payout.invoice || payout.invoice.status !== 'submitted') {
            return res.status(400).json({ 
                success: false, 
                error: 'No hay documento pendiente de verificación' 
            });
        }

        // Marcar como rechazado
        payout.invoice.status = 'rejected';
        payout.invoice.rejectedAt = new Date();
        payout.invoice.rejectedBy = req.user._id;
        payout.invoice.rejectionReason = reason;

        payout.statusHistory.push({
            status: payout.status,
            changedBy: req.user._id,
            notes: `Documento rechazado: ${reason}`
        });

        await payout.save();

        // TODO: Notificar al profesor por email

        console.log(`[AdminPayouts] Admin ${req.user.email} rechazó documento de payout ${payout._id}: ${reason}`);

        res.json({
            success: true,
            message: 'Documento rechazado. El profesor será notificado para que envíe uno nuevo.',
            invoice: payout.invoice
        });
    } catch (error) {
        console.error('[AdminPayouts] Error reject-invoice:', error);
        res.status(500).json({ success: false, error: 'Error interno' });
    }
});

/**
 * GET /api/admin/payouts/pending-invoices
 * Listar payouts con documentos pendientes de verificación
 */
router.get('/pending-invoices', authMiddleware, adminOnly, async (req, res) => {
    try {
        const payouts = await TeacherPayout.find({
            'invoice.status': 'submitted'
        })
        .populate('teacherId', 'name email teacherData.paymentInfo')
        .sort({ 'invoice.submittedAt': 1 });

        res.json({
            success: true,
            count: payouts.length,
            payouts: payouts.map(p => ({
                _id: p._id,
                teacher: {
                    name: p.teacherId?.name,
                    email: p.teacherId?.email
                },
                period: p.periodLabel,
                amount: p.finalPayoutUSD,
                amountFormatted: `$${(p.finalPayoutUSD / 100).toFixed(2)} USD`,
                status: p.status,
                invoice: p.invoice,
                paymentMethod: p.teacherId?.teacherData?.paymentInfo?.method || 'no configurado'
            }))
        });
    } catch (error) {
        console.error('[AdminPayouts] Error pending-invoices:', error);
        res.status(500).json({ success: false, error: 'Error interno' });
    }
});

module.exports = router;
