/* config/db.js */
const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    // ESTA LÍNEA ELIMINA LA ADVERTENCIA AMARILLA
    mongoose.set('strictQuery', false);

    const conn = await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log(`MongoDB Conectado: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Error de conexión: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;