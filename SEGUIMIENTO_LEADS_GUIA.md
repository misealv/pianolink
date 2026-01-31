# 🎯 Sistema de Seguimiento de Leads - Guía de Configuración

## 📋 Resumen de Mejoras Implementadas

### ✅ 1. Pixels de Trackeo
- **Facebook Pixel**: Instalado en landing page
- **Google Analytics 4**: Instalado en landing page
- **Eventos trackeados**:
  - `PageView`: Cuando entra a la landing
  - `InitiateCheckout` (FB) / `form_start` (GA): Cuando empieza a llenar formulario
  - `Lead` (FB) / `form_submit` (GA): Cuando completa el formulario

### ✅ 2. Modelo de Lead Mejorado
Nuevos campos agregados:
- `nextFollowUp`: Fecha del próximo seguimiento
- `followUpHistory[]`: Historial de todos los seguimientos realizados
- `demoScheduled`: Información de demo programada
- `trackingData`: Datos de pixels (fbclid, gaClientId, referrer)

### ✅ 3. Sistema de Recordatorios
- Auto-programa primer seguimiento en 2 días después del registro
- Endpoint para ver seguimientos del día
- Endpoint para ver leads atrasados (sin seguimiento en 3+ días)

### ✅ 4. Integración con Google Calendar
- Crea eventos automáticamente
- Genera links de Google Meet
- Envía invitaciones por email
- Recordatorios automáticos

---

## 🔧 PASO 1: Configurar Facebook Pixel

### 1.1 Obtener tu Pixel ID

