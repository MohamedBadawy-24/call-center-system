const mongoose = require('mongoose');
require('dotenv').config();

async function inspect() {
  await mongoose.connect(process.env.MONGO_URI);
  try {
    const Survey = require('./models/Survey');
    const surveys = await Survey.find({}).lean();
    console.log(`Found ${surveys.length} surveys:`);
    for (const s of surveys) {
      console.log(`\n========================================`);
      console.log(`Survey ID: ${s._id}`);
      console.log(`Title: "${s.title}"`);
      console.log(`isActive: ${s.isActive}`);
      console.log(`outboundPrecall:`, JSON.stringify(s.outboundPrecall, null, 2));
      console.log(`draftData keys:`, s.draftData ? Object.keys(s.draftData) : null);
      if (s.draftData?.outboundPrecall) {
        console.log(`draftData.outboundPrecall:`, JSON.stringify(s.draftData.outboundPrecall, null, 2));
      }
    }

    // Check all collections in the database
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log('\nDatabase collections:', collections.map(c => c.name));

  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
}
inspect();
