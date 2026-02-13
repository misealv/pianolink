# 🎭 Escenarios de Comportamiento Humano Real

> **Objetivo:** Simular usuarios reales con comportamientos erráticos, no robots perfectos  
> **Formato:** Gherkin/Cucumber con validaciones de BD  
> **Ejecutor:** Agente Playwright + MongoDB assertions

---

## 📋 Índice de Escenarios

| # | Escenario | Categoría | Riesgo |
|---|-----------|-----------|--------|
| 1 | Reserva transcontinental 3AM | Timezone | 🔴 Alto |
| 2 | Retiro antes de confirmación | Fraude | 🔴 Alto |
| 3 | Abandono y reingreso de pago | Flujo roto | 🟡 Medio |
| 4 | Doble-click en botón pagar | Duplicados | 🔴 Alto |
| 5 | Profesor cambia precio mid-checkout | Integridad | 🔴 Alto |
| 6 | Estudiante disputa clase fantasma | Fraude | 🔴 Alto |
| 7 | Membresía expira durante clase | Edge timing | 🟡 Medio |
| 8 | Usuario cambia de dispositivo | Sesión | 🟢 Bajo |
| 9 | Refresh obsesivo post-pago | Ansiedad | 🟡 Medio |
| 10 | Múltiples pestañas mismo booking | Race condition | 🔴 Alto |

---

## Escenario 1: El Alumno Nocturno Transcontinental

> *"María en Londres quiere reservar clase con Carlos en México a las 3AM hora del profe"*

```gherkin
Feature: Reserva con diferencia horaria extrema
  Como estudiante en zona horaria diferente
  Quiero reservar una clase en horario conveniente para mí
  Sin despertar a mi profesor a las 3AM

  Background:
    Given un profesor "Carlos" en Ciudad de México (UTC-6)
    And su disponibilidad es de 9:00 a 21:00 hora local
    And una estudiante "María" en Londres (UTC+0)
    And María está logueada en su dashboard

  Scenario: Estudiante ve horarios en su zona local
    When María visita el perfil de Carlos
    Then los horarios se muestran en hora de Londres
    And el slot "9:00 CDMX" aparece como "15:00 London"
    And el slot "21:00 CDMX" aparece como "03:00 London (+1 día)"

  Scenario: Estudiante intenta reservar en horario no disponible
    When María intenta reservar a las "10:00 London" (4:00 CDMX)
    Then el sistema muestra "Horario fuera de disponibilidad"
    And NO se crea booking en base de datos
    
    # VALIDACIÓN BD
    Then ejecutar query:
      """
      db.bookings.find({
        studentId: ObjectId("maria_id"),
        teacherId: ObjectId("carlos_id"),
        createdAt: { $gte: new Date(Date.now() - 60000) }
      }).count() === 0
      """

  Scenario: Reserva exitosa respetando zona del profesor
    When María reserva a las "16:00 London" (10:00 CDMX)
    Then booking se crea con startTime en UTC
    
    # VALIDACIÓN BD
    Then ejecutar query:
      """
      const booking = db.bookings.findOne({ studentId: "maria_id" });
      assert(booking.startTimeUTC.getUTCHours() === 16); // 10:00 CDMX = 16:00 UTC
      assert(booking.timezone.student === "Europe/London");
      assert(booking.timezone.teacher === "America/Mexico_City");
      """
```

---

## Escenario 2: El Profesor Impaciente

> *"Diego quiere retirar sus $50.000 CLP aunque el alumno aún no confirmó la clase"*

