# 🎹 MARKETPLACE_PENDING.md
## Hoja de Ruta: "Last Mile" del Sistema de Matching PianoLink

> **Versión:** 2.1  
> **Última Revisión:** 8 de Febrero, 2026  
> **Objetivo:** Completar el flujo Alumno → Profesor → Clase de Prueba para el Marketplace.

---

## 📈 RESUMEN EJECUTIVO

| Métrica | Valor |
|---------|-------|
| **Progreso Backend** | 100% ✅ |
| **Progreso Frontend (UI)** | 100% ✅ |
| **Emails transaccionales** | 100% ✅ |
| **Jobs automáticos** | 100% ✅ |
| **Horas restantes estimadas** | **0h** |
| **Bloqueadores críticos** | 0 |

**🎉 EL MARKETPLACE ESTÁ 100% LISTO PARA LANZAR.**

---

## 📊 Estado Actual del Sistema (Revisado)

### ✅ YA IMPLEMENTADO

| Componente | Archivo/Ruta | Estado |
|------------|--------------|--------|
| **Catálogo de Profesores** | `GET /api/teacher-profile/catalog` | ✅ Funcional |
| **Filtros de Búsqueda** | `profesores.html` | ✅ Funcional (especialidad, precio, idioma, día) |
| **Perfil Público** | `GET /api/teacher-profile/public/:slug` | ✅ Funcional |
| **Modelo de Disponibilidad** | `AvailabilityTemplate` + `TimeSlot` | ✅ Completo |
| **Sistema de Reservas** | `BookingService.bookSlot()` | ✅ Con transacciones atómicas |
| **Modelo Booking** | `models/Booking.js` | ✅ Completo (bookingType, amountCents, stripePaymentIntentId) |
| **Paquetes por Profesor** | `TeacherPackage` model | ✅ Multi-categoría |
| **Sesión MIDI** | `TimeSlot.generateMidiSession()` | ✅ Auto-generada |
| **Dashboard Profesor** | `dashboard.html` | ✅ Ganancias, validación clases |
| **Endpoint Trial Class** | `POST /api/bookings/trial-class` | ✅ L585 bookingRoutes.js |
| **Marcar Clase Completada** | `POST /api/bookings/:id/complete` | ✅ L331 |
| **Calificar Clase** | `POST /api/bookings/:id/rate` | ✅ L457 |
| **Mis Reservas (API)** | `GET /api/bookings/my` | ✅ L50 |
| **BookingCalendar UI** | `public/js/modules/BookingCalendar.js` | ✅ 411 líneas |
| **BookingModal UI** | `public/js/modules/BookingModal.js` | ✅ Funcional |
| **Webhook Stripe Trial** | `services/StripeService.js` L1012 | ✅ Integrado |

### ⚠️ PARCIALMENTE IMPLEMENTADO

| Componente | Estado | Faltante |
|------------|--------|----------|
| Disponibilidad por Profesor | ✅ `BookingCalendar.js` existe | Integrar en perfil público |
| Flujo de Reserva | ✅ `BookingModal.js` + endpoint `trial-class` | Integrar UI en perfil |
| Pagos Stripe | ✅ Webhook configurado en `StripeService.js` | Captura post-clase en /complete |
| Emails de confirmación | ⚠️ `classReminder.js` existe | Crear templates trial específicos |

### 🔴 PENDIENTE (LAST MILE)

| Componente | Prioridad | Tiempo Est. |
|------------|-----------|-------------|
| ~~Página `/mis-clases` estudiante (UI)~~ | ~~P0~~ | ✅ Hecho |
| ~~Integrar BookingCalendar en profesor-perfil.html~~ | ~~P0~~ | ✅ Ya integrado |
| ~~Integrar BookingModal en profesor-perfil.html~~ | ~~P0~~ | ✅ Ya integrado |
| Templates email trial-confirmed-*.hbs | P1 | 1h |
| Job booking-reminders.js automático | P1 | 1h |
| Captura Stripe en /:id/complete | P1 | 30min |

---

## 🗂️ ARQUITECTURA DE DATOS EXISTENTE

### Modelo `User` (Profesor) - Campos Relevantes

