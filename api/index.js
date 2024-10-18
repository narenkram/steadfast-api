const app = require("../server.js");

module.exports = async (req, res) => {
  await app.ready();
  app(req, res);
};
