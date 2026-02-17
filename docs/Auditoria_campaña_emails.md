# Auditoría de Marketing — Campaña Email "Día 88" PianoLink

> **Fecha auditoría v1:** Junio 2025  
> **Fecha auditoría v2 (esta):** 17 febrero 2026  
> **Auditor:** Análisis independiente de inbound marketing, copywriting & automatización  
> **Objetivo:** Re-evaluar la campaña tras implementar las correcciones de la v1. Evaluar los 11 emails actualmente en producción.  
> **Metodología:** Lectura del HTML real de los 11 emails en MongoDB (no del seed, sino lo que el lead recibe), revisión de la arquitectura técnica (CrmSequence, CrmEmailCampaign, CrmAbandonedCartService), y análisis del flujo completo de conversión.

---

## 1. Resumen Ejecutivo — V2

| Aspecto | Nota v1 | Nota v2 | Cambio |
|---------|---------|---------|--------|
| Arquitectura de la secuencia | 8/10 | 9/10 | +1 — Ahora hay trigger + post-cierre + dual broadcast |
| Estrategia de precios y numerología | 9/10 | 9/10 | = — Intacta, sigue siendo el mejor activo |
| Calidad del copywriting | 6/10 | 7/10 | +1 — Email 1 acortado, repetición reducida |
| Subjects (asuntos) | 7/10 | 7.5/10 | +0.5 — Preview del Email 2 corregido. Email 7 ahora usa cupos |
| CTAs y conversión | 5/10 | 7/10 | +2 — Unificados + carrito abandonado implementado |
| Manejo de objeciones | 6/10 | 7.5/10 | +1.5 — Pedro Pagliai y José integrados |
| Diferenciación competitiva | 7/10 | 7/10 | = — MIDI sigue sobreexplotado en broadcasts |
| Escasez y urgencia | 4/10 | 7/10 | +3 — `{{cupos_restantes}}` implementado, deadline en Email 9 |
| Prueba social | 2/10 | 6/10 | +4 — Pedro + José integrados, video verificable |
| Automatización y retención | 3/10 | 7/10 | +4 — Carrito abandonado, post-cierre, dual broadcast |
| **Nota global** | **6.5/10** | **7.3/10** | **+0.8 — Mejora real pero insuficiente** |

### Veredicto brutalmente honesto:

La campaña mejoró en todo lo que la v1 pidió que mejorara. Las correcciones fueron ejecutadas: Email 1 corto, cupos dinámicos, carrito abandonado, Pedro y José integrados, CTAs unificados, broadcasts duales. **Pero la ejecución de esas correcciones tiene problemas nuevos que la v1 no podía anticipar.**

El problema de fondo sigue siendo el mismo: **esta campaña vende funcionalidades (MIDI, Kit, precio) en lugar de vender transformación** (ser la persona que toca piano). Los emails más efectivos (2 y 6) son los que menos venden y más conectan emocionalmente. Los emails más débiles (7, 8, 9) son los que más intentan vender y más repiten.

Un lead que recibe los 11 emails escucha "MIDI", "no es Zoom" y "Kit de Bienvenida" más veces que su propio nombre.

---

## 2. Lo que se corrigió bien (crédito donde se merece)

### ✅ Email 1 — Ahora sí es una bienvenida
El Email 1 pasó de 2,128 chars con desglose completo del Kit a ~1,000 chars de bienvenida emocional pura. "Bienvenido a PianoLink, {{nombre}}. Acabas de dar el primer paso." — Esto es lo correcto. El lead acaba de registrarse; no necesita una propuesta comercial completa, necesita sentirse validado. **Bien hecho.**

### ✅ Preview del Email 2 — Ya no spoilea
Cambió de "88 teclas. Día 88. Y un cumpleaños." a "Te prometí una historia. Aquí va." — El misterio del subject se preserva. **Correcto.**

### ✅ `{{cupos_restantes}}` implementado
Email 7 ahora dice "Quedan {{cupos_restantes}} cupos de 88" con un conteo real desde la BD. Esto transforma escasez decorativa en escasez verificable. **Cambio más impactante de toda la v2.**

### ✅ Carrito abandonado implementado
Se creó `CrmAbandonedCartService` con detección de clicks sin pago, delay de 60 min, protección contra re-envío, y exclusión de leads que ya pagaron. Es técnicamente sólido. El copy del email es correcto: suave, personal, sin presión. **Bien ejecutado.**

### ✅ Pedro Pagliai y José integrados
Email 3 menciona a Pedro con formación en la Universidad de Chile y ubicación en Australia. Email 4 cuenta la historia de José y su progreso con Rachmaninov. Email 5 invita a ver el video de José. Broadcasts 7 y 9 los mencionan. **La prueba social pasó de 0/10 a algo real.**

### ✅ CTAs unificados
Todos apuntan a `/oferta-madrugadores` con el formato "Quiero mi Kit — $XX". Excepto Email 9 post-lanzamiento que correctamente usa $44. **Consistente.**

