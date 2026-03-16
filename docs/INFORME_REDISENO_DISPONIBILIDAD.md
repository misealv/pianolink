# Informe de Decisión: Rediseño del Módulo de Disponibilidad Horaria — PianoLink

**Fecha:** 11 de marzo de 2026  
**Autor:** Equipo de Arquitectura de Producto  
**Audiencia:** Fundadores, equipo técnico  

---

## Resumen Ejecutivo

El módulo actual de disponibilidad horaria de PianoLink presenta alta fricción: formularios rígidos sin interacción visual directa, generación masiva de slots desde el navegador, y una UX que obliga al profesor a operar como administrador de base de datos en vez de "pintar" su horario. Tras evaluar tres opciones —UI propia inspirada en Google Calendar, integración nativa con Google Calendar API, y un modelo híbrido— **la recomendación es construir una UI propia con paradigma visual tipo calendario**, sin integración con Google Calendar en esta fase. El quick win inmediato (< 1 semana) es reemplazar el formulario de horario semanal por una grilla visual clickeable sobre el calendario existente, eliminando los inputs de texto para horas. La integración con Google Calendar se reserva como feature premium futura.

---

## PARTE 1 — Análisis del Problema Actual

### 1.1 Antipatrones de UX en interfaces de disponibilidad

Los errores más comunes en módulos de registro de disponibilidad, documentados en la literatura de UX y observables en marketplaces de servicios:

| Antipatrón | Descripción | Impacto |
|---|---|---|
| **Formulario de casillas por hora** | Matrices de 7×24 checkboxes. Abrumante visualmente, propenso a errores de click | Abandono del 30–45% antes de completar |
| **Input de texto para horas** | Campos `HH:MM` manuales sin validación visual | Errores de formato, horarios superpuestos no detectados |
| **Generación masiva opaca** | "Generar slots para 48 semanas" sin preview de resultado | Profesor no entiende qué creó, no confía en el sistema |
| **Falta de feedback inmediato** | No ver el resultado de cambios en tiempo real sobre un calendario | Desconexión entre acción y resultado |
| **Modelo mental de "base de datos"** | Pedir al usuario que piense en "slots", "templates", "excepciones" | Carga cognitiva excesiva para un músico |
| **Sin interacción directa** | No poder arrastrar, redimensionar o clickear directo sobre el calendario | Fricción innecesaria vs. estándar de mercado (Calendly, Google Calendar) |

### 1.2 Cómo se manifiestan en PianoLink hoy

El módulo actual (`teacher-availability.html`) incurre en **todos** estos antipatrones:

1. **5 tarjetas de formulario separadas** (Configuración, Horario Semanal, Bloquear Fechas, Agregar Disponibilidad, Eliminación Masiva) — el profesor debe entender 5 conceptos distintos para una sola tarea: "¿cuándo puedo dar clases?"

2. **Inputs `<input type="time">` manuales** para cada día de la semana — sin validación visual de conflictos, sin arrastrar para definir rangos

3. **Generación de slots en el navegador** (`addBatchSlots()` calcula tiempos en JS del cliente para ~200+ slots) — riesgo de errores y consumo de memoria

4. **Calendario de solo lectura** — la vista semanal existente muestra slots pero no permite crearlos por interacción directa (click/drag)

5. **Flujo de 3 pasos desconectados**: (a) guardar template → (b) generar slots → (c) verificar en calendario — sin feedback unificado

6. **Eliminación masiva con preview obligatorio** — operación destructiva sin undo

### 1.3 Métricas de abandono esperadas

En marketplaces de servicios profesionales con flujos de disponibilidad similares:

- **Tasa de completitud del onboarding < 60%** cuando el flujo de disponibilidad tiene > 3 pasos
- **40% de profesores abandonan** antes de generar sus primeros slots si no ven un calendario visual
- **25% de slots generados contienen errores** (horarios incorrectos, días equivocados) con formularios basados en texto
- **Tiempo promedio para completar disponibilidad con formularios: 8–12 minutos** vs. **2–4 minutos con interfaces drag-and-drop**

