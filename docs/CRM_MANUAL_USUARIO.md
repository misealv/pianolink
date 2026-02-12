# Manual de Usuario — CRM PianoLink

> **Versión:** 1.0  
> **Fecha:** 2026-02-11  
> **Audiencia:** Administradores de PianoLink  
> **Requisito:** Rol `admin` para acceder a todas las funciones del CRM

---

## Índice

1. [Introducción](#1-introducción)
2. [Acceso al CRM](#2-acceso-al-crm)
3. [Dashboard — Panel Principal](#3-dashboard--panel-principal)
4. [Gestión de Leads](#4-gestión-de-leads)
5. [Campañas de Marketing](#5-campañas-de-marketing)
6. [Embudo de Conversión (Funnel)](#6-embudo-de-conversión-funnel)
7. [Secuencias de Email](#7-secuencias-de-email)
8. [Landing Pages](#8-landing-pages)
9. [Growth Engine — Atribución y ROI](#9-growth-engine--atribución-y-roi)
10. [Tracking y Píxeles](#10-tracking-y-píxeles)
11. [Alertas Automáticas](#11-alertas-automáticas)
12. [Webhooks Externos](#12-webhooks-externos)
13. [Referencia Rápida de API](#13-referencia-rápida-de-api)
14. [Preguntas Frecuentes](#14-preguntas-frecuentes)

---

## 1. Introducción

El CRM de PianoLink es un módulo integrado al servidor principal que permite:

- **Gestionar leads** con scoring automático y segmentación inteligente.
- **Crear campañas** de marketing con presupuesto, métricas y atribución.
- **Automatizar secuencias** de email con triggers y condiciones.
- **Publicar landing pages** dinámicas con A/B testing.
- **Medir el ROI** con atribución multi-touch (Meta, Google Ads, GA4).
- **Recibir alertas** cuando el CPA sube o el ROAS baja.

El CRM **no reemplaza** el sistema de leads del core de PianoLink. Lo **envuelve**: cada Lead del core genera un CrmLead con datos de marketing avanzados (score, atribución, segmento, secuencias activas).

### Flujo General

```
Lead se registra en PianoLink
        │
        ▼
   Evento "lead.created"
        │
        ▼
  Bridge crea CrmLead automáticamente
  + Asigna score inicial
  + Evalúa triggers de secuencias
  + Si hay campaña asociada, registra touchpoint
        │
        ▼
  El admin ve todo en el Dashboard CRM
```

---

## 2. Acceso al CRM

### 2.1. Dashboard Visual (HTML)

**Requisito:** Debes haber iniciado sesión en PianoLink como admin antes de abrir esta URL (el token se guarda en `localStorage`).

Abre en tu navegador:

```
https://pianolink.net/api/crm/dashboard/view
```

Esto carga la interfaz web (`crm-dashboard.html`) con KPIs, tabla de leads, campañas y herramientas de crecimiento.

### 2.2. API REST

Todas las rutas del CRM están bajo el prefijo:

```
/api/crm/
```

**Autenticación requerida:** Envía el token JWT en el header:

```
Authorization: Bearer <tu-token-jwt>
```

Se requiere rol `admin` en todas las rutas excepto:
- `/api/crm/tracking/*` — Público (para captura desde frontend).
- `/api/crm/webhooks/*` — Público (para Meta/Google).
- `/l/:slug` — Público (landing pages).

---

## 3. Dashboard — Panel Principal

### 3.1. Vista General (Overview)

**Endpoint:** `GET /api/crm/dashboard/overview`

Retorna todos los datos agregados del CRM en una sola llamada:

| Dato | Descripción |
|------|-------------|
| **KPIs** | Total de leads, leads hot, conversiones del periodo, revenue total |
| **Segmentos** | Distribución de leads por segmento (cold, warm, hot, customer, churned) |
| **Lifecycle** | Distribución por etapa del ciclo de vida (subscriber → evangelist) |
| **Top Leads** | Los 10 leads con mayor score |
| **Campañas Activas** | Campañas en estado `active` con métricas |
| **Conversiones Recientes** | Últimas conversiones registradas |
| **Actividad** | Interacciones recientes (últimas 24h) |

### 3.2. KPIs Rápidos

**Endpoint:** `GET /api/crm/dashboard/quick-stats`

Datos ligeros para tarjetas resumen:

```json
{
  "totalLeads": 245,
  "hotLeads": 18,
  "conversionsThisMonth": 32,
  "revenueThisMonth": 1250000,
  "activeCampaigns": 3
}
```

> **Nota:** `revenueThisMonth` está en **centavos**. Dividir por 100 para mostrar en la moneda correspondiente.

---

## 4. Gestión de Leads

### 4.1. Conceptos Clave

#### Lead Score (0-100)

Cada lead tiene un puntaje que se actualiza automáticamente:

| Acción | Puntos |
|--------|--------|
| Lead creado | +10 |
| Abrió email | +5 |
| Hizo clic en email | +10 |
| Visitó página de precios | +15 |
| Agendó demo | +15 |
| Completó clase | +20 |
| Hizo un pago | +25 |

#### Segmentos

| Segmento | Descripción |
|----------|-------------|
| `cold` | Lead nuevo, sin interacciones significativas |
| `warm` | Ha mostrado interés (abrió emails, visitó páginas) |
| `hot` | Alta probabilidad de conversión (agendó demo, score alto) |
| `customer` | Ya realizó al menos un pago |
| `churned` | Cliente que dejó de usar la plataforma |

#### Lifecycle Stages (Ciclo de Vida)

```
subscriber → lead → mql → sql → opportunity → customer → evangelist
```

| Etapa | Significado |
|-------|-------------|
| `subscriber` | Solo se suscribió (newsletter, landing) |
| `lead` | Mostró interés real (formulario, consulta) |
| `mql` | Marketing Qualified Lead — cumple criterios de marketing |
| `sql` | Sales Qualified Lead — listo para contacto directo |
| `opportunity` | En proceso de cierre (demo agendada, presupuesto) |
| `customer` | Pagó |
| `evangelist` | Cliente que refiere a otros |

### 4.2. Listar Leads

**Endpoint:** `GET /api/crm/leads`

**Filtros disponibles (query params):**

| Parámetro | Tipo | Ejemplo | Descripción |
|-----------|------|---------|-------------|
| `segment` | string | `?segment=hot` | Filtrar por segmento |
| `lifecycleStage` | string | `?lifecycleStage=mql` | Filtrar por etapa |
| `tags` | string | `?tags=high-value,chile` | Filtrar por tags (separados por coma) |
| `minScore` | number | `?minScore=50` | Score mínimo |
| `maxScore` | number | `?maxScore=80` | Score máximo |
| `search` | string | `?search=juan` | Buscar por nombre o email |
| `page` | number | `?page=2` | Página (paginación) |
| `limit` | number | `?limit=20` | Resultados por página (default 20) |
| `sort` | string | `?sort=-score` | Ordenar (- = descendente) |

**Ejemplo completo:**

```
GET /api/crm/leads?segment=hot&minScore=60&sort=-score&limit=10
```

### 4.3. Ver Detalle de un Lead

**Endpoint:** `GET /api/crm/leads/:id`

Retorna el CrmLead completo con:
- Score actual e historial de score
- Atribución (first touch, last touch, touchpoints)
- Tags y segmento
- Secuencias activas
- Preferencias de email
- Datos de internacionalización (locale, currency, timezone)

### 4.4. Timeline de un Lead

**Endpoint:** `GET /api/crm/leads/:id/timeline`

Muestra la cronología completa de interacciones del lead:

```json
[
  {
    "type": "email_open",
    "channel": "email",
    "timestamp": "2026-02-10T14:30:00Z",
    "metadata": { "emailSubject": "Bienvenido a PianoLink" }
  },
  {
    "type": "booking_created",
    "channel": "web",
    "timestamp": "2026-02-10T16:00:00Z",
    "metadata": { "bookingId": "..." }
  }
]
```

### 4.5. Actualizar Lead

**Endpoint:** `PUT /api/crm/leads/:id`

Puedes actualizar cualquier campo del CrmLead: tags, segmento, locale, currency, timezone, etc.

### 4.6. Operaciones de Score

| Acción | Endpoint | Body |
|--------|----------|------|
| Recalcular score automáticamente | `POST /api/crm/leads/:id/score/recalculate` | — |
| Incrementar score manualmente | `POST /api/crm/leads/:id/score/increment` | `{ "delta": 10, "reason": "llamada exitosa" }` |

### 4.7. Operaciones de Tags

| Acción | Endpoint | Body |
|--------|----------|------|
| Añadir tags | `POST /api/crm/leads/:id/tags/add` | `{ "tags": ["vip", "chile"] }` |
| Remover tags | `POST /api/crm/leads/:id/tags/remove` | `{ "tags": ["cold-call"] }` |

### 4.8. Cambiar Lifecycle Stage

**Endpoint:** `PUT /api/crm/leads/:id/lifecycle`

```json
{ "lifecycleStage": "sql" }
```

### 4.9. Analytics de Leads

| Endpoint | Descripción |
|----------|-------------|
| `GET /api/crm/leads/analytics/segments` | Distribución por segmento (cold: 45, warm: 30...) |
| `GET /api/crm/leads/analytics/lifecycle` | Distribución por etapa del ciclo de vida |
| `GET /api/crm/leads/analytics/top` | Top leads por score |
| `GET /api/crm/leads/analytics/channels` | Cantidad de leads por canal de adquisición |

### 4.10. Buscar por Referencia al Core

**Endpoint:** `GET /api/crm/leads/by-ref/:leadRefId`

Si tienes el `_id` del Lead original del core, puedes encontrar su CrmLead asociado.

### 4.11. Migrar Leads Existentes

**Endpoint:** `POST /api/crm/leads/migrate`

Crea CrmLeads para todos los leads del core que aún no tengan uno. Es **idempotente**: se puede ejecutar múltiples veces sin duplicar datos.

---

## 5. Campañas de Marketing

### 5.1. Conceptos

Una campaña representa un esfuerzo de marketing con:
- **Plataforma:** Meta, Google, Email, Organic, Referral, Other.
- **Tipo:** Acquisition, Retargeting, Nurturing, Brand, Other.
- **Presupuesto:** En centavos con moneda (USD, CLP, etc.).
- **Métricas:** Impressions, clicks, leads, conversiones, revenue, CPL, CPA, ROAS.
- **UTM Params:** Se asignan automáticamente a los leads que llegan por esta campaña.

#### Estados de una Campaña

```
draft → active → paused → completed
                    ↓
                 archived
```

### 5.2. Crear Campaña

**Endpoint:** `POST /api/crm/campaigns`

```json
{
  "name": "Meta - Profesores Chile - Feb 2026",
  "platform": "meta",
  "status": "draft",
  "type": "acquisition",
  "targetAudience": "teachers",
  "targetCountries": ["CL", "AR"],
  "externalIds": {
    "metaCampaignId": "120210XXXXXX"
  },
  "utmParams": {
    "source": "facebook",
    "medium": "paid",
    "campaign": "profes-chile-feb26"
  },
  "budget": {
    "total": 50000,
    "spent": 0,
    "currency": "USD",
    "dailyLimit": 2000
  },
  "startDate": "2026-02-01",
  "endDate": "2026-02-28",
  "notes": "Campaña de adquisición de profesores en Chile y Argentina"
}
```

> **Importante:** Todos los montos en **centavos**. `50000` = $500.00 USD.

### 5.3. Listar Campañas

**Endpoint:** `GET /api/crm/campaigns`

Filtros: `?status=active&platform=meta`

### 5.4. Actualizar Campaña

**Endpoint:** `PUT /api/crm/campaigns/:id`

### 5.5. Cambiar Estado

**Endpoint:** `PATCH /api/crm/campaigns/:id/status`

```json
{ "status": "active" }
```

### 5.6. Métricas de Campañas

| Endpoint | Descripción |
|----------|-------------|
| `GET /api/crm/campaigns/summary` | Resumen de todas las campañas activas con métricas |
| `GET /api/crm/campaigns/spend-by-platform` | Gasto total agrupado por plataforma |

Las métricas calculadas automáticamente incluyen:
- **CTR** = clicks / impressions × 100
- **CPL** = gasto / leads (costo por lead)
- **CPA** = gasto / conversiones (costo por adquisición)
- **ROAS** = revenue / gasto (retorno sobre inversión publicitaria)

---

## 6. Embudo de Conversión (Funnel)

### 6.1. Qué es

El funnel muestra cuántos leads pasan por cada etapa:

```
Visitantes → Leads → Demos → Primera Clase → Clientes
```

### 6.2. Endpoints del Funnel

**Prefijo:** `/api/crm/funnel`

| Endpoint | Descripción |
|----------|-------------|
| `GET /api/crm/funnel` | Visualización completa del embudo con conteos por etapa |
| `GET /api/crm/funnel/velocity` | Velocidad promedio de conversión entre etapas (en horas/días) |

El funnel es **multi-touch**: considera todos los touchpoints de atribución para calcular por qué canal llegan más leads a cada etapa.

---

## 7. Secuencias de Email

### 7.1. Conceptos

Una secuencia es una serie automatizada de acciones (principalmente emails) que se ejecutan con retrasos programados. Ejemplo:

```
Día 0: Email de bienvenida
        ↓ (esperar 2 días)
Día 2: Email con tips para profesores
        ↓ (esperar 3 días)
Día 5: Condición → ¿Abrió el email anterior?
        ├─ Sí → Email con oferta especial
        └─ No → Email de reenganche
```

#### Tipos de Secuencia

| Tipo | Uso |
|------|-----|
| `onboarding_teacher` | Bienvenida a profesores nuevos |
| `onboarding_student` | Bienvenida a alumnos nuevos |
| `nurturing` | Nutrir leads fríos con contenido |
| `reactivation` | Reactivar leads inactivos |
| `post_demo` | Seguimiento después de una demo |
| `custom` | Personalizada |

#### Estados de una Secuencia

```
draft → active → paused → archived
```

- Solo se pueden **editar** en estado `draft` o `paused`.
- Solo se pueden **eliminar** en estado `draft` o `archived`.
- El cron solo procesa secuencias en estado `active`.

#### Tipos de Pasos

| Acción | Descripción |
|--------|-------------|
| `send_email` | Envía un email con subject y HTML personalizados |
| `wait` | Espera N horas antes de continuar |
| `condition` | Evalúa una condición y salta a paso diferente si es verdadero o falso |
| `update_tag` | Añade o elimina un tag del lead |
| `update_score` | Incrementa o decrementa el score del lead |

### 7.2. Crear Secuencia

**Endpoint:** `POST /api/crm/sequences`

```json
{
  "name": "Onboarding Profesores Chile",
  "type": "onboarding_teacher",
  "targetAudience": "teachers",
  "trigger": {
    "event": "lead.created",
    "conditions": {
      "leadType": "teacher",
      "segment": "",
      "tags": [],
      "minScore": 0
    }
  },
  "steps": [
    {
      "order": 1,
      "delayHours": 0,
      "delayType": "after_trigger",
      "action": "send_email",
      "email": {
        "subject": "¡Bienvenido a PianoLink, {{lead.firstName}}!",
        "bodyHtml": "<h1>Hola {{lead.name}}</h1><p>Gracias por registrarte...</p>",
        "previewText": "Tu plataforma de clases de piano"
      }
    },
    {
      "order": 2,
      "delayHours": 48,
      "delayType": "after_previous",
      "action": "send_email",
      "email": {
        "subject": "3 tips para empezar con PianoLink",
        "bodyHtml": "<h1>{{lead.firstName}}, aquí van 3 tips...</h1>",
        "previewText": "Maximiza tu experiencia"
      }
    },
    {
      "order": 3,
      "delayHours": 72,
      "delayType": "after_previous",
      "action": "condition",
      "condition": {
        "field": "emailOpened",
        "operator": "eq",
        "value": true,
        "ifTrueStep": 4,
        "ifFalseStep": 5
      }
    },
    {
      "order": 4,
      "delayHours": 0,
      "action": "update_score",
      "scoreAction": { "delta": 10, "reason": "Enganchado con onboarding" }
    },
    {
      "order": 5,
      "delayHours": 0,
      "action": "update_tag",
      "tagAction": { "action": "add", "tag": "needs-reactivation" }
    }
  ]
}
```

> La secuencia se crea siempre en estado `draft`. Debes activarla manualmente.

#### Variables Disponibles en Templates

| Variable | Valor |
|----------|-------|
| `{{lead.name}}` | Nombre completo |
| `{{lead.firstName}}` | Primer nombre |
| `{{lead.email}}` | Email |
| `{{lead.phone}}` | Teléfono |
| `{{lead.type}}` | Tipo (teacher/client) |
| `{{lead.score}}` | Score actual |
| `{{lead.segment}}` | Segmento |
| `{{lead.locale}}` | Idioma |
| `{{lead.tags}}` | Tags (lista) |

### 7.3. Activar Secuencia

**Endpoint:** `PATCH /api/crm/sequences/:id/status`

```json
{ "status": "active" }
```

Una vez activa, el **CrmSequenceRunner** (cron cada 10 minutos) procesa los pasos pendientes de todos los leads inscritos.

### 7.4. Auto-Enrollment (Inscripción Automática)

Si defines un `trigger` en la secuencia, el sistema inscribe leads automáticamente cuando ocurre el evento correspondiente:

| Trigger Event | Cuándo se dispara |
|---------------|-------------------|
| `lead.created` | Cuando se registra un lead nuevo |
| `lead.statusChanged` | Cuando cambia el estado de un lead |
| `booking.created` | Cuando se agenda una clase/demo |
| `booking.completed` | Cuando se completa una clase |
| `payment.received` | Cuando se recibe un pago |
| `manual` | Solo inscripción manual (no auto-enroll) |

Las **condiciones** del trigger filtran qué leads se inscriben:
- `leadType`: Solo profesores, solo clientes, o ambos.
- `segment`: Solo leads de un segmento específico.
- `tags`: El lead debe tener TODOS estos tags.
- `minScore`: Score mínimo requerido.

### 7.5. Inscribir/Desinscribir Leads Manualmente

| Acción | Endpoint | Body |
|--------|----------|------|
| Inscribir | `POST /api/crm/sequences/:id/enroll` | `{ "crmLeadId": "..." }` |
| Desinscribir | `POST /api/crm/sequences/:id/unenroll` | `{ "crmLeadId": "..." }` |

### 7.6. Ver Leads Inscritos

**Endpoint:** `GET /api/crm/sequences/:id/leads`

Filtros: `?status=active` (active, paused, completed, unsubscribed)

### 7.7. Métricas de Secuencia

**Endpoint:** `GET /api/crm/sequences/:id/metrics`

```json
{
  "totalEnrolled": 120,
  "totalCompleted": 45,
  "totalUnsubscribed": 3,
  "steps": [
    { "order": 1, "sent": 120, "opened": 78, "clicked": 34, "bounced": 2 },
    { "order": 2, "sent": 98, "opened": 55, "clicked": 20, "bounced": 1 }
  ]
}
```

### 7.8. Duplicar Secuencia

**Endpoint:** `POST /api/crm/sequences/:id/duplicate`

Crea una copia en estado `draft` sin leads inscritos. Útil para crear variaciones.

### 7.9. Email Analytics

El sistema trackea automáticamente:
- **Opens:** Pixel invisible 1×1 en cada email.
- **Clicks:** Links redirigidos a través del servidor para conteo.
- **Unsubscribes:** Link de desuscripción en el footer de cada email.
- **Bounces:** Emails que no se pudieron entregar.

---

## 8. Landing Pages

### 8.1. Conceptos

Las landing pages son páginas web dinámicas que se construyen a partir de un JSON de contenido. No requieren código HTML manual.

Cada landing tiene:
- **Slug:** URL amigable → `https://tu-dominio.com/l/profesores-chile`
- **Template:** Tipo de layout (teacher_signup, student_trial, webinar).
- **Contenido JSON:** Hero, beneficios, testimonios, FAQ, formulario.
- **Campaña asociada:** Para atribución automática.
- **Métricas:** Vistas, visitantes únicos, envíos de formulario, tasa de conversión.

#### Estados

```
draft → published → archived
```

### 8.2. Crear Landing Page

**Endpoint:** `POST /api/crm/landings`

```json
{
  "name": "Landing Profesores - Chile Q1 2026",
  "slug": "profesores-chile",
  "template": "teacher_signup",
  "content": {
    "hero": {
      "headline": "Enseña piano online y gana más",
      "subheadline": "Únete a la plataforma #1 de clases de piano en Latinoamérica",
      "ctaText": "Registrarme Gratis",
      "ctaColor": "#4F46E5",
      "backgroundImage": "https://...",
      "videoUrl": ""
    },
    "benefits": [
      {
        "icon": "🎹",
        "title": "Calendario inteligente",
        "description": "Gestiona horarios y reservas sin esfuerzo"
      },
      {
        "icon": "💰",
        "title": "Cobros automáticos",
        "description": "Stripe, PayPal y MercadoPago integrados"
      }
    ],
    "testimonials": [
      {
        "name": "María González",
        "role": "Profesora de piano",
        "quote": "PianoLink cambió mi negocio por completo",
        "avatar": "https://..."
      }
    ],
    "form": {
      "fields": [
        { "name": "name", "type": "text", "label": "Nombre completo", "required": true },
        { "name": "email", "type": "email", "label": "Email", "required": true },
        { "name": "phone", "type": "phone", "label": "Teléfono", "required": false }
      ],
      "submitText": "¡Quiero empezar!",
      "successMessage": "¡Listo! Revisa tu email para continuar.",
      "redirectUrl": "/gracias"
    }
  },
  "seo": {
    "title": "Enseña Piano Online | PianoLink",
    "description": "Registrate gratis y empieza a dar clases de piano online",
    "ogImage": "https://..."
  },
  "campaignId": "66a1b2c3d4e5f6..."
}
```

### 8.3. Publicar Landing

**Endpoint:** `PATCH /api/crm/landings/:id/status`

```json
{ "status": "published" }
```

Una vez publicada, es accesible en:

```
https://tu-dominio.com/l/profesores-chile
```

### 8.4. A/B Testing

El sistema soporta variaciones de landing pages. Puedes crear múltiples versiones de una landing y el sistema distribuye el tráfico entre ellas, trackeando métricas por variación para determinar cuál convierte mejor.

### 8.5. Métricas de Landing

Las métricas se actualizan en tiempo real:

| Métrica | Descripción |
|---------|-------------|
| `views` | Total de vistas de la página |
| `uniqueVisitors` | Visitantes únicos |
| `formStarts` | Cuántos empezaron a llenar el formulario |
| `formSubmissions` | Cuántos enviaron el formulario |
| `conversionRate` | formSubmissions / uniqueVisitors × 100 |

---

## 9. Growth Engine — Atribución y ROI

### 9.1. ¿Qué es?

El Growth Engine es el módulo de Fase 3 que conecta el CRM con Meta Ads, Google Ads y Google Analytics 4 para:

1. **Enviar conversiones** a las plataformas (server-side tracking).
2. **Sincronizar gasto** publicitario real.
3. **Calcular ROI** con atribución multi-touch.
4. **Alertar** cuando las métricas salen de rango.

### 9.2. Attribution Dashboard

#### Touchpoints por Canal

**Endpoint:** `GET /api/crm/growth/attribution/touchpoints`

Muestra cuántos touchpoints hay por canal (meta_ads, google_ads, organic, email, etc.).

#### Comparación First Touch vs Last Touch

**Endpoint:** `GET /api/crm/growth/attribution/comparison`

Compara qué canal es mejor para **iniciar** el journey (first touch) vs cuál cierra la **conversión** (last touch).

#### Journey de un Lead

**Endpoint:** `GET /api/crm/growth/attribution/journey/:crmLeadId`

Muestra todos los touchpoints de un lead en orden cronológico.

### 9.3. ROI Calculator

#### ROAS por Campaña

**Endpoint:** `GET /api/crm/growth/roi/roas`

```json
[
  {
    "campaignId": "...",
    "name": "Meta - Profesores Chile",
    "spent": 50000,
    "revenue": 175000,
    "roas": 3.5
  }
]
```

> Un ROAS de 3.5 significa que por cada $1 gastado, se generan $3.50 de ingreso.

#### LTV / CAC

**Endpoint:** `GET /api/crm/growth/roi/ltv-cac`

```json
{
  "avgLTV": 45000,
  "avgCAC": 12500,
  "ltvCacRatio": 3.6
}
```

> Ratio LTV/CAC ideal: **> 3**. Significa que el valor de vida del cliente es 3× lo que cuesta adquirirlo.

#### Rendimiento por Plataforma

**Endpoint:** `GET /api/crm/growth/roi/platforms`

Compara Meta vs Google vs Email vs Organic en términos de gasto, leads generados, conversiones y ROAS.

### 9.4. Tendencias

| Endpoint | Descripción |
|----------|-------------|
| `GET /api/crm/growth/trends/conversions` | Tendencia de conversiones en el tiempo (diario/semanal) |
| `GET /api/crm/growth/trends/velocity` | Velocidad del funnel — cuánto tarda un lead en pasar de una etapa a otra |

### 9.5. Tracking Status

**Endpoint:** `GET /api/crm/growth/tracking/status`

Muestra el estado de conexión con cada plataforma:

```json
{
  "meta": { "configured": true, "lastDispatch": "2026-02-11T08:15:00Z", "pendingEvents": 3 },
  "google": { "configured": true, "lastDispatch": "2026-02-11T08:15:00Z", "pendingEvents": 1 },
  "ga4": { "configured": true, "lastDispatch": "2026-02-11T08:15:00Z", "pendingEvents": 0 }
}
```

### 9.6. Dispatch Manual

**Endpoint:** `POST /api/crm/growth/tracking/dispatch-now`

Fuerza el envío inmediato de conversiones pendientes a Meta/Google/GA4. Normalmente el cron las envía cada 15 minutos.

### 9.7. Sincronización de Gasto de Ads

**Endpoint:** `POST /api/crm/growth/ads-sync/run`

Ejecuta la sincronización manual de gasto publicitario. Normalmente el cron lo hace diariamente a las 04:00 UTC.

---

## 10. Tracking y Píxeles

### 10.1. Endpoints Públicos

Estos endpoints **no requieren autenticación** y están diseñados para ser llamados desde el frontend:

#### Registrar Pageview

**Endpoint:** `POST /api/crm/tracking/pageview`

```json
{
  "crmLeadId": "...",
  "pageUrl": "/pricing",
  "utmSource": "facebook",
  "utmMedium": "paid",
  "utmCampaign": "profes-chile"
}
```

> `crmLeadId` es opcional. Si no se envía, se registra como visitante anónimo.

#### Registrar Evento Custom

**Endpoint:** `POST /api/crm/tracking/event`

```json
{
  "crmLeadId": "...",
  "eventType": "form_start",
  "channel": "web",
  "metadata": { "formName": "contacto" }
}
```

#### Identificar Lead (Asociar Tracking IDs)

**Endpoint:** `POST /api/crm/tracking/identify`

```json
{
  "crmLeadId": "...",
  "fbclid": "AbC123...",
  "fbp": "fb.1.1234567890.987654321",
  "gclid": "EAIaIQobChMI...",
  "ga": "GA1.2.1234567890.1234567890"
}
```

Esto asocia los IDs de tracking de Meta y Google al lead para mejorar la atribución.

### 10.2. Flujo de Tracking Recomendado

```
1. Usuario llega a landing → POST /tracking/pageview (con UTMs de la URL)
2. Usuario empieza formulario → POST /tracking/event (form_start)
3. Usuario envía formulario → Se crea Lead en core → Bridge crea CrmLead
4. Frontend identifica al lead → POST /tracking/identify (con fbclid, gclid, etc.)
5. CrmLead ya tiene atribución completa → Meta/Google reciben la conversión
```

---

## 11. Alertas Automáticas

### 11.1. ¿Cómo funcionan?

El `CrmAlertService` evalúa métricas cada día a las 08:00 UTC y genera alertas cuando:

| Alerta | Condición |
|--------|-----------|
| **CPA Alto** | El costo por adquisición supera el umbral configurado |
| **ROAS Bajo** | El retorno sobre inversión publicitaria cae por debajo del mínimo |
| **Presupuesto Agotado** | Una campaña ha gastado más del 90% de su presupuesto |
| **Sin Conversiones** | Una campaña activa lleva X días sin conversiones |

### 11.2. Consultar Alertas

**Endpoint:** `GET /api/crm/growth/alerts`

```json
[
  {
    "type": "high_cpa",
    "severity": "warning",
    "message": "CPA de 'Meta - Profesores Chile' es $25.00, supera el umbral de $20.00",
    "campaignId": "...",
    "value": 2500,
    "threshold": 2000,
    "createdAt": "2026-02-11T08:00:00Z"
  }
]
```

### 11.3. Ver Umbrales Configurados

**Endpoint:** `GET /api/crm/growth/alerts/thresholds`

---

## 12. Webhooks Externos

### 12.1. Meta Webhooks

**Verificación:** `GET /api/crm/webhooks/meta`

Meta envía un challenge para verificar la URL. El sistema responde automáticamente.

**Recepción:** `POST /api/crm/webhooks/meta`

Recibe eventos de Meta (leads de formularios, etc.) y los procesa automáticamente.

### 12.2. Google Webhooks

**Recepción:** `POST /api/crm/webhooks/google`

Recibe notificaciones de Google Ads.

---

## 13. Referencia Rápida de API

### Todas las rutas del CRM

| Prefijo | Módulo | Auth |
|---------|--------|------|
| `/api/crm/leads` | Gestión de leads | Admin |
| `/api/crm/campaigns` | Campañas de marketing | Admin |
| `/api/crm/interactions` | Log de interacciones | Admin |
| `/api/crm/conversions` | Registro de conversiones | Admin |
| `/api/crm/funnel` | Embudo de ventas | Admin |
| `/api/crm/sequences` | Secuencias de email | Admin |
| `/api/crm/landings` | Landing pages (admin) | Admin |
| `/api/crm/dashboard` | Dashboard y KPIs | Admin (excepto /view) |
| `/api/crm/growth` | Atribución, ROI, alertas | Admin |
| `/api/crm/tracking` | Tracking de eventos | **Público** |
| `/api/crm/webhooks` | Webhooks externos | **Público** |
| `/l/:slug` | Landing pages (públicas) | **Público** |

### Cron Jobs del CRM

| Job | Frecuencia | Servicio | Descripción |
|-----|-----------|----------|-------------|
| #10 | Cada 10 min | CrmSequenceRunner | Procesa pasos pendientes de secuencias activas |
| #11 | Cada 15 min | CrmTrackingDispatcher | Envía conversiones pendientes a Meta/Google/GA4 |
| #12 | Diario 04:00 UTC | CrmAdsSpendSyncService | Sincroniza gasto real desde Meta/Google Ads |
| #13 | Diario 08:00 UTC | CrmAlertService | Evalúa métricas y genera alertas de CPA/ROAS |

### Variables de Entorno

```bash
# Meta Conversions API
META_PIXEL_ID=tu_pixel_id
META_ACCESS_TOKEN=tu_access_token

# Google Ads API
GOOGLE_ADS_CLIENT_ID=...
GOOGLE_ADS_CLIENT_SECRET=...
GOOGLE_ADS_DEVELOPER_TOKEN=...
GOOGLE_ADS_CUSTOMER_ID=...
GOOGLE_ADS_REFRESH_TOKEN=...

# Google Analytics 4
GA4_MEASUREMENT_ID=G-XXXXXXXXXX
GA4_API_SECRET=...
```

---

## 14. Preguntas Frecuentes

### ¿El CRM reemplaza el sistema de leads del core?

**No.** El CRM envuelve al lead original con datos de marketing. El `CrmLead` tiene una referencia (`leadRef`) al `Lead` del core. Ambos coexisten.

### ¿Qué pasa si borro la carpeta `/crm/`?

El servidor arranca sin cambios. El CRM es un módulo completamente desacoplado.

### ¿Los montos están en pesos o dólares?

En **centavos**, con campo `currency` (ISO 4217). Si `currency = "CLP"` y `value = 1500000`, son $15.000 CLP. Si `currency = "USD"` y `value = 5000`, son $50.00 USD.

### ¿Qué pasa si un lead se desuscribe?

Se marca `emailPreferences.unsubscribed = true` y ya no recibe emails de ninguna secuencia. Se registra una interacción `email_unsubscribe`.

### ¿Cómo configuro Meta Conversions API?

1. Ve a Meta Events Manager → Tu Pixel → Settings.
2. Copia el `PIXEL_ID`.
3. Genera un Access Token en la misma sección.
4. Añade `META_PIXEL_ID` y `META_ACCESS_TOKEN` a tu `.env`.
5. Configura el webhook URL en Meta: `https://tu-dominio.com/api/crm/webhooks/meta`.

### ¿Cómo configuro Google Ads?

1. Crea proyecto en Google Cloud Console.
2. Habilita Google Ads API.
3. Crea credenciales OAuth2.
4. Crea acciones de conversión en Google Ads (Tools → Conversions).
5. Añade las variables `GOOGLE_ADS_*` a tu `.env`.

### ¿Las interacciones se borran?

Sí, tienen un **TTL de 730 días** (2 años). Después se eliminan automáticamente de MongoDB.

### ¿Cómo migro leads que ya existían antes del CRM?

Ejecuta:
```
POST /api/crm/leads/migrate
```
Es idempotente: puedes ejecutarlo varias veces sin riesgo de duplicados.

### ¿Puedo usar el CRM sin Meta/Google?

Sí. Las integraciones con Meta, Google Ads y GA4 son opcionales. Si no configuras las variables de entorno, el CRM funciona normalmente sin enviar datos a plataformas externas.

---

> **Fin del manual.** Para detalles técnicos de implementación, consulta [CRM_MODULE_ARCHITECTURE.md](CRM_MODULE_ARCHITECTURE.md).
