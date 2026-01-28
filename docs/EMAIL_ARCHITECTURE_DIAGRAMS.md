# 📊 Arquitectura del Sistema de Emails - Diagramas Visuales

## Flujo Completo del Sistema

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    ARQUITECTURA EVENT-DRIVEN DE EMAILS                  │
└─────────────────────────────────────────────────────────────────────────┘


    ┌──────────────┐
    │   Cliente    │  1. POST /api/auth/register
    │  (Browser)   │     { name, email, password }
    └──────┬───────┘
           │
           ▼
    ┌──────────────────────────────────────────────┐
    │      authController.registerUser()           │  2. Valida y crea usuario
    │                                              │
    │  • Valida datos                             │
    │  • User.create() → MongoDB                  │
    │  • eventService.emitSafe('teacher.created') │
    │  • res.json({ success: true })              │  ◄── Responde INMEDIATAMENTE
    └──────────────┬───────────────────────────────┘
                   │
                   │  ✅ Usuario registrado (guardado en DB)
                   │  🔔 Evento emitido (no bloqueante)
                   │
                   ▼
    ┌───────────────────────────────────────────────┐
    │         EventService (EventEmitter)           │  3. Distribuye evento
    │                                               │
    │  • Mantiene lista de listeners               │
    │  • Distribuye evento a todos los suscritos   │
    │  • Manejo de errores aislado                 │
    └───────────────┬───────────────────────────────┘
                    │
                    │  Evento: "teacher.created"
                    │  Datos: { teacher: {...} }
                    │
        ┌───────────┴──────────┬─────────────┬────────────────┐
        │                      │             │                │
        ▼                      ▼             ▼                ▼
    
    Listener 1           Listener 2      Listener 3    (Futuros listeners)
    ┌─────────────┐    ┌─────────────┐  ┌──────────┐  ┌──────────────┐
    │ Send Email  │    │ Notify Admin│  │ Create   │  │ Update CRM   │
    │ to Teacher  │    │             │  │ Settings │  │ Analytics... │
    └──────┬──────┘    └─────────────┘  └──────────┘  └──────────────┘
           │
           │  4. emailListeners.onTeacherCreated()
           │
           ▼
    ┌────────────────────────────────────────────────┐
    │    Generate Template (welcomeTeacher.js)       │  5. Genera HTML
    │                                                │
    │  • Personaliza con datos del profesor         │
    │  • Genera HTML responsive                     │
    └──────────────────┬─────────────────────────────┘
                       │
                       │  HTML listo
                       │
                       ▼
    ┌────────────────────────────────────────────────┐
    │         EmailService.sendSafe()                │  6. Envía email
    │                                                │
    │  • Validación de datos                        │
    │  • Sistema de reintentos (max 3)              │
    │  • Logging detallado                          │
    │  • No lanza errores (silencioso)              │
    └──────────────────┬─────────────────────────────┘
                       │
                       │
            ┌──────────┴──────────┐
            │                     │
            ▼                     ▼
    
    NODE_ENV=development     NODE_ENV=production
    ┌──────────────────┐    ┌──────────────────┐
    │   📝 Simulación  │    │   📧 Envío Real  │  7. Resultado
    │                  │    │                  │
    │ • Log en consola │    │ • Resend API     │
    │ • No gasta cuota │    │ • Email real     │
    │ • Rápido testing │    │ • Tracking       │
    └──────────────────┘    └──────────────────┘


═══════════════════════════════════════════════════════════════════════════

                          CARACTERÍSTICAS CLAVE

    ✅ No Bloqueante        Los emails NO retrasan la respuesta al cliente
    ✅ Resiliente           Si falla el email, el usuario queda registrado
    ✅ Desacoplado          Fácil agregar nuevas acciones sin tocar código
    ✅ Escalable            Múltiples listeners por evento
    ✅ Logging              Cada paso es traceable

═══════════════════════════════════════════════════════════════════════════
```

---

## Comparación: Con vs Sin Eventos

### ❌ SIN EVENTOS (Arquitectura Monolítica)

```
Cliente
  │
  ▼
authController.registerUser() {
  │
  ├─► 1. Validar datos
  │
  ├─► 2. User.create()  ────► MongoDB ✅
  │
  ├─► 3. sendWelcomeEmail()
  │      │
  │      └─► ❌ Si falla aquí → TODO falla
  │
  ├─► 4. notifyAdmin()
  │      │
  │      └─► ❌ Si falla aquí → TODO falla
  │
  ├─► 5. createSettings()
  │      │
  │      └─► ❌ Si falla aquí → TODO falla
  │
  └─► 6. res.json() ────► Cliente ⏱️ LENTO (esperó todo)
}

PROBLEMAS:
• Alto acoplamiento
• Un error afecta todo
• Difícil agregar funcionalidades
• Respuesta lenta al cliente
```

### ✅ CON EVENTOS (Arquitectura Desacoplada)

```
Cliente
  │
  ▼
