/**
 * FASE 5 — Regression test: flujo de reserva usa StudentSubscription (no User.classesRemaining)
 *
 * Verifica el caso "José Wilhelmy reserva clases con Miguel".
 * No usa BookingService directamente (requiere contexto HTTP) — valida la lógica
 * a nivel de query que BookingService usaría internamente.
 *
 * Uso: node scripts/fase5-regression.js
 * Incluye rollback automático — no deja cambios en la BD.
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MIGUEL_ID = '693dcdfb8189f12ab33f4747';

let JOSE_ID; // se carga dinámicamente para evitar ID hardcodeado incorrecto

let passed = 0;
let failed = 0;

function assert(label, condition, detail = '') {
    if (condition) {
        console.log(`  ✅ ${label}`);
        passed++;
    } else {
        console.log(`  ❌ ${label}${detail ? ': ' + detail : ''}`);
        failed++;
    }
}

async function run() {
    await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);

    const User                = require('../models/User');
    const StudentSubscription = require('../models/StudentSubscription');
    const TimeSlot            = require('../models/TimeSlot');

    const joseUser = await User.findOne({ email: 'josewilhelmy@gmail.com' }, '_id').lean();
    if (!joseUser) { console.error('José no encontrado en BD'); process.exit(1); }
    JOSE_ID = joseUser._id.toString();
    console.log(`  JOSE_ID resuelto: ${JOSE_ID}`);
    console.log(`  MIGUEL_ID: ${MIGUEL_ID}`);

    // ─────────────────────────────────────────────────────
    // TEST 1: José tiene StudentSubscription activa (post-migración)
    // ─────────────────────────────────────────────────────
    console.log('\n== TEST 1: José tiene StudentSubscription activa ==');
    const sub = await StudentSubscription.findOne({
        studentId: JOSE_ID,
        teacherId: MIGUEL_ID,
        status: 'active',
        classesRemaining: { $gt: 0 },
        expiresAt: { $gt: new Date() }
    }).lean();

    assert('Sub existe', !!sub, 'No se encontró StudentSubscription activa');
    if (sub) {
        assert('classesRemaining >= 3', sub.classesRemaining >= 3, `fue ${sub.classesRemaining}`);
        assert('paymentProvider = manual', sub.paymentProvider === 'manual', sub.paymentProvider);
        assert('autoRenew = false', sub.autoRenew === false);
        assert('expiresAt ~1 año', (() => {
            const diff = new Date(sub.expiresAt) - new Date();
            return diff > 0 && diff < 366 * 24 * 60 * 60 * 1000;
        })());
    }

    // ─────────────────────────────────────────────────────
    // TEST 2: User.classesRemaining de José fue puesto a 0
    // ─────────────────────────────────────────────────────
    console.log('\n== TEST 2: User.classesRemaining de José = 0 ==');
    const jose = await User.findById(JOSE_ID, 'classesRemaining name').lean();
    assert('José encontrado', !!jose);
    assert('classesRemaining = 0 (migrado a sub)', jose?.classesRemaining === 0, `fue ${jose?.classesRemaining}`);

    // ─────────────────────────────────────────────────────
    // TEST 3: BookingService ELEGIRÍA la sub (simular la query que hace)
    // ─────────────────────────────────────────────────────
    console.log('\n== TEST 3: Query de BookingService retorna la sub ==');
    const bookingSub = await StudentSubscription.findOne({
        studentId: JOSE_ID,
        teacherId: MIGUEL_ID,
        status: 'active',
        classesRemaining: { $gt: 0 },
        expiresAt: { $gt: new Date() }
    }).lean();
    assert('BookingService encontraría sub activa', !!bookingSub);
    assert('NO caería al fallback classesRemaining', !!bookingSub, 'sub no encontrada → fallback');

    // ─────────────────────────────────────────────────────
    // TEST 4: Simular consumo y devolución (con transacción, rollback)
    // ─────────────────────────────────────────────────────
    console.log('\n== TEST 4: Consumo de clase (con rollback) ==');
    if (!sub) {
        console.log('  ⚠️  Saltado — no hay sub activa');
    } else {
        const session = await mongoose.startSession();
        session.startTransaction();
        try {
            const before = await StudentSubscription.findById(sub._id).session(session);
            const classesBefore = before.classesRemaining;

            await StudentSubscription.findByIdAndUpdate(
                sub._id,
                { $inc: { classesRemaining: -1, classesCompleted: 1 } },
                { session, new: true }
            );

            const after = await StudentSubscription.findById(sub._id).session(session);
            assert('Clase descontada correctamente', after.classesRemaining === classesBefore - 1,
                `${classesBefore} → ${after.classesRemaining}`);

            await session.abortTransaction();  // rollback — mantiene BD limpia
            const restored = await StudentSubscription.findById(sub._id).lean();
            assert('Rollback OK (clases restauradas)', restored.classesRemaining === classesBefore,
                `esperado ${classesBefore}, fue ${restored.classesRemaining}`);
        } catch (err) {
            await session.abortTransaction();
            assert('Consumo sin error', false, err.message);
        } finally {
            session.endSession();
        }
    }

    // TEST 5: Hay slots disponibles y el SCHEMA soporta sourceTimezone
    console.log('\n== TEST 5: Slots disponibles + sourceTimezone en schema ==');
    const future = new Date();
    future.setDate(future.getDate() + 1);
    const availableSlots = await TimeSlot.countDocuments({
        teacherId: MIGUEL_ID,
        status: 'available',
        startTime: { $gt: future }
    });
    assert('Hay slots futuros disponibles', availableSlots > 0, `encontrados: ${availableSlots}`);

    // Verificar que el schema tiene sourceTimezone definido (usando un doc temporal)
    const testSlotDoc = new TimeSlot({
        teacherId: MIGUEL_ID,
        startTime: new Date(Date.now() + 86400000),
        endTime: new Date(Date.now() + 86400000 + 3600000),
        duration: 60,
        status: 'available'
    });
    assert('Schema tiene sourceTimezone con default America/Santiago',
        testSlotDoc.sourceTimezone === 'America/Santiago',
        `fue ${testSlotDoc.sourceTimezone}`);
    // No guardamos el doc test

    // ─────────────────────────────────────────────────────
    console.log(`\n${'='.repeat(50)}`);
    console.log(`REGRESSION FASE 5 (José Wilhelmy): ${passed} passed | ${failed} failed`);
    if (failed === 0) {
        console.log('✅ FASE 5 — VERIFICADA');
    } else {
        console.log('❌ Hay fallos. Revisar migración.');
        process.exitCode = 1;
    }

    await mongoose.disconnect();
}

run().catch(e => { console.error(e); process.exit(1); });
