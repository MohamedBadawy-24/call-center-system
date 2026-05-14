const mongoose = require("mongoose");

/**
 * The Counter model is used to generate sequential serial numbers.
 * It stores a sequence value for a given identifier (e.g. "survey_responses").
 */
const CounterSchema = new mongoose.Schema({
  id: { 
    type: String, 
    required: true, 
    unique: true 
  },
  seq: { 
    type: Number, 
    default: 0 
  }
});

module.exports = mongoose.model("Counter", CounterSchema);
