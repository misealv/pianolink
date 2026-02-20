/**
 * scripts/extract-resonancias-escuela.js
 * Extrae TODAS las campañas GetResponse desde escuela.resonancias@gmail.com
 *
 * Hace un discovery automático de todas las campañas presentes en la cuenta
 * antes de extraer, para no perderse nada.
 *
 * REQUIERE: secrets/gmail_token_resonancias.json
 *
 * USO:
 *   node scripts/extract-resonancias-escuela.js [--max=2000] [--discover-only]
 *
 * SALIDA:
 *   data/leads_resonancias_escuela.md
 */

const fs    = require('fs');
const path  = require('path');
const { google } = require('googleapis');

const SECRETS_DIR = path.join(__dirname, '..', 'secrets');
const CREDS_FILE  = path.join(SECRETS_DIR, 'gmail_credentials_piano.json');
const TOKEN_FILE  = path.join(SECRETS_DIR, 'gmail_token_resonancias.json');
const OUTPUT_DIR  = path.join(__dirname, '..', 'data');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'leads_resonancias_escuela.md');

// Archivos anteriores para detección de duplicados (solo lectura)
const PREV_FILES = [
    path.join(OUTPUT_DIR, 'leads_getresponse.md'),
    path.join(OUTPUT_DIR, 'leads_profesordepiano.md'),
    path.join(OUTPUT_DIR, 'leads_resonancias_campanias.md'),
];

const SENDER      = 'noloop@app.getresponse.com';
const DEFAULT_MAX = 3000;
const maxArg = process.argv.find(a => a.startsWith('--max='));
const MAX_RESULTS = maxArg ? parseInt(maxArg.split('=')[1]) : DEFAULT_MAX;
const DISCOVER_ONLY = process.argv.includes('--discover-only');

const NOMBRES_FALSOS = ['escriba su nombre','your name','sin nombre','nombre','name','tu nombre','ingrese su nombre','enter your name','su nombre'];

// ─────────────────────────────────────────────────────────────────────────────
// AUTH
// ─────────────────────────────────────────────────────────────────────────────

function buildAuthClient() {
    if (!fs.existsSync(TOKEN_FILE)) {
        console.error(`\n❌  No se encontró: ${TOKEN_FILE}`);
        console.error('    Ejecuta primero: node scripts/gmail-oauth-setup-resonancias.js\n');
        process.exit(1);
    }
    const creds = JSON.parse(fs.readFileSync(CREDS_FILE, 'utf8'));
    const token = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
    const { client_id, client_secret } = creds.installed || creds.web;
    const auth = new google.auth.OAuth2(client_id, client_secret, 'http://localhost:3840');
    auth.setCredentials(token);
    auth.on('tokens', t => fs.writeFileSync(TOKEN_FILE, JSON.stringify({ ...token, ...t }, null, 2)));
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
            if (p.mimeType === 'text/html' && p.body?.data)
                return decodeBase64(p.body.data).replace(/<[^>]+>/g, ' ');
        }
    }
    return '';
}

async function fetchAllIds(gmail, query, max) {
    const ids = [];
    let pageToken;
    do {
        const r = await gmail.users.messages.list({
            userId: 'me', q: query, maxResults: 500, pageToken, includeSpamTrash: true,
        });
        ids.push(...(r.data.messages || []).map(m => m.id));
        pageToken = r.data.nextPageToken;
        process.stdout.write(`\r    IDs: ${ids.length}`);
        if (ids.length >= max) break;
    } while (pageToken);
    return ids.slice(0, max);
}

// ─────────────────────────────────────────────────────────────────────────────
// DISCOVERY AUTOMÁTICO DE CAMPAÑAS
// ─────────────────────────────────────────────────────────────────────────────

