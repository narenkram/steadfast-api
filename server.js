require("dotenv").config(); // This line loads the environment variables from the .env file

const express = require("express");
const cors = require("cors");
const { createProxyMiddleware } = require("http-proxy-middleware");
const axios = require("axios");
const sdk = require("dhanhq"); // Import the DhanHQ SDK
const fs = require("fs");
const csv = require("fast-csv");

const app = express();

app.use(cors({
  origin: 'http://localhost:5173', // Replace with your frontend's URL
  credentials: true
})); // Enable CORS for your frontend's origin
app.use(express.json()); // To parse JSON bodies

// Initialize the DhanHQ client
const ACCESS_TOKEN = process.env.DHAN_API_TOKEN;
const DHAN_CLIENT_ID = String(process.env.DHAN_CLIENT_ID);

const client = new sdk.DhanHqClient({
  accessToken: ACCESS_TOKEN,
  env: "DEV",
});

// Root route to prevent "Cannot GET /" error
app.get("/", (req, res) => {
  res.send("Welcome to the Proxy Server");
});

// Proxy configuration for Dhan API
app.use(
  "/api",
  createProxyMiddleware({
    target: "https://api.dhan.co",
    changeOrigin: true,
    pathRewrite: {
      "^/api": "",
    },
    onProxyReq: (proxyReq, req, res) => {
      // Log the headers to verify they are set correctly
      console.log("Proxying request to:", proxyReq.path);
      console.log("Request headers:", req.headers);
    },
    onProxyRes: (proxyRes, req, res) => {
      console.log("Received response with status:", proxyRes.statusCode);
    },
    onError: (err, req, res) => {
      console.error("Proxy Error:", err);
      res.status(500).json({ message: "Error in proxying request" });
    },
  })
);

// Custom route to handle API requests and bypass CORS
app.get("/fundlimit", async (req, res) => {
  try {
    const options = {
      method: "GET",
      url: "https://api.dhan.co/fundlimit",
      headers: {
        "access-token": process.env.DHAN_API_TOKEN, // Set the API token from environment variables
        Accept: "application/json",
      },
    };
    const response = await axios(options);
    res.json(response.data);
  } catch (error) {
    console.error("Failed to fetch fund limit:", error);
    res.status(500).json({ message: "Failed to fetch fund limit" });
  }
});

app.get("/symbols", (req, res) => {
  const { exchangeSymbol, masterSymbol } = req.query;
  const callStrikes = [];
  const putStrikes = [];
  const expiryDates = new Set();

  fs.createReadStream("./api-scrip-master.csv")
    .pipe(csv.parse({ headers: true }))
    .on("data", (row) => {
      if (
        row["SEM_EXM_EXCH_ID"] === exchangeSymbol &&
        row["SEM_TRADING_SYMBOL"].startsWith(masterSymbol + "-")
      ) {
        if (["OPTIDX", "OP"].includes(row["SEM_EXCH_INSTRUMENT_TYPE"])) {
          const strikeData = {
            tradingSymbol: row["SEM_TRADING_SYMBOL"],
            expiryDate: row["SEM_EXPIRY_DATE"],
            securityId: row["SEM_SMST_SECURITY_ID"],
          };
          if (row["SEM_OPTION_TYPE"] === "CE") {
            callStrikes.push(strikeData);
          } else if (row["SEM_OPTION_TYPE"] === "PE") {
            putStrikes.push(strikeData);
          }
          expiryDates.add(row["SEM_EXPIRY_DATE"]);
        }
      }
    })
    .on("end", () => {
      res.json({
        callStrikes,
        putStrikes,
        expiryDates: Array.from(expiryDates),
      });
    })
    .on("error", (error) => {
      res.status(500).json({ message: "Failed to process CSV file" });
    });
});

// Modified route to place an order to include securityId from the request
app.post("/placeOrder", async (req, res) => {
  const {
    dhanClientId,
    transactionType,
    exchangeSegment,
    productType,
    orderType,
    validity,
    tradingSymbol,
    securityId,
    quantity,
    price,
    drvExpiryDate,
    drvOptionType,
  } = req.body;

  const options = {
    method: "POST",
    url: "https://api.dhan.co/orders",
    headers: {
      "access-token": process.env.DHAN_API_TOKEN,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    data: {
      dhanClientId,
      transactionType,
      exchangeSegment,
      productType,
      orderType,
      validity,
      tradingSymbol,
      securityId,
      quantity,
      price,
      drvExpiryDate,
      drvOptionType,
    },
  };

  console.log("Sending request with body:", options.data);

  try {
    const response = await axios(options);
    res.json(response.data);
  } catch (error) {
    // Check if the error response has data and a message, then send it
    if (
      error.response &&
      error.response.data &&
      error.response.data.internalErrorMessage
    ) {
      res
        .status(error.response.status)
        .json({ message: error.response.data.internalErrorMessage });
    } else {
      // Fallback if the error response does not contain the expected format
      res
        .status(500)
        .json({ message: "Failed to place order due to an unexpected error" });
    }
  }
});

// Example route using the DhanHQ SDK
app.get("/holdings", async (req, res) => {
  try {
    const response = await client.getHoldings();
    res.json(response);
  } catch (error) {
    console.error("Failed to fetch holdings:", error);
    res.status(500).json({ message: "Failed to fetch holdings" });
  }
});

// New endpoint to fetch DHAN_CLIENT_ID
app.get("/dhanClientId", (req, res) => {
  res.json({ dhanClientId: DHAN_CLIENT_ID });
});

// New endpoint for Kill Switch
app.use(express.json()); // Make sure this middleware is used before any routes

app.post("/killSwitch", async (req, res) => {
  const killSwitchStatus = req.query.killSwitchStatus; // Get from query parameters

  console.log("Received killSwitchStatus:", killSwitchStatus); // Log the received status

  if (!["ACTIVATE", "DEACTIVATE"].includes(killSwitchStatus)) {
    return res.status(400).json({
      message:
        'Invalid killSwitchStatus value. Must be either "ACTIVATE" or "DEACTIVATE".',
    });
  }

  const options = {
    method: "POST",
    url: "https://api.dhan.co/killSwitch",
    headers: {
      "access-token": process.env.DHAN_API_TOKEN,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    params: {
      // Send as query parameters to the Dhan API
      killSwitchStatus,
    },
  };

  try {
    const response = await axios(options);
    res.json(response.data);
  } catch (error) {
    console.error("Failed to activate Kill Switch:", error);
    res.status(500).json({
      message: "Failed to activate Kill Switch",
      error: error.response.data,
    });
  }
});

// Route to get orders
app.get("/getOrders", async (req, res) => {
  const options = {
    method: "GET",
    url: "https://api.dhan.co/orders",
    headers: {
      "access-token": process.env.DHAN_API_TOKEN, // Set the API token from environment variables
      Accept: "application/json",
    },
  };

  try {
    const response = await axios(options);
    res.json(response.data);
  } catch (error) {
    console.error("Failed to fetch orders:", error);
    res.status(500).json({ message: "Failed to fetch orders" });
  }
});

// New route to fetch positions
app.get("/positions", async (req, res) => {
  const options = {
    method: "GET",
    url: "https://api.dhan.co/positions",
    headers: {
      "access-token": process.env.DHAN_API_TOKEN, // Use the API token from environment variables
      Accept: "application/json",
    },
  };

  try {
    const response = await axios(options);
    res.json(response.data);
  } catch (error) {
    console.error("Failed to fetch positions:", error);
    res.status(500).json({ message: "Failed to fetch positions" });
  }
});

app.listen(3000, () => {
  console.log("Proxy server running on http://localhost:3000");
});
