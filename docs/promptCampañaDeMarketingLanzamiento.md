# PROMPT MAESTRO V2 — AGENTE IA PIANOLINK
## Para GitHub Copilot Agent / Cursor Agent con acceso al repositorio completo

---

## ⚠️ INSTRUCCIÓN CRÍTICA — LEE ESTO PRIMERO

**Antes de escribir una sola línea de código, debes:**

1. Explorar la estructura completa del repositorio con `tree` o listando directorios
2. Leer los archivos de rutas (`routes/`, `router.js`, o equivalente)
3. Leer los modelos de base de datos existentes (`models/`)
4. Leer los controladores existentes (`controllers/`)
5. Identificar el motor de templates o sistema de vistas (`views/`)
6. Leer el `package.json` para entender dependencias actuales
7. Leer el `.env.example` o `.env` (sin exponer valores) para entender variables configuradas
8. Identificar cómo está estructurada la autenticación ya existente

**Solo después de ese análisis completo, procede con las tareas.**

**Nunca reemplaces ni sobreescribas funcionalidad que ya existe.**
**Si algo ya está implementado, extiéndelo. No lo rehgas.**

---

## CONTEXTO DEL PROYECTO

**PianoLink** es un marketplace de clases de piano online 1 a 1 con tecnología MIDI.
- **Sitio principal:** pianolink.net
- **Lanzamiento:** 29 de marzo de 2026 (Día 88 del año) — 88 cupos a $44 USD
- **Fundador:** Miguel Antonio — hola@pianolink.pro

**El CRM ya existe** como una aplicación Node.js independiente con arquitectura MVC propia, alojada en el mismo servidor que pianolink.net. Ya tiene funcionando:
- ✅ Pipeline Kanban de profesores
- ✅ Gestión de leads/contactos
- ✅ Autenticación / login
- ✅ Base de datos conectada

**Tu trabajo es extender este CRM**, no crear uno nuevo. Todas las funcionalidades nuevas deben integrarse respetando el patrón MVC existente, usando las mismas convenciones de código, mismos modelos de base de datos donde sea posible, y el mismo sistema de autenticación ya funcional.

**Servicio de emails:** Resend (resend.com) — usar el SDK oficial `npm install resend`

---

## PASO 0 — DIAGNÓSTICO INICIAL (obligatorio)

Antes de cualquier tarea, genera un reporte de diagnóstico que responda:

```
DIAGNÓSTICO DEL REPO PIANOLINK CRM
====================================
1. Estructura de carpetas (árbol completo)
2. Framework/router usado (Express, Fastify, etc.)
3. ORM o cliente de DB usado (Sequelize, Prisma, pg, mongoose, etc.)
4. Motor de templates (EJS, Handlebars, Pug, o frontend separado)
5. Puerto y modo de inicio (npm start, node server.js, etc.)
6. Tablas/colecciones existentes en la DB
7. Rutas ya definidas (GET/POST/PUT/DELETE)
8. Middleware de autenticación existente
9. ¿Tiene sistema de roles? (admin, usuario)
10. Dependencias actuales en package.json
11. Variables de entorno ya configuradas (solo los nombres, no valores)
12. ¿Qué falta para que el CRM esté 100% funcional según el código actual?
```

Muestra este diagnóstico como comentarios en código o como un archivo `DIAGNOSTICO.md` antes de proceder.

---

## TAREA 1 — COMPLETAR EL CRM EXISTENTE

Basándote en el diagnóstico, identifica qué funcionalidades están incompletas o tienen TODOs/placeholders en el código actual y **termínalas primero**. Esto incluye:

- Rutas que están definidas pero sin controlador implementado
- Controladores con lógica vacía o comentada
- Vistas con datos hardcodeados en lugar de dinámicos
- Validaciones faltantes en formularios
- Manejo de errores incompleto
- Funciones del pipeline Kanban que no persisten en DB (solo en memoria/frontend)

