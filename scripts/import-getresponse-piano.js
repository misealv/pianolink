/**
 * scripts/import-getresponse-piano.js
 * Lee los leads guardados en MongoDB (app_kv → gmail_leads_markdown),
 * filtra sólo los de prioridad "alta" (piano) y los importa al CRM
 * como nueva lista "GetResponse Piano 2019".
 *
 * Idempotente: no duplica si el email ya existe.
 * Uso:  node scripts/import-getresponse-piano.js
 */
require('dotenv').config();
const mongoose  = require('mongoose');
const connectDB = require('../config/db');
const Lead      = require('../models/Lead');
const CrmLead   = require('../crm/models/CrmLead');

// Modelo AppKV — mismo esquema que gmailOAuthRoutes.js
const AppKV = mongoose.models.AppKV || mongoose.model('AppKV',
    new mongoose.Schema(
        { key: { type: String, unique: true, required: true }, value: mongoose.Schema.Types.Mixed },
        { collection: 'app_kv', timestamps: true }
    )
);

// ============================================================
// CONSTANTES DE NEGOCIO
// ============================================================
const LISTA               = 'GetResponse Piano 2019';
const SEGMENT             = 'warm';                   // enum CrmLead: cold|warm|hot|customer|churned
const FUENTE              = 'getresponse_web_resonancias';
const PIPELINE_LEAD       = 'nuevo';                  // enum Lead.estadoPipeline
const PIPELINE_CRM        = 'lead';                   // enum CrmLead.pipelineStudent
const ROL                 = 'prospecto_estudiante';
const PRIORIDAD    = 'alta';
const SCORE_ALTO   = 45;      // piano = warm lead
const NOTA_FIJA    = 'Se suscribió desde escuelaresonancias.cl buscando clases de piano. Contactar por email.';

// ============================================================
// HELPERS
// ============================================================

/**
 * Parsea el markdown generado por buildMarkdown().
 * Formato de cada fila: | nombre | email | pagina_origen | fecha | prioridad |
 * Devuelve array de objetos { nombre, email, pagina_origen, fecha, prioridad }.
 */
function parseMarkdownTable(md) {
    const leads = [];
    const lines = md.split('\n');

    for (const line of lines) {
        // Acepta sólo líneas de tabla con 5 columnas de datos
        const trimmed = line.trim();
        if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) continue;

        // Separa columnas
        const cols = trimmed.split('|').map(c => c.trim()).filter(c => c !== '');
        if (cols.length !== 5) continue;

        // Descarta encabezados y separadores
        if (cols[0] === 'nombre' || cols[0].startsWith('---') || cols[0].startsWith('Prioridad')) continue;

        const [nombre, email, pagina_origen, fecha, prioridad] = cols;

        // Descarta filas sin email válido
        if (!email || !email.includes('@')) continue;

        leads.push({ nombre, email: email.toLowerCase(), pagina_origen, fecha, prioridad });
    }

    return leads;
}

