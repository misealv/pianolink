const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");
const dotenv = require("dotenv");
const cookieParser = require("cookie-parser");
const connectDB = require("./config/db");
const Annotation = require('./models/Annotation');

// 1. Configuración Inicial
dotenv.config();

console.log('[SERVER] 🚀 Iniciando PianoLink...');
console.log(`[SERVER] 🌍 Entorno: ${process.env.NODE_ENV}`);

connectDB();

// ✨ NUEVO: Inicializar sistema de eventos y listeners
console.log('[SERVER] 📬 Registrando listeners de email...');
const { registerEmailListeners } = require('./listeners/emailListeners');
registerEmailListeners(); // Registra listeners de email al iniciar la app

// ✨ NUEVO: Inicializar listeners del CRM
console.log('[SERVER] 📊 Registrando listeners del CRM...');
const { registerCrmListeners } = require('./listeners/crmEventListener');
const eventService = require('./services/EventService');
registerCrmListeners(eventService);

// Verificar configuración de email
const emailService = require('./services/EmailService');
const emailStatus = emailService.getStatus();
console.log('[SERVER] 📧 Estado del servicio de email:', JSON.stringify(emailStatus, null, 2));

// ✨ NUEVO: Inicializar Session Tracker
const SessionTracker = require('./services/SessionTracker');
console.log('[SERVER] 📊 Session Tracker inicializado');

// ✨ NUEVO: Inicializar Servicio de Auditoría de Diagnóstico
const DiagnosticAuditService = require('./services/DiagnosticAuditService');
console.log('[SERVER] 🔍 Diagnostic Audit Service inicializado');

// ✨ v2.0: Inicializar servicios de suscripción y cron
const CronService = require('./services/CronService');
CronService.start();
console.log('[SERVER] ⏰ Cron Service inicializado');

const app = express();
const server = http.createServer(app);

// Configuración Socket.io para Binarios con Keepalive Anti-Zombie
// HIGH-PRIORITY MIDI STREAM (Fase 5)
const allowedOrigins = process.env.NODE_ENV === 'production' 
    ? (process.env.CORS_ORIGINS || 'https://pianolink.com').split(',').map(o => o.trim())
    : ['http://localhost:3000', 'http://127.0.0.1:3000'];

const io = new Server(server, {
    cors: { 
        origin: allowedOrigins,
        methods: ['GET', 'POST'],
        credentials: true
    },
    // 🔒 OPTIMIZADO PARA RENDER FREE (512MB)
    maxHttpBufferSize: 1e6,  // 1 MB (reducido de 10 MB) - suficiente para MIDI
    pingTimeout: 60000,      // 60s (reducido de 120s) - detectar desconexiones más rápido
    pingInterval: 25000,     // Enviar ping cada 25s
    connectTimeout: 30000,   // 30s timeout (reducido de 45s)
    transports: ['websocket', 'polling'], // Fallback a polling si websocket falla
    
    // === OPTIMIZACIÓN DE LATENCIA PARA MIDI ===
    perMessageDeflate: false,  // Desactivar compresión (latencia > compresión para MIDI)
    httpCompression: false,    // Sin compresión HTTP (MIDI binario no comprime bien)
    allowUpgrades: true,       // Permitir upgrade de polling → websocket
    upgradeTimeout: 10000,     // 10s para upgrade
    
    // 🔒 LÍMITES DE MEMORIA
    maxPayload: 1e6,           // 1 MB máximo por mensaje
    
    // === PRIORIZACIÓN DE MENSAJES ===
    // Socket.io v4 no soporta priorización nativa, pero podemos usar:
    // - Eventos separados para MIDI vs otros (implementado)
    // - Compression solo para datos grandes (PDF), no para MIDI
});

// 2. Middlewares y Rutas

// ⚠️ IMPORTANTE: Webhook de Stripe necesita raw body ANTES de express.json()
// Esto es necesario para verificar la firma del webhook
const StripeService = require('./services/StripeService');
app.post('/api/webhooks/stripe', 
    express.raw({ type: 'application/json' }), 
    async (req, res) => {
        console.log('[Webhook] Stripe recibido');
        
        try {
            if (!StripeService.isConfigured()) {
                console.error('[Webhook] Stripe no configurado');
                return res.status(503).send('Stripe not configured');
            }

            const result = await StripeService.processWebhook(req);
            
            if (!result.success && result.error === 'INVALID_SIGNATURE') {
                console.error('[Webhook] ⚠️ Firma inválida de Stripe');
                return res.status(400).send('Invalid signature');
            }
            
            console.log(`[Webhook] Stripe procesado: ${result.eventType}`);
            res.status(200).json({ received: true });

        } catch (error) {
            console.error('[Webhook] Error Stripe:', error);
            res.status(500).send('Webhook error');
        }
    }
);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public"), { index: false }));

// Servir páginas HTML específicas
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Panel de Diagnóstico del Sistema (solo admin - verificación en frontend)
app.get('/diagnostics', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'diagnostics.html'));
});

// Ruta para Login
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Rutas para Magic Link y Recuperación de Password
app.get('/acceso/:token', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'establecer-password.html'));
});

app.get('/recuperar-password', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'recuperar-password.html'));
});

app.get('/recuperar/:token', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'recuperar-password.html'));
});

// Landing de ventas del Welcome Kit (para buyer persona Elena) - Día 88
app.get(['/comenzar', '/empezar', '/tu-sueno-piano', '/dia-88'], (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'comenzar.html'));
});

// Landing para profesores (postulación programa fundadores)
app.get(['/profesores-fundadores', '/ser-profesor', '/ensenar'], (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'landing.html'));
});

// Ruta limpia para Welcome Kit (checkout)
app.get(['/kit', '/welcome-kit', '/kit-bienvenida'], (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'kit-bienvenida-v2.html'));
});

// Página de Pricing / Planes para profesores (Fase 4 v5.0)
app.get(['/pricing', '/precios', '/planes'], (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'pricing.html'));
});

// Rutas API (Mantenemos tu lógica de negocio intacta)
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/password', require('./routes/passwordRoutes')); // Magic Link y Recuperación
app.use('/api/teacher', require('./routes/teacherRoutes'));
app.use('/api/scores', require('./routes/scoreRoutes'));
app.use('/api/leads', require('./routes/leadRoutes')); // Lead generation
app.use('/api/calendar', require('./routes/calendarRoutes')); // Google Calendar integration
app.use('/api/analytics', require('./routes/analyticsRoutes')); // Session Analytics
app.use('/admin', require('./routes/adminRoutes'));

// ✨ v2.0: Rutas de Suscripciones, Salas y Webhooks
app.use('/api/rooms', require('./routes/rooms'));
app.use('/api/subscription', require('./routes/subscription'));
app.use('/api/webhooks', require('./routes/webhooks'));
app.use('/api/payment', require('./routes/payment')); // PayPal payments
app.use('/api/admin/payments', require('./routes/adminPayments')); // Admin payments
app.use('/api/admin/payouts', require('./routes/adminPayouts')); // Admin payouts a profesores
app.use('/api/welcome-kit', require('./routes/welcomeKitRoutes')); // Welcome Kit checkout
app.use('/api/kit-products', require('./routes/kitProductRoutes')); // Productos del Welcome Kit
app.use('/api/client', require('./routes/clientRoutes')); // Panel del cliente
app.use('/api/availability', require('./routes/availabilityRoutes')); // Calendario disponibilidad
app.use('/api/bookings', require('./routes/bookingRoutes')); // Reservas de clases
app.use('/api/diagnostic', require('./routes/diagnosticRoutes')); // Auditoría de diagnóstico
app.use('/api/teacher-profile', require('./routes/teacherProfile')); // Perfil público y tarifas
app.use('/api/class-purchase', require('./routes/classPurchase')); // Compra de clases

// === SISTEMA DE SUSCRIPCIONES ESTUDIANTE-PROFESOR ===
app.use('/api/teacher-packages', require('./routes/teacherPackageRoutes')); // Paquetes de clases
app.use('/api/subscriptions', require('./routes/subscriptionRoutes')); // Suscripciones de estudiantes
app.use('/api/class-sessions', require('./routes/classSessionRoutes')); // Sesiones y validación

// === INVITACIONES DE ALUMNOS PRIVADOS (Fase 3 v5.0) ===
app.use('/api/invite', require('./routes/invite')); // Generar, listar, revocar, registrar por invitación

// === CHECKOUT MEMBRESÍA PROFESOR (Fase 4 v5.0) ===
app.use('/api/membership', require('./routes/membershipCheckout')); // Checkout premium/founder + estado

// === OFERTA EARLY BIRD (Fase 5 v5.0) ===
app.use('/api/config', require('./routes/configRoutes'));           // Config pública: /api/config/early-bird
app.use('/api/early-bird', require('./routes/earlyBirdCheckout'));  // Checkout early bird kit

// === MÓDULO CRM ===
app.use('/api/crm', require('./crm')); // CRM: leads, campañas, conversiones, dashboard
app.use('/l', require('./crm/routes/crmLandingPublicRoutes')); // Landings públicas: /l/:slug

