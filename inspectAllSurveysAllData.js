const mongoose = require('mongoose');
require('dotenv').config();

async function inspect() {
  await mongoose.connect(process.env.MONGO_URI);
  try {
    const Survey = require('./models/Survey');
    const all = await Survey.find({}).lean();
    console.log('Total surveys found:', all.length);
    all.forEach(s => {
      console.log('--------------------------------------------------');
      console.log('ID:', s._id);
      console.log('Title:', s.title);
      console.log('isActive:', s.isActive);
      console.log('Sections count:', s.sections?.length || 0);
      console.log('Has draftData:', !!s.draftData);
      if (s.draftData) {
        console.log('  draftData.title:', s.draftData.title);
        console.log('  draftData.outboundPrecall fields:', s.draftData.outboundPrecall?.fields?.length);
      }
      console.log('outboundPrecall fields count:', s.outboundPrecall?.fields?.length || 0);
      if (s.outboundPrecall?.fields) {
        console.log('outboundPrecall labels:', s.outboundPrecall.fields.map(f => f.label || f.id));
      }
    });
  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
}
inspect();
