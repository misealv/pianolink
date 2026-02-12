# PianoLink CRM — Documento Técnico de Arquitectura

> **Versión:** 3.0  
> **Fecha:** 2026-02-11  
> **Última actualización:** Fase 3 completa — Growth Engine (Meta/Google/GA4 + Attribution + Alertas)
> **Autor:** Equipo de Arquitectura PianoLink  
> **Estado:** Fase 1 ✅ + Fase 2 ✅ + Fase 3 ✅ — Completo

---

## 1. Arquitectura del Sistema

### 1.1. Decisión Arquitectónica: Módulo Interno con Rutas Separadas

**Descartamos** un microservicio independiente o subdominio (`crm.pianolink.com`) porque:
- Render Free solo permite **un servicio web** activo.
- Un segundo servicio duplicaría costos de servidor + base de datos.
- La latencia inter-servicio en Render es innecesariamente alta para el volumen actual.

**Adoptamos: Carpeta-módulo auto-contenida** (`/crm/`) que se monta como un sub-router Express en el servidor principal. Esto da:
- **Independencia lógica:** Modelos, servicios, rutas y vistas propias.
- **Cero impacto en el core:** Si eliminas la carpeta `crm/`, el servidor arranca sin cambios.
- **Migración futura trivial:** Si escalas, mueves la carpeta a su propio repo y la conectas vía API REST.
- **Un solo deploy**, una sola base de datos, una sola factura de Render.

### 1.2. Topología de Comunicación

```
┌──────────────────────────────────────────────────────────────┐
│                      server.js (Express)                      │
│                                                               │
│  ┌─────────────┐    ┌──────────────────────────────────────┐  │
│  │  Core        │    │  CRM Module (/crm)                   │  │
│  │  PianoLink   │    │                                      │  │
│  │              │◄──►│  /api/crm/leads          ✅           │  │
│  │  /api/leads  │    │  /api/crm/campaigns      ✅           │  │
│  │  /api/auth   │    │  /api/crm/interactions   ✅           │  │
│  │  /api/rooms  │    │  /api/crm/conversions    ✅           │  │
│  │  ...         │    │  /api/crm/funnel         ✅           │  │
│  └──────┬───────┘    │  /api/crm/tracking       ✅           │  │
│         │            │  /api/crm/dashboard      ✅           │  │
│         │            │                                      │  │
│         │            │  /api/crm/sequences      ✅           │  │
│         │            │  /api/crm/landings       ✅           │  │
│         │            │  /api/crm/growth         ✅  Fase 3   │  │
│         │            │  /api/crm/webhooks       ✅  Fase 3   │  │
│         │            └──────────┬───────────────────────────┘  │
│         │                       │                              │
│    ┌────▼───────────────────────▼────┐                         │
│    │       MongoDB (misma instancia) │                         │
│    │  ┌─────────────┐  ┌───────────────────┐                   │
│    │  │ users        │  │ crm_leads         │  ✅              │
│    │  │ leads *      │  │ crm_campaigns     │  ✅              │
│    │  │ bookings     │  │ crm_interactions  │  ✅              │
│    │  │ payments     │  │ crm_conversions   │  ✅              │
│    │  │ ...          │  │ crm_sequences     │  ✅              │
│    │  │              │  │ crm_landings      │  ✅              │
│    │  └─────────────┘  └───────────────────┘                   │
│    └─────────────────────────────────┘                         │
└──────────────────────────────────────────────────────────────┘
           │                    │
     ┌─────▼─────┐      ┌──────▼──────────────────┐
     │  Stripe   │      │  APIs Externas           │
     │  PayPal   │      │  - Resend (Email)        │  ✅
     │  MercadoP │      │  - Meta Conversions API  │  ✅ Fase 3
     │           │      │  - Google Ads API         │  ✅ Fase 3
     └───────────┘      │  - Google Analytics 4    │  ✅ Fase 3
                        └──────────────────────────┘
```

### 1.3. Puente Core ↔ CRM

El CRM se comunica con el core a través de un **contrato de eventos internos** (EventService ya existente):

| Evento Core               | Acción CRM (implementada)                        |
|----------------------------|--------------------------------------------------|
| `lead.created`             | Crea CrmLead + CrmConversion(lead_capture) + **auto-enroll secuencias** |
| `lead.statusChanged`       | Mapea status a lifecycle + incrementa score + **auto-enroll secuencias** |
| `booking.created`          | Registra interacción + conversión(demo_scheduled) + score +15 + **auto-enroll** |
| `booking.completed`        | Registra interacción + conversión(first_class) + **auto-enroll** |
| `payment.received`         | Calcula ROI de campaña, actualiza atribución + **auto-enroll** |
| `teacher.created`          | Crea lead tipo teacher como convertido            |

