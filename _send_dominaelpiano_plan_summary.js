// Envía a Miguel un resumen del plan "Domina el Piano" + mapa maestro de 6 fases (sección 25)
require('dotenv').config();
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

const TO = 'miseal@gmail.com';
const SUBJECT = '🗺️ Domina el Piano — Resumen del plan y mapa de fases';

const HTML = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
  body{margin:0;padding:0;background:#f5f5f0;font-family:Georgia,serif;color:#333;}
  .wrap{max-width:640px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;}
  .head{background:#0a0a0a;color:#c9a84c;text-align:center;padding:24px;font-size:20px;letter-spacing:2px;}
  .body{padding:36px 40px;}
  h1{font-size:24px;color:#0a0a0a;margin:0 0 20px;}
  h2{font-size:17px;color:#0a0a0a;border-bottom:2px solid #c9a84c;padding-bottom:6px;margin:28px 0 12px;}
  p,li{font-size:14px;line-height:1.6;}
  ul{margin:6px 0 0;padding-left:20px;}
  .tag{display:inline-block;background:#c9a84c;color:#0a0a0a;font-size:11px;font-weight:bold;padding:2px 8px;border-radius:3px;margin-right:6px;}
  .phase{border-left:3px solid #c9a84c;padding:4px 0 4px 14px;margin:14px 0;}
  .foot{background:#0a0a0a;color:#888;text-align:center;padding:20px;font-size:11px;}
</style></head>
<body><div class="wrap">
  <div class="head">🎹 PianoLink</div>
  <div class="body">
    <h1>Domina el Piano — Resumen y mapa de fases</h1>
    <p>Resumen del documento de trabajo completo, para organizarte sin releerlo entero. Fecha: 2 de julio de 2026.</p>

    <h2>El programa en una línea</h2>
    <p>Programa individual premium de <strong>3 años (12 trimestres, niveles A1→C2)</strong>: Bastien 1:1 vía PianoLink (MIDI mirror) + Piano Social grupal (cifrado/cancionero), con certificado por trimestre.</p>

    <h2>Precio y meta de lanzamiento</h2>
    <ul>
      <li>Meta: <strong>Cohorte Fundadora de 8 alumnos</strong> directos.</li>
      <li>Precio Fundador: <strong>$499.000 CLP/trimestre</strong> (bloqueado de por vida) vs. $549.000 CLP regular.</li>
      <li>3 formas de pago: único (-5%), 2 cuotas, 3 cuotas mensuales.</li>
      <li>Garantía de las 2 primeras clases + Clase Diagnóstico previa.</li>
    </ul>

    <h2>Motor de venta ya diseñado</h2>
    <ul>
      <li>Plan de 8 semanas con la <strong>Masterclass de Puertas Abiertas</strong> como evento central de cierre (ventana Fundador de 72h).</li>
      <li>La base cálida (grupo actual + 74 ex-Resonancias + CRM) alcanza matemáticamente ~10 matrículas contra la meta de 8 — sin publicidad paga.</li>
      <li>Referidos, política de pausa y "Pasaporte Pianístico" ya diseñados como retención.</li>
    </ul>

    <h2>Veredicto de plataforma (PianoLink)</h2>
    <p>Es la columna vertebral correcta — nadie más tiene MIDI mirror — pero tiene un <strong>P0 bloqueante</strong>: el estado de sala vive 100% en RAM sobre Render free. Eso, no solo tu red, es la causa real de la intermitencia. No se vende el primer cupo sin resolverlo.</p>

    <h2>🗺️ Mapa maestro — 6 fases por dependencia</h2>

    <div class="phase"><span class="tag">FASE 0</span><strong>Legal / contractual</strong> (liviana)
      <ul><li>Redactar T&amp;C: compromiso trimestral, garantía, pausa, fuerza mayor.</li><li>Boleta/facturación: ya resuelta.</li></ul>
    </div>

    <div class="phase"><span class="tag">FASE 1</span><strong>Estabilización técnica P0</strong> (bloqueante — la programas tú)
      <ul>
        <li>Salir de Render free (usar <code>fly.toml</code> ya en el repo, o Render pago).</li>
        <li>Mover estado de sala a Redis + Socket.io Redis adapter.</li>
        <li>Recuperación real de estado al reconectar.</li>
        <li>Indicador visual de calidad de conexión.</li>
        <li><strong>Cierre QA:</strong> clase de prueba que sobrevive un reinicio de servidor + una caída de red simulada a mitad de sesión.</li>
      </ul>
    </div>

    <div class="phase"><span class="tag">FASE 2</span><strong>Producción de contenido</strong> (en paralelo a la Fase 1)
      <ul><li>Cargar partituras reales de los 12 trimestres en PianoLink.</li><li>Aplicar mitigación del contenido infantil de Elemental/Nivel 1.</li><li>Completar repertorio de Piano Social para los 12 trimestres.</li></ul>
    </div>

    <div class="phase"><span class="tag">FASE 3</span><strong>Motor de venta</strong> — el plan de 8 semanas ya diseñado
      <p style="margin:4px 0 0;">Su "semana 0" arranca recién cuando declares cerrada la Fase 1.</p>
    </div>

    <div class="phase"><span class="tag">FASE 4</span><strong>Lanzamiento</strong> — Masterclass + ventana Fundador de 72h, sin cambios.</div>

    <div class="phase"><span class="tag">FASE 5</span><strong>Operación Trimestre 1 en vivo</strong>
      <ul><li>Monitorear que el P0 aguanta clases reales.</li><li>Recolectar 3-4 testimonios en video.</li></ul>
    </div>

    <div class="phase"><span class="tag">FASE 6</span><strong>Decisión go/no-go</strong>
      <p style="margin:4px 0 0;">Definir umbral de éxito (incidentes, asistencia, satisfacción) que habilita cohorte 2 o expansión internacional.</p>
    </div>

    <h2>Confirmado contigo (2026-07-02)</h2>
    <ul>
      <li>El P0 lo programas <strong>tú mismo</strong> — sin fecha externa, a tu ritmo.</li>
      <li>La boleta/facturación <strong>ya está resuelta</strong>.</li>
      <li>La fecha real de venta <strong>depende 100% de que cierres la Fase 1</strong>.</li>
    </ul>

    <h2>Pendientes que todavía necesitas decidir</h2>
    <ul>
      <li>Redactar los T&amp;C del programa (Fase 0).</li>
      <li>Definir el umbral de éxito go/no-go (Fase 6).</li>
      <li>Aprobar el cambio de moneda ancla a CLP y el precio Fundador (sección 6).</li>
      <li>Confirmar disponibilidad de la Casona para Piano Social presencial.</li>
      <li>Confirmar el número real de alumnos activos del grupo actual.</li>
      <li>Decidir la mitigación del contenido infantil (mínimo: nunca mostrar la página física del libro).</li>
      <li>Orden y fecha de expansión internacional — después de cosechar testimonios.</li>
    </ul>
  </div>
  <div class="foot">Domina el Piano · Resumen generado desde dominaelpiano.md · 2026-07-02</div>
</div></body></html>`;

(async () => {
  try {
    const result = await resend.emails.send({
      from: 'PianoLink <hola@pianolink.net>',
      to: TO,
      subject: SUBJECT,
      html: HTML
    });
    console.log('✅ Enviado:', result);
  } catch (err) {
    console.error('❌ Error:', err);
  }
})();
