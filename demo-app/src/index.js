const http = require("http");
const { router } = require("./router");

const PORT = process.env.PORT || 4000;

const server = http.createServer((req, res) => {
  router(req, res);
});

server.listen(PORT, () => {
  console.log(`Demo app running on port ${PORT}`);
});

module.exports = { server };
