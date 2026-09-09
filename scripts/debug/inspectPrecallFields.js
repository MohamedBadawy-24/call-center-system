const mongoose = require('mongoose');
require('dotenv').config();

async function inspect() {
  await mongoose.connect(process.env.MONGO_URI);
  try {
    const Survey = require('./models/Survey');
    const survey = await Survey.findById('6a54a538977eed630cdd09df').lean();
    console.log('Survey Title:', survey.title);
    console.log('outboundPrecall meta:', survey.outboundPrecall?.meta);
    console.log('outboundPrecall fields (' + (survey.outboundPrecall?.fields?.length || 0) + ' fields):');
    (survey.outboundPrecall?.fields || []).forEach((f, i) => {
      console.log(`[${i}] ID: "${f.id}", Label: "${f.label}", Type: "${f.type}", Required: ${f.required}, Section: "${f.section}"`);
    });
  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
}
inspect();
