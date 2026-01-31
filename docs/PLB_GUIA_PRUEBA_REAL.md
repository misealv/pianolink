# 🧪 PLB - Guía de Prueba con Usuario Real

**Fecha:** 30 de Enero 2026  
**Usuario de prueba:** demo@pianolink.com  
**Contraseña:** (la que configuraste para este usuario)

---

## 🚀 Preparación

### 1. Asegúrate de que el servidor esté corriendo

```bash
cd /home/miseal/pianolink
node server.js
```

O si ya está corriendo en background, verifica que esté activo:

```bash
curl http://localhost:3000/api/plb/status
```

### 2. Verifica que el usuario demo existe

Ya verificado ✅:
- **Email:** demo@pianolink.com
- **Rol:** teacher (profesor)
- **Nombre:** Profesor Demo

---

## 📱 Pasos para Probar PLB

### Paso 1: Abrir el navegador

Abre **Chrome** o **Edge** (Web Speech API funciona mejor en estos navegadores):

```
http://localhost:3000
```

### Paso 2: Iniciar sesión

1. Haz clic en "Iniciar Sesión"
2. Ingresa:
   - **Email:** demo@pianolink.com
   - **Contraseña:** (tu contraseña configurada)
3. Click en "Entrar"

### Paso 3: Crear una sala de clase

1. En el dashboard, clic en **"Crear Sala"** o **"Nueva Clase"**
2. Se generará un código de sala (ej: ABC123)
3. La sala se abrirá automáticamente

### Paso 4: Verificar que PLB está activo

**Deberías ver:**

1. En la consola del navegador (F12):
   ```
   [PLB Transcriber] ✅ Web Speech API disponible
   [PLB HUD] ✅ Inicializado para profesor
   [Main] 🧠 Intentando activar PLB para: demo@pianolink.com
   ```

2. **No verás el HUD inicialmente** (solo aparece cuando hay hints)

### Paso 5: Activar el reconocimiento de voz

**El PLB se activa automáticamente** 3 segundos después de entrar a la sala.

**Verifica en la consola:**
```
[PLB Transcriber] 🚀 Activando para: demo@pianolink.com
[PLB Transcriber] 🎤 Escuchando...
```

**Permisos del micrófono:**
- El navegador pedirá permiso para usar el micrófono
- Haz clic en **"Permitir"**

### Paso 6: Empezar a hablar

**Habla claramente hacia el micrófono:**

#### Opción A: Solo tú (para testing rápido)

Simula una conversación diciendo frases que contengan **keywords de venta**:

```
"Hola, bienvenido a Piano Link"
[Espera 2 segundos]
"Cuánto cuesta la plataforma?"
[Espera 2 segundos]
"Me interesa probarlo"
```

#### Opción B: Con un invitado real

1. Abre una **ventana de incógnito** en el mismo navegador
2. Ve a: `http://localhost:3000`
3. Ingresa el código de sala (sin iniciar sesión)
4. Como invitado, pregunta sobre precios, comparaciones con Zoom, etc.

### Paso 7: Ver los hints de PLB

**Cuando PLB detecte una oportunidad de venta, verás:**

Un cuadro flotante en la **esquina inferior derecha** con:

```
┌────────────────────────────────────────┐
│ 🧠 PLB                            [×]  │
├────────────────────────────────────────┤
│ 💡 Sugerencia:                         │
│                                        │
│ "Menciona que cuesta solo $10/mes     │
│  y tenemos 10 slots de fundadores     │
│  a precio de por vida"                 │
│                                        │
├────────────────────────────────────────┤
│ 🎤 Escuchando...              📜       │
└────────────────────────────────────────┘
```

**Características del HUD:**
- ✅ **Auto-dismiss:** Desaparece después de 15 segundos
- ✅ **Historial:** Clic en 📜 para ver hints anteriores
- ✅ **Cerrar manual:** Clic en [×] para cerrar
- ✅ **Solo visible para profesor** (el invitado no lo ve)

---

## 🎯 Keywords que Activan PLB

El PLB se activa cuando detecta estas palabras clave:

### Precio/Costo
- precio, costo, pagar, cuanto, gratis, free

### Comparaciones
- obs, zoom, skype, alternativa, comparar, diferencia

### Interés/Features
- funciona, característica, ventaja, beneficio

### Pruebas
- probar, demo, prueba, trial

### Objeciones
- interesa, duda, pensar, decidir

---

## 🔍 Debugging en Tiempo Real

### Abrir la consola del navegador (F12)

**Mensajes que verás:**

```javascript
// Cuando hablas
[PLB Transcriber] 📝 [teacher]: "Cuánto cuesta esto..."

// Cuando se envía al servidor
PLB] 📝 Transcripción de teacher: "Cuánto cuesta esto..."

// Pre-filtro de keywords
[PLB] 🧠 Llamando a Gemini (3 mensajes en contexto)
// O si no hay keywords:
[PLB] 💤 Sin keywords relevantes - saltando llamada

// Cuando se genera un hint
[PLB] 💡 Hint generado (1500ms): Menciona que...
[PLB HUD] 💡 Hint mostrado: ...
```

