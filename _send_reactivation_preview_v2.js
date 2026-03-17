require('dotenv').config();
const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);

const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f5f0;font-family:Georgia,serif;">
<table width="100%" cellpadding="0" cellspacing="0" bgcolor="#f5f5f0"><tr><td align="center" style="padding:30px 20px;">
<table width="600" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
  <tr><td bgcolor="#0a0a0a" align="center" style="padding:28px 40px;">
    <span style="font-family:Georgia,serif;font-size:22px;color:#c9a84c;letter-spacing:2px;">🎹 PianoLink</span>
  </td></tr>
  <tr><td style="padding:48px 48px 32px;">
    <h1 style="font-family:Georgia,serif;font-size:28px;color:#0a0a0a;margin:0 0 28px;line-height:1.3;">Miguel, ¿sigues pensando en el piano?</h1>
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 20px;">Soy Miguel Antonio, fundador de <strong>Resonancias</strong> — una escuela de música donde hemos formado a cientos de alumnos en piano, guitarra y canto durante los últimos años.</p>
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 20px;">Creé <strong>PianoLink</strong> porque quería llevar esa misma experiencia a personas que no pueden asistir a una escuela presencial. Es una plataforma de clases de piano online 1 a 1 con profesores reales y tecnología MIDI: tu profesor ve en tiempo real qué teclas tocas. Es como tenerlo al lado.</p>
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 20px;">Hace un tiempo dejaste tus datos. La vida se pone en medio, lo entiendo. Pero si esa idea sigue ahí — aunque sea en algún rincón — quiero que sepas que <strong>seguimos aquí para ti</strong>.</p>
    <div style="border-left:4px solid #c9a84c;background:#f5f5f0;padding:20px 24px;border-radius:0 8px 8px 0;">
      <p style="font-size:16px;color:#333;margin:0;line-height:1.7;">Nuestro <strong>Kit de Bienvenida ($44 USD)</strong> incluye:</p>
      <ul style="font-size:15px;color:#333;line-height:1.8;margin:10px 0 0;">
        <li>Tu <strong>cable MIDI de regalo</strong> (lo enviamos a tu casa)</li>
        <li>Asesoría personalizada para elegir tu teclado ideal</li>
        <li>Setup guiado por videollamada</li>
        <li>Tu primera clase de prueba con un profesor real</li>
      </ul>
    </div>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0;"><tr><td align="center"><a href="https://pianolink.net/comenzar" style="background:#c9a84c;color:#0a0a0a;text-decoration:none;padding:16px 40px;border-radius:4px;font-size:16px;font-weight:bold;display:inline-block;">Ver cómo funciona</a></td></tr></table>
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 20px;">Si tienes dudas, puedes escribirle a <strong>Mía</strong>, nuestra asesora, por WhatsApp:</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0;"><tr><td align="center"><a href="https://wa.me/15703788455?text=Hola%20M%C3%ADa" style="background:#25D366;color:#ffffff;text-decoration:none;padding:16px 40px;border-radius:4px;font-size:16px;font-weight:bold;display:inline-block;">💬 Escribirle a Mía por WhatsApp</a></td></tr></table>
    <p style="font-size:16px;color:#333;margin:0;">Miguel Antonio<br><span style="color:#c9a84c;">Fundador de Resonancias y PianoLink</span></p>
  </td></tr>
  <tr><td bgcolor="#0a0a0a" style="padding:24px 48px;" align="center">
    <p style="color:#888;font-size:12px;margin:0 0 8px;">PianoLink · Clases de piano online 1 a 1</p>
    <p style="margin:0;"><a href="#" style="color:#666;font-size:11px;">Cancelar suscripción</a></p>
    <p style="color:#555;font-size:11px;margin:8px 0 0;">© 2026 PianoLink · hola@pianolink.net</p>
  </td></tr></table></td></tr></table></body></html>`;

(async () => {
  const r = await resend.emails.send({
    from: 'PianoLink <hola@pianolink.net>',
    to: 'miseal@gmail.com',
    subject: 'Miguel, ¿sigues pensando en el piano? 🎹',
    html
  });
  console.log(r.error ? '❌ ' + JSON.stringify(r.error) : '✅ Enviado: ' + r.data.id);
})();