**Documenta cada cosa que completaste** con un comentario `// COMPLETADO: descripción` en el código.

---

## TAREA 2 — MÓDULO DE GESTIÓN DE LANDINGS

Integra dentro del CRM existente un módulo para crear y editar landing pages. Seguir exactamente el patrón MVC del proyecto.

### Modelo: `Landing` (crear en `/models/Landing.js` o equivalente)

```javascript
{
  id: 'uuid o autoincrement según el ORM existente',
  nombre: 'string',             // nombre interno ej: "Waitlist Día 88"
  slug: 'string unique',        // ej: "waitlist" → accesible en /lp/waitlist
  tipo: 'enum: waitlist | venta | profesor | custom',
  titulo: 'string',
  subtitulo: 'string',
  cta_texto: 'string',          // texto del botón principal
  cta_url: 'string',
  html_personalizado: 'text',   // bloque HTML adicional opcional
  activa: 'boolean default true',
  meta_pixel_evento: 'string',  // evento a disparar ej: "Lead"
  meta_pixel_valor: 'decimal nullable',
  total_visitas: 'integer default 0',
  total_conversiones: 'integer default 0',
  fecha_creacion: 'timestamp',
  fecha_actualizacion: 'timestamp'
}
```

### Controlador: `/controllers/landingController.js`

```javascript
// index()     → listar todas las landings con métricas
// create()    → formulario de creación
// store()     → guardar nueva landing en DB
// edit(id)    → formulario de edición con datos actuales
// update(id)  → guardar cambios
// destroy(id) → desactivar landing (activa = false, no borrar)
// preview(id) → previsualizar antes de publicar
// render(slug)→ renderizar la landing pública
// stats(id)   → incrementar visitas (llamado desde frontend)
// convert(id) → incrementar conversiones (llamado desde frontend)
```

### Rutas:

```javascript
// Protegidas por auth existente:
GET    /crm/landings              → landingController.index
GET    /crm/landings/nueva        → landingController.create
POST   /crm/landings              → landingController.store
GET    /crm/landings/:id/editar   → landingController.edit
PUT    /crm/landings/:id          → landingController.update
DELETE /crm/landings/:id          → landingController.destroy
GET    /crm/landings/:id/preview  → landingController.preview

// Públicas (sin auth):
GET    /lp/:slug                  → landingController.render
POST   /lp/:slug/track            → landingController.stats
POST   /lp/:slug/convert          → landingController.convert
```

### Vista del editor de landings:
- Campos de formulario para todos los campos del modelo
- Editor de texto enriquecido para `html_personalizado` (SimpleMDE via CDN)
- Vista previa en iframe del resultado final
- Toggle activa/inactiva
- Métricas: visitas / conversiones / tasa de conversión %
- Botón "Copiar link" que copia la URL pública `/lp/:slug`
- Selector del evento de Meta Pixel

### Landing de lista de espera (seed inicial):

Crear automáticamente al correr migraciones:

```javascript
{
  nombre: 'Waitlist Día 88',
  slug: 'waitlist',
  tipo: 'waitlist',
  titulo: 'El 29 de marzo abre PianoLink',
  subtitulo: 'Solo 88 cupos. Clases 1 a 1 de piano online con tecnología MIDI. Desde tu casa.',
  cta_texto: '🎹 Reservar mi lugar gratis',
  cta_url: '#formulario',
  meta_pixel_evento: 'Lead',
  activa: true
}
```

El render público debe incluir:
- Countdown al 29 de marzo 2026 09:00:00
- Formulario: nombre + email
- Al submit: guardar en tabla `Leads` existente del CRM + enviar email de confirmación con Resend + disparar `fbq('track', 'Lead')`

---

## TAREA 3 — MÓDULO DE EMAIL MARKETING CON RESEND

### Instalación:
```bash
npm install resend
```

