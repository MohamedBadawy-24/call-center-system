const mongoose = require('mongoose');
require('dotenv').config();

async function inspect() {
  await mongoose.connect(process.env.MONGO_URI);
  try {
    const Survey = require('./models/Survey');
    const surveys = await Survey.find({}).lean();
    console.log(`Total surveys in DB: ${surveys.length}`);
    surveys.forEach(s => {
      console.log(`\nSurvey ID: ${s._id}`);
      console.log(`Title: "${s.title}"`);
      console.log(`isActive: ${s.isActive}`);
      console.log(`targetAudience: ${s.targetAudience}`);
      console.log(`assignedAgents: ${JSON.stringify(s.assignedAgents)}`);
      if (s.outboundPrecall) {
        console.log(`outboundPrecall fields: ${s.outboundPrecall.fields?.length}`);
        console.log(`meta title: ${s.outboundPrecall.meta?.title}`);
      } else {
        console.log(`outboundPrecall: null`);
      }
    });
  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
}
inspect();
