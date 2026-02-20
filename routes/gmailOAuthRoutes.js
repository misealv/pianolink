/**
 * routes/gmailOAuthRoutes.js
 * Rutas temporales de admin para autorizar Gmail OAuth2 desde producción.
 *
 * Flujo:
 *  1. Admin abre: GET /admin/gmail/authorize?secret=ADMIN_KEY
 *  2. Google redirige a: GET /admin/gmail/callback?code=...
 *  3. Token se guarda en GlobalConfig (MongoDB)
 *  4. Admin dispara extracción: GET /admin/gmail/extract?secret=ADMIN_KEY
 *  5. Resultado disponible: GET /admin/gmail/leads?secret=ADMIN_KEY
 *
 * Requiere en .env:
 *   ADMIN_SECRET=tu_clave_secreta   (cualquier string largo)
 *   APP_URL=https://pianolink-v4.fly.dev
 */
const express  = require('express');
const router   = express.Router();
const { google } = require('googleapis');
const mongoose = require('mongoose');

// Modelo key-value ligero para tokens y resultados (colección app_kv)
const AppKV = mongoose.models.AppKV || mongoose.model('AppKV',
    new mongoose.Schema(
        { key: { type: String, unique: true, required: true }, value: mongoose.Schema.Types.Mixed },
        { collection: 'app_kv', timestamps: true }
    )
);

// === CONSTANTES ===
const SCOPES       = ['https://www.googleapis.com/auth/gmail.readonly'];
const SENDER       = 'noloop@app.getresponse.com';
const APP_URL      = process.env.APP_URL || 'https://pianolink-v4.fly.dev';
const REDIRECT_URI = `${APP_URL}/admin/gmail/callback`;

// === MIDDLEWARE DE SEGURIDAD ===
// Protege todas las rutas con ?secret=ADMIN_SECRET
function checkSecret(req, res, next) {
    const secret = req.query.secret || req.headers['x-admin-secret'];
    const expected = process.env.ADMIN_SECRET;
    if (!expected) {
        return res.status(500).send('⚠️  Variable ADMIN_SECRET no configurada en .env / Fly secrets');
    }
    if (secret !== expected) {
        return res.status(403).send('❌ Acceso denegado. Se requiere ?secret=ADMIN_SECRET');
    }
    next();
}

// === FUNCIÓN HELPER — CONSTRUIR CLIENTE OAUTH ===
function buildOAuth2Client() {
    const clientId     = process.env.GMAIL_CLIENT_ID;
    const clientSecret = process.env.GMAIL_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        throw new Error('Faltan variables GMAIL_CLIENT_ID o GMAIL_CLIENT_SECRET en el entorno');
    }

    return new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);
}

// === FUNCIÓN HELPER — RECUPERAR TOKEN DE BD ===
async function getStoredToken() {
    const doc = await AppKV.findOne({ key: 'gmail_oauth_token' }).lean();
    return doc?.value || null;
}

