require("dotenv").config();
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

const corsOrigins = process.env.CORS_ORIGIN;
app.use(
  cors(
    corsOrigins
      ? {
          origin: corsOrigins
            .split(",")
            .map((o) => o.trim())
            .filter(Boolean),
          credentials: true,
        }
      : {}
  )
);
app.use(express.json({ limit: '10mb' }));

app.get("/", (req, res) => {
  res.send("API is running 🚀");
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

    const io = req.app.get('io');
    if (io) io.emit("stats-update");

    res.json(survey);
  } catch (err) {
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

// GET ALL SURVEYS (Auth required)
app.get("/surveys", auth, async (req, res) => {
  try {
    let filter = {};
    if (req.user.role === 'agent') filter.isActive = { $ne: false }; // True or undefined means active
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

    res.json(combined);
  } catch (err) {
    console.error("Fetch responses error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// EXPORT SURVEY DATA (CSV)
app.get("/admin/export-survey/:id", staffAuth, async (req, res) => {
  try {
    const survey = await Survey.findById(req.params.id);
    if (!survey) return res.status(404).json({ error: "Survey not found" });

    // Fetch all responses and populate agent info
    const responses = await Response.aggregate([
      { $match: { surveyId: req.params.id } },
      {
        $addFields: {
          agentObjectId: {
            $convert: { input: '$agentId', to: 'objectId', onError: null, onNull: null }
          }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: 'agentObjectId',
          foreignField: '_id',
          as: 'agent'
        }
      },
      { $unwind: { path: '$agent', preserveNullAndEmptyArrays: true } },
      { $sort: { startedAt: -1 } }
    ]);

    // Prepare CSV Headers
    const questions = [];
    survey.sections.forEach(section => {
      section.questions.forEach(q => {
        // Answers are keyed by the builder's `questionId` (see SurveyBuilder + TakeSurvey),
        // not the Mongo subdocument `_id`.
        const id = q.questionId || (q._id ? q._id.toString() : undefined);
        if (!id) return;
        questions.push({ id, text: q.text });
      });
    });

    const headers = ["Submission Date", "Status", "Agent Name", "Agent Email", "Duration (sec)"];
    questions.forEach(q => headers.push(q.text.replace(/,/g, "")));

    let csvContent = headers.join(",") + "\n";

    // Prepare CSV Rows
    responses.forEach(r => {
      const row = [
        new Date(r.startedAt).toISOString(),
        r.status,
        r.agent ? `"${r.agent.name.replace(/"/g, '""')}"` : "Unknown",
        r.agent ? `"${r.agent.email.replace(/"/g, '""')}"` : "Unknown",
        r.durationSecs || 0
      ];

      questions.forEach(q => {
        const answer = r.answers.find(a => a.questionId === q.id);
        let val = answer ? answer.value.replace(/"/g, '""').replace(/\n/g, " ") : "";
        
        // Yes/No to 1/0 conversion
        const lowerVal = val.toLowerCase().trim();
        if (lowerVal === "yes" || lowerVal === "نعم") val = "1";
        else if (lowerVal === "no" || lowerVal === "لا") val = "0";

        row.push(`"${val}"`);
      });

      csvContent += row.join(",") + "\n";
    });

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename=export_${survey.title.replace(/\s+/g, "_")}.csv`);
    res.status(200).send(csvContent);
  } catch (err) {
    res.status(500).json({ error: "Failed to generate export" });
  }
});

// ADVANCED EXPORT (Excel, SPSS, Access)
app.get("/admin/export-advanced", staffAuth, async (req, res) => {
  try {
    const { surveyId, agentId, status, startDate, endDate, format = 'xlsx' } = req.query;

    if (!surveyId || !mongoose.Types.ObjectId.isValid(surveyId)) {
      return res.status(400).json({ error: "Valid Survey ID is required" });
    }

    const survey = await Survey.findById(surveyId);
    if (!survey) return res.status(404).json({ error: "Survey not found" });

    // 1. Build Filter
    const filter = { surveyId };
    if (agentId && mongoose.Types.ObjectId.isValid(agentId)) filter.agentId = agentId;
    if (status) filter.status = status;
    if (startDate || endDate) {
      filter.completedAt = {};
      if (startDate) filter.completedAt.$gte = new Date(startDate);
      if (endDate) filter.completedAt.$lte = new Date(endDate);
    }
    
    // 2. Prepare Metadata (Question columns)
    const questions = [];
    survey.sections.forEach(section => {
      section.questions.forEach(q => {
        const id = q.questionId || (q._id ? q._id.toString() : undefined);
        if (!id) return;
        questions.push({
          id,
          text: q.text,
          type: q.type,
          options: q.options || []
        });
      });
    });

    const filenameBase = `export_${survey.title.replace(/\\s+/g, "_")}_${new Date().getTime()}`;

    if (format === 'xlsx' || format === 'access' || format === 'csv') {
      const isAccess = format === 'access' || format === 'csv';
      if (isAccess) {
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", `attachment; filename=${filenameBase}.csv`);
        res.write('\\uFEFF'); // BOM
      } else {
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", `attachment; filename=${filenameBase}.xlsx`);
      }

      let workbook, worksheet;
      const headerRow = ['Serial', 'Submission_Date', 'Status', 'Interview_Outcome', 'Agent_Name', 'Duration_Secs'];
      questions.forEach(q => headerRow.push(q.text.replace(/,/g, '')));

      if (isAccess) {
        res.write(headerRow.join(',') + '\\n');
      } else {
        const ExcelJS = require('exceljs');
        workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res });
        worksheet = workbook.addWorksheet('Responses');
        worksheet.addRow(headerRow).commit();
      }

      const cursor = Response.find(filter).populate('agentId', 'name email').sort({ completedAt: 1 }).cursor({ batchSize: 1000 });
      
      // Strip "other:" prefix and flatten arrays for export cells
      const processExportValue = (value) => {
        if (value == null) return "";
        if (Array.isArray(value)) {
          return value.map(v => {
            const s = typeof v === 'string' ? v : String(v);
            if (s.toLowerCase().startsWith('other:')) return s.substring(6).trim();
            if (s.startsWith('Other: ')) return s.substring(7);
            return s;
          }).join(' | ');
        }
        if (typeof value === 'string') {
          if (value.toLowerCase().startsWith('other:')) return value.substring(6).trim();
          if (value.startsWith('Other: ')) return value.substring(7);
        }
        return value;
      };

      cursor.on('data', (r) => {
        const row = [
          isAccess ? `"${(r.serialNumber || 'N/A').replace(/"/g, '""')}"` : (r.serialNumber || 'N/A'),
          isAccess ? `"${new Date(r.completedAt || r.startedAt).toLocaleString()}"` : new Date(r.completedAt || r.startedAt).toLocaleString(),
          isAccess ? `"${(r.status || '').replace(/"/g, '""')}"` : r.status,
          isAccess ? `"${(r.interviewOutcome || '').replace(/"/g, '""')}"` : r.interviewOutcome,
          isAccess ? `"${(r.agentId?.name || 'Unknown').replace(/"/g, '""')}"` : (r.agentId?.name || 'Unknown'),
          r.durationSecs || 0
        ];
        
        questions.forEach(q => {
          const answer = r.answers.find(a => a.questionId === q.id);
          let val = processExportValue(answer ? answer.value : "");
          const lowerVal = String(val).toLowerCase().trim();
          if (lowerVal === "yes" || lowerVal === "نعم") val = 1;
          else if (lowerVal === "no" || lowerVal === "لا") val = 0;
          
          if (isAccess) {
             const strVal = typeof val === 'string' ? val.replace(/"/g, '""').replace(/\\n/g, ' ') : val;
             row.push(`"${strVal}"`);
          } else {
             row.push(val);
          }
        });
        
        if (isAccess) {
          res.write(row.join(',') + '\\n');
        } else {
          worksheet.addRow(row).commit();
        }
      });

      cursor.on('end', () => {
        if (isAccess) {
          res.end();
        } else {
          worksheet.commit();
          workbook.commit();
        }
      });

      cursor.on('error', (err) => {
        console.error('Export Cursor Error:', err);
        res.end();
      });
      return;
    } 

    // For SAV we still fetch via lean, but avoid storing intermediate exportData
    const responses = await Response.find(filter)
      .populate('agentId', 'name email')
      .sort({ completedAt: 1 })
      .lean();
    if (format === 'sav') {
      // SPSS Variable definitions
      const vars = [
        { name: 'SERIAL', label: 'Serial Number', type: VariableType.String, width: 16 },
        { name: 'S_DATE', label: 'Submission Date', type: VariableType.String, width: 32 },
        { name: 'STATUS', label: 'Completion Status', type: VariableType.String, width: 16 },
        { name: 'OUTCOME', label: 'Interview Outcome', type: VariableType.String, width: 32 },
        { name: 'AGENT', label: 'Agent Name', type: VariableType.String, width: 64 },
        { name: 'DURATION', label: 'Duration (Secs)', type: VariableType.Numeric, width: 8, decimal: 0 }
      ];

      questions.forEach((q, idx) => {
        const isNumeric = (q.type === 'number' || q.type === 'rating');
        const vName = `Q${idx + 1}`;
        const vLabel = q.text.substring(0, 255);
        
        const variable = {
          name: vName,
          label: vLabel,
          type: isNumeric ? VariableType.Numeric : VariableType.String,
          width: isNumeric ? 8 : 255,
          decimal: isNumeric ? 0 : 0
        };

        if (q.options && q.options.length > 0) {
          variable.valueLabels = q.options.map(opt => ({
            value: opt.value,
            label: opt.label || opt.value
          }));
        }
        
        vars.push(variable);
      });

      // Map data to variables
      const records = responses.map(r => {
        const rec = [
          r.serialNumber || 'N/A',
          new Date(r.completedAt || r.startedAt).toISOString(),
          r.status,
          r.interviewOutcome,
          r.agentId?.name || 'Unknown',
          r.durationSecs || 0
        ];

        questions.forEach(q => {
          const answer = r.answers.find(a => a.questionId === q.id || a.questionId === q.questionId);
          let rawVal = answer?.value ?? "";
          let val = Array.isArray(rawVal) ? rawVal.join(' | ') : rawVal;
          
          // Yes/No to 1/0 conversion
          const lowerVal = String(val).toLowerCase().trim();
          if (lowerVal === "yes" || lowerVal === "نعم") val = 1;
          else if (lowerVal === "no" || lowerVal === "لا") val = 0;

          const expectedNumeric = (q.type === 'number' || q.type === 'rating');
          if (expectedNumeric) {
            rec.push(Number(val) || 0);
          } else {
            rec.push(String(val));
          }
        });

        return rec;
      });

      const tempFile = path.join(__dirname, 'uploads', `${filenameBase}.sav`);
      saveToFile(tempFile, records, vars);

      res.download(tempFile, `${filenameBase}.sav`, (err) => {
        if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
      });
      return;
    }

    res.status(400).json({ error: "Unsupported format" });

  } catch (err) {
    console.error("Advanced Export Error:", err);
    res.status(500).json({ error: "Failed to generate advanced export", detail: err.message });
  }
});

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
        const cleaned = String(numberValue).trim();
        const digitsOnly = cleaned.replace(/[^0-9]/g, '');
        if (digitsOnly.length >= 7 && digitsOnly.length <= 15) {
          extractedNumbers.push(cleaned);
        }
      }
    }

    let uploaded = 0;
    let skipped = 0;
    const total = extractedNumbers.length;

    if (total > 0) {
      const { runTransaction } = require('./utils/runTransaction');
      await runTransaction(async (session) => {
        const q = PhoneNumber.find({ surveyId }, { number: 1 });
        if (session) q.session(session);
        const existingNumbers = await q;
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
          const insertOpts = session ? { session } : {};
          await PhoneNumber.insertMany(results, insertOpts);
          uploaded = results.length;
        }
      });
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
    if (io) io.emit('stats-update');
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

    const io = req.app.get('io');
    if (io) io.emit('stats-update');
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
    const { flagNote } = req.body;
    const responseId = req.params.responseId;
    
    const response = await Response.findById(responseId);
    if (!response) return res.status(404).json({ error: "Response not found" });

    // Check if a flag review already exists for this response
    let review = await Review.findOne({ responseId, type: 'Flag' });
    if (review) {
      review.flagNote = flagNote;
      review.flagged = true;
      review.qualityId = req.user.id;
    } else {
      review = new Review({
        type: 'Flag',
        responseId,
        agentId: response.agentId,
        qualityId: req.user.id,
        flagged: true,
        flagNote
      });
    }
    await review.save();
    const io = req.app.get('io');
    if (io) io.emit('stats-update');
    res.json(review);
  } catch (err) {
    res.status(500).json({ error: "Failed to flag response" });
  }
});

// QUALITY: GET FLAGGED RESPONSES
app.get("/reviews/flagged", staffAuth, async (req, res) => {
  try {
    const flags = await Review.find({ type: 'Flag', flagged: true })
      .populate('agentId', 'name')
      .populate('qualityId', 'name')
      .populate('responseId')
      .sort({ createdAt: -1 });
    res.json(flags);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch flagged responses" });
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
    if (io) io.emit('stats-update');
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
    if (io) io.emit('stats-update');
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
  if (process.env.SOCKET_IO_CORS_ORIGIN) {
    return process.env.SOCKET_IO_CORS_ORIGIN.split(",").map((s) => s.trim()).filter(Boolean);
  }
  if (process.env.CORS_ORIGIN) {
    return process.env.CORS_ORIGIN.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return ["http://localhost:3001", "http://127.0.0.1:3001"];
}

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
    const jwtSecret = process.env.JWT_SECRET;
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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server (with Real-time Support) running on http://localhost:${PORT}`);
});