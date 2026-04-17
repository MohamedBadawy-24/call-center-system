const mongoose = require("mongoose");

const StatusLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['active', 'preparing', 'break', 'off-duty'], required: true },
  startTime: { type: Date, default: Date.now },
  endTime: { type: Date },
  durationSecs: { type: Number, default: 0 },
});

module.exports = mongoose.model("StatusLog", StatusLogSchema);
