/**
 * FASE 0 — Backup local de colecciones críticas antes de FASE 1
 *
 * Exporta a JSON las colecciones que pueden verse afectadas por los cambios.
 * Sirve como punto de restauración antes de tocar BookingService y las rutas.
 *
 * Salida: scripts/backups/YYYY-MM-DD_HH-mm/
 *
 * Ejecutar: node scripts/fase0-backup-collections.js
 */

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const COLLECTIONS = [
    'studentsubscriptions',
    'teacherpackages',
    'bookings',
    'classsessions',
    'timeslots',
    'users',       // solo los involucrados: Miguel + José
    'payments'
];

// Filtros para no volcar toda la BD (usuarios: solo los 2 involucrados)
const FILTERS = {
    users: {
        _id: {
            $in: [
                new mongoose.Types.ObjectId('693dcdfb8189f12ab33f4747'), // Miguel
                new mongoose.Types.ObjectId('69f458a4ed8946b42b2f2abe')  // José
            ]
        }
    }
};

async function run() {
    const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!uri) { console.error('❌  MONGO_URI no definido'); process.exit(1); }

    await mongoose.connect(uri);
    console.log('✅  Conectado a MongoDB');

    // Directorio de backup
    const now = new Date();
    const stamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 16);
    const backupDir = path.join(__dirname, 'backups', stamp);
    fs.mkdirSync(backupDir, { recursive: true });

    const db = mongoose.connection.db;
    const summary = [];

    for (const colName of COLLECTIONS) {
        try {
            const filter = FILTERS[colName] || {};
            const docs = await db.collection(colName).find(filter).toArray();
            const filePath = path.join(backupDir, `${colName}.json`);
            fs.writeFileSync(filePath, JSON.stringify(docs, null, 2), 'utf8');
            console.log(`  💾  ${colName.padEnd(25)} ${docs.length} docs → ${filePath}`);
            summary.push({ collection: colName, count: docs.length, file: filePath });
        } catch (err) {
            console.warn(`  ⚠️  ${colName}: ${err.message}`);
        }
    }

    // Escribir manifiesto
    const manifest = {
        timestamp: now.toISOString(),
        purpose: 'Backup previo a FASE 1 — fix validUntil→expiresAt en BookingService',
        collections: summary
    };
    fs.writeFileSync(path.join(backupDir, '_manifest.json'), JSON.stringify(manifest, null, 2));

    console.log(`
╔══════════════════════════════════════════════════════════╗
║               BACKUP COMPLETADO ✓                       ║
╠══════════════════════════════════════════════════════════╣
║  Directorio: scripts/backups/${stamp}
║  Colecciones: ${summary.length}
║
║  Para restaurar una colección:
║    node scripts/fase0-restore-collection.js <collection>
╚══════════════════════════════════════════════════════════╝
`);

    await mongoose.disconnect();
}

run().catch(err => {
    console.error('❌  Error en backup:', err.message);
    process.exit(1);
});
