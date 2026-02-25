# 🧪 Plan de QA — PianoLink

| Campo | Valor |
|-------|-------|
| **Fecha** | Febrero 2026 |
| **Versión** | 4.2.0 |
| **Ambiente** | Producción (`https://pianolink.net`) |
| **Sprints cubiertos** | 1, 2, 3, 4, 5 |
| **Automatización disponible** | Playwright (ver sección final) |

---

## ⚠️ ANTES DE EMPEZAR — Reglas de oro en producción

| # | Regla |
|---|-------|
| 1 | **Usa cuentas de prueba** — nunca la cuenta de un usuario real para tests destructivos |
| 2 | **Ten los logs abiertos** — `fly logs -a piano-link` en terminal paralela |
| 3 | **Orden estricto** — Smoke Test (Bloque 0) PRIMERO, luego el resto |
| 4 | **Si algo falla** — anota error exacto + screenshot antes de intentar arreglar |
| 5 | **Resend Dashboard** — tenlo abierto en otra pestaña para verificar emails |

---

## BLOQUE 0 — Smoke Test ⏱️ ~15 min

> Verificar que los flujos críticos que **ya funcionaban** siguen funcionando.
> **Si alguno falla → PARAR.** Hay una regresión crítica.

| # | Prueba | Pasos | Resultado esperado | ✅/❌ |
|---|--------|-------|--------------------|----|
| 0.1 | Login profesor | Entrar con cuenta de profesor real | Dashboard carga sin errores | |
| 0.2 | Login estudiante | Entrar con cuenta de estudiante/cliente real | Panel cliente carga sin errores | |
| 0.3 | Login admin | Entrar con cuenta admin | Panel admin carga sin errores | |
| 0.4 | Ver calendario | Como profesor, abrir calendario | Slots disponibles visibles | |
| 0.5 | Ver clases | Como estudiante, abrir "mis clases" | Lista de clases carga | |
| 0.6 | Sala de clase | Entrar a sala con URL de clase existente | Sala carga sin error | |

**🤖 Automatizable:** Tests 0.1–0.5 cubiertos por `node tests/qa-agent.js` (TEST 4: Login, TEST 1: Landing).

---

## BLOQUE 1 — Sprint 1: Parches Críticos de Seguridad

### TEST 1.1 — Profesor no puede reservarse a sí mismo

**Severidad:** 🔴 CRÍTICO — Bug reportado original

| Paso | Acción | Resultado esperado |
|------|--------|--------------------|
| 1 | Loguéate como profesor | Dashboard visible |
| 2 | Abre DevTools (F12) → pestaña Network | Listo para monitorear |
| 3 | POST manual a `/api/bookings` con tu propio `slotId` y tu `_id` como `studentId` | Error **400/403** con mensaje `CANNOT_BOOK_OWN_SLOT` |
| 4 | Verifica en logs de Fly.io | Error registrado en log |

**🚨 Falla si:** el booking se crea exitosamente (200).

```bash
# Comando curl de referencia (reemplazar tokens):
curl -X POST https://pianolink.net/api/bookings \
  -H "Authorization: Bearer <TEACHER_JWT>" \
  -H "Content-Type: application/json" \
  -d '{"slotId":"<OWN_SLOT_ID>","studentId":"<OWN_USER_ID>","timezone":"America/Santiago"}'
```

---

### TEST 1.2 — Solo estudiantes/clientes pueden reservar

**Severidad:** 🟠 ALTO

| Paso | Acción | Resultado esperado |
|------|--------|--------------------|
| 1 | Loguéate como profesor | Dashboard visible |
| 2 | Obtén JWT token (`document.cookie` o `localStorage`) | Token copiado |
| 3 | POST a `/api/bookings` con ese token y un `slotId` válido | Error **403**: `"Solo estudiantes o clientes pueden realizar esta acción"` |

**🚨 Falla si:** el sistema acepta la reserva de un profesor.

---

### TEST 1.3 — Middleware `studentOrClient` activo

**Severidad:** 🟠 ALTO

| Paso | Acción | Resultado esperado |
|------|--------|--------------------|
| 1 | Loguéate como admin | Panel admin visible |
| 2 | POST a `/api/bookings` con token de admin | Error **403** |
| 3 | Loguéate como estudiante real | Panel estudiante |
| 4 | Haz reserva legítima en slot disponible | Booking creado ✅ |

---

### TEST 1.4 — Email automático al activar `trial_available`

**Severidad:** 🔴 CRÍTICO — Caso Felipe Jorquera

