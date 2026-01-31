# 📊 Guía de Configuración: Tracking Pixels Dinámico

## ✅ Sistema Implementado

Ya no necesitas editar manualmente `landing.html` para configurar tus píxeles de tracking. Todo se gestiona desde el **Panel de Admin** y se almacena en la base de datos.

---

## 🎯 ¿Cómo funciona?

1. **Panel de Admin** → Sección "📊 Tracking"
2. Pegas el código completo de Facebook Pixel y Google Analytics
3. Los scripts se guardan en MongoDB
4. `landing.html` los carga automáticamente desde `/tracking-scripts.js`

---

## 📋 PASO A PASO

### 1️⃣ Acceder al Panel de Admin

```
http://localhost:3000/admin.html
```

Inicia sesión con tu cuenta de administrador.

---

### 2️⃣ Ir a la Sección de Tracking

En la barra de navegación superior, haz clic en:

```
📊 Tracking
```

---

### 3️⃣ Configurar Facebook Pixel

#### ¿Dónde conseguir el código?

1. Ve a **Facebook Business Manager**: https://business.facebook.com
2. Menú → **Configuración de eventos de datos** → **Píxeles**
3. Selecciona tu píxel o crea uno nuevo
4. Haz clic en **"Configurar"** → **"Instalar código manualmente"**
5. Copia todo el código que aparece (debe verse así):

```html
<!-- Facebook Pixel Code -->
<script>
  !function(f,b,e,v,n,t,s)
  {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
  n.callMethod.apply(n,arguments):n.queue.push(arguments)};
  if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
  n.queue=[];t=b.createElement(e);t.async=!0;
  t.src=v;s=b.getElementsByTagName(e)[0];
  s.parentNode.insertBefore(t,s)}(window, document,'script',
  'https://connect.facebook.net/en_US/fbevents.js');
  fbq('init', '123456789012345'); // ← Tu ID aquí
  fbq('track', 'PageView');
</script>
<noscript>
  <img height="1" width="1" style="display:none"
       src="https://www.facebook.com/tr?id=123456789012345&ev=PageView&noscript=1"/>
</noscript>
<!-- End Facebook Pixel Code -->
```

6. **Pega el código completo** en el primer campo de texto (Facebook Pixel)

---

### 4️⃣ Configurar Google Analytics 4

#### ¿Dónde conseguir el código?

1. Ve a **Google Analytics**: https://analytics.google.com
2. **Admin** → **Flujos de datos** → Selecciona tu flujo web
3. Haz clic en **"Ver instrucciones de etiquetas"**
4. Selecciona **"Instalar manualmente"**
5. Copia todo el código (debe verse así):

```html
<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-XXXXXXXXXX'); // ← Tu Measurement ID aquí
</script>
```

6. **Pega el código completo** en el segundo campo de texto (Google Analytics 4)

---

### 5️⃣ Guardar y Activar

1. Haz clic en **"💾 Guardar Scripts"**
2. Verás un mensaje de confirmación: **"✅ Scripts guardados correctamente"**
3. Los scripts están activos inmediatamente, **no necesitas reiniciar el servidor**

---

## ✅ Verificación

### Probar Facebook Pixel

1. Abre la landing page: `http://localhost:3000/landing.html`
2. Abre las **DevTools** (F12) → **Consola**
3. Escribe: `fbq`
4. Si está configurado, verás una función definida
5. Ve a Facebook Business Manager → **Píxeles** → **Probar eventos**
6. Deberías ver actividad en tiempo real

### Probar Google Analytics

1. En la landing page, abre DevTools → **Network** (Red)
2. Filtra por: `gtag`
3. Deberías ver peticiones a `www.googletagmanager.com`
4. Ve a Google Analytics → **Informes** → **Tiempo real**
5. Deberías verte como usuario activo

---

## 🔧 Eventos Rastreados Automáticamente

El sistema rastrea estos eventos sin configuración adicional:

