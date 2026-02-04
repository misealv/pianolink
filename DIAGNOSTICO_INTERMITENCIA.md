# 🔍 GUÍA DE DIAGNÓSTICO - Intermitencia Audio/MIDI en Clases

## El Problema Reportado
- **Ubicación:** Santiago, Chile
- **Síntomas:** Audio y MIDI se "pegaban" (congelamiento intermitente)
- **Frecuencia:** Primera vez que ocurre

---

## 🎯 ÁRBOL DE DECISIÓN RÁPIDO

```
¿El problema fue en AMBOS lados (profesor y alumno)?
    │
    ├─ SÍ → Problema del SERVIDOR o conexión del profesor
    │
    └─ NO → Problema de la RED LOCAL del afectado
```

---

## 📋 CHECKLIST DE DIAGNÓSTICO

### 1. RED LOCAL (Lo más probable: ~60%)

| Verificación | Cómo comprobarlo | ✅/❌ |
|--------------|------------------|-------|
| WiFi vs Cable | ¿Usaste WiFi o cable ethernet? | |
| Interferencia WiFi | ¿Hay otros dispositivos en la misma red? | |
| Distancia al router | ¿Estabas lejos del router? | |
| Congestión de red | ¿Alguien más usaba internet (streaming, descargas)? | |
| Calidad del ISP | ¿Tu proveedor tiene buena latencia? | |

**Test rápido de red:**
```bash
# En la terminal del equipo donde se dio la clase:
ping -c 20 pianolink.onrender.com
# Buscar: packet loss > 0% o latencia > 150ms
```

### 2. SERVIDOR RENDER (~25%)

| Verificación | Estado |
|--------------|--------|
| Health Check | ✅ Server OK (uptime: 3+ horas) |
| MongoDB | ✅ Conectado |
| Memoria | 77MB (normal) |

**Para verificar logs históricos:**
1. Ir a [Render Dashboard](https://dashboard.render.com)
2. Seleccionar servicio `pianolink`
3. Ver logs del momento de la clase
4. Buscar: `[Socket]`, `disconnect`, `timeout`, `error`

### 3. CÓDIGO DE PIANOLINK (~15%)

El código actual tiene estas configuraciones anti-intermitencia:

```javascript
// server.js líneas 52-66
pingTimeout: 120000,       // 2 min antes de desconexión
pingInterval: 25000,       // Ping cada 25s
perMessageDeflate: false,  // Sin compresión (menor latencia)
transports: ['websocket', 'polling']  // Fallback automático
```

**Posibles causas de código:**
- ❓ WebSocket degradó a polling (más lento)
- ❓ Buffer de MIDI se llenó
- ❓ Event loop bloqueado en servidor

---

## 🛠️ HERRAMIENTAS DE DIAGNÓSTICO

### A) Test de Latencia en Tiempo Real
Ejecuta esto durante tu próxima clase:

```bash
# Terminal 1: Monitorear latencia al servidor
while true; do
  curl -s -w "Latencia: %{time_total}s\n" -o /dev/null https://pianolink.onrender.com/health
  sleep 5
done
```

### B) Logs del Navegador (Cliente)
1. Abrir DevTools (F12)
2. Tab "Console"
3. Buscar mensajes:
   - `[Socket] disconnected` → Problema de conexión
   - `[MIDI] buffer overflow` → Saturación de datos
   - `[Audio] context suspended` → Problema de audio

### C) Script de Diagnóstico Automático
Ejecutar en el servidor:
```bash
node diagnostico-red.js
```

---

## 📊 DATOS CLAVE PARA DIAGNÓSTICO

### Preguntas que necesito que respondas:

1. **¿Cuántos alumnos había en la clase?** (más alumnos = más carga)

2. **¿Qué dispositivo usaste?**
   - [ ] Mac
   - [ ] Windows
   - [ ] iPad/Tablet
   - [ ] Chromebook

3. **¿Qué navegador?**
   - [ ] Chrome
   - [ ] Safari
   - [ ] Firefox
   - [ ] Edge

4. **¿Cómo te conectaste?**
   - [ ] WiFi
   - [ ] Cable ethernet
   - [ ] Datos móviles

5. **¿A qué hora fue la clase?** (para revisar logs)

6. **¿El problema fue:**
   - [ ] Constante durante toda la clase
   - [ ] Intermitente (aparecía y desaparecía)
   - [ ] Empezó bien y empeoró

7. **¿Tu alumno también experimentó el problema o solo tú?**

---

## 🚨 SOLUCIONES INMEDIATAS

### Si es problema de RED:
1. **Cambiar a cable ethernet** (elimina 90% de problemas WiFi)
2. **Cerrar otras apps** (Spotify, YouTube, etc.)
3. **Reiniciar router** antes de la clase
4. **Usar banda 5GHz** en lugar de 2.4GHz

### Si es problema del SERVIDOR:
1. Revisar [status.render.com](https://status.render.com) 
2. Ver logs en Render Dashboard
3. Considerar upgrade del plan si hay muchas clases simultáneas

### Si es problema de CÓDIGO:
1. Agregar más logging para MIDI
2. Implementar reconnect automático más agresivo
3. Agregar indicador visual de calidad de conexión

---

## 📈 MÉTRICAS A MONITOREAR

Agregar este endpoint para ver métricas en tiempo real:

```
GET https://pianolink.onrender.com/api/room-stats
```

Datos útiles:
- Conexiones activas por sala
- Latencia promedio
- Mensajes MIDI/segundo
- Reconnects por sesión

---

## 🔄 PRÓXIMOS PASOS RECOMENDADOS

1. **INMEDIATO:** Responder las preguntas de diagnóstico arriba
2. **ANTES DE PRÓXIMA CLASE:** Ejecutar test de latencia
3. **DURANTE CLASE:** Tener DevTools abierto para capturar errores
4. **DESPUÉS:** Revisar logs de Render

---

## 📞 Comandos Rápidos

```bash
# Ver estado del servidor
curl https://pianolink.onrender.com/health | jq

# Test de latencia
ping pianolink.onrender.com

# Ver logs en tiempo real (si tienes Render CLI)
render logs --tail
```
