# Integración de Botones de Pago PayPal - Guía

## 📍 3 Puntos de Integración

### 1. Landing Page Kit de Bienvenida
**URL**: `https://pianolink.onrender.com/kit-bienvenida-v2.html`

**Ya está lista y funcional:**
- ✅ Formulario de compra
- ✅ Validación de datos
- ✅ Integración con PayPal
- ✅ Creación automática de usuario
- ✅ Página de éxito

**No requiere cambios**, solo compartir el link.

---

### 2. Panel del Profesor - Botón Membresía Fundador

**Ubicación sugerida:** Dashboard principal del profesor (arriba o sidebar)

**Código HTML/JavaScript:**

```html
<!-- Solo mostrar si el profesor es fundador Y NO tiene suscripción activa -->
<div id="founderSubscriptionButton" style="display: none;">
    <div class="subscription-banner">
        <h3>🌟 Membresía Profesor Fundador</h3>
        <p>Activa tu membresía por solo $10 USD/mes</p>
        <ul>
            <li>Acceso completo a la plataforma</li>
            <li>Salas ilimitadas</li>
            <li>Soporte prioritario</li>
        </ul>
        <button id="btnActivateTeacherSub" class="btn-primary">
            💳 Activar Membresía - $10/mes
        </button>
    </div>
</div>

<script>
// Verificar si el usuario actual es profesor fundador
async function checkFounderStatus() {
    try {
        const token = localStorage.getItem('token'); // O de donde guardes el JWT
        const response = await fetch('/api/teacher/profile', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        
        // Mostrar botón solo si es fundador y no tiene suscripción
        if (data.isFounder && !data.hasActiveSubscription) {
            document.getElementById('founderSubscriptionButton').style.display = 'block';
        }
    } catch (error) {
        console.error('Error:', error);
    }
}

// Manejar click en botón
document.getElementById('btnActivateTeacherSub')?.addEventListener('click', async () => {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/payment/create-teacher-subscription', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (data.success && data.approveLink) {
            // Redirigir a PayPal
            window.location.href = data.approveLink;
        } else {
            alert('Error: ' + (data.error || 'No se pudo crear la suscripción'));
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Error al procesar la solicitud');
    }
});

// Ejecutar al cargar la página
checkFounderStatus();
</script>
```

---

### 3. Panel del Estudiante - Botón Membresía Clases

**Ubicación sugerida:** Dashboard principal del alumno o sección de suscripciones

**Código HTML/JavaScript:**

```html
<!-- Siempre visible para alumnos sin suscripción activa -->
<div id="studentSubscriptionButton">
    <div class="subscription-card">
        <div class="subscription-header">
            <h3>🎹 Membresía Mensual de Clases</h3>
            <div class="price">$100<span>/mes</span></div>
        </div>
        
        <div class="subscription-benefits">
            <h4>¿Qué incluye?</h4>
            <ul>
                <li>✓ 4 sesiones de 45 minutos</li>
                <li>✓ Acceso 24/7 a materiales</li>
                <li>✓ MIDI sincronizado en vivo</li>
                <li>✓ Biblioteca de partituras</li>
                <li>✓ Grabaciones de tus clases</li>
            </ul>
        </div>

        <button id="btnSubscribeStudent" class="btn-subscribe">
            🎵 Suscribirme Ahora
        </button>

        <p class="subscription-note">
            Cancela cuando quieras desde tu cuenta PayPal
        </p>
    </div>
</div>

<style>
.subscription-card {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 30px;
    border-radius: 15px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.2);
    max-width: 400px;
    margin: 20px auto;
}

.subscription-header {
    text-align: center;
    margin-bottom: 20px;
}

.price {
    font-size: 3em;
    font-weight: bold;
    margin: 10px 0;
}

.price span {
    font-size: 0.4em;
    opacity: 0.8;
}

.subscription-benefits {
    background: rgba(255,255,255,0.1);
    padding: 20px;
    border-radius: 10px;
    margin: 20px 0;
}

.subscription-benefits ul {
    list-style: none;
    padding: 0;
}

.subscription-benefits li {
    padding: 8px 0;
    font-size: 1.05em;
}

.btn-subscribe {
    width: 100%;
    padding: 15px;
    background: white;
    color: #667eea;
    border: none;
    border-radius: 8px;
    font-size: 18px;
    font-weight: bold;
    cursor: pointer;
    transition: transform 0.2s;
}

.btn-subscribe:hover {
    transform: translateY(-2px);
}

.subscription-note {
    text-align: center;
    margin-top: 15px;
    opacity: 0.8;
    font-size: 0.9em;
}
</style>

<script>
document.getElementById('btnSubscribeStudent')?.addEventListener('click', async () => {
    try {
        const token = localStorage.getItem('token');
        
        if (!token) {
            alert('Por favor inicia sesión primero');
            window.location.href = '/login';
            return;
        }

        // Mostrar loading
        const btn = document.getElementById('btnSubscribeStudent');
        btn.disabled = true;
        btn.textContent = 'Procesando...';

        const response = await fetch('/api/payment/create-student-subscription', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (data.success && data.approveLink) {
            // Redirigir a PayPal
            window.location.href = data.approveLink;
        } else {
            alert('Error: ' + (data.error || 'No se pudo crear la suscripción'));
            btn.disabled = false;
            btn.textContent = '🎵 Suscribirme Ahora';
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Error al procesar la solicitud');
        btn.disabled = false;
        btn.textContent = '🎵 Suscribirme Ahora';
    }
});
</script>
```