### Facebook Pixel
- ✅ `PageView` - Cada vez que alguien visita la landing
- ✅ `InitiateCheckout` - Cuando un lead empieza a llenar el formulario
- ✅ `Lead` - Cuando un lead completa el formulario

### Google Analytics 4
- ✅ `page_view` - Visitas a la página
- ✅ `form_start` - Inicio de formulario
- ✅ `form_submit` - Envío de formulario

---

## 📊 Dashboard de Métricas

### Facebook Pixel

Ve a Facebook Business Manager → **Píxeles** → **Información general**

Métricas clave:
- **Visitantes únicos**: Personas que vieron tu landing
- **Eventos de Lead**: Cuántos formularios completados
- **Tasa de conversión**: % de visitantes que se convierten en leads

### Google Analytics 4

Ve a Google Analytics → **Informes** → **Adquisición** → **Todo el tráfico**

Métricas clave:
- **Usuarios**: Total de visitantes únicos
- **Sesiones**: Número de visitas
- **Tasa de rebote**: % de visitantes que se van sin interactuar
- **Conversiones**: Formularios completados (configurar como conversión en GA4)

---

## 🔄 Actualizar Scripts

Si necesitas cambiar tu ID de píxel o actualizar el código:

1. Ve a **Admin** → **📊 Tracking**
2. Haz clic en **"🔄 Recargar"** para ver los scripts actuales
3. Modifica lo que necesites
4. Haz clic en **"💾 Guardar Scripts"**
5. Los cambios se aplican inmediatamente

---

## 🚨 Solución de Problemas

### Los scripts no se cargan

1. Verifica que guardaste correctamente en el panel de admin
2. Abre: `http://localhost:3000/tracking-scripts.js` en tu navegador
3. Deberías ver tus scripts allí
4. Si ves solo un comentario de error, vuelve a pegar los scripts en admin

### Facebook Pixel no funciona

- Verifica que tu ID de píxel esté en el código: `fbq('init', 'TU_ID_AQUI');`
- Usa la extensión **Facebook Pixel Helper** de Chrome para debuggear
- Ve a Facebook Business Manager → Píxeles → **Probar eventos**

### Google Analytics no rastrea

- Verifica que tu Measurement ID esté en el código: `gtag('config', 'G-XXXXXXXXXX');`
- Usa la extensión **Google Analytics Debugger** de Chrome
- Revisa en GA4 → **Admin** → **Flujos de datos** que la URL coincida

---

## 🎉 Ventajas del Sistema

✅ **Sin edición manual de archivos** - Todo desde el panel de admin
✅ **Actualización instantánea** - No requiere redeploy
✅ **Centralizado** - Un solo lugar para gestionar todos los píxeles
✅ **Persistente** - Se guarda en MongoDB, no se pierde
✅ **Multi-ambiente** - Funciona en local, staging y producción

---

## 📚 Recursos Adicionales

- [Facebook Pixel - Guía oficial](https://www.facebook.com/business/help/952192354843755)
- [Google Analytics 4 - Documentación](https://support.google.com/analytics/answer/9304153)
- [Configurar conversiones en GA4](https://support.google.com/analytics/answer/9267568)

---

## 🔐 Seguridad

Los scripts se almacenan en MongoDB y se sirven dinámicamente. Solo administradores con acceso al panel de admin pueden modificarlos.

**Nota**: Ten cuidado de no pegar código malicioso. Solo usa códigos oficiales de Facebook y Google.

---

## 🎯 Próximos Pasos Recomendados

1. **Configurar Facebook Pixel** - Para tracking de conversiones en ads
2. **Configurar Google Analytics 4** - Para analítica completa del sitio
3. **Crear audiencias personalizadas** en Facebook con los datos del píxel
4. **Configurar conversiones** en GA4 para medir el embudo completo
5. **Instalar extensiones de Chrome** para debuggear píxeles en tiempo real

---

¿Necesitas ayuda? Revisa los logs del servidor en la terminal o contacta con soporte técnico.
