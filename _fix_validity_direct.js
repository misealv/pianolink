const mongoose = require('mongoose');
require('dotenv').config();

async function fix() {
  await mongoose.connect(process.env.MONGO_URI);
  const miguelId = '693dcdfb8189f12ab33f4747';

  // Actualizar directamente con $set para forzar validDays
  const result = await mongoose.connection.db.collection('users').updateOne(
    { _id: new mongoose.Types.ObjectId(miguelId) },
    { 
      $set: {
        'teacherData.packages.0.validDays': 30,
        'teacherData.packages.1.validDays': 30,
        'teacherData.packages.2.validDays': 60,
        'teacherData.packages.3.validDays': 90
      }
    }
  );
  console.log('Updated:', result.modifiedCount);

  // Verificar
  const user = await mongoose.connection.db.collection('users').findOne(
    { _id: new mongoose.Types.ObjectId(miguelId) }
  );
  user.teacherData.packages.forEach(p => {
    console.log('-', p.classes, 'clases |', p.discountPercent + '% off |', p.validDays, 'días');
  });

  process.exit(0);
}
fix().catch(e => { console.error(e); process.exit(1); });
