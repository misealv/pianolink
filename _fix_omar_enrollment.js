const mongoose = require('mongoose');
require('dotenv').config();

async function fix() {
  await mongoose.connect(process.env.MONGO_URI);
  const User = require('./models/User');
  const Enrollment = require('./models/Enrollment');
  const Room = require('./models/Room');

  const omarId = '699659eb02fb6a0b455f5ea9';
  const miguelId = '693dcdfb8189f12ab33f4747';

  // Buscar sala del profesor
  const room = await Room.findOne({ teacherId: miguelId, status: 'active' });
  console.log('Sala del profesor:', room ? room.code : '(ninguna)');

  // Calcular comisión
  let commission;
  try {
    const CommissionService = require('./services/CommissionService');
    commission = await CommissionService.calculateCommission(miguelId, 'platform');
    console.log('Comisión:', commission);
  } catch(e) {
    commission = { platformPercent: 25, teacherPercent: 75, reason: 'default' };
    console.log('Comisión fallback:', commission);
  }

  // Crear enrollment
  const enrollData = {
    studentId: omarId,
    teacherId: miguelId,
    source: 'platform',
    preloadedClasses: 0,
    classesRemaining: 0,
    appliedCommission: {
      platformPercent: commission.platformPercent,
      teacherPercent: commission.teacherPercent,
      reason: commission.reason
    },
    status: 'active'
  };

  if (room) {
    enrollData.roomId = room._id;
  }

  const enrollment = new Enrollment(enrollData);
  if (!room) {
    enrollment.schema.path('roomId').required(false);
  }

  await enrollment.save();
  console.log('✅ Enrollment creado:', enrollment._id);

  // Asignar profesor
  await User.updateOne(
    { _id: omarId },
    { $set: { 'studentData.assignedTeacher': miguelId } }
  );
  console.log('✅ assignedTeacher seteado');

  // Verificar
  const omar = await User.findById(omarId);
  console.log('Omar studentData:', JSON.stringify(omar.studentData, null, 2));

  process.exit(0);
}
fix().catch(e => { console.error(e); process.exit(1); });
