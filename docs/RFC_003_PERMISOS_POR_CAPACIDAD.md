# RFC-003: Sistema de Permisos por Capacidad

**Fecha:** 24 de febrero de 2026  
**Autor:** Arquitecto Senior / Copilot  
**Estado:** Propuesta  
**Sprint:** 5 (Diseño)  
**Depende de:** RFC-001 (eliminación del rol `client`)  
**Impacto:** 🟠 Refactor interno — sin cambio de datos en producción

---

## 1. Resumen Ejecutivo

El sistema actual mezcla **dos mecanismos de autorización** independientes:

| Mecanismo | Alcance | Dónde vive |
|-----------|---------|------------|
| Rol (`admin`, `teacher`, `student`, `client`) | Acceso grueso a rutas | `authMiddleware.js` — 4 guards fijos |
| Feature Flag (`canInvitePrivateStudents`, `hasPriorityQueue`) | Funcionalidades de plan | `requirePermission.js` — solo profesores |

Además, hay **checks inline** de `req.user.role === 'X'` dispersos en 10+ archivos de rutas/controllers.

Este RFC propone **unificar todo en un sistema de capacidades (capabilities)** que:
- Reemplaza los guards rígidos por consultas a un mapa de capabilities
- Extiende el modelo a ALL roles (no solo teachers)
- Centraliza la lógica de autorización en un solo lugar
- Elimina los checks inline de rol

---

## 2. Problema Actual

### 2.1 Guards rígidos que no escalan

```javascript
// authMiddleware.js — cada nuevo caso requiere un guard nuevo
const adminOnly = ...          // admin
const teacherOrAdmin = ...     // teacher | admin
const studentOrClient = ...    // student | client | admin  (← desaparece con RFC-001)
// ¿teacherOrStudentOrAdmin? ¿studentWithGuardian? → no existe
```

### 2.2 Feature flags solo para teachers

```javascript
// requirePermission.js — solo aplica a teachers
if (user.role !== 'teacher') return 403;  // ← Nunca aplica a students
```

Un estudiante no tiene feature flags. Si mañana queremos "el estudiante puede exportar su bitácora" o "el estudiante puede ver replay de clase", no hay infraestructura.

### 2.3 Checks inline dispersos

```javascript
// routes/bookingRoutes.js:54
if (req.user.role === 'client') { ... }

// routes/rooms.js:20
if (req.user.role === 'teacher' || req.user.role === 'admin') { ... }

// routes/classSessionRoutes.js:40
if (req.user.role === 'teacher') { ... }

// controllers/adminController.js:268
if (client.role === 'client' || (client.role === 'student' && client.kitPurchased)) { ... }
```

Cada check es una decisión de autorización **invertida** — en vez de preguntar "¿puede hacer X?", pregunta "¿es del rol Y?" y asume lo que Y puede hacer.

### 2.4 Admin bypass implícito

Cada guard hardcodea `|| req.user.role === 'admin'` individualmente. Si se olvida, un admin pierde acceso. Si se agrega mal, abre un agujero.

---

## 3. Propuesta: Sistema de Capabilities

### 3.1 Concepto

Una **capability** es una acción atómica que un usuario puede o no realizar. Se define como string constante y se resuelve en runtime según contexto (rol, plan, membresía, etc.).

```javascript
// Ejemplo de uso en ruta:
router.post('/invite', protect, can('invite:private_student'), handler);

// Ejemplo de uso en lógica:
if (await userCan(req.user, 'booking:cancel_as_teacher')) { ... }
```

### 3.2 Catálogo de Capabilities

#### Booking

| Capability | Descripción | Quién tiene acceso |
|------------|-------------|-------------------|
| `booking:create` | Reservar una clase | `student`, `admin` |
| `booking:cancel_own` | Cancelar una reserva propia | `student`, `admin` |
| `booking:cancel_as_teacher` | Cancelar clase de un alumno (reembolso) | `teacher` del slot, `admin` |
| `booking:view_own` | Ver mis reservas | `student`, `teacher`, `admin` |
| `booking:view_all` | Ver todas las reservas del sistema | `admin` |

