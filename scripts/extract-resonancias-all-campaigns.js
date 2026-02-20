/**
 * scripts/extract-resonancias-all-campaigns.js
 * Extrae TODAS las campañas GetResponse de Escuela Resonancias desde Gmail.
 *
 * Campañas:
 *   informacionescuela   810 emails  — formato español, include Ciudad
 *   clase_demostrativa    48 emails  — formato español, include disponibilidad/curso
 *   unica_vez_resonancias 47 emails  — formato español, include phone/disponibilidad
 *   cv2017                13 emails  — formato español
 *   giftcardresonancias    3 emails  — formato español, include giftcard/phone
 *
 * REQUIERE: secrets/gmail_token_piano.json  (ya generado)
 *
 * USO:
 *   node scripts/extract-resonancias-all-campaigns.js [--max=2000]
 *
 * SALIDA:
 *   data/leads_resonancias_campanias.md
 *
 * NO toca: leads_getresponse.md ni leads_profesordepiano.md
 */

const fs    = require('fs');
const path  = require('path');
const { google } = require('googleapis');

const SECRETS_DIR = path.join(__dirname, '..', 'secrets');
const CREDS_FILE  = path.join(SECRETS_DIR, 'gmail_credentials_piano.json');
const TOKEN_FILE  = path.join(SECRETS_DIR, 'gmail_token_piano.json');
const OUTPUT_DIR  = path.join(__dirname, '..', 'data');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'leads_resonancias_campanias.md');

// Archivos anteriores para detección de duplicados (solo lectura)
const PREV_FILES = [
    path.join(OUTPUT_DIR, 'leads_getresponse.md'),
    path.join(OUTPUT_DIR, 'leads_profesordepiano.md'),
];

const SENDER = 'noloop@app.getresponse.com';

// Campañas a extraer (formato: { nombre, filtroGmail })
const CAMPAIGNS = [
    { id: 'informacionescuela',    label: 'Escuela Resonancias — Info',         query: `from:${SENDER} "informacionescuela"` },
    { id: 'clase_demostrativa',    label: 'Escuela Resonancias — Clase Demo',   query: `from:${SENDER} "clase_demostrativa"` },
    { id: 'unica_vez_resonancias', label: 'Escuela Resonancias — Única Vez',    query: `from:${SENDER} "unica_vez_resonancias"` },
    { id: 'cv2017',                label: 'Escuela Resonancias — CV 2017',      query: `from:${SENDER} "cv2017"` },
    { id: 'giftcardresonancias',   label: 'Escuela Resonancias — Gift Card',    query: `from:${SENDER} "giftcardresonancias"` },
];

const DEFAULT_MAX = 2000;
const maxArg = process.argv.find(a => a.startsWith('--max='));
const MAX_PER_CAMPAIGN = maxArg ? parseInt(maxArg.split('=')[1]) : DEFAULT_MAX;

// Nombres falsos de GetResponse
const NOMBRES_FALSOS = ['escriba su nombre','your name','sin nombre','nombre','name','tu nombre','ingrese su nombre','enter your name','su nombre'];

// ─────────────────────────────────────────────────────────────────────────────
// AUTH
// ─────────────────────────────────────────────────────────────────────────────

function buildAuthClient() {
    if (!fs.existsSync(CREDS_FILE) || !fs.existsSync(TOKEN_FILE)) {
        console.error('❌  Faltan credenciales. Ejecuta: node scripts/gmail-oauth-setup-piano.js\n');
        process.exit(1);
    }
    const creds = JSON.parse(fs.readFileSync(CREDS_FILE, 'utf8'));
    const token = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
    const { client_id, client_secret } = creds.installed || creds.web;
    const auth = new google.auth.OAuth2(client_id, client_secret, 'http://localhost:3839');
    auth.setCredentials(token);
    auth.on('tokens', (t) => {
        fs.writeFileSync(TOKEN_FILE, JSON.stringify({ ...token, ...t }, null, 2));
    });
    return auth;
}

// ─────────────────────────────────────────────────────────────────────────────
// GMAIL UTILS
// ─────────────────────────────────────────────────────────────────────────────

