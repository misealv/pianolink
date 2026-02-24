# RFC-001: Unificar Roles `client` + `student` → `student`

**Fecha:** 24 de febrero de 2026  
**Autor:** Arquitecto Senior / Copilot  
**Estado:** Propuesta  
**Sprint:** 5 (Diseño)  
**Impacto:** 🔴 BREAKING CHANGE — requiere migración de datos en producción

---

## 1. Resumen Ejecutivo

Actualmente PianoLink tiene **2 roles del lado alumno** (`client` y `student`) que comparten el 90% de la lógica pero generan bifurcaciones en el código de booking, pagos, reembolsos y UI. Este RFC propone **eliminar el rol `client`** y unificar todo en `student` con un flag `isGuardian` para soportar padres/tutores que inscriben menores.

---

## 2. Problema

### 2.1 La dualidad actual

| Escenario | Rol actual | Quién paga | Quién toma clase |
|-----------|-----------|------------|-------------------|
| Adulto toma clases | `client` (individual) | Él mismo | Él mismo |
| Padre inscribe hijo | `client` (guardian) | El padre | `managedStudents[i]` (subdocumento) |
| Profesor invita alumno | `student` | Él mismo o guardian | Él mismo |

### 2.2 Código que bifurca

El patrón se repite **idénticamente** en 4 métodos de `BookingService.js`:

```javascript
// BookingService — cancelBooking, respondRecovery, cancelByTeacher, bookSlot
if (payer.role === 'client' && payer.clientData?.accountType === 'guardian') {
    const student = await User.findById(booking.studentId);
    const studentIndex = payer.clientData.managedStudents.findIndex(
        s => s.name.toLowerCase() === student?.name?.toLowerCase()
    );
    if (studentIndex >= 0) {
        payer.clientData.managedStudents[studentIndex].classesRemaining++;
        payer.markModified('clientData.managedStudents');
    }
} else {
    payer.classesRemaining++;
}
```

### 2.3 Impacto cuantificado

| Métrica | Valor actual |
|---------|-------------|
| Archivos con lógica `client` vs `student` | **14+** |
| Ocurrencias de `managedStudents` en código | **87+** |
| Modelos con `classesRemaining` duplicado | **5** |
| Middleware `studentOrClient` (parche) | **1** (usado en 2 rutas) |
| Bifurcaciones de reembolso idénticas | **4** en BookingService |

---

## 3. Propuesta

### 3.1 Modelo unificado

```
User {
  role: 'admin' | 'teacher' | 'student'     // ← SE ELIMINA 'client'
  
  studentData: {
    // --- Existentes (se mantienen) ---
    source: 'platform' | 'invited' | 'gift_invite',
    assignedTeacher: ObjectId → User,
    level, instrument, age,
    
    // --- NUEVOS ---
    isGuardian: Boolean (default: false),     // Reemplaza clientData.accountType === 'guardian'
    parentId: ObjectId → User (default: null), // Si es menor, apunta al guardian
    billingEmail: String,                      // Migrado desde clientData.billingEmail
  }
  
  // SE ELIMINAN:
  // - clientData { accountType, managedStudents[], billingEmail }
  // - classesRemaining (legacy en User root)
}
```

### 3.2 Reglas de negocio

| Regla | Implementación |
|-------|---------------|
| Adulto toma sus propias clases | `role: 'student', isGuardian: false, parentId: null` |
| Padre inscribe hijos | `role: 'student', isGuardian: true` → Hijos son Users con `role: 'student', parentId: padre._id` |
| Hijo menor (sin login) | `role: 'student', parentId: padre._id, password: randomHash` → Login opcional vía magic link cuando cumpla 13 |
| Quién paga | `StudentSubscription.studentId` apunta al que toma clase. `StudentSubscription.payerId` (NUEVO) apunta al que paga. Si no existe payerId, el estudiante paga por sí mismo |
| Profesor invita alumno | Crea User con `role: 'student'` directamente (sin `client`) |

### 3.3 Cambios en Booking

```javascript
// ANTES (ambiguo)
Booking {
  studentId,    // A veces es el alumno real, a veces el client que paga
  clientId,     // Opcional, solo si role=client
}

// DESPUÉS (explícito)
Booking {
  studentId,    // SIEMPRE el que toma la clase (el alumno real)
  payerId,      // SIEMPRE el que paga (puede ser === studentId si paga por sí mismo)
}
```

### 3.4 Impacto en middleware

```javascript
// ANTES
const studentOrClient = (req, res, next) => {
    if (!['student', 'client', 'admin'].includes(req.user.role)) {
        return res.status(403).json({ message: 'Acceso solo para estudiantes' });
    }
    next();
};

// DESPUÉS — se simplifica a:
const studentOnly = (req, res, next) => {
    if (!['student', 'admin'].includes(req.user.role)) {
        return res.status(403).json({ message: 'Acceso solo para estudiantes' });
    }
    next();
};
```

