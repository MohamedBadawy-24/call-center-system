/**
 * tests/models/user.model.test.js
 * Unit tests for the User mongoose model schema & validation rules
 */
const mongoose = require('mongoose');
const User = require('../../models/User');

describe('User Model Schema & Validation', () => {
  it('HAPPY: Valid user schema input passes validation', async () => {
    const user = new User({
      name: 'Valid User',
      email: 'valid-user@test.invalid',
      password: 'password123',
      role: 'agent',
      researcherCode: '  R123  '
    });

    const err = user.validateSync();
    expect(err).toBeUndefined();
    expect(user.researcherCode).toBe('R123'); // trim rule
  });

  it('VALIDATION: Required fields (name, email, password)', () => {
    const user = new User({});
    const err = user.validateSync();
    expect(err).not.toBeUndefined();
    expect(err.errors.name).toBeDefined();
    expect(err.errors.email).toBeDefined();
    expect(err.errors.password).toBeDefined();
  });

  it('VALIDATION: Role must match enum', () => {
    const user = new User({
      name: 'Test',
      email: 'test@test.invalid',
      password: 'pass',
      role: 'invalid-role'
    });

    const err = user.validateSync();
    expect(err).not.toBeUndefined();
    expect(err.errors.role).toBeDefined();
    expect(err.errors.role.kind).toBe('enum');
  });

  it('VALIDATION: currentStatus and currentBreakReason enums', () => {
    const user = new User({
      name: 'Test',
      email: 'test@test.invalid',
      password: 'pass',
      currentStatus: 'invalid-status',
      currentBreakReason: 'invalid-reason'
    });

    const err = user.validateSync();
    expect(err).not.toBeUndefined();
    expect(err.errors.currentStatus).toBeDefined();
    // currentBreakReason field is checked as well
    expect(err.errors.currentBreakReason).toBeDefined();
  });

  it('DEFAULTS: Check default values on empty fields', () => {
    const user = new User({
      name: 'Test',
      email: 'test@test.invalid',
      password: 'pass'
    });

    expect(user.role).toBe('agent');
    expect(user.currentStatus).toBe('off-duty');
    expect(user.suspended).toBe(false);
    expect(user.researcherCode).toBeNull();
    expect(user.precallCompletedForActiveSession).toBe(false);
    expect(user.statusStartedAt).toBeDefined();
  });

  it('UNIQUE: Email uniqueness constraint in DB', async () => {
    const email = `unique-${Date.now()}@test.invalid`;
    await User.create({ name: 'User1', email, password: 'password' });

    await expect(
      User.create({ name: 'User2', email, password: 'password' })
    ).rejects.toThrow();
  });
});
