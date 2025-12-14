const express = require('express');
const router = express.Router();
const Score = require('../models/Score'); 
// Importamos 'upload' para subir y 'cloudinary' para borrar
const { upload, cloudinary } = require('../config/cloudinary'); 

// ==========================================
// 1. SUBIR ARCHIVO (POST)
// ==========================================
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ msg: 'Error: Falta archivo.' });
    if (!req.body.roomCode) return res.status(400).json({ msg: 'Error: Falta código de sala.' });

    const newScore = new Score({
      title: req.body.title || req.file.originalname,
      url: req.file.path,
      publicId: req.file.filename,
      roomCode: req.body.roomCode.toUpperCase(),
      uploaderName: req.body.uploaderName || 'Participante',
      size: req.file.size
    });

    const savedScore = await newScore.save();
    console.log(`PDF subido a sala ${req.body.roomCode}`);
    res.json(savedScore);
    
  } catch (err) {
    console.error("Error subida:", err);
    res.status(500).send('Error del servidor');
  }
});

// ==========================================
// 2. LISTAR ARCHIVOS DE UNA SALA (GET)
// ==========================================
router.get('/:roomCode', async (req, res) => {
  try {
    const code = req.params.roomCode.toUpperCase();
    const scores = await Score.find({ roomCode: code }).sort({ createdAt: -1 });
    res.json(scores);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error obteniendo lista');
  }
});

// ==========================================
// 3. ELIMINAR ARCHIVO (DELETE) - ¡NUEVO!
// ==========================================
router.delete('/:id', async (req, res) => {
  try {
    const score = await Score.findById(req.params.id);
    if (!score) return res.status(404).json({ msg: 'Partitura no encontrada' });

    // 1. Borrar de la nube (Cloudinary)
    if (score.publicId) {
       // Asegúrate de que tu config/cloudinary.js exporte 'cloudinary'
       // Si no lo hace, avísame para darte el arreglo.
       if(cloudinary) {
           await cloudinary.uploader.destroy(score.publicId, { resource_type: 'raw' });
       }
    }

    // 2. Borrar de la base de datos
    await score.deleteOne();
    
    res.json({ msg: 'Partitura eliminada correctamente' });

  } catch (err) {
    console.error(err);
    res.status(500).send('Error al eliminar');
  }
});

module.exports = router;