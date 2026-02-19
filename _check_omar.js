const mongoose = require('mongoose');
require('dotenv').config();

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const User = require('./models/User');
  const Enrollment = require('./models/Enrollment');
  
  // Omar
  const omar = await User.findById('699659eb02fb6a0b455f5ea9');
  console.log('=== OMAR ===');
  console.log('name:', omar?.name);
  console.log('role:', omar?.role);
  console.log('assignedTeacher:', omar?.assignedTeacher);
  console.log('classesRemaining:', omar?.classesRemaining);
  
  // Enrollment de Omar
  const enrollments = await Enrollment.find({ studentId: '699659eb02fb6a0b455f5ea9' });
  console.log('\nEnrollments:', enrollments.length);
  enrollments.forEach(e => {
    console.log(`  teacher: ${e.teacherId} | status: ${e.status} | role: ${e.role} | source: ${e.source}`);
  });
  
  // Verificar lo que /api/client/me devuelve
  const enrollment = await Enrollment.findOne({
    studentId: '699659eb02fb6a0b455f5ea9',
    status: 'active'
  }).populate('teacherId', 'name email teacherData.plan teacherData.hourlyRate');
  
  if (enrollment) {
    console.log('\nEnrollment activo:');
    console.log('  teacher:', enrollment.teacherId?.name, enrollment.teacherId?.email);
    console.log('  hourlyRate:', enrollment.teacherId?.teacherData?.hourlyRate);
  } else {
    console.log('\nNO hay enrollment activo!');
  }
  
  await mongoose.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
