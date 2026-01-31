# 🔧 Guía de Configuración: Google Calendar OAuth2

## ❌ Solución al Error: "Acceso bloqueado: Error de autorización"

Este error ocurre cuando intentas autorizar antes de configurar las credenciales. Sigue estos pasos **en orden**:

---

## 📋 Pasos de Configuración (EN ORDEN)

### **1️⃣ Crear Proyecto en Google Cloud Console**

1. Ve a: https://console.cloud.google.com/
2. Click en el selector de proyectos (arriba a la izquierda)
3. Click en **"Nuevo proyecto"**
4. Nombre: `PianoLink Calendar`
5. Click **"Crear"**

---

### **2️⃣ Habilitar Google Calendar API**

1. En el proyecto creado, ve a: **"APIs y servicios" → "Biblioteca"**
2. Busca: `Google Calendar API`
3. Click en el resultado
4. Click **"Habilitar"**

---

### **3️⃣ Configurar Pantalla de Consentimiento OAuth**

1. Ve a: **"APIs y servicios" → "Pantalla de consentimiento de OAuth"**
2. Selecciona: **"Externo"**
3. Click **"Crear"**
4. Llena el formulario:
   - **Nombre de la aplicación**: `PianoLink`
   - **Correo de asistencia**: Tu email
   - **Correo del desarrollador**: Tu email
5. Click **"Guardar y continuar"**
6. En **"Scopes"**: Click **"Guardar y continuar"** (sin agregar nada)
7. En **"Usuarios de prueba"**: 
   - Click **"+ ADD USERS"**
   - Agrega TU email (el que usarás para las demos)
   - Click **"Guardar"**
8. Click **"Volver al panel"**

---

### **4️⃣ Crear Credenciales OAuth 2.0**

1. Ve a: **"APIs y servicios" → "Credenciales"**
2. Click **"+ CREAR CREDENCIALES"**
3. Selecciona: **"ID de cliente de OAuth 2.0"**
4. Tipo de aplicación: **"Aplicación web"**
5. Nombre: `PianoLink Web Client`
6. **URIs de redirección autorizadas** → Click **"+ Agregar URI"**
   
   **Para desarrollo local:**
   ```
   http://localhost:3000/api/calendar/oauth2callback
   ```
   
   **Para producción (Render):**
   ```
   https://pianolink.onrender.com/api/calendar/oauth2callback
   ```
   
7. Click **"Crear"**
8. **IMPORTANTE**: Copia y guarda:
   - **Client ID** (empieza con números-alfanumericos.apps.googleusercontent.com)
   - **Client Secret** (empieza con GOCSPX-)

---

### **5️⃣ Configurar en Admin Panel**

1. Ve a: `http://localhost:3000/admin.html` (o tu dominio)
2. Login con:
   - Email: `admin@pianolink.com`
   - Password: `adminpassword123`
3. Click en **📅 Calendar**
4. Llena los campos:
   
   **Client ID:**
   ```
   123456789-abcdefgh.apps.googleusercontent.com
   ```
   
   **Client Secret:**
   ```
   GOCSPX-xxxxxxxxxxxxxxxxxxxxxx
   ```
   
   **Redirect URI:**
   - Si estás en local: `http://localhost:3000/api/calendar/oauth2callback`
   - Si estás en Render: `https://pianolink.onrender.com/api/calendar/oauth2callback`
   
5. **NO llenes aún el Refresh Token**
6. Click **💾 Guardar Credenciales**
7. Espera el mensaje: **"✅ Credenciales guardadas correctamente"**

---

### **6️⃣ Obtener Refresh Token (Autorizar)**

Ahora que las credenciales están guardadas, puedes autorizar:

1. **Opción A - Desde Admin Panel:**
   - En el mismo panel Calendar, aparecerá un link azul
   - Click en el link que dice: **"este enlace"**

2. **Opción B - Directo:**
   - Ve a: `http://localhost:3000/api/calendar/auth`
   - O: `https://pianolink.onrender.com/api/calendar/auth`

3. Click en **"Autorizar Google Calendar"**

4. **Selecciona tu cuenta de Google** (la que agregaste como usuario de prueba)

5. Si aparece advertencia "Esta aplicación no está verificada":
   - Click en **"Avanzado"**
   - Click en **"Ir a PianoLink (no seguro)"**

6. **Acepta los permisos**:
   - ✅ Ver, editar, compartir y eliminar de forma permanente los calendarios a los que tienes acceso con Google Calendar

7. Serás redirigido a una página que muestra el **Refresh Token**

8. **Copia el Refresh Token** (empieza con `1//0`)

---

### **7️⃣ Guardar Refresh Token**

1. Regresa a: **Admin Panel → 📅 Calendar**
2. Pega el **Refresh Token** en el campo correspondiente
3. Click **💾 Guardar Credenciales** de nuevo
4. Espera el mensaje: **"✅ Credenciales guardadas correctamente"**

---

### **8️⃣ Probar Conexión**

1. En el mismo panel Calendar
2. Click en **🧪 Probar Conexión**
3. Deberías ver: **"✅ Conexión exitosa - Calendar configurado correctamente"**

---

## ✅ Configuración Completa

Si todo salió bien, verás en los logs del servidor:

```
[Calendar] ✅ Google Calendar configurado correctamente
```

Ahora cuando crees demos de leads, se programarán automáticamente en Google Calendar con links de Google Meet.

---

## 🐛 Troubleshooting

### **Error: "Credenciales no configuradas"**
- Verifica que guardaste Client ID, Client Secret y Redirect URI
- Asegúrate de hacer click en **"Guardar Credenciales"**
- Espera el mensaje de confirmación antes de autorizar

### **Error: "redirect_uri_mismatch"**
- La Redirect URI en Admin Panel **debe coincidir EXACTAMENTE** con la configurada en Google Cloud Console
- Verifica http vs https
- Verifica localhost vs dominio de producción
- No debe tener espacios ni slash final

### **Error: "Access blocked: This app's request is invalid"**
- Verifica que habilitaste Google Calendar API
- Verifica que configuraste la pantalla de consentimiento
- Verifica que agregaste tu email como usuario de prueba

### **Error: "invalid_grant"**
- El refresh token expiró o es inválido
- Repite el paso 6 para obtener un nuevo refresh token

### **La app no está verificada**
- Es normal en desarrollo
- Click en "Avanzado" → "Ir a [App] (no seguro)"
- Solo funcionará con los emails agregados como "Usuarios de prueba"

---

## 📖 Referencias

- **Google Cloud Console**: https://console.cloud.google.com/
- **Documentación OAuth2**: https://developers.google.com/identity/protocols/oauth2
- **Calendar API**: https://developers.google.com/calendar/api

---

## 🎯 Resumen del Flujo

```
1. Crear proyecto en Google Cloud
2. Habilitar Calendar API
3. Configurar pantalla de consentimiento
4. Crear credenciales OAuth2
5. Guardar Client ID + Secret + Redirect URI en Admin Panel
6. Visitar /api/calendar/auth para autorizar
7. Copiar y guardar Refresh Token en Admin Panel
8. ¡Listo!
```

**Orden CRÍTICO**: Primero guarda las credenciales (paso 5), LUEGO autoriza (paso 6).

---

**¡Ahora ya puedes programar demos con Google Meet automáticamente!** 📅✨
