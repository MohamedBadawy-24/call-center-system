const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['agent', 'admin', 'quality'], default: 'agent' },
  name: String,
  currentStatus: { type: String, enum: ['active', 'break', 'offline'], default: 'offline' }
});

const SurveySchema = new mongoose.Schema({
  title: String,
  isActive: { type: Boolean, default: true },
  goal: { type: Number, default: 0 },
  targetGovernorate: { type: String, default: 'All' },
  questions: [{
    text: String,
    type: { type: String, enum: ['text', 'single_choice', 'multiple_choice', 'info'] },
    choices: [{ text: String }],
    questionId: String
  }]
});

const PhoneNumberSchema = new mongoose.Schema({
  surveyId: mongoose.Schema.Types.ObjectId,
  number: String,
  governorate: String,
  status: { type: String, default: 'pending' },
  serialNumber: { type: String, unique: true }
});

const User = mongoose.models.User || mongoose.model('User', UserSchema);
const Survey = mongoose.models.Survey || mongoose.model('Survey', SurveySchema);
const PhoneNumber = mongoose.models.PhoneNumber || mongoose.model('PhoneNumber', PhoneNumberSchema);

async function seed() {
  await mongoose.connect('mongodb://127.0.0.1:27017/call-center-system');
  
  const hashedPassword = await bcrypt.hash('password', 10);
  
  let agent = await User.findOne({ username: 'agent1' });
  if (!agent) {
    agent = await User.create({ username: 'agent1', password: hashedPassword, role: 'agent', name: 'Test Agent' });
  }

  let survey = await Survey.findOne({ title: 'Test Survey' });
  if (!survey) {
    survey = await Survey.create({
      title: 'Test Survey',
      isActive: true,
      goal: 10,
      targetGovernorate: 'Cairo',
      questions: [
        { text: 'Question 1: What is your name?', type: 'text', questionId: 'q1' },
        { text: 'Question 2: Choose color', type: 'single_choice', choices: [{text: 'Red'}, {text: 'Blue'}], questionId: 'q2' },
        { text: 'Question 3: Any comments?', type: 'text', questionId: 'q3' }
      ]
    });
  }

  let num = await PhoneNumber.findOne({ number: '01012345678' });
  if (!num) {
    await PhoneNumber.create({
      surveyId: survey._id,
      number: '01012345678',
      governorate: 'Cairo',
      status: 'pending',
      serialNumber: 'S-1001'
    });
  }
  
  console.log('Test data seeded successfully.');
  process.exit(0);
}

seed();
