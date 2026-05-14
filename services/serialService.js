const Counter = require('../models/Counter');

/**
 * Atomic sequential serial number generator.
 * Uses MongoDB findOneAndUpdate with $inc so concurrent requests always get unique values.
 * @param {string} id - counter bucket (default: 'survey_numbers')
 * @returns {string} zero-padded 7-digit serial, e.g. "0001234"
 */
async function getNextSerialNumber(id = 'survey_numbers') {
  const counter = await Counter.findOneAndUpdate(
    { id },
    { $inc: { seq: 1 } },
    { returnDocument: 'after', upsert: true }
  );
  return String(counter.seq).padStart(7, '0');
}

module.exports = { getNextSerialNumber };