```javascript
// teacherData (embebido en User)
{
  hourlyRate: Number,           // Tarifa USD (mín $15)
  packages: [{                  // Paquetes inline (legacy)
    classes: Number,
    discountPercent: Number,
    isActive: Boolean
  }],
  profile: {
    isPublic: Boolean,          // Visible en catálogo
    specialties: [String],      // ['clásico', 'jazz', 'niños']
    languages: [String],        // ['español', 'inglés']
    videoUrl: String,           // Video de presentación
    acceptsTrialClass: Boolean  // Acepta clase de prueba
  },
  commissionPercent: Number     // % que gana el profesor (default 80%)
}

// branding (embebido en User)
{
  profilePhotoUrl: String,
  bio: String,
  country: String
}

// slug: String  // URL amigable: /profesor/juan-perez
```

### Modelo `TeacherPackage` (Paquetes Avanzados)

```javascript
{
  teacherId: ObjectId,
  category: 'piano' | 'teoria' | 'armonia' | 'solfeo' | 'composicion' | 'improvisacion' | 'otro',
  name: String,
  classCount: Number,
  classDurationMinutes: 30 | 45 | 60 | 90,
  priceUSD: Number,             // En centavos (ej: 4500 = $45.00)
  validityDays: Number,         // Vigencia del paquete
  isRecurring: Boolean,
  isActive: Boolean,
  isFeatured: Boolean
}
```

### Modelo `AvailabilityTemplate` (Disponibilidad Semanal)

```javascript
{
  teacherId: ObjectId,
  timezone: String,             // 'America/Santiago'
  bufferMinutes: Number,        // Colchón entre clases
  defaultDuration: Number,      // Duración default (45 min)
  weeklySlots: [{
    dayOfWeek: 0-6,             // 0=Dom, 1=Lun...
    startTime: '09:00',
    endTime: '18:00',
    maxStudents: Number,        // 1=individual, >1=grupal
    isActive: Boolean
  }],
  exceptions: [{                // Vacaciones, bloqueos
    date: Date,
    reason: String,
    isBlocked: Boolean
  }]
}
```

### Modelo `TimeSlot` (Slot Concreto Reservable)

```javascript
{
  teacherId: ObjectId,
  templateId: ObjectId,
  startTime: Date,              // UTC
  endTime: Date,
  duration: Number,
  status: 'available' | 'pending' | 'booked' | 'in_progress' | 'completed' | 'cancelled' | 'no_show',
  booking: {
    studentId: ObjectId,
    clientId: ObjectId,         // Apoderado si aplica
    studentName: String,
    bookedAt: Date,
    confirmedAt: Date
  },
  midiSession: {                // Generado automáticamente
    sessionId: String,
    roomUrl: String,
    accessToken: String
  }
}
```

### Modelo `Booking` (Registro Histórico)

```javascript
{
  slotId: ObjectId,
  teacherId: ObjectId,
  studentId: ObjectId,
  clientId: ObjectId,
  subscriptionId: ObjectId,     // Si usó suscripción
  studentName: String,
  
  // Snapshot de tiempo (se guarda copia)
  scheduledStart: Date,
  scheduledEnd: Date,
  duration: Number,
  teacherTimezone: String,
  studentTimezone: String,
  
  status: 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'no_show' | 'rescheduled',
  statusHistory: [{ status, changedAt, reason }],
  
  classConsumed: Boolean,       // ¿Se descontó del saldo?
  midiSessionId: String,
  
  // Feedback
  studentRating: 1-5,
  studentFeedback: String,
  teacherNotes: String
}
```

---

## 🎯 FASE 1: Flujo de Clase de Prueba (P0 - Blocker)

### 1.1 ¿Qué YA Existe?

**Backend listo:**
- `BookingService.bookSlot()` - Reserva atómica con transacciones MongoDB
- `TimeSlot` genera `midiSession` automáticamente al confirmar
- Sistema descuenta clases de `StudentSubscription` o `classesRemaining`

**API existente:**
```
GET  /api/teacher-profile/catalog           → Lista profesores con filtros
GET  /api/teacher-profile/public/:slug      → Perfil + disponibilidad
GET  /api/availability/teacher/:teacherId   → Slots disponibles (próximos 14 días)
POST /api/booking/reserve (uso interno)     → Reserva con saldo existente
```

### 1.2 ¿Qué FALTA para Trial Class?

El flujo actual asume que el alumno YA compró clases. Necesitamos un flujo donde:
1. Alumno **NO tiene saldo** previo
2. Paga **solo la clase de prueba** ($15-25 USD)
3. Se reserva el slot y se genera la sesión MIDI

**Endpoint a crear:** `POST /api/bookings/trial-class`