#### Calendario / Disponibilidad

| Capability | Descripción | Quién tiene acceso |
|------------|-------------|-------------------|
| `calendar:manage_slots` | Crear/editar/eliminar slots de disponibilidad | `teacher`, `admin` |
| `calendar:view_teacher` | Ver agenda semanal del profesor (propia) | `teacher`, `admin` |

#### Estudiantes

| Capability | Descripción | Quién tiene acceso |
|------------|-------------|-------------------|
| `student:view_own_enrollments` | Ver mis inscripciones y saldo | `student`, `admin` |
| `student:view_my_students` | Ver lista de mis alumnos | `teacher`, `admin` |
| `student:manage_journal` | Crear/editar entradas de bitácora | `teacher` (de ese alumno), `admin` |
| `student:view_journal` | Ver bitácora (shared entries) | `student` (la propia), `teacher` (de ese alumno), `admin` |

#### Invitaciones

| Capability | Descripción | Quién tiene acceso |
|------------|-------------|-------------------|
| `invite:private_student` | Invitar alumno privado por email | `teacher` con plan premium/founder + membresía activa |
| `invite:view_own` | Ver estado de mis invitaciones | `teacher`, `admin` |

#### Validación de Clases

| Capability | Descripción | Quién tiene acceso |
|------------|-------------|-------------------|
| `class:validate` | Marcar clase como completada / no-show | `teacher` de esa clase, `admin` |
| `class:confirm` | Confirmar/disputar validación del profesor | `student` de esa clase, `admin` |
| `class:view_sessions` | Ver historial de sesiones | `teacher`, `student` (las propias), `admin` |

#### Perfil Público

| Capability | Descripción | Quién tiene acceso |
|------------|-------------|-------------------|
| `profile:edit_public` | Editar perfil público del profesor | `teacher`, `admin` |
| `profile:manage_rates` | Cambiar tarifa y paquetes | `teacher`, `admin` |

#### Sala de Clase

| Capability | Descripción | Quién tiene acceso |
|------------|-------------|-------------------|
| `room:enter_own` | Entrar a mi sala como profesor/owner | `teacher` (owner), `admin` |
| `room:enter_as_student` | Entrar a sala como alumno (requiere enrollment + suscripción) | `student` con enrollment activo |
| `room:enter_as_guest` | Entrar como invitado (con slot de demo o link) | cualquiera con link válido |

#### Administración

| Capability | Descripción | Quién tiene acceso |
|------------|-------------|-------------------|
| `admin:manage_users` | CRUD de usuarios | `admin` |
| `admin:manage_kits` | Gestionar welcome kits | `admin` |
| `admin:manage_payouts` | Aprobar/procesar pagos a profesores | `admin` |
| `admin:view_dashboard` | Ver dashboard admin con métricas | `admin` |
| `admin:impersonate` | Ver como otro usuario | `admin` |

#### Plan / Membresía (teachers)

| Capability | Descripción | Quién tiene acceso |
|------------|-------------|-------------------|
| `plan:priority_queue` | Asignación prioritaria de alumnos | `teacher` con plan premium/founder + membresía activa |
| `plan:zero_commission_private` | 0% comisión en alumnos privados | `teacher` con plan premium/founder + membresía activa |

---

### 3.3 Resolución de Capabilities

Una capability se resuelve consultando un **CapabilityResolver** que evalúa múltiples factores:

