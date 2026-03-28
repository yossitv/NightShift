const { getActiveSessions } = require("./auth");

function handleSessions(req, res, user) {
  // BUG: should filter to only show current user's sessions
  // BUG: no way to delete expired sessions
  const sessions = getActiveSessions();
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ sessions }));
}

module.exports = { handleSessions };
