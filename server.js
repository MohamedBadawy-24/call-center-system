require("dotenv").config(); const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");

const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const connectDB = require("./config/db");
const Survey = require("./models/Survey");
const Response = require("./models/Response");
const User = require("./models/User");
const ProfileRequest = require("./models/ProfileRequest");
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
  validateRegister, 
  validateLogin, 
  validatePasswordReset, 
  validatePrecallComplete, 
  validateResponseSubmit, 
  validateSurveyId 
} = require("./middleware/validation");
const PhoneNumber = require("./models/PhoneNumber");
const xlsx = require("xlsx");
const multer = require("multer");
const fs = require('fs');
const sendEmail = require("./utils/mailer");

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

async function allocateSerialBatch(id = 'global', count = 1) {
  if (count <= 0) return [];
  const counter = await Counter.findOneAndUpdate(
    { id },
    { $inc: { seq: count } },
    { returnDocument: 'after', upsert: true }
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

function categorizeInterviewOutcome(ir) {
  const v = String(ir || "");
  if (["completed", "partial"].includes(v)) return { category: "qualified", disqualified: false };
  if (v === "postponed") return { category: "postponed", disqualified: false };
  return { category: "disqualified", disqualified: true };
}

function toFiniteAge(raw) {
  if (raw === "" || raw === null || raw === undefined) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** Reads age from precall payload (avoids Number("") === 0 being treated as under 18). */
function parseRespondentAgeYears(payload) {
  if (!payload || typeof payload !== "object") return NaN;
  const preferred = ["age_years", "age", "respondent_age"];
  for (const k of preferred) {
    if (!Object.prototype.hasOwnProperty.call(payload, k)) continue;
    const n = toFiniteAge(payload[k]);
    if (n !== null) return n;
  }
  return NaN;
}

async function getLatestPrecallForSession(userId, statusStartedAt, surveyId) {
  const query = { userId, statusStartedAt };
  if (surveyId && mongoose.Types.ObjectId.isValid(surveyId)) {
    query.surveyId = new mongoose.Types.ObjectId(String(surveyId));
  }
  const rows = await PrecallCompletion.find(query)
    .sort({ completedAt: -1 })
    .limit(1)
    .lean();
  return rows[0] || null;
}

/** Precall gate: latest precall in this status session must be newer than latest survey response in the same session. */
async function computePrecallCompletedForSession(user) {
  if (user.role !== "agent" || user.currentStatus !== "active") return true;
  const uid = user._id;
  const ss = user.statusStartedAt;
  const lastPrecall = await getLatestPrecallForSession(uid, ss);
  if (!lastPrecall) return false;
  const respRows = await Response.find({
    agentId: uid.toString(),
    sessionStatusStartedAt: ss,
  })
    .sort({ completedAt: -1 })
    .limit(1)
    .lean();
  const lastResp = respRows[0];
  if (!lastResp || !lastResp.completedAt) return true;
  return new Date(lastPrecall.completedAt) > new Date(lastResp.completedAt);
}

/** Same rules as GET /agent/survey-eligibility (used there and when validating qualified survey submits). */
async function getSurveyEligibilityState(user, surveyId, serialParam = null) {
  // Admin and Quality can always "walk through" the survey
  if (user && (user.role === "admin" || user.role === "quality")) {
    return { canStartSurvey: true, reason: "", precallSerialNumber: serialParam || "TEST", payload: {} };
  }

  if (!user || user.role !== "agent" || user.currentStatus !== "active") {
    return { canStartSurvey: false, reason: "not_active", precallSerialNumber: "", payload: {} };
  }

  let lastPrecall;
  if (serialParam) {
    lastPrecall = await PrecallCompletion.findOne({ serialNumber: serialParam }).lean();
  } else {
    lastPrecall = await getLatestPrecallForSession(user._id, user.statusStartedAt, surveyId);
  }

  if (!lastPrecall) {
    return { canStartSurvey: false, reason: "no_precall", precallSerialNumber: "", payload: {} };
  }
  const serial = lastPrecall.serialNumber || (lastPrecall.payload?.serial_number != null ? String(lastPrecall.payload.serial_number) : "");
  const payload = lastPrecall.payload || {};
  const ageYears = parseRespondentAgeYears(payload);

  if (Number.isFinite(ageYears) && ageYears < 18) {
    return { canStartSurvey: false, reason: "under_18", precallSerialNumber: serial, payload };
  }
  if (lastPrecall.under18NotQualified) {
    return { canStartSurvey: false, reason: "under_18_not_qualified", precallSerialNumber: serial, payload };
  }
  const existingResponse = await Response.findOne({ serialNumber: serial }).lean();
  const existingAnswers = existingResponse ? existingResponse.answers.reduce((acc, a) => ({ ...acc, [a.questionId]: a.value }), {}) : {};
  
  return { 
    canStartSurvey: true, 
    reason: "", 
    precallSerialNumber: serial, 
    payload, 
    existingAnswers 
  };
}

const strictAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: { error: "Too many attempts, try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

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

// Test route
app.get("/", (req, res) => {
  res.send("API is running 🚀");
});

// Check if users exist for bootstrap logic
app.get("/auth/has-users", async (req, res) => {
  try {
    const count = await User.countDocuments();
    res.json({ hasUsers: count > 0 });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Password strength validator
const validatePassword = (password) => {
  const regex = /^(?=.*[a-zA-Z])(?=.*\d)(?=.*[@_\-.])[a-zA-Z\d@_\-.]{8,}$/;
  if (!regex.test(password)) {
    return "Password must be at least 8 characters long, contain letters, a number, and AT LEAST ONE allowed symbol (@, -, _, .). No other symbols are allowed!";
  }
  return null;
};

// AUTH: REGISTER
app.post("/auth/register", validateRegister, async (req, res) => {
  try {
    const { name, email, password, role } = req.body;


    // Default system seed logic: First user is automatically Admin, otherwise must be Admin
    const userCount = await User.countDocuments();
    let finalRole = role || 'agent';

    if (userCount === 0) {
      finalRole = 'admin';
    } else {
      const tokenHeader = req.header("Authorization");
      if (!tokenHeader) return res.status(401).json({ error: "Unauthorized" });
      
      const jwtSecret = process.env.JWT_SECRET;
      if (!jwtSecret) return res.status(500).json({ error: "System configuration error: JWT_SECRET missing" });

      const decoded = jwt.verify(tokenHeader.replace("Bearer ", ""), jwtSecret);
      if (decoded.role !== "admin") return res.status(403).json({ error: "Only admins can register users" });
    }

    let user = await User.findOne({ email });
    if (user) return res.status(400).json({ error: "User already exists" });

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    user = new User({
      name,
      email,
      password: hashedPassword,
      role: finalRole
    });

    await user.save();
    res.json({ message: "User registered successfully" });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// AUTH: LOGIN
app.post("/auth/login", [strictAuthLimiter, validateLogin], async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: "Invalid credentials" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: "Invalid credentials" });

    const payload = {
      id: user._id,
      name: user.name,
      role: user.role
    };

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) return res.status(500).json({ error: "System configuration error: JWT_SECRET missing" });

    // Reset status to 'preparing' on every fresh login for non-admins
    if (user.role !== 'admin') {
      const now = new Date();
      
      // Close any stray open logs
      const lastLog = await StatusLog.findOne({ userId: user.id, endTime: { $exists: false } }).sort({ startTime: -1 });
      if (lastLog) {
        lastLog.endTime = now;
        lastLog.durationSecs = Math.floor((now - lastLog.startTime) / 1000);
        await lastLog.save();
      }

      user.currentStatus = 'preparing';
      user.statusStartedAt = now;
      await user.save();

      // Start new 'preparing' log
      const newLog = new StatusLog({
        userId: user.id,
        status: 'preparing',
        startTime: now
      });
      await newLog.save();
      
      // Update payload to include current status
      payload.currentStatus = 'preparing';
      payload.statusStartedAt = now;
    }

    jwt.sign(payload, jwtSecret, { expiresIn: "8h" }, (err, token) => {
      if (err) throw err;
      res.json({ token, user: payload });
    });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// AUTH: CURRENT USER (validates token + ensures user still exists)
app.get("/auth/me", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user) return res.status(401).json({ error: "User no longer exists" });

    let precallCompletedForActiveSession = true;
    if (user.role === "agent" && user.currentStatus === "active") {
      precallCompletedForActiveSession = await computePrecallCompletedForSession(user);
    }

    res.json({
      user: {
        id: user._id.toString(),
        name: user.name,
        role: user.role,
        currentStatus: user.currentStatus,
        statusStartedAt: user.statusStartedAt,
        precallCompletedForActiveSession,
      },
    });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// AUTH: FORGOT PASSWORD
app.post("/auth/forgot-password", strictAuthLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ error: "User not found" });

    // Generate 6 digit code
    const val = Math.floor(100000 + Math.random() * 900000);
    const code = val.toString();

    // Hash it for DB security
    const salt = await bcrypt.genSalt(10);
    user.resetCode = await bcrypt.hash(code, salt);
    user.resetCodeExpires = Date.now() + 5 * 60 * 1000; // 5 mins
    await user.save();

    try {
      await sendEmail({
        to: email,
        subject: "Baseera System - Password Verify Code",
        text: `Hello ${user.name},\n\nYour 6-digit verification code is: ${code}\n\nIt expires in 5 minutes.`,
      });
      console.log(`[SECURITY] Email successfully dispatched to ${email}`);
      res.json({ message: "Verification code sent to your email!" });
    } catch (emailErr) {
      console.error("[SECURITY] Email failure:", emailErr.message);
      res.status(500).json({ error: "Failed to send email. Ensure SMTP variables in .env are correct." });
    }
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// AUTH: RESET PASSWORD
app.post("/auth/reset-password", [strictAuthLimiter, validatePasswordReset], async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;

    const passError = validatePassword(newPassword);
    if (passError) return res.status(400).json({ error: passError });

    const user = await User.findOne({ email });
    if (!user || !user.resetCode || !user.resetCodeExpires) {
      return res.status(400).json({ error: "Invalid request" });
    }

    if (Date.now() > user.resetCodeExpires) {
      return res.status(400).json({ error: "Code has expired" });
    }

    const isMatch = await bcrypt.compare(code, user.resetCode);
    if (!isMatch) return res.status(400).json({ error: "Invalid reset code" });

    const isSameAsOld = await bcrypt.compare(newPassword, user.password);
    if (isSameAsOld) return res.status(400).json({ error: "New password must be different from the old password." });

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    user.resetCode = undefined;
    user.resetCodeExpires = undefined;
    await user.save();

    res.json({ message: "Password has been successfully changed! You may now login." });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// AUTH: UPDATE PROFILE
app.put("/auth/profile", auth, async (req, res) => {
  try {
    const { name, email, oldPassword, password } = req.body;
    let user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    // Block Agents from changing name/email directly
    if (user.role === 'agent') {
      if ((name && name !== user.name) || (email && email !== user.email)) {
        return res.status(403).json({ error: "Agents must submit a change request to update their name or email." });
      }
    }

    // If changing password, must provide and validate oldPassword
    if (password) {
      const passError = validatePassword(password);
      if (passError) return res.status(400).json({ error: passError });

      if (!oldPassword) return res.status(400).json({ error: "Old password is required to set a new password." });

      if (oldPassword === password) return res.status(400).json({ error: "New password must be different from the old password." });

      const isMatch = await bcrypt.compare(oldPassword, user.password);
      if (!isMatch) return res.status(400).json({ error: "Old password is incorrect." });

      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(password, salt);
    }

    if (name) user.name = name;
    if (email) {
      const existingUser = await User.findOne({ email });
      if (existingUser && existingUser.id !== req.user.id) {
        return res.status(400).json({ error: "Email already in use" });
      }
      user.email = email;
    }

    await user.save();

    const payload = {
      id: user._id,
      name: user.name,
      role: user.role,
      currentStatus: user.currentStatus,
      statusStartedAt: user.statusStartedAt
    };

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) return res.status(500).json({ error: "System configuration error: JWT_SECRET missing" });

    jwt.sign(payload, jwtSecret, { expiresIn: "8h" }, (err, token) => {
      if (err) throw err;
      res.json({ token, user: payload, message: "Profile updated successfully" });
    });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// AUTH: REQUEST PROFILE CHANGE (AGENT)
app.post("/auth/request-profile-change", auth, async (req, res) => {
  try {
    const { type, requestedValue } = req.body; // type: 'name' or 'email'
    if (!['name', 'email'].includes(type)) return res.status(400).json({ error: "Invalid request type" });

    // Check for existing pending request of SAME type
    const pending = await ProfileRequest.findOne({ userId: req.user.id, type, status: 'pending' });
    if (pending) return res.status(400).json({ error: `You already have a pending ${type} change request.` });

    // Cooldown Logic: If LAST request was APPROVED, must wait 24h.
    const lastApproved = await ProfileRequest.findOne({ 
      userId: req.user.id, 
      type, 
      status: 'approved' 
    }).sort({ resolvedAt: -1 });

    if (lastApproved && lastApproved.resolvedAt) {
      const cooldownPeriod = 24 * 60 * 60 * 1000; // 24 hours
      const timeSinceResolution = Date.now() - lastApproved.resolvedAt.getTime();
      if (timeSinceResolution < cooldownPeriod) {
        const remainingHours = Math.ceil((cooldownPeriod - timeSinceResolution) / (60 * 60 * 1000));
        return res.status(403).json({ error: `You must wait ${remainingHours} more hours before requesting another ${type} change after an approval.` });
      }
    }

    const request = new ProfileRequest({
      userId: req.user.id,
      type,
      requestedValue
    });
    await request.save();
    res.json({ message: "Change request submitted successfully for admin review." });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// AUTH: GET OWN REQUESTS (AGENT)
app.get("/auth/my-profile-requests", auth, async (req, res) => {
  try {
    const requests = await ProfileRequest.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(requests);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ADMIN: GET ALL REQUESTS
app.get("/admin/profile-requests", adminAuth, async (req, res) => {
  try {
    const requests = await ProfileRequest.find().populate('userId', 'name email').sort({ createdAt: -1 });
    res.json(requests);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ADMIN: RESOLVE PROFILE REQUEST
app.post("/admin/resolve-profile-request/:id", adminAuth, async (req, res) => {
  try {
    const { status, adminNote } = req.body; // status: 'approved' or 'rejected'
    if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ error: "Invalid status" });

    const request = await ProfileRequest.findById(req.params.id).populate('userId');
    if (!request) return res.status(404).json({ error: "Request not found" });
    if (request.status !== 'pending') return res.status(400).json({ error: "Request already resolved" });

    request.status = status;
    request.adminNote = adminNote;
    request.resolvedAt = Date.now();
    await request.save();

    if (status === 'approved') {
      const user = await User.findById(request.userId._id);
      if (user) {
        if (request.type === 'name') user.name = request.requestedValue;
        if (request.type === 'email') user.email = request.requestedValue;
        await user.save();
      }
    }

    try {
      await sendEmail({
        to: request.userId.email,
        subject: `Baseera Profile Request Update: ${status.toUpperCase()}`,
        text: `Hello ${request.userId.name},\n\nYour request to change your ${request.type} to "${request.requestedValue}" has been ${status.toUpperCase()}.\n\n${adminNote ? `Admin Note: ${adminNote}\n\n` : ''}Thank you,\nBaseera Team`,
      });
    } catch (emailErr) {
      console.error("Email notification failed:", emailErr.message);
    }

    res.json({ message: `Request successfully ${status}` });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ADMIN: LIST USERS (for account management)
app.get("/admin/users", adminAuth, async (req, res) => {
  try {
    const users = await User.find({}, "name email role currentStatus statusStartedAt createdAt").sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ADMIN: DELETE USER ACCOUNT
app.delete("/admin/users/:id", adminAuth, async (req, res) => {
  try {
    const targetId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(targetId)) {
      return res.status(400).json({ error: "Invalid user id" });
    }

    if (targetId === req.user.id) {
      return res.status(400).json({ error: "You cannot delete your own account while logged in." });
    }

    const target = await User.findById(targetId);
    if (!target) return res.status(404).json({ error: "User not found" });

    if (target.role === 'admin') {
      const adminCount = await User.countDocuments({ role: 'admin' });
      if (adminCount <= 1) {
        return res.status(400).json({ error: "Cannot delete the last admin account." });
      }
    }

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      await ProfileRequest.deleteMany({ userId: targetId }, { session });
      await StatusLog.deleteMany({ userId: targetId }, { session });
      await Response.deleteMany({ agentId: targetId }, { session });
      await User.deleteOne({ _id: targetId }, { session });
      await session.commitTransaction();
    } catch (txnErr) {
      await session.abortTransaction();
      throw txnErr;
    } finally {
      session.endSession();
    }

    io.emit('stats-update');
    res.json({ message: "User deleted successfully" });
  } catch (err) {
    console.error("Delete user error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// AUTH: REQUEST EMAIL CHANGE VERIFICATION CODE (AGENT)
app.post("/auth/request-email-change-code", auth, async (req, res) => {
  try {
    const { newEmail } = req.body;
    if (!newEmail) return res.status(400).json({ error: "New email is required" });

    // Check availability
    const existingUser = await User.findOne({ email: newEmail });
    if (existingUser) return res.status(400).json({ error: "Email already in use" });

    // Generate 6 digit code
    const val = Math.floor(100000 + Math.random() * 900000);
    const code = val.toString();

    const user = await User.findById(req.user.id);
    const salt = await bcrypt.genSalt(10);
    user.emailVerificationCode = await bcrypt.hash(code, salt);
    user.emailVerificationExpires = Date.now() + 5 * 60 * 1000; // 5 mins
    await user.save();

    try {
      await sendEmail({
        to: newEmail,
        subject: "Baseera - Email Change Verification Code",
        text: `Hello,\n\nYour 6-digit verification code to change your email to this address is: ${code}\n\nIt expires in 5 minutes.`,
      });
      res.json({ message: "Verification code sent to your new email address!" });
    } catch (emailErr) {
      console.error("Email dispatch failure:", emailErr.message);
      res.status(500).json({ error: "Failed to send verification email. Check SMTP settings." });
    }
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// AUTH: VERIFY EMAIL CHANGE CODE & SUBMIT REQUEST (AGENT)
app.post("/auth/verify-email-change-code", auth, async (req, res) => {
  try {
    const { code, newEmail } = req.body;
    const user = await User.findById(req.user.id);

    if (!user.emailVerificationCode || !user.emailVerificationExpires) {
      return res.status(400).json({ error: "No active verification request found." });
    }

    if (Date.now() > user.emailVerificationExpires) {
      return res.status(400).json({ error: "Verification code has expired." });
    }

    const isMatch = await bcrypt.compare(code, user.emailVerificationCode);
    if (!isMatch) return res.status(400).json({ error: "Invalid verification code." });

    // Code matches! Clear it and create the ProfileRequest
    user.emailVerificationCode = undefined;
    user.emailVerificationExpires = undefined;
    await user.save();

    // Re-check for existing pending request of SAME type for safety
    const pending = await ProfileRequest.findOne({ userId: user.id, type: 'email', status: 'pending' });
    if (pending) return res.status(400).json({ error: "You already have a pending email change request." });

    const request = new ProfileRequest({
      userId: user.id,
      type: 'email',
      requestedValue: newEmail
    });
    await request.save();

    res.json({ message: "Email verified and change request submitted to admin for review." });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// AUTH: UPDATE AGENT STATUS
app.post("/auth/status", auth, async (req, res) => {
  try {
    const { status, breakReason } = req.body;
    if (!['active', 'preparing', 'break', 'off-duty'].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }
    
    if (status === 'break' && !['Lunch', 'Meeting'].includes(breakReason)) {
      return res.status(400).json({ error: "Invalid break reason" });
    }

    const user = await User.findById(req.user.id);
    if (!['agent', 'quality'].includes(user.role)) {
      return res.status(403).json({ error: "Unauthorized status role" });
    }

    const now = new Date();

    // 1. Close current status log if it exists
    const lastLog = await StatusLog.findOne({ userId: user.id, endTime: { $exists: false } }).sort({ startTime: -1 });
    if (lastLog) {
      lastLog.endTime = now;
      lastLog.durationSecs = Math.floor((now - lastLog.startTime) / 1000);
      await lastLog.save();
    }

    // 2. Update user state
    user.currentStatus = status;
    user.currentBreakReason = status === 'break' ? breakReason : null;
    user.statusStartedAt = now;
    await user.save();

    // 3. Create new status log
    const newLog = new StatusLog({
      userId: user.id,
      status: status,
      breakReason: status === 'break' ? breakReason : null,
      startTime: now
    });
    await newLog.save();

    // Broadcast update for real-time dashboards
    io.emit('stats-update');

    let precallCompletedForActiveSession = true;
    if (user.role === "agent" && user.currentStatus === "active") {
      precallCompletedForActiveSession = await computePrecallCompletedForSession(user);
    }

    res.json({
      message: "Status updated",
      status: user.currentStatus,
      statusStartedAt: user.statusStartedAt,
      precallCompletedForActiveSession,
    });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Completed precall rows in the current active session (for forms count on checklist)
app.get("/agent/precall-session-count", auth, async (req, res) => {
  try {
    const isStaff = req.user.role === 'admin' || req.user.role === 'quality';
    if (!isStaff && req.user.role !== "agent") {
      return res.status(403).json({ error: "Agents only" });
    }
    const user = await User.findById(req.user.id);
    if (!user || user.currentStatus !== "active") {
      return res.json({ count: 0 });
    }
    const count = await PrecallCompletion.countDocuments({
      userId: user._id,
      statusStartedAt: user.statusStartedAt,
    });
    res.json({ count });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Outbound precall copy for agents (first active campaign, newest first)
app.get("/agent/outbound-precall", auth, async (req, res) => {
  try {
    const isStaff = req.user.role === 'admin' || req.user.role === 'quality';
    if (!isStaff && req.user.role !== "agent") {
      return res.status(403).json({ error: "Agents only" });
    }
    const { surveyId } = req.query;
    let survey;

    if (surveyId && mongoose.Types.ObjectId.isValid(surveyId)) {
      survey = await Survey.findById(surveyId).lean();
    } else {
      survey = await Survey.findOne({ isActive: { $ne: false } })
        .sort({ createdAt: -1 })
        .lean();
    }
    if (!survey) {
      return res.json({ surveyId: null, outboundPrecall: null, surveyTitle: null });
    }
    res.json({
      surveyId: survey._id.toString(),
      outboundPrecall: survey.outboundPrecall || null,
      surveyTitle: survey.title || null,
    });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Whether the agent may start the questionnaire (18+ from latest precall in this session)
app.get("/agent/survey-eligibility", auth, async (req, res) => {
  try {
    // Allow Admin/Quality to bypass the "Agents only" check for testing/review
    const isStaff = req.user.role === 'admin' || req.user.role === 'quality';
    if (!isStaff && req.user.role !== "agent") {
      return res.status(403).json({ error: "Unauthorized" });
    }
    const user = await User.findById(req.user.id);
    const { surveyId, serial } = req.query;
    const state = await getSurveyEligibilityState(user, surveyId, serial);
    res.json({
      canStartSurvey: state.canStartSurvey,
      reason: state.canStartSurvey ? undefined : state.reason,
      precallSerialNumber: state.precallSerialNumber,
      payload: state.payload || {},
      existingAnswers: state.existingAnswers || {},
    });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Audit: agent completes outbound precall for current active session
app.post("/agent/precall-complete", [auth, validatePrecallComplete], async (req, res) => {
  try {
    const isStaff = req.user.role === 'admin' || req.user.role === 'quality';
    if (!isStaff && req.user.role !== "agent") {
      return res.status(403).json({ error: "Unauthorized" });
    }
    const user = await User.findById(req.user.id);
    if (!user || (user.role === 'agent' && user.currentStatus !== "active")) {
      return res.status(400).json({ error: "You must be active to complete the checklist" });
    }

    let { surveyId, payload, interviewStartedAt, interviewDate, interviewStartDisplay } = req.body;
    const startedAt = interviewStartedAt ? new Date(interviewStartedAt) : new Date();
    if (Number.isNaN(startedAt.getTime())) {
      return res.status(400).json({ error: "Invalid interviewStartedAt" });
    }

    payload = payload && typeof payload === "object" ? { ...payload } : {};
    const ageYears = parseRespondentAgeYears(payload);
    let under18NotQualified = false;
    if (Number.isFinite(ageYears) && ageYears < 18) {
      under18NotQualified = true;
      payload.interview_result = "no_qualified";
    }
    const ir = String(payload.interview_result || "");
    const { category, disqualified } = categorizeInterviewOutcome(ir);

    let sid;
    if (surveyId && mongoose.Types.ObjectId.isValid(surveyId)) {
      sid = new mongoose.Types.ObjectId(surveyId);
    }
    const serialNumber = payload.serial_number || "";
    const precallData = {
      userId: user._id,
      statusStartedAt: user.statusStartedAt,
      surveyId: sid,
      interviewDate: typeof interviewDate === "string" ? interviewDate : "",
      interviewStartedAt: startedAt,
      interviewStartDisplay: typeof interviewStartDisplay === "string" ? interviewStartDisplay : "",
      payload,
      interviewOutcome: ir,
      outcomeCategory: category,
      outcomeReason: payload.outcome_reason || "",
      disqualified: disqualified || under18NotQualified,
      under18NotQualified,
      serialNumber,
    };

    let doc;
    if (serialNumber) {
      const { userId, statusStartedAt, ...updateFields } = precallData;
      doc = await PrecallCompletion.findOneAndUpdate(
        { serialNumber },
        { 
          $set: updateFields,
          $setOnInsert: { userId: precallData.userId, statusStartedAt: precallData.statusStartedAt }
        },
        { upsert: true, returnDocument: 'after' }
      );
    } else {
      doc = await PrecallCompletion.create(precallData);
    }

    // 1. Handle Automatic Serial Number and Phone Update
    const phoneInPayload = String(payload.phone || "").trim();
    
    let currentNumberDoc = null;
    if (serialNumber) {
      currentNumberDoc = await PhoneNumber.findOne({ serialNumber });
    }
    
    if (!currentNumberDoc && sid) {
      currentNumberDoc = await PhoneNumber.findOne({ 
        agentId: user._id, 
        surveyId: sid,
        status: 'pending' 
      }).sort({ assignedAt: -1 });
    }

    if (phoneInPayload && (!currentNumberDoc || currentNumberDoc.number !== phoneInPayload)) {
      const newSerial = serialNumber || await getNextSerialNumber('survey_numbers');
      if (currentNumberDoc) {
        currentNumberDoc.number = phoneInPayload;
        if (!currentNumberDoc.serialNumber) {
          currentNumberDoc.serialNumber = newSerial;
        }
        await currentNumberDoc.save();
      } else {
        currentNumberDoc = await PhoneNumber.create({
          surveyId: sid,
          number: phoneInPayload,
          agentId: user._id,
          status: 'pending',
          serialNumber: newSerial,
          assignedAt: new Date()
        });
      }
      
      if (!payload.serial_number) {
        payload.serial_number = newSerial;
        doc.serialNumber = newSerial;
        doc.payload.serial_number = newSerial;
        doc.markModified('payload');
        await doc.save();
      }
    } else if (currentNumberDoc && !payload.serial_number) {
        payload.serial_number = currentNumberDoc.serialNumber;
        doc.serialNumber = currentNumberDoc.serialNumber;
        doc.payload.serial_number = currentNumberDoc.serialNumber;
        doc.markModified('payload');
        await doc.save();
    }

    if (ir === "postponed" && payload.serial_number != null) {
      await PostponedSerial.create({
        agentId: user._id,
        surveyId: sid,
        statusStartedAt: user.statusStartedAt,
        serialNumber: String(payload.serial_number),
        source: "precall",
        precallCompletionId: doc._id,
      });
    }

    const callOutcome = String(payload.call_result || "");
    const intOutcome = ir || "";
    let phoneStatus = "called";
    
    // Logic: If call fails, it's the primary reason. If it connects, show why it was disqualified (if it was).
    let outcomeReason = callOutcome;
    if (callOutcome === 'contacted' && intOutcome) {
      outcomeReason = `Contacted | ${intOutcome}`;
    } else if (!outcomeReason && intOutcome) {
      outcomeReason = intOutcome;
    }
    
    if (under18NotQualified) {
      outcomeReason = outcomeReason ? `${outcomeReason} (Under 18)` : "Under 18";
    }

    const deadCallOutcomes = ["wrong_number", "out_of_service", "no_answer", "busy", "closed"];
    const deadIntOutcomes = ["refused", "no_qualified", "not_contacted"];
    
    if (deadCallOutcomes.includes(callOutcome) || deadIntOutcomes.includes(ir) || under18NotQualified) {
      phoneStatus = "disqualified";
    } else if (ir === "postponed") {
      phoneStatus = "postponed";
    }

    if (currentNumberDoc) {
      currentNumberDoc.status = phoneStatus;
      currentNumberDoc.calledAt = new Date();
      currentNumberDoc.outcomeReason = outcomeReason;
      await currentNumberDoc.save();
    }

    io.emit("stats-update");

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// CREATE SURVEY (Admins only)
app.post("/survey", adminAuth, async (req, res) => {
  try {
    const survey = new Survey(req.body);
    await survey.save();
    res.json(survey);
  } catch (err) {
    console.error("Survey Creation Error:", err);
    res.status(500).json({ error: "Failed to create survey" });
  }
});

// UPDATE SURVEY (Admins only)
app.put("/survey/:id", adminAuth, async (req, res) => {
  try {
    const survey = await Survey.findById(req.params.id);
    if (!survey) return res.status(404).json({ error: "Survey not found" });
    if (survey.isActive !== false) {
      return res.status(400).json({ error: "Cannot edit an active campaign. Please end it first." });
    }
    Object.assign(survey, req.body);
    await survey.save();
    res.json(survey);
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

    // Fallback: If isActive doesn't exist on older documents, assume it was true and is now false
    if (survey.isActive === undefined) survey.isActive = false;
    else survey.isActive = !survey.isActive;

    await survey.save();
    res.json(survey);
  } catch (err) {
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
app.post("/response", [auth, validateResponseSubmit], async (req, res) => {
  try {
    const isStaff = req.user.role === 'admin' || req.user.role === 'quality';
    if (!isStaff && req.user.role !== "agent") {
      return res.status(403).json({ error: "Unauthorized" });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(401).json({ error: "User not found" });
    if (user.role === 'agent' && user.currentStatus !== "active") {
      return res.status(400).json({ error: "You must be active to submit a response" });
    }

    const surveyIdRaw = req.body.surveyId;
    if (surveyIdRaw == null || String(surveyIdRaw).trim() === "") {
      return res.status(400).json({ error: "Survey ID is required" });
    }
    if (!mongoose.Types.ObjectId.isValid(String(surveyIdRaw))) {
      return res.status(400).json({ error: "Invalid survey ID" });
    }

    const interviewOutcome = String(req.body.interviewOutcome || "");
    if (!interviewOutcome) {
      return res.status(400).json({ error: "Interview outcome is required" });
    }

    const qualifiedOutcomes = ["completed", "partial"];
    if (qualifiedOutcomes.includes(interviewOutcome)) {
      const elig = await getSurveyEligibilityState(user, req.body.surveyId);
      if (!elig.canStartSurvey) {
        return res.status(403).json({
          error: "Not eligible to submit qualified responses for this session",
          reason: elig.reason,
        });
      }
    }

    const { category, disqualified } = categorizeInterviewOutcome(interviewOutcome);
    let status = "completed";
    if (interviewOutcome === "partial") status = "partial";
    else if (interviewOutcome === "postponed") status = "postponed";
    else if (category === "disqualified" || disqualified) status = "disqualified";

    const now = new Date();
    // Fetch latest precall to get the serial number
    const elig = await getSurveyEligibilityState(user, req.body.surveyId);
    const serialNumber = elig.precallSerialNumber;

    const responseData = {
      surveyId: req.body.surveyId,
      answers: Array.isArray(req.body.answers) ? req.body.answers : [],
      durationSecs: typeof req.body.durationSecs === "number" ? req.body.durationSecs : 0,
      agentId: req.user.id,
      interviewOutcome,
      outcomeCategory: category,
      status,
      sessionStatusStartedAt: user.statusStartedAt,
      completedAt: now,
      serialNumber,
      outcomeReason: req.body.outcomeReason || '',
    };

    let response;
    if (serialNumber) {
      const { agentId, sessionStatusStartedAt, ...updateData } = responseData;
      response = await Response.findOneAndUpdate(
        { serialNumber },
        { $set: updateData, $setOnInsert: { agentId: responseData.agentId, sessionStatusStartedAt: responseData.sessionStatusStartedAt } },
        { upsert: true, returnDocument: 'after' }
      );
      // Sync back to PrecallCompletion so the checklist reflects the final outcome
      await PrecallCompletion.findOneAndUpdate(
        { serialNumber },
        { 
          $set: { 
            interviewOutcome, 
            outcomeCategory: category,
            outcomeReason: req.body.outcomeReason || '',
            disqualified: disqualified || false,
            'payload.interview_result': interviewOutcome,
            'payload.outcome_reason': req.body.outcomeReason || ''
          } 
        }
      );
      
      // Delete draft for this serial to prevent stale edits
      await Draft.deleteMany({ serialNumber });
      
    } else {
      response = await Response.create(responseData);
    }

    let phoneFinalStatus = status;
    if (phoneFinalStatus === "partial") phoneFinalStatus = "completed";
    if (!["completed", "disqualified", "postponed"].includes(phoneFinalStatus)) {
      phoneFinalStatus = "completed";
    }

    const phoneFilter = serialNumber 
      ? { serialNumber } 
      : { agentId: user._id, surveyId: new mongoose.Types.ObjectId(String(req.body.surveyId)) };

    await PhoneNumber.findOneAndUpdate(
      phoneFilter,
      { $set: { status: phoneFinalStatus, calledAt: now, outcomeReason: `Contacted | ${interviewOutcome}` } },
      { sort: { assignedAt: -1 } }
    );

    if (interviewOutcome === "postponed" && req.body.precallSerialNumber != null && String(req.body.precallSerialNumber).trim() !== "") {
      let sid;
      if (req.body.surveyId && mongoose.Types.ObjectId.isValid(req.body.surveyId)) {
        sid = new mongoose.Types.ObjectId(req.body.surveyId);
      }
      await PostponedSerial.create({
        agentId: user._id,
        surveyId: sid,
        statusStartedAt: user.statusStartedAt,
        serialNumber: String(req.body.precallSerialNumber),
        source: "survey",
      });
    }

    io.emit("stats-update");

    res.json(response);
  } catch (err) {
    res.status(500).json({ error: "Failed to submit response" });
  }
});

// AGENT SEARCH BY SERIAL
app.get('/agent/next-serial', auth, async (req, res) => {
  try {
    const serialNumber = await getNextSerialNumber('survey_numbers');
    res.json({ serialNumber });
  } catch (err) {
    res.status(500).json({ error: "Failed to generate serial" });
  }
});

// AGENT SEARCH BY SERIAL
app.get("/agent/search-serial/:serial", auth, async (req, res) => {
  try {
    const { serial } = req.params;
    
    // 1. Always fetch PrecallCompletion first, as it contains the checklist answers
    const precallQuery = { serialNumber: serial };
    if (req.user.role === 'agent') precallQuery.userId = req.user.id;
    const precall = await PrecallCompletion.findOne(precallQuery).sort({ completedAt: -1 }).lean();

    let mergedAnswers = precall ? { ...precall.payload } : {};

    // 2. Check Responses
    const query = { serialNumber: serial };
    if (req.user.role === 'agent') query.agentId = req.user.id;
    const response = await Response.findOne(query).sort({ completedAt: -1 }).lean();

    if (response) {
      const respAnswers = response.answers.reduce((acc, a) => ({ ...acc, [a.questionId]: a.value }), {});
      mergedAnswers = { ...mergedAnswers, ...respAnswers };
      
      const phoneNumber = await PhoneNumber.findOne({ serialNumber: serial }).lean();
      return res.json({ 
        surveyId: response.surveyId, 
        answers: mergedAnswers,
        phoneNumber: phoneNumber || { number: respAnswers['phone'] || mergedAnswers['phone'] || '' },
        status: response.status,
        isEditMode: true
      });
    }

    if (precall) {
      const phoneNumber = await PhoneNumber.findOne({ serialNumber: serial }).lean();
      return res.json({ 
        surveyId: precall.surveyId, 
        answers: mergedAnswers,
        phoneNumber: phoneNumber,
        status: precall.interviewOutcome || 'pending',
        isEditMode: true
      });
    }

    // 3. Check PhoneNumbers (Unused)
    const phoneQuery = { serialNumber: serial };
    if (req.user.role === 'agent') phoneQuery.agentId = req.user.id;
    
    const phone = await PhoneNumber.findOne(phoneQuery).lean();
    if (phone) {
      return res.json({
        surveyId: phone.surveyId,
        phoneNumber: phone,
        answers: { phone: phone.number, serial_number: phone.serialNumber },
        status: phone.status,
        isEditMode: false
      });
    }

    res.json(null);
  } catch (err) {
    console.error("Search Serial Error:", err);
    res.status(500).json({ error: "Failed to search serial" });
  }
});

// GET DRAFT
app.get("/agent/draft/:serialNumber", auth, async (req, res) => {
  try {
    const { serialNumber } = req.params;
    if (!serialNumber) {
      return res.status(400).json({ error: "serialNumber is required" });
    }

    const draft = await Draft.findOne({ agentId: req.user.id, serialNumber }).lean();
    if (!draft) {
      return res.json({ answers: {}, currentIdx: 0 });
    }

    res.json({ answers: draft.answers || {}, currentIdx: draft.currentIdx || 0 });
  } catch (err) {
    console.error("Get Draft Error:", err);
    res.status(500).json({ error: "Failed to get draft" });
  }
});

// SAVE DRAFT
app.post("/agent/draft", auth, async (req, res) => {
  try {
    const { surveyId, serialNumber, answers, currentIdx } = req.body;
    if (!surveyId || !serialNumber) {
      return res.status(400).json({ error: "surveyId and serialNumber are required" });
    }

    const draft = await Draft.findOneAndUpdate(
      { agentId: req.user.id, serialNumber },
      {
        $set: {
          surveyId,
          answers: answers || {},
          currentIdx: currentIdx || 0,
          updatedAt: new Date()
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json({ success: true, draft });
  } catch (err) {
    console.error("Save Draft Error:", err);
    res.status(500).json({ error: "Failed to save draft" });
  }
});

// HANDOVER CALL
app.post("/agent/handover", auth, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { serialNumber, targetAgentId } = req.body;
    if (!serialNumber || !targetAgentId) {
      return res.status(400).json({ error: "SerialNumber and TargetAgentId are required" });
    }

    // 1. Verify target agent
    const targetAgent = await User.findById(targetAgentId);
    if (!targetAgent || !['agent', 'quality'].includes(targetAgent.role)) {
      return res.status(404).json({ error: "Target agent not found or invalid role" });
    }

    // 2. Verify ownership of the current form/precall
    const precall = await PrecallCompletion.findOne({ serialNumber, userId: req.user.id });
    if (!precall) {
      // If no precall, check if they own the PhoneNumber record (case where handover happens before precall is saved)
      const phone = await PhoneNumber.findOne({ serialNumber, agentId: req.user.id });
      if (!phone) {
        return res.status(403).json({ error: "You do not own this call or serial number." });
      }
    }

    // 3. Perform the handovers
    await PrecallCompletion.updateMany({ serialNumber, userId: req.user.id }, { $set: { userId: targetAgentId } }, { session });
    await Response.updateMany({ serialNumber, agentId: req.user.id }, { $set: { agentId: targetAgentId } }, { session });
    await PhoneNumber.updateMany({ serialNumber, agentId: req.user.id }, { $set: { agentId: targetAgentId } }, { session });
    await Draft.updateMany({ serialNumber, agentId: req.user.id }, { $set: { agentId: targetAgentId } }, { session });

    await session.commitTransaction();
    io.emit("stats-update");
    res.json({ message: `Successfully handed over to ${targetAgent.name}` });
  } catch (err) {
    await session.abortTransaction();
    console.error("Handover Error:", err);
    res.status(500).json({ error: "Failed to perform handover" });
  } finally {
    session.endSession();
  }
});

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

    // 2. Fetch Responses
    const responses = await Response.find(filter)
      .populate('agentId', 'name email')
      .sort({ completedAt: 1 })
      .lean();

    // 3. Prepare Metadata (Question columns)
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

    const exportData = responses.map(r => {
      const row = {
        'Serial': r.serialNumber || 'N/A',
        'Submission_Date': new Date(r.completedAt || r.startedAt).toLocaleString(),
        'Status': r.status,
        'Interview_Outcome': r.interviewOutcome,
        'Agent_Name': r.agentId?.name || 'Unknown',
        'Duration_Secs': r.durationSecs || 0
      };

      questions.forEach(q => {
        const answer = r.answers.find(a => a.questionId === q.id);
        let val = answer ? answer.value : "";
        
        // Yes/No to 1/0 conversion
        const lowerVal = String(val).toLowerCase().trim();
        if (lowerVal === "yes" || lowerVal === "نعم") val = 1;
        else if (lowerVal === "no" || lowerVal === "لا") val = 0;

        row[q.text] = val;
      });
      return row;
    });

    const filenameBase = `export_${survey.title.replace(/\s+/g, "_")}_${new Date().getTime()}`;

    if (format === 'xlsx' || format === 'access') {
      const isAccess = format === 'access';
      const wb = xlsx.utils.book_new();
      const ws = xlsx.utils.json_to_sheet(exportData);
      xlsx.utils.book_append_sheet(wb, ws, "Responses");
      
      if (isAccess) {
        const csv = xlsx.utils.sheet_to_csv(ws);
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", `attachment; filename=${filenameBase}.csv`);
        res.status(200).send(csv);
        return;
      }

      const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename=${filenameBase}.xlsx`);
      res.status(200).send(buf);
      return;
    } 

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
          const answer = r.answers.find(a => a.questionId === q.id);
          let val = answer ? answer.value : "";
          
          // Yes/No to 1/0 conversion
          const lowerVal = String(val).toLowerCase().trim();
          if (lowerVal === "yes" || lowerVal === "نعم") val = 1;
          else if (lowerVal === "no" || lowerVal === "لا") val = 0;

          const isNumeric = (q.type === 'number' || q.type === 'rating' || typeof val === 'number');
          rec.push(isNumeric ? (Number(val) || 0) : String(val));
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
    res.status(500).json({ error: "Failed to generate advanced export" });
  }
});

// PHONE NUMBERS - ADMIN UPLOAD XLSX (after survey creation)
app.post('/admin/survey/:id/numbers', [adminAuth, validateSurveyId, upload.single('xlsx')], async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'XLSX file required' });
    const surveyId = req.params.id;
    const results = [];
    
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
        extractedNumbers.push(String(numberValue).trim());
      }
    }

    if (extractedNumbers.length > 0) {
      const serials = await allocateSerialBatch('survey_numbers', extractedNumbers.length);
      for (let i = 0; i < extractedNumbers.length; i++) {
        results.push({
          surveyId,
          number: extractedNumbers[i],
          status: 'pending',
          serialNumber: serials[i],
          governorate: req.body.governorate || undefined
        });
      }
    }

    console.log(`Importing ${results.length} numbers for survey ${surveyId}`);

    if (results.length > 0) {
      await PhoneNumber.insertMany(results, { ordered: false }).catch(err => {
        // Ignore duplicate errors, just keep going
        if (err.code !== 11000) console.error("InsertMany partial failure:", err.message);
      });
    }
    fs.unlinkSync(req.file.path);
    res.json({ message: `${results.length} numbers imported successfully.`, count: results.length });
  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch(e) {}
    }
    console.error("XLSX Import Critical Error:", err);
    res.status(500).json({ error: 'Import failed. High-level error: ' + err.message });
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
      return res.status(404).json({ error: 'No disqualified numbers found' });
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
    res.json({ message: 'Numbers list cleared successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to clear numbers list' });
  }
});

// AGENT NEXT NUMBER
app.get('/agent/next-number', auth, async (req, res) => {
  try {
    const isStaff = req.user.role === 'admin' || req.user.role === 'quality';
    if (!isStaff && req.user.role !== "agent") {
      return res.status(403).json({ error: "Agents only" });
    }
    const user = await User.findById(req.user.id);
    if (!user) return res.json(null);
    
    // Status check for NEW assignments (existing ones can be recovered even if status flaps)
    const isStationActive = user.currentStatus === "active";
    
    const { surveyId, governorate } = req.query;
    const query = {};
    if (surveyId && mongoose.Types.ObjectId.isValid(surveyId)) {
      query._id = new mongoose.Types.ObjectId(String(surveyId));
    } else {
      query.isActive = { $ne: false };
    }
    
    const targetSurveys = await Survey.find(query).sort({ createdAt: -1 });
    if (!targetSurveys.length) return res.json(null);
    
    let number = null;
    for (const s of targetSurveys) {
      // 1. RECOVER: Check if this agent already has a pending assigned number for this survey
      let recoveredNumber = await PhoneNumber.findOne({
        surveyId: s._id,
        agentId: user._id,
        status: 'pending'
      });
      
      if (recoveredNumber) {
        if (governorate && governorate !== 'All' && recoveredNumber.governorate !== governorate) {
          // The agent requested a different governorate. Release the current one.
          await PhoneNumber.findByIdAndUpdate(recoveredNumber._id, {
            $unset: { agentId: 1, assignedAt: 1, sessionStatusStartedAt: 1 }
          });
          recoveredNumber = null;
        } else {
          number = recoveredNumber;
        }
      }
      
      // 2. ASSIGN NEW: If not and station is active, try to find an unassigned one
      if (!number && isStationActive) {
        const assignQuery = { surveyId: s._id, status: 'pending', agentId: { $exists: false } };
        if (governorate && governorate !== 'All') {
          assignQuery.governorate = governorate;
        }
        number = await PhoneNumber.findOneAndUpdate(
          assignQuery,
          { agentId: user._id, sessionStatusStartedAt: user.statusStartedAt, assignedAt: new Date() },
          { returnDocument: 'after' }
        );
      }
      
      if (number) break;
    }

    res.json(number);
  } catch (err) {
    console.error("Next Number Error:", err);
    res.status(500).json({ error: 'Failed to assign number' });
  }
});

// AGENT MARK CALLED
app.post('/agent/mark-number/:id', auth, async (req, res) => {
  try {
    if (req.user.role !== "agent") return res.status(403).json({ error: "Agents only" });
    const { status } = req.body;
    if (!['called', 'completed', 'disqualified', 'postponed'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
    
    const number = await PhoneNumber.findOneAndUpdate(
      { _id: req.params.id, agentId: req.user.id },
      { status, calledAt: new Date() },
      { returnDocument: 'after' }
    );
    if (!number) return res.status(404).json({ error: 'Number not found' });
    res.json(number);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update number' });
  }
});

// AGENT PENDING SERIALS (NEW)
app.get("/agent/pending-serials", auth, async (req, res) => {
  try {
    if (req.user.role !== "agent") {
      return res.status(403).json({ error: "Agents only" });
    }
    const user = await User.findById(req.user.id);
    if (!user || user.currentStatus !== "active") {
      return res.json([]);
    }
    const serials = await PostponedSerial.find({
      agentId: user._id,
      statusStartedAt: user.statusStartedAt
    }).sort({ createdAt: -1 }).limit(50).lean();
    res.json(serials);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// GET AGENT STATISTICS
app.get("/stats/agents", auth, async (req, res) => {
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
app.post("/reviews/mark-seen", staffAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    user.lastSeenFeedbackAt = new Date();
    await user.save();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to update seen status" });
  }
});

// GET UNSEEN REVIEWS COUNT
app.get("/reviews/unseen-count", staffAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });
    const lastSeen = user.lastSeenFeedbackAt || new Date(0);
    // Don't count feedbacks created by the user themselves
    const count = await Review.countDocuments({ createdAt: { $gt: lastSeen }, qualityId: { $ne: user._id } });
    res.json({ count });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch unseen count" });
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

// SET DAILY GOAL
app.put("/admin/settings/dailyGoal", adminAuth, async (req, res) => {
  try {
    const { dailyGoal } = req.body;
    if (typeof dailyGoal !== 'number') return res.status(400).json({ error: "Invalid daily goal" });
    await SystemSetting.findOneAndUpdate(
      { key: 'dailyGoal' },
      { value: dailyGoal },
      { upsert: true, returnDocument: 'after' }
    );
    res.json({ success: true, dailyGoal });
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

const server = require("http").createServer(app);
const io = require("socket.io")(server, {
  cors: {
    origin: socketIoAllowedOrigins(),
    methods: ["GET", "POST"],
  },
});

// Socket.io Logic for Live Monitoring
const activeSockets = new Map(); // socketId -> userId

io.on("connection", (socket) => {
  socket.on("join-monitoring", (data) => {
    if (data.id) {
      activeSockets.set(socket.id, data.id);
    }

    // Agents join their own room, Auditors join a global auditors room
    if (data.role === 'agent') {
      socket.join(data.id);
    } else if (data.role === 'admin' || data.role === 'quality') {
      socket.join('auditors');
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