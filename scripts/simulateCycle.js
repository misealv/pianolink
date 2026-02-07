/**
 * scripts/simulateCycle.js
 * Simulación completa del ciclo de PianoLink
 * 
 * Flujo:
 * 1. Alta de profesor
 * 2. Profesor crea paquete de clases
 * 3. Alta de estudiante
 * 4. Estudiante compra paquete (simula pago MP)
 * 5. Se agendan y completan clases
 * 6. Validación de clases
 * 7. Generación de payout mensual
 * 8. Pago al profesor
 * 
 * Uso: node scripts/simulateCycle.js [--cleanup]
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Modelos
const User = require('../models/User');
const TeacherPackage = require('../models/TeacherPackage');
const StudentSubscription = require('../models/StudentSubscription');
const ClassSession = require('../models/ClassSession');
const TeacherPayout = require('../models/TeacherPayout');

// Configuración de la simulación
const SIMULATION_PREFIX = 'SIM_TEST_';
const TEACHER_EMAIL = `${SIMULATION_PREFIX}profesor@test.pianolink.net`;
const STUDENT_EMAIL = `${SIMULATION_PREFIX}estudiante@test.pianolink.net`;

// Colores para console
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    red: '\x1b[31m'
};

function log(emoji, step, message, color = 'reset') {
    console.log(`${colors[color]}${emoji} [${step}] ${message}${colors.reset}`);
}

function header(title) {
    console.log('\n' + '='.repeat(60));
    console.log(`${colors.bright}${colors.cyan}  ${title}${colors.reset}`);
    console.log('='.repeat(60) + '\n');
}

function subHeader(title) {
    console.log(`\n${colors.yellow}--- ${title} ---${colors.reset}\n`);
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================
// PASO 1: ALTA DE PROFESOR
// ============================================================
async function step1_createTeacher() {
    header('PASO 1: ALTA DE PROFESOR');
    
    // Verificar si ya existe
    let teacher = await User.findOne({ email: TEACHER_EMAIL });
    if (teacher) {
        log('♻️', 'PROFESOR', 'Profesor de prueba ya existe, reutilizando...', 'yellow');
        return teacher;
    }
    
    log('📝', 'REGISTRO', 'Profesor se registra en PianoLink...', 'blue');
    await sleep(500);
    
    const hashedPassword = await bcrypt.hash('Test1234!', 10);
    
    teacher = new User({
        name: 'María González',
        email: TEACHER_EMAIL,
        password: hashedPassword,
        role: 'teacher',
        isActive: true,
        hasValidSubscription: true, // Simulamos que ya pagó membresía
        subscriptionStatus: 'active',
        teacherData: {
            profile: {
                bio: 'Pianista profesional con 15 años de experiencia. Especialista en piano clásico y jazz.',
                experience: '15 años',
                specialties: ['Piano Clásico', 'Jazz', 'Teoría Musical']
            },
            pricing: {
                hourlyRate: 3500, // $35 USD en centavos
                currency: 'USD'
            },
            paymentInfo: {
                withdrawalMethod: 'bank_transfer',
                bankName: 'Banco de Chile',
                accountNumber: '****1234',
                accountHolder: 'María González'
            }
        }
    });
    
    await teacher.save();
    log('✅', 'PROFESOR', `Creado: ${teacher.name} (${teacher.email})`, 'green');
    log('💳', 'MEMBRESÍA', 'Profesor activa membresía de plataforma', 'green');
    
    return teacher;
}

// ============================================================
// PASO 2: PROFESOR CREA PAQUETE
// ============================================================
async function step2_createPackage(teacher) {
    header('PASO 2: PROFESOR CREA PAQUETE DE CLASES');
    
    // Verificar si ya existe
    let package_ = await TeacherPackage.findOne({ 
        teacherId: teacher._id,
        name: { $regex: SIMULATION_PREFIX }
    });
    
    if (package_) {
        log('♻️', 'PAQUETE', 'Paquete de prueba ya existe, reutilizando...', 'yellow');
        return package_;
    }
    
    log('📦', 'DASHBOARD', 'Profesor entra a su dashboard...', 'blue');
    await sleep(300);
    log('➕', 'CREAR', 'Click en "Nuevo Paquete"...', 'blue');
    await sleep(300);
    
    package_ = new TeacherPackage({
        teacherId: teacher._id,
        category: 'piano',
        name: `${SIMULATION_PREFIX}Pack Mensual 4 Clases`,
        description: 'Paquete ideal para principiantes. 4 clases de 45 minutos.',
        classCount: 4,
        classDurationMinutes: 45,
        priceUSD: 12000, // $120 USD en centavos
        pricePerClassUSD: 3000, // $30 por clase
        validityDays: 30,
        isRecurring: true,
        isActive: true,
        isFeatured: true,
        stats: {
            totalSold: 0,
            activeSubscriptions: 0,
            revenue: 0
        }
    });
    
    await package_.save();
    
    log('✅', 'PAQUETE', `Creado: "${package_.name}"`, 'green');
    log('   ', 'DETALLE', `• ${package_.classCount} clases de ${package_.classDurationMinutes} min`, 'cyan');
    log('   ', 'DETALLE', `• Precio: $${(package_.priceUSD/100).toFixed(2)} USD`, 'cyan');
    log('   ', 'DETALLE', `• Por clase: $${(package_.pricePerClassUSD/100).toFixed(2)} USD`, 'cyan');
    log('   ', 'DETALLE', `• Vigencia: ${package_.validityDays} días`, 'cyan');
    
    return package_;
}

// ============================================================
// PASO 3: ALTA DE ESTUDIANTE
// ============================================================
async function step3_createStudent() {
    header('PASO 3: INSCRIPCIÓN DE ESTUDIANTE');
    
    let student = await User.findOne({ email: STUDENT_EMAIL });
    if (student) {
        log('♻️', 'ESTUDIANTE', 'Estudiante de prueba ya existe, reutilizando...', 'yellow');
        return student;
    }
    
    log('🌐', 'LANDING', 'Estudiante visita www.pianolink.net...', 'blue');
    await sleep(300);
    log('📝', 'REGISTRO', 'Se registra como estudiante...', 'blue');
    await sleep(300);
    
    const hashedPassword = await bcrypt.hash('Test1234!', 10);
    
    student = new User({
        name: 'Carlos Martínez',
        email: STUDENT_EMAIL,
        password: hashedPassword,
        role: 'student',
        isActive: true
    });
    
    await student.save();
    log('✅', 'ESTUDIANTE', `Registrado: ${student.name} (${student.email})`, 'green');
    
    return student;
}

// ============================================================
// PASO 4: ESTUDIANTE COMPRA PAQUETE
// ============================================================
async function step4_purchasePackage(student, teacher, package_) {
    header('PASO 4: ESTUDIANTE COMPRA PAQUETE');
    
    // Verificar si ya existe suscripción
    let subscription = await StudentSubscription.findOne({
        studentId: student._id,
        teacherId: teacher._id
    });
    
    if (subscription) {
        log('♻️', 'SUSCRIPCIÓN', 'Suscripción ya existe, reutilizando...', 'yellow');
        return subscription;
    }
    
    log('🔍', 'BUSCAR', 'Estudiante busca profesores de piano...', 'blue');
    await sleep(300);
    log('👤', 'PERFIL', `Ve perfil de ${teacher.name}...`, 'blue');
    await sleep(300);
    log('📦', 'PAQUETES', 'Ve los paquetes disponibles...', 'blue');
    await sleep(300);
    log('🛒', 'SELECCIÓN', `Selecciona "${package_.name}"...`, 'blue');
    await sleep(300);
    
    subHeader('SIMULACIÓN DE PAGO MERCADOPAGO');
    log('💳', 'CHECKOUT', 'Redirigido a MercadoPago...', 'magenta');
    await sleep(500);
    log('✅', 'PAGO', 'Pago aprobado (simulado)', 'green');
    
    // Simular el webhook de MP
    const expiresAt = new Date(Date.now() + (package_.validityDays * 24 * 60 * 60 * 1000));
    const fakePaymentId = `MP_SIM_${Date.now()}`;
    
    subscription = new StudentSubscription({
        studentId: student._id,
        teacherId: teacher._id,
        packageId: package_._id,
        category: package_.category,
        classesTotal: package_.classCount,
        classesRemaining: package_.classCount,
        classesUsed: 0,
        totalPaidUSD: package_.priceUSD,
        escrowBalanceUSD: package_.priceUSD, // Dinero en garantía
        releasedToTeacherUSD: 0,
        autoRenew: true,
        paymentProvider: 'mercadopago',
        externalSubscriptionId: fakePaymentId,
        status: 'active',
        expiresAt,
        statusHistory: [{
            status: 'active',
            reason: `Compra MP: ${package_.name} (${fakePaymentId})`
        }]
    });
    
    await subscription.save();
    
    // Actualizar stats del paquete
    package_.stats.totalSold += 1;
    package_.stats.activeSubscriptions += 1;
    package_.stats.revenue += package_.priceUSD;
    await package_.save();
    
    log('✅', 'SUSCRIPCIÓN', 'Suscripción creada exitosamente', 'green');
    log('   ', 'DETALLE', `• Clases disponibles: ${subscription.classesRemaining}`, 'cyan');
    log('   ', 'DETALLE', `• Escrow: $${(subscription.escrowBalanceUSD/100).toFixed(2)} USD`, 'cyan');
    log('   ', 'DETALLE', `• Vence: ${subscription.expiresAt.toLocaleDateString()}`, 'cyan');
    
    return subscription;
}

// ============================================================
// PASO 5: CLASES SE REALIZAN Y VALIDAN
// ============================================================
async function step5_conductClasses(subscription, student, teacher) {
    header('PASO 5: REALIZACIÓN Y VALIDACIÓN DE CLASES');
    
    // Limpiar sesiones anteriores de simulación
    await ClassSession.deleteMany({
        subscriptionId: subscription._id
    });
    
    const sessions = [];
    const classCount = subscription.classesTotal;
    const pricePerClass = subscription.totalPaidUSD / classCount;
    const platformFee = Math.round(pricePerClass * 0.20); // 20% plataforma
    const teacherPayout = pricePerClass - platformFee; // 80% profesor
    
    log('📅', 'AGENDA', `Se programan ${classCount} clases...`, 'blue');
    await sleep(500);
    
    for (let i = 1; i <= classCount; i++) {
        subHeader(`CLASE ${i} DE ${classCount}`);
        
        // Fecha de la clase (en el pasado para simular que ya ocurrió)
        const classDate = new Date();
        classDate.setDate(classDate.getDate() - (classCount - i + 1) * 7); // Una clase por semana
        
        log('📆', 'AGENDA', `Clase agendada: ${classDate.toLocaleDateString()}`, 'blue');
        await sleep(200);
        
        const session = new ClassSession({
            subscriptionId: subscription._id,
            bookingId: null,
            studentId: student._id,
            teacherId: teacher._id,
            scheduledAt: classDate,
            completedAt: classDate,
            durationMinutes: 45,
            status: 'completed',
            teacherMarkedComplete: true,
            teacherMarkedAt: classDate,
            studentConfirmed: true,
            studentConfirmedAt: new Date(classDate.getTime() + 3600000), // 1 hora después
            pricePerClassUSD: pricePerClass,
            teacherPayoutUSD: teacherPayout,
            platformFeeUSD: platformFee,
            validatedAt: new Date(classDate.getTime() + 172800000), // 48h después
            notes: `Clase ${i} de simulación - Tema: Técnica básica de piano`
        });
        
        await session.save();
        sessions.push(session);
        
        log('🎹', 'CLASE', 'Clase realizada vía videollamada', 'blue');
        log('✅', 'PROFESOR', 'Profesor marca clase como completada', 'green');
        log('✅', 'ESTUDIANTE', 'Estudiante confirma (48h auto-confirm)', 'green');
        log('💰', 'ESCROW', `Liberado: $${(teacherPayout/100).toFixed(2)} USD al profesor`, 'cyan');
        
        await sleep(300);
    }
    
    // Actualizar suscripción
    subscription.classesUsed = classCount;
    subscription.classesRemaining = 0;
    subscription.status = 'exhausted';
    subscription.escrowBalanceUSD = 0;
    subscription.releasedToTeacherUSD = subscription.totalPaidUSD * 0.8; // 80%
    await subscription.save();
    
    log('', '', '', 'reset');
    log('📊', 'RESUMEN', `${classCount} clases completadas y validadas`, 'green');
    log('   ', 'DETALLE', `• Total pagado: $${(subscription.totalPaidUSD/100).toFixed(2)} USD`, 'cyan');
    log('   ', 'DETALLE', `• Profesor recibe: $${(subscription.releasedToTeacherUSD/100).toFixed(2)} USD (80%)`, 'cyan');
    log('   ', 'DETALLE', `• PianoLink retiene: $${((subscription.totalPaidUSD - subscription.releasedToTeacherUSD)/100).toFixed(2)} USD (20%)`, 'cyan');
    
    return sessions;
}

// ============================================================
// PASO 6: GENERACIÓN DE PAYOUT MENSUAL
// ============================================================
async function step6_generatePayout(teacher, sessions) {
    header('PASO 6: GENERACIÓN DE PAYOUT MENSUAL (Día 1 del mes)');
    
    // Limpiar payouts anteriores de simulación
    await TeacherPayout.deleteMany({
        teacherId: teacher._id,
        notes: { $regex: 'SIMULACIÓN' }
    });
    
    log('🤖', 'CRON', 'Cron job se ejecuta el día 1 del mes...', 'blue');
    await sleep(500);
    
    // Calcular totales
    const grossAmount = sessions.reduce((sum, s) => sum + s.pricePerClassUSD, 0);
    const platformFee = sessions.reduce((sum, s) => sum + s.platformFeeUSD, 0);
    const netPayout = sessions.reduce((sum, s) => sum + s.teacherPayoutUSD, 0);
    
    const periodStart = new Date();
    periodStart.setMonth(periodStart.getMonth() - 1);
    periodStart.setDate(1);
    
    const periodEnd = new Date();
    periodEnd.setDate(0); // Último día del mes anterior
    
    const payout = new TeacherPayout({
        teacherId: teacher._id,
        periodStart,
        periodEnd,
        classesCompleted: sessions.length,
        classesStudentNoShow: 0,
        grossAmountUSD: grossAmount,
        platformFeeUSD: platformFee,
        netPayoutUSD: netPayout,
        withdrawalMethod: 'bank_transfer',
        withdrawalFeePercent: 0,
        withdrawalFeeUSD: 0,
        finalAmountAfterFees: netPayout,
        status: 'pending',
        sessions: sessions.map(s => s._id),
        notes: 'SIMULACIÓN - Payout generado automáticamente'
    });
    
    await payout.save();
    
    log('✅', 'PAYOUT', 'Payout mensual generado', 'green');
    log('   ', 'PERÍODO', `${periodStart.toLocaleDateString()} - ${periodEnd.toLocaleDateString()}`, 'cyan');
    log('   ', 'CLASES', `${payout.classesCompleted} clases completadas`, 'cyan');
    log('   ', 'BRUTO', `$${(payout.grossAmountUSD/100).toFixed(2)} USD`, 'cyan');
    log('   ', 'COMISIÓN', `$${(payout.platformFeeUSD/100).toFixed(2)} USD (20%)`, 'cyan');
    log('   ', 'NETO', `$${(payout.netPayoutUSD/100).toFixed(2)} USD`, 'green');
    log('📧', 'EMAIL', 'Notificación enviada al profesor', 'magenta');
    
    return payout;
}

// ============================================================
// PASO 7: PROFESOR SUBE DOCUMENTO TRIBUTARIO
// ============================================================
async function step7_uploadInvoice(payout) {
    header('PASO 7: PROFESOR SUBE DOCUMENTO TRIBUTARIO');
    
    log('📧', 'EMAIL', 'Profesor recibe notificación de pago pendiente...', 'blue');
    await sleep(300);
    log('📱', 'DASHBOARD', 'Profesor entra a su panel...', 'blue');
    await sleep(300);
    log('💰', 'PAGOS', 'Ve sección "Mis Pagos"...', 'blue');
    await sleep(300);
    
    subHeader('SELECCIÓN DE MÉTODO DE RETIRO');
    log('🏦', 'MÉTODO', 'Profesor selecciona: Transferencia Bancaria (0% fee)', 'cyan');
    
    subHeader('SUBIDA DE DOCUMENTO');
    log('📄', 'DOCUMENTO', 'Profesor sube boleta de honorarios...', 'blue');
    await sleep(300);
    
    payout.invoiceType = 'boleta_honorarios';
    payout.invoiceNumber = 'BH-2026-00123';
    payout.invoiceUrl = 'https://storage.pianolink.net/invoices/sim_boleta_123.pdf';
    payout.invoiceUploadedAt = new Date();
    payout.status = 'invoice_pending';
    await payout.save();
    
    log('✅', 'SUBIDO', 'Documento subido exitosamente', 'green');
    log('   ', 'TIPO', 'Boleta de Honorarios', 'cyan');
    log('   ', 'NÚMERO', payout.invoiceNumber, 'cyan');
    log('📧', 'ADMIN', 'Notificación enviada al administrador', 'magenta');
    
    return payout;
}

// ============================================================
// PASO 8: ADMIN VERIFICA Y EJECUTA PAGO
// ============================================================
async function step8_adminPayment(payout, teacher) {
    header('PASO 8: ADMIN VERIFICA Y EJECUTA PAGO');
    
    subHeader('VERIFICACIÓN DE DOCUMENTO');
    log('👔', 'ADMIN', 'Admin entra al panel de administración...', 'blue');
    await sleep(300);
    log('📋', 'PAYOUTS', 'Ve lista de payouts pendientes...', 'blue');
    await sleep(300);
    log('🔍', 'REVISAR', 'Revisa documento de María González...', 'blue');
    await sleep(500);
    
    payout.invoiceVerifiedAt = new Date();
    payout.invoiceVerifiedBy = 'admin@pianolink.net';
    payout.status = 'invoice_verified';
    await payout.save();
    
    log('✅', 'APROBADO', 'Documento verificado correctamente', 'green');
    log('📧', 'EMAIL', 'Notificación enviada al profesor: documento aprobado', 'magenta');
    
    await sleep(500);
    
    subHeader('EJECUCIÓN DEL PAGO');
    log('💸', 'BANCO', 'Admin realiza transferencia bancaria...', 'blue');
    await sleep(500);
    
    const transferRef = `TRF-${Date.now()}`;
    
    payout.status = 'paid';
    payout.paidAt = new Date();
    payout.paymentReference = transferRef;
    payout.paymentNotes = `Transferencia bancaria a cuenta ****1234 - ${teacher.name}`;
    await payout.save();
    
    log('✅', 'PAGADO', 'Transferencia realizada exitosamente', 'green');
    log('   ', 'REF', transferRef, 'cyan');
    log('   ', 'MONTO', `$${(payout.finalAmountAfterFees/100).toFixed(2)} USD`, 'green');
    log('📧', 'EMAIL', 'Notificación enviada al profesor: pago completado', 'magenta');
    
    return payout;
}

// ============================================================
// RESUMEN FINAL
// ============================================================
async function showFinalSummary(teacher, student, package_, subscription, sessions, payout) {
    header('📊 RESUMEN DEL CICLO COMPLETO');
    
    console.log(`
${colors.bright}PROFESOR:${colors.reset}
  • Nombre: ${teacher.name}
  • Email: ${teacher.email}
  • Paquete creado: "${package_.name}"
  • Precio: $${(package_.priceUSD/100).toFixed(2)} USD

${colors.bright}ESTUDIANTE:${colors.reset}
  • Nombre: ${student.name}
  • Email: ${student.email}
  • Compró: ${package_.classCount} clases

${colors.bright}CLASES:${colors.reset}
  • Completadas: ${sessions.length}
  • Validadas: ${sessions.length}
  • Duración total: ${sessions.length * 45} minutos

${colors.bright}FINANCIERO:${colors.reset}
  • Estudiante pagó: $${(subscription.totalPaidUSD/100).toFixed(2)} USD
  • Comisión PianoLink (20%): $${(payout.platformFeeUSD/100).toFixed(2)} USD
  • Profesor recibió (80%): $${(payout.netPayoutUSD/100).toFixed(2)} USD
  • Fee de retiro: $0.00 USD (transferencia bancaria)
  • ${colors.green}Neto final profesor: $${(payout.finalAmountAfterFees/100).toFixed(2)} USD${colors.reset}

${colors.bright}TIMELINE:${colors.reset}
  1. ✅ Profesor se registra y crea paquete
  2. ✅ Estudiante compra paquete (MercadoPago)
  3. ✅ ${sessions.length} clases realizadas y validadas
  4. ✅ Payout mensual generado automáticamente
  5. ✅ Profesor sube boleta de honorarios
  6. ✅ Admin verifica documento
  7. ✅ Transferencia bancaria ejecutada
  8. ✅ Profesor recibe su dinero
`);
    
    console.log('='.repeat(60));
    console.log(`${colors.green}${colors.bright}  ✅ CICLO COMPLETO SIMULADO EXITOSAMENTE${colors.reset}`);
    console.log('='.repeat(60));
}

// ============================================================
// LIMPIEZA (opcional)
// ============================================================
async function cleanup() {
    header('🧹 LIMPIEZA DE DATOS DE SIMULACIÓN');
    
    const deletedPayouts = await TeacherPayout.deleteMany({ notes: { $regex: 'SIMULACIÓN' } });
    log('🗑️', 'PAYOUTS', `Eliminados: ${deletedPayouts.deletedCount}`, 'yellow');
    
    const teacher = await User.findOne({ email: TEACHER_EMAIL });
    const student = await User.findOne({ email: STUDENT_EMAIL });
    
    if (teacher) {
        await ClassSession.deleteMany({ teacherId: teacher._id });
        await StudentSubscription.deleteMany({ teacherId: teacher._id });
        await TeacherPackage.deleteMany({ teacherId: teacher._id });
        log('🗑️', 'CLASES', 'Eliminadas sesiones del profesor', 'yellow');
        log('🗑️', 'SUSCRIPCIONES', 'Eliminadas suscripciones', 'yellow');
        log('🗑️', 'PAQUETES', 'Eliminados paquetes', 'yellow');
    }
    
    if (teacher) {
        await User.deleteOne({ _id: teacher._id });
        log('🗑️', 'PROFESOR', `Eliminado: ${TEACHER_EMAIL}`, 'yellow');
    }
    
    if (student) {
        await User.deleteOne({ _id: student._id });
        log('🗑️', 'ESTUDIANTE', `Eliminado: ${STUDENT_EMAIL}`, 'yellow');
    }
    
    console.log('\n✅ Limpieza completada\n');
}

// ============================================================
// MAIN
// ============================================================
async function main() {
    const args = process.argv.slice(2);
    const shouldCleanup = args.includes('--cleanup');
    
    console.log('\n');
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║                                                            ║');
    console.log('║     🎹 PIANOLINK - SIMULACIÓN DE CICLO COMPLETO 🎹        ║');
    console.log('║                                                            ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    
    try {
        // Conectar a MongoDB
        const dbUri = process.env.MONGO_URI || process.env.MONGODB_URI || process.env.DB_URI;
        if (!dbUri) {
            console.error('❌ Error: No se encontró MONGO_URI, MONGODB_URI o DB_URI');
            process.exit(1);
        }
        
        await mongoose.connect(dbUri);
        log('🔌', 'DB', 'Conectado a MongoDB', 'green');
        
        if (shouldCleanup) {
            await cleanup();
            mongoose.disconnect();
            return;
        }
        
        // Ejecutar simulación
        const teacher = await step1_createTeacher();
        const package_ = await step2_createPackage(teacher);
        const student = await step3_createStudent();
        const subscription = await step4_purchasePackage(student, teacher, package_);
        const sessions = await step5_conductClasses(subscription, student, teacher);
        const payout = await step6_generatePayout(teacher, sessions);
        const payoutWithInvoice = await step7_uploadInvoice(payout);
        await step8_adminPayment(payoutWithInvoice, teacher);
        
        await showFinalSummary(teacher, student, package_, subscription, sessions, payoutWithInvoice);
        
        console.log(`\n${colors.yellow}💡 Para limpiar datos de simulación: node scripts/simulateCycle.js --cleanup${colors.reset}\n`);
        
    } catch (error) {
        console.error('\n❌ Error en simulación:', error);
    } finally {
        await mongoose.disconnect();
        log('🔌', 'DB', 'Desconectado de MongoDB', 'yellow');
    }
}

main();
