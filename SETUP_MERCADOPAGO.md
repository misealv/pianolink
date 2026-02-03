# 💳 Configuración de Mercado Pago - PianoLink

Guía completa para configurar pagos recurrentes con Mercado Pago en Argentina.

---

## 📋 Paso 1: Crear Cuenta en Mercado Pago

1. Ve a [https://www.mercadopago.com.ar](https://www.mercadopago.com.ar)
2. **Regístrate** como vendedor
3. **Verifica tu identidad** (DNI/CUIT) - Requerido para recibir pagos
4. Espera la **aprobación** (puede tomar 24-48 horas)

---

## 🔑 Paso 2: Obtener Credenciales de Producción

### 2.1 Acceder al Panel de Desarrolladores

1. Ve a [https://www.mercadopago.com.ar/developers/panel](https://www.mercadopago.com.ar/developers/panel)
2. **Inicia sesión** con tu cuenta de Mercado Pago
3. En el menú lateral, ve a **"Tus integraciones"**
4. Click en **"Crear aplicación"**

### 2.2 Crear Aplicación

```
Nombre: PianoLink Suscripciones
Descripción: Sistema de suscripciones mensuales para clases de piano
Producto: ✅ Checkout Pro
          ✅ Checkout API
```

### 2.3 Copiar Credenciales

Una vez creada la aplicación:

```
📍 Panel → Credenciales de producción

Copiar:
- Public Key  → comienza con APP_USR-...
- Access Token → comienza con APP_USR-...
```

⚠️ **IMPORTANTE**: Usa credenciales de **PRODUCCIÓN**, no de prueba.

---

## 🔐 Paso 3: Configurar Webhook Secret

El **Webhook Secret** es CRÍTICO para la seguridad. Sin él, cualquiera puede simular pagos.

### 3.1 ¿Dónde está el Webhook Secret?

Mercado Pago **NO muestra el secret directamente**. Hay 2 formas de obtenerlo:

#### Opción A: Generar tu propio secret (Recomendado)

```bash
# En tu terminal, genera un secret aleatorio
openssl rand -hex 32

# Resultado (ejemplo):
# a7f3c9d2e1b4f8a6c3e5d7f9b2a4c6e8d1f3a5b7c9e2f4a6b8d1c3e5f7a9b2c4
```

Guarda este secret, lo necesitarás en el Paso 5.

#### Opción B: Usar el secret de MP (Avanzado)

Si prefieres usar el secret que genera Mercado Pago:

1. Ve a **Webhooks** en el panel
2. Crea un webhook (Paso 4)
3. MP te mostrará el secret **solo una vez**
4. Guárdalo inmediatamente

---

## 🌐 Paso 4: Configurar Webhook en Mercado Pago

### 4.1 ¿Qué es un Webhook?

Un webhook es una **notificación automática** que Mercado Pago envía a tu servidor cuando ocurre un pago.

```
PAGO EXITOSO → Mercado Pago → 🔔 Webhook → Tu servidor → Extender suscripción
```

### 4.2 Configurar URL del Webhook

1. Ve a [Panel de Webhooks](https://www.mercadopago.com.ar/developers/panel/webhooks)
2. Click en **"Crear webhook"**
3. Completa:

```
URL de producción: https://tudominio.com/api/webhooks/mercadopago

Eventos a notificar:
  ✅ payment          (Pago aprobado/rechazado)
  ✅ subscription     (Suscripción creada/cancelada)
  ❌ plan             (No necesario)
```

4. Click en **"Guardar"**

### 4.3 Probar Webhook (Importante)

Mercado Pago permite enviar un webhook de prueba:

1. En el panel de webhooks, click en **"Probar"**
2. Deberías ver el webhook llegar a tus logs:
   ```
   [Webhook] Mercado Pago recibido: payment
   [PaymentService] MP: Firma validada ✅
   ```

Si NO llega, verifica:
- ✅ El dominio tiene HTTPS (MP no acepta HTTP)
- ✅ El servidor está corriendo
- ✅ El puerto 3000 está abierto (si usas Render/Railway/Heroku es automático)

---

## ⚙️ Paso 5: Configurar Variables de Entorno

Edita tu archivo `.env`:

```env
# === MERCADO PAGO ===
# Public Key (para frontend)
MP_PUBLIC_KEY=APP_USR-abc123456-7890-1234-abcd-ef1234567890

# Access Token (para backend)
MP_ACCESS_TOKEN=APP_USR-1234567890123456-123456-abcdef123456789-123456789

# ⚠️ CRÍTICO: Webhook Secret
# Si usaste Opción A (generaste con openssl):
MP_WEBHOOK_SECRET=a7f3c9d2e1b4f8a6c3e5d7f9b2a4c6e8d1f3a5b7c9e2f4a6b8d1c3e5f7a9b2c4

# Si usaste Opción B (secret de MP):
# MP_WEBHOOK_SECRET=el-secret-que-copiaste-de-mercadopago
```

**Reinicia el servidor** después de cambiar `.env`:

```bash
pm2 restart pianolink
# O si usas node directamente:
# Ctrl+C y luego: node server.js
```

---

## 💰 Paso 6: Crear Link de Pago de Suscripción

### Opción A: Suscripción Automática (Cobro Recurrente)

Para suscripciones que se cobran automáticamente cada mes:

```javascript
// En tu frontend o backend
const preferenceData = {
  auto_recurring: {
    frequency: 1,
    frequency_type: "months",
    transaction_amount: 5000,  // $5000 ARS/mes
    currency_id: "ARS"
  },
  back_urls: {
    success: "https://tudominio.com/pago-exitoso",
    failure: "https://tudominio.com/pago-fallido",
    pending: "https://tudominio.com/pago-pendiente"
  },
  payer: {
    email: "alumno@ejemplo.com",
    name: "Juan Pérez"
  },
  external_reference: `subscription_${userId}_${teacherId}`  // Importante para identificar
};

// Crear preference (servidor)
const response = await fetch('https://api.mercadopago.com/preapproval', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(preferenceData)
});

const preference = await response.json();

// Redirigir al alumno a:
// preference.init_point  (para web)
// preference.sandbox_init_point  (para pruebas)
```

### Opción B: Pago Simple (Cobro Manual Mensual)

Para pagos mensuales que el alumno debe iniciar cada mes:

```javascript
const preferenceData = {
  items: [{
    title: "Suscripción Mensual PianoLink",
    description: "Acceso ilimitado por 30 días",
    quantity: 1,
    unit_price: 5000,
    currency_id: "ARS"
  }],
  back_urls: {
    success: "https://tudominio.com/pago-exitoso",
    failure: "https://tudominio.com/pago-fallido"
  },
  external_reference: `subscription_${userId}_${teacherId}`,
  notification_url: "https://tudominio.com/api/webhooks/mercadopago"
};

const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(preferenceData)
});

const preference = await response.json();
// Redirigir a: preference.init_point
```

---

## 🧪 Paso 7: Probar con Usuario de Prueba

### 7.1 Crear Usuario de Prueba

1. Ve a [Usuarios de Prueba](https://www.mercadopago.com.ar/developers/panel/test-users)
2. Click en **"Crear usuario de prueba"**
3. Crea 2 usuarios:
   - **Vendedor** (tu rol como profesor)
   - **Comprador** (rol del alumno)

### 7.2 Obtener Credenciales de Test

```
Usuario vendedor de prueba:
  Email: TEST1234567@testuser.com
  Password: qatest1234

  Credenciales:
  - Test Public Key
  - Test Access Token
```

### 7.3 Usar en .env (desarrollo)

```env
# Cambiar temporalmente a credenciales de prueba
MP_PUBLIC_KEY=TEST-abc123...
MP_ACCESS_TOKEN=TEST-123456...
```

### 7.4 Datos de Tarjeta de Prueba

Para simular pagos exitosos:

```
Tarjeta: MasterCard
Número: 5031 7557 3453 0604
CVV: 123
Vencimiento: 11/25
Nombre: APRO  (importante, debe ser APRO para aprobar)
DNI: 12345678
```

Otros resultados:

| Nombre | Resultado |
|--------|-----------|
| APRO | Pago aprobado |
| CONT | Pendiente |
| OTHE | Rechazado (fondo insuficientes) |
| CALL | Rechazado (llamar para autorizar) |

---

## ✅ Paso 8: Verificar que Funciona

### 8.1 Flujo Completo de Prueba

1. **Alumno hace pago**:
   - Accede al link de Mercado Pago
   - Completa datos con tarjeta de prueba (APRO)
   - Confirma pago

2. **Mercado Pago notifica** a tu webhook

3. **Tu servidor recibe webhook**:
   ```bash
   # Ver logs en tiempo real
   pm2 logs pianolink --lines 100
   
   # Deberías ver:
   [Webhook] Mercado Pago recibido: payment
   [PaymentService] MP: Firma validada ✅
   [PaymentService] Pago procesado: 123456789, suscripción extendida
   ```

4. **Verificar en base de datos**:
   ```javascript
   // En Mongo Compass o terminal:
   db.subscriptions.find({ studentId: ObjectId("...") })
   
   // Debe mostrar:
   {
     status: "active",
     expiresAt: ISODate("2026-03-05T..."),  // +30 días desde hoy
     lastPaymentAt: ISODate("2026-02-03T...")
   }
   ```

5. **Alumno intenta acceder**:
   - El Gatekeeper permite el acceso
   - Puede entrar 24/7 a la sala

### 8.2 Verificar Logs de Seguridad

```javascript
// Ver webhooks recibidos (incluye inválidos)
db.webhooklogs.find().sort({ createdAt: -1 }).limit(10)

// ⚠️ Si ves muchos con signatureValid: false
// = Posible ataque, revisar IPs
db.webhooklogs.aggregate([
  { $match: { signatureValid: false } },
  { $group: { _id: "$ipAddress", count: { $sum: 1 } } },
  { $sort: { count: -1 } }
])
```

---

## 🚨 Problemas Comunes

### Error: "Webhook signature invalid"

**Causa**: El `MP_WEBHOOK_SECRET` no coincide.

**Solución**:
1. Verifica que copiaste bien el secret
2. Reinicia el servidor después de cambiar `.env`
3. Si usaste Opción A (openssl), asegúrate de configurar el mismo secret en el panel de MP

### Error: "Cannot read property 'id' of undefined"

**Causa**: El formato del webhook cambió o no es un pago.

**Solución**:
```javascript
// Verificar el body del webhook en logs
console.log('[Webhook] Body completo:', JSON.stringify(req.body, null, 2));
```

### Webhook nunca llega

**Causa**: Problemas de red o configuración.

**Solución**:
1. ✅ Verifica que tu dominio tenga HTTPS
2. ✅ Prueba con [https://webhook.site](https://webhook.site) primero
3. ✅ Revisa firewall/nginx si auto-hospedas

### Pagos se duplican

**Causa**: Mercado Pago reintenta webhooks si no respondes 200.

**Solución**:
```javascript
// Ya está implementado en PaymentService.js
const alreadyProcessed = await Payment.alreadyProcessed(paymentId);
if (alreadyProcessed) {
  return { success: true, duplicate: true };
}
```

---

## 📊 Monitorear Pagos

### Panel de Mercado Pago

1. Ve a [https://www.mercadopago.com.ar/activities](https://www.mercadopago.com.ar/activities)
2. Filtra por **"Cobros exitosos"**
3. Verifica que cada pago tiene un `external_reference`

### Tu Base de Datos

```javascript
// Pagos del último mes
db.payments.find({
  createdAt: { $gte: new Date('2026-01-01') },
  status: 'approved'
}).sort({ createdAt: -1 })

// Suscripciones activas
db.subscriptions.countDocuments({ status: 'active' })

// Suscripciones por vencer (5 días)
db.subscriptions.find({
  status: 'active',
  expiresAt: {
    $gte: new Date(),
    $lte: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)
  }
})
```

---

## 🔄 Migrar de Prueba a Producción

Cuando pases de pruebas a producción:

1. **Cambiar credenciales** en `.env`:
   ```env
   # Quitar TEST-, usar las de producción
   MP_PUBLIC_KEY=APP_USR-...  (sin TEST-)
   MP_ACCESS_TOKEN=APP_USR-...  (sin TEST-)
   ```

2. **Actualizar webhook URL** en panel de MP:
   - De: `https://tudominio.com/api/webhooks/mercadopago`
   - A: La misma (si ya estabas en producción)

3. **Probar con tarjeta real** (pequeño monto):
   - Usa tu propia tarjeta
   - Monto mínimo: $100 ARS
   - Verifica que el webhook llega

4. **Activar alumnos reales** ✅

---

## 📚 Recursos Adicionales

- [Documentación Oficial](https://www.mercadopago.com.ar/developers/es/docs)
- [API Reference](https://www.mercadopago.com.ar/developers/es/reference)
- [Webhooks](https://www.mercadopago.com.ar/developers/es/docs/webhooks)
- [Tarjetas de Prueba](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro/additional-content/test-cards)

---

## ✅ Checklist Final

Antes de lanzar:

- [ ] Cuenta de Mercado Pago verificada (DNI/CUIT)
- [ ] Credenciales de producción copiadas
- [ ] Webhook configurado y probado
- [ ] `MP_WEBHOOK_SECRET` configurado correctamente
- [ ] Variables en `.env` de producción
- [ ] Pago de prueba exitoso (tarjeta real)
- [ ] Logs sin errores de firma
- [ ] Suscripción extendida correctamente en DB
- [ ] Alumno puede acceder 24/7 después de pagar

---

**¿Listo?** 🚀 Tu sistema de pagos está configurado.
