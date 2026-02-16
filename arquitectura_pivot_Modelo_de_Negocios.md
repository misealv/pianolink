# Arquitectura Pivot — Modelo de Negocios PianoLink v5.0

> "Nosotros conseguimos los alumnos, tú solo enseñas."

**Fecha:** Febrero 2026  
**Versión:** 5.0  
**Estado:** Propuesta pendiente de aprobación  

---

## Índice

1. [Resumen Ejecutivo](#1-resumen-ejecutivo)
2. [Extensión del Modelado de Datos](#2-extensión-del-modelado-de-datos)
3. [Arquitectura Multi-país y Split de Mercado Pago](#3-arquitectura-multi-país-y-split-de-mercado-pago)
4. [Lógica de Asignación y Permisos](#4-lógica-de-asignación-y-permisos)
5. [Roadmap de Actualización en Fases](#5-roadmap-de-actualización-en-fases)
6. [Matriz de Riesgos](#6-matriz-de-riesgos)

---

## 1. Resumen Ejecutivo

### 1.1 Modelo Actual vs. Modelo Nuevo

| Aspecto | Actual | Nuevo |
|---------|--------|-------|
| Niveles de profesor | 2 (trial, active/founder) | 3 (free, premium, founder) |
| Comisión plataforma | 20% fija | 25% / 15% / 0% según plan y origen del alumno |
| Invitación de alumnos propios | Sin restricción | **Bloqueado** en plan Free; permitido en Premium/Founder |
| Precio membresía profesor | $20 USD (regular), $10 USD (founder) | **$0** (free), **$19 USD** (premium), **$10 USD** (founder) |
| MercadoPago | 1 set de credenciales (Chile) | MercadoPago en 7 países LATAM (cobros + payouts) + PayPal para Europa y resto del mundo |

### 1.2 Tabla de Planes

| | Sin Costo (Free) | Membresía ($19/mes) | Fundador ($10/mes de por vida) |
|---|---|---|---|
| Comisión por venta (alumnos plataforma) | PianoLink 25% / Profesor 75% | PianoLink 15% / Profesor 85% | PianoLink 15% / Profesor 85% |
| Invitar alumnos particulares | ❌ Bloqueado | ✅ Permitido (0% comisión PL) | ✅ Permitido (0% comisión PL) |
| Prioridad en asignación de alumnos | Normal (cola FIFO) | **Prioritaria** (se les asigna primero) | **Prioritaria** (se les asigna primero) |
| Cupos disponibles | Ilimitados | Ilimitados | Sin cambios (gestión existente) |

---

## 2. Extensión del Modelado de Datos

### 2.1 Cambios al Modelo `User` (models/User.js)

Se añaden campos **dentro del subdocumento `teacherData`** existente. No se crea una nueva colección.

#### Nuevos campos en `teacherData`:

```
teacherData: {
    // --- CAMPOS EXISTENTES (sin cambios) ---
    subscriptionStatus         // Se mantiene: 'trial' | 'active' | 'expired' | 'cancelled' | 'past_due'
    subscriptionExpiresAt      // Se mantiene
    stripeCustomerId           // Se mantiene (congelado — Stripe se activará en el futuro, ver nota abajo)
    stripeSubscriptionId       // Se mantiene (congelado)
    commissionPercent          // DEPRECAR → reemplazar por lógica dinámica según plan
    
    // ==================== CAMPOS NUEVOS ====================
    
    // Plan del profesor (REEMPLAZA la lógica binaria actual trial/active)
    plan: {
        type: String,
        enum: ['free', 'premium', 'founder'],
        default: 'free'
    },
    
    // Fecha de inicio del plan de pago
    planActivatedAt: Date,
    
    // ID de suscripción recurrente para el cobro mensual de la membresía del PROFESOR
    mpSubscriptionId: String,          // Si paga con MercadoPago
    paypalSubscriptionId: String,      // Si paga con PayPal (países sin MP / Europa)
    
    // Proveedor de pago de la membresía del profesor
    membershipPaymentProvider: {
        type: String,
        enum: ['mercadopago', 'paypal'],
        default: 'mercadopago'
    },
    
    // ==================== FEATURE FLAGS (Permisos) ====================
    permissions: {
        canInvitePrivateStudents: {
            type: Boolean,
            default: false    // Solo true para premium y founder
        },
        hasPriorityQueue: {
            type: Boolean,
            default: false    // Solo true para premium y founder
        },
        maxActiveStudents: {
            type: Number,
            default: -1       // -1 = ilimitado (para futuras restricciones si se necesitan)
        }
    }
}
```

**Regla de sincronización:** Estos `permissions` se calculan SIEMPRE a partir del campo `plan`. Nunca se editan manualmente. Un Service Object (`PlanPermissionService`) los recalcula al activar/desactivar plan.

#### Campo `country` a nivel de usuario raíz:

El campo `country` YA EXISTE en el modelo `User` (línea 10: `country: { type: String, default: '' }`), pero está vacío para la mayoría de los usuarios. Se necesita:

```
// Campos existentes a ENRIQUECER (no añadir):
country: String              // YA EXISTE — hacerlo required para teachers en registro
                              // Formato: código ISO 3166-1 alpha-2 (CL, MX, AR, CO, ES, US...)

// NO se almacena countryData en el User. Los datos derivados (currency, mpAvailable, timezone)
// se resuelven en RUNTIME desde la colección MpCredentials + lookup estático.
// Esto evita desincronización si se activa un país nuevo en MP.
```

> **Nota:** `teacherData.paymentInfo.country` ya existe (línea 83 del modelo actual). Se debe mantener sincronizado con el `country` raíz para evitar discrepancias.
>
> **Dato derivado:** Para saber si un profesor tiene MP disponible: `MpCredentials.findOne({ countryCode: user.country, isActive: true })`. Para obtener la moneda: mismo lookup. No se duplica en el documento del usuario.

---

> **Nota sobre Fundadores:** La gestión de profesores fundadores (`isFounder`, `isFoundingMember`) ya existe en el sistema actual y **no se modifica**. El campo `plan: 'founder'` en el nuevo enum simplemente se sincroniza con el flag `isFounder` existente durante la migración.

> **Nota sobre Stripe:** Los campos `stripeCustomerId` y `stripeSubscriptionId` se **mantienen congelados**. Chile no está entre los países soportados por Stripe, por lo que no se puede usar hasta crear una entidad legal en un país compatible (ej: USA, México). Mientras tanto, **MP + PayPal cubren todos los flujos**. Cuando Stripe se active en el futuro, se podrá agregar como tercer proveedor en `PaymentProviderResolver` sin cambios estructurales. No se elimina código de `StripeService.js` — se deja inactivo.

---

### 2.2 Extensión del Modelo `GlobalConfig` (models/GlobalConfig.js)

Actualizar el subdocumento `memberships.teacherSubscription` existente:

```
memberships: {
    // REEMPLAZAR teacherSubscription actual:
    teacherPlans: {
        free: {
            price: 0,
            currency: 'USD',
            platformCommission: 25,      // % que retiene PianoLink por alumno de plataforma  
            teacherCommission: 75,       // % que gana el profesor
            privateStudentCommission: 0   // N/A — no puede invitar alumnos
        },
        premium: {
            price: 1900,                 // Centavos USD ($19.00)
            currency: 'USD',
            platformCommission: 15,
            teacherCommission: 85,
            privateStudentCommission: 0   // 0% comisión por alumnos propios
        },
        founder: {
            price: 1000,                 // Centavos USD ($10.00)
            currency: 'USD',
            platformCommission: 15,
            teacherCommission: 85,
            privateStudentCommission: 0
        }
    },
    
    // Se mantienen los demás campos existentes...
    studentMembership: [/* sin cambios */],
    trialClassPayment: {/* sin cambios */},

    // NUEVO: Oferta para Madrugadores (upsell post-waitlist)
    earlyBirdOffer: {
        enabled: true,                    // Admin puede activar/desactivar desde admin.html
        welcomeKitPriceUSD: 2900,         // Centavos USD ($29.00) — precio especial vs. $44 normal
        welcomeKitRegularPriceUSD: 4400,  // Centavos USD ($44.00) — se muestra tachado como referencia
        headline: '¡Oferta exclusiva para madrugadores!',
        subtitle: 'Por registrarte hoy, accede al Welcome Kit con descuento único',
        ctaText: 'Comprar Welcome Kit — $29 USD',
        expiresAfterMinutes: 30           // Tiempo límite del countdown (0 = sin límite)
    }
}
```

---

### 2.3 Extensión del Modelo `StudentEnrollment` / `Enrollment`

Añadir campo para distinguir origen del alumno y aplicar comisión correcta:

```
// Campos nuevos en Enrollment:
source: {
    type: String,
    enum: ['platform', 'private_invite'],   // plataforma vs. invitado por profesor
    default: 'platform'
},

// Código de invitación usado (si aplica)
inviteCode: String,

// Comisión aplicada en esta relación (se calcula al crear enrollment)
appliedCommission: {
    platformPercent: Number,    // 25, 15, o 0
    teacherPercent: Number,     // 75, 85, o 100
    reason: String              // 'free_plan_platform', 'premium_plan_platform', 'premium_private_invite'
}
```

---

### 2.4 Nueva Colección: `TeacherInvite`

Para gestionar los enlaces de invitación de alumnos particulares (solo Premium/Founder).

```
Colección: teacher_invites

{
    _id: ObjectId,
    teacherId: ObjectId,          // Ref → User (quien invita)
    code: String,                 // Código único (ej: 'prof-maria-xyz123')
    type: 'private_student',      // Tipo de invitación
    status: 'active',             // 'active' | 'used' | 'expired' | 'revoked'
    usedBy: ObjectId,             // Ref → User (alumno que usó el código)
    usedAt: Date,
    expiresAt: Date,              // Vencimiento del enlace (ej: 7 días)
    createdAt: Date
}

// Índices:
// { code: 1 } unique
// { teacherId: 1, status: 1 }
// { expiresAt: 1 } TTL index
```

---

### 2.5 Diagrama Entidad-Relación Actualizado

```
┌──────────────────────┐
│        USER          │
│  (teacher/student)   │
│                      │
│  country ────────────┼──────────────────────────────┐
│  (datos derivados    │  ← currency, mpAvailable se  │
│   de MpCredentials)  │    resuelven en runtime      │
│                      │                              │
│  teacherData: {      │       ┌──────────────────┐   │
│    plan              │       │  TEACHER_INVITE  │   │
│    permissions {}    │       │  code, status    │   │
│    mpSubscriptionId  │       │  teacherId       │   │
│  }                   │       └──────────────────┘   │
│                      │                              │
│  studentData: {      │                              │
│    source            │                              │
│    assignedTeacher   │                              │
│  }                   │                              │
└──────────┬───────────┘                              │
           │                                          │
    ┌──────┴──────┐       ┌───────────────────┐       │
    │ ENROLLMENT  │       │   GLOBAL_CONFIG   │       │
    │ source      │       │   teacherPlans:   │       │
    │ inviteCode  │       │     free {}       │       │
    │ applied     │       │     premium {}    │       │
    │ Commission  │       │     founder {}    │       │
    └──────┬──────┘       └───────────────────┘       │
           │                                          │
    ┌──────┴──────┐       ┌───────────────────┐       │
    │ SUBSCRIPTION│       │  MP_CREDENTIALS   │◄──────┘
    │ (alumno →   │       │  (por país)       │
    │  profesor)  │       │  countryCode      │
    └─────────────┘       │  accessToken      │
                          │  publicKey        │
                          └───────────────────┘
```

---

## 3. Arquitectura Multi-país y Split de Mercado Pago

### 3.1 Problema Actual

El sistema usa **un solo `MP_ACCESS_TOKEN`** en variables de entorno (verificado en `MercadoPagoTransferService.js`, línea 19). Esta credencial pertenece a una cuenta de MercadoPago Chile. Cuando un profesor en México intenta operar, falla porque:

1. Las credenciales de MP Chile no pueden crear preferencias en pesos mexicanos.
2. El `currency` por defecto es `'ARS'` en el modelo `Subscription` (línea 73).
3. No existe lógica para seleccionar credenciales según país.

### 3.2 Diseño: Registro de Credenciales Multi-país

#### Nueva Colección: `MpCredentials`

```
Colección: mp_credentials

{
    _id: ObjectId,
    countryCode: 'MX',                  // ISO 3166-1 (CL, MX, AR, CO, BR, PE, UY)
    countryName: 'México',
    currency: 'MXN',
    
    // === CREDENCIALES (encriptadas en reposo) ===
    accessToken: 'APP_USR-xxxx',        // Token de la cuenta MP de PianoLink en ese país
    publicKey: 'APP_USR-xxxx',          // Para el frontend (checkout)
    
    // === CUENTA RECEPTORA (cobros a estudiantes) ===
    collector: {
        userId: '123456789',            // User ID de MP
        email: 'mx@pianolink.net'       // Email de la cuenta MP receptora
    },
    
    // === PAYOUTS (pagos a profesores) ===
    payout: {
        enabled: Boolean,               // Si se pueden hacer pagos automáticos en este país
        method: 'account_money',        // 'account_money' | 'bank_transfer'
        minPayoutAmount: 500,           // Mínimo para payout en moneda local (ej: $500 MXN)
        maxPayoutAmount: 500000,        // Máximo por transacción en moneda local
        payoutCurrency: 'MXN',          // Moneda del payout (misma que currency del país)
        requiresManualApproval: false   // Si el admin debe aprobar antes de ejecutar
    },
    
    // === CONFIGURACIÓN ===
    isActive: Boolean,
    webhookSecret: String,              // Para validar webhooks de MP de ese país
    
    // Metadatos
    createdAt: Date,
    updatedAt: Date
}

// Índices:
// { countryCode: 1 } unique
// { isActive: 1 }
```

#### Países soportados por MercadoPago

MercadoPago opera únicamente en 7 países. Para el resto de LATAM y Europa se usa **PayPal (USD)**.

| País | Código | Moneda | Proveedor | Cobros (estudiantes) | Payouts (profesores) |
|------|--------|--------|-----------|----------------------|----------------------|
| Chile | CL | CLP | MercadoPago | ✅ Ya operativo | ✅ Ya operativo |
| México | MX | MXN | MercadoPago | 🔧 Configurar | 🔧 Configurar |
| Argentina | AR | ARS | MercadoPago | 🔧 Configurar | 🔧 Configurar |
| Colombia | CO | COP | MercadoPago | 🔧 Configurar | 🔧 Configurar |
| Brasil | BR | BRL | MercadoPago | 🔧 Configurar | 🔧 Configurar |
| Perú | PE | PEN | MercadoPago | 🔧 Configurar | 🔧 Configurar |
| Uruguay | UY | UYU | MercadoPago | 🔧 Configurar | 🔧 Configurar |
| **Europa / Resto del mundo** | * | USD | **PayPal** | ✅ Ya integrado | ✅ Ya integrado |

> **Regla de enrutamiento:** Si el país del profesor está en los 7 de MercadoPago → se usa MP con moneda local. Si no (Europa, otros LATAM, etc.) → se usa PayPal en USD automáticamente.

### 3.3 Resolución del Proveedor de Pago por Localización

Antes de entrar al flujo de checkout, el sistema resuelve qué proveedor de pago usar. Esta regla aplica a **todos los checkouts** de la plataforma.

```
PaymentProviderResolver (services/PaymentProviderResolver.js)

Método principal:
  resolve(payerCountry, context) → { provider, currency, credentials }

Lógica:
  1. payerCountry ∈ ['CL','MX','AR','CO','BR','PE','UY'] ?
     → SÍ: provider = 'mercadopago', currency = moneda local del país
     → NO: provider = 'paypal', currency = 'USD'
  2. Retornar credenciales correspondientes
```

#### Mapa de checkouts y regla de localización

| # | Checkout | ¿Quién paga? | País que determina proveedor | MP (7 países LATAM) | PayPal (resto del mundo) |
|---|----------|--------------|------------------------------|---------------------|-------------------------|
| 1 | Alumno compra clase/paquete | Estudiante | País del **profesor** (para que el payout posterior coincida con la cuenta MP del país del profesor) | Moneda local | USD |
| 2 | Membresía profesor Premium ($19/mes) | Profesor | País del **profesor** (él mismo) | Moneda local (equivalente a $19 USD) | $19 USD |
| 3 | Membresía profesor Founder ($10/mes) | Profesor | País del **profesor** (él mismo) | Moneda local (equivalente a $10 USD) | $10 USD |
| 4 | Alumno compra Welcome Kit | Cliente/Estudiante | País del **cliente** (envío físico) | Moneda local | USD |
| 5 | **Oferta Madrugadores** — Welcome Kit post-waitlist | Lead (recién registrado) | País del **lead** (IP o selección en form) | Moneda local (equiv. a precio early bird) | USD |

> **Regla especial checkout #5 (Oferta Madrugadores):** El precio se toma de `GlobalConfig.memberships.earlyBirdOffer.welcomeKitPriceUSD`. Se muestra solo en `success_waitlist.html` después de completar el formulario de waitlist. El `PaymentProviderResolver` determina MP o PayPal según el país del lead.

> **Regla especial checkouts #2 y #3 (membresía del profesor):** El país del pagador ES el profesor. Si el profesor está en España, se le cobra vía PayPal en USD. Si está en México, vía MercadoPago en MXN.

### 3.4 Flujo de Enrutamiento Dinámico de Checkout

```
Cualquier CHECKOUT en PianoLink
         │
         ▼
┌─────────────────────────┐
│  1. Resolver país del   │    Checkout de clases: país del PROFESOR
│     pagador/contexto    │    Checkout membresía: país del PROFESOR (él paga)
│                         │    Checkout kit: país del CLIENTE
│  country = ?            │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│  2. ¿País en los 7 de   │    ['CL','MX','AR','CO','BR','PE','UY']
│     MercadoPago?        │
└────────────┬────────────┘
             │
        ┌────┴────┐
        │         │
     SÍ ▼         ▼ NO
┌──────────────┐  ┌──────────────────────┐
│ MERCADOPAGO  │  │ PAYPAL (USD)         │
│              │  │                      │
│ Buscar creds │  │ Usar PayPal API      │
│ en mp_creds  │  │ Moneda: USD          │
│ Moneda local │  │ Webhook: /api/       │
│ Webhook: /api│  │   webhooks/paypal    │
│  /webhooks/  │  │                      │
│  mercadopago │  │ Aplicar misma lógica │
│  ?country=XX │  │ de split/comisión    │
└──────┬───────┘  └──────────┬───────────┘
       │                     │
       └─────────┬───────────┘
                 │
                 ▼
┌─────────────────────────────┐
│  3. Procesar pago           │
│     → CommissionService     │    Calcular split (misma lógica
│     → WalletService         │    independiente del proveedor)
│     → LedgerEntry           │
└─────────────────────────────┘
```

**Regla clave para checkout de clases:** El país se determina por el **país del profesor**, no del alumno. Razón: la cuenta receptora de MercadoPago de PianoLink debe estar en el mismo país del profesor para poder hacer el split/payout posterior.

**Regla clave para checkout de membresía:** El país se determina por el **país del profesor** (que es quien paga su propia membresía).

> **Doble uso de las credenciales MP:** El mismo `accessToken` de cada país se usa tanto para crear preferencias de cobro (al estudiante) como para ejecutar transferencias/payouts (al profesor). Un solo set de credenciales por país cubre ambos flujos.
> 
> **PayPal es universal:** Un solo set de credenciales PayPal de PianoLink sirve para cobrar a cualquier persona del mundo en USD. No requiere configuración por país.

### 3.5 Sistema de Split de Comisiones

MercadoPago no tiene un "Split Payment" nativo como Stripe Connect. Se implementa mediante un **modelo de recaudación + payout diferido**.

#### Flujo de Split por Tipo de Transacción

```
CASO 1: Alumno de PLATAFORMA → Profesor FREE (25/75)
═══════════════════════════════════════════════════════
Alumno paga $10.000 CLP
  → PianoLink recauda $10.000 (vía MP Chile)
  → Wallet profesor se acredita $7.500 (75%)
  → PianoLink retiene $2.500 (25%)
  → Payout al profesor se procesa según su payoutConfig


CASO 2: Alumno de PLATAFORMA → Profesor PREMIUM (15/85)
═══════════════════════════════════════════════════════
Alumno paga $10.000 CLP
  → PianoLink recauda $10.000 (vía MP Chile)
  → Wallet profesor se acredita $8.500 (85%)
  → PianoLink retiene $1.500 (15%)


CASO 3: Alumno PRIVADO → Profesor PREMIUM/FOUNDER (0/100)
═══════════════════════════════════════════════════════
Alumno paga $10.000 CLP
  → PianoLink recauda $10.000 (vía MP Chile)
  → Wallet profesor se acredita $10.000 (100%)
  → PianoLink retiene $0
  
  ¿Por qué PianoLink recauda si la comisión es 0%?
  → Para que el profesor use la infraestructura de cobro de la plataforma.
  → El alumno paga dentro de PianoLink (experiencia unificada).
  → El profesor no necesita su propia cuenta MP para cobrar.


CASO 4: Cobro de MEMBRESÍA del profesor ($19 o $10 USD/mes)
═══════════════════════════════════════════════════════
Profesor paga su mensualidad
  → Cobro directo a PianoLink (ingreso 100% plataforma)
  → No hay split, es un servicio SaaS
  → Proveedor según país del profesor:
      País MP (CL,MX,AR,CO,BR,PE,UY) → MercadoPago (moneda local, equiv. USD)
      Resto del mundo (Europa, etc.)  → PayPal ($19 o $10 USD directamente)
```

#### Nuevo Service Object: `CommissionService`

```
CommissionService (services/CommissionService.js)

Responsabilidad: Calcular la comisión correcta para cada transacción.

Método principal:
  calculateCommission(teacherId, studentSource) → {
      platformPercent: 25 | 15 | 0,
      teacherPercent: 75 | 85 | 100,
      reason: String
  }

Lógica:
  1. Obtener plan del profesor → user.teacherData.plan
  2. Verificar que la membresía esté activa (si plan ≠ 'free')
     → Si membresía expirada, tratar como 'free' (downgrade automático)
  3. Determinar origen del alumno → enrollment.source
  4. Aplicar tabla de comisiones de GlobalConfig.teacherPlans
  5. Retornar porcentajes
```

#### Extensión del `WalletService` existente

El `WalletService` actual (services/WalletService.js) ya maneja acreditación. Se extiende para:

1. Recibir el resultado de `CommissionService.calculateCommission()`.
2. Crear entradas en `LedgerEntry` con el detalle del split:
   - `type: 'class_payment'`
   - `grossAmount`: monto total pagado por el alumno
   - `platformFee`: monto retenido por PianoLink
   - `teacherCredit`: monto acreditado al profesor
   - `commissionPercent`: porcentaje aplicado
   - `commissionReason`: motivo del porcentaje

---

### 3.6 Service Object: `MpCountryRouter`

Nuevo servicio que centraliza la lógica de enrutamiento multi-país.

```
MpCountryRouter (services/MpCountryRouter.js)

Métodos de COBRO (a estudiantes):
  getCredentials(countryCode)
    → Busca en mp_credentials, cachea en memoria 5 min
    → Retorna { accessToken, publicKey, currency, webhookSecret, payout }
    
  createPreference(countryCode, items, metadata)
    → Obtiene credenciales del país
    → Instancia SDK de MP con ese accessToken
    → Crea preferencia con moneda local
    → Inyecta country en notification_url: ?country=XX
    
  validateWebhook(countryCode, signature, body)
    → Obtiene webhookSecret del país
    → Valida firma HMAC

Métodos de PAYOUT (a profesores):
  transferToTeacher(countryCode, { recipientEmail, amount, currency, reference })
    → Obtiene accessToken del país del profesor
    → Verifica payout.enabled y límites (min/max)
    → Ejecuta POST /v1/payments con payment_method_id: 'account_money'
    → Registra resultado en TeacherPayout
    
  getPayoutStatus(countryCode, transferId)
    → Obtiene accessToken del país
    → Consulta GET /v1/payments/{transferId}
    
  getAccountBalance(countryCode)
    → Retorna saldo disponible de PianoLink en ese país
    → Útil para verificar fondos antes de payout masivo

Métodos UTILITARIOS:
  convertToUSD(amount, currency)
    → Convierte moneda local a USD para cálculos internos del Wallet
    → Usa tasa de cambio cacheada (actualizar diariamente)
    
  getSupportedCountries()
    → Lista países activos en mp_credentials
    
  getCountriesWithPayoutEnabled()
    → Lista países donde los payouts automáticos están habilitados
```

> **Migración de `MercadoPagoTransferService`:** El servicio actual usa un solo `accessToken` global. Se debe refactorizar para que delegue a `MpCountryRouter`, pasándole el `countryCode` del profesor. El método `executePayoutToTeacher()` actual se adapta para resolver el país desde `teacher.country` antes de transferir.

### 3.7 Conversión de Moneda para el Wallet

El `Wallet` opera internamente en **centavos USD** (consistente con `Wallet.js` actual). Cuando el pago se recibe en moneda local:

```
Pago recibido: $10.000 CLP
  → MpCountryRouter.convertToUSD(10000, 'CLP')
  → Tasa: 1 USD = 950 CLP (ejemplo)
  → Equivalente: $10.53 USD = 1053 centavos
  → Wallet acredita: 1053 * 0.75 = 789 centavos (plan free)
  → PianoLink retiene: 1053 * 0.25 = 264 centavos
```

**Fuente de tasas de cambio:** Se recomienda usar la API gratuita de MercadoPago (`/currency_conversions/search`) o, como fallback, `exchangerate-api.com`. La tasa se cachea en `GlobalConfig` y se actualiza 1 vez al día vía cron.

---

## 4. Lógica de Asignación y Permisos

### 4.1 Asignación de Alumnos Nuevos (Cola de Espera)

Cuando un nuevo alumno se registra "buscando profesor" (fuente: plataforma), el sistema lo asigna según prioridad:

```
ALUMNO NUEVO llega a PianoLink
         │
         ▼
┌──────────────────────────────┐
│  1. Obtener preferencias     │   - Instrumento (piano)
│     del alumno               │   - Horarios disponibles
│                              │   - Idioma
│                              │   - País / timezone
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│  2. Filtrar profesores       │   WHERE:
│     compatibles              │     - profile.isPublic = true
│                              │     - subscriptionStatus ≠ 'cancelled'
│                              │     - Horarios compatibles
│                              │     - Idioma compatible
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│  3. ORDENAR por prioridad    │
│                              │
│  1º: Founders activos        │   plan = 'founder' AND suscripción activa
│  2º: Premium activos         │   plan = 'premium' AND suscripción activa
│  3º: Free                    │   plan = 'free'
│                              │
│  Dentro de cada grupo:       │
│    → Menor carga actual      │   (menos alumnos activos primero)
│    → Mayor antigüedad        │   (createdAt ASC, premiar fidelidad)
│    → Mayor rating            │   (futuro: sistema de reseñas)
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│  4. Sugerir top 3 al alumno  │   El alumno elige entre los 3 mejores
│     (o asignar automático    │   candidatos. O bien, asignación
│      si el alumno prefiere)  │   automática al #1.
└──────────────────────────────┘
```

#### Service Object: `StudentAssignmentService`

```
StudentAssignmentService (services/StudentAssignmentService.js)

Métodos:
  getMatchingTeachers(studentPreferences)
    → Filtra por compatibilidad
    → Ordena por prioridad (premium/founder primero)
    → Retorna top N candidatos
    
  assignStudent(studentId, teacherId, source)
    → Crea Enrollment con source='platform'
    → Calcula comisión según plan del profesor
    → Notifica al profesor (email + in-app)
    
  getQueuePosition(teacherId)
    → Retorna posición del profesor en la cola
    → Premium/Founder siempre "posición 0" (prioritaria)
```

### 4.2 Sistema de Permisos (Feature Flags)

#### Validación Backend de Invitación de Alumnos Particulares

```
PROFESOR quiere generar enlace de invitación
         │
         ▼
┌─────────────────────────────────┐
│  Middleware: validatePermission │
│  ('canInvitePrivateStudents')   │
│                                 │
│  1. Obtener profesor            │
│     const teacher = req.user    │
│                                 │
│  2. Verificar plan              │
│     if (plan === 'free')        │
│       → 403: "Upgrade para     │
│         invitar alumnos"        │
│                                 │
│  3. Verificar suscripción       │
│     activa (premium/founder)    │
│     if (suscripción expirada)   │
│       → 403: "Renueva tu       │
│         membresía"              │
│                                 │
│  4. Verificar feature flag      │
│     if (!permissions             │
│         .canInvitePrivateStudents│)
│       → 403: "Permiso no        │
│         habilitado"             │
│                                 │
│  5. ✅ Permitir                 │
│     → Generar TeacherInvite     │
│     → Retornar URL de invitación│
└─────────────────────────────────┘
```

#### Endpoints Afectados

| Endpoint | Permiso requerido | Plan Free | Plan Premium/Founder |
|----------|-------------------|-----------|---------------------|
| `POST /api/invite/generate` | `canInvitePrivateStudents` | ❌ 403 | ✅ |
| `GET /api/invite/my-invites` | `canInvitePrivateStudents` | ❌ 403 | ✅ |
| `DELETE /api/invite/:code` | `canInvitePrivateStudents` | ❌ 403 | ✅ |
| `GET /api/students/my-students` | Ninguno | ✅ (solo plataforma) | ✅ (todos) |
| `POST /api/classes/schedule` | Ninguno | ✅ | ✅ |

#### Middleware: `requirePermission`

```
Middleware genérico reutilizable:

requirePermission(permissionKey)
  → (req, res, next) => {
       Extraer user de req.user
       Verificar user.teacherData.permissions[permissionKey]
       Si false → 403 con mensaje descriptivo + link a upgrade
       Si true → next()
     }
```

### 4.3 Flujo de Registro de Alumno por Invitación

```
PROFESOR genera enlace
  → pianolink.net/invite/prof-maria-xyz123
  
ALUMNO abre el enlace
         │
         ▼
┌───────────────────────────────┐
│  1. Validar código            │
│     TeacherInvite.findOne({   │
│       code, status: 'active', │
│       expiresAt: { $gt: now } │
│     })                        │
└──────────────┬────────────────┘
               │
          ┌────┴────┐
          │ ¿Válido?│
          └────┬────┘
           Sí  │  No → "Enlace expirado o inválido"
               │
               ▼
┌───────────────────────────────┐
│  2. Registro del alumno       │
│     Crear User con:           │
│       role: 'student'         │
│       studentData.source:     │
│         'invited'             │
│       studentData             │
│         .assignedTeacher:     │
│         invite.teacherId      │
└──────────────┬────────────────┘
               │
               ▼
┌───────────────────────────────┐
│  3. Crear Enrollment          │
│     source: 'private_invite'  │
│     inviteCode: 'prof-maria…' │
│     appliedCommission: {      │
│       platformPercent: 0,     │
│       teacherPercent: 100     │
│     }                         │
└──────────────┬────────────────┘
               │
               ▼
┌───────────────────────────────┐
│  4. Marcar invitación usada   │
│     invite.status = 'used'    │
│     invite.usedBy = studentId │
│     invite.usedAt = now       │
└──────────────┬────────────────┘
               │
               ▼
┌───────────────────────────────┐
│  5. Notificar al profesor     │
│     "Nuevo alumno privado     │
│      registrado: [nombre]"    │
└───────────────────────────────┘
```

### 4.4 Downgrade Automático (Premium → Free)

Cuando la membresía de un profesor caduca y no se renueva:

```
CRON: Verificar membresías vencidas (diario, 00:00 UTC)
         │
         ▼
┌──────────────────────────────────┐
│  Buscar profesores con:          │
│    plan != 'free'                │
│    subscriptionStatus: 'expired' │
│    subscriptionExpiresAt < now   │
│    (sin período de gracia)       │
└──────────────┬───────────────────┘
               │
               ▼
┌──────────────────────────────────┐
│  Para cada profesor vencido:     │
│                                  │
│  1. plan → 'free'                │
│  2. permissions:                 │
│     canInvitePrivateStudents     │
│       → false                    │
│     hasPriorityQueue → false     │
│                                  │
│  3. Alumnos privados existentes: │
│     → MANTENER la relación       │
│     → GRACE PERIOD: 30 días      │
│       manteniendo 0% comisión    │
│     → Después de 30 días:        │
│       CAMBIAR comisión futura    │
│       a 25/75 (plan free)        │
│     → NO expulsar al alumno      │
│                                  │
│  4. Bloquear generación de       │
│     NUEVAS invitaciones          │
│                                  │
│  5. Enviar email de aviso        │
│     "Tu membresía ha expirado.   │
│      Tus alumnos se mantienen    │
│      pero la comisión cambia     │
│      a 75/25."                   │
└──────────────────────────────────┘
```

> **[BUSINESS LOGIC RISK]**: Decisión clave — cuando un profesor baja de Premium a Free, los alumnos privados existentes mantienen comisión 0% durante un **grace period de 30 días** (período de gracia de comisión, separado del grace period de la suscripción). Pasados los 30 días, pasan a 25/75. Esto reduce quejas y da tiempo al profesor para renovar. Si prefieres mantener 0% indefinido (derechos adquiridos) o aplicar el cambio inmediatamente, indicarlo antes de implementar.

---

## 5. Roadmap de Actualización en Fases

Cada fase está diseñada para:
- Ser deployable independientemente.
- No romper funcionalidad existente (retrocompatible).
- Mantener el navegador estable (~8 GB RAM) limitando archivos abiertos.

---

### FASE 1: Modelado de Datos y Planes (Semana 1)

**Objetivo:** Preparar la base de datos para el nuevo modelo. Cero cambios en frontend.

| Tarea | Archivo(s) | Detalle |
|-------|------------|---------|
| 1.1 | `models/User.js` | Añadir campos `plan`, `planActivatedAt`, `mpSubscriptionId`, `paypalSubscriptionId`, `membershipPaymentProvider`, `permissions {}` dentro de `teacherData` |
| 1.2 | `models/TeacherInvite.js` | Crear modelo para enlaces de invitación |
| 1.3 | `models/GlobalConfig.js` | Añadir `teacherPlans` (free/premium/founder con comisiones) |
| 1.4 | `models/Enrollment.js` o `StudentEnrollment.js` | Añadir `source`, `inviteCode`, `appliedCommission` |
| 1.5 | `scripts/migratePlans.js` | Script de migración: asignar `plan: 'free'` a profesores existentes sin membresía activa; `plan: 'founder'` a los que tienen `isFounder: true`; inicializar `permissions` según plan |
| 1.6 | `models/Payment.js` | Reestructurar: añadir campo `type` (enum: `class_payment`, `membership`, `kit_purchase`, `early_bird_kit`, `payout`), hacer `subscriptionId` **opcional** (hoy es required), añadir `leadEmail` (String, opcional), cambiar `currency` default de `'ARS'` a `'USD'` |
| 1.7 | `models/Subscription.js` | Cambiar `currency` default de `'ARS'` a `'USD'` (línea 73). Agregar campo `paymentProvider` (enum: `mercadopago`, `paypal`) |

**Validación de fase:** Ejecutar script de migración en staging. Verificar que todos los profesores tienen `plan` y `permissions` correctos. Verificar que Payment y Subscription aceptan los nuevos campos sin romper flujos existentes. La aplicación sigue funcionando sin cambios visibles.

**Archivos simultáneos en editor:** ≤ 3 (User.js + 1 modelo nuevo + script)

---

### FASE 2: Comisiones y Multi-país (Semana 2-3)

**Objetivo:** Backend puede calcular comisiones correctamente, manejar múltiples países de MercadoPago, y resolver automáticamente MP vs PayPal según localización del pagador.

| Tarea | Archivo(s) | Detalle |
|-------|------------|---------|
| 2.1 | `models/MpCredentials.js` | Crear modelo para credenciales MP por país (incluye sección `collector` y `payout`) |
| 2.2 | `services/PaymentProviderResolver.js` | **NUEVO.** Resolver proveedor de pago (MP o PayPal) según país del pagador. Método: `resolve(payerCountry, context)` → `{ provider, currency, credentials }`. Punto único de decisión para todos los checkouts |
| 2.3 | `services/CommissionService.js` | Calcular comisión según plan + origen del alumno |
| 2.4 | `services/MpCountryRouter.js` | Enrutar checkout, webhooks **y payouts** por país (solo MP) |
| 2.5 | `services/PlanPermissionService.js` | Sincronizar `permissions` cuando cambia el `plan` |
| 2.6 | `services/WalletService.js` | Extender para recibir CommissionService result + registro detallado en LedgerEntry. Funciona igual sin importar si el cobro fue MP o PayPal |
| 2.7 | `services/PaymentService.js` | Refactorizar para usar `PaymentProviderResolver` → delegar a MP o PayPal según país |
| 2.8 | `services/MercadoPagoTransferService.js` | Refactorizar para resolver país del profesor vía `MpCountryRouter` en vez de usar un solo `accessToken` global. El método `executePayoutToTeacher()` resuelve `teacher.country` → obtiene credenciales del país → ejecuta transferencia con ese token |
| 2.9 | `scripts/migrateMpCredentials.js` | Migrar credenciales CL actuales de .env a `mp_credentials` collection |
| 2.10 | `scripts/seedMpCountries.js` | Crear documentos `mp_credentials` para los 7 países MP con `isActive: false` (listos para activar cuando se creen las cuentas MP) |
| 2.11 | `routes/webhooks/` | Actualizar endpoint de webhook MP para aceptar `?country=XX`. Verificar que webhook de PayPal existente sigue funcional |
| 2.12 | `services/PayPalService.js` | **NUEVO.** Consolidar lógica PayPal dispersa (hoy inline en `welcomeKitRoutes.js` y `PaymentService.js`) en un servicio dedicado. Métodos: `createOrder()`, `captureOrder()`, `createSubscription()`, `getAccessToken()`. Mantener validación de webhook en PaymentService |
| 2.13 | `services/BookingService.js` | Eliminar `0.20` hardcodeado (línea 435). Reemplazar por `CommissionService.calculateCommission(teacherId, studentSource)` |
| 2.14 | `models/StudentEnrollment.js` | Eliminar `0.20` / `0.80` hardcodeado (líneas 181-182). Reemplazar por lectura de `CommissionService` |
| 2.15 | `services/GeoIPService.js` | **NUEVO.** Extraer función `detectCountryByIP()` de `welcomeKitRoutes.js` (línea 105) a servicio reutilizable. Usado por: registro de teachers, checkout #5 early bird, auto-detección de país |

**Validación de fase:** Test manual con checkout de CL (debe seguir funcionando idéntico). Test de payout a profesor CL (debe seguir funcionando). Test de checkout PayPal para profesor de país sin MP (ej: España). Crear un test básico de CommissionService con los 4 casos de split. Verificar que `seedMpCountries.js` crea los 7 países inactivos. Verificar que BookingService y StudentEnrollment usan CommissionService en vez de 0.20 hardcodeado.

**Archivos simultáneos:** ≤ 3 (service + model + route)

---

### FASE 3: Permisos, Invitaciones y Asignación (Semana 3-4)

**Objetivo:** Implementar feature flags de invitación y cola de asignación prioritaria.

| Tarea | Archivo(s) | Detalle |
|-------|------------|---------|
| 3.1 | `middleware/requirePermission.js` | Middleware genérico de permisos por feature flag |
| 3.2 | `routes/invite.js` | CRUD de invitaciones: generar, listar, revocar |
| 3.3 | `routes/invite.js` | Endpoint público: registrar alumno por código de invitación |
| 3.4 | `services/StudentAssignmentService.js` | Cola de asignación con prioridad premium/founder |
| 3.5 | `services/CronService.js` | Añadir job: downgrade automático de plan al expirar membresía |
| 3.6 | `services/CronService.js` | Añadir job: limpiar invitaciones expiradas |
| 3.7 | Rutas existentes de estudiantes | Integrar `CommissionService` al flujo de pago de clases |

**Validación de fase:** 
- Intentar generar invitación con profesor plan `free` → debe retornar 403.
- Generar invitación con profesor plan `premium` → debe funcionar.
- Simular asignación de alumno nuevo → debe priorizar premium/founder.

**Archivos simultáneos:** ≤ 3

---

### FASE 4: Frontend y Dashboard (Semana 4-5)

**Objetivo:** Hacer visible el nuevo modelo al usuario. Cobro de membresías.

| Tarea | Archivo(s) | Detalle |
|-------|------------|---------|
| 4.1 | Dashboard del profesor | Mostrar plan actual, botón upgrade, permisos habilitados |
| 4.2 | Página de pricing | 3 columnas: Free / Premium / Founder. Incluir **calculadora de ahorro**: mostrar al profesor free cuánto ha pagado en comisiones y cuánto ahorraría con Premium ("Llevas $X pagados. Con Premium ahorrarías $Y/mes") |
| 4.3 | Checkout membresía profesor | Integrar pago de $19 USD: si país del profesor ∈ 7 MP → MercadoPago (moneda local equivalente); si no → PayPal (USD). Usar `PaymentProviderResolver` |
| 4.4 | Checkout founder | Integrar pago de $10 USD: misma lógica de proveedor por país. Usa flujo de founders existente + `PaymentProviderResolver` |
| 4.5 | Panel de invitaciones | UI para generar/copiar/revocar enlaces de invitación (solo premium/founder) |
| 4.6 | Admin Panel | Vista de: planes de profesores, comisiones por transacción |
| 4.7 | Selector de país en registro | Dropdown de país obligatorio para teachers, con autodetección por IP (usa `GeoIPService` de Fase 2) |
| 4.8 | `services/CronService.js` | Job: enviar reminder 3 días antes de expiración de membresía |
| 4.9 | UX checkout estudiante | Cuando el estudiante paga en moneda local del profesor (ej: CLP), mostrar cartel explicativo: "Estás pagando en CLP porque tu profesor está en Chile" para evitar confusión |
| 4.10 | Trigger de upsell automático | Cuando un profesor free acumula ≥ 5 alumnos de plataforma, disparar notificación: "Has pagado $X en comisiones. Con Premium pagarías $Y menos." Registrar en CRM como evento de lead scoring |

**Validación de fase:**
- Registrar profesor → selecciona país → plan empieza como free.
- Upgrade a premium → checkout → plan cambia → puede invitar alumnos.
- Activar founder → usa el flujo existente de `isFounder` ya implementado.

**Archivos simultáneos:** ≤ 4 (view HTML + route + service + script)

---

### FASE 5 — Oferta para Madrugadores (Early Bird Upsell)

**Objetivo:** Convertir leads de waitlist en compradores del Welcome Kit mediante una oferta exclusiva con precio reducido, mostrada inmediatamente después de completar el formulario.

**Flujo completo:**

```
Usuario llega a /l/waitlist
         │
         ▼
┌─────────────────────────┐
│  Formulario de registro │
│  (nombre, email, país)  │
└───────────┬─────────────┘
            │ Submit
            ▼
┌─────────────────────────┐
│ CrmLandingService       │
│ .processFormSubmission()│
│                         │
│ 1. Guarda lead en DB    │
│ 2. Envía email confirm. │
│ 3. Retorna redirectUrl  │◄── redirectUrl: '/success-waitlist'
└───────────┬─────────────┘
            │ redirect
            ▼
┌─────────────────────────────────────────┐
│        success_waitlist.html            │
│                                         │
│  ✅ "¡Gracias por registrarte!"         │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │   🎹 OFERTA PARA MADRUGADORES   │  │
│  │                                   │  │
│  │   Welcome Kit Pianolink           │  │
│  │   ~~$44 USD~~ → $29 USD           │  │
│  │                                   │  │
│  │   ⏰ Oferta válida por 00:29:45   │  │
│  │                                   │  │
│  │   [Comprar con MercadoPago]       │  │
│  │   [Comprar con PayPal]            │  │
│  │                                   │  │
│  │   (botones según país del lead)   │  │
│  └───────────────────────────────────┘  │
│                                         │
└─────────────────────────────────────────┘
```

**Componentes a crear/modificar:**

| # | Tarea | Archivo | Descripción |
|---|-------|---------|-------------|
| 5.1 | Página de éxito con upsell | `views/success_waitlist.html` | Página estática con confirmación de registro + banner de oferta early bird. Consume `GlobalConfig.memberships.earlyBirdOffer` vía API para precios, textos y estado enabled. Countdown con JS vanilla. |
| 5.2 | Configurar redirectUrl del landing waitlist | `CrmLandingService.js` | Setear `redirectUrl: '/success-waitlist'` en la landing de waitlist (puede ser por admin o hardcodeado para este landing específico). |
| 5.3 | Endpoint de configuración early bird | `routes/configRoutes.js` | `GET /api/config/early-bird` — público, retorna campos de `earlyBirdOffer` (precio, textos, enabled, countdown). No requiere auth. |
| 5.4 | Sección en Admin Panel | `views/admin.html` | Inputs en sección "Precios" para: precio early bird, precio regular (tachado), textos, toggle enabled, minutos de countdown. Guarda en `GlobalConfig.memberships.earlyBirdOffer`. |
| 5.5 | Checkout early bird | `services/PaymentService.js` | Nuevo método `createEarlyBirdCheckout(leadEmail, country)` que: 1) Lee precio de `GlobalConfig`, 2) Usa `PaymentProviderResolver` para elegir MP/PayPal, 3) Crea preferencia/orden, 4) Retorna URL de pago. |
| 5.6 | Webhook early bird | `services/PaymentService.js` | Al recibir confirmación de pago: 1) Registra `Payment` con type `early_bird_kit`, 2) Asocia al lead en CRM, 3) Dispara email de confirmación de compra. |
| 5.7 | Resolución de botones por país | `success_waitlist.html` (JS) | Al cargar la página, detecta país del lead (query param o IP). Si país ∈ {CL, MX, AR, CO, BR, PE, UY} → muestra botón MP. Siempre muestra botón PayPal como alternativa. |

