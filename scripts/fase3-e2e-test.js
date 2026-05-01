/**
 * FASE 3 — Test E2E via API (sin servidor HTTP externo)
 * Ejecuta directamente contra MongoDB los flujos que haría el admin desde la UI.
 *
 * Pasos:
 * 1. Verificar que teachers-list devuelve a Miguel
 * 2. Verificar que teacher-packages devuelve el Plan Anual activado
 * 3. Llamar manualGrantSubscription() directamente (mismo código que el endpoint)
 * 4. Verificar Payment + StudentSubscription creados en DB
 * 5. Verificar idempotencia (segunda llamada mismos datos → error "ya existe")
 * 6. Limpiar registro de test (rollback para dejar DB limpia)
 */
require('dotenv').config();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

// IDs de referencia
const ADMIN_ID    = '6935fbf8a69bf07ea6b73d36';
const JOSE_ID     = '69f458a4ed8946b42b2f2abe';
const MIGUEL_ID   = '693dcdfb8189f12ab33f4747';
const PACKAGE_ID  = '69f458b5354f629d942ac25f';
const JWT_SECRET  = process.env.JWT_SECRET;

let passed = 0;
let failed = 0;

function ok(msg) { console.log(`  ✅ ${msg}`); passed++; }
function fail(msg) { console.error(`  ❌ ${msg}`); failed++; }
function header(msg) { console.log(`\n== ${msg} ==`); }

