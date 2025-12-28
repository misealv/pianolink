# 🧪 Testing Video y Audio - Un Solo Computador

## 🎯 Método de Prueba con Una Máquina

### Opción 1: Dos Navegadores Diferentes

1. **Ventana 1 - Chrome**:
   ```
   http://localhost:3000
   ```
   - Inicia sesión como **Profesor** o **Alumno 1**
   - Crea una sala (ej: "TEST-AUDIO")
   - Conecta tu piano MIDI

2. **Ventana 2 - Firefox/Edge**:
   ```
   http://localhost:3000
   ```
   - Inicia sesión como **Alumno 2** (diferente usuario)
   - Únete a la sala "TEST-AUDIO"

3. **Activa el video en AMBAS ventanas**

4. **Verifica**:
   - ✅ En la Ventana 1 deberías ver tu video local + video remoto de Ventana 2
   - ✅ En la Ventana 2 deberías ver tu video local + video remoto de Ventana 1
   - ✅ El **indicador de nivel de audio** (barra verde) debería moverse cuando hablas

---

### Opción 2: Ventanas de Incógnito (Mismo Navegador)

1. **Ventana Normal**:
   ```
   http://localhost:3000
   ```
   - Inicia sesión como **usuario1@test.com**
   - Crea sala "TEST-VIDEO"

2. **Ventana Incógnito** (Ctrl+Shift+N en Chrome):
   ```
   http://localhost:3000
   ```
   - Inicia sesión como **usuario2@test.com**
   - Únete a sala "TEST-VIDEO"

3. **Activa video en ambas**

---

## 🔍 Verificación del Micrófono

### Indicador Visual

Cuando actives el video, verás en la ventana "📹 Mi Cámara":

```
🎤 Nivel: [████████████████░░░░] 80%
```

**¿Qué significa?**:
- **0%**: Micrófono silencioso o muteado
- **1-30%**: Silencio ambiente normal
- **30-70%**: Hablando normalmente
- **70-100%**: Hablando fuerte o cerca del micrófono

**Pruebas**:
1. **Habla cerca del micrófono** → La barra debería moverse al 50-80%
2. **Guarda silencio** → La barra debería bajar al 0-10%
3. **Toca el piano físico** → La barra debería capturar el sonido

---

## 🎹 Verificación del Ducking MIDI

### Test del Smart Audio Bridge

1. **Sin tocar el piano**:
   - Habla por el micrófono
   - El nivel debería estar al **100%** (normal)
   - En la otra ventana, el audio debería escucharse claro

2. **Toca una nota en el piano físico**:
   - **Inmediatamente**: El nivel del micrófono baja a **10%**
   - En consola: `[VideoManager] 🎤 Micrófono atenuado durante MIDI`
   - El indicador visual mostrará nivel reducido

3. **Deja de tocar (espera 1 segundo)**:
   - El micrófono vuelve a **100%** automáticamente
   - En consola: `[VideoManager] 🎤 Micrófono restaurado (MIDI silencio > 1s)`

---

## 🐛 Troubleshooting

### No escucho audio

1. **Verifica permisos del navegador**:
   - Chrome: Icono de cámara en la barra de direcciones
   - Asegúrate de haber dado permiso al micrófono

2. **Verifica el indicador de nivel**:
   - Si está en 0% constantemente:
     - Micrófono físico muteado en el sistema operativo
     - Dispositivo incorrecto seleccionado
   - Si se mueve pero no escuchas:
     - Verifica altavoces/auriculares de la otra ventana

3. **Abre la consola del navegador (F12)**:
   - Busca: `✅ Audio track creado`
   - Busca: `✅ Tracks publicados`
   - Busca: `✅ Monitor de nivel de audio iniciado`

4. **Verifica que NO estés muteado**:
   - El botón 🎤 debe estar opaco (activo)
   - Si está rojo/resaltado, haz clic para unmute

### El eco persiste

1. **Usa auriculares**: El eco se produce cuando el micrófono captura el sonido de los parlantes
2. **Separa las ventanas**: Pon ventana 1 con auriculares, ventana 2 con parlantes
3. **Verifica el ducking**: Cuando tocas piano, debería bajar el micrófono automáticamente

### No veo el indicador de nivel

1. **Recarga la página** (Ctrl+Shift+R)
2. **Verifica que el video esté activo**: Botón "📹 Video" debe estar visible
3. **Abre consola**: Busca errores de VideoManager

---

## ✅ Checklist de Funcionamiento Correcto

- [ ] El botón "📹 Video" aparece después de unirse a la sala
- [ ] Al hacer clic, se ven las ventanas de video local y remoto
- [ ] El **indicador de nivel de audio** se mueve cuando hablas
- [ ] En la otra ventana/navegador, escuchas el audio
- [ ] Cuando tocas el piano, el indicador baja a ~10%
- [ ] Tras 1 segundo sin tocar, el indicador vuelve a 100%
- [ ] No escuchas tonos web del AudioScheduler (solo piano físico)
- [ ] El MIDI se transmite limpiamente sin eco

---

## 🎯 Test Ideal

**Setup**:
- Chrome: Profesor con auriculares
- Firefox: Alumno con parlantes
- Piano MIDI conectado en Chrome

**Flujo**:
1. Profesor toca piano → Alumno escucha MIDI limpio (sin eco)
2. Profesor habla → Alumno escucha voz clara
3. Profesor toca + habla → Alumno escucha MIDI limpio + voz atenuada (10%)

**Resultado esperado**: Música perfecta + comunicación funcional sin competencia.

---

## 📊 Logs de Consola Esperados

```
[VideoManager] 🔧 Iniciando Smart Audio Bridge (Agora setVolume)...
[VideoManager] ✅ Smart Audio Bridge activo
[VideoManager] ✅ Smart MIDI Ducking conectado
[VideoManager] ✅ Monitor de nivel de audio iniciado
[Main] 🎹 Tonos web locales: SILENCIADOS (Zero Latency Experience)
```

Cuando tocas piano:
```
[MidiStateManager] Note ON: 60 (source: LOCAL)
```

Cuando dejas de tocar (1s después):
```
[VideoManager] 🎤 Micrófono restaurado (MIDI silencio > 1s)
```
