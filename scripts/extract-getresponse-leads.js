/**
 * scripts/extract-getresponse-leads.js
 * Extrae leads capturados por GetResponse desde Gmail.
 *
 * REQUIERE:
 *   - secrets/gmail_credentials.json  (descargado de Google Cloud Console)
 *   - secrets/gmail_token.json        (generado con gmail-oauth-setup.js)
 *
 * USO:
 *   node scripts/extract-getresponse-leads.js [--max=500]
 *
 * SALIDA:
 *   data/leads_getresponse.md
 */
const fs    = require('fs');
const path  = require('path');
const { google } = require('googleapis');

// === CONFIGURACIÓN ===
const SECRETS_DIR   = path.join(__dirname, '..', 'secrets');
const CREDS_FILE    = path.join(SECRETS_DIR, 'gmail_credentials.json');
const TOKEN_FILE    = path.join(SECRETS_DIR, 'gmail_token.json');
const OUTPUT_DIR    = path.join(__dirname, '..', 'data');
const OUTPUT_FILE   = path.join(OUTPUT_DIR, 'leads_getresponse.md');

const SENDER        = 'noloop@app.getresponse.com';
const SCOPES        = ['https://www.googleapis.com/auth/gmail.readonly'];

// Límite de mensajes a procesar (--max=N sobrescribe)
const DEFAULT_MAX   = 500;

// ─────────────────────────────────────────────────────────────────────────────
// PARSEO DE ARGUMENTOS
// ─────────────────────────────────────────────────────────────────────────────
const maxArg = process.argv.find(a => a.startsWith('--max='));
const MAX_RESULTS = maxArg ? parseInt(maxArg.split('=')[1]) : DEFAULT_MAX;

// ─────────────────────────────────────────────────────────────────────────────
// AUTENTICACIÓN
// ─────────────────────────────────────────────────────────────────────────────

function buildAuthClient() {
    if (!fs.existsSync(CREDS_FILE)) {
        console.error(`\n❌  No se encontró: ${CREDS_FILE}`);
        console.error('    Ejecuta primero: node scripts/gmail-oauth-setup.js\n');
        process.exit(1);
    }
    if (!fs.existsSync(TOKEN_FILE)) {
        console.error(`\n❌  No se encontró: ${TOKEN_FILE}`);
        console.error('    Ejecuta primero: node scripts/gmail-oauth-setup.js\n');
        process.exit(1);
    }

    const creds  = JSON.parse(fs.readFileSync(CREDS_FILE, 'utf8'));
    const token  = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));

    const { client_id, client_secret } = creds.installed || creds.web;

    const auth = new google.auth.OAuth2(client_id, client_secret, 'http://localhost:3838');
    auth.setCredentials(token);

    // Auto-renovar token
    auth.on('tokens', (newTokens) => {
        const merged = { ...token, ...newTokens };
        fs.writeFileSync(TOKEN_FILE, JSON.stringify(merged, null, 2));
        console.log('[Gmail] 🔄 Token renovado y guardado');
    });

    return auth;
}

// ─────────────────────────────────────────────────────────────────────────────
// FUNCIONES DE GMAIL
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Obtiene todos los IDs de mensajes del sender, con paginación automática.
 */
async function fetchAllMessageIds(gmail) {
    const ids = [];
    let pageToken = undefined;

    console.log(`[Gmail] 🔍 Buscando emails de ${SENDER}...`);

    do {
        const res = await gmail.users.messages.list({
            userId: 'me',
            q: `from:${SENDER}`,
            maxResults: 100,
            pageToken,
            includeSpamTrash: true,  // Incluir spam/papelera por si cayeron ahí
        });

        const msgs = res.data.messages || [];
        ids.push(...msgs.map(m => m.id));
        pageToken = res.data.nextPageToken;

        process.stdout.write(`\r  Encontrados: ${ids.length} mensajes...`);

        if (ids.length >= MAX_RESULTS) break;
    } while (pageToken);

    console.log(`\n[Gmail] ✅ Total de mensajes encontrados: ${ids.length}`);
    return ids.slice(0, MAX_RESULTS);
}

