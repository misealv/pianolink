/**
 * Restaurar una colección desde el backup más reciente (o un timestamp específico)
 *
 * Uso:
 *   node scripts/fase0-restore-collection.js studentsubscriptions
 *   node scripts/fase0-restore-collection.js studentsubscriptions 2026-05-01T10-30
 *
 * ⚠️  DESTRUCTIVO: reemplaza todos los documentos de la colección con los del backup.
 *     Usar solo en emergencia y con confirmación explícita.
 */

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
require('dotenv').config();

async function confirm(question) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans.trim()); }));
}

async function run() {
    const [,, colName, stampArg] = process.argv;
    if (!colName) {
        console.error('❌  Uso: node fase0-restore-collection.js <coleccion> [timestamp]');
        process.exit(1);
    }

    const backupsDir = path.join(__dirname, 'backups');
    let stamp = stampArg;

    if (!stamp) {
        // Usar el backup más reciente
        const dirs = fs.readdirSync(backupsDir).sort().reverse();
        if (!dirs.length) { console.error('❌  No hay backups'); process.exit(1); }
        stamp = dirs[0];
    }

    const filePath = path.join(backupsDir, stamp, `${colName}.json`);
    if (!fs.existsSync(filePath)) {
        console.error(`❌  Archivo no encontrado: ${filePath}`);
        process.exit(1);
    }

    const docs = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    console.log(`\n⚠️  Esto reemplazará ${docs.length} documentos en la colección "${colName}".`);
    const ans = await confirm('Escribe "si, restaurar" para confirmar: ');
    if (ans !== 'si, restaurar') { console.log('Cancelado.'); process.exit(0); }

    const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
    await mongoose.connect(uri);
    const col = mongoose.connection.db.collection(colName);

    // Borrar colección y reinsertar
    await col.deleteMany({});
    if (docs.length > 0) {
        // Convertir _id strings a ObjectId si es necesario
        const prepared = docs.map(d => {
            if (d._id && typeof d._id === 'object' && d._id.$oid) {
                d._id = new mongoose.Types.ObjectId(d._id.$oid);
            }
            return d;
        });
        await col.insertMany(prepared, { ordered: false });
    }

    console.log(`✅  ${docs.length} documentos restaurados en "${colName}" desde backup ${stamp}.`);
    await mongoose.disconnect();
}

run().catch(err => { console.error('❌', err.message); process.exit(1); });