```gherkin
Feature: Intento de retiro prematuro de fondos
  Como profesor ansioso por cobrar
  Quiero retirar dinero apenas termina la clase
  Pero el sistema debe proteger al estudiante

  Background:
    Given profesor "Diego" con membresía activa
    And una clase programada para hoy a las 10:00
    And la clase terminó a las 11:00
    And el estudiante aún no ha confirmado asistencia
    And Diego tiene $50.000 CLP en "pendiente de validación"

  Scenario: Profesor intenta retiro de fondos no confirmados
    When Diego va a /ganancias.html
    Then ve "Saldo disponible: $0"
    And ve "Pendiente de validación: $50.000"
    When hace click en "Solicitar Retiro"
    Then botón está deshabilitado
    And mensaje: "Las ganancias se liberan 48h después de confirmación"

  Scenario: Profesor intenta hackear el endpoint directamente
    When Diego hace POST a /api/payouts/request con:
      """
      { amount: 50000, teacherId: "diego_id" }
      """
    Then respuesta es 400 Bad Request
    And mensaje: "Fondos insuficientes disponibles"
    
    # VALIDACIÓN BD
    Then ejecutar query:
      """
      const payout = db.teacherPayouts.findOne({
        teacherId: "diego_id",
        createdAt: { $gte: new Date(Date.now() - 60000) }
      });
      assert(payout === null); // No se creó payout
      """

  Scenario: Flujo correcto post-confirmación
    Given el estudiante confirma "Sí tomé la clase"
    And pasan 48 horas
    When Diego solicita retiro
    Then payout se crea con status "pending"
    
    # VALIDACIÓN BD
    Then ejecutar query:
      """
      const session = db.classSessions.findOne({ teacherId: "diego_id" });
      assert(session.status === "validated");
      assert(session.validatedAt < new Date(Date.now() - 48*60*60*1000));
      
      const teacher = db.users.findOne({ _id: "diego_id" });
      assert(teacher.teacherData.availableBalance >= 40000); // 80% de 50k
      """
```

---

## Escenario 3: El Arrepentido del Checkout

> *"Sofía empieza a pagar el kit, cierra la pestaña, vuelve 2 horas después"*

```gherkin
Feature: Abandono y reingreso de flujo de pago
  Como usuario indeciso
  Quiero poder abandonar el checkout y volver después
  Sin que me cobren dos veces ni pierda mis datos

  Background:
    Given usuario "Sofía" en /kit-bienvenida-v2.html
    And completó nombre: "Sofía García"
    And completó email: "sofia@test.com"
    And completó WhatsApp: "+56912345678"

  Scenario: Abandono pre-pago (no llega a MercadoPago)
    When Sofía hace click en "Pagar con MercadoPago"
    And MercadoPago abre en nueva pestaña
    And Sofía cierra AMBAS pestañas sin completar
    Then NO existe WelcomeKit en base de datos
    
    # VALIDACIÓN BD
    Then ejecutar query:
      """
      db.welcomeKits.find({
        email: "sofia@test.com",
        createdAt: { $gte: new Date(Date.now() - 3600000) }
      }).count() === 0
      """

  Scenario: Sofía vuelve 2 horas después
    Given pasaron 2 horas
    When Sofía vuelve a /kit-bienvenida-v2.html
    Then el formulario está vacío (sin datos guardados)
    When completa datos nuevamente
    And completa pago exitosamente
    Then solo existe UN WelcomeKit para sofia@test.com
    
    # VALIDACIÓN BD
    Then ejecutar query:
      """
      const kits = db.welcomeKits.find({ email: "sofia@test.com" }).toArray();
      assert(kits.length === 1);
      assert(kits[0].paymentStatus === "approved");
      """

  Scenario: Sofía tiene pago pendiente y vuelve a intentar
    Given Sofía tiene un WelcomeKit con paymentStatus="pending"
    When intenta crear otro Kit con mismo email
    Then sistema detecta duplicado
    And muestra: "Ya tienes un pago en proceso"
    And ofrece link para verificar estado
```

---

## Escenario 4: El Ansioso del Doble-Click

> *"Roberto hace click 5 veces en 'Pagar' porque no ve respuesta inmediata"*

