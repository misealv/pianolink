/**
 * _fix_jose_subscription.js
 * Crea un StudentSubscription activo para José Wilhelmy con Miguel Antonio.
 * Datos: 50 clases, Plan Anual, pago recibido externamente.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const StudentSubscription = require('./models/StudentSubscription');
const Payment = require('./models/Payment');
const User = require('./models/User');

const JOSE_ID   = '69f458a4ed8946b42b2f2abe';
const MIGUEL_ID = '693dcdfb8189f12ab33f4747';
const PACKAGE_ID = '69f458b5354f629d942ac25f'; // Plan Anual 50 clases — Prepago Transferencia
const CLASS_COUNT = 50;
const VALIDITY_DAYS = 365;
const AMOUNT_USD = 100;

async function run() {
    await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
    console.log('[OK] Conectado a MongoDB');

    // Verificar que no exista ya
    const existing = await StudentSubscription.findOne({ studentId: JOSE_ID, teacherId: MIGUEL_ID, status: 'active' }).lean();
    if (existing) {
        console.log('[SKIP] Ya existe StudentSubscription activo:', existing._id);
        await mongoose.disconnect();
        return;
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + VALIDITY_DAYS * 24 * 60 * 60 * 1000);

    // Crear pago de auditoría
    const payment = await Payment.create({
        type: 'class_payment',
        userId: JOSE_ID,
        provider: 'manual',
        externalPaymentId: `manual_jose_${Date.now()}`,
        status: 'approved',
        amount: AMOUNT_USD,
        currency: 'USD',
        description: `Manual grant: ${CLASS_COUNT} clases con Miguel Antonio`,
        metadata: {
            grantedBy: null,
            teacherId: MIGUEL_ID,
            packageId: PACKAGE_ID,
            paymentMethod: 'bank_transfer',
            notes: 'Asignación inicial — fix dashboard',
            commissionWaived: true
        }
    });
    console.log('[OK] Payment creado:', payment._id);

    // Crear suscripción
    const sub = await StudentSubscription.create({
        studentId: JOSE_ID,
        teacherId: MIGUEL_ID,
        packageId: PACKAGE_ID,
        category: 'piano',
        classesTotal: CLASS_COUNT,
        classesRemaining: CLASS_COUNT,
        classesCompleted: 0,
        totalPaidUSD: AMOUNT_USD,
        escrowBalanceUSD: 0,
        releasedToTeacherUSD: AMOUNT_USD,
        platformFeeCollectedUSD: 0,
        paymentProvider: 'manual',
        autoRenew: false,
        status: 'active',
        startsAt: now,
        expiresAt,
        statusHistory: [{
            status: 'active',
            changedAt: now,
            changedBy: null,
            reason: 'Manual grant inicial vía script fix'
        }]
    });
    console.log('[OK] StudentSubscription creado:', sub._id);

    // Vincular pago
    await Payment.findByIdAndUpdate(payment._id, { subscriptionId: sub._id });

    // Actualizar user.classesRemaining para compatibilidad con legacy endpoints
    await User.updateOne({ _id: JOSE_ID }, { $set: { classesRemaining: CLASS_COUNT } });
    console.log('[OK] User.classesRemaining actualizado a', CLASS_COUNT);

    console.log('\n=== RESULTADO ===');
    console.log('José Wilhelmy ahora tiene:');
    console.log(`  - StudentSubscription: ${sub._id}`);
    console.log(`  - Clases: ${CLASS_COUNT} con Miguel Antonio`);
    console.log(`  - Vence: ${expiresAt.toISOString().split('T')[0]}`);

    await mongoose.disconnect();
}

run().catch(err => {
    console.error('[ERROR]', err.message);
    process.exit(1);
});
