/**
 * scripts/extract-profesordepiano-leads.js
 * Extrae leads de GetResponse (campaña "profesordepiano") desde una segunda
 * cuenta de Gmail.
 *
 * REQUIERE:
 *   - secrets/gmail_credentials_piano.json  (Google Cloud Console)
 *   - secrets/gmail_token_piano.json        (generado con gmail-oauth-setup-piano.js)
 *
 * USO:
 *   node scripts/extract-profesordepiano-leads.js [--max=1000]
 *
 * SALIDA:
 *   data/leads_profesordepiano.md   ← NO toca leads_getresponse.md
 *
 * FORMATO EMAIL ESPERADO (inglés):
 *   Name: [nombre]
 *   Email: [email]
 *   http_referer: [url]
 *   Timestamp: [fecha]
 *   Campaign: profesordepiano
 */

const fs    = require('fs');
const path  = require('path');
const { google } = require('googleapis');

// === RUTAS — Segunda cuenta (ProfesorDePiano) ===
const SECRETS_DIR   = path.join(__dirname, '..', 'secrets');
const CREDS_FILE    = path.join(SECRETS_DIR, 'gmail_credentials_piano.json');
const TOKEN_FILE    = path.join(SECRETS_DIR, 'gmail_token_piano.json');
const OUTPUT_DIR    = path.join(__dirname, '..', 'data');
const OUTPUT_FILE   = path.join(OUTPUT_DIR, 'leads_profesordepiano.md');

// Archivo de lista anterior para detectar duplicados
const PREV_FILE     = path.join(OUTPUT_DIR, 'leads_getresponse.md');

// Filtro Gmail: remitente + campaña
const SENDER        = 'noloop@app.getresponse.com';
const CAMPAIGN      = 'profesordepiano';
const GMAIL_QUERY   = `from:${SENDER} "${CAMPAIGN}"`;

const SCOPES        = ['https://www.googleapis.com/auth/gmail.readonly'];
const DEFAULT_MAX   = 1000;

// Nombres genéricos que GetResponse pone como placeholder
const NOMBRES_FALSOS = [
    'escriba su nombre',
    'your name',
    'nombre',
    'name',
    'tu nombre',
    'ingrese su nombre',
    'enter your name',
    'su nombre',
    'sin nombre',
];

// ─────────────────────────────────────────────────────────────────────────────
// ARGUMENTOS
// ─────────────────────────────────────────────────────────────────────────────
const maxArg = process.argv.find(a => a.startsWith('--max='));
const MAX_RESULTS = maxArg ? parseInt(maxArg.split('=')[1]) : DEFAULT_MAX;

// ─────────────────────────────────────────────────────────────────────────────
// AUTENTICACIÓN
// ─────────────────────────────────────────────────────────────────────────────

function buildAuthClient() {
    if (!fs.existsSync(CREDS_FILE)) {
        console.error(`\n❌  No se encontró: ${CREDS_FILE}`);
        console.error('    Ejecuta primero: node scripts/gmail-oauth-setup-piano.js\n');
        process.exit(1);
    }
    if (!fs.existsSync(TOKEN_FILE)) {
        console.error(`\n❌  No se encontró: ${TOKEN_FILE}`);
        console.error('    Ejecuta primero: node scripts/gmail-oauth-setup-piano.js\n');
        process.exit(1);
    }

    const creds = JSON.parse(fs.readFileSync(CREDS_FILE, 'utf8'));
    const token = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));

    const { client_id, client_secret } = creds.installed || creds.web;
    const auth = new google.auth.OAuth2(client_id, client_secret, 'http://localhost:3839');  // mismo REDIRECT_PORT que en gmail-oauth-setup-piano.js
    auth.setCredentials(token);

    // Auto-renovar token
    auth.on('tokens', (newTokens) => {
        const merged = { ...token, ...newTokens };
        fs.writeFileSync(TOKEN_FILE, JSON.stringify(merged, null, 2));
        console.log('[Gmail] 🔄 Token renovado');
    });

    return auth;
}

// ─────────────────────────────────────────────────────────────────────────────
// GMAIL
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Obtiene todos los IDs de mensajes con paginación automática.
 */
async function fetchAllMessageIds(gmail) {
    const ids = [];
    let pageToken = undefined;

    console.log(`[Gmail] 🔍 Buscando con filtro: ${GMAIL_QUERY}`);

    do {
        const res = await gmail.users.messages.list({
            userId: 'me',
            q: GMAIL_QUERY,
            maxResults: 100,
            pageToken,
            includeSpamTrash: true,
        });

        const msgs = res.data.messages || [];
        ids.push(...msgs.map(m => m.id));
        pageToken = res.data.nextPageToken;

        process.stdout.write(`\r  Encontrados: ${ids.length} mensajes...`);

        if (ids.length >= MAX_RESULTS) break;
    } while (pageToken);

    console.log(`\n[Gmail] ✅ Total mensajes encontrados: ${ids.length}`);
    return ids.slice(0, MAX_RESULTS);
}

