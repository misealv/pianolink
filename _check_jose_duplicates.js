require('dotenv').config();
const mongoose = require('mongoose');
const { connectDirect } = require('./_db_direct_connect');

async function main() {
  await connectDirect(mongoose, process.env.MONGO_URI || process.env.MONGODB_URI);
  console.log('✅ Conectado');
  const db = mongoose.connection.db;

  const oldId = new mongoose.Types.ObjectId('69f458a4ed8946b42b2f2abe');
  const realId = new mongoose.Types.ObjectId('6997183bb6f86efb145056c0');

  const oldUser = await db.collection('users').findOne({ _id: oldId });
  console.log('\n--- Usuario ID viejo (69f458a4...) ---');
  console.log(oldUser ? JSON.stringify({ _id: oldUser._id, name: oldUser.name, email: oldUser.email, classesRemaining: oldUser.classesRemaining, createdAt: oldUser.createdAt }, null, 2) : '❌ NO EXISTE');

  // Todas las subscriptions con cualquiera de los dos IDs
  const allSubs = await db.collection('studentsubscriptions').find({
    studentId: { $in: [oldId, realId, oldId.toString(), realId.toString()] }
  }).toArray();
  console.log('\n--- TODAS las subscriptions (ambos IDs) ---', allSubs.length);
  allSubs.forEach(s => console.log(JSON.stringify(s, null, 2)));

  // Buscar TODOS los usuarios que contengan "wilhelmy" o "wilhekmy" case-insensitive, sin filtro de role
  const allJoseUsers = await db.collection('users').find({ name: { $regex: /wilhe/i } }).toArray();
  console.log('\n--- TODOS los usuarios con "wilhe" en el nombre ---', allJoseUsers.length);
  allJoseUsers.forEach(u => console.log(JSON.stringify({ _id: u._id, name: u.name, email: u.email, role: u.role, classesRemaining: u.classesRemaining, createdAt: u.createdAt }, null, 2)));

  // Buscar por email también
  const byEmail = await db.collection('users').find({ email: { $regex: /wilhelmy/i } }).toArray();
  console.log('\n--- Por email "wilhelmy" ---', byEmail.length);
  byEmail.forEach(u => console.log(JSON.stringify({ _id: u._id, name: u.name, email: u.email }, null, 2)));

  await mongoose.disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
