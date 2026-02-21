# Diseño: Sistema de Tracking de Emails — PianoLink CRM

> **Fecha:** 2026-02-21
> **Autor:** Claude Opus 4.6 + Miguel Antonio
> **Estado:** Diseño aprobado, pendiente implementación Fase 1

---

## Problema

Miguel envía emails personales a 6.000+ contactos desde el CRM.
No tiene forma de saber si el email llegó, si lo abrieron, cuántas veces,
si hicieron click, o si rebotó. Necesita esa visibilidad para priorizar
seguimientos y no perder oportunidades.

---

## Infraestructura Existente (al 2026-02-21)

| Componente | Ubicación | Estado |
|---|---|---|
| Servicio de email | `crm/services/CrmResendService.js` | ✅ Funcional (Resend API) |
| Controller envío individual | `crm/controllers/crmSendEmailController.js` | ✅ Creado sesión anterior |
| Ruta envío | `POST /api/crm/send-email` | ✅ Registrada en `crm/index.js` |
| Modal de email frontend | `crm/views/crm-dashboard.html` | ✅ 4 plantillas + auto-detección |
| Modelo CrmInteraction | `crm/models/CrmInteraction.js` | ✅ Ya tiene types: email_sent, email_open, email_click, email_bounce |
| Modelo CrmLead | `crm/models/CrmLead.js` | ✅ Tiene emailPreferences (bounced, unsubscribed) |
| Webhooks existentes | `crm/routes/crmWebhookRoutes.js` | ✅ Meta, Google, Resend inbound |
| Tracking routes | `crm/routes/crmTrackingRoutes.js` | ✅ Pageview, events, identify |
| From address | `hola@pianolink.net` | ✅ Verificado en Resend |
| Deploy | `fly deploy` → `pianolink-v4.fly.dev` | ✅ |

### Dato clave para vinculación

`crmSendEmailController.js` ya guarda `metadata.emailId` (el ID de Resend) en la CrmInteraction al enviar.
Resend devuelve ese mismo ID en los webhooks → **circuito cerrado de tracking**.

---

## Arquitectura Elegida

**Resend Webhooks (fuente primaria) + Tracking de links propio (Fase 2)**

### ¿Por qué no pixel propio?
- Resend ya maneja el pixel de apertura internamente
- Apple Mail Privacy Protection infla aperturas (~40-50% del mercado)
- No vale la pena duplicar esfuerzo

### Eventos de Resend a capturar

| Evento | Tipo en nuestro DB | Confiabilidad |
|---|---|---|
| `email.sent` | `sent` | 100% |
| `email.delivered` | `delivered` | 100% |
| `email.opened` | `opened` | ~60% (Apple infla) |
| `email.clicked` | `clicked` | 95%+ |
| `email.bounced` | `bounced` | 100% |
| `email.complained` | `complained` | 100% |
| `email.delivery_delayed` | `delivery_delayed` | 100% |

---

## Modelo de Datos

### Nueva colección: `email_tracking_events`

**Archivo:** `crm/models/EmailTrackingEvent.js`

```javascript
const emailTrackingEventSchema = new mongoose.Schema({
    // === VINCULACIÓN ===
    crmLead: { type: ObjectId, ref: 'CrmLead', required: true, index: true },
    emailInteractionId: { type: ObjectId, ref: 'CrmInteraction', required: true },
    resendEmailId: { type: String, required: true, index: true },

    // === EVENTO ===
    eventType: {
        type: String,
        enum: ['sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained', 'delivery_delayed'],
        required: true
    },

    // === DATOS DEL EVENTO ===
    recipient: { type: String, required: true },
    clickedUrl: { type: String, default: null },
    bounceType: { type: String, default: null }, // 'hard' | 'soft'
    bounceMessage: { type: String, default: null },

    // === CONTEXTO ===
    userAgent: { type: String, default: '' },
    ipCountry: { type: String, default: '' },

    // === DEBUG ===
    rawEvent: { type: mongoose.Schema.Types.Mixed, default: {} },

    timestamp: { type: Date, default: Date.now }
}, {
    timestamps: false,
    collection: 'email_tracking_events'
});

// Índices
{ crmLead: 1, eventType: 1, timestamp: -1 }
{ resendEmailId: 1, eventType: 1 }
{ timestamp: 1 } // TTL 2 años (63072000s)
```

### Campos nuevos en CrmLead

**Archivo:** `crm/models/CrmLead.js` (agregar después de `emailPreferences`)

