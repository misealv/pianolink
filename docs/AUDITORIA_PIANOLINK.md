# 🔍 AUDITORÍA PROFUNDA — Piano Link
**Fecha:** 22 de febrero de 2026  
**Auditor:** Arquitecto Senior / Copilot  
**Versión del sistema:** Producción actual (Fly.io)

---

## Índice

1. [Stack Tecnológico](#1-stack-tecnológico)
2. [FASE 1 — Mapeo del Dominio](#2-fase-1--mapeo-del-dominio)
   - [Entidades del negocio](#21-entidades-del-negocio)
   - [Cliente vs Estudiante — La dualidad problemática](#22-cliente-vs-estudiante--la-dualidad-problemática)
   - [Roles del sistema](#23-roles-del-sistema)
   - [ERD simplificado](#24-erd-simplificado)
3. [FASE 2 — Auditoría de Lógica de Negocio](#3-fase-2--auditoría-de-lógica-de-negocio)
   - [Control de roles](#31-control-de-roles)
   - [Lógica de reservaciones](#32-lógica-de-reservaciones)
   - [Separación de vistas](#33-separación-de-vistas)
   - [Reglas de negocio implícitas](#34-reglas-de-negocio-implícitas)
4. [FASE 3 — Auditoría de Flujo de Usuario](#4-fase-3--auditoría-de-flujo-de-usuario)
   - [Flujo Profesor](#41-flujo-profesor)
   - [Flujo Estudiante/Cliente](#42-flujo-estudiantecliente)
5. [FASE 4 — Diagnóstico de UX del Profesor](#5-fase-4--diagnóstico-de-ux-del-profesor)
   - [Dashboard actual: problemas](#51-dashboard-actual-problemas)
   - [Propuesta de navegación simplificada](#52-propuesta-de-navegación-simplificada)
6. [FASE 5 — Veredicto y Plan de Acción](#6-fase-5--veredicto-y-plan-de-acción)
   - [Clasificación de problemas](#61-clasificación-de-problemas)
   - [Plan de sprints](#62-plan-de-sprints)

---

## 1. Stack Tecnológico

| Componente | Tecnología |
|---|---|
| Backend | Node.js + Express |
| Base de datos | MongoDB (Mongoose ODM) |
| Autenticación | JWT (cookie + header + query param) |
| Pagos | Stripe (PaymentIntents, Subscriptions) |
| Email | Resend API |
| Hosting | Fly.io (Dockerfile) |
| Frontend | HTML/CSS/JS vanilla (sin framework) |
| Tiempo real | Socket.io (salas de clase, MIDI) |
| CRM | Sistema propio embebido |

**🟠 Observación:** El frontend vanilla de 6400+ líneas en un solo archivo (`dashboard.html`) es deuda técnica significativa que dificulta mantenimiento y testing.

---

## 2. FASE 1 — Mapeo del Dominio

### 2.1 Entidades del Negocio

| Entidad | Modelo(s) | Propósito |
|---|---|---|
| **Usuario** | `User` | Entidad base. Un solo modelo con `role: admin|teacher|student|client` |
| **Profesor** | `User` (role=teacher) + `teacherData{}` | Imparte clases, configura disponibilidad, cobra |
| **Cliente** | `User` (role=client) + `clientData{}` | Quien **paga**. Puede representar a un menor o a sí mismo |
| **Estudiante** | `User` (role=student) + `studentData{}` | Quien **recibe** la clase. A veces es subdocumento embebido en `clientData.managedStudents[]` |
| **Reserva** | `Booking` | Registro histórico de cada clase agendada |
| **Slot** | `TimeSlot` | Bloque atómico de disponibilidad del profesor |
| **Enrollment (legacy)** | `Enrollment` | Vínculo estudiante↔profesor con sala asignada |
| **Enrollment (v5)** | `StudentEnrollment` | Vínculo estudiante↔profesor con tarifa congelada |
| **Suscripción** | `StudentSubscription` | Paquete de clases comprado (saldo) |
| **Sesión de Clase** | `ClassSession` | Registro de validación post-clase para pago al profesor |
| **WelcomeKit** | `WelcomeKit` | Onboarding del estudiante nuevo (setup → trial → activo) |
| **CRM Lead** | `CRMLead` | Prospecto pre-registro |

### 2.2 Cliente vs Estudiante — La Dualidad Problemática

🔴 **CRÍTICO** — Esta es la fuente principal de complejidad accidental del sistema.

**El problema:**
```
Escenario A: Adulto se registra para tomar clases → role=client, ES el estudiante
Escenario B: Padre registra a su hijo menor   → role=client, hijo=managedStudent embebido
Escenario C: Invitación directa del profesor   → role=student, assignedTeacher fijo
```

**Lo que genera:**

| Síntoma | Causa |
|---|---|
| Un "estudiante" puede ser un subdocumento sin cuenta propia | `clientData.managedStudents[]` son objetos embebidos, no Users |
| El booking necesita resolver quién es el estudiante real | `BookingService.bookSlot()` tiene lógica compleja de resolución: ¿es el client? ¿un managedStudent? ¿cuál? |
| Dos modelos de enrollment coexisten | `Enrollment` (legacy) y `StudentEnrollment` (v5) — no se migraron |
| El saldo de clases está en 3 lugares | `User.classesRemaining`, `clientData.managedStudents[].classesRemaining`, `StudentSubscription.classesRemaining` |
| La lógica de "quién paga" vs "quién toma clase" está dispersa | `clientId` vs `studentId` en Booking, con fallbacks en cascada |

**Veredicto:** El modelo `client` + `managedStudents[]` embebido fue una decisión de diseño válida para el MVP (evitar crear cuentas para menores), pero ha generado ramificaciones en **toda** la lógica de negocio: booking, pagos, enrollments, suscripciones, y UX.

### 2.3 Roles del Sistema

| Rol | Existe | Guard | ¿Debería existir? |
|---|---|---|---|
| `admin` | ✅ | `adminOnly` middleware | ✅ Sí |
| `teacher` | ✅ | `teacherOrAdmin` middleware | ✅ Sí |
| `client` | ✅ | Ningún middleware específico | 🟠 Debería fusionarse con `student` |
| `student` | ✅ | Ningún middleware específico | 🟠 Debería ser el rol único del lado alumno |

**🟠 Hallazgo:** No existe middleware `studentOnly` ni `clientOnly`. Las rutas de cliente/estudiante se protegen solo con `protect` (autenticación), pero **cualquier usuario autenticado** podría acceder a endpoints de cliente si conoce la URL. La separación es solo por redirección en el frontend login.

### 2.4 ERD Simplificado

```
┌─────────────────────────────────────────────────────────────────┐
│                          USER                                   │
│  _id, name, email, role, password                               │
│  ├── teacherData{} (si role=teacher)                            │
│  │   ├── plan, hourlyRate, trialPrice, earnings                 │
│  │   └── permissions{}                                          │
│  ├── clientData{} (si role=client)                              │
│  │   ├── accountType (individual|guardian|organization)          │
│  │   └── managedStudents[{name, age, classesRemaining}]  ←──── NO son Users  │
│  └── studentData{} (si role=student)                            │
│      ├── assignedTeacher → User                                 │
│      └── accountHolder → User                                   │
└─────────────┬───────────────┬───────────────┬───────────────────┘
              │               │               │
              ▼               ▼               ▼
  ┌───────────────┐  ┌──────────────┐  ┌─────────────────┐
  │  TimeSlot     │  │ Enrollment   │  │ StudentEnrollment│
  │  teacherId    │  │ studentId    │  │ student          │
  │  startTime    │  │ teacherId    │  │ teacher          │
  │  status       │  │ roomId       │  │ frozenRate       │
  │  booking{}    │  │ classes*     │  │ classesRemaining │
  └───────┬───────┘  └──────────────┘  └─────────────────┘
          │                                    │
          ▼                                    │
  ┌───────────────┐  ┌──────────────┐          │
  │  Booking      │  │ ClassSession │          │
  │  slotId       │  │ bookingId    │          │
  │  teacherId    │  │ studentId    │          │
  │  studentId    │  │ teacherId    │          │
  │  clientId     │  │ subscriptionId├─────────┘
  │  subscriptionId│  │ validation{} │
  │  status       │  │ payout{}     │
  └───────────────┘  └──────────────┘

  ┌───────────────┐  ┌──────────────┐
  │  WelcomeKit   │  │  CRMLead     │
  │  clientId     │  │  email       │
  │  overallStatus│  │  campaignId  │
  │  setupSession │  │  status      │
  │  trialClass{} │  │  resonancia  │
  └───────────────┘  └──────────────┘

  ┌───────────────────────┐
  │  StudentSubscription  │
  │  studentId            │
  │  teacherId            │
  │  classesRemaining     │
  │  status               │
  └───────────────────────┘
```

**🔴 Problema visible en el ERD:**  
- Hay **3 modelos** que rastrean clases restantes: `User.classesRemaining`, `managedStudents[].classesRemaining`, y `StudentSubscription.classesRemaining`
- Hay **2 modelos** de enrollment que coexisten: `Enrollment` y `StudentEnrollment`
- El `Booking` referencia tanto `studentId` como `clientId`, generando ambigüedad sobre quién realmente tomó la clase

---

## 3. FASE 2 — Auditoría de Lógica de Negocio

### 3.1 Control de Roles

| Validación | ¿Existe? | Severidad | Detalle |
|---|---|---|---|
| Profesor no puede reservar su propio slot | ❌ No | 🔴 CRÍTICO | `BookingService.bookSlot()` nunca compara `teacherId !== studentId` |
| Profesor no puede acceder a vista de estudiante | ⚠️ Parcial | 🟠 ALTO | Guard solo es `window.location` en JS frontend — sin validación backend |
| Estudiante no puede crear slots de disponibilidad | ✅ Sí | — | `teacherOrAdmin` middleware en rutas de calendario |
| Validación de rol en endpoints de booking | ❌ No | 🟠 ALTO | `POST /api/bookings` solo requiere `protect` — cualquier rol autenticado puede reservar |
| Admin puede impersonar | ✅ Sí | 🟢 OK | Acceso total por diseño |

**Código del problema (BookingService.js → bookSlot):**
```javascript
static async bookSlot(slotId, studentId, clientId, timezone) {
    // ❌ FALTA: if (slot.teacherId.equals(studentId)) throw new Error('CANNOT_BOOK_OWN_SLOT');
    // ❌ FALTA: Validar que studentId tenga role student|client
    
    const slot = await TimeSlot.findOneAndUpdate(
        { _id: slotId, status: 'available' },
        { $set: { status: 'pending' } }
    );
    // ... continúa sin validación de identidad cruzada
}
```

**Código del problema (bookingRoutes.js → POST /api/bookings):**
```javascript
router.post('/', protect, async (req, res) => {
    // ❌ Solo `protect` — no hay `studentOrClient` middleware
    // Un profesor autenticado puede llegar aquí
    const { slotId, studentId, timezone } = req.body;
    let actualStudentId = studentId || req.user._id; // ← Si no envía studentId, usa su propio ID
    // ...
});
```

### 3.2 Lógica de Reservaciones

**Flujo actual de booking:**
```
1. Cliente/Estudiante selecciona slot disponible
2. POST /api/bookings { slotId, studentId?, timezone }
3. bookingRoutes determina actualStudentId y clientId según el rol del user
4. BookingService.bookSlot() ejecuta transacción:
   a. Lock atómico del slot (available → pending)
   b. Busca suscripción activa con el profesor
   c. Verifica saldo de clases
   d. Crea Booking
   e. Descuenta clase
   f. Actualiza slot (pending → booked)
5. Si es primera clase → actualiza WelcomeKit a trial_scheduled
```

**Validaciones que SÍ existen (bien implementadas):**

| Validación | Implementación |
|---|---|
| Double-booking prevention | `findOneAndUpdate` atómico con `status: 'available'` |
| Saldo insuficiente | `INSUFFICIENT_CLASSES` error |
| Slot expirado | Verifica que `startTime > now` |
| Transacción atómica | MongoDB session con rollback |
| Cancelación tardía (<24h) | Sin reembolso, opción de recuperación |

**Validaciones que FALTAN:**

| Faltante | Severidad | Impacto |
|---|---|---|
| `teacherId !== studentId` | 🔴 CRÍTICO | Un profesor puede reservarse a sí mismo |
| Validación de rol del reservante | 🟠 ALTO | Cualquier usuario autenticado puede reservar |
| Límite de reservas futuras por estudiante | 🟡 MEDIO | Un estudiante podría reservar todos los slots de un profesor |
| Validación de timezone razonable | 🟡 MEDIO | Se acepta cualquier string como timezone |

### 3.3 Separación de Vistas

| Vista | URL | Guard Frontend | Guard Backend |
|---|---|---|---|
| Dashboard Profesor | `/dashboard.html` | `role !== 'teacher'` → login | Ninguno (archivo estático) |
| Panel Cliente | `/cliente.html` | Redirección en login | Ninguno (archivo estático) |
| Sala de Clase | `/index.html` | Ninguno | `gatekeeper` middleware en API |
| Admin | `/admin.html` | Redirección en login | `adminOnly` en API |
| Mis Clases | `/mis-clases.html` | Ninguno | `protect` en API |

**🟠 ALTO — Las vistas HTML son archivos estáticos sin protección de servidor:**
- Cualquier usuario puede acceder a `/dashboard.html` directamente
- El guard es solo JavaScript del lado del cliente: `if (user.role !== 'teacher') redirect`
- Si alguien desactiva JS o manipula localStorage, puede ver el HTML del dashboard
- **Los datos están protegidos** (los endpoints API sí validan), pero la estructura de la UI no

### 3.4 Reglas de Negocio Implícitas

Estas reglas están asumidas pero **no codificadas como validaciones explícitas**:

| Regla implícita | ¿Codificada? | Severidad |
|---|---|---|
| Un profesor no puede ser estudiante de sí mismo | ❌ | 🔴 CRÍTICO |
| Un profesor no puede tener rol dual (profesor + estudiante) | ⚠️ Parcial (campo `role` es singular) | 🟡 MEDIO |
| Solo clientes/estudiantes pueden reservar | ❌ | 🟠 ALTO |
| Un slot solo puede ser reservado si está en el futuro | ✅ | — |
| La cancelación <24h no devuelve clases | ✅ | — |
| Un managedStudent hereda el saldo del client | ⚠️ Lógica dispersa | 🟡 MEDIO |
| El precio de la clase trial va en centavos, la tarifa horaria en dólares | ⚠️ Inconsistente | 🟠 ALTO |
| Un profesor debe tener plan activo para aparecer en búsquedas | ✅ | — |

**🟠 Inconsistencia monetaria detectada:**
```javascript
// En User model:
hourlyRate: { type: Number, min: 15 }         // ← DÓLARES
trialPrice: { type: Number, default: 1500 }    // ← CENTAVOS (1500 = $15)
// En Booking:
payment.amountCents: Number                     // ← CENTAVOS
// En ClassSession:
pricing.pricePerClassCents: Number              // ← CENTAVOS
```
El `hourlyRate` está en dólares mientras todo lo demás está en centavos. Un error de conversión aquí cobra o paga 100x de más/menos.

---

## 4. FASE 3 — Auditoría de Flujo de Usuario

### 4.1 Flujo Profesor

```
Registro → Login → Dashboard (6400 líneas de HTML)
   │
   ├── Configurar perfil público (tarifa, bio, especialidades)
   ├── Crear disponibilidad (calendario semanal recurrente)
   ├── Invitar estudiantes privados (solo Premium/Founder)
   ├── Ver/gestionar estudiantes
   ├── Validar clases completadas
   ├── Ver ganancias (escrow/pagadas)
   └── Ir a sala de clase
```

**Problemas detectados en el flujo:**

| Paso | Problema | Severidad |
|---|---|---|
| Registro | El rol default es `teacher` — sin onboarding guiado | 🟡 MEDIO |
| Dashboard | **6409 líneas** en un solo HTML: calendario, estudiantes, perfil, ganancias, validaciones, chat founder, setup — todo mezclado | 🟠 ALTO |
| Disponibilidad | Funciona, pero el profesor no ve preview de cómo lo ven los estudiantes | 🟡 MEDIO |
| Invitar estudiante | Solo Premium/Founder. El flujo crea un user `role=student` con `assignedTeacher` | 🟢 OK |
| Validar clases | Requiere acción manual post-clase para cobrar. Si olvida, no cobra | 🟠 ALTO |
| Gestionar estudiantes | Funcional pero mezclado en el dashboard monolítico | 🟡 MEDIO |
| Ganancias | Muestra escrow vs pagado, pero no hay proyección ni historial visual | 🟡 MEDIO |

### 4.2 Flujo Estudiante/Cliente

```
CRM Lead → Invitación/Marketing → Registro → WelcomeKit → Setup → Trial → Suscripción
   │
   ├── Registra como client (paga)
   ├── WelcomeKit: espera equipo → setup session → trial available
   ├── Seleccionar profesor → Ver perfil/calendario
   ├── Agendar clase de prueba
   ├── Tomar clase → Calificar
   └── Comprar paquete de clases → Clases recurrentes
```

**Problemas detectados en el flujo:**

| Paso | Problema | Severidad |
|---|---|---|
| WelcomeKit | El flujo tiene **11 estados posibles** — demasiados para un onboarding | 🟠 ALTO |
| WelcomeKit → trial_available | Si el setup se marca manualmente (admin), **no se envía email automático** para agendar clase. Caso real: Felipe Jorquera. | 🔴 CRÍTICO |
| Distinción client/student | Un adulto que paga para sí mismo es `client` pero funciona como `student` — genera confusión en toda la lógica | 🟠 ALTO |
| managedStudents | Son objetos embebidos sin cuenta propia. No pueden loguearse, no tienen perfil, no reciben emails directamente | 🟡 MEDIO |
| Saldo de clases | Disperso en 3 ubicaciones: `User.classesRemaining`, `managedStudents[].classesRemaining`, `StudentSubscription.classesRemaining` | 🔴 CRÍTICO |
| Agendar clase | El estudiante debe saber que tiene suscripción activa **con ese profesor específico** antes de intentar reservar | 🟡 MEDIO |

**El viaje del WelcomeKit y sus 11 estados:**
```
paid → entrevista_pendiente → entrevista_agendada → esperando_equipo
     → setup_pending → setup_scheduled → trial_available
     → trial_scheduled → trial_completed → completed
     → refunded / disputed
```
🟠 **Esto es excesivo para un onboarding.** Un alumno nuevo atraviesa potencialmente 8+ transiciones de estado antes de poder tomar su primera clase regular. Cada transición es un punto de fallo (como el caso Felipe Jorquera).

---

## 5. FASE 4 — Diagnóstico de UX del Profesor

### 5.1 Dashboard Actual: Problemas

El archivo `dashboard.html` tiene **6409 líneas** y contiene:

| Sección | Líneas aprox. | ¿Necesaria en landing? |
|---|---|---|
| Sidebar con plan y ganancias | ~200 | ✅ Resumen sí, detalle no |
| Alertas de membresía | ~150 | ✅ Solo si aplica |
| Calendario semanal completo | ~800 | ❌ Debería ser vista separada |
| Lista de estudiantes | ~400 | ❌ Debería ser vista separada |
| Validación de clases | ~300 | ❌ Vista separada |
| Configuración de perfil público | ~600 | ❌ Vista separada |
| Invitar estudiantes | ~200 | ❌ Vista separada |
| Chat Founder | ~300 | ❌ Solo founders, vista separada |
| Lógica JS del calendario | ~1500 | — |
| Lógica JS de CRUD estudiantes | ~800 | — |
| CSS embebido | ~500 | — |

**Diagnóstico: El dashboard está haciendo el trabajo de 6+ páginas en una sola.**

**Tareas que deberían ser ≤3 clics:**

| Tarea | Clics actuales | Clics ideales |
|---|---|---|
| Ver próxima clase | ~2 (scroll al calendario) | 1 (visible en landing) |
| Ir a sala de clase | 1 (botón visible) | 1 ✅ |
| Ver ganancias del mes | ~2 (visible en sidebar) | 1-2 ✅ |
| Validar última clase | ~3-4 (scroll, buscar, expandir) | 2 (notificación → confirmar) |
| Editar disponibilidad | ~3 (scroll, click, modal) | 2 (nav → editar) |
| Ver perfil como estudiante | No existe | 2 (sería útil) |

**Información ruido vs señal en el dashboard:**

| Señal (mantener visible) | Ruido (mover o eliminar) |
|---|---|
| Próxima clase (hora, estudiante) | Detalles del plan completo |
| Clases pendientes de validar (badge) | Historial de ganancias completo |
| Ganancias del mes (resumen) | Formulario de perfil público |
| Alertas activas (membresía, disputas) | Lista completa de estudiantes |
| Acceso rápido a sala | Chat founder en el dashboard |

### 5.2 Propuesta de Navegación Simplificada

```
┌─────────────────────────────────────────────────┐
│  DASHBOARD PROFESOR (simplificado)              │
│                                                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │ Próxima  │ │ Pendient.│ │   Ganancias      │ │
│  │ clase    │ │ validar  │ │   este mes       │ │
│  │ Hoy 15:00│ │   (3)    │ │   $245.00        │ │
│  │ [IR]     │ │ [VER]    │ │   [DETALLE]      │ │
│  └──────────┘ └──────────┘ └──────────────────┘ │
│                                                  │
│  ┌─────────────────────────────────────────────┐ │
│  │ Esta semana (mini-calendario)               │ │
│  │ Lun: 2 clases | Mar: 1 clase | ...         │ │
│  └─────────────────────────────────────────────┘ │
│                                                  │
│  Nav: Inicio | Calendario | Estudiantes |        │
│       Perfil | Ganancias | Config               │
└─────────────────────────────────────────────────┘
```

**Cada sección actual debería ser su propia página/vista:**
- `/dashboard` → Resumen + próxima clase + alertas
- `/calendario` → Calendario completo + disponibilidad
- `/estudiantes` → Lista + invitaciones
- `/perfil` → Perfil público + preview
- `/ganancias` → Historial + escrow + payout
- `/validar` → Clases pendientes de validar

---

## 6. FASE 5 — Veredicto y Plan de Acción

### 6.1 Clasificación de Problemas

| # | Problema | Severidad | Tipo |
|---|---|---|---|
| 1 | Profesor puede reservarse a sí mismo (sin validación `teacher≠student`) | 🔴 CRÍTICO | Parche |
| 2 | Saldo de clases en 3 ubicaciones distintas (desincronización) | 🔴 CRÍTICO | Reingeniería |
| 3 | WelcomeKit admin bypass no envía email de trial | 🔴 CRÍTICO | Parche |
| 4 | Cualquier rol autenticado puede reservar (falta middleware de rol en booking) | 🟠 ALTO | Parche |
| 5 | Inconsistencia monetaria: `hourlyRate` en USD vs `trialPrice` en centavos | 🟠 ALTO | Parche + migración |
| 6 | Dashboard monolítico de 6400 líneas | 🟠 ALTO | Reingeniería |
| 7 | Dos modelos de Enrollment coexisten sin migración | 🟠 ALTO | Reingeniería |
| 8 | 11 estados de WelcomeKit — onboarding over-engineered | 🟠 ALTO | Reingeniería |
| 9 | Vistas HTML estáticas sin guard de servidor | 🟠 ALTO | Parche |
| 10 | Client vs Student como roles separados genera complejidad | 🟠 ALTO | Reingeniería (a futuro) |
| 11 | Validación de clases manual — profesor puede olvidar cobrar | 🟡 MEDIO | Mejora |
| 12 | No hay preview de "cómo me ven los estudiantes" | 🟡 MEDIO | Mejora |
| 13 | No hay límite de reservas futuras por estudiante | 🟡 MEDIO | Parche |
| 14 | Timezone se acepta sin validación | 🟡 MEDIO | Parche |
| 15 | Falta middleware `studentOrClient` dedicado | 🟡 MEDIO | Parche |

### 6.2 Plan de Sprints

---

#### 🏃 Sprint 1 — Parches Críticos de Seguridad (1-2 días)
**Meta:** Cerrar las vulnerabilidades de lógica de negocio más graves.

| # | Tarea | Archivos | Esfuerzo |
|---|---|---|---|
| 1.1 | Agregar validación `teacherId !== studentId` en `BookingService.bookSlot()` | `services/BookingService.js` | 30 min |
| 1.2 | Agregar validación `teacherId !== req.user._id` en `POST /api/bookings` y `POST /api/bookings/trial-class` | `routes/bookingRoutes.js` | 30 min |
| 1.3 | Agregar middleware `studentOrClient` y aplicar en rutas de booking | `middleware/authMiddleware.js`, `routes/bookingRoutes.js` | 1h |
| 1.4 | Fix: cuando admin cambia WelcomeKit a `trial_available`, enviar email automático | `routes/welcomeKitRoutes.js` (ruta de admin status update) | 1h |
| 1.5 | Agregar validación de timezone contra lista IANA | `services/BookingService.js` | 30 min |

**Pseudocódigo 1.1:**
```javascript
// BookingService.js → bookSlot()
static async bookSlot(slotId, studentId, clientId, timezone) {
    const slot = await TimeSlot.findById(slotId);
    
    // ✅ NUEVO: Prevenir auto-reserva
    if (slot.teacherId.equals(studentId)) {
        throw new Error('CANNOT_BOOK_OWN_SLOT');
    }
    if (clientId && slot.teacherId.equals(clientId)) {
        throw new Error('CANNOT_BOOK_OWN_SLOT');
    }
    // ... resto del flujo
}
```

**Pseudocódigo 1.3:**
```javascript
// middleware/authMiddleware.js
const studentOrClient = (req, res, next) => {
    if (!req.user || !['student', 'client'].includes(req.user.role)) {
        return res.status(403).json({ 
            success: false, 
            message: 'Solo estudiantes o clientes pueden realizar esta acción' 
        });
    }
    next();
};
```

---

#### 🏃 Sprint 2 — Consistencia de Datos (2-3 días)
**Meta:** Eliminar ambigüedad en el saldo de clases y unificar modelos de enrollment.

| # | Tarea | Archivos | Esfuerzo |
|---|---|---|---|
| 2.1 | Auditar qué `Enrollment` records tienen contrapartida en `StudentEnrollment` | Script de migración | 2h |
| 2.2 | Migrar `Enrollment` activos a `StudentEnrollment` donde falte | Script + servicio | 4h |
| 2.3 | Designar `StudentSubscription.classesRemaining` como **fuente de verdad única** del saldo | Documentar + validar | 2h |
| 2.4 | Agregar job de reconciliación que detecte desincronizaciones de saldo | `jobs/` | 3h |
| 2.5 | Normalizar `hourlyRate` a centavos o agregar helper `toC ents()` con docs claros | `models/User.js`, servicios de pago | 2h |

---

#### 🏃 Sprint 3 — Simplificar WelcomeKit (2-3 días)
**Meta:** Reducir los 11 estados del onboarding a un flujo más robusto.

| # | Tarea | Esfuerzo |
|---|---|---|
| 3.1 | Mapear qué estados son realmente usados en producción (query a DB) | 1h |
| 3.2 | Colapsar estados redundantes: `paid + entrevista_*` → `onboarding`, `setup_*` → `setup`, `trial_*` → `trial` | 4h |
| 3.3 | Agregar event hooks: cuando un admin cambia estado manualmente, disparar las mismas acciones automáticas | 3h |
| 3.4 | Crear middleware `welcomeKitTransition(from, to)` que valide transiciones legales y dispare side-effects | 3h |

**Estado propuesto simplificado:**
```
onboarding → setup → trial_ready → trial_done → active
                                              → refunded
```
6 estados vs 11 actuales.

---

#### 🏃 Sprint 4 — Refactor del Dashboard del Profesor (3-5 días)
**Meta:** Descomponer el monolito de 6400 líneas en vistas independientes.

| # | Tarea | Esfuerzo |
|---|---|---|
| 4.1 | Extraer calendario a `/profesor/calendario.html` | 4h |
| 4.2 | Extraer gestión de estudiantes a `/profesor/estudiantes.html` | 3h |
| 4.3 | Extraer validación de clases a `/profesor/validar.html` | 2h |
| 4.4 | Extraer perfil público a `/profesor/perfil.html` | 3h |
| 4.5 | Reducir `dashboard.html` a vista resumen con nav a las sub-vistas | 4h |

---

#### 🏃 Sprint 5 — Arquitectura de Roles a Futuro (diseño, no implementación)
**Meta:** Diseñar la unificación de `client` y `student` para eliminar la complejidad dual.

| # | Tarea | Esfuerzo |
|---|---|---|
| 5.1 | Documentar RFC: Unificar `client` + `student` → rol único `student` con flag `isGuardian` | 2h |
| 5.2 | Diseñar migración de `managedStudents[]` embebidos a `User` records reales (con login opcional) | 3h |
| 5.3 | Diseñar nueva estructura de permisos por capacidad en vez de por rol | 2h |

---

### Decisiones Arquitecturales que Generan Deuda Técnica

| Decisión original | Por qué se hizo | Deuda que generó | Recomendación |
|---|---|---|---|
| `client` vs `student` como roles separados | Soportar padres que pagan por hijos menores | Lógica de booking/pago bifurcada en todo el sistema | Unificar con flag `isGuardian` |
| `managedStudents[]` como subdocumentos embebidos | Evitar crear usuarios para menores | No pueden loguearse, no tienen perfil, saldo disperso | Promover a `User` records con `role=student` + `parentId` |
| Un solo HTML de 6400 líneas para dashboard | Desarrollo rápido MVP sin framework | Imposible de mantener, testear o iterar | Descomponer en vistas o migrar a SPA ligera |
| Dos modelos de Enrollment | Se creó v5 (`StudentEnrollment`) sin deprecar v2 (`Enrollment`) | Queries inconsistentes, fallbacks confusos | Migrar todo a `StudentEnrollment`, borrar `Enrollment` |
| Saldo de clases en 3 ubicaciones | Cada feature nuevo agregó su propio tracking | Desincronización y bugs de saldo | Fuente de verdad única: `StudentSubscription` |
| `hourlyRate` en USD, todo lo demás en centavos | Probablemente legacy del primer pricing | Riesgo de error de 100x en conversión | Estandarizar todo a centavos |

---

### Resumen Ejecutivo

**Estado general:** El sistema funciona para el happy-path pero tiene **grietas estructurales** que se manifiestan como bugs reportados (auto-reserva de profesor, vistas cruzadas, emails que no se envían). Estos no son bugs aislados sino síntomas de:

1. **Falta de validación de dominio** — Las reglas de negocio están implícitas en vez de codificadas
2. **Diseño de modelo acumulativo** — Cada feature nuevo se "pegó" al modelo existente en vez de rediseñar
3. **Frontend monolítico** — Una sola página HTML gigante para el profesor es insostenible

**La buena noticia:** El backend de reservaciones tiene una base sólida (transacciones atómicas, double-booking prevention). Los problemas son **capas de validación faltantes**, no fallas arquitecturales irreparables.

**Prioridad recomendada:**
1. **Sprint 1** → Urgente (seguridad). Ejecutar esta semana.
2. **Sprint 2** → Alta (integridad de datos). Siguiente semana.
3. **Sprint 3** → Media (experiencia). Semana 3.
4. **Sprint 4** → Media-baja (UX profesor). Semanas 4-5.
5. **Sprint 5** → Diseño solo. Ejecutar cuando se planee v6.

---

*Fin de auditoría.*
