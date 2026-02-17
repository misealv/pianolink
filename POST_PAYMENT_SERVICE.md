# PostPaymentService — Servicio Unificado de Post-Pago

## ⚠️ REGLA OBLIGATORIA

**Cada vez que se cree un nuevo checkout o flujo de pago, DEBE usar `PostPaymentService.processSuccessfulPayment()` para la creación de usuario, magic link y email.**

NO duplicar lógica de:
- `User.create()`
- `crypto.randomBytes()` para magic links
- `generateWelcomeKitEmail()` + `EmailService.sendSafe()`

Todo eso ya está centralizado en este servicio.

---

## Ubicación

```
services/PostPaymentService.js
```

## Uso

```javascript
const PostPaymentService = require('../services/PostPaymentService');

const result = await PostPaymentService.processSuccessfulPayment({
    email: 'usuario@ejemplo.cl',
    name: 'Juan Pérez',
    whatsapp: '+56912345678',        // opcional
    country: 'CL',                   // opcional, default: 'CL'
    studentType: 'self',             // 'self' | 'child'
    beneficiaries: [],               // [{name, age}] si studentType === 'child'
    paymentProvider: 'mercadopago',  // 'stripe' | 'paypal' | 'mercadopago'
    paymentId: 'MP-123456',          // ID externo del pago
    amount: 9900,                    // monto pagado
    currency: 'CLP',                // moneda
    kitType: 'welcome_kit_v2',      // tipo de kit
    source: 'early_bird'            // para logs (no afecta schema)
});
```

## Respuesta

```javascript
{
    success: true,
    user: {
        id: '...',
        email: 'usuario@ejemplo.cl',
        name: 'Juan',
        role: 'student' // o 'client' si es apoderado
    },
    isNewUser: true,           // false si el usuario ya existía
    magicLinkUrl: 'https://pianolink.net/acceso/abc123...'  // null si ya existía
}
```

## Qué hace internamente

1. **Busca usuario existente** por email
2. **Si NO existe** → crea User con:
   - Password temporal (`crypto.randomBytes(16)`)
   - Magic link token (`crypto.randomBytes(32)`, expira en 7 días)
   - Role `student` (self) o `client` (guardian con `managedStudents`)
   - `kitPurchased: true`, `mustChangePassword: true`
3. **Si YA existe** → actualiza `kitPurchased` y agrega beneficiarios sin duplicar
4. **Envía email** con template `generateWelcomeKitEmail`:
   - Usuario nuevo: email de bienvenida con magic link
   - Usuario existente: email de confirmación (sin magic link)
5. **Carga datos de admin** desde `GlobalConfig.getAdminProfile()` para el email

## Dónde está integrado (7 checkouts)

| # | Archivo | Flujo | Línea aprox. |
|---|---------|-------|-------------|
| 1 | `routes/webhooks.js` | Webhook Early Bird (MercadoPago) | ~L468 |
| 2 | `routes/earlyBirdCheckout.js` | Verify Early Bird | ~L355 |
| 3 | `services/StripeService.js` | handleKitPurchase (Stripe webhook) | ~L875 |
| 4 | `routes/welcomeKitRoutes.js` | Verify PayPal (Kit V2) | ~L970 |
| 5 | `routes/welcomeKitRoutes.js` | Verify MercadoPago (Kit V2) | ~L1300 |
| 6 | `routes/payment.js` | Legacy verify-kit-payment-stripe | ~L510 |
| 7 | `routes/payment.js` | Legacy verify-kit-payment (PayPal) | ~L580 |

## Parámetros por checkout

| Parámetro | Requerido | Descripción |
|-----------|-----------|-------------|
| `email` | ✅ | Email del comprador |
| `name` | ❌ | Nombre completo (fallback: parte antes del @) |
| `whatsapp` | ❌ | Número WhatsApp |
| `country` | ❌ | Código país ISO (default: `'CL'`) |
| `studentType` | ❌ | `'self'` (default) o `'child'` |
| `beneficiaries` | ❌ | Array de `{name, age}` si es apoderado |
| `paymentProvider` | ❌ | `'stripe'`, `'paypal'`, `'mercadopago'` |
| `paymentId` | ❌ | ID externo del pago |
| `amount` | ❌ | Monto pagado |
| `currency` | ❌ | Moneda (default: `'USD'`) |
| `kitType` | ❌ | Tipo de kit (default: `'welcome_kit_v2'`) |
| `source` | ❌ | Origen para logs |

## Ejemplo: Nuevo checkout con MercadoPago

```javascript
// En tu nuevo endpoint de verificación:
router.post('/verify-mi-nuevo-checkout', async (req, res) => {
    try {
        const { paymentId, email, name } = req.body;

        // 1. Verificar pago con MP
        const mpPayment = await MercadoPagoService.getPayment(paymentId);
        if (mpPayment.status !== 'approved') {
            return res.status(400).json({ success: false, error: 'Pago no aprobado' });
        }

        // 2. Delegar TODO el flujo de usuario al servicio unificado
        const PostPaymentService = require('../services/PostPaymentService');
        const result = await PostPaymentService.processSuccessfulPayment({
            email,
            name,
            paymentProvider: 'mercadopago',
            paymentId: mpPayment.id,
            amount: mpPayment.transaction_amount,
            currency: 'CLP',
            kitType: 'mi_nuevo_producto',
            source: 'mi_nuevo_checkout'
        });

        // 3. Responder
        res.json({
            success: true,
            user: result.user,
            magicLinkUrl: result.magicLinkUrl
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});
```

## Notas técnicas

- El email es **fire-and-forget**: si falla, no bloquea el flujo
- `User.studentData.source` solo acepta `'platform'` o `'invited'` (NO usar `'early_bird'`)
- Magic link expira en 7 días, verificable en `GET /api/password/verify-magic-link/:token`
- Frontend URL se resuelve: `FRONTEND_URL` → `APP_URL` → `'https://pianolink.net'`
- Evita duplicar beneficiarios: compara por nombre (case-insensitive)