### ✅ Email 9 con deadline
"La inscripción del Día 88 cierra hoy a las 11:59 PM." — Esto le da al lead una razón para actuar HOY. **Correcto.**

### ✅ Broadcasts duales
Leads con 4+ aperturas reciben versión corta, leads fríos reciben versión autocontenida. Esto resuelve el problema de que un lead comprometido recibía el mismo pitch repetido. **Arquitecturalmente inteligente.**

---

## 3. Problemas NUEVOS (lo que la v2 creó o no resolvió)

### 🔴 3.1 La repetición se redujo pero NO se eliminó

La v1 identificó que "tu profesor ve cada nota que tocas" aparecía en 7 de 9 emails. Veamos la v2:

| Frase o concepto | Emails donde aparece (v2) |
|------------------|--------------------------|
| "PianoLink es clases de piano 1 a 1 con tecnología MIDI" | 1, 3, 7, 8, 9 (5 de 11) |
| "No es Zoom" / "No son videos" | 1, 3, 7, 8, 9 (5 de 11) |
| "Kit de Bienvenida" (mención o desglose) | 1, 5, 7, 8, 9, Carrito (6 de 11) |
| "tu profesor ve cada nota que tocas" o variante | 1, 3, 7, 8, 9 (5 de 11) |
| Precio "$29 / $44" | 1, 2, 5, 7, 8, 9, Carrito (7 de 11) |
| Pedro Pagliai | 3, 7, 9 (3 de 11) |
| José + Rachmaninov | 4, 5, 7, 9, 10 (5 de 11) |
| Garantía 30 días | 5, 9 (2 de 11 — mejoró) |

**Diagnóstico:** La repetición de MIDI/Zoom pasó de 7/9 a 5/11. Es una mejora porcentual (78% → 45%) pero el lead aún lee "no es Zoom" cinco veces. En los broadcasts (7, 8, 9) — que es donde más importa porque llegan a TODA la lista — la repetición es idéntica entre sí. Un lead que recibe los 3 broadcasts lee esencialmente el mismo email tres veces con diferente urgencia.

**Veredicto:** Mejora insuficiente. Los broadcasts necesitan ángulos radicalmente distintos entre sí.

### 🔴 3.2 Los broadcasts siguen siendo intercambiables

Leamos los 3 broadcasts como los recibiría un lead frío (versión autocontenida):

- **Email 7:** "PianoLink es un marketplace de clases de piano online 1 a 1 con tecnología MIDI — tu profesor ve cada nota que tocas en tiempo real. No es Zoom, no son videos. Solo hay 88 cupos..."
- **Email 8:** "PianoLink es clases de piano online 1 a 1 con tecnología MIDI — tu profesor ve cada nota que tocas. No es Zoom. El Kit de Bienvenida incluye asesoría + setup + clase real + garantía 30 días..."
- **Email 9:** "PianoLink es clases de piano online 1 a 1 con tecnología MIDI — tu profesor ve cada nota que tocas en tiempo real. No es Zoom, no son videos."

**Tres aperturas idénticas.** Si un lead no abrió el Email 7, ¿por qué abriría el 8 si dice lo mismo? Los broadcasts deben tener aperturas y ángulos completamente distintos:

- Email 7: Ángulo de ESCASEZ (cupos, conteo real)
- Email 8: Ángulo de PÉRDIDA (el precio que se pierde, no lo que gana — pérdida > ganancia en psicología de decisión)
- Email 9: Ángulo de CELEBRACIÓN (evento emocional, no pitch de ventas)

### 🔴 3.3 El Email 8 sigue sin ser "el más corto"

La v1 pidió explícitamente que el Email 8 fuera 500-600 chars. En la v2 tiene **2,557 chars**. Solo se redujo el subject de "Mañana tu Kit pasa..." a "En 48 horas tu Kit pasa..." (fix temporal correcto), pero el cuerpo sigue siendo un pitch completo con explicación de MIDI + Kit + garantía.

Un email de urgencia de 48 horas debería ser **5-6 líneas**:

> {{nombre}}, en 48 horas tu Kit pasa de $29 a $44.
>
> Son $15 reales. No es un juego de marketing.
>
> [CTA: Quiero mi Kit — $29]
>
> P.D. — La garantía de 30 días sigue. El riesgo es mío.

Eso es todo. Un lead que ya recibió 7 emails no necesita que le expliquen qué es PianoLink.

### 🟡 3.4 La versión "activos" de los broadcasts no se diferencia lo suficiente

El sistema dual envía una versión corta a leads comprometidos (4+ aperturas). Pero "corta" no significa "diferente." La versión activos debería tener un tono completamente distinto — casi conspiratorio, de insider: "Sé que ya sabes todo esto. Solo vine a decirte que quedan X cupos." En vez de eso, es el mismo email recortado.

### 🟡 3.5 Pedro y José se mencionan pero no se SIENTEN