async function discoverCampaigns(gmail) {
    console.log('\n[Discovery] 🔍 Buscando todas las campañas en esta cuenta...');

    // Obtener muestra de hasta 200 emails más recientes
    const r = await gmail.users.messages.list({
        userId: 'me', q: `from:${SENDER}`, maxResults: 200, includeSpamTrash: true,
    });
    const ids = (r.data.messages || []).map(m => m.id);
    console.log(`[Discovery] Analizando ${ids.length} emails de muestra...`);

    const campaigns = new Map();

    for (let i = 0; i < ids.length; i++) {
        try {
            const msg = await gmail.users.messages.get({ userId: 'me', id: ids[i], format: 'full' });
            const body = extractTextBody(msg.data.payload);
            // Acepta: "Campaña: xx", "Campaign: xx", y también el subject [campxx@app.getresponse.com]
            const fromCampaign = body.match(/Campa[ñn]a?:\s*(.+?)(?:\n|$)/i)
                || body.match(/Campaign:\s*(.+?)(?:\n|$)/i);
            // Extraer del Subject si no está en body
            const subject = (msg.data.payload.headers || []).find(h => h.name === 'Subject')?.value || '';
            const fromSubject = subject.match(/\[([^\]@]+)@app\.getresponse\.com\]/);

            const camp = fromCampaign
                ? fromCampaign[1].trim().toLowerCase()
                : fromSubject
                    ? fromSubject[1].trim().toLowerCase()
                    : '(sin_campo)';

            campaigns.set(camp, (campaigns.get(camp) || 0) + 1);
        } catch (_) {}
        if ((i + 1) % 20 === 0) await new Promise(r => setTimeout(r, 100));
    }

    console.log('\n[Discovery] Campañas encontradas:\n');
    const result = [];
    for (const [c, n] of [...campaigns.entries()].sort((a, b) => b[1] - a[1])) {
        console.log(`  ${n.toString().padStart(4)}x  →  ${c}`);
        if (c !== '(sin_campo)') result.push(c);
    }
    return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// PARSER
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
    return {
        nombre:   extractField(text, ['Nombre', 'Name']),
        email:    extractField(text, ['Email', 'E-mail']),
        ciudad:   extractField(text, ['Ciudad', 'City']),
        fecha:    extractField(text, ['Fecha', 'Date', 'Timestamp']),
        phone:    extractField(text, ['phone', 'mobile_phone', 'Phone', 'Teléfono', 'telefono']),
        referer:  extractField(text, ['http_referer', 'Referer']),
        dispon:   extractField(text, ['disponibilidad', 'Disponibilidad']),
        curso:    extractField(text, ['curso3', 'curso', 'Curso']),
        campaign: extractField(text, ['Campaña', 'Campaign', 'Campa']) || campaignId,
    };
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
// DUPLICADOS
// ─────────────────────────────────────────────────────────────────────────────

function loadPreviousEmails() {
    const emails = new Set();
    for (const file of PREV_FILES) {
        if (!fs.existsSync(file)) continue;
        for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
            const m = line.match(/\|\s*[^\|]+\s*\|\s*([^\|@\s]+@[^\|@\s]+)\s*\|/);
            if (m) emails.add(m[1].trim().toLowerCase());
        }
    }
    console.log(`[Duplicados] ${emails.size} emails en listas anteriores`);
    return emails;
}

// ─────────────────────────────────────────────────────────────────────────────
// MARKDOWN OUTPUT
// ─────────────────────────────────────────────────────────────────────────────

function esc(s) { return (s || '').replace(/\|/g, '\\|') || '—'; }

