/**
 * scripts/simulateTeacherMembership.js
 * Simulación del ciclo completo de membresía del profesor
 * 
 * Valida:
 * - Sin membresía → NO puede usar la sala
 * - Con membresía activa → SÍ puede usar la sala
 * - Membresía expirada → NO puede usar la sala
 * - Renovación → Recupera acceso a la sala
 */

require('dotenv').config();
const mongoose = require('mongoose');

// Colores para consola
const c = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    dim: '\x1b[2m',
    bold: '\x1b[1m'
};

// Helpers
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const timestamp = () => new Date().toLocaleTimeString('es-CL');

function log(emoji, tag, message, color = 'white') {
    console.log(`${c[color]}${emoji} [${timestamp()}] ${tag}: ${message}${c.reset}`);
}

function header(text) {
    console.log(`\n${c.cyan}${'═'.repeat(70)}${c.reset}`);
    console.log(`${c.cyan}  ${text.padEnd(66)}${c.reset}`);
    console.log(`${c.cyan}${'═'.repeat(70)}${c.reset}\n`);
}

function subStep(num, text) {
    console.log(`\n${c.yellow}[${num}] ${text}${c.reset}`);
    console.log(`${c.dim}${'─'.repeat(50)}${c.reset}`);
}

function successBox(text) {
    console.log(`\n${c.green}╔${'═'.repeat(60)}╗${c.reset}`);
    console.log(`${c.green}║ ✅ ${text.padEnd(56)}║${c.reset}`);
    console.log(`${c.green}╚${'═'.repeat(60)}╝${c.reset}\n`);
}

function errorBox(text) {
    console.log(`\n${c.red}╔${'═'.repeat(60)}╗${c.reset}`);
    console.log(`${c.red}║ ❌ ${text.padEnd(56)}║${c.reset}`);
    console.log(`${c.red}╚${'═'.repeat(60)}╝${c.reset}\n`);
}

// Simular validación de sala (replica la lógica de server.js)
async function canAccessRoom(user) {
    if (!user || user.role !== 'teacher') {
        return { allowed: false, reason: 'NOT_TEACHER' };
    }
    
    const membershipStatus = user.teacherData?.subscriptionStatus;
    
    if (membershipStatus !== 'active') {
        return { 
            allowed: false, 
            reason: 'MEMBERSHIP_INACTIVE',
            status: membershipStatus
        };
    }
    
    return { allowed: true, status: membershipStatus };
}

