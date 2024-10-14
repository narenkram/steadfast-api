const express = require("express");
const router = express.Router();
const cors = require("cors");
const bodyParser = require("body-parser");

const flattradeRoutes = require("./routes/flattrade");
const shoonyaRoutes = require("./routes/shoonya");
const virtualRoutes = require("./routes/virtual");

const app = express();

// Update the CORS configuration to allow connections from any origin
app.use(cors({ origin: "*", credentials: true }));
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

app.get("/", (req, res) => res.send("Welcome to the Proxy Server"));

const PORT = 3000;
// Change HOST to '0.0.0.0' to allow connections from any IP address
const HOST = "0.0.0.0";

app.listen(PORT, HOST, () => {
  console.log(`Server is running on http://${HOST}:${PORT}`);
});