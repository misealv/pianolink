# Arquitectura: Sistema de Suscripciones Estudiante-Profesor

## Resumen Ejecutivo

Sistema de pagos donde estudiantes compran paquetes de clases de profesores específicos.
El dinero se mantiene en escrow y se libera mensualmente por clase validada.

## Modelo de Negocio

```
Comisión PianoLink: 20%
Pago al Profesor: 80% (por clase validada)
Escrow: Dinero retenido hasta validación + ventana de disputa
```

## Flujo de Usuario

```
1. TRIAL → Estudiante compra WelcomeKit (clase prueba con cualquier profesor)
2. MATCH → Le gusta un profesor, ve sus paquetes en su perfil
3. COMPRA → Compra paquete (ej: 12 clases de Piano, $120, 3 meses)
4. COBRO → MercadoPago cobra total, dinero va a escrow PianoLink
5. AGENDA → Estudiante agenda clases con el profesor
6. CLASE → Profesor marca "completada", estudiante confirma (48h auto-confirm)
7. DISPUTA → Ventana de 48h para disputas
8. PAYOUT → Mensualmente, admin aprueba y paga 80% de clases validadas
9. RENOVACIÓN → AutoRenew cobra mismo paquete al expirar
```

## Políticas de No-Show

| Escenario | Clases | Pago Profesor |
|-----------|--------|---------------|
| Estudiante no-show | -1 clase | ✅ Cobra |
| Profesor no-show | +1 clase + 1 compensación | ❌ No cobra |
| Profesor enfermo (24h aviso) | Reagendar | Sin impacto |
| Profesor abandona | Transferir a otro profesor | Escrow transferido |

## Modelos de Datos

### TeacherPackage
Paquetes que el profesor configura en su panel.
```javascript
{
  teacherId, category, name, description,
  classCount, classDurationMinutes,
  priceUSD, validityDays, billingCycleDays,
  isActive, isFeatured
}
```

### StudentSubscription
Relación activa estudiante-profesor con estado de clases y escrow.
```javascript
{
  studentId, teacherId, packageId, category,
  classesTotal, classesRemaining, classesCompleted,
  totalPaidUSD, escrowBalanceUSD, releasedToTeacherUSD,
  autoRenew, nextBillingDate, status
}
```

### ClassSession
Registro de cada clase para validación y pago.
```javascript
{
  subscriptionId, bookingId, studentId, teacherId,
  status: 'pending-validation' | 'completed' | 'disputed',
  teacherMarkedComplete, studentConfirmed,
  pricePerClassUSD, teacherPayoutUSD, platformFeeUSD,
  dispute: { isDisputed, reason, resolution }
}
```

### TeacherPayout
Batch de pago mensual a un profesor.
```javascript
{
  teacherId, periodStart, periodEnd,
  classesCompleted, classesStudentNoShow,
  grossAmountUSD, platformFeeUSD, netPayoutUSD,
  status: 'pending-review' | 'approved' | 'paid',
  sessions: [ClassSession IDs]
}
```

## API Endpoints

### Paquetes del Profesor
```
GET  /api/teacher-packages/my           → Mis paquetes
GET  /api/teacher-packages/teacher/:id  → Paquetes de un profesor (público)
POST /api/teacher-packages              → Crear paquete
PUT  /api/teacher-packages/:id          → Actualizar paquete
```

### Suscripciones del Estudiante
```
GET  /api/subscriptions/my              → Mis suscripciones
GET  /api/subscriptions/teacher/:id     → Suscripción con un profesor
POST /api/subscriptions/purchase        → Comprar paquete
POST /api/subscriptions/:id/pause       → Pausar
POST /api/subscriptions/:id/resume      → Reanudar
POST /api/subscriptions/:id/cancel      → Cancelar
```

### Sesiones de Clase
```
GET  /api/class-sessions/pending        → Clases pendientes validación
POST /api/class-sessions/:id/teacher-complete → Profesor completa
POST /api/class-sessions/:id/student-confirm  → Estudiante confirma
POST /api/class-sessions/:id/student-noshow   → Estudiante no apareció
POST /api/class-sessions/:id/teacher-noshow   → Profesor no apareció
POST /api/class-sessions/:id/dispute          → Abrir disputa
```

### Admin (Payouts)
```
GET  /api/class-sessions/disputes       → Disputas pendientes
POST /api/class-sessions/:id/resolve-dispute → Resolver disputa
```

## Cron Jobs

| Job | Frecuencia | Función |
|-----|------------|---------|
| `autoConfirmExpiredSessions` | Cada hora | Auto-confirma clases después de 48h |
| `generateMonthlyPayouts` | Día 1 del mes | Genera batches de pago |
| `processAutoRenewals` | Diario | Procesa cobros recurrentes |
| `escalateUnresolvedDisputes` | Semanal | Alerta disputas antiguas |

## Categorías de Clases

```javascript
const CATEGORIES = {
  'piano': 'Clases de Piano',
  'teoria': 'Teoría Musical',
  'armonia': 'Armonía',
  'solfeo': 'Solfeo y Lectura',
  'composicion': 'Composición',
  'improvisacion': 'Improvisación',
  'otro': 'Otro'
};
```

