# 🎹 PianoLink - Plan de QA Exhaustivo

> **Versión:** 1.0  
> **Fecha:** Febrero 2026  
> **Ejecutor:** Agente Playwright Automatizado  
> **Arquitecto QA:** Sistema

---

## 📋 Índice

1. [Mapa de Rutas](#1-mapa-de-rutas)
2. [Matriz de Permisos](#2-matriz-de-permisos)
3. [Happy Paths](#3-happy-paths)
4. [Edge Cases](#4-edge-cases)
5. [Test Data](#5-test-data)
6. [Priorización](#6-priorización)

---

## 1. Mapa de Rutas

### 1.1 Rutas Públicas (Sin Autenticación)

| Ruta | Descripción | Prioridad |
|------|-------------|-----------|
| `/` | Landing page principal | 🔴 Crítica |
| `/comenzar` | Landing Kit de Bienvenida | 🔴 Crítica |
| `/kit-bienvenida-v2.html` | Checkout Kit $44 USD | 🔴 Crítica |
| `/login.html` | Formulario de login | 🔴 Crítica |
| `/register.html` | Formulario de registro | 🔴 Crítica |
| `/profesores` | Catálogo público de profesores | 🟡 Alta |
| `/profesor/:id` | Perfil público de profesor | 🟡 Alta |
| `/welcome-kit/success` | Confirmación pago kit | 🟡 Alta |
| `/reset-password.html` | Recuperar contraseña | 🟢 Media |
| `/terminos` | Términos y condiciones | 🟢 Media |
| `/privacidad` | Política de privacidad | 🟢 Media |

### 1.2 Rutas de Estudiante (Rol: student)

| Ruta | Descripción | Prioridad |
|------|-------------|-----------|
| `/cliente.html` | Dashboard estudiante | 🔴 Crítica |
| `/buscar-profesor.html` | Buscar/filtrar profesores | 🔴 Crítica |
| `/reservar/:profesorId` | Reservar clase con profesor | 🔴 Crítica |
| `/mis-clases.html` | Historial de clases | 🟡 Alta |
| `/mi-perfil.html` | Editar perfil estudiante | 🟡 Alta |
| `/paquetes/:profesorId` | Ver paquetes de un profesor | 🔴 Crítica |
| `/checkout/:paqueteId` | Pagar paquete de clases | 🔴 Crítica |

### 1.3 Rutas de Profesor (Rol: teacher)

| Ruta | Descripción | Prioridad |
|------|-------------|-----------|
| `/dashboard.html` | Dashboard profesor | 🔴 Crítica |
| `/teacher-availability.html` | Gestionar disponibilidad | 🔴 Crítica |
| `/room/:codigo` | Sala virtual de clases | 🔴 Crítica |
| `/mis-paquetes.html` | Gestionar paquetes/precios | 🟡 Alta |
| `/mis-alumnos.html` | Lista de alumnos | 🟡 Alta |
| `/ganancias.html` | Ver ganancias y payouts | 🔴 Crítica |
| `/configuracion-pago.html` | Datos bancarios/MP | 🟡 Alta |

### 1.4 Rutas de Administrador (Rol: admin)

| Ruta | Descripción | Prioridad |
|------|-------------|-----------|
| `/admin.html` | Panel de administración | 🔴 Crítica |
| `/admin.html#usuarios` | Gestión de usuarios | 🔴 Crítica |
| `/admin.html#welcome-kit` | Gestión Kits/Onboarding | 🔴 Crítica |
| `/admin.html#payouts` | Gestión de pagos a profesores | 🔴 Crítica |
| `/admin.html#configuracion` | Configuración global | 🟡 Alta |

### 1.5 Rutas de API

| Endpoint | Método | Descripción | Auth |
|----------|--------|-------------|------|
| `/api/auth/login` | POST | Login | No |
| `/api/auth/register` | POST | Registro | No |
| `/api/welcome-kit/v2/price` | GET | Precio kit | No |
| `/api/payment/mercadopago/teacher-subscription` | POST | Membresía profesor | Sí |
| `/api/payment/create-kit-payment-mercadopago` | POST | Pago kit | No |
| `/api/bookings` | GET/POST | Reservas | Sí |
| `/api/teachers/:id/availability` | GET | Disponibilidad | No |
| `/api/class-sessions` | GET/POST | Sesiones de clase | Sí |
| `/api/webhooks/mercadopago` | POST | Webhook MP | No |
| `/api/webhooks/mercadopago-teacher-subscription` | POST | Webhook membresía | No |

---

## 2. Matriz de Permisos

### 2.1 Permisos por Rol

| Recurso/Acción | 👤 Visitante | 🎓 Estudiante | 🎹 Profesor | 👑 Admin |
|----------------|:------------:|:-------------:|:-----------:|:--------:|
| Ver landing | ✅ | ✅ | ✅ | ✅ |
| Ver catálogo profesores | ✅ | ✅ | ✅ | ✅ |
| Registrarse | ✅ | ❌ | ❌ | ❌ |
| Comprar Kit Bienvenida | ✅ | ✅ | ❌ | ❌ |
| **ESTUDIANTE** |
| Ver dashboard estudiante | ❌ | ✅ | ❌ | ✅ |
| Reservar clases | ❌ | ✅ | ❌ | ❌ |
| Comprar paquetes | ❌ | ✅ | ❌ | ❌ |
| Ver mis clases | ❌ | ✅ | ❌ | ❌ |
| Confirmar clase tomada | ❌ | ✅ | ❌ | ❌ |
| **PROFESOR** |
| Ver dashboard profesor | ❌ | ❌ | ✅ | ✅ |
| Acceder sala virtual | ❌ | ❌ | ✅* | ❌ |
| Gestionar disponibilidad | ❌ | ❌ | ✅ | ❌ |
| Crear paquetes de clases | ❌ | ❌ | ✅ | ❌ |
| Ver ganancias | ❌ | ❌ | ✅ | ✅ |
| Activar membresía | ❌ | ❌ | ✅ | ❌ |
| **ADMIN** |
| Panel administración | ❌ | ❌ | ❌ | ✅ |
| Ver todos los usuarios | ❌ | ❌ | ❌ | ✅ |
| Gestionar Kits | ❌ | ❌ | ❌ | ✅ |
| Aprobar payouts | ❌ | ❌ | ❌ | ✅ |
| Cambiar configuración | ❌ | ❌ | ❌ | ✅ |

> *Solo si membresía está activa

### 2.2 Restricciones Especiales

| Condición | Comportamiento |
|-----------|----------------|
| Profesor sin membresía activa | ❌ No puede acceder a sala virtual |
| Profesor en trial | ❌ Sala bloqueada hasta activar |
| Profesor membresía expirada | ❌ Sala bloqueada + banner renovación |
| Estudiante sin clases | ⚠️ Mensaje "Compra un paquete" |
| Estudiante con clases pendientes validar | 🔔 Notificación en dashboard |

---

## 3. Happy Paths

### HP-001: Registro de Estudiante
```
GIVEN: Usuario en /register.html
WHEN: 
  1. Selecciona rol "Estudiante"
  2. Ingresa email válido
  3. Ingresa contraseña (mín 6 chars)
  4. Click "Registrarse"
THEN:
  - Redirige a /cliente.html
  - Muestra mensaje de bienvenida
  - Usuario guardado en BD con role='student'
```

### HP-002: Registro de Profesor
```
GIVEN: Usuario en /register.html
WHEN:
  1. Selecciona rol "Profesor"
  2. Completa formulario
  3. Click "Registrarse"
THEN:
  - Redirige a /dashboard.html
  - teacherData.subscriptionStatus = 'trial'
  - Muestra banner "Activa tu membresía"
```

### HP-003: Compra Kit de Bienvenida
```
GIVEN: Usuario en /comenzar
WHEN:
  1. Click "Quiero Comenzar"
  2. Completa nombre, email, WhatsApp
  3. Click "Pagar con MercadoPago"
  4. Completa pago en MP
THEN:
  - Redirige a /welcome-kit/success
  - WelcomeKit creado con status='pending'
  - Email de confirmación enviado
```

### HP-004: Activación Membresía Profesor
```
GIVEN: Profesor logueado con status='trial'
WHEN:
  1. Ve banner "Membresía no activa"
  2. Click "Activar con MercadoPago"
  3. Paga $20 USD (~$19,000 CLP)
  4. Webhook MP confirma pago
THEN:
  - teacherData.subscriptionStatus = 'active'
  - subscriptionExpiresAt = now + 30 días
  - Email de confirmación enviado
  - Puede acceder a sala virtual
```

### HP-005: Profesor Configura Disponibilidad
```
GIVEN: Profesor con membresía activa
WHEN:
  1. Va a /teacher-availability.html
  2. Selecciona días de la semana
  3. Define horarios (ej: 9:00-18:00)
  4. Guarda cambios
THEN:
  - Slots guardados en UTC
  - Visible en catálogo para estudiantes
```

### HP-006: Estudiante Reserva Clase
```
GIVEN: Estudiante con paquete activo (clases > 0)
WHEN:
  1. Va al perfil del profesor
  2. Ve calendario de disponibilidad
  3. Selecciona slot disponible
  4. Confirma reserva
THEN:
  - Booking creado con status='confirmed'
  - classesRemaining -= 1
  - Emails a estudiante y profesor
  - Slot marcado como ocupado
```

### HP-007: Clase Completada y Validada
```
GIVEN: Booking confirmado, fecha pasada
WHEN:
  1. Sistema envía email "¿Tomaste tu clase?"
  2. Estudiante confirma "Sí"
THEN:
  - ClassSession creada con status='validated'
  - Profesor acumula ganancia (80%)
  - Plataforma acumula fee (20%)
```

### HP-008: Payout Mensual a Profesor
```
GIVEN: Mes terminado, profesor tiene sesiones validadas
WHEN:
  1. Cron genera payout automático
  2. Admin revisa y aprueba
  3. Admin ejecuta pago
THEN:
  - TeacherPayout status = 'paid'
  - Profesor recibe dinero
  - Email de confirmación
```

### HP-009: Flujo Onboarding Kit V2
```
GIVEN: Cliente pagó Kit $44
WHEN:
  1. Admin agenda entrevista
  2. Admin envía email con recomendaciones
  3. Cliente confirma "Ya tengo equipo"
  4. Admin hace sesión setup
  5. Cliente toma clase de prueba
THEN:
  - WelcomeKit status = 'completed'
  - Cliente convertido a estudiante
```

---

## 4. Edge Cases

### EC-001: Login con Credenciales Inválidas
```
GIVEN: Usuario en /login.html
WHEN: Ingresa email/password incorrectos
THEN:
  - Muestra error "Credenciales inválidas"
  - No redirige
  - No crea sesión
```

### EC-002: Registro con Email Duplicado
```
GIVEN: Email ya existe en BD
WHEN: Intenta registrarse con ese email
THEN:
  - Error "Este email ya está registrado"
  - Sugiere recuperar contraseña
```

### EC-003: Profesor Sin Membresía Intenta Crear Sala
```
GIVEN: Profesor con status != 'active'
WHEN: Intenta acceder a sala virtual
THEN:
  - Socket emite 'room-error'
  - Mensaje: "Tu membresía no está activa"
  - No se crea sala
```

### EC-004: Reserva en Slot Ya Ocupado
```
GIVEN: Slot tiene booking existente
WHEN: Otro estudiante intenta reservar mismo slot
THEN:
  - Error "Horario no disponible"
  - No se crea booking
  - Calendario se actualiza
```

### EC-005: Reserva Sin Clases Disponibles
```
GIVEN: Estudiante con classesRemaining = 0
WHEN: Intenta reservar clase
THEN:
  - Error "No tienes clases disponibles"
  - Redirige a comprar paquete
```

### EC-006: Pago MercadoPago Rechazado
```
GIVEN: Usuario en checkout
WHEN: Pago es rechazado por MP
THEN:
  - Redirige a ?error=payment_failed
  - Muestra mensaje de error
  - No se crea registro
```

### EC-007: Pago MercadoPago Pendiente
```
GIVEN: Pago queda en estado "pending"
WHEN: Webhook recibe status != 'approved'
THEN:
  - No activa membresía/kit
  - Muestra estado "Pago pendiente"
```

### EC-008: Webhook con Firma Inválida
```
GIVEN: Request a /api/webhooks/*
WHEN: Firma no coincide
THEN:
  - Log de seguridad
  - Responde 200 (no revelar error)
  - No procesa datos
```

### EC-009: Solapamiento de Horarios (Profesor)
```
GIVEN: Profesor tiene clase 10:00-11:00
WHEN: Intenta crear disponibilidad 10:30-11:30
THEN:
  - Warning de conflicto
  - Opción de sobrescribir o cancelar
```

### EC-010: Zona Horaria Incorrecta
```
GIVEN: Estudiante en Chile, Profesor en España
WHEN: Estudiante ve disponibilidad
THEN:
  - Horarios mostrados en zona local del estudiante
  - Booking guarda en UTC
  - Ambos ven hora correcta en su zona
```

### EC-011: Sesión Expirada Durante Operación
```
GIVEN: Token JWT expirado
WHEN: Usuario hace request protegido
THEN:
  - 401 Unauthorized
  - Redirige a login
  - Mensaje "Sesión expirada"
```

### EC-012: Membresía Expira Durante Clase
```
GIVEN: Profesor con membresía expirando hoy
WHEN: Está dando clase cuando expira
THEN:
  - Clase actual continúa (no interrumpir)
  - No puede crear nuevas salas después
```

### EC-013: Cancelación de Clase (< 24h)
```
GIVEN: Booking para mañana
WHEN: Estudiante cancela hoy
THEN:
  - Posible penalización
  - Notificación al profesor
  - Slot liberado
```

### EC-014: Cancelación de Clase (> 24h)
```
GIVEN: Booking para próxima semana
WHEN: Estudiante cancela
THEN:
  - Clase devuelta a classesRemaining
  - Slot liberado
  - Sin penalización
```

### EC-015: Profesor No Aparece a Clase
```
GIVEN: Booking confirmado
WHEN: Profesor no inicia sala
AND: Estudiante reporta "Profesor no apareció"
THEN:
  - Clase devuelta al estudiante
  - Alerta a admin
  - Posible suspensión profesor
```

### EC-016: Disputa de Clase
```
GIVEN: Clase marcada como completada
WHEN: Estudiante dice "No tomé la clase"
THEN:
  - Status = 'disputed'
  - Notificación a admin
  - Profesor no recibe pago hasta resolver
```

### EC-017: Rate Limiting
```
GIVEN: IP hace muchos requests
WHEN: Excede límite (ej: 100/min)
THEN:
  - 429 Too Many Requests
  - Bloqueo temporal
```

### EC-018: Inyección SQL/XSS
```
GIVEN: Input malicioso en formulario
WHEN: Usuario envía <script> o ' OR 1=1
THEN:
  - Input sanitizado
  - No se ejecuta código
  - Log de intento
```

---

## 5. Test Data

### 5.1 Usuarios de Prueba

```javascript
const TEST_USERS = {
  student: {
    email: 'test.student@pianolink.test',
    password: 'Test123456',
    name: 'Estudiante Test'
  },
  teacher_active: {
    email: 'test.teacher.active@pianolink.test',
    password: 'Test123456',
    name: 'Profesor Activo',
    subscriptionStatus: 'active'
  },
  teacher_trial: {
    email: 'test.teacher.trial@pianolink.test',
    password: 'Test123456',
    name: 'Profesor Trial',
    subscriptionStatus: 'trial'
  },
  teacher_expired: {
    email: 'test.teacher.expired@pianolink.test',
    password: 'Test123456',
    name: 'Profesor Expirado',
    subscriptionStatus: 'expired'
  },
  admin: {
    email: 'admin@pianolink.test',
    password: 'AdminTest123',
    role: 'admin'
  }
};
```

### 5.2 Datos de Pago Test

```javascript
const TEST_PAYMENTS = {
  mercadopago: {
    // MercadoPago Sandbox
    card: '5031 7557 3453 0604',
    cvv: '123',
    expiry: '11/25',
    name: 'APRO' // Aprobado
  },
  rejected: {
    card: '5031 7557 3453 0604',
    name: 'OTHE' // Rechazado
  }
};
```

---

## 6. Priorización

### 6.1 Smoke Tests (Ejecutar siempre)

1. ✅ Landing page carga
2. ✅ Login funciona
3. ✅ Dashboard estudiante accesible
4. ✅ Dashboard profesor accesible
5. ✅ Precio Kit $44 visible
6. ✅ Botón MercadoPago funciona
7. ✅ API responde

### 6.2 Tests Críticos (CI/CD)

1. Flujo completo de registro
2. Flujo completo de compra kit
3. Validación de membresía para sala
4. Reserva de clases
5. Webhooks de pago

### 6.3 Tests de Regresión (Nightly)

1. Todos los Happy Paths
2. Edge cases de pago
3. Edge cases de booking
4. Permisos por rol
5. Responsive/Mobile

### 6.4 Tests de Carga (Weekly)

1. 100 usuarios concurrentes en sala
2. 50 reservas simultáneas
3. 20 pagos concurrentes

---

## 📊 Métricas de Éxito

| Métrica | Objetivo |
|---------|----------|
| Cobertura Happy Paths | 100% |
| Cobertura Edge Cases | 80% |
| Tiempo ejecución Smoke | < 30s |
| Tiempo ejecución Full | < 5min |
| Flaky tests | < 5% |

---

## 🚀 Comandos de Ejecución

```bash
# Smoke tests rápidos
node tests/qa-agent.js

# Tests con navegador visible
node tests/qa-agent.js --headed

# Modo debug (lento)
node tests/qa-agent.js --headed --slow

# Contra ambiente local
TEST_URL=http://localhost:3000 node tests/qa-agent.js

# Solo critical path
node tests/qa-agent.js --tag=critical
```

---

*Documento generado por Lead QA Architect - PianoLink v1.0*
