const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const config = require("./config");

const flattradeRoutes = require("./routes/flattrade");
const shoonyaRoutes = require("./routes/shoonya");
const virtualRoutes = require("./routes/virtual");

const app = express();

app.use(cors({ origin: config.corsOrigin, credentials: true }));
app.use(express.json());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

require("dotenv").config();

let storedCredentials = {
  flattrade: { usersession: "", userid: "" },
  shoonya: { usersession: "", userid: "" },
};

app.set("case sensitive routing", false);
app.use("/flattrade", flattradeRoutes(storedCredentials));
app.use("/shoonya", shoonyaRoutes(storedCredentials));
app.use("/virtual", virtualRoutes());

app.get("/", (req, res) => res.send("Welcome to the Steadfast API"));

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send("Something broke!");
});

if (process.env.NODE_ENV !== "production") {
  app.listen(config.port, config.host, () => {
    console.log(`Server is running on http://${config.host}:${config.port}`);
  });
} else {
  app.ready = () => Promise.resolve();
}

module.exports = app;