// === FUNCIÓN HELPER — GUARDAR TOKEN EN BD ===
async function saveToken(token) {
    await AppKV.findOneAndUpdate(
        { key: 'gmail_oauth_token' },
        { key: 'gmail_oauth_token', value: token },
        { upsert: true, new: true }
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// PASO 1 — Redirect a Google para autorizar
// GET /admin/gmail/authorize?secret=...
// ─────────────────────────────────────────────────────────────────────────────
router.get('/authorize', checkSecret, (req, res) => {
    try {
        const auth = buildOAuth2Client();
        const authUrl = auth.generateAuthUrl({
            access_type: 'offline',
            scope: SCOPES,
            prompt: 'consent',
        });
        res.redirect(authUrl);
    } catch (err) {
        res.status(500).send(`❌ Error: ${err.message}<br><br>Configura GMAIL_CLIENT_ID y GMAIL_CLIENT_SECRET en Fly secrets.`);
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// PASO 2 — Google redirige aquí con el código
// GET /admin/gmail/callback?code=...
// ─────────────────────────────────────────────────────────────────────────────
router.get('/callback', async (req, res) => {
    const { code, error } = req.query;

    if (error) {
        return res.status(400).send(`❌ Google devolvió error: ${error}`);
    }
    if (!code) {
        return res.status(400).send('❌ No se recibió código de autorización.');
    }

    try {
        const auth = buildOAuth2Client();
        const { tokens } = await auth.getToken(code);
        auth.setCredentials(tokens);

        // Guardar token en MongoDB
        await saveToken(tokens);

        // Verificar que funciona
        const gmail = google.gmail({ version: 'v1', auth });
        const profile = await gmail.users.getProfile({ userId: 'me' });

        res.send(`
            <html><body style="font-family:sans-serif;max-width:600px;margin:60px auto;padding:20px">
            <h2>✅ Gmail autorizado correctamente</h2>
            <p>Cuenta: <strong>${profile.data.emailAddress}</strong></p>
            <p>Token guardado en la base de datos.</p>
            <hr>
            <p>Ahora puedes extraer los leads:</p>
            <a href="/admin/gmail/extract?secret=${process.env.ADMIN_SECRET || 'TU_SECRET'}"
               style="display:inline-block;padding:12px 24px;background:#4CAF50;color:#fff;text-decoration:none;border-radius:6px;font-size:16px;">
                🚀 Extraer Leads de GetResponse
            </a>
            </body></html>
        `);
    } catch (err) {
        console.error('[Gmail OAuth] Error en callback:', err);
        res.status(500).send(`❌ Error al obtener token: ${err.message}`);
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// PASO 3 — Extraer leads (puede tardar según cantidad de emails)
// GET /admin/gmail/extract?secret=...
// ─────────────────────────────────────────────────────────────────────────────
router.get('/extract', checkSecret, async (req, res) => {
    const maxResults = parseInt(req.query.max) || 500;

    try {
        const token = await getStoredToken();
        if (!token) {
            return res.status(400).send(`
                ❌ No hay token guardado.<br><br>
                Primero autoriza en: 
                <a href="/admin/gmail/authorize?secret=${req.query.secret}">/admin/gmail/authorize</a>
            `);
        }

        const auth = buildOAuth2Client();
        auth.setCredentials(token);

        // Auto-renovar token si expiró
        auth.on('tokens', async (newTokens) => {
            const merged = { ...token, ...newTokens };
            await saveToken(merged);
        });

        const gmail = google.gmail({ version: 'v1', auth });

        // Verificar conexión
        const profile = await gmail.users.getProfile({ userId: 'me' });
        console.log(`[Gmail Extract] Conectado como: ${profile.data.emailAddress}`);

        // Respuesta en streaming para no timeout
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Transfer-Encoding', 'chunked');
        res.write(`<html><body style="font-family:monospace;background:#111;color:#0f0;padding:20px;">
            <h3>📧 Extrayendo leads de GetResponse...</h3>
            <pre id="log">`);

        const log = (msg) => {
            console.log(msg);
            res.write(msg + '\n');
        };

        // Obtener IDs de mensajes
        const ids = [];
        let pageToken;
        log(`Buscando emails de ${SENDER}...`);

        do {
            const listRes = await gmail.users.messages.list({
                userId: 'me',
                q: `from:${SENDER}`,
                maxResults: 100,
                pageToken,
                includeSpamTrash: true,
            });
            const msgs = listRes.data.messages || [];
            ids.push(...msgs.map(m => m.id));
            pageToken = listRes.data.nextPageToken;
            log(`  Encontrados: ${ids.length} mensajes...`);
            if (ids.length >= maxResults) break;
        } while (pageToken);

        log(`\nTotal: ${ids.length} mensajes. Procesando...\n`);

        // Procesar mensajes
        const leads = [];
        const errors = [];

        for (let i = 0; i < Math.min(ids.length, maxResults); i++) {
            try {
                const msg = await gmail.users.messages.get({
                    userId: 'me',
                    id: ids[i],
                    format: 'full',
                });

                const body = extractTextBody(msg.data.payload);
                const lead = parseLeadFromBody(body);

                if (lead.email) {
                    leads.push({ ...lead, prioridad: calcPrioridad(lead.referer) });
                    if (i % 10 === 0) log(`  Procesado ${i + 1}/${ids.length} — último: ${lead.nombre || lead.email}`);
                }
            } catch (err) {
                errors.push(ids[i]);
            }

            // Throttle
            if ((i + 1) % 20 === 0) {
                await new Promise(r => setTimeout(r, 200));
            }
        }

        // Deduplicar por email
        const seen = new Set();
        const unique = leads.filter(l => {
            const k = l.email.toLowerCase();
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
        });

        // Generar Markdown
        const md = buildMarkdown(unique);

        // Guardar en MongoDB
        await AppKV.findOneAndUpdate(
            { key: 'gmail_leads_markdown' },
            { key: 'gmail_leads_markdown', value: md },
            { upsert: true }
        );

        const altas  = unique.filter(l => l.prioridad === 'alta').length;
        const medias = unique.filter(l => l.prioridad === 'media').length;
        const bajas  = unique.filter(l => l.prioridad === 'baja').length;

        log(`\n──────────────────────────────────`);
        log(`  Leads extraídos  : ${leads.length}`);
        log(`  Leads únicos     : ${unique.length}`);
        log(`  🔥 Alta (piano)  : ${altas}`);
        log(`  🌤  Media (guit.) : ${medias}`);
        log(`  🧊 Baja (otro)   : ${bajas}`);
        log(`  Errores          : ${errors.length}`);
        log(`\n✅ Listo. Guardado en base de datos.`);

        res.write(`</pre>
            <br>
            <a href="/admin/gmail/leads?secret=${req.query.secret}"
               style="display:inline-block;padding:12px 24px;background:#4CAF50;color:#fff;text-decoration:none;border-radius:6px;font-size:16px;">
                📄 Ver / Descargar Markdown (${unique.length} leads)
            </a>
            </body></html>`);
        res.end();

    } catch (err) {
        console.error('[Gmail Extract] Error:', err);
        if (!res.headersSent) {
            res.status(500).send(`❌ Error: ${err.message}`);
        } else {
            res.write(`\n\n❌ ERROR: ${err.message}</pre></body></html>`);
            res.end();
        }
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// PASO 4 — Descargar el Markdown generado
// GET /admin/gmail/leads?secret=...
// ─────────────────────────────────────────────────────────────────────────────
router.get('/leads', checkSecret, async (req, res) => {
    try {
        const cfg = await AppKV.findOne({ key: 'gmail_leads_markdown' }).lean();
        if (!cfg?.value) {
            return res.status(404).send('❌ No hay leads extraídos aún. Ejecuta /admin/gmail/extract primero.');
        }

        const fmt = req.query.format || 'md';
        if (fmt === 'download') {
            res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
            res.setHeader('Content-Disposition', 'attachment; filename="leads_getresponse.md"');
            return res.send(cfg.value);
        }

        // Mostrar en navegador
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.send(cfg.value);
    } catch (err) {
        res.status(500).send(`❌ Error: ${err.message}`);
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// STATUS — Verificar estado de auth
// GET /admin/gmail/status?secret=...
// ─────────────────────────────────────────────────────────────────────────────
router.get('/status', checkSecret, async (req, res) => {
    try {
        const token    = await getStoredToken();
        const hasToken = !!token;
        const leadsDoc = await AppKV.findOne({ key: 'gmail_leads_markdown' }).lean();
        const hasLeads = !!leadsDoc?.value;
        const secret   = req.query.secret;

        const style = `font-family:sans-serif;max-width:500px;margin:60px auto;padding:20px;border:1px solid #eee;border-radius:8px;`;
        res.send(`
            <html><body style="${style}">
            <h2>📧 Gmail OAuth — Estado</h2>
            <p>Token almacenado: <strong>${hasToken ? '✅ Sí' : '❌ No'}</strong></p>
            <p>Leads extraídos: <strong>${hasLeads ? '✅ Sí' : '❌ No'}</strong></p>
            <hr>
            <p>
                <a href="/admin/gmail/authorize?secret=${secret}" style="margin-right:12px">🔐 Autorizar</a>
                <a href="/admin/gmail/extract?secret=${secret}" style="margin-right:12px">🚀 Extraer</a>
                <a href="/admin/gmail/leads?secret=${secret}&format=download">⬇️ Descargar .md</a>
            </p>
            </body></html>
        `);
    } catch (err) {
        res.status(500).send(`❌ Error: ${err.message}`);
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS — Parsing de emails
// ─────────────────────────────────────────────────────────────────────────────

function decodeBase64(data) {
    return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

function extractTextBody(payload) {
    if (payload.body?.data) return decodeBase64(payload.body.data);
    if (payload.parts) {
        for (const part of payload.parts) {
            if (part.mimeType === 'text/plain' && part.body?.data) return decodeBase64(part.body.data);
            if (part.parts) { const n = extractTextBody(part); if (n) return n; }
        }
        for (const part of payload.parts) {
            if (part.mimeType === 'text/html' && part.body?.data)
                return decodeBase64(part.body.data).replace(/<[^>]+>/g, ' ');
        }
    }
    return '';
}

function extractField(text, labels) {
    for (const label of labels) {
        const regex = new RegExp(`${label}\\s*:\\s*(.+?)(?:\\n|$)`, 'i');
        const m = text.match(regex);
        if (m) return m[1].trim();
    }
    return '';
}

function parseLeadFromBody(body) {
    const text = body.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    return {
        nombre:  extractField(text, ['Nombre', 'Name', 'nombre']),
        email:   extractField(text, ['Email', 'E-mail', 'email', 'Correo']),
        referer: extractField(text, ['http_referer', 'HTTP_REFERER', 'Referer', 'URL']),
        fecha:   extractField(text, ['Fecha', 'Date', 'fecha']),
    };
}

function calcPrioridad(referer) {
    const u = (referer || '').toLowerCase();
    if (u.includes('piano'))    return 'alta';
    if (u.includes('guitarra')) return 'media';
    return 'baja';
}

function esc(str) {
    return (str || '—').replace(/\|/g, '\\|');
}

function buildMarkdown(leads) {
    const now    = new Date().toLocaleString('es-CL', { timeZone: 'America/Santiago' });
    const altas  = leads.filter(l => l.prioridad === 'alta').length;
    const medias = leads.filter(l => l.prioridad === 'media').length;
    const bajas  = leads.filter(l => l.prioridad === 'baja').length;

    const rows = leads
        .sort((a, b) => ({ alta: 0, media: 1, baja: 2 }[a.prioridad] - { alta: 0, media: 1, baja: 2 }[b.prioridad]))
        .map(l => `| ${esc(l.nombre)} | ${esc(l.email)} | ${esc(l.referer)} | ${esc(l.fecha)} | ${l.prioridad} |`)
        .join('\n');

    return `# Leads GetResponse — Extraídos de Gmail
# Fuente: from:${SENDER}
# Generado: ${now}
# Total: ${leads.length} | Alta: ${altas} | Media: ${medias} | Baja: ${bajas}

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
| **Total**           | **${leads.length}** |
`;
}

module.exports = router;
