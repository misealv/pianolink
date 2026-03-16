/**
 * routes/botRoutes.js
 * Webhook de Twilio WhatsApp para bot de setup/calificación.
 * POST /api/bot/wa — recibe mensajes de Twilio (form-urlencoded)
 */
const express = require('express');
const router = express.Router();
const WhatsAppBotService = require('../services/WhatsAppBotService');
const twilio = require('twilio');

// POST /api/bot/wa — Twilio envía From=whatsapp:+56x&Body=texto
router.post('/wa', async (req, res) => {
    const twiml = new twilio.twiml.MessagingResponse();

    const from = req.body?.From || '';
    const text = (req.body?.Body || '').trim();
    const mediaUrl = req.body?.MediaUrl0 || null;
    const phone = from.replace('whatsapp:', '');

    if (!text && !mediaUrl) {
        return res.type('text/xml').send(twiml.toString());
    }

    console.log(`[Bot PL] Mensaje de ${phone}: ${text}${mediaUrl ? ' [+imagen]' : ''}`);

    try {
        const reply = await WhatsAppBotService.processMessage(phone, text, mediaUrl);

        // Twilio límite 1600 chars — partir si es necesario
        const MAX = 1500;
        if (reply.length <= MAX) {
            twiml.message(reply);
        } else {
            const parts = reply.match(new RegExp(`.{1,${MAX}}(\\s|$)`, 'g')) || [reply];
            parts.forEach(p => twiml.message(p.trim()));
        }
    } catch (err) {
        console.error('[Bot PL] Error:', err.message);
        twiml.message('Disculpa, tuve un problema técnico. ¿Puedes repetir tu mensaje?');
    }

    res.type('text/xml').send(twiml.toString());
});

module.exports = router;
