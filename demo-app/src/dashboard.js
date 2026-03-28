const { db } = require("./db");

function handleDashboard(req, res, user) {
  // BUG: no recent activity card — just returns raw data
  // TODO: should return the 5 most recent user actions
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({
    userCount: db.users.length,
    recordCount: db.records.length,
    settings: db.settings,
    // TODO: add recentActivity array
  }));
}

module.exports = { handleDashboard };