**Estado del cableado (v1.1):**

| Componente | Archivo | Estado |
|------------|---------|--------|
| Router CRM montado en Express | `server.js` → `app.use('/api/crm', require('./crm'))` | ✅ |
| Bridge activado al arrancar | `server.js` → `registerCrmListeners(eventService)` | ✅ |
| `lead.created` emitido | `services/LeadService.js` → `_createNew()` | ✅ |
| `lead.statusChanged` emitido | `services/LeadService.js` → `changeStatus()` | ✅ |
| `booking.created` emitido | `services/BookingService.js` → `bookSlot()` | ✅ |
| `booking.completed` emitido | `services/BookingService.js` → `completeClass()` | ✅ |
| `payment.received` (Stripe) | `services/StripeService.js` → `handleCheckoutCompleted()` | ✅ |
| `payment.received` (MP/PayPal) | `services/PaymentService.js` → `processApprovedPayment()` | ✅ |
| `teacher.created` emitido | `controllers/authController.js` (ya existía) | ✅ |

> **Nota:** ✅ El auto-enroll en secuencias de email está activo (via `CrmBridgeService._tryAutoEnroll()`). ✅ El dispatch inmediato a Meta/Google/GA4 está activo para conversiones de alto valor (via `CrmBridgeService._dispatchConversion()` → `CrmTrackingDispatcher.dispatchImmediate()`).

**No hay imports directos** del CRM hacia controladores del core ni viceversa. Solo se comparten:
- `models/User.js` (lectura de referencia)
- `services/EventService.js` (bus de eventos)
- `middleware/authMiddleware.js` (autenticación)

### 1.4. Capas Internas del Módulo CRM

El módulo sigue una arquitectura de **4 capas**:

```
Routes → Controllers → Services → Models
```

| Capa | Carpeta | Responsabilidad |
|------|---------|----------------|
| **Routes** | `crm/routes/` | Definición de endpoints, middleware de auth |
| **Controllers** | `crm/controllers/` | Validación de input, orquestación, respuesta HTTP |
| **Services** | `crm/services/` | Lógica de negocio, cálculos, queries complejas |
| **Models** | `crm/models/` | Schema Mongoose, statics, índices |

Controllers existentes:
- `crmLeadController.js` — CRUD de leads, scoring, tags, lifecycle
- `crmCampaignController.js` — CRUD de campañas, métricas
- `crmDashboardController.js` — Agregación de datos para KPIs y overview
- `crmFunnelController.js` — Visualización del embudo
- `crmSequenceController.js` — CRUD de secuencias, enroll/unenroll, métricas, duplicar
- `crmLandingController.js` — CRUD de landings, preview, estado, A/B testing
- `crmGrowthController.js` — Attribution dashboard, ROI calculator, alertas, tracking status ✅ Fase 3
- `crmWebhookController.js` — Recepción de webhooks de Meta y Google ✅ Fase 3

Servicios existentes:
- `CrmLeadService.js` — CRUD + scoring + segmentación automática
- `CrmCampaignService.js` — CRUD + métricas calculadas
- `CrmFunnelService.js` — Visualización del embudo multi-touch
- `CrmBridgeService.js` — Puente de eventos core → CRM + auto-enroll + dispatch inmediato a plataformas
- `CrmSequenceService.js` — CRUD + enroll/unenroll + métricas + duplicar
- `CrmSequenceRunner.js` — Motor cron que procesa pasos pendientes (cada 10 min) + inyección de tracking analytics
- `CrmLandingService.js` — CRUD + publicación + form processing + A/B testing + métricas
- `CrmMetaService.js` — Envío de conversiones a Meta Conversions API (server-side) ✅ Fase 3
- `CrmGoogleAdsService.js` — Upload de conversiones offline a Google Ads ✅ Fase 3
- `CrmGA4Service.js` — Eventos server-side vía GA4 Measurement Protocol ✅ Fase 3
- `CrmTrackingDispatcher.js` — Orquestador de despacho a Meta/Google/GA4 (cron cada 15 min) ✅ Fase 3
- `CrmAdsSpendSyncService.js` — Sincronización diaria de gasto publicitario real ✅ Fase 3
- `CrmAlertService.js` — Alertas automáticas de CPA, ROAS, presupuesto ✅ Fase 3
- `CrmAttributionService.js` — Attribution dashboard, ROI calculator, LTV/CAC, tendencias ✅ Fase 3

### 1.5. Internacionalización (i18n) desde Fase 1

Para el caso de José (Escocia) y futuro crecimiento:

- **Zona horaria:** Todos los timestamps se almacenan en **UTC**. El lead tiene campo `timezone` para renderizar en su hora local.
- **Multidivisa:** Los montos de campañas se almacenan en centavos con un `currency` (ISO 4217). Se usa `Intl.NumberFormat` en frontend para display.
- **Locale:** Los emails de secuencia tienen plantillas con tokens `{{locale}}` para contenido multilingüe.

