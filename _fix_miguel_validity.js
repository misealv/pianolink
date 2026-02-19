const mongoose = require('mongoose');
require('dotenv').config();

async function fix() {
  await mongoose.connect(process.env.MONGO_URI);
  const User = require('./models/User');
  const miguelId = '693dcdfb8189f12ab33f4747';
  const omarId = '699659eb02fb6a0b455f5ea9';

  // Fix validDays en paquetes de Miguel
  const miguel = await User.findById(miguelId);
  if (miguel.teacherData?.packages) {
    miguel.teacherData.packages = miguel.teacherData.packages.map(pkg => ({
      ...pkg.toObject ? pkg.toObject() : pkg,
      validDays: pkg.validDays || 30
    }));
    await miguel.save();
    console.log('✅ Miguel: validDays actualizado en', miguel.teacherData.packages.length, 'paquetes');
    miguel.teacherData.packages.forEach(p => console.log('  -', p.classes, 'clases |', p.discountPercent + '% off |', p.validDays, 'días'));
  }

  // Verificar clases de Omar
  const omar = await User.findById(omarId);
  console.log('\nOmar classesRemaining:', omar.classesRemaining);
  
  // Omar ya agendó su clase trial (1 clase consumida), debería tener 0
  // El BookingService ya lo descontó, verificar
  const Booking = require('./models/Booking');
  const bookings = await Booking.find({ studentId: omarId, status: 'confirmed' });
  console.log('Bookings confirmados:', bookings.length);
  bookings.forEach(b => console.log('  - classConsumed:', b.classConsumed, '| bookingType:', b.bookingType));

  process.exit(0);
}
fix().catch(e => { console.error(e); process.exit(1); });
