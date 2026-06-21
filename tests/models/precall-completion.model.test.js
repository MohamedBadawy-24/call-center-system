/**
 * tests/models/precall-completion.model.test.js
 * Unit tests for the PrecallCompletion mongoose model schema & validation rules
 */
const mongoose = require('mongoose');
const PrecallCompletion = require('../../models/PrecallCompletion');

describe('PrecallCompletion Model Schema & Validation', () => {
  it('HAPPY: Valid PrecallCompletion passes validation', () => {
    const pc = new PrecallCompletion({
      userId: new mongoose.Types.ObjectId(),
      statusStartedAt: new Date(),
      surveyId: new mongoose.Types.ObjectId(),
      interviewOutcome: 'completed',
      serialNumber: 'SR123'
    });

    const err = pc.validateSync();
    expect(err).toBeUndefined();
  });

  it('VALIDATION: Required fields (userId, statusStartedAt)', () => {
    const pc = new PrecallCompletion({});
    const err = pc.validateSync();
    expect(err).not.toBeUndefined();
    expect(err.errors.userId).toBeDefined();
    expect(err.errors.statusStartedAt).toBeDefined();
  });

  it('VALIDATION: outcomeCategory must match enum', () => {
    const pc = new PrecallCompletion({
      userId: new mongoose.Types.ObjectId(),
      statusStartedAt: new Date(),
      outcomeCategory: 'invalid-category'
    });

    const err = pc.validateSync();
    expect(err).not.toBeUndefined();
    expect(err.errors.outcomeCategory).toBeDefined();
    expect(err.errors.outcomeCategory.kind).toBe('enum');
  });

  it('DEFAULTS: Check default schema values', () => {
    const pc = new PrecallCompletion({
      userId: new mongoose.Types.ObjectId(),
      statusStartedAt: new Date()
    });

    expect(pc.completedAt).toBeDefined();
    expect(pc.outcomeCategory).toBe('qualified');
    expect(pc.disqualified).toBe(false);
    expect(pc.under18NotQualified).toBe(false);
    expect(pc.interviewDate).toBe('');
  });

  it('UNIQUE: Sparse unique serial number validation in DB', async () => {
    const userId = new mongoose.Types.ObjectId();
    const statusStartedAt = new Date();
    
    // Create one document with serial 'SR_DUP'
    await PrecallCompletion.create({
      userId,
      statusStartedAt,
      serialNumber: 'SR_DUP'
    });

    // Attempting to create another with the same serialNumber must fail
    await expect(
      PrecallCompletion.create({
        userId,
        statusStartedAt,
        serialNumber: 'SR_DUP'
      })
    ).rejects.toThrow();
  });
});