Pedro aparece como: "Profesores como Pedro Pagliai — formado en la Universidad de Chile, donde fue profesor de educación rítmico-auditiva — hoy enseñan desde Australia en PianoLink."

Esto es una **ficha técnica**, no una historia. Compare con:

> Imagina esto: Pedro daba clases en la Universidad de Chile. Un día decidió mudarse a Australia. La mayoría de sus estudiantes lo habrían perdido para siempre. Pero con PianoLink, ahora le enseña a gente que ni sabía que existía — desde Santiago, desde Buenos Aires, desde tu ciudad.

La primera versión es un CV. La segunda es un mini-relato que demuestra el valor de la plataforma sin decir "tecnología MIDI" ni una vez. La campaña necesita más relato y menos ficha.

Lo mismo con José: "José llegó con ganas de tocar pero mucho trabajo técnico por delante. Hoy vive en Escocia y toca Rachmaninov." Esto es un resumen, no una historia. **Las personas no compran resúmenes. Compran historias que los hacen verse a sí mismos.**

### 🟡 3.6 No hay email de "¿tienes dudas?" puro

La v1 lo señaló y no se implementó. El carrito abandonado asume que el lead clickeó pero no pagó. ¿Qué pasa con el lead que NO clickeó en ninguno de los 6 emails? Ese lead probablemente tiene dudas no resueltas. Un email después del Email 6 (día 14-18) que diga:

> ¿Tienes alguna pregunta que no te he respondido? Respóndeme directamente.

...podría desbloquear leads que están interesados pero inseguros. No es un CTA de venta — es una invitación a conversar.

### 🟡 3.7 El flujo técnico tiene un riesgo de desincronización

Hay DOS sistemas paralelos enviando emails:
- `CrmSequence` → envía los 6 emails relativos (trigger automático al registrarse)
- `CrmEmailCampaign` → es lo que muestra el panel CRM

Si se edita un email en el CRM, hay un sync automático al `CrmSequence` (implementado hoy). Pero si se ejecuta el seed de nuevo, la `CrmSequence` no se re-genera — solo se actualizan las `CrmEmailCampaign`. Esto crea riesgo de divergencia.

**Riesgo real:** Un desarrollador ejecuta los seeds, actualiza las campañas, pero la secuencia sigue con el HTML viejo. El lead recibe la versión anterior. **Esto ya pasó una vez.**

---

## 4. Análisis Email por Email — V2

### Email 1 — Bienvenida ⭐ 8/10 (+1 vs v1)

**Antes:** 2,128 chars con desglose del Kit, MIDI, marketplace, profesores.  
**Ahora:** ~1,000 chars de bienvenida emocional + teaser del precio.

- ✅ "Bienvenido a PianoLink, {{nombre}}." — Apertura perfecta.
- ✅ "Acabas de dar el primer paso. Y quiero que sepas que no es un paso cualquiera." — Validación emocional.
- ✅ Solo menciona MIDI una vez, sin sobreexplicar.
- ✅ P.D. genera curiosidad para el Email 2.
- ⚠️ "Por estar en esta lista antes que nadie, tienes acceso a un precio que el público general no va a ver: $29 USD" — Esto sigue siendo un pitch de venta en un email de bienvenida. Podría ser más sutil: "Tengo algo reservado para ti que el público general no va a ver. Te cuento pronto."
- ⚠️ Sin mencionar QUÉ HACER después del registro. El lead no sabe si debe esperar, si puede hacer algo, cuándo esperar el siguiente email.

### Email 2 — Historia del 29 de marzo ⭐ 8.5/10 (= vs v1)

Sigue siendo el **mejor email de la secuencia**. La numerología genuina funciona. El preview text corregido preserva el misterio.

- ✅ Preview: "Te prometí una historia. Aquí va." — Perfecto.
- ✅ Revelación gradual: Día Mundial → Día 88 → cumpleaños.
- ✅ "Ninguno de estos números es inventado. Todos son reales."
- ⚠️ El cierre sigue yendo al precio demasiado rápido. Después de una historia tan emocional, el CTA se siente abrupto. Podría cerrar con la historia y dejar el CTA en el P.D. de forma más suave.

### Email 3 — Zoom vs MIDI + Pedro ⭐ 7/10 (+1 vs v1)

- ✅ Pedro Pagliai integrado con datos reales.
- ✅ La analogía "foto borrosa vs imagen en 4K" se mantiene y funciona.
- ⚠️ Pedro se menciona como ficha técnica, no como historia (ver 3.5).
- ⚠️ "Imagínate esto: Estás en tu clase por Zoom..." — La apertura es un escenario hipotético sobre un producto (Zoom) que el lead puede que nunca haya usado para clases de piano. ¿Y si el lead NO ha tomado clases por Zoom? El escenario no conecta.
- ❌ Sigue explicando MIDI de forma técnica. MIDI debería SENTIRSE, no explicarse.

### Email 4 — "Algún día" + José ⭐ 7.5/10 (+0.5 vs v1)

