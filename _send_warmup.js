/**
 * _send_warmup.js
 * 
 * Envío escalonado (warm-up) de campañas de email.
 * Protege la reputación del dominio pianolink.net enviando en lotes progresivos.
 * 
 * Estrategia:
 *   Lote 1: 200 emails (los más recientes = más engaged)
 *   Lote 2: 400
 *   Lote 3: 800
 *   Lote 4: 1500
 *   Lote 5: resto (~3366)
 * 
 * Cada lote se ejecuta manualmente después de verificar métricas del anterior.
 * 
 * Uso:
 *   node _send_warmup.js --campaign <ID> --batch <1-5> [--dry-run]
 *   node _send_warmup.js --list                          (ver campañas)
 *   node _send_warmup.js --status                        (ver estado warm-up)
 */
require('dotenv').config();
const mongoose = require('mongoose');
const CrmEmailCampaign = require('./crm/models/CrmEmailCampaign');
const CrmLead = require('./crm/models/CrmLead');
const Lead = require('./models/Lead');

const BATCH_SIZES = [200, 400, 800, 1500, Infinity];
const BATCH_DELAY_MS = 1500; // entre micro-batches de 50
const MICRO_BATCH = 50;

async function connectDB() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Conectado a MongoDB');
}

// Listar campañas disponibles
async function listCampaigns() {
    const camps = await CrmEmailCampaign.find({}, 'nombre tipo estado ordenSecuencia metricas')
        .sort('ordenSecuencia');
    
    console.log('\n📧 Campañas disponibles:\n');
    console.log('ID                         | # | Estado     | Enviados | Nombre');
    console.log('─'.repeat(90));
    camps.forEach(c => {
        const env = (c.metricas?.totalEnviados || 0).toString().padStart(6);
        const ord = (c.ordenSecuencia || '—').toString().padStart(2);
        console.log(`${c._id} | ${ord} | ${c.estado.padEnd(10)} | ${env}   | ${c.nombre}`);
    });

    const total = await CrmLead.countDocuments({
        'emailPreferences.unsubscribed': { $ne: true },
        'emailPreferences.bounced': { $ne: true }
    });
    console.log(`\n📊 Suscriptores enviables: ${total}`);
    console.log(`📋 Lotes warm-up: ${BATCH_SIZES.map((s, i) => `Lote ${i + 1}: ${s === Infinity ? 'resto' : s}`).join(' → ')}`);
}

// Ver estado del warm-up
async function showStatus() {
    const camps = await CrmEmailCampaign.find({ estado: { $in: ['enviado', 'enviando'] } }, 'nombre metricas estado')
        .sort({ fechaEnviado: -1 });
    
    if (camps.length === 0) {
        console.log('\n⚠️  No hay campañas enviadas aún.');
        return;
    }

    console.log('\n📊 Estado de campañas enviadas:\n');
    let totalSent = 0, totalOpen = 0, totalClick = 0, totalBounce = 0;
    camps.forEach(c => {
        const m = c.metricas || {};
        const s = m.totalEnviados || 0;
        const o = m.totalAbiertos || 0;
        const cl = m.totalClicks || 0;
        const b = m.totalRebotes || 0;
        totalSent += s; totalOpen += o; totalClick += cl; totalBounce += b;
        const openRate = s > 0 ? ((o / s) * 100).toFixed(1) : '0.0';
        const bounceRate = s > 0 ? ((b / s) * 100).toFixed(1) : '0.0';
        console.log(`${c.nombre}`);
        console.log(`  Enviados: ${s} | Abiertos: ${o} (${openRate}%) | Clicks: ${cl} | Rebotes: ${b} (${bounceRate}%)`);
    });

    const globalOpen = totalSent > 0 ? ((totalOpen / totalSent) * 100).toFixed(1) : '0.0';
    const globalBounce = totalSent > 0 ? ((totalBounce / totalSent) * 100).toFixed(1) : '0.0';
    console.log(`\n─── GLOBAL ───`);
    console.log(`Total enviados: ${totalSent} | Abiertos: ${totalOpen} (${globalOpen}%) | Rebotes: ${totalBounce} (${globalBounce}%)`);
    
    if (parseFloat(globalBounce) > 5) {
        console.log('\n🚨 ALERTA: Tasa de rebote > 5%. Pausa los envíos y limpia la lista.');
    } else if (parseFloat(globalBounce) > 2) {
        console.log('\n⚠️  Tasa de rebote elevada (>2%). Monitorear de cerca.');
    } else {
        console.log('\n✅ Métricas saludables. Puedes continuar con el siguiente lote.');
    }
}

