/**
 * crm/routes/crmLandingPublicRoutes.js
 * Ruta pública GET /l/:slug → renderiza la landing page como HTML completo.
 * Sin autenticación. Se monta en server.js directamente.
 */
const express = require('express');
const router = express.Router();
const CrmLandingService = require('../services/CrmLandingService');
const CrmLanding = require('../models/CrmLanding');
const { buildLandingHtml } = require('../views/landingRenderer');

/**
 * GET /l/:slug
 * Renderiza una landing publicada como HTML server-side.
 * Soporta A/B testing: selecciona variante por peso aleatorio.
 * Incrementa métricas automáticamente (global + variante).
 */
router.get('/:slug', async (req, res) => {
    try {
        const { slug } = req.params;

        // Obtener landing publicada (incrementa vistas internamente)
        const result = await CrmLandingService.getPublishedBySlug(slug);

        if (!result.success || !result.data) {
            return res.status(404).send(buildNotFoundHtml());
        }

        const landing = result.data;

        // Pasar UTM params del query string para tracking en el form
        const utmParams = {
            source: req.query.utm_source || '',
            medium: req.query.utm_medium || '',
            campaign: req.query.utm_campaign || ''
        };

        // === A/B Testing: seleccionar variante ===
        let selectedVariant = null;
        let contentForRender = landing.content;

        if (landing.abTest?.enabled && landing.abTest.variants?.length > 0) {
            selectedVariant = selectVariant(landing.abTest.variants);

            if (selectedVariant) {
                // Merge overrides sobre el contenido base (sin mutar el original)
                contentForRender = applyVariantOverrides(landing.content, selectedVariant.overrides);

                // Incrementar views de la variante
                CrmLanding.incrementMetric(landing._id, 'views', 1, selectedVariant.name).catch(() => {});
            }
        }

        // Generar HTML completo (crear copia temporal con content modificado si hay variante)
        const landingForRender = selectedVariant
            ? { ...landing.toObject ? landing.toObject() : landing, content: contentForRender }
            : landing;

        const html = buildLandingHtml(landingForRender, utmParams, {
            variantName: selectedVariant?.name || null
        });

        // Cache público breve para no golpear DB en cada request
        res.set('Cache-Control', 'public, max-age=60');
        res.set('Content-Type', 'text/html; charset=utf-8');

        // Header custom para debugging de A/B (no visible al usuario final)
        if (selectedVariant) {
            res.set('X-AB-Variant', selectedVariant.name);
        }

        res.send(html);

    } catch (error) {
        console.error(`[CRM Landing Render] Error en /l/${req.params.slug}:`, error.message);
        res.status(500).send(buildErrorHtml());
    }
});

/**
 * Selecciona una variante aleatoriamente según pesos.
 * El "control" (sin variante) recibe el peso restante.
 * @param {Array} variants - Array de variantes con .weight
 * @returns {Object|null} Variante seleccionada o null (control)
 */
function selectVariant(variants) {
    if (!variants || variants.length === 0) return null;

    // Calcular peso total de variantes
    const totalVariantWeight = variants.reduce((sum, v) => sum + (v.weight || 0), 0);
    // El control recibe 100 - totalVariantWeight (mínimo 0)
    const controlWeight = Math.max(0, 100 - totalVariantWeight);
    const totalWeight = controlWeight + totalVariantWeight;

    const random = Math.random() * totalWeight;

    // ¿Cae en el rango del control?
    if (random < controlWeight) return null;

    // Recorrer variantes
    let cumulative = controlWeight;
    for (const variant of variants) {
        cumulative += (variant.weight || 0);
        if (random < cumulative) return variant;
    }

    return null; // Fallback a control
}

/**
 * Aplica overrides de una variante sobre el contenido base.
 * Merge superficial por sección (hero, form). No muta el original.
 * @param {Object} baseContent
 * @param {Object} overrides
 * @returns {Object} Contenido con overrides aplicados
 */
function applyVariantOverrides(baseContent, overrides) {
    if (!overrides) return baseContent;

    // Deep copy ligero del contenido (solo las secciones que pueden cambiar)
    const merged = JSON.parse(JSON.stringify(baseContent));

    // Merge hero
    if (overrides.hero) {
        if (!merged.hero) merged.hero = {};
        for (const [key, val] of Object.entries(overrides.hero)) {
            if (val !== undefined && val !== null && val !== '') {
                merged.hero[key] = val;
            }
        }
    }

    // Merge form
    if (overrides.form) {
        if (!merged.form) merged.form = {};
        for (const [key, val] of Object.entries(overrides.form)) {
            if (val !== undefined && val !== null && val !== '') {
                merged.form[key] = val;
            }
        }
    }

    return merged;
}

// === Páginas de error minimalistas ===

function buildNotFoundHtml() {
    return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Página no encontrada</title>
<style>body{font-family:system-ui,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f9fafb;color:#374151}
.c{text-align:center}.c h1{font-size:4rem;margin:0;color:#9ca3af}.c p{margin:1rem 0;font-size:1.125rem}
a{color:#4f46e5;text-decoration:none}a:hover{text-decoration:underline}</style></head>
<body><div class="c"><h1>404</h1><p>Esta página no existe o no está publicada.</p><a href="/">← Volver al inicio</a></div></body></html>`;
}

function buildErrorHtml() {
    return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Error</title>
<style>body{font-family:system-ui,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f9fafb;color:#374151}
.c{text-align:center}.c h1{font-size:2rem;margin:0;color:#ef4444}.c p{margin:1rem 0}
a{color:#4f46e5;text-decoration:none}</style></head>
<body><div class="c"><h1>Error temporal</h1><p>Intenta de nuevo en unos momentos.</p><a href="/">← Volver al inicio</a></div></body></html>`;
}

module.exports = router;