---

## 2. Modelo de Datos (MongoDB)

### 2.1. CrmLead (Extiende el concepto actual de Lead)

El CRM no reemplaza `models/Lead.js` sino que lo **envuelve** con campos avanzados de marketing. El modelo `CrmLead` referencia al Lead original y agrega datos de campañas/atribución.

```javascript
// crm/models/CrmLead.js
{
  leadRef: ObjectId → Lead,        // Referencia al Lead original (required, unique, indexed)
  
  // === SCORING ===
  score: Number,                   // 0-100 (lead scoring automático)
  scoreHistory: [{
    date: Date,
    score: Number,
    reason: String                 // "opened_email", "visited_pricing", etc.
  }],
  
  // === ATRIBUCIÓN ===
  attribution: {
    firstTouch: attributionSchema, // Primera interacción (channel libre, sin enum)
    lastTouch: attributionSchema,  // Última interacción antes de conversión
    touchpoints: [touchpointSchema]
  },

  // === TRACKING IDS ===
  externalIds: {
    fbClickId: String,            // fbclid
    fbBrowserId: String,          // _fbp cookie
    gClientId: String,            // Google Analytics _ga
    gClickId: String,             // gclid
  },
  
  // === SEGMENTACIÓN ===
  tags: [String],                 // ["high-value", "trial-user", "escocia"]
  segment: String,                // enum: "cold", "warm", "hot", "customer", "churned"
  
  // === EMAIL SEQUENCES ===
  activeSequences: [{
    sequenceId: ObjectId → CrmSequence,
    currentStep: Number,
    startedAt: Date,
    pausedAt: Date,
    completedAt: Date,
    status: String                // "active", "paused", "completed", "unsubscribed"
  }],
  
  emailPreferences: {
    unsubscribed: Boolean,
    unsubscribedAt: Date,
    bounced: Boolean,
    bouncedAt: Date
  },
  
  // === INTERNACIONALIZACIÓN ===
  locale: String,                 // "es", "en", "pt"
  currency: String,               // "CLP", "GBP", "USD", "EUR" (ISO 4217)
  timezone: String,               // "America/Santiago" (IANA timezone)
  
  // === LIFECYCLE ===
  lifecycleStage: String,         // enum: "subscriber" → "lead" → "mql" → "sql" → "opportunity" → "customer" → "evangelist"
  convertedAt: Date,
  customerValue: Number,          // Valor total en centavos (LTV)
  
  createdAt: Date,
  updatedAt: Date
}

// touchpointSchema (9 campos):
// channel (enum: meta_ads, google_ads, organic, referral, email, whatsapp, direct, social, other),
// campaignId, timestamp, pageUrl, utmSource, utmMedium, utmCampaign, utmContent, utmTerm

// attributionSchema (12 campos):
// channel (string libre), campaignId, adSetId, adId, utmSource, utmMedium,
// utmCampaign, utmContent, utmTerm, landingPage, referrer, timestamp

// Statics: findByLeadRef(), getSegmentDistribution(), getTopLeads(limit)
// Methods: updateScore(newScore, reason), addTouchpoint(data)
```

### 2.2. CrmCampaign

```javascript
// crm/models/CrmCampaign.js
{
  name: String,                    // "Meta - Profesores Chile - Feb 2026" (max 200)
  platform: String,                // enum: "meta", "google", "email", "organic", "referral", "other"
  status: String,                  // enum: "draft", "active", "paused", "completed", "archived"
  type: String,                    // enum: "acquisition", "retargeting", "nurturing", "brand", "other"
  
  // === TARGETING ===
  targetAudience: String,          // enum: "teachers", "students", "both"
  targetCountries: [String],       // ["CL", "AR", "GB"]
  
  // === IDS EXTERNOS ===
  externalIds: {
    metaCampaignId: String,
    metaAdSetId: String,
    googleCampaignId: String,
  },
  
  // === UTM TRACKING ===
  utmParams: {
    source: String,
    medium: String,
    campaign: String,
    content: String,
    term: String
  },
  
  // === PRESUPUESTO (centavos) ===
  budget: {
    total: Number,                 // Presupuesto total en centavos
    spent: Number,                 // Ya gastado
    currency: String,              // "USD"
    dailyLimit: Number
  },
  
  // === MÉTRICAS (se actualizan vía cron/webhook) ===
  metrics: {
    impressions: Number,
    clicks: Number,
    leads: Number,
    conversions: Number,
    revenue: Number,               // En centavos
    cpl: Number,                   // Costo por lead (centavos)
    cpa: Number,                   // Costo por adquisición (centavos)
    roas: Number                   // Return on Ad Spend (×100, ej: 3.5x = 350)
  },
  
  // === LANDING PAGE ===
  landingPageId: ObjectId → CrmLanding,
  
  startDate: Date,
  endDate: Date,
  createdBy: ObjectId → User,
  notes: String,                   // Notas libres (max 2000 chars)
  createdAt: Date,
  updatedAt: Date
}

// Virtuals: ctr (clicks/impressions×100), leadConversionRate (conversions/leads×100)
// Statics: getActiveSummary(), getSpendByPlatform()
```

