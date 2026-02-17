/**
 * migrate-old-leads.js
 * Migra los leads del CRM antiguo:
 * 1. Asigna type:'teacher' a los 9 leads sin tipo
 * 2. Crea CrmLeads enriquecidos para todos los leads de profesores
 * 3. Vincula los convertidos (Esteban, Benjamín) con sus users
 * 
 * Uso: node migrate-old-leads.js [--dry-run]
 */
const mongoose = require('mongoose');
require('dotenv').config();

const Lead = require('./models/Lead');

// Lazy-load para evitar problemas de inicialización
let CrmLead, CrmInteraction, CrmConversion, CrmLeadService;

async function loadCrmModels() {
    CrmLead = require('./crm/models/CrmLead');
    CrmInteraction = require('./crm/models/CrmInteraction');
    CrmConversion = require('./crm/models/CrmConversion');
    CrmLeadService = require('./crm/services/CrmLeadService');
}

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
    console.log(`\n🎹 MIGRACIÓN DE LEADS ANTIGUOS — PianoLink`);
    console.log(`   Modo: ${DRY_RUN ? '🔍 DRY RUN (sin cambios)' : '🚀 EJECUCIÓN REAL'}\n`);
    
    await mongoose.connect(process.env.MONGO_URI);
    await loadCrmModels();

    // =========================================================================
    // PASO 1: Marcar leads sin type como teacher
    // =========================================================================
    console.log('═══ PASO 1: Asignar type:teacher a leads antiguos ═══');
    
    const leadsWithoutType = await Lead.find({ type: { $exists: false } });
    console.log(`   Leads sin tipo encontrados: ${leadsWithoutType.length}`);
    
    for (const lead of leadsWithoutType) {
        console.log(`   → ${lead.name} (${lead.email}) — status: ${lead.status}`);
        if (!DRY_RUN) {
            lead.type = 'teacher';
            await lead.save();
        }
    }
    
    // También los que tienen type:null o type:''
    const leadsNullType = await Lead.find({ $or: [{ type: null }, { type: '' }] });
    for (const lead of leadsNullType) {
        if (!leadsWithoutType.find(l => l._id.equals(lead._id))) {
            console.log(`   → ${lead.name} (${lead.email}) — type era null/vacío`);
            if (!DRY_RUN) {
                lead.type = 'teacher';
                await lead.save();
            }
        }
    }
    
    console.log(`   ✅ ${leadsWithoutType.length + leadsNullType.length} leads actualizados\n`);

    // =========================================================================
    // PASO 2: Vincular leads convertidos con sus Users
    // =========================================================================
    console.log('═══ PASO 2: Vincular leads convertidos con Users ═══');
    
    const User = require('./models/User');
    const convertedLeads = await Lead.find({ status: 'converted' });
    
    for (const lead of convertedLeads) {
        const user = await User.findOne({ email: lead.email });
        if (user) {
            console.log(`   → ${lead.name} → User: ${user._id} (${user.name})`);
            if (!DRY_RUN && !lead.convertedToUserId) {
                lead.convertedToUserId = user._id;
                if (!lead.convertedAt) lead.convertedAt = lead.updatedAt || lead.createdAt;
                await lead.save();
            }
        } else {
            console.log(`   ⚠️ ${lead.name} (${lead.email}) — No tiene user asociado`);
        }
    }
    console.log(`   ✅ Vincualción completada\n`);

    // =========================================================================
    // PASO 3: Crear CrmLeads enriquecidos
    // =========================================================================
    console.log('═══ PASO 3: Crear CrmLeads enriquecidos ═══');
    
    const allTeacherLeads = await Lead.find({ type: 'teacher' });
    console.log(`   Total leads teacher: ${allTeacherLeads.length}`);
    
    let created = 0;
    let existing = 0;
    let errors = 0;
    
    for (const lead of allTeacherLeads) {
        // Determinar score base según status
        const scoreByStatus = {
            'new': 10,
            'contacted': 25,
            'qualified': 50,
            'interested': 60,
            'demo_scheduled': 70,
            'negotiation': 75,
            'converted': 90,
            'rejected': 5
        };
        
        // Determinar lifecycle stage según status
        const stageByStatus = {
            'new': 'lead',
            'contacted': 'mql',
            'qualified': 'sql',
            'interested': 'sql',
            'demo_scheduled': 'opportunity', 
            'negotiation': 'opportunity',
            'converted': 'customer',
            'rejected': 'lead'
        };
        
        // Determinar segmento según status
        const segmentByStatus = {
            'new': 'cold',
            'contacted': 'warm',
            'qualified': 'hot',
            'interested': 'hot',
            'demo_scheduled': 'hot',
            'negotiation': 'hot',
            'converted': 'customer',
            'rejected': 'cold'
        };

        const enrichment = {
            channel: lead.source === 'landing' ? 'organic' : 
                     lead.source === 'kit_v2_checkout' ? 'direct' :
                     lead.source === 'referral' ? 'referral' : 'organic',
            locale: 'es',
            currency: lead.country === 'CL' ? 'CLP' : 'USD',
            tags: ['fundador_potencial', 'migrado_crm_antiguo'],
        };

        const existingCrmLead = await CrmLead.findOne({ leadRef: lead._id });
        
        if (existingCrmLead) {
            console.log(`   ⏭️  ${lead.name} — CrmLead ya existe`);
            existing++;
            continue;
        }

        console.log(`   → Creando CrmLead para: ${lead.name} (${lead.email}) — score: ${scoreByStatus[lead.status] || 10}, stage: ${stageByStatus[lead.status] || 'lead'}`);
        
        if (!DRY_RUN) {
            try {
                const crmLead = await CrmLead.create({
                    leadRef: lead._id,
                    score: scoreByStatus[lead.status] || 10,
                    locale: 'es',
                    currency: enrichment.currency,
                    lifecycleStage: stageByStatus[lead.status] || 'lead',
                    segment: segmentByStatus[lead.status] || 'cold',
                    tags: enrichment.tags,
                    attribution: {
                        firstTouch: {
                            channel: enrichment.channel,
                            utmSource: lead.utmSource || '',
                            utmMedium: lead.utmMedium || '',
                            utmCampaign: lead.utmCampaign || '',
                        },
                        lastTouch: {
                            channel: enrichment.channel,
                            utmSource: lead.utmSource || '',
                            utmMedium: lead.utmMedium || '',
                            utmCampaign: lead.utmCampaign || '',
                        },
                        touchpoints: [{
                            channel: enrichment.channel,
                            timestamp: lead.createdAt || new Date(),
                        }]
                    },
                    externalIds: {
                        fbClickId: lead.trackingData?.fbClickId || '',
                        gClientId: lead.trackingData?.gClientId || '',
                    },
                    convertedAt: lead.status === 'converted' ? (lead.convertedAt || lead.updatedAt) : undefined,
                    customerValue: lead.status === 'converted' ? 1000 : 0, // $10 plan fundador en centavos
                });

                // Registrar interacción de migración
                await CrmInteraction.create({
                    leadRef: crmLead._id,
                    type: 'form_submit',
                    channel: 'system',
                    metadata: {
                        notes: `Migrado desde CRM antiguo. Status original: ${lead.status}. Fuente: ${lead.source || 'manual'}`
                    }
                });

                created++;
            } catch (err) {
                console.error(`   ❌ Error creando CrmLead para ${lead.name}:`, err.message);
                errors++;
            }
        } else {
            created++; // Contar como si se hubiera creado en dry-run
        }
    }

    console.log(`\n   ✅ CrmLeads: ${created} creados, ${existing} existentes, ${errors} errores\n`);

    // =========================================================================
    // RESUMEN FINAL
    // =========================================================================
    console.log('═══════════════════════════════════════════════════');
    console.log('   RESUMEN DE MIGRACIÓN');
    console.log('═══════════════════════════════════════════════════');
    
    const finalLeads = await Lead.find({ type: 'teacher' });
    const finalCrmLeads = await CrmLead.countDocuments();
    
    console.log(`   Leads teacher en core:     ${finalLeads.length}`);
    console.log(`   CrmLeads enriquecidos:     ${finalCrmLeads}`);
    console.log(`   Modo:                      ${DRY_RUN ? 'DRY RUN' : 'EJECUTADO'}`);
    
    console.log('\n   Leads por status:');
    const statusCount = {};
    finalLeads.forEach(l => {
        statusCount[l.status] = (statusCount[l.status] || 0) + 1;
    });
    Object.entries(statusCount).forEach(([status, count]) => {
        console.log(`     • ${status}: ${count}`);
    });

    console.log('═══════════════════════════════════════════════════\n');

    await mongoose.disconnect();
}

main().catch(e => {
    console.error('💥 Error fatal:', e);
    process.exit(1);
});