```javascript
// routes/bookings.js - Nuevo endpoint
router.post('/trial-class', protect, async (req, res) => {
  const { teacherId, slotId, timezone } = req.body;
  const studentId = req.user._id;
  
  // 1. Verificar que no tenga trial pendiente con este profesor
  const existingTrial = await Booking.findOne({
    teacherId,
    studentId,
    type: 'trial',
    status: { $in: ['pending', 'confirmed'] }
  });
  if (existingTrial) {
    return res.status(400).json({ error: 'Ya tienes una clase de prueba pendiente' });
  }
  
  // 2. Obtener profesor y su tarifa de trial
  const teacher = await User.findById(teacherId);
  const trialPriceCents = (teacher.teacherData?.trialPrice || 1500); // $15 default
  
  // 3. Crear PaymentIntent de Stripe (capture_method: manual)
  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  const paymentIntent = await stripe.paymentIntents.create({
    amount: trialPriceCents,
    currency: 'usd',
    capture_method: 'manual', // Hold, no capture inmediato
    metadata: { teacherId, studentId, slotId, type: 'trial_class' }
  });
  
  // 4. Bloquear slot temporalmente (5 min para completar pago)
  const slot = await TimeSlot.findOneAndUpdate(
    { _id: slotId, status: 'available' },
    { 
      $set: { 
        status: 'pending',
        'booking.studentId': studentId,
        'booking.heldUntil': new Date(Date.now() + 5 * 60 * 1000)
      }
    },
    { new: true }
  );
  
  if (!slot) {
    return res.status(409).json({ error: 'Slot no disponible' });
  }
  
  res.json({
    clientSecret: paymentIntent.client_secret,
    slotId,
    teacherName: teacher.name,
    scheduledAt: slot.startTime,
    priceCents: trialPriceCents
  });
});
```

### 1.3 Webhook de Stripe para Confirmar

```javascript
// routes/webhooks.js - Agregar handler
case 'payment_intent.succeeded':
  const pi = event.data.object;
  if (pi.metadata.type === 'trial_class') {
    await confirmTrialBooking(pi.metadata);
  }
  break;

async function confirmTrialBooking({ teacherId, studentId, slotId }) {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    // Confirmar slot
    const slot = await TimeSlot.findByIdAndUpdate(
      slotId,
      { 
        $set: { 
          status: 'booked',
          'booking.confirmedAt': new Date()
        }
      },
      { session, new: true }
    );
    
    // Generar sesión MIDI
    slot.generateMidiSession();
    await slot.save({ session });
    
    // Crear Booking
    await Booking.create([{
      slotId,
      teacherId,
      studentId,
      type: 'trial',
      scheduledStart: slot.startTime,
      scheduledEnd: slot.endTime,
      duration: slot.duration,
      status: 'confirmed',
      paidCents: slot.trialPriceCents
    }], { session });
    
    await session.commitTransaction();
    
    // Enviar emails (async)
    sendTrialConfirmationEmails(slot, teacherId, studentId);
  } catch (e) {
    await session.abortTransaction();
    throw e;
  }
}
```

### 1.4 Campos a Agregar en Modelos

**`models/User.js`** - En `teacherData`:
```javascript
trialPrice: { type: Number, default: 1500 }, // Precio trial en centavos USD ($15)
```

**`models/Booking.js`** - Nuevos campos:
```javascript
type: {
  type: String,
  enum: ['regular', 'trial', 'package'],
  default: 'regular'
},
paidCents: { type: Number, default: 0 },
stripePaymentIntentId: { type: String }
```

---

## 🎯 FASE 2: UI de Reserva en Perfil Público (P0)

### 2.1 Página de Perfil con Calendario

**Archivo existente:** `public/profesor/:slug` (carga via `/api/teacher-profile/public/:slug`)

**Lo que ya devuelve la API:**
```javascript
{
  name, slug, photo, bio, country,
  specialties, languages, videoUrl,
  pricePerClass,
  acceptsTrialClass,
  availability: {
    activeDays: [1, 3, 5],        // Lunes, Miércoles, Viernes
    weeklySlots: [...],
    timezone: 'America/Santiago'
  },
  packages: [...]
}
```

**Componente a crear:** `public/js/booking-calendar.js`

```javascript
// Calendario interactivo para seleccionar slot
class BookingCalendar {
  constructor(teacherId, containerId) {
    this.teacherId = teacherId;
    this.container = document.getElementById(containerId);
    this.selectedSlot = null;
  }
  
  async loadSlots(fromDate, toDate) {
    // Ya existe endpoint
    const res = await fetch(`/api/availability/teacher/${this.teacherId}?from=${fromDate}&to=${toDate}`);
    const slots = await res.json();
    this.renderWeek(slots);
  }
  
  renderWeek(slots) {
    // Mostrar slots disponibles en grid semanal
    // Al hacer clic → openBookingModal(slot)
  }
}
```