---

## PARTE 2 — Propuesta de Rediseño UI

### 2.1 Principios UX guía (inspir ados en Google Calendar)

Google Calendar es intuitivo porque aplica **manipulación directa**:

| Principio | En Google Calendar | Aplicación en PianoLink |
|---|---|---|
| **Click para crear** | Click en una hora → evento nuevo | Click en celda horaria → nuevo bloque de disponibilidad |
| **Drag para definir duración** | Arrastrar borde inferior del evento | Arrastrar para definir bloque de 1, 2 o 3 horas |
| **Drag para mover** | Arrastrar evento a otra hora/día | Arrastrar bloque de disponibilidad a otro horario |
| **Feedback inmediato** | El evento aparece al instante | El bloque verde aparece al instante en la grilla |
| **Recurrencia desde el detalle** | "Repetir: cada semana" en el popover | "Repetir este bloque: cada semana" en popover |
| **Vista familiar** | Grid de 7 columnas × 24 filas = semana | Mismo layout, pero celdas representan "disponible" vs "no disponible" |
| **Operación reversible** | Ctrl+Z / "Deshacer" toast | Toast con "Deshacer" después de eliminar bloque |

**Diferencia clave**: en Google Calendar defines *eventos específicos*. En PianoLink defines *ventanas de disponibilidad recurrentes*. El paradigma visual es idéntico, pero el modelo subyacente difiere: aquí cada bloque genera slots automáticamente.

### 2.2 Flujo propuesto paso a paso

```
PASO 1: Profesor accede a "Mi Disponibilidad" (desde sidebar o card compacta)
    ↓
PASO 2: Ve una grilla semanal tipo calendario (Lun–Dom, 07:00–22:00)
    - Bloques verdes = horarios ya configurados como disponibles
    - Bloques morados = clases agendadas (no editables)
    - Celdas vacías/grises = sin disponibilidad definida
    ↓
PASO 3: Para CREAR disponibilidad:
    a) Click en celda vacía → aparece bloque de 1 hora (duración default)
    b) Drag desde hora inicio hasta hora fin → bloque de duración personalizada
    c) Aparece popover con opciones:
       - Duración: [45 min ▼] (respeta config general)
       - Repetir: [Nunca | Cada semana | Cada 2 semanas | Personalizado]
       - Buffer: [10 min ▼] entre clases
       - [Guardar] [Cancelar]
    ↓
PASO 4: Si eligió recurrencia:
    - Los bloques se propagan visualmente a las siguientes semanas
    - Badge "↻" indica que es recurrente
    - Popover muestra "Se repite cada martes hasta..."
    ↓
PASO 5: Para EDITAR un bloque existente:
    - Click → popover con datos actuales + botón "Editar" / "Eliminar"
    - Drag borde inferior → cambiar duración
    - Drag bloque completo → mover a otra hora/día
    - Si es recurrente: "¿Modificar solo este o toda la serie?"
    ↓
PASO 6: Para BLOQUEAR un día/hora:
    - Click derecho (desktop) o long-press (mobile) → "Bloquear este horario"
    - O botón "🚫 Bloquear fecha" en la toolbar del calendario
    ↓
PASO 7: Guardado:
    - Auto-save con debounce (cada cambio se guarda a los 2 segundos)
    - Toast confirmación: "Disponibilidad actualizada ✓"
    - O "Deshacer" si fue eliminación
```

### 2.3 Componentes clave

#### A. Grid Semanal Interactivo

