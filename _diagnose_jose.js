/**
 * Diagnóstico: José Wilhekmy — balance de clases y última reserva
 * Ejecutar: node _diagnose_jose.js
 */
require('dotenv').config();
const mongoose = require('mongoose');

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('✅ Conectado a MongoDB');

  const db = mongoose.connection.db;

  // 1. Buscar al usuario — búsqueda amplia
  let user = await db.collection('users').findOne({ name: { $regex: /wilhekmy/i } });
  if (!user) user = await db.collection('users').findOne({ name: { $regex: /jose/i, }, role: { $in: ['student', 'client'] } });
  if (!user) {
    console.log('❌ No encontrado. Listando todos los students/clients con balance > 0:');
    const users = await db.collection('users')
      .find({ role: { $in: ['student', 'client'] }, classesRemaining: { $gt: 0 } })
      .project({ _id: 1, name: 1, email: 1, role: 1, classesRemaining: 1 })
      .limit(20).toArray();
    console.log(users);

    // También buscar en enrollments con classesRemaining alto
    console.log('\n--- Enrollments con clases > 40:');
    const bigEnroll = await db.collection('enrollments').find({ classesRemaining: { $gt: 40 } }).toArray();
    console.log(bigEnroll);
    const bigSubEnroll = await db.collection('studentenrollments').find({ classesRemaining: { $gt: 40 } }).toArray();
    console.log('\n--- StudentEnrollments con clases > 40:', bigSubEnroll);
    const bigSub = await db.collection('studentsubscriptions').find({ classesRemaining: { $gt: 40 } }).toArray();
    console.log('\n--- StudentSubscriptions con clases > 40:', bigSub);
    process.exit();
  }

  console.log('\n📋 USUARIO:');
  console.log({
    _id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    classesRemaining: user.classesRemaining,
    createdAt: user.createdAt
  });

  // 2. StudentSubscription
  const subs = await db.collection('studentsubscriptions').find({
    $or: [{ studentId: user._id }, { studentId: user._id.toString() }]
  }).toArray();
  console.log('\n📦 STUDENT SUBSCRIPTIONS:', subs.length);
  subs.forEach(s => {
    console.log({
      _id: s._id,
      teacherId: s.teacherId,
      status: s.status,
      classesRemaining: s.classesRemaining,
      classesTotal: s.classesTotal,
      expiresAt: s.expiresAt,
      createdAt: s.createdAt
    });
  });

  // 3. Enrollment
  const enrollments = await db.collection('enrollments').find({
    $or: [{ studentId: user._id }, { studentId: user._id.toString() }]
  }).toArray();
  console.log('\n📝 ENROLLMENTS:', enrollments.length);
  enrollments.forEach(e => {
    console.log({
      _id: e._id,
      teacherId: e.teacherId,
      classesRemaining: e.classesRemaining,
      status: e.status
    });
  });

  // 4. StudentEnrollment
  const sEnrollments = await db.collection('studentenrollments').find({
    $or: [{ student: user._id }, { student: user._id.toString() }]
  }).toArray();
  console.log('\n📝 STUDENT ENROLLMENTS:', sEnrollments.length);
  sEnrollments.forEach(e => {
    console.log({
      _id: e._id,
      teacher: e.teacher,
      classesRemaining: e.classesRemaining,
      classesExpiresAt: e.classesExpiresAt
    });
  });

  // 5. Bookings recientes
  const bookings = await db.collection('bookings').find({
    $or: [{ studentId: user._id }, { studentId: user._id.toString() }]
  }).sort({ createdAt: -1 }).limit(5).toArray();
  console.log('\n📅 ÚLTIMAS 5 RESERVAS:');
  bookings.forEach(b => {
    console.log({
      _id: b._id,
      bookingType: b.bookingType,
      status: b.status,
      scheduledStart: b.scheduledStart,
      teacherId: b.teacherId,
      classesDeducted: b.classesDeducted,
      createdAt: b.createdAt
    });
  });

  // 6. Verificar si clientData tiene classesRemaining (guardian legacy)
  if (user.role === 'client') {
    console.log('\n👨‍👧 CLIENT DATA (managedStudents):');
    const managed = user.clientData?.managedStudents || [];
    managed.forEach(ms => {
      console.log({
        studentId: ms.studentId,
        name: ms.name,
        classesRemaining: ms.classesRemaining
      });
    });
  }

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
