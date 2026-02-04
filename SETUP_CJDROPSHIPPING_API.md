# 🔑 Configuración de CJDropshipping API - Guía Completa

## 📋 Paso 1: Crear Cuenta en CJDropshipping

1. Ve a: **https://www.cjdropshipping.com/**
2. Click en **"Sign Up"** (arriba derecha)
3. Completa el registro:
   - Email
   - Password
   - Información de negocio (opcional al inicio)
4. Verifica tu email

---

## 🔐 Paso 2: Obtener tu API Key (Token)

### Opción A: API v2.0 (Recomendado - Usado en PianoLink)

1. **Ingresa a tu cuenta**: https://www.cjdropshipping.com/
2. **Ve al Dashboard**: Click en tu nombre de usuario (arriba derecha)
3. **Ir a Settings**:
   - Click en **"Settings"** o **"Account"**
   - Busca la sección **"API Management"** o **"Developer Center"**
4. **Acceder a la API**:
   - URL directa: **https://www.cjdropshipping.com/user/setting/apikey**
   - O navega: Dashboard → Settings → API Key
5. **Crear API Key**:
   - Click en **"Create API Key"** o **"Generate Token"**
   - Nombre: `PianoLink Production` (o el que prefieras)
   - **Guarda el token** - solo se muestra una vez!

### Opción B: Portal de Desarrolladores

1. Ve a: **https://developers.cjdropshipping.com/**
2. Click en **"Get API Key"** o **"Register"**
3. Inicia sesión con tu cuenta de CJDropshipping
4. En el portal de desarrolladores:
   - Ve a **"My Apps"** o **"API Keys"**
   - Click **"Create Application"**
   - Completa el formulario:
     - App Name: `PianoLink`
     - Description: `E-commerce integration for MIDI cable fulfillment`
     - Callback URL: `https://tudominio.com/api/webhooks/cj` (opcional)
5. **Copia tu API Key** - se muestra después de crear la aplicación

---

## 🌐 URLs Importantes

| Recurso | URL |
|---------|-----|
| **Sitio Principal** | https://www.cjdropshipping.com/ |
| **Dashboard** | https://www.cjdropshipping.com/dashboard |
| **API Keys** | https://www.cjdropshipping.com/user/setting/apikey |
| **Portal Desarrolladores** | https://developers.cjdropshipping.com/ |
| **Documentación API v2.0** | https://developers.cjdropshipping.com/en/api/api2/api/shopping.html |
| **Centro de Ayuda** | https://www.cjdropshipping.com/help-center |

---

## ⚙️ Paso 3: Configurar en PianoLink

### 3.1. Agregar API Key al archivo `.env`

```bash
# Abrir o crear el archivo .env en la raíz del proyecto
nano .env

# Agregar esta línea (reemplaza con tu token real)
CJ_API_KEY=tu_token_de_cjdropshipping_aqui

# Guardar y salir (Ctrl+X, luego Y, luego Enter)
```

**Ejemplo**:
```env
CJ_API_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijk
```

### 3.2. Reiniciar el servidor

```bash
# Si estás usando PM2
pm2 restart server

# O si lo ejecutas directamente
pkill -f "node server.js"
node server.js
```

### 3.3. Verificar la conexión desde el Admin Panel

1. Ve a: **http://localhost:3000/admin** (o tu dominio)
2. Inicia sesión como admin
3. Ve a la pestaña **"Welcome Kits"**
4. Busca la sección **"CJDropshipping"**
5. Verifica:
   - ✅ **API Key Preview**: Debe mostrar los primeros y últimos caracteres
   - ✅ **Balance**: Debe mostrar tu balance en USD
   - ✅ Click en **"Test Connection"** - debe mostrar éxito

---

## 🛠️ Paso 4: Configurar SKUs de Productos

Una vez conectado, necesitas configurar los SKUs de tus cables MIDI en CJDropshipping:

### 4.1. Buscar Productos en CJDropshipping

1. Ve a: https://www.cjdropshipping.com/product-search.html
2. Busca por categoría: **"MIDI Cable"**, **"USB Cable"**, etc.
3. Ejemplos de búsqueda:
   - `USB to MIDI cable`
   - `USB-B to USB-A cable`
   - `MIDI 5-pin cable`
   - `Micro USB cable`

### 4.2. Agregar Productos a tu Lista

1. Encuentra el producto que necesitas
2. Click en **"Add to My List"** o **"Add to Sourcing"**
3. Anota el **SKU** del producto (ejemplo: `CJMIDI001`)

### 4.3. Configurar SKUs en el Admin Panel

1. En el Admin Panel: **Welcome Kits → CJDropshipping**
2. Sección **"SKUs de Cables MIDI"**:
   ```
   USB-B (Yamaha, Roland): CJMIDI001
   MIDI 5-pin (Pianos clásicos): CJMIDI002
   Micro USB (Teclados portátiles): CJMIDI003
   USB-C (Teclados modernos): CJMIDI004
   ```
3. Click **"💾 Guardar Configuración"**

---

## 💰 Paso 5: Configurar Precios Dinámicos

