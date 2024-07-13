const express = require("express");
const cors = require("cors");
const { createProxyMiddleware } = require("http-proxy-middleware");
const axios = require("axios");
const fs = require("fs");
const csv = require("fast-csv");
const path = require("path");
const bodyParser = require("body-parser");
const { parse, isBefore } = require("date-fns"); // Add this line to import date-fns for date parsing and comparison

const app = express();

// Debugging middleware
app.use((req, res, next) => {
  console.log(`Received ${req.method} request for ${req.url}`);
  next();
});

// Enable CORS for your frontend's origin
app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true,
  })
);

app.use(express.json());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true })); // Add this line to parse URL-encoded data

require("dotenv").config();

app.get("/brokers", (req, res) => {
  res.json(brokers);
});

// All Flattrade API Endpoints
// Send Credentials for Manage Brokers
app.get("/api/flattrade-credentials", (req, res) => {
  res.json({
    apiKey: FLATTRADE_API_KEY,
    apiSecret: FLATTRADE_API_SECRET,
    clientId: FLATTRADE_CLIENT_ID,
  });
});

// At the top of your file, add this to store the credentials
let storedCredentials = {
  usersession: "",
  userid: "",
  defaultCallSecurityId: "",
  defaultPutSecurityId: "",
};
// Update the POST endpoint to store the credentials and security IDs
app.post("/api/set-flattrade-credentials", (req, res) => {
  console.log("Received POST request to set credentials and security IDs");
  const { usersession, userid, defaultCallSecurityId, defaultPutSecurityId } =
    req.body;

  // Store the credentials and security IDs
  storedCredentials = {
    usersession,
    userid,
    defaultCallSecurityId,
    defaultPutSecurityId,
  };

  console.log("Updated credentials and security IDs:", storedCredentials);
  res.json({ message: "Credentials and security IDs updated successfully" });
});

// Update the GET endpoint to use the stored credentials and security IDs
app.get("/flattrade-websocket-data", (req, res) => {
  console.log("Received GET request for flattrade websocket data");

  // Use the stored credentials and security IDs
  const websocketData = {
    usersession: storedCredentials.usersession,
    userid: storedCredentials.userid,
    defaultCallSecurityId: storedCredentials.defaultCallSecurityId,
    defaultPutSecurityId: storedCredentials.defaultPutSecurityId,
  };

  console.log("Sending websocket data:", websocketData);

  res.json(websocketData);
});

