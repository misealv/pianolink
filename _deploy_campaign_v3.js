/**
 * _deploy_campaign_v3.js
 * 
 * Deploy de la campaña v3 del Día 88 — Reescritura completa.
 * 
 * Cambios principales vs v2:
 * - Emails venden TRANSFORMACIÓN, no funcionalidades
 * - Pedro Pagliai y José como historias, no fichas técnicas
 * - Broadcasts 7/8/9 con ángulos completamente distintos (social/pérdida/celebración)
 * - Email 8 ultra-corto (5-6 líneas)
 * - Versión fría de broadcasts = CORTA (no muro de texto)
 * - Email 6 incluye invitación a responder dudas
 * - MIDI mencionado solo donde aporta, nunca repetido
 * - Un email dedicado a TRANSFORMACIÓN (Email 4)
 * 
 * Este script:
 * 1. Elimina CrmEmailCampaigns existentes
 * 2. Crea las 11 campañas nuevas (v3)
 * 3. Sincroniza CrmSequence activa (pasos 0-5) con los 6 emails relativos
 * 4. Verifica integridad
 * 
 * Ejecutar: node _deploy_campaign_v3.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const CrmEmailCampaign = require('./crm/models/CrmEmailCampaign');
const CrmSequence = require('./crm/models/CrmSequence');

// === CONEXIÓN ===
async function connectDB() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Conectado a MongoDB');
}

// ════════════════════════════════════════════
// TEMPLATE Y HELPERS (mismos estilos que v2)
// ════════════════════════════════════════════
function emailTemplate(bodyHtml) {
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
  ${bodyHtml}
  <tr><td bgcolor="#0a0a0a" style="padding:24px 48px;" align="center">
    <p style="color:#888;font-size:12px;margin:0 0 8px;">PianoLink · Clases de piano online 1 a 1</p>
    <p style="margin:0;"><a href="{{unsubscribe_url}}" style="color:#666;font-size:11px;">Cancelar suscripción</a></p>
    <p style="color:#555;font-size:11px;margin:8px 0 0;">© 2026 PianoLink · hola@pianolink.pro</p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

const sP = 'font-size:16px;color:#333;line-height:1.8;margin:0 0 20px;';
const sH1 = 'font-family:Georgia,serif;font-size:28px;color:#0a0a0a;margin:0 0 28px;line-height:1.3;';
const sPd = 'font-size:14px;color:#666;line-height:1.6;margin:24px 0 0;border-top:1px solid #eee;padding-top:16px;';
const sCta = 'background:#c9a84c;color:#0a0a0a;text-decoration:none;padding:16px 40px;border-radius:4px;font-size:16px;font-weight:bold;display:inline-block;';
const sQuote = 'border-left:4px solid #c9a84c;background:#f5f5f0;padding:20px 24px;border-radius:0 8px 8px 0;';
const sSep = 'border-top:2px solid #c9a84c;padding-bottom:24px;';

function ctaBtn(precio) {
    return `<table width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0;"><tr><td align="center">
      <a href="https://pianolink.net/oferta-madrugadores" style="${sCta}">Quiero mi Kit — $${precio}</a>
    </td></tr></table>`;
}

function firmaHtml() {
    return `<p style="font-size:16px;color:#333;margin:0;">Miguel Antonio<br><span style="color:#c9a84c;">Fundador, PianoLink</span></p>`;
}

// ════════════════════════════════════════════
// LOS 11 EMAILS — V3
// ════════════════════════════════════════════

function buildCampaigns() {
    const campaigns = [];

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // EMAIL 1 — BIENVENIDA (TRANSFORMACIÓN, no features)
    // ~700 chars · Sin MIDI · Sin Kit · Vende el sueño
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    campaigns.push({
        nombre: 'Email 1 - Bienvenida Madrugadores',
        asunto: '{{nombre}}, tu lugar en la lista está reservado 🎹',
        previewText: 'Acabas de dar un paso que la mayoría posterga para siempre.',
        tipo: 'secuencia',
        modoEnvio: 'relativo',
        ordenSecuencia: 1,
        diasDespuesRegistro: 0,
        fechaLimiteEntrada: null,
        estado: 'borrador',
        contenidoHtml: emailTemplate(`
  <tr><td style="padding:48px 48px 32px;">
    <h1 style="${sH1}">Bienvenido, {{nombre}}.</h1>
    <p style="${sP}">Acabas de hacer algo que la mayoría de las personas posterga para siempre.</p>
    <p style="${sP}">Registrarte en una lista de espera para aprender piano no parece un gran acto. Pero lo es. Porque detrás de ese click hay un sueño que llevas guardando — quizás años, quizás desde que eras niño.</p>
    <p style="${sP}">PianoLink existe para convertir ese <em>"algún día"</em> en <em>"hoy empecé."</em> Con un profesor real, de conservatorio, que te escucha y te corrige en vivo — desde tu casa.</p>
    <p style="${sP}">Por estar aquí antes que nadie, tienes acceso a un precio de <strong>$29 USD</strong> que el público general no va a ver. Guardo los detalles para los próximos días.</p>
    <p style="${sP}">Mañana te cuento una historia. Una coincidencia tan rara que no puede ser coincidencia.</p>
    ${ctaBtn(29)}
    <p style="${sPd}"><strong>P.D.</strong> — ¿Por qué $29? ¿Por qué el 29 de marzo? Los números esconden algo. Te lo cuento en mi próximo email.</p>
    ${firmaHtml()}
  </td></tr>`),
        notas: 'V3: ~700 chars. Sin MIDI, sin Kit, sin Zoom. Solo validación emocional + precio como teaser + curiosidad para Email 2.'
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // EMAIL 2 — NUMEROLOGÍA (el mejor email, casi intacto)
    // Preview corregido · Transición a CTA más suave
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    campaigns.push({
        nombre: 'Email 2 - Historia del 29 de marzo',
        asunto: 'La coincidencia que no puede ser coincidencia 🎹',
        previewText: 'Te prometí una historia. Aquí va.',
        tipo: 'secuencia',
        modoEnvio: 'relativo',
        ordenSecuencia: 2,
        diasDespuesRegistro: 2,
        fechaLimiteEntrada: new Date('2026-03-25T00:00:00'),
        estado: 'borrador',
        contenidoHtml: emailTemplate(`
  <tr><td style="padding:48px 48px 32px;">
    <h1 style="${sH1}">La coincidencia que no puede ser coincidencia.</h1>
    <p style="${sP}">{{nombre}}, te prometí una historia. Aquí va.</p>
    <p style="${sP}">El 29 de marzo es el <strong>Día Mundial del Piano</strong>. Ya solo con eso, era la fecha perfecta para lanzar PianoLink.</p>
    <p style="${sP}">Pero hay más.</p>
    <p style="${sP}">El 29 de marzo es el <strong>día 88 del año</strong>. Y un piano tiene exactamente <strong>88 teclas</strong>.</p>
    <p style="${sP}">Y hay más todavía: el 29 de marzo es <strong>mi cumpleaños</strong>. 🎂</p>
    <p style="${sP}">Cuando descubrí esa alineación, supe que no podía ignorarla. Así que construí todo alrededor de ese número:</p>
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="${sQuote}">
      <p style="font-size:15px;color:#333;line-height:1.8;margin:0;">
        <strong>88 cupos</strong> — ni uno más, para garantizar atención real.<br>
        <strong>$29</strong> — el precio madrugador lleva tatuada la fecha.<br>
        <strong>$44</strong> — el precio de lanzamiento es la mitad exacta de 88.
      </p>
    </td></tr></table>
    <p style="${sP} margin-top:20px;">Ninguno de estos números es inventado. Todos son reales. Y todos convergen en un solo día.</p>
    <p style="${sP}">Tu precio de <strong>$29</strong> existe por esto. Por estar aquí antes del Día 88.</p>
    ${ctaBtn(29)}
    <p style="${sPd}"><strong>P.D.</strong> — En mi próximo email te presento a alguien. Un profesor que enseña desde el otro lado del mundo con una precisión que Zoom no puede soñar.</p>
    ${firmaHtml()}
  </td></tr>`),
        notas: 'V3: Casi intacto. P.D. anticipa a Pedro (Email 3) sin spoilear MIDI. Preview NO revela la numerología.'
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // EMAIL 3 — PEDRO COMO HISTORIA + MIDI SENTIDO
    // Pedro es narrativa, no ficha · MIDI se siente, no se explica
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    campaigns.push({
        nombre: 'Email 3 - Pedro Pagliai Historia',
        asunto: 'Tu profesor de piano no te escucha bien (y no es su culpa)',
        previewText: 'Hay una diferencia que cambia todo.',
        tipo: 'secuencia',
        modoEnvio: 'relativo',
        ordenSecuencia: 3,
        diasDespuesRegistro: 4,
        fechaLimiteEntrada: new Date('2026-03-23T00:00:00'),
        estado: 'borrador',
        contenidoHtml: emailTemplate(`
  <tr><td style="padding:48px 48px 32px;">
    <h1 style="${sH1}">Tu profesor de piano no te escucha bien.</h1>
    <p style="${sP}">{{nombre}}, quiero presentarte a alguien.</p>
    <p style="${sP}">Pedro Pagliai daba clases en la <strong>Universidad de Chile</strong>. Sus estudiantes lo adoraban — no solo por su técnica, sino porque escuchaba cosas que nadie más escuchaba. <em>"Tu pulgar llega tarde en el compás 3."</em> <em>"Ese acorde necesita más peso en la voz superior."</em> <em>"El crescendo del final no respira."</em></p>
    <p style="${sP}">Un día, Pedro se mudó a <strong>Australia</strong>. Y la mayoría de sus estudiantes lo habrían perdido para siempre.</p>
    <p style="${sP}">Pero Pedro enseña en PianoLink.</p>
    <p style="${sP}">Y en PianoLink pasa algo que no pasa en ninguna otra plataforma: cuando tocas, tu profesor recibe un mapa exacto de lo que hiciste. Cada nota, cada velocidad, cada duración. Como si tuviera las manos sobre las tuyas.</p>
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="${sQuote}">
      <p style="font-size:15px;color:#333;line-height:1.8;margin:0;">En Zoom, un profesor puede conversar contigo. Pero no puede distinguir si tu legato fue limpio, si tu pedal entró a tiempo, o si tus dinámicas realmente cambiaron. Es como ir al oftalmólogo por videollamada — puede verte, pero no medirte la vista.</p>
    </td></tr></table>
    <p style="${sP} margin-top:20px;">Pedro hoy enseña desde Australia a estudiantes que nunca habría conocido. Y les corrige con la misma precisión que cuando caminaba entre los pupitres de la universidad.</p>
    <p style="${sP}">Y lo mejor: no tienes que configurar nada solo. Lo hacemos juntos en una videollamada incluida en tu Kit.</p>
    ${ctaBtn(29)}
    <p style="${sPd}"><strong>P.D.</strong> — ¿Llevas años diciéndote <em>"algún día"</em>? Mi próximo email tiene una historia que necesitas leer. Es sobre alguien que también se lo dijo.</p>
    ${firmaHtml()}
  </td></tr>`),
        notas: 'V3: Pedro como HISTORIA (U. Chile → Australia), no ficha. MIDI sentido a través de las correcciones de Pedro. "ve cada nota" NO aparece. Zoom como analogía del oftalmólogo.'
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // EMAIL 4 — JOSÉ HISTORIA COMPLETA + TRANSFORMACIÓN
    // El email emocional · Vende la versión de ti que toca piano
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    campaigns.push({
        nombre: 'Email 4 - José + Transformación',
        asunto: '¿Cuántos "algún día" más te vas a dar?',
        previewText: 'Esta pregunta me la hice a mí mismo antes de hacértela a ti.',
        tipo: 'secuencia',
        modoEnvio: 'relativo',
        ordenSecuencia: 4,
        diasDespuesRegistro: 7,
        fechaLimiteEntrada: new Date('2026-03-20T00:00:00'),
        estado: 'borrador',
        contenidoHtml: emailTemplate(`
  <tr><td style="padding:48px 48px 32px;">
    <h1 style="${sH1}">¿Cuántos "algún día" más?</h1>
    <p style="${sP}">{{nombre}}, esta pregunta me la hice a mí mismo antes de hacértela a ti.</p>
    <p style="${sP}">A los 4 años le pedí un piano a mis papás para Navidad. No sabía ni cómo sonaba de cerca. Pero algo en mí sabía. Tuve que esperar hasta los 10 para tener un teclado de 3 octavas. Y cuando llegó, lo aproveché cada minuto.</p>
    <p style="${sP}">Sé exactamente cómo se siente ese deseo. Esa vocecita que te dice: <em>"algún día."</em></p>
    <p style="${sP}">José también la escuchaba.</p>
    <p style="${sP}">Llegó a PianoLink desde <strong>Escocia</strong> con muchas ganas y cero experiencia técnica. Las primeras semanas fueron difíciles — postura de manos, independencia de dedos, lectura de partituras. Todo nuevo. Todo frustrantemente lento.</p>
    <p style="${sP}">Pero José no se fue. Clase a clase. Compás a compás. Fue construyendo algo que antes no existía en sus manos.</p>
    <p style="${sP}">Y un día — casi sin darse cuenta — estaba tocando <strong>Rachmaninov</strong>.</p>
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="${sQuote}">
      <p style="font-size:15px;color:#333;line-height:1.8;margin:0;">No Rachmaninov simplificado. Rachmaninov real. Desde Escocia. Con un profesor a miles de kilómetros que escuchaba cada matiz. Su video está publicado en <a href="https://pianolink.net" style="color:#c9a84c;">nuestra página</a>. Cuando lo veas, fíjate en sus manos. Esas manos empezaron donde tú estás ahora.</p>
    </td></tr></table>
    <p style="${sP} margin-top:20px;">Ahora imagínate esto:</p>
    <p style="${sP}">Es un martes cualquiera. Llegas a tu casa. Te sientas frente al teclado. Y de tus dedos sale algo que hace un mes no podías tocar. Nadie te está viendo. Pero <strong>tú sabes lo que acabas de lograr</strong>.</p>
    <p style="${sP}">Eso es lo que vendemos en PianoLink. No un Kit. No una tecnología. <strong>La versión de ti que toca piano.</strong></p>
    ${ctaBtn(29)}
    <p style="${sPd}"><strong>P.D.</strong> — En el próximo email te muestro exactamente qué incluye tu Kit de $29. Sin letra chica. Sin adornar.</p>
    ${firmaHtml()}
  </td></tr>`),
        notas: 'V3: José como historia COMPLETA (llegada → lucha → persistencia → Rachmaninov). Sección de TRANSFORMACIÓN: "es un martes cualquiera..." Línea clave: "La versión de ti que toca piano." Sin datos demográficos (28-55 años). Sin MIDI.'
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // EMAIL 5 — DESGLOSE KIT (exclusivo, no se repite)
    // Este es el ÚNICO email con desglose · Video de José
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    campaigns.push({
        nombre: 'Email 5 - Desglose Kit + Video José',
        asunto: 'Lo que incluyen tus $29 (desglose honesto)',
        previewText: 'Sin letra chica. Todo lo que recibes, sin adornar.',
        tipo: 'secuencia',
        modoEnvio: 'relativo',
        ordenSecuencia: 5,
        diasDespuesRegistro: 10,
        fechaLimiteEntrada: new Date('2026-03-17T00:00:00'),
        estado: 'borrador',
        contenidoHtml: emailTemplate(`
  <tr><td style="padding:48px 48px 32px;">
    <h1 style="${sH1}">Lo que incluyen tus $29.</h1>
    <p style="${sP}">{{nombre}}, sin letra chica. Todo lo que recibes:</p>
    <table width="100%" cellpadding="0" cellspacing="0" bgcolor="#f5f5f0" style="border-radius:8px;margin:0 0 24px;">
      <tr><td style="padding:28px;">
        <p style="font-size:15px;color:#333;margin:0 0 10px;">✓ &nbsp;<strong>Asesoría técnica personalizada</strong> (~20 min)</p>
        <p style="font-size:13px;color:#666;margin:0 0 16px;padding-left:24px;">Evaluamos tu situación: qué teclado tienes (o cuál necesitas), tus objetivos y tu disponibilidad.</p>
        <p style="font-size:15px;color:#333;margin:0 0 10px;">✓ &nbsp;<strong>Sesión de setup técnico</strong> (~20 min)</p>
        <p style="font-size:13px;color:#666;margin:0 0 16px;padding-left:24px;">Videollamada donde configuramos todo juntos. Sin que toques nada técnico solo.</p>
        <p style="font-size:15px;color:#333;margin:0 0 10px;">✓ &nbsp;<strong>Tu primera clase real de piano</strong> (30 min)</p>
        <p style="font-size:13px;color:#666;margin:0 0 16px;padding-left:24px;">Con un profesor de conservatorio. En vivo. Con corrección en tiempo real.</p>
        <p style="font-size:15px;color:#333;margin:0 0 10px;">✓ &nbsp;<strong>3 cupones de 15% OFF</strong></p>
        <p style="font-size:13px;color:#666;margin:0 0 16px;padding-left:24px;">Para tus primeras compras en el marketplace (clases desde $15 USD).</p>
        <p style="font-size:15px;color:#333;margin:0 0 10px;">✓ &nbsp;<strong>Acceso anticipado a nuevos profesores</strong></p>
        <p style="font-size:13px;color:#666;margin:0 0 16px;padding-left:24px;">Como miembro fundador, eliges primero cuando se incorpore un nuevo profesor.</p>
        <p style="font-size:15px;color:#333;margin:0 0 10px;">✓ &nbsp;<strong>Garantía de 30 días</strong></p>
        <p style="font-size:13px;color:#666;margin:0 0 0;padding-left:24px;">Dinero de vuelta, sin preguntas. El riesgo es completamente mío.</p>
      </td></tr>
    </table>
    <p style="${sP}">Una clase presencial en LATAM cuesta entre $20 y $40 USD. Por $29 tienes asesoría + setup + clase + descuentos + garantía.</p>
    <p style="${sP}"><strong>El peor escenario:</strong> pides tu dinero de vuelta y quedas exactamente como estás. No pierdes nada.</p>
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="${sQuote}">
      <p style="font-size:15px;color:#333;line-height:1.8;margin:0;">¿Quieres ver cómo suena alguien que empezó donde tú estás? <a href="https://pianolink.net" style="color:#c9a84c;">Mira el video de José</a> tocando Rachmaninov desde Escocia.</p>
    </td></tr></table>
    ${ctaBtn(29)}
    <p style="${sPd}"><strong>P.D.</strong> — Mi próximo email te va a sorprender por su sinceridad. Porque PianoLink no es para todo el mundo — y quiero ser honesto contigo antes de que decidas.</p>
    ${firmaHtml()}
  </td></tr>`),
        notas: 'V3: Desglose EXCLUSIVO (no se repite en broadcasts). Badge reemplazado por "acceso anticipado". José video. Línea de anclaje: "clase presencial $20-40 vs Kit $29".'
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // EMAIL 6 — ANTI-VENTA + ¿TIENES DUDAS?
    // ❌/✅ + invitación a responder · Último email relativo
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    campaigns.push({
        nombre: 'Email 6 - Anti-venta + Dudas',
        asunto: 'Honestamente, PianoLink no es para todo el mundo',
        previewText: 'Si estás en la columna equivocada, no compres.',
        tipo: 'secuencia',
        modoEnvio: 'relativo',
        ordenSecuencia: 6,
        diasDespuesRegistro: 14,
        fechaLimiteEntrada: new Date('2026-03-13T00:00:00'),
        estado: 'borrador',
        contenidoHtml: emailTemplate(`
  <tr><td style="padding:48px 48px 32px;">
    <h1 style="${sH1}">PianoLink no es para todo el mundo.</h1>
    <p style="${sP}">{{nombre}}, si estás en la columna equivocada, no compres.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      <tr>
        <td width="48%" style="vertical-align:top;padding:20px;background:#fff5f5;border-radius:8px;">
          <p style="font-size:16px;font-weight:bold;color:#c0392b;margin:0 0 12px;">❌ NO es para ti si:</p>
          <p style="font-size:14px;color:#333;line-height:1.8;margin:0;">
            → Esperas tocar bien sin practicar<br>
            → No tienes teclado ni posibilidad de conseguir uno<br>
            → Buscas clases grupales económicas<br>
            → No puedes dedicar al menos 30 min semanales<br>
            → Quieres solo una app que te entretenga
          </p>
        </td>
        <td width="4%"></td>
        <td width="48%" style="vertical-align:top;padding:20px;background:#f0f9f0;border-radius:8px;">
          <p style="font-size:16px;font-weight:bold;color:#27ae60;margin:0 0 12px;">✅ SÍ es para ti si:</p>
          <p style="font-size:14px;color:#333;line-height:1.8;margin:0;">
            → Tienes ese sueño postergado del piano<br>
            → Quieres un profesor real que te corrija en vivo<br>
            → Valoras aprender bien desde el inicio<br>
            → Estás dispuesto a empezar sin saber de tecnología<br>
            → Quieres profesores de conservatorio — no cualquier youtuber
          </p>
        </td>
      </tr>
    </table>
    <p style="${sP}">Si te reconoces en la columna verde, esto es para ti. Si no, no compres — y no pasa nada.</p>
    <p style="${sP}">Prefiero <strong>88 estudiantes comprometidos</strong> que 800 que abandonan el segundo mes.</p>
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="${sQuote}">
      <p style="font-size:15px;color:#333;line-height:1.8;margin:0;">¿Tienes alguna pregunta que no te he respondido en estos emails? Sobre la tecnología, los horarios, tu teclado, lo que sea — <strong>respóndeme directamente a este email</strong>. Lo leo yo, Miguel. No un bot, no un equipo de soporte. Soy yo.</p>
    </td></tr></table>
    ${ctaBtn(29)}
    <p style="${sPd}"><strong>P.D.</strong> — Si decides que sí, la garantía de 30 días te protege igual. Pero quería ser honesto contigo primero.</p>
    ${firmaHtml()}
  </td></tr>`),
        notas: 'V3: Añadida invitación a responder dudas (blockquote). "Respóndeme directamente — soy yo, Miguel." Abre puerta a conversación sin presión. ❌/✅ intacto.'
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // EMAIL 7 — ESCASEZ SOCIAL (ángulo completamente nuevo)
    // NO MIDI · NO Kit · Solo escasez social + FOMO
    // Fríos = CORTO · Activos = insider
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    campaigns.push({
        nombre: 'Email 7 - Escasez Social (Broadcast Dual)',
        asunto: '{{cupos_restantes}} personas ya reservaron su lugar',
        previewText: 'Este número es real y baja cada hora.',
        tipo: 'broadcast',
        modoEnvio: 'fechaFija',
        ordenSecuencia: 7,
        estado: 'borrador',
        fechaProgramada: new Date('2026-03-21T09:00:00'),
        umbralEngagement: 4,
        // FRÍOS → versión corta con contexto mínimo (NO muro de texto)
        contenidoHtml: emailTemplate(`
  <tr><td style="padding:48px 48px 32px;">
    <h1 style="${sH1}">{{cupos_restantes}} personas ya reservaron.</h1>
    <p style="${sP}">{{nombre}}, de los 88 cupos que abrimos para PianoLink, quedan <strong>{{cupos_restantes}}</strong>.</p>
    <p style="${sP}">Las personas que ya reservaron no son músicos profesionales. Son personas como tú — con un sueño postergado, un teclado en algún rincón (o ganas de comprar uno) y la decisión de dejar de esperar.</p>
    <p style="${sP}">PianoLink: clases de piano 1 a 1 online con profesores de conservatorio. Tu profesor te escucha y corrige en vivo, desde tu casa.</p>
    <p style="${sP}"><strong>$29 hoy. $44 después del 29 de marzo. Garantía 30 días.</strong></p>
    ${ctaBtn(29)}
    <p style="${sPd}"><strong>P.D.</strong> — El número de cupos es real. Se actualiza con cada compra. No es una frase de marketing.</p>
    ${firmaHtml()}
  </td></tr>`),
        // ACTIVOS → tono insider, ultra directo
        contenidoHtmlActivos: emailTemplate(`
  <tr><td style="padding:48px 48px 32px;">
    <h1 style="${sH1}">Quedan {{cupos_restantes}} de 88.</h1>
    <p style="${sP}">{{nombre}}, ya abriste mis emails. Ya conoces la historia del Día 88, ya sabes lo que hace Pedro desde Australia y lo que logró José desde Escocia.</p>
    <p style="${sP}">Solo vine a decirte un número: <strong>{{cupos_restantes}}</strong>.</p>
    <p style="${sP}">Cuando llegue a 0, cierra.</p>
    ${ctaBtn(29)}
    <p style="${sPd}"><strong>P.D.</strong> — Es un número real. Y baja.</p>
    ${firmaHtml()}
  </td></tr>`),
        notas: 'V3: Ángulo SOCIAL — "¿Qué saben ellas que tú no?" NO repite MIDI/Kit/desglose. Fríos = corto con contexto mínimo. Activos = insider.'
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // EMAIL 8 — PÉRDIDA (ULTRA-CORTO, 5-6 líneas)
    // Ángulo: no venta, aviso · < 400 chars cuerpo
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    campaigns.push({
        nombre: 'Email 8 - Pérdida $15 (Broadcast Dual)',
        asunto: '{{nombre}}, pierdes $15 en 48 horas',
        previewText: 'No te estoy vendiendo — te estoy avisando.',
        tipo: 'broadcast',
        modoEnvio: 'fechaFija',
        ordenSecuencia: 8,
        estado: 'borrador',
        fechaProgramada: new Date('2026-03-27T09:00:00'),
        umbralEngagement: 4,
        // FRÍOS → corto pero con contexto suficiente
        contenidoHtml: emailTemplate(`
  <tr><td style="padding:48px 48px 32px;">
    <h1 style="${sH1}">Pierdes $15 en 48 horas.</h1>
    <p style="${sP}">{{nombre}}, en 48 horas tu Kit de Bienvenida pasa de $29 a $44.</p>
    <p style="${sP}">Son $15 reales. No es un juego de marketing. Es un número que cambia el 29 de marzo y no vuelve.</p>
    <p style="${sP}">Clases de piano 1 a 1 con profesores de conservatorio. Garantía de 30 días — si no ves progreso, dinero de vuelta.</p>
    ${ctaBtn(29)}
    <p style="${sPd}"><strong>P.D.</strong> — El riesgo es mío, no tuyo.</p>
    ${firmaHtml()}
  </td></tr>`),
        // ACTIVOS → ultra-corto
        contenidoHtmlActivos: emailTemplate(`
  <tr><td style="padding:48px 48px 32px;">
    <h1 style="${sH1}">48 horas. $15.</h1>
    <p style="${sP}">{{nombre}}, ya sabes todo lo que necesitas saber.</p>
    <p style="${sP}">El 29 de marzo sube de $29 a $44. No vuelve.</p>
    ${ctaBtn(29)}
    <p style="${sPd}"><strong>P.D.</strong> — Garantía 30 días. El riesgo es mío.</p>
    ${firmaHtml()}
  </td></tr>`),
        notas: 'V3: ULTRA-CORTO. ~350 chars versión fría, ~150 chars versión activos. Sin MIDI, sin Kit desglose, sin repetir pitch. Solo aviso de pérdida + CTA.'
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // EMAIL 9 — CELEBRACIÓN (ángulo cumpleaños, emocional)
    // No es un pitch — es una invitación personal
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    campaigns.push({
        nombre: 'Email 9 - Celebración Día 88 (Broadcast Dual)',
        asunto: 'Hoy cumplo años y quiero compartir algo contigo 🎂',
        previewText: '88 teclas. Día 88 del año. Mi cumpleaños. Todo converge hoy.',
        tipo: 'broadcast',
        modoEnvio: 'fechaFija',
        ordenSecuencia: 9,
        estado: 'borrador',
        fechaProgramada: new Date('2026-03-29T08:00:00'),
        umbralEngagement: 4,
        // FRÍOS → celebración emocional + contexto breve
        contenidoHtml: emailTemplate(`
  <tr><td style="padding:48px 48px 32px; text-align:center;">
    <p style="color:#c9a84c;font-size:12px;letter-spacing:3px;text-transform:uppercase;margin:0 0 16px;">29 DE MARZO DE 2026 · DÍA 88</p>
    <h1 style="font-family:Georgia,serif;font-size:32px;color:#0a0a0a;margin:0 0 16px;line-height:1.2;">Hoy cumplo años.</h1>
    <p style="font-size:18px;color:#666;margin:0 0 32px;">Y hoy abre PianoLink.</p>
  </td></tr>
  <tr><td style="padding:0 48px 32px;">
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="${sSep}"></td></tr></table>
    <p style="${sP}">{{nombre}}, quiero contarte algo personal.</p>
    <p style="${sP}">El 29 de marzo es mi cumpleaños. También es el Día Mundial del Piano. Y también es el día 88 del año — como las 88 teclas.</p>
    <p style="${sP}">Cuando descubrí esa triple coincidencia, supe que este tenía que ser el día. Y hoy <strong>es</strong> ese día.</p>
    <p style="${sP}">PianoLink es clases de piano 1 a 1 con profesores de conservatorio que te escuchan y corrigen en vivo — desde tu casa. José empezó donde tú estás y hoy toca Rachmaninov desde Escocia. Pedro enseña desde Australia con la misma precisión que en la Universidad de Chile.</p>
    <p style="${sP}">Tu Kit de Bienvenida hoy cuesta <strong>$44 USD</strong> — la mitad exacta de 88. Incluye asesoría, setup, tu primera clase real y garantía de 30 días.</p>
    <p style="${sP}"><strong>Quedan {{cupos_restantes}} de 88 cupos. Cierra hoy a las 11:59 PM.</strong></p>
    ${ctaBtn(44)}
    <p style="${sPd}"><strong>P.D.</strong> — Garantía 30 días. Si no es para ti, dinero de vuelta. Pero si hoy no es tu día... ¿cuándo?</p>
    ${firmaHtml()}
  </td></tr>`),
        // ACTIVOS → celebración íntima + urgencia
        contenidoHtmlActivos: emailTemplate(`
  <tr><td style="padding:48px 48px 32px; text-align:center;">
    <p style="color:#c9a84c;font-size:12px;letter-spacing:3px;text-transform:uppercase;margin:0 0 16px;">29 DE MARZO DE 2026 · DÍA 88</p>
    <h1 style="font-family:Georgia,serif;font-size:32px;color:#0a0a0a;margin:0 0 16px;line-height:1.2;">Hoy es el día, {{nombre}}.</h1>
    <p style="font-size:18px;color:#666;margin:0 0 32px;">Mi cumpleaños. El Día Mundial del Piano. Y tu momento.</p>
  </td></tr>
  <tr><td style="padding:0 48px 32px;">
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="${sSep}"></td></tr></table>
    <p style="${sP}">Quedan <strong>{{cupos_restantes}}</strong> de 88 cupos. Cierra a las <strong>11:59 PM de hoy</strong>.</p>
    <p style="${sP}">Ya sabes la historia. Ya conoces a Pedro y a José. Ya leíste todo.</p>
    <p style="${sP}">Solo falta una decisión.</p>
    ${ctaBtn(44)}
    <p style="${sPd}"><strong>P.D.</strong> — Garantía 30 días. Hoy o nunca — literalmente.</p>
    ${firmaHtml()}
  </td></tr>`),
        notas: 'V3: Ángulo CELEBRACIÓN — cumpleaños de Miguel, no pitch de ventas. Apertura emocional. Subject universal ("cumplo años") funciona para leads fríos sin contexto del Día 88. Deadline 11:59 PM.'
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // CARRITO ABANDONADO (trigger, mejoras menores)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    campaigns.push({
        nombre: 'Email Carrito Abandonado',
        asunto: '{{nombre}}, ¿necesitas ayuda con tu Kit?',
        previewText: 'Vi que estuviste a punto. ¿Todo bien?',
        tipo: 'trigger',
        modoEnvio: 'trigger',
        triggerEvento: 'click_sin_pago',
        triggerDelayMinutos: 60,
        estado: 'borrador',
        contenidoHtml: emailTemplate(`
  <tr><td style="padding:48px 48px 32px;">
    <h1 style="${sH1}">{{nombre}}, ¿todo bien?</h1>
    <p style="${sP}">Vi que estuviste a punto de reservar tu Kit de Bienvenida.</p>
    <p style="${sP}">No sé si fue un problema técnico, si te surgió una duda, o si simplemente se te pasó el momento. Cualquiera que sea la razón, está bien.</p>
    <p style="${sP}">Si tienes alguna pregunta — sobre la tecnología, los horarios, el setup, lo que sea — <strong>respóndeme directamente a este email</strong>. Lo leo yo, Miguel. No es un bot, no es un equipo de soporte. Soy yo.</p>
    <p style="${sP}">Si simplemente se te pasó el momento, aquí está el link:</p>
    ${ctaBtn(29)}
    <p style="${sPd}"><strong>P.D.</strong> — El precio de madrugador ($29) se mantiene hasta el 29 de marzo. Después sube a $44. Garantía de 30 días incluida.</p>
    ${firmaHtml()}
  </td></tr>`),
        notas: 'V3: Más específico sobre deadline ($29 hasta 29 de marzo). Tono suave, personal. "Respóndeme directamente." Recupera 5-15% de ventas perdidas.'
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // EMAIL 10 — POST-CIERRE + LISTA PRIORITARIA
    // CTA específico para próxima apertura
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    campaigns.push({
        nombre: 'Email 10 - Post-cierre no compradores',
        asunto: 'Los 88 cupos se completaron',
        previewText: 'Gracias por haber sido parte.',
        tipo: 'broadcast',
        modoEnvio: 'fechaFija',
        triggerEvento: 'cupos_completados',
        ordenSecuencia: 10,
        estado: 'borrador',
        contenidoHtml: emailTemplate(`
  <tr><td style="padding:48px 48px 32px;">
    <h1 style="${sH1}">Los 88 cupos se completaron.</h1>
    <p style="${sP}">{{nombre}}, los 88 cupos del Día 88 se llenaron.</p>
    <p style="${sP}">Gracias por haber sido parte de la lista. Me habría encantado que estuvieras entre los 88.</p>
    <p style="${sP}">No sé cuándo abriremos nuevos cupos. Pero cuando lo hagamos, quiero que seas el primero en saberlo.</p>
    <p style="${sP}">Si quieres estar en la <strong>lista prioritaria</strong> para la próxima apertura, solo respóndeme "quiero estar" a este email. Te pongo primero en la fila.</p>
    <p style="${sPd}"><strong>P.D.</strong> — Mientras tanto, el video de José tocando Rachmaninov sigue en <a href="https://pianolink.net" style="color:#c9a84c;">pianolink.net</a>. Échale un vistazo. Si él pudo, tú también puedes.</p>
    ${firmaHtml()}
  </td></tr>`),
        notas: 'V3: CTA conversacional "respóndeme quiero estar" para lista prioritaria. Valida escasez retroactivamente. El lead actúa más rápido en próxima tanda.'
    });

    return campaigns;
}

// ════════════════════════════════════════════
// DEPLOY: Crear/reemplazar CrmEmailCampaigns
// ════════════════════════════════════════════
async function deployEmailCampaigns() {
    console.log('\n📧 Desplegando 11 campañas de email v3...');

    // Eliminar campañas anteriores (v1, v2 y v3)
    const deleted = await CrmEmailCampaign.deleteMany({
        $or: [
            { nombre: { $regex: /^Email (1|2|3|4|5|6|7|8|9|10|Carrito)/ } },
            { nombre: { $regex: /^Campaña Día 88/ } }
        ]
    });
    console.log(`🗑️  ${deleted.deletedCount} campañas anteriores eliminadas`);

    const campaigns = buildCampaigns();
    const created = [];

    for (const data of campaigns) {
        const campaign = new CrmEmailCampaign(data);
        await campaign.save();
        created.push(campaign);
        console.log(`  ✅ ${campaign.nombre}`);
    }

    console.log(`\n📊 ${created.length} campañas creadas`);
    return created;
}

// ════════════════════════════════════════════
// SYNC: Actualizar CrmSequence con emails 1-6
// ════════════════════════════════════════════
async function syncCrmSequence(campaigns) {
    console.log('\n🔄 Sincronizando CrmSequence activa...');

    // Buscar la secuencia activa
    const sequence = await CrmSequence.findOne({ status: 'active', 'trigger.event': 'lead.created' });
    if (!sequence) {
        console.log('⚠️  No se encontró CrmSequence activa con trigger lead.created');
        console.log('   Los emails de secuencia se crearán pero no se enviarán automáticamente.');
        console.log('   Ejecuta seedCampanaEmailMarketing.js primero si necesitas la secuencia.');
        return null;
    }

    console.log(`📋 Secuencia encontrada: "${sequence.name}" (${sequence.steps.length} pasos)`);

    // Los 6 emails de secuencia (ordenSecuencia 1-6)
    const secuenciaEmails = campaigns.filter(c => c.tipo === 'secuencia').sort((a, b) => a.ordenSecuencia - b.ordenSecuencia);

    let updated = 0;
    for (const email of secuenciaEmails) {
        const stepIndex = email.ordenSecuencia - 1;
        if (stepIndex >= sequence.steps.length) {
            console.log(`  ⚠️  Step ${stepIndex} no existe en la secuencia (tiene ${sequence.steps.length} pasos)`);
            continue;
        }

        const step = sequence.steps[stepIndex];
        const oldSubject = step.email?.subject || '';
        
        // Actualizar contenido del step
        step.email.subject = email.asunto;
        step.email.bodyHtml = email.contenidoHtml;
        step.email.previewText = email.previewText || '';

        // Actualizar delay
        if (email.diasDespuesRegistro != null) {
            step.delayHours = email.diasDespuesRegistro * 24;
        }

        updated++;
        const changed = oldSubject !== email.asunto ? ' (subject cambió)' : '';
        console.log(`  ✅ Step ${stepIndex}: "${email.nombre}"${changed}`);
    }

    await sequence.save();
    console.log(`\n🔄 ${updated} pasos sincronizados en CrmSequence`);

    return sequence;
}

// ════════════════════════════════════════════
// VERIFICACIÓN
// ════════════════════════════════════════════
async function verify() {
    console.log('\n🔍 Verificando integridad...');

    // Verificar CrmEmailCampaigns
    const campaigns = await CrmEmailCampaign.find({
        nombre: { $regex: /^Email (1|2|3|4|5|6|7|8|9|10|Carrito)/ }
    }).sort({ ordenSecuencia: 1 }).lean();

    console.log(`\n📧 CrmEmailCampaigns (${campaigns.length}):`);
    for (const c of campaigns) {
        const htmlLen = (c.contenidoHtml || '').length;
        const activosLen = (c.contenidoHtmlActivos || '').length;
        const activosInfo = activosLen > 0 ? ` | activos: ${activosLen} chars` : '';
        console.log(`  ${c.ordenSecuencia || '-'}. ${c.nombre} — ${c.tipo}/${c.modoEnvio} — ${htmlLen} chars${activosInfo}`);
        
        // Verificar que CTA apunta a /oferta-madrugadores
        if (c.contenidoHtml && !c.contenidoHtml.includes('/oferta-madrugadores') && c.ordenSecuencia !== 10) {
            console.log(`     ⚠️  CTA no apunta a /oferta-madrugadores`);
        }
    }

    // Verificar CrmSequence
    const sequence = await CrmSequence.findOne({ status: 'active', 'trigger.event': 'lead.created' }).lean();
    if (sequence) {
        console.log(`\n🔄 CrmSequence: "${sequence.name}" (${sequence.steps.length} pasos)`);
        for (let i = 0; i < sequence.steps.length; i++) {
            const s = sequence.steps[i];
            const htmlLen = (s.email?.bodyHtml || '').length;
            const subj = (s.email?.subject || '').substring(0, 60);
            console.log(`  Step ${i}: delay=${s.delayHours}h — "${subj}..." — ${htmlLen} chars`);
        }

        // Verificar concordancia entre CrmEmailCampaign y CrmSequence
        console.log('\n🔗 Concordancia CrmEmailCampaign ↔ CrmSequence:');
        const secEmails = campaigns.filter(c => c.tipo === 'secuencia').sort((a, b) => a.ordenSecuencia - b.ordenSecuencia);
        for (const email of secEmails) {
            const stepIndex = email.ordenSecuencia - 1;
            if (stepIndex < sequence.steps.length) {
                const step = sequence.steps[stepIndex];
                const match = (step.email?.bodyHtml || '').length === (email.contenidoHtml || '').length;
                const icon = match ? '✅' : '❌';
                console.log(`  ${icon} Email ${email.ordenSecuencia}: Campaign=${(email.contenidoHtml || '').length} chars | Sequence=${(step.email?.bodyHtml || '').length} chars`);
            }
        }
    } else {
        console.log('\n⚠️  No hay CrmSequence activa');
    }

    // Verificar repetición de conceptos clave (diagnóstico de calidad)
    console.log('\n📊 Diagnóstico de repetición (v3):');
    const allHtml = campaigns.map(c => (c.contenidoHtml || '')).join(' ');
    const patterns = [
        { name: 'MIDI', regex: /midi/gi },
        { name: '"ve cada nota"', regex: /ve (cada|exactamente cada) nota/gi },
        { name: '"No es Zoom"', regex: /no es zoom/gi },
        { name: 'Kit de Bienvenida', regex: /kit de bienvenida/gi },
        { name: 'Garantía 30 días', regex: /garant[ií]a.{0,5}30/gi },
        { name: 'Pedro Pagliai', regex: /pedro/gi },
        { name: 'José', regex: /jos[eé]/gi },
        { name: 'Rachmaninov', regex: /rachmaninov/gi },
    ];
    for (const p of patterns) {
        const matches = (allHtml.match(p.regex) || []).length;
        const icon = matches <= 3 ? '✅' : matches <= 5 ? '🟡' : '🔴';
        console.log(`  ${icon} "${p.name}": ${matches} menciones`);
    }
}

// ════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════
async function main() {
    console.log('🚀 Deploy Campaña V3 — Lanzamiento Día 88\n');
    console.log('═══════════════════════════════════════════');
    
    await connectDB();

    try {
        // 1. Crear/reemplazar campañas
        const campaigns = await deployEmailCampaigns();

        // 2. Sincronizar CrmSequence
        await syncCrmSequence(campaigns);

        // 3. Verificar
        await verify();

        console.log('\n═══════════════════════════════════════════');
        console.log('✅ Deploy v3 completado exitosamente');
        console.log('\n📋 Cambios principales vs v2:');
        console.log('   • Email 1: transformación, no features (~700 chars)');
        console.log('   • Email 3: Pedro como HISTORIA, MIDI sentido');
        console.log('   • Email 4: José historia COMPLETA + sección transformación');
        console.log('   • Email 6: + invitación a responder dudas');
        console.log('   • Email 7: ángulo ESCASEZ SOCIAL (nuevo)');
        console.log('   • Email 8: ángulo PÉRDIDA, ultra-corto (~350 chars)');
        console.log('   • Email 9: ángulo CELEBRACIÓN/cumpleaños (nuevo)');
        console.log('   • Broadcasts: fríos=corto, activos=insider (invertido)');
        console.log('   • Repetición MIDI reducida drásticamente');
        console.log('   • CTA universal: "Quiero mi Kit — $XX"');

    } catch (error) {
        console.error('\n❌ Error en deploy:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\n🔌 Desconectado de MongoDB');
    }
}

main();
