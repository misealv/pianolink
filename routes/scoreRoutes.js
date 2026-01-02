/* routes/scoreRoutes.js */
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Score = require('../models/Score'); 
const Annotation = require('../models/Annotation'); 
const { upload, cloudinary } = require('../config/cloudinary'); 

// === MIDDLEWARE: Solo profesores pueden modificar/borrar ===
const requireTeacher = (req, res, next) => {
    try {
        // Obtener token del header Authorization: Bearer <token>
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            console.log('[Auth] ❌ Sin token de autorización');
            return res.status(401).json({ error: 'No autorizado - Token requerido' });
        }
        
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // El token es válido, el usuario es profesor (solo profesores tienen tokens)
        req.userId = decoded.id;
        console.log('[Auth] ✅ Profesor autorizado:', decoded.id);
        next();
    } catch (err) {
        console.log('[Auth] ❌ Token inválido:', err.message);
        return res.status(401).json({ error: 'No autorizado - Token inválido' });
    }
};

// --- 1. RUTAS ESPECÍFICAS (DEBEN IR ARRIBA) ---

// SUBIR ARCHIVO (Profesores pueden subir, alumnos también con restricciones)
router.post('/upload', upload.single('file'), async (req, res) => {
  console.log('[Upload] Solicitud de subida recibida');
  console.log('[Upload] Body:', { title: req.body.title, roomCode: req.body.roomCode });
  
  try {
    if (!req.file) {
      console.log('[Upload] ❌ No se recibió archivo');
      return res.status(400).json({ msg: 'Error: Falta archivo.' });
    }
    
    console.log('[Upload] Archivo recibido:', {
      originalname: req.file.originalname,
      path: req.file.path,
      filename: req.file.filename
    });
    
    const newScore = new Score({
      title: req.body.title || req.file.originalname,
      url: req.file.path,
      publicId: req.file.filename, 
      roomCode: req.body.roomCode.toUpperCase(),
      uploaderName: req.body.uploaderName || 'Participante',
      category: req.body.category || 'general',
      folder: req.body.folder || null 
    });
    const savedScore = await newScore.save();
    console.log('[Upload] ✅ Score guardado:', savedScore._id);
    res.json(savedScore);
  } catch (err) {
    console.error('[Upload] ❌ Error:', err);
    res.status(500).json({ error: 'Error subida', details: err.message });
  }
});

// RENOMBRAR CARPETA (Mueve archivos en Cloudinary + BD) - SOLO PROFESORES
router.patch('/folder/rename', requireTeacher, async (req, res) => {
    try {
        const { oldName, newName, room } = req.body;
        const scores = await Score.find({ roomCode: room.toUpperCase(), folder: oldName });
        for (const score of scores) {
            const fileName = score.publicId.split('/').pop();
            const newPublicId = `pianolink/${room.toUpperCase()}/${newName}/${fileName}`;
            try {
                const result = await cloudinary.uploader.rename(score.publicId, newPublicId, { resource_type: 'raw' });
                score.publicId = result.public_id;
                score.url = result.secure_url;
            } catch (e) {}
            score.folder = newName;
            await score.save();
        }
        res.json({ ok: true });
    } catch (e) { res.status(500).send(e.message); }
});

// BORRAR CARPETA - SOLO PROFESORES
router.delete('/folder/:folderName', requireTeacher, async (req, res) => {
  try {
      const { folderName } = req.params;
      const room = req.query.room;
      const scores = await Score.find({ roomCode: room.toUpperCase(), folder: folderName });
      for (const score of scores) {
          try { await cloudinary.uploader.destroy(score.publicId, { resource_type: 'raw' }); } catch(e) {}
          await Annotation.deleteMany({ scoreId: score._id }); 
      }
      await Score.deleteMany({ roomCode: room.toUpperCase(), folder: folderName });
      res.json({ ok: true });
  } catch (e) { res.status(500).send(e.message); }
});

// OBTENER ANOTACIONES (Movido arriba para evitar 404)
router.get('/:id/annotations', async (req, res) => {
    try {
        const annotations = await Annotation.find({ scoreId: req.params.id });
        res.json(annotations);
    } catch (err) { res.status(500).send('Error anotaciones'); }
});

// --- 2. RUTAS GENÉRICAS Y DE ID ---

// LISTAR ARCHIVOS DE SALA (Abajo de las rutas específicas)
router.get('/:roomCode', async (req, res) => {
  try {
    const scores = await Score.find({ roomCode: req.params.roomCode.toUpperCase() }).sort({ createdAt: -1 });
    res.json(scores);
  } catch (err) { res.status(500).send('Error lista'); }
});

// MOVER ARCHIVO INDIVIDUAL - SOLO PROFESORES
router.patch('/:id/move', requireTeacher, async (req, res) => {
  try {
      const { folderName } = req.body; 
      const score = await Score.findById(req.params.id);
      const fileName = score.publicId.split('/').pop(); 
      const newPath = `pianolink/${score.roomCode}/${folderName || ''}/${fileName}`.replace('//', '/');
      try {
          const resCloud = await cloudinary.uploader.rename(score.publicId, newPath, { resource_type: 'raw', overwrite: true });
          score.publicId = resCloud.public_id;
          score.url = resCloud.secure_url;
      } catch(e) {}
      score.folder = folderName || null;
      await score.save();
      res.json({ ok: true });
  } catch (e) { res.status(500).send(e.message); }
});

// RENOMBRAR TÍTULO - SOLO PROFESORES
router.patch('/:id/rename', requireTeacher, async (req, res) => {
    try {
        await Score.findByIdAndUpdate(req.params.id, { title: req.body.newTitle });
        res.json({ ok: true });
    } catch (e) { res.status(500).send(e.message); }
});

// ELIMINAR ARCHIVO - SOLO PROFESORES
router.delete('/:id', requireTeacher, async (req, res) => {
  try {
    const score = await Score.findById(req.params.id);
    if (score && score.publicId) {
        try { await cloudinary.uploader.destroy(score.publicId, { resource_type: 'raw' }); } catch(e) {}
    }
    await Score.findByIdAndDelete(req.params.id);
    await Annotation.deleteMany({ scoreId: req.params.id });
    res.json({ msg: 'OK' });
  } catch (err) { res.status(500).send('Error'); }
});

module.exports = router;