// Ruta para página de éxito del Welcome Kit (sin .html)
app.get('/welcome-kit/success', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'welcome-kit', 'success.html'));
});

// Ruta para éxito de waitlist con oferta early bird (Fase 5 v5.0)
app.get('/success-waitlist', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'success-waitlist.html'));
});

// Oferta madrugadores — página dedicada para CTAs de emails (sin countdown de minutos)
app.get('/oferta-madrugadores', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'oferta-madrugadores.html'));
});

// Catálogo y perfiles de profesores (URLs limpias)
app.get('/profesores', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'profesores.html'));
});

app.get('/profesor/:slug', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'profesor-perfil.html'));
});

// Ruta de invitación de alumno privado (Fase 3 v5.0)
app.get('/invite/:code', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'invite-register.html'));
});

// Ruta para Mi Kit (dashboard del cliente)
app.get('/mi-kit', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'mi-kit.html'));
});

// Ruta para Panel del Cliente
app.get('/cliente', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'cliente.html'));
});

// ==================================================
// TRACKING SCRIPTS ENDPOINT - Servir scripts dinámicamente
// ==================================================
const GlobalConfig = require('./models/GlobalConfig');

app.get('/tracking-scripts.js', async (req, res) => {
    try {
        const config = await GlobalConfig.findOne({ isDefault: true });
        
        let scripts = '/* PianoLink - Tracking Scripts */\n';
        
        if (config && config.trackingScripts) {
            if (config.trackingScripts.facebookPixel) {
                scripts += '\n/* Facebook Pixel */\n';
                scripts += config.trackingScripts.facebookPixel + '\n\n';
            }
            
            if (config.trackingScripts.googleAnalytics) {
                scripts += '\n/* Google Analytics */\n';
                scripts += config.trackingScripts.googleAnalytics + '\n\n';
            }
        }
        
        if (scripts === '/* PianoLink - Tracking Scripts */\n') {
            scripts += '\nconsole.log("⚠️ No hay scripts de tracking configurados. Configúralos en Admin → Tracking");\n';
        }
        
        res.setHeader('Content-Type', 'application/javascript');
        res.send(scripts);
    } catch (error) {
        console.error('[Tracking] Error sirviendo scripts:', error);
        res.setHeader('Content-Type', 'application/javascript');
        res.send('console.error("Error cargando tracking scripts");');
    }
});

// ==================================================
// AGORA AV - FASE 0: ENDPOINT RESILIENTE
// ==================================================
/**
 * Endpoint para obtener credenciales de Agora
 * RESILIENCIA: Nunca falla, retorna valores vacíos si no existen variables
 */
app.get('/api/agora/credentials', (req, res) => {
    const appId = process.env.AGORA_APP_ID || '';
    const appCertificate = process.env.AGORA_APP_CERTIFICATE || '';
    
    if (!appId) {
        console.warn('[Agora] ⚠️ AGORA_APP_ID no configurado en .env');
    }
    
    if (!appCertificate) {
        console.warn('[Agora] ⚠️ AGORA_APP_CERTIFICATE no configurado en .env');
    }
    
    // 🔍 AUDIT: Log solicitud de credenciales Agora
    if (DiagnosticAuditService.isActive()) {
        DiagnosticAuditService.logEvent('audio', 'agora_credentials_request', {
            hasAppId: !!appId,
            hasToken: !!appCertificate,
            ip: req.ip
        }, 'info');
    }
    
    // SIEMPRE responde 200 OK, nunca 500
    res.status(200).json({
        success: !!appId, // true si existe AppId
        appId: appId,
        hasToken: !!appCertificate, // Indica si hay certificado (para tokens futuros)
        timestamp: Date.now()
    });
});

// ==================================================
// EMAIL SERVICE - ENDPOINT DE DIAGNÓSTICO
// ==================================================
/**
 * Endpoint para verificar el estado del servicio de emails
 * Útil para debugging en producción
 */
app.get('/api/email/status', (req, res) => {
    const emailService = require('./services/EmailService');
    const eventService = require('./services/EventService');
    
    const status = {
        email: emailService.getStatus(),
        events: {
            listenerCount: eventService.listenerCount('teacher.created'),
            maxListeners: eventService.getMaxListeners()
        },
        env: {
            NODE_ENV: process.env.NODE_ENV,
            RESEND_API_KEY_SET: !!process.env.RESEND_API_KEY,
            EMAIL_FROM: process.env.EMAIL_FROM,
            EMAIL_FROM_NAME: process.env.EMAIL_FROM_NAME,
            FRONTEND_URL: process.env.FRONTEND_URL
        }
    };
    
    res.json(status);
});

// ==================================================
// PLB (PIANO LINK BRAIN) - ENDPOINT DE STATUS
// ==================================================
/**
 * Endpoint para verificar el estado del servicio PLB
 */
app.get('/api/plb/status', (req, res) => {
    const PLBService = require('./services/PLBService');
    res.json(PLBService.getMetrics());
});