```javascript
emailEngagement: {
    totalSent: { type: Number, default: 0 },
    totalDelivered: { type: Number, default: 0 },
    totalOpened: { type: Number, default: 0 },
    totalClicked: { type: Number, default: 0 },
    totalBounced: { type: Number, default: 0 },
    lastSentAt: { type: Date, default: null },
    lastOpenedAt: { type: Date, default: null },
    lastClickedAt: { type: Date, default: null },
    complained: { type: Boolean, default: false },
    engagementLevel: {
        type: String,
        enum: ['none', 'cold', 'warm', 'hot', 'super_hot'],
        default: 'none'
    }
}
```

### Lógica de engagementLevel

| Level | Condición |
|---|---|
| `none` | Nunca se ha enviado email |
| `cold` | Enviado/entregado pero nunca abrió |
| `warm` | Abrió 1 vez |
| `hot` | Abrió 2+ veces |
| `super_hot` | Abrió 3+ veces O hizo click |

---

## Endpoints a Crear

### 1. Webhook Resend Events (sin auth — lo llama Resend)

```
POST /api/crm/webhooks/resend/events
```

**Archivo:** `crm/controllers/crmEmailTrackingController.js`
**Ruta:** agregar en `crm/routes/crmWebhookRoutes.js`

Lógica:
1. Verificar firma HMAC con `svix` (env: `RESEND_WEBHOOK_SECRET`)
2. Si no hay secret, loggear warning pero procesar (dev mode)
3. Parsear body → extraer `email_id` del evento
4. Buscar `CrmInteraction` con `metadata.emailId === email_id`
5. Si no existe → ignorar (email de campaign u otro origen)
6. Obtener `crmLead` desde la interacción
7. Crear `EmailTrackingEvent`
8. Actualizar `CrmLead.emailEngagement` con reglas de scoring:
   - `delivered` → totalDelivered++, level = 'cold' si era 'none'
   - `opened` → totalOpened++, lastOpenedAt = now
     - 1 apertura → level = 'warm', score += 10
     - 2 aperturas → level = 'hot'
     - 3+ aperturas → level = 'super_hot', score += 15
   - `clicked` → totalClicked++, lastClickedAt = now, level = 'super_hot', score += 20
   - `bounced` → totalBounced++, emailPreferences.bounced = true, score -= 10, tag 'email_invalido'
   - `complained` → emailEngagement.complained = true, emailPreferences.unsubscribed = true
9. Score siempre entre 0-100: `Math.min(100, Math.max(0, score))`
10. Responder `200 OK` siempre (Resend reintenta si no)
11. Procesar async si > 5s (fire-and-forget)

### 2. Timeline de emails por lead (con auth admin)

```
GET /api/crm/tracking/email/timeline/:crmLeadId
```

**Archivo:** mismo controller
**Ruta:** agregar en `crm/index.js` o tracking routes

Lógica:
- Buscar `EmailTrackingEvent` del crmLead, sort timestamp desc
- Agrupar por `resendEmailId`
- Retornar timeline

---

## Modificaciones a Archivos Existentes

### crmSendEmailController.js

Al enviar exitosamente, agregar:
1. `crmLead.emailEngagement.totalSent++`
2. `crmLead.emailEngagement.lastSentAt = new Date()`
3. Si `engagementLevel === 'none'` → cambiar a `'cold'`
4. Crear `EmailTrackingEvent` tipo `'sent'` con el `resendEmailId`

### crmWebhookRoutes.js

Agregar línea:
```javascript
const emailTrackingCtrl = require('../controllers/crmEmailTrackingController');
router.post('/resend/events', emailTrackingCtrl.receiveResendEvent);
```

### crm-dashboard.html

1. **Nueva función** `getEmailStatusIndicator(lead)`:

| Estado | Ícono | Estilo |
|---|---|---|
| Sin emails | `—` | gris |
| Enviado | `📨` | azul suave |
| Entregado sin abrir | `✅` | turquesa |
| Abierto 1x | `👁` | amarillo |
| Abierto 2+x | `👁‍🗨` | naranja |
| Abierto 3+x | `🔥` | rojo, animación pulse |
| Click en link | `🔗` | verde |
| Rebotó | `↩️` | rojo, tachado |
| Marcó spam | `⚠️` | gris |

