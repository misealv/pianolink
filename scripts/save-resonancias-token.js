/**
 * scripts/save-resonancias-token.js
 * Guarda el token OAuth para escuela.resonancias@gmail.com
 *
 * USO:
 *   node scripts/save-resonancias-token.js EL_CODIGO_DE_LA_URL
 *
 * El código está en la barra de direcciones después de ?code=
 * Cópialo hasta el & siguiente (no incluyas el &)
 */
const fs   = require('fs');
const path = require('path');
const { google } = require('googleapis');

const SECRETS_DIR = path.join(__dirname, '..', 'secrets');
const CREDS_FILE  = path.join(SECRETS_DIR, 'gmail_credentials_piano.json');
const TOKEN_FILE  = path.join(SECRETS_DIR, 'gmail_token_resonancias.json');

const code = process.argv[2];
if (!code) {
    console.error('\n❌  Uso: node scripts/save-resonancias-token.js EL_CODIGO\n');
    console.error('    El código está en la barra de direcciones:');
    console.error('    http://localhost:3840/?code=ESTE_ES_EL_CODIGO&scope=...\n');
    process.exit(1);
}

const creds = JSON.parse(fs.readFileSync(CREDS_FILE, 'utf8'));
const { client_id, client_secret } = creds.installed || creds.web;
const auth = new google.auth.OAuth2(client_id, client_secret, 'http://localhost:3840');

auth.getToken(decodeURIComponent(code.trim())).then(({ tokens }) => {
    fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2));
    console.log(`\n✅  Token guardado: ${TOKEN_FILE}`);
    console.log('\n   Ahora ejecuta:');
    console.log('   node scripts/extract-resonancias-gmail.js\n');
}).catch(err => {
    console.error('\n❌  Error:', err.message);
    console.error('    El código expira en ~60s. Genera un nuevo link y repite rápido.\n');
    process.exit(1);
});
