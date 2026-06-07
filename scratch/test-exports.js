const mongoose = require('mongoose');
require('dotenv').config();
const Survey = require('../models/Survey');
const Response = require('../models/Response');
const User = require('../models/User');
const responseController = require('../controllers/responseController');

// Mock express response object
class MockResponse {
  constructor() {
    this.headers = {};
    this.data = [];
    this.sentContent = null;
    this.downloadFile = null;
    this.downloadName = null;
    this.isEnded = false;
  }

  setHeader(name, value) {
    this.headers[name] = value;
  }

  write(chunk) {
    this.data.push(chunk);
  }

  end(chunk) {
    if (chunk) this.data.push(chunk);
    this.sentContent = this.data.join('');
    this.isEnded = true;
  }

  status(code) {
    this.statusCode = code;
    return this;
  }

  json(content) {
    this.sentContent = JSON.stringify(content);
    this.isEnded = true;
  }

  send(content) {
    this.sentContent = content;
    this.isEnded = true;
  }

  download(file, name, cb) {
    this.downloadFile = file;
    this.downloadName = name;
    if (cb) cb();
  }
}

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB.');

  // Create mock user
  let user = await User.findOne({ email: 'admin-test-export@test.com' });
  if (!user) {
    user = await User.create({
      name: 'Test Admin',
      email: 'admin-test-export@test.com',
      password: 'Password123!',
      role: 'admin'
    });
  }

  // Create mock survey
  const survey = await Survey.create({
    title: "Test Export Survey " + Date.now(),
    sections: [{
      title: "Section 1",
      questions: [
        { questionId: "q1", type: "single_choice", text: "Are you ok?", choices: [{ text: "Yes" }, { text: "No" }] },
        { questionId: "q2", type: "multiple_choice", text: "Colors?", choices: [{ text: "Red" }, { text: "Blue" }], allowOther: true, allowMultipleOther: true }
      ]
    }]
  });

  const surveyId = survey._id;

  // Create mock responses
  // Response 1: no other values
  await Response.create({
    surveyId,
    agentId: user._id,
    status: "completed",
    answers: [
      { questionId: "q1", value: "Yes" },
      { questionId: "q2", value: ["Red"] }
    ]
  });

  // Response 2: multi-other values
  await Response.create({
    surveyId,
    agentId: user._id,
    status: "completed",
    answers: [
      { questionId: "q1", value: "No" },
      { questionId: "q2", value: ["Blue", "other:green color", "other:yellow color"] }
    ]
  });

  console.log('Created test data.');

  // Test 1: Standard CSV Export
  console.log('\n--- Testing Standard CSV Export ---');
  const resCsv = new MockResponse();
  await responseController.exportCsv({ params: { id: surveyId.toString() } }, resCsv);
  
  // Wait a bit if it was asynchronous cursor
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  console.log('CSV Headers:', resCsv.data[1].split('\n')[0]);
  console.log('CSV Data rows:');
  console.log(resCsv.sentContent || resCsv.data.join(''));

  // Test 2: Advanced CSV Export
  console.log('\n--- Testing Advanced CSV Export ---');
  const resAdvCsv = new MockResponse();
  await responseController.exportAdvanced({
    query: { surveyId: surveyId.toString(), format: 'csv' }
  }, resAdvCsv);
  await new Promise(resolve => setTimeout(resolve, 1000));
  console.log('Adv CSV Headers:', resAdvCsv.data[1].split('\n')[0]);
  console.log(resAdvCsv.sentContent || resAdvCsv.data.join(''));

  // Test 3: Advanced Excel Export
  console.log('\n--- Testing Advanced Excel Export ---');
  const resExcel = new MockResponse();
  await responseController.exportAdvanced({
    query: { surveyId: surveyId.toString(), format: 'xlsx' }
  }, resExcel);
  console.log('Excel Content-Type:', resExcel.headers['Content-Type']);
  console.log('Excel Buffer received:', Buffer.isBuffer(resExcel.sentContent) || typeof resExcel.sentContent === 'object');

  // Test 4: SPSS Export
  console.log('\n--- Testing SPSS Export ---');
  const resSPSS = new MockResponse();
  await responseController.exportAdvanced({
    query: { surveyId: surveyId.toString(), format: 'sav' }
  }, resSPSS);
  console.log('SPSS Download file:', resSPSS.downloadFile);

  // Clean up
  console.log('\nCleaning up test data...');
  await Response.deleteMany({ surveyId });
  await Survey.deleteOne({ _id: surveyId });
  await User.deleteOne({ _id: user._id });
  await mongoose.disconnect();
  console.log('Done.');
}

run().catch(console.error);
