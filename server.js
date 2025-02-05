const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const config = require("./config");
const net = require("net");

const flattradeRoutes = require("./routes/flattrade");
const shoonyaRoutes = require("./routes/shoonya");
const virtualRoutes = require("./routes/virtual");
const fileUpdates = require('./routes/fileUpdates');

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
const pythonServerPort = 5000; // Choose an available port

app.set("case sensitive routing", false);
app.use("/flattrade", flattradeRoutes(storedCredentials));
app.use("/shoonya", shoonyaRoutes(storedCredentials));
app.use("/virtual", virtualRoutes());

app.get("/", (req, res) => res.send("Welcome to the Steadfast API"));

const BROKER_PORTS = {
  flattrade: 8765,
  shoonya: 8766,
};

function sendToPythonServer(message) {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    client.connect(pythonServerPort, "localhost", () => {
      client.write(JSON.stringify(message));
    });

    client.on("data", (data) => {
      console.log("Received:", data.toString());
      client.destroy();
      resolve(data.toString());
    });

    client.on("close", () => {
      console.log("Connection closed");
    });

    client.on("error", (err) => {
      console.error("Connection error:", err);
      reject(err);
    });
  });
}

app.post("/set-broker", async (req, res) => {
  const { broker } = req.body;
  if (broker && (broker === "flattrade" || broker === "shoonya")) {
    selectedBroker = broker;

    try {
      // Send the broker selection to the Python server
      await sendToPythonServer({
        action: "set_broker",
        broker: selectedBroker,
      });

      const port = BROKER_PORTS[broker];
      res.json({
        message: `Selected broker set to ${selectedBroker}, WebSocket running on port ${port}`,
      });
    } catch (error) {
      console.error("Error sending broker selection:", error);
      res.status(500).json({ message: "Error setting broker" });
    }
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

// Code To Download Updated Instrument files everyday after 7am IST(1:30am UTC). 
(async () => {
    // Flattrade
    await fileUpdates.checkAndUpdateFiles('flattrade');
    // Shoonya
    await fileUpdates.checkAndUpdateFiles('shoonya');
})();

module.exports = app;
