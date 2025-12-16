/* routes/scoreRoutes.js */
const express = require('express');
const router = express.Router();
const Score = require('../models/Score'); 
const Annotation = require('../models/Annotation'); // <--- NUEVO IMPORT
const { upload, cloudinary } = require('../config/cloudinary'); 

// 1. SUBIR ARCHIVO
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

// 2. LISTAR ARCHIVOS
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

// 3. NUEVO: OBTENER ANOTACIONES (Para que ScoreLogic las cargue)
router.get('/:id/annotations', async (req, res) => {
    try {
        const annotations = await Annotation.find({ scoreId: req.params.id });
        res.json(annotations);
    } catch (err) {
        console.error(err);
        res.status(500).send('Error obteniendo anotaciones');
    }
});

// 4. ELIMINAR CON CASCADA (Partitura + Dibujos)
router.delete('/:id', async (req, res) => {
  try {
    const scoreId = req.params.id;
    const score = await Score.findById(scoreId);
    if (!score) return res.status(404).json({ msg: 'Partitura no encontrada' });

    // A) Borrar de Cloudinary
    if (score.publicId && cloudinary) {
        await cloudinary.uploader.destroy(score.publicId, { resource_type: 'raw' });
    }

    // B) Borrar la partitura de Mongo
    await score.deleteOne();

    // C) CASCADA: Borrar todas las anotaciones asociadas
    await Annotation.deleteMany({ scoreId: scoreId });
    console.log(`🗑️ Partitura ${scoreId} y sus dibujos eliminados.`);
    
    res.json({ msg: 'Partitura eliminada correctamente' });

  } catch (err) {
    console.error(err);
    res.status(500).send('Error al eliminar');
  }
});

module.exports = router;