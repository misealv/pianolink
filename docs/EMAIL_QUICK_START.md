# 📧 Sistema de Emails - Guía Rápida

## 🚀 Inicio Rápido (5 minutos)

### 1. Instalar Resend
```bash
npm install resend
```

### 2. Configurar `.env`
```bash
RESEND_API_KEY=re_tu_api_key_aqui
EMAIL_FROM=onboarding@resend.dev
EMAIL_FROM_NAME=PianoLink Team
FRONTEND_URL=http://localhost:3000
NODE_ENV=development
```

### 3. Obtener API Key
1. Regístrate en [resend.com](https://resend.com) (gratis)
2. Ve a **API Keys** → **Create API Key**
3. Copia la key y pégala en `.env`

### 4. Iniciar el servidor
```bash
npm start
```

### 5. Probar
Registra un nuevo profesor desde la app. Verás en la consola:
```
[EMAIL] 📧 [SIMULADO] Email a: profesor@example.com
[EMAIL LISTENER] ✅ Email de bienvenida enviado
```

---

## 📁 Estructura de Archivos

```
pianolink/
├── services/
│   ├── EventService.js         # Sistema de eventos centralizado
│   └── EmailService.js         # Servicio de envío con Resend
├── listeners/
│   └── emailListeners.js       # Listeners de eventos de email
├── templates/
│   └── emails/
│       └── welcomeTeacher.js   # Template HTML de bienvenida
├── controllers/
│   └── authController.js       # Modificado: emite evento teacher.created
└── server.js                   # Modificado: carga listeners al inicio
```

---

## 🎯 Cómo Funciona

### Flujo Simplificado
```
1. Usuario se registra
2. authController.registerUser() → Guarda en DB
3. Emite evento: "teacher.created"
4. emailListeners escucha el evento
5. Envía email de bienvenida (sin bloquear)
```

### Código Clave

**Emitir evento (authController.js):**
```javascript
const eventService = require('../services/EventService');

// Después de crear el usuario:
eventService.emitSafe('teacher.created', {
    teacher: {
        _id: user._id,
        name: user.name,
        email: user.email,
        slug: user.slug
    }
});
```

**Escuchar evento (emailListeners.js):**
```javascript
async function onTeacherCreated(data) {
    const emailHtml = generateWelcomeTeacherEmail({
        teacherName: data.teacher.name,
        teacherEmail: data.teacher.email
    });
    
    await emailService.sendSafe({
        to: data.teacher.email,
        subject: '¡Bienvenido a PianoLink! 🎹',
        html: emailHtml
    });
}

eventService.registerListener('teacher.created', onTeacherCreated, 'sendWelcomeEmail');
```

---

## ✅ Checklist de Producción

Antes de lanzar a producción:

- [ ] Cambiar `NODE_ENV=production` en `.env`
- [ ] Verificar dominio propio en Resend (opcional pero recomendado)
- [ ] Configurar `FRONTEND_URL` con tu dominio real
- [ ] Agregar `ADMIN_EMAIL` si quieres notificaciones
- [ ] Configurar registros DNS (SPF, DKIM, DMARC) para mejor deliverability
- [ ] Probar enviando un email a tu Gmail/Outlook personal
- [ ] Verificar que NO llegue a spam
- [ ] Configurar logs de producción
- [ ] Considerar integración con Sentry para errores

---

## 🔧 Comandos Útiles

```bash
# Instalar dependencias
npm install

# Iniciar servidor
npm start

# Ver logs de email
grep "[EMAIL]" logs/app.log

# Probar envío manual (crear este script)
node scripts/testEmail.js
```

---

## 🆘 Solución Rápida de Problemas

| Problema | Solución |
|----------|----------|
| "RESEND_API_KEY no configurado" | Agrega la key en `.env` y reinicia |
| Email no se envía | Verifica que `NODE_ENV=production` |
| Error 401 Unauthorized | API Key inválida, genera una nueva |
| Email llega a spam | Usa `onboarding@resend.dev` o verifica dominio |
| Listener no se ejecuta | Verifica que `server.js` llame a `registerEmailListeners()` |

---

## 📚 Documentación Completa

Ver [EMAIL_SYSTEM_ARCHITECTURE.md](./EMAIL_SYSTEM_ARCHITECTURE.md) para:
- Arquitectura detallada
- Comparación de proveedores
- Guía de extensión
- Testing
- Monitoreo en producción

---

## 💡 Próximas Funcionalidades

Fácilmente implementables con esta arquitectura:

1. **Recordatorio de clases**
   - Evento: `class.scheduled`
   - Template: `classReminder.js`

2. **Recibo de pago**
   - Evento: `payment.received`
   - Template: `paymentReceipt.js`

3. **Notificación de nuevo estudiante**
   - Evento: `student.enrolled`
   - Template: `studentEnrolled.js`

Cada uno requiere solo:
1. Crear el template HTML
2. Crear el listener
3. Emitir el evento desde el controlador correspondiente

**Sin modificar código existente.** 🎉

---

**¿Dudas?** Consulta la documentación completa o contacta al equipo de desarrollo.
