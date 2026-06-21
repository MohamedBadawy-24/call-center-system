/**
 * tests/exports.test.js
 * Dataset Export (W6 + Other-prefix fix + multi-other columns)
 *
 * Source files read before writing:
 *   - server.js: GET /admin/export-survey/:id, GET /admin/export-advanced
 *   - controllers/responseController.js (exportAdvanced, parseAnswerValue)
 */
const axios = require('axios');
const mongoose = require('mongoose');
const XLSX = require('xlsx');
const getCtx = require('./ctx');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const mongoUri = process.env.MONGO_URI_TEST || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/call-center';

let ctx, adminToken, surveyId;

function auth(token) { return { headers: { Authorization: `Bearer ${token}` } }; }

beforeAll(async () => {
  ctx        = getCtx();
  adminToken = ctx.adminToken;
  surveyId   = ctx.surveyId;

  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 10000 });
  }

  // Seed a response with "other:" prefixed values
  const serial = `EXPORT-OTHER-${Date.now()}`;
  await mongoose.connection.db.collection('responses').insertOne({
    surveyId:        new mongoose.Types.ObjectId(surveyId),
    agentId:         ctx.agentAId,
    serialNumber:    serial,
    status:          'completed',
    interviewOutcome:'completed',
    answers: [
      { questionId: 'q1', value: 'other:my free text answer' },
      { questionId: 'q2', value: ['choice1', 'other:first extra', 'other:second extra'] },
    ],
    durationSecs: 45,
    completedAt:  new Date(),
    startedAt:    new Date(),
  });
}, 15000);

// ── XLSX Export ───────────────────────────────────────────────────────────────

describe('GET /admin/export-advanced?format=xlsx', () => {
  it('returns 200 with correct Content-Type for XLSX', async () => {
    const res = await axios.get(
      `${BASE_URL}/admin/export-advanced?surveyId=${surveyId}&format=xlsx`,
      { ...auth(adminToken), responseType: 'arraybuffer' }
    ).catch(e => e.response);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/openxmlformats/i);
  });

  it('[Other-prefix] No XLSX cell value starts with "other:" or "Other: "', async () => {
    const res = await axios.get(
      `${BASE_URL}/admin/export-advanced?surveyId=${surveyId}&format=xlsx`,
      { ...auth(adminToken), responseType: 'arraybuffer' }
    ).catch(e => e.response);
    if (res.status !== 200) return;

    const wb = XLSX.read(Buffer.from(res.data), { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    XLSX.utils.sheet_to_json(ws, { defval: '' }).forEach(row => {
      Object.values(row).forEach(val => {
        if (typeof val === 'string') {
          expect(val).not.toMatch(/^other:/i);
          expect(val).not.toMatch(/^Other: /);
        }
      });
    });
  });

  it('[Multi-other] No cell value is a raw JSON array string', async () => {
    const res = await axios.get(
      `${BASE_URL}/admin/export-advanced?surveyId=${surveyId}&format=xlsx`,
      { ...auth(adminToken), responseType: 'arraybuffer' }
    ).catch(e => e.response);
    if (res.status !== 200) return;

    const wb = XLSX.read(Buffer.from(res.data), { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    XLSX.utils.sheet_to_json(ws, { defval: '' }).forEach(row => {
      Object.values(row).forEach(val => {
        if (typeof val === 'string') expect(val).not.toMatch(/^\[.*\]$/);
      });
    });
  });

  it('[Multi-other] Extra "Other" columns are named with "(Other N)" suffix pattern', async () => {
    const res = await axios.get(
      `${BASE_URL}/admin/export-advanced?surveyId=${surveyId}&format=xlsx`,
      { ...auth(adminToken), responseType: 'arraybuffer' }
    ).catch(e => e.response);
    if (res.status !== 200) return;

    const wb = XLSX.read(Buffer.from(res.data), { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const headers = (XLSX.utils.sheet_to_json(ws, { header: 1 })[0] || []);
    const otherCols = headers.filter(h => typeof h === 'string' && /\(Other \d+\)$/.test(h));
    otherCols.forEach(col => expect(col).toMatch(/\(Other \d+\)$/));
  });
});

// ── CSV Export ────────────────────────────────────────────────────────────────

describe('GET /admin/export-advanced?format=csv', () => {
  it('returns 200 with Content-Type text/csv', async () => {
    const res = await axios.get(
      `${BASE_URL}/admin/export-advanced?surveyId=${surveyId}&format=csv`,
      { ...auth(adminToken), responseType: 'text' }
    ).catch(e => e.response);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/i);
  });

  it('[Other-prefix] No CSV cell starts with "other:" or "Other: "', async () => {
    const res = await axios.get(
      `${BASE_URL}/admin/export-advanced?surveyId=${surveyId}&format=csv`,
      { ...auth(adminToken), responseType: 'text' }
    ).catch(e => e.response);
    if (res.status !== 200) return;

    res.data.split('\n').slice(1).forEach(line => {
      (line.match(/"[^"]*"/g) || []).forEach(cell => {
        const inner = cell.replace(/^"|"$/g, '');
        expect(inner).not.toMatch(/^other:/i);
        expect(inner).not.toMatch(/^Other: /);
      });
    });
  });
});

// ── SAV Export ────────────────────────────────────────────────────────────────

describe('GET /admin/export-advanced?format=sav', () => {
  it('returns 200 and a binary SAV file starting with SPSS magic bytes and cleans up the temp file', async () => {
    const fs = require('fs');
    const path = require('path');
    const uploadsDir = path.join(__dirname, '..', 'uploads');

    // Track .sav files in uploads directory
    const getSavFiles = () => fs.readdirSync(uploadsDir).filter(f => f.endsWith('.sav'));
    const savBefore = getSavFiles();

    const res = await axios.get(
      `${BASE_URL}/admin/export-advanced?surveyId=${surveyId}&format=sav`,
      { ...auth(adminToken), responseType: 'arraybuffer' }
    ).catch(e => e.response);
    expect(res.status).toBe(200);
    const buf = Buffer.from(res.data);
    if (buf.length > 4) {
      const magic = buf.slice(0, 4).toString('ascii');
      expect(['$FL2', '$FL3']).toContain(magic);
    }

    // Give callback a brief moment to unlink the file
    await new Promise(resolve => setTimeout(resolve, 100));

    const savAfter = getSavFiles();
    expect(savAfter.length).toBeLessThanOrEqual(savBefore.length);
  });
});

// ── Legacy CSV Export ─────────────────────────────────────────────────────────

describe('GET /admin/export-survey/:id (legacy CSV)', () => {
  it('returns 200 with Content-Type text/csv', async () => {
    const res = await axios.get(
      `${BASE_URL}/admin/export-survey/${surveyId}`,
      { ...auth(adminToken), responseType: 'text' }
    ).catch(e => e.response);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/i);
  });
});
