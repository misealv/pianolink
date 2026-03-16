# Plan de Implementación por Fases — Rediseño Módulo de Disponibilidad

**Fecha:** 11 de marzo de 2026  
**Referencia:** `docs/INFORME_REDISENO_DISPONIBILIDAD.md`  
**Principio rector:** Cada fase es deployable de forma independiente, no rompe funcionalidad existente, y tiene rollback claro.

---

## Inventario Técnico Actual (punto de partida)

| Componente | Estado | Archivo |
|---|---|---|
| `teacher-availability.html` | 4000+ líneas, inline CSS+JS, 5 tarjetas de formulario + calendario lectura | `public/teacher-availability.html` |
| `AvailabilityTemplate` | Modelo funcional: weeklySlots, exceptions, timezone, buffer | `models/AvailabilityTemplate.js` |
| `TimeSlot` | Modelo robusto: 7 status, optimistic locking, MIDI session | `models/TimeSlot.js` |
| `Booking` | Modelo completo: payments, recovery, metrics | `models/Booking.js` |
| `AvailabilityService` | Generación de slots, calendar data, blocking | `services/AvailabilityService.js` |
| `availabilityRoutes` | 15+ endpoints CRUD funcionales | `routes/availabilityRoutes.js` |
| Librería calendario | **Ninguna** — CSS Grid custom vanilla JS | — |
| `moment-timezone` | v0.6.0 — usado en backend | `package.json` |

**Endpoints existentes que se reutilizan sin cambios:**

```
GET  /api/availability/my-calendar?from=&to=          → slots del profesor (display format)
POST /api/availability/slots                           → crear slot(s) manual(es)
DEL  /api/availability/slots/:id                       → eliminar slot individual
POST /api/availability/slots/block                     → bloquear rango horario
POST /api/availability/block-date                      → bloquear fecha completa
GET  /api/availability/blocked-dates                   → obtener fechas bloqueadas
DEL  /api/availability/block-date/:date                → desbloquear fecha
GET  /api/availability/templates                       → obtener templates
POST /api/availability/generate                        → generar slots desde template
GET  /api/bookings/teacher?from=&to=                   → bookings del profesor
```

---

## FASE 0 — Preparación (sin cambios visibles al usuario)

**Riesgo:** Nulo  
**Rollback:** Eliminar archivos nuevos  
**Deployable:** Sí (no afecta nada existente)

### 0.1 Cargar FullCalendar desde CDN

Agregar los tags al `<head>` de `teacher-availability.html`, pero **sin instanciar** todavía:

```html
<!-- FullCalendar v6 — CDN, solo carga si se usa -->
<link href="https://cdn.jsdelivr.net/npm/fullcalendar@6.1.11/index.global.min.css" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/fullcalendar@6.1.11/index.global.min.js"></script>
```

**Validación:** Abrir la página → verificar que la consola no muestra errores → los formularios existentes funcionan igual.

### 0.2 Crear endpoint de lectura combinada (nuevo, no modifica existentes)

Nuevo endpoint que combina slots + bookings en formato FullCalendar:

```
GET /api/availability/calendar-events?from=&to=
```

Retorna array de objetos compatibles con FullCalendar:
```json
[
  {
    "id": "slot_abc123",
    "title": "Disponible",
    "start": "2026-03-15T09:00:00-03:00",
    "end": "2026-03-15T09:45:00-03:00",
    "color": "#22c55e",
    "extendedProps": { "type": "available", "slotId": "abc123" }
  },
  {
    "id": "booking_xyz",
    "title": "🎵 María García",
    "start": "2026-03-15T15:00:00-03:00",
    "end": "2026-03-15T15:45:00-03:00",
    "color": "#6366f1",
    "editable": false,
    "extendedProps": { "type": "booked", "bookingId": "xyz", "studentName": "María García" }
  }
]
```

**Por qué es seguro:** Endpoint nuevo, no modifica rutas existentes. Si falla, nada se rompe.

### 0.3 Verificar dark theme

Crear un `<div id="fullcalendar-test" style="display:none">` en la página, instanciar FullCalendar minimalmente con JS, verificar que los CSS variables de PianoLink no conflictúan.