```javascript
// services/CapabilityResolver.js

const ROLE_CAPABILITIES = {
    admin: ['*'],  // Wildcard — admin puede todo
    teacher: [
        'booking:cancel_as_teacher',
        'booking:view_own',
        'calendar:manage_slots',
        'calendar:view_teacher',
        'student:view_my_students',
        'student:manage_journal',
        'student:view_journal',
        'invite:view_own',
        'class:validate',
        'class:view_sessions',
        'profile:edit_public',
        'profile:manage_rates',
        'room:enter_own',
    ],
    student: [
        'booking:create',
        'booking:cancel_own',
        'booking:view_own',
        'student:view_own_enrollments',
        'student:view_journal',
        'class:confirm',
        'class:view_sessions',
        'room:enter_as_student',
    ]
};

// Capabilities condicionales — requieren evaluación extra
const CONDITIONAL_CAPABILITIES = {
    'invite:private_student': (user) => {
        if (user.role !== 'teacher') return false;
        const perms = user.teacherData?.permissions;
        const status = user.teacherData?.subscriptionStatus;
        return perms?.canInvitePrivateStudents &&
               ['active', 'trial'].includes(status);
    },
    'plan:priority_queue': (user) => {
        if (user.role !== 'teacher') return false;
        const perms = user.teacherData?.permissions;
        const status = user.teacherData?.subscriptionStatus;
        return perms?.hasPriorityQueue &&
               ['active', 'trial'].includes(status);
    },
    'plan:zero_commission_private': (user) => {
        if (user.role !== 'teacher') return false;
        const plan = user.teacherData?.plan;
        const status = user.teacherData?.subscriptionStatus;
        return ['premium', 'founder'].includes(plan) &&
               ['active', 'trial'].includes(status);
    }
};
```

### 3.4 API del Resolver

```javascript
class CapabilityResolver {

    /**
     * Verificar si un usuario tiene una capability.
     * @param {Object} user - Documento User de Mongoose
     * @param {string} capability - Key de capability (e.g. 'booking:create')
     * @returns {boolean}
     */
    static can(user, capability) {
        if (!user) return false;

        // Admin wildcard
        const roleCaps = ROLE_CAPABILITIES[user.role] || [];
        if (roleCaps.includes('*')) return true;

        // Capability directa por rol
        if (roleCaps.includes(capability)) return true;

        // Capability condicional
        const cond = CONDITIONAL_CAPABILITIES[capability];
        if (cond) return cond(user);

        return false;
    }

    /**
     * Obtener TODAS las capabilities de un usuario.
     * Útil para enviar al frontend en login.
     * @param {Object} user
     * @returns {string[]}
     */
    static getAll(user) {
        if (!user) return [];
        const roleCaps = ROLE_CAPABILITIES[user.role] || [];
        if (roleCaps.includes('*')) return ['*'];

        const caps = [...roleCaps];

        // Evaluar condicionales
        for (const [key, fn] of Object.entries(CONDITIONAL_CAPABILITIES)) {
            if (fn(user)) caps.push(key);
        }

        return caps;
    }
}
```

---

## 4. Middleware Propuesto

### 4.1 `can(capability)` — reemplazo de todos los guards

```javascript
// middleware/can.js
const CapabilityResolver = require('../services/CapabilityResolver');

/**
 * Middleware de autorización por capability.
 * Reemplaza adminOnly, teacherOrAdmin, studentOrClient, requirePermission.
 * 
 * @param {string} capability - Capability requerida
 * @returns {Function} Express middleware
 */
function can(capability) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ success: false, message: 'No autorizado' });
        }

        if (CapabilityResolver.can(req.user, capability)) {
            return next();
        }

        // Determinar si es problema de plan o de rol
        const isConditional = capability in CONDITIONAL_CAPABILITIES;
        if (isConditional && req.user.role === 'teacher') {
            // El profesor no tiene el plan adecuado
            return res.status(403).json({
                success: false,
                message: `Esta función requiere un plan superior.`,
                upgradeRequired: true,
                currentPlan: req.user.teacherData?.plan || 'free'
            });
        }

        return res.status(403).json({
            success: false,
            message: 'No tienes permiso para realizar esta acción.'
        });
    };
}

module.exports = can;
```

