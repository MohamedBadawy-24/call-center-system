const env = require("./config/env");
const logger = require("./utils/logger");
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");

const helmet = require("helmet");
const connectDB = require("./config/db");
const Survey = require("./models/Survey");
const Response = require("./models/Response");
const User = require("./models/User");
const StatusLog = require("./models/StatusLog");
const PrecallCompletion = require("./models/PrecallCompletion");
const PostponedSerial = require("./models/PostponedSerial");
const Review = require("./models/Review");
const SopUpdate = require("./models/SopUpdate");
const Counter = require("./models/Counter");
const Draft = require("./models/Draft");

const mongoose = require("mongoose");

const SystemSettingSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: { type: mongoose.Schema.Types.Mixed, required: true }
});
const SystemSetting = mongoose.model('SystemSetting', SystemSettingSchema);

const { auth, adminAuth, staffAuth } = require("./middleware/auth");
const { runTransaction } = require("./utils/runTransaction");
const sendEmail = require("./utils/mailer");
const {
  validateResponseSubmit,
  validateSurveyId,
} = require("./middleware/validation");
const PhoneNumber = require("./models/PhoneNumber");
const xlsx = require("xlsx");
const multer = require("multer");
const fs = require('fs');
const authRoutes = require("./routes/auth");
const adminRoutes = require("./routes/admin");
const agentRoutes = require("./routes/agent");
const errorHandler = require("./middleware/errorHandler");

const upload = multer({ dest: 'uploads/' });
const { saveToFile, VariableType } = require('sav-writer');
const path = require('path');

const app = express();

// Connect MongoDB
connectDB();

async function getNextSerialNumber(id = 'global') {
  const counter = await Counter.findOneAndUpdate(
    { id },
    { $inc: { seq: 1 } },
    { returnDocument: 'after', upsert: true }
  );
  return String(counter.seq).padStart(7, '0');
}

async function allocateSerialBatch(id = 'global', count = 1, session = null) {
  if (count <= 0) return [];
  const options = { returnDocument: 'after', upsert: true };
  if (session) options.session = session;
  const counter = await Counter.findOneAndUpdate(
    { id },
    { $inc: { seq: count } },
    options
  );
  const startSeq = counter.seq - count + 1;
  const serials = [];
  for (let i = 0; i < count; i++) {
    serials.push(String(startSeq + i).padStart(7, '0'));
  }
  return serials;
}

// Allow multiple precall audit rows per active session (drop legacy unique index if present)
async function dropLegacyPrecallIndex() {
  try {
    await PrecallCompletion.collection.dropIndex("userId_1_statusStartedAt_1");
  } catch (_) {
    /* index missing or already removed */
  }
}
if (mongoose.connection.readyState === 1) dropLegacyPrecallIndex();
else mongoose.connection.once("open", dropLegacyPrecallIndex);

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

const corsOrigins = env.CORS_ORIGIN;
const allowedOrigins = corsOrigins
  ? corsOrigins.split(",").map((o) => o.trim()).filter(Boolean)
  : [];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl)
      if (!origin) {
        return callback(null, true);
      }

      // Allow any configured CORS_ORIGIN
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      // Allow local loopback and local network subnets
      if (
        origin.startsWith("http://192.168.") ||
        origin.startsWith("https://192.168.") ||
        origin.startsWith("http://10.") ||
        origin.startsWith("https://10.") ||
        origin.startsWith("http://172.") ||
        origin.startsWith("https://172.") ||
        origin.startsWith("http://localhost") ||
        origin.startsWith("https://localhost") ||
        origin.startsWith("http://127.0.0.1") ||
        origin.startsWith("https://127.0.0.1")
      ) {
        return callback(null, true);
      }

      callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);
app.use(express.json({ limit: '10mb' }));

// Recursive helper to sanitize NoSQL operator injection keys (starting with $)
function nosqlSanitize(obj) {
  if (obj && typeof obj === "object") {
    for (const key in obj) {
      if (key.startsWith("$")) {
        delete obj[key];
      } else {
        nosqlSanitize(obj[key]);
      }
    }
  }
}

// Register global NoSQL sanitization middleware
app.use((req, _res, next) => {
  if (req.body) nosqlSanitize(req.body);
  if (req.query) nosqlSanitize(req.query);
  if (req.params) nosqlSanitize(req.params);
  next();
});

app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

// Strip /api prefix if present so that all downstream routes match correctly
app.use((req, res, next) => {
  if (req.url.startsWith('/api/')) {
    req.url = req.url.substring(4); // removes '/api'
  }
  next();
});

app.use("/auth", authRoutes);
app.use("/admin", adminRoutes);
app.use("/agent", agentRoutes);

// CREATE SURVEY (Admins only)
app.post("/survey", adminAuth, async (req, res) => {
  try {
    const survey = new Survey(req.body);

    if (survey.sections) {
      for (const section of survey.sections) {
        for (const q of section.questions) {
          if (q.type === 'multiple_choice' && q.maxSelections != null) {
            const limit = (q.choices ? q.choices.length : 0) + (q.allowOther ? 1 : 0);
            if (q.maxSelections > limit) {
              return res.status(400).json({
                error: `maxSelections (${q.maxSelections}) exceeds available choices (${limit}) for question "${q.questionId}"`
              });
            }
          }
        }
      }
    }

    await survey.save();

    if (survey.linkedCampaignId) {
      await Survey.findByIdAndUpdate(survey.linkedCampaignId, { linkedCampaignId: survey._id });
    }

    const io = req.app.get('io');
    if (io) io.emit("stats-update");

    res.json(survey);
  } catch (err) {
    console.error("Survey Creation Error:", err);
    res.status(500).json({ error: "Failed to create survey" });
  }
});