1. En el Admin Panel: **Welcome Kits → CJDropshipping**
2. Sección **"💰 Precios Dinámicos"**:
   - ✅ **Activar** el toggle "Calcular precios desde CJ"
   - Configurar **precios fijos** de servicios:
     - Sesión de Setup: `$15`
     - Clase de Prueba: `$10`
   - Configurar **márgenes de ganancia** por categoría:
     - Cables: `40%`
     - Teclados: `25%`
     - Soportes: `35%`
     - Pedales: `40%`
     - Accesorios: `35%`
     - Bundles: `20%`
3. Click **"💾 Guardar Configuración"**

---

## 🧪 Paso 6: Probar el Sistema

### Prueba 1: Verificar Precios Dinámicos
```bash
# Obtener precio del kit para Chile con cable USB-B
curl "http://localhost:3000/api/welcome-kit/pricing?country=CL&cableType=USB_B" | jq
```

**Respuesta esperada**:
```json
{
  "success": true,
  "mode": "dynamic",
  "pricing": {
    "baseKit": 25,
    "cable": {
      "sku": "CJMIDI001",
      "price": 12.50,
      "cost": 8.00,
      "shipping": 2.50
    },
    "total": 37.50
  }
}
```

### Prueba 2: Crear Orden de Prueba

1. Ve a: **http://localhost:3000/kit**
2. Completa el formulario:
   - Nombre: `Test User`
   - Email: `test@example.com`
   - País: Chile
   - Tipo de cable: USB-B
3. Click **"Pagar con PayPal"** (modo sandbox si está configurado)
4. Verifica en el Admin Panel → Orders que se creó la orden en CJ

---

## 🚨 Solución de Problemas

### Error: "CJ_API_KEY no configurada"
✅ **Solución**: Verifica que el archivo `.env` tenga la variable `CJ_API_KEY`
```bash
cat .env | grep CJ_API_KEY
```

### Error: "Invalid API Key" o "Unauthorized"
✅ **Solución**:
- Verifica que copiaste el token completo (sin espacios)
- Regenera el token en CJDropshipping si es necesario
- Asegúrate de estar usando la API v2.0

### Error: "Token expired"
✅ **Solución**: El sistema refresca automáticamente el token. Si persiste:
```bash
# Reiniciar el servidor
pm2 restart server
```

### Error: "Product not found" al calcular precios
✅ **Solución**:
- Verifica que el SKU esté correcto en Admin → CJDropshipping
- Busca el producto en https://www.cjdropshipping.com/
- Asegúrate de que el producto esté en tu lista de CJ

### Balance muestra $0.00
✅ **Solución**:
- Recarga saldo en CJDropshipping.com
- Mínimo recomendado: $50 USD para empezar

---

## 📚 Recursos Adicionales

### Documentación Oficial
- **API Reference**: https://developers.cjdropshipping.com/en/api/api2/api/shopping.html
- **Guía de Inicio**: https://www.cjdropshipping.com/help-center/article/getting-started
- **FAQs**: https://www.cjdropshipping.com/help-center/faq

### Endpoints de la API Usados en PianoLink

| Endpoint | Uso |
|----------|-----|
| `/authentication/getAccessToken` | Obtener token JWT |
| `/authentication/refreshAccessToken` | Refrescar token |
| `/shopping/order/createOrder` | Crear orden de envío |
| `/shopping/order/getOrderDetail` | Obtener detalles de orden |
| `/shopping/product/list` | Listar productos |
| `/shopping/freightCalculate` | Calcular costo de envío |
| `/shopping/account/queryBalance` | Consultar balance |

### Soporte
- **Email CJDropshipping**: support@cjdropshipping.com
- **Chat en vivo**: Disponible en el dashboard
- **Telegram**: https://t.me/CJDropshipping_Official

---

## ✅ Checklist Final

- [ ] Cuenta creada en CJDropshipping
- [ ] API Key generada y guardada
- [ ] `CJ_API_KEY` agregada al archivo `.env`
- [ ] Servidor reiniciado
- [ ] Conexión verificada en Admin Panel (balance visible)
- [ ] SKUs de cables configurados
- [ ] Márgenes de precio configurados
- [ ] Prueba de precio dinámico exitosa
- [ ] Saldo recargado en CJDropshipping ($50+ recomendado)

---

## 🎯 Próximos Pasos

1. **Agregar productos opcionales** (teclados, soportes, pedales):
   - Admin → Welcome Kits → Productos
   - Click "➕ Agregar Producto"

2. **Configurar webhooks** (opcional - para tracking automático):
   - En CJDropshipping: Settings → Webhooks
   - URL: `https://tudominio.com/api/webhooks/cj`

3. **Personalizar márgenes** según tu estrategia de precios

4. **Monitorear órdenes** en Admin → Welcome Kits → Orders

---

**¿Necesitas ayuda?** Revisa los logs del servidor:
```bash
# Ver logs en tiempo real
tail -f logs/server.log

# Buscar errores de CJ
grep -i "CJDropshipping" logs/server.log
```
