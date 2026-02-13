# DIAGNÓSTICO DEL REPO PIANOLINK CRM
## Fecha: 13 de febrero de 2026

---

## 1. Estructura de carpetas

```
pianolink/
├── config/           # Configuración DB
├── controllers/      # Controladores del core
├── crm/              # ← MÓDULO CRM INDEPENDIENTE
│   ├── controllers/  # crmLandingController, crmCampaignController, etc.
│   ├── models/       # CrmLanding, CrmCampaign, CrmLead, CrmSequence, etc.
│   ├── routes/       # Rutas API del CRM
│   ├── services/     # Lógica de negocio
│   └── views/        # landingRenderer.js, crm-dashboard.html
├── middleware/       # authMiddleware.js (protect, adminOnly)
├── models/           # Modelos del core (User, Lead, Booking, etc.)
├── routes/           # Rutas del core
├── services/         # EmailService.js (Resend), StripeService, etc.
├── templates/        # Templates de email
├── server.js         # Punto de entrada principal
└── package.json
```

---

## 2. Framework/Router

- **Framework:** Express.js
- **Puerto:** 3000 (configurable via `PORT` en `.env`)
- **Inicio:** `npm start` → `node server.js`

---

## 3. ORM / Base de Datos

- **ORM:** Mongoose v6.10.0
- **DB:** MongoDB Atlas
- **Conexión:** `MONGO_URI` en `.env`

---

## 4. Motor de Templates

- **Landings públicas:** Renderizado server-side con `landingRenderer.js` (HTML puro, sin EJS/Pug)
- **Dashboard CRM:** HTML estático (`crm-dashboard.html`) + API REST

---

## 5. Tablas/Colecciones Existentes (CRM)

| Colección | Descripción |
|-----------|-------------|
| `crm_landings` | Landing pages dinámicas |
| `crm_campaigns` | Campañas de marketing (ads + email) |
| `crm_leads` | Leads enriquecidos con scoring y atribución |
| `crm_sequences` | Secuencias automatizadas de email |
| `crm_interactions` | Registro de interacciones |
| `crm_conversions` | Conversiones y tracking |

---

## 6. Rutas Definidas

### CRM API (protegidas con `protect, adminOnly`)
- `GET/POST /api/crm/leads` - Gestión de leads
- `GET/POST /api/crm/campaigns` - Campañas
- `GET/POST /api/crm/landings` - Landing pages
- `GET/POST /api/crm/sequences` - Secuencias de email
- `GET /api/crm/dashboard/*` - Dashboard
- `GET /api/crm/funnel/*` - Funnel analytics
- `/api/crm/growth/*` - Growth engine
- `/api/crm/webhooks/*` - Webhooks de tracking

### Rutas Públicas (sin auth)
- `GET /l/:slug` - Renderiza landing pública
- `POST /l/:slug/submit` - Procesa formulario de landing

---

## 7. Middleware de Autenticación

**Archivo:** `middleware/authMiddleware.js`
- `protect` - Verifica JWT token
- `adminOnly` - Requiere rol admin

---

## 8. Sistema de Roles

- ✅ Existe: `User.role` con enum `['user', 'teacher', 'admin']`

---

## 9. Dependencias Críticas (package.json)

| Paquete | Versión | Uso |
|---------|---------|-----|
| express | ^4.22.1 | HTTP server |
| mongoose | ^6.10.0 | MongoDB ORM |
| resend | ^4.8.0 | **Email service ✅** |
| stripe | ^20.3.0 | Pagos |
| socket.io | ^4.8.1 | Real-time MIDI |
| jsonwebtoken | ^8.5.1 | Auth JWT |
| bcryptjs | ^2.4.3 | Hash passwords |

---

## 10. Variables de Entorno Configuradas

```env
# Servidor
PORT, NODE_ENV

# Base de datos
MONGO_URI

# Auth
JWT_SECRET

# Email (Resend) ✅
RESEND_API_KEY
EMAIL_FROM
EMAIL_FROM_NAME

# Pagos
MP_ACCESS_TOKEN, MP_PUBLIC_KEY, MP_WEBHOOK_SECRET
PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET

# Frontend
FRONTEND_URL, CORS_ORIGINS

# Storage
CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
```

### ⚠️ FALTAN (requeridas por el prompt):
```env
META_PIXEL_ID           # Meta Pixel para tracking
EMAIL_REPLY_TO          # Reply-to para emails
SITE_URL                # URL base del sitio
```

---

## 11. ¿Qué está implementado?

### ✅ Completo
- CrmLanding model con A/B testing, métricas, SEO
- Landing renderer server-side
- CrmSequence para automatización de emails
- CrmLead con scoring, atribución, segmentación
- EmailService con Resend integrado
- Webhook routes para tracking (open, click, unsubscribe)
- Auth middleware funcional

### ⚠️ Parcialmente Implementado
- CrmCampaign orientado a ads, no a email marketing
- No hay editor visual de campañas de email en el CRM
- No hay panel de configuración de Meta Pixel

### ❌ Falta Implementar (según prompt)
1. Seed de landing "Waitlist Día 88" con countdown
2. Módulo de campañas de email con editor HTML
3. Seeds de las 3 campañas de lanzamiento
4. Email transaccional automático en waitlist signup
5. Panel de Meta Pixel centralizado
6. Variables de entorno adicionales

---

## 12. PLAN DE IMPLEMENTACIÓN

### FASE 1: Completar funcionalidades existentes
- Revisar TODOs en el código
- Verificar que todas las rutas tienen controladores funcionales

### FASE 2: Modelo y servicio de Email Marketing
- Crear/extender modelo para campañas de email editables
- Crear servicio `resendService.js` con funciones de broadcasting
- Crear controlador y rutas para gestión de campañas

### FASE 3: Landing de Waitlist
- Crear seed de landing "Waitlist Día 88"
- Agregar countdown al 29 de marzo 2026
- Implementar email transaccional de confirmación

### FASE 4: Seeds de Campañas
- Crear las 3 campañas de email como borradores
- Verificar que son editables desde el CRM

### FASE 5: Meta Pixel Centralizado
- Crear ruta `/crm/pixel` para configuración
- Helper para generar snippets
- Integrar en landing renderer

### FASE 6: Actualizar menú del CRM Dashboard
- Agregar nuevas secciones al sidebar

---

*Diagnóstico generado automáticamente - PianoLink CRM*
