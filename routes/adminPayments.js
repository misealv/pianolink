/**
 * routes/adminPayments.js
 * Rutas de administración para productos y pagos PayPal
 */

const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const Product = require('../models/Product');
const Payment = require('../models/Payment');
const Subscription = require('../models/Subscription');
const WebhookLog = require('../models/WebhookLog');

// Middleware de autenticación admin (simplificado)
const adminAuth = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).json({ success: false, error: 'No autorizado' });
    }
    // En producción, verificar JWT y rol admin
    next();
};

// Obtener access token de PayPal
async function getPayPalAccessToken() {
    const auth = Buffer.from(
        `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
    ).toString('base64');

    const baseUrl = process.env.PAYPAL_MODE === 'live'
        ? 'https://api-m.paypal.com'
        : 'https://api-m.sandbox.paypal.com';

    const response = await fetch(`${baseUrl}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'grant_type=client_credentials'
    });

    const data = await response.json();
    return data.access_token;
}

// ============================================
// PRODUCTOS
// ============================================

// Listar todos los productos
router.get('/products', adminAuth, async (req, res) => {
    try {
        const products = await Product.find().sort({ createdAt: -1 });
        res.json({ success: true, products });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Obtener un producto
router.get('/products/:id', adminAuth, async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) {
            return res.status(404).json({ success: false, error: 'Producto no encontrado' });
        }
        res.json({ success: true, product });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Crear producto
router.post('/products', adminAuth, async (req, res) => {
    try {
        const {
            name,
            slug,
            description,
            type,
            targetRole,
            price,
            currency,
            billingInterval,
            billingIntervalCount,
            benefits,
            metadata,
            requiresFounder,
            requiresKitPurchased,
            createInPayPal
        } = req.body;

        // Verificar slug único
        const existing = await Product.findOne({ slug });
        if (existing) {
            return res.status(400).json({ success: false, error: 'El slug ya existe' });
        }

        let paypalProductId = null;
        let paypalPlanId = null;

        // Crear en PayPal si se solicita
        if (createInPayPal) {
            const accessToken = await getPayPalAccessToken();
            const baseUrl = process.env.PAYPAL_MODE === 'live'
                ? 'https://api-m.paypal.com'
                : 'https://api-m.sandbox.paypal.com';

            // 1. Crear producto en PayPal
            const productResponse = await fetch(`${baseUrl}/v1/catalogs/products`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: name,
                    description: description || name,
                    type: 'SERVICE',
                    category: 'EDUCATIONAL_AND_TEXTBOOKS',
                    home_url: process.env.FRONTEND_URL || 'https://pianolink.onrender.com'
                })
            });

            const paypalProduct = await productResponse.json();
            
            if (!paypalProduct.id) {
                return res.status(500).json({ 
                    success: false, 
                    error: 'Error creando producto en PayPal',
                    details: paypalProduct
                });
            }

            paypalProductId = paypalProduct.id;

            // 2. Crear plan si es suscripción
            if (type === 'subscription') {
                const planResponse = await fetch(`${baseUrl}/v1/billing/plans`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        product_id: paypalProductId,
                        name: `Plan ${name}`,
                        description: description || name,
                        status: 'ACTIVE',
                        billing_cycles: [{
                            frequency: {
                                interval_unit: billingInterval || 'MONTH',
                                interval_count: billingIntervalCount || 1
                            },
                            tenure_type: 'REGULAR',
                            sequence: 1,
                            total_cycles: 0,
                            pricing_scheme: {
                                fixed_price: {
                                    value: price.toString(),
                                    currency_code: currency || 'USD'
                                }
                            }
                        }],
                        payment_preferences: {
                            auto_bill_outstanding: true,
                            setup_fee: { value: '0', currency_code: currency || 'USD' },
                            setup_fee_failure_action: 'CONTINUE',
                            payment_failure_threshold: 3
                        }
                    })
                });

                const paypalPlan = await planResponse.json();
                
                if (!paypalPlan.id) {
                    return res.status(500).json({ 
                        success: false, 
                        error: 'Error creando plan en PayPal',
                        details: paypalPlan
                    });
                }

                paypalPlanId = paypalPlan.id;
            }
        }

        // Crear producto en DB
        const product = await Product.create({
            name,
            slug,
            description,
            type,
            targetRole: targetRole || 'any',
            price,
            currency: currency || 'USD',
            billingInterval: type === 'subscription' ? (billingInterval || 'MONTH') : null,
            billingIntervalCount: type === 'subscription' ? (billingIntervalCount || 1) : null,
            paypalProductId,
            paypalPlanId,
            benefits: benefits || [],
            metadata: metadata || {},
            requiresFounder: requiresFounder || false,
            requiresKitPurchased: requiresKitPurchased || false,
            isActive: true
        });

        res.json({ 
            success: true, 
            product,
            paypal: {
                productId: paypalProductId,
                planId: paypalPlanId
            }
        });
    } catch (error) {
        console.error('[Admin] Error creando producto:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Actualizar producto
router.put('/products/:id', adminAuth, async (req, res) => {
    try {
        const updates = req.body;
        delete updates._id; // No actualizar _id

        const product = await Product.findByIdAndUpdate(
            req.params.id,
            updates,
            { new: true }
        );

        if (!product) {
            return res.status(404).json({ success: false, error: 'Producto no encontrado' });
        }

        res.json({ success: true, product });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Activar/Desactivar producto
router.patch('/products/:id/toggle', adminAuth, async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        
        if (!product) {
            return res.status(404).json({ success: false, error: 'Producto no encontrado' });
        }

        product.isActive = !product.isActive;
        await product.save();

        // Opcional: Desactivar/Activar plan en PayPal
        if (product.paypalPlanId) {
            try {
                const accessToken = await getPayPalAccessToken();
                const baseUrl = process.env.PAYPAL_MODE === 'live'
                    ? 'https://api-m.paypal.com'
                    : 'https://api-m.sandbox.paypal.com';

                await fetch(`${baseUrl}/v1/billing/plans/${product.paypalPlanId}/${product.isActive ? 'activate' : 'deactivate'}`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    }
                });
            } catch (ppError) {
                console.error('[Admin] Error actualizando plan en PayPal:', ppError);
            }
        }

        res.json({ 
            success: true, 
            product,
            message: `Producto ${product.isActive ? 'activado' : 'desactivado'}`
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Eliminar producto
router.delete('/products/:id', adminAuth, async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        
        if (!product) {
            return res.status(404).json({ success: false, error: 'Producto no encontrado' });
        }

        // No eliminar si tiene ventas
        if (product.stats.totalSales > 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'No se puede eliminar un producto con ventas. Desactívalo en su lugar.' 
            });
        }

        await product.deleteOne();

        res.json({ success: true, message: 'Producto eliminado' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// PAGOS Y SUSCRIPCIONES
// ============================================

// Dashboard de pagos
router.get('/payments/dashboard', adminAuth, async (req, res) => {
    try {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

        // Ingresos este mes
        const thisMonthPayments = await Payment.aggregate([
            {
                $match: {
                    status: 'approved',
                    createdAt: { $gte: startOfMonth }
                }
            },
            {
                $group: {
                    _id: null,
                    total: { $sum: '$amount' },
                    count: { $sum: 1 }
                }
            }
        ]);

        // Ingresos mes pasado
        const lastMonthPayments = await Payment.aggregate([
            {
                $match: {
                    status: 'approved',
                    createdAt: { $gte: startOfLastMonth, $lte: endOfLastMonth }
                }
            },
            {
                $group: {
                    _id: null,
                    total: { $sum: '$amount' },
                    count: { $sum: 1 }
                }
            }
        ]);

        // Suscripciones activas
        const activeSubscriptions = await Subscription.countDocuments({ status: 'active' });

        // Webhooks recientes
        const recentWebhooks = await WebhookLog.find()
            .sort({ createdAt: -1 })
            .limit(10)
            .select('provider eventType signatureValid processingResult createdAt');

        // Productos por ventas
        const productStats = await Product.find()
            .sort({ 'stats.totalRevenue': -1 })
            .limit(5)
            .select('name slug stats isActive');

        res.json({
            success: true,
            dashboard: {
                thisMonth: {
                    revenue: thisMonthPayments[0]?.total || 0,
                    transactions: thisMonthPayments[0]?.count || 0
                },
                lastMonth: {
                    revenue: lastMonthPayments[0]?.total || 0,
                    transactions: lastMonthPayments[0]?.count || 0
                },
                activeSubscriptions,
                recentWebhooks,
                topProducts: productStats
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Listar pagos
router.get('/payments', adminAuth, async (req, res) => {
    try {
        const { page = 1, limit = 20, status, provider } = req.query;
        
        const filter = {};
        if (status) filter.status = status;
        if (provider) filter.provider = provider;

        const payments = await Payment.find(filter)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(parseInt(limit))
            .populate('studentId', 'name email')
            .populate('teacherId', 'name email');

        const total = await Payment.countDocuments(filter);

        res.json({
            success: true,
            payments,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Listar suscripciones
router.get('/subscriptions', adminAuth, async (req, res) => {
    try {
        const { page = 1, limit = 20, status } = req.query;
        
        const filter = {};
        if (status) filter.status = status;

        const subscriptions = await Subscription.find(filter)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(parseInt(limit))
            .populate('studentId', 'name email')
            .populate('teacherId', 'name email');

        const total = await Subscription.countDocuments(filter);

        res.json({
            success: true,
            subscriptions,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Cancelar suscripción desde admin
router.post('/subscriptions/:id/cancel', adminAuth, async (req, res) => {
    try {
        const subscription = await Subscription.findById(req.params.id);
        
        if (!subscription) {
            return res.status(404).json({ success: false, error: 'Suscripción no encontrada' });
        }

        // Cancelar en PayPal si tiene ID externo
        if (subscription.externalSubscriptionId && subscription.paymentProvider === 'paypal') {
            try {
                const accessToken = await getPayPalAccessToken();
                const baseUrl = process.env.PAYPAL_MODE === 'live'
                    ? 'https://api-m.paypal.com'
                    : 'https://api-m.sandbox.paypal.com';

                await fetch(`${baseUrl}/v1/billing/subscriptions/${subscription.externalSubscriptionId}/cancel`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        reason: req.body.reason || 'Cancelado por administrador'
                    })
                });
            } catch (ppError) {
                console.error('[Admin] Error cancelando en PayPal:', ppError);
            }
        }

        subscription.status = 'cancelled';
        subscription.cancelledAt = new Date();
        subscription.cancellationReason = req.body.reason || 'Cancelado por administrador';
        await subscription.save();

        res.json({ success: true, subscription });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Webhooks logs
router.get('/webhooks', adminAuth, async (req, res) => {
    try {
        const { page = 1, limit = 50, provider } = req.query;
        
        const filter = {};
        if (provider) filter.provider = provider;

        const webhooks = await WebhookLog.find(filter)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(parseInt(limit));

        const total = await WebhookLog.countDocuments(filter);

        res.json({
            success: true,
            webhooks,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Sincronizar productos existentes de PayPal a DB
router.post('/sync-paypal-products', adminAuth, async (req, res) => {
    try {
        // Productos definidos en .env
        const envProducts = [
            {
                slug: 'kit-bienvenida',
                name: 'Kit de Bienvenida',
                description: 'Cable MIDI + Sesión setup + Clase prueba 30min',
                type: 'one-time',
                price: 15,
                targetRole: 'student',
                paypalProductId: process.env.PAYPAL_PRODUCT_KIT_BIENVENIDA,
                benefits: ['Cable MIDI de alta calidad', 'Sesión de setup personalizada', 'Clase de prueba 30 min'],
                metadata: {
                    includesCable: true,
                    includesSetup: true,
                    sessionDuration: 30
                }
            },
            {
                slug: 'membresia-profesor-fundador',
                name: 'Membresía Profesor Fundador',
                description: 'Acceso completo a la plataforma PianoLink',
                type: 'subscription',
                price: 10,
                targetRole: 'teacher',
                requiresFounder: true,
                billingInterval: 'MONTH',
                paypalProductId: process.env.PAYPAL_PRODUCT_TEACHER,
                paypalPlanId: process.env.PAYPAL_PLAN_TEACHER,
                benefits: ['Salas ilimitadas', 'MIDI sincronizado', 'Video en vivo', 'Biblioteca de partituras', 'Soporte prioritario']
            },
            {
                slug: 'membresia-clases-piano',
                name: 'Membresía Clases de Piano',
                description: '4 sesiones de 45 minutos por mes',
                type: 'subscription',
                price: 100,
                targetRole: 'student',
                billingInterval: 'MONTH',
                paypalProductId: process.env.PAYPAL_PRODUCT_STUDENT,
                paypalPlanId: process.env.PAYPAL_PLAN_STUDENT,
                benefits: ['4 sesiones de 45 minutos', 'Acceso 24/7 a materiales', 'MIDI sincronizado en vivo', 'Biblioteca de partituras'],
                metadata: {
                    sessionsIncluded: 4,
                    sessionDuration: 45
                }
            }
        ];

        const results = [];

        for (const prod of envProducts) {
            const existing = await Product.findOne({ slug: prod.slug });
            
            if (existing) {
                // Actualizar IDs de PayPal si cambiaron
                existing.paypalProductId = prod.paypalProductId;
                existing.paypalPlanId = prod.paypalPlanId;
                await existing.save();
                results.push({ slug: prod.slug, action: 'updated' });
            } else {
                // Crear nuevo
                await Product.create(prod);
                results.push({ slug: prod.slug, action: 'created' });
            }
        }

        res.json({ success: true, results });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/admin/payments/teachers-list
 * Lista de profesores activos (para selects en panel admin)
 */
router.get('/teachers-list', adminAuth, async (req, res) => {
    try {
        const User = require('../models/User');
        const teachers = await User.find(
            { role: 'teacher', isActive: { $ne: false } },
            'name email teacherData.plan'
        ).sort({ name: 1 }).lean();
        res.json({ success: true, teachers });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