| Paso | Acción | Resultado esperado |
|------|--------|--------------------|
| 1 | Loguéate como admin | Panel admin |
| 2 | Busca WelcomeKit en estado `setup_scheduled` o anterior | Encontrado |
| 3 | Cambia manualmente el estado a `trial_available` | Estado actualizado |
| 4 | Verifica en **Resend Dashboard** o logs | Email enviado al cliente en **< 2 min** |
| 5 | Verifica que el email contiene link para agendar clase | Link funcional |

**🚨 Falla si:** no llega ningún email.

---

### TEST 1.5 — Validación de timezone

**Severidad:** 🟡 MEDIO

| Paso | Acción | Resultado esperado |
|------|--------|--------------------|
| 1 | Como estudiante, reservar enviando `timezone: "xyz_invalida"` | Error de validación |
| 2 | Reservar con `timezone: "America/Santiago"` | Booking procede normalmente |

---

## BLOQUE 2 — Sprint 2: Consistencia de Datos

### TEST 2.1 — Fuente de verdad del saldo de clases

**Severidad:** 🔴 CRÍTICO

| Paso | Acción | Resultado esperado |
|------|--------|--------------------|
| 1 | Identifica un estudiante activo con clases | Seleccionado |
| 2 | Consulta `User.classesRemaining` en MongoDB | Valor anotado |
| 3 | Consulta `StudentSubscription.classesRemaining` del mismo estudiante | **Debe coincidir** con paso 2 |
| 4 | Si tiene `managedStudents[]`, revisa su `classesRemaining` | **Debe coincidir** |
| 5 | Realiza una reserva como ese estudiante | Booking creado |
| 6 | Re-consulta los tres valores | **Los tres deben haber descontado 1** |

**🚨 Falla si:** los valores no coinciden entre sí después de la reserva.

```javascript
// Script de verificación rápida en mongo shell:
const user = db.users.findOne({email: "test@example.com"});
const sub = db.studentsubscriptions.findOne({userId: user._id, active: true});
print(`User.classesRemaining: ${user.classesRemaining}`);
print(`Subscription.classesRemaining: ${sub?.classesRemaining}`);
```

---

### TEST 2.2 — Enrollments unificados

**Severidad:** 🟠 ALTO

| Paso | Acción | Resultado esperado |
|------|--------|--------------------|
| 1 | Cuenta documentos en colección `enrollments` | Número anotado |
| 2 | Cuenta documentos en colección `studentenrollments` | Número anotado |
| 3 | Verifica que enrollments activos estén en `studentenrollments` | Sin enrollments activos huérfanos en colección legacy |
| 4 | Crea nueva relación estudiante-profesor | Registro creado en **StudentEnrollment**, NO en Enrollment |

---

### TEST 2.3 — Consistencia monetaria

**Severidad:** 🟠 ALTO — **[BUSINESS LOGIC RISK]** Riesgo de cobro erróneo

| Paso | Acción | Resultado esperado |
|------|--------|--------------------|
| 1 | Consulta profesor en MongoDB | `teacherData.hourlyRate` y `teacherData.trialPrice` visibles |
| 2 | Verifica unidades de la normalización | Ambos en **la misma unidad** (centavos o dólares, no mixto) |
| 3 | Revisa un Booking reciente | `payment.amountCents` consistente con tarifa del profesor |
| 4 | Cálculo manual: si clase = $30, `amountCents` = 3000 | ✅ Correcto |

**🚨 Falla si:** `hourlyRate: 30` y `amountCents: 30` (falta ×100).

---

## BLOQUE 3 — Sprint 3: WelcomeKit Simplificado

### TEST 3.1 — Estados reducidos funcionan

**Severidad:** 🟠 ALTO

| Paso | Acción | Resultado esperado |
|------|--------|--------------------|
| 1 | Busca WelcomeKits activos en producción | Lista de estados actuales |
| 2 | Verifica que ninguno tiene estados eliminados (`entrevista_pendiente`, `entrevista_agendada`, etc.) | Solo estados del nuevo modelo |
| 3 | Crea un WelcomeKit nuevo (si hay un lead disponible) | Inicia en `onboarding` |
| 4 | Avanza manualmente cada estado | Cada transición funciona + side-effects |

**Estados válidos del nuevo modelo:**
```
onboarding → setup → trial_ready → trial_done → active
                                                → refunded
```

---

### TEST 3.2 — Transiciones ilegales bloqueadas

**Severidad:** 🟡 MEDIO