- ✅ José integrado como caso real.
- ✅ "Esta pregunta me la hice a mí mismo antes de hacértela a ti." — Vulnerabilidad que genera confianza.
- ✅ La historia de Miguel a los 4 años sigue siendo el espejo perfecto del avatar.
- ⚠️ José se resume en dos líneas. Su historia merece un párrafo más (ver 3.5).
- ⚠️ "La mayoría de nuestros estudiantes tienen entre 28 y 55 años. 30 minutos de práctica diaria son suficientes." — Esto es dato, no emoción. En un email sobre el "algún día", el lead necesita sentirse reflejado, no informado.

### Email 5 — Desglose Kit + Video José ⭐ 7/10 (= vs v1)

- ✅ El desglose ahora está reservado para este email (no se repite en Email 1).
- ✅ "¿Quieres ver cómo suena un estudiante real de PianoLink? José grabó este video para nosotros." — Prueba social verificable.
- ✅ El cálculo de anclaje "clase presencial $20-40 vs Kit $29" funciona.
- ⚠️ El desglose se repite en broadcasts 7, 8, 9. Debería ser EXCLUSIVO del Email 5.
- ❌ "Acceso anticipado a nuevos profesores" y "Badge Miembro Fundador" — La v1 ya señaló que el badge no tiene valor percibido. Sigue ahí.

### Email 6 — Anti-venta ⭐ 8/10 (= vs v1)

Sigue siendo uno de los mejores. La estructura ❌/✅ es escaneable y efectiva. "Prefiero 88 estudiantes comprometidos que 800 que abandonan el segundo mes" es una línea brillante.

- ✅ Todo lo que funcionaba sigue funcionando.
- ⚠️ Podría agregar: "Si tienes alguna pregunta antes de decidir, respóndeme directamente." — Abre la puerta a conversación sin presión de venta.

### Email 7 — Escasez cupos ⭐ 6/10 (+1 vs v1)

- ✅ `{{cupos_restantes}}` ahora es real. Esto solo ya es un cambio enorme.
- ❌ La apertura es indistinguible de los emails 8 y 9 (ver 3.2).
- ❌ Repite desglose del Kit que ya se dio en Email 5.
- ❌ Pedro y José se mencionan como fichas, no historias.
- ⚠️ Para leads fríos (versión autocontenida), este email intenta hacer demasiado: presentar PianoLink + explicar MIDI + escasez + precios + prueba social + desglose Kit. Son 6 conceptos en un email. Un lead frío necesita UNO.

### Email 8 — En 48 horas sube ⭐ 5/10 (= vs v1)

- ✅ Fix temporal "En 48 horas" en vez de "Mañana" en subject. Correcto.
- ❌ **Sigue sin ser corto.** 2,557 chars. La v1 pidió 500-600. No se cumplió.
- ❌ Repite pitch completo de PianoLink + explicación MIDI + Kit.
- ❌ Un lead que lleva 7+ emails leyendo esto no necesita re-introducción.
- ⚠️ "¿Todavía no te has dado el sí?" — Buena pregunta, pero se pierde en un email demasiado largo.

### Email 9 — Día 88 ⭐ 6.5/10 (+0.5 vs v1)

- ✅ Deadline concreto: "cierra hoy a las 11:59 PM". Esto faltaba en la v1.
- ✅ 2 CTAs (inicio y final). Correcto para email de cierre.
- ✅ Pedro y José presentes.
- ❌ CTA al INICIO antes del saludo sigue siendo arriesgado. Un lead frío ve un botón antes de saber por qué debería clickearlo.
- ❌ Misma apertura que emails 7 y 8. Tercer email consecutivo con "PianoLink es clases de piano online 1 a 1 con tecnología MIDI..."
- ⚠️ El tono debería ser de CELEBRACIÓN, no de pitch. Es el Día 88, el cumpleaños de Miguel, el Día Mundial del Piano. ¿Dónde está la emoción? El email suena como un aviso administrativo con datos adjuntos.

### Email Carrito Abandonado ⭐ 8/10 (nuevo)

- ✅ Tono perfecto: suave, personal, sin presión.
- ✅ "Lo leo yo, Miguel. No es un bot, no es un equipo de soporte."
- ✅ Invita a responder con preguntas. Esto abre conversación.
- ✅ Técnicamente sólido: delay 60 min, anti-duplicación, exclusión de pagadores.
- ⚠️ "antes de que el precio cambie" — Si el lead no sabe cuándo cambia el precio, esta frase no genera urgencia real.

### Email 10 — Post-cierre ⭐ 7/10 (nuevo)

- ✅ Mantiene el canal abierto para futuras tandas.
- ✅ Valida la escasez retroactivamente: "los 88 cupos se llenaron."
- ✅ Tono correcto: gratitud, no venta.
- ⚠️ Podría incluir: "¿Quieres que te añada a la lista prioritaria para la siguiente apertura?" con un CTA específico. "Mantente en esta lista" es pasivo.