### 2.2 Modal de Confirmación

**Archivo a crear:** `public/js/booking-modal.js`

```html
<!-- Insertar en perfil-profesor.html -->
<div id="bookingModal" class="modal hidden">
  <div class="modal-content">
    <h2>Confirmar Clase de Prueba</h2>
    
    <div class="booking-summary">
      <img id="teacherPhoto" src="" alt="">
      <div>
        <h3 id="teacherName"></h3>
        <p id="slotDateTime"></p>
      </div>
    </div>
    
    <div class="price-section">
      <span>Clase de prueba (45 min)</span>
      <strong id="trialPrice">$15 USD</strong>
    </div>
    
    <!-- Stripe Elements -->
    <div id="card-element"></div>
    <div id="card-errors"></div>
    
    <button id="btnConfirmBooking" class="btn-primary">
      Reservar y Pagar
    </button>
    
    <p class="cancellation-policy">
      Cancelación gratuita hasta 24h antes de la clase.
    </p>
  </div>
</div>
```

```javascript
// public/js/booking-modal.js
async function openBookingModal(slot, teacher) {
  document.getElementById('teacherPhoto').src = teacher.photo;
  document.getElementById('teacherName').textContent = teacher.name;
  document.getElementById('slotDateTime').textContent = formatDateTime(slot.startTime);
  document.getElementById('trialPrice').textContent = `$${teacher.trialPrice / 100} USD`;
  
  document.getElementById('bookingModal').classList.remove('hidden');
  
  // Inicializar Stripe Elements
  initStripeCard();
}

async function confirmTrialBooking() {
  const btn = document.getElementById('btnConfirmBooking');
  btn.disabled = true;
  btn.textContent = 'Procesando...';
  
  try {
    // 1. Crear intent en backend
    const res = await fetch('/api/bookings/trial-class', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getToken()}`
      },
      body: JSON.stringify({
        teacherId: currentTeacher.id,
        slotId: selectedSlot._id,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
      })
    });
    
    const { clientSecret, error } = await res.json();
    if (error) throw new Error(error);
    
    // 2. Confirmar pago con Stripe
    const { error: stripeError } = await stripe.confirmCardPayment(clientSecret, {
      payment_method: { card: cardElement }
    });
    
    if (stripeError) throw new Error(stripeError.message);
    
    // 3. Mostrar éxito
    showBookingSuccess();
    
  } catch (e) {
    showError(e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Reservar y Pagar';
  }
}
```

### 2.3 Pantalla de Confirmación Post-Pago

```javascript
function showBookingSuccess() {
  document.getElementById('bookingModal').innerHTML = `
    <div class="success-screen">
      <div class="success-icon">✓</div>
      <h2>¡Clase Reservada!</h2>
      <p>Tu clase con <strong>${currentTeacher.name}</strong> está confirmada.</p>
      
      <div class="booking-details">
        <p>📅 ${formatDate(selectedSlot.startTime)}</p>
        <p>🕐 ${formatTime(selectedSlot.startTime)} (tu hora local)</p>
      </div>
      
      <div class="actions">
        <button onclick="addToCalendar()">📆 Añadir al Calendario</button>
        <a href="/mis-clases" class="btn-primary">Ver Mis Clases</a>
      </div>
      
      <p class="email-notice">
        Te enviamos un email con los detalles y el enlace para unirte.
      </p>
    </div>
  `;
}

function addToCalendar() {
  // Generar .ics o deep link a Google Calendar
  const event = {
    title: `Clase de Piano con ${currentTeacher.name}`,
    start: selectedSlot.startTime,
    end: selectedSlot.endTime,
    description: `Enlace: ${selectedSlot.roomUrl}\n\nTu primera clase de piano online.`
  };
  
  const icsContent = generateICS(event);
  downloadFile(icsContent, 'clase-piano.ics');
}
```

---

## 🎯 FASE 3: Página "Mis Clases" para Estudiantes (P0)

### 3.1 Endpoint Existente + Nuevo

**Ya existe:** La lógica en `BookingService` para consultar bookings.

**Crear endpoint:** `GET /api/bookings/my-classes`

```javascript
// routes/bookings.js
router.get('/my-classes', protect, async (req, res) => {
  const bookings = await Booking.find({
    $or: [
      { studentId: req.user._id },
      { clientId: req.user._id }
    ]
  })
  .populate('teacherId', 'name branding.profilePhotoUrl slug')
  .populate('slotId', 'startTime endTime midiSession.roomUrl')
  .sort({ scheduledStart: -1 });
  
  // Agrupar por estado
  const upcoming = bookings.filter(b => 
    ['pending', 'confirmed'].includes(b.status) && 
    new Date(b.scheduledStart) > new Date()
  );
  const past = bookings.filter(b => 
    ['completed', 'no_show'].includes(b.status) ||
    new Date(b.scheduledStart) < new Date()
  );
  
  res.json({ upcoming, past });
});
```

### 3.2 Vista HTML

**Archivo a crear:** `public/mis-clases.html`

```html
<div class="classes-container">
  <!-- Próximas Clases -->
  <section class="upcoming-classes">
    <h2>Próximas Clases</h2>
    <div id="upcomingList">
      <!-- Cards de clases confirmadas -->
    </div>
  </section>
  
  <!-- Historial -->
  <section class="past-classes">
    <h2>Historial</h2>
    <div id="pastList"></div>
  </section>
