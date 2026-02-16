/**
 * scripts/setWaitlistRedirect.js
 * 
 * Configura el redirectUrl del landing /l/waitlist para apuntar a /success-waitlist.
 * Fase 5 — v5.0: Oferta Early Bird post-waitlist.
 * 
 * Uso: node scripts/setWaitlistRedirect.js
 * 
 * ⚠️ Ejecutar UNA sola vez. El script es idempotente.
 */

require('dotenv').config();
const mongoose = require('mongoose');

async function run() {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        console.error('❌ MONGODB_URI no definida en .env');
        process.exit(1);
    }

    await mongoose.connect(uri);
    console.log('✅ Conectado a MongoDB');

    // Importar modelo CrmLanding
    let CrmLanding;
    try {
        CrmLanding = require('../crm/models/CrmLanding');
    } catch (e) {
        // Si el modelo no existe por ruta, intentar buscarlo
        console.error('❌ No se pudo importar CrmLanding:', e.message);
        process.exit(1);
    }

    // Buscar landing de waitlist
    const landing = await CrmLanding.findOne({ slug: 'waitlist' });

    if (!landing) {
        console.error('❌ No se encontró landing con slug "waitlist".');
        console.log('   Asegúrate de haber ejecutado el seed de CRM antes.');
        await mongoose.disconnect();
        process.exit(1);
    }

    // Verificar estado actual
    const currentRedirect = landing.content?.form?.redirectUrl;
    if (currentRedirect === '/success-waitlist') {
        console.log('✅ redirectUrl ya está configurado como /success-waitlist. No se requieren cambios.');
        await mongoose.disconnect();
        process.exit(0);
    }

    console.log(`📋 Estado actual: redirectUrl = "${currentRedirect || '(no configurado)'}"`);

    // Actualizar
    if (!landing.content) landing.content = {};
    if (!landing.content.form) landing.content.form = {};
    landing.content.form.redirectUrl = '/success-waitlist';

    await landing.save();

    console.log('✅ redirectUrl actualizado a /success-waitlist');
    console.log('   Ahora cuando un lead complete el formulario en /l/waitlist,');
    console.log('   será redirigido a /success-waitlist con la oferta early bird.');

    await mongoose.disconnect();
    console.log('✅ Desconectado de MongoDB');
}

run().catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
});
