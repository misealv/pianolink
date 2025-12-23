/* config/cloudinary.js */
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: async (req, file) => {
        // La magia: Tomamos la sala y la carpeta del cuerpo de la petición
        const room = (req.body.roomCode || 'GENERAL').toUpperCase();
        const folder = req.body.folder || '';
        
        // Estructura: pianolink/SALA_1/Tareas/ o pianolink/SALA_1/
        const path = `pianolink/${room}${folder ? '/' + folder : ''}`;
        
        return {
            folder: path,
            allowed_formats: ['pdf'],
            resource_type: 'raw', // 'raw' es vital para PDFs en Cloudinary
            public_id: file.originalname.split('.')[0] + '_' + Date.now()
        };
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 } 
});

module.exports = { upload, cloudinary };