### Variables de entorno a agregar:
```env
RESEND_API_KEY=re_xxxxxxxx
EMAIL_FROM=Miguel Antonio <hola@pianolink.net>
EMAIL_REPLY_TO=hola@pianolink.pro
```

### Modelo: `EmailCampana`

```javascript
{
  id: 'uuid o autoincrement',
  nombre: 'string',
  asunto: 'string',
  preview_text: 'string',
  contenido_html: 'text',
  tipo: 'enum: secuencia | broadcast | transaccional',
  orden_secuencia: 'integer nullable',
  estado: 'enum: borrador | programado | enviado',
  fecha_programada: 'timestamp nullable',
  fecha_enviado: 'timestamp nullable',
  total_enviados: 'integer default 0',
  total_abiertos: 'integer default 0',
  total_clicks: 'integer default 0',
  resend_broadcast_id: 'string nullable',
  fecha_creacion: 'timestamp',
  fecha_actualizacion: 'timestamp'
}
```

### Modelo: `Suscriptor`

**IMPORTANTE:** Si el modelo `Lead` existente tiene campos de email/nombre, extenderlo en lugar de crear uno nuevo. Verificar en el diagnóstico.

```javascript
{
  id: 'uuid',
  nombre: 'string',
  email: 'string unique',
  fuente: 'string',             // "waitlist", "landing-profesores", "manual"
  estado: 'enum: activo | desuscrito | rebotado',
  tags: 'json array',
  fecha_suscripcion: 'timestamp',
  resend_contact_id: 'string nullable'
}
```

### Servicio: `/services/resendService.js`

```javascript
const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);

// sendEmail(to, subject, html, options)
// → Email individual con registro en DB

// sendCampaign(campanaId)
// → Obtener suscriptores activos
// → Enviar en batches de 50 (respetar rate limits)
// → Actualizar total_enviados y resend_broadcast_id

// sendTransactional(email, template, data)
// → Para confirmaciones automáticas de waitlist, bienvenida, etc.

// addContact(email, nombre, tags)
// → Agregar contacto en Resend Audiences

// removeContact(email)
// → Desuscribir en Resend + actualizar DB
```

### Rutas:

```javascript
// Protegidas por auth:
GET    /crm/emails                    → index: listar campañas
GET    /crm/emails/nueva              → create: formulario
POST   /crm/emails                    → store: guardar
GET    /crm/emails/:id/editar         → edit: editor
PUT    /crm/emails/:id                → update: actualizar
POST   /crm/emails/:id/enviar         → send: enviar ahora
POST   /crm/emails/:id/programar      → schedule: programar
GET    /crm/emails/:id/preview        → preview: previsualizar
GET    /crm/emails/:id/stats          → stats: métricas
POST   /crm/emails/:id/duplicar       → duplicate: duplicar como borrador

GET    /crm/suscriptores              → listar
POST   /crm/suscriptores              → agregar manual
DELETE /crm/suscriptores/:id          → desuscribir

// Pública para webhooks de Resend:
POST   /webhooks/resend               → manejar aperturas/clicks
```

### Vista del editor de campañas:
- Editor HTML con syntax highlighting (CodeMirror via CDN)
- Panel de preview del email en iframe
- Variables disponibles: `{{nombre}}`, `{{email}}`, `{{unsubscribe_url}}`
- Botón "Enviar prueba a mi email" antes de enviar masivo
- Selector de fecha/hora para programar
- Contador de suscriptores que recibirán la campaña
- Métricas post-envío: enviados / abiertos / clicks / tasa apertura %

### Las 3 campañas de lanzamiento (seeds):

Crear `/seeds/emailCampanas.js` que genere estas 3 campañas como borradores editables en el CRM:

---