// Enviar un lote de la campaña
async function sendBatch(campaignId, batchNumber, dryRun) {
    const campaign = await CrmEmailCampaign.findById(campaignId);
    if (!campaign) {
        console.error('❌ Campaña no encontrada:', campaignId);
        return;
    }

    console.log(`\n📧 Campaña: "${campaign.nombre}"`);
    console.log(`📦 Lote: ${batchNumber} de ${BATCH_SIZES.length}`);

    // Obtener todos los suscriptores enviables, ordenados por fecha (más recientes primero = más engaged)
    const crmLeads = await CrmLead.find({
        'emailPreferences.unsubscribed': { $ne: true },
        'emailPreferences.bounced': { $ne: true }
    })
    .populate('leadRef', 'name email')
    .sort({ createdAt: -1 }); // Más recientes primero

    // Filtrar los que ya recibieron este email (tienen interacción con este campaignId)
    const alreadySent = campaign.metricas?.totalEnviados || 0;

    // Calcular rango del lote
    let start = 0;
    for (let i = 0; i < batchNumber - 1; i++) {
        start += BATCH_SIZES[i];
    }
    const batchSize = BATCH_SIZES[batchNumber - 1] === Infinity 
        ? crmLeads.length - start 
        : BATCH_SIZES[batchNumber - 1];
    const end = Math.min(start + batchSize, crmLeads.length);

    const batch = crmLeads.slice(start, end).filter(cl => cl.leadRef && cl.leadRef.email);

    console.log(`👥 Suscriptores en este lote: ${batch.length} (índice ${start}-${end - 1} de ${crmLeads.length})`);

    if (batch.length === 0) {
        console.log('⚠️  No hay suscriptores en este rango.');
        return;
    }

    if (dryRun) {
        console.log('\n🔍 DRY RUN — No se enviarán emails reales.');
        console.log(`Primeros 5 destinatarios:`);
        batch.slice(0, 5).forEach(cl => {
            console.log(`  - ${cl.leadRef.email} (${cl.leadRef.name})`);
        });
        console.log(`  ... y ${Math.max(0, batch.length - 5)} más.`);
        return;
    }

    // Inicializar Resend
    const CrmResendService = require('./crm/services/CrmResendService');
    const resendService = new CrmResendService();
    if (!resendService.isConfigured()) {
        console.error('❌ Resend no configurado. Verifica RESEND_API_KEY.');
        return;
    }

    console.log(`\n🚀 Enviando ${batch.length} emails...`);
    let enviados = 0, errores = 0;

    for (let i = 0; i < batch.length; i += MICRO_BATCH) {
        const microBatch = batch.slice(i, i + MICRO_BATCH);

        for (const crmLead of microBatch) {
            const lead = crmLead.leadRef;
            try {
                const result = await resendService.sendEmail(
                    lead.email,
                    campaign.asunto,
                    campaign.contenidoHtml,
                    { nombre: lead.name || 'amigo/a' }
                );
                if (result.success) {
                    enviados++;
                } else {
                    errores++;
                    console.error(`  ❌ ${lead.email}: ${result.error}`);
                }
            } catch (e) {
                errores++;
                console.error(`  ❌ ${lead.email}: ${e.message}`);
            }
        }

        // Progreso
        const progress = Math.min(i + MICRO_BATCH, batch.length);
        process.stdout.write(`\r  📤 ${progress}/${batch.length} (${enviados} ok, ${errores} err)`);

        // Delay entre micro-batches
        if (i + MICRO_BATCH < batch.length) {
            await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
        }
    }

    // Actualizar métricas de la campaña
    campaign.metricas.totalEnviados = (campaign.metricas.totalEnviados || 0) + enviados;
    if (campaign.estado === 'borrador') campaign.estado = 'enviando';
    
    // Si es el último lote, marcar como enviado
    if (batchNumber >= BATCH_SIZES.length || end >= crmLeads.length) {
        campaign.estado = 'enviado';
        campaign.fechaEnviado = new Date();
    }
    await campaign.save();

    console.log(`\n\n✅ Lote ${batchNumber} completado: ${enviados} enviados, ${errores} errores`);
    console.log(`📊 Total acumulado campaña: ${campaign.metricas.totalEnviados} enviados`);

    if (batchNumber < BATCH_SIZES.length && end < crmLeads.length) {
        console.log(`\n⏭  Siguiente: node _send_warmup.js --campaign ${campaignId} --batch ${batchNumber + 1}`);
        console.log(`⚠️  Espera mínimo 4-6 horas y revisa métricas antes del siguiente lote.`);
    }
}

// === MAIN ===
async function main() {
    const args = process.argv.slice(2);

    if (args.includes('--list')) {
        await connectDB();
        await listCampaigns();
        await mongoose.disconnect();
        return;
    }

    if (args.includes('--status')) {
        await connectDB();
        await showStatus();
        await mongoose.disconnect();
        return;
    }

    const campaignIdx = args.indexOf('--campaign');
    const batchIdx = args.indexOf('--batch');
    const dryRun = args.includes('--dry-run');

    if (campaignIdx === -1 || batchIdx === -1) {
        console.log(`
Uso:
  node _send_warmup.js --list                              Ver campañas
  node _send_warmup.js --status                            Ver métricas
  node _send_warmup.js --campaign <ID> --batch <1-5>       Enviar lote
  node _send_warmup.js --campaign <ID> --batch 1 --dry-run Simular

Warm-up: Lote 1 (200) → Lote 2 (400) → Lote 3 (800) → Lote 4 (1500) → Lote 5 (resto)
Esperar 4-6h entre lotes. Verificar métricas antes de continuar.
        `);
        return;
    }

    const campaignId = args[campaignIdx + 1];
    const batchNumber = parseInt(args[batchIdx + 1]);

    if (!campaignId || isNaN(batchNumber) || batchNumber < 1 || batchNumber > 5) {
        console.error('❌ Parámetros inválidos. Batch debe ser 1-5.');
        return;
    }

    await connectDB();
    await sendBatch(campaignId, batchNumber, dryRun);
    await mongoose.disconnect();
}

main().catch(e => {
    console.error('Error fatal:', e);
    process.exit(1);
});
