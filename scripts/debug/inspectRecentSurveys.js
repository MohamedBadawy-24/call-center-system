const mongoose = require('mongoose');
require('dotenv').config();

async function inspect() {
  await mongoose.connect(process.env.MONGO_URI);
  try {
    const Survey = require('./models/Survey');
    const surveys = await Survey.find({}).sort({ createdAt: -1 }).limit(5).lean();
    console.log(`Found ${surveys.length} surveys:`);
    surveys.forEach(s => {
      console.log(`\nID: ${s._id}`);
      console.log(`Title: "${s.title}"`);
      console.log(`Created: ${s.createdAt}`);
      console.log(`isActive: ${s.isActive}`);
      console.log(`targetAudience: ${s.targetAudience}`);
      console.log(`assignedAgents: ${s.assignedAgents.length}`);
      if (s.outboundPrecall) {
        console.log(`precall fields: ${s.outboundPrecall.fields?.length}`);
      } else {
        console.log(`precall: null`);
      }
    });
  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
}
inspect();
