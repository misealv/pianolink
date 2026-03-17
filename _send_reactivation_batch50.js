/**
 * Enviar lote de prueba: 50 leads de reactivación.
 * Usa processDailyBatch(50) — misma lógica exacta del cron.
 */
require('dotenv').config();
const mongoose = require('mongoose');

async function run() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ MongoDB conectado');

    // Cargar modelos necesarios
    require('./models/Lead');

    const CrmReactivationService = require('./crm/services/CrmReactivationService');
    const result = await CrmReactivationService.processDailyBatch(50);

    console.log('\n📊 Resultado:', JSON.stringify(result, null, 2));
    await mongoose.disconnect();
}

run().catch(e => { console.error(e); process.exit(1); });
