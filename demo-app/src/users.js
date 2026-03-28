const { db } = require("./db");

function handleUsers(req, res, user) {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ users: db.users }));
}

module.exports = { handleUsers };
