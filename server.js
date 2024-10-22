const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const config = require("./config");
const net = require("net");

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
const MIN_PORT = 5000;
const MAX_PORT = 5010;

app.set("case sensitive routing", false);
app.use("/flattrade", flattradeRoutes(storedCredentials));
app.use("/shoonya", shoonyaRoutes(storedCredentials));
app.use("/virtual", virtualRoutes());

app.get("/", (req, res) => res.send("Welcome to the Steadfast API"));

const BROKER_PORTS = {
  flattrade: 8765,
  shoonya: 8766,
};

async function findAvailablePort(startPort, endPort) {
  for (let port = startPort; port <= endPort; port++) {
    try {
      await new Promise((resolve, reject) => {
        const server = net.createServer();
        server.listen(port, () => {
          server.once('close', () => resolve(port));
          server.close();
        });
        server.on('error', reject);
      });
      return port;
    } catch (err) {
      // Port is not available, try the next one
    }
  }
  throw new Error('No available ports found');
}

async function sendToPythonServer(message) {
  const port = await findAvailablePort(MIN_PORT, MAX_PORT);
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    client.connect(port, 'localhost', () => {
      client.write(JSON.stringify(message));
    });

    client.on('data', (data) => {
      console.log('Received:', data.toString());
      client.destroy();
      resolve(data.toString());
    });

    client.on('close', () => {
      console.log('Connection closed');
    });

    client.on('error', (err) => {
      console.error('Connection error:', err);
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
      await sendToPythonServer({ action: 'set_broker', broker: selectedBroker });

      const port = BROKER_PORTS[broker];
      res.json({
        message: `Selected broker set to ${selectedBroker}, WebSocket running on port ${port}`,
      });
    } catch (error) {
      console.error('Error sending broker selection:', error);
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

module.exports = app;
