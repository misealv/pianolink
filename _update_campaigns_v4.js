/**
 * _update_campaigns_v4.js
 * Actualiza las 11 campañas: elimina madrugadores, nuevo modelo Kit $44.
 * - Links: /oferta-madrugadores → /kit-bienvenida-v2
 * - Precio único: $44 USD (sin madrugador $29)
 * - Cable MIDI de regalo, paquetes de clases $30/$100/$180
 * - Elimina: 88 cupos, lista de espera, countdown, Día 88
 * Ejecutar: node _update_campaigns_v4.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const CrmEmailCampaign = require('./crm/models/CrmEmailCampaign');
const CrmSequence = require('./crm/models/CrmSequence');

// === TEMPLATE Y HELPERS (mismos estilos que v3) ===
function emailTemplate(bodyHtml) {
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f5f0;font-family:Georgia,serif;">
<table width="100%" cellpadding="0" cellspacing="0" bgcolor="#f5f5f0"><tr><td align="center" style="padding:30px 20px;">
<table width="600" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
  <tr><td bgcolor="#0a0a0a" align="center" style="padding:28px 40px;">
    <span style="font-family:Georgia,serif;font-size:22px;color:#c9a84c;letter-spacing:2px;">🎹 PianoLink</span>
  </td></tr>${bodyHtml}
  <tr><td bgcolor="#0a0a0a" style="padding:24px 48px;" align="center">
    <p style="color:#888;font-size:12px;margin:0 0 8px;">PianoLink · Clases de piano online 1 a 1</p>
    <p style="margin:0;"><a href="{{unsubscribe_url}}" style="color:#666;font-size:11px;">Cancelar suscripción</a></p>
    <p style="color:#555;font-size:11px;margin:8px 0 0;">© 2026 PianoLink · hola@pianolink.net</p>
  </td></tr></table></td></tr></table></body></html>`;
}
const sP = 'font-size:16px;color:#333;line-height:1.8;margin:0 0 20px;';
const sH1 = 'font-family:Georgia,serif;font-size:28px;color:#0a0a0a;margin:0 0 28px;line-height:1.3;';
const sPd = 'font-size:14px;color:#666;line-height:1.6;margin:24px 0 0;border-top:1px solid #eee;padding-top:16px;';
const sCta = 'background:#c9a84c;color:#0a0a0a;text-decoration:none;padding:16px 40px;border-radius:4px;font-size:16px;font-weight:bold;display:inline-block;';
const sQuote = 'border-left:4px solid #c9a84c;background:#f5f5f0;padding:20px 24px;border-radius:0 8px 8px 0;';
function ctaBtn() {
    return `<table width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0;"><tr><td align="center"><a href="https://pianolink.net/kit-bienvenida-v2" style="${sCta}">Quiero mi Kit — $44</a></td></tr></table>`;
}
function ctaWhatsApp() {
    return `<table width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0;"><tr><td align="center"><a href="https://wa.me/15167168719?text=Hola%20M%C3%ADa" style="${sCta.replace('#c9a84c','#25D366').replace('#0a0a0a','#ffffff')}">💬 Escribirle a Mía por WhatsApp</a></td></tr></table>`;
}
function firma() {
    return `<p style="font-size:16px;color:#333;margin:0;">Miguel Antonio<br><span style="color:#c9a84c;">Fundador, PianoLink</span></p>`;
}

// === MAIN ===
async function main() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Conectado a MongoDB');
    const campaigns = await CrmEmailCampaign.find({}).sort({ ordenSecuencia: 1 });
    console.log(`📧 ${campaigns.length} campañas encontradas\n`);

    for (const c of campaigns) {
        // Bulk: links y CTA
        const fix = (h) => h.replace(/https:\/\/pianolink\.net\/oferta-madrugadores/g, 'https://pianolink.net/kit-bienvenida-v2')
            .replace(/Quiero mi Kit — \$29/g, 'Quiero mi Kit — $44');
        c.contenidoHtml = fix(c.contenidoHtml);
        if (c.contenidoHtmlActivos) c.contenidoHtmlActivos = fix(c.contenidoHtmlActivos);
        c.fechaLimiteEntrada = null;
        if (c.tipo === 'broadcast') { c.fechaProgramada = null; c.estado = 'borrador'; }

        switch (c.ordenSecuencia) {
        case 1: // Bienvenida — quirúrgico
            c.nombre = 'Email 1 - Bienvenida';
            c.asunto = '{{nombre}}, tu viaje al piano empieza aquí 🎹';
            c.previewText = 'Acabas de dar un paso que la mayoría posterga para siempre.';
            c.contenidoHtml = c.contenidoHtml
                .replace('Registrarte en una lista de espera para aprender piano', 'Dar el primer paso para aprender piano')
                .replace(/Por estar aquí antes que nadie, tienes acceso a un precio de <strong>\$29 USD<\/strong> que el público general no va a ver\. Guardo los detalles para los próximos días\./, 'Tu Kit de Bienvenida cuesta <strong>$44 USD</strong> e incluye: asesoría personalizada, tu cable MIDI de regalo, setup guiado por videollamada y tu primera clase de prueba con un profesor real.')
                .replace('Mañana te cuento una historia. Una coincidencia tan rara que no puede ser coincidencia.', 'En mi próximo email te cuento cómo nació PianoLink. La historia detrás de todo esto.')
                .replace(/\$29\? ¿Por qué el 29 de marzo\? Los números esconden algo\. Te lo cuento en mi próximo email\./, '$44? Porque incluye TODO: cable MIDI de regalo, asesoría, setup y tu primera clase real. Te cuento más en mi próximo email.');
            break;

        case 2: // Día 88 → Historia de PianoLink (REESCRITURA COMPLETA)
            c.nombre = 'Email 2 - Historia de PianoLink';
            c.asunto = 'Por qué construí PianoLink (historia personal) 🎹';
            c.previewText = 'A los 4 años pedí un piano para Navidad.';
            c.contenidoHtml = emailTemplate(`<tr><td style="padding:48px 48px 32px;">
    <h1 style="${sH1}">Por qué construí PianoLink.</h1>
    <p style="${sP}">{{nombre}}, a los 4 años le pedí un piano a mis papás para Navidad. No sabía ni cómo sonaba de cerca. Pero algo en mí sabía.</p>
    <p style="${sP}">Tuve que esperar hasta los 10 para tener mi primer teclado — 3 octavas. Y cuando llegó, lo toqué cada día.</p>
    <p style="${sP}">Después vinieron los años de conservatorio, los profesores que me cambiaron la vida, los escenarios. Y una certeza: aprender piano con el profesor correcto es una experiencia que <strong>transforma</strong>.</p>
    <p style="${sP}">El problema: la mayoría no tiene acceso a ese profesor. El conservatorio queda lejos, cuesta demasiado, o los horarios no cuadran. Y las clases por Zoom — seamos honestos — no son lo mismo.</p>
    <p style="${sP}">En Zoom un profesor puede <em>verte</em>. Pero no puede <em>sentir</em> cómo tocas. No distingue si tu legato fue limpio, si tu pedal entró a tiempo, si tus dinámicas cambiaron.</p>
    <p style="${sP}"><strong>PianoLink sí.</strong></p>
    <p style="${sP}">Construí una sala virtual donde tu profesor recibe un mapa exacto de cada nota que tocas. Cada velocidad, cada duración. Es como tener al profesor sentado a tu lado — desde cualquier lugar del mundo.</p>
    <p style="${sP}">Si tienes un teclado y ganas de aprender, tienes todo lo que necesitas para empezar.</p>
    ${ctaBtn()}
    <p style="${sPd}"><strong>P.D.</strong> — En mi próximo email te presento a alguien. Un profesor que enseña desde el otro lado del mundo con una precisión que Zoom no puede soñar.</p>
    ${firma()}</td></tr>`);
            break;

        case 3: // Pedro — solo CTA (ya actualizado por bulk)
            break;

        case 4: // José — P.D. referencia $29
            c.contenidoHtml = c.contenidoHtml.replace('Kit de $29', 'Kit de $44');
            break;

        case 5: // Desglose Kit (REESCRITURA — añade cable MIDI, paquetes clases)
            c.nombre = 'Email 5 - Desglose Kit $44';
            c.asunto = 'Lo que incluyen tus $44 (sin letra chica)';
            c.previewText = 'Todo lo que recibes por $44. Sin adornar.';
            c.contenidoHtml = emailTemplate(`<tr><td style="padding:48px 48px 32px;">
    <h1 style="${sH1}">Lo que incluyen tus $44.</h1>
    <p style="${sP}">{{nombre}}, sin letra chica:</p>
    <table width="100%" bgcolor="#f5f5f0" style="border-radius:8px;margin:0 0 24px;"><tr><td style="padding:28px;">
      <p style="font-size:15px;color:#333;margin:0 0 10px;">✓ &nbsp;<strong>Asesoría técnica personalizada</strong> (~20 min)</p>
      <p style="font-size:13px;color:#666;margin:0 0 16px;padding-left:24px;">Evaluamos tu teclado, objetivos y disponibilidad.</p>
      <p style="font-size:15px;color:#333;margin:0 0 10px;">✓ &nbsp;<strong>Cable MIDI de regalo</strong></p>
      <p style="font-size:13px;color:#666;margin:0 0 16px;padding-left:24px;">El cable exacto para tu teclado (USB o adaptador DIN→USB). Lo enviamos nosotros.</p>
      <p style="font-size:15px;color:#333;margin:0 0 10px;">✓ &nbsp;<strong>Setup técnico guiado</strong> (~20 min)</p>
      <p style="font-size:13px;color:#666;margin:0 0 16px;padding-left:24px;">Videollamada donde configuramos todo juntos.</p>
      <p style="font-size:15px;color:#333;margin:0 0 10px;">✓ &nbsp;<strong>Tu primera clase real de piano</strong> (30 min)</p>
      <p style="font-size:13px;color:#666;margin:0 0 16px;padding-left:24px;">Con profesor de conservatorio. En vivo. Corrección en tiempo real.</p>
      <p style="font-size:15px;color:#333;margin:0 0 10px;">✓ &nbsp;<strong>Garantía de 30 días</strong></p>
      <p style="font-size:13px;color:#666;margin:0;padding-left:24px;">Dinero de vuelta, sin preguntas.</p>
    </td></tr></table>
    <p style="${sP}"><strong>Después del Kit, clases individuales:</strong></p>
    <table width="100%"><tr><td style="${sQuote}"><p style="font-size:15px;color:#333;line-height:1.8;margin:0;">1 clase: <strong>$30 USD</strong> · 4 clases: <strong>$100 USD</strong> (ahorras $20) · 8 clases: <strong>$180 USD</strong> (ahorras $60)<br><span style="font-size:13px;color:#666;">Horarios: L-V 9:00-21:00 · Sáb 9:00-14:00 (hora Chile)</span></p></td></tr></table>
    <p style="${sP}">Una clase presencial cuesta $20–$40 — solo la clase. Por $44 tienes asesoría + cable MIDI + setup + clase + garantía.</p>
    <p style="${sP}"><strong>Peor escenario:</strong> pides tu dinero de vuelta y quedas exactamente como estás.</p>
    <table width="100%"><tr><td style="${sQuote}"><p style="font-size:15px;color:#333;line-height:1.8;margin:0;">¿Quieres ver cómo suena alguien que empezó donde tú estás? <a href="https://pianolink.net" style="color:#c9a84c;">Mira el video de José</a> tocando Rachmaninov desde Escocia.</p></td></tr></table>
    ${ctaBtn()}
    <p style="${sPd}"><strong>P.D.</strong> — Mi próximo email te va a sorprender por su sinceridad. PianoLink no es para todo el mundo — y quiero ser honesto contigo.</p>
    ${firma()}</td></tr>`);
            break;

        case 6: // Anti-venta — quirúrgico
            c.contenidoHtml = c.contenidoHtml.replace('88 estudiantes comprometidos', 'estudiantes comprometidos');
            break;

        // === BROADCASTS ===
        case 7: // Escasez social → Prueba social (REESCRITURA)
            c.nombre = 'Email 7 - Prueba Social';
            c.asunto = '¿Puedo aprender piano de verdad online? (respuesta adentro)';
            c.previewText = 'José empezó desde cero. Pedro enseña desde Australia.';
            c.contenidoHtml = emailTemplate(`<tr><td style="padding:48px 48px 32px;">
    <h1 style="${sH1}">¿Se puede aprender piano de verdad online?</h1>
    <p style="${sP}">{{nombre}}, la pregunta más común que recibo. Y la respuesta es una historia.</p>
    <p style="${sP}">José llegó a PianoLink desde <strong>Escocia</strong> sin saber leer una partitura. Hoy toca <strong>Rachmaninov</strong>. Su video está en nuestra página — cuando lo veas, fíjate en sus manos. Esas manos empezaron donde tú estás ahora.</p>
    <p style="${sP}">Pedro Pagliai enseñaba presencial en la <strong>Universidad de Chile</strong>. Se mudó a <strong>Australia</strong>. Y sus alumnos no lo perdieron — porque PianoLink le permite corregir cada nota, cada matiz, como si estuviera al lado.</p>
    <p style="${sP}">Esto no es Zoom. En Zoom tu profesor te <em>ve</em>. En PianoLink te <em>escucha</em> — cada nota, cada velocidad, cada detalle.</p>
    <p style="${sP}">Tu Kit de Bienvenida (<strong>$44 USD</strong>) incluye cable MIDI de regalo, setup guiado, y tu primera clase real con un profesor de conservatorio.</p>
    ${ctaBtn()}
    <p style="${sPd}"><strong>P.D.</strong> — ¿Tienes dudas? Nuestra asesora Mía te responde por WhatsApp en minutos.</p>
    ${ctaWhatsApp()}
    ${firma()}</td></tr>`);
            c.contenidoHtmlActivos = emailTemplate(`<tr><td style="padding:48px 48px 32px;">
    <h1 style="${sH1}">José + Rachmaninov. Desde cero.</h1>
    <p style="${sP}">{{nombre}}, ya conoces la historia de PianoLink y la tecnología MIDI.</p>
    <p style="${sP}">Solo quiero recordarte algo: José empezó exactamente donde tú estás ahora. Cero experiencia. Pero se sentó, empezó, y los resultados hablan solos.</p>
    <p style="${sP}">Tu Kit está listo: <strong>$44</strong>, cable MIDI de regalo incluido.</p>
    ${ctaBtn()}
    ${firma()}</td></tr>`);
            break;

        case 8: // Pérdida → Objeciones (REESCRITURA)
            c.nombre = 'Email 8 - Objeciones';
            c.asunto = '{{nombre}}, ¿algo te frena? (respondo las 3 dudas más comunes)';
            c.previewText = 'Si alguna de estas te suena, lee esto.';
            c.contenidoHtml = emailTemplate(`<tr><td style="padding:48px 48px 32px;">
    <h1 style="${sH1}">Las 3 dudas que más escucho.</h1>
    <p style="${sP}">{{nombre}}, si aún no has dado el paso, es probable que una de estas te suene:</p>
    <p style="${sP}"><strong>1. "No tengo teclado"</strong><br>Te recomendamos opciones desde $50 USD. Y con el Kit, el cable MIDI te lo regalamos nosotros.</p>
    <p style="${sP}"><strong>2. "No sé nada de tecnología"</strong><br>Por eso el Kit incluye un setup guiado por videollamada. Lo hacemos juntos. No tocas nada solo.</p>
    <p style="${sP}"><strong>3. "¿Y si no me gusta?"</strong><br>Garantía de 30 días. Si no ves progreso, dinero de vuelta. Sin preguntas.</p>
    <p style="${sP}">Si tu duda es otra — <strong>escríbele a Mía por WhatsApp</strong>. Te responde en minutos y te diagnostica gratis si tu teclado es compatible.</p>
    ${ctaWhatsApp()}
    ${ctaBtn()}
    ${firma()}</td></tr>`);
            c.contenidoHtmlActivos = emailTemplate(`<tr><td style="padding:48px 48px 32px;">
    <h1 style="${sH1}">¿Algo te frena?</h1>
    <p style="${sP}">{{nombre}}, has leído todo. Conoces la tecnología, los profesores, las historias.</p>
    <p style="${sP}">Si hay algo que te detiene — una duda, un miedo, lo que sea — escríbele a Mía. Te responde en minutos.</p>
    ${ctaWhatsApp()}
    <p style="${sP}">Tu Kit: <strong>$44</strong>. Garantía 30 días. Cable MIDI de regalo.</p>
    ${ctaBtn()}
    ${firma()}</td></tr>`);
            break;

        case 9: // Día 88 → Recordatorio valor (REESCRITURA)
            c.nombre = 'Email 9 - Recordatorio Final';
            c.asunto = 'Un resumen honesto de todo lo que te he contado 🎹';
            c.previewText = 'Todo en un solo lugar. Sin alargar más.';
            c.contenidoHtml = emailTemplate(`<tr><td style="padding:48px 48px 32px;">
    <h1 style="${sH1}">Todo en un solo lugar.</h1>
    <p style="${sP}">{{nombre}}, este es mi último email sobre el tema. Sin presión, sin urgencia — solo un resumen honesto:</p>
    <table width="100%" bgcolor="#f5f5f0" style="border-radius:8px;margin:0 0 24px;"><tr><td style="padding:28px;">
      <p style="font-size:15px;color:#333;line-height:2;margin:0;">🎹 Clases de piano 1 a 1 con profesores de conservatorio<br>🔌 Tu profesor escucha cada nota que tocas (tecnología MIDI)<br>🎁 Cable MIDI de regalo con tu Kit<br>📞 Setup guiado por videollamada — no tocas nada solo<br>🎓 Primera clase real de prueba incluida<br>💰 $44 USD · Después: $30/clase o paquetes $100/4 y $180/8<br>✅ Garantía 30 días — dinero de vuelta sin preguntas</p>
    </td></tr></table>
    <p style="${sP}">José empezó sin saber nada y hoy toca Rachmaninov desde Escocia. Pedro enseña desde Australia con la misma precisión que en la Universidad de Chile.</p>
    <p style="${sP}">Si el piano es algo que llevas postergando, este es un buen momento para dejar de postergar.</p>
    ${ctaBtn()}
    <p style="${sPd}"><strong>P.D.</strong> — ¿Prefieres hablar con alguien? Mía te responde por WhatsApp.</p>
    ${ctaWhatsApp()}
    ${firma()}</td></tr>`);
            c.contenidoHtmlActivos = emailTemplate(`<tr><td style="padding:48px 48px 32px;">
    <h1 style="${sH1}">Último email, {{nombre}}.</h1>
    <p style="${sP}">No te voy a vender nada. Solo quiero recordarte que el Kit está ahí: <strong>$44</strong>, cable MIDI de regalo, setup guiado, primera clase real, garantía 30 días.</p>
    <p style="${sP}">Si es para ti, lo sabes. Si no, no pasa nada.</p>
    ${ctaBtn()}
    ${firma()}</td></tr>`);
            break;

        default:
            // Carrito abandonado y post-cierre — por nombre
            break;
        } // switch

        // === Carrito abandonado (por nombre) ===
        if (c.nombre.includes('Carrito')) {
            c.nombre = 'Email Carrito Abandonado';
            c.asunto = '{{nombre}}, ¿necesitas ayuda con tu Kit?';
            c.previewText = 'Vi que estuviste a punto. ¿Todo bien?';
            c.contenidoHtml = emailTemplate(`<tr><td style="padding:48px 48px 32px;">
    <h1 style="${sH1}">{{nombre}}, ¿todo bien?</h1>
    <p style="${sP}">Vi que estuviste a punto de reservar tu Kit de Bienvenida.</p>
    <p style="${sP}">Si tienes alguna duda — sobre la tecnología, los horarios, tu teclado — <strong>respóndeme directamente a este email</strong>. Lo leo yo, Miguel.</p>
    <p style="${sP}">O si prefieres, escríbele a nuestra asesora Mía por WhatsApp. Te diagnostica tu teclado y resuelve cualquier duda en minutos.</p>
    ${ctaWhatsApp()}
    <p style="${sP}">Tu Kit: <strong>$44 USD</strong>. Cable MIDI de regalo + asesoría + setup + primera clase + garantía 30 días.</p>
    ${ctaBtn()}
    <p style="${sPd}"><strong>P.D.</strong> — El riesgo es mío, no tuyo. Garantía 30 días.</p>
    ${firma()}</td></tr>`);
        }

        // === Post-cierre → Re-engagement ===
        if (c.nombre.includes('Post-cierre') || c.nombre.includes('no compradores')) {
            c.nombre = 'Email Re-engagement';
            c.asunto = '{{nombre}}, ¿sigues pensando en el piano?';
            c.previewText = 'Han pasado unos días. Solo quería escribirte.';
            c.contenidoHtml = emailTemplate(`<tr><td style="padding:48px 48px 32px;">
    <h1 style="${sH1}">¿Sigues pensando en el piano?</h1>
    <p style="${sP}">{{nombre}}, han pasado unos días desde mi último email y solo quería escribirte.</p>
    <p style="${sP}">Si el piano sigue siendo algo que quieres hacer, el Kit de Bienvenida sigue disponible: <strong>$44 USD</strong> con cable MIDI de regalo, setup guiado y tu primera clase real.</p>
    <p style="${sP}">Si tienes cualquier duda, escríbele a Mía — nuestra asesora musical — por WhatsApp. Te diagnostica tu teclado gratis y resuelve todo en minutos.</p>
    ${ctaWhatsApp()}
    ${ctaBtn()}
    <p style="${sPd}"><strong>P.D.</strong> — No hay deadline ni presión. El Kit estará cuando tú estés listo/a. Pero si el momento es ahora... no lo pospongas más.</p>
    ${firma()}</td></tr>`);
            c.triggerEvento = null;
        }

        await c.save();
        console.log(`  ✅ ${c.nombre} (${c.tipo})`);
    }

    // === Sincronizar CrmSequence (pasos 0-5 con emails 1-6) ===
    console.log('\n🔄 Sincronizando CrmSequence...');
    const sequence = await CrmSequence.findOne({ status: 'active', 'trigger.event': 'lead.created' });
    if (sequence) {
        const secEmails = await CrmEmailCampaign.find({ tipo: 'secuencia' }).sort({ ordenSecuencia: 1 }).lean();
        for (const email of secEmails) {
            const idx = email.ordenSecuencia - 1;
            if (idx < sequence.steps.length) {
                sequence.steps[idx].email.subject = email.asunto;
                sequence.steps[idx].email.bodyHtml = email.contenidoHtml;
                sequence.steps[idx].email.previewText = email.previewText || '';
                if (email.diasDespuesRegistro != null) sequence.steps[idx].delayHours = email.diasDespuesRegistro * 24;
                console.log(`  ✅ Step ${idx}: "${email.nombre}"`);
            }
        }
        await sequence.save();
        console.log(`🔄 ${secEmails.length} pasos sincronizados`);
    } else {
        console.log('⚠️  No se encontró CrmSequence activa');
    }

    // === Verificación ===
    console.log('\n🔍 Verificación final:');
    const all = await CrmEmailCampaign.find({}).sort({ ordenSecuencia: 1 }).lean();
    for (const c of all) {
        const hasOld = (c.contenidoHtml || '').includes('madrugador') || (c.contenidoHtml || '').includes('oferta-madrugadores') || (c.contenidoHtml || '').includes('$29');
        const icon = hasOld ? '❌' : '✅';
        console.log(`  ${icon} ${c.ordenSecuencia || '-'}. ${c.nombre} — ${(c.contenidoHtml||'').length} chars ${hasOld ? '(TIENE REFS ANTIGUAS)' : ''}`);
    }
}

main().then(() => { console.log('\n✅ Actualización v4 completada'); process.exit(0); })
    .catch(e => { console.error('❌ Error:', e); process.exit(1); });