/**
 * Decodifica base64url a texto plano.
 */
function decodeBase64(data) {
    return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

/**
 * Extrae el cuerpo de texto plano de un mensaje Gmail (maneja multipart).
 */
function extractTextBody(payload) {
    // Caso: body directo
    if (payload.body?.data) {
        return decodeBase64(payload.body.data);
    }

    // Caso: multipart — buscar text/plain recursivamente
    if (payload.parts) {
        for (const part of payload.parts) {
            if (part.mimeType === 'text/plain' && part.body?.data) {
                return decodeBase64(part.body.data);
            }
            // Multipart anidado
            if (part.parts) {
                const nested = extractTextBody(part);
                if (nested) return nested;
            }
        }
        // Fallback: text/html si no hay plain
        for (const part of payload.parts) {
            if (part.mimeType === 'text/html' && part.body?.data) {
                return decodeBase64(part.body.data).replace(/<[^>]+>/g, ' ');
            }
        }
    }

    return '';
}

/**
 * Parsea el cuerpo del email y extrae los 4 campos esperados.
 * Formato esperado en el cuerpo:
 *   Nombre: Fulano
 *   Email: fulano@mail.com
 *   http_referer: https://...
 *   Fecha: DD/MM/YYYY HH:MM
 */
function parseLeadFromBody(body) {
    // Normalizar saltos de línea y limpiar HTML residual
    const text = body.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Regex tolerantes: acepta múltiples espacios, mayúsculas variadas, dos puntos
    const nombre   = extractField(text, ['Nombre', 'Name', 'nombre']);
    const email    = extractField(text, ['Email', 'E-mail', 'email', 'Correo']);
    const referer  = extractField(text, ['http_referer', 'HTTP_REFERER', 'Referer', 'URL', 'Página', 'Pagina']);
    const fecha    = extractField(text, ['Fecha', 'Date', 'fecha']);

    return { nombre, email, referer, fecha };
}

function extractField(text, labels) {
    for (const label of labels) {
        // Acepta "Label:", "Label :", "Label:valor" con espacios variables
        const regex = new RegExp(`${label}\\s*:\\s*(.+?)(?:\\n|$)`, 'i');
        const match = text.match(regex);
        if (match) return match[1].trim();
    }
    return '';
}

/**
 * Determina prioridad según URL de origen.
 */
function calcPrioridad(referer) {
    const u = (referer || '').toLowerCase();
    if (u.includes('piano'))    return 'alta';
    if (u.includes('guitarra')) return 'media';
    return 'baja';
}

// ─────────────────────────────────────────────────────────────────────────────
// GENERADOR DE MARKDOWN
// ─────────────────────────────────────────────────────────────────────────────

function buildMarkdown(leads) {
    const now = new Date().toLocaleString('es-CL', { timeZone: 'America/Santiago' });
    const total  = leads.length;
    const altas  = leads.filter(l => l.prioridad === 'alta').length;
    const medias = leads.filter(l => l.prioridad === 'media').length;
    const bajas  = leads.filter(l => l.prioridad === 'baja').length;

    const rows = leads
        .sort((a, b) => {
            const order = { alta: 0, media: 1, baja: 2 };
            return order[a.prioridad] - order[b.prioridad];
        })
        .map(l =>
            `| ${esc(l.nombre)} | ${esc(l.email)} | ${esc(l.referer)} | ${esc(l.fecha)} | ${l.prioridad} |`
        )
        .join('\n');

    return `# Leads GetResponse — Extraídos de Gmail
# Fuente: from:${SENDER}
# Generado: ${now}
# Total: ${total} | Alta: ${altas} | Media: ${medias} | Baja: ${bajas}

---

| nombre | email | pagina_origen | fecha | prioridad |
|--------|-------|---------------|-------|-----------|
${rows}

---

## Resumen por prioridad

| Prioridad | Cantidad |
|-----------|----------|
| 🔥 alta (piano)     | ${altas}  |
| 🌤️ media (guitarra) | ${medias} |
| 🧊 baja (otro)      | ${bajas}  |
| **Total**           | **${total}** |
`;
}

function esc(str) {
    return (str || '—').replace(/\|/g, '\\|');
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
    console.log('\n📧  Extractor de Leads GetResponse — Gmail\n');

    const auth  = buildAuthClient();
    const gmail = google.gmail({ version: 'v1', auth });

    // Verificar conexión
    try {
        const profile = await gmail.users.getProfile({ userId: 'me' });
        console.log(`[Gmail] 📬 Conectado como: ${profile.data.emailAddress}`);
    } catch (err) {
        console.error('[Gmail] ❌ Error de autenticación:', err.message);
        console.error('    Vuelve a ejecutar: node scripts/gmail-oauth-setup.js\n');
        process.exit(1);
    }

    // Obtener IDs de mensajes
    const messageIds = await fetchAllMessageIds(gmail);

    if (messageIds.length === 0) {
        console.log(`\n⚠️  No se encontraron emails de ${SENDER}`);
        console.log('    Asegúrate de que corresponde a la cuenta de Gmail correcta.\n');
        process.exit(0);
    }

    // Procesar mensajes
    const leads    = [];
    const errores  = [];
    const vacios   = [];

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
            const lead = parseLeadFromBody(body);

            if (!lead.nombre && !lead.email) {
                vacios.push(msgId);
                continue;
            }

            leads.push({
                nombre:    lead.nombre,
                email:     lead.email,
                referer:   lead.referer,
                fecha:     lead.fecha,
                prioridad: calcPrioridad(lead.referer),
            });

        } catch (err) {
            errores.push({ id: msgId, error: err.message });
        }

        // Throttle: evitar rate limit (250 unidades de cuota por usuario/s)
        if ((i + 1) % 20 === 0) {
            await new Promise(r => setTimeout(r, 200));
        }
    }

    console.log('\n');

    // Deduplicar por email (conservar el más reciente — primero en la lista de Gmail)
    const seen    = new Set();
    const unique  = leads.filter(l => {
        if (!l.email || seen.has(l.email.toLowerCase())) return false;
        seen.add(l.email.toLowerCase());
        return true;
    });

    const duplicados = leads.length - unique.length;

    // Crear directorio de salida
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    // Generar archivo Markdown
    const md = buildMarkdown(unique);
    fs.writeFileSync(OUTPUT_FILE, md, 'utf8');

    // Resumen final
    console.log('───────────────────────────────────────────');
    console.log(`  Mensajes procesados  : ${messageIds.length}`);
    console.log(`  Leads extraídos      : ${leads.length}`);
    console.log(`  Duplicados removidos : ${duplicados}`);
    console.log(`  Leads únicos         : ${unique.length}`);
    console.log(`  Sin datos (vacíos)   : ${vacios.length}`);
    console.log(`  Errores              : ${errores.length}`);
    console.log('───────────────────────────────────────────');
    console.log(`\n✅  Archivo generado: ${OUTPUT_FILE}\n`);

    if (errores.length > 0) {
        console.log('⚠️  Errores al procesar:');
        errores.forEach(e => console.log(`   - ${e.id}: ${e.error}`));
        console.log('');
    }

    // Estadísticas de prioridad
    const altas  = unique.filter(l => l.prioridad === 'alta').length;
    const medias = unique.filter(l => l.prioridad === 'media').length;
    const bajas  = unique.filter(l => l.prioridad === 'baja').length;
    console.log(`  🔥 Alta (piano)     : ${altas}`);
    console.log(`  🌤️  Media (guitarra) : ${medias}`);
    console.log(`  🧊 Baja (otro)      : ${bajas}\n`);
}

main().catch(err => {
    console.error('\n💥 Error fatal:', err.message);
    if (err.code === 401) {
        console.error('    Token inválido. Ejecuta: node scripts/gmail-oauth-setup.js\n');
    }
    process.exit(1);
});
