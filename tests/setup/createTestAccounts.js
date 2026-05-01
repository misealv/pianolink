/**
 * tests/setup/createTestAccounts.js
 * 
 * Crea las 4 cuentas de prueba + datos auxiliares (slots, suscripción, WelcomeKit)
 * necesarios para el QA Agent.
 * Usa MongoDB directamente porque el registro público requiere inviteCode.
 * 
 * Uso:
 *   node tests/setup/createTestAccounts.js          # Crear cuentas + datos de prueba
 *   node tests/setup/createTestAccounts.js --clean   # Eliminar todo
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const connectDB = require('../../config/db');
const User = require('../../models/User');
const TimeSlot = require('../../models/TimeSlot');
const WelcomeKit = require('../../models/WelcomeKit');
const StudentSubscription = require('../../models/StudentSubscription');

// Archivo para compartir IDs entre setup y tests
const TEST_DATA_FILE = path.join(__dirname, '.test-data.json');

// Cuentas de prueba — todas con sufijo @pianolink.test
const TEST_ACCOUNTS = [
  {
    name: 'QA Profesor Test',
    email: 'qa_teacher@pianolink.test',
    password: 'QaTest2026!',
    role: 'teacher',
    slug: 'qa-teacher-test',
    branding: {
      bio: 'Cuenta de prueba QA — profesor',
      colors: { base: '#ff764d', bg: '#1a1a1a', panel: '#262626' }
    },
    teacherData: {
      hourlyRate: 25,
      trialPrice: 1500,
      plan: 'free',
      subscriptionStatus: 'active',
      profile: { specialties: ['piano'], experience: 'QA Test', isPublic: true }
    }
  },
  {
    name: 'QA Estudiante Test',
    email: 'qa_student@pianolink.test',
    password: 'QaTest2026!',
    role: 'student',
    classesRemaining: 5,
    studentData: {
      source: 'platform'
    }
  },
  {
    name: 'QA Cliente Test',
    email: 'qa_client@pianolink.test',
    password: 'QaTest2026!',
    role: 'client',
    classesRemaining: 3,
    clientData: {
      accountType: 'individual',
      managedStudents: [],
      billingEmail: 'qa_client@pianolink.test'
    }
  },
  {
    name: 'QA Admin Test',
    email: 'qa_admin@pianolink.test',
    password: 'QaTest2026!',
    role: 'admin',
    slug: 'qa-admin-test',
    branding: {
      bio: 'Cuenta de prueba QA — admin'
    }
  }
];

const TEST_EMAILS = TEST_ACCOUNTS.map(a => a.email);

// Colores para consola
const c = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m'
};

/**
 * Guarda datos de prueba en archivo JSON para que los tests los lean
 */
function saveTestData(data) {
  const existing = loadTestData();
  const merged = { ...existing, ...data };
  fs.writeFileSync(TEST_DATA_FILE, JSON.stringify(merged, null, 2));
}