**Modelo de datos — Registro de compra early bird:**

```
// Usa el modelo Payment existente con type nuevo:
{
    type: 'early_bird_kit',          // Nuevo tipo de pago
    userId: ObjectId | null,          // Puede ser null si el lead no tiene cuenta aún
    leadEmail: String,                // Email del lead del waitlist
    amount: 2900,                     // Centavos (del GlobalConfig)
    currency: 'USD',
    provider: 'mercadopago' | 'paypal',
    providerPaymentId: String,
    status: 'pending' | 'approved' | 'rejected',
    metadata: {
        source: 'waitlist_early_bird',
        countryCode: 'CL',
        regularPrice: 4400,           // Para auditoría del descuento aplicado
        discountApplied: 1500         // 4400 - 2900
    }
}
```

**Hook existente aprovechado:**
- `CrmLandingService.processFormSubmission()` ya retorna `redirectUrl` (línea ~490 del archivo actual).
- Solo se necesita configurar el campo `redirectUrl` de la landing `/l/waitlist` en la DB para apuntar a `/success-waitlist`.

**Validación de fase:**
- Lead completa waitlist → redirect a success → ve oferta → compra con MP o PayPal.
- Si `earlyBirdOffer.enabled = false` → la página solo muestra el mensaje de "Gracias" sin la oferta.
- Si el countdown expira → los botones se ocultan y se muestra "Oferta expirada".
- Admin puede cambiar precio y textos en tiempo real desde admin.html.

