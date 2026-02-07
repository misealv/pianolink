/**
 * WelcomeKitEmailService.js
 * Servicio para enviar emails del flujo WelcomeKit
 * Incluye email de recomendaciones técnicas post-entrevista
 */

const { Resend } = require('resend');

class WelcomeKitEmailService {
  constructor() {
    this.resend = new Resend(process.env.RESEND_API_KEY);
    this.fromEmail = 'PianoLink <hola@pianolink.net>';
  }

  /**
   * Email con recomendaciones de equipo después de la entrevista
   * @param {Object} options - Opciones del email
   * @param {string} options.to - Email del cliente
   * @param {string} options.clientName - Nombre del cliente
   * @param {string} options.keyboardBrand - Marca del teclado que tiene
   * @param {string} options.connectionType - Tipo de conexión (USB-B, USB-C, MIDI 5-pin, etc.)
   * @param {Array} options.recommendations - Lista de productos recomendados
   * @param {string} options.notes - Notas adicionales de la entrevista
   * @param {string} options.calendarLink - Link para agendar setup (opcional)
   */
  async sendEquipmentRecommendations(options) {
    const {
      to,
      clientName,
      keyboardBrand = 'Tu teclado',
      connectionType = 'USB',
      recommendations = [],
      notes = '',
      calendarLink = ''
    } = options;

    // Productos recomendados por defecto según tipo de conexión
    const defaultRecommendations = this.getDefaultRecommendations(connectionType);
    const allRecommendations = recommendations.length > 0 ? recommendations : defaultRecommendations;

    const html = this.buildRecommendationEmailHTML({
      clientName,
      keyboardBrand,
      connectionType,
      recommendations: allRecommendations,
      notes,
      calendarLink
    });

    try {
      const result = await this.resend.emails.send({
        from: this.fromEmail,
        to: [to],
        subject: `🎹 ${clientName}, aquí están tus recomendaciones de equipo - PianoLink`,
        html
      });

      console.log(`[WelcomeKitEmail] Recomendaciones enviadas a ${to}`, result);
      return { success: true, messageId: result.id };
    } catch (error) {
      console.error('[WelcomeKitEmail] Error enviando recomendaciones:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Email de confirmación cuando el cliente indica que tiene el equipo listo
   */
  async sendEquipmentReadyConfirmation(options) {
    const { to, clientName, calendarLink } = options;

    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #d4af37 0%, #f0d060 100%); padding: 40px 30px; text-align: center; }
        .header h1 { color: #1a1a2e; margin: 0; font-size: 28px; }
        .content { padding: 40px 30px; }
        .content p { color: #444; line-height: 1.8; font-size: 16px; margin: 0 0 20px 0; }
        .btn { display: inline-block; background: linear-gradient(135deg, #d4af37 0%, #b8962f 100%); color: #1a1a2e; text-decoration: none; padding: 16px 32px; border-radius: 10px; font-weight: bold; font-size: 16px; margin-top: 20px; }
        .footer { background: #1a1a2e; padding: 30px; text-align: center; color: #888; font-size: 13px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🎉 ¡Excelente, ${clientName}!</h1>
        </div>
        <div class="content">
          <p>Nos alegra saber que ya tienes tu equipo listo para comenzar.</p>
          <p>El siguiente paso es agendar tu <strong>Sesión de Setup Técnico</strong>, donde te ayudaremos a:</p>
          <ul style="color: #444; line-height: 2;">
            <li>Conectar tu teclado MIDI a la computadora</li>
            <li>Configurar el audio correctamente</li>
            <li>Probar que todo funcione perfecto para tu clase</li>
          </ul>
          <p>Esta sesión dura aproximadamente 20 minutos y es por videollamada.</p>
          
          ${calendarLink ? `
          <p style="text-align: center; margin-top: 30px;">
            <a href="${calendarLink}" class="btn">📅 Agendar mi Setup Técnico</a>
          </p>
          ` : `
          <p style="background: #f8f9fa; padding: 20px; border-radius: 10px; text-align: center;">
            Te contactaremos pronto por WhatsApp para coordinar el horario de tu setup.
          </p>
          `}
          
          <p style="margin-top: 30px;">¡Estamos emocionados de ayudarte a comenzar tu viaje musical! 🎹</p>
        </div>
        <div class="footer">
          <p>PianoLink - Clases de piano online con tecnología MIDI</p>
          <p>¿Dudas? Escríbenos a hola@pianolink.net</p>
        </div>
      </div>
    </body>
    </html>
    `;

    try {
      const result = await this.resend.emails.send({
        from: this.fromEmail,
        to: [to],
        subject: `✅ ¡Equipo listo! Agendemos tu setup - PianoLink`,
        html
      });

      return { success: true, messageId: result.id };
    } catch (error) {
      console.error('[WelcomeKitEmail] Error enviando confirmación:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Obtiene recomendaciones por defecto según tipo de conexión
   */
  getDefaultRecommendations(connectionType) {
    const recommendations = {
      'USB-B': [
        {
          name: 'Cable USB-B a USB-A (2 metros)',
          description: 'El cable estándar para teclados Yamaha, Roland, Casio',
          price: '$5-8 USD',
          links: [
            { store: 'Amazon', url: 'https://www.amazon.com/s?k=usb+b+cable+printer+2m' },
            { store: 'AliExpress', url: 'https://www.aliexpress.com/w/wholesale-usb-b-cable-2m.html' },
            { store: 'MercadoLibre CL', url: 'https://listado.mercadolibre.cl/cable-usb-tipo-b-impresora' }
          ],
          image: '🔌',
          priority: 'required'
        }
      ],
      'USB-C': [
        {
          name: 'Cable USB-C a USB-A (2 metros)',
          description: 'Para teclados modernos con puerto USB-C',
          price: '$6-10 USD',
          links: [
            { store: 'Amazon', url: 'https://www.amazon.com/s?k=usb+c+cable+2m' },
            { store: 'AliExpress', url: 'https://www.aliexpress.com/w/wholesale-usb-c-cable-2m.html' },
            { store: 'MercadoLibre CL', url: 'https://listado.mercadolibre.cl/cable-usb-c-2-metros' }
          ],
          image: '🔌',
          priority: 'required'
        }
      ],
      'MIDI 5-pin': [
        {
          name: 'Interfaz MIDI USB (MIDI a USB)',
          description: 'Convierte la conexión MIDI de 5 pines a USB para tu computadora',
          price: '$10-20 USD',
          links: [
            { store: 'Amazon', url: 'https://www.amazon.com/s?k=midi+to+usb+interface' },
            { store: 'AliExpress', url: 'https://www.aliexpress.com/w/wholesale-midi-usb-interface.html' },
            { store: 'MercadoLibre CL', url: 'https://listado.mercadolibre.cl/interfaz-midi-usb' }
          ],
          image: '🎛️',
          priority: 'required'
        }
      ],
      'Bluetooth': [
        {
          name: 'Adaptador Bluetooth MIDI (opcional)',
          description: 'Si tu teclado solo tiene Bluetooth, considera un cable USB como respaldo',
          price: '$15-25 USD',
          links: [
            { store: 'Amazon', url: 'https://www.amazon.com/s?k=bluetooth+midi+adapter' }
          ],
          image: '📶',
          priority: 'optional'
        }
      ]
    };

    // Recomendaciones comunes para todos
    const common = [
      {
        name: 'Pedal de Sustain (si no tienes)',
        description: 'Esencial para tocar piano. Cualquier pedal genérico funciona.',
        price: '$10-20 USD',
        links: [
          { store: 'Amazon', url: 'https://www.amazon.com/s?k=sustain+pedal+keyboard' },
          { store: 'AliExpress', url: 'https://www.aliexpress.com/w/wholesale-sustain-pedal.html' },
          { store: 'MercadoLibre CL', url: 'https://listado.mercadolibre.cl/pedal-sustain' }
        ],
        image: '🦶',
        priority: 'recommended'
      },
      {
        name: 'Audífonos con cable (para escuchar al profesor)',
        description: 'Evita usar parlantes para que no haya eco. Cualquier audífono con cable sirve.',
        price: 'Ya tienes probablemente',
        links: [],
        image: '🎧',
        priority: 'recommended'
      }
    ];

    return [...(recommendations[connectionType] || recommendations['USB-B']), ...common];
  }

  /**
   * Construye el HTML del email de recomendaciones
   */
  buildRecommendationEmailHTML(options) {
    const { clientName, keyboardBrand, connectionType, recommendations, notes, calendarLink } = options;

    const recommendationCards = recommendations.map(rec => {
      const linksHtml = rec.links.map(link => 
        `<a href="${link.url}" style="display: inline-block; background: #f0f0f0; color: #333; text-decoration: none; padding: 6px 12px; border-radius: 5px; font-size: 12px; margin: 3px;">${link.store} →</a>`
      ).join('');

      const priorityBadge = rec.priority === 'required' 
        ? '<span style="background: #dc3545; color: white; font-size: 10px; padding: 2px 8px; border-radius: 10px; margin-left: 10px;">NECESARIO</span>'
        : rec.priority === 'recommended'
        ? '<span style="background: #ffc107; color: #333; font-size: 10px; padding: 2px 8px; border-radius: 10px; margin-left: 10px;">RECOMENDADO</span>'
        : '<span style="background: #6c757d; color: white; font-size: 10px; padding: 2px 8px; border-radius: 10px; margin-left: 10px;">OPCIONAL</span>';

      return `
        <div style="background: #f8f9fa; border-radius: 12px; padding: 20px; margin-bottom: 15px; border-left: 4px solid ${rec.priority === 'required' ? '#d4af37' : '#ddd'};">
          <div style="display: flex; align-items: center; margin-bottom: 10px;">
            <span style="font-size: 32px; margin-right: 15px;">${rec.image}</span>
            <div>
              <strong style="color: #1a1a2e; font-size: 16px;">${rec.name}</strong>
              ${priorityBadge}
              <div style="color: #666; font-size: 14px; margin-top: 5px;">${rec.description}</div>
              <div style="color: #d4af37; font-weight: bold; margin-top: 5px;">${rec.price}</div>
            </div>
          </div>
          ${rec.links.length > 0 ? `
          <div style="margin-top: 12px;">
            <span style="font-size: 12px; color: #888;">Dónde comprarlo:</span><br>
            ${linksHtml}
          </div>
          ` : ''}
        </div>
      `;
    }).join('');

    return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: 'Segoe UI', Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 20px;">
      <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
        
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #1a1a2e 0%, #2d2d44 100%); padding: 40px 30px; text-align: center;">
          <div style="font-size: 48px; margin-bottom: 15px;">🎹</div>
          <h1 style="color: #d4af37; margin: 0; font-size: 24px;">Tus Recomendaciones de Equipo</h1>
          <p style="color: #aaa; margin: 10px 0 0 0;">Guarda este email como referencia</p>
        </div>
        
        <!-- Greeting -->
        <div style="padding: 30px 30px 0 30px;">
          <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0;">
            ¡Hola <strong>${clientName}</strong>! 👋
          </p>
          <p style="color: #555; font-size: 15px; line-height: 1.8; margin: 15px 0;">
            Fue un gusto hablar contigo. Basándome en tu teclado <strong style="color: #d4af37;">${keyboardBrand}</strong> 
            con conexión <strong style="color: #d4af37;">${connectionType}</strong>, aquí te dejo las recomendaciones 
            de lo que necesitas para empezar:
          </p>
        </div>

        <!-- Recommendations -->
        <div style="padding: 20px 30px;">
          <h2 style="color: #1a1a2e; font-size: 18px; margin: 0 0 20px 0; border-bottom: 2px solid #d4af37; padding-bottom: 10px;">
            📦 Lo que necesitas
          </h2>
          ${recommendationCards}
        </div>

        ${notes ? `
        <!-- Notes -->
        <div style="padding: 0 30px 20px 30px;">
          <div style="background: #fff3cd; border-radius: 12px; padding: 20px; border-left: 4px solid #ffc107;">
            <strong style="color: #856404;">📝 Notas adicionales:</strong>
            <p style="color: #856404; margin: 10px 0 0 0; line-height: 1.6;">${notes}</p>
          </div>
        </div>
        ` : ''}

        <!-- Next Steps -->
        <div style="padding: 0 30px 30px 30px;">
          <h2 style="color: #1a1a2e; font-size: 18px; margin: 0 0 20px 0; border-bottom: 2px solid #d4af37; padding-bottom: 10px;">
            ✅ Próximos pasos
          </h2>
          <ol style="color: #555; line-height: 2; padding-left: 20px; margin: 0;">
            <li><strong>Compra lo necesario</strong> usando los links de arriba (o donde prefieras)</li>
            <li><strong>Cuando tengas todo</strong>, entra a tu cuenta en PianoLink y presiona el botón "Ya tengo mi equipo listo"</li>
            <li><strong>Agendaremos tu Setup Técnico</strong> para configurar todo juntos por videollamada</li>
            <li><strong>¡Tu primera clase!</strong> con un profesor certificado</li>
          </ol>
        </div>

        <!-- CTA -->
        <div style="padding: 0 30px 40px 30px; text-align: center;">
          ${calendarLink ? `
          <p style="color: #888; font-size: 14px; margin-bottom: 15px;">¿Ya tienes todo? Agenda tu setup ahora:</p>
          <a href="${calendarLink}" style="display: inline-block; background: linear-gradient(135deg, #d4af37 0%, #b8962f 100%); color: #1a1a2e; text-decoration: none; padding: 16px 40px; border-radius: 10px; font-weight: bold; font-size: 16px;">
            📅 Agendar Setup Técnico
          </a>
          ` : `
          <div style="background: #e8f4fd; border-radius: 12px; padding: 20px;">
            <p style="color: #0c5460; margin: 0; font-size: 14px;">
              💡 Cuando tengas tu equipo, ingresa a <a href="https://www.pianolink.net/cliente" style="color: #d4af37;">tu cuenta en PianoLink</a> 
              y presiona "Ya tengo mi equipo listo" para coordinar tu setup.
            </p>
          </div>
          `}
        </div>

        <!-- Footer -->
        <div style="background: #1a1a2e; padding: 30px; text-align: center;">
          <p style="color: #d4af37; font-weight: bold; margin: 0 0 10px 0;">PianoLink</p>
          <p style="color: #888; font-size: 13px; margin: 0;">Clases de piano online con tecnología MIDI</p>
          <p style="color: #666; font-size: 12px; margin: 15px 0 0 0;">
            ¿Dudas? Responde a este email o escríbenos por WhatsApp
          </p>
        </div>
      </div>
    </body>
    </html>
    `;
  }
}

module.exports = new WelcomeKitEmailService();
