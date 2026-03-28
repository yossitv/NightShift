// BUG: Token expiry is not validated — expired tokens are accepted
// BUG: No secure session token support — uses plain text tokens

const tokens = new Map();

function createToken(userId) {
  // TODO: should use crypto.randomUUID() and httpOnly cookies
  const token = "tok_" + Math.random().toString(36).slice(2);
  tokens.set(token, {
    userId,
    createdAt: Date.now(),
    // BUG: expiresAt is set but never checked
    expiresAt: Date.now() + 3600_000,
  });
  return token;
}

function authenticate(req) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) return null;

  const token = header.slice(7);
  const session = tokens.get(token);
  if (!session) return null;

  // BUG: should check if token is expired
  // if (session.expiresAt < Date.now()) return null;

  return { userId: session.userId, token };
}

function revokeToken(token) {
  tokens.delete(token);
}

function getActiveSessions() {
  return Array.from(tokens.entries()).map(([token, data]) => ({
    token: token.slice(0, 8) + "...",
    userId: data.userId,
    createdAt: new Date(data.createdAt).toISOString(),
    expiresAt: new Date(data.expiresAt).toISOString(),
    // BUG: no isExpired field
  }));
}

module.exports = { createToken, authenticate, revokeToken, getActiveSessions };
