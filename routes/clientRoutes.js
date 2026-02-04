/**
 * routes/clientRoutes.js
 * Rutas para el panel de clientes (estudiantes/apoderados)
 */

const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const User = require('../models/User');
const WelcomeKit = require('../models/WelcomeKit');

/**
 * GET /api/client/me
 * Obtener datos del cliente autenticado
 */
router.get('/me', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user._id)
            .select('-password')
            .lean();

        if (!user) {
            return res.status(404).json({ message: 'Usuario no encontrado' });
        }

        // Calcular totales de clases
        let totalClassesRemaining = 0;
        let totalClassesUsed = 0;

        if (user.clientData?.managedStudents?.length > 0) {
            user.clientData.managedStudents.forEach(student => {
                totalClassesRemaining += student.classesRemaining || 0;
                totalClassesUsed += student.classesUsed || 0;
            });
        }

        res.json({
            ...user,
            summary: {
                totalClassesRemaining,
                totalClassesUsed,
                totalStudents: user.clientData?.managedStudents?.length || 0
            }
        });
    } catch (error) {
        console.error('[CLIENT] Error obteniendo datos:', error);
        res.status(500).json({ message: 'Error interno del servidor' });
    }
});

/**
 * GET /api/client/payments
 * Historial de pagos del cliente
 */
router.get('/payments', protect, async (req, res) => {
    try {
        // Buscar kits comprados por este usuario
        const kits = await WelcomeKit.find({ userId: req.user._id })
            .select('payment kitType createdAt')
            .sort({ createdAt: -1 })
            .lean();

        const payments = kits.map(kit => ({
            id: kit._id,
            date: kit.createdAt,
            type: 'Welcome Kit',
            kitType: kit.kitType,
            amount: kit.payment?.amount || 0,
            currency: kit.payment?.currency || 'USD',
            status: kit.payment?.status || 'unknown',
            provider: kit.payment?.provider || 'paypal',
            orderId: kit.payment?.externalOrderId
        }));

        res.json({
            payments,
            total: payments.length
        });
    } catch (error) {
        console.error('[CLIENT] Error obteniendo pagos:', error);
        res.status(500).json({ message: 'Error interno del servidor' });
    }
});

/**
 * GET /api/client/subscription
 * Estado de suscripción del cliente
 */
router.get('/subscription', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user._id).lean();

        // Determinar estado de pago basado en clases restantes
        let totalClassesRemaining = 0;
        if (user.clientData?.managedStudents?.length > 0) {
            user.clientData.managedStudents.forEach(student => {
                totalClassesRemaining += student.classesRemaining || 0;
            });
        }

        const paymentStatus = totalClassesRemaining > 0 ? 'active' : 'needs_payment';

        res.json({
            status: paymentStatus,
            classesRemaining: totalClassesRemaining,
            kitPurchased: user.kitPurchased || false,
            kitPurchaseDate: user.kitPurchaseDate || null,
            message: paymentStatus === 'active' 
                ? `Tienes ${totalClassesRemaining} clase(s) disponible(s)`
                : 'No tienes clases disponibles. ¡Compra más clases!'
        });
    } catch (error) {
        console.error('[CLIENT] Error obteniendo suscripción:', error);
        res.status(500).json({ message: 'Error interno del servidor' });
    }
});

module.exports = router;