// Broker Flattrade - Proxy configuration for Flattrade API
app.use(
  "/flattradeApi",
  createProxyMiddleware({
    target: "https://authapi.flattrade.in",
    changeOrigin: true,
    pathRewrite: {
      "^/flattradeApi": "", // remove /flattradeApi prefix when forwarding to target
    },
  })
);
// Broker Flattrade - Get Funds
app.post("/flattradeFundLimit", async (req, res) => {
  const jKey = req.query.FLATTRADE_API_TOKEN;
  const clientId = req.query.FLATTRADE_CLIENT_ID;

  if (!jKey || !clientId) {
    return res
      .status(400)
      .json({ message: "API token or Client ID is missing." });
  }

  const jData = JSON.stringify({
    uid: clientId,
    actid: clientId,
  });
  const payload = `jKey=${jKey}&jData=${jData}`;

  try {
    const response = await axios.post(
      "https://piconnect.flattrade.in/PiConnectTP/Limits",
      payload,
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );
    res.json(response.data);
  } catch (error) {
    console.error("Error fetching fund limits:", error);
    res
      .status(500)
      .json({ message: "Error fetching fund limits", error: error.message });
  }
});
// Broker Flattrade - Route to place an order to include securityId from the request
app.post("/flattradePlaceOrder", async (req, res) => {
  const { uid, actid, exch, tsym, qty, prc, prd, trantype, prctyp, ret } =
    req.body;

  const jKey = req.headers.authorization?.split(" ")[1];

  if (!jKey) {
    return res
      .status(400)
      .json({ message: "Token is missing. Please generate a token first." });
  }

  const jData = JSON.stringify({
    uid,
    actid,
    exch,
    tsym,
    qty,
    prc,
    prd,
    trantype,
    prctyp,
    ret,
  });

  // const payload = `jKey=${jKey}&jData=${encodeURIComponent(jData)}`; // Not sure if we need this version, so keep it.
  const payload = `jKey=${jKey}&jData=${jData}`;

  try {
    const response = await axios.post(
      "https://piconnect.flattrade.in/PiConnectTP/PlaceOrder",
      payload,
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );
    res.json(response.data);
  } catch (error) {
    console.error("Error placing order:", error);
    res
      .status(500)
      .json({ message: "Error placing order", error: error.message });
  }
});
// Broker Flattrade - Get Symbols
app.get("/flattradeSymbols", (req, res) => {
  const { exchangeSymbol, masterSymbol } = req.query;
  const callStrikes = [];
  const putStrikes = [];
  const expiryDates = new Set();

  const csvFilePath =
    exchangeSymbol === "BFO"
      ? "./Bfo_Index_Derivatives.csv"
      : "./Nfo_Index_Derivatives.csv";

  fs.createReadStream(csvFilePath)
    .pipe(csv.parse({ headers: true }))
    .on("data", (row) => {
      if (
        row["Symbol"] === masterSymbol &&
        row["Exchange"] === exchangeSymbol
      ) {
        const strikeData = {
          tradingSymbol: row["Tradingsymbol"],
          securityId: row["Token"],
          expiryDate: row["Expiry"], // Send expiry date without parsing or formatting
          strikePrice: row["Strike"],
        };
        if (row["Optiontype"] === "CE") {
          callStrikes.push(strikeData);
        } else if (row["Optiontype"] === "PE") {
          putStrikes.push(strikeData);
        }
        expiryDates.add(row["Expiry"]);
      }
    })
    .on("end", () => {
      console.log("Call Strikes:", callStrikes); // Log the callStrikes array
      console.log("Put Strikes:", putStrikes); // Log the putStrikes array
      console.log("Expiry Dates:", Array.from(expiryDates)); // Log the expiryDates set

      // Filter out past dates and sort the remaining expiry dates
      const today = new Date();
      const sortedExpiryDates = Array.from(expiryDates)
        .filter(
          (dateStr) =>
            !isBefore(parse(dateStr, "dd-MMM-yyyy", new Date()), today) ||
            parse(dateStr, "dd-MMM-yyyy", new Date()).toDateString() ===
              today.toDateString()
        )
        .sort((a, b) => {
          const dateA = parse(a, "dd-MMM-yyyy", new Date());
          const dateB = parse(b, "dd-MMM-yyyy", new Date());
          return dateA - dateB;
        });

      res.json({
        callStrikes,
        putStrikes,
        expiryDates: sortedExpiryDates, // Send the sorted expiry dates
      });
    })
    .on("error", (error) => {
      console.error("Error processing CSV file:", error); // Log any errors
      res.status(500).json({ message: "Failed to process CSV file" });
    });
});
// Broker Flattrade - Get Orders and Trades
app.get("/flattradeGetOrdersAndTrades", async (req, res) => {
  const jKey = req.query.FLATTRADE_API_TOKEN;
  const clientId = req.query.FLATTRADE_CLIENT_ID;

  if (!jKey || !clientId) {
    return res.status(400).json({ message: "Token or Client ID is missing." });
  }

  const orderBookPayload = `jKey=${jKey}&jData=${JSON.stringify({
    uid: clientId,
    prd: "M",
  })}`;
  const tradeBookPayload = `jKey=${jKey}&jData=${JSON.stringify({
    uid: clientId,
    actid: clientId,
  })}`;

  try {
    // Fetch Order Book
    const orderBookRes = await axios.post(
      "https://piconnect.flattrade.in/PiConnectTP/OrderBook",
      orderBookPayload,
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    // Fetch Trade Book
    const tradeBookRes = await axios.post(
      "https://piconnect.flattrade.in/PiConnectTP/TradeBook",
      tradeBookPayload,
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    res.json({
      orderBook: orderBookRes.data,
      tradeBook: tradeBookRes.data,
    });
  } catch (error) {
    console.error("Error fetching orders and trades:", error);
    res.status(500).json({
      message: "Error fetching orders and trades",
      error: error.message,
    });
  }
});
// Broker Flattrade - Route to cancel an order
app.post("/flattradeCancelOrder", async (req, res) => {
  const { norenordno, uid } = req.body;
  const jKey = req.query.FLATTRADE_API_TOKEN;

  if (!jKey) {
    return res
      .status(400)
      .json({ message: "Token is missing. Please generate a token first." });
  }

  const jData = JSON.stringify({ norenordno, uid });
  const payload = `jKey=${jKey}&jData=${jData}`;

  try {
    const response = await axios.post(
      "https://piconnect.flattrade.in/PiConnectTP/CancelOrder",
      payload,
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );
    res.json(response.data);
  } catch (error) {
    console.error("Error cancelling order:", error);
    res
      .status(500)
      .json({ message: "Error cancelling order", error: error.message });
  }
});

// All Dhan API Endpoints
// Send Dhan API credentials
app.get("/api/dhan-credentials", (req, res) => {
  res.json({
    apiToken: DHAN_ACCESS_TOKEN,
    clientId: DHAN_CLIENT_ID,
  });
});
// Broker Dhan - Proxy configuration for Dhan API
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

// Broker Dhan - Get Funds
app.get("/dhanFundLimit", async (req, res) => {
  const dhanApiToken = req.query.DHAN_API_TOKEN;

  if (!dhanApiToken) {
    return res.status(400).json({ message: "Dhan API is missing." });
  }

  try {
    const options = {
      method: "GET",
      url: "https://api.dhan.co/fundlimit",
      headers: {
        "access-token": dhanApiToken,
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

// Broker Dhan - Get Symbols
app.get("/dhanSymbols", (req, res) => {
  const { exchangeSymbol, masterSymbol } = req.query;
  const callStrikes = [];
  const putStrikes = [];
  const expiryDates = new Set();

  fs.createReadStream("./api-scrip-master.csv")
    .pipe(csv.parse({ headers: true }))
    .on("data", (row) => {
      if (
        row["SEM_EXM_EXCH_ID"] === exchangeSymbol &&
        new RegExp(`^${masterSymbol} `).test(row["SEM_CUSTOM_SYMBOL"]) // Use regex to match masterSymbol followed by a space
      ) {
        if (["OPTIDX", "OP"].includes(row["SEM_EXCH_INSTRUMENT_TYPE"])) {
          const strikeData = {
            tradingSymbol: row["SEM_CUSTOM_SYMBOL"],
            expiryDate: row["SEM_EXPIRY_DATE"].split(" ")[0], // Remove time from expiry date
            securityId: row["SEM_SMST_SECURITY_ID"],
            strikePrice: row["SEM_STRIKE_PRICE"],
          };
          if (row["SEM_OPTION_TYPE"] === "CE") {
            callStrikes.push(strikeData);
          } else if (row["SEM_OPTION_TYPE"] === "PE") {
            putStrikes.push(strikeData);
          }
          expiryDates.add(row["SEM_EXPIRY_DATE"].split(" ")[0]); // Remove time from expiry date
        }
      }
    })
    .on("end", () => {
      const today = new Date();
      const sortedExpiryDates = Array.from(expiryDates)
        .filter((dateStr) => {
          const parsedDate = parse(dateStr, "yyyy-MM-dd", new Date());
          return (
            !isBefore(parsedDate, today) ||
            parsedDate.toDateString() === today.toDateString()
          );
        })
        .sort((a, b) => {
          const dateA = parse(a, "yyyy-MM-dd", new Date());
          const dateB = parse(b, "yyyy-MM-dd", new Date());
          return dateA - dateB;
        });

      res.json({
        callStrikes,
        putStrikes,
        expiryDates: sortedExpiryDates,
      });
    })
    .on("error", (error) => {
      res.status(500).json({ message: "Failed to process CSV file" });
    });
});

// Broker Dhan - Route to place an order to include securityId from the request
app.post("/dhanPlaceOrder", async (req, res) => {
  const {
    brokerClientId,
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
      brokerClientId,
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
    console.error("Failed to place order:", error);
    res.status(500).json({ message: "Failed to place order" });
  }
});

// Broker Dhan - Endpoint for Kill Switch
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

// Broker Dhan - Route to get orders
app.get("/dhanGetOrders", async (req, res) => {
  const dhanApiToken = req.query.DHAN_API_TOKEN;

  if (!dhanApiToken) {
    return res.status(400).json({ message: "Dhan API is missing." });
  }

  const options = {
    method: "GET",
    url: "https://api.dhan.co/orders",
    headers: {
      "access-token": dhanApiToken, // Set the API token from environment variables
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

// Broker Dhan - Route to fetch positions
app.get("/dhanPositions", async (req, res) => {
  const dhanApiToken = req.query.DHAN_API_TOKEN;

  if (!dhanApiToken) {
    return res.status(400).json({ message: "Dhan API is missing." });
  }

  const options = {
    method: "GET",
    url: "https://api.dhan.co/positions",
    headers: {
      "access-token": dhanApiToken, // Use the API token from environment variables
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

// Broker Dhan - Route to cancel an order
app.delete("/dhanCancelOrder", async (req, res) => {
  const { orderId } = req.body;

  if (!orderId) {
    return res.status(400).json({ message: "orderId is required" });
  }

  const options = {
    method: "DELETE",
    url: `https://api.dhan.co/orders/${orderId}`,
    headers: {
      "access-token": process.env.DHAN_API_TOKEN,
      Accept: "application/json",
    },
  };

  try {
    const { data } = await axios.request(options);
    res.json(data);
  } catch (error) {
    console.error("Failed to cancel order:", error);
    res.status(500).json({ message: "Failed to cancel order" });
  }
});

// Root route to prevent "Cannot GET /" error
app.get("/", (req, res) => {
  res.send("Welcome to the Proxy Server");
});
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