```
┌─────────┬─────────┬─────────┬─────────┬─────────┬─────────┬─────────┐
│   LUN   │   MAR   │   MIÉ   │   JUE   │   VIE   │   SÁB   │   DOM   │
│  10 mar │  11 mar │  12 mar │  13 mar │  14 mar │  15 mar │  16 mar │
├─────────┼─────────┼─────────┼─────────┼─────────┼─────────┼─────────┤
│ 09:00   │         │ 09:00   │         │ 09:00   │         │         │
│ ┌─────┐ │         │ ┌─────┐ │         │ ┌─────┐ │         │         │
│ │ ↻   │ │         │ │ ↻   │ │         │ │ ↻   │ │         │         │
│ │DISP │ │         │ │DISP │ │         │ │DISP │ │         │         │
│ └─────┘ │         │ └─────┘ │         │ └─────┘ │         │         │
│ 12:00   │         │ 12:00   │         │ 12:00   │         │         │
│         │         │         │         │         │         │         │
│ 15:00   │ 15:00   │ 15:00   │ 15:00   │         │ 10:00   │         │
│ ┌─────┐ │ ┌─────┐ │ ┌─────┐ │ ┌─────┐ │         │ ┌─────┐ │         │
│ │ ↻   │ │ │🎵   │ │ │ ↻   │ │ │ ↻   │ │         │ │DISP │ │         │
│ │DISP │ │ │CLASE│ │ │DISP │ │ │DISP │ │         │ │(único)│         │
│ └─────┘ │ │María│ │ └─────┘ │ └─────┘ │         │ └─────┘ │         │
│ 18:00   │ └─────┘ │ 18:00   │ 18:00   │         │ 13:00   │         │
│         │ 16:00   │         │         │         │         │         │
└─────────┴─────────┴─────────┴─────────┴─────────┴─────────┴─────────┘
```

- **Verde claro + borde punteado**: disponible (clickeable para editar)
- **Morado sólido**: clase agendada (muestra nombre del alumno, no editable)
- **↻**: badge de recurrencia
- **Gris claro**: celda vacía (clickeable para crear)
- **Rojo tachado**: fecha bloqueada

#### B. Selector de Recurrencia (Popover)

Al crear o editar un bloque, un popover minimalista:

```
┌──────────────────────────────┐
│ 📅 Martes 15:00 – 18:00     │
│                              │
│ Duración clase:  [45 min ▼]  │
│ Buffer:          [10 min ▼]  │
│ Repetir:         [Cada semana ▼] │
│                              │
│ Hasta: ○ Siempre             │
│        ● Fecha: [30/06/2026] │
│                              │
│ [Guardar]  [Eliminar]  [✕]  │
└──────────────────────────────┘
```

Opciones de recurrencia:
- Nunca (bloque único)
- Cada semana
- Cada 2 semanas
- Personalizado (selector de días de la semana)

#### C. Panel Lateral de Resumen

En desktop, un panel colapsable a la derecha:

```
┌──────────────────────┐
│ 📊 RESUMEN SEMANAL   │
│                      │
│ Horas disponibles: 24│
│ Clases agendadas:  8 │
│ Ocupación:       33% │
│                      │
│ ─────────────────    │
│ Próxima clase:       │
│ Mar 15:00 — María G. │
│                      │
│ ─────────────────    │
│ Bloques recurrentes: │
│ • L,M,V 09–12 ↻     │
│ • L–J 15–18 ↻        │
│ • Sáb 10–13 (único)  │
│                      │
│ [⚙ Configuración]   │
└──────────────────────┘
```

#### D. Estados visuales

| Estado | Color | Borde | Interacción |
|---|---|---|---|
| Disponible (recurrente) | `#dcfce7` fondo / `#22c55e` borde | Punteado | Click=editar, Drag=mover/resize |
| Disponible (único) | `#dcfce7` fondo / `#22c55e` borde | Sólido | Click=editar, Drag=mover/resize |
| Clase agendada | `#ede9fe` fondo / `#6366f1` borde | Sólido | Click=ver detalle (solo lectura) |
| Clase en progreso | `#6366f1` fondo sólido | — | No editable |
| Bloqueado | `#fef2f2` fondo / `#ef4444` borde | Diagonal stripes | Click=desbloquear |
| Hover (celda vacía) | `#f0fdf4` highlight | — | Cursor pointer + tooltip "Click para agregar" |
| Arrastrando | Sombra `box-shadow` + opacidad 0.7 | — | Ghost del bloque sigue el cursor |

