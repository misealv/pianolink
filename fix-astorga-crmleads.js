/**
 * Script para crear CrmLeads faltantes de las usuarias Astorga
 * Bug: pipelineTeacher: null causaba error de validación en enum
 * 
 * Leads afectados:
 * - danielaastorga@yahoo.com (lead prueba, tipo client)
 * - dastorga.consultoria@gmail.com (compró, tipo client, ya tiene User)
 */
require('dotenv').config();
const mongoose = require('mongoose');

async function fix() {
    await mongoose.connect(process.env.MONGO_URI);
    
    const Lead = require('./models/Lead');
    const CrmLead = require('./crm/models/CrmLead');
    const CrmLeadService = require('./crm/services/CrmLeadService');
    const CrmInteraction = require('./crm/models/CrmInteraction');
    
    const emails = [
        'danielaastorga@yahoo.com',
        'dastorga.consultoria@gmail.com'
    ];
    
    for (const email of emails) {
        console.log(`\n--- Procesando: ${email} ---`);
        
        const lead = await Lead.findOne({ email: email.toLowerCase() });
        if (!lead) {
            console.log(`  ❌ Lead no encontrado en core`);
            continue;
        }
        
        // Verificar si ya tiene CrmLead
        const existing = await CrmLead.findOne({ leadRef: lead._id });
        if (existing) {
            console.log(`  ✅ CrmLead ya existe: ${existing._id}`);
            continue;
        }
        
        // Crear CrmLead
        const enrichment = {
            channel: 'organic',
            utmSource: lead.utmSource || '',
            utmMedium: lead.utmMedium || '',
            utmCampaign: lead.utmCampaign || '',
            tags: ['fix_manual_pipeline_bug']
        };
        
        const result = await CrmLeadService.findOrCreateFromCoreLead(lead._id, enrichment);
        if (result.success) {
            console.log(`  ✅ CrmLead creado: ${result.data._id}`);
            console.log(`     Score: ${result.data.score}`);
            console.log(`     Segment: ${result.data.segment}`);
            console.log(`     PipelineStudent: ${result.data.pipelineStudent}`);
            console.log(`     PipelineTeacher: ${result.data.pipelineTeacher}`);
            
            // Si el lead ya está convertido, actualizar score y lifecycle
            if (lead.status === 'converted') {
                result.data.score = 90;
                result.data.segment = 'customer';
                result.data.lifecycleStage = 'customer';
                result.data.convertedAt = lead.convertedAt || new Date();
                await result.data.save();
                console.log(`  📈 Actualizado a customer (score: 90) porque lead está convertido`);
            }
        } else {
            console.log(`  ❌ Error creando CrmLead: ${result.message}`);
        }
    }
    
    // Verificar resultados
    console.log('\n=== VERIFICACIÓN FINAL ===');
    for (const email of emails) {
        const lead = await Lead.findOne({ email: email.toLowerCase() });
        const crmLead = lead ? await CrmLead.findOne({ leadRef: lead._id }) : null;
        console.log(`${email}: Lead=${lead?._id || 'NO'} | CrmLead=${crmLead?._id || 'NO'} | Score=${crmLead?.score || '-'} | Segment=${crmLead?.segment || '-'}`);
    }
    
    await mongoose.disconnect();
    console.log('\n✅ Fix completado');
}

fix().catch(e => { console.error('Error:', e); process.exit(1); });
