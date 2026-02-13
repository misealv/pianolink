/**
 * crm/views/landingRenderer.js
 * Genera HTML completo server-side desde el JSON de una CrmLanding.
 * 
 * Arquitectura modular: cada sección es una función pura que recibe
 * data y devuelve un string HTML. Sin dependencias externas (no EJS, no Pug).
 * 
 * Secciones soportadas:
 *   1. Head (SEO, OG, fonts)
 *   2. Hero (headline, subheadline, CTA, video/imagen)
 *   3. Benefits (grid de beneficios con íconos)
 *   4. Testimonials (cards de testimonios)
 *   5. FAQ (accordion)
 *   6. Form (formulario de captura con validación JS inline)
 *   7. Footer (texto + links)
 *   8. Scripts (tracking, form submit, analytics)
 */

// === UTILIDADES ===

/**
 * Escapa HTML para prevenir XSS en contenido dinámico.
 */
function esc(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Genera un color más oscuro para hover (reduce luminosidad).
 */
function darkenColor(hex, percent = 15) {
    if (!hex || !hex.startsWith('#')) return '#3730a3';
    const num = parseInt(hex.slice(1), 16);
    const r = Math.max(0, (num >> 16) - Math.round(255 * percent / 100));
    const g = Math.max(0, ((num >> 8) & 0x00FF) - Math.round(255 * percent / 100));
    const b = Math.max(0, (num & 0x0000FF) - Math.round(255 * percent / 100));
    return `#${(r << 16 | g << 8 | b).toString(16).padStart(6, '0')}`;
}

// === 1. HEAD ===

function renderHead(landing) {
    const seo = landing.seo || {};
    const branding = landing.content?.branding || {};
    const title = esc(seo.title || landing.content?.hero?.headline || landing.name);
    const description = esc(seo.description || landing.content?.hero?.subheadline || '');
    const ogImage = esc(seo.ogImage || landing.content?.hero?.backgroundImage || '');
    const primaryColor = esc(branding.primaryColor || '#4F46E5');
    const fontFamily = branding.fontFamily 
        ? `<link href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(branding.fontFamily)}:wght@400;600;700&display=swap" rel="stylesheet">`
        : '';
    const fontStack = branding.fontFamily 
        ? `'${esc(branding.fontFamily)}', system-ui, -apple-system, sans-serif`
        : `system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`;

    // COMPLETADO: Meta Pixel integrado si está configurado
    const metaPixelId = process.env.META_PIXEL_ID || '';
    const metaPixelSnippet = metaPixelId ? `
    <!-- Meta Pixel Code - PianoLink -->
    <script>
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){
    n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};
    if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
    n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;
    s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}
    (window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
    fbq('init', '${metaPixelId}');
    fbq('track', 'PageView');
    ${landing.slug === 'waitlist' ? "fbq('track', 'ViewContent', {content_name: 'Lista de Espera'});" : ''}
    </script>
    <noscript><img height="1" width="1" style="display:none" src="https://www.facebook.com/tr?id=${metaPixelId}&ev=PageView&noscript=1"/></noscript>
    <!-- End Meta Pixel Code -->` : '';

    return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <meta name="description" content="${description}">

    <!-- Open Graph -->
    <meta property="og:title" content="${title}">
    <meta property="og:description" content="${description}">
    ${ogImage ? `<meta property="og:image" content="${ogImage}">` : ''}
    <meta property="og:type" content="website">

    <!-- Robots: indexar solo si publicada -->
    <meta name="robots" content="index, follow">

    ${fontFamily}
    ${metaPixelSnippet}

    <style>
        /* === RESET + BASE === */
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html { scroll-behavior: smooth; }
        body {
            font-family: ${fontStack};
            line-height: 1.6;
            color: #1f2937;
            background: #ffffff;
            -webkit-font-smoothing: antialiased;
        }
        img { max-width: 100%; height: auto; display: block; }
        a { color: ${primaryColor}; text-decoration: none; }
        a:hover { text-decoration: underline; }

        /* === LAYOUT === */
        .section { padding: 4rem 1.5rem; }
        .container { max-width: 1100px; margin: 0 auto; }
        .section-title {
            font-size: 2rem;
            font-weight: 700;
            text-align: center;
            margin-bottom: 2.5rem;
            color: #111827;
        }

        /* === BOTÓN PRIMARIO === */
        .btn-primary {
            display: inline-block;
            padding: 0.875rem 2rem;
            background: ${primaryColor};
            color: #fff;
            font-size: 1.125rem;
            font-weight: 600;
            border: none;
            border-radius: 0.5rem;
            cursor: pointer;
            transition: background 0.2s, transform 0.1s;
            text-decoration: none;
        }
        .btn-primary:hover {
            background: ${darkenColor(primaryColor)};
            text-decoration: none;
            transform: translateY(-1px);
        }
        .btn-primary:active { transform: translateY(0); }

        /* === HERO === */
        .hero {
            position: relative;
            min-height: 70vh;
            display: flex;
            align-items: center;
            justify-content: center;
            text-align: center;
            padding: 4rem 1.5rem;
            background: linear-gradient(135deg, #667eea 0%, ${primaryColor} 100%);
            color: #fff;
            overflow: hidden;
        }
        .hero--with-bg {
            background-size: cover;
            background-position: center;
        }
        .hero--with-bg::before {
            content: '';
            position: absolute;
            inset: 0;
            background: rgba(0,0,0,0.4);
        }
        .hero__content {
            position: relative;
            z-index: 1;
            max-width: 700px;
        }
        .hero__headline {
            font-size: clamp(2rem, 5vw, 3.5rem);
            font-weight: 800;
            line-height: 1.15;
            margin-bottom: 1rem;
        }
        .hero__subheadline {
            font-size: clamp(1rem, 2.5vw, 1.35rem);
            opacity: 0.92;
            margin-bottom: 2rem;
            font-weight: 400;
        }
        .hero__video {
            margin-top: 2rem;
            border-radius: 0.75rem;
            overflow: hidden;
            box-shadow: 0 20px 50px rgba(0,0,0,0.3);
        }
        .hero__video iframe {
            width: 100%;
            aspect-ratio: 16/9;
            border: none;
        }

        /* === BENEFITS === */
        .benefits { background: #f9fafb; }
        .benefits__grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 2rem;
        }
        .benefit-card {
            background: #fff;
            border-radius: 0.75rem;
            padding: 2rem;
            text-align: center;
            box-shadow: 0 1px 3px rgba(0,0,0,0.08);
            transition: transform 0.2s, box-shadow 0.2s;
        }
        .benefit-card:hover {
            transform: translateY(-4px);
            box-shadow: 0 8px 25px rgba(0,0,0,0.1);
        }
        .benefit-card__icon { font-size: 2.5rem; margin-bottom: 1rem; }
        .benefit-card__title {
            font-size: 1.15rem;
            font-weight: 700;
            margin-bottom: 0.5rem;
            color: #111827;
        }
        .benefit-card__desc { color: #6b7280; font-size: 0.95rem; }

        /* === TESTIMONIALS === */
        .testimonials { background: #fff; }
        .testimonials__grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 2rem;
        }
        .testimonial-card {
            background: #f9fafb;
            border-radius: 0.75rem;
            padding: 2rem;
            border-left: 4px solid ${primaryColor};
        }
        .testimonial-card__quote {
            font-style: italic;
            color: #374151;
            margin-bottom: 1rem;
            line-height: 1.7;
        }
        .testimonial-card__author {
            display: flex;
            align-items: center;
            gap: 0.75rem;
        }
        .testimonial-card__avatar {
            width: 48px;
            height: 48px;
            border-radius: 50%;
            object-fit: cover;
            background: #e5e7eb;
        }
        .testimonial-card__name {
            font-weight: 600;
            color: #111827;
        }
        .testimonial-card__role {
            font-size: 0.85rem;
            color: #9ca3af;
        }

        /* === FAQ === */
        .faq { background: #f9fafb; }
        .faq__list { max-width: 700px; margin: 0 auto; }
        .faq__item {
            background: #fff;
            border-radius: 0.5rem;
            margin-bottom: 0.75rem;
            overflow: hidden;
            box-shadow: 0 1px 2px rgba(0,0,0,0.05);
        }
        .faq__question {
            width: 100%;
            padding: 1.25rem 1.5rem;
            font-size: 1rem;
            font-weight: 600;
            text-align: left;
            background: none;
            border: none;
            cursor: pointer;
            display: flex;
            justify-content: space-between;
            align-items: center;
            color: #1f2937;
            font-family: inherit;
        }
        .faq__question:hover { background: #f3f4f6; }
        .faq__arrow {
            transition: transform 0.2s;
            font-size: 0.75rem;
            color: #9ca3af;
        }
        .faq__item.open .faq__arrow { transform: rotate(180deg); }
        .faq__answer {
            max-height: 0;
            overflow: hidden;
            transition: max-height 0.3s ease;
            padding: 0 1.5rem;
            color: #6b7280;
            line-height: 1.7;
        }
        .faq__item.open .faq__answer {
            max-height: 500px;
            padding: 0 1.5rem 1.25rem;
        }

        /* === FORM === */
        .form-section {
            background: linear-gradient(135deg, #667eea 0%, ${primaryColor} 100%);
            border-top: none;
            padding: 4rem 1.5rem;
        }
        .form-wrapper {
            max-width: 520px;
            margin: 0 auto;
            background: #ffffff;
            border-radius: 1rem;
            padding: 2.5rem;
            box-shadow: 0 20px 50px rgba(0,0,0,0.25);
        }
        .form-wrapper h2 {
            color: #111827;
            margin-bottom: 0.5rem;
            font-size: 1.75rem;
            text-align: center;
        }
        .form-wrapper .form-subtitle {
            text-align: center;
            color: #6b7280;
            margin-bottom: 2rem;
            font-size: 0.95rem;
        }
        .form-group { margin-bottom: 1.25rem; }
        .form-group label {
            display: block;
            font-weight: 600;
            font-size: 0.9rem;
            margin-bottom: 0.375rem;
            color: #374151;
        }
        .form-group label .required { color: #ef4444; }
        .form-group input,
        .form-group select,
        .form-group textarea {
            width: 100%;
            padding: 0.875rem 1.125rem;
            border: 2px solid #e5e7eb;
            border-radius: 0.5rem;
            font-size: 1rem;
            font-family: inherit;
            transition: all 0.2s ease;
            background: #f9fafb;
        }
        .form-group input:focus,
        .form-group select:focus,
        .form-group textarea:focus {
            outline: none;
            border-color: ${primaryColor};
            background: #fff;
            box-shadow: 0 0 0 4px ${primaryColor}22;
            transform: translateY(-1px);
        }
        .form-group textarea { resize: vertical; min-height: 80px; }
        .form-group .error-msg {
            color: #ef4444;
            font-size: 0.8rem;
            margin-top: 0.25rem;
            display: none;
        }
        .form-submit {
            width: 100%;
            margin-top: 0.5rem;
        }
        .form-success {
            display: none;
            text-align: center;
            padding: 2rem;
        }
        .form-success__icon { font-size: 3rem; margin-bottom: 1rem; }
        .form-success__msg {
            font-size: 1.15rem;
            color: #059669;
            font-weight: 600;
        }

        /* === FOOTER === */
        .landing-footer {
            background: #111827;
            color: #9ca3af;
            padding: 2rem 1.5rem;
            text-align: center;
            font-size: 0.875rem;
        }
        .landing-footer a { color: #d1d5db; }
        .landing-footer__links {
            display: flex;
            justify-content: center;
            gap: 1.5rem;
            margin-top: 0.75rem;
            flex-wrap: wrap;
        }

        /* === RESPONSIVE === */
        @media (max-width: 640px) {
            .section { padding: 3rem 1rem; }
            .hero { min-height: 60vh; padding: 3rem 1rem; }
            .form-wrapper { padding: 1.5rem; }
            .benefits__grid, .testimonials__grid {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body>`;
}

// === 2. HERO ===

function renderHero(content) {
    const hero = content?.hero;
    if (!hero?.headline) return '';

    const bgStyle = hero.backgroundImage 
        ? `background-image:url('${esc(hero.backgroundImage)}')` 
        : '';
    const bgClass = hero.backgroundImage ? ' hero--with-bg' : '';
    const ctaColor = hero.ctaColor ? `style="background:${esc(hero.ctaColor)}"` : '';

    let videoHtml = '';
    if (hero.videoUrl) {
        // Soportar YouTube y Vimeo embeds
        const embedUrl = convertToEmbed(hero.videoUrl);
        if (embedUrl) {
            videoHtml = `
            <div class="hero__video">
                <iframe src="${esc(embedUrl)}" allowfullscreen loading="lazy"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture">
                </iframe>
            </div>`;
        }
    }

    return `
    <section class="hero${bgClass}" ${bgStyle ? `style="${bgStyle}"` : ''}>
        <div class="hero__content">
            <h1 class="hero__headline">${esc(hero.headline)}</h1>
            ${hero.subheadline ? `<p class="hero__subheadline">${esc(hero.subheadline)}</p>` : ''}
            ${hero.ctaText ? `<a href="#form-section" class="btn-primary" ${ctaColor}>${esc(hero.ctaText)}</a>` : ''}
            ${videoHtml}
        </div>
    </section>`;
}

/**
 * Convierte URLs de YouTube/Vimeo a formato embed.
 */
function convertToEmbed(url) {
    if (!url) return '';
    // YouTube
    const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}`;
    // Vimeo
    const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
    if (vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[1]}`;
    // Ya es embed o URL directa
    if (url.includes('/embed/') || url.includes('player.vimeo')) return url;
    return '';
}

// === 3. BENEFITS ===

function renderBenefits(content) {
    const benefits = content?.benefits;
    if (!benefits || benefits.length === 0) return '';

    const cards = benefits.map(b => `
        <div class="benefit-card">
            <div class="benefit-card__icon">${esc(b.icon || '🎵')}</div>
            <h3 class="benefit-card__title">${esc(b.title)}</h3>
            <p class="benefit-card__desc">${esc(b.description)}</p>
        </div>`).join('');

    return `
    <section class="section benefits">
        <div class="container">
            <h2 class="section-title">¿Por qué elegirnos?</h2>
            <div class="benefits__grid">${cards}</div>
        </div>
    </section>`;
}

// === 4. TESTIMONIALS ===

function renderTestimonials(content) {
    const testimonials = content?.testimonials;
    if (!testimonials || testimonials.length === 0) return '';

    const cards = testimonials.map(t => {
        const avatarHtml = t.avatar 
            ? `<img class="testimonial-card__avatar" src="${esc(t.avatar)}" alt="${esc(t.name)}" loading="lazy">`
            : `<div class="testimonial-card__avatar" style="display:flex;align-items:center;justify-content:center;font-size:1.25rem;color:#6b7280">👤</div>`;

        return `
        <div class="testimonial-card">
            <p class="testimonial-card__quote">"${esc(t.quote)}"</p>
            <div class="testimonial-card__author">
                ${avatarHtml}
                <div>
                    <div class="testimonial-card__name">${esc(t.name)}</div>
                    ${t.role ? `<div class="testimonial-card__role">${esc(t.role)}</div>` : ''}
                </div>
            </div>
        </div>`;
    }).join('');

    return `
    <section class="section testimonials">
        <div class="container">
            <h2 class="section-title">Lo que dicen nuestros usuarios</h2>
            <div class="testimonials__grid">${cards}</div>
        </div>
    </section>`;
}

// === 5. FAQ ===

function renderFaq(content) {
    const faq = content?.faq;
    if (!faq || faq.length === 0) return '';

    const items = faq.map((f, i) => `
        <div class="faq__item" id="faq-${i}">
            <button class="faq__question" onclick="toggleFaq(${i})">
                <span>${esc(f.question)}</span>
                <span class="faq__arrow">▼</span>
            </button>
            <div class="faq__answer">${esc(f.answer)}</div>
        </div>`).join('');

    return `
    <section class="section faq">
        <div class="container">
            <h2 class="section-title">Preguntas frecuentes</h2>
            <div class="faq__list">${items}</div>
        </div>
    </section>`;
}

// === 6. FORM ===

function renderForm(content, slug, utmParams, variantName) {
    const form = content?.form;
    if (!form?.fields || form.fields.length === 0) return '';

    const fields = form.fields.map(f => {
        if (f.type === 'hidden') {
            return `<input type="hidden" name="${esc(f.name)}" value="${esc(f.placeholder || '')}">`;
        }

        const requiredAttr = f.required ? 'required' : '';
        const requiredMark = f.required ? ' <span class="required">*</span>' : '';

        let inputHtml = '';

        switch (f.type) {
            case 'select':
                const options = (f.options || []).map(o => 
                    `<option value="${esc(o)}">${esc(o)}</option>`
                ).join('');
                inputHtml = `<select name="${esc(f.name)}" ${requiredAttr}>
                    <option value="">${esc(f.placeholder || 'Seleccionar...')}</option>
                    ${options}
                </select>`;
                break;

            case 'textarea':
                inputHtml = `<textarea name="${esc(f.name)}" placeholder="${esc(f.placeholder || '')}" 
                    ${requiredAttr} rows="3"></textarea>`;
                break;

            case 'phone':
                inputHtml = `<input type="tel" name="${esc(f.name)}" placeholder="${esc(f.placeholder || '+56 9 1234 5678')}" 
                    ${requiredAttr} autocomplete="tel">`;
                break;

            case 'email':
                inputHtml = `<input type="email" name="${esc(f.name)}" placeholder="${esc(f.placeholder || 'tu@email.com')}" 
                    ${requiredAttr} autocomplete="email">`;
                break;

            default: // text
                inputHtml = `<input type="text" name="${esc(f.name)}" placeholder="${esc(f.placeholder || '')}" 
                    ${requiredAttr}>`;
        }

        return `
            <div class="form-group">
                <label for="${esc(f.name)}">${esc(f.label || f.name)}${requiredMark}</label>
                ${inputHtml}
                <div class="error-msg" id="err-${esc(f.name)}"></div>
            </div>`;
    }).join('');

    // Campos ocultos de UTM + A/B variante
    const utmHidden = `
        <input type="hidden" name="_utmSource" value="${esc(utmParams?.source || '')}">
        <input type="hidden" name="_utmMedium" value="${esc(utmParams?.medium || '')}">
        <input type="hidden" name="_utmCampaign" value="${esc(utmParams?.campaign || '')}">
        ${variantName ? `<input type="hidden" name="_abVariant" value="${esc(variantName)}">` : ''}`;

    return `
    <section class="section form-section" id="form-section">
        <div class="container">
            <div class="form-wrapper">
                <h2>Reserva tu lugar ahora</h2>
                <p class="form-subtitle">Solo toma 15 segundos. Recibirás acceso exclusivo el 29 de marzo.</p>
                <form id="landing-form" novalidate>
                    ${fields}
                    ${utmHidden}
                    <button type="submit" class="btn-primary form-submit">${esc(form.submitText || 'Enviar')}</button>
                </form>
                <div class="form-success" id="form-success">
                    <div class="form-success__icon">✅</div>
                    <p class="form-success__msg">${esc(form.successMessage || '¡Gracias! Te contactaremos pronto.')}</p>
                </div>
            </div>
        </div>
    </section>`;
}

// === 7. FOOTER ===

function renderFooter(content) {
    const footer = content?.footer;
    if (!footer?.text && (!footer?.links || footer.links.length === 0)) {
        // Footer mínimo por defecto
        return `
    <footer class="landing-footer">
        <div class="container">
            <p>© ${new Date().getFullYear()} PianoLink. Todos los derechos reservados.</p>
        </div>
    </footer>`;
    }

    const linksHtml = footer.links?.length 
        ? `<div class="landing-footer__links">${footer.links.map(l => 
            `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a>`
          ).join('')}</div>` 
        : '';

    return `
    <footer class="landing-footer">
        <div class="container">
            ${footer.text ? `<p>${esc(footer.text)}</p>` : ''}
            ${linksHtml}
        </div>
    </footer>`;
}

// === 8. SCRIPTS (inline, sin dependencias) ===

function renderScripts(landing, variantName) {
    const slug = esc(landing.slug);
    const redirectUrl = esc(landing.content?.form?.redirectUrl || '');
    const variantJson = variantName ? `"${esc(variantName)}"` : 'null';

    return `
    <script>
    // === FAQ Accordion ===
    function toggleFaq(i) {
        var item = document.getElementById('faq-' + i);
        if (item) item.classList.toggle('open');
    }

    // === Form Submit ===
    (function() {
        var form = document.getElementById('landing-form');
        var successDiv = document.getElementById('form-success');
        if (!form) return;

        var abVariant = ${variantJson};

        // Tracking: form start (una sola vez)
        var formStarted = false;
        form.addEventListener('focusin', function() {
            if (formStarted) return;
            formStarted = true;
            fetch('/api/crm/landings/public/${slug}/form-start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ _abVariant: abVariant })
            }).catch(function() {});
        });

        form.addEventListener('submit', function(e) {
            e.preventDefault();
            
            // Validación básica
            var valid = true;
            var inputs = form.querySelectorAll('[required]');
            inputs.forEach(function(input) {
                var errEl = document.getElementById('err-' + input.name);
                if (!input.value.trim()) {
                    valid = false;
                    input.style.borderColor = '#ef4444';
                    if (errEl) { errEl.textContent = 'Campo requerido'; errEl.style.display = 'block'; }
                } else {
                    input.style.borderColor = '#d1d5db';
                    if (errEl) errEl.style.display = 'none';
                }
            });

            // Validar email formato
            var emailInput = form.querySelector('[type="email"]');
            if (emailInput && emailInput.value && !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(emailInput.value)) {
                valid = false;
                emailInput.style.borderColor = '#ef4444';
                var errEl = document.getElementById('err-' + emailInput.name);
                if (errEl) { errEl.textContent = 'Email inválido'; errEl.style.display = 'block'; }
            }

            if (!valid) return;

            // Recoger datos
            var data = {};
            new FormData(form).forEach(function(val, key) { data[key] = val; });

            // Deshabilitar botón
            var btn = form.querySelector('[type="submit"]');
            btn.disabled = true;
            btn.textContent = 'Enviando...';

            fetch('/api/crm/landings/public/${slug}/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            })
            .then(function(r) { return r.json(); })
            .then(function(res) {
                if (res.success) {
                    form.style.display = 'none';
                    if (successDiv) successDiv.style.display = 'block';
                    // COMPLETADO: Disparar evento Lead de Meta Pixel al submit exitoso
                    if (typeof fbq !== 'undefined') { fbq('track', 'Lead'); }
                    ${redirectUrl ? `setTimeout(function() { window.location.href = '${redirectUrl}'; }, 2000);` : ''}
                } else {
                    btn.disabled = false;
                    btn.textContent = '${esc(landing.content?.form?.submitText || 'Enviar')}';
                    alert(res.error || 'Error al enviar. Intenta de nuevo.');
                }
            })
            .catch(function() {
                btn.disabled = false;
                btn.textContent = '${esc(landing.content?.form?.submitText || 'Enviar')}';
                alert('Error de conexión. Intenta de nuevo.');
            });
        });
    })();
    </script>
</body>
</html>`;
}


// === BUILDER PRINCIPAL ===

/**
 * Genera el HTML completo de una landing page desde su modelo.
 * @param {Object} landing - Documento CrmLanding (con .content, .seo, etc.)
 * @param {Object} utmParams - { source, medium, campaign } del query string
 * @returns {string} HTML completo listo para enviar al browser
 */
/**
 * Banner de preview visible solo para admins (no se muestra en landing publicada).
 */
function renderPreviewBanner(landing) {
    const statusColors = { draft: '#f59e0b', published: '#10b981', archived: '#6b7280' };
    const statusLabels = { draft: 'Borrador', published: 'Publicada', archived: 'Archivada' };
    const color = statusColors[landing.status] || '#6b7280';
    const label = statusLabels[landing.status] || landing.status;

    return `
    <div style="position:fixed;top:0;left:0;right:0;z-index:9999;background:#1f2937;color:#fff;
        padding:0.625rem 1.5rem;display:flex;align-items:center;justify-content:space-between;
        font-family:system-ui,sans-serif;font-size:0.875rem;box-shadow:0 2px 8px rgba(0,0,0,0.3)">
        <div style="display:flex;align-items:center;gap:0.75rem">
            <span style="background:${color};padding:0.2rem 0.6rem;border-radius:9999px;font-size:0.75rem;font-weight:600">
                ${esc(label)}
            </span>
            <span style="font-weight:600">${esc(landing.name)}</span>
            <span style="color:#9ca3af">— Vista previa (no visible para visitantes)</span>
        </div>
        <div style="display:flex;gap:0.75rem">
            <a href="/l/${esc(landing.slug)}" target="_blank" rel="noopener"
               style="color:#60a5fa;text-decoration:none">Ver pública ↗</a>
            <button onclick="this.parentElement.parentElement.remove();document.body.style.paddingTop='0'"
               style="background:none;border:1px solid #4b5563;color:#d1d5db;padding:0.2rem 0.5rem;
               border-radius:0.25rem;cursor:pointer;font-size:0.75rem">Cerrar</button>
        </div>
    </div>
    <style>body{padding-top:44px !important;}</style>`;
}

function buildLandingHtml(landing, utmParams = {}, options = {}) {
    const content = landing.content || {};
    const previewBanner = options.preview ? renderPreviewBanner(landing) : '';
    const variantName = options.variantName || null;

    // Countdown solo para landing de waitlist
    const countdown = landing.slug === 'waitlist' ? renderCountdown() : '';

    return [
        renderHead(landing),
        previewBanner,
        renderHero(content),
        countdown,
        renderBenefits(content),
        renderTestimonials(content),
        renderFaq(content),
        renderForm(content, landing.slug, utmParams, variantName),
        renderFooter(content),
        renderScripts(landing, variantName)
    ].join('\n');
}

/**
 * Renderiza countdown para el Día 88 (29 de marzo de 2026)
 * COMPLETADO: Countdown para landing de waitlist
 */
function renderCountdown() {
    return `
    <section class="countdown-section" style="background:#0a0a0a;padding:3rem 1.5rem;text-align:center;">
        <div class="container" style="max-width:800px;margin:0 auto;">
            <p style="color:#c9a84c;font-size:0.875rem;letter-spacing:3px;text-transform:uppercase;margin:0 0 1rem;">
                Día 88 · 29 de marzo de 2026
            </p>
            <div id="countdown" style="display:flex;justify-content:center;gap:1.5rem;flex-wrap:wrap;">
                <div class="countdown-item" style="background:#1a1a1a;border-radius:8px;padding:1.25rem 1.5rem;min-width:80px;">
                    <span id="days" style="display:block;font-size:2.5rem;font-weight:bold;color:#fff;font-family:Georgia,serif;">--</span>
                    <span style="color:#888;font-size:0.75rem;text-transform:uppercase;letter-spacing:1px;">Días</span>
                </div>
                <div class="countdown-item" style="background:#1a1a1a;border-radius:8px;padding:1.25rem 1.5rem;min-width:80px;">
                    <span id="hours" style="display:block;font-size:2.5rem;font-weight:bold;color:#fff;font-family:Georgia,serif;">--</span>
                    <span style="color:#888;font-size:0.75rem;text-transform:uppercase;letter-spacing:1px;">Horas</span>
                </div>
                <div class="countdown-item" style="background:#1a1a1a;border-radius:8px;padding:1.25rem 1.5rem;min-width:80px;">
                    <span id="minutes" style="display:block;font-size:2.5rem;font-weight:bold;color:#fff;font-family:Georgia,serif;">--</span>
                    <span style="color:#888;font-size:0.75rem;text-transform:uppercase;letter-spacing:1px;">Minutos</span>
                </div>
                <div class="countdown-item" style="background:#1a1a1a;border-radius:8px;padding:1.25rem 1.5rem;min-width:80px;">
                    <span id="seconds" style="display:block;font-size:2.5rem;font-weight:bold;color:#c9a84c;font-family:Georgia,serif;">--</span>
                    <span style="color:#888;font-size:0.75rem;text-transform:uppercase;letter-spacing:1px;">Segundos</span>
                </div>
            </div>
        </div>
    </section>
    <script>
    (function() {
        // Fecha objetivo: 29 de marzo de 2026 a las 9:00 AM Chile (UTC-3)
        var targetDate = new Date('2026-03-29T12:00:00Z'); // 9:00 AM Chile = 12:00 UTC
        
        function updateCountdown() {
            var now = new Date();
            var diff = targetDate - now;
            
            if (diff <= 0) {
                document.getElementById('days').textContent = '0';
                document.getElementById('hours').textContent = '0';
                document.getElementById('minutes').textContent = '0';
                document.getElementById('seconds').textContent = '0';
                return;
            }
            
            var days = Math.floor(diff / (1000 * 60 * 60 * 24));
            var hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            var minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            var seconds = Math.floor((diff % (1000 * 60)) / 1000);
            
            document.getElementById('days').textContent = days;
            document.getElementById('hours').textContent = hours.toString().padStart(2, '0');
            document.getElementById('minutes').textContent = minutes.toString().padStart(2, '0');
            document.getElementById('seconds').textContent = seconds.toString().padStart(2, '0');
        }
        
        updateCountdown();
        setInterval(updateCountdown, 1000);
    })();
    </script>
    `;
}

module.exports = { buildLandingHtml };