---

## 🔄 Flujo Completo

### Para el Kit de Bienvenida:
1. Usuario visita `/kit-bienvenida-v2.html`
2. Completa formulario (nombre + email)
3. Click en "Pagar con PayPal"
4. Redirige a PayPal
5. Completa pago
6. Vuelve a `/kit-success.html`
7. Se crea su usuario automáticamente
8. Recibe email con password temporal

### Para Suscripciones (Profesor/Alumno):
1. Usuario logueado click en botón
2. Backend genera link de PayPal
3. Redirige a PayPal
4. Aprueba suscripción
5. Vuelve al dashboard con `?subscription=success`
6. Webhook actualiza la DB
7. Usuario tiene acceso completo

---

## ⚠️ Importante

### Marcar un profesor como "fundador":

Desde MongoDB:
```javascript
db.users.updateOne(
    { email: "profesor@ejemplo.com" },
    { $set: { isFounder: true } }
)
```

O crear endpoint admin:
```javascript
// routes/adminRoutes.js
router.post('/mark-founder/:userId', protectAdmin, async (req, res) => {
    try {
        const user = await User.findByIdAndUpdate(
            req.params.userId,
            { isFounder: true },
            { new: true }
        );
        res.json({ success: true, user });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});
```

---

## 💳 Integración Stripe (Nuevo - Febrero 2026)

### Suscripción Profesor con Stripe

**Ventajas sobre PayPal:**
- ✅ Mejor integración con tarjetas de crédito/débito
- ✅ Soporte para más países
- ✅ Portal de facturación automático
- ✅ Webhooks más confiables

**Código HTML/JavaScript:**

```html
<div id="stripeSubscriptionButton">
    <div class="subscription-banner stripe-theme">
        <h3>🎹 Membresía Profesor PianoLink</h3>
        <p id="subscriptionPrice">$20 USD/mes</p>
        <p id="founderDiscount" style="display:none" class="discount-badge">
            🌟 Precio Fundador: $10 USD/mes
        </p>
        
        <div id="subscriptionStatus" class="status-box">
            <!-- Se actualiza dinámicamente -->
        </div>
        
        <button id="btnStripeSubscribe" class="btn-stripe">
            💳 Activar con Tarjeta
        </button>
        
        <button id="btnManageBilling" class="btn-secondary" style="display:none">
            ⚙️ Gestionar Facturación
        </button>
    </div>
</div>

<script>
// ============================================
// INTEGRACIÓN STRIPE - SUSCRIPCIÓN PROFESOR
// ============================================

async function loadStripeSubscriptionStatus() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/payment/stripe/subscription-status', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await response.json();
        
        if (!data.success) {
            console.error('Error:', data.error);
            return;
        }
        
        const { subscription } = data;
        const statusBox = document.getElementById('subscriptionStatus');
        const subscribeBtn = document.getElementById('btnStripeSubscribe');
        const manageBtn = document.getElementById('btnManageBilling');
        const priceEl = document.getElementById('subscriptionPrice');
        const founderDiscount = document.getElementById('founderDiscount');
        
        // Mostrar precio de fundador si aplica
        if (subscription.isFounder) {
            priceEl.style.display = 'none';
            founderDiscount.style.display = 'block';
        }
        
        // Actualizar UI según estado
        switch(subscription.status) {
            case 'active':
                statusBox.innerHTML = `
                    <span class="status-active">✅ Suscripción Activa</span>
                    <p>Válida hasta: ${new Date(subscription.expiresAt).toLocaleDateString()}</p>
                `;
                subscribeBtn.style.display = 'none';
                manageBtn.style.display = 'block';
                break;
                
            case 'past_due':
                statusBox.innerHTML = `
                    <span class="status-warning">⚠️ Pago Pendiente</span>
                    <p>Por favor actualiza tu método de pago</p>
                `;
                manageBtn.style.display = 'block';
                break;
                
            case 'cancelled':
                statusBox.innerHTML = `
                    <span class="status-cancelled">❌ Suscripción Cancelada</span>
                    <p>Reactiva para continuar usando la plataforma</p>
                `;
                subscribeBtn.textContent = '🔄 Reactivar Suscripción';
                break;
                
            case 'trial':
            default:
                statusBox.innerHTML = `
                    <span class="status-trial">🎁 Período de Prueba</span>
                    <p>Activa tu suscripción para acceso completo</p>
                `;
                break;
        }
        
    } catch (error) {
        console.error('Error cargando estado:', error);
    }
}

// Crear checkout de Stripe
document.getElementById('btnStripeSubscribe')?.addEventListener('click', async () => {
    try {
        const btn = document.getElementById('btnStripeSubscribe');
        btn.disabled = true;
        btn.textContent = '⏳ Procesando...';
        
        const token = localStorage.getItem('token');
        const response = await fetch('/api/payment/stripe/teacher-subscription', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (data.success && data.checkoutUrl) {
            // Redirigir a Stripe Checkout
            window.location.href = data.checkoutUrl;
        } else {
            alert('Error: ' + (data.error || 'No se pudo crear el checkout'));
            btn.disabled = false;
            btn.textContent = '💳 Activar con Tarjeta';
        }
        
    } catch (error) {
        console.error('Error:', error);
        alert('Error al procesar la solicitud');
        btn.disabled = false;
        btn.textContent = '💳 Activar con Tarjeta';
    }
});

// Abrir portal de facturación
document.getElementById('btnManageBilling')?.addEventListener('click', async () => {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/payment/stripe/customer-portal', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await response.json();
        
        if (data.success && data.portalUrl) {
            window.location.href = data.portalUrl;
        } else {
            alert('Error: ' + (data.error || 'No se pudo abrir el portal'));
        }
        
    } catch (error) {
        console.error('Error:', error);
        alert('Error al abrir el portal');
    }
});

// Cargar estado al iniciar
loadStripeSubscriptionStatus();

// Verificar si regresa de Stripe con éxito
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('subscription') === 'success') {
    alert('🎉 ¡Suscripción activada exitosamente!');
    // Limpiar URL
    window.history.replaceState({}, document.title, window.location.pathname);
    // Recargar estado
    loadStripeSubscriptionStatus();
}
</script>

<style>
.stripe-theme {
    background: linear-gradient(135deg, #6772e5 0%, #4f46e5 100%);
    color: white;
    padding: 25px;
    border-radius: 12px;
    max-width: 400px;
}

.btn-stripe {
    width: 100%;
    padding: 14px;
    background: white;
    color: #6772e5;
    border: none;
    border-radius: 8px;
    font-size: 16px;
    font-weight: bold;
    cursor: pointer;
    margin-top: 15px;
}

.btn-stripe:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
}

.btn-secondary {
    width: 100%;
    padding: 12px;
    background: transparent;
    color: white;
    border: 2px solid white;
    border-radius: 8px;
    font-size: 14px;
    cursor: pointer;
    margin-top: 10px;
}

.status-box {
    background: rgba(255,255,255,0.1);
    padding: 15px;
    border-radius: 8px;
    margin: 15px 0;
    text-align: center;
}

.status-active { color: #34d399; font-weight: bold; }
.status-warning { color: #fbbf24; font-weight: bold; }
.status-cancelled { color: #f87171; font-weight: bold; }
.status-trial { color: #60a5fa; font-weight: bold; }

.discount-badge {
    background: #10b981;
    padding: 8px 15px;
    border-radius: 20px;
    display: inline-block;
    font-weight: bold;
}
</style>
```

