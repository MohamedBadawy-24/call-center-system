/**
 * Jest globalTeardown — runs ONCE after all test suites.
 * Removes all documents created during the test run.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env.test') });

const mongoose = require('mongoose');
const fs = require('fs');

const CTX_FILE = '/tmp/jest-shared-ctx.json';

module.exports = async function () {
  if (!fs.existsSync(CTX_FILE)) return;

  let ctx;
  try { ctx = JSON.parse(fs.readFileSync(CTX_FILE, 'utf8')); }
  catch { return; }

  const MONGO_URI = ctx.MONGO_URI || 'mongodb://127.0.0.1:27017/call-center';

  try {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 10000 });
    const db = mongoose.connection.db;

    // Test phone numbers
    await db.collection('phonenumbers').deleteMany({ number: /^0100000/ }).catch(() => {});

    // Everything attached to the test campaign
    if (ctx.surveyId) {
      const sid = new mongoose.Types.ObjectId(ctx.surveyId);
      await db.collection('responses').deleteMany({ surveyId: sid }).catch(() => {});
      await db.collection('precallcompletions').deleteMany({ surveyId: sid }).catch(() => {});
      await db.collection('drafts').deleteMany({ surveyId: sid }).catch(() => {});
      await db.collection('surveys').deleteOne({ _id: sid }).catch(() => {});
    }

    // Handover / draft test artefacts
    await db.collection('precallcompletions').deleteMany({ serialNumber: /^HANDOVER-/ }).catch(() => {});
    await db.collection('phonenumbers').deleteMany({ serialNumber: /^HANDOVER-/ }).catch(() => {});
    await db.collection('drafts').deleteMany({ serialNumber: /^(HANDOVER-|DRAFT-TEST-|SUBMIT-DRAFT-)/ }).catch(() => {});

    // Export-seeded responses
    await db.collection('responses').deleteMany({ serialNumber: /^EXPORT-OTHER-/ }).catch(() => {});

    // Upload prefix phones
    await db.collection('phonenumbers').deleteMany({ number: /^0199/ }).catch(() => {});

    // Test users (everything that uses @test.invalid domain)
    await db.collection('users').deleteMany({ email: /@test\.invalid$/ }).catch(() => {});

    await mongoose.disconnect();
  } catch (err) {
    console.error('Teardown error:', err.message);
  }

  fs.unlinkSync(CTX_FILE);
};