**Entregable Fase 0:**
- [x] CDN cargado sin errores
- [x] Endpoint `/calendar-events` funcionando
- [x] Conflictos CSS identificados y resueltos
- [x] **Formularios existentes intactos al 100%**

---

## FASE 1 — Calendario visual de solo lectura (junto a formularios existentes)

**Riesgo:** Bajo  
**Rollback:** Ocultar `#fullcalendar-container` con `display: none`  
**Deployable:** Sí

### 1.1 Reemplazar el calendario custom por FullCalendar

El calendario actual (tarjeta #6 "📅 Mi Calendario Semanal") es de **solo lectura** — muestra slots verdes y clases moradas. Reemplazar **solo esa tarjeta** con FullCalendar:

```
ANTES:
┌──────────────────────────────────────┐
│ 📅 Mi Calendario Semanal            │
│ [CSS Grid custom, renderTeacherCalendar()] │
└──────────────────────────────────────┘

DESPUÉS:
┌──────────────────────────────────────┐
│ 📅 Mi Calendario Semanal            │
│ [FullCalendar timeGridWeek, alimentado por /calendar-events] │
└──────────────────────────────────────┘
```

**Lo que NO cambia:**
- Las 5 tarjetas de formulario siguen idénticas
- Todos los botones de guardar/generar/bloquear siguen igual
- Las funciones JS existentes siguen operando
- El flujo del profesor es el mismo, solo la **visualización** mejora

**Lo que SÍ cambia:**
- La función `renderTeacherCalendar()` ahora usa FullCalendar
- La función `loadCalendarData()` usa el nuevo endpoint `/calendar-events`
- Navegación de semanas usa FullCalendar API (`calendar.prev()`, `calendar.next()`)
- Mejor rendering de slots solapados (FullCalendar los apila automáticamente)

### 1.2 Adaptar estilos al dark theme

CSS overrides para que FullCalendar respete la estética existente:

```css
.fc {
  --fc-border-color: #333;
  --fc-page-bg-color: #1a1a2e;
  --fc-neutral-bg-color: #16213e;
  --fc-today-bg-color: rgba(79, 172, 254, 0.08);
  --fc-event-text-color: #fff;
  font-family: inherit;
}
.fc .fc-col-header-cell { background: #16213e; color: #e0e0e0; }
.fc .fc-timegrid-slot { border-color: #2a2a4a; }
```

### 1.3 Click en slot → modal de detalle (lectura)

Al hacer click en un evento del calendario:
- **Slot disponible:** modal con fecha, hora, botón "Eliminar slot"
- **Clase agendada:** modal con nombre alumno, hora, tipo de clase (solo lectura)

Esto **reemplaza** el comportamiento actual donde clickear un slot verde llama a `deleteSlot()` directamente (peligroso, sin confirmación).

**Entregable Fase 1:**
- [x] FullCalendar renderiza slots y bookings correctamente
- [x] Dark theme integrado
- [x] Click muestra detalle (no elimina directo)
- [x] Navegación semanal funciona
- [x] Mobile: vista 3 días o lista diaria
- [x] **Formularios existentes intactos al 100%**

---

## FASE 2 — Click para crear (primer reemplazo de formulario)

**Riesgo:** Medio-bajo  
**Rollback:** Deshabilitar `selectable: true` en FullCalendar config  
**Deployable:** Sí

### 2.1 Click en celda vacía → crear slot

Habilitar `selectable: true` en FullCalendar. Cuando el profesor clickea una celda vacía de la grilla:

1. Aparece popover/modal mínimo:
   ```
   ┌──────────────────────────┐
   │ Nuevo bloque disponible  │
   │ Martes 15:00 → 15:45     │
   │ Duración: [45 min ▼]     │
   │ [Guardar]  [Cancelar]    │
   └──────────────────────────┘
   ```
2. Guardar llama a `POST /api/availability/slots` (endpoint existente)
3. El slot aparece instantáneamente en el calendario

**API usada:** `POST /api/availability/slots` — ya existe, recibe `{ date, startTime }`.

### 2.2 Drag en celda vacía → definir duración

Habilitar drag en FullCalendar (`select` callback). El profesor arrastra desde 15:00 hasta 16:30 → el popover se abre con la duración ya calculada.

**API usada:** misma `POST /api/availability/slots` con `endTime` calculado.

### 2.3 Colapsar tarjeta "➕ Agregar Disponibilidad"

La tarjeta de agregar slots manuales (Single/Batch) se convierte en un colapsable "Vista avanzada" debajo del calendario, con un link discreto:

```
📅 Mi Calendario ─────────────────────────
[FullCalendar con click-to-create]

▸ Vista avanzada (agregar slots manualmente)
```

**No se elimina** — solo se colapsa. El profesor que prefiera formularios puede seguir usándolos.

**Entregable Fase 2:**
- [x] Click en celda vacía abre popover → crea slot
- [x] Drag para definir duración funciona
- [x] Tarjeta "Agregar" colapsada pero accesible
- [x] Validación: no permite crear slot sobre hora pasada u horario ocupado
- [x] Toast de confirmación "Disponibilidad agregada ✓"

---

## FASE 3 — Interacción avanzada (drag & drop + resize)

**Riesgo:** Medio  
**Rollback:** Deshabilitar `editable: true` y `eventResize` en config  
**Deployable:** Sí

### 3.1 Nuevo endpoint: mover slot

```
PATCH /api/availability/slots/:id/move
Body: { newStartTime: "2026-03-15T10:00:00Z", newEndTime: "2026-03-15T10:45:00Z" }
```

Lógica:
1. Verificar que el slot existe y pertenece al profesor (`teacherId`)
2. Verificar que `status === 'available'` (no se puede mover un slot booked)
3. Verificar que no hay conflicto con otro slot en el nuevo horario
4. Actualizar `startTime`, `endTime`
5. Retornar slot actualizado

**Seguridad:** scoped por `teacherId` del JWT. Solo mueve slots `available`.

### 3.2 Drag & drop de slots disponibles

FullCalendar `eventDrop` callback → `PATCH /slots/:id/move`.

- Solo slots verdes (available) son draggables
- Slots morados (booked) no son draggables (`editable: false` en el evento)
- Si el drop falla (conflicto), revertir posición con `revert()` + toast error

### 3.3 Resize de slots disponibles

FullCalendar `eventResize` callback → `PATCH /slots/:id/move` (con nuevo endTime).

- Solo borde inferior arrastragle
- Duración mínima: 30 min (validación frontend + backend)
- Si el resize crea conflicto → revertir + toast

### 3.4 Eliminar con undo

Click en slot disponible → popover con botón "Eliminar" → toast "Slot eliminado [Deshacer]":

1. El slot se oculta visualmente inmediatamente
2. Timer de 5 segundos
3. Si no hace undo → `DELETE /api/availability/slots/:id` (endpoint existente)
4. Si hace undo → re-mostrar el slot

**Entregable Fase 3:**
- [x] Drag & drop funciona solo en slots disponibles
- [x] Resize funciona con validación de conflictos
- [x] Eliminación con undo de 5 segundos
- [x] Revert automático si operación falla
- [x] Endpoint `PATCH /slots/:id/move` creado y testeado

---

## FASE 4 — Colapsar formularios restantes

**Riesgo:** Medio  
**Rollback:** Revertir a formularios desplegados  
**Deployable:** Sí

### 4.1 Reorganizar la UI

```
LAYOUT NUEVO:
┌──────────────────────────────────────────────────────────┐
│ 📅 Mi Disponibilidad                      [⚙ Config ▼] │
│ ┌──────────────────────────────────────────────────────┐ │
│ │                                                      │ │
│ │              FULLCALENDAR (protagonista)              │ │
│ │      click-to-create + drag + resize + delete        │ │
│ │                                                      │ │
│ └──────────────────────────────────────────────────────┘ │
│                                                          │
│ ▸ Generar horario semanal (template)                     │
│ ▸ Bloquear fechas                                        │
│ ▸ Eliminación masiva                                     │
│ ▸ Vista avanzada (agregar slots manualmente)             │
└──────────────────────────────────────────────────────────┘
```

### 4.2 Config como dropdown

La tarjeta "⚙ Configuración" (duración, buffer, timezone) se mueve a un botón ⚙ en el header, que abre un dropdown/modal. Valores actuales visibles como badges:

```
📅 Mi Disponibilidad    [45 min] [10 min buffer] [⚙]
```

### 4.3 Bloquear fechas desde el calendario

Nuevo: click derecho (desktop) o long-press (mobile) en una celda → opción "Bloquear este horario".

Usa `POST /api/availability/block-date` existente o `POST /api/availability/slots/block` según si es día completo o rango horario.

La tarjeta "🚫 Bloquear Fechas" se colapsa pero permanece accesible.

### 4.4 Panel de resumen (solo desktop > 1024px)

Panel lateral colapsable a la derecha con:
- Horas disponibles esta semana
- Clases agendadas
- Ocupación %
- Próxima clase
- Lista de bloques recurrentes (si existe template)

**Entregable Fase 4:**
- [x] FullCalendar es el elemento principal de la página
- [x] Formularios colapsados pero accesibles
- [x] Config accesible desde header
- [x] Bloqueo desde calendario funciona
- [x] Panel de resumen (desktop)
- [x] **Todas las funciones originales siguen accesibles**

---

## FASE 5 — Recurrencia visual (cambio de modelo mental)

**Riesgo:** Medio-alto  
**Rollback:** Feature flag (desactivar popover de recurrencia, mantener template existente)  
**Deployable:** Sí, con feature flag

### 5.1 Popover de recurrencia al crear bloque

Al crear un slot por click/drag, el popover ahora incluye:

```
┌──────────────────────────────┐
│ Nuevo bloque disponible      │
│ Martes 15:00 → 15:45         │
│ Duración:  [45 min ▼]        │
│ Repetir:   [No repite ▼]     │
│            ├ No repite        │
│            ├ Cada semana      │
│            ├ Cada 2 semanas   │
│            └ Lun a Vie        │
│ [Guardar]  [Cancelar]        │
└──────────────────────────────┘
```

### 5.2 Nuevo endpoint: crear bloque recurrente

```
POST /api/availability/quick-block
Body: {
  dayOfWeek: 2,
  startTime: "15:00",
  endTime: "15:45",
  recurrence: "weekly" | "biweekly" | "weekdays" | "none",
  weeksAhead: 12
}
```

Lógica:
1. Generar slots individuales para las próximas N semanas
2. Marcar cada slot con `isRecurring: true`, `recurringGroupId: UUID`
3. Retornar todos los slots creados

**Reutiliza:** lógica de `AvailabilityService.generateSlotsFromTemplate()` internamente, pero sin requerir un template formal.

### 5.3 Badge visual de recurrencia

Slots con `isRecurring: true` muestran badge "↻" en el calendario. Estos campos ya existen en el modelo `TimeSlot`:

```javascript
isRecurring: Boolean (default: false),    // YA EXISTE
recurringGroupId: String,                 // YA EXISTE
```

### 5.4 "Editar este o toda la serie"

Al editar/eliminar un slot recurrente:
- Modal: "¿Modificar solo este horario, o toda la serie?"
- "Solo este" → opera sobre el slot individual
- "Toda la serie" → opera sobre todos los slots con el mismo `recurringGroupId`

**Entregable Fase 5:**
- [x] Recurrencia funciona desde popover
- [x] Endpoint `/quick-block` creado
- [x] Badge ↻ en slots recurrentes
- [x] Editar/eliminar uno vs toda la serie
- [x] Feature flag funcional para rollback

---

## FASE 6 — Mobile y polish final

**Riesgo:** Bajo  
**Rollback:** CSS media queries removibles  
**Deployable:** Sí

### 6.1 Responsive breakpoints

```css
/* > 1024px: grilla 7 columnas + panel lateral */
/* 768–1024px: grilla 7 columnas sin panel */
/* < 768px: vista 3 días o lista diaria */
```

FullCalendar soporta cambio de vista programático:
```javascript
if (window.innerWidth < 768) {
  calendar.changeView('timeGrid3Day'); // o 'listWeek'
}
```

### 6.2 Popover → bottom sheet en mobile

En mobile, los popovers se convierten en bottom sheets (modal desde abajo).

### 6.3 Swipe para navegar semanas

Touch events para navegar entre semanas en mobile.

### 6.4 Analytics events

Agregar tracking para medir métricas de éxito del informe:
- `availability_page_opened`
- `availability_slot_created` (método: click, drag, form)
- `availability_slot_moved`
- `availability_slot_deleted`
- `availability_setup_completed` (≥ 1 slot guardado)
- `availability_time_to_first_save` (tiempo desde apertura hasta primer guardado)

**Entregable Fase 6:**
- [x] Mobile usable con vista adaptada
- [x] Bottom sheets en pantallas pequeñas
- [x] Analytics implementados
- [x] QA completo desktop + mobile

---

## Matriz de Riesgo por Fase

| Fase | Riesgo | Backend cambia | Frontend cambia | Rollback | Tiempo estimado |
|---|---|---|---|---|---|
| **0 — Preparación** | Nulo | 1 endpoint nuevo | CDN + div oculto | Eliminar archivos | 1–2 días |
| **1 — Calendario visual** | Bajo | Ninguno | Reemplazar render del calendario | `display: none` al container | 2–3 días |
| **2 — Click para crear** | Medio-bajo | Ninguno | Selectable + popover | Desactivar `selectable` | 2–3 días |
| **3 — Drag & drop** | Medio | 1 endpoint nuevo (PATCH move) | Editable + resize | Desactivar `editable` | 3–4 días |
| **4 — Reorganizar UI** | Medio | Ninguno | Layout, colapsar tarjetas | Revertir layout | 2–3 días |
| **5 — Recurrencia** | Medio-alto | 1 endpoint nuevo (quick-block) | Popover + badges | Feature flag | 3–4 días |
| **6 — Mobile + polish** | Bajo | Ninguno | CSS + analytics | Revertir CSS | 2–3 días |

**Total: ~15–22 días de desarrollo** = ~3–4 semanas (1 desarrollador)

---

## Reglas de Seguridad para Cada Fase

1. **No eliminar código existente** hasta que la alternativa esté probada. Colapsar/ocultar en vez de borrar.

2. **Cada endpoint nuevo** debe tener:
   - `WHERE teacherId = req.user._id` (multi-tenancy)
   - Validación de `status === 'available'` antes de mutar
   - Try/catch con respuesta de error al frontend

3. **Cada fase deployable por separado** — si la Fase 3 tiene bugs, se puede deployar solo hasta Fase 2 y volver.

4. **No migrar datos** — todos los campos nuevos son opcionales con defaults. Los slots existentes se renderizan sin cambios.

5. **Los formularios existentes nunca desaparecen** — solo se colapsan. Si un profesor tiene flujo aprendido, puede seguir usándolo.

6. **Testing minimo por fase:**
   - Crear slot → aparece en calendario
   - Crear slot → recarga página → sigue ahí
   - Eliminar slot → desaparece
   - Booking existente → se muestra correctamente (no editable)
   - Mobile: pantalla < 768px → no se rompe

---

## Orden de Ejecución Recomendado

```
FASE 0 ──→ Deploy ──→ Verificar en producción (30 min)
   ↓
FASE 1 ──→ Deploy ──→ Feedback de 1 profesor piloto
   ↓
FASE 2 ──→ Deploy ──→ Feedback (¿el click-to-create es intuitivo?)
   ↓
FASE 3 ──→ Deploy ──→ Verificar que drag no rompe slots
   ↓
FASE 4 ──→ Deploy ──→ Feedback UX (¿los formularios colapsados se encuentran?)
   ↓
FASE 5 ──→ Deploy con feature flag ──→ Activar para piloto ──→ Activar para todos
   ↓
FASE 6 ──→ Deploy ──→ Medir analytics 2 semanas ──→ Decidir Fase Google Calendar
```

---

*Cada fase es un PR independiente. Cada PR se puede deployar, probar, y revertir sin afectar las demás.*