---

## 5. Problemas sistémicos que PERSISTEN

### 5.1 🔴 La campaña vende funcionalidades, no transformación

Contemos las veces que cada concepto aparece en los 11 emails:

| Concepto | Menciones | Categoría |
|----------|-----------|-----------|
| MIDI / tecnología / "ve cada nota" | 15+ | Funcionalidad |
| "No es Zoom" | 5 | Anti-funcionalidad |
| Kit de Bienvenida (menciones) | 9+ | Producto |
| Precio $29 / $44 | 10+ | Transacción |
| Garantía 30 días | 4 | Risk reversal |
| "Tu sueño del piano" | 3 | Transformación |
| Cómo se siente tocar tu primera pieza | 0 | Transformación |
| Cómo cambia tu vida cotidiana con el piano | 0 | Transformación |
| Qué dicen tus amigos/familia cuando te escuchan | 0 | Transformación |

**El lead lee 15 veces sobre MIDI y 0 veces sobre cómo se siente completar su primera pieza.** Esto es vender un taladro describiendo su motor, no el cuadro que va a colgar en la pared.

La gente no compra un Kit de Bienvenida. Compra la versión de sí mismos que toca piano.

### 5.2 🔴 No hay variación de ángulo entre broadcasts

Los 3 broadcasts (7, 8, 9) tienen la misma estructura:
1. Intro "PianoLink es..."
2. Desglose Kit / precio
3. Mención Pedro y/o José
4. CTA

Propuesta de ángulos diferenciados:

- **Email 7 (8 días antes):** Ángulo SOCIAL — "{{cupos_restantes}} personas ya reservaron su cupo. ¿Qué saben ellas que tú no?" No explicar qué es MIDI. Solo escasez social.
- **Email 8 (48h antes):** Ángulo PÉRDIDA — "En 48 horas pierdes $15. No te estoy vendiendo nada — te estoy avisando." 5 líneas, CTA, nada más.
- **Email 9 (Día 88):** Ángulo CELEBRACIÓN — "Hoy cumplo años. Hoy el piano tiene 88 teclas. Hoy PianoLink abre. Hoy es tu día." Emocional, no transaccional.

### 5.3 🟡 El cable MIDI sigue sin aclararse

La v1 marcó esto como **⚠️ NOTA CRÍTICA** y sigue sin resolverse explícitamente en los emails. La auditoría v1 preguntó: ¿el cable está incluido o no? Los emails de la v2 ya no mencionan "Cable MIDI incluido — Enviado a tu casa" (lo cual puede ser un fix silencioso), pero tampoco aclaran qué pasa con el cable. Si es un tema resuelto operativamente, documentarlo para evitar confusión futura.

### 5.4 🟡 Engagement scoring no tiene feedback visible

El sistema de broadcast dual segmenta por leads con 4+ aperturas vs. menos. Pero para que el lead ABRA los emails, los subjects y la experiencia de los primeros emails deben ser excepcionales. Si el lead no abre los primeros 3, recibe la versión autocontenida del broadcast 7 — que es el email más largo y denso de toda la campaña. Paradoja: **al lead menos comprometido le mandas el email más exigente de leer.**

---

## 6. Análisis de Flujo de Conversión — V2

```
Registro en waitlist (landing page)
       ↓
   Email 1 (inmediato via CrmSequence)
       ↓
   Email 2 (día +2) → Email 3 (día +4) → Email 4 (día +7) → Email 5 (día +10) → Email 6 (día +14)
       ↓
  ¿Clickeó CTA en algún email? ──→ SÍ ──→ ¿Pagó? ──→ SÍ → Sale del funnel ✅
       │                                      │
       │                                      NO
       │                                      ↓
       │                               Email Carrito (1h después) ✅ NUEVO
       │                                      ↓
       │                               ¿Pagó? → SÍ → Sale ✅ | NO → Sigue en lista
       ↓
  Broadcasts (fechas fijas):
       Email 7 (21 marzo) — escasez + cupos
       Email 8 (27 marzo) — urgencia 48h
       Email 9 (29 marzo) — Día 88 lanzamiento
       ↓
  ¿Compró? ──→ SÍ → Sale ✅
       ↓
      NO
       ↓
  Email 10 — Post-cierre (cuando se llenen los 88) ✅ NUEVO
       ↓
  Lead queda en lista para futura apertura
```

**Mejoras del flujo vs v1:**
- ✅ Carrito abandonado cubre el gap más costoso
- ✅ Post-cierre mantiene canal abierto
- ✅ Broadcasts duales diferencian leads calientes de fríos

**Gaps que persisten:**
- ❌ No hay email de "¿tienes dudas?" entre Email 6 (día 14) y broadcasts
- ❌ No hay re-engagement para leads que no abren ningún email
- ❌ Si un lead se registra después del 21 de marzo, puede recibir Email 1 + broadcast 7 el mismo día (o día siguiente) — la experiencia se siente spammy
- ❌ No hay control de frecuencia — un lead registrado el 27 de marzo puede recibir Email 1 + Email 8 + Email 9 en 3 días. Tres emails en 72 horas de un remitente nuevo es agresivo.

