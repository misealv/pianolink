# 💳 Configuración de PayPal - PianoLink

Guía completa para configurar pagos recurrentes con PayPal (funciona globalmente).

---

## 📋 Paso 1: Crear Cuenta Business en PayPal

1. Ve a [https://www.paypal.com](https://www.paypal.com)
2. Click en **"Sign Up"** → **"Business Account"**
3. Completa:
   ```
   Tipo de negocio: Individual / Sole Proprietor
   Nombre del negocio: Tu Nombre - Clases de Piano
   Email: tu-email@ejemplo.com
   ```
4. **Verifica tu email** (link de confirmación)
5. **Conecta tu cuenta bancaria** (para recibir pagos)

⚠️ **IMPORTANTE**: PayPal puede pedirte documentación adicional (DNI, comprobante de domicilio).

---

## 🔑 Paso 2: Crear App en PayPal Developer

### 2.1 Acceder al Portal de Desarrolladores

1. Ve a [https://developer.paypal.com/dashboard](https://developer.paypal.com/dashboard)
2. **Inicia sesión** con tu cuenta Business
3. En el menú superior, asegúrate de estar en **"Live"** (no Sandbox)

### 2.2 Crear Aplicación

1. Click en **"Apps & Credentials"**
2. Tab **"Live"** (producción)
3. Click en **"Create App"**

```
App Name: PianoLink Subscriptions
App Type: Merchant
```

### 2.3 Copiar Credenciales

Una vez creada la app, verás:

```
📍 Live API Credentials

Copiar:
- Client ID     → comienza con AX...
- Secret        → comienza con EK... (Click "Show" para ver)
```

⚠️ **NUNCA compartas el Secret** - Es como tu contraseña.

---

## 🔐 Paso 3: Configurar Webhook

### 3.1 ¿Qué es un Webhook de PayPal?

PayPal te notifica cuando:
- ✅ Un pago es completado
- ✅ Una suscripción se activa
- ✅ Una suscripción se cancela
- ❌ Un pago falla

### 3.2 Crear Webhook

1. En el dashboard de tu app, ve a **"Webhooks"**
2. Click en **"Add Webhook"**
3. Completa:

```
Webhook URL: https://tudominio.com/api/webhooks/paypal

Event types (seleccionar):
  ✅ BILLING.SUBSCRIPTION.ACTIVATED
  ✅ BILLING.SUBSCRIPTION.CANCELLED
  ✅ BILLING.SUBSCRIPTION.EXPIRED
  ✅ BILLING.SUBSCRIPTION.SUSPENDED
  ✅ PAYMENT.SALE.COMPLETED
  ✅ PAYMENT.SALE.REFUNDED
```

4. Click en **"Save"**

### 3.3 Copiar Webhook ID

Después de guardar, verás:

```
Webhook ID: WH-1AB2CD3EF4GH5IJ6KL7MN8OP9-QR0
```

**Copia este ID**, lo necesitas para validar webhooks.

---

## 💰 Paso 4: Crear Plan de Suscripción

PayPal requiere que crees un **Plan de Suscripción** antes de cobrar.

### 4.1 Crear Plan via API

Desde tu backend (Node.js), ejecuta esto **una sola vez**:

```javascript
// scripts/createPayPalPlan.js
const fetch = require('node-fetch');
require('dotenv').config();

async function getAccessToken() {
  const auth = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
  ).toString('base64');

  const response = await fetch('https://api-m.paypal.com/v1/oauth2/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });

  const data = await response.json();
  return data.access_token;
}

async function createPlan() {
  const accessToken = await getAccessToken();

  const planData = {
    product_id: 'PROD_PIANOLINK_MONTHLY',  // Crear producto primero (ver 4.2)
    name: 'Suscripción Mensual PianoLink',
    description: 'Acceso ilimitado 24/7 a clases de piano',
    status: 'ACTIVE',
    billing_cycles: [
      {
        frequency: {
          interval_unit: 'MONTH',
          interval_count: 1
        },
        tenure_type: 'REGULAR',
        sequence: 1,
        total_cycles: 0,  // 0 = infinito (hasta que se cancele)
        pricing_scheme: {
          fixed_price: {
            value: '20.00',  // USD$20/mes
            currency_code: 'USD'
          }
        }
      }
    ],
    payment_preferences: {
      auto_bill_outstanding: true,
      setup_fee: {
        value: '0',
        currency_code: 'USD'
      },
      setup_fee_failure_action: 'CONTINUE',
      payment_failure_threshold: 3
    }
  };

  const response = await fetch('https://api-m.paypal.com/v1/billing/plans', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(planData)
  });

  const plan = await response.json();
  console.log('✅ Plan creado:', plan.id);
  console.log('Guarda este ID en .env como PAYPAL_PLAN_ID');
  return plan;
}

createPlan();
```

### 4.2 Crear Producto (Prerequisito)

Antes de crear el plan, necesitas un **Product**:

```javascript
// scripts/createPayPalProduct.js
async function createProduct() {
  const accessToken = await getAccessToken();

  const productData = {
    name: 'Clases de Piano Online',
    description: 'Acceso a sala virtual con MIDI, video y PDFs',
    type: 'SERVICE',
    category: 'EDUCATIONAL_AND_TEXTBOOKS',
    image_url: 'https://tudominio.com/logo.png',
    home_url: 'https://tudominio.com'
  };

  const response = await fetch('https://api-m.paypal.com/v1/catalogs/products', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(productData)
  });

  const product = await response.json();
  console.log('✅ Producto creado:', product.id);
  return product;
}
```

**Orden correcto**:
1. Ejecutar `createPayPalProduct.js` → obtienes `PROD_...`
2. Usar ese ID en `createPayPalPlan.js`
3. Guardar el `PLAN_ID` en `.env`

---

## ⚙️ Paso 5: Configurar Variables de Entorno

Edita tu archivo `.env`:

```env
# === PAYPAL ===
# Client ID (público, se puede usar en frontend)
PAYPAL_CLIENT_ID=AXabcdef123456789GHIJKLMNOPQRSTUVWXYZ

# Client Secret (PRIVADO, solo backend)
PAYPAL_CLIENT_SECRET=EKabcdef123456789ghijklmnopqrstuvwxyz

# Webhook ID (del paso 3.3)
PAYPAL_WEBHOOK_ID=WH-1AB2CD3EF4GH5IJ6KL7MN8OP9-QR0

# Plan ID (del paso 4.1)
PAYPAL_PLAN_ID=P-1AB23CD45EF67GH89IJ0

# Modo: sandbox para pruebas, live para producción
PAYPAL_MODE=live
```

**Reinicia el servidor**:

```bash
pm2 restart pianolink
```

---

## 🔗 Paso 6: Crear Link de Suscripción

### 6.1 Crear Suscripción para un Alumno

Cuando un alumno quiere suscribirse:

```javascript
// Backend endpoint: POST /api/subscription/create-paypal-link
const fetch = require('node-fetch');

async function createSubscriptionLink(studentEmail, teacherId, studentId) {
  // 1. Obtener access token
  const auth = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
  ).toString('base64');

  const tokenResponse = await fetch('https://api-m.paypal.com/v1/oauth2/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });

  const { access_token } = await tokenResponse.json();

  // 2. Crear suscripción
  const subscriptionData = {
    plan_id: process.env.PAYPAL_PLAN_ID,
    subscriber: {
      email_address: studentEmail
    },
    application_context: {
      brand_name: 'PianoLink',
      locale: 'es-AR',
      shipping_preference: 'NO_SHIPPING',
      user_action: 'SUBSCRIBE_NOW',
      return_url: `https://tudominio.com/subscription/success?student=${studentId}&teacher=${teacherId}`,
      cancel_url: 'https://tudominio.com/subscription/cancelled'
    },
    custom_id: `${studentId}_${teacherId}`  // Para identificar en webhooks
  };

  const response = await fetch('https://api-m.paypal.com/v1/billing/subscriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${access_token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(subscriptionData)
  });

  const subscription = await response.json();

  // 3. Obtener link de aprobación
  const approveLink = subscription.links.find(link => link.rel === 'approve').href;

  return {
    subscriptionId: subscription.id,
    approveLink: approveLink
  };
}

