# 🎨 Propuesta de Mejoras UI — Dashboard del Profesor

**Fecha:** 25 de febrero de 2026  
**Autor:** Auditoría UX/UI SaaS  
**Archivo evaluado:** `public/dashboard.html` (6,416 líneas)

---

## 📋 Resumen Ejecutivo

El dashboard actual tiene buena base visual (tema oscuro, layout sidebar + main), pero presenta **problemas serios de navegabilidad, coherencia de guardado, densidad de información y estructura del contenido**. La experiencia se siente como un "muro de secciones" en scroll infinito, no como un panel SaaS con navegación clara.

---

## � DEPENDENCIAS CRÍTICAS — NO ROMPER

> **⚠️ La foto de perfil y la biografía** que aparecen al inicio del dashboard (sección "Identidad de Marca") **se consumen en otros módulos de la plataforma:**
>
> 1. **Sala del profesor** (`/sala/:slug`) — Muestra la foto 
> 2. **Página de login / landing de fundadores** — Muestra foto y bio de los profesores fundadores como testimonios/referencia.
>
> **Reglas al refactorizar:**
> - Los campos `profilePhoto` / `photo` y `bio` / `biography` del modelo de profesor **NO deben eliminarse ni renombrarse**.
> - Si se unifica el campo de biografía (ver problema #2), el campo resultante debe seguir alimentando tanto la sala como la vista de fundadores.
> - Si se mueve la foto/bio a una nueva página (`/profesor/configuracion.html` o `/profesor/perfil.html`), asegurar que el endpoint `POST /update` o `PUT /api/teacher-profile/my-profile` siga guardando correctamente estos campos en la misma colección/documento que leen la sala y el login.
> - **Antes de hacer deploy de cualquier cambio en foto/bio:** verificar manualmente que la sala y la vista de fundadores en login siguen mostrando los datos correctamente.

---

## �🔴 PROBLEMAS CRÍTICOS (Prioridad Alta)

### 1. Duplicidad de navegación confusa

**Problema:** Existen dos sistemas de navegación paralelos que compiten:
- **Sidebar:** Tiene un `<nav class="profesor-nav">` con links a sub-vistas (`/profesor/calendario.html`, `/profesor/estudiantes.html`, etc.)
- **Main content:** Muestra esas MISMAS secciones inline (Calendario, Estudiantes, Validar Clases) como divs dentro de la misma página

**Impacto:** El profesor no sabe si debe hacer scroll para llegar a "Mis Estudiantes" o si debe hacer clic en el sidebar. La duplicación genera confusión y carga innecesaria.

**Propuesta:**
- **Opción A (recomendada):** Dashboard = solo resumen (KPIs, próximas clases del día, alertas). Cada sección vive en su sub-vista propia (`/profesor/calendario.html`, etc.). El nav lateral es la forma de navegar.
- **Opción B:** Single-page con tabs/anchor navigation que oculten/muestren secciones al clic del sidebar, sin scroll largo.

---

### 2. Tres biografías, tres formas de guardar

**Problema:** Hay **3 puntos distintos** donde se edita información del perfil del profesor, cada uno con mecanismo de guardado diferente:

| Ubicación | Campo | Guardado |
|-----------|-------|----------|
| **Main > Identidad de Marca** (card) | `bioInput` — Biografía corta | `profileForm.submit` → `POST /update` (con FormData, incluye logo+foto) |
| **Main > Mi Perfil Público** (sección) | `profileBio` — Biografía corta | `onchange="savePublicProfile()"` → auto-save con debounce 500ms → `PUT /api/teacher-profile/my-profile` |
| **Modal > Editar Perfil** (popup) | Nombre, email, contraseña | `editProfileForm.onsubmit` → `updateUserProfile()` |

**Impacto:** El profesor escribe su biografía en "Identidad de Marca", pero **no tiene feedback** de que debe hacer scroll hasta abajo y presionar "💾 GUARDAR CAMBIOS". Si va a "Mi Perfil Público", hay OTRO campo de biografía que **se guarda solo con onchange** (autoguardado). No está claro cuál es "la" biografía, ni si son la misma.

**Propuesta:**
- Unificar en **un solo flujo de perfil**: Modal completo o página dedicada `/profesor/perfil-editar.html` con todas las secciones (marca, bio, foto, colores, perfil público).
- Un solo botón "Guardar" visible con estado (guardando → guardado ✓).
- Eliminar el `bioInput` duplicado de la card "Identidad de Marca" — que apunte al mismo campo.

---

### 3. Botón "Guardar Cambios" no accesible

**Problema:** El botón `💾 GUARDAR CAMBIOS` del formulario de Identidad de Marca está en la columna derecha del grid, debajo de la sección de colores. El profesor que edita la biografía (columna izquierda) no lo ve.

**Impacto:** Profesores como "María" podrían escribir su biografía, no encontrar el botón de guardar, y perder el texto.

**Propuesta:**
- **Sticky save bar:** Barra fija inferior (tipo Shopify/Notion) que aparece cuando hay cambios sin guardar:
  ```
  ┌──────────────────────────────────────────────────────────┐
  │ ⚠️ Tienes cambios sin guardar          [Descartar] [💾 Guardar] │
  └──────────────────────────────────────────────────────────┘
  ```
- Implementar detección de cambios (`dirty flag`) en inputs y textareas.
- Agregar `beforeunload` para prevenir pérdida de datos.

---

### 4. Scroll infinito sin secciones colapsables

**Problema:** El contenido principal tiene ~10 secciones en scroll vertical continuo:
1. Mensajes Admin
2. Calendario Semanal
3. Mis Estudiantes
4. Identidad de Marca (form)
5. Tema de Sala + Guardar
6. Tarifas y Paquetes
7. Mi Perfil Público
8. Datos de Pago
9. Solicitudes de Recuperación
10. Validar Clases

**Impacto:** El profesor no puede encontrar rápido una sección. Debe hacer scroll extenso. No hay anclas ni índice.

**Propuesta:**
- **Dividir en tabs o páginas separadas** (el nav lateral ya tiene los links, solo hay que usarlos):
  - **🏠 Resumen:** KPIs + Próximas clases del día + Alertas/banners
  - **📅 Agenda:** Calendario semanal (ya existe en `/profesor/calendario.html`)
  - **👥 Estudiantes:** Lista + bitácora (ya existe en `/profesor/estudiantes.html`)
  - **⚙️ Configuración:** Marca, colores, tarifas, paquetes, datos de pago
  - **🌐 Perfil:** Perfil público + biografía + especialidades
  - **✅ Validaciones:** Validar clases (ya existe en `/profesor/validar.html`)

---

## 🟡 PROBLEMAS DE UX MEDIANOS (Prioridad Media)

### 5. Sidebar sobrecargado

**Problema:** El sidebar contiene ~20 elementos: avatar, badge fundador, ganancias, banner de renovación, banner expirado, botones IR A MI SALA, COPIAR LINK, EDITAR PERFIL, sección MI PLAN con sub-cards, invitaciones, modal invitar, upsell, disponibilidad, nav links, manual, chat fundador, y cerrar sesión.

**Propuesta:**
- **Sidebar simplificado** con máximo 3 zonas:
  1. **Header:** Logo + nombre + badge plan
  2. **Navegación:** Los 5-6 links principales
  3. **Footer:** Cerrar sesión + versión
- Mover **ganancias, plan, invitaciones** al contenido principal (sección "Resumen" o "Mi Plan")
- **Botón "IR A MI SALA"** → floating action button (FAB) o sticky en header del main, no enterrado en sidebar
- Mover **chat fundador** a un widget flotante estilo Intercom (ícono en esquina inferior)

---

### 6. Inconsistencia en los patrones de guardado

| Sección | Mecanismo | Feedback |
|---------|-----------|----------|
| Identidad de Marca | Botón "Guardar Cambios" | Texto `#msg` arriba del botón |
| Perfil Público | Auto-save `onchange` con debounce | Banner `#profileSaveStatus` al fondo |
| Tarifa por clase | Botón "Guardar Tarifa" | `alert()` nativo |
| Paquetes | Botón "Guardar Paquetes" | `alert()` nativo |
| Datos de Pago | Botón "Guardar Datos de Pago" | Texto `#paymentSaveStatus` al lado |
| Editar Perfil (modal) | Botón "Guardar Cambios" en footer modal | Banner `#profileMsg` arriba |

**Propuesta:** Unificar a un solo patrón:
- **Toast/Snackbar** global en esquina inferior derecha para feedback de guardado.
- Reemplazar **todos los `alert()`** por toasts no-bloqueantes.
- Estándar: o todo auto-save (estilo Notion) o todo con botón explícito. No mezclar.

---

### 7. Inline styles excesivos

**Problema:** Cientos de elementos usan `style=""` inline en vez de clases CSS. Ejemplos:
- La tarjeta "MI PLAN" es un `<div>` de 40 líneas todas con inline styles
- Banners de renovación/expiración son 100% inline
- Todos los formularios de pago tienen estilos inline

**Impacto:** Imposible mantener un design system consistente. Cualquier cambio de diseño requiere editar HTML en decenas de lugares.

**Propuesta:**
- Extraer a clases CSS reutilizables: `.plan-card`, `.banner-warning`, `.banner-error`, `.form-field`, `.payment-section`
- Crear un mini design system con variables CSS (ya existen `--accent`, `--panel-bg`, etc.)
- Un solo `profesor-dashboard.css` con todos los componentes

---

### 8. Modal de "Editar Perfil" incompleto

**Problema:** El modal solo edita nombre, email y contraseña. Pero "editar perfil" sugiere que podría incluir biografía, foto, etc.

**Propuesta:**
- Renombrar a **"Cuenta y Seguridad"** (nombre, email, contraseña)
- O bien convertirlo en el punto único de edición de todo el perfil con tabs internos:
  - Tab 1: Cuenta (nombre, email, password)
  - Tab 2: Marca (logo, foto, bio, colores)
  - Tab 3: Perfil público (especialidades, experiencia, video)

---

### 9. CTAs (Call to Action) compiten entre sí

**Problema:** En el sidebar hay botones de:
- ⚡ IR A MI SALA (primario naranja)
- 🔗 COPIAR LINK (secundario)
- 👤 EDITAR PERFIL (secundario)
- ⚡ Upgrade a Premium (violeta)
- 🔄 Renovar Membresía (azul)
- + Invitar Alumno (verde)
- 📅 MI DISPONIBILIDAD (secundario)
- 📚 MANUAL (violeta)
- + links de nav

**Propuesta:**
- **1 CTA primario** visible: "IR A MI SALA" (siempre arriba)
- Los demás como links/íconos en nav, no botones
- Banners de upgrade/renovación solo cuando aplique, colapsables

---

### 10. Responsive deficiente en sidebar

**Problema:** El sidebar tiene `width: 280px` fijo. En pantallas < 900px no hay media query para colapsar el sidebar. El body tiene `overflow: hidden`, lo cual impide scroll si el sidebar desborda.

**Propuesta:**
- Sidebar colapsable a íconos en < 1024px
- Hamburger menu en < 768px
- Main content ocupa 100% cuando sidebar está colapsado
- Touch-friendly: mínimo 44px en targets de tap

---

## 🟢 MEJORAS NICE-TO-HAVE (Prioridad Baja)

### 11. Onboarding para profesores nuevos

**Problema:** Un profesor nuevo ve todo vacío: 0 estudiantes, 0 ganancias, calendario vacío, pero todas las secciones visibles. No hay guía de "primeros pasos".

**Propuesta:**
- **Checklist de onboarding** en el resumen:
  ```
  ✅ Crear cuenta
  ⬜ Subir foto de perfil
  ⬜ Completar biografía
  ⬜ Configurar disponibilidad
  ⬜ Activar perfil público
  ⬜ Configurar datos de pago
  ```
- Ocultar secciones vacías (validaciones, recuperaciones) hasta que tengan datos
- Empty states con CTAs claros ("Configura tu disponibilidad para empezar a recibir alumnos →")

---

### 12. Cards de estadísticas en el resumen

**Propuesta:** Agregar KPIs rápidos en la vista "Resumen":
```
┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐
│ 📅 Clases  │ │ 👥 Alumnos │ │ 💰 Mes     │ │ ⭐ Rating  │
│ esta semana│ │ activos   │ │ actual    │ │           │
│    12      │ │    8      │ │  $240     │ │  4.8/5    │
└───────────┘ └───────────┘ └───────────┘ └───────────┘
```

---

### 13. Accesibilidad (a11y)

**Problemas detectados:**
- Botones con solo emojis sin `aria-label`
- Contrastes bajos: `color: #888` sobre `#1e1e1e` = ratio ~3.5:1 (debería ser ≥4.5:1)
- Inputs sin labels asociados con `for`
- No hay skip-navigation link
- Focus states no visibles en muchos elementos

---

### 14. Mejorar feedback de la biografía

**Problema específico reportado:** No queda claro cómo se guarda la biografía.

**Propuesta concreta:**
- Agregar **contador de caracteres** en tiempo real: `127/500`
- Agregar **indicador de guardado** visible justo debajo del textarea:
  ```
  [          textarea de biografía             ]
  127/500 caracteres                 ✅ Guardado automáticamente
  ```
- Usar auto-save con debounce (como ya hace `savePublicProfile`) pero MOSTRAR el estado claramente
- Eliminar el `bioInput` de la card "Identidad de Marca" para evitar duplicidad

---

### 15. Mejorar el flujo de "Tema de Sala"

**Propuesta:**
- Preview en vivo: mostrar un mini-mockup de cómo se verá la sala con los colores seleccionados
- Paletas predefinidas: "Clásico", "Moderno", "Cálido", "Minimal" como shortcuts
- Mover a una sección de Configuración, no en el resumen principal

---

## 📐 Propuesta de Estructura Final

```
SIDEBAR (simplificado)
├── Logo + Nombre + Plan badge
├── ⚡ IR A MI SALA (CTA principal)
├── Nav:
│   ├── 🏠 Resumen
│   ├── 📅 Mi Agenda
│   ├── 👥 Mis Estudiantes
│   ├── ✅ Validar (badge count)
│   ├── ⚙️ Configuración
│   └── 🌐 Mi Perfil Público
├── 📚 Manual
└── Cerrar Sesión

MAIN CONTENT (por sección)
├── /dashboard.html → RESUMEN
│   ├── KPIs (clases, alumnos, ganancias mes, rating)
│   ├── Checklist onboarding (si nuevo)
│   ├── Próximas clases hoy/mañana
│   ├── Alertas (renovación, clases por validar)
│   └── Mensajes admin
│
├── /profesor/calendario.html → AGENDA (ya existe)
├── /profesor/estudiantes.html → ESTUDIANTES (ya existe)  
├── /profesor/validar.html → VALIDACIONES (ya existe)
│
├── /profesor/configuracion.html → CONFIGURACIÓN (NUEVO)
│   ├── Tab: Identidad (logo, foto, colores)
│   ├── Tab: Tarifas y Paquetes
│   ├── Tab: Datos de Pago
│   └── Tab: Cuenta (nombre, email, password)
│
└── /profesor/perfil.html → PERFIL PÚBLICO (ya existe)
    ├── Bio, experiencia, formación
    ├── Especialidades, idiomas
    ├── Video
    └── Vista previa
```

---

## 🛠️ Plan de Implementación Sugerido

| Fase | Tarea | Complejidad | Impacto |
|------|-------|-------------|---------|
| **1** | Sticky save bar + feedback unificado (toasts) | Media | 🔴 Alto |
| **2** | Eliminar duplicidad de biografía (unificar campos) | Baja | 🔴 Alto |
| **3** | Limpiar contenido del resumen (mover secciones a sub-vistas existentes) | Media | 🟡 Medio |
| **4** | Simplificar sidebar (mover plan/ganancias al main) | Media | 🟡 Medio |
| **5** | Crear `/profesor/configuracion.html` con tabs | Alta | 🟡 Medio |
| **6** | Extraer inline styles a CSS con clases reutilizables | Alta | 🟢 Bajo |
| **7** | Onboarding checklist para profesores nuevos | Media | 🟡 Medio |
| **8** | Responsive: sidebar colapsable + hamburger | Media | 🟡 Medio |
| **9** | Accesibilidad (aria-labels, contrastes, focus) | Media | 🟢 Bajo |
| **10** | KPIs cards en resumen | Baja | 🟢 Bajo |

---

## 📎 Referencia

Patrones de referencia en dashboards SaaS exitosos:
- **Stripe Dashboard:** Sidebar mínimo + contenido por secciones claras
- **Calendly:** Wizard de configuración → dashboard con datos reales
- **Shopify Admin:** Sticky save bar + toasts + nav claro
- **Notion:** Auto-save silencioso con indicador sutil "Guardado ✓"
