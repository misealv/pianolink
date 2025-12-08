const mongoose = require('mongoose');

const ScoreSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  url: {
    type: String,
    required: true
  },
  publicId: {
    type: String,
    required: true
  },
  // VINCULACIÓN CON LA SALA
  roomCode: { 
    type: String, 
    required: true,
    uppercase: true, // Guardar siempre en mayúsculas para evitar confusiones
    trim: true
  },
  uploaderName: {
    type: String,
    default: 'Participante'
  },
  size: { // Opcional: Guardar el peso del archivo para referencia
    type: Number 
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Score', ScoreSchema);