**CAMPAÑA 1 — Email de historia:**
```javascript
{
  nombre: 'Email 1 - Historia de Miguel',
  asunto: 'A los 4 años pedí un piano para Navidad 🎹',
  preview_text: 'Esta es mi historia. Quizás también sea la tuya.',
  tipo: 'secuencia',
  orden_secuencia: 1,
  estado: 'borrador',
  contenido_html: `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f5f0;font-family:Georgia,serif;">
<table width="100%" cellpadding="0" cellspacing="0" bgcolor="#f5f5f0">
<tr><td align="center" style="padding:30px 20px;">
<table width="600" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
  <tr><td bgcolor="#0a0a0a" align="center" style="padding:28px 40px;">
    <span style="font-family:Georgia,serif;font-size:22px;color:#c9a84c;letter-spacing:2px;">🎹 PianoLink</span>
  </td></tr>
  <tr><td style="padding:48px 48px 32px;">
    <h1 style="font-family:Georgia,serif;font-size:28px;color:#0a0a0a;margin:0 0 28px;line-height:1.3;">A los 4 años le pedí un piano a mis papás para Navidad.</h1>
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 20px;">Hola {{nombre}},</p>
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 20px;">No sabía ni cómo sonaba de cerca. Pero algo en mí sabía que ese instrumento iba a ser parte de mi vida.</p>
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 20px;">A los 10 años llegó: un teclado de 3 octavas. Pasaba horas explorando cada tecla, inventando melodías. Fue amor a primera nota.</p>
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 20px;">Estudié en el conservatorio, aprendí técnica clásica, pero mi alma siempre quiso algo más. Encontré mi voz en la música latinoamericana.</p>
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 20px;">En 2013, cuando supe que venía mi hija Aurora, abrí mi propia escuela de piano: Resonancias. Duró más de 10 años. A veces los sueños necesitan transformarse.</p>
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 32px;">Un día Aurora me dijo: "Papá, quiero una casa con jardín." Del dolor de cerrar Resonancias nació PianoLink. Porque la creatividad siempre encuentra un camino.</p>
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="border-top:2px solid #c9a84c;padding-bottom:32px;"></td></tr></table>
    <p style="font-size:18px;color:#0a0a0a;line-height:1.8;margin:0 0 20px;font-style:italic;">Si tú también tienes una vocecita que te dice "algún día voy a aprender piano"... te cuento algo pronto. Algo que construí pensando exactamente en ti.</p>
    <p style="font-size:16px;color:#333;margin:0;">Miguel Antonio<br><span style="color:#c9a84c;">Fundador, PianoLink</span></p>
  </td></tr>
  <tr><td bgcolor="#0a0a0a" style="padding:24px 48px;" align="center">
    <p style="color:#888;font-size:12px;margin:0 0 8px;">El 29 de marzo abre PianoLink. Solo 88 cupos.</p>
    <p style="margin:0;"><a href="{{unsubscribe_url}}" style="color:#666;font-size:11px;">Cancelar suscripción</a></p>
    <p style="color:#555;font-size:11px;margin:8px 0 0;">© 2026 PianoLink · hola@pianolink.pro</p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`
}
```

---

**CAMPAÑA 2 — Revelación del producto:**
```javascript
{
  nombre: 'Email 2 - Revelación PianoLink',
  asunto: '¿Por qué el 29 de marzo es diferente? 🎹',
  preview_text: 'Te cuento qué estamos abriendo y por qué cambió todo.',
  tipo: 'secuencia',
  orden_secuencia: 2,
  estado: 'borrador',
  fecha_programada: '2026-03-19T09:00:00',
  contenido_html: `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f5f0;font-family:Georgia,serif;">