```gherkin
Feature: Prevención de pagos duplicados por doble-click
  Como usuario impaciente
  Hago click múltiples veces cuando algo tarda
  Pero no quiero que me cobren 5 veces

  Background:
    Given usuario "Roberto" en checkout
    And tiene datos completos listos para pagar

  Scenario: Doble-click rápido en botón de pago
    When Roberto hace click en "Pagar con MercadoPago"
    And inmediatamente hace click 4 veces más (total 5)
    Then botón se deshabilita después del primer click
    And muestra spinner "Procesando..."
    And solo se crea UNA preferencia de MercadoPago
    
    # VALIDACIÓN BD
    Then ejecutar query:
      """
      const oneMinuteAgo = new Date(Date.now() - 60000);
      const preferences = db.paymentPreferences.find({
        email: "roberto@test.com",
        createdAt: { $gte: oneMinuteAgo }
      }).toArray();
      assert(preferences.length === 1);
      """

  Scenario: Roberto abre checkout en múltiples pestañas
    Given Roberto tiene 3 pestañas abiertas con el mismo checkout
    When hace click en "Pagar" en las 3 pestañas casi simultáneamente
    Then solo la primera genera preferencia válida
    And las otras 2 muestran error o redirigen
    
    # VALIDACIÓN API
    Then verificar logs:
      """
      - Request 1: 200 OK, preference_id: "abc123"
      - Request 2: 409 Conflict, "Pago ya en proceso"
      - Request 3: 409 Conflict, "Pago ya en proceso"
      """
```

---

## Escenario 5: El Profesor Que Cambia Precio Mid-Checkout

> *"Elena está comprando paquete de $80 USD, el profesor sube precio a $100 mientras ella paga"*

```gherkin
Feature: Integridad de precio durante checkout
  Como estudiante
  No quiero que me cobren más de lo que vi
  Aunque el profesor cambie el precio mientras pago

  Background:
    Given profesora "Ana" con paquete "4 clases" a $80 USD
    And estudiante "Elena" está en checkout de ese paquete
    And Elena ve precio: "$80 USD"

  Scenario: Profesor cambia precio durante checkout activo
    When Ana (en otra sesión) cambia precio a $100 USD
    And Elena completa el pago
    Then Elena paga $80 USD (precio original capturado)
    
    # VALIDACIÓN BD
    Then ejecutar query:
      """
      const purchase = db.packagePurchases.findOne({ 
        studentId: "elena_id",
        createdAt: { $gte: new Date(Date.now() - 300000) }
      });
      assert(purchase.priceAtPurchase === 8000); // centavos
      assert(purchase.priceAtPurchase !== 10000); // NO el nuevo precio
      
      const currentPackage = db.packages.findOne({ _id: purchase.packageId });
      assert(currentPackage.price === 10000); // El precio actual SÍ es 100
      """

  Scenario: Nuevo estudiante ve precio actualizado
    Given el cambio de precio ya fue guardado
    When nuevo estudiante "Pedro" visita el paquete
    Then Pedro ve "$100 USD"
    And puede comprar a $100 USD
```

---

## Escenario 6: El Estudiante Que Disputa Clase Fantasma

> *"Tomás dice que tomó clase pero el profesor nunca inició la sala"*

```gherkin
Feature: Disputa de clase no realizada
  Como estudiante que pagó
  Quiero reclamar si el profesor no apareció
  Y recuperar mi clase

  Background:
    Given estudiante "Tomás" con booking confirmado para hoy 10:00
    And profesor "Luis" debía iniciar sala
    And son las 11:30 (1.5 horas después)
    And NO existe registro de Room para ese booking

  Scenario: Estudiante reporta que profesor no apareció
    When Tomás va a /mis-clases.html
    And hace click en "Reportar Problema"
    And selecciona "El profesor no apareció"
    Then se crea ticket de disputa
    And clase se marca como "disputed"
    And NO se descuenta clase del paquete de Tomás
    
    # VALIDACIÓN BD
    Then ejecutar query:
      """
      const booking = db.bookings.findOne({ _id: "booking_id" });
      assert(booking.status === "disputed");
      assert(booking.disputeReason === "teacher_no_show");
      
      const student = db.users.findOne({ _id: "tomas_id" });
      // Clase no descontada o reembolsada
      assert(student.classesRemaining >= expectedClasses);
      
      // No existe sala para este booking
      const room = db.rooms.findOne({ bookingId: "booking_id" });
      assert(room === null);
      """

  Scenario: Admin investiga y confirma no-show
    Given admin revisa el caso
    When verifica que NO hay registro de sala virtual
    And verifica logs de socket.io (sin conexión del profesor)
    Then admin resuelve a favor del estudiante
    And Tomás recupera su clase
    And Luis recibe strike de advertencia
    
    # VALIDACIÓN BD
    Then ejecutar query:
      """
      const teacher = db.users.findOne({ _id: "luis_id" });
      assert(teacher.teacherData.strikes >= 1);
      
      if (teacher.teacherData.strikes >= 3) {
        assert(teacher.teacherData.status === "suspended");
      }
      """
```

