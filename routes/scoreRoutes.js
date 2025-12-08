const express = require('express');
const router = express.Router();
const Score = require('../models/Score'); // Importamos la "Ficha"
const { upload } = require('../config/cloudinary'); // Importamos el "Camión"

// ==========================================
// VENTANILLA 1: SUBIR ARCHIVO (POST)
// ==========================================
// Recibe: Un archivo 'file' y datos de texto (title, roomCode, uploaderName)
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    // 1. Validaciones básicas
    if (!req.file) {
      return res.status(400).json({ msg: 'Error: No has seleccionado ningún archivo.' });
    }
    if (!req.body.roomCode) {
      return res.status(400).json({ msg: 'Error: No se detectó el código de sala.' });
    }

    // 2. Crear la ficha para la base de datos
    const newScore = new Score({
      title: req.body.title || req.file.originalname, // Si no pone título, usamos el nombre del archivo
      url: req.file.path,        // La dirección web segura que nos dio Cloudinary
      publicId: req.file.filename, // Identificador único en la nube
      roomCode: req.body.roomCode.toUpperCase(), // Guardamos siempre en mayúsculas
      uploaderName: req.body.uploaderName || 'Participante',
      size: req.file.size // (Opcional) Guardamos el peso en bytes
    });

    // 3. Guardar en MongoDB
    const savedScore = await newScore.save();

    console.log(`PDF subido exitosamente a la sala ${req.body.roomCode}`);
    res.json(savedScore); // Respondemos con los datos guardados
    
  } catch (err) {
    console.error("Error en subida:", err);
    res.status(500).send('Error del servidor al subir el archivo');
  }
});

// ==========================================
// VENTANILLA 2: LISTAR ARCHIVOS DE UNA SALA (GET)
// ==========================================
// Uso: /api/scores/CODIGO123
router.get('/:roomCode', async (req, res) => {
  try {
    const code = req.params.roomCode.toUpperCase();

    // Buscamos solo los archivos que tengan esa etiqueta de sala
    // .sort({ createdAt: -1 }) hace que los más nuevos salgan primero
    const scores = await Score.find({ roomCode: code }).sort({ createdAt: -1 });

    res.json(scores);

  } catch (err) {
    console.error(err);
    res.status(500).send('Error al obtener la biblioteca');
  }
});

module.exports = router;