function loadTestData() {
  try {
    return JSON.parse(fs.readFileSync(TEST_DATA_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

async function createAccounts() {
  console.log(`\n${c.cyan}══════════════════════════════════════${c.reset}`);
  console.log(`${c.cyan}  🔧 Creando cuentas de prueba QA${c.reset}`);
  console.log(`${c.cyan}══════════════════════════════════════${c.reset}\n`);

  await connectDB();

  let created = 0;
  let skipped = 0;

  for (const account of TEST_ACCOUNTS) {
    const exists = await User.findOne({ email: account.email });
    if (exists) {
      console.log(`${c.yellow}⏭ ${account.role.padEnd(8)} ${account.email} — ya existe${c.reset}`);
      skipped++;
      continue;
    }

    try {
      await User.create(account);
      console.log(`${c.green}✅ ${account.role.padEnd(8)} ${account.email} — creada${c.reset}`);
      created++;
    } catch (err) {
      console.log(`${c.red}❌ ${account.role.padEnd(8)} ${account.email} — ERROR: ${err.message}${c.reset}`);
    }
  }

  console.log(`\n📊 Resultado: ${created} creadas, ${skipped} ya existían`);

  // Verificación final
  console.log(`\n${c.cyan}Verificando cuentas:${c.reset}`);
  for (const email of TEST_EMAILS) {
    const user = await User.findOne({ email }).select('name email role classesRemaining');
    if (user) {
      console.log(`  ✅ ${user.role.padEnd(8)} ${user.email} (classes: ${user.classesRemaining || 0})`);
    } else {
      console.log(`  ${c.red}❌ ${email} — NO ENCONTRADA${c.reset}`);
    }
  }
}

/**
 * A1 — Crea 3 slots de disponibilidad para mañana (America/Santiago)
 * Desbloquea tests S1.1 y S1.3
 */
async function createTestSlots() {
  console.log(`\n${c.cyan}══════════════════════════════════════${c.reset}`);
  console.log(`${c.cyan}  📅 Creando slots de prueba QA${c.reset}`);
  console.log(`${c.cyan}══════════════════════════════════════${c.reset}\n`);

  const teacher = await User.findOne({ email: 'qa_teacher@pianolink.test' });
  if (!teacher) {
    console.log(`${c.red}❌ Profesor QA no encontrado — ejecutar createAccounts primero${c.reset}`);
    return;
  }

  // Limpiar slots previos del profesor QA
  const deleted = await TimeSlot.deleteMany({ teacherId: teacher._id });
  if (deleted.deletedCount > 0) {
    console.log(`${c.yellow}🧹 Slots previos del profesor QA eliminados: ${deleted.deletedCount}${c.reset}`);
  }

  // Calcular "mañana" en UTC (los slots se almacenan en UTC)
  // 10:00 AM America/Santiago = 14:00 UTC (en verano CLT = UTC-3) o 13:00 UTC (en invierno CLST = UTC-4)
  // Usamos fecha fija de mañana con horas UTC que corresponden a horarios de Santiago
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dateStr = tomorrow.toISOString().split('T')[0]; // YYYY-MM-DD

  // Horarios en UTC (corresponden aprox. a 10:00, 14:00, 16:00 America/Santiago)
  const slotDefs = [
    { startHour: 13, startMin: 0, label: '10:00 AM Santiago (13:00 UTC)' },
    { startHour: 17, startMin: 0, label: '2:00 PM Santiago (17:00 UTC)' },
    { startHour: 19, startMin: 0, label: '4:00 PM Santiago (19:00 UTC)' },
  ];

  const slotIds = [];
  for (const def of slotDefs) {
    const startTime = new Date(`${dateStr}T${String(def.startHour).padStart(2, '0')}:${String(def.startMin).padStart(2, '0')}:00.000Z`);
    const endTime = new Date(startTime.getTime() + 45 * 60 * 1000); // 45 minutos

    try {
      const slot = await TimeSlot.create({
        teacherId: teacher._id,
        startTime,
        endTime,
        duration: 45,
        status: 'available',
        classType: 'individual'
      });
      slotIds.push(slot._id.toString());
      console.log(`${c.green}✅ Slot creado: ${def.label} — ${slot._id}${c.reset}`);
    } catch (err) {
      console.log(`${c.red}❌ Error creando slot ${def.label}: ${err.message}${c.reset}`);
    }
  }

  // Guardar IDs en archivo compartido
  saveTestData({
    teacherId: teacher._id.toString(),
    slotIds,
    slotsCreatedAt: new Date().toISOString()
  });

  console.log(`\n📊 Slots creados: ${slotIds.length}/3`);
}

/**
 * Crea una suscripción activa del estudiante QA con el profesor QA
 * Necesaria para que el estudiante pueda reservar (BookingService verifica suscripción)
 */
async function createTestSubscription() {
  console.log(`\n${c.cyan}══════════════════════════════════════${c.reset}`);
  console.log(`${c.cyan}  🔗 Creando suscripción de prueba QA${c.reset}`);
  console.log(`${c.cyan}══════════════════════════════════════${c.reset}\n`);

  const teacher = await User.findOne({ email: 'qa_teacher@pianolink.test' });
  const student = await User.findOne({ email: 'qa_student@pianolink.test' });

  if (!teacher || !student) {
    console.log(`${c.red}❌ Profesor o estudiante QA no encontrado${c.reset}`);
    return;
  }

  // Asignar profesor al estudiante
  await User.findByIdAndUpdate(student._id, {
    'studentData.assignedTeacher': teacher._id
  });

  // Limpiar suscripciones previas entre estas cuentas
  await StudentSubscription.deleteMany({
    studentId: student._id,
    teacherId: teacher._id
  });

  // Crear suscripción activa (necesitamos un packageId — usamos un ObjectId ficticio válido)
  const mongoose = require('mongoose');
  const fakePackageId = new mongoose.Types.ObjectId();

  const validUntil = new Date();
  validUntil.setDate(validUntil.getDate() + 30);

  const sub = await StudentSubscription.create({
    studentId: student._id,
    teacherId: teacher._id,
    packageId: fakePackageId,
    category: 'piano',
    classesTotal: 5,
    classesRemaining: 5,
    classesCompleted: 0,
    totalPaidUSD: 12500, // $125 en centavos
    escrowBalanceUSD: 12500,
    status: 'active',
    expiresAt: validUntil,
    autoRenew: false
  });

  // Nota: previamente se forzaba un campo extra `validUntil` vía $set para
  // compensar el bug B1 en BookingService. Ese bug se corrigió en FASE 1
  // (commit 221deaf), por lo que el workaround ya no es necesario.

  saveTestData({ subscriptionId: sub._id.toString() });
  console.log(`${c.green}✅ Suscripción creada: ${sub._id} (5 clases, válida hasta ${validUntil.toLocaleDateString()})${c.reset}`);
}

/**
 * A2 — Crea un WelcomeKit en estado onboarding para el cliente QA
 * Desbloquea tests S3.2 y S3.3
 */
async function createTestWelcomeKit() {
  console.log(`\n${c.cyan}══════════════════════════════════════${c.reset}`);
  console.log(`${c.cyan}  🎁 Creando WelcomeKit de prueba QA${c.reset}`);
  console.log(`${c.cyan}══════════════════════════════════════${c.reset}\n`);

  const client = await User.findOne({ email: 'qa_client@pianolink.test' });
  if (!client) {
    console.log(`${c.red}❌ Cliente QA no encontrado — ejecutar createAccounts primero${c.reset}`);
    return;
  }

  // Limpiar kits previos del cliente QA
  const deleted = await WelcomeKit.deleteMany({ clientEmail: 'qa_client@pianolink.test' });
  if (deleted.deletedCount > 0) {
    console.log(`${c.yellow}🧹 Kits previos del cliente QA eliminados: ${deleted.deletedCount}${c.reset}`);
  }

  const kit = await WelcomeKit.create({
    clientId: client._id,
    clientName: client.name,
    clientEmail: client.email,
    clientWhatsapp: '',
    payment: {
      provider: 'paypal',
      externalOrderId: `QA_TEST_${Date.now()}`,
      amount: 4400,
      currency: 'USD',
      paidAt: new Date()
    },
    kitType: 'full',
    shipping: {
      status: 'not_required',
      address: {
        country: 'CL'
      }
    },
    overallStatus: 'onboarding'
  });

  saveTestData({ kitId: kit._id.toString() });
  console.log(`${c.green}✅ WelcomeKit creado: ${kit._id} (estado: onboarding)${c.reset}`);
}

async function cleanAccounts() {
  console.log(`\n${c.yellow}══════════════════════════════════════${c.reset}`);
  console.log(`${c.yellow}  🧹 Eliminando cuentas de prueba QA${c.reset}`);
  console.log(`${c.yellow}══════════════════════════════════════${c.reset}\n`);

  await connectDB();

  // Obtener IDs de cuentas para limpiar datos relacionados
  const teacher = await User.findOne({ email: 'qa_teacher@pianolink.test' });
  const student = await User.findOne({ email: 'qa_student@pianolink.test' });
  const client = await User.findOne({ email: 'qa_client@pianolink.test' });

  // Limpiar slots del profesor QA
  if (teacher) {
    const slotsDeleted = await TimeSlot.deleteMany({ teacherId: teacher._id });
    console.log(`🗑️  Slots eliminados: ${slotsDeleted.deletedCount}`);
  }

  // Limpiar suscripciones QA
  if (student && teacher) {
    const subsDeleted = await StudentSubscription.deleteMany({
      studentId: student._id,
      teacherId: teacher._id
    });
    console.log(`🗑️  Suscripciones eliminadas: ${subsDeleted.deletedCount}`);
  }

  // Limpiar WelcomeKits del cliente QA
  if (client) {
    const kitsDeleted = await WelcomeKit.deleteMany({ clientId: client._id });
    console.log(`🗑️  WelcomeKits eliminados: ${kitsDeleted.deletedCount}`);
  }
  // También limpiar por email (por si el clientId cambió)
  const kitsDeleted2 = await WelcomeKit.deleteMany({ clientEmail: 'qa_client@pianolink.test' });
  if (kitsDeleted2.deletedCount > 0) {
    console.log(`🗑️  WelcomeKits (por email) eliminados: ${kitsDeleted2.deletedCount}`);
  }

  // Limpiar cuentas
  const result = await User.deleteMany({ email: { $in: TEST_EMAILS } });
  console.log(`🗑️  Cuentas eliminadas: ${result.deletedCount}`);

  // Limpiar archivo de datos de prueba
  try {
    fs.unlinkSync(TEST_DATA_FILE);
    console.log(`🗑️  Archivo .test-data.json eliminado`);
  } catch {
    // No existía — ok
  }
}

async function main() {
  try {
    if (process.argv.includes('--clean')) {
      await cleanAccounts();
    } else {
      await createAccounts();
      await createTestSlots();
      await createTestSubscription();
      await createTestWelcomeKit();
    }
    process.exit(0);
  } catch (err) {
    console.error(`${c.red}Error fatal: ${err.message}${c.reset}`);
    console.error(err.stack);
    process.exit(1);
  }
}

main();