</div>
```

```javascript
// Template de una clase
function renderClassCard(booking) {
  const isUpcoming = new Date(booking.scheduledStart) > new Date();
  const canJoin = booking.status === 'confirmed' && 
                  new Date(booking.scheduledStart) - Date.now() < 15 * 60 * 1000; // 15 min antes
  
  return `
    <div class="class-card ${booking.status}">
      <img src="${booking.teacherId.branding?.profilePhotoUrl || '/img/default-avatar.png'}" 
           class="teacher-photo">
      <div class="class-info">
        <h3>${booking.teacherId.name}</h3>
        <p class="datetime">
          ${formatDate(booking.scheduledStart)} · ${formatTime(booking.scheduledStart)}
        </p>
        <span class="status-badge">${getStatusLabel(booking.status)}</span>
      </div>
      <div class="class-actions">
        ${canJoin ? `<a href="${booking.slotId.midiSession?.roomUrl}" 
                         class="btn-join" target="_blank">
                       Entrar a Clase
                     </a>` : ''}
        ${isUpcoming && booking.status === 'confirmed' ? 
          `<button onclick="cancelBooking('${booking._id}')" class="btn-cancel">
             Cancelar
           </button>` : ''}
        ${booking.status === 'completed' && !booking.studentRating ? 
          `<button onclick="openRatingModal('${booking._id}')" class="btn-rate">
             ⭐ Calificar
           </button>` : ''}
      </div>
    </div>
  `;
}
```

### 3.1 Emails Transaccionales

**Plantillas requeridas en `/templates/emails/`:**

| Plantilla | Trigger | Destinatario |
|-----------|---------|--------------|
| `trial-confirmed-student.hbs` | Pago exitoso | Alumno |
| `trial-confirmed-teacher.hbs` | Nueva reserva | Profesor |
| `booking-reminder.hbs` | 24h y 1h antes | Ambos |
| `booking-cancelled.hbs` | Cancelación | Parte afectada |
| `trial-followup.hbs` | 24h después de clase | Alumno |

**Template de confirmación estudiante:**
```handlebars
{{!-- templates/emails/trial-confirmed-student.hbs --}}
<h1>🎹 ¡Tu Clase Está Confirmada!</h1>

<p>Hola {{studentName}},</p>

<p>Tu clase de prueba con <strong>{{teacherName}}</strong> está confirmada.</p>

<div class="booking-details">
  <p>📅 <strong>Fecha:</strong> {{dateFormatted}}</p>
  <p>🕐 <strong>Hora:</strong> {{timeFormatted}} ({{timezone}})</p>
  <p>⏱️ <strong>Duración:</strong> {{duration}} minutos</p>
</div>

<a href="{{joinUrl}}" class="btn-primary">
  Entrar a la Clase
</a>

<p class="note">
  El enlace estará activo 15 minutos antes de la hora programada.
</p>

<hr>
<p class="small">Si necesitas cancelar, hazlo con al menos 24 horas de anticipación.</p>
```

### 3.2 Job de Recordatorios

**Archivo:** `jobs/booking-reminders.js`

```javascript
// jobs/booking-reminders.js
const cron = require('node-cron');
const Booking = require('../models/Booking');
const EmailService = require('../services/EmailService');

