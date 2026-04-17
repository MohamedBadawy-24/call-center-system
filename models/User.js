const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['agent', 'admin', 'quality'], default: 'agent' },
  resetCode: { type: String },
  resetCodeExpires: { type: Date },
  emailVerificationCode: { type: String },
  emailVerificationExpires: { type: Date },
  currentStatus: { type: String, enum: ['active', 'preparing', 'break', 'off-duty'], default: 'off-duty' },
  statusStartedAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("User", UserSchema);
