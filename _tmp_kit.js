require('dotenv').config();
const mongoose = require('mongoose');
mongoose.connect(process.env.MONGO_URI).then(async () => {
  const kit = await mongoose.connection.db.collection('welcomekits').findOne({ _id: new mongoose.Types.ObjectId('6993fd1ffe0885d4c2a398f1') });
  console.log(JSON.stringify(kit, null, 2));
  await mongoose.disconnect();
});
