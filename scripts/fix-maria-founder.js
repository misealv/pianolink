/**
 * Corrige a María: plan free, isFounder false (no ha pagado).
 * Mantiene isFoundingMember: true para que pueda pagar el plan founder.
 */
const mongoose = require('mongoose');
require('dotenv').config();

async function fix() {
    await mongoose.connect(process.env.MONGODB_URI);
    const User = require('../models/User');

    const maria = await User.findOne({ email: 'mariaqp@gmail.com' });
    if (!maria) { console.log('María no encontrada'); process.exit(1); }

    console.log('ANTES:', {
        isFounder: maria.isFounder,
        isFoundingMember: maria.isFoundingMember,
        plan: maria.teacherData?.plan,
        subscriptionStatus: maria.teacherData?.subscriptionStatus,
        subscriptionExpiresAt: maria.teacherData?.subscriptionExpiresAt
    });

    await User.updateOne(
        { email: 'mariaqp@gmail.com' },
        {
            $set: {
                isFounder: false,
                isFoundingMember: true,
                'teacherData.plan': 'free',
                'teacherData.subscriptionStatus': 'trial',
                'teacherData.permissions.canInvitePrivateStudents': false,
                'teacherData.permissions.hasPriorityQueue': false
            },
            $unset: {
                'teacherData.subscriptionExpiresAt': 1
            }
        }
    );

    const updated = await User.findOne({ email: 'mariaqp@gmail.com' });
    console.log('DESPUÉS:', {
        isFounder: updated.isFounder,
        isFoundingMember: updated.isFoundingMember,
        plan: updated.teacherData?.plan,
        subscriptionStatus: updated.teacherData?.subscriptionStatus,
        subscriptionExpiresAt: updated.teacherData?.subscriptionExpiresAt
    });

    await mongoose.disconnect();
    console.log('✅ María corregida');
}

fix().catch(e => { console.error(e); process.exit(1); });
