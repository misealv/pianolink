# 🧠 PLB - Sistema de Aprendizaje Continuo

## 📋 Resumen

PLB (Piano Link Brain) tiene un sistema de **aprendizaje continuo** que permite que mejore sus respuestas con el tiempo. Cuando corriges una respuesta, PLB la guarda y la usa en futuras conversaciones.

## 🔧 ¿Cómo Funciona?

### 1. **Base de Conocimiento Inicial (SYSTEM_PROMPT)**

PLB comienza con información base hardcodeada en [services/PLBService.js](services/PLBService.js#L48):

```javascript
FUNDADOR: Miguel Antonio (Miseal), compositor y desarrollador de Chile.
PRECIO: $10 USD/mes
```

### 2. **Ejemplos de Aprendizaje (Few-Shot Learning)**

Cuando un profesor corrige una respuesta, se guarda como un "ejemplo" en la base de datos:

```javascript
{
  context: "¿Quién es el creador de Piano Link?",
  improvedResponse: "El creador es Miguel Antonio, compositor de Chile...",
  category: "fundador",
  rating: 5
}
```

### 3. **Prioridad de Información**

**IMPORTANTE:** Los ejemplos guardados **tienen prioridad** sobre la información base:

```javascript
// En services/PLBService.js línea 214
INSTRUCCIÓN CRÍTICA: Si hay un ejemplo aquí que contradice la información base,
SIEMPRE usa la información del ejemplo. Estos ejemplos son correcciones del profesor.
```

## 🎯 Casos de Uso

### Caso 1: Corregir Información del Fundador

**Problema:** PLB decía "Miguel Ángel, músico de Colombia"  
**Solución:** Se guardó un ejemplo con la info correcta  
**Resultado:** PLB ahora dice "Miguel Antonio, compositor de Chile"

### Caso 2: Actualizar Precios

**Problema:** Los precios cambiaron  
**Solución:** Guarda un ejemplo con el nuevo precio  
**Resultado:** PLB usa el precio actualizado

### Caso 3: Mejorar Respuestas de Ventas

**Problema:** Una respuesta genérica no convenció a un cliente  
**Solución:** El profesor mejora la respuesta y la guarda  
**Resultado:** PLB usa esa respuesta mejorada en situaciones similares

## 🛠️ Cómo Agregar una Corrección

### Opción 1: Desde la Interfaz Web (Recomendado)

1. Durante una clase, PLB sugiere una respuesta
2. Click en "Mejorar" en el HUD de PLB
3. Escribe la respuesta correcta
4. Click en "Guardar"
5. ✅ La corrección se guarda automáticamente

### Opción 2: Script Manual

```bash
node addFounderExample.js
```

O crear un script personalizado:

```javascript
const PLBExample = require('./models/PLBExample');

const newExample = new PLBExample({
    context: "Tu pregunta aquí",
    improvedResponse: "La respuesta correcta",
    teacherEmail: 'demo@pianolink.com',
    category: 'fundador', // o 'precio', 'comparacion', 'objecion', etc.
    rating: 5
});

await newExample.save();
```

## 📊 Categorías de Ejemplos

- **fundador**: Información sobre el creador
- **precio**: Información de precios y planes
- **comparacion**: Comparaciones con competidores (Zoom, OBS, etc.)
- **objecion**: Manejo de objeciones de ventas
- **caracteristica**: Explicaciones de funcionalidades
- **otro**: Cualquier otro tema

## 🔄 Cache y Actualización

- Los ejemplos se cargan en memoria cada **5 minutos**
- Para forzar actualización inmediata: **reinicia el servidor**
- Los ejemplos se ordenan por **rating** y **uso**

## ✅ Verificar que Funciona

### Test Específico:

```bash
node test-plb-founder.js
```

Este script:
1. Se conecta al servidor
2. Hace la pregunta sobre el fundador
3. Verifica que PLB responda correctamente
4. Muestra si pasó todas las verificaciones

### Test General:

```bash
node test-plb.js
```

Simula una conversación completa de ventas.

## 🐛 Solución de Problemas

### PLB no aprende las correcciones

**Causa:** El cache aún no se actualizó  
**Solución:** Espera 5 minutos o reinicia el servidor

### La respuesta sigue siendo incorrecta

**Causa:** El ejemplo puede no estar marcado como activo  
**Solución:** Verifica en la base de datos:

```javascript
db.plbexamples.find({ isActive: true, category: 'fundador' })
```

### El ejemplo no se guarda

**Causa:** Usuario no autorizado  
**Solución:** Solo `demo@pianolink.com` puede guardar ejemplos (ver `PLB_CONFIG.ALLOWED_EMAILS`)

## 📈 Monitoreo

Ver métricas de PLB:

```bash
GET /api/plb/status
```

Respuesta:

```json
{
  "enabled": true,
  "transcriptsReceived": 15,
  "geminiCalls": 3,
  "hintsGenerated": 3,
  "throttledCalls": 2,
  "errors": 0
}
```

## 🔐 Seguridad

- Solo usuarios en `PLB_CONFIG.ALLOWED_EMAILS` pueden usar PLB
- Solo usuarios autorizados pueden guardar correcciones
- Ejemplos pueden desactivarse sin eliminarse (`isActive: false`)

## 🚀 Próximos Pasos

1. **Recolectar más ejemplos** durante clases reales
2. **Categorizar mejor** los ejemplos por tipo
3. **Sistema de rating** para priorizar mejores respuestas
4. **Dashboard admin** para gestionar ejemplos

## 📚 Archivos Relacionados

- [services/PLBService.js](services/PLBService.js) - Motor principal
- [models/PLBExample.js](models/PLBExample.js) - Modelo de datos
- [public/js/modules/PLBHud.js](public/js/modules/PLBHud.js) - Interfaz web
- [server.js](server.js#L942) - Socket event `plb-improve`

---

**¿Preguntas?** Miguel Antonio (Miseal) - [email] - Chile 🇨🇱
