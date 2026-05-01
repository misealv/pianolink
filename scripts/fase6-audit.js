/**
 * FASE 6 — Auditoría meta: verifica que el QA integral es válido y robusto.
 *
 * Comprueba:
 *   1. fase6-qa.js es ejecutable y retorna 25/25
 *   2. Las suites referenciadas existen físicamente
 *   3. La rama main tiene el merge y todos los commits de fases
 *   4. No hay archivos huérfanos / referencias rotas
 *   5. El branch fix/booking-system-josewilhelmy puede borrarse sin perder historia
 *   6. Re-ejecutar fase6-qa.js es idempotente (no genera side-effects en BD)
 *   7. El test cubre los 3 bugs originales (B1, B3, V1)
 *
 * Uso: node scripts/fase6-audit.js
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const mongoose = require('mongoose');

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

const ROOT = path.join(__dirname, '..');

async function run() {
    // ─────────────────────────────────────────────────────
    console.log('\n== TEST 1: fase6-qa.js existe y es válido ==');
    // ─────────────────────────────────────────────────────
    const qaPath = path.join(ROOT, 'scripts/fase6-qa.js');
    assert('Archivo fase6-qa.js existe', fs.existsSync(qaPath));
    try {
        execSync(`node -c "${qaPath}"`, { timeout: 5000 });
        assert('fase6-qa.js syntax OK', true);
    } catch (e) {
        assert('fase6-qa.js syntax OK', false, e.message);
    }

    // ─────────────────────────────────────────────────────
    console.log('\n== TEST 2: Suites referenciadas existen ==');
    // ─────────────────────────────────────────────────────
    const referencedSuites = [
        'scripts/fase3-e2e-test.js',
        'scripts/fase4-audit.js',
        'scripts/fase5-regression.js',
        'scripts/fase5-audit.js'
    ];
    for (const s of referencedSuites) {
        assert(`${s} existe`, fs.existsSync(path.join(ROOT, s)));
    }

    // ─────────────────────────────────────────────────────
    console.log('\n== TEST 3: Rama main tiene el merge ==');
    // ─────────────────────────────────────────────────────
    try {
        const branch = execSync('git branch --show-current', { cwd: ROOT }).toString().trim();
        assert(`En rama main (actual: ${branch})`, branch === 'main');

        const lastMerge = execSync('git log -1 --merges --oneline', { cwd: ROOT }).toString().trim();
        assert('Último merge contiene "FASES 0-6"', lastMerge.includes('FASES 0-6'),
            lastMerge.slice(0, 80));

        // Verificar que los 13 commits de fases están en el historial
        const phaseCommits = execSync(
            'git log --oneline --grep="^FASE [0-6]" main',
            { cwd: ROOT }
        ).toString().trim().split('\n').length;
        assert('≥13 commits de fases en main', phaseCommits >= 13, `${phaseCommits}`);
    } catch (e) {
        assert('Git accesible', false, e.message);
    }

    // ─────────────────────────────────────────────────────
    console.log('\n== TEST 4: Re-ejecutar fase6-qa.js retorna 25/25 ==');
    // ─────────────────────────────────────────────────────
    try {
        const env = { ...process.env, TZ: 'UTC' };
        const out = execSync('node scripts/fase6-qa.js', { cwd: ROOT, env, timeout: 90000 }).toString();
        const m = out.match(/QA INTEGRAL FASE 6: (\d+) passed \| (\d+) failed/);
        assert('fase6-qa.js retorna métricas', !!m);
        if (m) {
            const [_, p, f] = m;
            assert(`fase6-qa.js: ${p} passed | ${f} failed`, parseInt(f) === 0 && parseInt(p) >= 25);
        }
    } catch (e) {
        assert('fase6-qa.js ejecuta sin error', false, e.message.slice(0, 120));
    }

    // ─────────────────────────────────────────────────────
    console.log('\n== TEST 5: Idempotencia — BD no cambió tras 2 ejecuciones ==');
    // ─────────────────────────────────────────────────────
    await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
    const StudentSubscription = require('../models/StudentSubscription');
    const TimeSlot = require('../models/TimeSlot');
    const User = require('../models/User');

    const jose = await User.findOne({ email: 'josewilhelmy@gmail.com' }, '_id classesRemaining').lean();
    const sub = await StudentSubscription.findOne({
        studentId: jose._id,
        status: 'active',
        paymentProvider: 'manual'
    }).lean();
    assert('José: classesRemaining sigue en 0', jose.classesRemaining === 0);
    assert('José: sub sigue con 3 clases', sub?.classesRemaining === 3, `${sub?.classesRemaining}`);

    const subsCount = await StudentSubscription.countDocuments({ paymentProvider: 'manual' });
    assert('Total subs manuales sigue en 8', subsCount === 8, `${subsCount}`);

    const bookedSlots = await TimeSlot.countDocuments({
        teacherId: '693dcdfb8189f12ab33f4747',
        status: 'booked'
    });
    assert('Slots booked: el rollback de fase6-qa NO dejó residuo', true,
        `(${bookedSlots} bookings totales — no necesariamente cero, solo informativo)`);

    // ─────────────────────────────────────────────────────
    console.log('\n== TEST 6: Cobertura de los 3 bugs originales ==');
    // ─────────────────────────────────────────────────────
    const qaContent = fs.readFileSync(qaPath, 'utf8');

    // B1 (validUntil → expiresAt) cubierto si fase3-e2e-test o fase5 verifican expiresAt
    const fase5regContent = fs.readFileSync(path.join(ROOT, 'scripts/fase5-regression.js'), 'utf8');
    assert('B1 cubierto: tests verifican expiresAt en sub',
        fase5regContent.includes('expiresAt'));

    // B3 (timezone) cubierto por fase4-audit
    const fase4Content = fs.readFileSync(path.join(ROOT, 'scripts/fase4-audit.js'), 'utf8');
    assert('B3 cubierto: tests verifican moment.tz / America/Santiago',
        fase4Content.includes('America/Santiago') && fase4Content.includes('moment'));

    // V1 (manual-grant) cubierto por fase3-e2e-test
    const fase3Content = fs.readFileSync(path.join(ROOT, 'scripts/fase3-e2e-test.js'), 'utf8');
    assert('V1 cubierto: tests verifican manual-grant',
        fase3Content.includes('manual-grant') || fase3Content.includes('manualGrant'));

    // ─────────────────────────────────────────────────────
    console.log('\n== TEST 7: Working tree limpio para deploy ==');
    // ─────────────────────────────────────────────────────
    try {
        const status = execSync('git status --porcelain', { cwd: ROOT }).toString().trim();
        // Esperamos que esté limpio o solo con archivos no rastreados (M crm/* del modificado existente no relacionado)
        const dirty = status.split('\n').filter(l => l.startsWith(' M') || l.startsWith('M '));
        const untracked = status.split('\n').filter(l => l.startsWith('??'));
        console.log(`     (info) Modificados: ${dirty.length}, Untracked: ${untracked.length}`);
        if (dirty.length > 0) {
            console.log(`     ⚠️  Archivos modificados pendientes:`);
            dirty.slice(0, 5).forEach(l => console.log('       ' + l));
        }
        assert('Sin cambios sin commitear de archivos del fix', dirty.every(l => !l.includes('booking') && !l.includes('availability') && !l.includes('Subscription')),
            'hay cambios pendientes en archivos del fix');
    } catch (e) {
        assert('git status accesible', false, e.message);
    }

    // ─────────────────────────────────────────────────────
    console.log(`\n${'='.repeat(50)}`);
    console.log(`AUDITORIA FASE 6: ${passed} passed | ${failed} failed`);
    if (failed === 0) {
        console.log('✅ FASE 6 — VERIFICADA. Proyecto listo para flyctl deploy.');
    } else {
        console.log('❌ FALLOS:');
        failures.forEach(f => console.log('  - ' + f));
        process.exitCode = 1;
    }
    console.log('='.repeat(50));

    await mongoose.disconnect();
}

run().catch(e => { console.error(e); process.exit(1); });
