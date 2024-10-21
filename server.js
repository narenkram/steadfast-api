const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const config = require("./config");
const { spawn } = require("child_process");

const flattradeRoutes = require("./routes/flattrade");
const shoonyaRoutes = require("./routes/shoonya");
const virtualRoutes = require("./routes/virtual");

const app = express();

app.use(cors(config.corsHeaders));

app.use(express.json());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

require("dotenv").config();

let storedCredentials = {
  flattrade: { usersession: "", userid: "" },
  shoonya: { usersession: "", userid: "" },
};

let selectedBroker = "";
let websocketProcess = null;

app.set("case sensitive routing", false);
app.use("/flattrade", flattradeRoutes(storedCredentials));
app.use("/shoonya", shoonyaRoutes(storedCredentials));
app.use("/virtual", virtualRoutes());

app.get("/", (req, res) => res.send("Welcome to the Steadfast API"));

const BROKER_PORTS = {
  flattrade: 8765,
  shoonya: 8766,
};

app.post("/set-broker", (req, res) => {
  const { broker } = req.body;
  if (broker && (broker === "flattrade" || broker === "shoonya")) {
    selectedBroker = broker;

    // Kill existing WebSocket process if it exists
    if (websocketProcess) {
      websocketProcess.kill();
    }

    const port = BROKER_PORTS[broker];

    // Start new WebSocket process
    websocketProcess = spawn("python", ["../steadfast-websocket/main.py"], {
      env: {
        ...process.env,
        SELECTED_BROKER: selectedBroker,
        WS_PORT: port.toString(),
      },
    });

    websocketProcess.stdout.on("data", (data) => {
      console.log(
        `[${selectedBroker.toUpperCase()}] WebSocket output: ${data}`
      );
    });

    websocketProcess.stderr.on("data", (data) => {
      console.error(
        `[${selectedBroker.toUpperCase()}] WebSocket error: ${data}`
      );
    });

    res.json({
      message: `Selected broker set to ${selectedBroker}, WebSocket running on port ${port}`,
    });
  } else {
    res.status(400).json({ message: "Invalid broker selection" });
  }
});

app.use((err, req, res, next) => {
  console.error("Error details:", err);
  console.error("Stack trace:", err.stack);
  res.status(500).json({
    message: "An error occurred on the server",
    error: err.message,
  });
});

app.listen(config.port, config.host, () => {
  console.log(`Server is running on http://${config.host}:${config.port}`);
});

module.exports = app;
