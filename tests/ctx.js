/**
 * Reads the shared test context written by globalSetup.
 * Every test file imports this instead of calling setup() directly.
 */
const fs = require("fs");

const CTX_FILE = process.env.JEST_SHARED_CTX || "/tmp/jest-shared-ctx.json";

let _ctx = null;

function getCtx() {
  if (_ctx) return _ctx;
  if (!fs.existsSync(CTX_FILE)) {
    throw new Error(
      `Shared context file not found: ${CTX_FILE}\n` +
        "Run the full jest suite (not a single file in isolation) or set JEST_SHARED_CTX.",
    );
  }
  _ctx = JSON.parse(fs.readFileSync(CTX_FILE, "utf8"));
  return _ctx;
}

module.exports = getCtx;
