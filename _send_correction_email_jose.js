/**
 * _send_correction_email_jose.js
 * Notifica a José Wilhelmy que su anualidad de 48 clases fue corregida (43 disponibles),
 * le explica la causa del error y le indica que use la cuenta correcta.
 * Envía copia (bcc) a miseal@gmail.com.
 *
 * Uso: node _send_correction_email_jose.js
 */
require('dotenv').config();
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

const TO_EMAIL = 'josewilhelmy@gmail.com';
const BCC_EMAIL = 'miseal@gmail.com';
const NOMBRE = 'José';
const CLASES_RESTANTES = 43;

function buildEmail() {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tu anualidad ya está corregida</title>
</head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0" style="padding:48px 20px;">
    <tr><td align="center">

      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

        <!-- HEADER -->
        <tr>
          <td style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 60%,#0f3460 100%);padding:40px 40px 36px;text-align:center;">
            <p style="margin:0 0 8px 0;font-size:30px;">🎹</p>
            <h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:700;letter-spacing:-0.5px;">PianoLink</h1>
            <p style="margin:8px 0 0 0;color:#94a3b8;font-size:13px;letter-spacing:1px;text-transform:uppercase;">Plataforma de Clases de Piano</p>
          </td>
        </tr>

        <!-- CUERPO -->
        <tr>
          <td style="padding:44px 40px 36px;">

            <h2 style="margin:0 0 20px 0;color:#1e293b;font-size:22px;font-weight:600;">
              Hola, ${NOMBRE} 👋
            </h2>

            <p style="margin:0 0 16px 0;color:#475569;font-size:16px;line-height:1.7;">
              Queremos avisarte que ya <strong style="color:#1e293b;">corregimos un error en tu cuenta</strong> y que ya puedes volver a reservar tus clases con total normalidad.
            </p>

            <!-- CLASES DISPONIBLES BOX -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px 0;">
              <tr>
                <td style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:22px 24px;text-align:center;">
                  <p style="margin:0 0 4px 0;color:#166534;font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;">Clases disponibles ahora</p>
                  <p style="margin:0;color:#15803d;font-size:36px;font-weight:800;">${CLASES_RESTANTES}</p>
                </td>
              </tr>
            </table>

            <p style="margin:0 0 16px 0;color:#475569;font-size:16px;line-height:1.7;">
              <strong style="color:#1e293b;">¿Qué pasó?</strong> Durante una actualización interna de nuestro sistema de reservas, tu anualidad de 48 clases se registró incorrectamente con un número mucho menor al real. Esto provocó que, después de algunas clases, el sistema mostrara "0 clases disponibles" aunque tu anualidad seguía vigente.
            </p>

            <p style="margin:0 0 16px 0;color:#475569;font-size:16px;line-height:1.7;">
              Ya revisamos tu historial completo de clases dictadas y corregimos el saldo: de tus 48 clases contratadas, se han dictado 6 hasta la fecha, y sumamos 1 clase adicional de compensación por una clase que tuvo que cancelar tu profesor. Por eso tu saldo correcto hoy es de <strong style="color:#1e293b;">${CLASES_RESTANTES} clases</strong>.
            </p>

            <!-- CUENTA CORRECTA BOX -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px 0;">
              <tr>
                <td style="background:#fffbeb;border:1px solid #fde68a;border-left:4px solid #f59e0b;border-radius:0 10px 10px 0;padding:18px 20px;">
                  <p style="margin:0 0 6px 0;color:#92400e;font-size:14px;font-weight:700;">⚠️ Importante: usa siempre esta cuenta</p>
                  <p style="margin:0;color:#78350f;font-size:14px;line-height:1.6;">
                    Durante la revisión también detectamos que se había creado por error una segunda cuenta a tu nombre con una dirección de correo parecida. Esa cuenta duplicada ya fue anulada. Para reservar tus clases, inicia sesión <strong>siempre</strong> con este correo:
                    <br><strong style="color:#1e293b;">${TO_EMAIL}</strong>
                  </p>
                </td>
              </tr>
            </table>

            <!-- CTA -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 32px 0;">
              <tr>
                <td align="center">
                  <a href="https://pianolink.net/cliente"
                     style="display:inline-block;background:linear-gradient(135deg,#ff764d,#ff5c2b);color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;padding:18px 44px;border-radius:10px;letter-spacing:0.2px;box-shadow:0 4px 14px rgba(255,118,77,0.4);">
                    🎹 &nbsp;Ir a reservar mi clase
                  </a>
                </td>
              </tr>
            </table>

            <p style="margin:0;color:#94a3b8;font-size:13px;line-height:1.6;text-align:center;">
              Lamentamos el inconveniente. Si notas cualquier otra inconsistencia en tu saldo de clases, escríbenos y lo resolvemos de inmediato.
            </p>

          </td>
        </tr>

        <!-- SEPARADOR -->
        <tr>
          <td style="padding:0 40px;"><hr style="border:none;border-top:1px solid #e2e8f0;"></td>
        </tr>

        <!-- FOOTER -->
        <tr>
          <td style="padding:24px 40px;text-align:center;">
            <p style="margin:0 0 4px 0;color:#64748b;font-size:13px;">
              © 2026 PianoLink · <a href="https://pianolink.net" style="color:#ff764d;text-decoration:none;">pianolink.net</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>

</body>
</html>`;
}

async function main() {
  const html = buildEmail();

  const response = await resend.emails.send({
    from: `${process.env.EMAIL_FROM_NAME || 'PianoLink Team'} <${process.env.EMAIL_FROM || 'hola@pianolink.net'}>`,
    to: [TO_EMAIL],
    bcc: [BCC_EMAIL],
    subject: 'Ya puedes volver a reservar tus clases — tu anualidad fue corregida (43 clases disponibles)',
    html
  });

  if (response.error) {
    console.error('❌ Error al enviar:', response.error);
    process.exit(1);
  }

  console.log('✅ Email enviado. ID:', response.data?.id);
  console.log(`   Para: ${TO_EMAIL}`);
  console.log(`   Copia (bcc): ${BCC_EMAIL}`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
