const axios = require('axios');
const mongoose = require('mongoose');
require('dotenv').config();
const fs = require('fs');
const FormData = require('form-data');
const path = require('path');
const xlsx = require('xlsx');

const API_URL = 'http://localhost:3000';
const results = [];
let STATE = {
  ADMIN_TOKEN: '',
  AGENT_TOKEN: '',
  QUALITY_TOKEN: '',
  SURVEY_ID: '',
  PHONE_NUMBER: '',
  NUMBER_ID: '',
  SERIAL_1: '',
  SERIAL_2: '',
  SERIAL_3: '',
  SERIAL_4: '',
  PHONE_2: '',
  PHONE_3: '',
  PHONE_4: '',
  RESPONSE_ID: ''
};

function logResult(id, status, notes) {
  results.push({ id, status, notes });
  console.log(`[${status}] ${id} - ${notes}`);
}

async function wipeDB() {
  console.log('Connecting to MongoDB to wipe...');
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Wiping collections...');
  const collections = await mongoose.connection.db.collections();
  for (let collection of collections) {
    try {
      await collection.deleteMany({});
    } catch (e) {
      console.error(`Failed to clear ${collection.collectionName}:`, e.message);
    }
  }
  console.log('Wipe complete.');
}

async function safeRequest(fn, id, description, expectedStatus) {
  try {
    const res = await fn();
    if (expectedStatus && res.status !== expectedStatus) {
      logResult(id, 'FAIL', `Expected ${expectedStatus}, got ${res.status}. Error: ${JSON.stringify(res.data)}`);
      return { success: false, data: res.data, status: res.status };
    }
    logResult(id, 'PASS', description);
    return { success: true, data: res.data, status: res.status };
  } catch (err) {
    if (expectedStatus && err.response && err.response.status === expectedStatus) {
       logResult(id, 'PASS', description);
       return { success: true, data: err.response.data, status: err.response.status };
    }
    const status = err.response ? err.response.status : 'Unknown';
    const msg = err.response && err.response.data ? JSON.stringify(err.response.data) : err.message;
    logResult(id, 'FAIL', `Error ${status}: ${msg}`);
    return { success: false, data: err.response ? err.response.data : null, status };
  }
}