function decodeBase64(d) {
    return Buffer.from(d.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

function extractTextBody(payload) {
    if (payload.body?.data) return decodeBase64(payload.body.data);
    if (payload.parts) {
        for (const p of payload.parts) {
            if (p.mimeType === 'text/plain' && p.body?.data) return decodeBase64(p.body.data);
            if (p.parts) { const n = extractTextBody(p); if (n) return n; }
        }
        for (const p of payload.parts) {
            if (p.mimeType === 'text/html' && p.body?.data) return decodeBase64(p.body.data).replace(/<[^>]+>/g, ' ');
        }
    }
    return '';
}

async function fetchAllIdsForQuery(gmail, query, max) {
    const ids = [];
    let pageToken;
    do {
        const r = await gmail.users.messages.list({ userId: 'me', q: query, maxResults: 500, pageToken, includeSpamTrash: true });
        ids.push(...(r.data.messages || []).map(m => m.id));
        pageToken = r.data.nextPageToken;
        process.stdout.write(`\r    IDs encontrados: ${ids.length}`);
        if (ids.length >= max) break;
    } while (pageToken);
    return ids.slice(0, max);
}

// ─────────────────────────────────────────────────────────────────────────────
// PARSER — Formato ESPAÑOL GetResponse
// [Datos básicos]
//   Campaña: xxx
//   Nombre: xxx
//   Email: xxx
// [Datos personalizados]
//   http_referer: xxx
//   Ciudad: xxx  (cuando existe)
//   phone: xxx   (cuando existe)
//   disponibilidad: xxx (cuando existe)
//   curso3: xxx  (cuando existe)
// ─────────────────────────────────────────────────────────────────────────────

function extractField(text, labels) {
    for (const label of labels) {
        const re = new RegExp(`${label}\\s*:\\s*(.+?)(?:\\n|$)`, 'i');
        const m = text.match(re);
        if (m) return m[1].trim();
    }
    return '';
}

function parseLead(body, campaignId) {
    const text = body.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Ambos formatos: español e inglés
    const nombre  = extractField(text, ['Nombre', 'Name']);
    const email   = extractField(text, ['Email', 'E-mail', 'email', 'Correo']);
    const referer = extractField(text, ['http_referer', 'HTTP_REFERER', 'Referer', 'URL']);
    const ciudad  = extractField(text, ['Ciudad', 'City', 'ciudad', 'city']);
    const fecha   = extractField(text, ['Fecha', 'Date', 'fecha', 'Timestamp']);
    const phone   = extractField(text, ['phone', 'Phone', 'mobile_phone', 'Teléfono', 'telefono']);
    const dispon  = extractField(text, ['disponibilidad', 'Disponibilidad']);
    const curso   = extractField(text, ['curso3', 'Curso', 'curso']);

    return { nombre, email, referer, ciudad, fecha, phone, dispon, curso, campaign: campaignId };
}

function normalizarNombre(raw) {
    if (!raw) return 'sin_nombre';
    const lower = raw.toLowerCase().trim();
    if (NOMBRES_FALSOS.some(f => lower === f || lower.includes(f))) return 'sin_nombre';
    if (/^\d+$/.test(raw.trim())) return 'sin_nombre';
    return raw.trim();
}

function calcPrioridad(ciudad) {
    if (!ciudad) return 'baja';
    const c = ciudad.toLowerCase().trim();
    if (c === 'santiago' || c.includes('santiago')) return 'alta';
    return 'media';
}

// ─────────────────────────────────────────────────────────────────────────────
// DUPLICADOS — carga emails de archivos anteriores
// ─────────────────────────────────────────────────────────────────────────────

function loadPreviousEmails() {
    const emails = new Set();
    for (const file of PREV_FILES) {
        if (!fs.existsSync(file)) continue;
        const lines = fs.readFileSync(file, 'utf8').split('\n');
        for (const line of lines) {
            const m = line.match(/\|\s*[^\|]+\s*\|\s*([^\|@\s]+@[^\|@\s]+)\s*\|/);
            if (m) emails.add(m[1].trim().toLowerCase());
        }
        console.log(`[Duplicados] Cargado: ${file} → ${emails.size} emails`);
    }
    return emails;
}

// ─────────────────────────────────────────────────────────────────────────────
// MARKDOWN
// ─────────────────────────────────────────────────────────────────────────────

function esc(str) { return (str || '').replace(/\|/g, '\\|') || '—'; }

function buildMarkdown(allLeads, stats, campaignStats) {
    const now = new Date().toLocaleString('es-CL', { timeZone: 'America/Santiago' });

    const sortOrder = { alta: 0, media: 1, baja: 2 };
    const sorted = [...allLeads].sort((a, b) => {
        if (a.campaign !== b.campaign) return a.campaign.localeCompare(b.campaign);
        return sortOrder[a.prioridad] - sortOrder[b.prioridad];
    });

    // Tabla principal
    const rows = sorted.map(l => {
        const dup = l.duplicado ? ' ⚠️dup' : '';
        return `| ${esc(l.nombre)} | ${esc(l.email)}${dup} | ${esc(l.ciudad)} | ${esc(l.fecha)} | ${esc(l.campaign)} | ${l.prioridad} |`;
    }).join('\n');

    // Tabla por campaña
    const campRows = campaignStats.map(c =>
        `| ${c.id} | ${c.total} | ${c.alta} | ${c.media} | ${c.baja} | ${c.dups} |`
    ).join('\n');

    return `# Leads Escuela Resonancias — Campañas GetResponse
<!-- Generado: ${now} -->
<!-- NO modifica: leads_getresponse.md ni leads_profesordepiano.md -->

---

## Resumen global

| Métrica | Valor |
|---------|-------|
| Emails procesados | ${stats.totalEmails} |
| Leads extraídos | ${stats.totalLeads} |
| Contactos únicos | ${stats.uniqueLeads} |
| Duplicados internos removidos | ${stats.internDups} |
| 🔥 Alta — Santiago | ${stats.alta} |
| 🌤️ Media — Regiones | ${stats.media} |
| 🧊 Baja — Sin ciudad | ${stats.baja} |
| ⚠️ Duplicados c/ listas anteriores | ${stats.dupsPrev} |
| 📧 Sin nombre | ${stats.sinNombre} |

---

## Por campaña

| Campaña | Total | Alta | Media | Baja | Dups |
|---------|-------|------|-------|------|------|
${campRows}

---

## Contactos

> ⚠️dup = email presente en lista anterior (conservado)

| nombre | email | ciudad | fecha | campaña | prioridad |
|--------|-------|--------|-------|---------|-----------|
${rows}

---

*Generado el ${now}*
`;
}

// ─────────────────────────────────────────────────────────────────────────────
// EXTRACCIÓN POR CAMPAÑA
// ─────────────────────────────────────────────────────────────────────────────

async function extractCampaign(gmail, campaign) {
    console.log(`\n[${campaign.id}] 🔍 Buscando...`);
    const ids = await fetchAllIdsForQuery(gmail, campaign.query, MAX_PER_CAMPAIGN);
    console.log(`\n[${campaign.id}] 📨 ${ids.length} mensajes`);

    const leads = [];
    for (let i = 0; i < ids.length; i++) {
        process.stdout.write(`\r  Procesando: ${i + 1}/${ids.length}`);
        try {
            const msg = await gmail.users.messages.get({ userId: 'me', id: ids[i], format: 'full' });
            const body = extractTextBody(msg.data.payload);
            const lead = parseLead(body, campaign.id);

            if (!lead.nombre && !lead.email) continue;

            leads.push({
                nombre:    normalizarNombre(lead.nombre),
                email:     (lead.email || '').toLowerCase().trim(),
                ciudad:    lead.ciudad || '',
                fecha:     lead.fecha || '—',
                phone:     lead.phone || '',
                campaign:  campaign.id,
            });
        } catch (err) {
            // ignorar errores individuales
        }
        if ((i + 1) % 20 === 0) await new Promise(r => setTimeout(r, 150));
    }
    console.log(`\n[${campaign.id}] ✅ ${leads.length} leads extraídos`);
    return leads;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
    console.log('\n📧  Extractor Escuela Resonancias — Todas las campañas\n');

    const auth  = buildAuthClient();
    const gmail = google.gmail({ version: 'v1', auth });

    try {
        const profile = await gmail.users.getProfile({ userId: 'me' });
        console.log(`[Gmail] 📬 Conectado como: ${profile.data.emailAddress}`);
    } catch (err) {
        console.error('[Gmail] ❌ Error de autenticación:', err.message);
        process.exit(1);
    }

    const emailsAnteriores = loadPreviousEmails();

    // Extraer todas las campañas
    let allLeadsRaw = [];
    for (const campaign of CAMPAIGNS) {
        const leads = await extractCampaign(gmail, campaign);
        allLeadsRaw.push(...leads);
    }

    console.log(`\n[Total] ${allLeadsRaw.length} leads en bruto extraídos`);

    // Deduplicación interna (mismo email entre campañas)
    const seen = new Set();
    const unique = [];
    let internDups = 0;
    for (const lead of allLeadsRaw) {
        const key = lead.email.toLowerCase();
        if (!key || seen.has(key)) { internDups++; continue; }
        seen.add(key);
        unique.push(lead);
    }

    // Marcar duplicados con listas anteriores
    let dupsPrev = 0;
    for (const lead of unique) {
        lead.duplicado = emailsAnteriores.has(lead.email.toLowerCase());
        if (lead.duplicado) dupsPrev++;
    }

    // Asignar prioridad
    for (const lead of unique) {
        lead.prioridad = calcPrioridad(lead.ciudad);
    }

    // Estadísticas globales
    const alta      = unique.filter(l => l.prioridad === 'alta').length;
    const media     = unique.filter(l => l.prioridad === 'media').length;
    const baja      = unique.filter(l => l.prioridad === 'baja').length;
    const sinNombre = unique.filter(l => l.nombre === 'sin_nombre').length;

    const stats = {
        totalEmails: allLeadsRaw.length + internDups,
        totalLeads:  allLeadsRaw.length,
        uniqueLeads: unique.length,
        internDups,
        alta, media, baja, dupsPrev, sinNombre,
    };

    // Estadísticas por campaña
    const campaignStats = CAMPAIGNS.map(c => {
        const cl = unique.filter(l => l.campaign === c.id);
        return {
            id:    c.id,
            total: cl.length,
            alta:  cl.filter(l => l.prioridad === 'alta').length,
            media: cl.filter(l => l.prioridad === 'media').length,
            baja:  cl.filter(l => l.prioridad === 'baja').length,
            dups:  cl.filter(l => l.duplicado).length,
        };
    });

    // Guardar
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    fs.writeFileSync(OUTPUT_FILE, buildMarkdown(unique, stats, campaignStats), 'utf8');

    // Resumen en consola
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('  📊 RESUMEN — Escuela Resonancias (todas las campañas)\n');
    console.log(`  Total emails procesados        : ${stats.totalEmails}`);
    console.log(`  Contactos únicos extraídos     : ${stats.uniqueLeads}`);
    console.log(`  Duplicados internos removidos  : ${stats.internDups}`);
    console.log('───────────────────────────────────────────────────────');
    console.log(`  🔥 Alta   — Santiago           : ${stats.alta}`);
    console.log(`  🌤️  Media  — Regiones           : ${stats.media}`);
    console.log(`  🧊 Baja   — Sin ciudad         : ${stats.baja}`);
    console.log('───────────────────────────────────────────────────────');
    console.log(`  ⚠️  Duplicados c/ listas ant.  : ${stats.dupsPrev}`);
    console.log(`  📧 Sin nombre                  : ${stats.sinNombre}`);
    console.log('───────────────────────────────────────────────────────');
    console.log('  Por campaña:');
    for (const c of campaignStats) {
        console.log(`    ${c.id.padEnd(25)} : ${c.total} leads (Alta:${c.alta} Med:${c.media} Baja:${c.baja})`);
    }
    console.log('═══════════════════════════════════════════════════════');
    console.log(`\n✅  Guardado en: ${OUTPUT_FILE}\n`);
}

main().catch(err => {
    console.error('\n💥 Error:', err.message);
    if (err.code === 401) console.error('   Ejecuta: node scripts/gmail-oauth-setup-piano.js\n');
    process.exit(1);
});