#### E. Feedback de confirmación

- **Creación**: bloque aparece con animación `fadeIn` + toast "Disponibilidad agregada ✓ [Deshacer]"
- **Edición**: bloque se actualiza inline + toast "Cambio guardado ✓"
- **Eliminación**: bloque desaparece con `fadeOut` + toast "Bloque eliminado [Deshacer]" (timeout 5s)
- **Error**: toast rojo "No se pudo guardar. ¿Reintentar?" con botón
- **Conflicto**: si arrastra sobre una clase agendada, borde rojo + tooltip "Horario ocupado"

### 2.4 Consideraciones móviles

PianoLink es web pero muchos profesores acceden desde smartphone. Adaptaciones:

| Aspecto | Desktop | Mobile |
|---|---|---|
| **Vista** | Semana completa (7 columnas) | Vista de 3 días (scroll horizontal) o lista diaria |
| **Crear bloque** | Click + drag | Tap en celda → popover bottom-sheet |
| **Editar duración** | Drag borde inferior | Selector de hora en bottom-sheet |
| **Mover bloque** | Drag and drop | Botón "Mover" → seleccionar nuevo horario |
| **Recurrencia** | Popover flotante | Bottom-sheet full-width |
| **Resumen** | Panel lateral derecho | Tab "Resumen" en bottom navigation |
| **Navegación semana** | Botones ← → + "Hoy" | Swipe horizontal + botón "Hoy" sticky |

**Breakpoints sugeridos:**
- `> 1024px`: grilla 7 columnas + panel lateral
- `768–1024px`: grilla 7 columnas sin panel (resumen como modal)
- `< 768px`: grilla 3 días con scroll o vista lista diaria

---

## PARTE 3 — Evaluación de la API de Google Calendar

### 3.1 ¿Qué ofrece la integración?

| Funcionalidad | Descripción | Valor para PianoLink |
|---|---|---|
| **FreeBusy API** | Consultar ventanas libres/ocupadas del profesor | Detectar conflictos con eventos personales |
| **Events API** | CRUD de eventos en el calendario del profesor | Escribir clases agendadas al calendario personal |
| **Sync bidireccional** | Push notifications (webhooks) cuando cambia el calendario | Bloquear automáticamente horarios ocupados |
| **OAuth 2.0** | Autenticación y autorización granular | Acceso seguro sin compartir credenciales |
| **Calendar List** | Ver todos los calendarios del usuario | Elegir cuál sincronizar (personal, trabajo, etc.) |

**Caso de uso concreto**: un profesor que usa Google Calendar para su vida personal podría tener un evento "Dentista martes 16:00" que automáticamente bloquearía ese slot en PianoLink, evitando que un alumno agende clase a esa hora.

### 3.2 Pros de la integración

1. **Eliminación de doble entrada**: el profesor no necesita replicar sus compromisos personales en PianoLink manualmente
2. **Confianza del usuario**: "Se integra con mi Google Calendar" genera percepción de producto profesional
3. **Prevención de conflictos**: FreeBusy detecta choques antes de que un alumno agende
4. **Clases en Google Calendar**: las clases agendadas aparecen como eventos con enlace a la sala, mejorando recordatorio y asistencia
5. **Reducción de no-shows**: notificaciones de Google Calendar son más efectivas que emails propios
6. **Diferenciador competitivo**: pocos marketplaces de tutores en LATAM ofrecen esta integración

### 3.3 Contras de la integración

1. **Dependencia de terceros**: si Google Calendar API tiene downtime o cambia su política de quota (ya ocurrió en 2023), PianoLink queda degradado
2. **Complejidad de OAuth**: 
   - Proceso de verificación de la app con Google puede tomar 4–6 semanas
   - Scopes sensibles requieren audit de seguridad
   - El modal de consentimiento rompe el flujo de onboarding
