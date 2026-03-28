const { authenticate } = require("./auth");
const { handleUsers } = require("./users");
const { handleSessions } = require("./sessions");
const { handleRecords } = require("./records");
const { handleSignup } = require("./signup");
const { handleSettings } = require("./settings");
const { handleDashboard } = require("./dashboard");

function router(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;
  const method = req.method;

  // Public routes
  if (path === "/signup" && method === "POST") return handleSignup(req, res);
  if (path === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ status: "ok" }));
  }

  // Auth-protected routes
  const user = authenticate(req);
  if (!user) {
    res.writeHead(401, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Unauthorized" }));
  }

  if (path === "/api/users") return handleUsers(req, res, user);
  if (path === "/api/sessions") return handleSessions(req, res, user);
  if (path === "/api/records" && method === "GET") return handleRecords(req, res, user);
  if (path === "/api/records/delete-all" && method === "DELETE") return handleRecords(req, res, user);
  if (path === "/api/settings") return handleSettings(req, res, user);
  if (path === "/api/dashboard") return handleDashboard(req, res, user);

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
}

module.exports = { router };
