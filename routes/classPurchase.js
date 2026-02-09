const express = require('express');
const router = express.Router();
const User = require('../models/User');
const StudentEnrollment = require('../models/StudentEnrollment');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { protect } = require('../middleware/authMiddleware');

const PLATFORM_COMMISSION = 0.20; // 20% para PianoLink

/**
 * POST /api/class-purchase/create-checkout
 * Crea una sesión de Stripe Checkout para comprar clases
 */
router.post('/create-checkout', protect, async (req, res) => {
    try {
        const { teacherSlug, classes, discountPercent, validDays, total } = req.body;
        const studentId = req.user._id;

        // Validaciones
        if (!teacherSlug || !classes || classes < 1) {
            return res.status(400).json({
                success: false,
                error: 'Datos de compra incompletos'
            });
        }

        // Buscar profesor por slug
        const teacher = await User.findOne({
            'teacherData.profile.slug': teacherSlug,
            'teacherData.profile.isPublic': true,
            role: 'teacher'
        });

        if (!teacher) {
            return res.status(404).json({
                success: false,
                error: 'Profesor no encontrado'
            });
        }

        // Calcular precio basado en tarifa del profesor
        const teacherRate = teacher.teacherData?.hourlyRate || 25;
        const studentPrice = teacherRate / (1 - PLATFORM_COMMISSION); // 80% teacher = 100% student price
        
        // Aplicar descuento si hay paquete
        const discount = discountPercent || 0;
        const pricePerClass = studentPrice * (1 - discount / 100);
        const calculatedTotal = pricePerClass * classes;

        // Verificar que el total coincida (tolerancia de $1 por redondeo)
        if (Math.abs(calculatedTotal - total) > 1) {
            return res.status(400).json({
                success: false,
                error: 'El precio ha cambiado. Por favor recarga la página.'
            });
        }

        // Buscar o crear enrollment
        let enrollment = await StudentEnrollment.findOne({
            student: studentId,
            teacher: teacher._id
        });

        // Crear sesión de Stripe Checkout
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            mode: 'payment',
            customer_email: req.user.email,
            line_items: [{
                price_data: {
                    currency: 'usd',
                    product_data: {
                        name: `${classes} ${classes === 1 ? 'Clase' : 'Clases'} de Piano con ${teacher.name}`,
                        description: discount > 0 
                            ? `Paquete de ${classes} clases (${discount}% descuento)`
                            : `Clase individual de piano`,
                        images: [teacher.teacherData?.profile?.photo || 'https://pianolink.com/images/piano-class.jpg']
                    },
                    unit_amount: Math.round(calculatedTotal * 100) // Stripe usa centavos
                },
                quantity: 1
            }],
            metadata: {
                type: 'class_purchase',
                studentId: studentId.toString(),
                teacherId: teacher._id.toString(),
                classes: classes.toString(),
                discountPercent: discount.toString(),
                validDays: (validDays || 30).toString(),
                teacherRate: teacherRate.toString(),
                pricePerClass: pricePerClass.toFixed(2),
                enrollmentId: enrollment?._id?.toString() || 'new'
            },
            success_url: `${process.env.APP_URL || 'http://localhost:3000'}/compra-exitosa.html?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.APP_URL || 'http://localhost:3000'}/comprar-clases.html?profesor=${teacherSlug}&canceled=true`
        });

        console.log(`[ClassPurchase] Checkout creado: ${session.id} - ${classes} clases con ${teacher.name}`);

        res.json({
            success: true,
            sessionId: session.id,
            sessionUrl: session.url
        });

    } catch (error) {
        console.error('[ClassPurchase] Error:', error);
        res.status(500).json({
            success: false,
            error: 'Error al procesar la compra'
        });
    }
});

/**
 * POST /api/class-purchase/confirm
 * Confirma la compra después de pago exitoso (llamado por webhook o cliente)
 */