<table width="100%" cellpadding="0" cellspacing="0" bgcolor="#f5f5f0">
<tr><td align="center" style="padding:30px 20px;">
<table width="600" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
  <tr><td bgcolor="#0a0a0a" align="center" style="padding:28px 40px;">
    <span style="font-family:Georgia,serif;font-size:22px;color:#c9a84c;letter-spacing:2px;">🎹 PianoLink</span>
  </td></tr>
  <tr><td style="padding:48px 48px 32px;">
    <p style="font-size:13px;color:#c9a84c;letter-spacing:2px;text-transform:uppercase;margin:0 0 12px;">Ya casi llega</p>
    <h1 style="font-family:Georgia,serif;font-size:28px;color:#0a0a0a;margin:0 0 12px;line-height:1.3;">El 29 de marzo abre PianoLink.</h1>
    <p style="font-size:18px;color:#666;margin:0 0 36px;">Y quería contarte exactamente qué es, antes que nadie.</p>
    <h2 style="font-size:20px;color:#0a0a0a;margin:0 0 16px;">Clases de piano 1 a 1, online, con un profesor real</h2>
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 32px;">No es una app. No son videos pregrabados. Es un profesor certificado que te ve, te escucha y te corrige en tiempo real — desde tu casa, sin traslados, en el horario que tú elijas.</p>
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr><td style="border-left:4px solid #c9a84c;background:#f5f5f0;padding:24px 28px;border-radius:0 8px 8px 0;">
        <h3 style="font-size:18px;color:#0a0a0a;margin:0 0 12px;">¿Por qué no simplemente Zoom?</h3>
        <p style="font-size:15px;color:#333;line-height:1.8;margin:0;">Zoom comprime el audio. Pierde los matices. Con PianoLink usamos tecnología MIDI: tu teclado se conecta directamente a tu computadora, y tu profesor ve en su pantalla exactamente qué teclas presionas, con qué fuerza, en tiempo real.<br><br>Es la diferencia entre que te digan "sonó bien" y que te corrijan exactamente en la nota 4 del compás 2.</p>
      </td></tr>
    </table>
    <div style="margin-top:32px;"></div>
    <h2 style="font-size:20px;color:#0a0a0a;margin:0 0 16px;">¿Por qué el 29 de marzo?</h2>
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 32px;">El 29 de marzo es el día 88 del año. El piano tiene 88 teclas. Y también es mi cumpleaños 🎂<br><br>Abrimos solo 88 cupos para garantizar que cada nuevo estudiante tenga atención real de su profesor. Sin masificar. Sin perder calidad.</p>
    <table width="100%" cellpadding="0" cellspacing="0" bgcolor="#0a0a0a" style="border-radius:8px;">
      <tr><td style="padding:32px;text-align:center;">
        <p style="color:#c9a84c;font-size:13px;letter-spacing:2px;text-transform:uppercase;margin:0 0 8px;">Kit de Bienvenida PianoLink</p>
        <p style="color:#ffffff;font-size:24px;font-family:Georgia,serif;margin:0 0 20px;">$44 USD <span style="text-decoration:line-through;color:#666;font-size:16px;">$90</span></p>
        <table cellpadding="0" cellspacing="0" align="center"><tr><td>
          <p style="color:#888;font-size:14px;text-align:left;margin:0 0 6px;">✓ Asesoría técnica personalizada</p>
          <p style="color:#888;font-size:14px;text-align:left;margin:0 0 6px;">✓ Setup de tu teclado por videollamada</p>
          <p style="color:#888;font-size:14px;text-align:left;margin:0 0 6px;">✓ Primera clase real de 30 min</p>
          <p style="color:#888;font-size:14px;text-align:left;margin:0 0 20px;">✓ Garantía de devolución 30 días</p>
        </td></tr></table>
        <a href="https://pianolink.net" style="background:#c9a84c;color:#0a0a0a;text-decoration:none;padding:14px 32px;border-radius:4px;font-size:16px;font-weight:bold;display:inline-block;">Ver todo sobre el Kit →</a>
      </td></tr>
    </table>
    <div style="margin-top:32px;"></div>
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0;">Si ya estás en esta lista, tienes acceso antes que nadie. El 29 de marzo a las 9:00 AM te escribo con el link directo.<br><br>Nos vemos pronto,<br><strong>Miguel Antonio</strong><br><span style="color:#c9a84c;">Fundador, PianoLink</span></p>
  </td></tr>
  <tr><td bgcolor="#0a0a0a" style="padding:24px 48px;" align="center">
    <p style="color:#888;font-size:12px;margin:0 0 8px;">El 29 de marzo abre PianoLink. Solo 88 cupos.</p>
    <p style="margin:0;"><a href="{{unsubscribe_url}}" style="color:#666;font-size:11px;">Cancelar suscripción</a></p>
    <p style="color:#555;font-size:11px;margin:8px 0 0;">© 2026 PianoLink · hola@pianolink.pro</p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`
}
```

