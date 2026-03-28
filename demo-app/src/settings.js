const { db } = require("./db");

function handleSettings(req, res, user) {
  if (req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ settings: db.settings }));
  }

  if (req.method === "PATCH") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const updates = JSON.parse(body);
        // BUG: no validation — can set theme to any value
        // BUG: dark mode toggle not implemented
        Object.assign(db.settings, updates);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ settings: db.settings }));
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON" }));
      }
    });
    return;
  }

  res.writeHead(405, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Method not allowed" }));
}

module.exports = { handleSettings };
