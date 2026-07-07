# Auditoría y Reparación del Sistema de Reservas de Clases — PianoLink

**Fecha:** 1 de mayo de 2026
**Caso testigo:** Alumno **José Wilhelmy** debe poder reservar clases de piano contra un paquete prepagado de **50 clases / validez 1 año**, comprado por transferencia bancaria al profesor **Miguel Sepúlveda** (`693dcdfb8189f12ab33f4747`). Sin comisión PianoLink (cobro fuera de plataforma — sólo registramos consumo).

---

## 1. Resumen ejecutivo

Hay **tres bugs bloqueantes** y **un vacío funcional** que impiden que el caso funcione hoy:

| # | Severidad | Síntoma | Causa raíz |
|---|---|---|---|
| B1 | 🔴 Crítico | Suscripciones nunca se encuentran al reservar → siempre cae al fallback `User.classesRemaining` | `BookingService.bookSlot` filtra por `validUntil` mientras el modelo `StudentSubscription` declara el campo como `expiresAt` |
| B2 | 🔴 Crítico | Suscripciones `exhausted` jamás se reactivan correctamente | Misma discrepancia `validUntil` vs `expiresAt` repetida en 3 lugares más de `BookingService.js` (L446, L780, L892) |
| B3 | 🟠 Alto | El profesor crea un slot a las 18:00 y al alumno (u otro browser) le aparece en otra hora | El frontend envía hora local sin marcar la TZ del template; el alumno renderiza con `toLocaleString` del navegador, que aplica su propia TZ. Cuando ambos coinciden con la TZ del template parece que funciona; cuando no, "baila". DST en Chile (abril/septiembre) lo agrava. |
| V1 | 🟠 Alto | No existe forma admin/profesor de **acreditar 50 clases pagadas por transferencia** sin pasar por MercadoPago | `POST /api/subscriptions/purchase` exige `paymentId` y hardcodea `paymentProvider: 'mercadopago'`. El endpoint manual existente (`addClassesToClient`) modifica `User.classesRemaining` legacy, no crea `StudentSubscription` por-profesor. |

> **Decisión de negocio confirmada por el usuario:** las 50 clases prepagadas a Miguel **no generan comisión** a PianoLink. Esto se modela con un `StudentSubscription` cuyo `escrowBalanceUSD = 0`, `releasedToTeacherUSD = totalPaidUSD`, `platformFeeCollectedUSD = 0` y `paymentProvider = 'manual'`.

---

## 2. Inventario de archivos involucrados