### 2.3. CrmInteraction (Event Log)

```javascript
// crm/models/CrmInteraction.js
{
  leadRef: ObjectId → CrmLead,     // required, indexed
  type: String,                    // enum (25 valores):
                                   //   page_view, form_start, form_submit,
                                   //   email_sent, email_open, email_click, email_bounce, email_unsubscribe,
                                   //   demo_scheduled, demo_completed, demo_no_show,
                                   //   booking_created, booking_completed, booking_cancelled,
                                   //   payment_received, subscription_created, subscription_cancelled,
                                   //   call, whatsapp_sent, whatsapp_received,
                                   //   note_added, status_changed, tag_added,
                                   //   ad_click, ad_impression
  
  channel: String,                 // enum: "web", "email", "whatsapp", "phone", "in_app", "ads", "system"
  
  // === CONTEXTO ===
  metadata: {
    pageUrl: String,
    emailSubject: String,
    emailSequenceId: ObjectId,
    emailStepNumber: Number,
    bookingId: ObjectId,
    paymentAmount: Number,         // Centavos
    paymentCurrency: String,
    campaignId: ObjectId → CrmCampaign,
    notes: String,
    duration: Number,              // Duración en segundos (para calls/demos)
    userAgent: String,
    ipHash: String                 // SHA-256 truncado a 16 chars (GDPR)
  },
  
  // === ATRIBUCIÓN ===
  utmParams: {
    source: String,
    medium: String,
    campaign: String
  },
  
  performedBy: ObjectId → User,   // Si fue un admin quien registró
  timestamp: Date,
  createdAt: Date                  // Solo createdAt (updatedAt desactivado)
}

// Índices: { leadRef:1, timestamp:-1 }, { type:1, timestamp:-1 },
//   { metadata.campaignId:1 }, { channel:1 },
//   TTL { timestamp:1 } expireAfterSeconds: 63072000 (730 días)
// Statics: getTimeline(crmLeadId, limit), countByType(start, end), getRecentActivity(hours)
```

### 2.4. CrmConversion

```javascript
// crm/models/CrmConversion.js
{
  leadRef: ObjectId → CrmLead,     // required, indexed
  type: String,                    // enum: "lead_capture", "demo_scheduled", "demo_completed",
                                   //   "first_class", "subscription", "kit_purchase",
                                   //   "class_purchase", "referral"
  
  // === VALOR ===
  value: Number,                   // En centavos
  currency: String,                // "CLP", "USD", "GBP"
  
  // === ATRIBUCIÓN ===
  campaignId: ObjectId → CrmCampaign,
  attribution: {
    model: String,                 // enum: "first_touch", "last_touch", "linear"
    channel: String,
    touchpointCount: Number
  },
  
  // === REFERENCIA AL CORE ===
  coreRef: {
    type: String,                  // "booking", "payment", "subscription"
    id: ObjectId
  },
  
  // === REPORTING A PLATAFORMAS ===
  reportedTo: {
    meta: { sent: Boolean, sentAt: Date, eventId: String },
    google: { sent: Boolean, sentAt: Date, conversionId: String }
  },
  
  timestamp: Date,
  createdAt: Date                  // Solo createdAt (updatedAt desactivado)
}

// Índices: { campaignId:1, timestamp:-1 }, { type:1, timestamp:-1 },
//   { reportedTo.meta.sent:1 }, { reportedTo.google.sent:1 }
// Statics: getTotalValue(start, end, currency), getByType(start, end),
//   getByCampaign(campaignId), getPendingReports(platform)
```

### 2.5. CrmSequence (Secuencias de Email)

