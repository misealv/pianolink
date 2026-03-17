/**
 * _preview_all_emails.js
 * Envía los 11 emails de campaña a una dirección para revisión.
 * Ejecutar: node _preview_all_emails.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { Resend } = require('resend');
const CrmEmailCampaign = require('./crm/models/CrmEmailCampaign');

const TO = 'miseal@gmail.com';
const FROM = `${process.env.EMAIL_FROM_NAME || 'PianoLink'} <${process.env.EMAIL_FROM || 'hola@pianolink.net'}>`;

async function main() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ MongoDB conectado');

    const resend = new Resend(process.env.RESEND_API_KEY);
    const campaigns = await CrmEmailCampaign.find({}).sort({ ordenSecuencia: 1 }).lean();
    console.log(`📧 ${campaigns.length} campañas encontradas\n`);

    for (const c of campaigns) {
        // Reemplazar variables de template con datos de prueba
        const html = (c.contenidoHtml || '')
            .replace(/\{\{nombre\}\}/g, 'Miguel')
            .replace(/\{\{unsubscribe_url\}\}/g, '#')
            .replace(/\{\{cupos_restantes\}\}/g, '42');

        const subject = (c.asunto || '')
            .replace(/\{\{nombre\}\}/g, 'Miguel')
            .replace(/\{\{cupos_restantes\}\}/g, '42');

        const label = `[${c.ordenSecuencia || 'T'}] ${c.nombre}`;

        try {
            await resend.emails.send({
                from: FROM,
                to: TO,
                subject: `[PREVIEW ${c.ordenSecuencia || 'T'}] ${subject}`,
                html: html
            });
            console.log(`  ✅ ${label}`);
        } catch (err) {
            console.error(`  ❌ ${label}: ${err.message}`);
        }

        // Resend rate limit: esperar 200ms entre envíos
        await new Promise(r => setTimeout(r, 200));
    }

    console.log(`\n✅ ${campaigns.length} emails enviados a ${TO}`);
    await mongoose.disconnect();
}

main().catch(e => { console.error('❌', e); process.exit(1); });
