/**
 * scripts/gmail-oauth-setup-piano.js
 * Autorización OAuth2 para la SEGUNDA cuenta de Gmail (ProfesorDePiano).
 *
 * USO:
 *   1. Ir a https://console.cloud.google.com → APIs & Services → Credentials
 *   2. Crear credencial OAuth 2.0 (tipo "Desktop App")  —  usar la cuenta de Gmail de ProfesorDePiano
 *   3. Descargar el JSON y guardarlo como:  secrets/gmail_credentials_piano.json
 *   4. Ejecutar:  node scripts/gmail-oauth-setup-piano.js
 *   5. Abrir la URL que muestra en el navegador donde estés logueado con la cuenta ProfesorDePiano
 *   6. Autorizar acceso y el token quedará guardado en:  secrets/gmail_token_piano.json
 *
 * ⚠️  IMPORTANTE — CAMBIO DE CUENTA:
 *   Si la URL de Google te redirige a la cuenta equivocada, abre la URL en:
 *     - Una ventana incógnito donde inicies sesión con la cuenta ProfesorDePiano, O
 *     - Añade  &login_hint=tu@cuenta.com  al final de la URL
 *
 * Solo necesitas hacer esto UNA VEZ por cuenta.
 */
const fs       = require('fs');
const path     = require('path');
const http     = require('http');
const url      = require('url');
const readline = require('readline');
const { google } = require('googleapis');

// === RUTAS — Segunda cuenta ===
const SECRETS_DIR   = path.join(__dirname, '..', 'secrets');
const CREDS_FILE    = path.join(SECRETS_DIR, 'gmail_credentials_piano.json');
const TOKEN_FILE    = path.join(SECRETS_DIR, 'gmail_token_piano.json');

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];
const REDIRECT_PORT = 3839;  // Puerto local para recibir el callback
const REDIRECT_URI   = `http://localhost:${REDIRECT_PORT}`;  // debe coincidir con redirect_uris del JSON

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
❌  No se encontró el archivo de credenciales para ProfesorDePiano:
    ${CREDS_FILE}

    Pasos para crearlo:
    1. Ve a https://console.cloud.google.com  (logueado con la cuenta ProfesorDePiano)
    2. APIs & Services → Credentials → + Create Credentials → OAuth 2.0 Client IDs
    3. Tipo: "Desktop App"  |  Nombre: "PianoLink Gmail Piano"
    4. Descargar JSON y guardarlo como:
       secrets/gmail_credentials_piano.json
    5. Asegúrate de que la Gmail API esté habilitada en ese proyecto
    6. Vuelve a ejecutar este script
`);
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
            // Sugerencia de cuenta para forzar la correcta en el navegador
            // login_hint: 'tu_email@gmail.com',  // descomenta y pon el email si lo sabes
        });

        console.log('\n📋  Abre esta URL en el navegador (logueado con la cuenta ProfesorDePiano):\n');
        console.log('  ' + authUrl + '\n');
        console.log('  💡 Si abre la cuenta equivocada: abre en ventana incógnito');
        console.log(`     o añade &login_hint=TU_EMAIL al final de la URL\n`);

        let server;
        try {
            server = http.createServer(async (req, res) => {
                const qs = new url.URL(req.url, REDIRECT_URI);
                const code = qs.searchParams.get('code');

                if (!code) {
                    res.end('Sin código. Intenta de nuevo.');
                    return;
                }

                res.end('<h2>✅ Autorización exitosa — ProfesorDePiano</h2><p>Puedes cerrar esta pestaña.</p>');
                server.close();

                try {
                    const { tokens } = await oAuth2Client.getToken(code);
                    oAuth2Client.setCredentials(tokens);
                    fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2));
                    console.log(`\n✅  Token guardado en: ${TOKEN_FILE}`);
                    console.log('    Ya puedes ejecutar el script de extracción:\n');
                    console.log('    node scripts/extract-profesordepiano-leads.js\n');
                    resolve(oAuth2Client);
                } catch (err) {
                    reject(err);
                }
            });

            server.listen(REDIRECT_PORT, () => {
                console.log(`[OAuth] Servidor local escuchando en puerto ${REDIRECT_PORT}...`);
            });

            server.on('error', (err) => {
                if (err.code === 'EADDRINUSE') {
                    console.log(`[OAuth] Puerto ${REDIRECT_PORT} ocupado, usando fallback manual...`);
                    fallbackManual(oAuth2Client).then(resolve).catch(reject);
                } else {
                    reject(err);
                }
            });
        } catch (err) {
            fallbackManual(oAuth2Client).then(resolve).catch(reject);
        }
    });
}

// Fallback: el usuario pega el código manualmente
async function fallbackManual(oAuth2Client) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve, reject) => {
        rl.question('➡️  Pega aquí el código de autorización: ', async (code) => {
            rl.close();
            try {
                const { tokens } = await oAuth2Client.getToken(code.trim());
                oAuth2Client.setCredentials(tokens);
                fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2));
                console.log(`\n✅  Token guardado en: ${TOKEN_FILE}`);
                console.log('    Ya puedes ejecutar:\n');
                console.log('    node scripts/extract-profesordepiano-leads.js\n');
                resolve(oAuth2Client);
            } catch (err) {
                reject(err);
            }
        });
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
    ensureSecretsDir();
    const creds = loadCredentials();

    const { client_id, client_secret } = creds.installed || creds.web;
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, REDIRECT_URI);

    // Si ya existe un token válido, notificar
    if (fs.existsSync(TOKEN_FILE)) {
        console.log(`\n⚠️  Ya existe un token en: ${TOKEN_FILE}`);
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        await new Promise(resolve => {
            rl.question('   ¿Quieres generar uno nuevo? (s/N): ', (ans) => {
                rl.close();
                if (ans.toLowerCase() !== 's') {
                    console.log('   Usando token existente. Ejecuta el script de extracción.\n');
                    process.exit(0);
                }
                resolve();
            });
        });
    }

    await getNewToken(oAuth2Client);
}

main().catch(err => {
    console.error('\n❌  Error:', err.message);
    process.exit(1);
});
