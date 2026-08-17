const mongoose = require('mongoose');
const env = require('./config/env');

const testSchema = new mongoose.Schema({
  name: String,
  serial: { type: String, unique: true, sparse: true }
});

const TestModel = mongoose.model('TestSparse', testSchema);

async function test() {
  await mongoose.connect(env.MONGO_URI || 'mongodb://127.0.0.1:27017/call-center');
  
  await TestModel.collection.drop().catch(e => {});
  await TestModel.syncIndexes();

  try {
    const doc1 = await TestModel.create({ name: 'doc1', serial: undefined });
    console.log('Doc 1 inserted (undefined)');
  } catch(e) { console.error('Doc 1 error:', e.message); }

  try {
    const doc2 = await TestModel.create({ name: 'doc2', serial: undefined });
    console.log('Doc 2 inserted (undefined)');
  } catch(e) { console.error('Doc 2 error:', e.message); }

  try {
    const doc3 = await TestModel.create({ name: 'doc3', serial: null });
    console.log('Doc 3 inserted (null)');
  } catch(e) { console.error('Doc 3 error:', e.message); }

  try {
    const doc4 = await TestModel.create({ name: 'doc4', serial: null });
    console.log('Doc 4 inserted (null)');
  } catch(e) { console.error('Doc 4 error:', e.message); }

  try {
    const doc5 = await TestModel.create({ name: 'doc5', serial: "" });
    console.log('Doc 5 inserted ("")');
  } catch(e) { console.error('Doc 5 error:', e.message); }

  try {
    const doc6 = await TestModel.create({ name: 'doc6', serial: "" });
    console.log('Doc 6 inserted ("")');
  } catch(e) { console.error('Doc 6 error:', e.message); }

  const all = await TestModel.find();
  console.log('All docs:', all);

  process.exit(0);
}

test();