// UPDATE SURVEY (Admins only) - Publishes changes
app.put("/survey/:id", adminAuth, async (req, res) => {
  try {
    const survey = await Survey.findById(req.params.id);
    if (!survey) return res.status(404).json({ error: "Survey not found" });
    
    if (req.body.sections !== undefined) {
      if (survey.isActive === true) {
        return res.status(403).json({
          error: 'This campaign cannot be edited while it is active. Set the campaign to inactive first.'
        });
      }
    }
    
    const oldLinkId = survey.linkedCampaignId;

    // If saving/publishing, we apply the payload and clear the draft
    Object.assign(survey, req.body);
    
    if (survey.sections) {
      for (const section of survey.sections) {
        for (const q of section.questions) {
          if (q.type === 'multiple_choice' && q.maxSelections != null) {
            const limit = (q.choices ? q.choices.length : 0) + (q.allowOther ? 1 : 0);
            if (q.maxSelections > limit) {
              return res.status(400).json({
                error: `maxSelections (${q.maxSelections}) exceeds available choices (${limit}) for question "${q.questionId}"`
              });
            }
          }
        }
      }
    }
    survey.draftData = undefined;
    
    await survey.save();

    const newLinkId = survey.linkedCampaignId;
    if (String(oldLinkId) !== String(newLinkId)) {
      if (oldLinkId) {
        await Survey.findByIdAndUpdate(oldLinkId, { linkedCampaignId: null });
      }
      if (newLinkId) {
        await Survey.findByIdAndUpdate(newLinkId, { linkedCampaignId: survey._id });
      }
    }

    const io = req.app.get('io');
    if (io) io.emit("stats-update");

    res.json(survey);
  } catch (err) {
    logger.error("Error updating survey:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// AUTOSAVE SURVEY DRAFT (Admins only)
app.put("/survey/:id/autosave", adminAuth, async (req, res) => {
  try {
    const survey = await Survey.findById(req.params.id);
    if (!survey) return res.status(404).json({ error: "Survey not found" });
    
    // Autosave stores changes in the draftData field without touching active schema
    survey.draftData = req.body;
    await survey.save();
    
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/surveys", auth, async (req, res) => {
  try {
    let filter = {};
    if (req.user.role === 'agent') {
      filter.isActive = { $ne: false };
      filter.$or = [
        { targetAudience: { $in: ['agent', 'both'] } },
        { targetAudience: { $exists: false } },
        { targetAudience: null }
      ];
    } else if (req.user.role === 'quality') {
      filter.isActive = { $ne: false };
      filter.$or = [
        { targetAudience: { $in: ['quality', 'both'] } },
        { targetAudience: { $exists: false } },
        { targetAudience: null }
      ];
    }
    const surveys = await Survey.find(filter, "title description isActive createdAt");
    res.json(surveys);
  } catch (err) {
    res.status(500).json({ error: "Server Error" });
  }
});

// TOGGLE SURVEY STATUS (Admin Only)
app.put("/surveys/:id/toggle", adminAuth, async (req, res) => {
  try {
    const survey = await Survey.findById(req.params.id);
    if (!survey) return res.status(404).json({ error: "Survey not found" });

    // req.body may be undefined when no body/Content-Type is sent — guard it
    const body = req.body || {};

    // Fallback: If isActive doesn't exist on older documents, assume it was true and is now false
    if (typeof body.isActive === 'boolean') {
      survey.isActive = body.isActive;
    } else {
      if (survey.isActive === undefined) survey.isActive = false;
      else survey.isActive = !survey.isActive;
    }

    await survey.save();

    const io = req.app.get('io');
    if (io) io.emit("stats-update");

    res.json(survey);
  } catch (err) {
    console.error("Toggle survey error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// GET CAMPAIGN COMPARISON (Admin + Quality)
app.get("/admin/compare", staffAuth, async (req, res) => {
  try {
    const { surveyId, searchValue } = req.query;
    if (!surveyId || !searchValue) {
      return res.status(400).json({ error: "Missing surveyId or searchValue" });
    }

    const surveyA = await Survey.findById(surveyId);
    if (!surveyA) return res.status(404).json({ error: "Primary campaign not found" });

    if (!surveyA.linkedCampaignId) {
      return res.status(400).json({ error: "This campaign is not linked to any other campaign" });
    }
    const surveyB = await Survey.findById(surveyA.linkedCampaignId);
    if (!surveyB) return res.status(404).json({ error: "Linked campaign not found" });

    let phoneDocA = await PhoneNumber.findOne({
      surveyId: surveyA._id,
      $or: [{ serialNumber: searchValue }, { number: searchValue }]
    });

    if (!phoneDocA) {
      const directResponse = await Response.findOne({ surveyId: surveyA._id, serialNumber: searchValue });
      if (directResponse) {
        phoneDocA = { serialNumber: searchValue, number: "" };
      } else {
        return res.status(404).json({ error: "No matching record found in primary campaign" });
      }
    }

    const serialA = phoneDocA.serialNumber;
    const phoneNum = phoneDocA.number;

    let serialB = null;
    const matchField = surveyA.comparisonMatchField || 'serialNumber';

    if (matchField === 'phoneNumber' && phoneNum) {
      const phoneDocB = await PhoneNumber.findOne({
        surveyId: surveyB._id,
        number: phoneNum
      });
      if (phoneDocB) {
        serialB = phoneDocB.serialNumber;
      }
    } else {
      serialB = serialA;
    }

    const responseA = await Response.findOne({ surveyId: surveyA._id, serialNumber: serialA }).populate('agentId', 'name email');
    const responseB = serialB ? await Response.findOne({ surveyId: surveyB._id, serialNumber: serialB }).populate('agentId', 'name email') : null;

    res.json({
      surveyA,
      surveyB,
      responseA,
      responseB,
      matchField,
      serialA,
      serialB,
      phoneNumber: phoneNum
    });
  } catch (err) {
    console.error("Comparison Error:", err);
    res.status(500).json({ error: "Server error during comparison" });
  }
});

// GET ALL SURVEYS WITH BULK STATS (Admin + Quality)
app.get("/admin/surveys-stats", staffAuth, async (req, res) => {
  try {
    const stats = await Survey.aggregate([
      {
        $lookup: {
          from: 'responses',
          localField: '_id',
          foreignField: 'surveyId',
          as: 'responses'
        }
      },
      {
        $lookup: {
          from: 'precallcompletions',
          localField: '_id',
          foreignField: 'surveyId',
          as: 'precalls'
        }
      },
      {
        $project: {
          title: 1,
          isActive: 1,
          goal: 1,
          createdAt: 1,
          totalHandled: { $size: '$precalls' },
          completed: {
            $size: {
              $filter: {
                input: '$responses',
                as: 'r',
                cond: { $eq: ['$$r.status', 'completed'] }
              }
            }
          },
          disqualified: {
            $size: {
              $filter: {
                input: '$precalls',
                as: 'p',
                cond: { $eq: ['$$p.disqualified', true] }
              }
            }
          }
        }
      },
      { $sort: { createdAt: -1 } }
    ]);
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// GET SURVEY (Auth required)
app.get("/survey/:id", [auth, validateSurveyId], async (req, res) => {
  try {
    const survey = await Survey.findById(req.params.id);
    if (!survey) return res.status(404).json({ error: "Survey not found" });
    res.json(survey);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// GET RESPONSES (Admin + Quality)
app.get("/responses/:surveyId", staffAuth, async (req, res) => {
  try {
    const responses = await Response.find({ surveyId: req.params.surveyId });
    res.json(responses);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// SUBMIT RESPONSE (Auth required)
const responseController = require('./controllers/responseController');
app.post("/response", [auth, validateResponseSubmit], responseController.submitResponse);


// GET RESPONSES (Staff only)
app.get("/admin/responses", staffAuth, async (req, res) => {
  try {
    const { surveyId, agentId, limit = 50, skip = 0 } = req.query;
    const filter = {};
    if (surveyId && mongoose.Types.ObjectId.isValid(surveyId)) filter.surveyId = surveyId;
    if (agentId && mongoose.Types.ObjectId.isValid(agentId)) filter.agentId = agentId;

    const responses = await Response.find(filter)
      .populate('surveyId', 'title sections')
      .populate('agentId', 'name email')
      .sort({ completedAt: -1 })
      .lean();

    // Also fetch PrecallCompletions for this filter that DON'T have a Response yet
    // (e.g. disqualified, postponed, or refused before the survey started)
    const precallFilter = { ...filter };
    if (responses.length > 0) {
      const existingSerials = responses.map(r => r.serialNumber).filter(Boolean);
      precallFilter.serialNumber = { $nin: existingSerials };
    }

    const precalls = await PrecallCompletion.find(precallFilter)
      .populate('surveyId', 'title')
      .populate('userId', 'name email')
      .sort({ completedAt: -1 })
      .lean();

    // Standardize precalls to match Response format for the UI
    const mappedPrecalls = precalls.map(p => ({
      _id: p._id,
      serialNumber: p.serialNumber,
      surveyId: p.surveyId,
      agentId: p.userId, // Map userId to agentId
      completedAt: p.completedAt,
      interviewOutcome: p.interviewOutcome || p.outcomeCategory,
      status: p.outcomeCategory === 'qualified' ? 'partial' : p.outcomeCategory,
      answers: Object.keys(p.payload || {}).map(k => ({ questionId: k, value: p.payload[k] })),
      durationSecs: 0,
      isPrecallOnly: true
    }));

    const combined = [...responses, ...mappedPrecalls].sort((a, b) => 
      new Date(b.completedAt || 0) - new Date(a.completedAt || 0)
    ).slice(Number(skip), Number(skip) + Number(limit));

    // Fetch active flags for the returned responses/precalls
    const responseIds = combined.map(c => c._id);
    const flags = await Review.find({ responseId: { $in: responseIds }, type: 'Flag', flagged: true })
      .populate('qualityId', 'name')
      .lean();

    const flagsMap = new Map(flags.map(f => [f.responseId?.toString(), f]));
    combined.forEach(c => {
      const flag = flagsMap.get(c._id.toString());
      if (flag) {
        c.flagged = true;
        c.flagNote = flag.flagNote;
        c.flagCategory = flag.flagCategory;
        c.flaggedBy = flag.qualityId?.name;
        c.flaggedAt = flag.createdAt;
        c.resolved = flag.resolved || false;
        c.resolvedBy = flag.resolvedBy;
        c.resolvedAt = flag.resolvedAt;
      } else {
        c.flagged = false;
      }
    });

    res.json(combined);
  } catch (err) {
    console.error("Fetch responses error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// EXPORT SURVEY DATA (CSV)
app.get("/admin/export-survey/:id", staffAuth, responseController.exportCsv);

app.get("/admin/export-advanced", staffAuth, responseController.exportAdvanced);

// QUALITY OTHER ANSWERS CODING TOOL (Feature 4)
const otherCodingController = require('./controllers/otherCodingController');
app.get("/quality/other-coding/:surveyId/questions", staffAuth, otherCodingController.getOtherCodingQuestions);
app.get("/quality/other-coding/:surveyId/:questionId", staffAuth, otherCodingController.getOtherCoding);
app.put("/quality/other-coding/:surveyId/:questionId", staffAuth, otherCodingController.updateOtherCoding);
app.get("/quality/other-coding/:surveyId/:questionId/export", staffAuth, otherCodingController.exportOtherCoding);



// PHONE NUMBERS - ADMIN UPLOAD XLSX (after survey creation)
app.post('/admin/survey/:id/numbers', [upload.single('xlsx'), adminAuth, validateSurveyId], async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'XLSX file required' });
    const surveyId = req.params.id;
    
    const workbook = xlsx.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet);
    
    const extractedNumbers = [];
    for (const row of data) {
      const keys = Object.keys(row);
      
      // 1. Try named headers
      const phoneKey = keys.find(k => {
        const lowerK = String(k).toLowerCase().trim();
        return lowerK === 'number' || lowerK === 'phone' || lowerK === 'mobile' || 
               lowerK === 'telephone' || lowerK === 'cell' || lowerK === 'num';
      });

      let numberValue = phoneKey ? row[phoneKey] : null;

      // 2. If no named header, try to find ANY value that looks like a phone number (7+ digits)
      if (!numberValue) {
        const values = Object.values(row);
        numberValue = values.find(v => {
          const s = String(v).replace(/[^0-9]/g, '');
          return s.length >= 7 && s.length <= 15;
        });
      }

      if (numberValue) {
        const s = String(numberValue).replace(/[^0-9]/g, '');
        if (s.length >= 7 && s.length <= 15) {
          extractedNumbers.push(String(numberValue).trim());
        }
      }
    }

    let uploaded = 0;
    let skipped = 0;
    const total = extractedNumbers.length;

    if (total > 0) {
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          const existingNumbers = await PhoneNumber.find({ surveyId }, { number: 1 }).session(session);
          const existingSet = new Set(existingNumbers.map(n => n.number));

          const toInsert = [];
          for (const num of extractedNumbers) {
            if (existingSet.has(num)) {
              skipped++;
            } else {
              toInsert.push(num);
              existingSet.add(num);
            }
          }

          if (toInsert.length > 0) {
            const serials = await allocateSerialBatch('survey_numbers', toInsert.length, session);
            const results = [];
            for (let i = 0; i < toInsert.length; i++) {
              results.push({
                surveyId,
                number: toInsert[i],
                status: 'pending',
                serialNumber: serials[i],
                governorate: req.body.governorate || undefined
              });
            }
            await PhoneNumber.insertMany(results, { session });
            uploaded = results.length;
          }
        });
      } finally {
        await session.endSession();
      }
    }

    fs.unlinkSync(req.file.path);

    const io = req.app.get('io');
    if (io) io.emit("stats-update");

    res.json({
      message: `${uploaded} numbers imported successfully, ${skipped} skipped.`,
      uploaded,
      skipped,
      total
    });
  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch(e) {}
    }
    console.error("XLSX Import Critical Error:", err);
    res.status(500).json({ error: 'Import failed: ' + err.message });
  }
});

const memoryUpload = multer({ storage: multer.memoryStorage() });

// DEDICATED STANDALONE PHONE NUMBER UPLOAD ROUTE
app.post('/admin/campaigns/:campaignId/upload-numbers', [memoryUpload.single('file'), adminAuth], async (req, res) => {
  try {
    const surveyId = req.params.campaignId;
    if (!mongoose.Types.ObjectId.isValid(surveyId)) {
      return res.status(400).json({ error: 'Invalid campaign ID' });
    }
    const survey = await Survey.findById(surveyId);
    if (!survey) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'File is required' });
    }

    let rawLines = [];
    const filename = req.file.originalname.toLowerCase();

    if (filename.endsWith('.txt') || filename.endsWith('.csv') || req.file.mimetype === 'text/plain' || req.file.mimetype === 'text/csv') {
      const textContent = req.file.buffer.toString('utf8');
      rawLines = textContent.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    } else if (filename.endsWith('.xlsx')) {
      const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      if (sheet && sheet['!ref']) {
        const range = xlsx.utils.decode_range(sheet['!ref']);
        for (let r = range.s.r; r <= range.e.r; r++) {
          const cellAddress = xlsx.utils.encode_cell({ r, c: range.s.c });
          const cell = sheet[cellAddress];
          if (cell && cell.v !== undefined) {
            rawLines.push(String(cell.v).trim());
          }
        }
      }
    } else {
      return res.status(400).json({ error: 'Unsupported file format. Accepts .csv, .xlsx, .txt' });
    }

    const validNumbers = [];
    const rejected = [];

    for (const raw of rawLines) {
      const stripped = raw.replace(/[\s-]/g, '');
      const isNumericOnly = /^[0-9]+$/.test(stripped);
      if (isNumericOnly && stripped.length >= 7 && stripped.length <= 15) {
        validNumbers.push(stripped);
      } else {
        rejected.push(raw);
      }
    }

    let uploaded = 0;
    let skipped = 0;

    if (validNumbers.length > 0) {
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          const existingNumbers = await PhoneNumber.find({ surveyId }, { number: 1 }).session(session);
          const existingSet = new Set(existingNumbers.map(n => n.number));

          const toInsert = [];
          for (const num of validNumbers) {
            if (existingSet.has(num)) {
              skipped++;
            } else {
              toInsert.push(num);
              existingSet.add(num);
            }
          }

          if (toInsert.length > 0) {
            const maxDoc = await PhoneNumber.findOne({}, { serialNumber: 1 }).sort({ serialNumber: -1 }).session(session);
            const counter = await Counter.findOne({ id: 'survey_numbers' }).session(session);
            
            const maxSeq = maxDoc && maxDoc.serialNumber ? parseInt(maxDoc.serialNumber, 10) : 0;
            const currentSeq = counter ? counter.seq : 0;
            const startSeq = Math.max(maxSeq, currentSeq) + 1;

            const serials = [];
            for (let i = 0; i < toInsert.length; i++) {
              serials.push(String(startSeq + i).padStart(7, '0'));
            }

            await Counter.findOneAndUpdate(
              { id: 'survey_numbers' },
              { seq: startSeq + toInsert.length - 1 },
              { upsert: true, session }
            );

            const results = [];
            for (let i = 0; i < toInsert.length; i++) {
              results.push({
                surveyId,
                number: toInsert[i],
                status: 'pending',
                serialNumber: serials[i],
                governorate: req.body.governorate || undefined
              });
            }
            await PhoneNumber.insertMany(results, { session });
            uploaded = results.length;
          }
        });
      } finally {
        await session.endSession();
      }
    }

    const io = req.app.get('io');
    if (io) io.emit("stats-update");

    res.json({
      uploaded,
      skipped,
      rejected: rejected.length,
      rejectedSamples: rejected.slice(0, 5)
    });
  } catch (err) {
    console.error("Standalone Import Error:", err);
    res.status(500).json({ error: 'Import failed: ' + err.message });
  }
});

// PHONE NUMBERS - ADMIN LIST AND STATS
app.get('/admin/survey/:id/numbers', [staffAuth, validateSurveyId], async (req, res) => {
  try {
    const { governorate } = req.query;
    const filter = { surveyId: req.params.id };
    if (governorate && governorate !== 'All') {
      filter.governorate = governorate;
    }
    
    const list = await PhoneNumber.find(filter).sort({ createdAt: -1 }).limit(200);
    const stats = {
      total: await PhoneNumber.countDocuments(filter),
      pending: await PhoneNumber.countDocuments({ ...filter, status: 'pending' }),
      called: await PhoneNumber.countDocuments({ ...filter, status: 'called' }),
      qualified: await PhoneNumber.countDocuments({ ...filter, status: 'completed' }),
      disqualified: await PhoneNumber.countDocuments({ ...filter, status: 'disqualified' }),
      postponed: await PhoneNumber.countDocuments({ ...filter, status: 'postponed' }),
    };
    
    res.json({ list, stats });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch numbers' });
  }
});

// PHONE NUMBERS - ADMIN EXPORT DISQUALIFIED
app.get('/admin/survey/:id/numbers/disqualified/export', [staffAuth, validateSurveyId], async (req, res) => {
  try {
    const disqualified = await PhoneNumber.find({ surveyId: req.params.id, status: 'disqualified' }, 'number calledAt -_id').lean();
    if (disqualified.length === 0) {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=disqualified_${req.params.id}.csv`);
      return res.send('number,calledAt\n');
    }
    
    const formattedData = disqualified.map(d => ({
      Number: d.number,
      'Called At': d.calledAt ? new Date(d.calledAt).toLocaleString() : 'N/A'
    }));

    const ws = xlsx.utils.json_to_sheet(formattedData);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, "Disqualified");
    
    const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
    
    res.setHeader("Content-Disposition", `attachment; filename=disqualified_numbers_${req.params.id}.xlsx`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.status(200).send(buffer);
  } catch (err) {
    res.status(500).json({ error: 'Failed to export disqualified numbers' });
  }
});

// PHONE NUMBERS - CLEAR LIST (ADMIN)
app.delete('/admin/survey/:id/numbers', [adminAuth, validateSurveyId], async (req, res) => {
  try {
    await PhoneNumber.deleteMany({ surveyId: req.params.id });
    const io = req.app.get('io');
    if (io) io.emit("stats-update");
    res.json({ message: 'Numbers list cleared successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to clear numbers list' });
  }
});


// QUALITY: SUSPEND AGENT
app.post("/quality/suspend-agent/:id", staffAuth, async (req, res) => {
  try {
    const { reason } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    user.suspended = true;
    user.suspendedReason = reason;
    
    // If agent is active, forcibly set to off-duty
    if (user.currentStatus === 'active' || user.currentStatus === 'preparing' || user.currentStatus === 'break') {
      user.currentStatus = 'off-duty';
    }
    
    await user.save();
    
    io.emit("agentSuspended", { agentId: user._id });
    io.emit("stats-update");
    io.to(user._id.toString()).emit("status-pushed", { status: 'off-duty', statusStartedAt: user.statusStartedAt });

    res.json({ message: "Agent suspended successfully", user });
  } catch (err) {
    console.error("Error suspending agent:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// QUALITY: UNSUSPEND AGENT
app.post("/quality/unsuspend-agent/:id", staffAuth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    user.suspended = false;
    user.suspendedReason = null;
    await user.save();

    io.emit("stats-update");
    res.json({ message: "Agent unsuspended successfully", user });
  } catch (err) {
    console.error("Error unsuspending agent:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// GET AGENT STATISTICS
app.get("/stats/agents", staffAuth, async (req, res) => {
  try {
    const filter = (req.user.role === 'admin' || req.user.role === 'quality') 
      ? { role: { $in: ['agent', 'quality'] } } 
      : { _id: new mongoose.Types.ObjectId(req.user.id) };

    const stats = await User.aggregate([
      { $match: { ...filter } },
      // responses.agentId is stored as a string, so join using a stringified user id
      { $addFields: { _idStr: { $toString: '$_id' } } },
      {
        $lookup: {
          from: 'responses',
          localField: '_idStr',
          foreignField: 'agentId',
          as: 'responses'
        }
      },
      {
        $lookup: {
          from: 'precallcompletions',
          localField: '_id',
          foreignField: 'userId',
          as: 'precalls'
        }
      },
      {
        $lookup: {
          from: 'reviews',
          localField: '_id',
          foreignField: 'qualityId',
          as: 'reviews'
        }
      },
      {
        $project: {
          agentName: '$name',
          agentEmail: '$email',
          role: '$role',
          suspended: 1,
          suspendedReason: 1,
          currentStatus: 1,
          statusStartedAt: 1,
          totalSurveys: { $size: '$precalls' },
          totalReviews: { $size: '$reviews' },
          completed: {
            $size: {
              $filter: {
                input: '$responses',
                as: 'r',
                cond: { $eq: ['$$r.status', 'completed'] }
              }
            }
          },
          disqualified: {
            $size: {
              $filter: {
                input: '$precalls',
                as: 'p',
                cond: { $eq: ['$$p.disqualified', true] }
              }
            }
          },
          totalDurationSecs: { $sum: '$responses.durationSecs' }
        }
      },
      { $sort: { completed: -1 } }
    ]);

    res.json(stats);
  } catch (err) {
    console.error("Stats Aggregation Error:", err);
    res.status(500).json({ error: "Server Error" });
  }
});


// GET HISTORICAL ANALYTICS
app.get("/admin/analytics", staffAuth, async (req, res) => {
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const analytics = await Response.aggregate([
      { $match: { completedAt: { $gte: sevenDaysAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$completedAt" } },
          completed: {
            $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] }
          },
          totalDurationSecs: {
            $sum: { $cond: [{ $eq: ["$status", "completed"] }, "$durationSecs", 0] }
          }
        }
      },
      {
        $project: {
          date: "$_id",
          completed: 1,
          aht: {
            $cond: [
              { $gt: ["$completed", 0] },
              { $floor: { $divide: ["$totalDurationSecs", "$completed"] } },
              0
            ]
          },
          _id: 0
        }
      },
      { $sort: { date: 1 } }
    ]);

    res.json(analytics);
  } catch (err) {
    console.error("Analytics Error:", err);
    res.status(500).json({ error: "Server Error" });
  }
});
// QUALITY: GET AGENT PERFORMANCE STATS
app.get("/quality/agent-stats", staffAuth, async (req, res) => {
  try {
    const { period = 'daily', from, to } = req.query;
    
    let dateFilter = {};
    if (from || to) {
      if (from) dateFilter.$gte = new Date(from);
      if (to) {
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999);
        dateFilter.$lte = toDate;
      }
    } else {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      dateFilter.$gte = todayStart;
    }

    let dateFormat;
    if (period === 'daily') dateFormat = "%Y-%m-%d";
    else if (period === 'weekly') dateFormat = "%Y-W%V";
    else if (period === 'monthly') dateFormat = "%Y-%m";
    else dateFormat = "%Y-%m-%d";

    const precallStats = await PrecallCompletion.aggregate([
      { $match: { completedAt: dateFilter } },
      { $group: {
          _id: { agentId: "$userId", dateStr: { $dateToString: { format: dateFormat, date: "$completedAt" } } },
          totalCalls: { $sum: 1 },
          refusedCalls: { $sum: { $cond: [{ $eq: ["$interviewOutcome", "refused"] }, 1, 0] } },
          disqualifiedCalls: { $sum: { $cond: [{ $eq: ["$outcomeCategory", "disqualified"] }, 1, 0] } }
        }
      }
    ]);

    const responseStats = await Response.aggregate([
      { $match: { completedAt: dateFilter } },
      { $addFields: { agentIdObj: { $toObjectId: "$agentId" } } },
      { $group: {
          _id: { agentId: "$agentIdObj", dateStr: { $dateToString: { format: dateFormat, date: "$completedAt" } } },
          completedSurveys: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
          partialSurveys: { $sum: { $cond: [{ $eq: ["$status", "partial"] }, 1, 0] } },
          totalDuration: { $sum: "$durationSecs" },
          countWithDuration: { $sum: { $cond: [{ $gt: ["$durationSecs", 0] }, 1, 0] } }
        }
      }
    ]);

    const agents = await User.find({ role: { $in: ['agent', 'quality'] } }).select('name');
    const agentMap = {};
    agents.forEach(a => { agentMap[a._id.toString()] = a.name; });

    const combinedMap = {};
    const getCombinedKey = (agentId, dateStr) => `${agentId.toString()}_${dateStr}`;

    precallStats.forEach(p => {
      if (!p._id.agentId) return;
      const key = getCombinedKey(p._id.agentId, p._id.dateStr);
      combinedMap[key] = { agentId: p._id.agentId, date: p._id.dateStr, totalCalls: p.totalCalls, refusedCalls: p.refusedCalls, disqualifiedCalls: p.disqualifiedCalls, completedSurveys: 0, partialSurveys: 0, _totalDur: 0, _countDur: 0 };
    });
    responseStats.forEach(r => {
      if (!r._id.agentId) return;
      const key = getCombinedKey(r._id.agentId, r._id.dateStr);
      if (!combinedMap[key]) combinedMap[key] = { agentId: r._id.agentId, date: r._id.dateStr, totalCalls: 0, refusedCalls: 0, disqualifiedCalls: 0, completedSurveys: 0, partialSurveys: 0, _totalDur: 0, _countDur: 0 };
      combinedMap[key].completedSurveys = r.completedSurveys;
      combinedMap[key].partialSurveys = r.partialSurveys;
      combinedMap[key]._totalDur = r.totalDuration;
      combinedMap[key]._countDur = r.countWithDuration;
    });

    const results = Object.values(combinedMap).map(row => {
      row.agentName = agentMap[row.agentId.toString()] || 'Unknown';
      row.avgDurationSecs = row._countDur > 0 ? Math.round(row._totalDur / row._countDur) : 0;
      delete row._totalDur;
      delete row._countDur;
      return row;
    });

    res.json(results);
  } catch (err) {
    console.error("Quality Stats Error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// QUALITY: EXPORT AGENT STATS
app.get("/quality/export-agent-stats", staffAuth, async (req, res) => {
  try {
    const { period = 'daily', from, to } = req.query;
    
    let dateFilter = {};
    if (from || to) {
      if (from) dateFilter.$gte = new Date(from);
      if (to) {
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999);
        dateFilter.$lte = toDate;
      }
    } else {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      dateFilter.$gte = todayStart;
    }

    let dateFormat;
    if (period === 'daily') dateFormat = "%Y-%m-%d";
    else if (period === 'weekly') dateFormat = "%Y-W%V";
    else if (period === 'monthly') dateFormat = "%Y-%m";
    else dateFormat = "%Y-%m-%d";

    const precallStats = await PrecallCompletion.aggregate([
      { $match: { completedAt: dateFilter } },
      { $group: {
          _id: { agentId: "$userId", dateStr: { $dateToString: { format: dateFormat, date: "$completedAt" } } },
          totalCalls: { $sum: 1 },
          refusedCalls: { $sum: { $cond: [{ $eq: ["$interviewOutcome", "refused"] }, 1, 0] } },
          disqualifiedCalls: { $sum: { $cond: [{ $eq: ["$outcomeCategory", "disqualified"] }, 1, 0] } }
        }
      }
    ]);

    const responseStats = await Response.aggregate([
      { $match: { completedAt: dateFilter } },
      { $addFields: { agentIdObj: { $toObjectId: "$agentId" } } },
      { $group: {
          _id: { agentId: "$agentIdObj", dateStr: { $dateToString: { format: dateFormat, date: "$completedAt" } } },
          completedSurveys: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
          partialSurveys: { $sum: { $cond: [{ $eq: ["$status", "partial"] }, 1, 0] } },
          totalDuration: { $sum: "$durationSecs" },
          countWithDuration: { $sum: { $cond: [{ $gt: ["$durationSecs", 0] }, 1, 0] } }
        }
      }
    ]);

    const agents = await User.find({ role: { $in: ['agent', 'quality'] } }).select('name');
    const agentMap = {};
    agents.forEach(a => { agentMap[a._id.toString()] = a.name; });

    const combinedMap = {};
    const getCombinedKey = (agentId, dateStr) => `${agentId.toString()}_${dateStr}`;

    precallStats.forEach(p => {
      if (!p._id.agentId) return;
      const key = getCombinedKey(p._id.agentId, p._id.dateStr);
      combinedMap[key] = { agentId: p._id.agentId, date: p._id.dateStr, totalCalls: p.totalCalls, refusedCalls: p.refusedCalls, disqualifiedCalls: p.disqualifiedCalls, completedSurveys: 0, partialSurveys: 0, _totalDur: 0, _countDur: 0 };
    });
    responseStats.forEach(r => {
      if (!r._id.agentId) return;
      const key = getCombinedKey(r._id.agentId, r._id.dateStr);
      if (!combinedMap[key]) combinedMap[key] = { agentId: r._id.agentId, date: r._id.dateStr, totalCalls: 0, refusedCalls: 0, disqualifiedCalls: 0, completedSurveys: 0, partialSurveys: 0, _totalDur: 0, _countDur: 0 };
      combinedMap[key].completedSurveys = r.completedSurveys;
      combinedMap[key].partialSurveys = r.partialSurveys;
      combinedMap[key]._totalDur = r.totalDuration;
      combinedMap[key]._countDur = r.countWithDuration;
    });

    const resultsByAgent = {};
    Object.values(combinedMap).forEach(row => {
      row.agentName = agentMap[row.agentId.toString()] || 'Unknown';
      row.avgDurationSecs = row._countDur > 0 ? Math.round(row._totalDur / row._countDur) : 0;
      
      if (!resultsByAgent[row.agentName]) resultsByAgent[row.agentName] = [];
      resultsByAgent[row.agentName].push(row);
    });

    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    for (const [agentName, rows] of Object.entries(resultsByAgent)) {
      rows.sort((a, b) => a.date.localeCompare(b.date));
      const safeName = agentName.replace(/[\*\?\/\\\[\]]/g, '').substring(0, 31) || 'Agent';
      const sheet = workbook.addWorksheet(safeName);
      
      sheet.columns = [
        { header: 'Date', key: 'date', width: 15 },
        { header: 'Total Calls', key: 'totalCalls', width: 15 },
        { header: 'Completed Surveys', key: 'completedSurveys', width: 20 },
        { header: 'Partial Surveys', key: 'partialSurveys', width: 20 },
        { header: 'Refused Calls', key: 'refusedCalls', width: 15 },
        { header: 'Disqualified Calls', key: 'disqualifiedCalls', width: 20 },
        { header: 'Avg Duration (Secs)', key: 'avgDurationSecs', width: 20 }
      ];
      
      sheet.getRow(1).font = { bold: true };
      rows.forEach(r => sheet.addRow(r));
    }

    if (workbook.worksheets.length === 0) {
      workbook.addWorksheet('No Data');
    }

    const filename = `Agent_Performance_Report_${period}_${Date.now()}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("Export Stats Error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// QUALITY: GET DROP-OFF RATE PER QUESTION
app.get("/quality/drop-off/:surveyId", staffAuth, async (req, res) => {
  try {
    const surveyId = req.params.surveyId;
    const survey = await Survey.findById(surveyId);
    if (!survey) return res.status(404).json({ error: "Survey not found" });

    // Collect all valid questions in order
    const questionsList = [];
    survey.sections.forEach(section => {
      section.questions.forEach(q => {
        questionsList.push({
          questionId: q.questionId || q._id.toString(),
          questionText: q.text
        });
      });
    });

    // We count both complete and partial, but ignore disqualified numbers
    // Actually, disqualified is from PrecallCompletion, so we just query Responses directly.
    const responses = await Response.find({ surveyId, status: { $in: ['completed', 'partial'] } }).lean();
    const totalResponses = responses.length;

    const questionCounts = {};
    questionsList.forEach(q => { questionCounts[q.questionId] = 0; });

    responses.forEach(r => {
      if (r.answers && Array.isArray(r.answers)) {
        r.answers.forEach(a => {
          if (questionCounts[a.questionId] !== undefined) {
            questionCounts[a.questionId]++;
          }
        });
      }
    });

    const dropOffStats = questionsList.map(q => {
      const answeredCount = questionCounts[q.questionId];
      const dropOffRate = totalResponses > 0 ? (1 - (answeredCount / totalResponses)) : 0;
      return {
        questionId: q.questionId,
        questionText: q.questionText,
        answeredCount,
        totalResponses,
        dropOffRate: parseFloat(dropOffRate.toFixed(4))
      };
    });

    res.json(dropOffStats);
  } catch (err) {
    console.error("Drop-off Error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// QUALITY AUDIT CHECKLIST ROUTE (Feature 5)
const qualityAuditController = require('./controllers/qualityAuditController');
app.get("/quality/agent-precall/:agentId", staffAuth, qualityAuditController.getAgentPrecall);
app.post("/quality/audit", staffAuth, qualityAuditController.submitAudit);

// QUALITY: SHADOW REVIEW (GET)
app.get("/quality/shadow/:serialNumber", staffAuth, async (req, res) => {
  try {
    const serialNumber = req.params.serialNumber;
    let draft = await Draft.findOne({ serialNumber }).lean();
    let isCompleted = false;

    // Fallback to completed Response if draft doesn't exist
    if (!draft) {
      const completedResponse = await Response.findOne({ serialNumber }).lean();
      if (!completedResponse) {
        return res.status(404).json({ error: "No active draft or completed response found for this serial number." });
      }
      draft = completedResponse;
      isCompleted = true;
    }

    const precallData = await PrecallCompletion.findOne({ serialNumber }).lean();
    
    // Add openedAt to allow the client to pass it back
    res.json({
      draft,
      precallData,
      surveyId: draft.surveyId,
      agentId: draft.agentId,
      openedAt: new Date(),
      isCompleted
    });
  } catch (err) {
    console.error("Shadow Review GET Error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// QUALITY: SHADOW REVIEW (POST)
app.post("/quality/shadow/:serialNumber", staffAuth, async (req, res) => {
  try {
    const serialNumber = req.params.serialNumber;
    const { shadowAnswers, notes, openedAt, agentId, surveyId } = req.body;

    const review = new Review({
      type: 'ShadowReview',
      serialNumber,
      surveyId,
      agentId,
      qualityId: req.user.id,
      shadowAnswers,
      feedbackText: notes || '', // Keep feedbackText generic, or map notes to it
      openedAt: openedAt ? new Date(openedAt) : new Date(),
      createdAt: new Date()
    });

    await review.save();
    res.json(review);
  } catch (err) {
    console.error("Shadow Review POST Error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// GET BASIC USERS LIST FOR STAFF
app.get("/users/list", staffAuth, async (req, res) => {
  try {
    const users = await User.find({}, 'name email role').lean();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch users list" });
  }
});

// GET FEEDBACKS (Reviews)
app.get("/reviews", staffAuth, async (req, res) => {
  try {
    const reviews = await Review.find().populate('agentId', 'name email').populate('qualityId', 'name email').sort({ createdAt: -1 });
    res.json(reviews);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch reviews" });
  }
});

// CREATE FEEDBACK
app.post("/reviews", staffAuth, async (req, res) => {
  try {
    const { agentId, type, feedbackText } = req.body;
    if (!feedbackText) return res.status(400).json({ error: "Feedback text is required" });
    const reviewData = { qualityId: req.user.id, feedbackText, type: type || 'Feedback' };
    
    if (agentId && agentId !== 'none') {
      const targetUser = await User.findById(agentId);
      if (!targetUser) return res.status(404).json({ error: "User not found" });
      if (req.user.role === 'quality' && targetUser.role === 'admin') {
        return res.status(403).json({ error: "Quality accounts cannot submit feedback for Admins." });
      }
      reviewData.agentId = agentId;
    }
    
    const review = new Review(reviewData);
    await review.save();
    
    // Auto-update quality agent stats real-time
    if (io) io.emit("stats-update");
    
    res.json(review);
  } catch (err) {
    res.status(500).json({ error: "Failed to create review" });
  }
});

// MARK REVIEWS AS SEEN
app.post("/reviews/mark-seen", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    user.lastSeenFeedbackAt = new Date();
    await user.save();
    
    // Also update all unseen reviews for this agent
    if (user.role === 'agent' || user.role === 'quality') {
      await Review.updateMany(
        { agentId: user._id, seenAt: null },
        { $set: { seenAt: new Date() } }
      );
    }
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to update seen status" });
  }
});

// GET UNSEEN REVIEWS COUNT
app.get("/reviews/unseen-count", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });
    const lastSeen = user.lastSeenFeedbackAt || new Date(0);
    // Don't count feedbacks created by the user themselves
    const query = { createdAt: { $gt: lastSeen }, qualityId: { $ne: user._id } };
    if (user.role === 'agent') {
      query.agentId = user._id;
    }
    const count = await Review.countDocuments(query);
    res.json({ count });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch unseen count" });
  }
});

// AGENT: GET MY REVIEWS
app.get("/reviews/my-reviews", auth, async (req, res) => {
  try {
    const reviews = await Review.find({ agentId: req.user.id })
      .populate('qualityId', 'name')
      .populate('responseId', 'status _id')
      .sort({ createdAt: -1 });
    res.json(reviews);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch reviews" });
  }
});

// QUALITY: FLAG RESPONSE
app.post("/reviews/:responseId/flag", staffAuth, async (req, res) => {
  try {
    const { flagNote, flagCategory } = req.body;
    const responseId = req.params.responseId;

    if (!mongoose.Types.ObjectId.isValid(responseId)) {
      return res.status(400).json({ error: "Invalid response ID format" });
    }

    // Validate flagCategory
    const validCategories = ['wrong_answer', 'suspicious', 'incomplete', 'coaching', 'other'];
    if (!flagCategory) {
      return res.status(400).json({ error: "Flag category is required" });
    }
    if (!validCategories.includes(flagCategory)) {
      return res.status(400).json({ error: "Invalid flag category value" });
    }

    // Validate flagNote (max 500 characters)
    let sanitizedNote = flagNote;
    if (flagNote !== undefined && flagNote !== null) {
      sanitizedNote = String(flagNote).trim();
      if (sanitizedNote.length > 500) {
        return res.status(400).json({ error: "Flag note exceeds maximum length of 500 characters" });
      }
    }

    const review = await runTransaction(async (session) => {
      let response = await Response.findById(responseId).session(session);
      let agentId;
      let surveyId;
      let serialNumber;

      if (response) {
        agentId = response.agentId;
        surveyId = response.surveyId;
        serialNumber = response.serialNumber;
      } else {
        const precall = await PrecallCompletion.findById(responseId).session(session);
        if (!precall) {
          const err = new Error("Response or Precall not found");
          err.status = 404;
          throw err;
        }
        agentId = precall.userId;
        surveyId = precall.surveyId;
        serialNumber = precall.serialNumber;
      }

      // Check if a flag review already exists for this response
      let reviewDoc = await Review.findOne({ responseId, type: 'Flag' }).session(session);
      if (reviewDoc) {
        reviewDoc.flagNote = sanitizedNote;
        reviewDoc.flagCategory = flagCategory;
        reviewDoc.flagged = true;
        reviewDoc.qualityId = req.user.id;
        reviewDoc.surveyId = surveyId;
        reviewDoc.serialNumber = serialNumber;
      } else {
        reviewDoc = new Review({
          type: 'Flag',
          responseId,
          agentId,
          qualityId: req.user.id,
          flagged: true,
          flagNote: sanitizedNote,
          flagCategory,
          surveyId,
          serialNumber
        });
      }
      await reviewDoc.save({ session });
      return reviewDoc;
    });

    // Socket broadcast stats-update post-commit
    const io = req.app.get('io');
    if (io) io.emit("stats-update");

    // Fire-and-forget email notification to the agent who submitted the response
    if (review.agentId) {
      (async () => {
        try {
          const agent = await User.findById(review.agentId);
          if (agent && agent.email) {
            const CATEGORY_LABELS = {
              wrong_answer: "Wrong Answer / إجابة خاطئة",
              suspicious: "Suspicious Response / إجابة مشبوهة",
              incomplete: "Incomplete Response / إجابة غير مكتملة",
              coaching: "Suspected Coaching / يُشتبه في التلقين",
              other: "Other / أخرى"
            };
            const categoryLabel = CATEGORY_LABELS[review.flagCategory] || review.flagCategory;

            await sendEmail({
              to: agent.email,
              subject: "Response Flagged for Review",
              text: `Hello ${agent.name || 'Agent'},

A response submitted by you has been flagged for re-review.

Response details:
- Serial Number: #${review.serialNumber || 'N/A'}
- Flag Category: ${categoryLabel}
- Note: ${review.flagNote || 'No additional note provided.'}

Best regards,
Baseera System Support`
            });
          }
        } catch (mailErr) {
          console.error("[FLAG EMAIL NOTIFICATION ERROR]", mailErr);
        }
      })();
    }

    res.json(review);
  } catch (error) {
    console.error("[FLAG RESPONSE ERROR]", error);
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }
    if (error.name === "CastError" || error.name === "ValidationError") {
      return res.status(400).json({ error: error.message });
    }
    if (error.code === 11000) {
      return res.status(409).json({ error: "Conflict: This response has already been flagged or reviewed" });
    }
    res.status(500).json({ error: "Failed to flag response" });
  }
});

// QUALITY: GET FLAGGED RESPONSES
app.get("/reviews/flagged", staffAuth, async (req, res) => {
  try {
    const flags = await Review.find({ type: 'Flag', flagged: true })
      .populate('agentId', 'name')
      .populate('qualityId', 'name')
      .sort({ createdAt: -1 })
      .lean();

    const responseIds = flags.map(f => f.responseId).filter(Boolean);

    // Find all matching Response documents
    const responses = await Response.find({ _id: { $in: responseIds } })
      .populate('surveyId', 'title sections')
      .populate('agentId', 'name email')
      .lean();

    const responsesMap = new Map(responses.map(r => [r._id.toString(), r]));

    // Find any missing IDs from PrecallCompletion
    const foundResponseIds = new Set(responses.map(r => r._id.toString()));
    const missingIds = responseIds.filter(id => !foundResponseIds.has(id.toString()));

    let precalls = [];
    if (missingIds.length > 0) {
      precalls = await PrecallCompletion.find({ _id: { $in: missingIds } })
        .populate('surveyId', 'title')
        .populate('userId', 'name email')
        .lean();
    }
    const precallsMap = new Map(precalls.map(p => [p._id.toString(), p]));

    // Map responseId for each flag
    const populatedFlags = flags.map(f => {
      if (!f.responseId) return f;
      const fIdStr = f.responseId.toString();

      let populatedResponse = null;
      if (responsesMap.has(fIdStr)) {
        populatedResponse = responsesMap.get(fIdStr);
      } else if (precallsMap.has(fIdStr)) {
        const p = precallsMap.get(fIdStr);
        populatedResponse = {
          _id: p._id,
          serialNumber: p.serialNumber,
          surveyId: p.surveyId,
          agentId: p.userId, // Map userId to agentId
          completedAt: p.completedAt,
          interviewOutcome: p.interviewOutcome || p.outcomeCategory,
          status: p.outcomeCategory === 'qualified' ? 'partial' : p.outcomeCategory,
          answers: Object.keys(p.payload || {}).map(k => ({ questionId: k, value: p.payload[k] })),
          durationSecs: 0,
          isPrecallOnly: true
        };
      }

      return {
        ...f,
        responseId: populatedResponse
      };
    });

    res.json(populatedFlags);
  } catch (err) {
    console.error("[GET FLAGGED RESPONSES ERROR]", err);
    res.status(500).json({ error: "Failed to fetch flagged responses" });
  }
});

// ADMIN: RESOLVE FLAG RESPONSE
app.patch("/reviews/:responseId/resolve", adminAuth, async (req, res) => {
  try {
    const { responseId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(responseId)) {
      return res.status(400).json({ error: "Invalid response ID" });
    }

    const review = await Review.findOne({ responseId, type: 'Flag' });
    if (!review) {
      return res.status(404).json({ error: "Flag not found" });
    }

    if (review.resolved) {
      return res.status(409).json({ error: "Flag already resolved" });
    }

    const updatedReview = await runTransaction(async (session) => {
      const doc = await Review.findOne({ responseId, type: 'Flag' }).session(session);
      if (!doc) {
        const err = new Error("Flag not found");
        err.status = 404;
        throw err;
      }
      if (doc.resolved) {
        const err = new Error("Flag already resolved");
        err.status = 409;
        throw err;
      }
      doc.resolved = true;
      doc.resolvedBy = req.user.id;
      doc.resolvedAt = new Date();
      if (doc.type === 'Flag' && !doc.flagCategory) {
        doc.flagCategory = 'other';
      }
      await doc.save({ session, validateBeforeSave: false });
      return doc;
    });

    const io = req.app.get('io');
    if (io) io.emit("stats-update");

    res.json(updatedReview);
  } catch (error) {
    console.error("[RESOLVE FLAG ERROR]", error);
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }
    res.status(500).json({ error: "Failed to resolve flag" });
  }
});

// GET DAILY GOAL
app.get("/settings/dailyGoal", auth, async (req, res) => {
  try {
    const setting = await SystemSetting.findOne({ key: 'dailyGoal' });
    res.json({ dailyGoal: setting ? setting.value : 50 });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch daily goal" });
  }
});

// SET DAILY GOAL (Accepts { goal: <integer> })
app.put("/admin/settings/dailyGoal", adminAuth, async (req, res) => {
  try {
    const raw = req.body.goal ?? req.body.dailyGoal;
    const goal = parseInt(raw, 10);
    if (isNaN(goal) || goal < 0) {
      return res.status(400).json({ message: 'goal must be a non-negative integer' });
    }
    await SystemSetting.findOneAndUpdate(
      { key: 'dailyGoal' },
      { value: goal },
      { upsert: true, returnDocument: 'after' }
    );
    const io = req.app.get('io');
    if (io) io.emit("stats-update");
    res.json({ success: true, dailyGoal: goal });
  } catch (err) {
    res.status(500).json({ error: "Failed to save daily goal" });
  }
});

// GET SOP UPDATES
app.get("/sops", auth, async (req, res) => {
  try {
    const sops = await SopUpdate.find().populate('createdBy', 'name role').sort({ createdAt: -1 });
    res.json(sops);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch SOP updates" });
  }
});

// CREATE SOP UPDATE
app.post("/sops", staffAuth, async (req, res) => {
  try {
    const { title, content } = req.body;
    if (!title || !content) return res.status(400).json({ error: "Title and content are required" });
    const sop = new SopUpdate({ title, content, createdBy: req.user.id });
    await sop.save();
    const io = req.app.get('io');
    if (io) io.emit("stats-update");
    res.json(sop);
  } catch (err) {
    res.status(500).json({ error: "Failed to create SOP update" });
  }
});

// MARK SOPS AS SEEN
app.post("/sops/mark-seen", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    user.lastSeenSopAt = new Date();
    await user.save();
    res.json({ success: true, lastSeenSopAt: user.lastSeenSopAt });
  } catch (err) {
    res.status(500).json({ error: "Failed to update seen status" });
  }
});

// GET UNSEEN SOP COUNT
app.get("/sops/unseen-count", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });
    const lastSeen = user.lastSeenSopAt || new Date(0);
    const count = await SopUpdate.countDocuments({ createdAt: { $gt: lastSeen } });
    res.json({ count });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch unseen count" });
  }
});

// DELETE SURVEY (Admins only)
app.delete("/survey/:id", adminAuth, async (req, res) => {
  try {
    const survey = await Survey.findById(req.params.id);
    if (!survey) return res.status(404).json({ error: "Survey not found" });

    // Block deletion if survey is still active
    if (survey.isActive !== false) {
      return res.status(400).json({ error: "Cannot delete an active campaign. Please end the campaign first." });
    }

    await Survey.findByIdAndDelete(req.params.id);
    res.json({ message: "Survey deleted successfully. Response data has been preserved." });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

function socketIoAllowedOrigins() {
  if (env.SOCKET_IO_CORS_ORIGIN) {
    return env.SOCKET_IO_CORS_ORIGIN.split(",").map((s) => s.trim()).filter(Boolean);
  }
  if (env.CORS_ORIGIN) {
    return env.CORS_ORIGIN.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return ["http://localhost:3001", "http://127.0.0.1:3001"];
}

// 1. Use absolute path resolution for IISNode
const frontendPath = path.resolve(__dirname, 'admin-ui', 'dist');

// 2. Explicitly serve the assets folder FIRST to prevent catch-all interference
app.use('/assets', express.static(path.join(frontendPath, 'assets')));

// 3. Serve the rest of the static files (manifest, vite.svg, etc.)
app.use(express.static(frontendPath));

// 4. React SPA Catch-all Route
app.get(/.*/, (req, res, next) => {
  // Bypass API and other backend routes
  if (req.path.startsWith('/auth') || req.path.startsWith('/admin') || req.path.startsWith('/agent') || req.path.startsWith('/api')) {
    return next();
  }
  
  // Protect against asset fallthrough (if a .js/.css file is missing, return 404, NOT index.html)
  if (req.path.match(/\.(js|css|png|jpg|jpeg|gif|ico|json|woff|woff2|ttf|svg)$/)) {
    const fs = require('fs');
    // IISNode sometimes prepends /server.js to the path. Find the actual relative path.
    const relativePath = req.path.includes('/assets/') 
        ? req.path.substring(req.path.indexOf('/assets/') + 1) 
        : req.path.replace(/^\/?(server\.js\/)?/, '');
        
    const assetPath = path.join(frontendPath, relativePath);
    
    if (fs.existsSync(assetPath)) {
        return res.sendFile(assetPath);
    }
    
    // Provide a helpful 404 error showing paths for debugging if it still fails
    return res.status(404).send(`Asset not found. <br> req.path: ${req.path} <br> mapped to: ${assetPath}`);
  }

  // Serve the React index.html for all other navigation routes
  res.sendFile(path.join(frontendPath, 'index.html'));
});

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});
app.use(errorHandler);

const server = require("http").createServer(app);
const io = require("socket.io")(server, {
  cors: {
    origin: socketIoAllowedOrigins(),
    methods: ["GET", "POST"],
  },
});
app.set("io", io);

// Socket.io Logic for Live Monitoring
const activeSockets = new Map(); // socketId -> userId

io.use(async (socket, next) => {
  try {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.query?.token ||
      (socket.handshake.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!token) return next(new Error("Authentication required"));
    const jwtSecret = env.JWT_SECRET;
    if (!jwtSecret) return next(new Error("Server misconfigured"));
    const decoded = jwt.verify(String(token).replace(/^Bearer\s+/i, ""), jwtSecret);
    const user = await User.findById(decoded.id).select("role suspended");
    if (!user || user.suspended) return next(new Error("Unauthorized"));
    socket.user = {
      id: user._id.toString(),
      role: user.role,
    };
    next();
  } catch (err) {
    next(new Error("Invalid token"));
  }
});

io.on("connection", (socket) => {
  socket.on("join-monitoring", (data) => {
    const userId = socket.user?.id;
    const role = socket.user?.role;
    if (!userId || !role) return;
    if (data?.id && String(data.id) !== userId && role !== "admin" && role !== "quality") {
      return;
    }
    activeSockets.set(socket.id, userId);

    if (role === "agent") {
      socket.join(userId);
    } else if (role === "admin" || role === "quality") {
      socket.join("auditors");
    }
  });

  socket.on("screen-data", (data) => {
    // Legacy support or fallback
    io.to('auditors').emit("stream-data", data);
  });

  // WebRTC Signaling Events
  const activeStreamers = {};

  socket.on("request-stream", (data) => {
    // Auditor requests an agent to start WebRTC
    if (!activeStreamers[data.agentId]) {
      activeStreamers[data.agentId] = new Set();
    }
    if (activeStreamers[data.agentId].size >= 4) {
      socket.emit("stream-error", { message: "Maximum viewers (4) reached for this agent." });
      return;
    }
    activeStreamers[data.agentId].add(socket.id);
    io.to(data.agentId).emit("request-stream", { auditorId: socket.id });
  });

  socket.on("stop-stream", (data) => {
    if (activeStreamers[data.agentId]) {
      activeStreamers[data.agentId].delete(socket.id);
    }
    io.to(data.agentId).emit("stop-stream", { auditorId: socket.id });
  });

  socket.on("webrtc-offer", (data) => {
    // Agent sends offer to specific auditor
    io.to(data.target).emit("webrtc-offer", { 
      agentId: data.agentId, 
      agentName: data.agentName, 
      offer: data.offer 
    });
  });

  socket.on("webrtc-answer", (data) => {
    // Auditor sends answer back to Agent
    io.to(data.target).emit("webrtc-answer", { answer: data.answer, auditorId: socket.id });
  });

  socket.on("webrtc-ice-candidate", (data) => {
    // 1-to-1 candidate exchange
    io.to(data.target).emit("webrtc-ice-candidate", { candidate: data.candidate, senderId: socket.id, agentId: data.agentId });
  });

  socket.on("whisper", (data) => {
    io.to(data.target).emit("whisper", { message: data.message });
  });

  socket.on("disconnect", () => {
    // Remove auditor from any streams they were watching
    Object.keys(activeStreamers).forEach(agentId => {
      if (activeStreamers[agentId].has(socket.id)) {
        activeStreamers[agentId].delete(socket.id);
        io.to(agentId).emit("stop-stream", { auditorId: socket.id });
      }
    });
    // Remove agent's stream limits if they disconnect
    const userId = activeSockets.get(socket.id);
    if (userId) {
      delete activeStreamers[userId];
      activeSockets.delete(socket.id);
      
      // Timer logic removed per user feedback. Agents remain in their current status.
    }
  });
});

const PORT = env.PORT;
const HOST = env.HOST;

server.listen(PORT, HOST, () => {
  const os = require('os');
  const nets = os.networkInterfaces();
  const addresses = [];
  for (const iface of Object.values(nets)) {
    for (const net of iface) {
      if (net.family === 'IPv4' && !net.internal) {
        addresses.push(net.address);
      }
    }
  }
  logger.info(`Server running on:`);
  logger.info(`   Local:   http://localhost:${PORT}`);
  addresses.forEach(ip => logger.info(`   Network: http://${ip}:${PORT}`));
});

module.exports = { app, server, io };