**Archivos simultáneos:** ≤ 4 (view HTML + route + service + admin section)

---

### Resumen Visual del Roadmap

```
Semana 1          Semana 2-3           Semana 3-4          Semana 4-5          Semana 5-6
┌──────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  FASE 1  │    │   FASE 2     │    │   FASE 3     │    │   FASE 4     │    │   FASE 5     │
│          │    │              │    │              │    │              │    │              │
│ Modelos  │───>│ Comisiones   │───>│ Permisos     │───>│ Frontend     │───>│ Early Bird   │
│ + Migra- │    │ + Multi-país │    │ + Asignación │    │ + Founder    │    │ Waitlist     │
│   ción   │    │   MP         │    │ + Invitación │    │   Config     │    │ Upsell       │
│          │    │              │    │              │    │ + UX         │    │ + Admin      │
└──────────┘    └──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
   DB only        Backend only       Backend + Mid       Full stack          Full stack
   No break       No break           No break            Visible al user     Revenue boost
```

---

## 6. Matriz de Riesgos

| Riesgo | Impacto | Probabilidad | Mitigación |
|--------|---------|--------------|------------|

| **[BUSINESS LOGIC RISK]** Profesor downgrades pero tiene alumnos privados activos | Los alumnos privados empiezan a generar comisión tras 30 días | Alta | Grace period de 30 días para comisión. Notificar al profesor 7 días antes del downgrade + 7 días antes de fin del grace period. Documentar la regla claramente |
| **[BREAKING CHANGE]** Campo `commissionPercent` actual en User.js | Código legacy que lea `commissionPercent` directamente | Media | Deprecar gradualmente. En Fase 2, hacer que `CommissionService` sea la única fuente de verdad. Mantener `commissionPercent` como cache pero no como fuente |
| MercadoPago rechaza operaciones cross-country | Pago falla para profesor en nuevo país | Alta | `PaymentProviderResolver` redirige automáticamente a PayPal (USD) para países sin MP configurado |
| Token de MP por país expira | Pagos dejan de funcionar para un país | Media | Monitoreo: cron que valide tokens cada 12h (`GET /users/me`) |
| Migración de datos corrompe planes existentes | Profesores pierden acceso | Baja | Script de migración con dry-run, backup previo, y rollback script |
| **[FUTURE]** Stripe no disponible en Chile | No se puede usar Stripe Connect para split payments nativos | N/A (aplazado) | Stripe se activará cuando se cree entidad legal en país compatible (USA/MX). Campos `stripeCustomerId`/`stripeSubscriptionId` se mantienen congelados. `PaymentProviderResolver` soportará Stripe como tercer proveedor sin cambios estructurales |
| Countdown early bird manipulable (client-side) | Lead refresca página para reiniciar temporizador | Media | Almacenar `earlyBirdFirstVisitAt` en cookie HttpOnly + registrar timestamp en backend (CRM lead). Al cargar `success_waitlist.html`, verificar contra backend. Si expiró → no mostrar oferta |
| Comisión hardcodeada en código legacy | `BookingService` y `StudentEnrollment` usan `0.20` literal, ignorando GlobalConfig | **Alta** | Fase 2 (tareas 2.13, 2.14) reemplaza por `CommissionService`. Test de regresión obligatorio |

---

*Documento generado: Febrero 2026*  
*Autor: GitHub Copilot — Arquitectura propuesta para aprobación*  
*Próximo paso: Aprobación → Implementación Fase 1 → ... → Fase 5 (Early Bird)*