```javascript
// crm/models/CrmSequence.js — ✅ IMPLEMENTADO
{
  name: String,                    // "Onboarding Profesores Chile"
  type: String,                    // enum: "onboarding_teacher", "onboarding_student",
                                   //   "nurturing", "reactivation", "post_demo", "custom"
  status: String,                  // enum: "draft", "active", "paused", "archived"
  targetAudience: String,          // enum: "teachers", "students", "all"
  
  steps: [{
    order: Number,
    delayHours: Number,            // Horas después del paso anterior (default 0)
    delayType: String,             // enum: "after_previous", "after_trigger", "specific_time"
    
    action: String,                // enum: "send_email", "wait", "condition", "update_tag", "update_score"
    
    // Para send_email
    email: {
      subject: String,             // Soporta variables: "Hola {{lead.firstName}}"
      bodyHtml: String,            // HTML con variables {{lead.name}}, {{lead.email}}, etc.
      previewText: String          // Texto de preview en inbox
    },
    
    // Para condition (branching)
    condition: {
      field: String,               // "emailOpened", "score", "tag", "segment"
      operator: String,            // enum: "gt", "lt", "eq", "ne", "contains", "not_contains"
      value: Mixed,
      ifTrueStep: Number,          // Ir al paso con order N (-1 = siguiente)
      ifFalseStep: Number          // Ir al paso con order N (-1 = siguiente)
    },
    
    // Para update_tag
    tagAction: {
      action: String,              // "add" | "remove"
      tag: String
    },
    
    // Para update_score
    scoreAction: {
      delta: Number,               // Positivo o negativo
      reason: String
    },
    
    // Métricas del paso (actualizadas por CrmSequenceRunner)
    metrics: {
      sent: Number,
      opened: Number,
      clicked: Number,
      bounced: Number,
      unsubscribed: Number,
      skipped: Number
    }
  }],
  
  // Trigger de activación automática (evaluado por CrmBridgeService._tryAutoEnroll)
  trigger: {
    event: String,                 // enum: "lead.created", "lead.statusChanged",
                                   //   "booking.created", "booking.completed",
                                   //   "payment.received", "manual"
    conditions: {
      leadType: String,            // "teacher", "client", "" (vacío = cualquiera)
      segment: String,             // "cold", "warm", etc.
      tags: [String],              // Lead debe tener TODOS estos tags
      minScore: Number             // Score mínimo requerido
    }
  },
  
  // Estadísticas globales (actualizadas por CrmSequenceService/Runner)
  stats: {
    totalEnrolled: Number,
    totalCompleted: Number,
    totalUnsubscribed: Number
  },
  
  createdBy: ObjectId → User,
  createdAt: Date,
  updatedAt: Date
}

// Variables disponibles en templates:
// {{lead.name}}, {{lead.firstName}}, {{lead.email}}, {{lead.phone}},
// {{lead.type}}, {{lead.score}}, {{lead.segment}}, {{lead.locale}}, {{lead.tags}}

// Statics: getActiveByTrigger(eventName), getMetricsSummary(sequenceId)
```

### 2.6. CrmLanding (Landing Pages Dinámicas)

```javascript
// crm/models/CrmLanding.js
{
  name: String,                    // "Landing Profesores - Chile Q1 2026"
  slug: String,                    // "profesores-chile" → /l/profesores-chile
  status: String,                  // "draft", "published", "archived"
  
  // === CONFIGURACIÓN DE PÁGINA ===
  template: String,                // "teacher_signup", "student_trial", "webinar"
  
  // === CONTENIDO JSON (Plantilla dinámica) ===
  content: {
    hero: {
      headline: String,
      subheadline: String,
      ctaText: String,
      ctaColor: String,
      backgroundImage: String,
      videoUrl: String
    },
    benefits: [{
      icon: String,
      title: String,
      description: String
    }],
    testimonials: [{
      name: String,
      role: String,
      quote: String,
      avatar: String
    }],
    faq: [{
      question: String,
      answer: String
    }],
    form: {
      fields: [{
        name: String,
        type: String,              // "text", "email", "phone", "select", "textarea"
        label: String,
        required: Boolean,
        options: [String]          // Para selects
      }],
      submitText: String,
      successMessage: String,
      redirectUrl: String
    },
    footer: {
      text: String,
      links: [{ label: String, url: String }]
    }
  },
  
  // === TRACKING ===
  campaignId: ObjectId → CrmCampaign,
  utmParams: {
    source: String,
    medium: String,
    campaign: String
  },
  
  // === SEO ===
  seo: {
    title: String,
    description: String,
    ogImage: String
  },
  
  // === MÉTRICAS ===
  metrics: {
    views: Number,
    uniqueVisitors: Number,
    formStarts: Number,
    formSubmissions: Number,
    conversionRate: Number
  },
  
  createdBy: ObjectId → User,
  publishedAt: Date,
  createdAt: Date,
  updatedAt: Date
}
```

### 2.7. Índices Clave