// Cada 15 minutos
cron.schedule('*/15 * * * *', async () => {
  console.log('[Reminders] Ejecutando job de recordatorios...');

  // Recordatorio 24h
  const in24h = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const bookings24h = await Booking.find({
    status: 'confirmed',
    scheduledStart: {
      $gte: new Date(in24h.getTime() - 15 * 60 * 1000),
      $lte: new Date(in24h.getTime() + 15 * 60 * 1000)
    },
    'reminders.sent24h': { $ne: true }
  }).populate('teacherId studentId');
  
  for (const b of bookings24h) {
    await EmailService.sendBookingReminder(b, '24h');
    b.reminders = { ...b.reminders, sent24h: true };
    await b.save();
  }
  
  // Recordatorio 1h
  const in1h = new Date(Date.now() + 60 * 60 * 1000);
  const bookings1h = await Booking.find({
    status: 'confirmed',
    scheduledStart: {
      $gte: new Date(in1h.getTime() - 15 * 60 * 1000),
      $lte: new Date(in1h.getTime() + 15 * 60 * 1000)
    },
    'reminders.sent1h': { $ne: true }
  }).populate('teacherId studentId');
  
  for (const b of bookings1h) {
    await EmailService.sendBookingReminder(b, '1h');
    b.reminders = { ...b.reminders, sent1h: true };
    await b.save();
  }
  
  console.log(`[Reminders] Enviados: ${bookings24h.length} (24h), ${bookings1h.length} (1h)`);
});
```

---

## 🎯 FASE 4: Lo Que YA Existe en Dashboard Profesor

### 4.1 Funcionalidades Existentes ✅

| Feature | Estado | Ubicación |
|---------|--------|-----------|
| Gestión de tarifas | ✅ | `dashboard.html` + `/api/teacher-profile/my-rates` |
| Paquetes de clases | ✅ | `TeacherPackage` model + CRUD completo |
| Validación de clases | ✅ | Marcar como completada/no-show |
| Perfil público | ✅ | Editar bio, especialidades, video |
| Info de pago | ✅ | MercadoPago, transferencia, PayPal |
| Ganancias | ✅ | Dashboard con pending/paid |

### 4.2 Funcionalidades Pendientes ⚠️

| Feature | Prioridad | Notas |
|---------|-----------|-------|
| Calendario visual interactivo | P1 | Actualmente es lista de slots |
| Drag-and-drop de horarios | P2 | Nice to have |
| Estadísticas de conversión | P2 | % de trials que repiten |

### 4.3 API de Disponibilidad YA Existente

```
GET  /api/availability/templates                    ✅ Obtener plantillas
POST /api/availability/templates                    ✅ Crear plantilla
PUT  /api/availability/templates/:id                ✅ Actualizar
DELETE /api/availability/templates/:id              ✅ Eliminar
POST /api/availability/block-date                   ✅ Bloquear fecha
GET  /api/availability/teacher/:teacherId           ✅ Slots públicos
GET  /api/availability/teachers                     ✅ Lista con disponibilidad
```

---

## 🎯 FASE 5: Pagos y Comisiones

### 5.1 Sistema Existente ✅

El profesor ya tiene configurado en `User.teacherData`:
- `commissionPercent`: default 80% (profesor gana 80%)
- `earnings.pending`: Ganancias pendientes
- `earnings.paid`: Ganancias pagadas

### 5.2 Flujo de Trial Class con Stripe

```
[Alumno paga $15 USD]
    ↓
[Stripe: PaymentIntent (capture_method: 'manual')]
    ↓
[Booking creado en status: 'confirmed']
    ↓
[Clase completada - profesor marca como done]
    ↓
[Capturar pago: stripe.paymentIntents.capture(pi_id)]
    ↓
[Calcular comisión: $15 * 0.20 = $3 PianoLink]
    ↓
[Acreditar a profesor: $15 * 0.80 = $12]
    ↓
