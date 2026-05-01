/**
 * FASE 0 — Setup caso testigo: José Wilhelmy + TeacherPackage Plan Anual
 *
 * Qué hace este script:
 *   1. Verifica si existe el profesor Miguel Sepúlveda (ID conocido)
 *   2. Busca al alumno José Wilhelmy por email o nombre; lo crea si no existe
 *   3. Verifica si ya existe un TeacherPackage "Plan Anual 50 clases" para Miguel;
 *      lo crea (oculto) si no existe
 *   4. Imprime un resumen con los IDs que necesita FASE 2 (manual-grant)
 *
 * Ejecutar: node scripts/fase0-setup-jose-wilhelmy.js
 *
 * SEGURIDAD:
 *   - Solo crea registros nuevos si no existen (idempotente)
 *   - No modifica registros existentes
 *   - No toca dinero, bookings ni subscriptions
 */

const mongoose = require('mongoose');
require('dotenv').config();

const MIGUEL_ID = '693dcdfb8189f12ab33f4747';
const JOSE_EMAIL = 'jose.wilhelmy@gmail.com'; // ajustar si el email es otro
const JOSE_NAME = 'José Wilhelmy';
const PACKAGE_NAME = 'Plan Anual 50 clases — Prepago Transferencia';

async function run() {
    // --- Conexión ---
    const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!uri) {
        console.error('❌  MONGODB_URI / MONGO_URI no definido en .env');
        process.exit(1);
    }

    await mongoose.connect(uri);
    console.log('✅  Conectado a MongoDB');

    const User = require('../models/User');
    const TeacherPackage = require('../models/TeacherPackage');

    // ----------------------------------------------------------------
    // PASO 1 — Verificar profesor Miguel Sepúlveda
    // ----------------------------------------------------------------
    const miguel = await User.findById(MIGUEL_ID).select('name email role teacherData.plan');
    if (!miguel) {
        console.error(`❌  Profesor no encontrado con ID ${MIGUEL_ID}. Verifica el ID en el script.`);
        await mongoose.disconnect();
        process.exit(1);
    }
    if (miguel.role !== 'teacher' && miguel.role !== 'admin') {
        console.warn(`⚠️  El usuario "${miguel.name}" tiene role "${miguel.role}", no "teacher". Continúa con precaución.`);
    }
    console.log(`\n👨‍🏫 Profesor encontrado:`);
    console.log(`   ID   : ${miguel._id}`);
    console.log(`   Nombre: ${miguel.name}`);
    console.log(`   Email : ${miguel.email}`);

    // ----------------------------------------------------------------
    // PASO 2 — Buscar o crear alumno José Wilhelmy
    // ----------------------------------------------------------------
    let jose = await User.findOne({ email: JOSE_EMAIL }).select('_id name email role classesRemaining');

    if (jose) {
        console.log(`\n👤 Alumno YA EXISTE:`);
        console.log(`   ID   : ${jose._id}`);
        console.log(`   Nombre: ${jose.name}`);
        console.log(`   Email : ${jose.email}`);
        console.log(`   Role  : ${jose.role}`);
        console.log(`   classesRemaining (legacy): ${jose.classesRemaining}`);
        console.log(`   → No se modificó nada.`);
    } else {
        // Crear con contraseña temporal (debe cambiar al primer login)
        const bcrypt = require('bcryptjs');
        const tempPassword = await bcrypt.hash('PianoLink2026!', 10);

        jose = await User.create({
            name: JOSE_NAME,
            email: JOSE_EMAIL,
            password: tempPassword,
            role: 'client',
            country: 'CL',
            timezone: 'America/Santiago',
            mustChangePassword: true,
            classesRemaining: 0,
            clientData: {
                accountType: 'individual'
            },
            studentData: {
                source: 'invited'
            }
        });

        console.log(`\n👤 Alumno CREADO:`);
        console.log(`   ID    : ${jose._id}`);
        console.log(`   Nombre : ${jose.name}`);
        console.log(`   Email  : ${jose.email}`);
        console.log(`   ⚠️  Contraseña temporal: PianoLink2026! — debe cambiarse al primer login.`);
    }

    // ----------------------------------------------------------------
    // PASO 3 — Buscar o crear TeacherPackage Plan Anual (oculto)
    // ----------------------------------------------------------------
    let pkg = await TeacherPackage.findOne({
        teacherId: MIGUEL_ID,
        name: PACKAGE_NAME
    });

    if (pkg) {
        console.log(`\n📦 TeacherPackage YA EXISTE:`);
        console.log(`   ID         : ${pkg._id}`);
        console.log(`   Nombre     : ${pkg.name}`);
        console.log(`   classCount : ${pkg.classCount}`);
        console.log(`   validityDays: ${pkg.validityDays}`);
        console.log(`   isActive   : ${pkg.isActive} (debe ser false para no mostrarse en la tienda)`);
        console.log(`   → No se modificó nada.`);
    } else {
        pkg = await TeacherPackage.create({
            teacherId: MIGUEL_ID,
            name: PACKAGE_NAME,
            description: 'Paquete prepagado por transferencia bancaria. Carga manual por admin. Sin comisión PianoLink.',
            category: 'piano',
            classCount: 50,
            classDurationMinutes: 45,
            priceUSD: 100,        // mínimo del schema (100 centavos = $1 USD). Cobro real fue externo por transferencia.
            pricePerClassUSD: 2,  // 100 / 50 clases = 2 centavos simbólico
            validityDays: 365,
            isRecurring: false,
            isActive: false,      // OCULTO: no aparece en la tienda pública
            isFeatured: false,
            stats: { totalSold: 0, activeSubscriptions: 0, revenue: 0 }
        });

        console.log(`\n📦 TeacherPackage CREADO:`);
        console.log(`   ID         : ${pkg._id}`);
        console.log(`   Nombre     : ${pkg.name}`);
        console.log(`   classCount : ${pkg.classCount}`);
        console.log(`   validityDays: ${pkg.validityDays}`);
        console.log(`   isActive   : ${pkg.isActive} ✓ oculto en tienda`);
    }

    // ----------------------------------------------------------------
    // RESUMEN — IDs para FASE 1 y FASE 2
    // ----------------------------------------------------------------
    console.log(`
╔══════════════════════════════════════════════════════════╗
║             RESUMEN FASE 0 — IDs para FASE 2            ║
╠══════════════════════════════════════════════════════════╣
║  studentId  : ${jose._id}
║  teacherId  : ${miguel._id}
║  packageId  : ${pkg._id}
║  classCount : 50
║  validityDays: 365
║  paymentMethod: bank_transfer
║  commissionWaived: true (sin comisión PianoLink)
╚══════════════════════════════════════════════════════════╝

⚠️  PRÓXIMO PASO: asegúrate de hacer snapshot en MongoDB Atlas
    ANTES de ejecutar FASE 1 (fix en BookingService).
    Instrucción: Atlas UI → tu cluster → ... → Take Snapshot

Luego confirma con: "ok, ejecuta FASE 1"
`);

    await mongoose.disconnect();
    console.log('✅  Desconectado. FASE 0 completada.');
}

run().catch(err => {
    console.error('❌  Error en FASE 0:', err.message);
    process.exit(1);
});
