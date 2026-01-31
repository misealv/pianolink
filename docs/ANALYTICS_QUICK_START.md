# 🚀 Guía Rápida - Sistema de Análisis de Profesores

## ✅ Sistema Completo Funcionando

El sistema de tracking está **100% operativo** y recopila automáticamente métricas de cada clase.

---

## 📊 Ver Estadísticas (Admin)

1. **Accede al panel admin**:
   ```
   http://localhost:3000/admin.html
   Email: admin@pianolink.com
   Password: adminpassword123
   ```

2. **Navega a Estadísticas**:
   - Click en botón **📈 Estadísticas**

3. **Selecciona profesor y período**:
   - Dropdown: Elige un profesor
   - Período: Hoy, Semana, Mes, Año, Todo

4. **Visualiza métricas**:
   - ✅ Sesiones totales
   - ⏱️ Horas totales  
   - 👥 Estudiantes únicos
   - 🎹 Actividad MIDI
   - 📚 Recursos usados
   - 📝 Sesiones recientes

---

## 🔧 API - Endpoints Principales

### Ver sesiones de un profesor
```bash
GET /api/analytics/teacher/:teacherId/stats?period=week
```

### Listar todas las sesiones
```bash
GET /api/analytics/sessions?limit=20
```

### Ver sesiones activas ahora
```bash
GET /api/analytics/active-sessions
```

### Ranking de profesores
```bash
GET /api/analytics/teachers/ranking?by=sessions&limit=10
```

---

## 📈 Métricas Trackeadas Automáticamente

| Métrica | Descripción |
|---------|-------------|
| 🎹 **MIDI** | Notas enviadas/recibidas, picos de actividad |
| ⏱️ **Tiempo** | Duración de sesión, tiempo por estudiante |
| 👥 **Estudiantes** | Cantidad, join/leave times |
| 📚 **Recursos** | PDFs, whiteboard, laser pointer |
| 🤖 **PLB** | Queries al asistente IA |
| 🎥 **Video/Audio** | Cambios de modo, mutes remotos |
| 📶 **Conexión** | Latency, reconnections, packet loss |

---

## 🎯 Eventos que Disparan Tracking

✅ **Crear sala** → Inicia sesión  
✅ **Unirse estudiante** → Registra join  
✅ **Enviar MIDI** → Cuenta notas  
✅ **Abrir PDF** → Registra recurso  
✅ **Dibujar en pizarra** → Cuenta anotación  
✅ **Consultar PLB** → Registra query  
✅ **Terminar clase** → Finaliza sesión  
✅ **Desconectar** → Marca salida  

**Todo es automático** - no requiere configuración adicional.

---

## 💾 Datos en MongoDB

```javascript
// Collection: sessions
{
  roomCode: "ABC123",
  teacher: { userId, email, name },
  startTime: Date,
  endTime: Date,
  duration: 3600000, // ms
  students: [...],
  midiStats: { notesSent, notesReceived, peaks, avgNotesPerMinute },
  resourcesUsed: { pdfCount, whiteboardAnnotations },
  interactions: { plbQueries, broadcasterChanges },
  teacherEnded: true,
  crashed: false
}
```

---

## 🧪 Probar el Sistema

### 1. Iniciar servidor
```bash
cd /home/miseal/pianolink
node server.js
```

### 2. Crear clase de prueba
- Ir a: `http://localhost:3000/dashboard.html`
- Login como profesor
- Crear sala
- Tocar algunas notas MIDI
- Abrir un PDF
- Terminar clase

### 3. Ver resultados
- Ir a: `http://localhost:3000/admin.html`
- Login como admin
- Click en **📈 Estadísticas**
- Seleccionar profesor
- ¡Ver métricas!

---

## 📝 Logs en Consola

Cuando funciona correctamente verás:

```
[SessionTracker] 📊 Servicio inicializado
[SessionTracker] ✅ Sesión iniciada: ABC123
[SessionTracker] 👤 Estudiante agregado a ABC123: Ana
[Track] MIDI tracked: sent 15 notes
[Track] PDF tracked: score_123
[SessionTracker] ⏹️ Sesión finalizada: ABC123 (60.5 min)
```

---

## ⚠️ Troubleshooting

### No aparecen estadísticas
1. Verificar que profesor tiene sesiones: `db.sessions.find({ "teacher.userId": "..." })`
2. Verificar logs: buscar `[SessionTracker]` en consola
3. Verificar API: `curl http://localhost:3000/api/analytics/sessions`

### SessionTracker no inicia
- Ver log de inicio: debe aparecer `[SessionTracker] 📊 Servicio inicializado`
- Si no aparece, verificar `server.js` línea ~26: `const SessionTracker = require('./services/SessionTracker')`

---

## 📖 Documentación Completa

Para información detallada ver:
- **Manual completo**: `/docs/TEACHER_ANALYTICS_SYSTEM.md`
- **Código fuente**: `services/SessionTracker.js`, `models/Session.js`
- **API Routes**: `routes/analyticsRoutes.js`

---

## 🎉 ¡Listo!

El sistema está funcionando y recopilando métricas de todas las clases automáticamente. No necesitas hacer nada más - solo usa la plataforma normalmente y las estadísticas se generarán solas.

**¡Disfruta tu nuevo dashboard de analytics!** 📊✨
