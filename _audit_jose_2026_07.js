/**
 * Auditoría 2026-07: José Wilhelmy — anualidad de 48 clases
 * Objetivo: reconstruir el historial completo (pagos, suscripciones, bookings, class sessions)
 * para determinar cuántas clases se han dictado realmente y cuántas quedan pendientes.
 * Ejecutar: node _audit_jose_2026_07.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { connectDirect } = require('./_db_direct_connect');

async function main() {
  await connectDirect(mongoose, process.env.MONGO_URI || process.env.MONGODB_URI);
  console.log('✅ Conectado a MongoDB (vía SRV directo, sin TXT)');
  const db = mongoose.connection.db;

  // 1. Usuario
  const user = await db.collection('users').findOne({ name: { $regex: /wilhe?lmy/i } });
  if (!user) {
    console.log('❌ Usuario no encontrado con regex wilhe?lmy. Buscando por "jose"...');
    const candidates = await db.collection('users').find({ name: { $regex: /jose/i } })
      .project({ _id: 1, name: 1, email: 1, role: 1, classesRemaining: 1 }).toArray();
    console.log(candidates);
    await mongoose.disconnect();
    return;
  }

  console.log('\n📋 USUARIO:');
  console.log(JSON.stringify({
    _id: user._id, name: user.name, email: user.email, role: user.role,
    classesRemaining: user.classesRemaining, createdAt: user.createdAt
  }, null, 2));

  const userId = user._id;

  // 2. Todas las StudentSubscriptions (activas, pausadas, agotadas, canceladas)
  const subs = await db.collection('studentsubscriptions').find({
    $or: [{ studentId: userId }, { studentId: userId.toString() }]
  }).sort({ createdAt: 1 }).toArray();
  console.log('\n📦 STUDENT SUBSCRIPTIONS:', subs.length);
  subs.forEach(s => {
    console.log(JSON.stringify({
      _id: s._id, teacherId: s.teacherId, status: s.status,
      classesTotal: s.classesTotal, classesRemaining: s.classesRemaining,
      classesCompleted: s.classesCompleted,
      classesCancelledByStudent: s.classesCancelledByStudent,
      classesCancelledByTeacher: s.classesCancelledByTeacher,
      startsAt: s.startsAt, expiresAt: s.expiresAt, createdAt: s.createdAt,
      statusHistory: s.statusHistory
    }, null, 2));
  });

  // 3. Payments asociados
  const payments = await db.collection('payments').find({
    $or: [{ userId: userId }, { userId: userId.toString() }]
  }).sort({ createdAt: 1 }).toArray();
  console.log('\n💳 PAYMENTS:', payments.length);
  payments.forEach(p => {
    console.log(JSON.stringify({
      _id: p._id, type: p.type, provider: p.provider, status: p.status,
      amount: p.amount, currency: p.currency, subscriptionId: p.subscriptionId,
      description: p.description, createdAt: p.createdAt
    }, null, 2));
  });

  // 4. Bookings (todos, no solo últimos 5)
  const bookings = await db.collection('bookings').find({
    $or: [{ studentId: userId }, { studentId: userId.toString() }]
  }).sort({ scheduledStart: 1 }).toArray();
  console.log('\n📅 BOOKINGS TOTAL:', bookings.length);
  bookings.forEach(b => {
    console.log(JSON.stringify({
      _id: b._id, status: b.status, scheduledStart: b.scheduledStart,
      teacherId: b.teacherId, classConsumed: b.classConsumed,
      classesDeducted: b.classesDeducted, subscriptionId: b.subscriptionId,
      createdAt: b.createdAt
    }, null, 2));
  });

  // 5. ClassSessions (si existen, para este alumno)
  const sessions = await db.collection('classsessions').find({
    $or: [{ studentId: userId }, { studentId: userId.toString() }]
  }).sort({ createdAt: 1 }).toArray();
  console.log('\n🎹 CLASS SESSIONS:', sessions.length);
  sessions.forEach(s => {
    console.log(JSON.stringify({
      _id: s._id, status: s.status, teacherId: s.teacherId,
      pricePerClassUSD: s.pricePerClassUSD, createdAt: s.createdAt
    }, null, 2));
  });

  // 6. Resumen de conteo
  const bookingStatusCount = {};
  bookings.forEach(b => { bookingStatusCount[b.status] = (bookingStatusCount[b.status] || 0) + 1; });
  console.log('\n📊 RESUMEN BOOKINGS POR STATUS:', bookingStatusCount);

  const totalClassesEnSubs = subs.reduce((acc, s) => acc + (s.classesTotal || 0), 0);
  const totalCompletedEnSubs = subs.reduce((acc, s) => acc + (s.classesCompleted || 0), 0);
  const totalRemainingEnSubs = subs.reduce((acc, s) => acc + (s.classesRemaining || 0), 0);
  console.log('\n📊 SUMA SUBSCRIPTIONS -> total:', totalClassesEnSubs, '| completadas:', totalCompletedEnSubs, '| restantes:', totalRemainingEnSubs);

  console.log('\n📊 User.classesRemaining actual:', user.classesRemaining);

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
