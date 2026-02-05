# 🎹 PIANOLINK - ARQUITECTURA COMPLETA DEL NEGOCIO

## Stack Tecnológico

| Capa | Tecnología | ¿Por qué? |
|------|------------|-----------|
| **Backend** | Node.js + Express | Ya lo tienes, funciona bien |
| **Base de Datos** | MongoDB Atlas | Ya configurado, flexible para cambios |
| **Pagos Internacionales** | PayPal + Stripe | PayPal ya integrado, Stripe para tarjetas |
| **Pagos LATAM** | MercadoPago | Ya integrado para AR/CL/MX |
| **Email** | Tu EmailService actual | Ya funciona |
| **Hosting** | Render.com | Ya desplegado |
| **WebSockets** | Socket.io | Ya implementado para clases en vivo |

---

## Esquema de Base de Datos (ERD Simplificado)

```
┌─────────────────┐       ┌──────────────────┐       ┌─────────────────┐
│      LEAD       │──────>│       USER       │<──────│   SUBSCRIPTION  │
│  (Prospectos)   │       │  (Profesores/    │       │  (Pago mensual  │
│                 │       │   Alumnos/       │       │   del alumno)   │
│  type: teacher/ │       │   Clientes)      │       │                 │
│        client   │       │                  │       │  studentId ──┐  │
└─────────────────┘       │  role: admin/    │       │  teacherId ──│  │
                          │        teacher/  │       │  expiresAt   │  │
                          │        student/  │       └──────────────│──┘
                          │        client    │                      │
                          │                  │                      │
                          │  teacherData: {  │       ┌──────────────▼──┐
                          │    earnings,     │       │     PAYMENT      │
                          │    subscription  │       │  (Cada cobro)    │
                          │  }               │       │                  │
                          │                  │       │  subscriptionId  │
                          │  studentData: {  │       │  amount          │
                          │    source,       │       │  status          │
                          │    teacher       │       └──────────────────┘
                          │  }               │
                          └────────┬─────────┘
                                   │
        ┌──────────────────────────┼──────────────────────────┐
        │                          │                          │
        ▼                          ▼                          ▼
┌───────────────┐       ┌──────────────────┐       ┌─────────────────┐
│  WELCOME_KIT  │       │     SESSION      │       │   WITHDRAWAL    │
│  (Onboarding) │       │  (Clase grabada) │       │  (Retiro $$$)   │
│               │       │                  │       │                 │
│  clientId     │       │  teacherId       │       │  teacherId      │
│  shipping {}  │       │  students []     │       │  amount         │
│  setupSession │       │  midiStats       │       │  status         │
│  trialClass   │       │  duration        │       │  paymentMethod  │
│  overallStatus│       │                  │       │                 │
└───────────────┘       └──────────────────┘       └─────────────────┘
                                   │
                                   ▼
                        ┌──────────────────┐
                        │  GLOBAL_CONFIG   │
                        │  (Precios/Config)│
                        │                  │
                        │  regionalPricing │
                        │  policies        │
                        └──────────────────┘
```

---

## Plan de Implementación por Fases

### 🟢 FASE 1: MVP (Ya Tienes ~95%)
**Objetivo:** Profesores pueden dar clases a sus propios alumnos

| Componente | Estado | Acción |
|------------|--------|--------|
| Registro de profesores | ✅ | - |
| Login/Auth | ✅ | - |
| Sala MIDI en vivo | ✅ | - |
| PLB (Piano Learning Bot) | ✅ | - |
| Lead capture | ✅ | - |
| Panel Admin básico | ✅ | - |
| **Suscripción profesor** | ✅ | Stripe integrado (checkout + webhooks) |
| **Landing profesor** | ⚠️ | Falta integrar botón en frontend |

**Entregable:** Profesores pagan $20/mes (o $10 fundadores) y usan la plataforma con sus alumnos.

---

### 🟡 FASE 2: LOGÍSTICA (Welcome Kit)
**Objetivo:** Clientes compran kit, reciben cable, hacen setup

| Tarea | Tiempo Est. | Dependencia |
|-------|-------------|-------------|
| Modelo WelcomeKit | ✅ Creado | - |
| Checkout Welcome Kit | 2 días | PayPal ya integrado |
| Panel "Mi Kit" para cliente | 2 días | - |
| Formulario dirección envío | 1 día | - |
| Integración courier (API) | 3 días | Depende del courier |
| Notificaciones email/WhatsApp | 1 día | EmailService existe |
| Admin: Gestión de envíos | 2 días | - |
| Sesión de Setup (agendar) | 2 días | CalendarService existe |

**Total estimado:** 2 semanas

**Flujo:**
```
Cliente paga Kit → Ingresa dirección → Admin procesa envío
→ Cliente recibe tracking → Confirma recepción → Agenda Setup
→ Setup completado → Desbloquea Clase de Prueba
```

---

### 🟠 FASE 3: MARKETPLACE (Matching + Pagos Recurrentes)
**Objetivo:** Alumnos de plataforma pagan membresía, profesores ganan 80%

