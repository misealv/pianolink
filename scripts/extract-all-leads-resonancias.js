/**
 * scripts/extract-all-leads-resonancias.js
 * 
 * Extracción COMPLETA multi-fuente de leads desde escuela.resonancias@gmail.com
 * 
 * FUENTES:
 *   1. GetResponse (todas las campañas, auto-discovery)
 *   2. Conversaciones directas en Gmail
 *   3. Formularios web
 *   4. Otros patrones de leads (registros, booking, pagos)
 *
 * REQUIERE: secrets/gmail_token_resonancias.json
 * SETUP:    node scripts/gmail-oauth-setup-resonancias.js
 *
 * USO:
 *   node scripts/extract-all-leads-resonancias.js [--max=3000]
 *
 * SALIDA:
 *   docs/leads_resonancias_gmail.md
 */

const fs   = require('fs');
const path = require('path');
const { google } = require('googleapis');

// ── PATHS ───────────────────────────────────────────────────────────────────
const SECRETS_DIR = path.join(__dirname, '..', 'secrets');
const CREDS_FILE  = path.join(SECRETS_DIR, 'gmail_credentials_piano.json');
const TOKEN_FILE  = path.join(SECRETS_DIR, 'gmail_token_resonancias.json');
const OUTPUT_FILE = path.join(__dirname, '..', 'docs', 'leads_resonancias_gmail.md');

// ── CONFIG ──────────────────────────────────────────────────────────────────
const SENDER_GR   = 'noloop@app.getresponse.com';
const DEFAULT_MAX = 3000;
const maxArg = process.argv.find(a => a.startsWith('--max='));
const MAX_RESULTS = maxArg ? parseInt(maxArg.split('=')[1]) : DEFAULT_MAX;

const NOMBRES_FALSOS = [
    'escriba su nombre','your name','sin nombre','nombre','name',
    'tu nombre','ingrese su nombre','enter your name','su nombre',
    'test','prueba','asdf','aaa','xxx','zzz',
];

// ── Filtros Fuente 2: Conversaciones directas ───────────────────────────────
const DIRECT_QUERIES = [
    '"clases de piano"',
    '"clases de guitarra"',
    '"clases de canto"',
    '"quiero aprender piano"',
    '"precio" OR "valor" OR "cuánto cuesta"',
    '"horario" OR "disponibilidad"',
    '"me interesa"',
    '"información" OR "informacion"',
    '"profesor de piano"',
];

// ── Filtros Fuente 3: Formularios web ───────────────────────────────────────
const FORM_QUERIES = [
    '"formulario" OR "contact form" OR "form submission"',
    '"nuevo mensaje" OR "new message"',
    '"You have a new message" OR "Tienes un nuevo mensaje"',
];

// ── Filtros Fuente 4: Otros patrones ────────────────────────────────────────
const OTHER_QUERIES = [
    '"se ha registrado" OR "se registró"',
    '"nueva reserva" OR "new booking"',
    '"nuevo alumno" OR "new student"',
    '"pago recibido" OR "payment received"',
];

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
    // Auto-refresh
    auth.on('tokens', t => {
        const merged = { ...token, ...t };
        fs.writeFileSync(TOKEN_FILE, JSON.stringify(merged, null, 2));
        console.log('[Auth] Token refrescado automáticamente');
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
        // Primero text/plain
        for (const p of payload.parts) {
            if (p.mimeType === 'text/plain' && p.body?.data) return decodeBase64(p.body.data);
            if (p.parts) { const n = extractTextBody(p); if (n) return n; }
        }
        // Fallback a text/html sin tags
        for (const p of payload.parts) {
            if (p.mimeType === 'text/html' && p.body?.data)
                return decodeBase64(p.body.data).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
        }
    }
    return '';
}

function getHeader(payload, name) {
    return (payload.headers || []).find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';
}