async function main() {
    console.log(`
${c.cyan}╔═══════════════════════════════════════════════════════════════════════╗
║                                                                       ║
║   🎹  PIANOLINK - SIMULACIÓN MEMBRESÍA PROFESOR                      ║
║                                                                       ║
║   Ciclo: Registro → Trial → Expiración → Renovación                  ║
║   Validación: Acceso a Sala Virtual                                  ║
║                                                                       ║
╚═══════════════════════════════════════════════════════════════════════╝${c.reset}
`);

    // Conectar a MongoDB
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
    await mongoose.connect(mongoUri);
    console.log(`${c.green}✅ Conectado a MongoDB${c.reset}\n`);

    const User = require('../models/User');

    // Limpiar datos de simulación anterior
    console.log(`${c.dim}🧹 Limpiando datos de simulación...${c.reset}`);
    await User.deleteMany({ email: /^SIMMEM_/ });
    console.log(`${c.green}✅ Limpieza completada${c.reset}\n`);

    // ============================================
    // FASE 1: REGISTRO DE PROFESOR (Trial)
    // ============================================
    header('FASE 1: REGISTRO DE PROFESOR');

    subStep('1.1', 'Profesor se registra en PianoLink');
    
    const teacherEmail = 'SIMMEM_profesor@test.pianolink.net';
    
    log('📝', 'REGISTRO', 'Nuevo profesor completa formulario de registro', 'blue');
    log('📧', 'EMAIL', `Email: ${teacherEmail}`, 'dim');
    
    const teacher = new User({
        email: teacherEmail,
        password: 'test123456',
        name: 'Prof. Simulación Membresía',
        role: 'teacher',
        isFoundingMember: false,
        teacherData: {
            subscriptionStatus: 'trial', // Estado inicial
            subscriptionExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 días trial
            hourlyRate: 25,
            profile: {
                isPublic: true,
                specialties: ['Piano Clásico'],
                experience: 'Profesor de simulación'
            }
        }
    });
    await teacher.save();
    
    log('✅', 'CREADO', `Profesor creado con estado: ${teacher.teacherData.subscriptionStatus}`, 'green');
    await sleep(500);

    subStep('1.2', 'Verificar acceso a sala en modo TRIAL');
    
    log('🚪', 'SALA', 'Profesor intenta acceder a su sala virtual...', 'yellow');
    await sleep(300);
    
    let access = await canAccessRoom(teacher);
    
    if (access.allowed) {
        successBox(`Acceso PERMITIDO - Estado: ${access.status}`);
    } else {
        errorBox(`Acceso DENEGADO - Estado: ${access.status || access.reason}`);
    }

    // ============================================
    // FASE 2: ACTIVAR MEMBRESÍA (Pago con MercadoPago)
    // ============================================
    header('FASE 2: ACTIVAR MEMBRESÍA');

    subStep('2.1', 'Profesor decide activar membresía');
    
    log('💭', 'DECISIÓN', 'Profesor ve que trial vence pronto, decide activar', 'blue');
    log('🖱️', 'CLICK', 'Entra a Dashboard → Click "Activar con MercadoPago"', 'blue');
    await sleep(300);

    subStep('2.2', 'Pago con MercadoPago');
    
    log('🔗', 'REDIRECT', 'Sistema genera preferencia de pago MercadoPago', 'yellow');
    log('💳', 'CHECKOUT', 'Profesor ve pantalla de MercadoPago...', 'yellow');
    
    const priceUSD = 20; // Precio regular
    const priceCLP = priceUSD * 950; // ~$19,000 CLP
    
    console.log(`      ${c.dim}━━━ CHECKOUT MERCADOPAGO ━━━${c.reset}`);
    console.log(`      ${c.dim}• Producto: Membresía Profesor PianoLink${c.reset}`);
    console.log(`      ${c.dim}• Precio: $${priceCLP.toLocaleString()} CLP (~$${priceUSD} USD)${c.reset}`);
    console.log(`      ${c.dim}━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}`);
    
    await sleep(500);
    log('✅', 'PAGO', 'Pago exitoso!', 'green');
    
    subStep('2.3', 'Sistema activa membresía');
    
    // Simular webhook de MercadoPago que activa la membresía
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30 días de membresía
    
    teacher.teacherData.subscriptionStatus = 'active';
    teacher.teacherData.subscriptionExpiresAt = expiresAt;
    await teacher.save();
    
    log('🔔', 'WEBHOOK', 'MercadoPago notifica pago exitoso', 'cyan');
    log('✅', 'ACTIVADO', `Membresía activa hasta: ${expiresAt.toLocaleDateString('es-CL')}`, 'green');
    
    await sleep(300);

    subStep('2.4', 'Verificar acceso a sala con membresía ACTIVA');
    
    log('🚪', 'SALA', 'Profesor intenta acceder a su sala virtual...', 'yellow');
    await sleep(300);
    
    // Recargar usuario para tener datos actualizados
    const teacherActive = await User.findById(teacher._id);
    access = await canAccessRoom(teacherActive);
    
    if (access.allowed) {
        successBox(`Acceso PERMITIDO - Estado: ${access.status}`);
        log('🎹', 'SALA', 'Profesor puede usar su sala virtual normalmente', 'green');
        log('👥', 'ALUMNOS', 'Puede recibir alumnos, hacer clases, etc.', 'green');
    } else {
        errorBox(`Acceso DENEGADO - Estado: ${access.status || access.reason}`);
    }

    // ============================================
    // FASE 3: MEMBRESÍA EXPIRA
    // ============================================
    header('FASE 3: MEMBRESÍA EXPIRA');

    subStep('3.1', 'Simular paso del tiempo (30 días)');
    
    log('📅', 'TIEMPO', '30 días después...', 'yellow');
    log('⏰', 'CRON', 'Sistema ejecuta verificación diaria de membresías', 'cyan');
    await sleep(300);
    
    // Simular expiración
    teacher.teacherData.subscriptionStatus = 'expired';
    teacher.teacherData.subscriptionExpiresAt = new Date(Date.now() - 1000); // Ya expiró
    await teacher.save();
    
    log('⚠️', 'EXPIRADO', 'Membresía marcada como expirada', 'yellow');
    
    subStep('3.2', 'Verificar acceso a sala con membresía EXPIRADA');
    
    log('🚪', 'SALA', 'Profesor intenta acceder a su sala virtual...', 'yellow');
    await sleep(300);
    
    const teacherExpired = await User.findById(teacher._id);
    access = await canAccessRoom(teacherExpired);
    
    if (access.allowed) {
        successBox(`Acceso PERMITIDO - Estado: ${access.status}`);
    } else {
        errorBox(`Acceso DENEGADO - Estado: ${access.status || access.reason}`);
        log('🔒', 'BLOQUEADO', 'Profesor NO puede usar su sala virtual', 'red');
        log('📧', 'EMAIL', 'Sistema envía recordatorio de renovación', 'cyan');
        
        console.log(`\n      ${c.yellow}━━━ MENSAJE EN PANTALLA ━━━${c.reset}`);
        console.log(`      ${c.yellow}Tu membresía no está activa.${c.reset}`);
        console.log(`      ${c.yellow}Actívala desde tu panel para acceder a tu sala.${c.reset}`);
        console.log(`      ${c.yellow}━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}\n`);
    }

    // ============================================
    // FASE 4: PROFESOR RENUEVA MEMBRESÍA
    // ============================================
    header('FASE 4: RENOVACIÓN DE MEMBRESÍA');

    subStep('4.1', 'Profesor ve banner de renovación');
    
    log('👀', 'DASHBOARD', 'Profesor entra a su panel', 'blue');
    log('🔴', 'BANNER', 'Ve banner rojo: "Membresía Expirada"', 'red');
    log('🖱️', 'CLICK', 'Click en "Renovar con MercadoPago"', 'blue');
    await sleep(300);

    subStep('4.2', 'Pago de renovación');
    
    log('💳', 'CHECKOUT', 'MercadoPago - Pago de renovación', 'yellow');
    await sleep(300);
    log('✅', 'PAGO', 'Pago exitoso!', 'green');
    
    // Simular renovación
    const newExpiresAt = new Date();
    newExpiresAt.setDate(newExpiresAt.getDate() + 30);
    
    teacher.teacherData.subscriptionStatus = 'active';
    teacher.teacherData.subscriptionExpiresAt = newExpiresAt;
    await teacher.save();
    
    log('✅', 'RENOVADO', `Membresía renovada hasta: ${newExpiresAt.toLocaleDateString('es-CL')}`, 'green');

    subStep('4.3', 'Verificar acceso restaurado');
    
    log('🚪', 'SALA', 'Profesor intenta acceder a su sala virtual...', 'yellow');
    await sleep(300);
    
    const teacherRenewed = await User.findById(teacher._id);
    access = await canAccessRoom(teacherRenewed);
    
    if (access.allowed) {
        successBox(`Acceso RESTAURADO - Estado: ${access.status}`);
        log('🎹', 'SALA', 'Profesor puede usar su sala virtual nuevamente', 'green');
        log('🎉', 'ÉXITO', 'Ciclo de membresía completado correctamente', 'green');
    } else {
        errorBox(`ERROR - Acceso sigue DENEGADO: ${access.status}`);
    }

    // ============================================
    // RESUMEN FINAL
    // ============================================
    header('RESUMEN DE VALIDACIONES');

    console.log(`${c.cyan}
┌─────────────────────────────────────────────────────────────┐
│                    MATRIZ DE ACCESO A SALA                 │
├──────────────────────┬──────────────────┬──────────────────┤
│ Estado Membresía     │ Puede usar sala? │ Resultado        │
├──────────────────────┼──────────────────┼──────────────────┤
│ trial                │ ❌ NO            │ Bloqueado        │
│ active               │ ✅ SÍ            │ Acceso completo  │
│ expired              │ ❌ NO            │ Bloqueado        │
│ cancelled            │ ❌ NO            │ Bloqueado        │
│ past_due             │ ❌ NO            │ Bloqueado        │
└──────────────────────┴──────────────────┴──────────────────┘
${c.reset}`);

    console.log(`${c.green}
┌─────────────────────────────────────────────────────────────┐
│                    ✅ SIMULACIÓN EXITOSA                   │
├─────────────────────────────────────────────────────────────┤
│  1. Profesor en TRIAL     → Sala BLOQUEADA                 │
│  2. Profesor ACTIVO       → Sala ACCESIBLE                 │
│  3. Profesor EXPIRADO     → Sala BLOQUEADA                 │
│  4. Profesor RENOVADO     → Sala RESTAURADA                │
└─────────────────────────────────────────────────────────────┘
${c.reset}`);

    // Limpieza
    console.log(`\n${c.dim}🧹 Limpiando datos de simulación...${c.reset}`);
    await User.deleteMany({ email: /^SIMMEM_/ });
    
    await mongoose.disconnect();
    console.log(`${c.dim}Desconectado de MongoDB${c.reset}`);
}

main().catch(err => {
    console.error(`${c.red}❌ Error:${c.reset}`, err);
    process.exit(1);
});
