/**
 * routes/webhooks.js
 * Endpoints para webhooks de pagos - PianoLink v2.0
 * 
 * ⚠️ SEGURIDAD: Todos los webhooks validan firma antes de procesar
 */

const express = require('express');
const router = express.Router();
const PaymentService = require('../services/PaymentService');

/**
 * POST /api/webhooks/mercadopago
 * Webhook de Mercado Pago
 */
router.post('/mercadopago', async (req, res) => {
    console.log('[Webhook] Mercado Pago recibido:', req.body?.type);
    
    try {
        const result = await PaymentService.processMercadoPagoWebhook(req);
        
        if (!result.success && result.error === 'INVALID_SIGNATURE') {
            // Responder 401 pero Mercado Pago espera 200
            // Loguear pero responder OK para evitar reintentos
            console.error('[Webhook] ⚠️ Firma inválida de Mercado Pago');
        }
        
        // Mercado Pago espera 200 siempre
        res.status(200).send('OK');
    } catch (error) {
        console.error('[Webhook] Error MP:', error);
        res.status(200).send('OK'); // Evitar reintentos
    }
});

/**
 * POST /api/webhooks/paypal
 * Webhook de PayPal
 */
router.post('/paypal', async (req, res) => {
    console.log('[Webhook] PayPal recibido:', req.body?.event_type);
    
    try {
        const result = await PaymentService.processPayPalWebhook(req);
        
        if (!result.success && result.error === 'INVALID_SIGNATURE') {
            console.error('[Webhook] ⚠️ Firma inválida de PayPal');
        }
        
        // PayPal espera 200
        res.status(200).send('OK');
    } catch (error) {
        console.error('[Webhook] Error PayPal:', error);
        res.status(200).send('OK');
    }
});

/**
 * GET /api/webhooks/test
 * Para verificar que los endpoints están activos (dev only)
 */
router.get('/test', (req, res) => {
    if (process.env.NODE_ENV === 'production') {
        return res.status(404).send('Not found');
    }
    res.json({ 
        status: 'Webhook endpoints active',
        endpoints: ['/mercadopago', '/paypal']
    });
});

module.exports = router;
