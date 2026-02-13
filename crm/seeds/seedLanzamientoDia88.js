/**
 * crm/seeds/seedLanzamientoDia88.js
 * 
 * Seeds para el lanzamiento del Día 88 (29 de marzo de 2026):
 * - Landing de waitlist con countdown
 * - 3 campañas de email marketing
 * 
 * Ejecutar: node crm/seeds/seedLanzamientoDia88.js
 * 
 * COMPLETADO: Seeds de lanzamiento para PianoLink
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

// === SEED: LANDING WAITLIST DÍA 88 ===
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
                subheadline: 'Solo 88 cupos disponibles. Clases de piano 1 a 1 online con tecnología MIDI profesional. Aprende desde casa con profesores certificados.',
                ctaText: '🎹 Quiero mi lugar (Gratis)',
                ctaColor: '#c9a84c',
                backgroundImage: 'https://images.unsplash.com/photo-1525201548942-d8732f6617a0?q=80&w=1920&auto=format&fit=crop',
                videoUrl: ''
            },
            
            benefits: [
                {
                    icon: '🎯',
                    title: 'Edición Limitada',
                    description: 'Solo 88 lugares disponibles por el Día 88. Cupos limitados para garantizar calidad y atención personalizada.'
                },
                {
                    icon: '💰',
                    title: 'Precio Especial: $44',
                    description: 'Kit de Bienvenida con 50% de descuento. Incluye asesoría técnica, setup y tu primera clase. Precio normal: $90 USD.'
                },
                {
                    icon: '🎁',
                    title: 'Bonus Exclusivo',
                    description: '15% de descuento adicional en tus primeras 3 compras por registrarte en la lista de espera.'
                },
                {
                    icon: '⚡',
                    title: 'Acceso VIP',
                    description: 'Recibes el link de acceso 24 horas antes que el público general. Lanzamiento: 29 marzo, 9:00 AM.'
                }
            ],
            
            testimonials: [],
            
            faq: [
                {
                    question: '¿Qué es PianoLink?',
                    answer: 'PianoLink es un marketplace de clases de piano online 1 a 1 con tecnología MIDI. Un profesor real te enseña en vivo, viendo exactamente qué teclas tocas.'
                },
                {
                    question: '¿Necesito un piano o teclado?',
                    answer: 'Sí, necesitas un teclado con conexión MIDI (USB) a tu computadora. En la asesoría técnica te orientamos según tu presupuesto.'
                },
                {
                    question: '¿Qué incluye el Kit de Bienvenida?',
                    answer: 'Asesoría técnica personalizada, videollamada de setup para configurar tu equipo, y tu primera clase real de 30 minutos con profesor certificado.'
                },
                {
                    question: '¿Por qué solo 88 cupos?',
                    answer: 'Para garantizar atención de calidad. Cada estudiante nuevo estará 1 a 1 con un profesor. Sin masificar.'
                }
            ],
            
            form: {
                fields: [
                    { name: 'name', type: 'text', label: '¿Cómo te llamas?', required: true, placeholder: 'Tu nombre' },
                    { name: 'email', type: 'email', label: '¿A qué email te enviamos el link?', required: true, placeholder: 'tu@email.com' }
                ],
                submitText: '🎹 Reservar mi lugar gratis',
                successMessage: '¡Listo! Te avisamos el 29 de marzo. Revisa tu email para la confirmación.',
                redirectUrl: ''
            },
            
            footer: {
                text: '© 2026 PianoLink · Fundado por Miguel Antonio',
                links: [
                    { label: 'hola@pianolink.pro', url: 'mailto:hola@pianolink.pro' }
                ]
            },
            
            branding: {
                primaryColor: '#c9a84c',
                logoUrl: 'https://pianolink.net/logo.png',
                fontFamily: 'Georgia'
            }
        },
        
        seo: {
            title: 'Lista de Espera — PianoLink Día 88',
            description: 'Reserva tu lugar para el lanzamiento de PianoLink el 29 de marzo. Solo 88 cupos a $44 USD. Clases de piano online 1 a 1 con tecnología MIDI.',
            ogImage: 'https://images.unsplash.com/photo-1525201548942-d8732f6617a0?q=80&w=1200&auto=format&fit=crop'
        },
        
        utmParams: {
            source: 'waitlist',
            medium: 'landing',
            campaign: 'dia88'
        },
        
        metrics: {
            views: 0,
            uniqueVisitors: 0,
            formStarts: 0,
            formSubmissions: 0
        }
    });

    await waitlistLanding.save();
    console.log('✅ Landing waitlist creada → /l/waitlist');
    return waitlistLanding;
}

// === SEED: CAMPAÑAS DE EMAIL ===
async function seedEmailCampaigns() {
    console.log('\n📧 Creando campañas de email...');

    // Eliminar campañas existentes de la secuencia
    await CrmEmailCampaign.deleteMany({ 
        tipo: { $in: ['secuencia', 'broadcast'] },
        nombre: { $regex: /^Email [1-3]/ }
    });

    // === CAMPAÑA 1: Historia de Miguel ===
    const campaign1 = new CrmEmailCampaign({
        nombre: 'Email 1 - Historia de Miguel',
        asunto: 'A los 4 años pedí un piano para Navidad 🎹',
        previewText: 'Esta es mi historia. Quizás también sea la tuya.',
        tipo: 'secuencia',
        ordenSecuencia: 1,
        estado: 'borrador',
        contenidoHtml: `<!DOCTYPE html>
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
    <h1 style="font-family:Georgia,serif;font-size:28px;color:#0a0a0a;margin:0 0 28px;line-height:1.3;">A los 4 años le pedí un piano a mis papás para Navidad.</h1>
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 20px;">Hola {{nombre}},</p>
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 20px;">No sabía ni cómo sonaba de cerca. Pero algo en mí sabía que ese instrumento iba a ser parte de mi vida.</p>
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 20px;">A los 10 años llegó: un teclado de 3 octavas. Pasaba horas explorando cada tecla, inventando melodías. Fue amor a primera nota.</p>
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 20px;">Estudié en el conservatorio, aprendí técnica clásica, pero mi alma siempre quiso algo más. Encontré mi voz en la música latinoamericana.</p>
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 20px;">En 2013, cuando supe que venía mi hija Aurora, abrí mi propia escuela de piano: Resonancias. Duró más de 10 años. A veces los sueños necesitan transformarse.</p>
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 32px;">Un día Aurora me dijo: "Papá, quiero una casa con jardín." Del dolor de cerrar Resonancias nació PianoLink. Porque la creatividad siempre encuentra un camino.</p>
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="border-top:2px solid #c9a84c;padding-bottom:32px;"></td></tr></table>
    <p style="font-size:18px;color:#0a0a0a;line-height:1.8;margin:0 0 20px;font-style:italic;">Si tú también tienes una vocecita que te dice "algún día voy a aprender piano"... te cuento algo pronto. Algo que construí pensando exactamente en ti.</p>
    <p style="font-size:16px;color:#333;margin:0;">Miguel Antonio<br><span style="color:#c9a84c;">Fundador, PianoLink</span></p>
  </td></tr>
  <tr><td bgcolor="#0a0a0a" style="padding:24px 48px;" align="center">
    <p style="color:#888;font-size:12px;margin:0 0 8px;">El 29 de marzo abre PianoLink. Solo 88 cupos.</p>
    <p style="margin:0;"><a href="{{unsubscribe_url}}" style="color:#666;font-size:11px;">Cancelar suscripción</a></p>
    <p style="color:#555;font-size:11px;margin:8px 0 0;">© 2026 PianoLink · hola@pianolink.pro</p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`
    });
    await campaign1.save();
    console.log('✅ Campaña 1 creada: Historia de Miguel');

    // === CAMPAÑA 2: Revelación del Producto ===
    const campaign2 = new CrmEmailCampaign({
        nombre: 'Email 2 - Revelación PianoLink',
        asunto: '¿Por qué el 29 de marzo es diferente? 🎹',
        previewText: 'Te cuento qué estamos abriendo y por qué cambió todo.',
        tipo: 'secuencia',
        ordenSecuencia: 2,
        estado: 'borrador',
        fechaProgramada: new Date('2026-03-19T09:00:00'),
        contenidoHtml: `<!DOCTYPE html>
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
    <p style="font-size:13px;color:#c9a84c;letter-spacing:2px;text-transform:uppercase;margin:0 0 12px;">Ya casi llega</p>
    <h1 style="font-family:Georgia,serif;font-size:28px;color:#0a0a0a;margin:0 0 12px;line-height:1.3;">El 29 de marzo abre PianoLink.</h1>
    <p style="font-size:18px;color:#666;margin:0 0 36px;">Y quería contarte exactamente qué es, antes que nadie.</p>
    <h2 style="font-size:20px;color:#0a0a0a;margin:0 0 16px;">Clases de piano 1 a 1, online, con un profesor real</h2>
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 32px;">No es una app. No son videos pregrabados. Es un profesor certificado que te ve, te escucha y te corrige en tiempo real — desde tu casa, sin traslados, en el horario que tú elijas.</p>
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr><td style="border-left:4px solid #c9a84c;background:#f5f5f0;padding:24px 28px;border-radius:0 8px 8px 0;">
        <h3 style="font-size:18px;color:#0a0a0a;margin:0 0 12px;">¿Por qué no simplemente Zoom?</h3>
        <p style="font-size:15px;color:#333;line-height:1.8;margin:0;">Zoom comprime el audio. Pierde los matices. Con PianoLink usamos tecnología MIDI: tu teclado se conecta directamente a tu computadora, y tu profesor ve en su pantalla exactamente qué teclas presionas, con qué fuerza, en tiempo real.<br><br>Es la diferencia entre que te digan "sonó bien" y que te corrijan exactamente en la nota 4 del compás 2.</p>
      </td></tr>
    </table>
    <div style="margin-top:32px;"></div>
    <h2 style="font-size:20px;color:#0a0a0a;margin:0 0 16px;">¿Por qué el 29 de marzo?</h2>
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 32px;">El 29 de marzo es el día 88 del año. El piano tiene 88 teclas. Y también es mi cumpleaños 🎂<br><br>Abrimos solo 88 cupos para garantizar que cada nuevo estudiante tenga atención real de su profesor. Sin masificar. Sin perder calidad.</p>
    <table width="100%" cellpadding="0" cellspacing="0" bgcolor="#0a0a0a" style="border-radius:8px;">
      <tr><td style="padding:32px;text-align:center;">
        <p style="color:#c9a84c;font-size:13px;letter-spacing:2px;text-transform:uppercase;margin:0 0 8px;">Kit de Bienvenida PianoLink</p>
        <p style="color:#ffffff;font-size:24px;font-family:Georgia,serif;margin:0 0 20px;">$44 USD <span style="text-decoration:line-through;color:#666;font-size:16px;">$90</span></p>
        <table cellpadding="0" cellspacing="0" align="center"><tr><td>
          <p style="color:#888;font-size:14px;text-align:left;margin:0 0 6px;">✓ Asesoría técnica personalizada</p>
          <p style="color:#888;font-size:14px;text-align:left;margin:0 0 6px;">✓ Setup de tu teclado por videollamada</p>
          <p style="color:#888;font-size:14px;text-align:left;margin:0 0 6px;">✓ Primera clase real de 30 min</p>
          <p style="color:#888;font-size:14px;text-align:left;margin:0 0 20px;">✓ Garantía de devolución 30 días</p>
        </td></tr></table>
        <a href="https://pianolink.net" style="background:#c9a84c;color:#0a0a0a;text-decoration:none;padding:14px 32px;border-radius:4px;font-size:16px;font-weight:bold;display:inline-block;">Ver todo sobre el Kit →</a>
      </td></tr>
    </table>
    <div style="margin-top:32px;"></div>
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0;">Si ya estás en esta lista, tienes acceso antes que nadie. El 29 de marzo a las 9:00 AM te escribo con el link directo.<br><br>Nos vemos pronto,<br><strong>Miguel Antonio</strong><br><span style="color:#c9a84c;">Fundador, PianoLink</span></p>
  </td></tr>
  <tr><td bgcolor="#0a0a0a" style="padding:24px 48px;" align="center">
    <p style="color:#888;font-size:12px;margin:0 0 8px;">El 29 de marzo abre PianoLink. Solo 88 cupos.</p>
    <p style="margin:0;"><a href="{{unsubscribe_url}}" style="color:#666;font-size:11px;">Cancelar suscripción</a></p>
    <p style="color:#555;font-size:11px;margin:8px 0 0;">© 2026 PianoLink · hola@pianolink.pro</p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`
    });
    await campaign2.save();
    console.log('✅ Campaña 2 creada: Revelación PianoLink');

    // === CAMPAÑA 3: Lanzamiento Día 88 ===
    const campaign3 = new CrmEmailCampaign({
        nombre: 'Email 3 - Lanzamiento Día 88',
        asunto: '🎹 Hoy abre PianoLink — 88 cupos',
        previewText: 'El Día 88 llegó. Tu lugar está esperando.',
        tipo: 'broadcast',
        estado: 'borrador',
        fechaProgramada: new Date('2026-03-29T09:00:00'),
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
  <tr><td bgcolor="#0a0a0a" style="padding:48px 48px 40px;text-align:center;">
    <p style="color:#c9a84c;font-size:12px;letter-spacing:3px;text-transform:uppercase;margin:0 0 16px;">DÍA 88 · 29 DE MARZO DE 2026</p>
    <h1 style="font-family:Georgia,serif;font-size:40px;color:#ffffff;margin:0 0 16px;line-height:1.2;">Hoy abre PianoLink.</h1>
    <p style="font-size:20px;color:#c9a84c;margin:0 0 36px;">Tu sueño de tocar piano empieza hoy.</p>
    <a href="https://pianolink.net/welcome-kit" style="background:#c9a84c;color:#0a0a0a;text-decoration:none;padding:18px 40px;border-radius:4px;font-size:18px;font-weight:bold;display:inline-block;">🎹 Reservar mi cupo ahora</a>
  </td></tr>
  <tr><td bgcolor="#ffffff" style="padding:20px 48px;text-align:center;">
    <p style="color:#c0392b;font-size:16px;font-weight:bold;margin:0;">⚠️ Solo 88 cupos disponibles. Sin excepciones.</p>
  </td></tr>
  <tr><td bgcolor="#ffffff" style="padding:32px 48px;">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td width="33%" style="text-align:center;padding:16px 8px;"><p style="font-size:24px;margin:0 0 8px;">🎯</p><p style="font-size:14px;font-weight:bold;color:#0a0a0a;margin:0 0 4px;">Solo 88 cupos</p><p style="font-size:12px;color:#666;margin:0;">Cierra cuando se agoten</p></td>
      <td width="33%" style="text-align:center;padding:16px 8px;"><p style="font-size:24px;margin:0 0 8px;">⭐</p><p style="font-size:14px;font-weight:bold;color:#0a0a0a;margin:0 0 4px;">$44 USD</p><p style="font-size:12px;color:#666;margin:0;">Normal $90</p></td>
      <td width="33%" style="text-align:center;padding:16px 8px;"><p style="font-size:24px;margin:0 0 8px;">🛡️</p><p style="font-size:14px;font-weight:bold;color:#0a0a0a;margin:0 0 4px;">Garantía 30 días</p><p style="font-size:12px;color:#666;margin:0;">Devolución total</p></td>
    </tr></table>
  </td></tr>
  <tr><td bgcolor="#ffffff" style="padding:0 48px 32px;">
    <h2 style="font-size:20px;color:#0a0a0a;margin:0 0 16px;">¿Qué incluye tu Kit de Bienvenida?</h2>
    <p style="font-size:15px;color:#333;margin:0 0 8px;">✓ &nbsp;Asesoría técnica personalizada</p>
    <p style="font-size:15px;color:#333;margin:0 0 8px;">✓ &nbsp;Videollamada de setup — configuramos todo juntos</p>
    <p style="font-size:15px;color:#333;margin:0 0 8px;">✓ &nbsp;Primera clase real de 30 min con profesor certificado</p>
    <p style="font-size:15px;color:#333;margin:0 0 8px;">✓ &nbsp;<strong>15% OFF en tus primeras 3 compras</strong> (exclusivo lista)</p>
    <p style="font-size:15px;color:#333;margin:0 0 8px;">✓ &nbsp;Badge "Miembro Fundador" permanente</p>
    <p style="font-size:15px;color:#333;margin:0 0 24px;">✓ &nbsp;Garantía de devolución completa a 30 días</p>
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
      <a href="https://pianolink.net/welcome-kit" style="background:#c9a84c;color:#0a0a0a;text-decoration:none;padding:16px 40px;border-radius:4px;font-size:18px;font-weight:bold;display:inline-block;">🎹 Quiero mi cupo — $44 USD</a>
    </td></tr></table>
  </td></tr>
  <tr><td bgcolor="#f5f5f0" style="padding:32px 48px;">
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 16px;">Hola {{nombre}},</p>
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 16px;">Llegó el día. Hace meses que trabajo en esto pensando en personas como tú — las que siempre quisieron aprender piano y por alguna razón lo fueron postergando.</p>
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 16px;">Hoy no hay excusas. Desde tu casa, con un profesor real, con tecnología que hace que la clase online se sienta mejor que muchas presenciales.</p>
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 16px;">Si los 88 cupos se agotan hoy, el precio del kit sube a $59 y pierdes el 15% OFF. Te lo digo porque quiero que aproveches lo que construí para ti.</p>
    <p style="font-size:16px;color:#333;margin:0;">Con cariño,<br><strong>Miguel Antonio</strong><br><span style="color:#c9a84c;">Fundador, PianoLink</span></p>
  </td></tr>
  <tr><td bgcolor="#0a0a0a" style="padding:24px 48px;text-align:center;">
    <p style="color:#888;font-size:13px;margin:0 0 12px;">Este precio especial cierra cuando se agoten los 88 cupos.</p>
    <a href="https://pianolink.net/welcome-kit" style="color:#c9a84c;font-size:14px;text-decoration:none;">Reservar ahora →</a>
    <p style="margin:16px 0 0;"><a href="{{unsubscribe_url}}" style="color:#555;font-size:11px;">Cancelar suscripción</a></p>
    <p style="color:#555;font-size:11px;margin:8px 0 0;">© 2026 PianoLink · hola@pianolink.pro</p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`
    });
    await campaign3.save();
    console.log('✅ Campaña 3 creada: Lanzamiento Día 88');

    return [campaign1, campaign2, campaign3];
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
        console.log('   - 3 campañas de email en borrador');
        console.log('\n🔗 Accede al CRM para editar las campañas.');
        
    } catch (error) {
        console.error('\n❌ Error en seeds:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\n🔌 Desconectado de MongoDB');
    }
}

// Ejecutar si se llama directamente
if (require.main === module) {
    runSeeds();
}

module.exports = { seedWaitlistLanding, seedEmailCampaigns };