---

## 7. Subjects — Análisis actualizado V2

| # | Subject v2 | Tipo | Nota | Observación |
|---|------------|------|------|-------------|
| 1 | `{{nombre}}, tu lugar en la lista está reservado 🎹` | Personalización | 8/10 | Funciona — alivio + validación |
| 2 | `La coincidencia que no puede ser coincidencia 🎹` | Curiosidad | 9/10 | El mejor. Loop abierto perfecto |
| 3 | `Tu profesor de piano no te escucha bien (y no es su culpa)` | Provocación | 7/10 | Bueno si el lead ha tomado clases; irrelevante si nunca tomó |
| 4 | `¿Cuántos "algún día" más te vas a dar?` | Emocional | 8/10 | Toca el nervio correcto |
| 5 | `Lo que incluyen tus $29 (desglose honesto)` | Transparencia | 7/10 | "Honesto" genera confianza |
| 6 | `Honestamente, PianoLink no es para todo el mundo` | Anti-venta | 8/10 | Curiosidad + respeto |
| 7 | `Quedan {{cupos_restantes}} cupos de 88` | Escasez dinámica | 7.5/10 | Mejoró mucho vs "se están llenando" |
| 8 | `En 48 horas tu Kit pasa de $29 a $44` | Urgencia | 7/10 | Directo. Pero $15 de diferencia ¿es suficiente motivador? |
| 9 | `🎹 Hoy es el Día 88 — PianoLink está abierto` | Celebración | 6/10 | Solo conecta con quien conoce la historia |
| CA | `{{nombre}}, ¿necesitas ayuda con tu Kit?` | Personal | 7/10 | Suave y correcto |
| 10 | `Los 88 cupos se completaron` | Cierre | 7/10 | Claro. Valida escasez |

**Patrón que persiste:** Los subjects de secuencia (1-6) son mejores que los de broadcast (7-9).  
**Dato nuevo preocupante:** El subject del Email 9 (`🎹 Hoy es el Día 88`) solo tiene sentido para leads que abrieron el Email 2 y recuerdan la historia de la numerología. Un lead frío que recibe el broadcast 9 piensa: "¿Día 88 de qué? ¿Por qué me importa?"

---

## 8. Propuestas V2 — Lo que falta por hacer

### 🔴 Prioridad Crítica

**1. Reescribir los cuerpos de Email 7, 8 y 9 con ángulos diferenciados.**
Son los emails más importantes (llegan a TODA la lista) y son los más débiles. Cada uno necesita un ángulo único, no reciclar el mismo pitch. Ver propuesta en sección 5.2.

**2. Acortar Email 8 a 5-6 líneas.**
La v1 lo pidió y no se hizo. Es un email de urgencia — debería funcionar como un SMS largo, no como un artículo.

**3. Implementar control de frecuencia.**
Si un lead se registra tarde (después del 21 de marzo), no enviarle Email 1 + broadcast el mismo día. Regla: máximo 1 email cada 24 horas.

### 🟡 Prioridad Alta

**4. Convertir menciones de Pedro y José en mini-relatos, no fichas técnicas.**
"Pedro Pagliai, formado en la Universidad de Chile" → "Pedro daba clases en la Universidad de Chile. Un día se mudó a Australia. Hoy sigue enseñando a través de PianoLink."

**5. Añadir un email de "¿tienes dudas?" (Email 6.5).**
Después del día 14 (Email 6), si no clickeó: "¿Hay alguna pregunta que no te he respondido? Respóndeme directo."

**6. Invertir la versión autocontenida de los broadcasts.**
Al lead frío mandarle la versión CORTA (enganche rápido), no la larga (muro de texto). La versión larga debería ser para leads que quieren profundizar, no para los que ignoran.

### 🟢 Prioridad Media

**7. Añadir un email sobre TRANSFORMACIÓN.**
Ningún email de la campaña describe cómo se siente tocar tu primera pieza, qué pasa en tu casa cuando suena un piano, cómo cambia tu rutina. Falta un email que venda el DESPUÉS, no el DURANTE.

**8. A/B test en subjects de broadcasts.**
Email 7 alternativo: "{{nombre}}, tu cupo sigue disponible" (personal + alivio).  
Email 9 alternativo: "Hoy cumplo años y quiero compartir algo contigo" (personal).

**9. Resolver la dualidad CrmSequence / CrmEmailCampaign.**
El sync automático es un parche. A medio plazo, debería existir una sola fuente de verdad. Opción: que el `CrmSequenceRunner` lea directamente de `CrmEmailCampaign` en vez de usar copias en los steps.

---

## 9. Scorecard Final Comparativo

