// Simple test runner for the demo app
const assert = require("assert");
const { createToken, authenticate, revokeToken } = require("../src/auth");
const { db } = require("../src/db");

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ✗ ${name}: ${err.message}`);
  }
}

console.log("Running tests...\n");

// Auth tests
test("createToken returns a token string", () => {
  const token = createToken("usr_001");
  assert(typeof token === "string");
  assert(token.startsWith("tok_"));
});

test("authenticate returns user for valid token", () => {
  const token = createToken("usr_002");
  const req = { headers: { authorization: `Bearer ${token}` } };
  const user = authenticate(req);
  assert(user !== null);
  assert.strictEqual(user.userId, "usr_002");
});

test("authenticate returns null for invalid token", () => {
  const req = { headers: { authorization: "Bearer invalid_token" } };
  const user = authenticate(req);
  assert.strictEqual(user, null);
});

test("authenticate returns null for missing header", () => {
  const req = { headers: {} };
  const user = authenticate(req);
  assert.strictEqual(user, null);
});

test("revokeToken removes token", () => {
  const token = createToken("usr_003");
  revokeToken(token);
  const req = { headers: { authorization: `Bearer ${token}` } };
  assert.strictEqual(authenticate(req), null);
});

// DB tests
test("db has initial records", () => {
  assert(db.records.length >= 3);
});

test("db settings default to light theme", () => {
  assert.strictEqual(db.settings.theme, "light");
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
