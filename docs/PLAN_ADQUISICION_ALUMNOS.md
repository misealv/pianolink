# Piano Link — Plan Maestro de Adquisición de Alumnos

> **Fecha:** 2026-03-09  
> **Versión:** 1.0  
> **Autor:** Agente Estratégico Piano Link  
> **Mercado objetivo:** Chile (Fase 1)

---

## Índice

1. [Auditoría del CRM y Base de Datos](#1-auditoría-del-crm-y-base-de-datos)
2. [Flujo del Bot de WhatsApp](#2-flujo-del-bot-de-whatsapp)
3. [Estrategia de Anuncios — Chile](#3-estrategia-de-anuncios--chile)
4. [Plan de Reactivación de Lista Fría](#4-plan-de-reactivación-de-lista-fría)
5. [Estrategia para Pocos Profesores](#5-estrategia-para-pocos-profesores)
6. [Dashboard de Métricas](#6-dashboard-de-métricas)
7. [Análisis: Modelo de Negocio Óptimo](#7-análisis-modelo-de-negocio-óptimo-para-la-etapa-actual)

---

## 1. Auditoría del CRM y Base de Datos

### 1a. Campos Existentes vs Campos Necesarios

La tabla siguiente compara lo que el sistema ya tiene contra lo que se necesita para soportar el bot y las campañas de adquisición de alumnos.

| Campo Requerido | Modelo Actual | Estado | Detalle |
|---|---|---|---|
| **Nombre** | `Lead.name` + `CrmLead.leadRef` | ✅ Existe | Campo `name` required en Lead |
| **WhatsApp** | `Lead.whatsapp` | ✅ Existe | Texto libre, no normalizado a E.164 |
| **País y Ciudad** | `Lead.country` + `Lead.timezone` | ⚠️ Parcial | `country` existe pero `city` **NO existe** en Lead |
| **Nivel de piano** | `Lead.beneficiaries[].level` | ⚠️ Parcial | Valores: beginner/intermediate/advanced → falta "nunca tocó" |
| **Tipo de instrumento** | *No existe* | ❌ Falta | Crítico para validar setup. No hay campo en Lead ni CrmLead |
| **Objetivo del alumno** | *No existe* | ❌ Falta | Necesario para matching con profesor |
| **Edad / Rango etario** | `Lead.beneficiaries[].age` | ⚠️ Parcial | Solo para beneficiarios, no para el lead principal |
| **Etapa del embudo** | `Lead.status` + `CrmLead.pipelineStudent` | ✅ Existe | `pipelineStudent`: lead → contacted → demo_scheduled → demo_completed → trial_class → enrolled → lost |
| **Fuente del lead** | `Lead.source` + `Lead.utmSource/Medium/Campaign` | ✅ Existe | Valores: landing, referral, social, kit_v2_checkout, ex_alumno_resonancias, other |
| **Fecha de entrada** | `Lead.createdAt` | ✅ Existe | Timestamps automáticos |
| **Profesor asignado** | *No existe en Lead/CrmLead* | ❌ Falta | Solo existe en StudentEnrollment (post-conversión) |
| **Estado del setup** | *No existe* | ❌ Falta | Crítico: pendiente / compatible / incompatible / resuelto |

### Diagnóstico de Gaps Críticos

#### Gap 1: No hay campo de tipo de instrumento
**Impacto:** Sin este campo, el bot no puede detectar controladores MIDI sin sonido propio antes de la clase de prueba. Esto genera fricción post-pago y devoluciones.

#### Gap 2: No hay campo de objetivo del alumno
**Impacto:** Sin saber si quiere aprender desde cero, mejorar técnica o tocar canciones, el matching con profesor es ciego.

#### Gap 3: No hay estado de setup
**Impacto:** No hay forma de trackear si el alumno tiene un setup compatible, necesita arreglarlo, o fue resuelto.

#### Gap 4: No hay ciudad en Lead
**Impacto:** Limita segmentación geográfica para campañas regionales dentro de Chile (Santiago vs regiones).

#### Gap 5: Nivel "nunca tocó" no existe
**Impacto:** El nivel `beginner` no distingue a alguien que nunca ha tocado de alguien que lleva unos meses.

#### Gap 6: No hay profesor asignado en la etapa de lead
**Impacto:** El matching alumno-profesor debería comenzar antes de la conversión para personalizar la oferta.

### 1b. Segmentación de los 6.000 Contactos de Resonancias

Los contactos están clasificados en 4 tiers según el script `extract-all-leads-resonancias.js`:

| Tier | Nombre | Cantidad | Descripción | Prioridad de Envío |
|------|--------|----------|-------------|-------------------|
| 1 | `alta_piano` | ~1,320 | Consultaron cursos de piano, interés directo | 🔴 Máxima |
| 2 | `alta_composicion_armonia` | ~400 | Composición/armonía — perfil compatible | 🟠 Alta |
| 3 | `media_musica` | ~2,500 | Interés en música general, no específico en piano | 🟡 Media |
| 4 | `baja_indirecta` | ~1,780 | Consultas indirectas, pricing, guitarra/canto | 🟢 Baja |

**Estrategia de priorización (100 emails/día con Resend free):**

```
Semana 1-2  → Tier 1 (alta_piano):         1,320 contactos ÷ 100/día = 14 días
Semana 3    → Tier 2 (composición/armonía):   400 contactos ÷ 100/día =  4 días
Semana 4-7  → Tier 3 (media_musica):        2,500 contactos ÷ 100/día = 25 días
Semana 8-11 → Tier 4 (baja_indirecta):      1,780 contactos ÷ 100/día = 18 días
────────────────────────────────────────────────────────────────────────────────
Total estimado:                              ~61 días laborales (~3 meses)
```

**Criterio de sub-segmentación dentro de cada tier:**
1. Contactos con WhatsApp → primero (se pueden migrar al bot en paralelo)
2. Contactos con más datos (nombre completo + ciudad) → segundo
3. Solo email → tercero

### 1c. Esquema MongoDB Propuesto para Campos Faltantes

No se requiere una colección nueva. Los campos se agregan al modelo `Lead` existente y al `CrmLead`:

```javascript
// ============================================
// CAMBIOS AL MODELO: Lead (models/Lead.js)
// ============================================

// Agregar al schema principal:

city: { type: String, trim: true },

instrumentType: {
  type: String,
  enum: [
    'piano_digital',        // Piano digital con sonido propio
    'teclado_electronico',  // Teclado electrónico con sonido propio
    'controlador_midi',     // Controlador MIDI sin sonido — INCOMPATIBLE
    'piano_acustico',       // Piano acústico (no necesita cable)
    'no_tiene',             // No tiene instrumento
    null                    // No ha respondido aún
  ],
  default: null
},

instrumentModel: {        // Detectado por Claude Vision desde foto
  type: String,           // Ej: "Yamaha P-45", "Casio CDP-S110"
  trim: true,
  default: null
},

cableType: {              // Cable necesario, identificado por Claude Vision
  type: String,
  enum: ['usb_b', 'usb_c', 'micro_usb', 'midi_5pin', 'no_necesita', null],
  default: null
},

cableStatus: {            // Si ya compró o necesita comprar el cable
  type: String,
  enum: ['no_necesita', 'identificado', 'link_enviado', 'comprado', 'pendiente'],
  default: 'pendiente'
},

setupStatus: {
  type: String,
  enum: ['pendiente', 'pendiente_cable', 'compatible', 'incompatible', 'resuelto'],
  default: 'pendiente'
},

studentGoal: {
  type: String,
  enum: [
    'aprender_desde_cero',
    'mejorar_tecnica',
    'tocar_canciones',
    'preparar_examen',       // Conservatorio, certificación
    'hobby',
    'otro'
  ],
  default: null
},

ageRange: {
  type: String,
  enum: ['menor_12', '13_17', '18_25', '26_35', '36_50', 'mayor_50'],
  default: null
},

suggestedTeacherId: {
  type: mongoose.Schema.Types.ObjectId,
  ref: 'User',
  default: null
},

// Modificar el enum de 'level' en beneficiaries para incluir 'never_played':
// beneficiaries[].level: enum → ['never_played', 'beginner', 'intermediate', 'advanced']

// Agregar a Lead.source enum:
// 'google_ads', 'meta_ads', 'whatsapp_bot', 'referido'


// ============================================
// CAMBIOS AL MODELO: CrmLead (crm/models/CrmLead.js)
// ============================================

// Agregar al pipelineStudent enum (flujo post-pago: pago → setup sala → asignación profesor):
// 'kit_pagado', 'setup_agendado', 'setup_resuelto', 'profesor_asignado', 'alumno_activo', 'churned'

// Agregar campo:
whatsappConversation: {
  status: {
    type: String,
    enum: ['no_iniciada', 'en_curso', 'calificado', 'oferta_enviada', 'pago_pendiente', 'onboarding', 'completada', 'abandonada'],
    default: 'no_iniciada'
  },
  currentPhase: { type: String, default: null },  // 'conocer', 'instrumento', 'calificar', 'oferta', 'pago', 'onboarding'
  startedAt: { type: Date },
  completedAt: { type: Date },
  // Historial de mensajes para Claude (context window)
  claudeMessages: [{
    role: { type: String, enum: ['user', 'assistant'] },
    content: { type: mongoose.Schema.Types.Mixed },  // Texto o array con imágenes
    timestamp: { type: Date, default: Date.now }
  }],
  // Datos extraídos por Claude durante la conversación
  extractedData: {
    instrumentDetected: { type: String },    // Modelo detectado por Vision
    cableIdentified: { type: String },       // Cable recomendado
    cableLinkSent: { type: Boolean, default: false },
    photoAnalyzed: { type: Boolean, default: false },
    incompatibleReason: { type: String },    // Si fue incompatible, por qué
    objectionHandled: [{ type: String }],    // Objeciones que se resolvieron
    escalatedToHuman: { type: Boolean, default: false },
    escalationReason: { type: String }
  }
}
```

**Índices adicionales recomendados:**
```javascript
// Para campañas de reactivación
Lead.index({ source: 1, status: 1, createdAt: -1 });
Lead.index({ instrumentType: 1, setupStatus: 1 });

// Para segmentación del bot
CrmLead.index({ 'whatsappConversation.status': 1 });
CrmLead.index({ pipelineStudent: 1, segment: 1 });
```

---

## 2. Bot Conversacional con IA (Claude + Vision)

### Filosofía del Bot

Este no es un bot de menú con opciones numeradas. Es un **asistente conversacional inteligente** impulsado por Claude (Anthropic) que:
- Mantiene una conversación natural y empática en español
- Usa **Claude Vision para analizar fotos** del instrumento del alumno
- Identifica modelo exacto, tipo de conexión y cable necesario directamente desde la imagen
- Pre-califica al alumno completamente ANTES del pago
- Hace el onboarding técnico (selección de cable + guía de compra) dentro del mismo chat
- Escala a humano solo cuando es estrictamente necesario

**Ventaja competitiva:** El bot reemplaza la "Asesoría Técnica" humana de 20 minutos. El alumno llega al setup con todo resuelto — instrumento validado, cable correcto ya comprado, setup claro.

### Arquitectura Técnica

```
┌────────────────┐    ┌──────────────────┐    ┌──────────────────────────────┐
│   Alumno        │    │   Twilio          │    │   PianoLink Server            │
│   WhatsApp      │◄──►│   WhatsApp API    │◄──►│                              │
│  (texto+fotos)  │    │   (media webhook) │    │   /api/bot/wa                │
└────────────────┘    └──────────────────┘    │   WhatsAppBotService.js      │
                                              │         │                    │
                                              │   ┌─────▼──────────────┐     │
                                              │   │  Claude API         │     │
                                              │   │  (Anthropic SDK)    │     │
                                              │   │  • Messages API     │     │
                                              │   │  • Vision (images)  │     │
                                              │   │  • System prompt    │     │
                                              │   └─────┬──────────────┘     │
                                              │         │                    │
                                              │   ┌─────▼──────────────┐     │
                                              │   │  Lead + CrmLead    │     │
                                              │   │  (MongoDB)         │     │
                                              │   └────────────────────┘     │
                                              └──────────────────────────────┘
```

### System Prompt de Claude (para el bot)

```
Eres el asistente de Piano Link, una plataforma de clases de piano online
con sala virtual y tecnología MIDI. Tu nombre es "Mía" (Musical Intelligence
Assistant).

PERSONALIDAD:
- Cercana, cálida, entusiasta pero profesional
- Usas emojis con moderación (1-2 por mensaje)
- Respuestas cortas (máx 3-4 párrafos por mensaje en WhatsApp)
- Idioma: español neutro latinoamericano

CONTEXTO DEL NEGOCIO:
- Piano Link conecta alumnos con profesores de piano en una sala virtual
  con tecnología MIDI que muestra las notas en tiempo real
- Kit de Bienvenida: $44 USD = setup en sala virtual + asignación de
  profesor + clase de prueba gratuita
- Flujo post-pago: 1) Setup en sala virtual (conectar piano, verificar
  MIDI, dejar todo funcionando), 2) Se le asigna el profesor ideal,
  3) Clase de prueba con ese profesor
- Mientras haya pocos profesores, nosotros asignamos al profesor (modelo
  concierge). El alumno NO elige ni ve un catálogo de profesores.
- El alumno necesita: piano digital o teclado electrónico con sonido propio
  + cable USB/MIDI para conectar al computador
- Los controladores MIDI SIN sonido propio NO son compatibles
- Los pianos acústicos funcionan SIN cable (solo cámara)

TU OBJETIVO:
Guiar al alumno por estas etapas (en orden, pero de forma natural):

1. CONOCER: nombre, país/ciudad
2. INSTRUMENTO: qué tiene en casa
   - Si envía FOTO → usar Vision para identificar modelo, tipo y puerto
   - Si no tiene → recomendar opciones por presupuesto
   - Si tiene controlador MIDI → explicar que necesita sonido propio
3. CABLE: identificar qué cable necesita → enviar link de compra local
4. CALIFICAR: nivel, objetivo, edad
5. OFRECER: Kit de Bienvenida $44 USD
6. PAGAR: enviar link de Mercado Pago
7. POST-PAGO: setup en sala virtual (conectar piano + verificar MIDI)
8. ASIGNACIÓN: se le asigna profesor + se agenda clase de prueba

CAPACIDAD DE VISION (CRÍTICA):
Cuando el alumno envíe una foto de su instrumento, analiza:
1. MODELO: identifica marca y modelo (ej: "Yamaha P-45")
2. TIPO: piano digital / teclado electrónico / controlador MIDI / piano acústico
3. COMPATIBILIDAD: ¿tiene parlantes/sonido propio?
4. PUERTO: identifica el puerto de conexión visible (USB-B, USB-C, MIDI 5-pin,
   Micro-USB). Busca en la parte trasera o lateral del instrumento.
5. CABLE NECESARIO: recomienda el cable exacto
6. Si no puedes ver el puerto en la foto, pide una foto de la parte
   trasera donde están las conexiones

RESPUESTAS SOBRE CABLE:
Cuando identifiques el cable necesario, responder con:
- Nombre exacto del cable (ej: "Cable USB tipo B a tipo A, 2 metros")
- Precio aproximado ($5-15 USD)
- Sugerencia: "Lo encuentras en MercadoLibre o cualquier tienda de
  electrónica/música de tu ciudad"
- NO enviar links a tiendas externas (el equipo enviará el link correcto
  después via función tool_call)

REGLAS:
- NUNCA inventar especificaciones técnicas si no estás seguro
- Si la foto no es clara, pedir otra foto con mejor ángulo
- Si no reconoces el modelo, preguntar directamente al alumno
- Mantener historial de conversación para no repetir preguntas
- Si el alumno hace preguntas fuera de tema, responder brevemente
  y redirigir al flujo
- Si pide hablar con un humano → confirmar y escalar inmediatamente
- Máximo 2 intentos de venta. Si dice "no" 2 veces → despedirse
  amablemente sin insistir
```

### Flujo Conversacional (Claude gestiona de forma natural)

A diferencia de un bot de menú, Claude maneja la conversación como un humano. Sin embargo, debe cubrir estas etapas en orden:

```
INICIO (mensaje entrante)
│
│  Claude: "¡Hola! 👋 Soy Mía, la asistente de Piano Link.
│           Te ayudo a encontrar tu profesor ideal de piano
│           y dejarte listo para tu primera clase online.
│           ¿Cómo te llamas?"
│
├── FASE 1: CONOCER AL ALUMNO (conversación libre)
│   │
│   │  Claude extrae de la conversación natural:
│   │  → nombre (obligatorio)
│   │  → país + ciudad (obligatorio)
│   │  → Si menciona nivel/objetivo espontáneamente, guardarlo
│   │
│   │  Ejemplo natural:
│   │  Alumno: "Hola, soy Camila de Concepción"
│   │  Claude: "¡Hola Camila! Qué bueno que nos escribes desde
│   │           Concepción 🎹 Cuéntame, ¿tienes un piano o
│   │           teclado en casa?"
│   │
│   └──→ FASE 2
│
├── FASE 2: DIAGNÓSTICO DE INSTRUMENTO + VISION
│   │
│   │  Claude pregunta si tiene instrumento. Tres caminos:
│   │
│   ├── CAMINO A: Tiene instrumento
│   │   │
│   │   │  Claude: "¡Genial! ¿Me puedes mandar una foto de tu
│   │   │           piano/teclado? Así puedo verificar qué cable
│   │   │           necesitas para conectarlo al computador y
│   │   │           usar nuestra sala virtual 📸"
│   │   │
│   │   ├── Alumno envía FOTO →
│   │   │   │
│   │   │   │  ┌─────────────────────────────────────────────┐
│   │   │   │  │         CLAUDE VISION ANALIZA               │
│   │   │   │  │                                             │
│   │   │   │  │  1. Identifica modelo (Yamaha P-45)         │
│   │   │   │  │  2. Confirma tipo (piano digital ✓)         │
│   │   │   │  │  3. Busca puertos visibles                  │
│   │   │   │  │  4. Determina cable necesario               │
│   │   │   │  └─────────────────────────────────────────────┘
│   │   │   │
│   │   │   ├── Puerto visible en la foto:
│   │   │   │   Claude: "¡Perfecto! Reconozco tu piano, es un
│   │   │   │            Yamaha P-45 (o similar). Excelente elección 👏
│   │   │   │
│   │   │   │            Veo que tiene un puerto USB tipo B en la
│   │   │   │            parte trasera (el cuadrado grande).
│   │   │   │
│   │   │   │            Necesitas un cable USB tipo B a tipo A,
│   │   │   │            de al menos 2 metros. Cuesta unos $5-10 USD
│   │   │   │            y lo encuentras en MercadoLibre o cualquier
│   │   │   │            tienda de música/electrónica.
│   │   │   │
│   │   │   │            ¿Ya tienes este cable o necesitas comprarlo?"
│   │   │   │
│   │   │   │   → Guardar: instrumentType, instrumentModel, cableType,
│   │   │   │              setupStatus = 'compatible'
│   │   │   │   → BACKEND: buscar link de MercadoLibre del cable y
│   │   │   │     enviarlo vía mensaje separado
│   │   │   │   → Ir a FASE 3
│   │   │   │
│   │   │   ├── Puerto NO visible en la foto:
│   │   │   │   Claude: "Veo tu piano, parece un {modelo}. Se ve muy
│   │   │   │            bien 🎹 Pero no alcanzo a ver los puertos
│   │   │   │            de conexión.
│   │   │   │
│   │   │   │            ¿Me puedes mandar una foto de la parte
│   │   │   │            trasera (o el costado izquierdo) donde
│   │   │   │            están las entradas USB o MIDI? 📸"
│   │   │   │
│   │   │   │   → Esperar segunda foto → re-analizar
│   │   │   │
│   │   │   └── Imagen no clara / no se reconoce:
│   │   │       Claude: "No logro distinguir bien el instrumento.
│   │   │                ¿Me dices la marca y modelo? Suele estar
│   │   │                impreso arriba del teclado o en una etiqueta
│   │   │                en la parte trasera."
│   │   │
│   │   │       → Alumno responde con texto → Claude busca en su
│   │   │         conocimiento el modelo y determina cable necesario
│   │   │
│   │   └── Alumno no quiere enviar foto:
│   │       Claude: "¡Sin problema! ¿Me dices la marca y modelo
│   │                de tu piano/teclado? Con eso puedo ayudarte
│   │                igualmente."
│   │       → Procesar por texto
│   │
│   ├── CAMINO B: Tiene controlador MIDI (incompatible)
│   │   │
│   │   │  Si Claude detecta por foto o texto que es un controlador MIDI:
│   │   │
│   │   │  Claude: "Veo que tienes un {modelo}, que es un controlador
│   │   │           MIDI. Estos están diseñados para producción musical
│   │   │           y no tienen parlantes propios.
│   │   │
│   │   │           Para nuestras clases el profesor necesita escucharte
│   │   │           en tiempo real, así que necesitas un instrumento con
│   │   │           sonido propio.
│   │   │
│   │   │           La buena noticia: hay opciones excelentes desde
│   │   │           $150 USD. ¿Te cuento cuáles recomendamos según
│   │   │           tu presupuesto?"
│   │   │
│   │   │  → Guardar: setupStatus = 'incompatible', tag: 'controlador_midi'
│   │   │  → Si quiere recomendación: dar opciones por rango de precio
│   │   │  → Activar secuencia follow-up D+7 ("¿ya tienes tu piano?")
│   │   │  → Si ya piensa comprar uno → continuar a FASE 3
│   │   │
│   │   │  DIFERENCIADOR CLAVE CON VISION:
│   │   │  Claude puede distinguir visualmente entre:
│   │   │  ✓ Teclado con parlantes (compatible) ← buscar rejillas/parlantes
│   │   │  ✗ Controlador sin parlantes (incompatible) ← sin rejillas, plano
│   │   │  Muchos alumnos NO saben si su teclado tiene sonido propio.
│   │   │  La foto resuelve esto sin preguntas confusas.
│   │   │
│   │   └── DETECCIÓN VISUAL DE COMPATIBILIDAD:
│   │       ┌───────────────────────────────────────────────────┐
│   │       │ LO QUE CLAUDE BUSCA EN LA FOTO:                  │
│   │       │                                                   │
│   │       │ ✅ COMPATIBLE (piano digital / teclado):          │
│   │       │   • Rejillas de parlantes visibles                │
│   │       │   • Perilla/slider de volumen                     │
│   │       │   • Pantalla LCD con sonidos                      │
│   │       │   • Puerto de auriculares (jack 6.35mm)           │
│   │       │   • Marca+modelo conocido de piano digital        │
│   │       │                                                   │
│   │       │ ❌ INCOMPATIBLE (controlador MIDI):               │
│   │       │   • Sin parlantes visibles (surface plana)        │
│   │       │   • Solo puerto USB (sin audio out)               │
│   │       │   • Pads de batería / knobs de producción         │
│   │       │   • Marcas: Akai, Novation Launchkey, Arturia     │
│   │       │     MiniLab, M-Audio Keystation                   │
│   │       │   • Tamaño muy compacto (25-49 teclas mini)       │
│   │       └───────────────────────────────────────────────────┘
│   │
│   └── CAMINO C: No tiene instrumento
│       │
│       │  Claude: "¡No te preocupes! Muchos alumnos empiezan así.
│       │           Te puedo orientar. ¿Cuánto te gustaría invertir
│       │           en tu primer piano/teclado?"
│       │
│       │  → Conversación libre sobre presupuesto
│       │  → Claude recomienda modelos específicos por rango:
│       │
│       │    $100-200 USD → Casio CT-S1, Yamaha PSR-E373
│       │    $300-500 USD → Casio CDP-S110, Yamaha P-45
│       │    $600+ USD   → Roland FP-30X, Kawai ES120
│       │
│       │  → Explicar qué incluir: cable USB, pedal de sustain
│       │  → Si tiene presupuesto y va a comprar → continuar a FASE 3
│       │  → Si necesita tiempo → Follow-up D+7, D+14
│       │
│       └──→ FASE 3 (cuando confirme que comprará/tiene instrumento)
│
├── FASE 3: CALIFICACIÓN (conversación natural)
│   │
│   │  Claude extrae de forma orgánica:
│   │  → nivel (nunca tocó / principiante / intermedio / avanzado)
│   │  → objetivo (desde cero / mejorar / canciones / examen / hobby)
│   │  → edad o rango etario
│   │
│   │  NO hace 3 preguntas seguidas tipo formulario.
│   │  Ejemplo natural:
│   │
│   │  Claude: "Camila, ¿has tocado piano antes o partes de cero?"
│   │  Alumna: "Tomé clases de chica pero dejé hace años"
│   │  Claude: "Ah, entonces tienes bases pero necesitas retomar.
│   │           ¿Y qué te gustaría lograr? ¿Tocar canciones que te
│   │           gustan, mejorar técnica, o algo más específico?"
│   │  Alumna: "Quiero tocar canciones que me gustan, tipo pop"
│   │  Claude: "¡Perfecto! Es el objetivo más popular entre nuestros
│   │           alumnos 🎵 Tengo todo lo que necesito para encontrarte
│   │           el profesor ideal."
│   │
│   │  → Guardar: level = 'beginner' (retomando), goal = 'tocar_canciones'
│   │  → Claude infiere edad del contexto conversacional si es posible,
│   │    o pregunta sutilmente: "¿eres adulta o buscas clases para
│   │    alguien más joven?"
│   │
│   └──→ FASE 4
│
├── FASE 4: OFERTA DEL KIT DE BIENVENIDA
│   │
│   │  Claude presenta la oferta de forma personalizada según el perfil:
│   │
│   │  Claude: "Camila, basándome en tu perfil te cuento lo que
│   │           tenemos para ti:
│   │
│   │           🎹 *Kit de Bienvenida Piano Link* — $44 USD
│   │
│   │           Incluye:
│   │           ✅ Setup en la sala virtual (conectamos tu {piano}
│   │              al computador y dejamos todo funcionando con
│   │              nuestra tecnología MIDI en tiempo real)
│   │           ✅ Te asignamos el profesor ideal según tu nivel
│   │              y objetivos
│   │           ✅ Clase de prueba gratuita con tu profesor
│   │              asignado
│   │
│   │           Es un pago único, sin compromisos posteriores.
│   │           ¿Te interesa?"
│   │
│   │  → Si pregunta algo → Claude responde de forma inteligente
│   │    (no lista de FAQs pregrabada, sino respuesta contextual)
│   │
│   │  MANEJO DE OBJECIONES (Claude responde libremente pero con estos facts):
│   │
│   │  "¿Por qué cobran?"
│   │  → El Kit incluye setup personalizado 1:1 en la sala virtual
│   │    (conectar tu piano, verificar MIDI, dejarte listo) +
│   │    asignación de profesor + clase de prueba.
│   │
│   │  "¿Qué pasa si no me gusta?"
│   │  → Pago único, cero compromisos. No se cobra nada más.
│   │
│   │  "¿No puedo solo probar gratis?"
│   │  → Sin el setup tu piano no se conecta a la sala virtual.
│   │    El setup técnico es lo que hace que la clase funcione.
│   │
│   │  "Es caro"
│   │  → Son 3 servicios por $44 USD (setup sala virtual $20 +
│   │    asignación profesor $10 + clase de prueba $14).
│   │    Por separado costarían ~$50-60 USD.
│   │
│   │  → Si dice SÍ → FASE 5
│   │  → Si dice NO → despedirse amable + activar follow-up
│   │  → Si pide hablar con humano → escalar inmediatamente
│   │
│   └──→ FASE 5
│
├── FASE 5: PAGO
│   │
│   │  Claude: "¡Excelente decisión, Camila! 🎉
│   │
│   │           Aquí tienes tu link de pago seguro:
│   │           🔗 {link_mercadopago_checkout}
│   │
│   │           Puedes pagar con tarjeta, débito o transferencia
│   │           vía Mercado Pago.
│   │
│   │           Apenas confirme el pago, te escribo con los
│   │           siguientes pasos ✅"
│   │
│   │  → BACKEND: Generar checkout Mercado Pago con datos del lead
│   │  → Guardar: pipelineStudent = 'oferta_enviada'
│   │  → Esperar webhook de confirmación de pago
│   │
│   └──→ FASE 6 (cuando webhook confirma pago)
│
├── FASE 6: SETUP EN LA SALA VIRTUAL (post-pago)
│   │
│   │  Una vez confirmado el pago, se agenda el setup en la sala
│   │  virtual. Claude prepara al alumno vía chat para que llegue
│   │  listo a la sesión de setup:
│   │
│   │  Claude: "🎉 ¡Pago confirmado! Bienvenida a Piano Link, Camila.
│   │
│   │           Ahora viene lo mejor: tu setup en la sala virtual 🎹
│   │
│   │           En esta sesión vamos a:
│   │           ✅ Conectar tu {Yamaha P-45} al computador
│   │           ✅ Verificar que el MIDI funcione en tiempo real
│   │           ✅ Dejarte todo configurado para tus clases
│   │
│   │           Para que el setup sea rápido, necesito confirmar:
│   │           1️⃣ ¿Tu piano está cerca de tu computador?
│   │           2️⃣ ¿Ya compraste el cable USB tipo B que hablamos?"
│   │
│   │  ├── Si ya tiene el cable:
│   │  │   Claude: "¡Perfecto! Entonces estás lista para el setup.
│   │  │
│   │  │            📋 *Checklist para tu sesión de setup:*
│   │  │            ✅ Piano cerca del computador
│   │  │            ✅ Cable USB tipo B listo
│   │  │            ✅ Chrome o Firefox actualizado
│   │  │            ✅ Auriculares conectados (recomendado)
│   │  │
│   │  │            ¿Qué horarios te acomodan esta semana para
│   │  │            el setup? Dura unos 15-20 minutos 📸"
│   │  │
│   │  │   → Guardar: setupStatus = 'listo_para_setup'
│   │  │
│   │  ├── Si NO tiene el cable aún:
│   │  │   Claude: "Sin problema. Te acabo de enviar el link para
│   │  │            comprar el cable correcto. En MercadoLibre
│   │  │            suele llegar en 1-2 días.
│   │  │
│   │  │            Cuando lo tengas, escríbeme y agendamos tu
│   │  │            sesión de setup ⚡"
│   │  │
│   │  │   → Guardar: setupStatus = 'pendiente_cable'
│   │  │   → Follow-up automático D+2: "¿llegó tu cable?"
│   │  │
│   │  └── Cuando alumno confirma horario para setup:
│   │      → Agendar sesión de setup en sala virtual
│   │      → Guardar: pipelineStudent = 'setup_agendado'
│   │      → Crear WelcomeKit en MongoDB
│   │      → Registrar CrmConversion(kit_purchase)
│   │      → Enviar email de confirmación (Resend)
│   │
│   │  DURANTE EL SETUP (en la sala virtual, no en chat):
│   │  → El alumno entra a pianolink.com
│   │  → Se conecta el piano vía USB/MIDI
│   │  → Se verifica que las notas se detectan en tiempo real
│   │  → Se configura el entorno de la sala virtual
│   │  → Guardar: setupStatus = 'resuelto'
│   │
│   └──→ FASE 7
│
├── FASE 7: ASIGNACIÓN DE PROFESOR + CLASE DE PRUEBA
│   │
│   │  Una vez completado el setup, se le asigna un profesor.
│   │  Mientras haya pocos profesores → modelo concierge
│   │  (nosotros elegimos, alumno no ve catálogo):
│   │
│   │  Claude: "🎹 ¡Setup completado! Tu piano está conectado
│   │           y funcionando perfecto en la sala virtual.
│   │
│   │           Ahora viene lo mejor: según tu perfil (nivel
│   │           {level}, objetivo: {goal}), te hemos asignado
│   │           a {nombre_profesor} como tu profesor/a.
│   │
│   │           {nombre_profesor} tiene {X} años de experiencia
│   │           y se especializa en {especialidad_relevante}.
│   │           ¡Es justo lo que necesitas!
│   │
│   │           Tu clase de prueba queda para {fecha_hora}.
│   │           Te enviaré un recordatorio 24 horas antes.
│   │
│   │           Si tienes cualquier duda, escríbeme por aquí.
│   │           ¡Nos vemos pronto! 🎶"
│   │
│   │  → BACKEND: Ejecutar algoritmo de matching (ver Sección 5.3)
│   │  → Guardar: pipelineStudent = 'profesor_asignado'
│   │  → Crear StudentEnrollment con profesor asignado
│   │  → Agendar clase de prueba según disponibilidad profesor
│   │  → Programar recordatorio WhatsApp 24h antes
│   │
│   │  REGLA CONCIERGE (mientras haya pocos profesores):
│   │  → Presentar al profesor como "el ideal para ti"
│   │  → Nunca decir "es el único disponible"
│   │  → Destacar la fortaleza del profesor que aplica al perfil
│   │  → Si solo hay 1 profesor y no hay match de horario:
│   │    → Escalar a humano para coordinar manualmente
│   │
│   └── FIN de conversación activa
│
└── SEGUIMIENTO INTELIGENTE (leads que NO convirtieron)
    │
    │  Claude genera mensajes personalizados basados en el
    │  contexto de la conversación original (no templates genéricos):
    │
    ├── D+1 (24 horas):
    │   Claude (contextual): "Hola Camila 👋 Ayer me quedé pensando
    │   en que mencionaste que querías tocar canciones pop. Tenemos
    │   un profesor que se especializa justo en eso. ¿Te cuento más?"
    │
    ├── D+3 (72 horas):
    │   Claude (contextual): "Camila, dato curioso: el 70% de nuestros
    │   alumnos que empezaron como tú (con bases pero retomando)
    │   logran tocar su primera canción completa en 3 semanas. 🎵
    │   ¿Alguna duda que pueda resolver?"
    │
    ├── D+7 (incentivo):
    │   Claude: "Último mensaje, Camila 😊
    │   Tenemos un descuento de 15% en el Kit por esta semana.
    │   Código: PIANOLINK15 → Tu precio: $37 USD
    │   🔗 {link_checkout}
    │   Si cambias de opinión más adelante, aquí estaré. ¡Éxito! 🎹"
    │
    └── Después de D+7 sin respuesta:
        → segment = 'cold'
        → No contactar por WhatsApp en 60 días
        → Mantener en secuencia de email (Resend) si aplica
```

### Base de Conocimiento de Cables por Instrumento (para Claude)

Claude tiene conocimiento general de modelos de piano, pero el system prompt incluye esta referencia rápida para los modelos más comunes en Chile/Latam:

```
┌──────────────────────────────────────────────────────────────────────┐
│  REFERENCIA DE CABLES POR MODELO (top 20 en Latam)                  │
├──────────────────────┬──────────────┬────────────────────────────────┤
│ Modelo               │ Puerto       │ Cable Necesario               │
├──────────────────────┼──────────────┼────────────────────────────────┤
│ Yamaha P-45/P-143    │ USB-B        │ USB-B a USB-A (2m)            │
│ Yamaha P-125/P-225   │ USB-B        │ USB-B a USB-A (2m)            │
│ Yamaha PSR-E373/E473 │ USB-B        │ USB-B a USB-A (2m)            │
│ Yamaha CLP series    │ USB-B        │ USB-B a USB-A (2m)            │
│ Casio CDP-S110/S160  │ USB-B        │ USB-B a USB-A (2m)            │
│ Casio CT-S1/CT-S400  │ USB Micro-B  │ Micro-USB a USB-A (2m)        │
│ Casio PX-S1100       │ USB-B        │ USB-B a USB-A (2m)            │
│ Casio Privia PX-770  │ USB-B        │ USB-B a USB-A (2m)            │
│ Roland FP-30X        │ USB-B        │ USB-B a USB-A (2m)            │
│ Roland FP-10         │ USB-B        │ USB-B a USB-A (2m)            │
│ Roland GO:PIANO      │ USB Micro-B  │ Micro-USB a USB-A (2m)        │
│ Kawai ES120          │ USB-B        │ USB-B a USB-A (2m)            │
│ Kawai KDP120         │ USB-B        │ USB-B a USB-A (2m)            │
│ Korg B2/B2SP        │ USB-B        │ USB-B a USB-A (2m)            │
│ Nord Piano 5         │ USB-B        │ USB-B a USB-A (2m)            │
│ Alesis Recital       │ USB-B        │ USB-B a USB-A (2m)            │
│ M-Audio Hammer 88    │ USB-B        │ USB-B a USB-A (2m) ⚠️ CTRL   │
│ Arturia KeyLab       │ USB-B        │ N/A ⚠️ CONTROLADOR            │
│ Akai MPK Mini        │ USB Micro-B  │ N/A ⚠️ CONTROLADOR            │
│ Novation Launchkey   │ USB-B        │ N/A ⚠️ CONTROLADOR            │
├──────────────────────┴──────────────┴────────────────────────────────┤
│ ⚠️ CTRL = Controlador MIDI sin sonido propio — INCOMPATIBLE        │
│ 💡 ~80% de pianos digitales usan USB-B. Es el cable más común.     │
│ 💡 Pianos con solo MIDI 5-pin DIN necesitan interfaz MIDI-USB       │
│    (ej: Roland UM-ONE mk2, ~$40 USD)                               │
└──────────────────────────────────────────────────────────────────────┘
```

### Implementación Técnica

```javascript
// === WhatsAppBotService.js (estructura principal) ===

const Anthropic = require('@anthropic-ai/sdk');

class WhatsAppBotService {
  constructor() {
    this.claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    // Historial de conversación por número de teléfono
    // Map<phoneNumber, { messages: [], leadData: {}, phase: string }>
    this.conversations = new Map();
  }

  async processMessage(from, messageBody, mediaUrl = null) {
    // 1. Recuperar o crear conversación
    let convo = this.conversations.get(from) || this._initConvo(from);

    // 2. Construir mensajes para Claude
    const messages = [...convo.messages];

    if (mediaUrl) {
      // Descargar imagen de Twilio y enviar a Claude Vision
      const imageBuffer = await this._downloadMedia(mediaUrl);
      messages.push({
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64',
            media_type: 'image/jpeg',
            data: imageBuffer.toString('base64') }},
          { type: 'text', text: messageBody || 'Aquí está la foto de mi piano' }
        ]
      });
    } else {
      messages.push({ role: 'user', content: messageBody });
    }

    // 3. Llamar a Claude con system prompt + historial completo
    const response = await this.claude.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,  // Respuestas cortas para WhatsApp
      system: SYSTEM_PROMPT,
      messages: messages,
      // Tool use para acciones del backend
      tools: [
        { name: 'save_lead_data',
          description: 'Guardar datos del lead en MongoDB',
          input_schema: { /* nombre, pais, ciudad, instrumento, etc. */ }},
        { name: 'generate_payment_link',
          description: 'Generar link de Mercado Pago para el Kit',
          input_schema: { /* email, nombre, monto */ }},
        { name: 'search_cable_link',
          description: 'Buscar link de compra del cable en MercadoLibre',
          input_schema: { /* tipo_cable, pais */ }},
        { name: 'escalate_to_human',
          description: 'Escalar a agente humano',
          input_schema: { /* razon */ }},
        { name: 'schedule_followup',
          description: 'Programar mensaje de seguimiento',
          input_schema: { /* delay_hours, context */ }}
      ]
    });

    // 4. Procesar tool calls si las hay
    // 5. Guardar mensajes en historial
    // 6. Enviar respuesta via Twilio

    return response;
  }
}
```

### Costo Estimado de Claude API

| Concepto | Estimación |
|---|---|
| Mensajes promedio por lead | ~12-15 (ida y vuelta) |
| Tokens promedio por conversación | ~3,000 input + ~2,000 output |
| Costo por conversación (claude-sonnet) | ~$0.02-0.04 USD |
| Con imágenes (Vision) | +$0.01-0.02 por imagen |
| **Costo por lead calificado** | **~$0.05-0.08 USD** |
| 100 leads/mes | **~$5-8 USD/mes** |
| 500 leads/mes | **~$25-40 USD/mes** |

**Comparación:** Una asesoría técnica humana de 20 min cuesta ~$5-10 USD en tiempo de equipo. El bot con Claude cuesta $0.05-0.08 USD por la misma tarea.

### Mapa Visual del Bot con Claude AI

```
                         ┌──────────────┐
                         │   INICIO     │
                         │  (WhatsApp)  │
                         └──────┬───────┘
                                │
                     ┌──────────▼──────────┐
                     │  FASE 1: CONOCER    │
                     │  nombre, país,      │
                     │  ciudad             │
                     │  (conv. natural)    │
                     └──────────┬──────────┘
                                │
                ┌───────────────▼───────────────┐
                │    FASE 2: INSTRUMENTO        │
                │    "¿Tienes piano/teclado?"   │
                └──┬────────────┬───────────┬───┘
                   │            │           │
          ┌────────▼───┐  ┌────▼─────┐  ┌──▼──────────┐
          │ TIENE      │  │ CTRL     │  │ NO TIENE    │
          │ instrumento│  │ MIDI     │  │             │
          └────┬───────┘  └────┬─────┘  └──┬──────────┘
               │               │           │
        ┌──────▼──────┐  (incomp.)    Recomendación
        │ "Mándame    │  Explicar     por presupuesto
        │  una foto   │  + recomendar      │
        │  📸"        │  alternativa  Follow-up D+7
        └──────┬──────┘       │            │
               │              └────────────┤
     ┌─────────▼─────────┐                │
     │  CLAUDE VISION     │                │
     │                    │                │
     │ • Identifica modelo│                │
     │ • Tipo instrumento │                │
     │ • Puerto conexión  │                │
     │ • Cable necesario  │                │
     │ • ¿Compatible?     │                │
     └─────────┬──────────┘                │
               │                           │
     ┌─────────▼─────────┐                │
     │ LINK DE COMPRA     │                │
     │ DEL CABLE          │                │
     │ (MercadoLibre)     │                │
     └─────────┬──────────┘                │
               │◄──────────────────────────┘
               │
     ┌─────────▼──────────┐
     │  FASE 3: CALIFICAR │
     │  nivel, objetivo,  │
     │  edad              │
     │  (conv. natural)   │
     └─────────┬──────────┘
               │
     ┌─────────▼──────────┐
     │  FASE 4: OFERTA    │
     │  Kit $44 USD       │
     │  (personalizada)   │
     └────┬──────────┬────┘
          │          │
     ┌────▼───┐ ┌───▼────────┐
     │  SÍ    │ │  Objeción  │
     └────┬───┘ │  /Dudas    │
          │     └───┬────────┘
          │    Claude responde
          │    inteligentemente
          │         │
          │◄────────┘
          │
     ┌────▼──────────┐
     │ FASE 5: PAGO  │
     │ Link MP       │
     └────┬──────────┘
          │ (webhook)
     ┌────▼──────────────┐
     │ FASE 6: ONBOARD   │
     │ Post-pago:        │
     │ • ¿Tiene cable?   │
     │ • Verificar setup │
     │   (foto conexión) │
     │ • Checklist       │
     │ • Agendar         │
     └────┬──────────────┘
          │
     ┌────▼──────────┐
     │ FASE 7: CIERRE│
     │ Recordatorio   │
     │ 24h antes      │
     └───────────────┘
```

---

## 3. Estrategia de Anuncios — Chile (Fase 1)

### 3.1 Google Search Ads

#### Palabras Clave (15 keywords)

| # | Keyword | Tipo de Concordancia | Intención | CPC Est. (CLP) |
|---|---------|---------------------|-----------|----------------|
| 1 | clases de piano online | Frase | Alta | $300-500 |
| 2 | profesor de piano online | Frase | Alta | $250-450 |
| 3 | aprender piano online | Frase | Alta | $200-400 |
| 4 | clases de piano para principiantes | Frase | Alta | $200-350 |
| 5 | clases de piano para niños online | Frase | Media | $250-400 |
| 6 | curso de piano online en vivo | Frase | Alta | $300-500 |
| 7 | piano clases particulares | Amplia Mod. | Alta | $200-350 |
| 8 | aprender a tocar piano desde cero | Frase | Alta | $150-300 |
| 9 | profesor particular de piano | Frase | Alta | $250-450 |
| 10 | clases de piano santiago | Frase | Local | $200-400 |
| 11 | clases piano online chile | Frase | Local | $300-500 |
| 12 | clase de prueba piano | Frase | Alta | $200-350 |
| 13 | piano online para adultos | Frase | Media | $150-300 |
| 14 | teclado clases online | Amplia Mod. | Media | $150-250 |
| 15 | aprender piano adulto | Frase | Media | $150-300 |

**Keywords negativas sugeridas:**
- gratis, gratuito, free
- descargar, download, pdf
- partituras, sheets
- midi controlador (evitar productores)
- guitarra, canto, violín
- presencial (solo online)

#### 3 Variantes de Anuncio Responsivo (RSA)

**Variante A — Genérica**

| Componente | Texto |
|---|---|
| Titular 1 | Clases de Piano Online en Vivo |
| Titular 2 | Profesor Personal • Sala Virtual |
| Titular 3 | Tecnología MIDI + Videollamada |
| Titular 4 | Primer Paso: Kit de Bienvenida $44 USD |
| Titular 5 | Elige Tu Profesor Ideal |
| Descripción 1 | Clases particulares de piano con sala virtual propia y tecnología que muestra las notas que tocas en tiempo real. Incluye clase de prueba. |
| Descripción 2 | Entrevista personal + setup de plataforma + clase de prueba gratuita. Profesores con experiencia, horarios flexibles. Empieza hoy. |
| URL final | pianolink.com/alumnos |
| Extensiones | Sitelinks: "Ver Profesores", "Kit de Bienvenida", "Cómo Funciona", "Precios" |

**Variante B — Principiantes**

| Componente | Texto |
|---|---|
| Titular 1 | Aprende Piano Desde Cero • Online |
| Titular 2 | Tu Primera Canción en 4 Semanas |
| Titular 3 | Profesor Personal Para Principiantes |
| Titular 4 | Sin Experiencia? Perfecto |
| Titular 5 | Clase de Prueba Incluida |
| Descripción 1 | ¿Siempre quisiste aprender piano? Con Piano Link tienes un profesor que se adapta a tu ritmo, en una sala virtual con tecnología MIDI. |
| Descripción 2 | Kit de Bienvenida $44 USD: diagnóstico personal + setup técnico + clase de prueba gratuita. Sin compromisos posteriores. |

**Variante C — Geolocalizada Chile**

| Componente | Texto |
|---|---|
| Titular 1 | Clases de Piano Online • Chile |
| Titular 2 | Profesores en Tu Zona Horaria |
| Titular 3 | Paga con Mercado Pago Chile |
| Titular 4 | Horarios Flexibles • Desde Tu Casa |
| Titular 5 | Kit de Bienvenida Desde $44 USD |
| Descripción 1 | Profesores verificados, sala virtual con tecnología MIDI, pago seguro con Mercado Pago. Clases particulares desde la comodidad de tu hogar en Chile. |
| Descripción 2 | Empieza con una entrevista personal para encontrar tu profesor ideal. Incluye setup técnico y clase de prueba. Horarios de lunes a sábado. |

#### Configuración Recomendada

| Parámetro | Valor |
|---|---|
| **Presupuesto diario** | $5.000-8.000 CLP (~$5-8 USD) |
| **Presupuesto mensual** | $150.000-240.000 CLP (~$150-240 USD) |
| **Estrategia de puja** | Maximizar conversiones (después de 30 conversiones: CPA objetivo) |
| **CPA objetivo** | $8.000 CLP (~$8 USD) por lead calificado |
| **Segmentación geográfica** | Chile completo (énfasis Región Metropolitana) |
| **Horarios** | Lun-Vie 8:00-22:00, Sáb 9:00-20:00 |
| **Dispositivos** | Mobile 60%, Desktop 40% |
| **Red** | Solo Búsqueda (NO Display para comenzar) |
| **Idioma** | Español |
| **Página de destino** | Landing dedicada con formulario + botón WhatsApp |

### 3.2 Meta Ads (Facebook + Instagram)

#### Audiencia 1 — Prospección (Top of Funnel)

| Parámetro | Valor |
|---|---|
| **Objetivo** | Generación de leads / Conversiones |
| **Ubicación** | Chile |
| **Edad** | 18-55 |
| **Intereses** | Piano, Música clásica, Aprender música, Yamaha, Casio, Roland, Educación musical, Clases de música |
| **Exclusión** | Productores musicales, DJ, Ableton, FL Studio |
| **Formato** | Video corto (15-30s) mostrando la sala virtual + Carrusel con testimonio |

**Copy Anuncio de Entrada:**

```
🎹 ¿Siempre quisiste tocar piano?

Con Piano Link aprendes desde tu casa con un profesor
personal y tecnología que muestra las notas que tocas
en tiempo real.

✅ Entrevista personal para elegir tu profesor ideal
✅ Setup técnico de la plataforma
✅ Clase de prueba gratuita incluida

Todo por $44 USD — sin compromisos.

👉 Empieza tu camino musical hoy
[BOTÓN: Más información]
```

#### Audiencia 2 — Remarketing (Middle/Bottom of Funnel)

| Parámetro | Valor |
|---|---|
| **Audiencia** | Visitantes de landing últimos 30 días que NO compraron |
| **Audiencia 2B** | Personas que iniciaron checkout pero no completaron |
| **Formato** | Imagen estática con testimonio + precio |

**Copy Anuncio de Remarketing:**

```
🎵 {nombre}, ¡tu piano te espera!

Vimos que estuviste viendo Piano Link.
¿Sabías que el 85% de nuestros alumnos toca su
primera canción completa en las primeras 4 semanas?

Tu Kit de Bienvenida incluye:
🎹 Entrevista personal 1:1
⚙️ Setup técnico completo
🎓 Clase de prueba GRATIS

Solo $44 USD. Sin letras chicas.

[BOTÓN: Completar mi inscripción]
```

#### Presupuesto Meta Ads

| Parámetro | Valor |
|---|---|
| **Presupuesto diario** | $3.000-5.000 CLP (~$3-5 USD) |
| **Presupuesto mensual** | $90.000-150.000 CLP (~$90-150 USD) |
| **Split** | 70% prospección, 30% remarketing |
| **Optimización** | Conversiones (evento: Lead o Purchase) |

#### Métricas Clave a Trackear

| Métrica | Fórmula | Umbral Aceptable | Umbral Óptimo |
|---|---|---|---|
| **CPL** (Costo por Lead) | Gasto / Leads | < $5 USD | < $3 USD |
| **Lead → Kit pagado** | Kits pagados / Leads | > 5% | > 10% |
| **Kit → Alumno activo** | Alumnos activos / Kits pagados | > 40% | > 60% |
| **CAC** | Gasto total / Alumnos activos | < $50 USD | < $30 USD |
| **ROAS mensual** | Revenue alumnos / Gasto ads | > 2x | > 4x |
| **CTR (Google)** | Clicks / Impressions | > 3% | > 5% |
| **CTR (Meta)** | Clicks / Impressions | > 1% | > 2% |
| **Tasa de rebote landing** | Salidas / Visitas landing | < 60% | < 40% |

---

## 4. Plan de Reactivación de Lista Fría (6.000 Contactos)

### 4.1 Secuencia de Reactivación por Email

La secuencia tiene 4 emails espaciados, respetando el límite de 100/día de Resend Free.

#### Email 1 — Reactivación suave (día 0)

| Campo | Valor |
|---|---|
| **Asunto** | {nombre}, ¿sigues interesado/a en el piano? 🎹 |
| **Asunto B** | Algo nuevo para ti: clases de piano online con sala virtual |
| **Preview** | La tecnología cambió. Ahora puedes aprender piano desde tu casa. |

```
Hola {nombre},

Te escribimos porque hace un tiempo mostraste interés en
aprender música a través de Escuela de Música Resonancias.

Hoy existe una nueva forma de aprender piano: Piano Link.

🎹 Sala virtual con tecnología MIDI
👨‍🏫 Profesor personal que se adapta a tu ritmo
🏠 Desde la comodidad de tu casa
📱 Solo necesitas un piano digital + computador

¿Quieres saber más?

[BOTÓN: Ver cómo funciona →]

Un abrazo musical,
Equipo Piano Link

---
Si no quieres recibir más emails, haz clic aquí: [unsub]
```

#### Email 2 — Valor + Social proof (día 4)

| Campo | Valor |
|---|---|
| **Asunto** | Así se ve una clase de piano online (video de 60 seg) |
| **Preview** | Mira cómo funciona la sala virtual y la tecnología MIDI. |

```
Hola {nombre},

¿Alguna vez te preguntaste cómo puede funcionar una clase
de piano por internet?

👆 Mira este video de 60 segundos:
[VIDEO/GIF: demo de la sala virtual]

Lo que ves:
✅ El alumno toca en su piano → las notas aparecen en
   la pantalla del profesor en tiempo real
✅ El profesor puede mostrar ejercicios en su piano →
   el alumno los ve en tiempo real
✅ Todo funciona con videollamada + tecnología MIDI

Nuestro Kit de Bienvenida ($44 USD) incluye tu setup
completo + clase de prueba gratuita.

[BOTÓN: Quiero mi clase de prueba →]
```

#### Email 3 — Urgencia + Objeciones (día 8)

| Campo | Valor |
|---|---|
| **Asunto** | 3 razones por las que nunca es tarde para aprender piano |
| **Preview** | El 60% de nuestros alumnos empiezan de cero. Tú también puedes. |

```
Hola {nombre},

"Ya estoy muy viejo/a para aprender." — Lo escuchamos todo
el tiempo. Pero la verdad es:

1️⃣ El 60% de nuestros alumnos empieza de CERO
2️⃣ No hay edad límite: tenemos alumnos de 8 a 72 años
3️⃣ Con un profesor personal, avanzas a TU ritmo

Lo único que necesitas:
🎹 Un piano digital o teclado electrónico
💻 Un computador con internet
⏰ 30-45 minutos a la semana

¿Te gustaría que evaluemos tu caso?
Nuestro Kit de Bienvenida incluye una entrevista
personal donde diagnosticamos tus necesidades.

[BOTÓN: Agendar mi entrevista →]

PD: Si no tienes piano, en la entrevista te orientamos
sobre qué comprar según tu presupuesto.
```

#### Email 4 — Último intento + Incentivo (día 14)

| Campo | Valor |
|---|---|
| **Asunto** | Descuento especial para ex-alumnos de Resonancias |
| **Preview** | 15% de descuento en el Kit de Bienvenida. Solo esta semana. |

```
Hola {nombre},

Este es el último email de esta serie.

Por ser parte de la comunidad de Resonancias, tenemos
un descuento exclusivo para ti:

🎹 Kit de Bienvenida Piano Link
   Precio normal: $44 USD
   Tu precio: $37 USD (usa el código RESONANCIAS15)

El Kit incluye:
✅ Entrevista personal 1:1
✅ Setup técnico de la plataforma
✅ Clase de prueba gratuita

El código es válido por 7 días.

[BOTÓN: Usar mi descuento →]

Si el piano no es lo tuyo, lo entendemos perfectamente.
No te enviaremos más emails.

Un abrazo,
Equipo Piano Link
```

### 4.2 Criterios de Segmentación y Priorización

```
ENVÍO:
  Tier 1 (alta_piano):  Días 1-14    → 1,320 contactos
  Tier 2 (composición): Días 15-18   → 400 contactos
  Tier 3 (media):       Días 19-43   → 2,500 contactos
  Tier 4 (baja):        Días 44-61   → 1,780 contactos

DENTRO DE CADA TIER (sub-orden):
  1. Contactos con WhatsApp (migrable al bot)
  2. Contactos con nombre completo + ciudad
  3. Solo email
```

### 4.3 Tiempo Total

| Concepto | Duración |
|---|---|
| Email 1 (toda la lista) | 61 días laborales |
| Emails 2-4: solo a quienes abrieron E1 | Variable: si 20% abre → ~1,200 contactos → 12 días × 3 emails = 36 días |
| **Total campaña completa** | **~3 meses** (61 + 36 = 97 días, con overlap) |

### 4.4 Qué hacer con los resultados

| Comportamiento | Acción |
|---|---|
| **Abrió email 1** | Enviar emails 2, 3 y 4 en secuencia |
| **Clickeó en algún email** | Marcar como `segment: 'warm'`, priorizar en remarketing Meta Ads |
| **Respondió al email** | Crear CrmInteraction tipo `email_reply`, escalar a follow-up manual |
| **Abrió pero no clickeó** | Enviar hasta email 4, luego pausar |
| **No abrió ninguno** | Después de email 1, NO enviar más. Marcar como `segment: 'cold'` y excluir de futuros envíos por 6 meses |
| **Se desuscribió** | Marcar `emailPreferences.unsubscribed = true` inmediatamente, nunca volver a enviar |
| **Email rebotó** | Marcar `emailPreferences.bounced = true`, limpiar de la lista |

### 4.5 Migración al Bot de WhatsApp

Para los contactos que tienen número de WhatsApp y abrieron/clickearon algún email:

1. **Filtrar:** `CrmLead.segment IN ('warm', 'hot')` AND `Lead.whatsapp != null`
2. **Enviar mensaje proactivo** (template aprobado por Meta/Twilio):
   ```
   "Hola {nombre}, soy de Piano Link. Vimos que te interesó nuestra
   plataforma de piano online. ¿Te gustaría que te cuente más por aquí?
   Responde SÍ para continuar."
   ```
3. Si responde "SÍ" → activar flujo del bot desde PASO 2 (ya tenemos el nombre)
4. Si no responde en 48h → no insistir por WhatsApp. Mantener en secuencia de email.

**Volumen estimado de migración al bot:**
- Si 20% de la lista abre emails: ~1,200 contactos
- Si 50% de esos tienen WhatsApp: ~600 contactos
- Si 30% responde al mensaje proactivo: ~180 leads calificados vía bot

### 4.6 Estrategia táctica: De 0 a 10 alumnos con la lista fría

Esta es la guía de ejecución semana a semana para llegar a los primeros 10 alumnos usando SOLO la lista fría, con presupuesto $0 en ads, respetando el límite de 100 emails/día y protegiendo la reputación del dominio `pianolink.net`.

#### Protección de reputación del dominio

**El riesgo:** La lista tiene 6.000 contactos de Resonancias que no han sido contactados por Piano Link antes. Es una lista fría legítima (contactos que consultaron por clases de música), pero para Resend/Gmail/Outlook, `pianolink.net` es un dominio nuevo enviando a destinatarios desconocidos. Un bounce rate > 5% o complaint rate > 0.3% puede marcar el dominio como spam.

**Prerrequisitos antes de enviar el primer email:**

```
┌────────────────────────────────────────────────────────────────┐
│  CHECKLIST DE REPUTACIÓN (completar ANTES del Día 1)          │
│                                                                │
│  □ Verificar dominio en Resend (SPF + DKIM automáticos) ✅    │
│  □ Agregar registro DMARC en DNS:                             │
│    _dmarc.pianolink.net → v=DMARC1; p=none; rua=mailto:...   │
│  □ Configurar webhook Resend para bounces/complaints:         │
│    POST /api/crm/webhooks/resend/events ✅ (ya implementado)  │
│  □ Verificar que RESEND_WEBHOOK_SECRET está configurado        │
│  □ From address = halo@pianolink.net ✅ (ya configurado)      │
│  □ Crear página de unsubscribe funcional ✅ (ya implementado) │
│  □ Tener landing page de destino activa y funcionando          │
│  □ Preparar los 4 templates de email (sección 4.1)            │
└────────────────────────────────────────────────────────────────┘
```

#### Warm-up del dominio (Semana 0 — antes de tocar la lista fría)

**Nunca enviar 100 emails/día a contactos fríos el día 1.** El dominio no tiene historial de envío. Hay que construir reputación gradualmente.

```
SEMANA 0: WARM-UP (5 días, antes de la lista fría)

Día 1:  10 emails → a contactos CONOCIDOS (equipo, amigos, profesores)
        Pedir que abran, respondan, y cliqueen el link
        Esto genera señales positivas para Gmail/Outlook

Día 2:  20 emails → mismos + algunos contactos Tier 1 seleccionados
        a mano (los que tienen nombre completo + email Gmail/Outlook)

Día 3:  30 emails → empezar Tier 1 con sub-selección de calidad

Día 4:  50 emails → mezclar: 10 conocidos + 40 Tier 1

Día 5:  75 emails → Tier 1

→ Total warm-up: ~185 emails en 5 días
→ Objetivo: 0 bounces, 0 complaints, > 30% open rate
```

**Si en el warm-up hay:**
- Bounce rate > 3% → PARAR. Limpiar lista antes de continuar.
- Complaint rate > 0 → Revisar contenido y formato del email.
- Open rate < 10% → Revisar asunto y from name. Puede estar cayendo en spam.

#### Plan de ejecución: Semanas 1-4

```
┌──────────────────────────────────────────────────────────────────────┐
│  SEMANA 1 — PRIMER CONTACTO TIER 1 (primeros 500 de 1,320)         │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Envío diario: 100 emails/día (ya warm-up pasó)                     │
│  Total semana: 500 contactos de Tier 1 (alta_piano)                 │
│                                                                      │
│  DISTRIBUCIÓN DIARIA:                                                │
│  ┌──────────────────────────────────────────┐                       │
│  │ Hora de envío: 10:00 AM Chile (UTC-3)    │                       │
│  │ Martes a sábado (evitar lunes y domingo) │                       │
│  │ 100 emails/día × 5 días = 500 enviados   │                       │
│  └──────────────────────────────────────────┘                       │
│                                                                      │
│  Enviar SOLO Email 1 (reactivación suave)                           │
│  NO enviar emails 2-4 aún → esperar datos de apertura              │
│                                                                      │
│  MONITOREO DIARIO (obligatorio):                                     │
│  ┌──────────────────────────────────────────────────────────┐       │
│  │ Métrica          │ Saludable    │ Alerta       │ Parar  │       │
│  ├──────────────────┼──────────────┼──────────────┼────────┤       │
│  │ Bounce rate      │ < 2%         │ 2-5%         │ > 5%   │       │
│  │ Complaint rate   │ 0%           │ 0.1-0.3%     │ > 0.3% │       │
│  │ Open rate        │ > 15%        │ 10-15%       │ < 10%  │       │
│  │ Unsubscribe rate │ < 2%         │ 2-5%         │ > 5%   │       │
│  └──────────────────┴──────────────┴──────────────┴────────┘       │
│                                                                      │
│  Si alguna métrica llega a "Parar":                                  │
│  → Detener envíos inmediatamente                                    │
│  → Diagnosticar causa (lista sucia, contenido spam, DNS mal)        │
│  → Limpiar bounces de la lista                                      │
│  → Esperar 48h antes de reanudar con volumen reducido (50/día)      │
│                                                                      │
│  RESULTADO ESPERADO SEMANA 1:                                        │
│  500 enviados × 20% open = 100 abrieron                            │
│  100 abrieron × 15% click = 15 clickearon                          │
│  15 clicks → pasan a embudo de conversión                           │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│  SEMANA 2 — DOBLE CARRIL: Tier 1 restante + Follow-up              │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  El límite de 100/día se COMPARTE entre nuevos envíos y follow-up.  │
│  Prioridad: follow-up a quienes abrieron > envío a nuevos.         │
│                                                                      │
│  DISTRIBUCIÓN DIARIA:                                                │
│  ┌──────────────────────────────────────────────────────┐           │
│  │ 30 emails/día → Email 2 a quienes abrieron Email 1  │           │
│  │                  (Semana 1 generó ~100 opens)         │           │
│  │                  100 ÷ 30/día = 3-4 días             │           │
│  │                                                       │           │
│  │ 70 emails/día → Email 1 a nuevos Tier 1              │           │
│  │                  70 × 5 días = 350 nuevos             │           │
│  └──────────────────────────────────────────────────────┘           │
│                                                                      │
│  MIGRACIÓN A WHATSAPP (en paralelo):                                 │
│  De los 15 que clickearon en Semana 1:                              │
│  → Filtrar quienes tienen WhatsApp (~50% = 7-8 contactos)          │
│  → Enviar template proactivo (ver Sección 4.5)                     │
│  → Quienes respondan "SÍ" → entran al bot Claude                  │
│  → El bot los pre-califica y ofrece el Kit ($44)                   │
│                                                                      │
│  RESULTADO ESPERADO SEMANA 2:                                        │
│  Email 2 enviado a: 100 contactos                                   │
│  Email 1 enviado a: 350 contactos nuevos (total Tier 1: 850)       │
│  Nuevos opens: ~70 (20% de 350)                                    │
│  Clicks acumulados: ~25                                             │
│  Leads en bot WhatsApp: ~5-8                                        │
│  PRIMERAS VENTAS DE KIT: ~2-3 alumnos                              │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│  SEMANA 3 — CIERRE TIER 1 + EMAILS 3-4 + CONVERSIÓN               │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  DISTRIBUCIÓN DIARIA:                                                │
│  ┌──────────────────────────────────────────────────────┐           │
│  │ 20/día → Email 3 (urgencia) a opens de Sem 1-2      │           │
│  │ 10/día → Email 2 a opens nuevos de Sem 2            │           │
│  │ 70/día → Email 1 a Tier 1 restante (470 contactos)  │           │
│  └──────────────────────────────────────────────────────┘           │
│                                                                      │
│  CONVERSIÓN ACTIVA:                                                  │
│  → Los leads que clickearon + entraron al bot ya están             │
│    en proceso de compra del Kit                                     │
│  → Follow-up manual (WhatsApp o email directo) a los               │
│    que clickearon pero no compraron                                 │
│  → Enviar Email 3 ("nunca es tarde para aprender") a               │
│    quienes abrieron pero no clickearon                             │
│                                                                      │
│  RESULTADO ESPERADO SEMANA 3:                                        │
│  Tier 1 completado: 1,320 contactos enviados                       │
│  Opens acumulados: ~264 (20% de 1,320)                             │
│  Clicks acumulados: ~40                                             │
│  Leads en bot: ~12-15                                               │
│  Kits vendidos acumulados: ~5-6 alumnos                            │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│  SEMANA 4 — EMAIL 4 (INCENTIVO) + INICIO TIER 2 + META: 10        │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  DISTRIBUCIÓN DIARIA:                                                │
│  ┌──────────────────────────────────────────────────────┐           │
│  │ 20/día → Email 4 (descuento RESONANCIAS15) a quienes│           │
│  │          abrieron emails previos pero no compraron   │           │
│  │ 10/día → Emails 2-3 a opens tardíos                  │           │
│  │ 70/día → Email 1 a Tier 2 (composición/armonía)     │           │
│  └──────────────────────────────────────────────────────┘           │
│                                                                      │
│  EL EMAIL 4 ES LA BALA DE PLATA:                                    │
│  Código RESONANCIAS15 = 15% descuento → Kit a $37 USD             │
│  Urgencia: "válido por 7 días"                                      │
│  Solo para quienes ya mostraron interés (abrieron/clickearon)      │
│  → Conversión esperada: 10-15% de quienes reciben Email 4          │
│                                                                      │
│  RESULTADO ESPERADO SEMANA 4:                                        │
│  Email 4 enviado a: ~200 contactos (abrieron pero no compraron)    │
│  Conversión Email 4: ~20-30 leads → ~5-8 compras de Kit           │
│  Tier 2 iniciado: 350 contactos nuevos                              │
│  ─────────────────────────────────────────                          │
│  TOTAL ACUMULADO: 10-14 alumnos nuevos ← META ALCANZADA ✅        │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

#### Reglas anti-spam para toda la campaña

```
┌────────────────────────────────────────────────────────────────────┐
│  REGLAS DE ORO — PROTECCIÓN DE REPUTACIÓN pianolink.net           │
│                                                                    │
│  1. NUNCA enviar a quien no abrió Email 1                         │
│     Si no abrieron el primer email → NO existen para nosotros.    │
│     Enviarles Email 2-3-4 es la forma más rápida de ir a spam.   │
│                                                                    │
│  2. Bounce → excluir INMEDIATAMENTE                               │
│     El webhook de Resend marca emailPreferences.bounced = true.   │
│     CrmBroadcastScheduler ya los excluye automáticamente ✅       │
│     Si bounce rate > 3% en un día → pausar 48h.                  │
│                                                                    │
│  3. Complaint → excluir + investigar                              │
│     Cualquier spam complaint es una señal grave.                  │
│     1 complaint en 100 emails = 1% → INACEPTABLE.                │
│     Si ocurre: revisar contenido, asunto, y from name.            │
│                                                                    │
│  4. Unsubscribe = sagrado                                         │
│     RFC 8058 one-click unsubscribe ya implementado ✅             │
│     Link visible en CADA email ✅                                  │
│     Responder al unsub en < 10 segundos (automático) ✅           │
│                                                                    │
│  5. NO enviar más de 100/día TOTAL                                │
│     Los 100 incluyen: nuevos + follow-ups + transaccionales.      │
│     Si un alumno compra Kit y recibe email de confirmación,       │
│     ese email CUENTA en los 100 del día.                           │
│                                                                    │
│  6. Contenido limpio                                               │
│     ✅ Texto plano + HTML simple (sin imágenes pesadas)           │
│     ✅ Ratio texto/link alto (mucho texto, pocos links)           │
│     ✅ No usar CAPS en subject (evitar "GRATIS", "URGENTE")       │
│     ✅ No usar acortadores de URL (bit.ly, tinyurl)               │
│     ✅ Links apuntan a pianolink.net (mismo dominio)              │
│     ❌ No adjuntar archivos                                       │
│     ❌ No usar palabras trigger: gratis, oferta, click aquí       │
│                                                                    │
│  7. Horario de envío                                               │
│     Chile (UTC-3): 10:00 AM — 12:00 PM                            │
│     Martes a sábado (mejores días: martes y jueves)               │
│     NUNCA domingo ni lunes (peor open rate, más complaints)       │
│                                                                    │
│  8. Proporción de engagement                                       │
│     Mantener > 20% open rate SIEMPRE. Si baja de 15%:            │
│     → Pausar 48h                                                   │
│     → Revisar si estamos en la pestaña "Promociones" de Gmail     │
│     → Probar nuevo subject line                                    │
│     → Reducir volumen a 50/día por una semana                     │
│                                                                    │
│  9. Limpiar lista proactivamente                                   │
│     Después de Semana 2, ejecutar limpieza:                       │
│     → Contactos que no abrieron NADA → segment = 'dead'          │
│     → No enviar NUNCA más a estos contactos                       │
│     → Reducir lista activa a solo opens + clicks                  │
│                                                                    │
│  10. Separar tráfico transaccional de marketing                   │
│      Emails de Kit (confirmación de pago, credenciales) son       │
│      transaccionales y tienen prioridad sobre marketing.           │
│      Si quedan 5 emails del cupo diario, usarlos para             │
│      transaccionales, NO para campaña.                             │
└────────────────────────────────────────────────────────────────────┘
```

#### Embudo numérico: lista fría → 10 alumnos

```
TIER 1: alta_piano (1,320 contactos)
│
├─ Emails enviados:           1,320
│   ├─ Bounces (~3%):         -40  → excluidos inmediatamente
│   └─ Entregados:            1,280
│
├─ Abrieron Email 1 (20%):   256
│   ├─ Unsubscribes (~2%):   -5   → excluidos permanentemente
│   └─ Activos:               251
│
├─ Reciben Email 2 (251):
│   ├─ Abrieron E2 (40%*):   100  (*re-open rate más alto en follow-up)
│   └─ No abrieron:           151  → NO reciben Email 3
│
├─ Clickearon algún email:    40 leads calientes
│   ├─ Con WhatsApp (~50%):   20
│   │   ├─ Responden bot:     12
│   │   └─ No responden:      8   → siguen en secuencia email
│   │
│   └─ Sin WhatsApp:          20  → siguen en secuencia email
│
├─ Reciben Email 3 (solo opens):  100
│   └─ Clicks nuevos:             8
│
├─ Reciben Email 4 + descuento:   ~200 (todos los opens sin compra)
│   └─ Conversión descuento:      10-15 leads
│
└─ CONVERSIÓN A KIT ($44 USD):
    Leads calientes totales:       ~48
    × 25% conversión a Kit:        12 alumnos
    ────────────────────────────────────────
    RESULTADO: 10-12 alumnos en 4 semanas ✅
    COSTO: $0 USD en ads
    INGRESO KITS: 12 × $44 = $528 USD
```

#### Qué hacer si el embudo rinde menos de lo esperado

| Escenario | Diagnóstico | Acción |
|---|---|---|
| Open rate < 10% | Subject line no funciona o caemos en spam | Pausar 48h. Probar subject B. Verificar DNS. Reducir volumen a 50/día |
| Clicks < 5% de opens | El contenido no convence | Revisar copy del email. Probar CTA diferente. Agregar video/gif de la sala virtual |
| Nadie compra Kit | El precio o la oferta no conecta | Activar Email 4 con descuento antes de lo planificado. Probar $37 USD (código RESONANCIAS15) |
| Muchos bounces (> 5%) | Lista sucia | Parar INMEDIATO. Limpiar emails con herramienta de verificación (ej: ZeroBounce, $16/1000 emails). Reanudar solo con verificados |
| Bot WhatsApp no convierte | El flujo del bot necesita ajuste | Escalar a follow-up humano. Los primeros 10 alumnos pueden requerir toque personal |
| Tier 1 agotado con < 10 alumnos | Necesitamos más volumen | Pasar a Tier 2 (400 contactos composición) inmediatamente. Tier 2 tiene perfil compatible |

#### Plan B: Si la lista fría no llega a 10 alumnos en 4 semanas

```
Si después de 4 semanas tenemos < 7 alumnos:

1. Encender Google Ads con $50 USD/mes (no los $150 completos)
   → ~2 alumnos extra via ads
   → Combinar con los de la lista fría

2. Activar Tier 3 (media_musica, 2,500 contactos) en paralelo
   → Volumen mayor compensa menor conversión
   → Estimado: 2,500 × 10% open × 8% click × 15% compra = ~3 alumnos

3. Pedir referidos a los alumnos existentes
   → "Invita a un amigo → ambos reciben 1 clase gratis"
   → Con 5 alumnos activos, 2-3 referidos es realista

4. Publicar contenido orgánico en Instagram/TikTok
   → Demo de la sala virtual MIDI (30 seg)
   → Historia del fundador enseñando
   → $0 en ads, alcance orgánico

→ Combinando todo, llegar a 10 en semana 5-6 como máximo
```

---

## 5. Estrategia para el Problema de Pocos Profesores

### 5.1 Cómo comunicar sin que sea una debilidad

**Principio:** Nunca decir "tenemos pocos profesores". Reencuadrar como **exclusividad y curación**.

#### En la landing page:

```
❌ NO: "Explora nuestro catálogo de profesores"
       (si ven 3 perfiles, se van)

✅ SÍ: "Te asignamos el profesor ideal para ti"
       (el alumno no necesita buscar)
```

#### Copy recomendado para landing:

> **Tu profesor, elegido especialmente para ti**
>
> En Piano Link no te dejamos solo eligiendo entre cientos de perfiles.
> En tu entrevista personal, nuestro equipo analiza tu nivel,
> objetivos y horarios para conectarte con el profesor perfecto.
>
> Todos nuestros profesores son verificados, con experiencia
> en educación online y tecnología MIDI.

#### Estrategia del "Concierge Match":
1. El alumno **nunca ve la lista de profesores** antes de pagar el Kit
2. En la entrevista personal, el equipo presenta **1-2 profesores** como si fueran la recomendación personalizada
3. El alumno siente que recibe un servicio premium, no que tiene opciones limitadas

### 5.2 Contenido para Landing con Catálogo Limitado

| Sección | Propósito | Contenido |
|---|---|---|
| **Hero** | Captar atención | "Aprende piano con un profesor personal y tecnología que te muestra las notas en tiempo real" + CTA "Empezar" |
| **Cómo funciona** | Explicar el modelo | 3 pasos: 1) Kit de Bienvenida ($44 USD) → 2) Setup en sala virtual (conectamos tu piano) → 3) Te asignamos profesor y empiezas clases |
| **Demo visual** | Demostrar tecnología | Video/gif de la sala virtual con MIDI en acción |
| **Testimonios** | Social proof | 2-3 testimonios (pueden ser de alumnos de la etapa Resonancias reencuadrados) |
| **FAQ** | Resolver objeciones | ¿Necesito instrumento? ¿Qué nivel necesito? ¿Cómo funciona el pago? |
| **CTA final** | Conversión | "Kit de Bienvenida: $44 USD — Setup en sala virtual + Profesor asignado + Clase de prueba" |

**Lo que NO debe tener la landing:**
- ❌ Galería/grid de profesores (expone catálogo limitado)
- ❌ Buscador de profesores por filtros
- ❌ Contador de "X profesores disponibles"
- ❌ Calendario público de horarios

### 5.3 Matching Alumno-Profesor con Pocos Profesores

**Algoritmo de matching propuesto:**

```
ENTRADAS:
  - alumno.level (never_played → advanced)
  - alumno.studentGoal
  - alumno.ageRange
  - alumno.timezone
  - alumno.availability (horarios, no existe aún)

PRIORIDAD DE MATCHING:
  1. Disponibilidad horaria (eliminatorio)
  2. Especialidad del profesor vs objetivo del alumno
  3. Experiencia con rango etario similar
  4. Idioma (importante para Latam/España futuro)

REGLA CON POCOS PROFESORES:
  Si solo hay 1-2 profesores disponibles:
  → Presentar como "el profesor ideal para tu perfil"
  → No mencionar alternativas
  → Destacar la fortaleza específica que aplica al alumno:
    Ej: "María tiene 8 años de experiencia con principiantes
         adultos, justo lo que necesitas."
```

### 5.4 Profesores Mínimos para Lanzar sin Fricción

| Escenario | Profesores | Capacidad | Problema |
|---|---|---|---|
| **Mínimo viable** | 2-3 | ~15-20 alumnos activos | Alto riesgo si 1 profesor se va |
| **Lanzamiento seguro** | 5-7 | ~35-50 alumnos activos | Cubre horarios AM + PM + fines de semana |
| **Ideal para campañas** | 8-10 | ~60-80 alumnos activos | Permite matching real por especialidad |

**Recomendación: Lanzar campañas pagadas con mínimo 5 profesores activos.**

Justificación:
- 5 profesores cubren los principales horarios solicitados (mañana, tarde, noche, sábado)
- Si un profesor tiene problemas, hay redundancia
- Permite ofrecer al menos 2 opciones en la entrevista personal
- Cada profesor maneja ~7-10 alumnos activos sin saturarse

**Si actualmente hay menos de 5:**
1. Lanzar con publicidad orgánica + reactivación de lista fría (bajo volumen)
2. Usar Google Ads con presupuesto mínimo ($3 USD/día) para validar demanda
3. En paralelo, reclutar profesores con campaña separada
4. Escalar presupuesto publicitario solo cuando haya 5+ profesores confirmados

---

## 6. Dashboard de Métricas

### 6.1 Métricas del Embudo de Adquisición

| Métrica | Fuente | Frecuencia | Umbral de Acción |
|---|---|---|---|
| **Visitas a landing** | CrmInteraction (page_view) | Diario | < 20/día → revisar ads |
| **Leads capturados** | CrmConversion (lead_capture) | Diario | < 3/día → revisar landing/copy |
| **CPL (costo por lead)** | CrmCampaign.metrics.cpl | Semanal | > $5 USD → revisar keywords/audiencias |
| **Leads calificados por bot** | Lead.setupStatus = 'compatible' | Diario | < 50% → muchos controladores MIDI |
| **Kits pagados** | Payment.type = 'kit_purchase' | Diario | Tasa < 5% de leads → revisar oferta o precios |
| **Entrevistas completadas** | WelcomeKit.setupSession.status = 'completed' | Semanal | < 70% de kits → problema de scheduling |
| **Clases de prueba completadas** | WelcomeKit.trialClass.status = 'completed' | Semanal | < 60% de entrevistas → problema de setup/matching |
| **Alumnos activos** | StudentEnrollment.status = 'active' | Semanal | Tasa < 40% de pruebas → problema de experiencia |

### 6.2 Métricas de Retención

| Métrica | Fuente | Frecuencia | Umbral de Acción |
|---|---|---|---|
| **Churn mensual** | StudentEnrollment cancelados / total | Mensual | > 15% → encuesta de salida |
| **Clases por alumno/mes** | ClassSession count agrupado | Mensual | < 3 → riesgo de abandono |
| **NPS / Satisfacción** | Feedback.rating promedio | Mensual | < 4.0 → revisión de calidad |
| **LTV (Lifetime Value)** | CrmLead.customerValue | Mensual | < $200 → revisar pricing |

### 6.3 Métricas Financieras

| Métrica | Fuente | Frecuencia | Umbral de Acción |
|---|---|---|---|
| **Revenue bruto** | Payment.amount sum (approved) | Semanal | — |
| **Revenue por alumno** | Revenue / alumnos activos | Mensual | < $50 → revisar frecuencia |
| **Comisión PianoLink** | TeacherPayout.platformFeeUSD sum | Mensual | — |
| **ROAS** | Revenue / Gasto ads | Mensual | < 2x → pausar canal |
| **CAC** | Gasto total / Alumnos activos nuevos | Mensual | > $50 → optimizar embudo |
| **Payback period** | CAC / Revenue mensual por alumno | Mensual | > 3 meses → preocupante |

### 6.4 Métricas de Reactivación (Lista Fría)

| Métrica | Fuente | Frecuencia | Umbral de Acción |
|---|---|---|---|
| **Open rate Email 1** | EmailTrackingEvent (open) | Semanal | < 15% → cambiar asunto |
| **Click rate** | EmailTrackingEvent (click) | Semanal | < 2% → cambiar CTA |
| **Reactivados** | CrmLead.segment cambió de cold → warm | Semanal | < 5% → lista muy fría |
| **Migrados a WhatsApp** | Lead.whatsapp + respond | Semanal | — |
| **Unsubs** | CrmLead.emailPreferences.unsubscribed | Semanal | > 3% → revisar frecuencia |
| **Bounce rate email** | EmailTrackingEvent (bounce) | Semanal | > 5% → limpiar lista |

### 6.5 Dashboard Recomendado — Vista Ejecutiva

```
┌──────────────────────────────────────────────────────────────┐
│                    PIANO LINK — Dashboard                    │
│                    Período: Últimos 30 días                  │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  EMBUDO DE ADQUISICIÓN                                       │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │ Visitas  │→│ Leads    │→│ Kits     │→│ Alumnos  │       │
│  │  1,200   │ │   180    │ │   18     │ │   11     │       │
│  │          │ │ CPL: $3  │ │ 10%     │ │  61%     │       │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
│                                                              │
│  FINANZAS                          RETENCIÓN                 │
│  ┌────────────────────┐           ┌──────────────────────┐  │
│  │ Revenue:    $850   │           │ Churn:        8%     │  │
│  │ ROAS:       3.2x   │           │ Clases/mes:   4.2    │  │
│  │ CAC:        $35    │           │ NPS:          4.3    │  │
│  │ Comisión:   $170   │           │ LTV est:      $320   │  │
│  └────────────────────┘           └──────────────────────┘  │
│                                                              │
│  REACTIVACIÓN LISTA FRÍA           CANALES                  │
│  ┌────────────────────┐           ┌──────────────────────┐  │
│  │ Enviados:   2,100  │           │ Google:  45% leads   │  │
│  │ Open rate:  22%    │           │ Meta:    25% leads   │  │
│  │ Reactivados: 46    │           │ Email:   20% leads   │  │
│  │ → WhatsApp:  12    │           │ Orgánico: 10% leads  │  │
│  └────────────────────┘           └──────────────────────┘  │
│                                                              │
│  ⚠️ ALERTAS ACTIVAS                                         │
│  • CPL Google subió 40% esta semana → revisar pujas         │
│  • 3 alumnos con 0 clases en 14 días → riesgo churn         │
│  • Bounce rate email 6.2% → limpiar lista                   │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 6.6 Implementación Sugerida

El CRM ya tiene los modelos necesarios. El dashboard se construye con:

1. **Backend:** Endpoint `/api/crm/dashboard` ya existe → agregar queries para las nuevas métricas
2. **Frontend:** `public/crm-dashboard.html` → actualizar con los paneles del embudo
3. **Alertas:** CrmSequenceRunner (cron cada 10 min) → agregar checks de umbrales → enviar notificación por email al admin
4. **Periodo:** Selectable (7d, 30d, 90d) con comparación vs periodo anterior

---

## Resumen de Cambios Técnicos Requeridos

### Variables de Entorno Nuevas

```bash
# Claude AI (Anthropic)
ANTHROPIC_API_KEY=           # API key de Anthropic para Claude

# Twilio WhatsApp
TWILIO_ACCOUNT_SID=          # SID de la cuenta Twilio
TWILIO_AUTH_TOKEN=           # Auth token de Twilio
TWILIO_WHATSAPP_NUMBER=      # Número WhatsApp de Twilio (ej: +14155238886)
```

### Dependencias NPM Nuevas

```bash
npm install @anthropic-ai/sdk twilio
```

### Prioridad Alta (antes de lanzar campañas)

| # | Cambio | Modelo | Esfuerzo |
|---|---|---|---|
| 1 | Agregar campos `instrumentType`, `instrumentModel`, `cableType`, `cableStatus`, `setupStatus`, `studentGoal`, `ageRange`, `city`, `suggestedTeacherId` | Lead.js | ~2h |
| 2 | Agregar `whatsappConversation` a CrmLead (con `claudeMessages[]` + `extractedData`) | CrmLead.js | ~1h |
| 3 | Extender `pipelineStudent` enum con `kit_pagado`, `setup_agendado`, `setup_resuelto`, `profesor_asignado`, `alumno_activo`, `churned` | CrmLead.js | ~30min |
| 4 | Extender `Lead.source` enum con `google_ads`, `meta_ads`, `whatsapp_bot`, `referido` | Lead.js | ~15min |
| 5 | Agregar valor `never_played` al enum de nivel | Lead.js | ~15min |
| 6 | Implementar `WhatsAppBotService.js` con Claude API + Vision + Tool Use | Nuevo servicio | ~12-16h |
| 7 | Landing page de alumnos (modelo "concierge") | CrmLanding + HTML | ~4-6h |
| 8 | Configurar Twilio WhatsApp webhook + media download | Nuevo endpoint + route | ~3-4h |
| 9 | System prompt de Claude con base de conocimiento de cables | Config/constante | ~2h |

### Prioridad Media (primera semana de operación)

| # | Cambio | Detalle | Esfuerzo |
|---|---|---|---|
| 10 | Secuencia de reactivación en CrmSequence | 4 emails + condicionales | ~3h |
| 11 | Webhook Mercado Pago para Kit desde bot (notifica a Claude post-pago) | Integración con WelcomeKit | ~4h |
| 12 | Dashboard de métricas actualizado | Queries + frontend | ~4-6h |
| 13 | Sistema de alertas automáticas | CrmSequenceRunner + email | ~3h |
| 14 | Tool `search_cable_link`: buscar link de MercadoLibre por tipo de cable y país | Función + scraping/API | ~4h |

### Prioridad Baja (optimización iterativa)

| # | Cambio | Detalle | Esfuerzo |
|---|---|---|---|
| 15 | Normalizar WhatsApp a E.164 | Migración + validación | ~2h |
| 16 | Tracking de open/click emails Resend | Webhooks + EmailTrackingEvent | ~3h |
| 17 | A/B testing de subject lines | CrmSequence variants | ~2h |
| 18 | Pixel Meta + Google Ads conversion tracking | CrmTrackingDispatcher | Ya implementado (Fase 3) |
| 19 | Persistir conversaciones Claude en Redis (si escala > 500 leads/mes) | Opcional | ~4h |

---

## 7. Análisis: Modelo de Negocio Óptimo para la Etapa Actual

### 7.1 Estado real del sistema (auditoría de código)

Antes de evaluar los modelos, estos son los hechos verificados en el código:

| Componente | Estado | Detalle técnico |
|---|---|---|
| **CommissionService** | ✅ Implementado | Comisión dinámica por plan: free=25%, premium/founder=15%. Alumnos privados=0% (solo premium/founder) |
| **TeacherPackage** | ✅ Implementado | Precio libre por profesor. Paquetes de 1-N clases con descuento por volumen |
| **StudentSubscription** | ✅ Implementado | Tracking de clases por paquete, escrow, autoRenew (pero cobro automático NO funciona) |
| **ClassSession** | ✅ Implementado | Workflow completo: scheduled → pending-validation → completed. 48h auto-confirm |
| **TeacherPayout** | ✅ Implementado | Batch mensual automático (cron 1° del mes). Status pipeline de 8 pasos. Requiere factura |
| **Wallet + Ledger** | ✅ Implementado | Contabilidad inmutable append-only. Balance calculado desde ledger |
| **Withdrawal** | ✅ Implementado | 5 métodos: bank_transfer, mercadopago, paypal, wise, crypto |
| **MercadoPago** | ✅ Implementado | Checkout dinámico, HMAC validado, multi-país preparado. USD→CLP conversión |
| **Split automático** | ❌ NO implementado | El split se calcula pero no se ejecuta on-chain. Payout es batch mensual manual |
| **Auto-renewal cobro** | ❌ NO implementado | Detecta suscripciones vencidas pero NO cobra. Solo log |
| **Precio estandarizado** | ❌ NO existe | No hay lógica para ignorar el precio del profesor y cobrar un fijo al alumno |

### 7.2 Configuración económica actual (de GlobalConfig)

```
┌─────────────────────────────────────────────────────────┐
│  PLANES DE PROFESOR (verificado en GlobalConfig.js)      │
├──────────┬─────────┬──────────────┬─────────────────────┤
│ Plan     │ Precio  │ Comisión PL  │ Profesor recibe     │
├──────────┼─────────┼──────────────┼─────────────────────┤
│ free     │ $0/mes  │ 25%          │ 75%                 │
│ premium  │ $19/mes │ 15%          │ 85%                 │
│ founder  │ $10/mes │ 15%          │ 85% + invitar priv. │
└──────────┴─────────┴──────────────┴─────────────────────┘

Alumno privado (premium/founder): 0% comisión → 100% profesor
Clase de prueba (trial): $10 USD → 100% profesor
Kit Bienvenida: $44 USD → 100% Piano Link
```

### 7.3 Evaluación comparativa de los 3 modelos

---

#### MODELO A: Marketplace puro (actual)

**Cómo funciona:** El profesor pone su precio ($17-$30/clase), el alumno paga, Piano Link retiene 25% (free) o 15% (premium).

**Lo que YA está construido para este modelo:**
- ✅ CommissionService con planes dinámicos
- ✅ TeacherPackage con precios libres
- ✅ StudentSubscription con paquetes
- ✅ Enrollment con frozen rate y compra histórica
- ✅ Payout batch mensual
- ✅ Wallet/Ledger contable
- **Esfuerzo para lanzar: ~0 horas de desarrollo nuevo**

**Proyección financiera (30 alumnos, 4 clases/mes):**
```
Escenario con precio promedio $22 USD/clase:
  Ingreso bruto mensual:   30 × 4 × $22 = $2,640 USD
  Comisión PL (25% free):  30 × 4 × $5.50 = $660 USD
  Comisión PL (15% prem):  30 × 4 × $3.30 = $396 USD
  
  + Kit Bienvenida (30 alumnos en 3 meses): 30 × $44 = $1,320 USD (~$440/mes)
  
  Ingreso PL estimado:     $660 + $440 = $1,100 USD/mes (free)
                            $396 + $440 = $836 USD/mes  (si todos premium)
  Costos fijos:             $210 USD/mes
  Resultado neto:           $626 — $890 USD/mes
```

**Riesgos:**

| Riesgo | Severidad | Causa |
|---|---|---|
| Precios dispares confunden al alumno | 🟡 Media | Un profesor cobra $17, otro $30. En modelo concierge el alumno no elige, pero si asignamos al de $30 puede ser fricción |
| Profesor con precio bajo devalúa la plataforma | 🟡 Media | $17/clase puede percibirse como "bajo valor" |
| Con 3 profesores, la libertad de precio no aporta valor | 🟢 Baja | No hay suficiente oferta para que la variedad de precio sea un diferenciador |
| Profesores pueden llevarse alumnos fuera de la plataforma | 🔴 Alta | Sin contrato, un profesor cobra $22 en PL y ofrece $18 directo al alumno |
| No hay split automático | 🟡 Media | Payout manual mensual funciona con 3 profesores, no escala a 10+ |

**Ventaja principal:** CERO desarrollo nuevo. Se puede lanzar hoy.

---

#### MODELO B: Precio estandarizado

**Cómo funciona:** Piano Link cobra $25/clase al alumno siempre. Al profesor se le paga un monto fijo por clase completada (~$17-18). El margen de Piano Link es fijo: $7-8 por clase.

**Lo que FALTA construir para este modelo:**

| Cambio requerido | Impacto | Esfuerzo |
|---|---|---|
| Ignorar `TeacherPackage.priceUSD` y usar precio fijo global | **[BREAKING CHANGE]** Rompe el flujo actual de checkout | ~4h |
| Nuevo campo en GlobalConfig: `standardizedPrice` | Schema change | ~1h |
| Modificar checkout MercadoPago para usar precio fijo | Modificar payment.js | ~3h |
| Modificar CommissionService para calcular margen fijo en vez de porcentaje | **[BUSINESS LOGIC RISK]** | ~4h |
| Nuevo campo en ClassSession: `teacherRateUSD` (fijo, independiente del paquete) | Schema change | ~1h |
| Modificar StudentSubscription para no depender de TeacherPackage.price | Lógica compleja | ~6h |
| Re-calcular todos los payouts con la nueva lógica | Testing extenso | ~4h |
| **Total estimado** | | **~23h** |

**Proyección financiera (30 alumnos, 4 clases/mes):**
```
Precio fijo al alumno: $25 USD/clase
Pago al profesor:      $18 USD/clase
Margen PL por clase:   $7 USD

  Ingreso bruto mensual:  30 × 4 × $25 = $3,000 USD
  Margen PL:              30 × 4 × $7  = $840 USD/mes
  + Kit Bienvenida:                       $440 USD/mes
  
  Ingreso PL total:       $1,280 USD/mes
  Costos fijos:           $210 USD/mes
  Resultado neto:         $1,070 USD/mes
```

**Riesgos:**

| Riesgo | Severidad | Causa |
|---|---|---|
| Profesor fundador acepta cobrar fijo | 🔴 Alta | Si el fundador ya cobra $25-30, aceptar $18 fijo es una baja del 28-40% |
| Menos incentivo para profesor de alta calidad | 🔴 Alta | Un profesor excelente gana lo mismo que uno mediocre. Sin diferenciación |
| Rompe el sistema de paquetes existente | 🔴 Alta | TeacherPackage, descuentos por volumen, y la lógica de frozen rate se vuelven irrelevantes |
| **~23h de desarrollo** antes de poder lanzar | 🟠 Alta | Retrasa el lanzamiento. Cada semana sin lanzar = leads fríos que se enfrían más |
| No hay mecanismo para ajustar el rate por profesor | 🟡 Media | ¿Todos ganan $18? ¿O varía por experiencia? Se necesita definir |
| Alumno no puede elegir "mejor profesor por más" | 🟢 Baja | En modelo concierge esto no importa ahora, pero limita el crecimiento |

**Ventaja principal:** Margen predecible y controlado. Simplifica la comunicación de precio.

---

#### MODELO C: Híbrido (por origen del lead)

**Cómo funciona:**
- Canal orgánico (profesor trae alumno / referido) → Modelo A, precio libre, comisión 25%/15%
- Canal pagado (Google Ads + bot + kit) → Modelo B, precio fijo $25, margen $7

**Lo que FALTA construir para este modelo:**

| Cambio requerido | Impacto | Esfuerzo |
|---|---|---|
| Todo lo del Modelo B (checkout fijo, rate fijo, etc.) | Ver arriba | ~23h |
| Lógica condicional: si `lead.source ∈ ['google_ads', 'meta_ads', 'whatsapp_bot']` → precio fijo | Nuevo branching en checkout | ~4h |
| Si `lead.source ∈ ['referral', 'private_invite', 'organic']` → precio libre del profesor | Mantener lógica actual | ~0h |
| Doble flujo de payout: batch con margen fijo + batch con comisión % | PayoutCronService split | ~6h |
| UI para que el admin vea métricas separadas por canal | Dashboard | ~4h |
| **Total estimado** | | **~37h** |

**Proyección financiera (30 alumnos: 20 pagados + 10 orgánicos):**
```
Canal pagado (20 alumnos × 4 clases × $25):
  Ingreso:      $2,000 USD
  Margen PL:    20 × 4 × $7 = $560 USD

Canal orgánico (10 alumnos × 4 clases × $22 avg):
  Ingreso:      $880 USD
  Comisión PL:  10 × 4 × $5.50 = $220 USD (25% free)

Kit Bienvenida: $440 USD/mes
  
Ingreso PL total: $560 + $220 + $440 = $1,220 USD/mes
Costos fijos:     $210 USD/mes
Resultado neto:   $1,010 USD/mes
```

**Riesgos:**

| Riesgo | Severidad | Causa |
|---|---|---|
| **Complejidad máxima** con 3 profesores | 🔴 Crítica | Dos sistemas de pricing corriendo en paralelo. Bug surface enorme |
| Profesor cobra diferente al MISMO alumno según cómo llegó | 🔴 Alta | Si un alumno orgánico habla con otro que vino por ads, descubren precios distintos |
| **~37h de desarrollo** | 🔴 Alta | El doble del Modelo B. Retrasa lanzamiento significativamente |
| Payout se vuelve un nightmare contable | 🟠 Alta | Misma clase, misma validación, diferente cálculo de pago |
| El alumno no sabe por qué paga lo que paga | 🟡 Media | Poca transparencia en la experiencia del alumno |
| Over-engineering para 3 profesores y 30 alumnos | 🔴 Crítica | Construir para escala cuando el problema hoy es validar product-market fit |

**Ventaja principal:** Maximiza margen teórico en canal pagado sin alienar a profesores orgánicos.

---

### 7.4 Matriz de decisión ponderada

| Criterio (peso) | Modelo A | Modelo B | Modelo C |
|---|---|---|---|
| **Velocidad de lanzamiento** (30%) | ⭐⭐⭐⭐⭐ 5 | ⭐⭐⭐ 3 | ⭐⭐ 2 |
| **Margen financiero** (20%) | ⭐⭐⭐ 3 | ⭐⭐⭐⭐ 4 | ⭐⭐⭐⭐ 4 |
| **Retención de profesores** (20%) | ⭐⭐⭐⭐ 4 | ⭐⭐ 2 | ⭐⭐⭐ 3 |
| **Simplicidad operativa** (15%) | ⭐⭐⭐⭐⭐ 5 | ⭐⭐⭐⭐ 4 | ⭐⭐ 2 |
| **Escalabilidad futura** (10%) | ⭐⭐⭐ 3 | ⭐⭐⭐⭐ 4 | ⭐⭐⭐⭐⭐ 5 |
| **Riesgo técnico** (5%) | ⭐⭐⭐⭐⭐ 5 | ⭐⭐⭐ 3 | ⭐⭐ 2 |
| **TOTAL PONDERADO** | **4.20** | **3.30** | **3.00** |

---

### 7.5 Recomendación: Modelo A con ajustes tácticos

**Modelo A gana por un margen significativo**, y no es sólo por facilidad técnica. El razonamiento:

#### ¿Por qué NO Modelo B ahora?

1. **3 profesores ≠ empleados.** Son socios de fase temprana. Imponer un rate fijo quando uno ya cobra $25-30 es garantizar que se vayan. Con 3 profesores, perder 1 es perder el 33% de la capacidad.

2. **23 horas de desarrollo para cambiar algo que funciona.** El sistema de comisión dinámica ya está construido, testeado, con ledger inmutable y payout batch. Reescribirlo para forzar precio fijo es regresión.

3. **No se tiene product-market fit aún.** Estandarizar precio asume que sabes cuánto vale tu servicio. Con <30 alumnos, aún estás descubriendo eso.

#### ¿Por qué NO Modelo C ahora?

1. **Over-engineering extremo.** 37 horas de desarrollo para resolver un problema que no existe con 3 profesores y 0 alumnos de canal pagado.

2. **Dos alumnos del mismo profesor con precio diferente = problemas.** Es un riesgo de reputación real en una comunidad pequeña.

#### ¿Por qué SÍ Modelo A con ajustes?

El sistema ya está construido. Pero necesita 3 ajustes tácticos que lo fortalecen sin romper nada:

**Ajuste 1 — Precio mínimo recomendado (no obligatorio)**
```
En GlobalConfig ya existe `minHourlyRate: 15 USD`.
Ajustar a: minHourlyRate: 20 USD.
Comunicar a profesores: "Rango recomendado: $20-$30 USD/clase".
Esto reduce la dispersión de precios sin imponer un fijo.
Esfuerzo: cambiar 1 valor en la DB. ~5 minutos.
```

**Ajuste 2 — Todos los profesores en plan free (25% comisión) durante la fase de tracción**
```
Con 3 profesores y <30 alumnos, la suscripción premium ($19/mes) 
no tiene sentido para nadie. No hay escala para que 15% vs 25% 
sea material para el profesor.

Propuesta: suspender cobro de suscripción hasta tener 50+ alumnos.
Mantener comisión en 25% para todos.
Esto simplifica el modelo y maximiza ingreso PL en fase temprana.

Razón: $19/mes × 3 profesores = $57 USD de suscripciones vs
       10% más de comisión × 120 clases × $22 = $264 USD extra.
       La comisión del 25% genera 4.6x más que las suscripciones.
```

**Ajuste 3 — Modelo concierge elimina el problema de precio visible**
```
Ya diseñado en Sección 5: el alumno NUNCA ve la lista de profesores.
PianoLink asigna al profesor.

Esto significa que el alumno no compara precios entre profesores.
Si el Profesor A cobra $20 y el Profesor B cobra $25, PianoLink
puede asignar basado en fit pedagógico sin que el precio sea factor.

El alumno ve: "Tu paquete de 4 clases: $XX USD".
No ve: "Profesor A: $20, Profesor B: $25".
```

#### Cuándo migrar a Modelo B

El switch a precio estandarizado tiene sentido cuando:

```
┌─────────────────────────────────────────────────────────────────┐
│  GATILLOS PARA MIGRAR A MODELO B (todos deben cumplirse)       │
│                                                                 │
│  □ 50+ alumnos activos                                         │
│  □ 8+ profesores activos                                       │
│  □ Datos de pricing de 3+ meses (saber precio óptimo real)     │
│  □ Demanda > oferta (espera para matching)                     │
│  □ Al menos 2 profesores con precio similar ($22-25 rango)     │
│  □ Auto-renewal de cobro implementado y funcional              │
│                                                                 │
│  Hasta que se cumplan → seguir con Modelo A + ajustes          │
└─────────────────────────────────────────────────────────────────┘
```

### 7.6 Economía unitaria y punto de equilibrio

#### Costos fijos mensuales reales

| Concepto | Costo/mes |
|---|---|
| Servidor (hosting Piano Link) | ~$30 USD |
| Twilio WhatsApp | ~$20 USD |
| Claude API (bot) | ~$10 USD |
| Resend email | $0 (free tier) |
| Google Ads (tracción) | ~$150 USD (150.000 CLP) |
| **Total costos fijos** | **~$210 USD/mes** |

#### Ingreso por alumno activo (Modelo A, 25% comisión)

```
Clase promedio:         $22 USD
Comisión PL (25%):      $5.50 USD por clase
4 clases/mes:           $22 USD/mes por alumno para PL
+ Kit inicial:          $44 USD (pago único, ingreso día 1)
```

#### El Kit financia la adquisición

```
CAC via Google Ads:     ~$30 USD por alumno
Kit de Bienvenida:      $44 USD de ingreso inmediato
────────────────────────────────────────────────────
CAC efectivo neto:      $44 - $30 = -$14 USD
→ Cada alumno nuevo genera $14 USD neto solo por entrar
→ El Kit autofinancia completamente la adquisición ✅
```

Con presupuesto de $150 USD/mes en Google Ads y CAC de $30:
```
$150 ÷ $30 = 5 alumnos/mes adquiridos via ads
```

#### Punto de equilibrio: 10 alumnos activos

```
10 alumnos × $22 USD/mes = $220 USD ingreso recurrente
Costos fijos:              $210 USD
──────────────────────────────────────
Resultado:                 +$10 USD ← break even operacional
```

#### Proyección por etapas

| Alumnos activos | Ingreso comisión/mes | Costos fijos | Neto/mes |
|---|---|---|---|
| 7 | $154 | $210 | -$56 (casi equilibrio) |
| **10** | **$220** | **$210** | **+$10 ← break even** |
| 20 | $440 | $210 | +$230 |
| 30 | $660 | $210 | +$450 |
| 50 | $1,100 | $260* | +$840 |

*A 50 alumnos sube servidor y Claude API (~$50 USD extra)

**Nota:** Estos números son ingreso recurrente mensual (comisión por clases). No incluyen ingreso de Kits de alumnos nuevos entrando cada mes, que son adicionales.

#### Llegar a 10 alumnos con la lista fría ANTES de gastar en ads

La lista fría de Resonancias (6.000 contactos) permite validar sin gastar en Google Ads:

```
DATOS DE LA LISTA FRÍA:
  Tier 1 (alta_piano):       1,320 contactos → se envían primero
  Envío: 100 emails/día      → 14 días para cubrir Tier 1

EMBUDO ESTIMADO (conservador):
  1,320 emails enviados (Tier 1)
  × 20% open rate            = 264 abren el email
  × 15% click rate (de opens)= 40 hacen click
  × 25% compran Kit          = 10 alumnos nuevos

TIEMPO ESTIMADO:
  Días 1-14:   Envío de emails Tier 1 (1,320 contactos)
  Días 4-18:   Emails 2-4 a quienes abrieron
  Días 15-21:  Follow-up por WhatsApp a quienes clickearon
  ──────────────────────────────────────────────
  → ~3-4 semanas para conseguir los primeros 10 alumnos
  → Costo de adquisición: $0 USD (Resend free + lista propia)
```

Si el funnel rinde menos (10% open, 10% click, 15% compra):
```
  1,320 × 10% × 10% × 15% = ~2 alumnos del Tier 1
  → Necesitaríamos Tier 1 + Tier 2 + parte de Tier 3
  → ~5-6 semanas para 10 alumnos
  → Sigue siendo $0 en ads
```

#### Estrategia de gasto recomendada

```
┌────────────────────────────────────────────────────────────────┐
│  FASE 1 — Semanas 1-4: LISTA FRÍA (costo $0)                  │
│  • Enviar secuencia de 4 emails a Tier 1 y Tier 2             │
│  • Migrar leads calientes al bot de WhatsApp                  │
│  • Objetivo: 10 alumnos activos (break even)                  │
│  • Google Ads: $0 — no gastar hasta validar conversión        │
│                                                                │
│  FASE 2 — Semanas 5-8: VALIDAR + ENCENDER ADS                 │
│  • Si lista fría convierte → ya tienes 10+ alumnos            │
│  • Encender Google Ads: $150 USD/mes (150.000 CLP)            │
│  • Ads + lista fría en paralelo                               │
│  • Objetivo: 20 alumnos activos ($230 USD neto/mes)           │
│                                                                │
│  FASE 3 — Mes 3+: ESCALAR                                     │
│  • 20+ alumnos validados, unit economics confirmados          │
│  • Subir presupuesto ads si CAC < $35 USD                     │
│  • Activar Meta Ads (Instagram/Facebook) como canal 2         │
│  • Objetivo: 30 alumnos activos ($450 USD neto/mes)           │
│                                                                │
│  PRESUPUESTO GOOGLE ADS: 150.000 CLP/mes (~$150 USD)          │
│  Se enciende solo en Fase 2, después de validar con la lista  │
└────────────────────────────────────────────────────────────────┘
```

#### Proyección a 3 meses (escenario combinado lista fría + ads)

```
MES 1 — Solo lista fría ($0 en ads):
  Kit (10 nuevos):     10 × $44 = $440
  Clases (10 activos): 10 × 4 × $5.50 = $220
  CAC:                 $0 (lista fría)
  Costos fijos:        $60 (hosting + Twilio + Claude, sin ads)
  ─────────────────────────────────────
  Neto:                $600 USD ← mes más rentable
  
MES 2 — Lista fría + Google Ads ($150 USD):
  Kit (10 nuevos):     10 × $44 = $440
  Clases (18 activos): 18 × 4 × $5.50 = $396
  CAC ads:             5 × $30 = -$150 (5 via ads, 5 via lista)
  Costos fijos:        -$210
  ─────────────────────────────────────
  Neto:                $476 USD

MES 3 — Ads + remanente lista fría ($150 USD):
  Kit (8 nuevos):      8 × $44 = $352
  Clases (24 activos): 24 × 4 × $5.50 = $528
  CAC ads:             5 × $30 = -$150
  Costos fijos:        -$210
  ─────────────────────────────────────
  Neto:                $520 USD

ACUMULADO 3 MESES:
  Ingresos totales:    $2,376 USD
  Gastos totales:      $780 USD
  ────────────────────
  Neto acumulado:      $1,596 USD ✅
  Alumnos activos:     ~24
```

### 7.7 Riesgo #1 del Modelo A y cómo mitigarlo

**"El profesor se lleva al alumno fuera de la plataforma"**

Este es el riesgo real y concreto del marketplace puro. Con $22/clase y 25% de comisión, el profesor recibe $16.50. Si ofrece la clase directa al alumno por $18, ambos ganan.

**Mitigación técnica (ya existe en el código):**

1. **La sala virtual con MIDI espejo es el moat.** El profesor NO puede replicar eso en Zoom. Si se lleva al alumno, pierde la funcionalidad diferenciadora.

2. **El frozen rate protege al alumno.** Si el profesor sube precios, el alumno tiene rate congelado por 1 año. Fuera de la plataforma, no tiene esa garantía.

3. **Monitoreo de churn.** Si un profesor tiene churn anómalo (alumnos que se van pero no aparecen en otra parte), investigar.

4. **Contrato de permanencia mínima.** No existe en el código. Considerar agregar `enrollmentMinMonths: 3` en StudentEnrollment para que el alumno no pueda saltar después de 1 clase.

**Mitigación estratégica:**
- Mantener la tecnología MIDI como valor irremplazable
- Agregar funcionalidades que solo existen dentro de la plataforma:
  - Historial de progreso
  - Grabaciones de clases
  - Práctica asíncrona con feedback
- Hacer que el costo de salir sea mayor que el costo de la comisión

---

> **Documento generado el 2026-03-09. Actualizado con Bot Claude AI + Vision + Análisis de Modelo de Negocio.  
> Revisar y actualizar trimestralmente o cuando cambien las condiciones del mercado.**