### 4.2 Tabla de equivalencia: guards actuales → capabilities

| Guard actual | Se reemplaza por | Capability |
|-------------|-----------------|------------|
| `adminOnly` | `can('admin:manage_users')` | Cualquier cap `admin:*` |
| `teacherOrAdmin` | `can('calendar:manage_slots')` | La cap específica de la ruta |
| `studentOrClient` | `can('booking:create')` | Se elimina con RFC-001 |
| `requirePermission('canInvitePrivateStudents')` | `can('invite:private_student')` | Incluye check de plan+membresía |
| `requirePermission('hasPriorityQueue')` | `can('plan:priority_queue')` | Incluye check de plan+membresía |

### 4.3 Migración de rutas — Antes / Después

```javascript
// === INVITACIONES ===

// ANTES
router.post('/generate', protect, teacherOrAdmin, requirePermission('canInvitePrivateStudents'), generateInvite);
// DESPUÉS
router.post('/generate', protect, can('invite:private_student'), generateInvite);


// === CALENDARIO ===

// ANTES
router.post('/slots', protect, teacherOrAdmin, createSlots);
// DESPUÉS
router.post('/slots', protect, can('calendar:manage_slots'), createSlots);


// === BOOKING ===

// ANTES
router.post('/', protect, studentOrClient, createBooking);
// DESPUÉS
router.post('/', protect, can('booking:create'), createBooking);


// === ADMIN ===

// ANTES
router.get('/users', protect, adminOnly, listUsers);
// DESPUÉS
router.get('/users', protect, can('admin:manage_users'), listUsers);


// === CLASS SESSIONS ===

// ANTES
router.post('/:id/teacher-complete', protect, (req, res, next) => {
    if (req.user.role !== 'teacher' && req.user.role !== 'admin') return res.status(403).json({...});
    next();
}, markComplete);
// DESPUÉS
router.post('/:id/teacher-complete', protect, can('class:validate'), markComplete);
```

---

## 5. Frontend: Capabilities en Login

### 5.1 Endpoint de capabilities

```javascript
// El endpoint de login/me ya retorna el user.
// Se agrega capabilities[] al response:

// routes/authRoutes.js — POST /api/auth/login
res.json({
    _id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    token,
    capabilities: CapabilityResolver.getAll(user)  // NUEVO
});
```

### 5.2 Uso en frontend

```javascript
// En vez de:
if (user.role === 'teacher' || user.role === 'admin') {
    showButton('createSlot');
}

// Se usa:
if (user.capabilities.includes('calendar:manage_slots')) {
    showButton('createSlot');
}

// Para admin wildcard:
function userCan(cap) {
    return user.capabilities.includes('*') || user.capabilities.includes(cap);
}
```

---

## 6. Scope-Level Authorization (Fase 2 — Futuro)

El sistema de capabilities base resuelve "¿puede hacer X?". Pero no resuelve "¿puede hacer X **sobre el recurso Y**?".

Ejemplo: un teacher puede `class:validate`, pero solo sus propias clases, no las de otro teacher.

### 6.1 Propuesta de scope checks

```javascript
// Fase 2: Scope validation en cada handler
// (NO es middleware — es lógica de negocio en el service)

async function markComplete(req, res) {
    const session = await ClassSession.findById(req.params.id);

    // El middleware `can('class:validate')` ya verificó que TIENE la capability.
    // Ahora verificamos el SCOPE: ¿es SU clase?
    if (req.user.role !== 'admin' &&
        !session.teacherId.equals(req.user._id)) {
        return res.status(403).json({ message: 'Solo puedes validar tus propias clases' });
    }

    // ... proceder
}
```

### 6.2 Roadmap de scope

