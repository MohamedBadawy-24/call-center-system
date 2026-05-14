const mongoose = require("mongoose");

/**
 * The StatusLog model acts as a timecard system for agents.
 * It records exactly when an agent switches states (e.g., Active, On Break, Preparing)
 * to provide highly accurate duration metrics for workforce management and payroll.
 */
const StatusLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['active', 'preparing', 'break', 'off-duty'], required: true },
  startTime: { type: Date, default: Date.now },
  endTime: { type: Date },
  durationSecs: { type: Number, default: 0 },
  breakReason: { type: String, enum: ['Lunch', 'Meeting'], default: null },
});

StatusLogSchema.index({ userId: 1, startTime: -1 });

module.exports = mongoose.model("StatusLog", StatusLogSchema);
