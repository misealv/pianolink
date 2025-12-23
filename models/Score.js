/* models/Score.js */
const mongoose = require('mongoose');

const ScoreSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  url: { type: String, required: true },
  publicId: { type: String, required: true }, // Crítico para Cloudinary
  roomCode: { type: String, required: true, uppercase: true, trim: true },
  uploaderName: { type: String, default: 'Participante' },
  category: { type: String, default: 'general' },
  folder: { type: String, default: null }, // <--- CAMPO AÑADIDO PARA LA CIRUGÍA
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Score', ScoreSchema);