### Ver métricas del servidor

En otra terminal:

```bash
curl http://localhost:3000/api/plb/status | jq
```

Verás:
```json
{
  "transcriptsReceived": 5,
  "geminiCalls": 2,
  "hintsGenerated": 2,
  "throttledCalls": 3,
  "errors": 0,
  "config": {
    "enabled": true,
    "allowedEmails": ["demo@pianolink.com"],
    "throttleMs": 15000
  }
}
```

---

## 🐛 Troubleshooting

### El micrófono no funciona

**Síntomas:**
```
[PLB Transcriber] ⚠️ Web Speech API no soportada
```

**Solución:**
- Usa Chrome o Edge (Firefox no soporta Web Speech API bien)
- Verifica permisos de micrófono en: `chrome://settings/content/microphone`

### No veo el HUD

**Posibles causas:**

1. **No eres profesor**
   - El HUD solo se muestra para `role: teacher`
   - Verifica: `localStorage.getItem('pianoUser')`

2. **No hay hints todavía**
   - El HUD solo aparece cuando hay un hint
   - Habla con keywords de venta

3. **PLB deshabilitado**
   - Consola: `[PLB] ⚠️ GEMINI_API_KEY no configurada`
   - Verifica `.env`

### No se genera ningún hint

**Posibles causas:**

1. **Throttle activo**
   ```
   [PLB] ⏳ Throttled (12.5s restantes)
   ```
   - Espera 15 segundos entre hints

2. **Sin keywords relevantes**
   ```
   [PLB] 💤 Sin keywords relevantes
   ```
   - Di palabras como "precio", "costo", "interesa"

3. **Contexto insuficiente**
   - Necesitas al menos 3 mensajes en la conversación
   - Habla más para acumular contexto

### Error de cuota de Gemini

```
[PLB] ⚠️ Cuota de Gemini excedida
```

**Solución:**
- La cuota se resetea cada minuto/día
- O activa facturación en Google AI Studio

---

## 📊 Prueba Completa Sugerida

### Guión de prueba (5 minutos)

```
Minuto 1: Introducción
👨‍🏫: "Hola, bienvenido a Piano Link"
👤: "Hola, gracias por la invitación"

Minuto 2: Explicación
👨‍🏫: "Piano Link es una plataforma para clases de piano online"
👤: "Interesante. ¿Cómo funciona?"
👨‍🏫: "Conectas tu piano MIDI y podemos tocar en tiempo real"

Minuto 3: TRIGGER - Precio
👤: "Suena bien. ¿Cuánto cuesta esto?"
🧠 PLB: [Debería generar hint sobre precio]
👨‍🏫: [Lee el hint y responde]

Minuto 4: TRIGGER - Comparación
👤: "Actualmente uso Zoom para mis clases"
🧠 PLB: [Debería generar hint sobre ventajas vs Zoom]
👨‍🏫: [Lee el hint y responde]

Minuto 5: TRIGGER - Cierre
👤: "Me interesa, pero debo pensarlo"
🧠 PLB: [Debería generar hint sobre urgencia/fundadores]
👨‍🏫: [Lee el hint y cierra venta]
```

**Resultado esperado:** 3 hints en 5 minutos

---

## 🎥 Grabar la Prueba (Opcional)

Si quieres documentar la prueba:

```bash
# Linux con ffmpeg
ffmpeg -f x11grab -s 1920x1080 -i :0.0 -f pulse -i default \
  -c:v libx264 -crf 23 -c:a aac test-plb-demo.mp4
```

O usa **OBS Studio** para grabar pantalla y audio.

---

## ✅ Checklist de Prueba Exitosa

- [ ] Servidor corriendo en http://localhost:3000
- [ ] Login con demo@pianolink.com exitoso
- [ ] Sala creada y activa
- [ ] Micrófono activado y con permisos
- [ ] Consola muestra: `[PLB Transcriber] 🎤 Escuchando...`
- [ ] Transcripciones aparecen en consola al hablar
- [ ] Keywords detectadas: `[PLB] 🧠 Llamando a Gemini`
- [ ] Hint recibido: `[PLB] 💡 Hint generado`
- [ ] HUD visible en esquina inferior derecha
- [ ] Hint se cierra automáticamente después de 15s
- [ ] Historial de hints accesible con botón 📜

---

## 📹 Video Tutorial (si grabaste)

Una vez que hayas probado exitosamente, puedes:

1. Grabar un video corto (2-3 minutos)
2. Mostrar el flujo completo
3. Subir a YouTube o compartir con el equipo

---

## 🚀 Próximos Pasos

Una vez validado en local:

1. **Deploy a producción** (Render)
2. **Probar con clientes reales**
3. **Recolectar feedback** sobre la calidad de los hints
4. **Ajustar el system prompt** según necesidades
5. **Agregar más keywords** si es necesario

---

**¿Dudas?** Revisa la consola del navegador (F12) - todos los eventos se loggean ahí.

**¿Problemas?** Ejecuta: `curl http://localhost:3000/api/plb/status` para ver el estado del servidor.
