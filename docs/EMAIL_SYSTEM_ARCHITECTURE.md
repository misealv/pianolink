# Sistema de Notificaciones por Email - Arquitectura y Guía de Implementación

## 📋 Índice
1. [Arquitectura](#arquitectura)
2. [Decisiones Técnicas](#decisiones-técnicas)
3. [Configuración](#configuración)
4. [Uso y Extensión](#uso-y-extensión)
5. [Testing](#testing)
6. [Troubleshooting](#troubleshooting)

---

## 🏗️ Arquitectura

### Patrón Event-Driven (Opción B Seleccionada)

```
┌─────────────────────────────────────────────────────────────┐
│                    FLUJO DE REGISTRO                         │
└─────────────────────────────────────────────────────────────┘

1. Cliente → POST /api/auth/register
                    ↓
2. authController.registerUser()
   - Valida datos
   - Crea usuario en DB
   - ✅ Guarda en MongoDB
   - 🔔 Emite evento: "teacher.created"
   - ✅ Responde al cliente (200 OK)
                    ↓
3. EventService (en paralelo, no bloqueante)
   - Distribuye evento a listeners registrados
                    ↓
4. emailListeners.onTeacherCreated()
   - Genera template HTML
   - Llama a EmailService.sendSafe()
   - ⚡ No lanza errores (silencioso)
                    ↓
5. EmailService
   - Envía via Resend API
   - Sistema de reintentos (3 intentos)
   - Logging detallado
```

### Ventajas de Esta Arquitectura

✅ **Desacoplamiento Total**
- El controlador NO conoce la lógica de emails
- Fácil agregar nuevas acciones sin modificar el controlador

✅ **Resiliencia**
- Errores de email NO bloquean el registro
- Sistema de reintentos automático
- Modo simulado en desarrollo

✅ **Escalabilidad**
- Múltiples listeners pueden escuchar el mismo evento
- Fácil agregar nuevos tipos de notificaciones

✅ **Mantenibilidad**
- Código organizado en capas claras
- Fácil de testear cada componente por separado

---

## 🎯 Decisiones Técnicas

### 1. Proveedor de Email: Resend ✅

**¿Por qué Resend sobre SendGrid o AWS SES?**

| Característica | Resend | SendGrid | AWS SES |
|----------------|--------|----------|---------|
| **Precio (Free tier)** | 3,000/mes | 100/mes | 62,000/mes* |
| **Precio (Paid)** | $20 = 50K | $20 = 50K | Variable |
| **API Simplicity** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ |
| **Developer Experience** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ |
| **Deliverability** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Setup Time** | 5 min | 15 min | 30+ min |
| **Documentación** | Excelente | Buena | Compleja |

*AWS SES requiere salir del sandbox manualmente

**Conclusión:** Resend es la mejor opción para startups en etapa temprana:
- Free tier generoso (3,000 emails/mes)
- API extremadamente simple
- No requiere configuración compleja de DNS inicialmente
- Excelente deliverability desde el día 1

### 2. Arquitectura: Event-Driven (Opción B) ✅

**¿Por qué NO la opción A (Llamada directa)?**

```javascript
// ❌ OPCIÓN A (NO ELEGIDA): Llamada directa
exports.registerUser = async (req, res) => {
    const user = await User.create(data);
    
    // Problema 1: Si esto falla, el registro falla
    await emailService.send({ to: user.email, ... });
    
    // Problema 2: Si queremos agregar más acciones (notificar admin, crear perfil), 
    // tenemos que modificar ESTE controlador
    
    res.json({ success: true });
};

// ✅ OPCIÓN B (ELEGIDA): Event-Driven
exports.registerUser = async (req, res) => {
    const user = await User.create(data);
    
    // Emitimos evento y olvidamos
    eventService.emitSafe('teacher.created', { teacher: user });
    
    res.json({ success: true }); // Respuesta inmediata
};

// En otro archivo (listeners/emailListeners.js):
eventService.on('teacher.created', async (data) => {
    await emailService.sendSafe({ to: data.teacher.email, ... });
});

// Fácil agregar más listeners sin tocar el controlador:
eventService.on('teacher.created', async (data) => {
    await notifyAdmin(data.teacher);
});

eventService.on('teacher.created', async (data) => {
    await createDefaultSettings(data.teacher);
});
```

---

## ⚙️ Configuración

### Paso 1: Instalar Dependencias

```bash
npm install resend
```

### Paso 2: Obtener API Key de Resend

1. Visita [resend.com](https://resend.com)
2. Crea una cuenta (gratis)
3. Ve a **API Keys** → **Create API Key**
4. Copia la key (empieza con `re_`)

### Paso 3: Configurar Variables de Entorno

Edita tu archivo `.env`:

```bash
# === EMAIL (Resend) - NOTIFICACIONES ===
RESEND_API_KEY=re_tu_api_key_real_aqui

# Para desarrollo, usa el dominio gratuito de Resend:
EMAIL_FROM=onboarding@resend.dev
EMAIL_FROM_NAME=PianoLink Team

# Para producción, verifica tu dominio propio:
# EMAIL_FROM=noreply@pianolink.com
# Sigue la guía: https://resend.com/docs/dashboard/domains/introduction

# URL de tu frontend (para links en emails)
FRONTEND_URL=http://localhost:3000

# (Opcional) Email del admin para notificaciones internas
ADMIN_EMAIL=admin@pianolink.com

# Importante: Mantener NODE_ENV
NODE_ENV=development  # En desarrollo: emails simulados
# NODE_ENV=production # En producción: emails reales
```

### Paso 4: Verificar que Todo Funciona

```bash
npm start
```

Deberías ver en la consola:
```
[EMAIL] ✅ Servicio de email inicializado correctamente
[EMAIL LISTENERS] 📬 Listeners de email registrados correctamente
```

---

## 🚀 Uso y Extensión

### Agregar un Nuevo Tipo de Email

**1. Crear el template:**

```javascript
// templates/emails/classReminder.js
module.exports = function generateClassReminderEmail(data) {
    const { studentName, teacherName, classDate, classTime } = data;
    
    return `
        <!DOCTYPE html>
        <html>
        <body>
            <h1>Recordatorio de Clase</h1>
            <p>Hola ${studentName},</p>
            <p>Tu clase con ${teacherName} es mañana a las ${classTime}.</p>
        </body>
        </html>
    `;
};
```

**2. Crear el listener:**

```javascript
// En listeners/emailListeners.js

const generateClassReminderEmail = require('../templates/emails/classReminder');

async function onClassScheduled(data) {
    const { student, teacher, classData } = data;
    
    const emailHtml = generateClassReminderEmail({
        studentName: student.name,
        teacherName: teacher.name,
        classDate: classData.date,
        classTime: classData.time
    });
    
    await emailService.sendSafe({
        to: student.email,
        subject: `Recordatorio: Clase con ${teacher.name}`,
        html: emailHtml
    });
}

// Registrar el listener
function registerEmailListeners() {
    // ... listeners existentes
    
    eventService.registerListener(
        'class.scheduled',
        onClassScheduled,
        'sendClassReminder'
    );
}
```

**3. Emitir el evento desde tu controlador:**

```javascript
// controllers/classController.js
exports.scheduleClass = async (req, res) => {
    const classData = await Class.create(req.body);
    
    // Emitir evento
    eventService.emitSafe('class.scheduled', {
        student: classData.student,
        teacher: classData.teacher,
        classData: classData
    });
    
    res.json({ success: true });
};
```

¡Listo! No necesitas modificar nada más.

### Agregar Múltiples Acciones al Mismo Evento

```javascript
// Listener 1: Enviar email al profesor
eventService.registerListener(
    'teacher.created',
    sendWelcomeEmail,
    'welcomeEmail'
);

// Listener 2: Notificar al admin
eventService.registerListener(
    'teacher.created',
    notifyAdminNewTeacher,
    'adminNotification'
);

// Listener 3: Crear configuración por defecto
eventService.registerListener(
    'teacher.created',
    createDefaultSettings,
    'defaultSettings'
);

// Todos se ejecutan en paralelo, si uno falla, los demás continúan
```

---

## 🧪 Testing

### Modo Desarrollo (Simulación)

En desarrollo (`NODE_ENV=development`), los emails NO se envían realmente:

```javascript
[EMAIL] 📧 [SIMULADO] Email a: profesor@example.com
[EMAIL] 📧 Asunto: ¡Bienvenido a PianoLink! 🎹
[EMAIL] 📧 HTML length: 5432 caracteres
```

Esto es útil para:
- No consumir tu cuota de Resend durante desarrollo
- Testear sin preocuparte por emails reales
- Acelerar el desarrollo

### Testear Email Real en Desarrollo

```bash
# En .env, temporalmente:
NODE_ENV=production
```

Luego registra un usuario con TU email real para ver cómo se ve.

### Script de Test Manual

```javascript
// test/emailTest.js
const emailService = require('../services/EmailService');
const generateWelcomeTeacherEmail = require('../templates/emails/welcomeTeacher');

async function testEmail() {
    const html = generateWelcomeTeacherEmail({
        teacherName: 'Juan Pérez',
        teacherEmail: 'juan@example.com'
    });
    
    const result = await emailService.send({
        to: 'tu-email@gmail.com', // TU EMAIL AQUÍ
        subject: 'Test - Email de Bienvenida',
        html: html
    });
    
    console.log('Resultado:', result);
}

testEmail();
```

```bash
node test/emailTest.js
```

---

## 🔧 Troubleshooting

### Problema 1: "RESEND_API_KEY no configurado"

**Síntoma:**
```
[EMAIL] ⚠️  RESEND_API_KEY no configurado. Emails no se enviarán.
```

**Solución:**
1. Verifica que tu archivo `.env` existe
2. Verifica que la variable esté configurada: `RESEND_API_KEY=re_...`
3. Reinicia el servidor

### Problema 2: "Error 401: Unauthorized"

**Síntoma:**
```
[EMAIL] ❌ Error al enviar email: Request failed with status code 401
```

**Solución:**
- Tu API Key es inválida o expiró
- Genera una nueva en [resend.com/api-keys](https://resend.com/api-keys)

### Problema 3: "Error 403: Domain not verified"

**Síntoma:**
```
[EMAIL] ❌ Error al enviar email: Domain not verified
```

**Solución:**

Si estás usando el dominio gratuito:
```bash
EMAIL_FROM=onboarding@resend.dev
```

Si quieres usar tu propio dominio:
1. Ve a [resend.com/domains](https://resend.com/domains)
2. Agrega tu dominio
3. Configura los registros DNS (SPF, DKIM, DMARC)
4. Espera la verificación (~10 minutos)

### Problema 4: El email llega a spam

**Solución:**

Para desarrollo:
- Usa `onboarding@resend.dev` (tiene mejor reputación)

Para producción:
1. Verifica tu dominio propio
2. Configura SPF, DKIM y DMARC correctamente
3. No uses palabras spam en el asunto ("GRATIS", "URGENTE", etc.)
4. Incluye siempre una versión de texto plano
5. Agrega un link de "unsubscribe" (requisito legal)

### Problema 5: Listeners no se ejecutan

**Síntoma:**
- El usuario se crea, pero no se envía el email
- No hay logs de `[EMAIL LISTENER]`

**Solución:**

Verifica que [server.js](server.js#L14-L15) tenga:
```javascript
const { registerEmailListeners } = require('./listeners/emailListeners');
registerEmailListeners();
```

Debe estar DESPUÉS de `dotenv.config()` y ANTES de crear el servidor Express.

---

## 📊 Monitoreo en Producción

### Logs a Revisar

```bash
# Ver todos los logs de email
grep "\[EMAIL\]" logs/app.log

# Ver solo errores
grep "\[EMAIL\] ❌" logs/app.log

# Ver eventos emitidos
grep "\[EVENT\]" logs/app.log
```

### Integración con Servicios de Monitoreo

Para producción, considera integrar:

**Sentry (Errores):**
```javascript
// En services/EmailService.js
if (process.env.NODE_ENV === 'production') {
    Sentry.captureException(error, {
        tags: { service: 'email' },
        extra: { to, subject }
    });
}
```

**Datadog (Métricas):**
```javascript
// En listeners/emailListeners.js
const StatsD = require('node-dogstatsd').StatsD;
const dogstatsd = new StatsD();

async function onTeacherCreated(data) {
    const startTime = Date.now();
    
    await emailService.sendSafe({ ... });
    
    const duration = Date.now() - startTime;
    dogstatsd.timing('email.welcome_teacher.duration', duration);
    dogstatsd.increment('email.welcome_teacher.sent');
}
```

---

## 🎓 Próximos Pasos

Esta arquitectura está lista para crecer. Considera implementar:

1. **Cola de Mensajes (Bull/BullMQ)**
   - Para emails que requieren procesamiento pesado
   - Rate limiting (ej. máximo 100 emails/minuto)

2. **Plantillas con Motor de Templates (Handlebars/EJS)**
   - Separar HTML del JavaScript
   - Reutilización de componentes (header, footer, etc.)

3. **Preferencias de Usuario**
   - Permitir que usuarios elijan qué emails recibir
   - Tabla `UserEmailPreferences` en la DB

4. **A/B Testing**
   - Probar diferentes subject lines
   - Medir tasas de apertura y clicks

5. **Email Analytics**
   - Integrar Resend webhooks para tracking
   - Ver quién abre los emails, qué links clickean

---

## 📚 Recursos Adicionales

- [Documentación de Resend](https://resend.com/docs)
- [Node.js EventEmitter](https://nodejs.org/api/events.html)
- [Guía de Deliverability](https://resend.com/docs/knowledge-base/deliverability)
- [HTML Email Best Practices](https://www.caniemail.com/)

---

**Autor:** PianoLink Dev Team  
**Fecha:** Enero 2026  
**Versión:** 1.0.0
