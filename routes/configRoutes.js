/**
 * routes/configRoutes.js
 * Endpoints públicos de configuración de la plataforma.
 * 
 * Fase 5 — v5.0: Oferta para Madrugadores (Early Bird Upsell)
 * 
 * No requiere autenticación — sirve datos de config visibles al público
 * (precios de oferta, textos, estado de habilitación).
 */

const express = require('express');
const router = express.Router();
const GlobalConfig = require('../models/GlobalConfig');

/**
 * GET /api/config/early-bird
 * Retorna configuración pública de la oferta early bird.
 * Usado por success_waitlist.html para mostrar precio, textos y countdown.
 * No requiere auth.
 */
router.get('/early-bird', async (req, res) => {
    try {
        const config = await GlobalConfig.findOne({ isDefault: true });
        const earlyBird = config?.memberships?.earlyBirdOffer;

        if (!earlyBird || !earlyBird.enabled) {
            return res.json({
                success: true,
                enabled: false
            });
        }

        res.json({
            success: true,
            enabled: true,
            welcomeKitPriceUSD: earlyBird.welcomeKitPriceUSD || 2900,
            welcomeKitRegularPriceUSD: earlyBird.welcomeKitRegularPriceUSD || 4400,
            headline: earlyBird.headline || '¡Oferta exclusiva para madrugadores!',
            subtitle: earlyBird.subtitle || 'Por registrarte hoy, accede al Welcome Kit con descuento único',
            ctaText: earlyBird.ctaText || 'Comprar Welcome Kit — $29 USD',
            expiresAfterMinutes: earlyBird.expiresAfterMinutes || 30
        });
    } catch (error) {
        console.error('[ConfigRoutes] Error obteniendo early-bird config:', error.message);
        res.status(500).json({ success: false, error: 'Error interno' });
    }
});

module.exports = router;
