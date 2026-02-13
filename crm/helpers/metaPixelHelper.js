/**
 * crm/helpers/metaPixelHelper.js
 * Helper para generar snippets de Meta Pixel.
 * 
 * COMPLETADO: Meta Pixel centralizado para PianoLink
 */

/**
 * Genera el snippet completo de Meta Pixel para incluir en páginas.
 * @param {string} pixelId - ID del Meta Pixel
 * @param {string} evento - Evento a disparar (PageView por defecto)
 * @param {Object} datos - Datos adicionales del evento
 * @returns {string} HTML snippet del pixel
 */
function getPixelSnippet(pixelId, evento = 'PageView', datos = {}) {
    if (!pixelId) {
        console.warn('[Meta Pixel] No hay Pixel ID configurado');
        return '';
    }

    const datosJson = JSON.stringify(datos);
    const eventoExtra = evento !== 'PageView' 
        ? `fbq('track', '${evento}', ${datosJson});`
        : '';

    return `
<!-- Meta Pixel Code - PianoLink -->
<script>
!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){
n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;
s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}
(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${pixelId}');
fbq('track', 'PageView');
${eventoExtra}
</script>
<noscript>
<img height="1" width="1" style="display:none" src="https://www.facebook.com/tr?id=${pixelId}&ev=PageView&noscript=1"/>
</noscript>
<!-- End Meta Pixel Code -->`;
}

/**
 * Genera solo el código de un evento (sin la inicialización).
 * Útil para disparar eventos en momentos específicos (formulario submit, etc.)
 * @param {string} evento - Nombre del evento
 * @param {Object} datos - Datos del evento
 * @returns {string} Código JavaScript del evento
 */
function getEventCode(evento, datos = {}) {
    const datosJson = JSON.stringify(datos);
    return `if(typeof fbq !== 'undefined') { fbq('track', '${evento}', ${datosJson}); }`;
}

/**
 * Eventos por página de PianoLink según el prompt.
 */
const EVENTOS_POR_PAGINA = {
    'waitlist': {
        pageView: { evento: 'ViewContent', datos: { content_name: 'Lista de Espera' } },
        formSubmit: { evento: 'Lead', datos: {} }
    },
    'home': {
        pageView: { evento: 'ViewContent', datos: { content_name: 'PianoLink Home' } },
        clickReservar: { evento: 'AddToCart', datos: { value: 44, currency: 'USD' } }
    },
    'welcome-kit': {
        pageView: { evento: 'InitiateCheckout', datos: { value: 44, currency: 'USD' } }
    },
    'confirmacion-pago': {
        pageView: { evento: 'Purchase', datos: { value: 44, currency: 'USD' } }
    }
};

/**
 * Obtener evento configurado para una página específica.
 * @param {string} pagina - Identificador de la página
 * @param {string} accion - Tipo de acción (pageView, formSubmit, etc.)
 * @returns {Object|null} { evento, datos } o null si no existe
 */
function getEventoParaPagina(pagina, accion = 'pageView') {
    return EVENTOS_POR_PAGINA[pagina]?.[accion] || null;
}

module.exports = {
    getPixelSnippet,
    getEventCode,
    getEventoParaPagina,
    EVENTOS_POR_PAGINA
};