---

## Escenario 7: La Membresía Que Expira Mid-Clase

> *"La membresía de Carla expira a las 10:30 pero su clase termina a las 11:00"*

```gherkin
Feature: Expiración de membresía durante clase activa
  Como profesora dando clase
  No quiero que me corten la sala a mitad de sesión
  Aunque mi membresía expire en ese momento

  Background:
    Given profesora "Carla" con membresía activa
    And subscriptionExpiresAt = "2026-02-07T10:30:00Z"
    And clase programada de 10:00 a 11:00
    And son las 10:00 y Carla inicia la sala

  Scenario: Clase continúa aunque membresía expire
    When el reloj marca 10:30 (membresía expira)
    Then la sala sigue activa
    And estudiante y profesora siguen conectados
    And la clase termina normalmente a las 11:00
    
    # VALIDACIÓN BD
    Then ejecutar query:
      """
      const room = db.rooms.findOne({ 
        teacherId: "carla_id",
        status: "active"
      });
      assert(room !== null); // Sala sigue existiendo
      assert(room.endedAt === null); // No terminó prematuramente
      """

  Scenario: Profesora no puede crear NUEVA sala post-expiración
    Given la clase de las 10:00 terminó
    And son las 11:30
    When Carla intenta crear nueva sala
    Then error: "Tu membresía ha expirado"
    And redirige a página de renovación
    
    # VALIDACIÓN BD
    Then ejecutar query:
      """
      const carla = db.users.findOne({ _id: "carla_id" });
      assert(carla.teacherData.subscriptionStatus === "expired");
      
      // Verificar que la clase anterior SÍ se completó
      const lastSession = db.classSessions.findOne({
        teacherId: "carla_id"
      }, { sort: { endedAt: -1 } });
      assert(lastSession.status === "completed");
      """
```

---

## Escenario 8: El Usuario Multi-Dispositivo

> *"Andrés empieza en el PC, continúa en el celular, termina en tablet"*

```gherkin
Feature: Continuidad de sesión entre dispositivos
  Como usuario moderno
  Uso múltiples dispositivos
  Y espero que mi sesión funcione en todos

  Background:
    Given usuario "Andrés" logueado en PC (Chrome)
    And tiene token JWT válido

  Scenario: Login en segundo dispositivo mantiene primer sesión
    When Andrés abre la app en su celular
    And hace login con mismas credenciales
    Then ambas sesiones son válidas
    And PC sigue funcionando
    And celular también funciona
    
    # VALIDACIÓN BD
    Then ejecutar query:
      """
      const sessions = db.sessions.find({ userId: "andres_id" }).toArray();
      assert(sessions.length >= 2);
      assert(sessions.every(s => s.valid === true));
      """

  Scenario: Acción en un dispositivo se refleja en otro
    Given Andrés tiene dashboard abierto en PC y celular
    When completa una acción en PC (ej: confirmar clase)
    And refresca en celular
    Then celular muestra el cambio
    
  Scenario: Logout en un dispositivo no afecta otros
    When Andrés hace logout en celular
    Then celular redirige a login
    But PC sigue logueado y funcional
```

---

## Escenario 9: El Paranoico Post-Pago