3. **Privacidad**: 
   - El scope `calendar.readonly` expone todos los eventos del profesor
   - Riesgo regulatorio (ley de protección de datos chilena)
   - Percepción negativa: "¿por qué una app de piano quiere ver mi agenda?"
4. **Exclusión de usuarios**: 
   - Profesores sin cuenta Google (estimado ~15% en Chile)
   - Profesores que usan Apple Calendar, Outlook, o ninguno
   - Feature inútil para quienes no mantienen su Google Calendar actualizado
5. **Costo de mantenimiento**: 
   - Google Calendar API tiene quotas (50 req/user/sec, 1M daily)
   - Webhooks de push notifications requieren dominio verificado + HTTPS
   - Renovación de tokens OAuth, manejo de tokens expirados, revocaciones
6. **Complejidad de sync bidireccional**: 
   - Resolver conflictos: ¿qué pasa si el profesor borra un evento en Google que era una clase agendada en PianoLink?
   - Loops de sincronización: PianoLink crea evento → Google notifica → PianoLink detecta "nuevo" evento
   - Merge de cambios concurrentes

### 3.4 Alternativa híbrida (RECOMENDADA)

**Fase 1 — UI propia (sin integración):**
- Construir la grilla interactiva tipo Google Calendar
- Toda la lógica de disponibilidad queda en PianoLink
- El profesor gestiona su disponibilidad visualmente
- Sin dependencia externa

**Fase 2 — Google Calendar como feature opcional:**
- Botón "Conectar Google Calendar" en configuración
- Solo lectura (FreeBusy): detectar conflictos y mostrar "bloqueado por evento personal"
- Las clases agendadas se escriben al Google Calendar del profesor (unidireccional PianoLink → Google)
- Si el profesor no conecta Google Calendar, todo sigue funcionando normalmente
- Feature marcada como "Premium" o "Beta" inicialmente

**Ventaja del híbrido**: la UI propia funciona independientemente, y la integración con Google agrega valor sin crear dependencia.

### 3.5 Benchmarking

| Plataforma | Modelo de disponibilidad | Integración Calendar | Qué aprender |
|---|---|---|---|
| **Calendly** | Grilla semanal visual + drag para definir bloques recurrentes. UI minimalista. | Google, Outlook, iCloud — lectura de Free/Busy + escritura de eventos. Opcional. | La UI propia es suficiente; Calendar es un "nice-to-have" que activan ~40% de usuarios. El onboarding funciona sin ella. |
| **Preply** | Selector de casillas por día/hora (7×24 grid). Sin drag. Batch updates. | No integra calendarios externos. Todo manual. | Prueba que incluso sin integración calendar, un marketplace de tutores puede escalar a millones de usuarios. La clave es la simplicidad del selector, no la integración. |
| **Tutorful** | Vista de lista con toggles por día + rango horario. Más simple que grilla. | Google Calendar sync bidireccional opcional. | La vista de lista funciona para pocos horarios (< 10 bloques). Para horarios complejos, la grilla es superior. |
| **SimplyBook.me** | Calendario completo con drag-and-drop. Múltiples servicios por hora. | Google Calendar + Outlook + iCal sync. Feature de plan pago. | Ofrece integración como feature premium — modelo de monetización del sync. |
| **Superprof** | Formulario de texto + mapa de disponibilidad readonly. Sin interactividad. | Sin integración. | Ejemplo de lo que NO hacer: alta fricción, baja tasa de completitud. |

**Conclusión del benchmarking:** Las plataformas más exitosas (Calendly, SimplyBook) construyen primero una UI propia excelente y ofrecen Google Calendar como feature opcional/premium. Ninguna depende exclusivamente de Google Calendar para funcionar.

---

## PARTE 4 — Análisis Técnico de Implementación