### Endpoints de Stripe Disponibles

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/payment/stripe/teacher-subscription` | POST | Crear checkout de suscripción |
| `/api/payment/stripe/subscription-status` | GET | Ver estado actual |
| `/api/payment/stripe/customer-portal` | GET | URL del portal de facturación |
| `/api/payment/stripe/cancel-subscription` | POST | Cancelar suscripción |
| `/api/webhooks/stripe` | POST | Webhook (automático) |

### Variables de Entorno Requeridas

```env
# Stripe
STRIPE_SECRET_KEY=sk_live_xxx      # o sk_test_xxx para pruebas
STRIPE_WEBHOOK_SECRET=whsec_xxx    # Del dashboard de Stripe
STRIPE_PUBLISHABLE_KEY=pk_live_xxx # Para frontend (opcional)
```

### Configurar Webhook en Stripe Dashboard

1. Ir a: https://dashboard.stripe.com/webhooks
2. Click "Add endpoint"
3. URL: `https://tu-dominio.com/api/webhooks/stripe`
4. Eventos a escuchar:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.paid`
   - `invoice.payment_failed`

---

## 🧪 Probar

### Kit de Bienvenida:
1. Ir a: `https://pianolink.onrender.com/kit-bienvenida-v2.html`
2. Completar formulario
3. Pagar con PayPal de prueba o real

### Suscripción Profesor:
1. Loguear como profesor
2. Marcar como fundador en DB
3. Recargar dashboard
4. Click en botón de membresía

### Suscripción Alumno:
1. Loguear como alumno
2. Ver dashboard
3. Click en botón de suscripción

---

## 📊 Verificar Pagos

### En MongoDB:
```javascript
// Ver usuarios con kit comprado
db.users.find({ kitPurchased: true })

// Ver usuarios fundadores
db.users.find({ isFounder: true })

// Ver webhooks de PayPal
db.webhooklogs.find({ provider: 'paypal' }).sort({ createdAt: -1 })

// Ver suscripciones activas
db.subscriptions.find({ status: 'active', paymentProvider: 'paypal' })
```

---

## 📝 Próximos Pasos

1. Integrar los botones en los paneles existentes
2. Probar flujo completo con cuenta real
3. Configurar emails de bienvenida
4. Agregar página de gestión de suscripciones (cancelar, ver historial)
5. Dashboard admin para ver métricas de pagos