> *"Lucía pagó pero no ve confirmación, refresca 47 veces en 2 minutos"*

```gherkin
Feature: Manejo de refresh obsesivo post-pago
  Como usuario ansioso
  Después de pagar quiero ver confirmación inmediata
  Y voy a refrescar hasta verla

  Background:
    Given usuaria "Lucía" completó pago en MercadoPago
    And fue redirigida a /welcome-kit/success
    And webhook de MP aún no llega (delay de red)

  Scenario: Usuario refresca antes de webhook
    When Lucía refresca la página 10 veces
    Then cada refresh muestra "Verificando pago..."
    And NO crea múltiples WelcomeKits
    And NO envía múltiples emails
    
    # VALIDACIÓN BD
    Then ejecutar query:
      """
      const kits = db.welcomeKits.find({ 
        email: "lucia@test.com" 
      }).toArray();
      assert(kits.length === 1); // Solo UNO
      """

  Scenario: Webhook llega durante refresh
    Given Lucía está refrescando obsesivamente
    When webhook de MP llega con status="approved"
    Then próximo refresh muestra "¡Pago confirmado!"
    And muestra resumen de compra
    And Lucía puede dejar de refrescar
    
  Scenario: Página maneja caché correctamente
    Given Lucía refrescó 47 veces
    And el webhook confirmó el pago
    When Lucía visita la misma URL mañana
    Then ve página de confirmación (no reprocesa)
    And NO intenta cobrar de nuevo
```

---

## Escenario 10: La Carrera de Reservas

> *"Dos estudiantes intentan reservar el mismo slot exactamente al mismo tiempo"*

```gherkin
Feature: Race condition en reserva de slots
  Como sistema de booking
  Debo manejar requests simultáneos
  Sin crear reservas duplicadas

  Background:
    Given profesor "Miguel" con slot disponible: 2026-02-10 10:00
    And estudiante "Ana" en PC lista para reservar
    And estudiante "Pedro" en celular lista para reservar
    And ambos ven el slot como "Disponible"

  Scenario: Requests simultáneos al mismo slot
    When Ana hace click en "Reservar" a las 15:00:00.000
    And Pedro hace click en "Reservar" a las 15:00:00.050 (50ms después)
    Then solo UNO obtiene la reserva
    And el otro recibe error "Slot ya no disponible"
    And calendario se actualiza para ambos
    
    # VALIDACIÓN BD
    Then ejecutar query:
      """
      const slot = new Date("2026-02-10T10:00:00Z");
      const bookings = db.bookings.find({
        teacherId: "miguel_id",
        startTime: slot
      }).toArray();
      
      assert(bookings.length === 1); // SOLO UNO
      
      // Verificar lock optimista o transacción
      const booking = bookings[0];
      assert(booking.version === 1); // Primera versión
      """

  Scenario: Sistema usa locking correcto
    Given 10 estudiantes intentan reservar mismo slot
    When todos hacen click en ventana de 100ms
    Then exactamente 1 reserva se crea
    And 9 reciben error apropiado
    And no hay estado inconsistente
    
    # VALIDACIÓN BD
    Then ejecutar query:
      """
      // Verificar integridad
      const allBookings = db.bookings.find({
        teacherId: "miguel_id",
        startTime: targetSlot
      }).toArray();
      
      assert(allBookings.length === 1);
      
      // Verificar que las 9 fallas se loguearon
      const failedAttempts = db.bookingAttempts.find({
        slotId: "slot_id",
        status: "conflict"
      }).toArray();
      
      assert(failedAttempts.length === 9);
      """

  Scenario: UI previene click múltiple
    When Ana hace click en "Reservar"
    Then botón se deshabilita inmediatamente
    And muestra "Reservando..."
    And no puede hacer segundo click
```

---

## 🔧 Implementación del Agente

### Helpers para Validaciones de BD