```javascript
// Rendimiento: índices compuestos para queries frecuentes
// === Fase 1 (implementados) ===
CrmLead:       { leadRef: 1 }, { segment: 1, createdAt: -1 }, { 'attribution.firstTouch.channel': 1 }, { lifecycleStage: 1 }, { score: -1 }, { tags: 1 }
CrmCampaign:   { platform: 1, status: 1 }, { 'utmParams.campaign': 1 }
CrmInteraction:{ leadRef: 1, timestamp: -1 }, { type: 1, timestamp: -1 }, { 'metadata.campaignId': 1 }
CrmConversion: { leadRef: 1 }, { campaignId: 1, timestamp: -1 }, { type: 1 }

// === Fase 2 (implementados) ===
CrmSequence:   { status: 1, 'trigger.event': 1 }   ✅ Implementado
CrmLanding:    { slug: 1 }, { status: 1 }           ✅ Implementado
```

### 2.8. Endpoints API Implementados (Fase 1)

#### Leads — `GET/PUT /api/crm/leads` (auth: `protect` + `adminOnly`)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/crm/leads` | Listar leads con filtros |
| GET | `/api/crm/leads/:id` | Detalle de un lead |
| PUT | `/api/crm/leads/:id` | Actualizar lead (full) |
| PUT | `/api/crm/leads/:id/lifecycle` | Cambiar lifecycle stage |
| POST | `/api/crm/leads/:id/score/recalculate` | Recalcular score |
| POST | `/api/crm/leads/:id/score/increment` | Incrementar score |
| POST | `/api/crm/leads/:id/tags/add` | Añadir tags |
| POST | `/api/crm/leads/:id/tags/remove` | Remover tags |
| GET | `/api/crm/leads/:id/timeline` | Timeline de interacciones |
| GET | `/api/crm/leads/analytics/segments` | Distribución por segmento |
| GET | `/api/crm/leads/analytics/lifecycle` | Distribución por lifecycle |
| GET | `/api/crm/leads/analytics/top` | Top leads por score |
| GET | `/api/crm/leads/analytics/channels` | Leads por canal |
| GET | `/api/crm/leads/by-ref/:leadRefId` | Buscar por referencia al Lead original |
| POST | `/api/crm/leads/migrate` | Migrar leads existentes del core |

#### Campañas — `/api/crm/campaigns` (auth: `protect` + `adminOnly`)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/crm/campaigns` | Listar campañas |
| POST | `/api/crm/campaigns` | Crear campaña |
| GET | `/api/crm/campaigns/:id` | Detalle |
| PUT | `/api/crm/campaigns/:id` | Actualizar |
| PATCH | `/api/crm/campaigns/:id/status` | Cambiar solo estado |
| GET | `/api/crm/campaigns/summary` | Resumen de activas |
| GET | `/api/crm/campaigns/spend-by-platform` | Gasto por plataforma |

#### Dashboard — `/api/crm/dashboard`

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| GET | `/api/crm/dashboard/overview` | admin | Datos agregados (KPIs, segmentos, lifecycle, top leads, campañas, conversiones, actividad) |
| GET | `/api/crm/dashboard/quick-stats` | admin | KPIs ligeros para tarjetas (totalLeads, hot, conversiones, revenue, campañas activas) |
| GET | `/api/crm/dashboard/view` | público | Sirve `crm-dashboard.html` |

#### Tracking — `/api/crm/tracking` (**sin auth** — público para frontend)

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/crm/tracking/pageview` | Registrar pageview (`{ crmLeadId?, pageUrl, utmSource?, utmMedium?, utmCampaign? }`) |
| POST | `/api/crm/tracking/event` | Registrar evento custom (`{ crmLeadId, eventType, channel?, metadata? }`) |
| POST | `/api/crm/tracking/identify` | Asociar tracking IDs a lead (`{ crmLeadId, fbclid?, fbp?, gclid?, ga? }`) |

#### Otros (auth: `protect` + `adminOnly`)

| Prefijo | Rutas disponibles |
|---------|-------------------|
| `/api/crm/interactions` | CRUD de interacciones, timeline |
| `/api/crm/conversions` | CRUD de conversiones, aggregations por tipo/valor |
| `/api/crm/funnel` | Visualización de embudo, velocidad de conversión |

#### Secuencias — `/api/crm/sequences` (auth: `protect` + `adminOnly`) ✅ NUEVO

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/crm/sequences` | Listar secuencias con filtros (`?status=active&type=nurturing`) |
| POST | `/api/crm/sequences` | Crear secuencia (siempre en `draft`) |
| GET | `/api/crm/sequences/:id` | Detalle + `enrolledCount` de leads activos |
| PUT | `/api/crm/sequences/:id` | Actualizar (solo si `draft` o `paused`) |
| PATCH | `/api/crm/sequences/:id/status` | Cambiar estado (`draft→active→paused→archived`) |
| DELETE | `/api/crm/sequences/:id` | Eliminar (solo `draft` o `archived`) |
| POST | `/api/crm/sequences/:id/enroll` | Inscribir lead (`{ crmLeadId }`) |
| POST | `/api/crm/sequences/:id/unenroll` | Desinscribir lead (`{ crmLeadId }`) |
| GET | `/api/crm/sequences/:id/leads` | Listar leads inscritos con progreso (`?status=active`) |
| GET | `/api/crm/sequences/:id/metrics` | Métricas agregadas (sent, opened, clicked, etc.) |
| POST | `/api/crm/sequences/:id/duplicate` | Clonar secuencia en `draft` sin leads |

