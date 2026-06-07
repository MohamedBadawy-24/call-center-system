/**
 * tests/bulk-upload.test.js
 * Bulk Phone Number Upload (W5 + B7)
 *
 * Source files read before writing:
 *   - server.js: POST /admin/survey/:id/numbers (multer + adminAuth)
 *   - models/PhoneNumber.js, models/Counter.js
 *
 * B7 regression: Upload must work as a standalone multipart/form-data POST.
 */
const axios = require('axios');
const mongoose = require('mongoose');
const FormData = require('form-data');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const getCtx = require('./ctx');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const MONGO_URI = 'mongodb://127.0.0.1:27017/call-center';

let ctx, adminToken, surveyId;

function auth(token) { return { Authorization: `Bearer ${token}` }; }

function makeTmpXlsx(numbers) {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(numbers.map(n => ({ phone: n, governorate: 'Cairo' })));
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  const tmpPath = path.join(__dirname, `__tmp_numbers_${Date.now()}.xlsx`);
  XLSX.writeFile(wb, tmpPath);
  return tmpPath;
}

// Dedicated prefix so these numbers can be cleaned up independently
const UPLOAD_PREFIX = '0199';
const testNumbers5 = Array.from({ length: 5 }, (_, i) =>
  `${UPLOAD_PREFIX}${String(i + 1).padStart(7, '0')}`
);
const mixedNumbers = [
  `${UPLOAD_PREFIX}9990001`,
  `${UPLOAD_PREFIX}9990002`,
  '12',          // invalid: too short
  'notanumber',  // invalid: letters
];

beforeAll(async () => {
  ctx        = getCtx();
  adminToken = ctx.adminToken;
  surveyId   = ctx.surveyId;

  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 10000 });
  }

  // Remove any stale invalid-number docs from previous test runs before we assert
  await mongoose.connection.db.collection('phonenumbers')
    .deleteMany({ number: { $in: ['12', 'notanumber'] } }).catch(() => {});

  // Survey must be inactive to allow number operations
  await axios.put(
    `${BASE_URL}/surveys/${surveyId}/toggle`,
    { isActive: false },
    { headers: auth(adminToken) }
  ).catch(() => {});
}, 15000);

afterAll(async () => {
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.db.collection('phonenumbers')
      .deleteMany({ number: new RegExp(`^${UPLOAD_PREFIX}`) }).catch(() => {});
  }
});

describe('POST /admin/survey/:id/numbers — bulk upload (B7)', () => {
  let xlsxPath5;

  beforeAll(() => { xlsxPath5 = makeTmpXlsx(testNumbers5); });
  afterAll(() => { if (fs.existsSync(xlsxPath5)) fs.unlinkSync(xlsxPath5); });

  it('[B7] Upload endpoint accepts standalone multipart/form-data POST → 200', async () => {
    const form = new FormData();
    form.append('xlsx', fs.createReadStream(xlsxPath5), 'numbers.xlsx');

    const res = await axios.post(
      `${BASE_URL}/admin/survey/${surveyId}/numbers`,
      form,
      { headers: { ...auth(adminToken), ...form.getHeaders() } }
    ).catch(e => e.response);

    expect(res.status).toBe(200);
  });

  it('5 PhoneNumber documents are inserted in DB', async () => {
    const docs = await mongoose.connection.db.collection('phonenumbers')
      .find({ surveyId: new mongoose.Types.ObjectId(surveyId), number: new RegExp(`^${UPLOAD_PREFIX}`) })
      .toArray();
    expect(docs.length).toBeGreaterThanOrEqual(5);
  });

  it('Counter collection reflects the new max sequence', async () => {
    const counter = await mongoose.connection.db.collection('counters')
      .findOne({ id: 'survey_numbers' });
    expect(counter).toBeTruthy();
    expect(counter.seq).toBeGreaterThanOrEqual(5);
  });

  it('Inserted numbers have consecutive serialNumber values', async () => {
    const docs = await mongoose.connection.db.collection('phonenumbers')
      .find({ number: new RegExp(`^${UPLOAD_PREFIX}`) })
      .sort({ serialNumber: 1 }).toArray();
    const serials = docs.map(d => parseInt(d.serialNumber, 10)).filter(n => !isNaN(n));
    for (let i = 1; i < serials.length; i++) {
      expect(serials[i] - serials[i - 1]).toBe(1);
    }
  });

  it('Re-uploading the same file does not create duplicate documents', async () => {
    const countBefore = await mongoose.connection.db.collection('phonenumbers')
      .countDocuments({ number: new RegExp(`^${UPLOAD_PREFIX}`) });

    const form = new FormData();
    form.append('xlsx', fs.createReadStream(xlsxPath5), 'numbers.xlsx');
    await axios.post(
      `${BASE_URL}/admin/survey/${surveyId}/numbers`,
      form,
      { headers: { ...auth(adminToken), ...form.getHeaders() } }
    ).catch(() => {});

    const countAfter = await mongoose.connection.db.collection('phonenumbers')
      .countDocuments({ number: new RegExp(`^${UPLOAD_PREFIX}`) });
    expect(countAfter).toBe(countBefore);
  });

  it('Mixed file: valid rows inserted, invalid rows skipped', async () => {
    const mixedPath = makeTmpXlsx(mixedNumbers);
    try {
      const form = new FormData();
      form.append('xlsx', fs.createReadStream(mixedPath), 'mixed.xlsx');
      const res = await axios.post(
        `${BASE_URL}/admin/survey/${surveyId}/numbers`,
        form,
        { headers: { ...auth(adminToken), ...form.getHeaders() } }
      ).catch(e => e.response);

      expect(res.status).toBeLessThan(500);

      const invalidDocs = await mongoose.connection.db.collection('phonenumbers')
        .countDocuments({ number: { $in: ['12', 'notanumber'] } });
      expect(invalidDocs).toBe(0);
    } finally {
      if (fs.existsSync(mixedPath)) fs.unlinkSync(mixedPath);
    }
  });
});
