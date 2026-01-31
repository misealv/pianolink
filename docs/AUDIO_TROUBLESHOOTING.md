# 🔊 Audio Troubleshooting Guide - PianoLink

**Última actualización**: 30 de Enero 2026  
**Versión**: 1.1 - Post-patch Audio Resilience

---

## 🚨 Problema: No escucho al estudiante

### Diagnóstico Rápido (en consola F12)

```javascript
// 1. Ver estado completo del video/audio
videoManager.getDiagnostics()

// 2. Forzar reproducción de audio remoto
videoManager.forcePlayRemoteAudio()

// 3. Re-suscribirse a todos los usuarios
videoManager.resubscribeAll()
```

### Causas Comunes

| Causa | Síntoma | Solución |
|-------|---------|----------|
| **Autoplay Policy** | Consola muestra "Autoplay bloqueado" | Hacer click en cualquier parte de la página |
| **Suscripción fallida** | "Error suscribiendo a usuario" en consola | Ejecutar `videoManager.resubscribeAll()` |
| **Track no publicado** | `remoteUsers` vacío en diagnóstico | El estudiante debe reactivar su video/audio |
| **Micrófono del estudiante** | `hasAudio: false` en diagnóstico | Verificar permisos del navegador del estudiante |

---

## 🔍 Paso a Paso: Debug durante Demo

### 1. Abrir Consola del Navegador
```
F12 → Pestaña "Console"
```

### 2. Verificar Estado
```javascript
videoManager.getDiagnostics()
```

**Output esperado (funcionando correctamente)**:
```json
{
  "joined": true,
  "localTracks": {
    "audio": true,
    "video": true,
    "audioEnabled": true
  },
  "remoteUsers": [{
    "uid": "12345",
    "hasAudio": true,
    "hasVideo": true
  }],
  "pendingAudio": {
    "hasPendingTrack": false
  }
}
```

**Output problemático**:
```json
{
  "remoteUsers": [],  // ❌ No hay usuarios remotos
  // o
  "remoteUsers": [{
    "hasAudio": false  // ❌ El estudiante no publicó audio
  }],
  // o
  "pendingAudio": {
    "hasPendingTrack": true  // ⚠️ Audio bloqueado por autoplay
  }
}
```

### 3. Soluciones según el problema

#### Si `remoteUsers` está vacío:
```javascript
// El estudiante no se ha unido o hay problema de conexión
// Verificar que el estudiante:
// 1. Está en la misma sala
// 2. Hizo click en el botón de video
// 3. Dio permisos de cámara/micrófono
```

#### Si `hasPendingTrack: true`:
```javascript
// Audio bloqueado por política de autoplay
videoManager.forcePlayRemoteAudio()
```

#### Si `hasAudio: false` en remoteUsers:
```javascript
// El estudiante no publicó audio
// Decirle que:
// 1. Recargue la página
// 2. Vuelva a hacer click en "Activar Video"
// 3. Verifique permisos del micrófono
```

---

## 📊 Logs a buscar en Consola

### ✅ Conexión Exitosa
```
[VideoManager] 👤 Usuario remoto se unió. UID: xxxxx
[VideoManager] 📡 Usuario remoto publicó: audio UID: xxxxx
[VideoManager] ✅ Suscrito a audio de UID: xxxxx
[VideoManager] 🔊 Audio remoto reproduciéndose
```

### ⚠️ Autoplay Bloqueado
```
[VideoManager] ⚠️ Autoplay bloqueado, requiere interacción del usuario
[VideoManager] 👆 Esperando interacción del usuario para desbloquear audio...
```
**Solución**: Click en cualquier parte de la página

### ❌ Error de Suscripción
```
[VideoManager] ❌ Error suscribiendo a usuario (intento X): ...
[VideoManager] 🔄 Reintentando en XXXXms...
```
**Solución**: Esperar los reintentos automáticos o ejecutar `videoManager.resubscribeAll()`

### ⚠️ Red Lenta
```
[VideoManager] ⚠️ Calidad de red baja - Uplink: X Downlink: X
```
**Solución**: Verificar conexión a internet del estudiante

---

## 🛠️ Comandos de Emergencia

### Durante la Demo (en consola F12)

```javascript
// Ver diagnóstico completo
videoManager.getDiagnostics()

// Forzar reproducción de audio
videoManager.forcePlayRemoteAudio()

// Re-suscribirse a todos
videoManager.resubscribeAll()

// Ver usuarios remotos conectados
Object.keys(videoManager.remoteUsers)

// Ver si hay audio track del remoto
videoManager.remoteUsers[Object.keys(videoManager.remoteUsers)[0]]?.audioTrack
```

---

## 🔄 Workaround: Usar Zoom/Meet como backup

Si el audio de PianoLink falla y no se puede recuperar:

1. **Mantén PianoLink abierto** para el MIDI y video
2. **Abre Zoom/Meet en paralelo** solo para audio
3. **Mutea el micrófono en PianoLink** (botón 🎤)
4. **Usa Zoom/Meet** para conversar
5. **El MIDI seguirá funcionando** perfectamente en PianoLink

---

## 📝 Reporte de Bug

Si el problema persiste, recopila esta información:

1. **Screenshot de `videoManager.getDiagnostics()`**
2. **Logs de consola** (filtra por "VideoManager")
3. **Navegador y versión** (Chrome/Firefox/Safari)
4. **Sistema operativo** del estudiante
5. **Tipo de conexión** (WiFi/Cable/4G)

Enviar a: [tu email de soporte]

---

## ✅ Checklist Pre-Demo

- [ ] Verificar que Agora credentials están en `.env`
- [ ] Probar con cuenta de prueba antes de la demo
- [ ] Tener F12 abierto durante la demo
- [ ] Conocer los comandos de emergencia
- [ ] Tener Zoom/Meet como backup
