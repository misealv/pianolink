# 📅 Guía: Cómo Crear Demos en PianoLink

## 🎯 ¿Qué es una Demo?

Una **demo** es una clase de prueba programada con un profesor fundador interesado (lead) para mostrarle la plataforma PianoLink en acción.

Cuando creas una demo, el sistema:
- ✅ Crea automáticamente un evento en Google Calendar
- ✅ Genera un link de Google Meet para la videollamada
- ✅ Envía invitación automática por email al lead
- ✅ Registra la demo en el sistema de seguimiento

---

## 📋 Cómo Crear una Demo

### **Método 1: Desde el Panel de Admin (Recomendado)**

1. **Accede al Admin Panel**
   ```
   http://localhost:3000/admin.html
   https://pianolink.onrender.com/admin.html
   ```
   
   - Email: `admin@pianolink.com`
   - Password: `adminpassword123`

2. **Ve a la sección de Leads**
   - Click en el botón **🎯 Leads** en la navegación superior

3. **Encuentra el lead que quieres agendar**
   - Usa el buscador para filtrar por nombre, email o teléfono
   - O usa los filtros de estado (Nuevos, Contactados, Calificados, etc.)

4. **Click en el botón 📅 (Agendar Demo)**
   - Es el segundo botón en la columna de **Acciones**
   - Se abrirá un modal con el formulario de demo

5. **Completa los datos de la demo**
   
   **Fecha y hora:**
   - Selecciona el día y hora para la demo
   - El sistema no permite fechas pasadas
   - Por defecto sugiere mañana a las 10:00 AM
   
   **Duración:**
   - 30 minutos
   - 45 minutos
   - **60 minutos (recomendado)** ← seleccionado por defecto
   - 90 minutos

6. **Click en "📅 Agendar Demo"**
   
   El sistema mostrará:
   - ⏳ "Creando demo en Google Calendar..."
   - ✅ "Demo agendada correctamente"
   - 📹 Link de Google Meet (si Calendar está configurado)

7. **¡Listo!**
   - El lead recibirá un email con la invitación
   - Verás el evento en tu Google Calendar
   - La demo quedará registrada en el sistema

---

## 🔍 Ejemplo Visual

```
┌─────────────────────────────────────────────────┐
│ 📅 Agendar Demo                            × │
├─────────────────────────────────────────────────┤
│ Lead:                                           │
│ ┌─────────────────────────────────────────────┐ │
│ │ Miguel Ramírez                              │ │
│ └─────────────────────────────────────────────┘ │
│                                                 │
│ Email:                                          │
│ ┌─────────────────────────────────────────────┐ │
│ │ miguel@example.com                          │ │
│ └─────────────────────────────────────────────┘ │
│                                                 │
│ Fecha y hora de la demo:                       │
│ ┌─────────────────────────────────────────────┐ │
│ │ 2026-02-01  10:00                           │ │
│ └─────────────────────────────────────────────┘ │
│                                                 │
│ Duración (minutos):                            │
│ ┌─────────────────────────────────────────────┐ │
│ │ 60 minutos (1 hora)              ▼         │ │
│ └─────────────────────────────────────────────┘ │
│                                                 │
│ ℹ️ Se creará un evento en Google Calendar      │
│   con link de Google Meet y se enviará         │
│   invitación automática al lead.               │
│                                                 │
│              [Cancelar]  [📅 Agendar Demo]     │
└─────────────────────────────────────────────────┘
```

---

## ✅ Checklist Pre-Demo

Antes de agendar una demo, asegúrate de:

- [x] **Google Calendar configurado** (ver [GOOGLE_CALENDAR_SETUP.md](GOOGLE_CALENDAR_SETUP.md))
- [x] Lead tiene **email válido**
- [x] Lead está **calificado** (no agendar con leads no calificados)
- [x] Fecha/hora **coordinada previamente** con el lead (vía WhatsApp/Email)
- [x] Tienes disponibilidad en ese horario

---

## 🔔 ¿Qué pasa después de crear la demo?

### **En el momento de agendar:**
1. Se crea evento en Google Calendar del admin
2. Se genera link de Google Meet automáticamente
3. Se envía invitación por email a:
   - El lead (email del lead)
   - El admin/profesor (cuenta configurada en Calendar)
4. Se actualiza el registro del lead en la base de datos

### **El lead recibe:**
- ✉️ Email de Google Calendar con:
  - Título: "Demo Piano Link - [Nombre del Lead]"
  - Fecha y hora
  - Link de Google Meet
  - Descripción con sus datos de contacto
  - Botones: "Aceptar", "Rechazar", "Tentativo"

### **Tú recibes:**
- ✉️ Email de Google Calendar (como organizador)
- 📅 Evento visible en tu Google Calendar
- 🔔 Recordatorios:
  - 1 día antes (email)
  - 30 minutos antes (popup)