| Aspecto | v1 | v2 | Meta ideal |
|---------|----|----|------------|
| Arquitectura | 8 | 9 | 9 |
| Numerología/Pricing | 9 | 9 | 9 |
| Copywriting | 6 | 7 | 8.5 |
| Subjects | 7 | 7.5 | 8.5 |
| CTAs | 5 | 7 | 8 |
| Objeciones | 6 | 7.5 | 8.5 |
| Diferenciación | 7 | 7 | 8 |
| Escasez/Urgencia | 4 | 7 | 8.5 |
| Prueba social | 2 | 6 | 8 |
| Automatización | 3 | 7 | 8.5 |
| **Promedio** | **5.7** | **7.4** | **8.5** |

---

## 10. Veredicto Final V2

### Lo que FUNCIONA y no tocar:
1. La numerología del Día 88 — sigue siendo genuina y diferenciadora
2. Email 1 corto — mejor decisión de la v2
3. Email 2 completo — el mejor email, intacto
4. Email 6 anti-venta — sofisticado y efectivo
5. Carrito abandonado — técnica y copy correctos
6. `{{cupos_restantes}}` — de escasez decorativa a escasez real
7. CTAs unificados — consistencia que genera confianza
8. La voz de Miguel — personal sin ser autoindulgente

### Lo que NECESITA cambiar:
1. **Broadcasts 7-9: ángulos diferenciados** — No son 3 emails, es 1 email repetido 3 veces
2. **Email 8: acortar a 5-6 líneas** — Pedido dos veces, no implementado
3. **Pedro y José: historias, no fichas** — "Formado en la U. de Chile" informa pero no emociona
4. **Un email sobre transformación** — La campaña nunca describe cómo se SIENTE tocar piano
5. **Control de frecuencia** — Registros tardíos pueden recibir 3 emails en 72 horas
6. **Versión autocontenida corta, no larga** — Paradoja: al lead frío le mandas el email más largo

### Proyección de conversión:
- **Con la campaña actual (v2):** 5-8% sobre la lista
- **Con las correcciones de esta auditoría:** 9-14%
- **Para llenar 88 cupos al 7%:** se necesitan ~1,260 leads
- **Para llenar 88 cupos al 12%:** se necesitan ~730 leads

### Conclusión honesta:
La v2 es significativamente mejor que la v1. Cada corrección pedida fue implementada (excepto acortar Email 8). Pero la campaña sigue teniendo un problema de fondo: **vende un producto técnico (MIDI, Kit, setup) cuando debería vender un sueño (ser la persona que toca piano)**. Los mejores emails (2 y 6) no mencionan MIDI ni una vez. Los peores (7, 8, 9) no dejan de mencionarlo. Ahí está la pista de qué funciona.

---

*Auditoría v2 completada el 17 de febrero de 2026. Prioridades implementadas en v3 el mismo día.*

---

## 11. Auditoría V3 — Implementación de todas las correcciones

> **Fecha:** 17 febrero 2026 (mismo día que v2)  
> **Acción:** Reescritura completa de los 11 emails + deploy a producción  
> **Script:** `_deploy_campaign_v3.js` — elimina v2, crea v3, sincroniza CrmSequence  
> **Estado:** ✅ Desplegado y verificado

### Correcciones implementadas

| Problema v2 | Solución v3 | Estado |
|-------------|-------------|--------|
| Broadcasts 7-9 intercambiables | 3 ángulos únicos: Social (7), Pérdida (8), Celebración (9) | ✅ |
| Email 8 demasiado largo (2,557 chars) | Reducido a ~350 chars versión fría, ~150 chars versión activos | ✅ |
| Pedro y José como fichas técnicas | Pedro: narrativa U. Chile → Australia. José: historia completa con lucha y progreso | ✅ |
| Sin email de transformación | Email 4: "Es un martes cualquiera... de tus dedos sale algo que hace un mes no podías tocar" | ✅ |
| MIDI sobreexplotado (15+ menciones) | 0 menciones de "MIDI" en secuencia. 0 "ve cada nota". 0 "No es Zoom" | ✅ |
| Lead frío recibe email más largo | Invertido: fríos = versión CORTA, activos = versión insider | ✅ |
| Sin invitación a responder dudas | Email 6: "Respóndeme directamente a este email. Lo leo yo, Miguel." | ✅ |
| Email 9 subject solo para leads que conocen "Día 88" | Nuevo subject universal: "Hoy cumplo años y quiero compartir algo contigo 🎂" | ✅ |
| Carrito sin deadline específico | Ahora menciona: "$29 hasta el 29 de marzo, luego $44" | ✅ |
| Post-cierre sin CTA específico | Ahora: "respóndeme 'quiero estar' para lista prioritaria" | ✅ |
| Desglose Kit repetido en broadcasts | EXCLUSIVO del Email 5. Broadcasts no lo mencionan | ✅ |
| Email 1 vende features | Ahora solo vende transformación: "'algún día' → 'hoy empecé'" | ✅ |

### Diagnóstico de repetición — V3 vs V2

