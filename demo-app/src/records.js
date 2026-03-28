const { db } = require("./db");

function handleRecords(req, res, user) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "DELETE" && url.pathname === "/api/records/delete-all") {
    // BUG: No confirmation required — deletes everything immediately
    // BUG: No authorization check — any user can delete all records
    db.records = [];
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ deleted: true }));
  }

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ records: db.records }));
}

module.exports = { handleRecords };