// Uso:
const { approveLink } = await createSubscriptionLink(
  'alumno@ejemplo.com',
  teacherId,
  studentId
);

// Enviar este link al alumno por email o mostrarlo en UI
console.log('Link de pago:', approveLink);
```

### 6.2 Flujo del Alumno

1. **Alumno recibe link** (por email o en dashboard)
2. **Click en link** → Redirige a PayPal
3. **Inicia sesión** en su cuenta PayPal
4. **Aprueba suscripción**
5. **Redirect** a tu `return_url`
6. **Webhook llega** a tu servidor → Activa suscripción

---

## 🧪 Paso 7: Probar con Sandbox (Ambiente de Prueba)

### 7.1 Cambiar a Modo Sandbox

1. En el [dashboard](https://developer.paypal.com/dashboard), cambia a **"Sandbox"**
2. Ve a **"Apps & Credentials"** → tab **"Sandbox"**
3. Crea una app de prueba (igual que en Paso 2)
4. Copia las credenciales de **Sandbox**

### 7.2 Actualizar .env Temporalmente

```env
# Para testing
PAYPAL_CLIENT_ID=AXxxxxxxxx_SANDBOX
PAYPAL_CLIENT_SECRET=EKxxxxxxxx_SANDBOX
PAYPAL_MODE=sandbox  # ← Cambiar a sandbox
```

### 7.3 Crear Cuentas de Prueba

1. Ve a **"Sandbox"** → **"Accounts"**
2. PayPal crea automáticamente 2 cuentas:
   - **Business Account** (vendedor)
   - **Personal Account** (comprador)

3. Copiar credenciales de la cuenta Personal:
   ```
   Email: sb-xxxxx@personal.example.com
   Password: xxxxxxxx
   ```

### 7.4 Realizar Pago de Prueba

1. Crea un link de suscripción (modo sandbox)
2. Abre el link en navegador
3. Inicia sesión con la **cuenta Personal de prueba**
4. Aprueba la suscripción
5. Verifica que el webhook llega:

```bash
pm2 logs pianolink --lines 50

