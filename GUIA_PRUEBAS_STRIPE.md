# 🧪 Guía de Pruebas - Membresía con Stripe

## 🎯 Objetivo
Probar el sistema completo de membresía usando tarjetas de prueba de Stripe.

---

## 💳 Tarjetas de Prueba de Stripe

### ✅ **Tarjeta que siempre funciona** (Recomendada)
```
Número:  4242 4242 4242 4242
CVV:     Cualquier 3 dígitos (ej: 123)
Fecha:   Cualquier fecha futura (ej: 12/34)
ZIP:     Cualquier código (ej: 12345)
```

### ⚠️ **Tarjeta que requiere autenticación 3D Secure**
```
Número:  4000 0025 0000 3155
CVV:     123
Fecha:   12/34
ZIP:     12345
```

### ❌ **Tarjeta que siempre falla** (Para probar errores)
```
Número:  4000 0000 0000 9995
CVV:     123
Fecha:   12/34
ZIP:     12345
```

---

## 📋 Proceso de Prueba

### **Paso 1: Acceder como profesor**
1. Ve a https://pianolink.onrender.com/login.html
2. Ingresa con tu cuenta de profesor
3. Entra al Dashboard

### **Paso 2: Verificar estado**
En el panel lateral, verás uno de estos estados:
- 🎁 **Período de prueba** → Necesitas activar
- ✅ **Membresía Activa** → Ya está activada

### **Paso 3: Activar membresía**
1. Haz clic en **"💳 Activar Membresía"**
2. Serás redirigido a Stripe Checkout
3. Ingresa los datos de la tarjeta de prueba:
   - **4242 4242 4242 4242**
   - CVV: **123**
   - Fecha: **12/34**
   - Nombre: Tu nombre
   - Email se auto-completa

### **Paso 4: Completar pago**
1. Haz clic en **"Suscribirse"** en Stripe
2. Espera unos segundos
3. Serás redirigido de vuelta al Dashboard

### **Paso 5: Verificar activación**
Al regresar al Dashboard:
- Verás un mensaje: "✅ Pago completado..."
- La interfaz cambiará a **badge verde compacto**
- El botón de pago **desaparecerá**
- Verás: "Membresía Activa - Renueva: [fecha]"

---

## 🔍 Verificación de Acceso a la Sala

### **Antes de activar:**
- Si intentas entrar a tu sala → **Pantalla de "Membresía Requerida"**

### **Después de activar:**
- Haz clic en "🎹 ABRIR SALA"
- La sala se abre normalmente
- ✅ Puedes empezar a dar clases

---

## 🛠️ Solución de Problemas

### **El pago se completó pero la membresía sigue inactiva**
1. Refresca la página (F5)
2. Si sigue inactivo, contacta al administrador

### **No puedo acceder a mi sala**
1. Verifica que veas el **badge verde** de "Membresía Activa"
2. Si no lo ves, sincroniza manualmente (contactar admin)

### **Recibí un error en Stripe**
- Verifica que usaste la tarjeta correcta: **4242 4242 4242 4242**
- Intenta nuevamente

---

## 📊 Precios de Prueba

- **Profesor Regular**: $20/mes
- **Profesor Fundador**: $10/mes (⭐ precio especial)

*En modo producción estos precios se ajustarán*

---

## 🎓 Profesores Fundadores

Si fuiste marcado como **Profesor Fundador** verás:
- Badge dorado "⭐ PROFESOR FUNDADOR"
- Precio especial: $10/mes (en lugar de $20)
- Acceso prioritario a nuevas funciones

---

## 📞 Soporte

¿Problemas durante la prueba?
- Reporta por el chat de soporte (si eres fundador)
- Contacta al administrador del sistema

---

**✅ El sistema está en modo TEST - No se cobran cargos reales**
