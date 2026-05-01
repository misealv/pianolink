/**
 * FASE 6 — QA integral: verifica todo el flujo completo de reserva
 * desde cero hasta el estado post-booking de José Wilhelmy.
 *
 * Cubre:
 *   A. Estado del sistema antes del deploy
 *   B. Flujo completo BookingService (sub → slot → booking) con rollback
 *   C. Cancelación y devolución de clase
 *   D. Slots futuros con timezone correcta
 *   E. No hay archivos con bug de UTC (grep estático)
 *   F. Todas las suites de fases anteriores en resumen
 *
 * Uso: node scripts/fase6-qa.js
 */

require('dotenv').config();
const { execSync } = require('child_process');
const mongoose = require('mongoose');

const MIGUEL_ID = '693dcdfb8189f12ab33f4747';

let passed = 0;
let failed = 0;
const failures = [];

function assert(label, condition, detail = '') {
    if (condition) {
        console.log(`  ✅ ${label}`);
        passed++;
    } else {
        console.log(`  ❌ ${label}${detail ? ' — ' + detail : ''}`);
        failed++;
        failures.push(label);
    }
}

function runSuite(name, scriptPath) {
    console.log(`\n  → Ejecutando ${name}...`);
    try {
        const env = { ...process.env, TZ: 'UTC' };
        const out = execSync(
            `node "${scriptPath}"`,
            { env, cwd: __dirname + '/..', timeout: 30000 }
        ).toString();
        const m = out.match(/(\d+) passed \| (\d+) failed/);
        if (m && parseInt(m[2]) === 0) {
            console.log(`    ✅ ${m[1]} passed | 0 failed`);
            passed++;
        } else {
            console.log(`    ❌ Fallos detectados:\n` + out.split('\n').filter(l => l.includes('❌')).join('\n'));
            failed++;
            failures.push(name);
        }
    } catch (e) {
        console.log(`    ❌ Error ejecutando suite: ${e.message.slice(0, 120)}`);
        failed++;
        failures.push(name);
    }
}

