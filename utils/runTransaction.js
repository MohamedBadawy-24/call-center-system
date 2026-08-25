const mongoose = require('mongoose');

/**
 * Error codes / messages that indicate transactions are not supported
 * (standalone mongod, not a replica set or mongos).
 *
 * Two forms surface in practice:
 *  1. Direct error  — code 20 "Transaction numbers are only allowed on a replica set…"
 *  2. Wrapped error — driver wraps the above as "does not support retryable writes"
 *     The original error is nested under err.originalError (code 20) or
 *     err.errorResponse.originalError.
 */
const TXNS_NOT_SUPPORTED_CODES = new Set([20, 117, 263]);
const TXNS_NOT_SUPPORTED_MSGS  = [
  'Transaction numbers are only allowed on a replica set member or mongos',
  'Only servers in a sharded cluster can start a new transaction',
  'does not support retryable writes',
  'This MongoDB deployment does not support retryable writes',
];

function isTransactionUnsupported(err, _depth = 0) {
  if (!err || _depth > 4) return false;

  // Check code directly on this error
  if (TXNS_NOT_SUPPORTED_CODES.has(err.code)) return true;
  if (err.codeName === 'IllegalOperation') return true;

  // Check err.errorResponse (used by some MongoDB driver versions)
  if (err.errorResponse) {
    if (TXNS_NOT_SUPPORTED_CODES.has(err.errorResponse.code)) return true;
    if (err.errorResponse.originalError &&
        isTransactionUnsupported(err.errorResponse.originalError, _depth + 1)) return true;
  }

  // Check err.message
  if (err.message && TXNS_NOT_SUPPORTED_MSGS.some(m => err.message.includes(m))) return true;

  // Walk the wrapper chain: err.originalError (MongoDB driver wraps the real error)
  if (err.originalError && isTransactionUnsupported(err.originalError, _depth + 1)) return true;

  return false;
}

/**
 * Runs `work` inside a MongoDB transaction when possible.
 * Falls back to running the work WITHOUT a session/transaction when the
 * server does not support transactions (e.g. standalone mongod in dev/test).
 *
 * @param {(session: import('mongoose').ClientSession | null) => Promise<T>} work
 * @returns {Promise<T>}
 */
async function runTransaction(work) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } catch (err) {
    if (isTransactionUnsupported(err)) {
      // Standalone MongoDB: retry without a session so writes still happen.
      return work(null);
    }
    throw err;
  } finally {
    await session.endSession().catch(() => {});
  }
}

module.exports = { runTransaction };
