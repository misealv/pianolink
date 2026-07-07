/**
 * Fix: sincronizar User.classesRemaining con StudentSubscription para José Wilhelmy
 * El booking descontó correctamente en StudentSubscription (49), pero User.classesRemaining quedó en 50 (legacy).
 */
require('dotenv').config();
const mongoose = require('mongoose');

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;

  const userId = new mongoose.Types.ObjectId('69f458a4ed8946b42b2f2abe');
  const subId  = new mongoose.Types.ObjectId('69f480b0a254d65425631936');

  // Verificar estado actual
  const user = await db.collection('users').findOne({ _id: userId });
  const sub  = await db.collection('studentsubscriptions').findOne({ _id: subId });

  console.log('ANTES:');
  console.log(`  User.classesRemaining:         ${user.classesRemaining}`);
  console.log(`  Subscription.classesRemaining: ${sub.classesRemaining}`);

  if (user.classesRemaining === sub.classesRemaining) {
    console.log('✅ Ya están sincronizados, nada que hacer.');
    await mongoose.disconnect();
    return;
  }

  // Sincronizar User.classesRemaining con la suma de suscripciones activas
  const result = await db.collection('users').updateOne(
    { _id: userId },
    { $set: { classesRemaining: sub.classesRemaining } }
  );

  console.log(`\nUPDATE: ${result.modifiedCount} documento modificado`);

  const updated = await db.collection('users').findOne({ _id: userId });
  console.log('\nDESPUÉS:');
  console.log(`  User.classesRemaining:         ${updated.classesRemaining}`);
  console.log(`  Subscription.classesRemaining: ${sub.classesRemaining}`);
  console.log('\n✅ Sincronizado. José Wilhelmy ahora muestra 49 clases disponibles.');

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