function buildMarkdown(leads, stats, campaignStats, accountEmail) {
    const now = new Date().toLocaleString('es-CL', { timeZone: 'America/Santiago' });
    const rows = [...leads]
        .sort((a, b) => a.campaign.localeCompare(b.campaign))
        .map(l => `| ${esc(l.nombre)} | ${esc(l.email)}${l.duplicado ? ' ⚠️dup' : ''} | ${esc(l.ciudad)} | ${esc(l.phone)} | ${esc(l.fecha)} | ${esc(l.campaign)} | ${l.prioridad} |`)
        .join('\n');

    const campRows = campaignStats
        .map(c => `| ${c.id} | ${c.total} | ${c.alta} | ${c.media} | ${c.baja} | ${c.dups} |`)
        .join('\n');

    return `# Leads — ${accountEmail}
<!-- Generado: ${now} -->

---

## Resumen

| Métrica | Valor |
|---------|-------|
| Cuenta Gmail | ${accountEmail} |
| Emails procesados | ${stats.totalEmails} |
| Contactos únicos | ${stats.uniqueLeads} |
| Duplicados internos removidos | ${stats.internDups} |
| 🔥 Alta — Santiago | ${stats.alta} |
| 🌤️ Media — Regiones | ${stats.media} |
| 🧊 Baja — Sin ciudad | ${stats.baja} |
| ⚠️ Dups c/ listas anteriores | ${stats.dupsPrev} |
| 📧 Sin nombre | ${stats.sinNombre} |

---

## Por campaña

| Campaña | Total | Alta | Media | Baja | Dups |
|---------|-------|------|-------|------|------|
${campRows}

---

## Contactos

| nombre | email | ciudad | phone | fecha | campaña | prioridad |
|--------|-------|--------|-------|-------|---------|-----------|
${rows}

---
*Generado el ${now}*
`;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
    console.log('\n📧  Extractor escuela.resonancias@gmail.com\n');

    const auth  = buildAuthClient();
    const gmail = google.gmail({ version: 'v1', auth });

    let accountEmail = 'escuela.resonancias@gmail.com';
    try {
        const p = await gmail.users.getProfile({ userId: 'me' });
        accountEmail = p.data.emailAddress;
        console.log(`[Gmail] 📬 Conectado como: ${accountEmail}`);
        console.log(`        Mensajes totales: ${p.data.messagesTotal}`);
    } catch (err) {
        console.error('[Gmail] ❌ Error:', err.message);
        process.exit(1);
    }

    // Discovery automático
    const campaigns = await discoverCampaigns(gmail);

    if (DISCOVER_ONLY) {
        console.log('\n[Modo --discover-only] Terminado.\n');
        return;
    }

    if (campaigns.length === 0) {
        console.log('\n⚠️  No se encontraron campañas GetResponse en esta cuenta.\n');
        process.exit(0);
    }

    console.log(`\n[Discovery] ${campaigns.length} campañas a extraer.\n`);

    const emailsAnteriores = loadPreviousEmails();

    // Extraer cada campaña
    let allLeadsRaw = [];
    const campaignStats = [];

    for (const campId of campaigns) {
        const query = `from:${SENDER} "${campId}"`;
        console.log(`\n[${campId}] 🔍 Buscando...`);
        const ids = await fetchAllIds(gmail, query, MAX_RESULTS);
        console.log(`\n[${campId}] 📨 ${ids.length} mensajes`);

        const campLeads = [];
        for (let i = 0; i < ids.length; i++) {
            process.stdout.write(`\r  Procesando: ${i + 1}/${ids.length}`);
            try {
                const msg = await gmail.users.messages.get({ userId: 'me', id: ids[i], format: 'full' });
                const body = extractTextBody(msg.data.payload);
                const lead = parseLead(body, campId);
                if (!lead.nombre && !lead.email) continue;
                campLeads.push({
                    nombre:   normalizarNombre(lead.nombre),
                    email:    (lead.email || '').toLowerCase().trim(),
                    ciudad:   lead.ciudad || '',
                    phone:    lead.phone || '',
                    fecha:    lead.fecha || '—',
                    referer:  lead.referer || '',
                    dispon:   lead.dispon || '',
                    curso:    lead.curso || '',
                    campaign: campId,
                });
            } catch (_) {}
            if ((i + 1) % 20 === 0) await new Promise(r => setTimeout(r, 150));
        }
        console.log(`\n[${campId}] ✅ ${campLeads.length} leads`);
        allLeadsRaw.push(...campLeads);
    }

    // Deduplicación interna
    const seen     = new Set();
    const unique   = [];
    let   internDups = 0;
    for (const lead of allLeadsRaw) {
        const key = lead.email.toLowerCase();
        if (!key || seen.has(key)) { internDups++; continue; }
        seen.add(key);
        unique.push(lead);
    }

    // Marcar dups con listas anteriores
    let dupsPrev = 0;
    for (const lead of unique) {
        lead.duplicado = emailsAnteriores.has(lead.email.toLowerCase());
        if (lead.duplicado) dupsPrev++;
        lead.prioridad = calcPrioridad(lead.ciudad);
    }

    // Stats globales
    const alta      = unique.filter(l => l.prioridad === 'alta').length;
    const media     = unique.filter(l => l.prioridad === 'media').length;
    const baja      = unique.filter(l => l.prioridad === 'baja').length;
    const sinNombre = unique.filter(l => l.nombre === 'sin_nombre').length;

    const stats = {
        totalEmails: allLeadsRaw.length + internDups,
        uniqueLeads: unique.length,
        internDups, alta, media, baja, dupsPrev, sinNombre,
    };

    // Stats por campaña
    for (const campId of campaigns) {
        const cl = unique.filter(l => l.campaign === campId);
        campaignStats.push({
            id: campId, total: cl.length,
            alta: cl.filter(l => l.prioridad === 'alta').length,
            media: cl.filter(l => l.prioridad === 'media').length,
            baja: cl.filter(l => l.prioridad === 'baja').length,
            dups: cl.filter(l => l.duplicado).length,
        });
    }

    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    fs.writeFileSync(OUTPUT_FILE, buildMarkdown(unique, stats, campaignStats, accountEmail), 'utf8');

    console.log('\n═══════════════════════════════════════════════════════');
    console.log(`  📊 RESUMEN — ${accountEmail}\n`);
    console.log(`  Contactos únicos extraídos     : ${stats.uniqueLeads}`);
    console.log(`  Duplicados internos removidos  : ${stats.internDups}`);
    console.log(`  🔥 Alta   — Santiago           : ${stats.alta}`);
    console.log(`  🌤️  Media  — Regiones           : ${stats.media}`);
    console.log(`  🧊 Baja   — Sin ciudad         : ${stats.baja}`);
    console.log(`  ⚠️  Dups c/ listas anteriores  : ${stats.dupsPrev}`);
    console.log('═══════════════════════════════════════════════════════');
    for (const c of campaignStats) {
        console.log(`    ${c.id.padEnd(28)}: ${c.total} leads (Alta:${c.alta} Med:${c.media} Baja:${c.baja})`);
    }
    console.log(`\n✅  Guardado: ${OUTPUT_FILE}`);
    console.log('\n   Siguiente paso — Consolidar todo para el CRM:');
    console.log('   node scripts/consolidate-all-leads.js\n');
}

main().catch(err => {
    console.error('💥', err.message);
    if (err.code === 401) console.error('   Ejecuta: node scripts/gmail-oauth-setup-resonancias.js');
    process.exit(1);
});