2. **Nueva columna** "📧" en ambas tablas (Piano Calificados + Leads)
3. **Función** `timeAgo(date)` → "hace 2h", "hace 3 días"
4. **CSS** para `.email-status`, `.es-superhot` (pulse animation), `.es-bounce` (line-through)

---

## Sistema de Alertas (Fase 2)

### Regla 1 — No abrió en 3 días
- Crear task automática: "Seguimiento: email no abierto"
- Badge ⏰ en la tabla
- Cron diario 9am Chile

### Regla 2 — Abrió pero no respondió en 48h (PRIORIDAD MÁXIMA)
- `engagementLevel → 'hot'`
- Task urgente: "⚡ ABRIÓ EMAIL — Contactar YA"
- Banner flash rojo en CRM
- Score +10

### Regla 3 — Abrió 3+ veces
- `engagementLevel → 'super_hot'`
- Score +15
- 🔥 pulsando en tabla
- Task: "🔥🔥 SUPER INTERESADO"
- Lead sube al tope de la lista

### Regla 4 — Email rebotó
- `emailPreferences.bounced = true`
- Tag `email_invalido`
- Score -10
- Task: "Email rebotó — buscar otro canal"
- Sugerir WhatsApp si tiene teléfono
- Si no tiene nada: pipeline → `lost`

---

## Dashboard de Métricas (Fase 2)

Bloque `#emailDashboard` arriba de la tabla:

```
📊 Emails esta semana
📤 142 enviados  ✅ 138 entregados  👁 67 abiertos (48.5%)
🔗 12 clicks     ↩️ 4 rebotes      ⚠️ 0 spam

🔥 Leads calientes: 23 abrieron y no respondieron → [Ver lista]
↩️ 4 emails rebotaron → [Limpiar lista]
```

---

## Plan de Implementación

| Fase | Tareas | Complejidad | Estado |
|---|---|---|---|
| **1A** | Modelo `EmailTrackingEvent` | Baja | ⬜ Pendiente |
| **1B** | Campos `emailEngagement` en CrmLead | Baja | ⬜ Pendiente |
| **1C** | Controller webhook Resend events | Media | ⬜ Pendiente |
| **1D** | Registrar ruta webhook | Baja | ⬜ Pendiente |
| **1E** | Actualizar crmSendEmailController | Baja | ⬜ Pendiente |
| **1F** | Indicadores visuales en tablas | Media | ⬜ Pendiente |
| **1G** | Configurar webhook en Resend Dashboard | Manual | ⬜ Pendiente (Miguel) |
| **2A** | Tasks automáticas (reglas 1-4) | Media | ⬜ Fase 2 |
| **2B** | Banner "leads calientes" | Baja | ⬜ Fase 2 |
| **2C** | Dashboard de métricas | Media | ⬜ Fase 2 |
| **2D** | Timeline email en detalle del lead | Alta | ⬜ Fase 2 |
| **3A** | Tracking de links propio (/t/{hash}) | Media | ⬜ Fase 3 |
| **3B** | Cron diario de seguimiento | Baja | ⬜ Fase 3 |

---

## Configuración Manual Requerida (Miguel)

### En Resend Dashboard (resend.com):

1. Ir a **Webhooks** → **Add Endpoint**
2. URL: `https://pianolink-v4.fly.dev/api/crm/webhooks/resend/events`
3. Eventos a suscribir: TODOS
4. Copiar el **Signing Secret** → guardarlo como variable de entorno en Fly:
   ```bash
   fly secrets set RESEND_WEBHOOK_SECRET="whsec_xxxxxxxxxxxxxxxx"
   ```

### Verificar DNS (una vez):
- SPF, DKIM, DMARC configurados para `pianolink.net` en Resend

---

## Privacidad

- **Ley 19.628 (Chile):** No prohíbe tracking de emails. Estamos cubiertos.
- **Link de desuscripción:** Ya existe (`CrmResendService._getUnsubscribeUrl`)
- **List-Unsubscribe header:** Ya implementado en CrmResendService
- **Apple Mail Privacy Protection:** Aceptar inflación de aperturas → clicks son señal más confiable
- **Anti-spam:** No enviar a bounced/complained, mantener bounce rate < 2%, warm up gradual

---

## Prompt Listo para Implementación

El prompt completo para la Fase 1 está en la conversación del 2026-02-21.
Contiene 7 tareas específicas con código, rutas, modelos y CSS.
Buscar: "Implementa el sistema de tracking de emails para el CRM de PianoLink. Esta es la FASE 1"