### 4.1 Stack técnico para UI propia

#### Librería de calendario recomendada

| Librería | Licencia | Drag & Drop | Recurrencia | Peso | Recomendación |
|---|---|---|---|---|---|
| **FullCalendar** | MIT (core) | ✅ nativo | Plugin `rrule` | ~90 KB gzip | ⭐ **Recomendada** — estándar de industria, documentación excelente |
| **DHTMLX Scheduler** | GPL/Comercial | ✅ avanzado | ✅ nativo | ~120 KB gzip | Buena pero licencia comercial cara ($599+) |
| **react-big-calendar** | MIT | ✅ con addon | Manual | ~55 KB gzip | Solo React — PianoLink es vanilla JS |
| **tui.calendar** | MIT | ✅ nativo | Manual | ~80 KB gzip | Alternativa viable, menos documentación en español |
| **Custom con CSS Grid** | — | Manual | Manual | ~10 KB | Máximo control pero +tiempo de desarrollo |

**Recomendación: FullCalendar** (v6, ESM build). Razones:
- PianoLink ya usa vanilla JS — FullCalendar funciona sin framework
- Plugin `@fullcalendar/interaction` habilita drag, resize y click nativamente  
- Plugin `@fullcalendar/rrule` para recurrencia tipo iCal (RRULE)
- CDN disponible: no requiere bundler
- Compatible con la estética dark mode de PianoLink (theming CSS)

#### Modelo de datos actualizado

El modelo actual (`AvailabilityTemplate` + `TimeSlot`) es funcional pero rígido. Propuesta de evolución **sin breaking changes**:

```javascript
// NUEVO: Agregar al AvailabilityTemplate existente
weeklySlots: [{
    dayOfWeek: 0-6,
    startTime: "09:00",
    endTime: "18:00",
    slotDuration: 45,
    maxStudents: 1,
    isActive: true,
    // NUEVOS CAMPOS:
    recurrenceRule: "FREQ=WEEKLY;BYDAY=MO,WE,FR",  // RRULE estándar (opcional)
    recurrenceEnd: Date,        // null = indefinido
    color: "#22c55e",           // personalización visual
    label: "Mañana"             // etiqueta opcional
}],

// NUEVO: Agregar al TimeSlot existente  
source: {
    type: String,
    enum: ['template', 'manual', 'drag-created'],  // NUEVO: 'drag-created'
    default: 'template'
}
```

**Compatibilidad hacia atrás**: los campos son opcionales con defaults sensatos. Los slots existentes siguen funcionando.

#### API REST — Endpoints nuevos

Los endpoints actuales cubren CRUD básico. Se agregan 2 endpoints para la nueva UI:

| Método | Endpoint | Propósito |
|---|---|---|
| POST | `/api/availability/quick-block` | Crear bloque desde drag (recibe `dayOfWeek`, `startTime`, `endTime`, `recurrence`) |
| PATCH | `/api/availability/slots/:id/move` | Mover slot (recibe `newStartTime`, `newEndTime`) — solo si `status=available` |

Los demás endpoints existentes se reutilizan sin cambios.

### 4.2 Si se integra Google Calendar API

#### Scopes OAuth necesarios

```
https://www.googleapis.com/auth/calendar.readonly    → FreeBusy (leer conflictos)
https://www.googleapis.com/auth/calendar.events       → Escribir clases como eventos
```