authController.registerUser() {
  │
  ├─► 1. Validar datos
  │
  ├─► 2. User.create()  ────► MongoDB ✅
  │
  ├─► 3. eventService.emit('teacher.created')
  │      │
  │      └─► 🔔 Dispara evento (no espera resultado)
  │
  └─► 4. res.json() ────► Cliente ⚡ RÁPIDO (respuesta inmediata)
}

    EventService (en paralelo)
      │
      ├─► Listener 1: sendWelcomeEmail()  ✅ o ❌ (no afecta otros)
      │
      ├─► Listener 2: notifyAdmin()       ✅ o ❌ (no afecta otros)
      │
      └─► Listener 3: createSettings()    ✅ o ❌ (no afecta otros)

VENTAJAS:
• Bajo acoplamiento
• Errores aislados
• Fácil agregar listeners
• Respuesta rápida al cliente
```

---

## Flujo de Reintentos del EmailService

```
EmailService.send()
    │
    ├─► Intento 1
    │    │
    │    ├─► ✅ Éxito → return { success: true }
    │    │
    │    └─► ❌ Error (ej. timeout)
    │         │
    │         ├─► ⏰ Esperar 2 segundos
    │         │
    │         └─► Intento 2
    │              │
    │              ├─► ✅ Éxito → return { success: true }
    │              │
    │              └─► ❌ Error
    │                   │
    │                   ├─► ⏰ Esperar 2 segundos
    │                   │
    │                   └─► Intento 3 (último)
    │                        │
    │                        ├─► ✅ Éxito → return { success: true }
    │                        │
    │                        └─► ❌ Error
    │                             │
    │                             └─► throw Error (después de 3 intentos)
    │
    │  Pero como usamos sendSafe():
    │  ↓
    │  catch (error) {
    │    console.error(error);
    │    return false;  ◄── NO lanza error, solo logea
    │  }
```

---

## Estructura de Carpetas y Responsabilidades

```
pianolink/
│
├── services/                    ← CAPA DE SERVICIOS
│   │
│   ├── EventService.js         [RESPONSABILIDAD]
│   │                           • Emitir eventos
│   │                           • Mantener lista de listeners
│   │                           • Logging de eventos
│   │                           • Manejo de errores de listeners
│   │
│   └── EmailService.js         [RESPONSABILIDAD]
│                               • Enviar emails via Resend
│                               • Sistema de reintentos
│                               • Modo desarrollo vs producción
│                               • Validación de datos
│
├── listeners/                   ← CAPA DE LISTENERS
│   │
│   └── emailListeners.js       [RESPONSABILIDAD]
│                               • Escuchar eventos
│                               • Orquestar envío de emails
│                               • Llamar a templates
│                               • Registrar listeners
│
├── templates/emails/            ← CAPA DE PRESENTACIÓN
│   │
│   ├── _baseTemplate.js        [RESPONSABILIDAD]
│   │                           • Estructura HTML base
│   │                           • Header y footer consistentes
│   │                           • Estilos responsive
│   │
│   ├── welcomeTeacher.js       [RESPONSABILIDAD]
│   │                           • HTML específico de bienvenida
│   │                           • Variables dinámicas
│   │                           • Personalización
│   │
│   └── classReminder.js        [RESPONSABILIDAD]
│                               • HTML de recordatorio
│                               • (Ejemplo para el futuro)
│
├── controllers/                 ← CAPA DE CONTROLADORES
│   │
│   └── authController.js       [RESPONSABILIDAD]
│                               • Validar requests
│                               • Interactuar con DB
│                               • Emitir eventos
│                               • Responder al cliente
│
└── server.js                    ← PUNTO DE ENTRADA
                                [RESPONSABILIDAD]
                                • Inicializar listeners
                                • Configurar express
                                • Iniciar servidor