## Integración MercadoPago

Para Chile, usamos:
1. **Tokenización** - Guardar tarjeta para cobros recurrentes
2. **Cobro manual** - Disparar cobro en fechas de renovación
3. **Validación previa** - Solo pagar por clases confirmadas

## Archivos Creados

```
models/
  TeacherPackage.js         → Paquetes del profesor
  StudentSubscription.js    → Suscripciones activas
  ClassSession.js           → Sesiones para validación
  TeacherPayout.js          → Pagos mensuales

routes/
  teacherPackageRoutes.js   → CRUD paquetes
  subscriptionRoutes.js     → Gestión suscripciones
  classSessionRoutes.js     → Validación clases

services/
  PayoutCronService.js      → Jobs automáticos
```

## Flujo de Pagos a Profesores

### Proceso Mensual Completo

```
┌─────────────────────────────────────────────────────────────────┐
│  DÍA 1 DEL MES (00:00 UTC)                                      │
│  ─────────────────────────────                                  │
│  🤖 Cron: generateMonthlyPayouts                                │
│     → Agrupa clases validadas del mes anterior                  │
│     → Calcula: 80% profesor, 20% plataforma                     │
│     → Crea TeacherPayout con status: 'pending'                  │
│     → Email al profesor: "Tu pago está listo para procesar"     │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  PROFESOR SUBE DOCUMENTO TRIBUTARIO                            │
│  ───────────────────────────────────                            │
│  Dashboard profesor → Selecciona método de retiro               │
│     • Transferencia bancaria (0% fee)                           │
│     • MercadoPago (0% fee)                                      │
│     • PayPal (3% fee)                                           │
│     • Wise (1% fee)                                             │
│     • Crypto (1.5% fee)                                         │
│                                                                 │
│  Sube boleta/factura → POST /api/payouts/:id/upload-invoice     │
│  Status cambia a: 'invoice_pending'                             │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  ADMIN VERIFICA DOCUMENTO                                       │
│  ────────────────────────                                       │
│  Panel Admin → /admin/payouts                                   │
│                                                                 │
│  Si documento OK:                                               │
│     → POST /api/admin/payouts/:id/verify-invoice                │
│     → Status: 'invoice_verified'                                │
│     → Email al profesor: "Documento aprobado"                   │
│                                                                 │
│  Si documento tiene errores:                                    │
│     → POST /api/admin/payouts/:id/reject-invoice                │
│     → Status: 'invoice_rejected'                                │
│     → Email al profesor con razón del rechazo                   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  ADMIN EJECUTA PAGO                                             │
│  ──────────────────                                             │
│  Panel Admin → Ve método preferido del profesor                 │
│                                                                 │
│  Proceso manual:                                                │
│     1. Transfiere desde banco/PayPal/Wise del negocio           │
│     2. Copia número de referencia                               │
│     3. Click "Marcar como Pagado" → ingresa referencia          │
│     → POST /api/admin/payouts/:id/mark-paid                     │
│     → Status: 'paid'                                            │
│     → Email al profesor: "Pago enviado - Ref: XXXXX"            │
└─────────────────────────────────────────────────────────────────┘
```

### Comisiones por Método de Retiro

| Método | Fee | Monto Neto (ejemplo $100) |
|--------|-----|---------------------------|
| 🏦 Transferencia Bancaria | 0% | $100.00 |
| 💳 MercadoPago | 0% | $100.00 |
| 💰 PayPal | 3% | $97.00 |
| 🌐 Wise | 1% | $99.00 |
| ₿ Crypto | 1.5% | $98.50 |

### Archivos del Sistema de Pagos

```
services/
  PayoutCronService.js          → Cron jobs (auto-confirm, monthly generation)
  PayoutNotificationService.js  → Emails para cada etapa del pago
  MercadoPagoTransferService.js → (Reservado para futuras transferencias auto)

routes/
  classSessionRoutes.js         → Endpoints del profesor (withdrawal options)
  adminPayouts.js               → Panel admin (verify, reject, mark-paid)

jobs/
  generateMonthlyPayouts.js     → Script standalone para testing
```

### Notas Importantes

1. **MercadoPago Chile** no soporta transferencias P2P automáticas
2. Los pagos se hacen **manualmente** desde el banco del negocio
3. El sistema registra todas las referencias para auditoría
4. Los profesores reciben **email en cada paso** del proceso

---

## Estado de Implementación

### ✅ Completado
- [x] Modelo TeacherPayout con withdrawal methods
- [x] UI profesor para seleccionar método de retiro
- [x] UI profesor para subir documentos tributarios
- [x] Panel admin con verificación de documentos
- [x] Sistema de notificaciones por email (5 tipos)
- [x] Cron job mensual para generar payouts
- [x] Configuración MercadoPago verificada

### 📋 Pendiente
- [ ] UI en `profe.html` para gestionar paquetes de clases
- [ ] UI en `cliente.html` para ver/comprar paquetes
- [ ] Checkout de paquetes con MercadoPago
- [ ] Cobro recurrente con tokenización MP
- [ ] Transferencia de suscripción a otro profesor
- [ ] Integración Wise API (cuando escale a +30 profesores)