| Recurso | Scope check | Prioridad |
|---------|------------|-----------|
| ClassSession | `teacherId === req.user._id` | Alta — ya existe inline |
| Booking (cancel) | `studentId === req.user._id` o `teacherId === req.user._id` | Alta |
| Journal entries | `enrollment.teacher === req.user._id` | Media |
| Room access | enrollment + subscription check | Ya cubierto por gatekeeper |
| Student list | enrollments del teacher | Ya cubierto por query |

> **Nota:** Los scope checks se mantienen en services/handlers, NO en el middleware de capabilities. El middleware resuelve "¿tiene la capability?". El service resuelve "¿sobre este recurso específico?".

---

## 7. Plan de Implementación

### Fase 1 — Infraestructura (sin cambio de comportamiento)

| # | Tarea | Esfuerzo |
|---|-------|----------|
| 7.1 | Crear `services/CapabilityResolver.js` con `ROLE_CAPABILITIES` y `CONDITIONAL_CAPABILITIES` | 2h |
| 7.2 | Crear `middleware/can.js` | 1h |
| 7.3 | Agregar `capabilities[]` al response de login/me | 30min |
| 7.4 | Tests unitarios: `CapabilityResolver.can()` con cada rol × cada capability | 2h |

### Fase 2 — Migración gradual de rutas

| # | Tarea | Esfuerzo |
|---|-------|----------|
| 7.5 | Migrar `routes/invite.js` — reemplazar `requirePermission` → `can()` | 1h |
| 7.6 | Migrar `routes/bookingRoutes.js` — reemplazar `studentOrClient` + checks inline | 2h |
| 7.7 | Migrar `routes/classSessionRoutes.js` — eliminar checks inline de rol | 1h |
| 7.8 | Migrar `routes/rooms.js` — reemplazar checks inline | 1h |
| 7.9 | Migrar rutas admin — reemplazar `adminOnly` → `can('admin:*')` específico | 1h |
| 7.10 | Migrar `routes/calendar*.js` — reemplazar `teacherOrAdmin` | 30min |

### Fase 3 — Limpieza

| # | Tarea | Esfuerzo |
|---|-------|----------|
| 7.11 | Eliminar `adminOnly`, `teacherOrAdmin`, `studentOrClient` de `authMiddleware.js` | 30min |
| 7.12 | Eliminar `requirePermission.js` | 30min |
| 7.13 | Grep global `req.user.role ===` y sustituir por `CapabilityResolver.can()` o `can()` | 2h |
| 7.14 | Actualizar frontend: `user.role` → `user.capabilities` en UI conditionals | 2h |

**Esfuerzo total estimado:** ~16h (2-3 días)

---

## 8. Compatibilidad con el Sistema Actual

### 8.1 Coexistencia durante migración

`authMiddleware.js` y `can.js` pueden coexistir. Las rutas se migran una por una:

```javascript
// Ruta ya migrada:
router.post('/slots', protect, can('calendar:manage_slots'), createSlots);

// Ruta aún no migrada (sigue funcionando):
router.get('/students', protect, teacherOrAdmin, listStudents);
```

### 8.2 `PlanPermissionService` se mantiene

El `PlanPermissionService` sigue siendo responsable de **sincronizar** `teacherData.permissions` cuando cambia el plan. El `CapabilityResolver` simplemente **lee** esos campos.

```
Plan change → PlanPermissionService.syncPermissions() → guarda en teacherData.permissions
Request     → CapabilityResolver.can()               → lee teacherData.permissions
```

No compiten — tienen responsabilidades distintas (escritura vs lectura).

### 8.3 `protect` se mantiene

`protect` (autenticación JWT) **no se toca**. El flujo sigue siendo:

```
protect (¿quién eres?) → can (¿puedes hacer esto?) → handler
```

---

## 9. Archivos Afectados

