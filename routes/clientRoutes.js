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

        if (user.role === 'student') {
            // El usuario es estudiante directo
            totalClassesRemaining = user.classesRemaining || 0;
            totalClassesUsed = user.classesCompleted || 0;
        } else if (user.clientData?.managedStudents?.length > 0) {
            // El usuario es guardian/client con estudiantes gestionados
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
        // Buscar kits comprados por este usuario (clientId o por email)
        const kits = await WelcomeKit.find({
            $or: [
                { clientId: req.user._id },
                { clientEmail: req.user.email?.toLowerCase() }
            ]
        })
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
        
        if (user.role === 'student') {
            // El usuario es estudiante directo
            totalClassesRemaining = user.classesRemaining || 0;
        } else if (user.clientData?.managedStudents?.length > 0) {
            // El usuario es guardian/client con estudiantes gestionados
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

/**
 * GET /api/client/orders
 * Obtener pedidos del cliente con tracking de envío
 */
router.get('/orders', protect, async (req, res) => {
    try {
        // Buscar kits por clientId o por email del usuario
        const kits = await WelcomeKit.find({
            $or: [
                { clientId: req.user._id },
                { clientEmail: req.user.email?.toLowerCase() }
            ]
        })
        .select('kitType products cable shipping setupSession payment createdAt')
        .sort({ createdAt: -1 })
        .lean();

        const orders = kits.map(kit => {
            // Determinar productos incluidos
            const products = [];
            
            // Productos del kit (nuevo sistema)
            if (kit.products?.length > 0) {
                kit.products.forEach(p => {
                    products.push({
                        name: p.name,
                        type: 'physical',
                        image: p.image,
                        priceAtPurchase: p.priceAtPurchase
                    });
                });
            } else if (kit.cable && kit.cable.type !== 'NONE' && !kit.cable.alreadyHasCable) {
                // Fallback: Cable MIDI legacy (solo si no hay productos nuevos)
                const cableNames = {
                    'USB_B': 'Cable USB Tipo B (estándar)',
                    'MIDI_5PIN': 'Interfaz MIDI 5 pines',
                    'MICRO_USB': 'Cable Micro USB',
                    'USB_C': 'Cable USB Tipo C'
                };
                products.push({
                    name: cableNames[kit.cable.type] || 'Cable MIDI',
                    type: 'physical',
                    keyboardModel: kit.cable.keyboardModel
                });
            }
            
            // Servicios incluidos
            products.push({
                name: 'Sesión de Setup (30 min)',
                type: 'service',
                status: kit.setupSession?.status || 'not_scheduled',
                scheduledAt: kit.setupSession?.scheduledAt
            });
            
            products.push({
                name: 'Clase de Prueba',
                type: 'service',
                status: 'included'
            });

            return {
                id: kit._id,
                orderDate: kit.createdAt,
                kitType: kit.kitType,
                products,
                shipping: kit.shipping ? {
                    status: kit.shipping.status,
                    carrier: kit.shipping.carrier,
                    trackingNumber: kit.shipping.trackingNumber,
                    trackingUrl: kit.shipping.trackingUrl,
                    shippedAt: kit.shipping.shippedAt,
                    estimatedDelivery: kit.shipping.estimatedDelivery,
                    deliveredAt: kit.shipping.deliveredAt,
                    clientConfirmedReceipt: kit.shipping.clientConfirmedReceipt || false,
                    address: kit.shipping.address ? {
                        city: kit.shipping.address.city,
                        country: kit.shipping.address.country
                    } : null
                } : null,
                payment: {
                    amount: kit.payment?.amount,
                    currency: kit.payment?.currency || 'USD',
                    paidAt: kit.payment?.paidAt
                }
            };
        });

        res.json({
            orders,
            total: orders.length
        });
    } catch (error) {
        console.error('[CLIENT] Error obteniendo pedidos:', error);
        res.status(500).json({ message: 'Error interno del servidor' });
    }
});

/**
 * POST /api/client/orders/:orderId/confirm-receipt
 * Confirmar recepción del pedido
 */
router.post('/orders/:orderId/confirm-receipt', protect, async (req, res) => {
    try {
        const kit = await WelcomeKit.findOne({
            _id: req.params.orderId,
            $or: [
                { clientId: req.user._id },
                { clientEmail: req.user.email?.toLowerCase() }
            ]
        });

        if (!kit) {
            return res.status(404).json({ message: 'Pedido no encontrado' });
        }

        // Actualizar estado
        kit.shipping.status = 'delivered';
        kit.shipping.clientConfirmedReceipt = true;
        kit.shipping.clientConfirmedAt = new Date();
        kit.shipping.deliveredAt = kit.shipping.deliveredAt || new Date();
        kit.overallStatus = 'delivered';
        await kit.save();

        // Notificar al admin por consola (se puede expandir a email/webhook)
        console.log(`[CLIENT] ✅ Cliente confirmó recepción: ${kit.clientName || req.user.name} - Pedido ${kit._id}`);

        // Opcional: Enviar email al admin
        try {
            const { Resend } = require('resend');
            const resend = new Resend(process.env.RESEND_API_KEY);
            
            await resend.emails.send({
                from: process.env.EMAIL_FROM || 'PianoLink <onboarding@resend.dev>',
                to: 'admin@pianolink.cl', // Cambiar por email real del admin
                subject: `✅ Pedido entregado - ${kit.clientName || 'Cliente'}`,
                html: `
                    <h2>📦 El cliente confirmó que recibió su pedido</h2>
                    <p><strong>Cliente:</strong> ${kit.clientName || req.user.name}</p>
                    <p><strong>Email:</strong> ${kit.clientEmail || req.user.email}</p>
                    <p><strong>Pedido ID:</strong> ${kit._id}</p>
                    <p><strong>Fecha confirmación:</strong> ${new Date().toLocaleString('es-CL')}</p>
                    <hr>
                    <p style="color: #22c55e;">✓ El estado del pedido ha sido actualizado a "Entregado"</p>
                `
            });
        } catch (emailError) {
            console.error('[CLIENT] Error enviando email de notificación:', emailError.message);
        }

        res.json({
            success: true,
            message: '¡Gracias por confirmar la recepción!'
        });
    } catch (error) {
        console.error('[CLIENT] Error confirmando recepción:', error);
        res.status(500).json({ message: 'Error interno del servidor' });
    }
});

module.exports = router;
