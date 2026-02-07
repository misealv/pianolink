/**
 * scripts/simulateFullCycleV2.js
 * Simulación COMPLETA del ciclo de PianoLink con Kit de Bienvenida V2
 * 
 * Flujo completo:
 * 
 * FASE 1 - ONBOARDING (Kit de Bienvenida $44 USD)
 * ================================================
 * 1.1. Usuario visita landing page (comenzar.html)
 * 1.2. Compra Kit de Bienvenida V2 ($44 USD)
 * 1.3. Admin agenda entrevista técnica
 * 1.4. Admin envía email con recomendaciones de equipo
 * 1.5. Cliente confirma que tiene el equipo
 * 1.6. Sesión de Setup técnico
 * 1.7. Clase de prueba con profesor (30 min)
 * 
 * FASE 2 - ALTA COMO ESTUDIANTE REGULAR
 * ================================================
 * 2.1. Usuario se registra/login como estudiante
 * 2.2. Explora profesores y paquetes
 * 2.3. Compra paquete de 4 clases ($120 USD)
 * 
 * FASE 3 - CLASES Y SESIONES
 * ================================================
 * 3.1. Agenda primera clase
 * 3.2. Completa clase #1
 * 3.3. Cliente valida la clase
 * 3.4. Clases #2, #3, #4
 * 
 * FASE 4 - PAYOUT AL PROFESOR
 * ================================================
 * 4.1. Sistema genera payout mensual
 * 4.2. Admin revisa y aprueba
 * 4.3. Se ejecuta pago (MercadoPago/Transferencia)
 * 4.4. Profesor recibe su dinero
 * 
 * Uso: node scripts/simulateFullCycleV2.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Modelos
const User = require('../models/User');
const WelcomeKit = require('../models/WelcomeKit');
const TeacherPackage = require('../models/TeacherPackage');
const StudentSubscription = require('../models/StudentSubscription');
const ClassSession = require('../models/ClassSession');
const TeacherPayout = require('../models/TeacherPayout');
const GlobalConfig = require('../models/GlobalConfig');

// Configuración
const SIM_PREFIX = 'SIMV2_';
const STUDENT_EMAIL = `${SIM_PREFIX}cliente@test.pianolink.net`;
const TEACHER_EMAIL = `${SIM_PREFIX}profesor@test.pianolink.net`;

// Colores
const c = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    red: '\x1b[31m',
    white: '\x1b[37m',
    bgBlue: '\x1b[44m',
    bgGreen: '\x1b[42m',
    bgYellow: '\x1b[43m',
    bgMagenta: '\x1b[45m'
};

function log(emoji, step, message, color = 'white') {
    const timestamp = new Date().toLocaleTimeString('es-CL');
    console.log(`${c[color]}${emoji} [${timestamp}] ${step}: ${message}${c.reset}`);
}

function header(phase, title) {
    console.log('\n');
    console.log(`${c.bgBlue}${c.bold}${'═'.repeat(70)}${c.reset}`);
    console.log(`${c.bgBlue}${c.bold}  FASE ${phase}: ${title.padEnd(58)}${c.reset}`);
    console.log(`${c.bgBlue}${c.bold}${'═'.repeat(70)}${c.reset}`);
    console.log('');
}

function subStep(num, title) {
    console.log(`\n${c.cyan}${c.bold}[${num}] ${title}${c.reset}`);
    console.log(`${c.dim}${'─'.repeat(50)}${c.reset}`);
}

function money(cents) {
    return `$${(cents / 100).toFixed(2)} USD`;
}

async function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

// ════════════════════════════════════════════════════════════════
// FASE 1: ONBOARDING CON KIT DE BIENVENIDA V2
// ════════════════════════════════════════════════════════════════

async function phase1_onboarding() {
    header(1, 'ONBOARDING - KIT DE BIENVENIDA V2');
    
    // 1.1 Landing Page
    subStep('1.1', 'Usuario visita Landing Page');
    log('🌐', 'BROWSER', 'Navegando a https://pianolink.net/comenzar...', 'blue');
    await sleep(500);
    
    // Obtener precio desde config
    const config = await GlobalConfig.findOne({ isDefault: true });
    const kitPriceUSD = config?.welcomeKitV2?.priceUSD || 44;
    log('👀', 'LANDING', `Ve el Kit de Bienvenida a $${kitPriceUSD} USD`, 'cyan');
    log('📖', 'LANDING', 'Lee los beneficios:', 'cyan');
    console.log(`      ${c.dim}• Asesoría técnica personalizada (~20 min)${c.reset}`);
    console.log(`      ${c.dim}• Sesión de Setup Técnico (~20 min)${c.reset}`);
    console.log(`      ${c.dim}• Clase de Prueba con Profesor (30 min)${c.reset}`);
    
    // 1.2 Checkout
    subStep('1.2', 'Compra del Kit de Bienvenida');
    log('🖱️', 'CLICK', '"Quiero Comenzar" → Redirige a /welcome-kit', 'blue');
    await sleep(300);
    
    log('📝', 'FORM', 'Completa formulario de checkout:', 'blue');
    const customerData = {
        name: 'Carlos Martínez',
        email: STUDENT_EMAIL,
        country: 'CL',
        whatsapp: '+56912345678',
        studentType: 'self'
    };
    console.log(`      ${c.dim}• Nombre: ${customerData.name}${c.reset}`);
    console.log(`      ${c.dim}• Email: ${customerData.email}${c.reset}`);
    console.log(`      ${c.dim}• WhatsApp: ${customerData.whatsapp}${c.reset}`);
    
    log('💳', 'PAGO', 'Click "Pagar con Tarjeta" (Stripe)', 'blue');
    await sleep(500);
    log('✅', 'STRIPE', `Pago exitoso: ${money(kitPriceUSD * 100)}`, 'green');
    
    // Crear WelcomeKit en BD con la estructura correcta del modelo
    let welcomeKit = await WelcomeKit.findOne({ clientEmail: STUDENT_EMAIL });
    if (!welcomeKit) {
        welcomeKit = new WelcomeKit({
            clientName: customerData.name,
            clientEmail: customerData.email,
            clientWhatsapp: customerData.whatsapp,
            kitType: 'setup_only', // V2 es solo servicio, sin cable físico
            payment: {
                provider: 'stripe',
                externalOrderId: `sim_${Date.now()}`,
                amount: kitPriceUSD * 100,
                currency: 'USD',
                paidAt: new Date()
            },
            shipping: {
                status: 'not_required',
                address: {
                    country: customerData.country
                }
            },
            overallStatus: 'paid',
            createdAt: new Date()
        });
        await welcomeKit.save();
    }
    
    log('📧', 'EMAIL', 'Se envía confirmación de compra al cliente', 'green');
    log('🔔', 'ADMIN', 'Notificación: Nuevo Kit de Bienvenida pendiente', 'yellow');
    
    // 1.3 Admin agenda entrevista
    subStep('1.3', 'Admin agenda Entrevista Técnica');
    log('👨‍💼', 'ADMIN', 'Abre panel admin → Welcome Kit → Onboarding V2', 'magenta');
    await sleep(300);
    log('📞', 'ADMIN', 'Contacta al cliente por WhatsApp', 'magenta');
    await sleep(300);
    log('📅', 'ADMIN', 'Agenda entrevista para mañana 10:00 AM', 'magenta');
    
    welcomeKit.overallStatus = 'entrevista_pendiente';
    welcomeKit.setupSession = {
        status: 'not_scheduled',
        technicianNotes: 'Entrevista agendada para mañana 10:00'
    };
    await welcomeKit.save();
    
    log('✅', 'STATUS', 'Estado cambia a: entrevista_pendiente', 'green');
    
    // 1.4 Email con recomendaciones
    subStep('1.4', 'Entrevista + Email con Recomendaciones');
    log('📞', 'ZOOM', 'Entrevista de 20 min con el cliente', 'blue');
    await sleep(500);
    console.log(`      ${c.dim}• Pregunta: "¿Qué teclado tienes?"${c.reset}`);
    console.log(`      ${c.dim}• Respuesta: "Yamaha P-125"${c.reset}`);
    console.log(`      ${c.dim}• Conclusión: Necesita cable USB-B${c.reset}`);
    
    log('📧', 'EMAIL', 'Admin envía recomendaciones de equipo:', 'magenta');
    console.log(`      ${c.cyan}━━━ EMAIL ━━━${c.reset}`);
    console.log(`      ${c.dim}Asunto: Tu equipo recomendado - PianoLink${c.reset}`);
    console.log(`      ${c.dim}• Cable USB-B (tipo impresora)${c.reset}`);
    console.log(`      ${c.dim}• Link Amazon: $8.99${c.reset}`);
    console.log(`      ${c.dim}• Link AliExpress: $3.50${c.reset}`);
    console.log(`      ${c.cyan}━━━━━━━━━━━━━${c.reset}`);
    
    welcomeKit.overallStatus = 'esperando_equipo';
    welcomeKit.cable = {
        type: 'USB_B',
        keyboardModel: 'Yamaha P-125',
        alreadyHasCable: false
    };
    await welcomeKit.save();
    
    log('✅', 'STATUS', 'Estado cambia a: esperando_equipo', 'green');
    
    // 1.5 Cliente confirma equipo
    subStep('1.5', 'Cliente Confirma que Tiene el Equipo');
    log('📦', 'CLIENTE', '5 días después... Cable llegó!', 'cyan');
    await sleep(500);
    log('🖱️', 'CLIENTE', 'Entra a su panel → Ve estado del onboarding', 'blue');
    log('✅', 'CLICK', 'Click en "Ya tengo mi equipo listo"', 'green');
    
    welcomeKit.overallStatus = 'setup_pending';
    welcomeKit.cable.alreadyHasCable = true;
    welcomeKit.shipping.clientConfirmedReceipt = true;
    welcomeKit.shipping.clientConfirmedAt = new Date();
    await welcomeKit.save();
    
    log('🔔', 'ADMIN', 'Notificación: Cliente listo para Setup', 'yellow');
    log('✅', 'STATUS', 'Estado cambia a: processing (Setup pendiente)', 'green');
    
    // 1.6 Sesión de Setup
    subStep('1.6', 'Sesión de Setup Técnico');
    log('📅', 'ADMIN', 'Agenda sesión de setup para el día siguiente', 'magenta');
    await sleep(300);
    log('💻', 'ZOOM', 'Videollamada de Setup (~20 min)', 'blue');
    console.log(`      ${c.dim}• Conectar cable USB-B al teclado${c.reset}`);
    console.log(`      ${c.dim}• Instalar driver MIDI${c.reset}`);
    console.log(`      ${c.dim}• Probar conexión en PianoLink${c.reset}`);
    console.log(`      ${c.dim}• Verificar audio${c.reset}`);
    log('✅', 'SETUP', '¡Todo funcionando correctamente!', 'green');
    
    welcomeKit.overallStatus = 'trial_available';
    welcomeKit.setupSession = {
        status: 'completed',
        completedAt: new Date(),
        technicianNotes: 'Setup completado correctamente. MIDI funcionando.'
    };
    await welcomeKit.save();
    
    // 1.7 Clase de Prueba
    subStep('1.7', 'Clase de Prueba con Profesor');
    
    // Crear profesor si no existe
    let teacher = await User.findOne({ email: TEACHER_EMAIL });
    if (!teacher) {
        teacher = new User({
            name: 'María González',
            email: TEACHER_EMAIL,
            password: await bcrypt.hash('Test1234!', 10),
            role: 'teacher',
            isActive: true,
            hasValidSubscription: true,
            subscriptionStatus: 'active',
            teacherData: {
                profile: {
                    bio: 'Pianista profesional - 15 años experiencia',
                    specialties: ['Piano Clásico', 'Jazz']
                },
                pricing: { hourlyRate: 3500, currency: 'USD' },
                paymentInfo: {
                    withdrawalMethod: 'bank_transfer',
                    bankName: 'Banco de Chile',
                    accountNumber: '****1234'
                }
            }
        });
        await teacher.save();
    }
    
    log('🎹', 'CLASE', 'Clase de prueba de 30 minutos', 'cyan');
    console.log(`      ${c.dim}• Profesor: ${teacher.name}${c.reset}`);
    console.log(`      ${c.dim}• Duración: 30 minutos${c.reset}`);
    console.log(`      ${c.dim}• Contenido: Introducción a la plataforma MIDI${c.reset}`);
    await sleep(500);
    
    log('🎉', 'FIN', '¡Clase de prueba exitosa!', 'green');
    log('💬', 'CLIENTE', '"¡Increíble! Quiero seguir aprendiendo"', 'cyan');
    
    welcomeKit.overallStatus = 'completed';
    welcomeKit.trialClass = {
        status: 'completed',
        teacherId: teacher._id,
        completedAt: new Date(),
        studentRating: 5,
        studentFeedback: '¡Excelente clase! Quiero seguir aprendiendo.'
    };
    await welcomeKit.save();
    
    log('✅', 'STATUS', 'Onboarding COMPLETADO', 'green');
    
    return { welcomeKit, teacher };
}

// ════════════════════════════════════════════════════════════════
// FASE 2: ALTA COMO ESTUDIANTE REGULAR
// ════════════════════════════════════════════════════════════════

async function phase2_studentRegistration(teacher) {
    header(2, 'ALTA COMO ESTUDIANTE REGULAR');
    
    // 2.1 Registro/Login
    subStep('2.1', 'Registro como Estudiante');
    
    let student = await User.findOne({ email: STUDENT_EMAIL });
    if (!student) {
        student = new User({
            name: 'Carlos Martínez',
            email: STUDENT_EMAIL,
            password: await bcrypt.hash('Test1234!', 10),
            role: 'student',
            isActive: true,
            kitPurchaseDate: new Date()
        });
        await student.save();
        log('📝', 'REGISTRO', `Cuenta creada: ${student.email}`, 'green');
    } else {
        log('🔑', 'LOGIN', `Sesión iniciada: ${student.email}`, 'green');
    }
    
    // 2.2 Explora profesores
    subStep('2.2', 'Exploración de Profesores y Paquetes');
    log('🔍', 'BROWSE', 'Cliente explora profesores disponibles...', 'blue');
    await sleep(300);
    log('👀', 'VER', `Ve perfil de ${teacher.name}`, 'cyan');
    console.log(`      ${c.dim}• "Pianista profesional - 15 años experiencia"${c.reset}`);
    console.log(`      ${c.dim}• Especialidades: Piano Clásico, Jazz${c.reset}`);
    console.log(`      ${c.dim}• ⭐⭐⭐⭐⭐ (5 estrellas)${c.reset}`);
    
    // 2.3 Compra paquete
    subStep('2.3', 'Compra de Paquete de Clases');
    
    // Crear paquete si no existe
    let package_ = await TeacherPackage.findOne({ 
        teacherId: teacher._id,
        name: { $regex: SIM_PREFIX }
    });
    
    if (!package_) {
        package_ = new TeacherPackage({
            teacherId: teacher._id,
            category: 'piano',
            name: `${SIM_PREFIX}Pack Mensual 4 Clases`,
            description: '4 clases de 45 minutos',
            classCount: 4,
            classDurationMinutes: 45,
            priceUSD: 12000, // $120 USD
            pricePerClassUSD: 3000, // $30 por clase
            validityDays: 30,
            isActive: true
        });
        await package_.save();
    }
    
    log('📦', 'PAQUETE', `Selecciona: "${package_.name}"`, 'blue');
    console.log(`      ${c.dim}• ${package_.classCount} clases de ${package_.classDurationMinutes} min${c.reset}`);
    console.log(`      ${c.dim}• Precio: ${money(package_.priceUSD)}${c.reset}`);
    console.log(`      ${c.dim}• Por clase: ${money(package_.pricePerClassUSD)}${c.reset}`);
    
    log('💳', 'PAGO', 'Paga con Stripe...', 'blue');
    await sleep(500);
    log('✅', 'STRIPE', `Pago exitoso: ${money(package_.priceUSD)}`, 'green');
    
    // Crear suscripción
    let subscription = await StudentSubscription.findOne({
        studentId: student._id,
        packageId: package_._id
    });
    
    if (!subscription) {
        subscription = new StudentSubscription({
            studentId: student._id,
            teacherId: teacher._id,
            packageId: package_._id,
            status: 'active',
            classesTotal: package_.classCount,
            classesRemaining: package_.classCount,
            classesUsed: 0,
            totalPaidUSD: package_.priceUSD,
            paymentProvider: 'stripe',
            expiresAt: new Date(Date.now() + package_.validityDays * 24 * 60 * 60 * 1000),
            notes: 'SIMULACIÓN'
        });
        await subscription.save();
    }
    
    log('✅', 'SUSCRIPCIÓN', `Activa! ${subscription.classesRemaining} clases disponibles`, 'green');
    log('📧', 'EMAIL', 'Confirmación enviada al estudiante', 'green');
    log('🔔', 'NOTIF', `Profesor notificado: Nuevo estudiante!`, 'yellow');
    
    return { student, teacher, package_, subscription };
}

// ════════════════════════════════════════════════════════════════
// FASE 3: CLASES Y SESIONES
// ════════════════════════════════════════════════════════════════

async function phase3_classes(student, teacher, package_, subscription) {
    header(3, 'CLASES Y SESIONES');
    
    const sessions = [];
    const pricePerClass = package_.pricePerClassUSD;
    const platformFee = Math.round(pricePerClass * 0.20); // 20% PianoLink
    const teacherPayout = pricePerClass - platformFee;    // 80% Profesor
    
    // Importar Booking model
    const Booking = require('../models/Booking');
    
    for (let i = 1; i <= 4; i++) {
        subStep(`3.${i}`, `Clase #${i}`);
        
        // Agendar
        const classDate = new Date(Date.now() + i * 2 * 24 * 60 * 60 * 1000);
        log('📅', 'AGENDAR', `Cliente agenda clase para ${classDate.toLocaleDateString('es-CL')} 15:00`, 'blue');
        await sleep(200);
        log('✅', 'CONFIRM', 'Profesor confirma disponibilidad', 'green');
        
        // Crear booking primero
        const classStart = new Date(classDate);
        classStart.setHours(15, 0, 0, 0);
        const classEnd = new Date(classStart);
        classEnd.setMinutes(classEnd.getMinutes() + package_.classDurationMinutes);
        
        const booking = new Booking({
            studentId: student._id,
            teacherId: teacher._id,
            subscriptionId: subscription._id,
            slotId: new mongoose.Types.ObjectId(), // Simular slot
            scheduledStart: classStart,
            scheduledEnd: classEnd,
            scheduledAt: classStart, // Alias
            duration: package_.classDurationMinutes,
            durationMinutes: package_.classDurationMinutes,
            studentTimezone: 'America/Santiago',
            teacherTimezone: 'America/Santiago',
            status: 'confirmed',
            notes: `SIMULACIÓN - Booking clase #${i}`
        });
        await booking.save();
        
        // Crear sesión
        const session = new ClassSession({
            subscriptionId: subscription._id,
            bookingId: booking._id,
            teacherId: teacher._id,
            studentId: student._id,
            scheduledAt: classDate,
            durationMinutes: package_.classDurationMinutes,
            status: 'scheduled',
            pricePerClassUSD: pricePerClass,
            platformFeeUSD: platformFee,
            teacherPayoutUSD: teacherPayout,
            payoutStatus: 'pending',
            notes: `SIMULACIÓN - Clase #${i}`
        });
        
        // Simular clase
        log('🎹', 'CLASE', `Clase en progreso...`, 'cyan');
        await sleep(300);
        
        session.status = 'completed';
        session.completedAt = new Date();
        await session.save();
        
        // Actualizar booking
        booking.status = 'completed';
        await booking.save();
        
        log('✅', 'COMPLETADA', `Clase #${i} finalizada - ${package_.classDurationMinutes} min`, 'green');
        
        // Validación del cliente
        log('📧', 'EMAIL', 'Email al cliente: "¿Tomaste tu clase?"', 'blue');
        await sleep(200);
        log('👍', 'CLIENTE', 'Confirma: "Sí, excelente clase!"', 'cyan');
        
        session.studentConfirmation = {
            confirmed: true,
            confirmedAt: new Date(),
            rating: 5,
            feedback: '¡Excelente clase!'
        };
        // payoutStatus se mantiene 'pending' hasta que se procese el batch
        await session.save();
        
        sessions.push(session);
        
        // Actualizar suscripción
        subscription.classesUsed++;
        subscription.classesRemaining--;
        await subscription.save();
        
        console.log(`      ${c.dim}• Precio clase: ${money(pricePerClass)}${c.reset}`);
        console.log(`      ${c.dim}• Fee PianoLink (20%): ${money(platformFee)}${c.reset}`);
        console.log(`      ${c.dim}• Pago profesor (80%): ${money(teacherPayout)}${c.reset}`);
        console.log(`      ${c.dim}• Clases restantes: ${subscription.classesRemaining}${c.reset}`);
    }
    
    log('🎉', 'FIN', `${sessions.length} clases completadas y validadas`, 'green');
    
    return sessions;
}

// ════════════════════════════════════════════════════════════════
// FASE 4: PAYOUT AL PROFESOR
// ════════════════════════════════════════════════════════════════

async function phase4_payout(teacher, sessions) {
    header(4, 'PAYOUT AL PROFESOR');
    
    // 4.1 Generación de payout
    subStep('4.1', 'Generación de Payout Mensual');
    log('⏰', 'CRON', 'Fin de mes: Sistema genera payouts...', 'blue');
    await sleep(500);
    
    const totalTeacherEarnings = sessions.reduce((sum, s) => sum + s.teacherPayoutUSD, 0);
    const totalPlatformFees = sessions.reduce((sum, s) => sum + s.platformFeeUSD, 0);
    
    // Crear payout
    const periodStart = new Date();
    periodStart.setDate(1);
    const periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() + 1);
    periodEnd.setDate(0);
    
    let payout = await TeacherPayout.findOne({
        teacherId: teacher._id,
        notes: { $regex: 'SIMULACIÓN' }
    });
    
    if (!payout) {
        payout = new TeacherPayout({
            teacherId: teacher._id,
            periodStart,
            periodEnd,
            status: 'pending-review',
            totalClassesCount: sessions.length,
            totalMinutes: sessions.reduce((sum, s) => sum + s.durationMinutes, 0),
            grossEarningsUSD: totalTeacherEarnings,
            netPayoutUSD: totalTeacherEarnings,
            platformFeesUSD: totalPlatformFees,
            currency: 'USD',
            notes: 'SIMULACIÓN - Payout generado automáticamente'
        });
        await payout.save();
    }
    
    log('📊', 'PAYOUT', `Payout generado para ${teacher.name}`, 'green');
    console.log(`      ${c.cyan}━━━ DETALLE PAYOUT ━━━${c.reset}`);
    console.log(`      ${c.dim}• Período: ${periodStart.toLocaleDateString()} - ${periodEnd.toLocaleDateString()}${c.reset}`);
    console.log(`      ${c.dim}• Clases: ${sessions.length}${c.reset}`);
    console.log(`      ${c.dim}• Minutos: ${sessions.reduce((sum, s) => sum + (s.durationMinutes || 0), 0)} min${c.reset}`);
    console.log(`      ${c.dim}• Ganancias Brutas: ${money(totalTeacherEarnings)}${c.reset}`);
    console.log(`      ${c.dim}• Fee plataforma (total): ${money(totalPlatformFees)}${c.reset}`);
    console.log(`      ${c.dim}• NETO A PAGAR: ${money(totalTeacherEarnings)}${c.reset}`);
    console.log(`      ${c.cyan}━━━━━━━━━━━━━━━━━━━━━${c.reset}`);
    
    // 4.2 Admin revisa
    subStep('4.2', 'Admin Revisa y Aprueba');
    log('👨‍💼', 'ADMIN', 'Abre panel admin → Payouts', 'magenta');
    await sleep(300);
    log('🔍', 'REVIEW', 'Revisa detalle del payout...', 'magenta');
    log('✅', 'APROBAR', 'Click "Aprobar Payout"', 'green');
    
    payout.status = 'approved';
    payout.approvedAt = new Date();
    payout.approvedBy = new mongoose.Types.ObjectId(); // Simular ID de admin
    await payout.save();
    
    log('📧', 'EMAIL', 'Email al profesor: "Tu pago fue aprobado"', 'green');
    
    // 4.3 Ejecutar pago
    subStep('4.3', 'Ejecución del Pago');
    log('💳', 'MÉTODO', 'Profesor tiene configurado: Transferencia Bancaria', 'blue');
    log('🏦', 'BANCO', `Banco de Chile - ****1234`, 'blue');
    await sleep(500);
    
    log('⏳', 'PROCESO', 'Ejecutando transferencia...', 'yellow');
    await sleep(500);
    
    payout.status = 'paid';
    payout.paidAt = new Date();
    payout.externalPaymentId = `TRF_${Date.now()}`;
    await payout.save();
    
    // Marcar sesiones como pagadas
    for (const session of sessions) {
        session.payoutStatus = 'paid';
        session.payoutId = payout._id;
        await session.save();
    }
    
    log('✅', 'PAGADO', `Transferencia exitosa: ${money(payout.netPayoutUSD)}`, 'green');
    log('📧', 'EMAIL', 'Email al profesor: "Pago depositado en tu cuenta"', 'green');
    
    // 4.4 Resumen final
    subStep('4.4', 'Resumen de Ciclo Completo');
    
    return payout;
}

// ════════════════════════════════════════════════════════════════
// RESUMEN FINAL
// ════════════════════════════════════════════════════════════════

async function showFinalSummary(config, welcomeKit, student, teacher, package_, subscription, sessions, payout) {
    console.log('\n');
    console.log(`${c.bgGreen}${c.bold}${'═'.repeat(70)}${c.reset}`);
    console.log(`${c.bgGreen}${c.bold}  ✅ SIMULACIÓN COMPLETA - RESUMEN FINAL                              ${c.reset}`);
    console.log(`${c.bgGreen}${c.bold}${'═'.repeat(70)}${c.reset}`);
    
    const kitPrice = config?.welcomeKitV2?.priceUSD || 44;
    
    console.log(`
${c.cyan}${c.bold}📊 FLUJO DE DINERO${c.reset}
${c.dim}${'─'.repeat(50)}${c.reset}

${c.yellow}INGRESOS PIANOLINK:${c.reset}
  • Kit de Bienvenida:     ${money(kitPrice * 100)}
  • Paquete de clases:     ${money(package_.priceUSD)}
  • Fee plataforma (20%):  ${money(sessions.reduce((s, x) => s + x.platformFeeUSD, 0))}
  ${c.bold}─────────────────────────${c.reset}
  ${c.green}TOTAL INGRESOS:        ${money(kitPrice * 100 + package_.priceUSD)}${c.reset}

${c.yellow}PAGOS A PROFESOR:${c.reset}
  • Clases (80%):          ${money(payout.netPayoutUSD)}
  ${c.bold}─────────────────────────${c.reset}
  ${c.green}MARGEN PIANOLINK:      ${money(kitPrice * 100 + sessions.reduce((s, x) => s + x.platformFeeUSD, 0))}${c.reset}

${c.cyan}${c.bold}📈 ESTADÍSTICAS${c.reset}
${c.dim}${'─'.repeat(50)}${c.reset}
  • Estudiante: ${student.name} (${student.email})
  • Profesor: ${teacher.name} (${teacher.email})
  • Clases completadas: ${sessions.length}
  • Minutos de clase: ${sessions.reduce((s, x) => s + x.durationMinutes, 0)} min
  • Rating promedio: ⭐⭐⭐⭐⭐ (5.0)

${c.cyan}${c.bold}🔄 ESTADOS FINALES${c.reset}
${c.dim}${'─'.repeat(50)}${c.reset}
  • WelcomeKit: ${c.green}completed${c.reset}
  • Suscripción: ${subscription.classesRemaining === 0 ? c.yellow + 'expired' : c.green + 'active'}${c.reset}
  • Sesiones: ${c.green}paid${c.reset}
  • Payout: ${c.green}paid${c.reset}

${c.bold}${c.green}✨ ¡Ciclo completo exitoso!${c.reset}
`);
}

// ════════════════════════════════════════════════════════════════
// CLEANUP
// ════════════════════════════════════════════════════════════════

async function cleanup() {
    console.log(`\n${c.yellow}🧹 Limpiando datos de simulación...${c.reset}`);
    
    const Booking = require('../models/Booking');
    
    const results = await Promise.all([
        User.deleteMany({ email: { $regex: SIM_PREFIX } }),
        WelcomeKit.deleteMany({ clientEmail: { $regex: SIM_PREFIX } }),
        TeacherPackage.deleteMany({ name: { $regex: SIM_PREFIX } }),
        StudentSubscription.deleteMany({ notes: { $regex: 'SIMULACIÓN' } }),
        ClassSession.deleteMany({ notes: { $regex: 'SIMULACIÓN' } }),
        TeacherPayout.deleteMany({ notes: { $regex: 'SIMULACIÓN' } }),
        Booking.deleteMany({ notes: { $regex: 'SIMULACIÓN' } })
    ]);
    
    console.log(`   • Usuarios eliminados: ${results[0].deletedCount}`);
    console.log(`   • Kits eliminados: ${results[1].deletedCount}`);
    console.log(`   • Paquetes eliminados: ${results[2].deletedCount}`);
    console.log(`   • Suscripciones eliminadas: ${results[3].deletedCount}`);
    console.log(`   • Sesiones eliminadas: ${results[4].deletedCount}`);
    console.log(`   • Payouts eliminados: ${results[5].deletedCount}`);
    console.log(`   • Bookings eliminados: ${results[6].deletedCount}`);
    console.log(`${c.green}✅ Limpieza completada${c.reset}\n`);
}

// ════════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════════

async function main() {
    console.log(`
${c.bold}${c.cyan}
╔═══════════════════════════════════════════════════════════════════════╗
║                                                                       ║
║   🎹  PIANOLINK - SIMULACIÓN CICLO COMPLETO V2                       ║
║                                                                       ║
║   Landing → Kit → Onboarding → Clases → Payout                       ║
║                                                                       ║
╚═══════════════════════════════════════════════════════════════════════╝
${c.reset}`);

    try {
        // Conectar a MongoDB
        const dbUri = process.env.MONGO_URI || process.env.MONGODB_URI;
        if (!dbUri) {
            throw new Error('No se encontró MONGO_URI en variables de entorno');
        }
        await mongoose.connect(dbUri);
        console.log(`${c.green}✅ Conectado a MongoDB${c.reset}\n`);
        
        // Check for cleanup flag
        if (process.argv.includes('--cleanup')) {
            await cleanup();
            await mongoose.disconnect();
            return;
        }
        
        // Limpiar datos anteriores
        await cleanup();
        
        // Obtener config
        const config = await GlobalConfig.findOne({ isDefault: true });
        
        // Ejecutar simulación
        const { welcomeKit, teacher } = await phase1_onboarding();
        const { student, package_, subscription } = await phase2_studentRegistration(teacher);
        const sessions = await phase3_classes(student, teacher, package_, subscription);
        const payout = await phase4_payout(teacher, sessions);
        
        // Mostrar resumen
        await showFinalSummary(config, welcomeKit, student, teacher, package_, subscription, sessions, payout);
        
        // Desconectar
        await mongoose.disconnect();
        console.log(`${c.dim}Desconectado de MongoDB${c.reset}\n`);
        
    } catch (error) {
        console.error(`${c.red}❌ Error: ${error.message}${c.reset}`);
        console.error(error.stack);
        await mongoose.disconnect();
        process.exit(1);
    }
}

main();