router.post('/confirm', protect, async (req, res) => {
    try {
        const { sessionId } = req.body;

        if (!sessionId) {
            return res.status(400).json({
                success: false,
                error: 'Session ID requerido'
            });
        }

        // Obtener sesión de Stripe
        const session = await stripe.checkout.sessions.retrieve(sessionId);

        if (session.payment_status !== 'paid') {
            return res.status(400).json({
                success: false,
                error: 'Pago no completado'
            });
        }

        // Verificar que el usuario sea el correcto
        if (session.metadata.studentId !== req.user._id.toString()) {
            return res.status(403).json({
                success: false,
                error: 'No autorizado'
            });
        }

        // Procesar la compra
        const result = await processClassPurchase(session);

        res.json({
            success: true,
            enrollment: result.enrollment,
            classesAdded: result.classesAdded
        });

    } catch (error) {
        console.error('[ClassPurchase] Error confirmando:', error);
        res.status(500).json({
            success: false,
            error: 'Error al confirmar la compra'
        });
    }
});

/**
 * GET /api/class-purchase/status/:sessionId
 * Verifica el estado de una compra
 */
router.get('/status/:sessionId', protect, async (req, res) => {
    try {
        const session = await stripe.checkout.sessions.retrieve(req.params.sessionId);
        
        res.json({
            success: true,
            status: session.payment_status,
            metadata: session.metadata
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Error al verificar estado'
        });
    }
});

/**
 * Procesa la compra después del pago exitoso
 * (Usado por webhook y confirmación manual)
 */
async function processClassPurchase(session) {
    const { studentId, teacherId, classes, discountPercent, validDays, teacherRate, pricePerClass } = session.metadata;
    
    const classCount = parseInt(classes);
    const rate = parseFloat(teacherRate);
    const totalAmount = session.amount_total / 100; // Convertir de centavos

    // Buscar o crear enrollment
    let enrollment = await StudentEnrollment.findOne({
        student: studentId,
        teacher: teacherId
    });

    if (!enrollment) {
        // Crear nuevo enrollment con tarifa congelada
        const now = new Date();
        const oneYearLater = new Date(now);
        oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);

        enrollment = new StudentEnrollment({
            student: studentId,
            teacher: teacherId,
            frozenRate: rate,
            rateFrozenAt: now,
            rateLockedUntil: oneYearLater,
            classesPurchased: 0,
            classesRemaining: 0,
            classesCompleted: 0,
            status: 'active'
        });
    }

    // Calcular ganancias
    const platformEarnings = totalAmount * PLATFORM_COMMISSION;
    const teacherEarnings = totalAmount - platformEarnings;

    // Calcular fecha de expiración
    const packageValidDays = parseInt(validDays) || 30;
    const expiresAt = new Date(Date.now() + (packageValidDays * 24 * 60 * 60 * 1000));

    // Registrar la compra
    enrollment.purchases.push({
        date: new Date(),
        classes: classCount,
        totalPaid: totalAmount,
        pricePerClass: parseFloat(pricePerClass),
        platformEarnings: platformEarnings,
        teacherEarnings: teacherEarnings,
        validDays: packageValidDays,
        expiresAt: expiresAt,
        stripeSessionId: session.id,
        stripePaymentIntent: session.payment_intent
    });

    // Actualizar contadores y fecha de expiración
    enrollment.classesPurchased += classCount;
    enrollment.classesRemaining += classCount;
    
    // Actualizar expiración global del enrollment
    // Si ya tenía clases, extender la fecha más lejana
    if (!enrollment.classesExpiresAt || expiresAt > enrollment.classesExpiresAt) {
        enrollment.classesExpiresAt = expiresAt;
    }

    await enrollment.save();

    console.log(`[ClassPurchase] ✅ Compra procesada: ${classCount} clases, Estudiante: ${studentId}, Profesor: ${teacherId}`);
    console.log(`[ClassPurchase] 💰 Ganancias - Profesor: $${teacherEarnings.toFixed(2)}, Plataforma: $${platformEarnings.toFixed(2)}`);

    return {
        enrollment,
        classesAdded: classCount
    };
}

// Exportar también la función para uso en webhook
router.processClassPurchase = processClassPurchase;

module.exports = router;