app.get('/', (req, res) => {
  // A) Si la URL tiene parámetros (ej: ?sala=123 o ?role=student) -> Mostrar Piano
  if (req.query.sala || req.query.room || req.query.role || req.query.code) {
      return res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
  
  // B) Servir la landing principal de la historia de Miguel Antonio
  res.sendFile(path.join(__dirname, 'public', 'comenzar.html'));
});


// Rutas de Entrada (SPA)
app.get(['/c/:slug'], async (req, res) => {
    const slug = req.params.slug;
    
    // Verificar si el profesor tiene membresía activa (para profesores que acceden a su sala)
    try {
        const Room = require('./models/Room');
        const User = require('./models/User');
        
        const room = await Room.findOne({ slug: slug.toLowerCase() });
        
        if (room) {
            const teacher = await User.findById(room.teacherId).select('teacherData role');
            
            if (teacher && teacher.role === 'teacher') {
                const status = teacher.teacherData?.subscriptionStatus;
                
                if (status !== 'active') {
                    // Profesor sin membresía - servir página de membresía requerida
                    return res.send(`
                        <!DOCTYPE html>
                        <html lang="es">
                        <head>
                            <meta charset="UTF-8">
                            <meta name="viewport" content="width=device-width, initial-scale=1.0">
                            <title>Membresía Requerida - PianoLink</title>
                            <link rel="icon" href="/img/favicon.ico">
                            <style>
                                * { margin: 0; padding: 0; box-sizing: border-box; }
                                body {
                                    font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
                                    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
                                    min-height: 100vh;
                                    display: flex;
                                    align-items: center;
                                    justify-content: center;
                                    color: white;
                                    padding: 20px;
                                }
                                .container {
                                    text-align: center;
                                    max-width: 450px;
                                }
                                .icon { font-size: 72px; margin-bottom: 24px; }
                                h1 { font-size: 28px; margin-bottom: 16px; color: #f59e0b; }
                                p { font-size: 16px; color: rgba(255,255,255,0.8); line-height: 1.6; margin-bottom: 32px; }
                                .buttons { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
                                .btn {
                                    display: inline-flex; align-items: center; gap: 8px;
                                    padding: 14px 28px; border-radius: 10px; text-decoration: none;
                                    font-weight: 700; font-size: 14px; transition: all 0.3s;
                                }
                                .btn-primary {
                                    background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
                                    color: white; box-shadow: 0 4px 15px rgba(99,102,241,0.4);
                                }
                                .btn-primary:hover { transform: translateY(-2px); }
                                .btn-secondary {
                                    background: transparent; color: white;
                                    border: 2px solid rgba(255,255,255,0.3);
                                }
                                .btn-secondary:hover { border-color: rgba(255,255,255,0.6); }
                            </style>
                        </head>
                        <body>
                            <div class="container">
                                <div class="icon">🎹</div>
                                <h1>Membresía Requerida</h1>
                                <p>La sala de clases no está disponible porque la membresía del profesor no está activa.</p>
                                <div class="buttons">
                                    <a href="/dashboard.html" class="btn btn-primary">💳 Activar Membresía</a>
                                    <a href="/" class="btn btn-secondary">← Volver al Inicio</a>
                                </div>
                            </div>
                        </body>
                        </html>
                    `);
                }
            }
        }
    } catch (err) {
        console.error('[Route] Error verificando membresía:', err);
        // En caso de error, permitir acceso (fail-open)
    }
    
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==================================================
// 3. LÓGICA DE TIEMPO REAL (RELAY V3)
// ==================================================
const rooms = {};
let snapshotHeartbeatInterval = null; // Heartbeat global del snapshot protocol

// === SEGURIDAD: Validación de autorización de usuario ===
function validateUserInRoom(socket, roomCode, requiredRole = null) {
    const room = rooms[roomCode];
    
    if (!room) {
        console.warn(`[Security] Sala inexistente: ${roomCode}`);
        return false;
    }
    
    const user = room.users[socket.id];
    
    if (!user) {
        console.warn(`[Security] Usuario no autorizado en sala ${roomCode}: ${socket.id}`);
        return false;
    }
    
    // ⚡ FIX: 'admin' tiene mismos permisos que 'teacher'
    if (requiredRole) {
        const userRole = user.role;
        const hasPermission = (requiredRole === 'teacher') 
            ? (userRole === 'teacher' || userRole === 'admin')
            : (userRole === requiredRole);
            
        if (!hasPermission) {
            console.warn(`[Security] Usuario sin permisos (requiere ${requiredRole}, tiene ${userRole}): ${socket.id}`);
            return false;
        }
    }
    
    return true;
}

// === MIDI BUNDLE DECODER (SERVER-SIDE) ===
/**
 * Decodifica mensajes MIDI (individual O bundle)
 * Soporta formato V1 (13 bytes) y V2 (bundles)
 * @param {ArrayBuffer} buffer - Buffer recibido del cliente
 * @returns {Array<Object>} - Array de mensajes {status, data1, data2, timestamp}
 */
function decodeMidiBundle(buffer) {
    if (!buffer || buffer.byteLength < 13) {
        console.warn('[MIDI Decoder] Buffer inválido o corrupto');
        return [];
    }
    
    const view = new DataView(buffer);
    
    // === DETECTAR FORMATO ===
    // Si byte 2 es 0xFF, es un bundle V2
    const bundleFlag = view.getUint8(2);
    
    if (bundleFlag === 0xFF) {
        // === FORMATO BUNDLE V2 ===
        const messageCount = view.getUint8(3);
        const messages = [];
        
        const headerSize = 4;
        const messageSize = 11;
        const expectedSize = headerSize + (messageCount * messageSize);
        
        if (buffer.byteLength !== expectedSize) {
            console.error(`[MIDI Decoder] Bundle corrupto: esperado ${expectedSize} bytes, recibido ${buffer.byteLength}`);
            return [];
        }
        
        let offset = headerSize;
        for (let i = 0; i < messageCount; i++) {
            messages.push({
                timestamp: view.getFloat64(offset, true),
                status: view.getUint8(offset + 8),
                data1: view.getUint8(offset + 9),
                data2: view.getUint8(offset + 10)
            });
            offset += messageSize;
        }
        
        return messages;
        
    } else {
        // === FORMATO INDIVIDUAL V1 (13 bytes) ===
        if (buffer.byteLength !== 13) {
            console.warn('[MIDI Decoder] Tamaño incorrecto para mensaje individual');
            return [];
        }
        
        return [{
            timestamp: view.getFloat64(2, true),
            status: view.getUint8(10),
            data1: view.getUint8(11),
            data2: view.getUint8(12)
        }];
    }
}

// === FUNCIÓN PARA RECODIFICAR BUNDLE SIN PROGRAM CHANGE ===
function encodeMidiBundle(messages) {
    if (messages.length === 0) return null;
    
    if (messages.length === 1) {
        // === FORMATO INDIVIDUAL V1 (13 bytes) ===
        const buffer = new ArrayBuffer(13);
        const view = new DataView(buffer);
        const msg = messages[0];
        
        view.setUint16(0, 0xFFFF, true); // Magic header
        view.setFloat64(2, msg.timestamp, true);
        view.setUint8(10, msg.status);
        view.setUint8(11, msg.data1);
        view.setUint8(12, msg.data2);
        
        return buffer;
    } else {
        // === FORMATO BUNDLE V2 ===
        const headerSize = 4;
        const messageSize = 11;
        const bufferSize = headerSize + (messages.length * messageSize);
        const buffer = new ArrayBuffer(bufferSize);
        const view = new DataView(buffer);
        
        // Header
        view.setUint16(0, 0xFFFF, true); // Magic
        view.setUint8(2, 0xFF); // Bundle flag
        view.setUint8(3, messages.length); // Message count
        
        // Messages
        let offset = headerSize;
        for (const msg of messages) {
            view.setFloat64(offset, msg.timestamp, true);
            view.setUint8(offset + 8, msg.status);
            view.setUint8(offset + 9, msg.data1);
            view.setUint8(offset + 10, msg.data2);
            offset += messageSize;
        }
        
        return buffer;
    }
}

io.on("connection", (socket) => {
    // console.log(`🔌 Cliente conectado: ${socket.id}`);
    
    // � AUDIT: Log conexión
    DiagnosticAuditService.logConnection('socket_connect', socket.id, {
        transport: socket.conn?.transport?.name,
        remoteAddress: socket.handshake?.address,
        userAgent: socket.handshake?.headers?.['user-agent']?.substring(0, 100)
    });
    
    // 📊 TELEMETRÍA: Detectar reconexión
    if (socket.handshake.query.reconnect === 'true') {
        performanceMetrics.reconnections++;
        DiagnosticAuditService.logConnection('socket_reconnect', socket.id, {});
        console.log(`[Telemetry] 🔄 Reconexión detectada: ${socket.id}`);
    }

    // --- GESTIÓN DE SALAS ---
    
    // Crear Sala (Profesor)
    socket.on("create-room", async (payload) => {
        // 🔐 VALIDACIÓN DE MEMBRESÍA (OBLIGATORIA PARA PROFESORES)
        try {
            const User = require('./models/User');
            let teacher = null;
            
            // Intentar encontrar al profesor por userId o email
            if (payload.userId) {
                teacher = await User.findById(payload.userId).select('role teacherData isFoundingMember email');
            } else if (payload.email) {
                teacher = await User.findOne({ email: payload.email }).select('role teacherData isFoundingMember email');
            }
            
            // Si encontramos un profesor, validar membresía
            if (teacher && teacher.role === 'teacher') {
                const membershipStatus = teacher.teacherData?.subscriptionStatus;
                
                if (membershipStatus !== 'active') {
                    console.log(`[Auth] ⛔ Profesor sin membresía activa intentó crear sala: ${teacher.email || payload.userId}`);
                    socket.emit("room-error", {
                        code: 'MEMBERSHIP_INACTIVE',
                        message: 'Tu membresía no está activa. Actívala desde tu panel para acceder a tu sala.'
                    });
                    return; // Bloquear creación de sala
                }
                console.log(`[Auth] ✅ Membresía activa verificada para: ${teacher.email}`);
            } else if (!teacher && (payload.userId || payload.email)) {
                // Había credenciales pero no se encontró el usuario
                console.log(`[Auth] ⚠️ Profesor no encontrado: ${payload.userId || payload.email}`);
            } else if (payload.userRole === 'teacher' && !payload.userId && !payload.email) {
                // ⚠️ NUEVO: Si dice ser profesor pero no tiene credenciales, bloquear
                console.log(`[Auth] ⛔ Profesor sin credenciales intentó crear sala`);
                socket.emit("room-error", {
                    code: 'CREDENTIALS_REQUIRED',
                    message: 'Por favor, cierra sesión y vuelve a ingresar para verificar tu membresía.'
                });
                return;
            }
        } catch (err) {
            console.error('[Auth] Error validando membresía:', err);
            // En caso de error, permitir acceso (fail-open para no bloquear)
        }
        
        const roomCode = (payload.roomCode || generateCode()).toUpperCase();
        setupUserInRoom(socket, roomCode, payload.username || "Profesor", "teacher");
        
        rooms[roomCode].isActive = true; // El profe activa la sala
        socket.emit("room-created", roomCode);
        
        // � AUDIT: Log creación de sala
        DiagnosticAuditService.logRoom('room_created', roomCode, {
            teacherName: payload.username,
            teacherId: payload.userId
        }, { socketId: socket.id, userId: payload.userId });
        
        // �📊 TRACK: Iniciar sesión
        try {
            // Obtener datos del profesor desde el token/payload si está disponible
            const teacherData = {
                userId: payload.userId || socket.id,
                email: payload.email || 'unknown@pianolink.com',
                name: payload.username || 'Profesor'
            };
            await SessionTracker.startSession(roomCode, teacherData);
        } catch (error) {
            console.error('[Track] Error iniciando sesión:', error);
        }
        
        // ✅ FIX: Sincronizar estado DESPUÉS de todo el setup
        // Usar setImmediate para asegurar que se procese en el siguiente tick del event loop
        setImmediate(() => {
            syncRoomState(roomCode);
            console.log(`[Room] Profesor ${payload.username} creó sala ${roomCode} - Estado sincronizado`);
        });
    });

    // Unirse a Sala (Alumno)
    socket.on("join-room", async (payload) => {
        const roomCode = (payload.roomCode || "").toUpperCase();
        if (!rooms[roomCode]) {
            rooms[roomCode] = { users: {}, isActive: false };
        }
        
        setupUserInRoom(socket, roomCode, payload.username || "Alumno", payload.userRole || "student");
        
        // � Guardar userId/email si el estudiante está autenticado (viene del panel cliente)
        const studentData = {
            socketId: socket.id,
            name: payload.username || "Alumno",
            role: payload.userRole || "student"
        };
        if (payload.userId) {
            studentData.userId = payload.userId;
            studentData.email = payload.email;
            console.log(`[Room] Estudiante autenticado ${payload.username} (${payload.userId}) se unió a ${roomCode}`);
        }
        
        // 🔍 AUDIT: Log unión a sala
        DiagnosticAuditService.logRoom('room_joined', roomCode, {
            userName: payload.username,
            userRole: payload.userRole || 'student',
            isAuthenticated: !!payload.userId
        }, { socketId: socket.id, userId: payload.userId });
        
        // Trackear estudiante que se une
        try {
            await SessionTracker.addStudent(roomCode, studentData);
        } catch (error) {
            console.error('[Track] Error agregando estudiante:', error);
        }
        
        // ✅ FIX: Emitir room-joined ANTES de sincronizar para que el cliente esté listo
        socket.emit("room-joined", roomCode);
        
        // ✅ FIX: Notificar inmediatamente con sonido si la clase está activa
        if(rooms[roomCode].isActive) {
            socket.broadcast.to(roomCode).emit("user-entered-sound");
        }
        
        // ✅ FIX: Usar setImmediate para asegurar sincronización en el siguiente tick
        // Esto garantiza que el cliente ya procesó "room-joined" y está listo
        setImmediate(() => {
            syncRoomState(roomCode);
            console.log(`[Room] ${payload.username} se unió a sala ${roomCode} - Lista actualizada para todos`);
            
            // --- FULL SNAPSHOT AL UNIRSE (CRÍTICO PARA RECONEXIÓN) ---
            const room = rooms[roomCode];
            if (room && room.teacherActiveNotes && room.teacherActiveNotes.size > 0) {
                const snapshot = Array.from(room.teacherActiveNotes);
                socket.emit('midi-snapshot', {
                    notes: snapshot,
                    timestamp: Date.now(),
                    type: 'full'
                });
                console.log(`[Snapshot] Full snapshot enviado a ${socket.id}: ${snapshot.length} notas`);
            }
        });
    });
    
    // ✅ FIX: Evento para solicitar lista de usuarios manualmente
    socket.on("request-user-list", (payload) => {
        const roomCode = payload.roomCode || socket.roomCode;
        if (roomCode && rooms[roomCode]) {
            console.log(`[Room] Cliente ${socket.id} solicitó lista de usuarios de sala ${roomCode}`);
            broadcastUserList(roomCode);
        }
    });

    // --- RELAY DE AUDIO/MIDI (V5 CON BUNDLE SUPPORT) ---
    
    // Recibimos un ArrayBuffer (Binario puro - individual O bundle)
    socket.on("midi-binary", (buffer) => {
        const roomCode = socket.roomCode;
        if (!roomCode || !rooms[roomCode]) return;
        
        // 📊 TELEMETRÍA: Contar mensajes MIDI
        performanceMetrics.midiMessagesTotal++;
        
        // 🔍 AUDIT: Solo incrementar contador MIDI (optimizado - no loguear cada mensaje)
        if (DiagnosticAuditService.isActive()) {
            DiagnosticAuditService.incrementMidiCount(buffer.byteLength || buffer.length);
        }
        
        // VALIDACIÓN DE SEGURIDAD
        if (!validateUserInRoom(socket, roomCode)) {
            return; // Silenciar mensaje no autorizado
        }
        
        const room = rooms[roomCode];
        
        // Solo permitir MIDI si la clase está activa
        if (!room.isActive) {
            return;
        }

        // === NORMALIZAR BUFFER (Socket.io puede enviar Buffer de Node.js) ===
        let arrayBuffer;
        if (Buffer.isBuffer(buffer)) {
            // Convertir Buffer de Node.js a ArrayBuffer
            arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
        } else if (buffer instanceof ArrayBuffer) {
            arrayBuffer = buffer;
        } else {
            console.error('[MIDI] Tipo de buffer inválido:', typeof buffer);
            return;
        }

        // === DECODIFICAR BUNDLE (puede ser 1 o múltiples mensajes) ===
        const messages = decodeMidiBundle(arrayBuffer);
        
        // === CONSTANTES DE SEGURIDAD ===
        const MAX_ACTIVE_NOTES = 128; // Máximo de notas en un piano estándar
        
        // === STATE TRACKING MIDI (SERVER-SIDE) - Procesar cada mensaje ===
        messages.forEach(msg => {
            try {
                const { status, data1: noteId, data2: velocity } = msg;
                
                const isNoteOn = (status >= 144 && status <= 159) && velocity > 0;
                const isNoteOff = (status >= 128 && status <= 143) || (status >= 144 && velocity === 0);
                const isCC = (status >= 176 && status <= 191); // Control Change

                const user = room.users[socket.id];
                
                if (user) {
                    let stateChanged = false;
                    
                    if (isNoteOn) {
                        // SEGURIDAD: Límite de notas activas para prevenir memory leak
                        if (user.activeNotes.size >= MAX_ACTIVE_NOTES) {
                            const oldestNote = user.activeNotes.values().next().value;
                            user.activeNotes.delete(oldestNote);
                            console.warn(`[MIDI] Límite notas usuario: ${socket.id}, liberando ${oldestNote}`);
                        }
                        user.activeNotes.add(noteId);
                        
                        if (socket.userRole === 'teacher') {
                            if (room.teacherActiveNotes.size >= MAX_ACTIVE_NOTES) {
                                const oldestNote = room.teacherActiveNotes.values().next().value;
                                room.teacherActiveNotes.delete(oldestNote);
                                console.warn(`[MIDI] Límite notas sala ${roomCode}, liberando ${oldestNote}`);
                            }
                            room.teacherActiveNotes.add(noteId);
                            stateChanged = true;
                        }
                    } else if (isNoteOff) {
                        user.activeNotes.delete(noteId);
                        if (socket.userRole === 'teacher') {
                            room.teacherActiveNotes.delete(noteId);
                            stateChanged = true;
                        }
                    }
                    // Control Change (pedal, etc.) no afecta state tracking pero debe retransmitirse

                    // --- ECHO GATE: Notificar estado de actividad MIDI del profesor ---
                    if (stateChanged && socket.userRole === 'teacher') {
                        const isTeacherPlaying = room.teacherActiveNotes.size > 0;
                        // Solo emitir cambios de estado (no en cada nota)
                        if (room._lastTeacherPlayingState !== isTeacherPlaying) {
                            room._lastTeacherPlayingState = isTeacherPlaying;
                            socket.broadcast.to(roomCode).emit('teacher-playing-state', {
                                playing: isTeacherPlaying,
                                noteCount: room.teacherActiveNotes.size,
                                timestamp: Date.now()
                            });
                        }
                    }

                    // --- SNAPSHOT REACTIVO ---
                    if (stateChanged && socket.userRole === 'teacher') {
                        room.lastActivityTime = Date.now();
                        
                        // Limpiar timer de inactividad anterior
                        if (room.inactivityTimer) {
                            clearTimeout(room.inactivityTimer);
                        }
                        
                        // Si todas las notas se apagaron, enviar snapshot vacío inmediato
                        if (room.teacherActiveNotes.size === 0 && room.lastSnapshot.length > 0) {
                            const emptySnapshot = new Int8Array(0);
                            io.to(roomCode).emit('midi-snapshot', {
                                notes: Array.from(emptySnapshot),
                                timestamp: Date.now(),
                                type: 'immediate'
                            });
                            room.lastSnapshot = [];
                            console.log(`[Snapshot] Sala ${roomCode}: Snapshot vacío inmediato enviado`);
                        } else {
                            // Programar snapshot reactivo después de 200ms de inactividad
                            room.inactivityTimer = setTimeout(() => {
                                sendSnapshot(roomCode);
                            }, 200);
                        }
                    }
                }
            } catch (e) {
                console.warn('[MIDI State] Error procesando mensaje del bundle:', e.message);
            }
        });
       
        // === FILTRAR PROGRAM CHANGE (192-207) ===
        // Cada usuario debe mantener su propio instrumento configurado
        const filteredMessages = messages.filter(msg => {
            const isProgramChange = (msg.status >= 192 && msg.status <= 207);
            return !isProgramChange;
        });
        
        // === BROADCAST CON PRIORIDAD ALTA ===
        // Si no hay mensajes después del filtro, no enviar nada
        if (filteredMessages.length === 0) return;
        
        // Recodificar bundle sin Program Change
        const filteredBuffer = encodeMidiBundle(filteredMessages);
        
        const user = room.users[socket.id];
        socket.broadcast.to(roomCode).emit("midi-binary", {
            src: socket.id,
            dat: filteredBuffer,
            userId: user.name // Identificación verificada
        });
        
        // Trackear actividad MIDI
        try {
            const noteCount = filteredMessages.filter(msg => {
                const status = msg.status;
                return (status >= 128 && status <= 159); // Note On/Off
            }).length;
            
            if (noteCount > 0) {
                const type = socket.userRole === 'teacher' ? 'sent' : 'received';
                SessionTracker.trackMidi(roomCode, type, noteCount);
            }
        } catch (error) {
            console.error('[Track] Error tracking MIDI:', error);
        }
    });
   
   //Ping para saber latencia
    socket.on("latency-ping", (startTime) => {
        socket.emit("latency-pong", startTime); 
    });
    
    // Heartbeat del cliente para mantener conexión viva
    socket.on("client-heartbeat", (data) => {
        const room = rooms[data.roomCode];
        if (room && room.users[socket.id]) {
            room.users[socket.id].lastHeartbeat = Date.now();
            // Responder para confirmar (opcional)
            socket.emit("heartbeat-ack", { timestamp: Date.now() });
        }
    });
    
   // --- GESTIÓN DE ESTADO (PDF Y CLASE) ---

   socket.on("update-pdf-state", (newState) => {
    const room = rooms[socket.roomCode];
    if (!room || !room.users[socket.id]) return;

    // Actualizar memoria del servidor
    const userState = room.users[socket.id].pdfState;
    const hadPdf = !!userState.url;
    
    if (newState.url) userState.url = newState.url;
    if (newState.page) userState.page = newState.page;
    
    // --- FIX: GUARDAR SCORE ID ---
    // Esto permite que el profesor sepa qué anotaciones buscar en la DB al usar el modo espía
    if (newState.scoreId) userState.scoreId = newState.scoreId; 
    // -----------------------------
    
    // Trackear si el profesor carga un PDF por primera vez
    if (!hadPdf && newState.url && socket.userRole === 'teacher') {
        try {
            SessionTracker.trackPDF(socket.roomCode, newState.scoreId || 'unknown');
        } catch (error) {
            console.error('[Track] Error tracking PDF:', error);
        }
    }

    // Rebotar a todos (para modo espía instantáneo)
    io.to(socket.roomCode).emit("user-pdf-updated", {
        userId: socket.id,
        pdfState: userState
    });
    
    // Actualizar lista de participantes (para iconos)
    broadcastUserList(socket.roomCode);
});

    socket.on("end-class", async (roomCode) => {
        console.log(`[EndClass] Solicitud de ${socket.id} para cerrar sala: ${roomCode}`);
        console.log(`[EndClass] Socket.roomCode: ${socket.roomCode}`);
        
        // VALIDACIÓN: Solo profesores/admin pueden cerrar la clase
        if (!validateUserInRoom(socket, roomCode, 'teacher')) {
            console.log(`[EndClass] ❌ Rechazado - usuario no autorizado`);
            socket.emit('error', { message: 'No autorizado para cerrar la clase' });
            return;
        }
        
        const room = rooms[roomCode];
        if (!room) return;
        
        // Trackear fin de sesión (iniciada por profesor)
        try {
            await SessionTracker.endSession(roomCode, true);
        } catch (error) {
            console.error('[Track] Error ending session:', error);
        }
        
        room.isActive = false;
        io.to(roomCode).emit("class-status", { isActive: false });
        io.to(roomCode).emit("force-disconnect");
        console.log(`[Admin] Clase cerrada por profesor: ${roomCode}`);
        
        // Limpiar sala
        Object.keys(room.users).forEach(sid => {
            const s = io.sockets.sockets.get(sid);
            if (s) s.leave(roomCode);
        });
        
        if (room.snapshotTimer) clearTimeout(room.snapshotTimer);
        if (room.inactivityTimer) clearTimeout(room.inactivityTimer);
        
        // Limpiar estado PLB de la sala
        const PLBService = require('./services/PLBService');
        PLBService.clearRoomState(roomCode);
        
        delete rooms[roomCode];
    });
    
    socket.on("set-broadcaster", (targetId) => {
        const roomCode = socket.roomCode;
        if (!roomCode || !rooms[roomCode]) return;
        
        // VALIDACIÓN: Solo profesores pueden cambiar broadcaster
        if (!validateUserInRoom(socket, roomCode, 'teacher')) {
            socket.emit('error', { message: 'No autorizado para cambiar broadcaster' });
            return;
        }
    
        // Toggle (encender/apagar)
        const current = rooms[roomCode].broadcaster;
        const newBroadcaster = (current === targetId) ? null : targetId;
        
        rooms[roomCode].broadcaster = newBroadcaster;
        
        // Trackear cambio de broadcaster
        if (newBroadcaster) {
            const broadcasterUser = rooms[roomCode].users[newBroadcaster];
            if (broadcasterUser) {
                try {
                    SessionTracker.trackBroadcasterChange(roomCode, broadcasterUser.name);
                } catch (error) {
                    console.error('[Track] Error tracking broadcaster:', error);
                }
            }
        }
    
        // 1. Avisar quién es la nueva estrella
        io.to(roomCode).emit("broadcaster-changed", newBroadcaster);
    
        // 2. MAGIA DE SINCRONIZACIÓN INMEDIATA (NUEVO)
        // Si hay un nuevo broadcaster, enviamos SU partitura a todos YA.
        if (newBroadcaster) {
            const broadcasterUser = rooms[roomCode].users[newBroadcaster];
            // Verificamos que el usuario exista y tenga un PDF abierto
            if (broadcasterUser && broadcasterUser.pdfState && broadcasterUser.pdfState.url) {
                io.to(roomCode).emit("user-pdf-updated", {
                    userId: newBroadcaster,
                    pdfState: broadcasterUser.pdfState
                });
            }
        }
    });

    // --- PIZARRA CON BASE DE DATOS ---
    // ==================================================
    // SEGURIDAD: Rate Limiting y Validación de Sala
    // ==================================================
    const wbRateLimiter = new Map(); // socketId -> { count, resetTime }
    const WB_RATE_LIMIT = 30; // máximo 30 trazos por segundo
    const WB_RATE_WINDOW = 1000; // ventana de 1 segundo
    
    function checkWbRateLimit(socketId) {
        const now = Date.now();
        let state = wbRateLimiter.get(socketId);
        
        if (!state || now > state.resetTime) {
            state = { count: 0, resetTime: now + WB_RATE_WINDOW };
        }
        
        state.count++;
        wbRateLimiter.set(socketId, state);
        
        return state.count <= WB_RATE_LIMIT;
    }
    
    function sanitizeWbData(data, socketRoomCode) {
        // Validar que el usuario está en la sala que indica
        if (data.room !== socketRoomCode) {
            return null; // Intento de inyección cross-room
        }
        
        return {
            room: data.room,
            page: data.page,
            scoreId: data.scoreId ? String(data.scoreId).substring(0, 50) : null,
            path: data.path,
            id: data.id ? String(data.id).substring(0, 50) : null
        };
    }

    // DIBUJAR: Rebotar y Guardar (CON SEGURIDAD)
    socket.on('wb-draw', async (data) => {
        // SEGURIDAD: Rate limiting
        if (!checkWbRateLimit(socket.id)) {
            console.warn(`[Security] wb-draw rate limit: ${socket.id}`);
            return;
        }
        
        // SEGURIDAD: Validar sala y sanitizar
        const sanitized = sanitizeWbData(data, socket.roomCode);
        if (!sanitized) {
            console.warn(`[Security] wb-draw cross-room blocked: ${socket.id} → ${data.room}`);
            return;
        }
        
        // 1. Enviar a los demás (Rápido - prioridad alta)
        socket.to(sanitized.room).emit('wb-draw', sanitized);
        
        // Trackear uso de whiteboard (solo del profesor)
        if (socket.userRole === 'teacher' && sanitized.room) {
            try {
                SessionTracker.trackWhiteboard(sanitized.room);
            } catch (error) {
                console.error('[Track] Error tracking whiteboard:', error);
            }
        }

        // 2. Guardar en MongoDB (Background - prioridad baja, no bloqueante)
        if (sanitized.scoreId) {
            setImmediate(async () => {
                try {
                    await Annotation.create({
                        scoreId: sanitized.scoreId,
                        page: sanitized.page,
                        data: sanitized.path
                    });
                } catch (e) {
                    console.error("[wb-draw] Error guardando:", e.message);
                }
            });
        }
    });

    // NUEVO: BORRAR OBJETO INDIVIDUAL (CON SEGURIDAD)
    socket.on('wb-delete', async (data) => {
        // SEGURIDAD: Rate limiting
        if (!checkWbRateLimit(socket.id)) {
            return;
        }
        
        // SEGURIDAD: Validar sala
        const sanitized = sanitizeWbData(data, socket.roomCode);
        if (!sanitized) {
            console.warn(`[Security] wb-delete cross-room blocked: ${socket.id}`);
            return;
        }
        
        // 1. Avisar a los demás
        socket.to(sanitized.room).emit('wb-delete', sanitized);

        // 2. Borrar de la BD (Background)
        if (sanitized.scoreId && sanitized.id) {
            setImmediate(async () => {
                try {
                    await Annotation.deleteOne({ 
                        scoreId: sanitized.scoreId,
                        page: sanitized.page,
                        "data.id": sanitized.id 
                    });
                    console.log(`🗑️ Elemento borrado: ${sanitized.id}`);
                } catch (e) {
                    console.error("[wb-delete] Error:", e.message);
                }
            });
        }
    });

    // BORRAR TODO (CLEAR): Rebotar y Actualizar BD (CON SEGURIDAD)
    socket.on('wb-clear', async (data) => {
        // SEGURIDAD: Validar sala
        const sanitized = sanitizeWbData(data, socket.roomCode);
        if (!sanitized) {
            console.warn(`[Security] wb-clear cross-room blocked: ${socket.id}`);
            return;
        }
        
        socket.to(sanitized.room).emit('wb-clear', sanitized);

        if (sanitized.scoreId) {
            setImmediate(async () => {
                try {
                    await Annotation.deleteMany({ 
                        scoreId: sanitized.scoreId, 
                        page: sanitized.page 
                    });
                } catch (e) {
                    console.error("[wb-clear] Error:", e.message);
                }
            });
        }
    });

    // LÁSER (No se guarda, solo rebota) - Validación ligera
    socket.on('wb-pointer', (data) => {
        if (data.room !== socket.roomCode) return;
        socket.to(data.room).volatile.emit('wb-pointer', data);
    });
    
    // SINCRONIZACIÓN: Solicitar estado actual de la pizarra
    // Nota: Para pizarra libre (whiteboard) no hay persistencia en servidor
    // Solo funciona si otro usuario tiene el estado y lo comparte
    socket.on('wb-request-sync', (data) => {
        if (data.room !== socket.roomCode) return;
        // Pedir a otros usuarios de la sala que compartan su estado
        socket.to(data.room).emit('wb-sync-request', {
            requester: socket.id,
            page: data.page
        });
    });
    
    // Respuesta de sincronización (otro usuario comparte su canvas)
    socket.on('wb-sync-share', (data) => {
        // Enviar directamente al usuario que lo solicitó
        io.to(data.requester).emit('wb-sync-response', {
            page: data.page,
            canvasState: data.canvasState
        });
    });

    // ==================================================
    // AUDIO STATE MANAGER - CONTROL REMOTO
    // ==================================================
    
    /**
     * PROFESOR → ESTUDIANTE: Cambiar modo de audio
     * Solo profesores/admins pueden enviar este comando
     */
    socket.on('change-audio-mode', (data) => {
        const roomCode = socket.roomCode;
        
        // Validar que sea profesor/admin
        if (socket.userRole !== 'teacher' && socket.userRole !== 'admin') {
            console.log('[AudioControl] ⛔ Rechazado: usuario no autorizado', socket.userRole);
            return;
        }
        
        // Validar sala
        if (!roomCode || !rooms[roomCode]) {
            console.log('[AudioControl] ⛔ Sala no válida');
            return;
        }
        
        console.log('[AudioControl] 🔄 change-audio-mode:', data.profile, '→ target:', data.targetUserId || 'broadcast');
        
        // Trackear cambio de modo audio
        try {
            SessionTracker.trackAudioMode(roomCode, data.profile);
        } catch (error) {
            console.error('[Track] Error tracking audio mode:', error);
        }
        
        // Preparar payload con info del origen
        const payload = {
            profile: data.profile,
            fromUserId: socket.id,
            fromRole: socket.userRole,
            timestamp: Date.now()
        };
        
        // Si hay target específico, enviar solo a ese usuario
        if (data.targetUserId) {
            io.to(data.targetUserId).emit('change-audio-mode', payload);
        } else {
            // Broadcast a toda la sala (excepto al profesor)
            socket.to(roomCode).emit('change-audio-mode', payload);
        }
    });
    
    /**
     * PROFESOR → ESTUDIANTE: Mute remoto
     * Silencia el micrófono del estudiante remotamente
     */
    socket.on('remote-mute', (data) => {
        const roomCode = socket.roomCode;
        
        // Validar que sea profesor/admin
        if (socket.userRole !== 'teacher' && socket.userRole !== 'admin') {
            console.log('[AudioControl] ⛔ Remote mute rechazado: no autorizado');
            return;
        }
        
        if (!roomCode || !rooms[roomCode]) {
            console.log('[AudioControl] ⛔ Sala no válida para remote mute');
            return;
        }
        
        console.log('[AudioControl] 🔇 remote-mute:', data.muted ? 'MUTE' : 'UNMUTE', '→ target:', data.targetUserId || 'broadcast');
        
        // Trackear mute remoto
        if (data.muted) {
            try {
                SessionTracker.trackRemoteMute(roomCode);
            } catch (error) {
                console.error('[Track] Error tracking remote mute:', error);
            }
        }
        
        const payload = {
            muted: data.muted,
            fromUserId: socket.id,
            fromRole: socket.userRole,
            timestamp: Date.now()
        };
        
        if (data.targetUserId) {
            io.to(data.targetUserId).emit('remote-mute', payload);
        } else {
            socket.to(roomCode).emit('remote-mute', payload);
        }
    });
    
    /**
     * ESTUDIANTE → PROFESOR: Confirmación de cambio de modo
     */
    socket.on('audio-mode-confirmed', (data) => {
        const roomCode = socket.roomCode;
        if (!roomCode || !rooms[roomCode]) return;
        
        console.log('[AudioControl] ✅ Estudiante confirmó modo:', data.profile);
        
        // Broadcast a profesores de la sala
        const room = rooms[roomCode];
        Object.entries(room.users).forEach(([socketId, user]) => {
            if (user.role === 'teacher' || user.role === 'admin') {
                io.to(socketId).emit('audio-mode-confirmed', {
                    userId: socket.id,
                    userName: socket.userName,
                    profile: data.profile,
                    success: data.success
                });
            }
        });
    });
    
    /**
     * ESTUDIANTE → PROFESOR: Confirmación de mute remoto
     */
    socket.on('remote-mute-confirmed', (data) => {
        const roomCode = socket.roomCode;
        if (!roomCode || !rooms[roomCode]) return;
        
        console.log('[AudioControl] ✅ Estudiante confirmó mute:', data.muted);
        
        const room = rooms[roomCode];
        Object.entries(room.users).forEach(([socketId, user]) => {
            if (user.role === 'teacher' || user.role === 'admin') {
                io.to(socketId).emit('remote-mute-confirmed', {
                    userId: socket.id,
                    userName: socket.userName,
                    muted: data.muted,
                    success: data.success
                });
            }
        });
    });

    // ==================================================
    // PLB (PIANO LINK BRAIN) - EVENTOS DE IA
    // ==================================================
    const PLBService = require('./services/PLBService');
    
    /**
     * CLIENTE → SERVIDOR: Transcripción de audio
     * Solo procesa si el usuario está en la lista permitida
     */
    socket.on('plb-transcript', async (data) => {
        const roomCode = socket.roomCode;
        if (!roomCode || !rooms[roomCode]) return;
        
        // Obtener email del usuario (guardado en socket o data)
        const userEmail = data.userEmail || socket.userEmail;
        
        if (!userEmail) {
            return; // Sin email, ignorar silenciosamente
        }
        
        // Verificar si puede usar PLB
        if (!PLBService.isUserAllowed(userEmail)) {
            return; // No autorizado, ignorar silenciosamente
        }
        
        console.log(`[PLB] 📝 Transcripción de ${data.speaker}: "${data.text.substring(0, 50)}..."`);
        
        // Procesar transcripción
        const result = await PLBService.processTranscript(roomCode, userEmail, {
            text: data.text,
            speaker: data.speaker || 'unknown'
        });
        
        // Trackear consulta PLB
        if (result && result.hint) {
            try {
                SessionTracker.trackPLBQuery(roomCode);
            } catch (error) {
                console.error('[Track] Error tracking PLB query:', error);
            }
        }
        
        // Si hay un hint, enviarlo solo al profesor de la sala
        if (result && result.hint) {
            const room = rooms[roomCode];
            Object.entries(room.users).forEach(([socketId, user]) => {
                if (user.role === 'teacher' || user.role === 'admin') {
                    io.to(socketId).emit('plb-hint', {
                        hint: result.hint,
                        latency: result.latency,
                        timestamp: result.timestamp,
                        context: result.context // Contexto para feedback/mejora
                    });
                }
            });
        }
    });
    
    /**
     * CLIENTE → SERVIDOR: Guardar email del usuario para PLB
     */
    socket.on('plb-register', (data) => {
        if (data.email) {
            socket.userEmail = data.email.toLowerCase();
            console.log(`[PLB] 📧 Usuario registrado: ${socket.userEmail}`);
            
            // Informar al cliente si tiene PLB habilitado
            const isAllowed = PLBService.isUserAllowed(socket.userEmail);
            socket.emit('plb-status', { 
                enabled: isAllowed,
                email: socket.userEmail
            });
        }
    });
    
    /**
     * SERVIDOR → CLIENTE: Métricas de PLB (solo para admins)
     */
    socket.on('plb-get-metrics', () => {
        if (socket.userRole === 'admin') {
            socket.emit('plb-metrics', PLBService.getMetrics());
        }
    });

    /**
     * CLIENTE → SERVIDOR: Guardar mejora de respuesta PLB
     * El profesor puede mejorar las respuestas del asistente
     */
    socket.on('plb-improve', async (data) => {
        // Obtener email del socket o del data enviado
        const userEmail = socket.userEmail || data.userEmail;
        
        if (!userEmail) {
            socket.emit('plb-improve-result', { success: false, error: 'No autenticado' });
            return;
        }
        
        // Solo usuarios permitidos pueden enviar mejoras
        if (!PLBService.isUserAllowed(userEmail)) {
            socket.emit('plb-improve-result', { success: false, error: 'No autorizado' });
            return;
        }
        
        try {
            const result = await PLBService.saveImprovement({
                context: data.context,
                originalResponse: data.originalResponse,
                improvedResponse: data.improvedResponse,
                teacherEmail: userEmail
            });
            
            console.log(`[PLB] 📚 Mejora guardada por ${userEmail}: "${data.context?.substring(0, 30)}..."`);
            
            // Trackear mejora PLB
            try {
                const roomCode = socket.roomCode;
                if (roomCode) {
                    SessionTracker.trackPLBImprovement(roomCode);
                }
            } catch (error) {
                console.error('[Track] Error tracking PLB improvement:', error);
            }
            
            socket.emit('plb-improve-result', { success: true, exampleId: result._id });
        } catch (error) {
            console.error('[PLB] Error guardando mejora:', error);
            socket.emit('plb-improve-result', { success: false, error: error.message });
        }
    });

    // =====================================================
    // 🔍 AUDIT: Eventos de Agora desde el cliente
    // =====================================================
    socket.on("agora-event", (payload) => {
        if (!DiagnosticAuditService.isActive()) return;
        
        const { type, data } = payload;
        const severity = type.includes('error') || type.includes('fail') ? 'warning' : 'info';
        
        DiagnosticAuditService.logEvent('audio', `agora_${type}`, {
            ...data,
            clientTimestamp: payload.timestamp
        }, severity, {
            socketId: socket.id,
            roomCode: socket.roomCode,
            userId: socket.userId
        });
    });

    // Desconexión
    socket.on("disconnect", async () => {
        const roomCode = socket.roomCode;
        const userName = socket.userName;
        const userRole = socket.userRole;
        
        // 🔍 AUDIT: Log desconexión
        DiagnosticAuditService.logConnection('socket_disconnect', socket.id, {
            roomCode,
            userName,
            userRole,
            reason: 'normal'
        });
        
        if (roomCode && rooms[roomCode]) {
            const room = rooms[roomCode];
            
            console.log(`[Disconnect] Usuario ${userName} (${userRole}) desconectado de sala ${roomCode}`);
            
            // Trackear salida de estudiante
            try {
                await SessionTracker.removeStudent(roomCode, socket.id);
            } catch (error) {
                console.error('[Track] Error removing student:', error);
            }
            
            // Limpiar timers de snapshot si existen
            if (room.snapshotTimer) clearTimeout(room.snapshotTimer);
            if (room.inactivityTimer) clearTimeout(room.inactivityTimer);
            
            // Si era el profesor, limpiar las notas globales
            if (socket.userRole === 'teacher' && room.teacherActiveNotes) {
                room.teacherActiveNotes.clear();
            }
            
            delete room.users[socket.id];
            
            if (Object.keys(room.users).length === 0) {
                // Última persona saliendo: limpiar sala completamente
                console.log(`[Cleanup] Sala ${roomCode} vacía. Limpiando recursos...`);
                
                // Limpiar timers de la sala si no fueron limpiados antes
                if (room.snapshotTimer) clearTimeout(room.snapshotTimer);
                if (room.inactivityTimer) clearTimeout(room.inactivityTimer);
                
                delete rooms[roomCode];
                
                // Si no quedan salas activas, detener el heartbeat global
                if (Object.keys(rooms).length === 0 && snapshotHeartbeatInterval) {
                    console.log('[Snapshot] No hay salas activas. Deteniendo heartbeat.');
                    clearInterval(snapshotHeartbeatInterval);
                    snapshotHeartbeatInterval = null;
                }
            } else {
                // ✅ FIX: Actualizar lista de usuarios inmediatamente cuando alguien se desconecta
                console.log(`[Disconnect] Actualizando lista de usuarios en sala ${roomCode}`);
                broadcastUserList(roomCode);
            }
        }
    });
});

// --- Helpers ---
function setupUserInRoom(socket, roomCode, name, role) {
    socket.roomCode = roomCode;
    socket.userName = name;
    socket.userRole = role;
    socket.join(roomCode);

    // 1. Si la sala no existe, la creamos con la estructura completa (incluyendo broadcaster)
    if (!rooms[roomCode]) {
        rooms[roomCode] = { 
            users: {}, 
            isActive: false,
            broadcaster: null,
            teacherActiveNotes: new Set(),
            // --- SNAPSHOT PROTOCOL V2 ---
            lastSnapshot: [],
            lastActivityTime: Date.now(),
            snapshotTimer: null,
            inactivityTimer: null
        };
        
        // Reiniciar heartbeat si estaba detenido
        if (!snapshotHeartbeatInterval) {
            console.log('[Snapshot] Primera sala creada. Iniciando heartbeat...');
            startSnapshotHeartbeat();
        }
    }
    
    // 2. GUARDAR AL USUARIO
    rooms[roomCode].users[socket.id] = {
        name: name,
        role: role,
        pdfState: { url: null, page: 1 }, // Estado inicial del PDF
        activeNotes: new Set() // <--- NUEVO: Notas activas de este usuario
    };
}

function syncRoomState(roomCode) {
    if(!rooms[roomCode]) return;
    io.to(roomCode).emit("class-status", { isActive: rooms[roomCode].isActive });
    //  Sincronizar Broadcaster
    io.to(roomCode).emit("broadcaster-changed", rooms[roomCode].broadcaster);
    broadcastUserList(roomCode);
}

function broadcastUserList(roomCode) {
    const room = rooms[roomCode];
    if (!room) {
        console.warn(`[broadcastUserList] Sala ${roomCode} no existe`);
        return;
    }
    
    const list = Object.entries(room.users).map(([id, u]) => ({
        socketId: id,
        name: u.name,
        role: u.role,
        pdfState: u.pdfState
    }));
    
    console.log(`[broadcastUserList] Enviando lista a sala ${roomCode}: ${list.length} usuarios`, 
                list.map(u => `${u.name}(${u.role})`).join(', '));
    
    io.to(roomCode).emit("room-users", list);
}

function generateCode() {
    return Math.random().toString(36).substring(2, 6).toUpperCase();
}

// ==================================================
// 4. SNAPSHOT PROTOCOL (OPTIMIZADO Y REACTIVO)
// ==================================================

/**
 * Envía un snapshot del estado actual de una sala
 */
function sendSnapshot(roomCode) {
    const room = rooms[roomCode];
    if (!room || !room.isActive) return;
    
    const currentNotes = Array.from(room.teacherActiveNotes || []);
    
    // Solo enviar si el snapshot cambió
    const snapshotChanged = JSON.stringify(currentNotes) !== JSON.stringify(room.lastSnapshot);
    
    if (snapshotChanged || currentNotes.length > 0) {
        io.to(roomCode).emit('midi-snapshot', {
            notes: currentNotes,
            timestamp: Date.now(),
            type: 'periodic'
        });
        
        room.lastSnapshot = currentNotes;
        
        if (currentNotes.length > 0) {
            console.log(`[Snapshot] Sala ${roomCode}: ${currentNotes.length} notas [${currentNotes.join(', ')}]`);
        }
    }
}

// ⚡ Heartbeat periódico cada 2 segundos (REDUCIDO de 5s para mayor resiliencia)
// Esto sincroniza el estado completo del piano incluso durante legatos sostenidos
function startSnapshotHeartbeat() {
    // Limpiar intervalo anterior si existe
    if (snapshotHeartbeatInterval) {
        clearInterval(snapshotHeartbeatInterval);
    }
    
    snapshotHeartbeatInterval = setInterval(() => {
        Object.keys(rooms).forEach(roomCode => {
            sendSnapshot(roomCode);
        });
    }, 2000); // ⚡ REDUCIDO a 2000ms (era 5000ms)
    
    console.log('[Snapshot] ⚡ Heartbeat MIDI iniciado (cada 2s).');
}

// Iniciar el heartbeat
startSnapshotHeartbeat();

// ==================================================
// 5. CLOCK SYNC PROTOCOL (NTP BÁSICO)
// ==================================================
io.on("connection", (socket) => {
    socket.on('clock-sync-request', (clientTimestamp) => {
        const serverTimestamp = Date.now();
        socket.emit('clock-sync-response', {
            clientTimestamp,
            serverTimestamp,
            serverResponseTime: Date.now()
        });
    });
});

// ==================================================
// 6. GRACEFUL SHUTDOWN (PRODUCCIÓN)
// ==================================================
function gracefulShutdown(signal) {
    console.log(`\n[Shutdown] Señal ${signal} recibida. Iniciando cierre limpio...`);
    
    // 1. Detener heartbeat de snapshots
    if (snapshotHeartbeatInterval) {
        clearInterval(snapshotHeartbeatInterval);
        console.log('[Shutdown] Heartbeat de snapshots detenido.');
    }
    
    // 2. Limpiar todas las salas y sus timers
    Object.keys(rooms).forEach(roomCode => {
        const room = rooms[roomCode];
        if (room.snapshotTimer) clearTimeout(room.snapshotTimer);
        if (room.inactivityTimer) clearTimeout(room.inactivityTimer);
        
        // Notificar a usuarios de la desconexión
        io.to(roomCode).emit('server-shutdown', { 
            message: 'Servidor reiniciando, reconecta en unos segundos' 
        });
    });
    console.log('[Shutdown] Salas limpiadas y usuarios notificados.');
    
    // 3. Cerrar Socket.IO
    io.close(() => {
        console.log('[Shutdown] Socket.IO cerrado.');
        
        // 4. Cerrar servidor HTTP
        server.close(() => {
            console.log('[Shutdown] Servidor HTTP cerrado.');
            console.log('[Shutdown] ✅ Limpieza completa. Saliendo...');
            process.exit(0);
        });
    });
    
    // 5. Timeout de seguridad (si el cierre tarda más de 10s, forzar salida)
    setTimeout(() => {
        console.error('[Shutdown] ⚠️ Timeout alcanzado. Forzando salida...');
        process.exit(1);
    }, 10000);
}

// Capturar señales de terminación
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Capturar errores no manejados (última defensa)
process.on('uncaughtException', (error) => {
    console.error('[Critical Error] Excepción no capturada:', error);
    // � AUDIT: Log error crítico
    DiagnosticAuditService.logError('uncaught_exception', error, {});
    // 📊 TELEMETRÍA: Registrar error
    if (typeof performanceMetrics !== 'undefined') {
        performanceMetrics.errors.push({
            type: 'uncaughtException',
            message: error.message,
            stack: error.stack?.substring(0, 500),
            timestamp: Date.now()
        });
        if (performanceMetrics.errors.length > 50) performanceMetrics.errors.shift();
    }
    gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('[Critical Error] Promesa rechazada no manejada:', reason);
    // 🔍 AUDIT: Log error
    DiagnosticAuditService.logError('unhandled_rejection', { message: String(reason) }, {});
    // 📊 TELEMETRÍA: Registrar error
    if (typeof performanceMetrics !== 'undefined') {
        performanceMetrics.errors.push({
            type: 'unhandledRejection',
            message: String(reason),
            timestamp: Date.now()
        });
        if (performanceMetrics.errors.length > 50) performanceMetrics.errors.shift();
    }
    // No cerramos aquí, solo logueamos - para evitar crasheos innecesarios
});

// ==================================================
// 7. HEALTH CHECK ENDPOINT
// ==================================================
app.get('/health', (req, res) => {
    const mongoose = require('mongoose');
    res.json({
        status: 'ok',
        uptime: process.uptime(),
        timestamp: Date.now(),
        mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
        rooms: Object.keys(rooms).length,
        memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB'
    });
});

// ==================================================
// 7b. DIAGNÓSTICO DETALLADO - Para debug de problemas de conexión
// ==================================================
// Métricas globales de performance
const performanceMetrics = {
    midiMessagesTotal: 0,
    midiMessagesPerMinute: [],
    peakConnections: 0,
    reconnections: 0,
    errors: [],
    lastHourSnapshots: [],
    startTime: Date.now()
};

// Guardar snapshot cada minuto (para detectar picos)
setInterval(() => {
    const snapshot = {
        timestamp: Date.now(),
        connections: io.engine?.clientsCount || 0,
        rooms: Object.keys(rooms).length,
        memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        cpu: process.cpuUsage(),
        midiPerMinute: performanceMetrics.midiMessagesPerMinute.length > 0 
            ? performanceMetrics.midiMessagesPerMinute[performanceMetrics.midiMessagesPerMinute.length - 1] 
            : 0
    };
    
    performanceMetrics.lastHourSnapshots.push(snapshot);
    
    // Mantener solo última hora (60 snapshots)
    if (performanceMetrics.lastHourSnapshots.length > 60) {
        performanceMetrics.lastHourSnapshots.shift();
    }
    
    // Reset contador de MIDI por minuto
    performanceMetrics.midiMessagesPerMinute.push(performanceMetrics.midiMessagesTotal);
    if (performanceMetrics.midiMessagesPerMinute.length > 60) {
        performanceMetrics.midiMessagesPerMinute.shift();
    }
    performanceMetrics.midiMessagesTotal = 0;
    
    // Actualizar peak
    const currentConnections = io.engine?.clientsCount || 0;
    if (currentConnections > performanceMetrics.peakConnections) {
        performanceMetrics.peakConnections = currentConnections;
    }
    
    // 🔒 MEMORY CLEANUP: Limpiar salas inactivas sin usuarios (cada minuto)
    const roomCodes = Object.keys(rooms);
    let cleanedRooms = 0;
    roomCodes.forEach(code => {
        const room = rooms[code];
        if (room && (!room.users || Object.keys(room.users).length === 0)) {
            // Sala sin usuarios por más de 5 minutos
            if (!room.emptyAt) {
                room.emptyAt = Date.now();
            } else if (Date.now() - room.emptyAt > 5 * 60 * 1000) {
                if (room.snapshotTimer) clearTimeout(room.snapshotTimer);
                if (room.inactivityTimer) clearTimeout(room.inactivityTimer);
                delete rooms[code];
                cleanedRooms++;
            }
        } else if (room) {
            room.emptyAt = null; // Reset si tiene usuarios
        }
    });
    if (cleanedRooms > 0) {
        console.log(`[Memory] 🧹 Limpiadas ${cleanedRooms} salas vacías`);
    }
}, 60000);

// 🔒 MEMORY MONITOR: Log de memoria cada 5 minutos
setInterval(() => {
    const mem = process.memoryUsage();
    const heapMB = Math.round(mem.heapUsed / 1024 / 1024);
    const rssMB = Math.round(mem.rss / 1024 / 1024);
    
    // Warning si supera 400MB (cerca del límite de 512MB de Render Free)
    if (heapMB > 400) {
        console.warn(`[Memory] ⚠️ ALERTA: Heap=${heapMB}MB, RSS=${rssMB}MB - cerca del límite!`);
    } else {
        console.log(`[Memory] 📊 Heap=${heapMB}MB, RSS=${rssMB}MB, Salas=${Object.keys(rooms).length}`);
    }
}, 5 * 60 * 1000);

app.get('/api/diagnostics', (req, res) => {
    const mongoose = require('mongoose');
    const os = require('os');
    
    // Calcular usuarios por sala
    const roomDetails = {};
    for (const [code, room] of Object.entries(rooms)) {
        roomDetails[code] = {
            users: Object.keys(room.users || {}).length,
            isActive: room.isActive,
            hasTeacher: Object.values(room.users || {}).some(u => u.role === 'teacher')
        };
    }
    
    res.json({
        server: {
            status: 'ok',
            uptime: Math.round(process.uptime()),
            uptimeFormatted: formatUptime(process.uptime()),
            startedAt: new Date(performanceMetrics.startTime).toISOString(),
            nodeVersion: process.version,
            platform: process.platform
        },
        connections: {
            current: io.engine?.clientsCount || 0,
            peak: performanceMetrics.peakConnections,
            reconnections: performanceMetrics.reconnections
        },
        rooms: {
            total: Object.keys(rooms).length,
            active: Object.values(rooms).filter(r => r.isActive).length,
            details: roomDetails
        },
        memory: {
            heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
            heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
            rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
            systemFree: Math.round(os.freemem() / 1024 / 1024),
            systemTotal: Math.round(os.totalmem() / 1024 / 1024)
        },
        performance: {
            midiMessagesLastHour: performanceMetrics.midiMessagesPerMinute.reduce((a, b) => a + b, 0),
            avgMidiPerMinute: performanceMetrics.midiMessagesPerMinute.length > 0
                ? Math.round(performanceMetrics.midiMessagesPerMinute.reduce((a, b) => a + b, 0) / performanceMetrics.midiMessagesPerMinute.length)
                : 0,
            snapshots: performanceMetrics.lastHourSnapshots.slice(-10) // Últimos 10 minutos
        },
        database: {
            status: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
            host: mongoose.connection.host || 'N/A'
        },
        errors: performanceMetrics.errors.slice(-10), // Últimos 10 errores
        timestamp: Date.now()
    });
});

// Helper para formatear uptime
function formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${days}d ${hours}h ${mins}m`;
}

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';
server.listen(PORT, HOST, () => {
    console.log(`🎹 PianoLink V4 (State-Aware Relay) corriendo en ${HOST}:${PORT}`);
    console.log(`📡 Entorno: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔒 CORS: ${process.env.NODE_ENV === 'production' ? 'Restringido' : 'Desarrollo'}`);
    console.log('[Lifecycle] Graceful shutdown configurado.');
    
    // Notificar a PM2 que estamos listos
    if (process.send) {
        process.send('ready');
    }
});