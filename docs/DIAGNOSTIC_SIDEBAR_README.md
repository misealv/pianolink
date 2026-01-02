# Diagnostic Sidebar - Fase 4.5

## 📊 Overview

El **Diagnostic Sidebar** es un panel lateral de telemetría en tiempo real diseñado para que el profesor monitoree la salud del sistema PianoLink durante las sesiones.

## 🎨 Diseño UX/UI

### Estética
- **Glassmorphism**: Fondo semitransparente con `backdrop-filter: blur(20px)`
- **Color Scheme**: Oscuro (#1a1a1a) con acentos naranjas (#ff764d)
- **Animaciones**: Transiciones suaves con `cubic-bezier(0.4, 0, 0.2, 1)`
- **Z-Index**: 9999 para estar siempre visible

### Componentes Visuales

#### 1. Botón Flotante
- **Ubicación**: Esquina superior derecha (20px desde el borde)
- **Animación**: Pulso constante con resplandor
- **Icono**: Rayo (SVG)
- **Shortcut**: Tecla `D` para abrir/cerrar

#### 2. Sidebar Panel (320px)
- **Transición**: Slide-in desde la derecha (0.4s)
- **Scrollable**: Overflow-y automático con scrollbar personalizado
- **Responsive**: En móviles ocupa 100% del ancho

## 📈 Métricas Mostradas

### Latencia (RTT)
- **Indicador Visual**: Semáforo circular con luz LED
  - 🟢 Verde: < 50ms (Excelente)
  - 🟡 Amarillo: 50-150ms (Aceptable)
  - 🔴 Rojo: > 150ms (Problemático) + animación de pulso
- **Valor Numérico**: Mostrado en milisegundos

### Salud MIDI
- **Echos Bloqueados**: Contador de loops prevenidos por el `MidiOutputManager`
- **Notas Rescatadas**: Notas restauradas por el Snapshot Protocol
- **Auto-Liberaciones**: Notas liberadas por el Watchdog Timer (>10s)

### Actividad
- **Barra de Progreso**: Gradiente verde-naranja
- **Mensajes/Segundo**: Aproximación basada en `messagesSent`
- **Rango**: 0-100 msg/s

### Dispositivo de Salida
- **Nombre**: Dispositivo MIDI actualmente seleccionado
- **Estado**: ✅ Seleccionado / ⚠️ No seleccionado

### Estado de Conexión
- **Indicadores**:
  - 🟢 **Conectado**: Socket.io activo
  - 🔴 **Desconectado**: Sin conexión
  - 🟡 **Reconectando**: Intentando reconectar (pulso animado)
  - ⚠️ **Error**: Error de conexión

## 🎮 Controles de Acción

### Botón de Pánico (🚨)
- **Función**: Silencia todas las notas activas inmediatamente
- **Emisión**: `bus.emit('ui-panic')`
- **Efecto Visual**: Escala al 95% por 300ms
- **Color**: Rojo (#ef4444)

### Botón de Resincronización (🔄)
- **Función**: Fuerza sincronización del reloj NTP
- **Llamada**: `socketClient.requestClockSync()`
- **Efecto Visual**: Escala al 95% por 300ms
- **Color**: Verde (#4ade80)

## 📊 Estadísticas Detalladas

Ubicadas en el footer del panel:

- **Mensajes enviados**: Total de mensajes MIDI enviados al hardware
- **Mensajes filtrados**: Mensajes bloqueados por el firewall anti-loop
- **Cambios de dispositivo**: Cantidad de veces que se cambió el output MIDI
- **Estado AudioContext**: `running` / `suspended` / `closed`

## 🔧 Integración Técnica

### Arquitectura

```javascript
DiagnosticSidebar
├─ Constructor(eventBus, audioEngine, socketClient)
├─ init()
│  ├─ createUI()
│  ├─ attachEventListeners()
│  └─ startUpdateLoop()
├─ updateMetrics() [500ms interval]
└─ updateVisualIndicators() [requestAnimationFrame]
```

### Eventos Suscritos

| Evento | Fuente | Acción |
|--------|--------|--------|
| `net-latency` | SocketClient | Actualiza RTT |
| `net-status` | SocketClient | Actualiza estado de conexión |

### Métodos de AudioEngine Utilizados

```javascript
audioEngine.getStats()              // → { notesRescuedBySnapshot, autoReleases }
audioEngine.getOutputStats()        // → { echoesBlocked, messagesSent, messagesFiltered, deviceSwitches }
audioEngine.getCurrentMidiOutput()  // → { name, id, ... }
audioEngine.scheduler.ctx.state     // → 'running' | 'suspended'
```

## ⚡ Optimización de Rendimiento

### Estrategia de Actualización
- **Métricas pesadas**: `setInterval(500ms)` para llamadas a getStats()
- **Animaciones**: `requestAnimationFrame` para cambios visuales suaves
- **Condición**: Solo actualiza si `isOpen === true`

### Dispose Pattern
```javascript
diagnosticSidebar.dispose();
// - Cancela animationFrameId
// - Limpia interval
// - Remueve del DOM
// - Previene memory leaks
```

## 🎹 Casos de Uso

### 1. Detección de Latencia Alta
- El profesor ve latencia > 150ms (luz roja pulsando)
- **Acción**: Click en "Resincronizar" para recalibrar reloj NTP

### 2. MIDI Loop Sospechado
- Counter "Echos Bloqueados" incrementándose rápidamente
- **Diagnóstico**: El firewall está previniendo loops correctamente
- **Acción**: Ninguna necesaria (sistema funcionando)

### 3. Notas Pegadas
- "Notas Rescatadas" incrementándose
- **Diagnóstico**: Paquetes perdidos, pero snapshot protocol está corrigiendo
- **Métrica Saludable**: < 10% del total de notas

### 4. Pánico por Desincronización
- Múltiples notas quedan sonando después de desconexión
- **Acción**: Click en "🚨 PÁNICO" para resetear todo el sistema

## 🔐 Seguridad y Permisos

- **Solo Profesores**: `checkTeacherRole()` verifica `localStorage.pianoUser.role === 'teacher' || 'admin'`
- **No se inicializa para alumnos**: Ahorra recursos en clientes que no lo necesitan

## 📱 Responsive Design

### Desktop (> 768px)
- Sidebar: 320px de ancho
- Botón flotante: Top-right (20px, 20px)

### Mobile (≤ 768px)
- Sidebar: 100% de ancho (pantalla completa)
- Botón flotante: Reducido a (15px, 15px)
- Grid de acciones: Mantiene 2 columnas

## 🎨 Glassmorphism CSS

```css
background: rgba(26, 26, 26, 0.95);
backdrop-filter: blur(20px) saturate(180%);
-webkit-backdrop-filter: blur(20px) saturate(180%);
border: 1px solid rgba(255, 118, 77, 0.2);
box-shadow: -5px 0 30px rgba(0, 0, 0, 0.5);
```

## 🚀 Roadmap Futuro

- [ ] **Gráficos en tiempo real**: Chart.js para historiales de latencia
- [ ] **Alertas automáticas**: Notificaciones cuando latencia > 200ms por 10s
- [ ] **Exportar logs**: Botón para descargar CSV con estadísticas
- [ ] **Modo compacto**: Minimizar sidebar a barra delgada
- [ ] **Multi-alumno**: Panel expandible con métricas individuales por estudiante

## 📝 Notas de Implementación

### Pruebas Recomendadas
1. Abrir como profesor → Verificar que sidebar aparezca
2. Presionar `D` → Toggle debe funcionar
3. Simular latencia alta → Luz debe cambiar a roja
4. Cambiar output MIDI → Contador "Cambios de dispositivo" debe incrementar
5. Desconectar WiFi → Estado debe cambiar a "Desconectado"

### Debugging
```javascript
// En consola del navegador:
diagnosticSidebar.isOpen              // Estado del panel
diagnosticSidebar.latency             // Última latencia registrada
diagnosticSidebar.audioEngine.getStats() // Ver stats completas
```

---

**Versión**: 4.5 (Diciembre 2025)  
**Autor**: PianoLink Team  
**Licencia**: MIT
