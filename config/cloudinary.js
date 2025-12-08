const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');
const dotenv = require('dotenv');

// Cargar variables de entorno
dotenv.config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'pianolink-scores', // Carpeta en la nube
    allowed_formats: ['pdf'],   // Solo PDFs
    resource_type: 'raw'        // IMPORTANTE: 'raw' es necesario para PDFs grandes
  },
});

// AQUI ESTA LA CLAVE PARA ARCHIVOS GRANDES:
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50 MB (ajustable)
  } 
});

module.exports = { upload, cloudinary };