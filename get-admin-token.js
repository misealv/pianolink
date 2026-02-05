const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
require('dotenv').config();

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const User = require('./models/User');
  const admin = await User.findOne({ role: 'admin' });
  if (!admin) {
    console.log('No hay admin');
    process.exit(1);
  }
  const token = jwt.sign({ id: admin._id }, process.env.JWT_SECRET, { expiresIn: '1d' });
  console.log(token);
  process.exit(0);
}).catch(e => {
  console.error(e);
  process.exit(1);
});
