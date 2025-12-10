/* models/Message.js */
const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    // Si recipient es null, podría ser un mensaje global (para el futuro)
    recipient: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    content: {
        type: String,
        required: true
    },
    isRead: {
        type: Boolean,
        default: false
    }
}, { timestamps: true });

module.exports = mongoose.model('Message', messageSchema);