| Paso | Acción | Resultado esperado |
|------|--------|--------------------|
| 1 | Mover WelcomeKit de `onboarding` directo a `active` | ❌ Error: transición no permitida |
| 2 | Mover de `active` a `setup` (retroceso) | ❌ Error: transición no permitida |
| 3 | Mover `onboarding → setup → trial_ready` correctamente | ✅ Cada paso funciona |

---

### TEST 3.3 — Side-effects automáticos en cada transición

**Severidad:** 🔴 CRÍTICO

| Transición | Side-effect esperado | Verificado en Resend |
|------------|---------------------|----|
| `onboarding → setup` | Email de bienvenida / confirmación | ☐ |
| `setup → trial_ready` | Email con link para agendar clase de prueba | ☐ |
| `trial_ready → trial_done` | Email de seguimiento post-trial | ☐ |
| `trial_done → active` | Email de bienvenida como alumno activo | ☐ |

---

## BLOQUE 4 — Sprint 4: Dashboard del Profesor

### TEST 4.1 — Nuevas rutas funcionan

**Severidad:** 🟠 ALTO

| Ruta | Prueba | Resultado esperado | ✅/❌ |
|------|--------|--------------------|------|
| `/profesor/calendario` | Acceder como profesor | Calendario completo, funcional | |
| `/profesor/estudiantes` | Acceder como profesor | Lista de estudiantes visible | |
| `/profesor/validar` | Acceder como profesor | Clases pendientes de validar | |
| `/profesor/perfil` | Acceder como profesor | Formulario de perfil público | |
| `/profesor/ganancias` | Acceder como profesor | Historial de ganancias | |
| `/dashboard` | Acceder como profesor | Solo resumen + próxima clase + alertas | |

---

### TEST 4.2 — Dashboard simplificado muestra lo correcto

**Severidad:** 🟡 MEDIO

| Paso | Acción | Resultado esperado |
|------|--------|--------------------|
| 1 | Loguéate como profesor con clases programadas | Dashboard visible |
| 2 | **Sin hacer scroll**, ¿ves tu próxima clase? | Sí, visible inmediatamente |
| 3 | ¿Ves cuántas clases tienes pendientes de validar? | Badge/número visible |
| 4 | ¿Ves tus ganancias del mes? | Resumen visible |
| 5 | ¿La navegación lleva a las sub-vistas correctas? | Cada link funciona |

---

### TEST 4.3 — Acceso cruzado bloqueado

**Severidad:** 🟠 ALTO

| Paso | Acción | Resultado esperado |
|------|--------|--------------------|
| 1 | Loguéate como estudiante | Panel estudiante |
| 2 | Accede directamente a `/profesor/calendario` | Redirige a login o error 403 |
| 3 | Accede a `/dashboard` (dashboard de profesor) | Redirige a login o error 403 |

---

## BLOQUE 5 — Sprint 5: Diseño de Roles

> Este sprint es de diseño/documentación, no de código en producción.

| # | Verificación | Resultado esperado | ✅/❌ |
|---|-------------|--------------------|----|
| 5.1 | Existe RFC documentado de unificación `client + student` | Documento en repo | |
| 5.2 | El diseño incluye flag `isGuardian` para padres | Especificado | |
| 5.3 | El diseño incluye migración de `managedStudents[]` a User records | Plan documentado | |
| 5.4 | No se implementó código en producción de este sprint | Confirmar con `git log` | |

---

## BLOQUE 6 — Prueba de Regresión Final ⏱️ ~20 min

> Después de confirmar todos los fixes, verificar el happy-path completo.

| # | Flujo completo | Pasos | Resultado esperado | ✅/❌ |
|---|---------------|-------|--------------------|------|
| 6.1 | Flujo estudiante completo | Login → ver disponibilidad → reservar → confirmar | Booking creado, emails enviados | |
| 6.2 | Flujo profesor completo | Login → ver agenda → ir a sala → validar clase | Clase validada, ganancia registrada | |
| 6.3 | Flujo WelcomeKit nuevo | Admin crea lead → avanza estados → emails | Cada email llega en orden | |
| 6.4 | Cancelación normal | Estudiante cancela clase con >24h de anticipación | Clase devuelta al saldo | |
| 6.5 | Cancelación tardía | Estudiante cancela con <24h | Sin reembolso, mensaje correcto | |

---

## 🤖 Agente QA Automatizado — Estado Actual y Recomendación

### Lo que ya existe en el repo