| Archivo | Cambio |
|---------|--------|
| **NUEVO** `services/CapabilityResolver.js` | Resolver central de capabilities |
| **NUEVO** `middleware/can.js` | Middleware de autorización |
| `middleware/authMiddleware.js` | Se mantiene `protect`. Se deprecan `adminOnly`, `teacherOrAdmin`, `studentOrClient` |
| `middleware/requirePermission.js` | Se elimina (absorbido por `can.js`) |
| `routes/invite.js` | `requirePermission(...)` → `can(...)` |
| `routes/bookingRoutes.js` | `studentOrClient` → `can('booking:create')`, eliminar checks inline |
| `routes/classSessionRoutes.js` | Checks inline → `can('class:validate')` |
| `routes/rooms.js` | Checks inline → `can('room:enter_own')` |
| Rutas admin (~5 archivos) | `adminOnly` → `can('admin:...')` |
| `routes/calendarRoutes.js` | `teacherOrAdmin` → `can('calendar:manage_slots')` |
| `routes/authRoutes.js` | Agregar `capabilities[]` al response |
| `services/PlanPermissionService.js` | Sin cambio (se mantiene para sincronización) |

---

## 10. Testing

### 10.1 Matriz de prueba

```
Para cada capability en el catálogo:
  ✓ Admin siempre puede (wildcard)
  ✓ Rol correcto con condiciones cumplidas → 200
  ✓ Rol correcto sin condiciones (plan free) → 403 con upgradeRequired
  ✓ Rol incorrecto → 403
  ✓ Sin autenticar → 401
```

### 10.2 Ejemplo de test

```javascript
describe('CapabilityResolver', () => {
    it('admin tiene wildcard', () => {
        const admin = { role: 'admin' };
        expect(CapabilityResolver.can(admin, 'booking:create')).toBe(true);
        expect(CapabilityResolver.can(admin, 'admin:manage_users')).toBe(true);
        expect(CapabilityResolver.can(admin, 'random:nonexistent')).toBe(true);
    });

    it('teacher puede validar clases', () => {
        const teacher = { role: 'teacher' };
        expect(CapabilityResolver.can(teacher, 'class:validate')).toBe(true);
    });

    it('teacher free NO puede invitar alumnos privados', () => {
        const teacher = {
            role: 'teacher',
            teacherData: { plan: 'free', permissions: { canInvitePrivateStudents: false } }
        };
        expect(CapabilityResolver.can(teacher, 'invite:private_student')).toBe(false);
    });

    it('teacher premium activo SÍ puede invitar', () => {
        const teacher = {
            role: 'teacher',
            teacherData: {
                plan: 'premium',
                subscriptionStatus: 'active',
                permissions: { canInvitePrivateStudents: true }
            }
        };
        expect(CapabilityResolver.can(teacher, 'invite:private_student')).toBe(true);
    });

    it('student puede reservar pero NO validar', () => {
        const student = { role: 'student' };
        expect(CapabilityResolver.can(student, 'booking:create')).toBe(true);
        expect(CapabilityResolver.can(student, 'class:validate')).toBe(false);
    });

    it('student NO puede acceder a admin', () => {
        const student = { role: 'student' };
        expect(CapabilityResolver.can(student, 'admin:manage_users')).toBe(false);
    });
});
```

---

## 11. Extensibilidad Futura

El catálogo de capabilities es un objeto JS plano. Agregar una nueva capability es trivial:

```javascript
// 1. Agregar al catálogo
ROLE_CAPABILITIES.student.push('export:journal_pdf');

// 2. Usar en ruta
router.get('/journal/export', protect, can('export:journal_pdf'), exportHandler);

// 3. Frontend check
if (userCan('export:journal_pdf')) showExportButton();
```

Si la capability es condicional (requiere plan, membresía, etc.), se agrega a `CONDITIONAL_CAPABILITIES`:

```javascript
CONDITIONAL_CAPABILITIES['export:journal_pdf'] = (user) => {
    return user.role === 'student' && user.studentData?.hasPremiumFeatures;
};
```

---

*Fin de RFC-003.*
