/**
 * crm/seeds/seedCampanaEmailMarketing.js
 * 
 * Campaña completa de email marketing para lanzamiento Día 88.
 * Arquitectura híbrida: 6 emails relativos + 3 broadcasts.
 * 
 * - Emails 1-6: CrmSequence con delays relativos al registro
 * - Emails 7-9: CrmEmailCampaign tipo broadcast con fecha fija
 * 
 * Ejecutar: node crm/seeds/seedCampanaEmailMarketing.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const CrmEmailCampaign = require('../models/CrmEmailCampaign');
const CrmSequence = require('../models/CrmSequence');

// === CONEXIÓN DB ===
async function connectDB() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Conectado a MongoDB');
    } catch (error) {
        console.error('❌ Error conectando a MongoDB:', error.message);
        process.exit(1);
    }
}

// ═══════════════════════════════════════
// PLANTILLA HTML BASE
// ═══════════════════════════════════════

// Función que genera el HTML wrapper para cada email
function emailTemplate(bodyHtml, footerNote = 'El 29 de marzo abre PianoLink. Solo 88 cupos.') {
    return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f5f0;font-family:Georgia,serif;">
<table width="100%" cellpadding="0" cellspacing="0" bgcolor="#f5f5f0">
<tr><td align="center" style="padding:30px 20px;">
<table width="600" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
  <tr><td bgcolor="#0a0a0a" align="center" style="padding:28px 40px;">
    <span style="font-family:Georgia,serif;font-size:22px;color:#c9a84c;letter-spacing:2px;">🎹 PianoLink</span>
  </td></tr>
  <tr><td style="padding:48px 48px 32px;">
    ${bodyHtml}
  </td></tr>
  <tr><td bgcolor="#0a0a0a" style="padding:24px 48px;" align="center">
    <p style="color:#888;font-size:12px;margin:0 0 8px;">${footerNote}</p>
    <p style="margin:0;"><a href="{{unsubscribe_url}}" style="color:#666;font-size:11px;">No quiero recibir más emails — darme de baja</a></p>
    <p style="color:#555;font-size:11px;margin:8px 0 0;">© 2026 PianoLink · hola@pianolink.net</p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

// Botón CTA reutilizable
function ctaButton(text, url = 'https://pianolink.net/oferta-madrugadores') {
    return `<table width="100%" cellpadding="0" cellspacing="0" style="margin:32px 0;"><tr><td align="center">
      <a href="${url}" style="background:#c9a84c;color:#0a0a0a;text-decoration:none;padding:16px 36px;border-radius:4px;font-size:17px;font-weight:bold;display:inline-block;">${text}</a>
    </td></tr></table>`;
}

// Separador dorado
function separator() {
    return `<table width="100%" cellpadding="0" cellspacing="0"><tr><td style="border-top:2px solid #c9a84c;padding-bottom:24px;"></td></tr></table>`;
}

// Firma de Miguel
function firma() {
    return `<p style="font-size:16px;color:#333;margin:0;">Miguel Antonio<br><span style="color:#c9a84c;">Fundador, PianoLink</span></p>`;
}

// ═══════════════════════════════════════
// LOS 9 EMAILS
// ═══════════════════════════════════════

const emails = [
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // EMAIL 1 — Bienvenida + Oferta Madrugadores
    // Tipo: RELATIVO | Timing: Inmediato al registro
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
        nombre: 'Campaña Día 88 — Email 1: Bienvenida Madrugadores',
        asunto: '{{nombre}}, tu lugar en la lista está reservado 🎹',
        previewText: 'Tienes acceso a un precio que nadie más va a ver.',
        tipo: 'secuencia',
        ordenSecuencia: 1,
        contenidoHtml: emailTemplate(`
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 20px;">Hola {{nombre}},</p>
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 20px;">Soy Miguel Antonio, el fundador de PianoLink. Te escribo porque te registraste en pianolink.net para recibir información sobre el lanzamiento, y quiero agradecerte personalmente por haberte unido a la lista de espera.</p>
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 20px;">Si estás leyendo esto es porque en algún rincón de ti vive un sueño: <strong>tocar piano.</strong> Quizás lo postergaste años. Quizás pensaste que ya era tarde. Conozco ese sentimiento porque yo lo viví a los 4 años, cuando le pedí un piano a mis papás para Navidad.</p>
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 20px;">PianoLink es un marketplace de clases de piano online 1 a 1 con profesores reales y tecnología MIDI — tu profesor ve y escucha exactamente cada nota que tocas. No es Zoom. No es una app. Es lo más parecido a tener un maestro sentado a tu lado.</p>
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 20px;">Nuestros profesores son músicos con formación académica y experiencia docente real. Están seleccionados por su capacidad de enseñar a adultos — desde principiantes que nunca han tocado una tecla hasta quienes dejaron las clases hace años y quieren retomar. Y tú eliges con quién aprender.</p>
    ${separator()}
    <p style="font-size:18px;color:#0a0a0a;line-height:1.6;margin:0 0 20px;font-weight:bold;">Por estar en la lista, tienes algo que nadie más tendrá:</p>
    <table width="100%" cellpadding="0" cellspacing="0" bgcolor="#0a0a0a" style="border-radius:8px;">
      <tr><td style="padding:32px;text-align:center;">
        <p style="color:#c9a84c;font-size:13px;letter-spacing:2px;text-transform:uppercase;margin:0 0 4px;">PRECIO MADRUGADORES</p>
        <p style="color:#ffffff;font-size:36px;font-family:Georgia,serif;margin:0 0 4px;font-weight:bold;">$29 USD</p>
        <p style="color:#888;font-size:14px;margin:0 0 16px;">Precio público el 29 de marzo: <span style="text-decoration:line-through;">$44 USD</span></p>
        <p style="color:#888;font-size:14px;text-align:left;margin:0 0 6px;">✓ Asesoría técnica personalizada (~20 min)</p>
        <p style="color:#888;font-size:14px;text-align:left;margin:0 0 6px;">✓ Cable MIDI incluido — te lo enviamos</p>
        <p style="color:#888;font-size:14px;text-align:left;margin:0 0 6px;">✓ Setup por videollamada (~20 min)</p>
        <p style="color:#888;font-size:14px;text-align:left;margin:0 0 6px;">✓ Primera clase real de 30 min con profesor</p>
        <p style="color:#888;font-size:14px;text-align:left;margin:0 0 6px;">✓ 3 cupones de 15% OFF para tus primeras compras</p>
        <p style="color:#888;font-size:14px;text-align:left;margin:0 0 6px;">✓ Badge "Miembro Fundador" permanente</p>
        <p style="color:#888;font-size:14px;text-align:left;margin:0 0 6px;">✓ Garantía total — 30 días, sin preguntas</p>
      </td></tr>
    </table>
    ${ctaButton('🎹 Quiero mi Kit a $29')}
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 20px;">Este precio de $29 solo existe porque el lanzamiento es el 29 de marzo — el Día Mundial del Piano. Después de esa fecha, el Kit pasa a $44 para todos. Y cuando se llenen los 88 cupos, se cierra.</p>
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 20px;">Pero no te preocupes, no hay prisa hoy. Tienes hasta el 28 de marzo para aprovechar este precio. Solo quería que lo supieras desde ya.</p>
    ${firma()}
    <p style="font-size:14px;color:#999;margin:24px 0 0;font-style:italic;">P.D. ¿Sabes por qué elegí el 29 de marzo para lanzar PianoLink? Hay una historia detrás de esa fecha que es casi imposible de creer. Te la cuento en mi próximo email.</p>
        `)
    },

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // EMAIL 2 — La historia detrás del 29 de marzo
    // Tipo: RELATIVO | Timing: Día +2
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
        nombre: 'Campaña Día 88 — Email 2: Historia del 29 de marzo',
        asunto: 'La coincidencia que no puede ser coincidencia 🎹',
        previewText: '88 teclas. Día 88. Y un cumpleaños.',
        tipo: 'secuencia',
        ordenSecuencia: 2,
        contenidoHtml: emailTemplate(`
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 20px;">Hola {{nombre}},</p>
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 20px;">Te prometí una historia. Aquí va:</p>
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 20px;">El <strong>29 de marzo</strong> es el Día Mundial del Piano. El día que el mundo celebra este instrumento que cambió mi vida a los 4 años.</p>
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 20px;">Pero hay algo más.</p>
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 20px;">El 29 de marzo de 2026 es también el <strong>día 88 del año</strong>. Y un piano tiene exactamente <strong>88 teclas</strong>.</p>
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 20px;">Cuando me di cuenta de eso, se me erizó la piel. Pensé: <em>es demasiado perfecto para ignorarlo.</em></p>
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 20px;">Pero todavía hay más.</p>
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 20px;">El 29 de marzo es <strong>mi cumpleaños</strong>. Sí, el fundador de una plataforma de piano nació el Día Mundial del Piano, en el día 88 del año.</p>
    ${separator()}
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 20px;">Así que los números de PianoLink no son inventos de marketing:</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      <tr><td style="padding:12px 0;border-bottom:1px solid #eee;">
        <strong style="color:#c9a84c;font-size:20px;">88</strong> <span style="color:#333;font-size:15px;">cupos — uno por cada tecla del piano</span>
      </td></tr>
      <tr><td style="padding:12px 0;border-bottom:1px solid #eee;">
        <strong style="color:#c9a84c;font-size:20px;">$29</strong> <span style="color:#333;font-size:15px;">el precio madrugador — lleva tatuada la fecha</span>
      </td></tr>
      <tr><td style="padding:12px 0;border-bottom:1px solid #eee;">
        <strong style="color:#c9a84c;font-size:20px;">$44</strong> <span style="color:#333;font-size:15px;">el precio público — la mitad exacta de 88</span>
      </td></tr>
      <tr><td style="padding:12px 0;">
        <strong style="color:#c9a84c;font-size:20px;">Día 88</strong> <span style="color:#333;font-size:15px;">del año — Día Mundial del Piano — mi cumpleaños</span>
      </td></tr>
    </table>
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 20px;">Todo converge en un solo día. Y tú ya tienes tu lugar reservado en la lista.</p>
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 20px;">Si tu sueño del piano lleva tiempo esperando… quizás esta fecha no sea una coincidencia. Quizás sea una señal.</p>
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 20px;">Construí PianoLink porque cuando era niño habría dado cualquier cosa por un profesor que me guiara nota por nota, incluso a distancia. Hoy eso es posible gracias a la tecnología MIDI: tu profesor ve en su pantalla cada tecla que presionas, en tiempo real. No necesitas saber nada de tecnología — el cable viene incluido en tu Kit y lo configuramos juntos en una videollamada de 20 minutos.</p>
    ${ctaButton('🎹 Asegurar mi Kit a $29')}
    ${firma()}
    <p style="font-size:14px;color:#999;margin:24px 0 0;font-style:italic;">P.D. En mi próximo email te cuento algo que descubrí sobre Zoom y las clases de música que cambia completamente la forma en que entiendes la diferencia de PianoLink. No es lo que esperarías.</p>
        `)
    },

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // EMAIL 3 — Zoom vs MIDI
    // Tipo: RELATIVO | Timing: Día +4
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
        nombre: 'Campaña Día 88 — Email 3: Zoom vs MIDI',
        asunto: 'Tu profesor de piano no te escucha bien (y no es su culpa)',
        previewText: 'Zoom destruye algo que un cable de $10 puede salvar.',
        tipo: 'secuencia',
        ordenSecuencia: 3,
        contenidoHtml: emailTemplate(`
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 20px;">Hola {{nombre}},</p>
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 20px;">Imagina esto: estás en una clase de piano por Zoom. Tocas una pieza con todo tu esfuerzo. Tu profesor dice "sonó bien, pero revisa el compás 4".</p>
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 20px;">¿El problema? Tu profesor está <em>adivinando</em>.</p>
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 20px;">Zoom comprime el audio hasta destruir los matices musicales. Tu profesor escucha una versión borrosa de lo que realmente tocaste. Es como pedirle a un oftalmólogo que te revise la vista por teléfono.</p>
    ${separator()}
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr><td style="border-left:4px solid #c9a84c;background:#f5f5f0;padding:24px 28px;border-radius:0 8px 8px 0;">
        <h3 style="font-size:18px;color:#0a0a0a;margin:0 0 12px;">Con la tecnología MIDI de PianoLink:</h3>
        <p style="font-size:15px;color:#333;line-height:1.8;margin:0 0 8px;">→ Tu teclado se conecta a tu computadora con un cable MIDI</p>
        <p style="font-size:15px;color:#333;line-height:1.8;margin:0 0 8px;">→ Tu profesor <strong>ve en su pantalla</strong> exactamente qué teclas presionas</p>
        <p style="font-size:15px;color:#333;line-height:1.8;margin:0 0 8px;">→ Sabe con qué velocidad y fuerza tocas cada nota</p>
        <p style="font-size:15px;color:#333;line-height:1.8;margin:0;">→ Todo en <strong>tiempo real</strong> — puede corregirte al instante</p>
      </td></tr>
    </table>
    <div style="margin-top:24px;"></div>
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 20px;">Es la diferencia entre una foto borrosa y una imagen en 4K. Con Zoom tu profesor intuye. Con PianoLink, <strong>ve y escucha todo</strong>.</p>
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 20px;">Y si te preocupa que la tecnología sea complicada: no lo es. El cable MIDI viene incluido en tu Kit de Bienvenida — nosotros te lo enviamos. Y en una videollamada de 20 minutos lo configuramos todo juntos. No estás solo ni un segundo.</p>
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 20px;">La mayoría de los profesores de música online dan clase por Zoom porque no conocen otra alternativa. No son malos profesores — es que la herramienta los limita. En PianoLink les damos los datos MIDI en tiempo real para que puedan enseñar de verdad: detectar si confundes un Do con un Re, si tu ritmo se desfasa medio segundo, o si tocas una nota demasiado fuerte. Todo queda claro en la pantalla del profesor.</p>
    ${ctaButton('🎹 Quiero mi Kit a $29')}
    ${firma()}
    <p style="font-size:14px;color:#999;margin:24px 0 0;font-style:italic;">P.D. A veces la única diferencia entre alguien que toca piano y alguien que siempre quiso hacerlo… es el momento en que dice "hoy". Te escribo pronto con algo que llevo pensando hace tiempo.</p>
        `)
    },

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // EMAIL 4 — ¿Cuántos "algún día" más?
    // Tipo: RELATIVO | Timing: Día +7
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
        nombre: 'Campaña Día 88 — Email 4: Algún día',
        asunto: '¿Cuántos "algún día" más te vas a dar?',
        previewText: 'Esta pregunta me la hice a mí mismo antes de hacértela a ti.',
        tipo: 'secuencia',
        ordenSecuencia: 4,
        contenidoHtml: emailTemplate(`
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 20px;">Hola {{nombre}},</p>
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 20px;">Yo tenía 4 años cuando le pedí un piano a mis papás. Me dijeron "algún día". A los 10 llegó por fin: un teclado de 3 octavas. Seis años de "algún día".</p>
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 20px;">Lo que aprendí de esa espera es algo que hoy te quiero trasladar:</p>
    <p style="font-size:18px;color:#0a0a0a;line-height:1.6;margin:0 0 24px;font-style:italic;border-left:3px solid #c9a84c;padding-left:20px;">"El momento perfecto no existe. Pero el momento suficiente sí. Y suele ser hoy."</p>
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 20px;">Quizás te dices que eres muy mayor para aprender. La mayoría de los estudiantes en PianoLink tienen entre 28 y 55 años. El cerebro adulto tiene ventajas reales que un niño no tiene: disciplina, motivación y capacidad para entender conceptos complejos.</p>
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 20px;">Quizás piensas que no tienes tiempo. Las clases son desde tu casa, sin traslados, en el horario que tú elijas. Y con 30 minutos de práctica al día se ve progreso real.</p>
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 20px;">¿En cuántos meses más seguirás diciéndote "algún día"?</p>
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 20px;">No te lo pregunto para presionarte. Te lo pregunto porque sé exactamente cómo se siente ese deseo. Esa vocecita que te dice: <em>"algún día voy a aprender."</em></p>
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 20px;">Te digo algo: <strong>hoy puede ser ese día.</strong> Y me encantaría acompañarte.</p>
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 20px;">El Kit de Bienvenida incluye asesoría personalizada, cable MIDI enviado a tu casa, setup técnico, tu primera clase real con profesor y 3 cupones de descuento — todo lo que necesitas para ponerte en marcha sin buscar nada por tu cuenta. Y con la garantía de 30 días, si no es lo que esperabas te devolvemos cada centavo: el riesgo es mío, no tuyo.</p>
    ${ctaButton('🎹 Quiero empezar — $29')}
    ${firma()}
    <p style="font-size:14px;color:#999;margin:24px 0 0;font-style:italic;">P.D. En el siguiente email te muestro exactamente qué recibes con los $29. Sin adornos, con honestidad total. Para que puedas tomar la decisión con toda la información sobre la mesa.</p>
        `)
    },

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // EMAIL 5 — Desglose del Kit de $29
    // Tipo: RELATIVO | Timing: Día +10
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
        nombre: 'Campaña Día 88 — Email 5: Desglose del Kit',
        asunto: 'Lo que incluyen tus $29 (desglose honesto)',
        previewText: 'Sin letra chica. Todo lo que recibes, sin adornar.',
        tipo: 'secuencia',
        ordenSecuencia: 5,
        contenidoHtml: emailTemplate(`
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 20px;">Hola {{nombre}},</p>
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 20px;">Hoy te voy a ser completamente transparente. Sin exageraciones, sin trucos de marketing. Esto es exactamente lo que recibes con tu Kit de Bienvenida a $29:</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      <tr><td style="padding:16px;border-bottom:1px solid #eee;">
        <strong style="color:#0a0a0a;">📞 Asesoría Técnica Personalizada</strong> <span style="color:#999;font-size:14px;float:right;">~20 min</span>
        <p style="font-size:14px;color:#666;margin:8px 0 0;">Te contactamos para entender tu situación: qué teclado tienes, qué necesitas. Te orientamos sin ventas forzadas.</p>
      </td></tr>
      <tr><td style="padding:16px;border-bottom:1px solid #eee;">
        <strong style="color:#0a0a0a;">🔌 Cable MIDI incluido</strong> <span style="color:#999;font-size:14px;float:right;">Enviado a tu casa</span>
        <p style="font-size:14px;color:#666;margin:8px 0 0;">El cable que conecta tu teclado a tu computadora. Te lo enviamos después de la asesoría a la dirección que nos indiques.</p>
      </td></tr>
      <tr><td style="padding:16px;border-bottom:1px solid #eee;">
        <strong style="color:#0a0a0a;">🔧 Setup Técnico por Videollamada</strong> <span style="color:#999;font-size:14px;float:right;">~20 min</span>
        <p style="font-size:14px;color:#666;margin:8px 0 0;">Configuramos todo juntos: conexión MIDI, audio, software. Tu primera clase será técnicamente perfecta.</p>
      </td></tr>
      <tr><td style="padding:16px;border-bottom:1px solid #eee;">
        <strong style="color:#0a0a0a;">🎹 Clase Real con Profesor Certificado</strong> <span style="color:#999;font-size:14px;float:right;">30 min</span>
        <p style="font-size:14px;color:#666;margin:8px 0 0;">Tu primera clase de piano online real. Experimentas la tecnología MIDI en vivo y descubres si este es tu camino.</p>
      </td></tr>
      <tr><td style="padding:16px;border-bottom:1px solid #eee;">
        <strong style="color:#0a0a0a;">🏷️ 3 cupones de 15% OFF</strong> <span style="color:#999;font-size:14px;float:right;">Tus primeras 3 compras</span>
        <p style="font-size:14px;color:#666;margin:8px 0 0;">Aplican en paquetes de clases con cualquier profesor del marketplace.</p>
      </td></tr>
      <tr><td style="padding:16px;">
        <strong style="color:#0a0a0a;">🏅 Badge "Miembro Fundador"</strong> <span style="color:#999;font-size:14px;float:right;">Permanente</span>
        <p style="font-size:14px;color:#666;margin:8px 0 0;">Tu perfil siempre mostrará que fuiste de los primeros 88. Esto no volverá a ofrecerse.</p>
      </td></tr>
    </table>
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 20px;">Para ponerlo en perspectiva: una sola clase particular presencial en Latinoamérica cuesta entre $20 y $40 USD. El Kit te da mucho más que una clase.</p>
    ${separator()}
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 20px;"><strong>Y si no te gusta:</strong> Garantía de 30 días. Te devolvemos el 100% de tu dinero. Sin preguntas, sin letra pequeña. El cable MIDI es tuyo de todas formas. El peor escenario posible es quedarte con un cable y recuperar tu dinero completo.</p>
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 20px;">El riesgo es mío, no tuyo. Esos 30 días son suficientes para vivir la experiencia completa: recibir tu cable, configurarlo, tener tu primera clase real y decidir con calma si este camino es para ti.</p>
    ${ctaButton('🎹 Quiero mi Kit a $29')}
    ${firma()}
    <p style="font-size:14px;color:#999;margin:24px 0 0;font-style:italic;">P.D. Algo que quiero ser honesto contigo: PianoLink no es para todo el mundo. En mi siguiente email te cuento para quién sí funciona — y para quién no. Creo que te va a sorprender mi sinceridad.</p>
        `)
    },

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // EMAIL 6 — No es para todo el mundo
    // Tipo: RELATIVO | Timing: Día +14
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
        nombre: 'Campaña Día 88 — Email 6: Anti-venta',
        asunto: 'Honestamente, PianoLink no es para todo el mundo',
        previewText: 'Si estás en la columna equivocada, no compres.',
        tipo: 'secuencia',
        ordenSecuencia: 6,
        contenidoHtml: emailTemplate(`
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 20px;">Hola {{nombre}},</p>
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 20px;">Antes de que decidas cualquier cosa, quiero ser completamente honesto contigo.</p>
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 24px;">PianoLink no es para todo el mundo. Y prefiero decírtelo ahora a que te decepciones después.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      <tr>
        <td width="49%" valign="top" style="background:#fef2f2;border-radius:8px;padding:20px;">
          <p style="font-size:15px;font-weight:bold;color:#c0392b;margin:0 0 12px;">❌ NO es para ti si:</p>
          <p style="font-size:14px;color:#666;line-height:1.7;margin:0 0 8px;">→ Esperas tocar bien sin practicar</p>
          <p style="font-size:14px;color:#666;line-height:1.7;margin:0 0 8px;">→ No tienes teclado ni posibilidad de conseguir uno</p>
          <p style="font-size:14px;color:#666;line-height:1.7;margin:0 0 8px;">→ Buscas clases grupales baratas</p>
          <p style="font-size:14px;color:#666;line-height:1.7;margin:0 0 8px;">→ No puedes dedicar al menos 30 minutos a la semana</p>
          <p style="font-size:14px;color:#666;line-height:1.7;margin:0;">→ Solo quieres una app que te entretenga</p>
        </td>
        <td width="2%"></td>
        <td width="49%" valign="top" style="background:#f0fdf4;border-radius:8px;padding:20px;">
          <p style="font-size:15px;font-weight:bold;color:#27ae60;margin:0 0 12px;">✅ SÍ es para ti si:</p>
          <p style="font-size:14px;color:#666;line-height:1.7;margin:0 0 8px;">→ Tienes ese sueño postergado del piano</p>
          <p style="font-size:14px;color:#666;line-height:1.7;margin:0 0 8px;">→ Quieres un profesor que te vea y corrija en vivo</p>
          <p style="font-size:14px;color:#666;line-height:1.7;margin:0 0 8px;">→ Valoras aprender bien desde el inicio</p>
          <p style="font-size:14px;color:#666;line-height:1.7;margin:0 0 8px;">→ Estás dispuesto a empezar sin saber nada de tecnología</p>
          <p style="font-size:14px;color:#666;line-height:1.7;margin:0;">→ Quieres tocar una canción real, no solo escalas</p>
        </td>
      </tr>
    </table>
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 20px;">Fíjate que no dije nada de edad, de talento natural ni de experiencia musical previa. No necesitas nada de eso. Solo ganas y un teclado — el nivel musical completo lo ponemos nosotros con el profesor adecuado para ti.</p>
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 20px;">Cuando digo que PianoLink es para gente con un sueño postergado, hablo de personas reales: profesionales de 35 años que siempre quisieron y nunca encontraron cómo. Madres que ahora tienen un hueco de 30 minutos entre la rutina. Personas jubiladas que saben que aprender algo nuevo los mantiene activos. Gente como tú, que se unió a la lista porque esa chispa del piano dentro de ti no se apaga.</p>
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 20px;">Si te reconoces en la columna de la derecha, este es tu momento. Si no, no pasa nada — te agradezco haber llegado hasta aquí.</p>
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 20px;">Para los que se quedan: recuerda que tu precio madrugador de $29 solo dura hasta el 28 de marzo. Después sube a $44.</p>
    ${ctaButton('🎹 Sí, esto es para mí — $29')}
    ${firma()}
    <p style="font-size:14px;color:#999;margin:24px 0 0;font-style:italic;">P.D. Si estás en la columna del SÍ pero todavía dudas, piensa en esto: dentro de 6 meses puedes estar tocando tu primera canción completa… o seguir diciéndote que "algún día" vas a empezar. La garantía de 30 días hace que no tengas nada que perder.</p>
        `)
    },

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // EMAIL 7 — Quedan X cupos (BROADCAST)
    // Tipo: BROADCAST | Timing: 21 de marzo
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
        nombre: 'Campaña Día 88 — Email 7: Escasez de cupos',
        asunto: 'Los 88 cupos se están llenando',
        previewText: 'El 29 de marzo el precio sube. Y al cupo 88, se cierra.',
        tipo: 'broadcast',
        ordenSecuencia: 7,
        fechaProgramada: new Date('2026-03-21T13:00:00Z'),
        contenidoHtml: emailTemplate(`
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 20px;">Hola {{nombre}},</p>
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 20px;">Soy Miguel Antonio, fundador de PianoLink — un marketplace de clases de piano online 1 a 1 con profesores reales y tecnología MIDI. Tu profesor ve en su pantalla cada nota que tocas, en tiempo real. No es Zoom. Es mucho mejor.</p>
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 20px;">Te escribo porque te uniste a la lista de espera del lanzamiento. Quedan <strong>8 días</strong> y quiero que tengas toda la información:</p>
    ${separator()}
    <table width="100%" cellpadding="0" cellspacing="0" bgcolor="#0a0a0a" style="border-radius:8px;">
      <tr><td style="padding:28px;text-align:center;">
        <p style="color:#c9a84c;font-size:13px;letter-spacing:2px;text-transform:uppercase;margin:0 0 8px;">TU PRECIO MADRUGADOR</p>
        <p style="color:#ffffff;font-size:32px;font-family:Georgia,serif;margin:0 0 4px;font-weight:bold;">$29 USD</p>
        <p style="color:#888;font-size:14px;margin:0 0 4px;">→ El 29 de marzo sube a <strong style="color:#fff;">$44 USD</strong></p>
        <p style="color:#666;font-size:13px;margin:0;">$29 porque el lanzamiento es el 29 de marzo, Día Mundial del Piano</p>
        <p style="color:#666;font-size:13px;margin:4px 0 0;">$44 porque es la mitad exacta de 88, las teclas del piano</p>
      </td></tr>
    </table>
    <div style="margin-top:24px;"></div>
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 12px;"><strong>Lo que cambia el 29 de marzo:</strong></p>
    <p style="font-size:15px;color:#333;line-height:1.8;margin:0 0 8px;">→ El precio sube $15: de $29 a $44</p>
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 12px;"><strong>Lo que pasa cuando se llenen los 88 cupos:</strong></p>
    <p style="font-size:15px;color:#333;line-height:1.8;margin:0 0 8px;">→ El Kit de Bienvenida se cierra completamente</p>
    <p style="font-size:15px;color:#333;line-height:1.8;margin:0 0 20px;">→ Lista de espera indefinida, sin fecha de reapertura</p>
<p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 8px;"><strong>El Kit incluye todo lo que necesitas para empezar:</strong></p>
    <p style="font-size:15px;color:#333;line-height:1.8;margin:0 0 4px;">→ Asesoría técnica personalizada (~20 min)</p>
    <p style="font-size:15px;color:#333;line-height:1.8;margin:0 0 4px;">→ Cable MIDI incluido — te lo enviamos a tu casa</p>
    <p style="font-size:15px;color:#333;line-height:1.8;margin:0 0 4px;">→ Setup técnico por videollamada (~20 min)</p>
    <p style="font-size:15px;color:#333;line-height:1.8;margin:0 0 4px;">→ Primera clase real de 30 min con profesor certificado</p>
    <p style="font-size:15px;color:#333;line-height:1.8;margin:0 0 4px;">→ 3 cupones de 15% OFF para tus primeras compras</p>
    <p style="font-size:15px;color:#333;line-height:1.8;margin:0 0 4px;">→ Badge “Miembro Fundador” permanente — solo 88 en el mundo</p>
    <p style="font-size:15px;color:#333;line-height:1.8;margin:0 0 20px;">→ Garantía total de 30 días — sin preguntas, sin letra chica</p>
    ${ctaButton('🎹 Asegurar mi Kit a $29')}
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 20px;">No te estoy apurando. Te estoy informando. Tú tomas la decisión cuando estés listo.</p>
    ${firma()}
    <p style="font-size:14px;color:#999;margin:24px 0 0;font-style:italic;">P.D. Si ya compraste tu Kit, ignora este email — ya estás adentro y pronto te contactamos para tu asesoría. Si no lo has hecho, recuerda: el precio de $29 termina el 28 de marzo a medianoche.</p>
        `, 'Solo 88 cupos — Precio madrugador hasta el 28 de marzo')
    },

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // EMAIL 8 — Mañana sube el precio (BROADCAST)
    // Tipo: BROADCAST | Timing: 27 de marzo
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
        nombre: 'Campaña Día 88 — Email 8: Mañana sube',
        asunto: 'Mañana tu Kit pasa de $29 a $44',
        previewText: 'Son $15 reales que se pierden pasado mañana.',
        tipo: 'broadcast',
        ordenSecuencia: 8,
        fechaProgramada: new Date('2026-03-27T13:00:00Z'),
        contenidoHtml: emailTemplate(`
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 20px;">{{nombre}},</p>
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 20px;">¿Todavía no te has dado el sí?</p>
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 20px;">Soy Miguel Antonio, fundador de PianoLink. Te escribo porque te registraste en pianolink.net y mostraste interés en aprender piano.</p>
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 20px;">PianoLink es un marketplace de clases de piano online 1 a 1 con profesor real y tecnología MIDI — tu profesor ve en su pantalla cada nota que tocas, en tiempo real. No es Zoom, no son videos pregrabados. Es lo más parecido a tener un maestro sentado a tu lado, desde la comodidad de tu casa.</p>
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 20px;">Quiero avisarte que <strong>pasado mañana, el 29 de marzo, el Kit de Bienvenida pasa de $29 a $44.</strong></p>
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 20px;">Son $15 reales que ahorras hoy. El precio madrugador de $29 lleva la fecha del Día Mundial del Piano. El de $44 es la mitad de 88, las teclas del piano.</p>
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 8px;"><strong>El Kit incluye todo lo que necesitas para tu primera clase real:</strong></p>
    <p style="font-size:15px;color:#333;line-height:1.8;margin:0 0 4px;">→ Asesoría técnica personalizada — te orientamos según tu teclado y nivel</p>
    <p style="font-size:15px;color:#333;line-height:1.8;margin:0 0 4px;">→ Cable MIDI incluido — te lo enviamos a tu casa</p>
    <p style="font-size:15px;color:#333;line-height:1.8;margin:0 0 4px;">→ Setup técnico por videollamada — configuramos todo juntos</p>
    <p style="font-size:15px;color:#333;line-height:1.8;margin:0 0 4px;">→ Primera clase real de 30 min con profesor certificado</p>
    <p style="font-size:15px;color:#333;line-height:1.8;margin:0 0 4px;">→ 3 cupones de 15% OFF en tus primeras compras</p>
    <p style="font-size:15px;color:#333;line-height:1.8;margin:0 0 20px;">→ Garantía total de 30 días — si no te convence, te devuelvo cada centavo</p>
    ${ctaButton('🎹 Quiero mi Kit a $29 — antes de que suba')}
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 20px;">Si ya compraste, ignora este email. Si no, este es el momento.</p>
    ${firma()}
    <p style="font-size:14px;color:#999;margin:24px 0 0;font-style:italic;">P.D. ¿Recuerdas que el piano tiene 88 teclas? Cuando se llenen los 88 cupos, el Kit se cierra — sin fecha de reapertura. La garantía de 30 días sigue: si no te gusta, devuelves. El cable es tuyo.</p>
        `, 'Precio de $29 termina el 28 de marzo a medianoche')
    },

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // EMAIL 9 — Hoy es el Día 88 (BROADCAST)
    // Tipo: BROADCAST | Timing: 29 de marzo 8 AM
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
        nombre: 'Campaña Día 88 — Email 9: Día 88',
        asunto: '🎹 Hoy es el Día 88 — PianoLink está abierto',
        previewText: 'Día Mundial del Piano. Día 88 del año. Lanzamiento oficial.',
        tipo: 'broadcast',
        ordenSecuencia: 9,
        fechaProgramada: new Date('2026-03-29T12:00:00Z'),
        contenidoHtml: `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:Georgia,serif;">
<table width="100%" cellpadding="0" cellspacing="0" bgcolor="#0a0a0a">
<tr><td align="center" style="padding:30px 20px;">
<table width="600" cellpadding="0" cellspacing="0" style="border-radius:8px;overflow:hidden;">
  <tr><td bgcolor="#0a0a0a" align="center" style="padding:28px 40px;">
    <span style="font-family:Georgia,serif;font-size:22px;color:#c9a84c;letter-spacing:2px;">🎹 PianoLink</span>
  </td></tr>
  <tr><td bgcolor="#0a0a0a" style="padding:48px 48px 24px;text-align:center;">
    <p style="color:#c9a84c;font-size:12px;letter-spacing:3px;text-transform:uppercase;margin:0 0 16px;">DÍA 88 · 29 DE MARZO DE 2026 · DÍA MUNDIAL DEL PIANO</p>
    <h1 style="font-family:Georgia,serif;font-size:36px;color:#ffffff;margin:0 0 16px;line-height:1.2;">Hoy tu sueño de tocar piano se hace posible.</h1>
    <p style="font-size:18px;color:#c9a84c;margin:0 0 28px;">PianoLink está oficialmente abierto.</p>
    <a href="https://pianolink.net/welcome-kit" style="background:#c9a84c;color:#0a0a0a;text-decoration:none;padding:18px 40px;border-radius:4px;font-size:18px;font-weight:bold;display:inline-block;">🎹 Quiero mi cupo — $44 USD</a>
  </td></tr>
  <tr><td bgcolor="#111" style="padding:24px 48px;text-align:center;">
    <p style="color:#e74c3c;font-size:15px;font-weight:bold;margin:0;">Solo 88 cupos. Cuando se llenen, se cierra.</p>
  </td></tr>
  <tr><td bgcolor="#ffffff" style="padding:40px 48px;">
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 20px;">Hola {{nombre}},</p>
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 20px;">Soy Miguel Antonio. Te escribo porque te uniste a la lista de espera de PianoLink — y hoy es, posiblemente, el día más especial de mi vida después del nacimiento de mi hija Aurora.</p>
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 20px;">Hoy es el <strong>Día Mundial del Piano</strong>. Es el <strong>día 88 del año</strong> — y 88 son las teclas del piano. Y es mi cumpleaños.</p>
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 20px;">PianoLink es un marketplace de clases de piano online 1 a 1 donde un profesor real te enseña con tecnología MIDI — ve en su pantalla cada nota que tocas, en tiempo real. No es Zoom. No son videos. Es lo más parecido a tener un maestro sentado a tu lado.</p>
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 20px;">El Kit de Bienvenida a <strong>$44 USD</strong> (la mitad de 88 teclas) incluye todo:</p>
    <p style="font-size:15px;color:#333;margin:0 0 6px;">✓ Asesoría técnica personalizada</p>
    <p style="font-size:15px;color:#333;margin:0 0 6px;">✓ Cable MIDI — te lo enviamos a tu casa</p>
    <p style="font-size:15px;color:#333;margin:0 0 6px;">✓ Setup por videollamada</p>
    <p style="font-size:15px;color:#333;margin:0 0 6px;">✓ Primera clase real de 30 min con profesor certificado</p>
    <p style="font-size:15px;color:#333;margin:0 0 6px;">✓ 3 cupones de 15% OFF en tus primeras compras</p>
    <p style="font-size:15px;color:#333;margin:0 0 6px;">✓ Badge "Miembro Fundador" permanente</p>
    <p style="font-size:15px;color:#333;margin:0 0 24px;">✓ Garantía total de 30 días — sin preguntas</p>
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 20px;">A los 4 años le pedí un piano a mis papás. A los 10 llegó mi primer teclado. Hoy, a mis años, estoy abriendo la puerta para que tú puedas vivir lo que yo viví: la magia de tocar tus primeras notas con alguien que te guíe de verdad.</p>
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 20px;">Si tu sueño del piano lleva tiempo esperando… hoy es el día.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:32px 0;"><tr><td align="center">
      <a href="https://pianolink.net/welcome-kit" style="background:#c9a84c;color:#0a0a0a;text-decoration:none;padding:16px 40px;border-radius:4px;font-size:17px;font-weight:bold;display:inline-block;">🎹 Reservar mi cupo ahora</a>
    </td></tr></table>
    <p style="font-size:16px;color:#333;margin:0;">Con el corazón lleno,<br><strong>Miguel Antonio</strong><br><span style="color:#c9a84c;">Fundador, PianoLink</span></p>
    <p style="font-size:14px;color:#999;margin:24px 0 0;font-style:italic;">P.D. Recuerda: cuando se llenen los 88 cupos, el Kit se cierra indefinidamente sin fecha de reapertura. La garantía de 30 días sigue vigente — si no es lo que esperabas, te devuelvo cada centavo. El cable MIDI es tuyo de todas formas.</p>
  </td></tr>
  <tr><td bgcolor="#0a0a0a" style="padding:24px 48px;text-align:center;">
    <p style="color:#888;font-size:13px;margin:0 0 12px;">Día 88 · Día Mundial del Piano · Lanzamiento PianoLink</p>
    <p style="margin:16px 0 0;"><a href="{{unsubscribe_url}}" style="color:#555;font-size:11px;">No quiero recibir más emails — darme de baja</a></p>
    <p style="color:#555;font-size:11px;margin:8px 0 0;">© 2026 PianoLink · hola@pianolink.net</p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`
    }
];

// ═══════════════════════════════════════
// SEED: CREAR EMAILS EN CrmEmailCampaign
// ═══════════════════════════════════════

async function seedEmailCampaigns() {
    console.log('\n📧 Creando 9 emails de campaña Día 88...');

    // Eliminar emails anteriores de esta campaña
    await CrmEmailCampaign.deleteMany({
        nombre: { $regex: /^Campaña Día 88/ }
    });
    console.log('   🗑️  Emails anteriores eliminados');

    const created = [];
    for (const emailData of emails) {
        const campaign = new CrmEmailCampaign({
            ...emailData,
            estado: 'borrador'
        });
        await campaign.save();
        console.log(`   ✅ ${emailData.nombre}`);
        created.push(campaign);
    }

    return created;
}

// ═══════════════════════════════════════
// SEED: CREAR CrmSequence (EMAILS RELATIVOS 1-6)
// ═══════════════════════════════════════

async function seedSequence(emailCampaigns) {
    console.log('\n🔄 Creando secuencia automatizada (emails relativos 1-6)...');

    // Eliminar secuencia anterior
    await CrmSequence.deleteMany({ name: { $regex: /Campaña Lanzamiento Día 88/ } });

    // Los 6 primeros emails son relativos
    const relativoEmails = emailCampaigns.slice(0, 6);

    // Delays en horas desde el registro
    // Email 1: inmediato (0h)
    // Email 2: día +2 (48h)
    // Email 3: día +4 (96h)
    // Email 4: día +7 (168h)
    // Email 5: día +10 (240h)
    // Email 6: día +14 (336h)
    const delays = [0, 48, 96, 168, 240, 336];

    // Fechas límite de entrada para cada email
    // (si se registra después de esta fecha, el email ya no se envía
    //  porque el broadcast llegaría antes)
    // Email 1: siempre
    // Email 2: antes del 25 mar → 25 mar 00:00 UTC
    // Email 3: antes del 23 mar
    // Email 4: antes del 20 mar
    // Email 5: antes del 17 mar
    // Email 6: antes del 13 mar
    const cutoffDates = [
        null, // Email 1 siempre se envía
        new Date('2026-03-25T00:00:00Z'),
        new Date('2026-03-23T00:00:00Z'),
        new Date('2026-03-20T00:00:00Z'),
        new Date('2026-03-17T00:00:00Z'),
        new Date('2026-03-13T00:00:00Z')
    ];

    const steps = relativoEmails.map((emailCampaign, i) => {
        const step = {
            order: i + 1,
            delayHours: delays[i],
            delayType: 'after_trigger',
            action: 'send_email',
            email: {
                subject: emailCampaign.asunto,
                bodyHtml: emailCampaign.contenidoHtml,
                previewText: emailCampaign.previewText || ''
            },
            // Cutoff dates se manejan vía la lógica del runner:
            // Si la fecha actual supera el cutoff, el paso se salta.
            // Se almacena en condition.value como referencia
            condition: cutoffDates[i] ? {
                field: 'cutoff_date',
                operator: 'lt',
                value: cutoffDates[i].toISOString()
            } : {
                field: '',
                operator: '',
                value: null
            },
            metrics: { sent: 0, opened: 0, clicked: 0, bounced: 0, unsubscribed: 0, skipped: 0 }
        };
        return step;
    });

    const sequence = new CrmSequence({
        name: 'Campaña Lanzamiento Día 88 — Nurturing',
        type: 'custom',
        status: 'active',
        targetAudience: 'students',
        trigger: {
            event: 'lead.created',
            conditions: {} // Todos los leads nuevos
        },
        steps: steps,
        stats: { totalEnrolled: 0, totalCompleted: 0, totalUnsubscribed: 0 }
    });

    await sequence.save();
    console.log('   ✅ Secuencia creada con 6 pasos (trigger: lead.created)');
    console.log('   📅 Delays: inmediato, +2d, +4d, +7d, +10d, +14d');
    return sequence;
}

// ═══════════════════════════════════════
// EJECUTAR SEEDS
// ═══════════════════════════════════════

async function runSeeds() {
    console.log('🌱 ═══════════════════════════════════════');
    console.log('   SEED: Campaña Email Marketing Día 88');
    console.log('   9 emails · Arquitectura híbrida');
    console.log('═══════════════════════════════════════\n');

    await connectDB();

    try {
        // 1. Crear los 9 CrmEmailCampaign
        const emailCampaigns = await seedEmailCampaigns();

        // 2. Crear la secuencia automatizada con los 6 relativos
        const sequence = await seedSequence(emailCampaigns);

        console.log('\n═══════════════════════════════════════');
        console.log('✅ SEED COMPLETADO');
        console.log('═══════════════════════════════════════');
        console.log('\n📋 Resumen:');
        console.log('   📧 9 emails creados en CrmEmailCampaign');
        console.log('   🔄 1 secuencia con 6 pasos relativos (auto-enroll)');
        console.log('   📡 3 broadcasts programados:');
        console.log('      • Email 7: 21 marzo — escasez de cupos');
        console.log('      • Email 8: 27 marzo — mañana sube el precio');
        console.log('      • Email 9: 29 marzo 8AM — Día 88 lanzamiento');
        console.log('\n⚙️  Para que los broadcasts se envíen automáticamente,');
        console.log('   el cron de broadcastScheduler debe estar activo.');

    } catch (error) {
        console.error('\n❌ Error en seeds:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\n🔌 Desconectado de MongoDB');
    }
}

if (require.main === module) {
    runSeeds();
}

module.exports = { seedEmailCampaigns, seedSequence, emails };