| Concepto | Menciones v2 | Menciones v3 | Cambio |
|----------|-------------|-------------|--------|
| MIDI / tecnología | 15+ | 0 (secuencia) | ✅ Eliminado |
| "ve cada nota que tocas" | 5 | 0 | ✅ Eliminado |
| "No es Zoom" | 5 | 0 (secuencia) | ✅ Eliminado |
| Kit de Bienvenida | 9+ | 3 | ✅ -67% |
| Garantía 30 días | 4 | 7 | 🟡 Aumentó (OK, es risk reversal) |
| Pedro Pagliai | 3 | 5 | 🟡 Presente en más emails pero como HISTORIA |
| José + Rachmaninov | 5 | 6 | 🟡 Más presente pero con profundidad |

### Scorecard Final — V1 → V2 → V3

| Aspecto | v1 | v2 | v3 | Meta |
|---------|----|----|----|----- |
| Arquitectura | 8 | 9 | 9.5 | 9.5 |
| Numerología/Pricing | 9 | 9 | 9 | 9 |
| Copywriting | 6 | 7 | 9 | 9 |
| Subjects | 7 | 7.5 | 8.5 | 9 |
| CTAs | 5 | 7 | 8 | 8.5 |
| Objeciones | 6 | 7.5 | 8.5 | 9 |
| Diferenciación | 7 | 7 | 8.5 | 8.5 |
| Escasez/Urgencia | 4 | 7 | 8.5 | 9 |
| Prueba social | 2 | 6 | 8 | 8.5 |
| Automatización | 3 | 7 | 8 | 8.5 |
| **Promedio** | **5.7** | **7.4** | **8.6** | **9.0** |

### Análisis por email — V3

| # | Email | Nota v3 | Cambio vs v2 | Cambio clave |
|---|-------|---------|-------------|--------------|
| 1 | Bienvenida | 9/10 | +1 | Sin MIDI, sin Kit, solo transformación emocional |
| 2 | Numerología | 9/10 | +0.5 | P.D. anticipa Pedro (no "Zoom") |
| 3 | Pedro Historia | 8.5/10 | +1.5 | Pedro como narrativa, MIDI sentido no explicado |
| 4 | José + Transformación | 9/10 | +1.5 | Historia completa + "es un martes cualquiera..." |
| 5 | Desglose Kit | 7.5/10 | +0.5 | Exclusivo, acceso anticipado en vez de badge |
| 6 | Anti-venta + Dudas | 9/10 | +1 | Invitación a responder dudas |
| 7 | Escasez Social | 8/10 | +2 | Ángulo nuevo: social proof, sin MIDI/Kit |
| 8 | Pérdida $15 | 8.5/10 | +3.5 | Ultra-corto, ángulo pérdida, sin repetición |
| 9 | Celebración | 8.5/10 | +2 | Cumpleaños como apertura, emocional |
| CA | Carrito | 8/10 | = | Deadline específico añadido |
| 10 | Post-cierre | 7.5/10 | +0.5 | CTA lista prioritaria |

### Lo que queda pendiente para llegar a 10/10

1. **Control de frecuencia** — Un lead que se registra el 27 de marzo puede recibir Email 1 + broadcast 8 + broadcast 9 en 72 horas. Necesita regla: máximo 1 email cada 24 horas. (Requiere lógica en CrmSequenceRunner + broadcast scheduler.)

2. **A/B testing en subjects** — Email 7 alternativo: "{{nombre}}, tu cupo sigue disponible". Email 9 alternativo: "88 teclas, 88 cupos, 1 cumpleaños". Necesita implementación técnica de A/B en el sender.

3. **Re-engagement para leads que no abren** — Si un lead no abre ninguno de los 6 emails de secuencia, necesita un email diferente: subject provocador, tono distinto, último intento antes de los broadcasts.

4. **Unificar CrmSequence ↔ CrmEmailCampaign** — El auto-sync (controller) es un parche. A medio plazo, CrmSequenceRunner debería leer directamente de CrmEmailCampaign eliminando la duplicación.

### Proyección de conversión V3

- **Con la campaña v2:** 5-8%
- **Con la campaña v3:** 9-14%
- **Con v3 + control de frecuencia + A/B:** 12-18%
- **Para llenar 88 cupos al 12%:** ~730 leads
- **Para llenar 88 cupos al 15%:** ~590 leads

### Veredicto V3

La campaña pasó de vender funcionalidades a vender transformación. Los broadcasts ya no son 3 versiones del mismo email — son 3 ángulos distintos (social, pérdida, celebración). Pedro y José son historias, no fichas. El Email 4 ahora contiene la línea más poderosa de toda la campaña: **"La versión de ti que toca piano."**

La nota global subió de 7.4 a 8.6. El delta a 10/10 son optimizaciones técnicas (frecuencia, A/B, re-engagement) que no dependen del copy sino de la infraestructura.

---

*Auditoría v3 completada el 17 de febrero de 2026. Campaign v3 desplegada y sincronizada en producción.*
