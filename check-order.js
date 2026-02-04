const mongoose = require('mongoose');
require('dotenv').config();

async function main() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Conectado\n');
    
    // Ver la orden completa del WelcomeKit
    const WelcomeKit = mongoose.model('WelcomeKit', new mongoose.Schema({}, { strict: false }));
    
    const kit = await WelcomeKit.findById('6982df3493844000dff967a8');
    console.log('=== WELCOME KIT ORDER COMPLETA ===');
    console.log(JSON.stringify(kit, null, 2));
    
    await mongoose.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