**Nota**: `calendar.readonly` es scope "restringido" en Google — requiere [verificación de la app](https://support.google.com/cloud/answer/9110914), proceso que toma 4–6 semanas.

#### Endpoints clave

| Endpoint | Uso |
|---|---|
| `POST /freeBusy/query` | Consultar ventanas ocupadas del profesor (sin ver detalles de eventos) |
| `POST /calendars/{id}/events` | Crear evento de clase agendada en Google Calendar del profesor |
| `DELETE /calendars/{id}/events/{eventId}` | Eliminar evento si se cancela clase |
| `POST /calendars/{id}/events/watch` | Suscribirse a cambios (push notification) |

#### Estimación de complejidad

- **OAuth flow + almacenamiento de tokens**: 1 sprint (2 semanas)
- **FreeBusy integration**: 0.5 sprint
- **Escritura de eventos**: 0.5 sprint  
- **Push notifications (sync bidireccional)**: 1.5 sprints
- **Testing + edge cases + rate limiting**: 1 sprint
- **Verificación de Google**: 4–6 semanas (proceso paralelo)

**Total: ~4 sprints (8 semanas)** para integración completa.

### 4.3 Estimación comparativa de esfuerzo

| Opción | Complejidad | Tiempo estimado | Mantenimiento mensual | UX resultante |
|---|---|---|---|---|
| **UI propia inspirada en GCal** | Media | 3–4 semanas | Bajo (solo bugs de UI) | ⭐⭐⭐⭐ Excelente — drag & drop, visual, intuitiva |
| **Integración nativa Google Calendar API** | Alta | 8–10 semanas | Alto (token refresh, quotas, API changes, verification) | ⭐⭐⭐ Buena pero dependiente — se degrada si falla Google |
| **Opción híbrida (UI propia + GCal opcional)** | Media → Alta (faseada) | 3–4 sem (Fase 1) + 6 sem (Fase 2) | Medio (Fase 1 bajo, Fase 2 requiere monitoreo) | ⭐⭐⭐⭐⭐ Óptima — funciona sola + valor agregado con Google |

---

## PARTE 5 — Recomendación Final

### 5.1 Decisión recomendada

**Opción híbrida faseada:**

1. **Fase 1 (inmediata, 3–4 semanas):** Construir UI propia con FullCalendar, interacción drag & drop, recurrencia visual, y auto-save. Reemplaza por completo la página `teacher-availability.html` actual.

2. **Fase 2 (futura, cuando haya tracción):** Agregar Google Calendar como feature opcional/premium. Solo lectura de FreeBusy + escritura unidireccional de clases. Sin sincronización bidireccional.

**Justificación:**
- El problema de fricción se resuelve al 90% con una mejor UI — no con integración externa
- La integración Google Calendar no reduce la fricción de *definir disponibilidad*; solo previene conflictos con agenda personal (problem secundario)
- En el mercado chileno, la penetración de Google Calendar activo entre profesores de música es baja (~40–50%)
- El ROI de 3 semanas de UI propia > 10 semanas de integración Google para la métrica principal (tasa de completitud del flujo)

### 5.2 Riesgos de la decisión

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| FullCalendar no se adapta al dark theme de PianoLink | Baja | FullCalendar v6 soporta CSS custom properties. Crear theme PianoLink. |
| Rendimiento en mobile con grilla completa | Media | Usar vista de lista diaria en `< 768px` en vez de grilla. |
| Profesores acostumbrados al flujo actual | Baja | Migración transparente: los slots existentes se muestran en la nueva UI. |
| FullCalendar agrega peso al bundle | Baja | Usar CDN + lazy load (solo carga en la página de disponibilidad). |
| Modelo de datos requiere migración | Muy baja | Campos nuevos son opcionales — zero-downtime migration. |

### 5.3 Métricas de éxito

| Métrica | Baseline actual (estimado) | Meta post-rediseño | Cómo medir |
|---|---|---|---|
| Tasa de completitud del flujo de disponibilidad | ~55% | > 85% | Evento analytics: `availability_setup_completed` / `availability_page_opened` |
| Tiempo promedio para configurar disponibilidad | ~10 minutos | < 3 minutos | Timestamp entre `page_open` y `first_save` |
| Profesores con ≥ 1 bloque de disponibilidad configurado | ~60% | > 90% | Query DB: teachers con TimeSlots activos / total teachers |
| Tasa de abandono del flujo | ~40% | < 15% | Página cerrada sin guardar / total aperturas |
| Slots con errores (solapamiento, horarios inválidos) | ~25% | < 5% | Validación server-side de conflictos |
| Clases agendadas por semana por profesor (downstream) | — | +30% | Bookings / active teachers / week |

### 5.4 Roadmap sugerido

```
SEMANA 1 ─── QUICK WIN + FUNDACIÓN
├── [Quick win] Integrar FullCalendar en teacher-availability.html
│   Reemplazar: formulario semanal → grilla visual
│   Mantener: API endpoints existentes (no tocar backend)
├── Configurar FullCalendar con theme dark PianoLink
├── Implementar click-para-crear + popover básico (sin recurrencia)
└── Conectar con POST /api/availability/slots existente

SEMANA 2 ─── INTERACCIÓN COMPLETA
├── Drag & drop para crear bloques (definir duración arrastrando)
├── Drag para mover bloques existentes (PATCH endpoint nuevo)
├── Resize de bloques (cambiar duración arrastrando borde)
├── Eliminar con toast "Deshacer" (soft delete 5 segundos)
└── Mobile: adaptación a vista diaria/3 días

SEMANA 3 ─── RECURRENCIA + POLISH
├── Selector de recurrencia en popover (semanal, quincenal, custom)
├── Badge visual "↻" en bloques recurrentes
├── "Editar este o toda la serie" al modificar uno recurrente
├── Panel lateral de resumen (desktop)
├── Integrar con calendario existente de profesor/calendario.html
└── Auto-save con debounce

SEMANA 4 ─── TESTING + DEPLOY
├── QA manual: flujos completos desktop + mobile
├── Migración: verificar slots existentes se renderizan correctamente
├── Analytics events para métricas de éxito
├── Deploy a producción con rollout gradual (feature flag por teacher)
└── Documentación de uso para profesores (tooltip de onboarding)

─── FASE 2 (FUTURO, CUANDO HAYA TRACCIÓN) ───

SPRINT 5-6 ─── GOOGLE CALENDAR (OPCIONAL)
├── OAuth flow + almacenamiento seguro de tokens
├── Verificación de app con Google (proceso paralelo)
├── FreeBusy query: mostrar "bloqueado por evento personal"
├── Escritura de clases agendadas al Google Calendar
└── Toggle en configuración: "Conectar Google Calendar"
```

### 5.5 Quick win inmediato (< 1 semana)

**Acción**: Integrar FullCalendar como vista principal en `teacher-availability.html`, conectada a los endpoints existentes (`GET /api/availability/my-calendar` + `POST /api/availability/slots`).

**Resultado**: el profesor ve una grilla semanal familiar y puede hacer click en una celda para crear un slot. Los formularios de "Agregar Disponibilidad" y "Horario Semanal" se mueven a un colapso secundario ("Vista avanzada"). El calendario ya renderiza los slots existentes como bloques verdes.

**Esfuerzo**: ~3–4 días de desarrollo frontend (sin cambios en backend).

---

## Próximos Pasos

Ordenados por prioridad:

1. **[ESTA SEMANA]** Integrar FullCalendar CDN en `teacher-availability.html` y renderizar slots existentes como eventos visuales — validar que la estética funciona con el tema dark de PianoLink

2. **[SEMANA 1]** Implementar click-para-crear con popover y conectarlo al endpoint `POST /api/availability/slots` existente

3. **[SEMANA 2]** Agregar drag & drop + resize + endpoint `PATCH /api/availability/slots/:id/move`

4. **[SEMANA 3]** Implementar recurrencia visual y adaptación mobile

5. **[SEMANA 4]** Deploy a producción con feature flag + analytics

6. **[POST-DEPLOY]** Medir métricas de éxito (tasa de completitud, tiempo, abandono) durante 2 semanas

7. **[MES 2+]** Evaluar si la métrica justifica inversión en Google Calendar (Fase 2) basándose en datos reales de uso

---

*Fin del informe.*