---

## 📊 Ver Demos Programadas

### **En Google Calendar**
- Ve a https://calendar.google.com
- Busca eventos con título "Demo Piano Link"
- Verás todos los demos agendados

### **En el Admin Panel**
- Sección **Leads** → Ver notas del lead
- Ahí quedará registrada la fecha de la demo

---

## 🛠️ Troubleshooting

### **No aparece el botón 📅**
- Refresca la página (Ctrl+R o Cmd+R)
- Verifica que estás en la sección "Leads"

### **Error: "Credenciales no configuradas"**
- Google Calendar no está configurado
- Sigue la guía: [GOOGLE_CALENDAR_SETUP.md](GOOGLE_CALENDAR_SETUP.md)
- La demo se guardará pero **no se creará el evento en Calendar**

### **El lead no recibe la invitación**
- Verifica que el email del lead sea correcto
- Revisa la carpeta de spam del lead
- Verifica que Google Calendar esté configurado correctamente

### **No se genera link de Google Meet**
- Verifica que en Google Cloud Console esté habilitado "Google Calendar API"
- Verifica que el refresh token sea válido
- Intenta crear una demo de prueba

### **Error: "La fecha debe ser futura"**
- No puedes agendar demos en fechas pasadas
- Selecciona una fecha y hora futura

---

## 📱 Workflow Recomendado

```
1. Lead llena formulario en landing
   ↓
2. Lead aparece en panel de admin (estado: "Nuevo")
   ↓
3. Admin contacta al lead por WhatsApp
   ↓
4. Admin actualiza estado a "Contactado"
   ↓
5. Si el lead está interesado → cambiar a "Calificado"
   ↓
6. Coordinar fecha/hora con el lead
   ↓
7. Agendar demo con botón 📅
   ↓
8. Demo se crea automáticamente en Calendar
   ↓
9. Lead y admin reciben invitaciones
   ↓
10. El día de la demo → usar link de Google Meet
   ↓
11. Después de la demo → actualizar estado a "Convertido" o "Rechazado"
```

---

## 💡 Tips y Mejores Prácticas

### **Antes de agendar:**
- ✅ Contacta al lead primero por WhatsApp
- ✅ Confirma su interés y disponibilidad
- ✅ Explica brevemente qué es PianoLink
- ✅ Acuerda fecha/hora que le convenga
- ✅ Luego agenda en el sistema

### **Al agendar:**
- ✅ Usa duración de **60 minutos** (suficiente para demo completa)
- ✅ Agenda con **mínimo 24 horas de anticipación**
- ✅ Evita horarios muy temprano o muy tarde
- ✅ Considera zona horaria del lead

### **Después de agendar:**
- ✅ Confirma con el lead por WhatsApp que recibió la invitación
- ✅ Envía mensaje de recordatorio 1 día antes
- ✅ Envía mensaje de recordatorio 1 hora antes
- ✅ Ten preparado material de demo (partitura PDF, explicación)

### **Durante la demo:**
- ✅ Comienza puntual
- ✅ Presenta brevemente PianoLink
- ✅ Muestra funcionalidades clave (MIDI, PDF, whiteboard, PLB)
- ✅ Deja tiempo para preguntas
- ✅ Explica proceso para convertirse en Profesor Fundador

### **Después de la demo:**
- ✅ Envía email de agradecimiento
- ✅ Adjunta información adicional si solicitó
- ✅ Actualiza estado del lead en el sistema
- ✅ Agenda notas sobre la demo en el campo de notas del lead

---

## 🎯 Métricas de Demos

Puedes hacer seguimiento de:
- 📊 Cantidad de demos agendadas
- ✅ Tasa de conversión (demos → profesores convertidos)
- ⏱️ Duración promedio de demos
- 📈 Demos por semana/mes

---

## 🔗 Enlaces Útiles

- **Panel de Admin**: http://localhost:3000/admin.html
- **Google Calendar**: https://calendar.google.com
- **Guía de configuración de Calendar**: [GOOGLE_CALENDAR_SETUP.md](GOOGLE_CALENDAR_SETUP.md)
- **Sistema de Leads**: [SISTEMA_SEGUIMIENTO_LEADS.md](SISTEMA_SEGUIMIENTO_LEADS.md)

---

## 🆘 Soporte

Si tienes problemas agendando demos:
1. Verifica la configuración de Google Calendar
2. Revisa los logs del servidor (busca `[Lead]` y `[Calendar]`)
3. Prueba con una demo de prueba a tu propio email
4. Consulta la sección de troubleshooting arriba

---

**¡Ahora puedes agendar demos profesionalmente con Google Calendar + Meet!** 🚀📅
