/**
 * scripts/gmail-oauth-setup-resonancias.js
 * Autorización OAuth2 para escuela.resonancias@gmail.com
 *
 * Reutiliza las mismas credenciales del proyecto "piano-link"
 * Solo genera un nuevo token para la cuenta correcta.
 *
 * REQUIERE: secrets/gmail_credentials_piano.json (ya existe)
 *
 * USO:
 *   node scripts/gmail-oauth-setup-resonancias.js
 *
 * SALIDA: secrets/gmail_token_resonancias.json
 */
const fs       = require('fs');
const path     = require('path');
const http     = require('http');
const url      = require('url');
const readline = require('readline');
const { google } = require('googleapis');

const SECRETS_DIR  = path.join(__dirname, '..', 'secrets');
const CREDS_FILE   = path.join(SECRETS_DIR, 'gmail_credentials_piano.json'); // mismo proyecto
const TOKEN_FILE   = path.join(SECRETS_DIR, 'gmail_token_resonancias.json'); // nuevo token

const SCOPES       = ['https://www.googleapis.com/auth/gmail.readonly'];
const REDIRECT_PORT = 3840;
const REDIRECT_URI  = `http://localhost:${REDIRECT_PORT}`;
const LOGIN_HINT    = 'escuela.resonancias@gmail.com'; // fuerza la cuenta correcta

// ─────────────────────────────────────────────────────────────────────────────

function loadCredentials() {
    if (!fs.existsSync(CREDS_FILE)) {
        console.error(`\n❌  No se encontró: ${CREDS_FILE}`);
        console.error('    Ejecuta primero: node scripts/gmail-oauth-setup-piano.js\n');
        process.exit(1);
    }
    return JSON.parse(fs.readFileSync(CREDS_FILE, 'utf8'));
}

async function getNewToken(oAuth2Client) {
    return new Promise((resolve, reject) => {
        const authUrl = oAuth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: SCOPES,
            prompt: 'consent',
            login_hint: LOGIN_HINT,  // dirige directamente a la cuenta correcta
        });

        console.log('\n📋  Abre esta URL en tu navegador:\n');
        console.log('  ' + authUrl + '\n');
        console.log(`  💡 La URL está preconfigurada para ${LOGIN_HINT}`);
        console.log('     Si pide elegir cuenta, selecciona escuela.resonancias@gmail.com\n');

        let server;
        try {
            server = http.createServer(async (req, res) => {
                const qs = new url.URL(req.url, REDIRECT_URI);
                const code = qs.searchParams.get('code');
                if (!code) { res.end('Sin código.'); return; }

                res.end('<h2>✅ Autorización exitosa — escuela.resonancias</h2><p>Puedes cerrar esta pestaña.</p>');
                server.close();

                try {
                    const { tokens } = await oAuth2Client.getToken(code);
                    oAuth2Client.setCredentials(tokens);
                    fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2));
                    console.log(`\n✅  Token guardado en: ${TOKEN_FILE}`);
                    console.log('\n    Ahora ejecuta:');
                    console.log('    node scripts/extract-resonancias-escuela.js\n');
                    resolve(oAuth2Client);
                } catch(e) { reject(e); }
            });

            server.listen(REDIRECT_PORT, () => {
                console.log(`[OAuth] Servidor escuchando en puerto ${REDIRECT_PORT}...`);
            });

            server.on('error', () => fallbackManual(oAuth2Client).then(resolve).catch(reject));
        } catch(e) {
            fallbackManual(oAuth2Client).then(resolve).catch(reject);
        }
    });
}

async function fallbackManual(oAuth2Client) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve, reject) => {
        rl.question('➡️  Pega aquí el código de autorización: ', async (code) => {
            rl.close();
            try {
                const { tokens } = await oAuth2Client.getToken(code.trim());
                oAuth2Client.setCredentials(tokens);
                fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2));
                console.log(`\n✅  Token guardado: ${TOKEN_FILE}\n`);
                resolve(oAuth2Client);
            } catch(e) { reject(e); }
        });
    });
}

// ─────────────────────────────────────────────────────────────────────────────
async function main() {
    const creds = loadCredentials();
    const { client_id, client_secret } = creds.installed || creds.web;
    const auth = new google.auth.OAuth2(client_id, client_secret, REDIRECT_URI);

    if (fs.existsSync(TOKEN_FILE)) {
        console.log(`\n⚠️  Ya existe: ${TOKEN_FILE}`);
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        await new Promise(r => rl.question('   ¿Generar uno nuevo? (s/N): ', ans => {
            rl.close();
            if (ans.toLowerCase() !== 's') { console.log('   Usando token existente.\n'); process.exit(0); }
            r();
        }));
    }

    await getNewToken(auth);
}

main().catch(err => { console.error('❌', err.message); process.exit(1); });