# Deberías ver:
[Webhook] PayPal recibido: BILLING.SUBSCRIPTION.ACTIVATED
[PaymentService] PayPal: Firma validada ✅
```

---

## ✅ Paso 8: Verificar que Funciona

### 8.1 Flujo Completo

```
1. Alumno → Click en "Suscribirse con PayPal"
                    ↓
2. Backend crea subscription → Retorna approveLink
                    ↓
3. Alumno redirigido a PayPal → Aprueba suscripción
                    ↓
4. PayPal envía webhook → BILLING.SUBSCRIPTION.ACTIVATED
                    ↓
5. Tu servidor procesa webhook → Guarda en DB
                    ↓
6. Alumno redirigido a return_url → Muestra "¡Suscripción activa!"
                    ↓
7. Gatekeeper permite acceso 24/7
```

### 8.2 Verificar en Base de Datos

```javascript
db.subscriptions.findOne({ 
  studentId: ObjectId("..."),
  paymentProvider: 'paypal'
})

// Debe mostrar:
{
  externalSubscriptionId: "I-XXXXXXXXX",  // ID de PayPal
  status: "active",
  expiresAt: ISODate("2026-03-03T..."),  // +30 días
  lastPaymentAt: ISODate("2026-02-03T...")
}
```

### 8.3 Verificar Webhooks

```javascript
// Ver todos los webhooks de PayPal
db.webhooklogs.find({ 
  provider: 'paypal',
  signatureValid: true 
}).sort({ createdAt: -1 }).limit(10)
```

---

## 🚨 Problemas Comunes

### Error: "Invalid webhook signature"

**Causa**: El `PAYPAL_WEBHOOK_ID` no coincide o cambió.

**Solución**:
1. Ve al dashboard → Webhooks
2. Copia el Webhook ID correcto
3. Actualiza `.env`:
   ```env
   PAYPAL_WEBHOOK_ID=WH-XXXXX
   ```
4. Reinicia servidor

### Error: "INVALID_REQUEST" al crear plan

**Causa**: El `product_id` no existe.

**Solución**:
1. Primero ejecuta `createPayPalProduct.js`
2. Usa el ID retornado en `createPayPalPlan.js`

### Webhook no llega

**Causa**: URL incorrecta o HTTPS faltante.

**Solución**:
1. ✅ Verifica que usas HTTPS (PayPal no acepta HTTP)
2. ✅ Prueba con [webhook.site](https://webhook.site) primero
3. ✅ Revisa que el endpoint esté registrado en dashboard

### Suscripción no se activa

**Causa**: El webhook no se procesó correctamente.

**Solución**:
```bash
# Ver logs detallados
pm2 logs pianolink --lines 200 | grep PayPal