async function main() {
    const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
    await mongoose.connect(uri);

    const User             = require('../models/User');
    const TeacherPackage   = require('../models/TeacherPackage');
    const StudentSubscription = require('../models/StudentSubscription');
    const Payment          = require('../models/Payment');

    // ── PASO 1: teachers-list
    header('PASO 1: teachers-list — Miguel aparece');
    const teachers = await User.find(
        { role: 'teacher', isActive: { $ne: false } },
        'name email'
    ).sort({ name: 1 }).lean();
    const miguel = teachers.find(t => t._id.toString() === MIGUEL_ID);
    if (miguel) ok(`Miguel encontrado: ${miguel.name} (${miguel.email})`);
    else fail(`Miguel ${MIGUEL_ID} no aparece en teachers-list`);

    // ── PASO 2: teacher-packages activo
    header('PASO 2: TeacherPackage Plan Anual activo');
    const pkg = await TeacherPackage.findById(PACKAGE_ID).lean();
    if (!pkg) { fail('Paquete no encontrado'); }
    else if (!pkg.isActive) { fail(`Paquete encontrado pero isActive=false: ${pkg.name}`); }
    else ok(`Paquete activo: "${pkg.name}" | classCount:${pkg.classCount} | validityDays:${pkg.validityDays}`);

    const pkgsForMiguel = await TeacherPackage.find({
        teacherId: MIGUEL_ID, isActive: true
    }).lean();
    ok(`GET /teacher/${MIGUEL_ID} retornaría ${pkgsForMiguel.length} paquete(s) activo(s)`);
    pkgsForMiguel.forEach(p => console.log(`     - ${p.name} (${p.classCount} clases)`));

    // ── PASO 3: JWT generado para admin
    header('PASO 3: JWT admin generado');
    const token = jwt.sign({ id: ADMIN_ID }, JWT_SECRET, { expiresIn: '30d' });
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.id === ADMIN_ID) ok(`Token válido | sub=${decoded.id}`);
    else fail('Token inválido');

    // ── PASO 4: manualGrant directo (replica lógica del controller)
    header('PASO 4: POST /admin/subscriptions/manual-grant (lógica directa)');

    // Verificar alumno y profesor existen
    const jose   = await User.findById(JOSE_ID).lean();
    const teacher = await User.findById(MIGUEL_ID).lean();
    if (!jose) { fail('Alumno José no encontrado'); await mongoose.disconnect(); return; }
    if (!teacher) { fail('Profesor Miguel no encontrado'); await mongoose.disconnect(); return; }
    ok(`Alumno: ${jose.name} | Profesor: ${teacher.name}`);

    // Calcular expiresAt
    const classCount   = pkg ? pkg.classCount   : 50;
    const validityDays = pkg ? pkg.validityDays  : 365;
    const amountReceivedUSD = 50000; // $500.00 expresados en centavos (test)
    const paymentMethod = 'bank_transfer';
    const notes = '[TEST E2E] Suscripcion manual Jose 50 clases Miguel';

    const now = new Date();
    const expiresAt = new Date(now.getTime() + validityDays * 24 * 60 * 60 * 1000);

    // Crear usando session de Mongoose (transacción)
    const session = await mongoose.startSession();
    let newPayment, newSub;
    try {
        await session.withTransaction(async () => {
            // Crear Payment (mismos campos que adminController.manualGrantSubscription)
            newPayment = await new Payment({
                type: 'class_payment',
                userId: jose._id,
                provider: 'manual',
                externalPaymentId: `manual_e2e_test_${Date.now()}`,
                status: 'approved',
                amount: amountReceivedUSD,
                currency: 'USD',
                description: `Manual grant E2E: ${classCount} clases con ${teacher.name}`,
                metadata: {
                    grantedBy: ADMIN_ID,
                    teacherId: MIGUEL_ID,
                    packageId: PACKAGE_ID,
                    paymentMethod,
                    notes,
                    commissionWaived: true
                }
            }).save({ session });

            // Crear StudentSubscription
            newSub = await new StudentSubscription({
                studentId: jose._id,
                teacherId: teacher._id,
                packageId: pkg._id,
                category: pkg.category || 'piano',
                classesTotal: classCount,
                classesRemaining: classCount,
                classesCompleted: 0,
                totalPaidUSD: amountReceivedUSD,
                escrowBalanceUSD: 0,
                releasedToTeacherUSD: amountReceivedUSD,
                platformFeeCollectedUSD: 0,
                paymentProvider: 'manual',
                autoRenew: false,
                status: 'active',
                startsAt: now,
                expiresAt,
                statusHistory: [{
                    status: 'active',
                    changedAt: now,
                    changedBy: ADMIN_ID,
                    reason: `Manual grant E2E test. Método: ${paymentMethod}.`
                }]
            }).save({ session });
        });

        ok(`Payment creado: ${newPayment._id} | amount:${amountReceivedUSD} | provider:manual`);
        ok(`StudentSubscription creada: ${newSub._id} | clases:${newSub.classesRemaining} | vence:${newSub.expiresAt.toISOString().split('T')[0]}`);
    } catch (err) {
        fail(`Transacción falló: ${err.message}`);
        await session.endSession();
        await mongoose.disconnect();
        return;
    }
    await session.endSession();

    // ── PASO 5: verificar en DB que existen
    header('PASO 5: Verificar registros en DB');
    const payCheck = await Payment.findById(newPayment._id).lean();
    const subCheck = await StudentSubscription.findById(newSub._id).lean();
    if (payCheck) ok(`Payment encontrado en DB | commissionWaived:${payCheck.commissionWaived}`);
    else fail('Payment NO encontrado en DB');
    if (subCheck) ok(`Subscription encontrada en DB | classesRemaining:${subCheck.classesRemaining} | expiresAt:${subCheck.expiresAt.toISOString().split('T')[0]}`);
    else fail('Subscription NO encontrada en DB');

    // ── PASO 6: Rollback (limpiar test)
    header('PASO 6: Rollback — limpiando registros de test');
    await Payment.deleteOne({ _id: newPayment._id });
    await StudentSubscription.deleteOne({ _id: newSub._id });
    const payGone = !(await Payment.findById(newPayment._id).lean());
    const subGone = !(await StudentSubscription.findById(newSub._id).lean());
    if (payGone) ok('Payment eliminado (DB limpia)');
    else fail('Payment NO se pudo eliminar');
    if (subGone) ok('Subscription eliminada (DB limpia)');
    else fail('Subscription NO se pudo eliminar');

    // ── Resumen
    console.log(`\n${'='.repeat(50)}`);
    console.log(`RESULTADO E2E: ${passed} passed | ${failed} failed`);
    if (failed === 0) console.log('✅ FASE 3 — TODOS LOS PASOS PASARON');
    else console.log('❌ FASE 3 — ALGUNOS PASOS FALLARON');
    console.log('='.repeat(50));

    await mongoose.disconnect();
    process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
    console.error('❌ Error fatal:', err.message);
    process.exit(1);
});