[Actualizar earnings.pending]
```

### 5.3 Endpoint de Captura Post-Clase

```javascript
// routes/bookings.js - Cuando profesor marca clase como completada
router.post('/:bookingId/complete', protect, async (req, res) => {
  const booking = await Booking.findById(req.params.bookingId);
  
  if (booking.teacherId.toString() !== req.user._id.toString()) {
    return res.status(403).json({ error: 'No autorizado' });
  }
  
  // Capturar pago si es trial
  if (booking.type === 'trial' && booking.stripePaymentIntentId) {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    await stripe.paymentIntents.capture(booking.stripePaymentIntentId);
  }
  
  // Calcular comisión
  const teacher = await User.findById(booking.teacherId);
  const commissionRate = (teacher.teacherData?.commissionPercent || 80) / 100;
  const teacherEarning = Math.round(booking.paidCents * commissionRate);
  
  // Acreditar al profesor
  await User.findByIdAndUpdate(booking.teacherId, {
    $inc: { 'teacherData.earnings.pending': teacherEarning / 100 }
  });
  
  booking.status = 'completed';
  booking.completedAt = new Date();
  await booking.save();
  
  res.json({ success: true, teacherEarning });
});
```

---

## 🎯 FASE 6: Reviews (P2 - Post-Launch)

### 6.1 Campo Existente en Booking ✅

El modelo `Booking` YA tiene:
```javascript
studentRating: { type: Number, min: 1, max: 5 },
studentFeedback: String
```

### 6.2 Endpoint Simple de Rating

```javascript
// routes/bookings.js
router.post('/:bookingId/rate', protect, async (req, res) => {
  const { rating, feedback } = req.body;
  const booking = await Booking.findById(req.params.bookingId);
  
  if (booking.studentId.toString() !== req.user._id.toString()) {
    return res.status(403).json({ error: 'No autorizado' });
  }
  
  if (booking.status !== 'completed') {
    return res.status(400).json({ error: 'Solo puedes calificar clases completadas' });
  }
  
  booking.studentRating = rating;
  booking.studentFeedback = feedback;
  await booking.save();
  
  // Recalcular promedio del profesor
  const stats = await Booking.aggregate([
    { $match: { teacherId: booking.teacherId, studentRating: { $exists: true } } },
    { $group: { _id: '$teacherId', avg: { $avg: '$studentRating' }, count: { $sum: 1 } } }
  ]);
  
  if (stats.length > 0) {
    await User.findByIdAndUpdate(booking.teacherId, {
      'teacherData.profile.averageRating': Math.round(stats[0].avg * 10) / 10,
      'teacherData.profile.totalReviews': stats[0].count
    });
  }
  
  res.json({ success: true });
});
```

---

## 🔧 TAREAS TÉCNICAS INMEDIATAS

### 🚨 Prioridad CRÍTICA (Bloquea lanzamiento del Marketplace)

| # | Tarea | Archivo | Est. | Estado |
|---|-------|---------|------|--------|
| 1 | Endpoint `POST /api/bookings/trial-class` | `routes/bookingRoutes.js` | - | ✅ Hecho (L585) |
| 2 | Webhook Stripe para confirmar trial | `services/StripeService.js` | - | ✅ Hecho (L1012) |
| 3 | Modal de booking en perfil profesor | `public/js/modules/BookingModal.js` | - | ✅ Hecho |
| 4 | Calendario de slots en perfil | `public/js/modules/BookingCalendar.js` | - | ✅ Hecho |
| 5 | Agregar campo `bookingType` y payment info | `models/Booking.js` | - | ✅ Hecho (L68-78) |

**P0 Backend/Lógica:** ✅ 100% completo

### ⚠️ Prioridad ALTA (Integración UI)

| # | Tarea | Archivo | Est. | Estado |
|---|-------|---------|------|--------|
| 6 | Página `/mis-clases` estudiante | `public/mis-clases.html` | 2h | ✅ Hecho |
| 7 | Integrar BookingCalendar en perfil | `public/profesor-perfil.html` | 1h | ✅ Hecho |
| 8 | Integrar BookingModal en perfil | `public/profesor-perfil.html` | 1h | ✅ Hecho |
| 9 | ~~Captura Stripe en complete~~ | - | - | ⏭️ N/A (trial gratis, paquetes con MercadoPago) |

**Frontend UI:** ✅ 100% completo

### 📧 Prioridad MEDIA (Emails & Jobs)

| # | Tarea | Archivo | Est. | Estado |
|---|-------|---------|------|--------|
| 10 | Email confirmación trial | `templates/emails/trialConfirmed*.js` | 1h | ✅ Hecho |
| 11 | Job de recordatorios 24h/1h | `jobs/booking-reminders.js` | 1h | ✅ Hecho |
| 12 | ~~Descomentar envío emails trial~~ | `routes/bookingRoutes.js` | - | ✅ Integrado |

**Emails & Jobs:** ✅ 100% completo

### 📋 Prioridad BAJA (Post-lanzamiento)

| # | Tarea | Archivo | Est. | Estado |
|---|-------|---------|------|--------|
| 13 | Endpoint de rating | `routes/bookingRoutes.js` L457 | - | ✅ Hecho |
| 14 | Botón "Añadir al calendario" (.ics) | `public/js/calendar-export.js` | 30min | 🟡 |
| 15 | Email de follow-up post-clase | `templates/emails/trial-followup.hbs` | 30min | 🟡 |
| 16 | Cancelación con reembolso | `routes/bookingRoutes.js` | 2h | 🟡 |

**TOTAL ESTIMADO MVP:** ~6-7 horas de desarrollo (reducido de 15-18h)

---

## 🧪 CHECKLIST DE TESTING

### Flujo Completo E2E

- [ ] Alumno busca profesores en `/profesores` → filtros funcionan
- [ ] Alumno hace clic en profesor → ve perfil con disponibilidad
- [ ] Alumno selecciona slot → modal muestra precio y detalle
- [ ] Alumno ingresa tarjeta → Stripe procesa (modo test)
- [ ] Slot cambia a `booked`, se genera `midiSession`
- [ ] Alumno recibe email de confirmación
- [ ] Profesor recibe email de nueva reserva
- [ ] 24h antes → ambos reciben recordatorio
- [ ] Alumno entra a `/mis-clases` → ve clase confirmada
- [ ] 15 min antes → botón "Entrar a Clase" visible
- [ ] Profesor marca clase como completada
- [ ] Pago se captura, ganancias acreditadas
- [ ] Alumno puede calificar con estrellas

### Edge Cases Críticos

- [ ] Dos alumnos reservan mismo slot simultáneamente → uno falla con 409
- [ ] Pago falla en Stripe → slot vuelve a `available` en 5 min
- [ ] Alumno cancela < 24h → aplicar política (sin reembolso / con reembolso parcial)
- [ ] Profesor cancela → alumno recibe reembolso completo
- [ ] Timezone: alumno en NZ, profesor en Chile → horas correctas para ambos

---

## 📁 ARCHIVOS - ESTADO REAL

```
pianolink/
├── models/
│   ├── Booking.js           # ✅ YA TIENE: bookingType, amountCents, stripePaymentIntentId
│   └── User.js              # ✅ YA TIENE: teacherData.trialPrice
│
├── routes/
│   └── bookingRoutes.js     # ✅ YA TIENE: trial-class (L585), /my, /complete, /rate
│
├── services/
│   ├── StripeService.js     # ✅ Webhook trial-class (L1012)
│   └── BookingService.js    # ✅ Completo
│
├── public/js/modules/
│   ├── BookingCalendar.js   # ✅ Existe (411 líneas)
│   └── BookingModal.js      # ✅ Existe
│
├── templates/emails/
│   └── classReminder.js     # ✅ Existe
│
│ === TODO COMPLETADO ===
│
├── jobs/
│   └── booking-reminders.js           # ✅ Creado (320 líneas)
│
│
├── templates/emails/
│   ├── trialConfirmedStudent.js       # ✅ Creado
│   ├── trialConfirmedTeacher.js       # ✅ Creado
│   └── trialFollowup.js               # ✅ Creado
│
├── public/
│   └── mis-clases.html                # ✅ Creado (686 líneas)
│
└── public/profesor-perfil.html        # ✅ BookingCalendar y BookingModal integrados
```

---

## 🚀 DEFINICIÓN DE "DONE" PARA MVP MARKETPLACE

El Marketplace está **100% funcional** cuando:

| # | Criterio | Estado |
|---|----------|--------|
| 1 | Alumno puede buscar profesores con filtros | ✅ Hecho |
| 2 | Alumno puede ver perfil detallado + disponibilidad | ✅ Hecho (BookingCalendar integrado) |
| 3 | Alumno puede reservar clase de prueba GRATIS | ✅ Hecho (BookingModal integrado) |
| 4 | Ambos reciben confirmación por email | ✅ Hecho (templates + integración) |
| 5 | Alumno ve sus clases en `/mis-clases` | ✅ Hecho (686 líneas) |
| 6 | Alumno puede entrar a sala MIDI desde su dashboard | ✅ Hecho |
| 7 | Profesor puede marcar clase como completada | ✅ Hecho |
| 8 | Paquetes se pagan con MercadoPago | ✅ Flujo separado existente |

**🎉 MVP MARKETPLACE COMPLETO - Listo para lanzar.**

---

## 📞 REFERENCIAS INTERNAS

| Tema | Documento |
|------|-----------|
| Arquitectura de Booking | `CALENDAR_BOOKING_ARCHITECTURE.md` |
| Testing de Stripe | `GUIA_PRUEBAS_STRIPE.md` |
| Sistema de Emails | `README_EMAIL_SYSTEM.md` |
| Layout de Subscripciones | `SUBSCRIPTION_ARCHITECTURE.md` |

---

*Actualizado: 8 de Febrero, 2026 - Versión 2.0 con arquitectura real del proyecto*