1. Ve a [Facebook Business Manager](https://business.facebook.com/)
2. Menú → **Eventos** → **Píxeles de datos**
3. Copia tu **Pixel ID** (es un número largo, ej: `1234567890123456`)

### 1.2 Actualizar el Código

Abre `/public/landing.html` y busca estas líneas (alrededor de la línea 20):

```javascript
// Reemplaza 'YOUR_PIXEL_ID' con tu ID real de Facebook Pixel
// fbq('init', 'YOUR_PIXEL_ID');
```

Cambia a:

```javascript
fbq('init', '1234567890123456'); // Tu Pixel ID real
```

También busca en el `<noscript>`:

```html
<img height="1" width="1" style="display:none"
     src="https://www.facebook.com/tr?id=YOUR_PIXEL_ID&ev=PageView&noscript=1"/>
```

Cambia `YOUR_PIXEL_ID` por tu ID real.

---

## 📊 PASO 2: Configurar Google Analytics 4

### 2.1 Crear Propiedad GA4

1. Ve a [Google Analytics](https://analytics.google.com/)
2. Crea una nueva propiedad **GA4**
3. Copia tu **Measurement ID** (formato: `G-XXXXXXXXXX`)

### 2.2 Actualizar el Código

En `/public/landing.html`, busca (alrededor de línea 50):

```javascript
// Reemplaza 'G-XXXXXXXXXX' con tu ID de Google Analytics
// gtag('config', 'G-XXXXXXXXXX');
```

Cambia a:

```javascript
gtag('config', 'G-ABC123XYZ'); // Tu Measurement ID real
```

También busca la función `getGAClientId()` y actualiza el ID:

```javascript
gtag('get', 'G-ABC123XYZ', 'client_id', function(clientId) {
    window.gaClientId = clientId;
});
```

---

## 📅 PASO 3: Configurar Google Calendar API

### 3.1 Crear Proyecto en Google Cloud

1. Ve a [Google Cloud Console](https://console.cloud.google.com/)
2. Crea un nuevo proyecto (ej: "PianoLink Calendar")
3. Habilita **Google Calendar API**:
   - Buscar APIs → Calendar API → Habilitar

### 3.2 Crear Credenciales OAuth 2.0

1. **APIs y servicios** → **Credenciales** → **Crear credenciales**
2. Selecciona **ID de cliente de OAuth 2.0**
3. Tipo de aplicación: **Aplicación web**
4. URIs de redireccionamiento autorizados:
   ```
   http://localhost:3000/api/calendar/oauth2callback
   https://pianolink.onrender.com/api/calendar/oauth2callback
   ```
5. Guarda tu:
   - **Client ID**: `123456789-abc.apps.googleusercontent.com`
   - **Client Secret**: `GOCSPX-xxxxxxxxxxxxx`

### 3.3 Obtener Refresh Token

1. Ejecuta este endpoint en tu navegador (reemplaza con tus datos):
   ```
   http://localhost:3000/api/calendar/auth
   ```

2. Te redirigirá a Google para autorizar
3. Copia el **refresh_token** que aparece en la consola del servidor

### 3.4 Agregar Variables de Entorno

Edita tu archivo `.env`:

```bash
# Google Calendar Integration
GOOGLE_CALENDAR_CLIENT_ID=123456789-abc.apps.googleusercontent.com
GOOGLE_CALENDAR_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxx
GOOGLE_CALENDAR_REDIRECT_URI=https://pianolink.onrender.com/api/calendar/oauth2callback
GOOGLE_CALENDAR_REFRESH_TOKEN=1//xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

## 🚀 PASO 4: Instalar Dependencias

Agrega la dependencia de Google APIs:

```bash
npm install googleapis
```

---

## 📱 PASO 5: Usar el Panel de Admin

### Ver Seguimientos Pendientes

El panel de admin ahora mostrará:
- **🔔 Seguimientos Hoy**: Leads que necesitas contactar hoy
- **⚠️ Leads Atrasados**: Leads sin seguimiento en 3+ días

### Programar un Seguimiento

1. Click en un lead
2. Botón **"Programar Seguimiento"**
3. Selecciona:
   - Acción: Llamada, Email, WhatsApp, Reunión, Nota
   - Notas del seguimiento
   - Resultado: Respondió, No respondió, Interesado, etc.
   - Próximo seguimiento: Fecha y hora

### Programar una Demo

1. Click en un lead
2. Botón **"Programar Demo"**
3. Selecciona fecha y hora
4. Se crea automáticamente:
   - Evento en Google Calendar
   - Link de Google Meet
   - Invitación enviada al lead
   - Recordatorios automáticos

---

## 📊 Endpoints API Disponibles

### Seguimientos

```bash
# Ver seguimientos del día
GET /api/leads/follow-ups/due

# Ver leads atrasados
GET /api/leads/follow-ups/overdue

# Agregar seguimiento
POST /api/leads/:id/follow-up
{
  "action": "call",
  "notes": "Llamé y dejé mensaje",
  "result": "no_answer",
  "nextDate": "2026-02-05T10:00:00Z"
}
```

### Demo

```bash
# Programar demo
POST /api/leads/:id/schedule-demo
{
  "demoDate": "2026-02-10T15:00:00Z",
  "duration": 60
}
```

---

## ✅ Verificar que Funciona

### Test de Pixels

1. Abre la landing page
2. Abre **DevTools** → **Console**
3. Deberías ver:
   ```
   [Tracking] Form started
   ```

4. Completa y envía el formulario
5. Verifica en:
   - **Facebook**: Events Manager → Ver eventos en tiempo real
   - **Google Analytics**: Informes en tiempo real

### Test de Seguimientos

```bash
# Ver seguimientos pendientes
curl http://localhost:3000/api/leads/follow-ups/due

# Debería retornar leads con nextFollowUp = hoy
```

### Test de Calendar

```bash
# Programar demo de prueba
curl -X POST http://localhost:3000/api/leads/ID_DEL_LEAD/schedule-demo \
  -H "Content-Type: application/json" \
  -d '{"demoDate":"2026-02-10T15:00:00Z","duration":60}'

# Verifica en tu Google Calendar que se creó el evento
```

---

## 🎨 Próximos Pasos (Opcional)

### Panel de Seguimiento Visual

Crear una vista en admin.html con:
- 📅 Calendario con demos programadas
- 🔔 Notificaciones de seguimientos pendientes
- 📊 Dashboard con métricas de conversión
- ⏱️ Timer de última actividad por lead

### Automatizaciones

- Enviar WhatsApp automático al programar demo
- Email de seguimiento automático si no responde en X días
- Integración con Zapier para más automatizaciones

---

## 🆘 Solución de Problemas

### Pixels no se activan

- Verifica que los IDs estén correctos (sin espacios)
- Revisa la consola del navegador para errores
- Usa extensiones de navegador: Facebook Pixel Helper, Google Tag Assistant

### Google Calendar no funciona

- Verifica que el **refresh_token** sea correcto
- Asegúrate de que la API esté habilitada en Google Cloud
- Revisa los logs del servidor: `[Calendar] ✅` o `[Calendar] ❌`

### Seguimientos no aparecen

- Verifica que `nextFollowUp` tenga valor en la BD
- Ejecuta: `Lead.getFollowUpsDue()` en consola de MongoDB

---

## 📝 Archivos Modificados/Creados

- ✅ `/models/Lead.js` - Modelo actualizado
- ✅ `/routes/leadRoutes.js` - Nuevos endpoints
- ✅ `/services/CalendarService.js` - Integración Calendar (NUEVO)
- ✅ `/public/landing.html` - Pixels agregados
- ✅ Este archivo de configuración

---

**¿Necesitas ayuda?** Los logs del servidor te guiarán:
- `[Lead] ✅` - Todo bien
- `[Calendar] ⚠️` - Advertencia (funciona sin Calendar)
- `[Tracking]` - Eventos de pixels

¡Tu sistema de seguimiento está listo! 🎉