/**
 * Decodifica base64url a texto.
 */
function decodeBase64(data) {
    return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

/**
 * Extrae el cuerpo text/plain de un mensaje (soporta multipart anidado).
 */
function extractTextBody(payload) {
    if (payload.body?.data) {
        return decodeBase64(payload.body.data);
    }
    if (payload.parts) {
        for (const part of payload.parts) {
            if (part.mimeType === 'text/plain' && part.body?.data) {
                return decodeBase64(part.body.data);
            }
            if (part.parts) {
                const nested = extractTextBody(part);
                if (nested) return nested;
            }
        }
        // Fallback HTML → texto plano
        for (const part of payload.parts) {
            if (part.mimeType === 'text/html' && part.body?.data) {
                return decodeBase64(part.body.data).replace(/<[^>]+>/g, ' ');
            }
        }
    }
    return '';
}

/**
 * Extrae un campo del cuerpo del email buscando múltiples etiquetas posibles.
 */
function extractField(text, labels) {
    for (const label of labels) {
        const regex = new RegExp(`${label}\\s*:\\s*(.+?)(?:\\n|$)`, 'i');
        const match = text.match(regex);
        if (match) return match[1].trim();
    }
    return '';
}

/**
 * Parsea el cuerpo de un email GetResponse en formato inglés.
 *
 * Formato esperado:
 *   Name: [nombre]
 *   Email: [email]
 *   http_referer: [url]
 *   Timestamp: [fecha]
 *   Campaign: profesordepiano
 */
function parseLead(body) {
    const text = body.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    const nombre       = extractField(text, ['Name', 'nombre', 'Nombre']);
    const email        = extractField(text, ['Email', 'E-mail', 'email', 'Correo']);
    const http_referer = extractField(text, ['http_referer', 'HTTP_REFERER', 'Referer', 'URL']);
    const timestamp    = extractField(text, ['Timestamp', 'Date', 'Fecha', 'fecha']);
    const campaign     = extractField(text, ['Campaign', 'Campaña', 'campaign']);

    // Intentar extraer ciudad del referer (parámetros URL o subdominios)
    // Ej: ?ciudad=santiago, /santiago/, ciudad=valparaiso, etc.
    const ciudad       = extractCityFromReferer(http_referer);

    return { nombre, email, http_referer, timestamp, campaign, ciudad };
}

/**
 * Intenta extraer ciudad desde la URL del referer.
 * Si no hay datos → retorna ''.
 */
function extractCityFromReferer(referer) {
    if (!referer) return '';
    try {
        const u = new URL(referer);
        // Buscar parámetros: ciudad=, city=, location=
        const paramCiudad = u.searchParams.get('ciudad')
            || u.searchParams.get('city')
            || u.searchParams.get('location')
            || u.searchParams.get('utm_content');
        if (paramCiudad) return normalizeCiudad(paramCiudad);
    } catch (_) { /* URL inválida */ }
    return '';
}

/**
 * Normaliza nombre de ciudad (trim, capitalize).
 */
function normalizeCiudad(raw) {
    return raw.trim().replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Determina prioridad según ciudad.
 * alta   → Santiago
 * media  → otra ciudad conocida
 * baja   → sin ciudad
 */
function calcPrioridad(ciudad) {
    if (!ciudad) return 'baja';
    const c = ciudad.toLowerCase().trim();
    if (c === 'santiago' || c === 'santiago de chile') return 'alta';
    return 'media';
}

/**
 * Normaliza el nombre: detecta placeholders genéricos → 'sin_nombre'.
 */
function normalizarNombre(raw) {
    if (!raw) return 'sin_nombre';
    const lower = raw.toLowerCase().trim();
    for (const fake of NOMBRES_FALSOS) {
        if (lower === fake || lower.includes(fake)) return 'sin_nombre';
    }
    // Nombre con demasiados números → probablemente vacío/inválido
    if (/^\d+$/.test(raw.trim())) return 'sin_nombre';
    return raw.trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// DETECCIÓN DE DUPLICADOS CON LISTA ANTERIOR
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lee los emails del archivo leads_getresponse.md anterior
 * y retorna un Set con todos los emails en minúsculas.
 */
function loadPreviousEmails() {
    const emails = new Set();
    if (!fs.existsSync(PREV_FILE)) return emails;

    const lines = fs.readFileSync(PREV_FILE, 'utf8').split('\n');
    for (const line of lines) {
        // Líneas de tabla Markdown: | nombre | email | ...
        const match = line.match(/\|\s*([^\|]+)\s*\|\s*([^\|@\s]+@[^\|@\s]+)\s*\|/);
        if (match) {
            emails.add(match[2].trim().toLowerCase());
        }
    }
    console.log(`[Duplicados] 📋 Lista anterior cargada: ${emails.size} emails de ${PREV_FILE}`);
    return emails;
}

// ─────────────────────────────────────────────────────────────────────────────
// GENERADOR DE MARKDOWN
// ─────────────────────────────────────────────────────────────────────────────

function buildMarkdown(leads, stats) {
    const now = new Date().toLocaleString('es-CL', { timeZone: 'America/Santiago' });

    const sortOrder = { alta: 0, media: 1, baja: 2 };
    const sorted = [...leads].sort((a, b) => sortOrder[a.prioridad] - sortOrder[b.prioridad]);

    const rows = sorted.map(l => {
        const dupFlag = l.duplicado ? ' ⚠️dup' : '';
        return `| ${esc(l.nombre)} | ${esc(l.email)}${dupFlag} | ${esc(l.fecha)} | ${esc(l.ciudad) || '—'} | ${l.prioridad} |`;
    }).join('\n');

    return `# Leads PianoLink — ProfesorDePiano.cl 2015-2016
<!-- Fuente: profesordepiano.cl -->
<!-- Campaña GetResponse: ${CAMPAIGN} -->
<!-- Generado: ${now} -->
<!-- Filtro Gmail: ${GMAIL_QUERY} -->

---

## Estadísticas

| Métrica | Valor |
|---------|-------|
| Emails procesados | ${stats.totalEmails} |
| Leads extraídos (con datos) | ${stats.totalLeads} |
| Contactos únicos guardados | ${stats.uniqueLeads} |
| Duplicados internos removidos | ${stats.internDups} |
| 🔥 Alta — Santiago | ${stats.alta} |
| 🌤️ Media — Regiones | ${stats.media} |
| 🧊 Baja — Sin ciudad | ${stats.baja} |
| ⚠️ Duplicados con lista anterior | ${stats.dupsPrev} |
| 📧 Sin nombre (placeholder) | ${stats.sinNombre} |

---

## Fuente
- Fuente: profesordepiano.cl
- Campaña GetResponse: ${CAMPAIGN}

---

## Contactos

> ⚠️ = email también presente en \`leads_getresponse.md\` (marcado pero NO eliminado)

| nombre | email | fecha | ciudad | prioridad |
|--------|-------|-------|--------|-----------|
${rows}

---

*Extraído el ${now}*
`;
}

function esc(str) {
    return (str || '').replace(/\|/g, '\\|') || '—';
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
    console.log('\n📧  Extractor ProfesorDePiano — GetResponse leads (cuenta 2)\n');

    const auth  = buildAuthClient();
    const gmail = google.gmail({ version: 'v1', auth });

    // Verificar conexión y mostrar qué cuenta Gmail es
    try {
        const profile = await gmail.users.getProfile({ userId: 'me' });
        console.log(`[Gmail] 📬 Conectado como: ${profile.data.emailAddress}`);
        console.log(`        Mensajes totales: ${profile.data.messagesTotal}`);
    } catch (err) {
        console.error('[Gmail] ❌ Error de autenticación:', err.message);
        console.error('    Vuelve a ejecutar: node scripts/gmail-oauth-setup-piano.js\n');
        process.exit(1);
    }

    // Cargar emails de lista anterior ANTES de procesar
    const emailsAnteriores = loadPreviousEmails();

    // Buscar mensajes
    const messageIds = await fetchAllMessageIds(gmail);

    if (messageIds.length === 0) {
        console.log(`\n⚠️  No se encontraron emails con filtro: ${GMAIL_QUERY}`);
        console.log('    Asegúrate de que corresponde a la cuenta Gmail correcta.\n');
        process.exit(0);
    }

    const leadsRaw   = [];
    const errores    = [];
    const vacios     = [];

    console.log(`\n[Gmail] ⚙️  Procesando ${messageIds.length} mensajes...\n`);

    for (let i = 0; i < messageIds.length; i++) {
        const msgId = messageIds[i];
        process.stdout.write(`\r  Procesando: ${i + 1}/${messageIds.length}`);

        try {
            const msg = await gmail.users.messages.get({
                userId: 'me',
                id: msgId,
                format: 'full',
            });

            const body = extractTextBody(msg.data.payload);
            const lead = parseLead(body);

            // Descartar mensajes sin email ni nombre
            if (!lead.nombre && !lead.email) {
                vacios.push(msgId);
                continue;
            }

            leadsRaw.push({
                nombre:   normalizarNombre(lead.nombre),
                email:    (lead.email || '').toLowerCase().trim(),
                fecha:    lead.timestamp || '—',
                ciudad:   lead.ciudad || '',
                referer:  lead.http_referer || '',
                campaign: lead.campaign || CAMPAIGN,
            });

        } catch (err) {
            errores.push({ id: msgId, error: err.message });
        }

        // Throttle: evitar rate limit
        if ((i + 1) % 20 === 0) {
            await new Promise(r => setTimeout(r, 200));
        }
    }

    console.log('\n');

    // ── Deduplicación interna (mismo email) — mantener primera aparición ──
    const seen     = new Set();
    const unique   = [];
    let   internDups = 0;

    for (const lead of leadsRaw) {
        const key = lead.email.toLowerCase();
        if (!key || seen.has(key)) {
            internDups++;
            continue;
        }
        seen.add(key);
        unique.push(lead);
    }

    // ── Marcar duplicados con lista anterior ──
    let dupsPrev = 0;
    for (const lead of unique) {
        if (emailsAnteriores.has(lead.email.toLowerCase())) {
            lead.duplicado = true;
            dupsPrev++;
        } else {
            lead.duplicado = false;
        }
    }

    // ── Asignar prioridad ──
    for (const lead of unique) {
        lead.prioridad = calcPrioridad(lead.ciudad);
    }

    // ── Estadísticas ──
    const alta      = unique.filter(l => l.prioridad === 'alta').length;
    const media     = unique.filter(l => l.prioridad === 'media').length;
    const baja      = unique.filter(l => l.prioridad === 'baja').length;
    const sinNombre = unique.filter(l => l.nombre === 'sin_nombre').length;

    const stats = {
        totalEmails: messageIds.length,
        totalLeads:  leadsRaw.length,
        uniqueLeads: unique.length,
        internDups,
        alta,
        media,
        baja,
        dupsPrev,
        sinNombre,
    };

    // ── Guardar Markdown ──
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    const md = buildMarkdown(unique, stats);
    fs.writeFileSync(OUTPUT_FILE, md, 'utf8');

    // ── Resumen en consola ──
    console.log('───────────────────────────────────────────────────────');
    console.log(`  📊 RESUMEN EXTRACCIÓN — ProfesorDePiano\n`);
    console.log(`  Total emails encontrados       : ${stats.totalEmails}`);
    console.log(`  Total leads extraídos          : ${stats.totalLeads}`);
    console.log(`  Contactos únicos               : ${stats.uniqueLeads}`);
    console.log(`  Duplicados internos removidos  : ${stats.internDups}`);
    console.log(`  Sin datos (vacíos)             : ${vacios.length}`);
    console.log(`  Errores al procesar            : ${errores.length}`);
    console.log('───────────────────────────────────────────────────────');
    console.log(`  🔥 Alta   — Santiago           : ${stats.alta}`);
    console.log(`  🌤️  Media  — Regiones           : ${stats.media}`);
    console.log(`  🧊 Baja   — Sin ciudad         : ${stats.baja}`);
    console.log('───────────────────────────────────────────────────────');
    console.log(`  ⚠️  Duplicados c/ lista anterior: ${stats.dupsPrev}`);
    console.log(`  📧 Sin nombre (placeholder)    : ${stats.sinNombre}`);
    console.log('───────────────────────────────────────────────────────');
    console.log(`\n✅  Archivo generado: ${OUTPUT_FILE}`);
    console.log(`    (No se modificó: data/leads_getresponse.md)\n`);

    if (errores.length > 0) {
        console.log('⚠️  Errores al procesar mensajes:');
        errores.forEach(e => console.log(`   - ${e.id}: ${e.error}`));
        console.log('');
    }

    // Nota sobre ciudad
    if (stats.baja === stats.uniqueLeads && stats.uniqueLeads > 0) {
        console.log('💡 NOTA: Todos los leads quedaron con prioridad "baja" (sin ciudad).');
        console.log('   El formato de estos emails no incluye campo "ciudad".');
        console.log('   Puedes actualizar las ciudades manualmente en:');
        console.log(`   ${OUTPUT_FILE}\n`);
    }
}

main().catch(err => {
    console.error('\n💥 Error fatal:', err.message);
    if (err.code === 401) {
        console.error('    Token inválido. Ejecuta: node scripts/gmail-oauth-setup-piano.js\n');
    }
    process.exit(1);
});
