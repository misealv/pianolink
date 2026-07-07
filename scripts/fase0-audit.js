/**
 * Auditoría rápida FASE 0: confirma que los registros existan y sean coherentes.
 * Solo lectura.
 */
const mongoose = require('mongoose');
require('dotenv').config();

async function run() {
    const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
    await mongoose.connect(uri);

    const User = require('../models/User');
    const TeacherPackage = require('../models/TeacherPackage');
    const StudentSubscription = require('../models/StudentSubscription');
    const Booking = require('../models/Booking');

    const MIGUEL = '693dcdfb8189f12ab33f4747';
    const JOSE = '69f458a4ed8946b42b2f2abe';
    const PKG = '69f458b5354f629d942ac25f';

    console.log('\n==================================================');
    console.log('   AUDITORÍA FASE 0 — Estado en producción');
    console.log('==================================================\n');

    // 1. Miguel
    const miguel = await User.findById(MIGUEL).select('name email role timezone teacherData.plan teacherData.subscriptionStatus');
    console.log('👨‍🏫 PROFESOR MIGUEL');
    if (!miguel) { console.log('   ❌ NO EXISTE'); }
    else {
        console.log(`   ✓ Nombre        : ${miguel.name}`);
        console.log(`   ✓ Email         : ${miguel.email}`);
        console.log(`   ✓ Role          : ${miguel.role}`);
        console.log(`   ✓ Timezone      : ${miguel.timezone}`);
        console.log(`   ✓ Plan          : ${miguel.teacherData?.plan || 'N/A'}`);
        console.log(`   ✓ Sub status    : ${miguel.teacherData?.subscriptionStatus || 'N/A'}`);
    }

    // 2. José
    const jose = await User.findById(JOSE).select('name email role timezone classesRemaining clientData.accountType studentData.source');
    console.log('\n👤 ALUMNO JOSÉ WILHELMY');
    if (!jose) { console.log('   ❌ NO EXISTE'); }
    else {
        console.log(`   ✓ Nombre        : ${jose.name}`);
        console.log(`   ✓ Email         : ${jose.email}`);
        console.log(`   ✓ Role          : ${jose.role}`);
        console.log(`   ✓ Timezone      : ${jose.timezone}`);
        console.log(`   ✓ classesRemain : ${jose.classesRemaining} (legacy, debe ser 0)`);
        console.log(`   ✓ accountType   : ${jose.clientData?.accountType || 'N/A'}`);
        console.log(`   ✓ studentSource : ${jose.studentData?.source || 'N/A'}`);
    }

    // 3. Package
    const pkg = await TeacherPackage.findById(PKG);
    console.log('\n📦 TEACHERPACKAGE PLAN ANUAL');
    if (!pkg) { console.log('   ❌ NO EXISTE'); }
    else {
        const okTeacher = pkg.teacherId.toString() === MIGUEL;
        console.log(`   ${okTeacher ? '✓' : '❌'} teacherId      : ${pkg.teacherId} (esperado ${MIGUEL})`);
        console.log(`   ✓ Nombre        : ${pkg.name}`);
        console.log(`   ✓ classCount    : ${pkg.classCount} ${pkg.classCount === 50 ? '✓' : '❌ esperado 50'}`);
        console.log(`   ✓ validityDays  : ${pkg.validityDays} ${pkg.validityDays === 365 ? '✓' : '❌ esperado 365'}`);
        console.log(`   ✓ isActive      : ${pkg.isActive} ${pkg.isActive === false ? '✓ oculto OK' : '❌ debería ser false'}`);
        console.log(`   ✓ category      : ${pkg.category}`);
        console.log(`   ✓ priceUSD      : ${pkg.priceUSD} centavos (simbólico — pago real fue externo)`);
    }

    // 4. ¿Ya existe una StudentSubscription? (NO debería todavía — eso es FASE 2)
    const existingSub = await StudentSubscription.findOne({
        studentId: JOSE,
        teacherId: MIGUEL
    });
    console.log('\n📋 STUDENT SUBSCRIPTION (José ↔ Miguel)');
    console.log(`   ${existingSub ? '⚠️ YA EXISTE (raro en FASE 0)' : '✓ No existe — correcto, FASE 2 la creará'}`);

    // 5. Bookings o ClassSessions previos del par
    const bookings = await Booking.countDocuments({
        $or: [
            { studentId: JOSE, teacherId: MIGUEL },
            { 'student.userId': JOSE, 'teacher.userId': MIGUEL }
        ]
    });
    console.log(`\n📅 BOOKINGS PREVIOS (José ↔ Miguel) : ${bookings}`);

    // 6. Estado del bug B1 — confirmar que sigue presente en código
    const fs = require('fs');
    const path = require('path');
    const bookingSrc = fs.readFileSync(path.join(__dirname, '..', 'services', 'BookingService.js'), 'utf8');
    const validUntilMatches = (bookingSrc.match(/validUntil/g) || []).length;
    console.log(`\n🐛 BUG B1 EN BookingService.js`);
    console.log(`   Apariciones de "validUntil": ${validUntilMatches} ${validUntilMatches > 0 ? '⚠️ aún presente — FASE 1 lo corrige' : '✓ corregido'}`);

    console.log('\n==================================================');
    console.log('   AUDITORÍA COMPLETA');
    console.log('==================================================\n');

    await mongoose.disconnect();
}

run().catch(err => { console.error('❌', err.message); process.exit(1); });
