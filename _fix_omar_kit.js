const mongoose = require('mongoose');
require('dotenv').config();

async function fix() {
  await mongoose.connect(process.env.MONGO_URI);
  const WelcomeKit = require('./models/WelcomeKit');
  const Booking = require('./models/Booking');

  const omarId = '699659eb02fb6a0b455f5ea9';
  const miguelId = '693dcdfb8189f12ab33f4747';

  // 1. Actualizar WelcomeKit a trial_scheduled
  const kit = await WelcomeKit.findOne({ clientId: omarId });
  if (!kit) {
    console.log('No se encontró WelcomeKit para Omar');
    process.exit(1);
  }
  console.log('Kit actual:', kit.overallStatus);

  // Buscar su booking con Miguel
  const booking = await Booking.findOne({ studentId: omarId, teacherId: miguelId, status: 'confirmed' });
  if (!booking) {
    console.log('No se encontró booking confirmado');
    process.exit(1);
  }
  console.log('Booking:', booking._id, 'bookingType:', booking.bookingType);

  // Actualizar kit
  kit.overallStatus = 'trial_scheduled';
  kit.trialClass = {
    bookingId: booking._id,
    teacherId: miguelId,
    scheduledAt: booking.scheduledStart
  };
  await kit.save();
  console.log('✅ Kit actualizado a trial_scheduled');

  // Marcar booking como trial
  booking.bookingType = 'trial';
  await booking.save();
  console.log('✅ Booking marcado como trial');

  process.exit(0);
}
fix().catch(e => { console.error(e); process.exit(1); });
