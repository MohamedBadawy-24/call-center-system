require("dotenv").config(); const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");

const connectDB = require("./config/db");
const Survey = require("./models/Survey");
const Response = require("./models/Response");
const User = require("./models/User");
const ProfileRequest = require("./models/ProfileRequest");
const StatusLog = require("./models/StatusLog");
const mongoose = require("mongoose");
const { auth, adminAuth, staffAuth } = require("./middleware/auth");
const sendEmail = require("./utils/mailer");

const app = express();

// Connect MongoDB
connectDB();

app.use(cors());
app.use(express.json());

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
app.post("/auth/register", async (req, res) => {
  try {
    const { name, email, password, role } = req.body;


    // Default system seed logic: First user is allowed to register, otherwise must be Admin
    const userCount = await User.countDocuments();
    if (userCount > 0) {
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
      role: role || 'agent'
    });

    await user.save();
    res.json({ message: "User registered successfully" });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// AUTH: LOGIN
app.post("/auth/login", async (req, res) => {
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
    res.json({ user: req.user });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// AUTH: FORGOT PASSWORD
app.post("/auth/forgot-password", async (req, res) => {
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
app.post("/auth/reset-password", async (req, res) => {
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
    const { status } = req.body;
    if (!['active', 'preparing', 'break', 'off-duty'].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
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
    user.statusStartedAt = now;
    await user.save();

    // 3. Create new status log
    const newLog = new StatusLog({
      userId: user.id,
      status: status,
      startTime: now
    });
    await newLog.save();

    // Broadcast update for real-time dashboards
    io.emit('stats-update');

    res.json({ 
      message: "Status updated", 
      status: user.currentStatus, 
      statusStartedAt: user.statusStartedAt 
    });
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
        $project: {
          title: 1,
          isActive: 1,
          createdAt: 1,
          totalHandled: { $size: '$responses' },
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
                input: '$responses',
                as: 'r',
                cond: { $eq: ['$$r.status', 'disqualified'] }
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
app.get("/survey/:id", auth, async (req, res) => {
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
app.post("/response", auth, async (req, res) => {
  try {
    const response = new Response({
      ...req.body,
      agentId: req.user.id // Stamp the agent who did this
    });
    await response.save();
    
    // Broadcast update for real-time dashboards
    io.emit('stats-update');
    
    res.json(response);
  } catch (err) {
    res.status(500).json({ error: "Failed to submit response" });
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
        const val = answer ? answer.value.replace(/"/g, '""').replace(/\n/g, " ") : "";
        row.push(`"${val}"`);
      });

      csvContent += row.join(",") + "\n";
    });

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename=export_${survey.title.replace(/\s+/g, "_")}.csv`);
    res.status(200).send(csvContent);
  } catch (err) {
    console.error("Export Error:", err);
    res.status(500).json({ error: "Failed to generate export" });
  }
});

// GET AGENT STATISTICS
app.get("/stats/agents", auth, async (req, res) => {
  try {
    const filter = (req.user.role === 'admin' || req.user.role === 'quality') 
      ? { role: 'agent' } 
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
        $project: {
          agentName: '$name',
          agentEmail: '$email',
          role: '$role',
          currentStatus: 1,
          statusStartedAt: 1,
          totalSurveys: { $size: '$responses' },
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
                input: '$responses',
                as: 'r',
                cond: { $eq: ['$$r.status', 'disqualified'] }
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

const server = require("http").createServer(app);
const io = require("socket.io")(server, {
  cors: {
    origin: ["http://localhost:3001", "http://127.0.0.1:3001"],
    methods: ["GET", "POST"]
  }
});

// Socket.io Logic for Live Monitoring
io.on("connection", (socket) => {
  socket.on("join-monitoring", (data) => {
    // Agents join their own room, Auditors join a global auditors room
    if (data.role === 'agent') {
      socket.join(data.id);
    } else if (data.role === 'admin' || data.role === 'quality') {
      socket.join('auditors');
    }
  });

  socket.on("screen-data", (data) => {
    // Specifically broadcast to the auditors room
    io.to('auditors').emit("stream-data", data);
  });

  socket.on("disconnect", () => {
    // Auto-cleanup handled by Socket.io
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server (with Real-time Support) running on http://localhost:${PORT}`);
});