# Buscar errores de validación
db.webhooklogs.find({ 
  provider: 'paypal',
  signatureValid: false 
})
```

---

## 🔄 Cancelar Suscripciones

### Desde el Dashboard (Alumno)

El alumno puede cancelar desde su cuenta PayPal:
1. Inicia sesión en PayPal
2. Settings → Payments → Manage automatic payments
3. Busca "PianoLink"
4. Click "Cancel"

**Tu servidor recibirá** el webhook `BILLING.SUBSCRIPTION.CANCELLED`.

### Desde tu Backend (Profesor)

Si el profesor quiere cancelar la suscripción de un alumno:

```javascript
async function cancelSubscription(paypalSubscriptionId) {
  const accessToken = await getAccessToken();

  const response = await fetch(
    `https://api-m.paypal.com/v1/billing/subscriptions/${paypalSubscriptionId}/cancel`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        reason: 'Solicitado por el profesor'
      })
    }
  );

  if (response.status === 204) {
    console.log('✅ Suscripción cancelada');
    return true;
  }

  throw new Error('Error cancelando suscripción');
}
```

---

## 💳 Tarifas de PayPal

### Comisión por Transacción

**Internacional**:
- 4.4% + $0.30 USD por transacción

**Argentina** (si el alumno es argentino):
- 5.4% + comisión fija

**Ejemplo**:
```
Cobro: $20 USD
Comisión PayPal: $1.18 USD (4.4% + $0.30)
Recibes: $18.82 USD
```

### Conversión de Moneda

Si cobras en USD pero tu cuenta es en ARS:
- PayPal cobra ~3.5% adicional por conversión
- Tasa de cambio: Generalmente 3-5% peor que el oficial

**Recomendación**: Mantén tu cuenta PayPal en USD y retira a banco en Argentina cuando el cambio sea favorable.

---

## 🔄 Migrar de Sandbox a Producción

1. **Obtener credenciales Live** (Paso 2)
2. **Crear productos y planes en Live** (Paso 4)
3. **Configurar webhook Live** (Paso 3)
4. **Actualizar .env**:
   ```env
   PAYPAL_MODE=live
   PAYPAL_CLIENT_ID=AX... (Live)
   PAYPAL_CLIENT_SECRET=EK... (Live)
   PAYPAL_PLAN_ID=P-... (Live)
   PAYPAL_WEBHOOK_ID=WH-... (Live)
   ```
5. **Reiniciar servidor**
6. **Probar con suscripción real** ($1 USD primero)

---

## 📊 Monitorear Pagos

### Panel de PayPal

1. Ve a [https://www.paypal.com/activity](https://www.paypal.com/activity)
2. Filtra por "Subscriptions"
3. Verifica que cada pago tenga `custom_id`

### Reportes

```javascript
// Ingresos del mes (PayPal)
db.payments.aggregate([
  {
    $match: {
      provider: 'paypal',
      status: 'approved',
      createdAt: {
        $gte: new Date('2026-02-01'),
        $lt: new Date('2026-03-01')
      }
    }
  },
  {
    $group: {
      _id: null,
      total: { $sum: '$amount' },
      count: { $sum: 1 }
    }
  }
])

// Resultado:
// { total: 200, count: 10 }  → $200 USD en 10 pagos
```

---

## 🌍 Multi-Moneda

PayPal soporta múltiples monedas. Para aceptar ARS, EUR, etc:

### Crear Plan en ARS

```javascript
const planData = {
  // ... resto del plan
  billing_cycles: [{
    pricing_scheme: {
      fixed_price: {
        value: '5000.00',      // $5000 ARS
        currency_code: 'ARS'   // ← Cambiar moneda
      }
    }
  }]
};
```

**Limitación**: Necesitas un plan separado por moneda.

---

## ✅ Checklist Final

- [ ] Cuenta Business de PayPal verificada
- [ ] App creada en Developer Dashboard
- [ ] Producto creado (`PROD_...`)
- [ ] Plan de suscripción creado (`P-...`)
- [ ] Webhook configurado y probado
- [ ] Variables en `.env` de producción
- [ ] Suscripción de prueba exitosa (sandbox)
- [ ] Suscripción real exitosa ($1 USD)
- [ ] Webhook llega sin errores
- [ ] Alumno puede accesar 24/7 después de pagar
- [ ] Sistema de cancelación funciona

---

## 📚 Recursos Adicionales

- [PayPal Developer](https://developer.paypal.com)
- [Subscriptions API](https://developer.paypal.com/docs/subscriptions/)
- [Webhooks](https://developer.paypal.com/docs/api-basics/notifications/webhooks/)
- [Testing Guide](https://developer.paypal.com/docs/api-basics/sandbox/)

---

**¿Listo?** 🚀 Tu sistema de pagos con PayPal está configurado.

**Tip**: Si tienes alumnos en diferentes países, PayPal es mejor que Mercado Pago porque funciona globalmente.