| Tarea | Tiempo Est. | Dependencia |
|-------|-------------|-------------|
| Precios regionales | ✅ Creado | - |
| Catálogo de profesores | 3 días | - |
| Filtros (horario, idioma, estilo) | 2 días | - |
| Sistema de matching | 3 días | Algoritmo básico |
| Checkout membresía alumno | 3 días | Stripe Connect |
| Split automático 80/20 | 2 días | Stripe Connect |
| Wallet del profesor | 2 días | Withdrawal model ✅ |
| Solicitud de retiro | 2 días | - |
| Panel financiero profesor | 3 días | - |

**Total estimado:** 3 semanas

**Lógica del Split 80/20:**
```javascript
// Cuando el alumno paga $100 USD membresía
const MEMBERSHIP_AMOUNT = 100;
const PLATFORM_FEE = 0.20;  // 20%
const TEACHER_SHARE = 0.80; // 80%

// Usando Stripe Connect (Recomendado)
const paymentIntent = await stripe.paymentIntents.create({
  amount: MEMBERSHIP_AMOUNT * 100, // Stripe usa centavos
  currency: 'usd',
  application_fee_amount: MEMBERSHIP_AMOUNT * PLATFORM_FEE * 100, // $20 para PianoLink
  transfer_data: {
    destination: teacher.stripeAccountId, // $80 para el profesor
  },
});
```

---

### 🔴 FASE 4: ESCALABILIDAD
**Objetivo:** Automatización total, menos intervención manual

| Tarea | Prioridad |
|-------|-----------|
| Payouts automáticos a profesores | Alta |
| Sistema de reseñas/ratings | Media |
| Grabación de clases (para repaso) | Media |
| App móvil (React Native) | Baja |
| Multi-idioma | Baja |
| Affiliate program | Baja |

---

## Lógica de Pagos Detallada

### Opción A: Stripe Connect (Recomendado para Split)

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   ALUMNO     │────>│   STRIPE     │────>│  PIANOLINK   │
│  paga $100   │     │   CONNECT    │     │  recibe $20  │
└──────────────┘     └──────┬───────┘     └──────────────┘
                           │
                           │ Transfer automático
                           ▼
                    ┌──────────────┐
                    │   PROFESOR   │
                    │  recibe $80  │
                    └──────────────┘
```

**Ventajas:**
- Split automático, no tocas el dinero del profesor
- Cumple regulaciones (no eres un "money transmitter")
- El profesor puede retirar cuando quiera a su cuenta

**Configuración:**
1. Cada profesor crea cuenta Stripe Connect
2. PianoLink es la "plataforma"
3. Los pagos van directo a Stripe, se splitean automáticamente

### Opción B: PayPal + Retiros Manuales (Actual)

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   ALUMNO     │────>│   PAYPAL     │────>│  PIANOLINK   │
│  paga $100   │     │              │     │  recibe $100 │
└──────────────┘     └──────────────┘     └──────┬───────┘
                                                 │
                           Solicitud de retiro   │
                           ◄─────────────────────┤
                                                 │
                    ┌──────────────┐             │
                    │   PROFESOR   │◄────────────┘
                    │  Payout $80  │   (Manual o PayPal Payouts API)
                    └──────────────┘
```

**Desventaja:** Tienes que manejar el dinero del profesor (compliance).

---

## Políticas Sugeridas

### Cancelación de Clases
```
> 24 horas antes  → Reembolso completo / Reagendar gratis
< 24 horas antes  → 50% de penalización
No-show alumno    → Pierde la clase (profesor cobra igual)
No-show profesor  → Clase gratis para el alumno + 1 strike
3 strikes         → Suspensión del profesor
```

### Welcome Kit - Problemas
```
Cable no llega (15+ días) → Reenvío gratis
Cable defectuoso          → Reemplazo gratis
Setup fallido (tech)      → Segunda sesión gratis
Cliente no satisfecho     → Reembolso parcial (sin cable)
```

### Disputas
```
1. Cliente abre disputa en el panel
2. Admin revisa en 48h
3. Resoluciones posibles:
   - Reembolso total
   - Reembolso parcial
   - Crédito para futuras clases
   - Rechazo (con justificación)
```

---

## Próximos Pasos Inmediatos

1. **Hoy:** Ejecutar `node scripts/initRegionalPricing.js` para configurar precios
2. **Esta semana:** Crear checkout del Welcome Kit
3. **Siguiente semana:** Panel "Mi Kit" para clientes
4. **Mes 1:** Integrar Stripe Connect para splits automáticos

---

## Archivos Creados en Esta Sesión

| Archivo | Propósito |
|---------|-----------|
| `models/WelcomeKit.js` | Tracking completo del onboarding |
| `models/Withdrawal.js` | Sistema de retiros para profesores |
| `models/GlobalConfig.js` | (Actualizado) Precios regionales |
| `scripts/initRegionalPricing.js` | Inicializar precios por país |
| `ARCHITECTURE.md` | Este documento |

---

*Documento generado: Febrero 2026*
*Versión: 4.2.0*
