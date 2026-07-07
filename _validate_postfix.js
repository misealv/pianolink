require('dotenv').config();
const m = require('mongoose');

(async () => {
    await m.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
    require('./models/Lead');
    const CL = require('./crm/models/CrmLead');
    const CI = require('./crm/models/CrmInteraction');
    const ET = require('./crm/models/EmailTrackingEvent');
    const CC = require('./crm/models/CrmEmailCampaign');

    console.log('══════════ VALIDACIÓN POST-FIX ══════════\n');

    // 1. Duplicados
    const dupes = await CI.aggregate([
        { $match: { type: 'email_sent' } },
        { $group: { _id: { l: '$leadRef', s: '$metadata.emailStepNumber', sub: '$metadata.emailSubject' }, c: { $sum: 1 } } },
        { $match: { c: { $gt: 1 } } }
    ]);
    console.log('1. Duplicados:', dupes.length === 0 ? '✅ 0' : '❌ ' + dupes.length);

    // 2. Test accounts
    const tests = await CL.find({ tags: 'test_account' }).populate('leadRef', 'email').lean();
    console.log('2. Tests:', tests.length, tests.map(t => t.leadRef?.email + ' score=' + t.score).join(', '));

    // 3-4. Scores
    const s100 = await CL.countDocuments({ score: 100 });
    const sOver = await CL.countDocuments({ score: { $gt: 100 } });
    console.log('3. Score 100:', s100 === 0 ? '✅ 0' : '❌ ' + s100);
    console.log('4. Score >100:', sOver === 0 ? '✅ 0' : '❌ ' + sOver);

    // 5. super_hot falsos
    const fakeHot = await CL.countDocuments({
        'emailEngagement.engagementLevel': 'super_hot',
        'emailEngagement.totalOpened': 0,
        'emailEngagement.totalClicked': 0,
        tags: { $ne: 'test_account' }
    });
    console.log('5. super_hot falsos:', fakeHot === 0 ? '✅ 0' : '❌ ' + fakeHot);

    // 6. Huérfanos
    const intIds = new Set((await CI.find({}, { _id: 1 }).lean()).map(i => i._id.toString()));
    const evts = await ET.find({ emailInteractionId: { $ne: null } }, { emailInteractionId: 1 }).lean();
    const orphCount = evts.filter(e => !intIds.has(e.emailInteractionId?.toString())).length;
    console.log('6. Huérfanos:', orphCount === 0 ? '✅ 0' : '❌ ' + orphCount);

    // 7. emailId
    const wId = await CI.countDocuments({ type: 'email_sent', 'metadata.emailId': { $ne: null } });
    const tot = await CI.countDocuments({ type: 'email_sent' });
    console.log('7. emailId vinculado:', wId + '/' + tot + ' (' + (wId / tot * 100).toFixed(1) + '%)');

    // Engagement
    console.log('\n── Engagement ──');
    const ed = await CL.aggregate([
        { $group: { _id: '$emailEngagement.engagementLevel', c: { $sum: 1 }, s: { $avg: '$score' } } },
        { $sort: { c: -1 } }
    ]);
    ed.forEach(e => console.log('  ' + (e._id || 'none') + ': ' + e.c + ' (avg ' + e.s?.toFixed(0) + ')'));

    // Scores
    console.log('\n── Scores ──');
    const sd = await CL.aggregate([
        { $bucket: { groupBy: '$score', boundaries: [0, 1, 10, 20, 30, 40, 50, 60, 70, 80, 90, 101], default: 'x', output: { c: { $sum: 1 } } } }
    ]);
    sd.forEach(b => {
        const l = b._id === 0 ? '0' : b._id === 'x' ? '100+' : b._id + '-' + (b._id + 9);
        console.log('  ' + l + ': ' + b.c);
    });

    // Top 10
    console.log('\n── Top 10 Leads Reales ──');
    const top = await CL.find({ tags: { $ne: 'test_account' }, score: { $gt: 0 } })
        .sort({ score: -1 }).limit(10).populate('leadRef', 'name email source').lean();
    top.forEach((l, i) => {
        const e = l.emailEngagement || {};
        console.log(`  ${i + 1}. [${l.score}] ${l.leadRef?.name || '?'} <${l.leadRef?.email || '?'}> | ${e.engagementLevel} | O=${e.totalOpened || 0} C=${e.totalClicked || 0} | ${l.leadRef?.source || '?'}`);
    });

    // Campañas
    console.log('\n── Campañas ──');
    const cs = await CC.find({}).sort({ ordenSecuencia: 1 }).lean();
    cs.forEach(c => {
        if (!c.ordenSecuencia) return;
        const mt = c.metricas || {};
        const or = mt.totalEnviados > 0 ? ((mt.totalAbiertos / mt.totalEnviados) * 100).toFixed(1) : '-';
        console.log(`  [${c.ordenSecuencia}] ${c.nombre} | ${c.estado} | E=${mt.totalEnviados || 0} O=${mt.totalAbiertos || 0} (${or}%) C=${mt.totalClicks || 0}`);
    });

    console.log('\n══════════ FIN VALIDACIÓN ══════════');
    await m.disconnect();
})();
