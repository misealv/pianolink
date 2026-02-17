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

        /* === INSTAGRAM DEMO === */
        .demo-section {
            background: linear-gradient(180deg, #0a0a0a 0%, #141414 100%);
            padding: 4.5rem 1.5rem;
            text-align: center;
        }
        .demo-section__badge {
            display: inline-block;
            color: #c9a84c;
            font-size: 0.8rem;
            letter-spacing: 3px;
            text-transform: uppercase;
            margin-bottom: 1rem;
            font-weight: 600;
        }
        .demo-section__title {
            font-size: clamp(1.5rem, 4vw, 2.25rem);
            font-weight: 700;
            color: #fff;
            margin-bottom: 0.75rem;
        }
        .demo-section__subtitle {
            color: #9ca3af;
            font-size: 1rem;
            max-width: 520px;
            margin: 0 auto 2.5rem;
            line-height: 1.6;
        }
        .demo-section__embed {
            max-width: 400px;
            margin: 0 auto;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 16px 48px rgba(201, 168, 76, 0.12), 0 4px 16px rgba(0,0,0,0.4);
        }
        .demo-section__embed blockquote {
            margin: 0 !important;
            border-radius: 12px !important;
            max-width: 100% !important;
        }
        .demo-section__cta {
            margin-top: 2rem;
        }
        .demo-section__cta a {
            color: #c9a84c;
            font-weight: 600;
            font-size: 0.95rem;
            text-decoration: none;
            transition: opacity 0.2s;
        }
        .demo-section__cta a:hover {
            opacity: 0.8;
            text-decoration: none;
        }

        /* === RESPONSIVE === */
        @media (max-width: 640px) {
            .section { padding: 3rem 1rem; }
            .hero { min-height: 60vh; padding: 3rem 1rem; }
            .form-wrapper { padding: 1.5rem; }
            .benefits__grid, .testimonials__grid {
                grid-template-columns: 1fr;
            }
            .demo-section { padding: 3rem 1rem; }
            .demo-section__embed { max-width: 100%; }
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

// === 4.5 INSTAGRAM DEMO (solo waitlist) ===

function renderInstagramDemo() {
    return `
    <section class="demo-section">
        <div class="container" style="max-width:800px;margin:0 auto;">
            <span class="demo-section__badge">Demo en vivo</span>
            <h2 class="demo-section__title">Mira cómo funciona PianoLink</h2>
            <p class="demo-section__subtitle">
                Tecnología MIDI en tiempo real. Tu profesor ve exactamente qué teclas tocas desde cualquier parte del mundo.
            </p>
            <div class="demo-section__embed">
                <blockquote class="instagram-media" data-instgrm-captioned data-instgrm-permalink="https://www.instagram.com/reel/DUxJIK7jVWS/?utm_source=ig_embed&amp;utm_campaign=loading" data-instgrm-version="14" style="background:#FFF; border:0; border-radius:12px; box-shadow:none; margin:0; max-width:100%; min-width:280px; padding:0; width:100%;">
                    <div style="padding:16px;">
                        <a href="https://www.instagram.com/reel/DUxJIK7jVWS/?utm_source=ig_embed&amp;utm_campaign=loading" style="background:#FFFFFF; line-height:0; padding:0; text-align:center; text-decoration:none; width:100%;" target="_blank">
                            <div style="display:flex; flex-direction:row; align-items:center;">
                                <div style="background-color:#F4F4F4; border-radius:50%; flex-grow:0; height:40px; margin-right:14px; width:40px;"></div>
                                <div style="display:flex; flex-direction:column; flex-grow:1; justify-content:center;">
                                    <div style="background-color:#F4F4F4; border-radius:4px; flex-grow:0; height:14px; margin-bottom:6px; width:100px;"></div>
                                    <div style="background-color:#F4F4F4; border-radius:4px; flex-grow:0; height:14px; width:60px;"></div>
                                </div>
                            </div>
                            <div style="padding:19% 0;"></div>
                            <div style="display:block; height:50px; margin:0 auto 12px; width:50px;"><svg width="50px" height="50px" viewBox="0 0 60 60" version="1.1" xmlns="https://www.w3.org/2000/svg"><g stroke="none" stroke-width="1" fill="none" fill-rule="evenodd"><g transform="translate(-511.000000, -20.000000)" fill="#000000"><g><path d="M556.869,30.41 C554.814,30.41 553.148,32.076 553.148,34.131 C553.148,36.186 554.814,37.852 556.869,37.852 C558.924,37.852 560.59,36.186 560.59,34.131 C560.59,32.076 558.924,30.41 556.869,30.41 M541,60.657 C535.114,60.657 530.342,55.887 530.342,50 C530.342,44.114 535.114,39.342 541,39.342 C546.887,39.342 551.658,44.114 551.658,50 C551.658,55.887 546.887,60.657 541,60.657 M541,33.886 C532.1,33.886 524.886,41.1 524.886,50 C524.886,58.899 532.1,66.113 541,66.113 C549.9,66.113 557.115,58.899 557.115,50 C557.115,41.1 549.9,33.886 541,33.886 M565.378,62.101 C565.244,65.022 564.756,66.606 564.346,67.663 C563.803,69.06 563.154,70.057 562.106,71.106 C561.058,72.155 560.06,72.803 558.662,73.347 C557.607,73.757 556.021,74.244 553.102,74.378 C549.944,74.521 548.997,74.552 541,74.552 C533.003,74.552 532.056,74.521 528.898,74.378 C525.979,74.244 524.393,73.757 523.338,73.347 C521.94,72.803 520.942,72.155 519.894,71.106 C518.846,70.057 518.197,69.06 517.654,67.663 C517.244,66.606 516.755,65.022 516.623,62.101 C516.479,58.943 516.448,57.996 516.448,50 C516.448,42.003 516.479,41.056 516.623,37.899 C516.755,34.978 517.244,33.391 517.654,32.338 C518.197,30.938 518.846,29.942 519.894,28.894 C520.942,27.846 521.94,27.196 523.338,26.654 C524.393,26.244 525.979,25.756 528.898,25.623 C532.057,25.479 533.004,25.448 541,25.448 C548.997,25.448 549.943,25.479 553.102,25.623 C556.021,25.756 557.607,26.244 558.662,26.654 C560.06,27.196 561.058,27.846 562.106,28.894 C563.154,29.942 563.803,30.938 564.346,32.338 C564.756,33.391 565.244,34.978 565.378,37.899 C565.522,41.056 565.552,42.003 565.552,50 C565.552,57.996 565.522,58.943 565.378,62.101 M570.82,37.631 C570.674,34.438 570.167,32.258 569.425,30.349 C568.659,28.377 567.633,26.702 565.965,25.035 C564.297,23.368 562.623,22.342 560.652,21.575 C558.743,20.834 556.562,20.326 553.369,20.18 C550.169,20.033 549.148,20 541,20 C532.853,20 531.831,20.033 528.631,20.18 C525.438,20.326 523.257,20.834 521.349,21.575 C519.376,22.342 517.703,23.368 516.035,25.035 C514.368,26.702 513.342,28.377 512.574,30.349 C511.834,32.258 511.326,34.438 511.181,37.631 C511.035,40.831 511,41.851 511,50 C511,58.147 511.035,59.17 511.181,62.369 C511.326,65.562 511.834,67.743 512.574,69.651 C513.342,71.625 514.368,73.296 516.035,74.965 C517.703,76.634 519.376,77.658 521.349,78.425 C523.257,79.167 525.438,79.673 528.631,79.82 C531.831,79.965 532.853,80.001 541,80.001 C549.148,80.001 550.169,79.965 553.369,79.82 C556.562,79.673 558.743,79.167 560.652,78.425 C562.623,77.658 564.297,76.634 565.965,74.965 C567.633,73.296 568.659,71.625 569.425,69.651 C570.167,67.743 570.674,65.562 570.82,62.369 C570.966,59.17 571,58.147 571,50 C571,41.851 570.966,40.831 570.82,37.631"></path></g></g></g></svg></div>
                            <div style="padding-top:8px;">
                                <div style="color:#3897f0; font-family:Arial,sans-serif; font-size:14px; font-style:normal; font-weight:550; line-height:18px;">Ver esta publicación en Instagram</div>
                            </div>
                            <div style="padding:12.5% 0;"></div>
                        </a>
                        <p style="color:#c9c8cd; font-family:Arial,sans-serif; font-size:14px; line-height:17px; margin-bottom:0; margin-top:8px; overflow:hidden; padding:8px 0 7px; text-align:center; text-overflow:ellipsis; white-space:nowrap;">
                            <a href="https://www.instagram.com/reel/DUxJIK7jVWS/?utm_source=ig_embed&amp;utm_campaign=loading" style="color:#c9c8cd; font-family:Arial,sans-serif; font-size:14px; font-style:normal; font-weight:normal; line-height:17px; text-decoration:none;" target="_blank">Una publicación compartida por Miguel Antonio (@miguel_antonio_piano)</a>
                        </p>
                    </div>
                </blockquote>
            </div>
            <div class="demo-section__cta">
                <a href="#form-section">Reserva tu lugar ahora ↓</a>
            </div>
        </div>
    </section>
    <script async src="//www.instagram.com/embed.js"></script>`;
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
                    ${redirectUrl ? `
                    // Pasar email del formulario al redirect para que la página de destino lo use
                    var redirectBase = '${redirectUrl}';
                    var emailVal = data.email || '';
                    var sep = redirectBase.indexOf('?') !== -1 ? '&' : '?';
                    var fullRedirect = emailVal ? redirectBase + sep + 'email=' + encodeURIComponent(emailVal) : redirectBase;
                    setTimeout(function() { window.location.href = fullRedirect; }, 2000);` : ''}
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

    // Countdown y demo solo para landing de waitlist
    const countdown = landing.slug === 'waitlist' ? renderCountdown() : '';
    const instagramDemo = landing.slug === 'waitlist' ? renderInstagramDemo() : '';

    return [
        renderHead(landing),
        previewBanner,
        renderHero(content),
        countdown,
        renderBenefits(content),
        instagramDemo,
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
