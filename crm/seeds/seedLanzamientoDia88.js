/**
 * crm/seeds/seedLanzamientoDia88.js
 * 
 * Seeds para el lanzamiento del Día 88 (29 de marzo de 2026):
 * - Landing de waitlist con countdown
 * - 11 campañas de email marketing (9 secuencia + carrito abandonado + post-cierre)
 * 
 * Arquitectura híbrida:
 * - 6 emails RELATIVOS (nurturing, se envían X días después del registro)
 * - 3 emails BROADCAST (fecha fija, con versión dual activos/fríos)
 * - 1 email TRIGGER (carrito abandonado, 1h después de click sin pago)
 * - 1 email BROADCAST post-cierre (cuando se completen los 88 cupos)
 * 
 * Correcciones aplicadas desde Auditoría de Marketing (Feb 2026):
 * - CTA unificado: "Quiero mi Kit — $29/$44"
 * - Prueba social: Pedro Pagliai (U. de Chile, Australia) y José (Escocia, Rachmaninov)
 * - Anti-repetición: MIDI y Kit no se repiten verbatim
 * - Broadcasts duales: versión corta (activos) y autocontenida (fríos)
 * - {{cupos_restantes}} dinámico en broadcasts
 * - Email 1 corto (max ~1200 chars), sin desglose del Kit
 * - Email 8 corto (max ~600 chars), fix temporal "48 horas"
 * - Email 9 con deadline concreto
 * 
 * Ejecutar: node crm/seeds/seedLanzamientoDia88.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const CrmLanding = require('../models/CrmLanding');
const CrmEmailCampaign = require('../models/CrmEmailCampaign');

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

// ════════════════════════════════════════════
// TEMPLATE BASE — Reutilizado por todos los emails
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

// Estilos reutilizables
const sP = 'font-size:16px;color:#333;line-height:1.8;margin:0 0 20px;';
const sH1 = 'font-family:Georgia,serif;font-size:28px;color:#0a0a0a;margin:0 0 28px;line-height:1.3;';
const sPd = 'font-size:14px;color:#666;line-height:1.6;margin:24px 0 0;border-top:1px solid #eee;padding-top:16px;';
const sCta = 'background:#c9a84c;color:#0a0a0a;text-decoration:none;padding:16px 40px;border-radius:4px;font-size:16px;font-weight:bold;display:inline-block;';
const sQuote = 'border-left:4px solid #c9a84c;background:#f5f5f0;padding:20px 24px;border-radius:0 8px 8px 0;';
const sSep = 'border-top:2px solid #c9a84c;padding-bottom:24px;';

// CTA unificado
function ctaBtn(precio) {
    return `<table width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0;"><tr><td align="center">
      <a href="https://pianolink.net/oferta-madrugadores" style="${sCta}">Quiero mi Kit — $${precio}</a>
    </td></tr></table>`;
}

// Firma de Miguel
function firmaHtml() {
    return `<p style="font-size:16px;color:#333;margin:0;">Miguel Antonio<br><span style="color:#c9a84c;">Fundador, PianoLink</span></p>`;
}

// ════════════════════════════════════════════
// SEED: LANDING WAITLIST DÍA 88
// ════════════════════════════════════════════
async function seedWaitlistLanding() {
    console.log('\n📄 Creando landing de Waitlist Día 88...');

    const existente = await CrmLanding.findOne({ slug: 'waitlist' });
    if (existente) {
        console.log('⚠️  Landing waitlist ya existe, actualizando...');
        await CrmLanding.deleteOne({ slug: 'waitlist' });
    }

    const waitlistLanding = new CrmLanding({
        name: 'Waitlist Día 88',
        slug: 'waitlist',
        status: 'published',
        template: 'generic',
        content: {
            hero: {
                headline: '🎹 El 29 de marzo inicia PianoLink',
                subheadline: 'Solo 88 cupos disponibles. Clases de piano 1 a 1 online con tecnología MIDI profesional. Aprende desde casa con profesores de conservatorio.',
                ctaText: '🎹 Quiero mi lugar (Gratis)',
                ctaColor: '#c9a84c',
                backgroundImage: 'https://images.unsplash.com/photo-1520523839897-bd0b52f945a0?q=80&w=1920&auto=format&fit=crop',
                videoUrl: ''
            },
            benefits: [
                { icon: '🎯', title: 'Solo 88 cupos', description: '88 teclas, día 88 del año, 88 cupos. Atención personalizada garantizada.' },
                { icon: '💰', title: 'Precio Madrugador: $29', description: 'Exclusivo lista de espera. El 29 de marzo sube a $44. Kit completo con asesoría, setup y primera clase.' },
                { icon: '🎓', title: 'Profesores de conservatorio', description: 'Docentes como Pedro Pagliai (Universidad de Chile), hoy enseñando desde Australia. Formación académica real.' },
                { icon: '⚡', title: 'Tecnología MIDI', description: 'Tu profesor ve cada nota que tocas en tiempo real. No es Zoom, no son videos. Es como tenerlo sentado a tu lado.' }
            ],
            testimonials: [],
            faq: [
                { question: '¿Qué es PianoLink?', answer: 'Un marketplace de clases de piano online 1 a 1 con tecnología MIDI. Un profesor real te enseña en vivo, viendo exactamente qué teclas tocas.' },
                { question: '¿Necesito un piano o teclado?', answer: 'Sí, necesitas un teclado con conexión MIDI (USB). En la asesoría técnica te orientamos según tu presupuesto.' },
                { question: '¿Qué incluye el Kit de Bienvenida?', answer: 'Asesoría técnica personalizada, videollamada de setup, tu primera clase real de 30 minutos con profesor certificado, 3 cupones de 15% OFF y garantía de 30 días.' },
                { question: '¿Por qué solo 88 cupos?', answer: 'Para garantizar atención de calidad. Cada estudiante estará 1 a 1 con un profesor. Sin masificar.' }
            ],
            form: {
                fields: [
                    { name: 'name', type: 'text', label: '¿Cómo te llamas?', required: true, placeholder: 'Tu nombre' },
                    { name: 'email', type: 'email', label: '¿A qué email te enviamos el link?', required: true, placeholder: 'tu@email.com' }
                ],
                submitText: '🎹 Reservar mi lugar gratis',
                successMessage: '¡Listo! Te avisamos pronto. Revisa tu email para la confirmación.',
                redirectUrl: ''
            },
            footer: {
                text: '© 2026 PianoLink · Fundado por Miguel Antonio',
                links: [{ label: 'hola@pianolink.net', url: 'mailto:hola@pianolink.net' }]
            },
            branding: { primaryColor: '#c9a84c', logoUrl: 'https://pianolink.net/logo.png', fontFamily: 'Georgia' }
        },
        seo: {
            title: 'Lista de Espera — PianoLink Día 88',
            description: 'Reserva tu lugar para el lanzamiento de PianoLink el 29 de marzo. Solo 88 cupos. Precio madrugador $29 USD.',
            ogImage: 'https://images.unsplash.com/photo-1520523839897-bd0b52f945a0?q=80&w=1200&auto=format&fit=crop'
        },
        utmParams: { source: 'waitlist', medium: 'landing', campaign: 'dia88' },
        metrics: { views: 0, uniqueVisitors: 0, formStarts: 0, formSubmissions: 0 }
    });

    await waitlistLanding.save();
    console.log('✅ Landing waitlist creada → /l/waitlist');
    return waitlistLanding;
}

// ════════════════════════════════════════════
// SEED: 11 CAMPAÑAS DE EMAIL
// ════════════════════════════════════════════
async function seedEmailCampaigns() {
    console.log('\n📧 Creando campañas de email (9 secuencia + 2 adicionales)...');

    // Limpiar campañas anteriores (nombres nuevos y viejos)
    await CrmEmailCampaign.deleteMany({
        $or: [
            { nombre: { $regex: /^Email (1|2|3|4|5|6|7|8|9|10|Carrito)/ } },
            { nombre: { $regex: /^Campaña Día 88/ } }
        ]
    });

    const campaigns = [];

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // EMAIL 1 — Bienvenida + Oferta Madrugadores
    // RELATIVO | Inmediato | CORTO (~1000 chars, sin desglose Kit)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    campaigns.push(new CrmEmailCampaign({
        nombre: 'Email 1 - Bienvenida Madrugadores',
        asunto: '{{nombre}}, tu lugar en la lista está reservado 🎹',
        previewText: 'Tienes acceso a un precio que nadie más va a ver.',
        tipo: 'secuencia',
        modoEnvio: 'relativo',
        ordenSecuencia: 1,
        diasDespuesRegistro: 0,
        fechaLimiteEntrada: null,
        estado: 'borrador',
        contenidoHtml: emailTemplate(`
  <tr><td style="padding:48px 48px 32px;">
    <h1 style="${sH1}">Bienvenido a PianoLink, {{nombre}}.</h1>
    <p style="${sP}">Acabas de dar el primer paso. Y quiero que sepas que no es un paso cualquiera.</p>
    <p style="${sP}">PianoLink es algo que no existe en ningún otro lugar: clases de piano 1 a 1, online, donde tu profesor ve <em>exactamente</em> cada nota que tocas gracias a tecnología MIDI. No es Zoom. No son videos. Es lo más parecido a tener un maestro sentado a tu lado.</p>
    <p style="${sP}">Por estar en esta lista antes que nadie, tienes acceso a un precio que el público general no va a ver: <strong>$29 USD</strong> por tu Kit de Bienvenida completo. Después del 29 de marzo, sube a $44.</p>
    ${ctaBtn(29)}
    <p style="${sPd}"><strong>P.D.</strong> — ¿Por qué $29? ¿Por qué el 29 de marzo? Hay una historia detrás de esos números que no es casualidad. Te la cuento en mi próximo email.</p>
    ${firmaHtml()}
  </td></tr>`),
        notas: 'AUDITORÍA: Corto (~1000 chars), sin desglose del Kit, solo bienvenida emocional + MIDI + precio. Kit completo en Email 5.'
    }));

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // EMAIL 2 — La historia detrás del 29 de marzo
    // RELATIVO | Día +2 | Preview NO spoilea
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    campaigns.push(new CrmEmailCampaign({
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
    <p style="${sP}">El 29 de marzo es el Día Mundial del Piano. Ya solo con eso, era la fecha perfecta para lanzar PianoLink.</p>
    <p style="${sP}">Pero hay más.</p>
    <p style="${sP}">El 29 de marzo es el <strong>día 88 del año</strong>. Y un piano tiene exactamente <strong>88 teclas</strong>.</p>
    <p style="${sP}">Y hay más todavía: el 29 de marzo es mi cumpleaños. 🎂</p>
    <p style="${sP}">Cuando descubrí esa alineación, supe que no podía ignorarla. Así que construí todo alrededor de ese número:</p>
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="${sQuote}">
      <p style="font-size:15px;color:#333;line-height:1.8;margin:0;">
        <strong>88 cupos</strong> — ni uno más, para garantizar atención real.<br>
        <strong>$29</strong> — el precio madrugador lleva tatuada la fecha.<br>
        <strong>$44</strong> — el precio de lanzamiento es la mitad exacta de 88.
      </p>
    </td></tr></table>
    <p style="${sP} margin-top:20px;">Ninguno de estos números es inventado. Todos son reales. Y todos convergen en un solo día.</p>
    <p style="${sP}">Tu precio de $29 existe por esto. Por estar aquí antes del Día 88.</p>
    ${ctaBtn(29)}
    <p style="${sPd}"><strong>P.D.</strong> — En el próximo email te cuento por qué decidí no usar Zoom para las clases. La razón te va a sorprender.</p>
    ${firmaHtml()}
  </td></tr>`),
        notas: 'AUDITORÍA: Preview text corregido — "Te prometí una historia. Aquí va." NO spoilea la numerología.'
    }));

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // EMAIL 3 — Zoom vs MIDI + Pedro Pagliai
    // RELATIVO | Día +4 | Más profundo que Email 1, sin repetir
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    campaigns.push(new CrmEmailCampaign({
        nombre: 'Email 3 - Zoom vs MIDI + Pedro Pagliai',
        asunto: 'Tu profesor de piano no te escucha bien (y no es su culpa)',
        previewText: 'Zoom destruye algo que la tecnología MIDI puede salvar.',
        tipo: 'secuencia',
        modoEnvio: 'relativo',
        ordenSecuencia: 3,
        diasDespuesRegistro: 4,
        fechaLimiteEntrada: new Date('2026-03-23T00:00:00'),
        estado: 'borrador',
        contenidoHtml: emailTemplate(`
  <tr><td style="padding:48px 48px 32px;">
    <h1 style="${sH1}">Tu profesor de piano no te escucha bien (y no es su culpa).</h1>
    <p style="${sP}">{{nombre}}, imagínate esto:</p>
    <p style="${sP}">Estás en tu clase por Zoom. Tocas un pasaje que practicaste toda la semana. Tu profesor dice "suena bien"... pero la verdad es que Zoom comprimió tanto el audio que no pudo distinguir si tu dedo 3 estaba plano o curvo, si tu pedal entró a tiempo, si tu legato fue limpio.</p>
    <p style="${sP}">Es como ir al oftalmólogo por videollamada. Puede conversar contigo, pero no puede medirte la vista.</p>
    <p style="${sP}"><strong>Con MIDI es otra historia.</strong></p>
    <p style="${sP}">Tu profesor ve en su pantalla un mapa exacto de lo que tocaste: qué teclas, con qué velocidad, cuánto duró cada nota. Puede señalarte que en el compás 3 tu pulgar llegó tarde, que el crescendo del final se sintió plano, que ese acorde necesita más peso en la voz superior.</p>
    <p style="${sP}">Es la diferencia entre una foto borrosa y una imagen en 4K.</p>
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="${sQuote}">
      <p style="font-size:15px;color:#333;line-height:1.8;margin:0;">Profesores como <strong>Pedro Pagliai</strong> — formado en la <strong>Universidad de Chile</strong>, donde fue profesor de educación rítmico-auditiva — hoy enseñan desde <strong>Australia</strong> en PianoLink. Eso solo es posible con tecnología MIDI.</p>
    </td></tr></table>
    <p style="${sP} margin-top:20px;">Y lo mejor: no tienes que configurar nada solo. El Kit de Bienvenida incluye una videollamada donde lo hacemos juntos paso a paso.</p>
    ${ctaBtn(29)}
    <p style="${sPd}"><strong>P.D.</strong> — ¿Llevas años diciéndote "algún día"? El próximo email es para ti.</p>
    ${firmaHtml()}
  </td></tr>`),
        notas: 'AUDITORÍA: No repite "ve cada nota" del Email 1 — va más profundo. Incluye perfil de Pedro Pagliai (U. Chile → Australia).'
    }));

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // EMAIL 4 — "Algún día" + José (Escocia)
    // RELATIVO | Día +7
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    campaigns.push(new CrmEmailCampaign({
        nombre: 'Email 4 - Algún día + José Escocia',
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
    <h1 style="${sH1}">¿Cuántos "algún día" más te vas a dar?</h1>
    <p style="${sP}">{{nombre}}, esta pregunta me la hice a mí mismo antes de hacértela a ti.</p>
    <p style="${sP}">A los 4 años le pedí un piano a mis papás para Navidad. No sabía ni cómo sonaba de cerca. Pero algo en mí sabía. Tuve que esperar hasta los 10 para tener un teclado de 3 octavas. Y cuando llegó, lo aproveché cada minuto.</p>
    <p style="${sP}">Sé exactamente cómo se siente ese deseo. Esa vocecita que te dice: <em>"algún día voy a aprender."</em></p>
    <p style="${sP}">Te cuento algo:</p>
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="${sQuote}">
      <p style="font-size:15px;color:#333;line-height:1.8;margin:0;">José llegó con ganas de tocar pero mucho trabajo técnico por delante. Hoy vive en Escocia y toca <strong>Rachmaninov</strong>. No fue magia — fue constancia, una clase a la vez. Su video está publicado en nuestra página.</p>
    </td></tr></table>
    <p style="${sP} margin-top:20px;">La mayoría de nuestros estudiantes tienen entre 28 y 55 años. 30 minutos de práctica diaria son suficientes para ver progreso real. No necesitas ser joven, ni tener talento innato, ni horas libres infinitas.</p>
    <p style="${sP}"><strong>Solo necesitas decidir que hoy es diferente a ayer.</strong></p>
    ${ctaBtn(29)}
    <p style="${sPd}"><strong>P.D.</strong> — En el próximo email te muestro exactamente qué incluye tu Kit de $29. Sin letra chica. Sin adornar.</p>
    ${firmaHtml()}
  </td></tr>`),
        notas: 'AUDITORÍA: Caso real de José (Escocia, Rachmaninov). No es testimonial — es hecho verificable. Video en landing.'
    }));

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // EMAIL 5 — Desglose Kit + Video José
    // RELATIVO | Día +10 | Badge → beneficio tangible
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    campaigns.push(new CrmEmailCampaign({
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
    <h1 style="${sH1}">Lo que incluyen tus $29 (desglose honesto).</h1>
    <p style="${sP}">{{nombre}}, sin letra chica. Todo lo que recibes:</p>
    <table width="100%" cellpadding="0" cellspacing="0" bgcolor="#f5f5f0" style="border-radius:8px;margin:0 0 24px;">
      <tr><td style="padding:28px;">
        <p style="font-size:15px;color:#333;margin:0 0 10px;">✓ &nbsp;<strong>Asesoría técnica personalizada</strong> (~20 min)</p>
        <p style="font-size:13px;color:#666;margin:0 0 16px;padding-left:24px;">Evaluamos tu situación: qué teclado tienes, qué necesitas.</p>
        <p style="font-size:15px;color:#333;margin:0 0 10px;">✓ &nbsp;<strong>Sesión de setup técnico</strong> (~20 min)</p>
        <p style="font-size:13px;color:#666;margin:0 0 16px;padding-left:24px;">Videollamada para configurar tu conexión MIDI juntos.</p>
        <p style="font-size:15px;color:#333;margin:0 0 10px;">✓ &nbsp;<strong>Primera clase real de piano</strong> (30 min)</p>
        <p style="font-size:13px;color:#666;margin:0 0 16px;padding-left:24px;">Con un profesor certificado. Tecnología MIDI en vivo.</p>
        <p style="font-size:15px;color:#333;margin:0 0 10px;">✓ &nbsp;<strong>3 cupones de 15% OFF</strong></p>
        <p style="font-size:13px;color:#666;margin:0 0 16px;padding-left:24px;">Para tus primeras 3 compras en el marketplace (clases desde $15 USD).</p>
        <p style="font-size:15px;color:#333;margin:0 0 10px;">✓ &nbsp;<strong>Acceso anticipado a nuevos profesores</strong></p>
        <p style="font-size:13px;color:#666;margin:0 0 16px;padding-left:24px;">Como miembro fundador, eliges primero.</p>
        <p style="font-size:15px;color:#333;margin:0 0 10px;">✓ &nbsp;<strong>Garantía de 30 días</strong></p>
        <p style="font-size:13px;color:#666;margin:0 0 0;padding-left:24px;">Dinero de vuelta sin preguntas. El riesgo es mío.</p>
      </td></tr>
    </table>
    <p style="${sP}">Una clase presencial en LATAM cuesta $20-40 USD. Por $29 tienes asesoría + setup + clase + descuentos + garantía.</p>
    <p style="${sP}"><strong>El peor escenario:</strong> pides tu dinero de vuelta y quedas como estás. El riesgo es mío, no tuyo.</p>
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="${sQuote}">
      <p style="font-size:15px;color:#333;line-height:1.8;margin:0;">¿Quieres ver cómo suena un estudiante real de PianoLink? José grabó <a href="https://pianolink.net" style="color:#c9a84c;">este video</a> para nosotros. Hoy toca Rachmaninov desde Escocia.</p>
    </td></tr></table>
    ${ctaBtn(29)}
    <p style="${sPd}"><strong>P.D.</strong> — Mi próximo email te va a sorprender por su sinceridad. PianoLink no es para todo el mundo.</p>
    ${firmaHtml()}
  </td></tr>`),
        notas: 'AUDITORÍA: Badge reemplazado por "acceso anticipado a nuevos profesores". Link al video de José. Desglose COMPLETO aquí (no antes).'
    }));

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // EMAIL 6 — Anti-venta + credencial conservatorio
    // RELATIVO | Día +14
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    campaigns.push(new CrmEmailCampaign({
        nombre: 'Email 6 - Anti-venta',
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
    <h1 style="${sH1}">Honestamente, PianoLink no es para todo el mundo.</h1>
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
    <p style="${sP}">Prefiero 88 estudiantes comprometidos que 800 que abandonan el segundo mes.</p>
    ${ctaBtn(29)}
    <p style="${sPd}"><strong>P.D.</strong> — Si decides que sí, la garantía de 30 días te protege igual. Pero quería ser honesto contigo primero.</p>
    ${firmaHtml()}
  </td></tr>`),
        notas: 'AUDITORÍA: Añadida línea "profesores de conservatorio — no cualquier youtuber". Mejor email de la secuencia según auditoría.'
    }));

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // EMAIL 7 — Escasez cupos (BROADCAST DUAL)
    // BROADCAST | 21 de marzo | {{cupos_restantes}} obligatorio
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    campaigns.push(new CrmEmailCampaign({
        nombre: 'Email 7 - Escasez cupos (Broadcast Dual)',
        asunto: 'Quedan {{cupos_restantes}} cupos de 88',
        previewText: 'El 29 de marzo el precio sube. Y al cupo 88, cierra.',
        tipo: 'broadcast',
        modoEnvio: 'fechaFija',
        ordenSecuencia: 7,
        estado: 'borrador',
        fechaProgramada: new Date('2026-03-21T09:00:00'),
        umbralEngagement: 4,
        contenidoHtml: emailTemplate(`
  <tr><td style="padding:48px 48px 32px;">
    <h1 style="${sH1}">Quedan {{cupos_restantes}} cupos de 88.</h1>
    <p style="${sP}">{{nombre}}, PianoLink es un marketplace de clases de piano online 1 a 1 con tecnología MIDI — tu profesor ve cada nota que tocas en tiempo real. No es Zoom, no son videos.</p>
    <p style="${sP}">Solo hay 88 cupos para esta primera tanda. Y esto es lo que cambia el <strong>29 de marzo</strong>:</p>
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="${sQuote}">
      <p style="font-size:15px;color:#333;line-height:1.8;margin:0;">
        <strong>Hoy:</strong> Kit de Bienvenida a $29 (asesoría + setup + clase + garantía 30 días).<br>
        <strong>Desde el 29 de marzo:</strong> Sube a $44.<br>
        <strong>Al cupo 88:</strong> Cierra indefinidamente.
      </p>
    </td></tr></table>
    <p style="${sP} margin-top:20px;">Pedro Pagliai, formado en la Universidad de Chile, hoy enseña desde Australia en PianoLink. José empezó desde la técnica básica — hoy toca Rachmaninov desde Escocia. Su video está en nuestra página.</p>
    ${ctaBtn(29)}
    <p style="${sPd}"><strong>P.D.</strong> — Quedan {{cupos_restantes}} de 88. No es una frase de marketing — es un número real.</p>
    ${firmaHtml()}
  </td></tr>`),
        contenidoHtmlActivos: emailTemplate(`
  <tr><td style="padding:48px 48px 32px;">
    <h1 style="${sH1}">Quedan {{cupos_restantes}} de 88.</h1>
    <p style="${sP}">{{nombre}}, ya sabes lo que es PianoLink. Ya sabes que el precio sube el 29 de marzo.</p>
    <p style="${sP}">Lo que quizás no sabías: José empezó desde la técnica básica y hoy toca Rachmaninov desde Escocia. Pedro Pagliai, formado en la Universidad de Chile, enseña desde Australia.</p>
    <p style="${sP}"><strong>Quedan {{cupos_restantes}} cupos. Al 88, cierra.</strong></p>
    ${ctaBtn(29)}
    <p style="${sPd}"><strong>P.D.</strong> — El número es real y baja con cada compra.</p>
    ${firmaHtml()}
  </td></tr>`),
        notas: 'AUDITORÍA: Broadcast dual. {{cupos_restantes}} dinámico. Prueba social (Pedro + José). NO repite desglose Kit ni MIDI extendido.'
    }));

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // EMAIL 8 — En 48 horas sube (BROADCAST DUAL)
    // BROADCAST | 27 de marzo | CORTO, fix temporal
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    campaigns.push(new CrmEmailCampaign({
        nombre: 'Email 8 - En 48 horas sube (Broadcast Dual)',
        asunto: 'En 48 horas tu Kit pasa de $29 a $44',
        previewText: 'Son $15 reales que se pierden pasado mañana.',
        tipo: 'broadcast',
        modoEnvio: 'fechaFija',
        ordenSecuencia: 8,
        estado: 'borrador',
        fechaProgramada: new Date('2026-03-27T09:00:00'),
        umbralEngagement: 4,
        contenidoHtml: emailTemplate(`
  <tr><td style="padding:48px 48px 32px;">
    <h1 style="${sH1}">En 48 horas tu Kit pasa de $29 a $44.</h1>
    <p style="${sP}">{{nombre}}, PianoLink es clases de piano online 1 a 1 con tecnología MIDI — tu profesor ve cada nota que tocas. No es Zoom.</p>
    <p style="${sP}">El Kit de Bienvenida incluye asesoría + setup + clase real + garantía 30 días. Hoy cuesta $29. El 29 de marzo sube a $44. Son $15 reales.</p>
    <p style="${sP}"><strong>¿Todavía no te has dado el sí?</strong></p>
    ${ctaBtn(29)}
    <p style="${sPd}"><strong>P.D.</strong> — La garantía de 30 días sigue. El riesgo es mío.</p>
    ${firmaHtml()}
  </td></tr>`),
        contenidoHtmlActivos: emailTemplate(`
  <tr><td style="padding:48px 48px 32px;">
    <h1 style="${sH1}">En 48 horas sube a $44.</h1>
    <p style="${sP}">{{nombre}}, son $15 reales que se pierden el 29 de marzo.</p>
    <p style="${sP}"><strong>¿Todavía no te has dado el sí?</strong></p>
    ${ctaBtn(29)}
    <p style="${sPd}"><strong>P.D.</strong> — Garantía 30 días. El riesgo es mío, no tuyo.</p>
    ${firmaHtml()}
  </td></tr>`),
        notas: 'AUDITORÍA: Fix temporal "48 horas" (se envía el 27, sube el 29). Versión activos ultra-corta. NO repite MIDI ni Kit.'
    }));

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // EMAIL 9 — Día 88 (BROADCAST DUAL)
    // BROADCAST | 29 de marzo 8:00 AM | Deadline concreto, 2 CTAs
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    campaigns.push(new CrmEmailCampaign({
        nombre: 'Email 9 - Día 88 Lanzamiento (Broadcast Dual)',
        asunto: '🎹 Hoy es el Día 88 — PianoLink está abierto',
        previewText: 'Día Mundial del Piano. Quedan pocos cupos.',
        tipo: 'broadcast',
        modoEnvio: 'fechaFija',
        ordenSecuencia: 9,
        estado: 'borrador',
        fechaProgramada: new Date('2026-03-29T08:00:00'),
        umbralEngagement: 4,
        contenidoHtml: emailTemplate(`
  <tr><td style="padding:48px 48px 32px; text-align:center;">
    <p style="color:#c9a84c;font-size:12px;letter-spacing:3px;text-transform:uppercase;margin:0 0 16px;">DÍA 88 · 29 DE MARZO DE 2026</p>
    <h1 style="font-family:Georgia,serif;font-size:36px;color:#0a0a0a;margin:0 0 16px;line-height:1.2;">Hoy abre PianoLink.</h1>
    <p style="font-size:18px;color:#666;margin:0 0 28px;">Día Mundial del Piano. Día 88 del año. Lanzamiento oficial.</p>
    <a href="https://pianolink.net/oferta-madrugadores" style="${sCta}">Quiero mi Kit — $44</a>
  </td></tr>
  <tr><td style="padding:0 48px 32px;">
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="${sSep}"></td></tr></table>
    <p style="${sP}">{{nombre}}, PianoLink es clases de piano online 1 a 1 con tecnología MIDI — tu profesor ve cada nota que tocas en tiempo real. No es Zoom, no son videos.</p>
    <p style="${sP}">El Kit de Bienvenida cuesta <strong>$44 USD</strong> (la mitad exacta de 88 teclas) e incluye asesoría técnica, setup por videollamada, tu primera clase real de 30 minutos, 3 cupones de 15% OFF y garantía de 30 días.</p>
    <p style="${sP}">Profesores como Pedro Pagliai (Universidad de Chile) te esperan. José ya está tocando Rachmaninov desde Escocia — su video está en nuestra página.</p>
    <p style="${sP}"><strong>Quedan {{cupos_restantes}} de 88 cupos. La inscripción del Día 88 cierra hoy a las 11:59 PM.</strong></p>
    ${ctaBtn(44)}
    <p style="${sPd}"><strong>P.D.</strong> — Garantía de 30 días. Si no ves progreso, dinero de vuelta. El riesgo es mío.</p>
    ${firmaHtml()}
  </td></tr>`),
        contenidoHtmlActivos: emailTemplate(`
  <tr><td style="padding:48px 48px 32px; text-align:center;">
    <p style="color:#c9a84c;font-size:12px;letter-spacing:3px;text-transform:uppercase;margin:0 0 16px;">DÍA 88 · 29 DE MARZO DE 2026</p>
    <h1 style="font-family:Georgia,serif;font-size:36px;color:#0a0a0a;margin:0 0 16px;line-height:1.2;">Hoy es el día, {{nombre}}.</h1>
    <p style="font-size:18px;color:#666;margin:0 0 28px;">Quedan {{cupos_restantes}} de 88 cupos.</p>
    <a href="https://pianolink.net/oferta-madrugadores" style="${sCta}">Quiero mi Kit — $44</a>
  </td></tr>
  <tr><td style="padding:0 48px 32px;">
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="${sSep}"></td></tr></table>
    <p style="${sP}">El precio hoy es $44 USD. La inscripción del Día 88 cierra a las <strong>11:59 PM de hoy</strong>.</p>
    <p style="${sP}">José ya está tocando Rachmaninov desde Escocia. Pedro Pagliai enseña desde Australia. Tu lugar está esperando.</p>
    ${ctaBtn(44)}
    <p style="${sPd}"><strong>P.D.</strong> — Garantía 30 días. Hoy o nunca — literalmente.</p>
    ${firmaHtml()}
  </td></tr>`),
        notas: 'AUDITORÍA: Deadline "11:59 PM de hoy". 2 CTAs (inicio y final). Prueba social final (Pedro + José). Versión fríos autocontenida.'
    }));

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // CARRITO ABANDONADO (TRIGGER)
    // 1h después de click sin pago completado
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    campaigns.push(new CrmEmailCampaign({
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
    <p style="${sP}">¿Necesitas ayuda con algo? ¿Tienes alguna duda sobre el setup, la tecnología MIDI o los horarios disponibles?</p>
    <p style="${sP}"><strong>Respóndeme directamente a este email</strong> — lo leo yo, Miguel. No es un bot, no es un equipo de soporte. Soy yo.</p>
    <p style="${sP}">Si simplemente se te pasó el momento, aquí está el link:</p>
    ${ctaBtn(29)}
    <p style="${sPd}"><strong>P.D.</strong> — No hay presión. Pero si tienes preguntas, pregúntame antes de que el precio cambie.</p>
    ${firmaHtml()}
  </td></tr>`),
        notas: 'AUDITORÍA: Gap más costoso del funnel. Lead con mayor intención de compra. Tono suave, personal. Recupera 5-15% de ventas.'
    }));

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // EMAIL 10 — Post-cierre (para no compradores)
    // BROADCAST | Después de completar 88 cupos
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    campaigns.push(new CrmEmailCampaign({
        nombre: 'Email 10 - Post-cierre no compradores',
        asunto: 'Los 88 cupos se completaron',
        previewText: 'Gracias por haber sido parte de la lista.',
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
    <p style="${sP}">Si quieres ser el primero en saber cuando abramos nuevos cupos, <strong>mantente en esta lista</strong>. No sé cuándo será, pero serás el primero en saberlo.</p>
    <p style="${sPd}"><strong>P.D.</strong> — Mientras tanto, el video de José tocando Rachmaninov sigue en <a href="https://pianolink.net" style="color:#c9a84c;">pianolink.net</a>. Échale un vistazo. Vale la pena.</p>
    ${firmaHtml()}
  </td></tr>`),
        notas: 'AUDITORÍA: Mantiene canal abierto. Valida escasez retroactivamente. Próxima apertura, el lead actúa más rápido.'
    }));

    // Guardar todas
    for (const campaign of campaigns) {
        await campaign.save();
        console.log(`✅ ${campaign.nombre} creada`);
    }

    return campaigns;
}

// === EJECUTAR SEEDS ===
async function runSeeds() {
    console.log('🌱 Iniciando seeds de Lanzamiento Día 88...\n');

    await connectDB();

    try {
        await seedWaitlistLanding();
        await seedEmailCampaigns();

        console.log('\n✅ Seeds completados exitosamente');
        console.log('\n📋 Resumen:');
        console.log('   - Landing waitlist: /l/waitlist');
        console.log('   - 6 emails RELATIVOS (secuencia nurturing)');
        console.log('   - 3 emails BROADCAST con versión dual (activos/fríos)');
        console.log('   - 1 email TRIGGER (carrito abandonado)');
        console.log('   - 1 email BROADCAST post-cierre');
        console.log('\n📊 Correcciones de auditoría aplicadas:');
        console.log('   - CTA unificado: "Quiero mi Kit — $29/$44"');
        console.log('   - Prueba social: Pedro Pagliai + José (Escocia)');
        console.log('   - {{cupos_restantes}} dinámico en broadcasts');
        console.log('   - Email 1 corto (sin desglose Kit)');
        console.log('   - Email 8 corto + fix temporal "48 horas"');
        console.log('   - Email 9 con deadline "11:59 PM"');
        console.log('   - Broadcasts duales por engagement');

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

module.exports = { seedWaitlistLanding, seedEmailCampaigns };