### Modelo de datos
- [models/StudentSubscription.js](models/StudentSubscription.js) — schema correcto, usa `expiresAt`, soporta `classesRemaining`, escrow.
- [models/TeacherPackage.js](models/TeacherPackage.js#L48) — `validityDays` admite **máx 365** ✓ compatible con el caso.
- [models/TimeSlot.js](models/TimeSlot.js#L22) — guarda `startTime` / `endTime` en UTC (Mongoose `Date`), **sin** snapshot de timezone del slot.
- [models/AvailabilityTemplate.js](models/AvailabilityTemplate.js) — **único** lugar donde vive la TZ original del profesor.
- [models/Booking.js](models/Booking.js#L49) — sí guarda `teacherTimezone` y `studentTimezone` snapshot.
- [models/ClassSession.js](models/ClassSession.js#L28) — sólo `scheduledAt` UTC, sin TZ.

### Servicios y rutas
- [services/BookingService.js](services/BookingService.js#L111) — **bug B1 aquí**.
- [services/AvailabilityService.js](services/AvailabilityService.js#L2) — usa `moment-timezone`, conversión local→UTC en `slotStart.utc().toDate()` (L54-56). La conversión backend está bien; el problema está en el frontend.
- [routes/subscriptionRoutes.js](routes/subscriptionRoutes.js#L280) — `POST /api/subscriptions/purchase` (no apto para transferencia).
- [routes/subscription.js](routes/subscription.js#L143) — `POST /api/subscription/:id/payment` con `createManualPayment` (legacy, modelo `Subscription` viejo, no `StudentSubscription`).
- [routes/availabilityRoutes.js](routes/availabilityRoutes.js#L38) — `POST /api/availability/templates`.
- [controllers/adminController.js](controllers/adminController.js#L343) — `addClassesToClient`: actualiza `User.classesRemaining` legacy + `paymentHistory[]`. **No** crea `StudentSubscription`.

### Frontend
- [public/teacher-availability.html](public/teacher-availability.html#L847) — formulario de creación de slots por el profesor (selector de TZ, inputs `addDate`/`addStartTime`).
- [public/mis-clases.html](public/mis-clases.html) — vista del alumno; usa `toLocaleString` del navegador.
- [public/js/admin.js](public/js/admin.js#L6646) — frontend del flujo `add-classes` legacy.

### Scripts/jobs
- [jobs/package-expiration.js](jobs/package-expiration.js) — corre diario, depende de `classesExpiresAt`.
- [jobs/balance-reconciliation.js](jobs/balance-reconciliation.js) — reconciliación nocturna.
- [services/PayoutCronService.js](services/PayoutCronService.js) — payout mensual, **calcula 80/20**. Riesgo: si una `ClassSession` proviene de suscripción `manual` sin comisión, debe excluirse del payout o registrarse con `platformFeeUSD = 0`. **[BUSINESS LOGIC RISK]**

---

## 3. Bug del calendario (B3) — análisis detallado

### Síntoma
Miguel crea un slot "lunes 18:00" en su panel; al alumno le aparece, por ejemplo, "lunes 21:00" o "lunes 17:00" después del cambio de horario.

### Hipótesis ranqueadas
1. **El frontend envía la hora sin TZ explícita.** [`teacher-availability.html`](public/teacher-availability.html#L1046) toma `addDate.value + addStartTime.value` (string `YYYY-MM-DDTHH:MM`) y lo pasa directo. Si el backend hace `new Date(string)` sin combinar con la TZ del template, lo interpreta como UTC del servidor (Fly = UTC), no como hora local del profesor. Resultado: desfase = offset del profesor (ej. Chile −04 / −03 según DST).
2. **El alumno renderiza con `toLocaleString` del navegador**, lo que es correcto **si y sólo si** el `Date` guardado en BD es el instante real correcto. Si la hipótesis 1 es cierta, el alumno ve un instante mal calculado, recorrido por su propio offset.
3. **DST chileno (abril y septiembre).** Si los slots se generan en lote para 6 meses con `moment.tz(...)` y la lógica usa `dayMoment.clone().hour(h)` cruzando un cambio de DST, `moment-timezone` aplica el offset del día base, no del día final. Esto produce slots desplazados 1 hora durante un período del año.
4. **`TimeSlot` no guarda la TZ con la que fue creado.** Aunque la TZ vive en `AvailabilityTemplate`, no se replica en cada slot. Si el profesor cambia la TZ del template más tarde, los slots históricos quedan huérfanos de contexto.

### Verificación pendiente
- Loggear, en `POST /api/availability/templates` y en `POST /api/availability/single-slot`, el `req.body` crudo + el `Date` final guardado, durante 24 h. Caso testigo: Miguel + un alumno en TZ distinta a Chile.
- Probar generación de slots cruzando el 6 de septiembre 2026 (cambio DST primavera CL).

---

## 4. Plan de reparación por fases

> **Regla:** ninguna fase toca dinero real. Las migraciones son aditivas (nuevos campos, nuevas rutas). Cada fase tiene gate de QA y rollback documentado.

### **FASE 0 — Preparación (no productiva)**
**Objetivo:** dejar el entorno listo sin tocar producción.
- [ ] Snapshot Mongo Atlas del cluster productivo.
- [ ] Branch `fix/booking-system-josewilhelmy`.
- [ ] Crear usuario `User` para José Wilhelmy (rol `client`, individual) si todavía no existe.
- [ ] Confirmar `teacherId` de Miguel: `693dcdfb8189f12ab33f4747`.
- [ ] Definir `TeacherPackage` "Plan Anual 50 clases — Miguel Sepúlveda" con `validityDays: 365`, `priceUSD: 0` (manual), `category: 'piano'`, `classCount: 50`. **No publicarlo** (`isActive: false`) para que no aparezca en la tienda pública.

**Gate:** snapshot verificado y restaurable; package existe pero oculto.

---

### **FASE 1 — Fix B1/B2: discrepancia `validUntil` ↔ `expiresAt`**
**Objetivo:** que el flujo actual de booking encuentre la suscripción.
**Alcance:** [services/BookingService.js](services/BookingService.js) líneas 111, 446, 780, 892.

**Cambio:**
- Renombrar **únicamente lecturas**: `validUntil` → `expiresAt` en las 4 líneas señaladas.
- Verificar que ninguna otra ruta dependa de un campo `validUntil` en `StudentSubscription`. (Búsqueda confirmó: sólo aparece en `BookingService.js` y en un workaround de tests — `tests/setup/createTestAccounts.js` L264-265, que se elimina.)

**Test obligatorio antes de merge:**
1. Crear suscripción de prueba con `expiresAt > now` y `classesRemaining = 5`.
2. Reservar slot → debe descontar de la suscripción, no de `User.classesRemaining`.
3. Repetir con `expiresAt < now` → debe rechazar con `INSUFFICIENT_CLASSES`.

**Rollback:** revertir el commit. Sin migración de datos, sin riesgo.

**Gate:** los 3 escenarios anteriores pasan en staging.

---

### **FASE 2 — Endpoint admin: acreditar paquete prepagado por transferencia**
**Objetivo:** crear `StudentSubscription` manual sin pasar por gateway de pago.
**Decisión de negocio confirmada:** comisión 0% al profesor (cobro externo).

**Diseño propuesto:**
- Ruta nueva: `POST /api/admin/subscriptions/manual-grant`
- Auth: `protect` + `requireAdmin` (o el equivalente actual).
- Body:
  ```json
  {
    "studentId": "...",
    "teacherId": "...",
    "packageId": "...",
    "classCount": 50,
    "validityDays": 365,
    "amountReceivedUSD": 0,
    "paymentMethod": "bank_transfer",
    "notes": "Transferencia recibida 2026-04-30, comprobante #..."
  }
  ```
- Efectos:
  1. Crea `Payment` con `provider: 'manual'`, `status: 'approved'`, `externalPaymentId: MANUAL-${ts}`, `webhookData.notes`.
  2. Crea `StudentSubscription` con:
     - `paymentProvider: 'manual'`
     - `escrowBalanceUSD: 0`
     - `releasedToTeacherUSD: amountReceivedUSD`
     - `platformFeeCollectedUSD: 0`
     - `expiresAt: now + validityDays * 86400000`
     - `statusHistory: [{ status: 'active', reason: 'Carga manual transferencia: ${notes}' }]`
  3. Si ya existe suscripción `active`/`paused` con ese `teacherId+studentId+category`: **renueva** (suma `classCount`, extiende `expiresAt`), igual que la lógica actual de `purchase`.
  4. Marca el `Payment` con metadata `commissionWaived: true` para que `PayoutCronService` lo excluya. **[BUSINESS LOGIC RISK]** — verificar el cron antes de habilitar este flag.

**Tests:**
- Carga primera vez → `classesRemaining = 50`.
- Recarga (mismo profesor) → suma a 100, extiende vencimiento.
- Reservar 1 clase → descuenta a 49 (depende de FASE 1).
- `PayoutCronService.generateMonthlyPayouts` no incluye sesiones provenientes de esta suscripción en el monto a pagar.

**Gate:** los 4 tests pasan + revisión manual del payout del mes en ambiente staging.

---

### **FASE 3 — UI mínima admin para Fase 2**
**Objetivo:** que un humano pueda ejecutar la carga sin curl.
**Alcance:** sección nueva en panel admin (o panel del profesor con flag) que liste alumnos + botón "Cargar paquete prepagado".

- Formulario: profesor (preseleccionado o dropdown), alumno (autocomplete por email/nombre), package (dropdown filtrando por `teacherId`), monto recibido, comprobante (texto), checkbox "sin comisión PianoLink".
- POST al endpoint de Fase 2.
- Confirmación con resumen: clases acreditadas, vencimiento, profesor.

**Gate:** Miguel realiza la carga de las 50 clases de José por la UI en producción.

---

### **FASE 4 — Fix B3: bug de timezone en disponibilidad**
**Objetivo:** que un slot creado a las 18:00 hora del profesor se muestre como 18:00 al profesor y como hora equivalente correcta al alumno, en cualquier TZ.

#### 4a. Auditoría con logs (1 día)
- Añadir log estructurado en `routes/availabilityRoutes.js` y en el endpoint de slot único: imprimir `{ raw_body, template_timezone, computed_startTime_iso, computed_endTime_iso }`.
- Activar en producción **sólo** para `teacherId = Miguel`.
- Pedir a Miguel crear 3 slots en distintos días (incluyendo uno cruzando el 6-sep si hay tiempo).

#### 4b. Frontend — enviar instante UTC explícito
- En [public/teacher-availability.html](public/teacher-availability.html#L1046) y similares: en lugar de enviar `addDate + addStartTime` como strings, construir `moment.tz(\`${date}T${time}\`, templateTimezone).utc().toISOString()` y enviar el ISO UTC al backend. Adjuntar también `clientTimezone` para auditoría.
- El backend deja de hacer `new Date(string)` ambiguo y consume el ISO directo.

#### 4c. Backend — guardar TZ por slot
- Añadir a `TimeSlot` el campo `sourceTimezone: { type: String, required: true }` (la TZ del template al momento de crearse).
- Migración aditiva: backfill `sourceTimezone` desde `AvailabilityTemplate.timezone` para slots existentes.
- Justificación: si el profesor cambia la TZ del template, los slots viejos conservan su TZ original.

#### 4d. Backend — fix DST en generación en lote
- En [services/AvailabilityService.js](services/AvailabilityService.js#L54), reemplazar `dayMoment.clone().hour(h)` por construcción explícita por día:
  ```js
  const slotStart = moment.tz(
    `${dayMoment.format('YYYY-MM-DD')} ${pad(startHour)}:${pad(startMin)}`,
    'YYYY-MM-DD HH:mm',
    timezone
  );
  ```
  Esto hace que `moment-timezone` resuelva el offset correcto del **día del slot**, no del día base.

#### 4e. Frontend — render con TZ del visor
- Vista del profesor: renderizar siempre en `template.timezone` (no en TZ del navegador).
- Vista del alumno: usar `toLocaleString('es-CL', { timeZone: alumnoPreferredTimezone || browserTz })`. Si José vive en otra TZ, registrar `User.preferredTimezone` y usarla.
- Mostrar siempre `(hora del profesor: HH:mm TZ)` como subtexto, para evitar confusión.

**Tests:**
- Profesor en `America/Santiago` crea slot 18:00 lunes 5-may-2026 → BD guarda instante UTC correcto, `sourceTimezone='America/Santiago'`.
- Alumno con `preferredTimezone='America/Santiago'` ve "18:00".
- Alumno con `preferredTimezone='Europe/Madrid'` ve "23:00" (verano CL/ES).
- Slot generado en lote que cruza 6-sep-2026 conserva 18:00 local en ambos lados del cambio DST.

**Rollback:** las migraciones son aditivas; el frontend nuevo puede convivir con el viejo si se feature-flagea.

**Gate:** los 4 tests pasan + Miguel y José confirman visualmente 1 semana sin desfases.

---

### **FASE 5 — Limpieza y consolidación**
**Objetivo:** eliminar el sistema legacy paralelo para evitar regresiones futuras.
- Marcar como deprecado `routes/subscription.js` (modelo `Subscription` viejo). Plan de retiro 60 días.
- Migrar `User.classesRemaining` y `clientData.managedStudents[].classesRemaining` que aún tengan saldo a `StudentSubscription` por-profesor.
- Documentar en `SUBSCRIPTION_ARCHITECTURE.md` que el flujo único es `StudentSubscription`.
- Añadir tests E2E del caso "Jose Wilhelmy" como regresión permanente.

**Gate:** sin saldos remanentes en `User.classesRemaining`.

---

## 5. Orden de ejecución recomendado

```
FASE 0 (preparación)           ─┐
FASE 1 (fix validUntil) ────────┤  bloquean a 2 y 3
FASE 2 (endpoint manual-grant) ─┤
FASE 3 (UI admin) ──────────────┘
        ↓
        Caso José Wilhelmy desbloqueado en producción
        ↓
FASE 4 (timezone) — independiente, pero urgente para evitar reservas equivocadas
FASE 5 (limpieza) — última
```

**Mínimo viable para José hoy:** Fases 0 + 1 + 2 + un script puntual one-off (en lugar de Fase 3) que llame al endpoint con los datos de José/Miguel.

---

## 6. Riesgos abiertos y preguntas pendientes

1. **[BUSINESS LOGIC RISK]** Confirmar con Miguel si las 50 clases manuales **deben aparecer en su payout mensual** (con monto $0) o **no aparecer en absoluto** (suscripción excluida del cron). La implementación de Fase 2 debe alinearse antes del primer 1° de mes con suscripción manual activa.
2. **[BUSINESS LOGIC RISK]** Política si José **cancela** o **pide reembolso** de clases prepagadas externamente: PianoLink no procesó el pago, por lo tanto no puede reembolsar. Definir copy y flujo de cancelación que devuelva al alumno al profesor.
3. **TZ del alumno:** ¿José Wilhelmy reside actualmente en Chile o en otra zona horaria? Determina si Fase 4e debe priorizar `User.preferredTimezone` o basta con la TZ del browser.
4. **¿Se permite a otros profesores cargar paquetes manuales?** Si sí, Fase 3 expone el botón al rol `teacher`; si no, queda sólo en admin.
5. **Tests automatizados existentes:** revisar `tests/setup/createTestAccounts.js` L264-265 — el workaround de `validUntil` se elimina cuando Fase 1 está en main, sino los tests fallan al revés.

---

## 7. Checklist de QA antes de cada deploy

- [ ] Snapshot Mongo previo
- [ ] Tests unitarios `BookingService` con `expiresAt` pasan
- [ ] Test manual: crear suscripción manual + reservar + cancelar
- [ ] Verificar que `User.classesRemaining` no se modifica si existe `StudentSubscription` activa
- [ ] Logs de webhook MercadoPago intactos (no afectados por cambio)
- [ ] `PayoutCronService` dry-run del mes en curso → suscripción manual no infla payout
- [ ] Vista profesor + vista alumno muestran misma hora local respectiva para 3 slots de prueba

---

*Documento de planificación. No se ha tocado código todavía. Próximo paso: confirmación del usuario para iniciar **FASE 0 + FASE 1**.*