---

## 3. Estrategia de Integración — APIs Externas

### 3.1. Meta Conversions API (Server-Side Tracking)

**¿Por qué server-side?** Los bloqueadores de anuncios y Safari ITP eliminan cookies client-side. El Server-Side Tracking envía conversiones directamente desde tu servidor a Meta, con ~95% de precisión vs ~60% del pixel.

#### Paso a Paso:

1. **Crear un Pixel en Meta Business Manager**
   - Ve a Events Manager → (tu pixel) → Settings.
   - Copia el `PIXEL_ID`.

2. **Generar un Access Token**
   - Events Manager → Settings → "Generate Access Token".
   - Guárdalo como `META_ACCESS_TOKEN` en `.env`.

3. **Implementar el servicio de reporte (⏳ Fase 3)**
   - Se creará `CrmTrackingService.reportToMeta()` para enviar eventos server-side.
   - Actualmente solo existen los endpoints de captura de tracking (`/tracking/pageview`, `/event`, `/identify`).
   - Hashear email y teléfono con SHA-256 antes de enviar (requisito GDPR/Meta).

4. **Eventos a reportar:**

   | Momento PianoLink          | Evento Meta     | Valor |
   |----------------------------|-----------------|-------|
   | Lead capturado             | `Lead`          | 0     |
   | Demo agendada              | `Schedule`      | 0     |
   | Primera clase pagada       | `Purchase`      | monto |
   | Suscripción activada       | `Subscribe`     | monto |
   | Kit de bienvenida comprado | `Purchase`      | monto |

5. **Deduplicación:**  
   Enviar el mismo `event_id` tanto desde el pixel (client) como desde la API (server). Meta deduplica automáticamente.

### 3.2. Google Ads Conversions API

1. **Crear una acción de conversión en Google Ads**
   - Tools → Conversions → New Conversion → Website.
   - Nombrar: "PianoLink - Lead", "PianoLink - Purchase".
   - Copiar la `CONVERSION_ACTION_ID`.

2. **Configurar Google Ads API**
   - Crear proyecto en Google Cloud Console.
   - Habilitar Google Ads API.
   - Crear cuenta de servicio o OAuth2 credentials.
   - Guardar `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`, `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_CUSTOMER_ID`.

3. **Enviar conversiones offline:**
   ```
   POST /api/crm/tracking/google-conversion
   → CrmTrackingService.reportToGoogle()
   → Google Ads API: uploadClickConversions()
   ```

4. **Enhanced Conversions:**  
   Enviar datos hasheados (email, phone) para mejorar la atribución cuando no hay `gclid`.

### 3.3. Google Analytics 4 (Measurement Protocol)

- Enviar eventos server-side vía Measurement Protocol.
- `MEASUREMENT_ID` + `API_SECRET` en `.env`.
- Eventos: `generate_lead`, `begin_checkout`, `purchase`.

---

## 4. Plan de Implementación por Fases

### Fase 1 — MVP (Semanas 1-3) ✅ IMPLEMENTADA

**Objetivo:** Estructura base desacoplada, captura de leads enriquecida, estados del funnel, dashboard CRM autónomo.

| Entregable                  | Estado | Detalle                                                    |
|-----------------------------|--------|------------------------------------------------------------|
| Estructura de carpetas      | ✅     | `/crm/` con models, services, controllers, routes, views   |
| CrmLead model               | ✅     | Scoring, atribución, segmentación, i18n                   |
| CrmCampaign model           | ✅     | Campañas con presupuesto y métricas                       |
| CrmInteraction model        | ✅     | Log de eventos con contexto enriquecido                   |
| CrmConversion model         | ✅     | Conversiones con valor y atribución                       |
| CrmLeadService              | ✅     | CRUD + scoring + segmentación automática                  |
| CrmCampaignService          | ✅     | CRUD + métricas calculadas                                |
| CrmFunnelService            | ✅     | Visualización del embudo multi-touch                      |
| CrmBridgeService            | ✅     | Puente de eventos core → CRM (EventService)               |
| Controllers (5)             | ✅     | Lead, Campaign, Dashboard, Funnel, Sequence                |
| Rutas API (8 sub-routers)   | ✅     | leads, campaigns, interactions, conversions, funnel, tracking, dashboard, sequences |
| Tracking endpoints          | ✅     | pageview, event, identify (públicos, sin auth)             |
| Dashboard HTML              | ✅     | SPA con KPIs, tabla de leads, herramientas de crecimiento  |
| Dashboard JS                | ✅     | Fetch a APIs, tabs, búsqueda, actualización de estados     |
| Migración de leads          | ✅     | Endpoint POST `/api/crm/leads/migrate`                     |
| i18n base                   | ✅     | timezone + currency + locale en cada lead                 |
| CrmTrackingService          | ✅     | Captura local + despacho a Meta/Google/GA4 vía TrackingDispatcher |