```javascript
// tests/helpers/dbAssertions.js

const { MongoClient } = require('mongodb');

class DBValidator {
  constructor(uri) {
    this.uri = uri;
    this.client = null;
  }

  async connect() {
    this.client = await MongoClient.connect(this.uri);
    this.db = this.client.db('pianolink');
  }

  async assertCount(collection, query, expected) {
    const count = await this.db.collection(collection).countDocuments(query);
    if (count !== expected) {
      throw new Error(
        `DB Assertion Failed: ${collection} count ${count} !== ${expected}`
      );
    }
  }

  async assertExists(collection, query) {
    const doc = await this.db.collection(collection).findOne(query);
    if (!doc) {
      throw new Error(
        `DB Assertion Failed: Document not found in ${collection}`
      );
    }
    return doc;
  }

  async assertNotExists(collection, query) {
    const doc = await this.db.collection(collection).findOne(query);
    if (doc) {
      throw new Error(
        `DB Assertion Failed: Document should not exist in ${collection}`
      );
    }
  }

  async assertField(collection, query, field, expectedValue) {
    const doc = await this.db.collection(collection).findOne(query);
    if (!doc) {
      throw new Error(`Document not found`);
    }
    const actualValue = this.getNestedField(doc, field);
    if (actualValue !== expectedValue) {
      throw new Error(
        `Field ${field}: ${actualValue} !== ${expectedValue}`
      );
    }
  }

  getNestedField(obj, path) {
    return path.split('.').reduce((o, k) => o?.[k], obj);
  }

  async close() {
    await this.client?.close();
  }
}

module.exports = { DBValidator };
```

### Ejemplo de Test Playwright con Validación BD

```javascript
// tests/scenarios/double-click-payment.spec.js

const { test, expect } = require('@playwright/test');
const { DBValidator } = require('../helpers/dbAssertions');

test.describe('EC-004: Doble-click en botón de pago', () => {
  let db;

  test.beforeAll(async () => {
    db = new DBValidator(process.env.MONGODB_URI);
    await db.connect();
  });

  test.afterAll(async () => {
    await db.close();
  });

  test('Solo crea una preferencia aunque haga 5 clicks', async ({ page }) => {
    const testEmail = `test-${Date.now()}@test.com`;
    
    // Ir al checkout
    await page.goto('/kit-bienvenida-v2.html');
    
    // Llenar formulario
    await page.fill('#name', 'Roberto Ansioso');
    await page.fill('#email', testEmail);
    await page.fill('#whatsapp', '+56912345678');
    
    // Hacer 5 clicks rápidos
    const button = page.locator('#btn-mercadopago');
    await Promise.all([
      button.click(),
      button.click(),
      button.click(),
      button.click(),
      button.click(),
    ]);
    
    // Esperar un momento para que procese
    await page.waitForTimeout(2000);
    
    // VALIDACIÓN UI: Botón deshabilitado
    await expect(button).toBeDisabled();
    
    // VALIDACIÓN BD: Solo una preferencia
    const oneMinuteAgo = new Date(Date.now() - 60000);
    await db.assertCount('welcomeKits', {
      email: testEmail,
      createdAt: { $gte: oneMinuteAgo }
    }, 1);
  });
});
```

---

## 📊 Cobertura de Riesgos

| Escenario | Riesgo de Negocio | Impacto Financiero |
|-----------|-------------------|-------------------|
| #1 Timezone | Clases mal agendadas | Bajo |
| #2 Retiro prematuro | Pérdida de dinero | 🔴 Alto |
| #3 Abandono checkout | Conversión perdida | Medio |
| #4 Doble-click | Cobros duplicados | 🔴 Alto |
| #5 Precio mid-checkout | Fraude o pérdida | 🔴 Alto |
| #6 Disputa fantasma | Fraude estudiantil | 🔴 Alto |
| #7 Expiración mid-clase | UX negativo | Medio |
| #8 Multi-dispositivo | Sesiones rotas | Bajo |
| #9 Refresh obsesivo | Duplicados, ansiedad | Medio |
| #10 Race condition | Overbooking | 🔴 Alto |

---

*Documento creado por UX Tester - PianoLink QA Suite*
