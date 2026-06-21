/**
 * DIAGNOSTIC - OtherCoding.js
 * New collection model representing mappings from raw "other:..." answers to custom numeric/categorical codes.
 *
 * Fields: surveyId, questionId, codings (array of {answer, value}), lastUpdatedBy, updatedAt.
 */
const mongoose = require('mongoose');

const CodingItemSchema = new mongoose.Schema({
  answer: { type: String, required: true },
  value: { type: String, default: '' }
}, { _id: false });

const OtherCodingSchema = new mongoose.Schema({
  surveyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Survey', required: true, index: true },
  questionId: { type: String, required: true },
  codings: [CodingItemSchema],
  lastUpdatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  updatedAt: { type: Date, default: Date.now }
});

// Compound index for unique campaign/question coding
OtherCodingSchema.index({ surveyId: 1, questionId: 1 }, { unique: true });

module.exports = mongoose.model('OtherCoding', OtherCodingSchema);