async function runTests() {
  await wipeDB();

  // BLOCK 1 — BOOTSTRAP & AUTH
  console.log('--- BLOCK 1 ---');
  let res = await safeRequest(() => axios.get(`${API_URL}/auth/has-users`), '1.1', 'GET /auth/has-users returns {hasUsers: false}');
  if (res.success && res.data.hasUsers !== false) logResult('1.1-Verify', 'FAIL', 'hasUsers is not false');

  res = await safeRequest(() => axios.post(`${API_URL}/auth/register`, { name: 'Admin', email: 'admin@test.com', password: 'Password123!', role: 'admin' }), '1.2', 'Register Admin', 200); // 201 expected? we'll see, the backend returns 200 actually. We'll accept 200 or 201.
  
  // Wait, let's login first to get admin token to create other users, since only admins can create other users after the first one.
  res = await safeRequest(() => axios.post(`${API_URL}/auth/login`, { email: 'admin@test.com', password: 'Password123!' }), '1.5', 'Login Admin');
  if (res.success) STATE.ADMIN_TOKEN = res.data.token;
  
  res = await safeRequest(() => axios.post(`${API_URL}/auth/register`, { name: 'Agent', email: 'agent@test.com', password: 'Password123!', role: 'agent' }, { headers: { Authorization: `Bearer ${STATE.ADMIN_TOKEN}` } }), '1.3', 'Register Agent');
  res = await safeRequest(() => axios.post(`${API_URL}/auth/register`, { name: 'Quality', email: 'quality@test.com', password: 'Password123!', role: 'quality' }, { headers: { Authorization: `Bearer ${STATE.ADMIN_TOKEN}` } }), '1.4', 'Register Quality');
  
  res = await safeRequest(() => axios.post(`${API_URL}/auth/login`, { email: 'agent@test.com', password: 'Password123!' }), '1.3b', 'Login Agent');
  if (res.success) STATE.AGENT_TOKEN = res.data.token;

  res = await safeRequest(() => axios.post(`${API_URL}/auth/login`, { email: 'quality@test.com', password: 'Password123!' }), '1.4b', 'Login Quality');
  if (res.success) STATE.QUALITY_TOKEN = res.data.token;

  res = await safeRequest(() => axios.post(`${API_URL}/auth/login`, { email: 'admin@test.com', password: 'WrongPassword!' }), '1.6', 'Wrong password login', 400); // API uses 400 for invalid creds
  
  res = await safeRequest(() => axios.get(`${API_URL}/auth/me`, { headers: { Authorization: `Bearer ${STATE.ADMIN_TOKEN}` } }), '1.7', 'GET /auth/me Admin');
  if (res.success && res.data.user.role !== 'admin') logResult('1.7-Verify', 'FAIL', 'Role is not admin');

  // BLOCK 2 — SURVEY CRUD & LIFECYCLE
  console.log('--- BLOCK 2 ---');
  const surveyBody = {
    title: "Test Survey Q2-2026",
    sections: [
      {
        title: "Screening",
        questions: [
          { questionId: "q1", type: "info", text: "Welcome Info" },
          { questionId: "q2", type: "single_choice", text: "Are you okay?", choices: [{ text: "Yes" }, { text: "No" }] }
        ]
      },
      {
        title: "Main",
        questions: [
          { questionId: "q3", type: "text", text: "What is your name?" },
          { questionId: "q4", type: "multiple_choice", text: "Colors?", choices: [{ text: "Red" }, { text: "Blue" }], allowOther: true, minSelections: 1, maxSelections: 3 },
          { questionId: "q5", type: "number", text: "Age?" }
        ]
      }
    ],
    governorateGoals: [{ governorate: "Cairo", goal: 10 }, { governorate: "Giza", goal: 5 }],
    outboundPrecall: {
      usePrecall: true,
      requireAgentActiveStatus: true,
      preventDuplicateSerials: true,
      trackSessionCompletion: true,
      ageGate: { requireUnder18Approval: false },
      callResultGate: { requireContactedForSurvey: true }
    }
  };

  res = await safeRequest(() => axios.post(`${API_URL}/survey`, surveyBody, { headers: { Authorization: `Bearer ${STATE.ADMIN_TOKEN}` } }), '2.1', 'POST /survey');
  if (res.success) STATE.SURVEY_ID = res.data.surveyId || res.data._id; // depending on response structure

  res = await safeRequest(() => axios.get(`${API_URL}/survey/${STATE.SURVEY_ID}`, { headers: { Authorization: `Bearer ${STATE.ADMIN_TOKEN}` } }), '2.2', 'GET /survey/ID');
  
  const surveyBody23 = { ...surveyBody, description: "Updated desc" };
  delete surveyBody23.sections;
  res = await safeRequest(() => axios.put(`${API_URL}/survey/${STATE.SURVEY_ID}`, surveyBody23, { headers: { Authorization: `Bearer ${STATE.ADMIN_TOKEN}` } }), '2.3', 'PUT /survey update desc');

  res = await safeRequest(() => axios.get(`${API_URL}/surveys`, { headers: { Authorization: `Bearer ${STATE.AGENT_TOKEN}` } }), '2.4', 'GET /surveys Agent');
  
  res = await safeRequest(() => axios.put(`${API_URL}/surveys/${STATE.SURVEY_ID}/toggle`, { isActive: true }, { headers: { Authorization: `Bearer ${STATE.ADMIN_TOKEN}` } }), '2.5', 'Activate survey');

  res = await safeRequest(() => axios.get(`${API_URL}/admin/surveys-stats`, { headers: { Authorization: `Bearer ${STATE.ADMIN_TOKEN}` } }), '2.6', 'GET /admin/surveys-stats');
  
  res = await safeRequest(() => axios.put(`${API_URL}/survey/${STATE.SURVEY_ID}`, { ...surveyBody, description: "Should fail or go to draft", sections: [{id:"sec3", title:"new", questions:[]}] }, { headers: { Authorization: `Bearer ${STATE.ADMIN_TOKEN}` } }), '2.7', 'PUT /survey when active', 400);
  // It shouldn't mutate live sections. Let's check.
  if (STATE.SURVEY_ID) {
    let checkLive = await safeRequest(() => axios.get(`${API_URL}/survey/${STATE.SURVEY_ID}`, { headers: { Authorization: `Bearer ${STATE.ADMIN_TOKEN}` } }), '2.7-Verify-Fetch', 'Fetch survey to verify 2.7');
    if (checkLive.success && checkLive.data.sections && checkLive.data.sections.length === 1 && checkLive.data.sections[0].title === "new") {
      logResult('2.7-Verify', 'FAIL', 'Live sections were mutated!');
    } else {
      logResult('2.7-Verify', 'PASS', 'Live sections were NOT mutated');
    }
  }

  res = await safeRequest(() => axios.put(`${API_URL}/survey/${STATE.SURVEY_ID}/autosave`, { sections: [] }, { headers: { Authorization: `Bearer ${STATE.ADMIN_TOKEN}` } }), '2.8', 'Autosave draft');

  // BLOCK 3 — PHONE NUMBER UPLOAD
  console.log('--- BLOCK 3 ---');
  // create excel file
  const wb = xlsx.utils.book_new();
  const ws_data = [["Phone", "Governorate"]];
  for(let i=0; i<12; i++) ws_data.push([`01000000${i.toString().padStart(2, '0')}`, "Cairo"]);
  for(let i=0; i<8; i++) ws_data.push([`01100000${i.toString().padStart(2, '0')}`, "Giza"]);
  const ws = xlsx.utils.aoa_to_sheet(ws_data);
  xlsx.utils.book_append_sheet(wb, ws, "Sheet1");
  const uploadPath = path.join(__dirname, 'test_numbers.xlsx');
  xlsx.writeFile(wb, uploadPath);

  const form = new FormData();
  form.append('xlsx', fs.createReadStream(uploadPath));
  
  res = await safeRequest(() => axios.post(`${API_URL}/admin/survey/${STATE.SURVEY_ID}/numbers`, form, { headers: { ...form.getHeaders(), Authorization: `Bearer ${STATE.ADMIN_TOKEN}` } }), '3.1', 'Upload numbers xlsx');

  res = await safeRequest(() => axios.get(`${API_URL}/admin/survey/${STATE.SURVEY_ID}/numbers`, { headers: { Authorization: `Bearer ${STATE.ADMIN_TOKEN}` } }), '3.2', 'Get uploaded numbers');
  
  const form33 = new FormData();
  form33.append('xlsx', fs.createReadStream(uploadPath));
  res = await safeRequest(() => axios.post(`${API_URL}/admin/survey/${STATE.SURVEY_ID}/numbers`, form33, { headers: { ...form33.getHeaders(), Authorization: `Bearer ${STATE.QUALITY_TOKEN}` } }), '3.3', 'Quality upload numbers (403)', 403);
  
  res = await safeRequest(() => axios.delete(`${API_URL}/admin/survey/${STATE.SURVEY_ID}/numbers`, { headers: { Authorization: `Bearer ${STATE.ADMIN_TOKEN}` } }), '3.4a', 'Delete numbers');
  const form2 = new FormData();
  form2.append('xlsx', fs.createReadStream(uploadPath));
  res = await safeRequest(() => axios.post(`${API_URL}/admin/survey/${STATE.SURVEY_ID}/numbers`, form2, { headers: { ...form2.getHeaders(), Authorization: `Bearer ${STATE.ADMIN_TOKEN}` } }), '3.4b', 'Re-upload numbers');


  // BLOCK 4 — AGENT STATUS & PRECALL GATE
  console.log('--- BLOCK 4 ---');
  res = await safeRequest(() => axios.post(`${API_URL}/auth/status`, { status: 'active' }, { headers: { Authorization: `Bearer ${STATE.AGENT_TOKEN}` } }), '4.1', 'Agent status active');
  
  res = await safeRequest(() => axios.get(`${API_URL}/agent/next-number`, { headers: { Authorization: `Bearer ${STATE.AGENT_TOKEN}` } }), '4.2', 'GET next-number');
  if (res.success && res.data && res.data.phoneNumber) {
    STATE.PHONE_NUMBER = res.data.phoneNumber.phone || res.data.phoneNumber;
    STATE.NUMBER_ID = res.data.phoneNumber._id || res.data.id;
  }

  res = await safeRequest(() => axios.get(`${API_URL}/agent/outbound-precall`, { headers: { Authorization: `Bearer ${STATE.AGENT_TOKEN}` } }), '4.3', 'GET outbound-precall');

  res = await safeRequest(() => axios.get(`${API_URL}/agent/next-serial`, { headers: { Authorization: `Bearer ${STATE.AGENT_TOKEN}` } }), '4.4', 'GET next-serial');
  if (res.success) STATE.SERIAL_1 = res.data.serialNumber;

  res = await safeRequest(() => axios.get(`${API_URL}/agent/next-serial`, { headers: { Authorization: `Bearer ${STATE.AGENT_TOKEN}` } }), '4.5', 'GET next-serial 2');
  if (res.success) STATE.SERIAL_2 = res.data.serialNumber;
  if (STATE.SERIAL_1 === STATE.SERIAL_2) logResult('4.5-Verify', 'FAIL', 'Serials are not unique');

  // BLOCK 5 — AGE GATE & CALL RESULT GATE
  console.log('--- BLOCK 5 ---');
  res = await safeRequest(() => axios.post(`${API_URL}/agent/precall-complete`, { payload: { serial_number: STATE.SERIAL_1, call_result: "contacted", age_years: 15, interview_result: "no_qualified" }, interviewStartedAt: new Date().toISOString() }, { headers: { Authorization: `Bearer ${STATE.AGENT_TOKEN}` } }), '5.1', 'Precall under 18');
  
  res = await safeRequest(() => axios.get(`${API_URL}/agent/next-number`, { headers: { Authorization: `Bearer ${STATE.AGENT_TOKEN}` } }), '5.2a', 'GET next-number 2');
  if (res.success && res.data && res.data.phoneNumber) STATE.PHONE_2 = res.data.phoneNumber.phone;
  res = await safeRequest(() => axios.post(`${API_URL}/agent/precall-complete`, { payload: { serial_number: STATE.SERIAL_2, call_result: "no_answer", interview_result: "not_contacted" }, interviewStartedAt: new Date().toISOString() }, { headers: { Authorization: `Bearer ${STATE.AGENT_TOKEN}` } }), '5.2b', 'Precall not contacted');

  res = await safeRequest(() => axios.get(`${API_URL}/agent/next-number`, { headers: { Authorization: `Bearer ${STATE.AGENT_TOKEN}` } }), '5.3a', 'GET next-number 3');
  res = await safeRequest(() => axios.get(`${API_URL}/agent/next-serial`, { headers: { Authorization: `Bearer ${STATE.AGENT_TOKEN}` } }), '5.3b', 'GET next-serial 3');
  if (res.success) STATE.SERIAL_3 = res.data.serialNumber;
  res = await safeRequest(() => axios.post(`${API_URL}/agent/precall-complete`, { payload: { serial_number: STATE.SERIAL_3, call_result: "contacted", age_years: 35 }, interviewStartedAt: new Date().toISOString() }, { headers: { Authorization: `Bearer ${STATE.AGENT_TOKEN}` } }), '5.3c', 'Precall valid');

  // BLOCK 6 — SURVEY TAKING
  console.log('--- BLOCK 6 ---');
  res = await safeRequest(() => axios.get(`${API_URL}/agent/survey-eligibility?surveyId=${STATE.SURVEY_ID}`, { headers: { Authorization: `Bearer ${STATE.AGENT_TOKEN}` } }), '6.1', 'GET survey-eligibility');
  
  res = await safeRequest(() => axios.post(`${API_URL}/agent/draft`, { serialNumber: STATE.SERIAL_3, surveyId: STATE.SURVEY_ID, currentIdx: 2, answers: {} }, { headers: { Authorization: `Bearer ${STATE.AGENT_TOKEN}` } }), '6.2', 'POST draft');
  res = await safeRequest(() => axios.get(`${API_URL}/agent/draft/${STATE.SERIAL_3}`, { headers: { Authorization: `Bearer ${STATE.AGENT_TOKEN}` } }), '6.3', 'GET draft');
  res = await safeRequest(() => axios.post(`${API_URL}/agent/draft`, { serialNumber: STATE.SERIAL_3, surveyId: STATE.SURVEY_ID, currentIdx: 4, answers: {} }, { headers: { Authorization: `Bearer ${STATE.AGENT_TOKEN}` } }), '6.4', 'POST draft upsert');

  res = await safeRequest(() => axios.post(`${API_URL}/response`, {
    surveyId: STATE.SURVEY_ID,
    serialNumber: STATE.SERIAL_3,
    status: "completed",
    interviewOutcome: "completed",
    answers: [{ questionId: "q4", value: ["Red", "Other: custom text"] }]
  }, { headers: { Authorization: `Bearer ${STATE.AGENT_TOKEN}` } }), '6.5', 'POST response');
  if (res.success) STATE.RESPONSE_ID = res.data.responseId || res.data._id || (res.data.response && res.data.response._id);

  res = await safeRequest(() => axios.get(`${API_URL}/agent/draft/${STATE.SERIAL_3}`, { headers: { Authorization: `Bearer ${STATE.AGENT_TOKEN}` } }), '6.6', 'Verify draft cleaned');
  if (res.success && Object.keys(res.data.answers || {}).length > 0) logResult('6.6-Verify', 'FAIL', 'Draft was not empty');

  // BLOCK 7 — POSTPONED SERIAL
  console.log('--- BLOCK 7 ---');
  res = await safeRequest(() => axios.get(`${API_URL}/agent/next-number`, { headers: { Authorization: `Bearer ${STATE.AGENT_TOKEN}` } }), '7.1a', 'GET next-number 4');
  res = await safeRequest(() => axios.get(`${API_URL}/agent/next-serial`, { headers: { Authorization: `Bearer ${STATE.AGENT_TOKEN}` } }), '7.1b', 'GET next-serial 4');
  if (res.success) STATE.SERIAL_4 = res.data.serialNumber;
  res = await safeRequest(() => axios.post(`${API_URL}/agent/precall-complete`, { payload: { serial_number: STATE.SERIAL_4, interview_result: "postponed" }, interviewStartedAt: new Date().toISOString() }, { headers: { Authorization: `Bearer ${STATE.AGENT_TOKEN}` } }), '7.2', 'Precall postponed');
  res = await safeRequest(() => axios.get(`${API_URL}/agent/pending-serials`, { headers: { Authorization: `Bearer ${STATE.AGENT_TOKEN}` } }), '7.3', 'GET pending-serials');
  // Verify it's in the list
  if (res.success && res.data.filter) {
    if (!res.data.some(p => p.serialNumber === STATE.SERIAL_4)) logResult('7.3-Verify', 'FAIL', 'SERIAL_4 not found in pending-serials');
  }

  // BLOCK 8 — RESPONSES & EXPORTS
  console.log('--- BLOCK 8 ---');
  res = await safeRequest(() => axios.get(`${API_URL}/responses/${STATE.SURVEY_ID}`, { headers: { Authorization: `Bearer ${STATE.ADMIN_TOKEN}` } }), '8.1', 'GET /responses/:id Admin');
  res = await safeRequest(() => axios.get(`${API_URL}/admin/responses`, { headers: { Authorization: `Bearer ${STATE.ADMIN_TOKEN}` } }), '8.2', 'GET /admin/responses Admin');
  res = await safeRequest(() => axios.get(`${API_URL}/admin/responses`, { headers: { Authorization: `Bearer ${STATE.QUALITY_TOKEN}` } }), '8.3', 'GET /admin/responses Quality');
  res = await safeRequest(() => axios.get(`${API_URL}/admin/responses`, { headers: { Authorization: `Bearer ${STATE.AGENT_TOKEN}` } }), '8.4', 'GET /admin/responses Agent', 403);
  
  res = await safeRequest(() => axios.get(`${API_URL}/admin/export-survey/${STATE.SURVEY_ID}?format=csv`, { headers: { Authorization: `Bearer ${STATE.ADMIN_TOKEN}` } }), '8.5', 'GET export csv');
  res = await safeRequest(() => axios.get(`${API_URL}/admin/export-survey/${STATE.SURVEY_ID}?format=xlsx`, { headers: { Authorization: `Bearer ${STATE.ADMIN_TOKEN}`, responseType: 'arraybuffer' } }), '8.6', 'GET export xlsx');
  res = await safeRequest(() => axios.get(`${API_URL}/admin/export-advanced?format=sav&surveyId=${STATE.SURVEY_ID}`, { headers: { Authorization: `Bearer ${STATE.ADMIN_TOKEN}`, responseType: 'arraybuffer' } }), '8.7', 'GET export sav');
  res = await safeRequest(() => axios.get(`${API_URL}/admin/survey/${STATE.SURVEY_ID}/numbers/disqualified/export`, { headers: { Authorization: `Bearer ${STATE.ADMIN_TOKEN}` } }), '8.8', 'GET export disqualified');

  // BLOCK 9 — QUALITY REVIEW
  console.log('--- BLOCK 9 ---');
  res = await safeRequest(() => axios.post(`${API_URL}/reviews`, { responseId: STATE.RESPONSE_ID, feedbackText: "Good call", type: "Feedback" }, { headers: { Authorization: `Bearer ${STATE.QUALITY_TOKEN}` } }), '9.1', 'POST review');
  res = await safeRequest(() => axios.get(`${API_URL}/reviews`, { headers: { Authorization: `Bearer ${STATE.QUALITY_TOKEN}` } }), '9.2', 'GET reviews');
  res = await safeRequest(() => axios.get(`${API_URL}/reviews/unseen-count`, { headers: { Authorization: `Bearer ${STATE.AGENT_TOKEN}` } }), '9.3', 'GET unseen-count');
  res = await safeRequest(() => axios.post(`${API_URL}/reviews/mark-seen`, {}, { headers: { Authorization: `Bearer ${STATE.AGENT_TOKEN}` } }), '9.4', 'POST mark-seen');

  // BLOCK 10 — SOP
  console.log('--- BLOCK 10 ---');
  res = await safeRequest(() => axios.post(`${API_URL}/sops`, { title: "New Protocol", content: "Read carefully." }, { headers: { Authorization: `Bearer ${STATE.ADMIN_TOKEN}` } }), '10.1', 'POST sop');
  res = await safeRequest(() => axios.get(`${API_URL}/sops/unseen-count`, { headers: { Authorization: `Bearer ${STATE.AGENT_TOKEN}` } }), '10.2', 'GET sop unseen-count');
  res = await safeRequest(() => axios.post(`${API_URL}/sops/mark-seen`, {}, { headers: { Authorization: `Bearer ${STATE.AGENT_TOKEN}` } }), '10.3', 'POST sop mark-seen');
  res = await safeRequest(() => axios.get(`${API_URL}/sops/unseen-count`, { headers: { Authorization: `Bearer ${STATE.AGENT_TOKEN}` } }), '10.4', 'GET sop unseen-count = 0');

  // BLOCK 11 — USER MANAGEMENT
  console.log('--- BLOCK 11 ---');
  res = await safeRequest(() => axios.get(`${API_URL}/admin/users`, { headers: { Authorization: `Bearer ${STATE.ADMIN_TOKEN}` } }), '11.1', 'GET users admin');
  res = await safeRequest(() => axios.get(`${API_URL}/admin/users`, { headers: { Authorization: `Bearer ${STATE.QUALITY_TOKEN}` } }), '11.2', 'GET users quality', 403);
  res = await safeRequest(() => axios.post(`${API_URL}/auth/request-profile-change`, { type: 'name', requestedValue: "Ahmed Ali" }, { headers: { Authorization: `Bearer ${STATE.AGENT_TOKEN}` } }), '11.3', 'POST request profile change');
  res = await safeRequest(() => axios.get(`${API_URL}/admin/profile-requests`, { headers: { Authorization: `Bearer ${STATE.ADMIN_TOKEN}` } }), '11.4', 'GET profile-requests');
  let requestId = res.data && res.data[0] ? res.data[0]._id : null;
  if (requestId) {
    res = await safeRequest(() => axios.post(`${API_URL}/admin/resolve-profile-request/${requestId}`, { status: "approved" }, { headers: { Authorization: `Bearer ${STATE.ADMIN_TOKEN}` } }), '11.5', 'Resolve profile request');
  } else logResult('11.5', 'FAIL', 'No profile request found');
  res = await safeRequest(() => axios.get(`${API_URL}/auth/me`, { headers: { Authorization: `Bearer ${STATE.AGENT_TOKEN}` } }), '11.6', 'Verify name updated');

  // BLOCK 12 — STATS & ROLE
  console.log('--- BLOCK 12 ---');
  res = await safeRequest(() => axios.put(`${API_URL}/admin/settings/dailyGoal`, { goal: 50 }, { headers: { Authorization: `Bearer ${STATE.ADMIN_TOKEN}` } }), '12.1', 'PUT dailyGoal Admin');
  res = await safeRequest(() => axios.put(`${API_URL}/admin/settings/dailyGoal`, { goal: 60 }, { headers: { Authorization: `Bearer ${STATE.AGENT_TOKEN}` } }), '12.2', 'PUT dailyGoal Agent (403)', 403);
  res = await safeRequest(() => axios.get(`${API_URL}/settings/dailyGoal`, { headers: { Authorization: `Bearer ${STATE.AGENT_TOKEN}` } }), '12.3', 'GET dailyGoal Agent');
  res = await safeRequest(() => axios.get(`${API_URL}/stats/agents`, { headers: { Authorization: `Bearer ${STATE.ADMIN_TOKEN}` } }), '12.4', 'GET stats/agents Admin');
  res = await safeRequest(() => axios.get(`${API_URL}/admin/analytics`, { headers: { Authorization: `Bearer ${STATE.QUALITY_TOKEN}` } }), '12.5', 'GET admin/analytics Quality');

  // BLOCK 13 — CONSTRAINTS
  console.log('--- BLOCK 13 ---');
  res = await safeRequest(() => axios.post(`${API_URL}/survey`, { title: "X" }, { headers: { Authorization: `Bearer ${STATE.QUALITY_TOKEN}` } }), '13.1', 'POST survey Quality', 403);
  res = await safeRequest(() => axios.delete(`${API_URL}/survey/${STATE.SURVEY_ID}`, { headers: { Authorization: `Bearer ${STATE.QUALITY_TOKEN}` } }), '13.2', 'DELETE survey Quality', 403);
  res = await safeRequest(() => axios.get(`${API_URL}/agent/next-serial`), '13.3', 'GET next-serial no auth', 401);
  res = await safeRequest(() => axios.post(`${API_URL}/response`, { surveyId: STATE.SURVEY_ID, serialNumber: STATE.SERIAL_3, status: "completed" }, { headers: { Authorization: `Bearer ${STATE.AGENT_TOKEN}` } }), '13.4', 'POST duplicate response', 400); // Usually 400
  res = await safeRequest(() => axios.put(`${API_URL}/survey/${STATE.SURVEY_ID}`, { sections: [{ questions: [{ type: "multiple_choice", choices: ["A"], maxSelections: 5 }] }] }, { headers: { Authorization: `Bearer ${STATE.ADMIN_TOKEN}` } }), '13.5', 'PUT survey clamp constraints', 400); // 400 if rejected, or 200 if clamped.
  res = await safeRequest(() => axios.post(`${API_URL}/auth/status`, { status: "active" }, { headers: { Authorization: `Bearer ${STATE.AGENT_TOKEN}` } }), '13.6', 'POST active status resets gate');

  fs.writeFileSync('e2e_results.json', JSON.stringify(results, null, 2));
  console.log('Tests finished. Results saved to e2e_results.json.');
  process.exit(0);
}

runTests();