### Fase 2 — Marketing Automation (Semanas 4-6)

| Entregable                  | Estado | Detalle                                                    |
|-----------------------------|--------|------------------------------------------------------------|
| CrmSequence model            | ✅     | Secuencias de email con pasos y condiciones               |
| CrmSequenceService           | ✅     | CRUD + enroll/unenroll + métricas + duplicar              |
| CrmSequenceRunner            | ✅     | Motor cron que procesa pasos pendientes cada 10 min       |
| CrmSequenceController        | ✅     | 10 endpoints HTTP bajo `/api/crm/sequences`               |
| Template Engine (inline)     | ✅     | `{{lead.name}}`, `{{lead.firstName}}` etc. en emails      |
| Auto-enroll por trigger      | ✅     | Bridge inscribe leads automáticamente según evento+condiciones |
| Cron job integrado           | ✅     | Job #10 en CronService, cada 10 min UTC                   |
| CrmLanding model             | ✅     | Landing pages dinámicas basadas en JSON + A/B testing  |
| Landing Renderer             | ✅     | GET `/l/:slug` — renderiza landing desde JSON (SSR)     |
| A/B Testing framework        | ✅     | Variaciones de landing con tracking y métricas separadas |
| Email analytics              | ✅     | Tracking de opens (pixel 1x1), clicks (redirect), unsub |

### Fase 3 — Growth Engine (Semanas 7-10) ✅ IMPLEMENTADA

| Entregable                  | Estado | Detalle                                                    |
|-----------------------------|--------|------------------------------------------------------------|
| Meta Conversions API         | ✅     | CrmMetaService — server-side tracking, dedup, SHA-256 PII   |
| Google Ads Offline Conv.     | ✅     | CrmGoogleAdsService — Enhanced Conversions vía API          |
| GA4 Measurement Protocol     | ✅     | CrmGA4Service — eventos server-side, campo reportedTo.ga4  |
| Attribution Dashboard        | ✅     | CrmAttributionService — touchpoints, first/last touch, journey |
| ROI Calculator               | ✅     | ROAS por campaña, CPA, LTV/CAC ratio, rendimiento por plataforma |
| Ads Spend Sync               | ✅     | CrmAdsSpendSyncService — cron diario 04:00 UTC             |
| Alertas automáticas          | ✅     | CrmAlertService — CPA, ROAS, presupuesto, días sin conv. cron 08:00 UTC |
| Webhook receiver             | ✅     | crmWebhookController — Meta (verify+receive) + Google      |
| Tracking Dispatcher          | ✅     | CrmTrackingDispatcher — cron cada 15 min + dispatch inmediato |
| Cron jobs Fase 3             | ✅     | Jobs #11 (dispatch), #12 (ads sync), #13 (alertas) en CronService |
| Bridge → dispatch inmediato  | ✅     | payment.received y booking.completed disparan envío en tiempo real |
| Growth API (14 endpoints)    | ✅     | /api/crm/growth/* — atribución, ROI, tendencias, alertas, tracking |

---

## 5. Riesgos y Mitigaciones

| Riesgo                              | Mitigación                                           |
|--------------------------------------|------------------------------------------------------|
| Sobrecarga de MongoDB                | Índices estratégicos, TTL en interactions antiguas    |
| Render 512MB RAM                     | Lazy loading de servicios CRM, no cargar en workers   |
| Meta API rate limits                 | Cola de eventos con retry exponencial                 |
| GDPR/Privacidad                      | Hashear PII antes de enviar a terceros               |
| Leads existentes sin CrmLead         | Script de migración idempotente                       |

---

## 6. Variables de Entorno Requeridas

```bash
# === CRM MODULE ===
# Meta Conversions API
META_PIXEL_ID=
META_ACCESS_TOKEN=

# Google Ads API
GOOGLE_ADS_CLIENT_ID=
GOOGLE_ADS_CLIENT_SECRET=
GOOGLE_ADS_DEVELOPER_TOKEN=
GOOGLE_ADS_CUSTOMER_ID=
GOOGLE_ADS_REFRESH_TOKEN=

# Google Analytics 4 (Measurement Protocol)
GA4_MEASUREMENT_ID=
GA4_API_SECRET=

# Email (ya configurado - Resend)
# RESEND_API_KEY=...
# EMAIL_FROM=...
```