---

**CAMPAÑA 3 — Lanzamiento Día 88:**
```javascript
{
  nombre: 'Email 3 - Lanzamiento Día 88',
  asunto: '🎹 Hoy abre PianoLink — 88 cupos',
  preview_text: 'El Día 88 llegó. Tu lugar está esperando.',
  tipo: 'broadcast',
  estado: 'borrador',
  fecha_programada: '2026-03-29T09:00:00',
  contenido_html: `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:Georgia,serif;">
<table width="100%" cellpadding="0" cellspacing="0" bgcolor="#0a0a0a">
<tr><td align="center" style="padding:30px 20px;">
<table width="600" cellpadding="0" cellspacing="0" style="border-radius:8px;overflow:hidden;">
  <tr><td bgcolor="#0a0a0a" align="center" style="padding:28px 40px;">
    <span style="font-family:Georgia,serif;font-size:22px;color:#c9a84c;letter-spacing:2px;">🎹 PianoLink</span>
  </td></tr>
  <tr><td bgcolor="#0a0a0a" style="padding:48px 48px 40px;text-align:center;">
    <p style="color:#c9a84c;font-size:12px;letter-spacing:3px;text-transform:uppercase;margin:0 0 16px;">DÍA 88 · 29 DE MARZO DE 2026</p>
    <h1 style="font-family:Georgia,serif;font-size:40px;color:#ffffff;margin:0 0 16px;line-height:1.2;">Hoy abre PianoLink.</h1>
    <p style="font-size:20px;color:#c9a84c;margin:0 0 36px;">Tu sueño de tocar piano empieza hoy.</p>
    <a href="https://pianolink.net/welcome-kit" style="background:#c9a84c;color:#0a0a0a;text-decoration:none;padding:18px 40px;border-radius:4px;font-size:18px;font-weight:bold;display:inline-block;">🎹 Reservar mi cupo ahora</a>
  </td></tr>
  <tr><td bgcolor="#ffffff" style="padding:20px 48px;text-align:center;">
    <p style="color:#c0392b;font-size:16px;font-weight:bold;margin:0;">⚠️ Solo 88 cupos disponibles. Sin excepciones.</p>
  </td></tr>
  <tr><td bgcolor="#ffffff" style="padding:32px 48px;">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td width="33%" style="text-align:center;padding:16px 8px;"><p style="font-size:24px;margin:0 0 8px;">🎯</p><p style="font-size:14px;font-weight:bold;color:#0a0a0a;margin:0 0 4px;">Solo 88 cupos</p><p style="font-size:12px;color:#666;margin:0;">Cierra cuando se agoten</p></td>
      <td width="33%" style="text-align:center;padding:16px 8px;"><p style="font-size:24px;margin:0 0 8px;">⭐</p><p style="font-size:14px;font-weight:bold;color:#0a0a0a;margin:0 0 4px;">$44 USD</p><p style="font-size:12px;color:#666;margin:0;">Normal $90</p></td>
      <td width="33%" style="text-align:center;padding:16px 8px;"><p style="font-size:24px;margin:0 0 8px;">🛡️</p><p style="font-size:14px;font-weight:bold;color:#0a0a0a;margin:0 0 4px;">Garantía 30 días</p><p style="font-size:12px;color:#666;margin:0;">Devolución total</p></td>
    </tr></table>
  </td></tr>
  <tr><td bgcolor="#ffffff" style="padding:0 48px 32px;">
    <h2 style="font-size:20px;color:#0a0a0a;margin:0 0 16px;">¿Qué incluye tu Kit de Bienvenida?</h2>
    <p style="font-size:15px;color:#333;margin:0 0 8px;">✓ &nbsp;Asesoría técnica personalizada</p>
    <p style="font-size:15px;color:#333;margin:0 0 8px;">✓ &nbsp;Videollamada de setup — configuramos todo juntos</p>
    <p style="font-size:15px;color:#333;margin:0 0 8px;">✓ &nbsp;Primera clase real de 30 min con profesor certificado</p>
    <p style="font-size:15px;color:#333;margin:0 0 8px;">✓ &nbsp;<strong>15% OFF en tus primeras 3 compras</strong> (exclusivo lista)</p>
    <p style="font-size:15px;color:#333;margin:0 0 8px;">✓ &nbsp;Badge "Miembro Fundador" permanente</p>
    <p style="font-size:15px;color:#333;margin:0 0 24px;">✓ &nbsp;Garantía de devolución completa a 30 días</p>
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
      <a href="https://pianolink.net/welcome-kit" style="background:#c9a84c;color:#0a0a0a;text-decoration:none;padding:16px 40px;border-radius:4px;font-size:18px;font-weight:bold;display:inline-block;">🎹 Quiero mi cupo — $44 USD</a>
    </td></tr></table>
  </td></tr>
  <tr><td bgcolor="#f5f5f0" style="padding:32px 48px;">
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 16px;">Hola {{nombre}},</p>
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 16px;">Llegó el día. Hace meses que trabajo en esto pensando en personas como tú — las que siempre quisieron aprender piano y por alguna razón lo fueron postergando.</p>
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 16px;">Hoy no hay excusas. Desde tu casa, con un profesor real, con tecnología que hace que la clase online se sienta mejor que muchas presenciales.</p>
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 16px;">Si los 88 cupos se agotan hoy, el precio del kit sube a $59 y pierdes el 15% OFF. Te lo digo porque quiero que aproveches lo que construí para ti.</p>
    <p style="font-size:16px;color:#333;margin:0;">Con cariño,<br><strong>Miguel Antonio</strong><br><span style="color:#c9a84c;">Fundador, PianoLink</span></p>
  </td></tr>
  <tr><td bgcolor="#0a0a0a" style="padding:24px 48px;text-align:center;">
    <p style="color:#888;font-size:13px;margin:0 0 12px;">Este precio especial cierra cuando se agoten los 88 cupos.</p>
    <a href="https://pianolink.net/welcome-kit" style="color:#c9a84c;font-size:14px;text-decoration:none;">Reservar ahora →</a>
    <p style="margin:16px 0 0;"><a href="{{unsubscribe_url}}" style="color:#555;font-size:11px;">Cancelar suscripción</a></p>
    <p style="color:#555;font-size:11px;margin:8px 0 0;">© 2026 PianoLink · hola@pianolink.pro</p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`
}
```