---

## 4. Fuente de Verdad del Saldo

### 4.1 Estado actual (5 ubicaciones)

| # | Ubicación | Escritura | Lectura |
|---|-----------|-----------|---------|
| 1 | `User.classesRemaining` | BookingService | BalanceService (fallback 3) |
| 2 | `User.clientData.managedStudents[].classesRemaining` | BookingService | BalanceService (fallback 4) |
| 3 | `StudentSubscription.classesRemaining` | BookingService, BalanceService | BalanceService (prioridad 1) |
| 4 | `Enrollment.classesRemaining` | Sincronización | BalanceService (deprecated) |
| 5 | `StudentEnrollment.classesRemaining` | Sincronización | BalanceService (fallback 2) |

### 4.2 Estado propuesto (1 ubicación)

```
StudentSubscription.classesRemaining  ← ÚNICA fuente de verdad
```

**Todas las demás ubicaciones se eliminan.** BookingService, BalanceService y cualquier otro servicio SOLO lee/escribe de `StudentSubscription`.

---

## 5. Plan de Migración (ver RFC-002)

**Fases:**

1. **Migración de `managedStudents[]`** → Promover a Users reales con `role: 'student'` + `parentId`
2. **Migración de `role: 'client'`** → Cambiar a `role: 'student'` con `isGuardian: true` si tiene hijos
3. **Migración de Booking** → Renombrar `clientId` → `payerId`
4. **Eliminación de campos legacy** → `User.classesRemaining`, `clientData`, `Enrollment.classesRemaining`

---

## 6. Archivos Afectados

### 6.1 Backend (cambios obligatorios)

| Archivo | Cambio |
|---------|--------|
| `models/User.js` | Eliminar `clientData`, agregar `studentData.isGuardian/parentId/billingEmail`, eliminar `classesRemaining` root |
| `services/BookingService.js` | Eliminar bifurcación client/student en 6+ métodos. Usar `payerId` |
| `services/BalanceService.js` | Eliminar fallbacks 2-5. Solo `StudentSubscription` |
| `middleware/authMiddleware.js` | `studentOrClient` → `studentOnly`, eliminar 'client' del enum |
| `routes/bookingRoutes.js` | `clientId` → `payerId`, actualizar guards |
| `routes/clientRoutes.js` | Renombrar a `studentRoutes.js`, eliminar bifurcaciones |
| `routes/studentInviteRoutes.js` | Crear Users con `role: 'student'` en vez de `client` |
| `routes/payment.js` | Eliminar restricción `role !== 'student'` → usar `studentOnly` |
| `routes/welcomeKitRoutes.js` | Eliminar lógica de `managedStudents` |
| `controllers/adminController.js` | Eliminar 12+ refs a `managedStudents`, adaptar vistas admin |

### 6.2 Frontend (cambios obligatorios)

| Archivo | Cambio |
|---------|--------|
| `public/cliente.html` | Renombrar a `estudiante.html`, eliminar lógica `managedStudents` |
| `public/js/modules/BookingModal.js` | Eliminar 7+ refs a `managedStudents`, usar selector de dependiente vía API |
| `public/js/admin.js` | Eliminar 17+ refs a `managedStudents` |

### 6.3 Modelos a deprecar/eliminar

| Modelo | Acción |
|--------|--------|
| `Enrollment.js` | **ELIMINAR** — migrar enrollments activos a `StudentEnrollment` |
| `StudentEnrollment.classesRemaining` | **ELIMINAR CAMPO** — fuente de verdad es `StudentSubscription` |

---

## 7. Riesgos

| Riesgo | Probabilidad | Mitigación |
|--------|-------------|------------|
| Datos huérfanos en migración de `managedStudents` | Media | Script de auditoría antes de migrar |
| Guardians sin estudiantes reales post-migración | Baja | Crear User incluso si `managedStudents[]` está vacío |
| Booking históricos con `clientId` roto | Media | Migración batch: `clientId` → `payerId` con backfill |
| `Enrollment.roomId` es `required` | Alta | Migrar a `StudentEnrollment` que no lo requiere |
| Frontend hardcodea `role === 'client'` | Media | Grep exhaustivo + fase de compatibilidad temporal |

---

## 8. Fase de Compatibilidad (opcional, 2-4 semanas)

Para evitar un big-bang, se puede hacer una fase intermedia:

1. Agregar `studentData.isGuardian` y `studentData.parentId` al schema actual
2. Hacer que `studentOrClient` middleware acepte ambos roles
3. Migrar gradualmente las bifurcaciones en servicios
4. Cuando todo el código usa la nueva estructura → ejecutar migración de datos
5. Eliminar `clientData`, `classesRemaining` legacy, y rol `client` del enum

---

*Fin de RFC-001.*