PRINCIPIOS APLICADOS:
✅ Separation of Concerns    (Cada capa tiene una responsabilidad clara)
✅ Single Responsibility     (Cada archivo hace una cosa bien)
✅ Dependency Injection      (Los servicios son inyectados)
✅ Open/Closed Principle     (Abierto para extensión, cerrado para modificación)
```

---

## Ciclo de Vida de un Evento

```
PASO  │  QUÉ SUCEDE                           │  DÓNDE
──────┼───────────────────────────────────────┼──────────────────────────────
      │                                       │
  1   │  Usuario hace POST /register         │  Cliente (Browser)
      │                                       │
  2   │  Express recibe request              │  server.js
      │                                       │
  3   │  Llama a authController.registerUser │  controllers/authController.js
      │                                       │
  4   │  Valida datos del body               │  authController.js
      │                                       │
  5   │  User.create() → MongoDB             │  models/User.js + MongoDB
      │  ✅ Usuario guardado en DB            │
      │                                       │
  6   │  eventService.emitSafe(...)          │  authController.js
      │  🔔 Evento "teacher.created" emitido │
      │                                       │
  7   │  res.json({ success: true })         │  authController.js
      │  ⚡ Cliente recibe respuesta          │  ← RESPUESTA RÁPIDA
      │                                       │
      ├─ FIN DEL REQUEST/RESPONSE ───────────┤
      │                                       │
      │  En paralelo (no bloqueante):       │
      │                                       │
  8   │  EventService distribuye evento      │  services/EventService.js
      │                                       │
  9   │  Listener recibe evento              │  listeners/emailListeners.js
      │  onTeacherCreated({ teacher })       │
      │                                       │
 10   │  Genera HTML del email               │  templates/emails/welcomeTeacher.js
      │                                       │
 11   │  emailService.sendSafe(...)          │  services/EmailService.js
      │                                       │
 12   │  Resend API envía email              │  Resend (externo)
      │  📧 Email entregado                   │
      │                                       │
 13   │  Log de resultado                    │  Console / Logs
      │  ✅ Email enviado exitosamente       │
      │                                       │

TIEMPO TOTAL DEL REQUEST: ~200ms  (solo pasos 1-7)
TIEMPO DEL EMAIL: ~1-3s          (pasos 8-12, en paralelo)

El cliente NO espera el envío del email.
```

---

## Cómo Agregar un Nuevo Tipo de Email (3 pasos)

```
EJEMPLO: Email de confirmación de clase

┌─────────────────────────────────────────────────────────────────────┐
│  PASO 1: Crear el Template                                         │
└─────────────────────────────────────────────────────────────────────┘

  File: templates/emails/classConfirmation.js

  module.exports = function generateClassConfirmationEmail(data) {
      const { studentName, classDate, teacherName } = data;
      
      return `
          <h1>Clase Confirmada</h1>
          <p>Hola ${studentName}, tu clase con ${teacherName}...</p>
      `;
  };


┌─────────────────────────────────────────────────────────────────────┐
│  PASO 2: Crear el Listener                                         │
└─────────────────────────────────────────────────────────────────────┘

  File: listeners/emailListeners.js (agregar)

  async function onClassConfirmed(data) {
      const html = generateClassConfirmationEmail(data);
      
      await emailService.sendSafe({
          to: data.student.email,
          subject: 'Clase confirmada',
          html: html
      });
  }

  // En registerEmailListeners():
  eventService.registerListener(
      'class.confirmed',
      onClassConfirmed,
      'sendClassConfirmation'
  );


┌─────────────────────────────────────────────────────────────────────┐
│  PASO 3: Emitir el Evento desde el Controlador                    │
└─────────────────────────────────────────────────────────────────────┘

  File: controllers/classController.js

  exports.confirmClass = async (req, res) => {
      const classData = await Class.create(req.body);
      
      // Emitir evento
      eventService.emitSafe('class.confirmed', {
          student: classData.student,
          teacher: classData.teacher,
          classDate: classData.date
      });
      
      res.json({ success: true });
  };


┌─────────────────────────────────────────────────────────────────────┐
│  ¡LISTO! Sin modificar código existente                           │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Modos de Operación

```
┌────────────────────────────────────────────────────────────────────┐
│                     NODE_ENV=development                           │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  EmailService.send()                                              │
│      │                                                             │
│      ├─► Verifica: NODE_ENV !== 'production'                      │
│      │                                                             │
│      └─► ✅ Es development                                         │
│           │                                                        │
│           ├─► console.log("[EMAIL] 📧 [SIMULADO]")                │
│           │                                                        │
│           ├─► console.log("Email a: juan@example.com")            │
│           │                                                        │
│           └─► return { success: true, mode: 'simulated' }         │
│                                                                    │
│  ✅ NO se envía email real                                         │
│  ✅ NO se consume cuota de Resend                                  │
│  ✅ Rápido para testing                                            │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│                     NODE_ENV=production                            │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  EmailService.send()                                              │
│      │                                                             │
│      ├─► Verifica: NODE_ENV === 'production'                      │
│      │                                                             │
│      └─► ✅ Es production                                          │
│           │                                                        │
│           ├─► Valida RESEND_API_KEY                               │
│           │                                                        │
│           ├─► resend.emails.send({ ... })                         │
│           │    │                                                   │
│           │    └─► 📧 Resend API (externo)                        │
│           │         │                                              │
│           │         └─► Email entregado                            │
│           │                                                        │
│           └─► return { success: true, id: 'abc123' }              │
│                                                                    │
│  ✅ Email real enviado                                             │
│  ✅ Consume cuota de Resend                                        │
│  ✅ Tracking disponible                                            │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

---

**Fecha:** Enero 2026  
**Autor:** PianoLink Dev Team