---

## TAREA 4 — META PIXEL CENTRALIZADO EN EL CRM

### Panel en el CRM: `/crm/pixel`

Crear sección donde Miguel pueda:
- Configurar Meta Pixel ID (guardado en DB o `.env`)
- Ver qué eventos están configurados por página
- Copiar el snippet generado
- Activar/desactivar el pixel globalmente

### Helper: `/helpers/metaPixel.js`

```javascript
function getPixelSnippet(pixelId, evento = 'PageView', datos = {}) {
  return `
  <script>
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){
    n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};
    if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
    n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;
    s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}
    (window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
    fbq('init', '${pixelId}');
    fbq('track', 'PageView');
    ${evento !== 'PageView' ? `fbq('track', '${evento}', ${JSON.stringify(datos)});` : ''}
  </script>
  <noscript><img height="1" width="1" style="display:none"
    src="https://www.facebook.com/tr?id=${pixelId}&ev=PageView&noscript=1"/></noscript>`;
}
module.exports = { getPixelSnippet };
```

### Eventos por página:

| Página | Evento | Datos |
|--------|--------|-------|
| `/lp/:slug` waitlist | `ViewContent` | `{content_name:'Lista de Espera'}` |
| Submit waitlist | `Lead` | `{}` |
| Landing principal | `ViewContent` | `{content_name:'PianoLink Home'}` |
| Clic "Reservar" | `AddToCart` | `{value:44, currency:'USD'}` |
| `/welcome-kit` | `InitiateCheckout` | `{value:44, currency:'USD'}` |
| Confirmación pago | `Purchase` | `{value:44, currency:'USD'}` |

---

## TAREA 5 — ACTUALIZAR MENÚ/SIDEBAR DEL CRM

Agregar al menú existente las nuevas secciones respetando el diseño visual actual:

```
📊 Dashboard              (ya existe)
👨‍🏫 Pipeline Profesores   (ya existe)
👥 Leads / Contactos      (ya existe)
─────────────────────────
🌐 Landing Pages          (NUEVO) → /crm/landings
📧 Campañas Email         (NUEVO) → /crm/emails
👥 Suscriptores           (NUEVO) → /crm/suscriptores
📊 Meta Pixel             (NUEVO) → /crm/pixel
─────────────────────────
⚙️  Configuración         (ya existe o crear si falta)
```

---

## TAREA 6 — EMAIL TRANSACCIONAL AUTOMÁTICO

Al registrarse en waitlist → enviar inmediatamente por Resend:

**Asunto:** `✅ Estás en la lista — Te avisamos el 29 de marzo`

**Contenido:** Confirmación con nombre, recordatorio de que el 29 de marzo a las 9AM llega el email con el link, mención del 15% OFF exclusivo para la lista. HTML simple, mismo estilo de marca (negro/dorado).

---

## VARIABLES DE ENTORNO FINALES

Agregar al `.env` existente sin borrar las variables actuales:

```env
RESEND_API_KEY=re_xxxxxxxx
EMAIL_FROM=Miguel Antonio <hola@pianolink.pro>
EMAIL_REPLY_TO=hola@pianolink.pro
META_PIXEL_ID=tu_pixel_id_de_meta
SITE_URL=https://pianolink.net
```

---

## CHECKLIST FINAL DEL AGENTE

Antes de terminar, verificar que:

- [ ] El diagnóstico inicial está en `DIAGNOSTICO.md`
- [ ] El CRM existente sigue funcionando exactamente igual
- [ ] Las partes incompletas del CRM original están terminadas y documentadas
- [ ] El menú del CRM muestra las 4 nuevas secciones
- [ ] `/lp/waitlist` es accesible públicamente con countdown y formulario
- [ ] Al registrarse en waitlist: guarda en DB + email de confirmación por Resend
- [ ] Las 3 campañas de email están en el CRM como borradores editables con HTML completo
- [ ] Desde el CRM se puede editar el HTML de cada campaña y previsualizarla en iframe
- [ ] Desde el CRM se puede crear, editar y previsualizar landings
- [ ] El Meta Pixel ID se puede configurar desde el CRM
- [ ] `resend` está en `package.json`
- [ ] `.env.example` actualizado con nuevas variables
- [ ] No hay credenciales expuestas en el código
- [ ] Los webhooks de Resend están preparados para recibir eventos de apertura/click

---

*Prompt V2 — PianoLink CRM · Lanzamiento Día 88 · 29 de marzo de 2026*
*Fundador: Miguel Antonio · hola@pianolink.pro*