| Componente | Ruta | Estado |
|-----------|------|--------|
| Playwright config | `tests/playwright.config.js` | ✅ Configurado (apunta a `https://pianolink.net`) |
| QA Agent standalone | `tests/qa-agent.js` | ✅ 19 tests (landing, /comenzar, checkout, login, registro, API, responsive) |
| Page Objects | `tests/pages/*.js` | ✅ 7 páginas (Login, Register, Teacher Dashboard, Student Dashboard, Booking, Checkout, Availability) |
| E2E Spec | `tests/e2e/teacher-student-flow.spec.js` | ✅ Flujo completo profesor→estudiante→reserva→pago |
| Fixtures | `tests/fixtures/testFixtures.js` | ✅ Helpers para datos de prueba |
| QA Plan detallado | `tests/QA_PLAN.md` | ✅ 567 líneas, mapas de ruta, matriz de permisos |
| Escenarios humanos | `tests/HUMAN_BEHAVIOR_SCENARIOS.md` | ✅ Edge cases de comportamiento real |

### ⚠️ Pendiente para activar

Playwright **no está** en `package.json` como dependencia. Para habilitarlo:

```bash
# Instalar Playwright como dependencia de desarrollo
npm install --save-dev @playwright/test
npx playwright install chromium

# Ejecutar el agente QA standalone (no requiere install formal)
node tests/qa-agent.js --headed   # Ver el navegador
node tests/qa-agent.js            # Headless

# Ejecutar suite E2E completa con Playwright
npx playwright test --config=tests/playwright.config.js

# Ver reporte HTML
npx playwright show-report tests/playwright-report
```

### Cobertura del agente actual vs. este plan QA

| Bloque de este plan | Cubierto por agente | Notas |
|--------------------|--------------------|-------|
| **Bloque 0** — Smoke Test | ✅ Parcial | Landing, login, registro, API health cubiertos. Faltan login con credenciales reales y sala de clase |
| **Bloque 1** — Seguridad | ❌ No cubierto | Requiere API calls con JWT. Se puede agregar con `page.request` de Playwright |
| **Bloque 2** — Consistencia datos | ❌ No cubierto | Requiere conexión directa a MongoDB (el fixture `testFixtures.js` ya tiene soporte para `db`) |
| **Bloque 3** — WelcomeKit | ❌ No cubierto | Requiere acceso admin + verificar Resend. Parcialmente automatizable |
| **Bloque 4** — Dashboard profesor | ✅ Parcial | Page Object `TeacherDashboardPage.js` existe. Falta spec para rutas nuevas |
| **Bloque 5** — Diseño roles | N/A | Verificación documental, no automatizable |
| **Bloque 6** — Regresión | ✅ Parcial | `teacher-student-flow.spec.js` cubre el happy path casi completo |

### Recomendación

**El agente ya existe y es funcional.** La inversión es solo:

1. `npm install --save-dev @playwright/test` (~2 min)
2. Agregar un script en `package.json`: `"test:qa": "node tests/qa-agent.js"`
3. Agregar specs para Bloques 1 (seguridad API) y 3 (WelcomeKit transitions) — ~2-3h de desarrollo

No se necesita instalar otra herramienta. Playwright + el agente existente cubren el 70% de este plan, y el 30% restante (verificación MongoDB, emails en Resend) se puede agregar con los fixtures que ya existen.

---

## 📋 Resumen de Resultados

| Bloque | Tests | Pasaron | Fallaron | Notas |
|--------|-------|---------|----------|-------|
| 0 — Smoke Test | 6 | | | |
| 1 — Seguridad | 5 | | | |
| 2 — Consistencia | 3 | | | |
| 3 — WelcomeKit | 3 | | | |
| 4 — Dashboard | 3 | | | |
| 5 — Roles | 4 | | | |
| 6 — Regresión | 5 | | | |
| **TOTAL** | **29** | | | |

| Ejecutó | Fecha | Firma |
|---------|-------|-------|
| | | |
BloqueTestsPasaronFallaronPendientes0 — Smoke Test61 — Sprint 1 Seguridad52 — Sprint 2 Datos33 — Sprint 3 WelcomeKit34 — Sprint 4 Dashboard35 — Sprint 5 Diseño46 — Regresión Final5TOTAL29

🚨 Protocolo si algo falla en producción

Documenta el error exacto — mensaje, endpoint, usuario afectado
Revisa Fly.io logs — fly logs -a tu-app para el stack trace
No intentes arreglar en caliente — haz rollback primero si el error afecta usuarios reales
Rollback: fly deploy --image [imagen-anterior] o revertir commit en git y redesplegar
Luego investiga en local con el error documentado