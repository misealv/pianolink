/**
 * FASE 3 hardening: activar TeacherPackage Plan Anual de José
 * Idempotente.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const TeacherPackage = require('../models/TeacherPackage');

const PACKAGE_ID = '69f458b5354f629d942ac25f';

async function main() {
    const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!uri) throw new Error('MONGO_URI no definido');
    await mongoose.connect(uri);

    const pkg = await TeacherPackage.findById(PACKAGE_ID);
    if (!pkg) {
        console.error('❌ TeacherPackage no encontrado:', PACKAGE_ID);
        process.exit(1);
    }

    console.log(`Estado actual: isActive=${pkg.isActive}`);
    if (pkg.isActive) {
        console.log('✅ Ya está activo. Nada que hacer.');
    } else {
        pkg.isActive = true;
        await pkg.save();
        console.log('✅ TeacherPackage activado:', pkg.name);
    }

    await mongoose.disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
