// BUG: No email validation — empty email is accepted
// BUG: No password length check — "a" is accepted as password

const { createToken } = require("./auth");
const { db } = require("./db");

function handleSignup(req, res) {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    try {
      const { email, password, name } = JSON.parse(body);

      // BUG: should validate email format
      // BUG: should check password minimum length (8 chars)

      if (!email || !password) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "Email and password required" }));
      }

      const userId = "usr_" + Math.random().toString(36).slice(2, 8);
      db.users.push({ id: userId, email, name: name || "", createdAt: new Date().toISOString() });

      const token = createToken(userId);

      res.writeHead(201, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ userId, token }));
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid JSON" }));
    }
  });
}

module.exports = { handleSignup };
