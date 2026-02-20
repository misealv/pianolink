/**
 * scripts/gmail-oauth-setup.js
 * Paso 1 — Autorización OAuth2 con Gmail.
 *
 * USO:
 *   1. Ir a https://console.cloud.google.com → APIs & Services → Credentials
 *   2. Crear credencial OAuth 2.0 (tipo "Desktop App")
 *   3. Descargar el JSON y guardarlo como:  secrets/gmail_credentials.json
 *   4. Ejecutar:  node scripts/gmail-oauth-setup.js
 *   5. Abrir la URL que muestra, autorizar y pegar el código
 *   6. Quedará guardado el token en:  secrets/gmail_token.json
 *
 * Solo necesitas hacer esto UNA VEZ. El token se renueva automáticamente.
 */
const fs   = require('fs');
const path = require('path');
const http = require('http');
const url  = require('url');
const readline = require('readline');
const { google } = require('googleapis');

// === RUTAS ===
const SECRETS_DIR   = path.join(__dirname, '..', 'secrets');
const CREDS_FILE    = path.join(SECRETS_DIR, 'gmail_credentials.json');
const TOKEN_FILE    = path.join(SECRETS_DIR, 'gmail_token.json');

// === SCOPES NECESARIOS ===
const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];

// ─────────────────────────────────────────────────────────────────────────────

function ensureSecretsDir() {
    if (!fs.existsSync(SECRETS_DIR)) {
        fs.mkdirSync(SECRETS_DIR, { recursive: true });
        console.log(`[OAuth] Carpeta creada: ${SECRETS_DIR}`);
    }
}

function loadCredentials() {
    if (!fs.existsSync(CREDS_FILE)) {
        console.error(`
❌  No se encontró el archivo de credenciales:
    ${CREDS_FILE}

    Pasos para crearlo:
    1. Ve a https://console.cloud.google.com
    2. APIs & Services → Credentials → + Create Credentials → OAuth 2.0 Client IDs
    3. Tipo: "Desktop App"  |  Nombre: "PianoLink Gmail"
    4. Descargar JSON y guardarlo como:
       secrets/gmail_credentials.json
    5. Vuelve a ejecutar este script
`);
        process.exit(1);
    }
    return JSON.parse(fs.readFileSync(CREDS_FILE, 'utf8'));
}

async function getNewToken(oAuth2Client) {
    // Intentar flujo con servidor local (más cómodo)
    return new Promise((resolve, reject) => {
        const authUrl = oAuth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: SCOPES,
            prompt: 'consent',             // Fuerza refresh_token en cada auth
        });

        console.log('\n📋  Abre esta URL en tu navegador:\n');
        console.log('  ' + authUrl + '\n');

        // Servidor local para capturar el callback
        let server;
        try {
            server = http.createServer(async (req, res) => {
                const qs = new url.URL(req.url, 'http://localhost:3838');
                const code = qs.searchParams.get('code');

                if (!code) {
                    res.end('Sin código. Intenta de nuevo.');
                    return;
                }

                res.end('<h2>✅ Autorización exitosa. Puedes cerrar esta pestaña.</h2>');
                server.close();

                try {
                    const { tokens } = await oAuth2Client.getToken(code);
                    oAuth2Client.setCredentials(tokens);
                    fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2));
                    console.log(`\n✅  Token guardado en: ${TOKEN_FILE}`);
                    resolve(oAuth2Client);
                } catch (err) {
                    reject(err);
                }
            });

            server.listen(3838, () => {
                console.log('⏳  Esperando autorización en http://localhost:3838 ...\n');
            });

            server.on('error', () => {
                // Puerto ocupado — fallback a entrada manual
                console.log('⚠️  Puerto 3838 ocupado. Ingresa el código manualmente.\n');
                promptManual(oAuth2Client).then(resolve).catch(reject);
            });

        } catch (err) {
            promptManual(oAuth2Client).then(resolve).catch(reject);
        }
    });
}

async function promptManual(oAuth2Client) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve, reject) => {
        rl.question('  Pega el código de autorización aquí: ', async (code) => {
            rl.close();
            try {
                const { tokens } = await oAuth2Client.getToken(code.trim());
                oAuth2Client.setCredentials(tokens);
                fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2));
                console.log(`\n✅  Token guardado en: ${TOKEN_FILE}`);
                resolve(oAuth2Client);
            } catch (err) {
                reject(err);
            }
        });
    });
}

async function main() {
    ensureSecretsDir();
    const creds = loadCredentials();

    // Soporte para formato descargado desde Cloud Console
    const { client_secret, client_id, redirect_uris } =
        creds.installed || creds.web;

    const oAuth2Client = new google.auth.OAuth2(
        client_id,
        client_secret,
        'http://localhost:3838'   // redirect URI (debe estar en GCC)
    );

    // ¿Ya existe token?
    if (fs.existsSync(TOKEN_FILE)) {
        const token = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
        oAuth2Client.setCredentials(token);

        // Verificar que funciona
        try {
            const gmail = google.gmail({ version: 'v1', auth: oAuth2Client });
            await gmail.users.getProfile({ userId: 'me' });
            console.log('\n✅  Token existente válido. No es necesario re-autorizar.');
            console.log('    Ya puedes ejecutar: node scripts/extract-getresponse-leads.js\n');
            return;
        } catch {
            console.log('\n⚠️  Token expirado o inválido. Re-autorizando...\n');
        }
    }

    await getNewToken(oAuth2Client);
    console.log('\n🎉  Listo. Ejecuta ahora:\n');
    console.log('    node scripts/extract-getresponse-leads.js\n');
}

main().catch(err => {
    console.error('💥 Error fatal:', err.message);
    process.exit(1);
});