// ============================================================
// LÓGICA PRINCIPAL
// ============================================================
async function importPianoLeads() {
    console.log('\n🎹  Importador GetResponse → CRM (prioridad: alta / piano)\n');

    await connectDB();
    console.log('✅  MongoDB conectado\n');

    // 1) Leer markdown desde app_kv
    const doc = await AppKV.findOne({ key: 'gmail_leads_markdown' }).lean();
    if (!doc || !doc.value) {
        console.error('❌  No se encontró la clave "gmail_leads_markdown" en app_kv.');
        console.error('    Asegúrate de haber corrido la extracción Gmail primero.');
        process.exit(1);
    }

    console.log('📄  Markdown encontrado en app_kv. Parseando…\n');

    // 2) Parsear tabla y filtrar prioridad alta
    const todos = parseMarkdownTable(doc.value);
    const pianos = todos.filter(l => l.prioridad === 'alta');

    console.log(`  Total leads en markdown : ${todos.length}`);
    console.log(`  Prioridad alta (piano)  : ${pianos.length}`);
    console.log(`  Ignorados (media + baja): ${todos.length - pianos.length}`);
    console.log('\n──────────────────────────────────────────────────');
    console.log('  Iniciando importación al CRM…');
    console.log('──────────────────────────────────────────────────\n');

    // 3) Importar uno a uno
    let creados  = 0;
    let omitidos = 0;
    let errores  = 0;

    for (const lead of pianos) {
        try {
            // ---- Verificar duplicado por email ----
            const existing = await Lead.findOne({ email: lead.email }).lean();

            if (existing) {
                omitidos++;
                console.log(`  ⏩  ${lead.nombre || lead.email} — ya existe (${lead.email})`);
                continue;
            }

            // ---- Crear Lead core ----
            const coreLead = await Lead.create({
                name           : lead.nombre || lead.email,
                email          : lead.email,
                // whatsapp vacío — no tenemos teléfono de GetResponse
                source         : 'other',           // enum válido; detalle en 'fuente'
                fuente         : FUENTE,             // campo libre de trazabilidad
                type           : 'client',           // enum: 'teacher' | 'client'
                status         : 'new',              // enum: 'new' | 'contacted' | ...
                prioridad      : PRIORIDAD,
                rol            : ROL,
                estadoPipeline : PIPELINE_LEAD,
                lista          : LISTA,
                country        : 'CL',
                timezone       : 'America/Santiago',
                // Metadata GetResponse en notes del Lead
                notes          : `[GetResponse] Página: ${lead.pagina_origen} | Fecha suscripción: ${lead.fecha}`,
            });

            // ---- Crear CrmLead ----
            await CrmLead.create({
                leadRef         : coreLead._id,
                score           : SCORE_ALTO,
                segment         : SEGMENT,      // 'warm' — enum válido de CrmLead
                lista           : LISTA,         // campo libre: 'GetResponse Piano 2019'
                tags            : [FUENTE, 'piano', 'prioridad_alta', LISTA.replace(/ /g, '_').toLowerCase()],
                locale          : 'es',
                currency        : 'CLP',
                timezone        : 'America/Santiago',
                lifecycleStage  : 'lead',
                pipelineStudent : PIPELINE_CRM,
                studentData     : { goals: NOTA_FIJA },   // notas de intención en campo correcto
                attribution     : {
                    firstTouch: {
                        channel     : 'organic',
                        utmSource   : 'escuelaresonancias_cl',
                        utmMedium   : 'getresponse_suscripcion',
                        utmCampaign : 'getresponse_piano_2019',
                        timestamp   : new Date(),
                    },
                    lastTouch: {
                        channel     : 'organic',
                        utmSource   : 'escuelaresonancias_cl',
                        utmMedium   : 'getresponse_suscripcion',
                        utmCampaign : 'getresponse_piano_2019',
                        timestamp   : new Date(),
                    },
                    touchpoints: [{
                        channel     : 'organic',
                        timestamp   : new Date(),
                        utmSource   : 'escuelaresonancias_cl',
                        utmMedium   : 'getresponse_suscripcion',
                        utmCampaign : 'getresponse_piano_2019',
                    }],
                },
                scoreHistory: [{
                    score  : SCORE_ALTO,
                    reason : 'import_getresponse_piano_alta',
                }],
            });

            creados++;
            console.log(`  ✅  ${lead.nombre || lead.email} (${lead.email})`);

        } catch (err) {
            // Duplicado por índice único de email
            if (err.code === 11000) {
                omitidos++;
                console.log(`  ⏩  ${lead.nombre || lead.email} — duplicado índice (${lead.email})`);
            } else {
                errores++;
                console.error(`  ❌  ${lead.nombre || lead.email}: ${err.message}`);
            }
        }
    }

    // 4) Resumen
    console.log('\n──────────────────────────────────────────────────');
    console.log(`  Procesados (prioridad alta) : ${pianos.length}`);
    console.log(`  Nuevos ingresados al CRM    : ${creados}`);
    console.log(`  Duplicados omitidos         : ${omitidos}`);
    console.log(`  Errores                     : ${errores}`);
    console.log('──────────────────────────────────────────────────');
    console.log(`  Lista en CRM                : "${LISTA}"`);
    console.log(`  Segmento                    : "${SEGMENT}"`);
    console.log('──────────────────────────────────────────────────\n');

    await mongoose.disconnect();
    console.log('🔌  Desconectado de MongoDB.\n');
    process.exit(0);
}

importPianoLeads().catch(err => {
    console.error('💥  Error fatal:', err);
    process.exit(1);
});