async function fetchAllIds(gmail, query, max) {
    const ids = [];
    let pageToken;
    do {
        const r = await gmail.users.messages.list({
            userId: 'me', q: query, maxResults: 500, pageToken, includeSpamTrash: false,
        });
        ids.push(...(r.data.messages || []).map(m => m.id));
        pageToken = r.data.nextPageToken;
        if (ids.length >= max) break;
    } while (pageToken);
    return ids.slice(0, max);
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─────────────────────────────────────────────────────────────────────────────
// PARSER — GetResponse
// ─────────────────────────────────────────────────────────────────────────────

function extractField(text, labels) {
    for (const label of labels) {
        const re = new RegExp(`${label}\\s*:\\s*(.+?)(?:\\n|$)`, 'i');
        const m = text.match(re);
        if (m) return m[1].trim();
    }
    return '';
}

function parseGetResponseLead(body, subject) {
    const text = body.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    
    // Campaña desde body o desde subject [camp@app.getresponse.com]
    let campaign = extractField(text, ['Campaña', 'Campaign', 'Campa']);
    if (!campaign) {
        const fromSubject = subject.match(/\[([^\]@]+)@app\.getresponse\.com\]/);
        if (fromSubject) campaign = fromSubject[1].trim();
    }

    return {
        nombre:   extractField(text, ['Nombre', 'Name']),
        email:    extractField(text, ['Email', 'E-mail']),
        ciudad:   extractField(text, ['Ciudad', 'City']),
        pais:     extractField(text, ['País', 'Country', 'Pais']),
        fecha:    extractField(text, ['Fecha', 'Date', 'Timestamp']),
        phone:    extractField(text, ['phone', 'mobile_phone', 'Phone', 'Teléfono', 'telefono']),
        referer:  extractField(text, ['http_referer', 'Referer']),
        campaign: campaign ? campaign.toLowerCase().trim() : '(sin_campo)',
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// PARSER — Conversaciones directas / Formularios
// ─────────────────────────────────────────────────────────────────────────────

function extractEmailFromHeader(fromHeader) {
    const m = fromHeader.match(/<([^>]+)>/);
    return m ? m[1].toLowerCase().trim() : fromHeader.toLowerCase().trim();
}

function extractNameFromHeader(fromHeader) {
    // "Nombre Apellido <email>" → "Nombre Apellido"
    const m = fromHeader.match(/^"?([^"<]+)"?\s*</);
    return m ? m[1].trim() : '';
}

function detectIntention(subject, body) {
    const text = (subject + ' ' + body).toLowerCase();
    const intenciones = [];
    
    if (text.includes('piano'))       intenciones.push('piano');
    if (text.includes('guitarra'))    intenciones.push('guitarra');
    if (text.includes('canto'))       intenciones.push('canto');
    if (text.includes('composición') || text.includes('composicion')) intenciones.push('composición');
    if (text.includes('armonía') || text.includes('armonia'))         intenciones.push('armonía');
    if (text.includes('teoría') || text.includes('teoria'))           intenciones.push('teoría');
    if (text.includes('precio') || text.includes('valor') || text.includes('tarifa') || text.includes('cuánto') || text.includes('cuanto'))
        intenciones.push('pregunta_precio');
    if (text.includes('horario') || text.includes('disponibilidad'))
        intenciones.push('pregunta_horario');
    if (text.includes('clase'))       intenciones.push('clases');
    if (text.includes('aprender'))    intenciones.push('quiere_aprender');
    if (text.includes('información') || text.includes('informacion'))
        intenciones.push('pide_info');
    if (text.includes('reserva') || text.includes('booking'))
        intenciones.push('reserva');
    if (text.includes('pago') || text.includes('payment'))
        intenciones.push('pago');
    if (text.includes('registr'))
        intenciones.push('registro');
    
    return intenciones.length > 0 ? intenciones.join(', ') : 'contacto_general';
}

// ─────────────────────────────────────────────────────────────────────────────
// NORMALIZACIÓN Y CLASIFICACIÓN
// ─────────────────────────────────────────────────────────────────────────────

function normalizarNombre(raw) {
    if (!raw) return 'sin_nombre';
    const lower = raw.toLowerCase().trim();
    if (NOMBRES_FALSOS.some(f => lower === f || lower.includes(f))) return 'sin_nombre';
    if (/^\d+$/.test(raw.trim())) return 'sin_nombre';
    if (raw.trim().length < 2) return 'sin_nombre';
    return raw.trim();
}

function isValidEmail(email) {
    return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !email.includes('noreply') && !email.includes('no-reply');
}

// Emails a excluir (cuentas propias, sistemas, etc.)
const EXCLUDED_EMAILS = new Set([
    'escuela.resonancias@gmail.com',
    'noreply@google.com',
    'no-reply@google.com',
    'noloop@app.getresponse.com',
    'mailer-daemon@googlemail.com',
    'notifications@getresponse.com',
]);

function isExcludedEmail(email) {
    if (!email) return true;
    const lower = email.toLowerCase().trim();
    if (EXCLUDED_EMAILS.has(lower)) return true;
    if (lower.includes('noreply') || lower.includes('no-reply')) return true;
    if (lower.includes('mailer-daemon')) return true;
    if (lower.includes('@google.com') && !lower.includes('gmail')) return true;
    return false;
}

/**
 * Clasificación por prioridad según las reglas del usuario
 */
function calcPrioridad(lead) {
    const text = `${lead.intencion || ''} ${lead.referer || ''} ${lead.campaign || ''} ${lead.asunto || ''}`.toLowerCase();
    const nombre = (lead.nombre || '').toLowerCase();
    const email = (lead.email || '').toLowerCase();
    
    // PRIORIDAD 1: alta_piano
    if (text.includes('piano') || text.includes('profesordepiano')) {
        return 'alta_piano';
    }
    
    // PRIORIDAD 2: alta_composicion_armonia
    if (text.includes('composición') || text.includes('composicion') || 
        text.includes('armonía') || text.includes('armonia') ||
        text.includes('teoría') || text.includes('teoria')) {
        return 'alta_composicion_armonia';
    }
    
    // PRIORIDAD 3: media_musica
    if (text.includes('guitarra') || text.includes('canto') ||
        text.includes('música') || text.includes('musica') ||
        text.includes('clase') || text.includes('aprender') ||
        text.includes('precio') || text.includes('horario') ||
        text.includes('pide_info') || text.includes('pregunta')) {
        return 'media_musica';
    }
    
    // PRIORIDAD 4: baja_indirecta
    return 'baja_indirecta';
}

// ─────────────────────────────────────────────────────────────────────────────
// FUENTE 1: GETRESPONSE — Discovery + Extracción
// ─────────────────────────────────────────────────────────────────────────────

async function extractGetResponseLeads(gmail) {
    console.log('\n════════════════════════════════════════════════════════');
    console.log('  FUENTE 1 — GetResponse (todas las campañas)');
    console.log('════════════════════════════════════════════════════════\n');
    
    // Buscar con múltiples variantes de remitente
    const queries = [
        `from:${SENDER_GR}`,
        'from:app.getresponse.com',
    ];
    
    // Recoger todos los IDs sin duplicar
    const allIdsSet = new Set();
    for (const q of queries) {
        console.log(`[GetResponse] 🔍 Buscando: ${q}`);
        const ids = await fetchAllIds(gmail, q, MAX_RESULTS);
        ids.forEach(id => allIdsSet.add(id));
        console.log(`  → ${ids.length} mensajes`);
    }
    
    const allIds = [...allIdsSet];
    console.log(`[GetResponse] 📨 Total IDs únicos: ${allIds.length}\n`);

    // Discovery: mapear campañas
    const campaignMap = new Map(); // campaña → count
    const leads = [];
    
    for (let i = 0; i < allIds.length; i++) {
        process.stdout.write(`\r  Procesando: ${i + 1}/${allIds.length}`);
        try {
            const msg = await gmail.users.messages.get({ userId: 'me', id: allIds[i], format: 'full' });
            const body = extractTextBody(msg.data.payload);
            const subject = getHeader(msg.data.payload, 'Subject');
            const lead = parseGetResponseLead(body, subject);
            
            if (!lead.email && !lead.nombre) continue;
            if (!isValidEmail(lead.email)) continue;
            if (isExcludedEmail(lead.email)) continue;
            
            // Campaña tracking
            campaignMap.set(lead.campaign, (campaignMap.get(lead.campaign) || 0) + 1);
            
            leads.push({
                nombre:   normalizarNombre(lead.nombre),
                email:    lead.email.toLowerCase().trim(),
                fecha:    lead.fecha || '—',
                ciudad:   lead.ciudad || '',
                pais:     lead.pais || '',
                campaign: lead.campaign,
                referer:  lead.referer || '',
                phone:    lead.phone || '',
                fuente:   'getresponse',
                intencion: '',
                asunto:   subject,
            });
        } catch (err) {
            if (err.code === 429) { await sleep(2000); i--; continue; }
        }
        if ((i + 1) % 30 === 0) await sleep(200);
    }
    
    console.log(`\n\n[GetResponse] ✅ ${leads.length} leads extraídos`);
    console.log('[GetResponse] 📋 Campañas detectadas:');
    for (const [c, n] of [...campaignMap.entries()].sort((a, b) => b[1] - a[1])) {
        console.log(`    ${n.toString().padStart(4)}x  →  ${c}`);
    }
    
    return { leads, campaignMap };
}

// ─────────────────────────────────────────────────────────────────────────────
// FUENTE 2: CONVERSACIONES DIRECTAS
// ─────────────────────────────────────────────────────────────────────────────

async function extractDirectLeads(gmail) {
    console.log('\n════════════════════════════════════════════════════════');
    console.log('  FUENTE 2 — Conversaciones directas');
    console.log('════════════════════════════════════════════════════════\n');
    
    const allIdsSet = new Set();
    for (const q of DIRECT_QUERIES) {
        // Excluir emails de GetResponse para no duplicar
        const fullQuery = `${q} -from:${SENDER_GR} -from:getresponse.com`;
        console.log(`[Directo] 🔍 ${q}`);
        const ids = await fetchAllIds(gmail, fullQuery, 500);
        ids.forEach(id => allIdsSet.add(id));
        console.log(`  → ${ids.length} mensajes`);
    }
    
    const allIds = [...allIdsSet];
    console.log(`\n[Directo] 📨 Total IDs únicos: ${allIds.length}\n`);
    
    const leads = [];
    for (let i = 0; i < allIds.length; i++) {
        process.stdout.write(`\r  Procesando: ${i + 1}/${allIds.length}`);
        try {
            const msg = await gmail.users.messages.get({ userId: 'me', id: allIds[i], format: 'full' });
            const from    = getHeader(msg.data.payload, 'From');
            const subject = getHeader(msg.data.payload, 'Subject');
            const date    = getHeader(msg.data.payload, 'Date');
            const body    = extractTextBody(msg.data.payload);
            
            const email = extractEmailFromHeader(from);
            if (!isValidEmail(email) || isExcludedEmail(email)) continue;
            
            const nombre = extractNameFromHeader(from);
            const intencion = detectIntention(subject, body);
            
            leads.push({
                nombre:   normalizarNombre(nombre),
                email:    email,
                fecha:    date ? new Date(date).toISOString().split('T')[0] : '—',
                ciudad:   '',
                pais:     '',
                campaign: '',
                referer:  '',
                phone:    '',
                fuente:   'gmail_directo',
                intencion,
                asunto:   subject,
            });
        } catch (err) {
            if (err.code === 429) { await sleep(2000); i--; continue; }
        }
        if ((i + 1) % 30 === 0) await sleep(200);
    }
    
    console.log(`\n\n[Directo] ✅ ${leads.length} leads extraídos`);
    return { leads };
}

// ─────────────────────────────────────────────────────────────────────────────
// FUENTE 3: FORMULARIOS WEB
// ─────────────────────────────────────────────────────────────────────────────

async function extractFormLeads(gmail) {
    console.log('\n════════════════════════════════════════════════════════');
    console.log('  FUENTE 3 — Formularios web');
    console.log('════════════════════════════════════════════════════════\n');
    
    const allIdsSet = new Set();
    for (const q of FORM_QUERIES) {
        const fullQuery = `${q} -from:${SENDER_GR}`;
        console.log(`[Formulario] 🔍 ${q}`);
        const ids = await fetchAllIds(gmail, fullQuery, 500);
        ids.forEach(id => allIdsSet.add(id));
        console.log(`  → ${ids.length} mensajes`);
    }
    
    const allIds = [...allIdsSet];
    console.log(`\n[Formulario] 📨 Total IDs únicos: ${allIds.length}\n`);
    
    const leads = [];
    for (let i = 0; i < allIds.length; i++) {
        process.stdout.write(`\r  Procesando: ${i + 1}/${allIds.length}`);
        try {
            const msg = await gmail.users.messages.get({ userId: 'me', id: allIds[i], format: 'full' });
            const body    = extractTextBody(msg.data.payload);
            const from    = getHeader(msg.data.payload, 'From');
            const subject = getHeader(msg.data.payload, 'Subject');
            const date    = getHeader(msg.data.payload, 'Date');
            
            // Intentar extraer email del body (formularios suelen tener el email dentro)
            let email = extractField(body, ['Email', 'E-mail', 'Correo']);
            let nombre = extractField(body, ['Nombre', 'Name', 'Nombre completo']);
            
            // Fallback: usar From header
            if (!isValidEmail(email)) {
                email = extractEmailFromHeader(from);
            }
            if (!nombre) {
                nombre = extractNameFromHeader(from);
            }
            
            if (!isValidEmail(email) || isExcludedEmail(email)) continue;
            
            const intencion = detectIntention(subject, body);
            
            leads.push({
                nombre:   normalizarNombre(nombre),
                email:    email.toLowerCase().trim(),
                fecha:    date ? new Date(date).toISOString().split('T')[0] : '—',
                ciudad:   extractField(body, ['Ciudad', 'City']) || '',
                pais:     '',
                campaign: '',
                referer:  '',
                phone:    extractField(body, ['Teléfono', 'Phone', 'phone', 'Celular']) || '',
                fuente:   'formulario_web',
                intencion,
                asunto:   subject,
            });
        } catch (err) {
            if (err.code === 429) { await sleep(2000); i--; continue; }
        }
        if ((i + 1) % 30 === 0) await sleep(200);
    }
    
    console.log(`\n\n[Formulario] ✅ ${leads.length} leads extraídos`);
    return { leads };
}

// ─────────────────────────────────────────────────────────────────────────────
// FUENTE 4: OTROS PATRONES
// ─────────────────────────────────────────────────────────────────────────────

async function extractOtherLeads(gmail) {
    console.log('\n════════════════════════════════════════════════════════');
    console.log('  FUENTE 4 — Otros patrones de leads');
    console.log('════════════════════════════════════════════════════════\n');
    
    const allIdsSet = new Set();
    for (const q of OTHER_QUERIES) {
        const fullQuery = `${q} -from:${SENDER_GR}`;
        console.log(`[Otros] 🔍 ${q}`);
        const ids = await fetchAllIds(gmail, fullQuery, 300);
        ids.forEach(id => allIdsSet.add(id));
        console.log(`  → ${ids.length} mensajes`);
    }
    
    const allIds = [...allIdsSet];
    console.log(`\n[Otros] 📨 Total IDs únicos: ${allIds.length}\n`);
    
    const leads = [];
    for (let i = 0; i < allIds.length; i++) {
        process.stdout.write(`\r  Procesando: ${i + 1}/${allIds.length}`);
        try {
            const msg = await gmail.users.messages.get({ userId: 'me', id: allIds[i], format: 'full' });
            const body    = extractTextBody(msg.data.payload);
            const from    = getHeader(msg.data.payload, 'From');
            const subject = getHeader(msg.data.payload, 'Subject');
            const date    = getHeader(msg.data.payload, 'Date');
            
            let email = extractField(body, ['Email', 'E-mail', 'Correo']);
            let nombre = extractField(body, ['Nombre', 'Name']);
            
            if (!isValidEmail(email)) email = extractEmailFromHeader(from);
            if (!nombre) nombre = extractNameFromHeader(from);
            if (!isValidEmail(email) || isExcludedEmail(email)) continue;
            
            const intencion = detectIntention(subject, body);
            
            leads.push({
                nombre:   normalizarNombre(nombre),
                email:    email.toLowerCase().trim(),
                fecha:    date ? new Date(date).toISOString().split('T')[0] : '—',
                ciudad:   extractField(body, ['Ciudad', 'City']) || '',
                pais:     '',
                campaign: '',
                referer:  '',
                phone:    '',
                fuente:   'otro_patron',
                intencion,
                asunto:   subject,
            });
        } catch (err) {
            if (err.code === 429) { await sleep(2000); i--; continue; }
        }
        if ((i + 1) % 30 === 0) await sleep(200);
    }
    
    console.log(`\n\n[Otros] ✅ ${leads.length} leads extraídos`);
    return { leads };
}

// ─────────────────────────────────────────────────────────────────────────────
// DEDUPLICACIÓN Y MERGE
// ─────────────────────────────────────────────────────────────────────────────

function deduplicateAndMerge(allLeads) {
    const byEmail = new Map(); // email → merged lead
    let duplicates = 0;
    
    for (const lead of allLeads) {
        const key = lead.email.toLowerCase().trim();
        if (!key) continue;
        
        if (byEmail.has(key)) {
            duplicates++;
            const existing = byEmail.get(key);
            // Merge: mantener datos más completos
            if (!existing.nombre || existing.nombre === 'sin_nombre') existing.nombre = lead.nombre;
            if (!existing.ciudad && lead.ciudad)   existing.ciudad = lead.ciudad;
            if (!existing.pais && lead.pais)       existing.pais = lead.pais;
            if (!existing.phone && lead.phone)     existing.phone = lead.phone;
            if (!existing.referer && lead.referer) existing.referer = lead.referer;
            // Agregar fuente
            if (!existing.fuentes.includes(lead.fuente)) {
                existing.fuentes.push(lead.fuente);
            }
            // Agregar campaña
            if (lead.campaign && !existing.campanas.includes(lead.campaign)) {
                existing.campanas.push(lead.campaign);
            }
            // Merge intención
            if (lead.intencion && !existing.intencion.includes(lead.intencion)) {
                existing.intencion = existing.intencion 
                    ? `${existing.intencion}, ${lead.intencion}` 
                    : lead.intencion;
            }
            // Fecha más antigua
            if (lead.fecha && lead.fecha !== '—' && (!existing.fecha || existing.fecha === '—' || lead.fecha < existing.fecha)) {
                existing.fecha = lead.fecha;
            }
        } else {
            byEmail.set(key, {
                ...lead,
                fuentes:  [lead.fuente],
                campanas: lead.campaign ? [lead.campaign] : [],
            });
        }
    }
    
    // Calcular prioridad final después del merge
    const unique = [...byEmail.values()].map(lead => {
        lead.prioridad = calcPrioridad(lead);
        lead.fuentesStr = lead.fuentes.join(', ');
        lead.campanasStr = lead.campanas.join(', ');
        return lead;
    });
    
    return { unique, duplicates, multiSource: unique.filter(l => l.fuentes.length > 1).length };
}

// ─────────────────────────────────────────────────────────────────────────────
// MARKDOWN OUTPUT
// ─────────────────────────────────────────────────────────────────────────────

function esc(s) { return (s || '').replace(/\|/g, '\\|') || '—'; }

function buildMarkdown(unique, stats, campaignMap) {
    const now = new Date().toISOString().split('T')[0];
    
    const p1 = unique.filter(l => l.prioridad === 'alta_piano');
    const p2 = unique.filter(l => l.prioridad === 'alta_composicion_armonia');
    const p3 = unique.filter(l => l.prioridad === 'media_musica');
    const p4 = unique.filter(l => l.prioridad === 'baja_indirecta');
    
    function makeTable(leads) {
        if (leads.length === 0) return '*(ninguno)*\n';
        const header = '| nombre | email | fecha | ciudad | campaña | fuente | intención |\n|--------|-------|-------|--------|---------|--------|-----------|\n';
        const rows = leads
            .sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''))
            .map(l => `| ${esc(l.nombre)} | ${esc(l.email)} | ${esc(l.fecha)} | ${esc(l.ciudad)} | ${esc(l.campanasStr)} | ${esc(l.fuentesStr)} | ${esc(l.intencion)} |`)
            .join('\n');
        return header + rows + '\n';
    }
    
    // Campañas GetResponse
    const campList = [...campaignMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([c, n]) => `- **${c}**: ${n} contactos`)
        .join('\n');
    
    // Top 15 recomendados
    const top15 = [...p1, ...p2, ...p3]
        .filter(l => l.email && l.nombre !== 'sin_nombre')
        .slice(0, 15)
        .map((l, i) => {
            let razon = '';
            if (l.prioridad === 'alta_piano') razon = `Interés directo en piano (${l.fuentesStr})`;
            else if (l.prioridad === 'alta_composicion_armonia') razon = `Interés en composición/armonía (${l.fuentesStr})`;
            else razon = `Interés musical — ${l.intencion || 'contacto general'} (${l.fuentesStr})`;
            if (l.fuentes.length > 1) razon += ' — aparece en múltiples fuentes';
            return `${i + 1}. **${l.nombre}** — ${l.email} — ${razon}`;
        })
        .join('\n');

    return `# Leads Gmail — escuela.resonancias@gmail.com
# Generado: ${now}
# Campañas GetResponse detectadas: ${[...campaignMap.keys()].join(', ')}

---

## CAMPAÑAS GETRESPONSE DETECTADAS

${campList}

---

## PRIORIDAD 1 — Alta Piano (${p1.length})

${makeTable(p1)}

---

## PRIORIDAD 2 — Alta Composición y Armonía (${p2.length})

${makeTable(p2)}

---

## PRIORIDAD 3 — Media Música General (${p3.length})

${makeTable(p3)}

---

## PRIORIDAD 4 — Baja Indirecta (${p4.length})

${makeTable(p4)}

---

## RESUMEN FINAL

### CAMPAÑAS GETRESPONSE DETECTADAS
${campList}

### TOTALES POR FUENTE
- **GetResponse**: ${stats.bySource.getresponse || 0} contactos
- **Conversaciones directas**: ${stats.bySource.gmail_directo || 0} contactos
- **Formularios web**: ${stats.bySource.formulario_web || 0} contactos
- **Otras fuentes**: ${stats.bySource.otro_patron || 0} contactos

### TOTALES POR PRIORIDAD
- **Prioridad 1 — Alta Piano**: ${p1.length}
- **Prioridad 2 — Composición/Armonía**: ${p2.length}
- **Prioridad 3 — Media Música**: ${p3.length}
- **Prioridad 4 — Baja Indirecta**: ${p4.length}

### DEDUPLICACIÓN
- **Contactos únicos totales**: ${unique.length}
- **Duplicados eliminados**: ${stats.duplicates}
- **Contactos en múltiples fuentes**: ${stats.multiSource}
- **Contactos sin email descartados**: ${stats.discarded}

### TOP 15 RECOMENDADOS PARA CONTACTAR PRIMERO

${top15}

---
*Generado automáticamente el ${now}*
`;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
    console.log('\n📧  Extractor COMPLETO — escuela.resonancias@gmail.com');
    console.log('    4 fuentes · clasificación · deduplicación\n');
    
    const auth  = buildAuthClient();
    const gmail = google.gmail({ version: 'v1', auth });
    
    // Verificar conexión
    let accountEmail = 'escuela.resonancias@gmail.com';
    try {
        const p = await gmail.users.getProfile({ userId: 'me' });
        accountEmail = p.data.emailAddress;
        console.log(`[Gmail] 📬 Conectado como: ${accountEmail}`);
        console.log(`        Mensajes totales: ${p.data.messagesTotal}\n`);
        
        if (accountEmail !== 'escuela.resonancias@gmail.com') {
            console.error(`\n⚠️  ADVERTENCIA: Conectado a ${accountEmail}, no a escuela.resonancias@gmail.com`);
            console.error('    Elimina secrets/gmail_token_resonancias.json y re-autentícate.\n');
        }
    } catch (err) {
        console.error('[Gmail] ❌ Error de autenticación:', err.message);
        if (err.code === 401 || err.message.includes('invalid_grant')) {
            console.error('\n   Token expirado. Ejecuta:');
            console.error('   node scripts/gmail-oauth-setup-resonancias.js\n');
        }
        process.exit(1);
    }
    
    // ── Extraer las 4 fuentes ──
    const grResult   = await extractGetResponseLeads(gmail);
    const dirResult  = await extractDirectLeads(gmail);
    const formResult = await extractFormLeads(gmail);
    const othResult  = await extractOtherLeads(gmail);
    
    // ── Combinar todas ──
    const allLeads = [
        ...grResult.leads,
        ...dirResult.leads,
        ...formResult.leads,
        ...othResult.leads,
    ];
    
    console.log('\n════════════════════════════════════════════════════════');
    console.log(`  TOTAL CRUDO: ${allLeads.length} leads (antes de deduplicar)`);
    console.log('════════════════════════════════════════════════════════\n');

    // ── Deduplicar ──
    const { unique, duplicates, multiSource } = deduplicateAndMerge(allLeads);
    
    // Stats por fuente (contactos únicos)
    const bySource = {};
    for (const l of unique) {
        for (const f of l.fuentes) {
            bySource[f] = (bySource[f] || 0) + 1;
        }
    }
    
    const stats = {
        totalRaw: allLeads.length,
        duplicates,
        multiSource,
        discarded: allLeads.filter(l => !isValidEmail(l.email)).length,
        bySource,
    };
    
    // ── Generar markdown ──
    const md = buildMarkdown(unique, stats, grResult.campaignMap);
    fs.writeFileSync(OUTPUT_FILE, md, 'utf8');
    
    // ── Resumen en consola ──
    console.log('\n╔══════════════════════════════════════════════════════╗');
    console.log('║           RESUMEN FINAL DE EXTRACCIÓN               ║');
    console.log('╠══════════════════════════════════════════════════════╣');
    console.log(`║  Cuenta: ${accountEmail.padEnd(42)}║`);
    console.log('╠══════════════════════════════════════════════════════╣');
    console.log('║  CAMPAÑAS GETRESPONSE:');
    for (const [c, n] of [...grResult.campaignMap.entries()].sort((a, b) => b[1] - a[1])) {
        console.log(`║    ${c.padEnd(30)} ${n.toString().padStart(4)} contactos`);
    }
    console.log('╠══════════════════════════════════════════════════════╣');
    console.log('║  POR FUENTE:');
    console.log(`║    GetResponse:      ${(bySource.getresponse || 0).toString().padStart(5)}`);
    console.log(`║    Gmail directo:    ${(bySource.gmail_directo || 0).toString().padStart(5)}`);
    console.log(`║    Formularios:      ${(bySource.formulario_web || 0).toString().padStart(5)}`);
    console.log(`║    Otros:            ${(bySource.otro_patron || 0).toString().padStart(5)}`);
    console.log('╠══════════════════════════════════════════════════════╣');
    console.log('║  POR PRIORIDAD:');
    const p1 = unique.filter(l => l.prioridad === 'alta_piano').length;
    const p2 = unique.filter(l => l.prioridad === 'alta_composicion_armonia').length;
    const p3 = unique.filter(l => l.prioridad === 'media_musica').length;
    const p4 = unique.filter(l => l.prioridad === 'baja_indirecta').length;
    console.log(`║    P1 Alta Piano:    ${p1.toString().padStart(5)}`);
    console.log(`║    P2 Composición:   ${p2.toString().padStart(5)}`);
    console.log(`║    P3 Media Música:  ${p3.toString().padStart(5)}`);
    console.log(`║    P4 Baja Indir.:   ${p4.toString().padStart(5)}`);
    console.log('╠══════════════════════════════════════════════════════╣');
    console.log('║  DEDUPLICACIÓN:');
    console.log(`║    Contactos únicos:    ${unique.length.toString().padStart(5)}`);
    console.log(`║    Duplicados elimin.:  ${duplicates.toString().padStart(5)}`);
    console.log(`║    Multi-fuente:        ${multiSource.toString().padStart(5)}`);
    console.log('╚══════════════════════════════════════════════════════╝');
    console.log(`\n✅  Archivo guardado: ${OUTPUT_FILE}\n`);
}

main().catch(err => {
    console.error('\n💥 Error:', err.message);
    if (err.code === 401 || err.message?.includes('invalid_grant')) {
        console.error('   Token expirado. Ejecuta: node scripts/gmail-oauth-setup-resonancias.js');
    }
    process.exit(1);
});
