/**
 * scripts/gmail-oauth-resonancias.js
 * Captura el callback OAuth2 para escuela.resonancias@gmail.com
 * Puerto: 3840
 *
 * USO después de abrir la URL de autorización:
 *   node scripts/gmail-oauth-resonancias.js
 */
const http = require('http');
const url  = require('url');
const fs   = require('fs');
const path = require('path');
const { google } = require('googleapis');

const SECRETS_DIR = path.join(__dirname, '..', 'secrets');
const CREDS_FILE  = path.join(SECRETS_DIR, 'gmail_credentials_piano.json');
const TOKEN_FILE  = path.join(SECRETS_DIR, 'gmail_token_resonancias.json');
const PORT        = 3840;

const creds = JSON.parse(fs.readFileSync(CREDS_FILE, 'utf8'));
const { client_id, client_secret } = creds.installed || creds.web;
const auth = new google.auth.OAuth2(client_id, client_secret, `http://localhost:${PORT}`);

console.log('\n⏳  Esperando callback OAuth en puerto', PORT, '...');
console.log('   (Abre la URL en el navegador si aún no lo hiciste)\n');

const server = http.createServer(async (req, res) => {
    const qs   = new url.URL(req.url, `http://localhost:${PORT}`);
    const code = qs.searchParams.get('code');
    const err  = qs.searchParams.get('error');

    if (err) {
        res.end(`<h2>❌ Error: ${err}</h2>`);
        console.error('❌ Error OAuth:', err);
        server.close();
        return;
    }
    if (!code) { res.end('Sin código.'); return; }

    res.end('<h2>✅ Autorización exitosa — escuela.resonancias@gmail.com</h2><p>Puedes cerrar esta pestaña.</p>');
    server.close();

    try {
        const { tokens } = await auth.getToken(code);
        fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2));
        console.log(`✅  Token guardado: ${TOKEN_FILE}`);
        console.log('\n   Ahora ejecuta:');
        console.log('   node scripts/extract-resonancias-gmail.js\n');
    } catch (e) {
        console.error('❌  Error al obtener token:', e.message);
    }
});

server.listen(PORT, () => {
    console.log(`[OAuth] Escuchando en http://localhost:${PORT}`);
});

// También acepta código manual como fallback
server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
        console.log(`Puerto ${PORT} ocupado. Usa: node scripts/save-piano-token.js CON_EL_CODIGO`);
    }
});