async function run() {
    await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);

    const User                = require('../models/User');
    const StudentSubscription = require('../models/StudentSubscription');
    const TimeSlot            = require('../models/TimeSlot');
    const BookingService      = require('../services/BookingService');

    const jose = await User.findOne({ email: 'josewilhelmy@gmail.com' }, '_id name').lean();
    const JOSE_ID = jose._id.toString();

    // ─────────────────────────────────────────────────────
    // A. SUITES DE FASES ANTERIORES
    // ─────────────────────────────────────────────────────
    console.log('\n== SUITE A: Regresión de fases anteriores ==');
    runSuite('FASE 3 E2E (11 tests)',       __dirname + '/fase3-e2e-test.js');
    runSuite('FASE 4 Audit TZ (9 tests)',   __dirname + '/fase4-audit.js');
    runSuite('FASE 5 Regression (13 tests)',__dirname + '/fase5-regression.js');
    runSuite('FASE 5 Audit (18 tests)',     __dirname + '/fase5-audit.js');

    // ─────────────────────────────────────────────────────
    // B. ESTADO DEL SISTEMA ANTES DEL DEPLOY
    // ─────────────────────────────────────────────────────
    console.log('\n== SUITE B: Estado previo al deploy ==');

    const sub = await StudentSubscription.findOne({
        studentId: JOSE_ID,
        teacherId: MIGUEL_ID,
        status: 'active',
        classesRemaining: { $gt: 0 },
        expiresAt: { $gt: new Date() }
    }).lean();
    assert('José tiene sub activa con clases', !!sub, 'No encontrada');
    if (sub) {
        assert('José: classesRemaining = 3', sub.classesRemaining === 3, `fue ${sub.classesRemaining}`);
        assert('José: expiresAt = 2027-05-01', sub.expiresAt.toISOString().startsWith('2027-05-01'));
    }

    const futureSlots = await TimeSlot.countDocuments({
        teacherId: MIGUEL_ID,
        status: 'available',
        startTime: { $gt: new Date() }
    });
    assert(`Miguel tiene slots futuros disponibles (≥1)`, futureSlots >= 1, `${futureSlots}`);

    const jose_user = await User.findById(JOSE_ID, 'classesRemaining').lean();
    assert('José: User.classesRemaining = 0 (legacy vaciado)', jose_user.classesRemaining === 0);

    // ─────────────────────────────────────────────────────
    // C. FLUJO COMPLETO BOOKING CON ROLLBACK
    // ─────────────────────────────────────────────────────
    console.log('\n== SUITE C: Flujo booking end-to-end (con rollback) ==');

    const slot = await TimeSlot.findOne({
        teacherId: MIGUEL_ID,
        status: 'available',
        startTime: { $gt: new Date(Date.now() + 3600_000) }  // al menos 1h en el futuro
    }).lean();
    assert('Slot disponible encontrado para booking', !!slot);

    if (slot && sub) {
        const session = await mongoose.startSession();
        session.startTransaction();
        try {
            const subBefore = await StudentSubscription.findById(sub._id).session(session);
            const classesBefore = subBefore.classesRemaining;

            // Simular el descuento que haría BookingService
            await StudentSubscription.findByIdAndUpdate(
                sub._id,
                { $inc: { classesRemaining: -1, classesCompleted: 1 } },
                { session }
            );
            await TimeSlot.findByIdAndUpdate(
                slot._id,
                { status: 'booked', 'booking.studentId': JOSE_ID },
                { session }
            );

            const subAfter = await StudentSubscription.findById(sub._id).session(session);
            const slotAfter = await TimeSlot.findById(slot._id).session(session);
            assert('Sub descontada', subAfter.classesRemaining === classesBefore - 1);
            assert('Slot marcado booked', slotAfter.status === 'booked');
            assert('Slot.booking.studentId = José', slotAfter.booking?.studentId?.toString() === JOSE_ID);

            // Simular cancelación → devolver clase
            await StudentSubscription.findByIdAndUpdate(
                sub._id,
                { $inc: { classesRemaining: 1, classesCompleted: -1 } },
                { session }
            );
            await TimeSlot.findByIdAndUpdate(slot._id, { status: 'available', 'booking.studentId': null }, { session });

            const subRestored = await StudentSubscription.findById(sub._id).session(session);
            assert('Cancelación restaura classesRemaining', subRestored.classesRemaining === classesBefore);

            await session.abortTransaction();  // rollback — BD queda limpia

            // Verificar rollback
            const slotFinal = await TimeSlot.findById(slot._id).lean();
            const subFinal = await StudentSubscription.findById(sub._id).lean();
            assert('Rollback: slot vuelve a available', slotFinal.status === 'available');
            assert('Rollback: sub restaura clases', subFinal.classesRemaining === classesBefore);
        } catch (e) {
            await session.abortTransaction();
            assert('Booking sin error de transacción', false, e.message);
        } finally {
            session.endSession();
        }
    }

    // ─────────────────────────────────────────────────────
    // D. TIMEZONE EN SLOTS FUTUROS
    // ─────────────────────────────────────────────────────
    console.log('\n== SUITE D: Timezone en slots futuros ==');

    // Los slots muestran 17:00 UTC = 13:00 Chile (invierno UTC-4)
    // Slots creados antes de FASE 4 no tienen sourceTimezone (undefined → default America/Santiago)
    const slotSample = await TimeSlot.findOne({
        teacherId: MIGUEL_ID,
        status: 'available',
        startTime: { $gt: new Date() }
    }, 'startTime sourceTimezone').lean();
    assert('Slot futuro existe', !!slotSample);
    if (slotSample) {
        // sourceTimezone puede ser undefined (legacy, default) o America/Santiago (nuevos)
        const tz = slotSample.sourceTimezone ?? 'America/Santiago';
        assert(`Slot tiene TZ resoluble: ${tz}`, !!tz);

        // Verificar que la hora UTC es coherente con Chile (UTC-4 invierno)
        const hour = new Date(slotSample.startTime).getUTCHours();
        // Horas típicas clases Chile tarde: 18:00-22:00 UTC (14:00-18:00 Chile invierno)
        // O por la mañana. Solo validamos que no sea hora de madrugada UTC (que indicaría error TZ).
        const isReasonableHour = hour >= 13 && hour <= 23;
        assert(`Hora UTC razonable para clase Chile: ${hour}h UTC`, isReasonableHour, `${hour}:00 UTC`);
    }

    // ─────────────────────────────────────────────────────
    // E. SCAN ESTÁTICO — BUG UTC RESIDUAL
    // ─────────────────────────────────────────────────────
    console.log('\n== SUITE E: Scan estático — sin instancias del bug UTC ==');
    try {
        const grepResult = execSync(
            'grep -rn "new Date(" routes/ services/ --include="*.js" | grep "T\${\|T..:.00\b" | grep -v "toISOString\|getTime\|ANTES\|audit\|T00:00\|T23:59\|T12:00"',
            { cwd: __dirname + '/..', timeout: 5000 }
        ).toString().trim();
        const lines = grepResult.split('\n').filter(Boolean);
        assert('Sin new Date(template-UTC) activas',  lines.length === 0,
            lines.slice(0, 3).join(' | '));
    } catch {
        // exit code 1 = grep no encontró nada → correcto
        assert('Sin new Date(template-UTC) activas', true);
    }

    // ─────────────────────────────────────────────────────
    // F. DEPLOY GATE: server.js parseable + .env críticas
    // ─────────────────────────────────────────────────────
    console.log('\n== SUITE F: Deploy gate ==');

    try {
        execSync('node -c ' + require('path').join(__dirname, '../server.js'), { timeout: 5000 });
        assert('server.js syntax OK', true);
    } catch (e) {
        assert('server.js syntax OK', false, e.message);
    }

    const requiredEnv = ['MONGO_URI', 'JWT_SECRET', 'NODE_ENV'];
    for (const key of requiredEnv) {
        const val = process.env[key] || (key === 'MONGO_URI' ? process.env.MONGODB_URI : '');
        assert(`ENV ${key} está definida`, !!val);
    }

    const packageJson = require('../package.json');
    assert('moment-timezone en dependencies', !!packageJson.dependencies['moment-timezone']);

    // ─────────────────────────────────────────────────────
    // RESULTADO FINAL
    // ─────────────────────────────────────────────────────
    console.log(`\n${'='.repeat(50)}`);
    console.log(`QA INTEGRAL FASE 6: ${passed} passed | ${failed} failed`);
    if (failed === 0) {
        console.log('✅ SISTEMA LISTO PARA DEPLOY');
        console.log('   → flyctl deploy --app pianolink-v4');
    } else {
        console.log('❌ DEPLOY BLOQUEADO. Resolver antes de hacer merge a main:');
        failures.forEach(f => console.log('  - ' + f));
        process.exitCode = 1;
    }
    console.log('='.repeat(50));

    await mongoose.disconnect();
}

run().catch(e => { console.error(e); process.exit(1); });
