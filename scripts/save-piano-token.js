/**
 * scripts/save-piano-token.js
 * Uso: node scripts/save-piano-token.js EL_CODIGO_AQUI
 */
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const SECRETS_DIR = path.join(__dirname, '..', 'secrets');
const CREDS_FILE  = path.join(SECRETS_DIR, 'gmail_credentials_piano.json');
const TOKEN_FILE  = path.join(SECRETS_DIR, 'gmail_token_piano.json');

const code = process.argv[2];
if (!code) {
    console.error('❌  Uso: node scripts/save-piano-token.js EL_CODIGO\n');
    process.exit(1);
}

const creds = JSON.parse(fs.readFileSync(CREDS_FILE, 'utf8'));
const { client_id, client_secret } = creds.installed || creds.web;
const auth = new google.auth.OAuth2(client_id, client_secret, 'http://localhost:3839');

auth.getToken(code.trim()).then(({ tokens }) => {
    fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2));
    console.log(`\n✅  Token guardado en: ${TOKEN_FILE}`);
    console.log('\n    Ahora ejecuta:');
    console.log('    node scripts/extract-profesordepiano-leads.js\n');
}).catch(err => {
    console.error('\n❌  Error al obtener el token:', err.message);
    console.error('    El código puede haber expirado (duran ~60s). Intenta de nuevo.\n');
    process.exit(1);
});
