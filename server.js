const express = require("express");
const cors = require("cors");
const { createProxyMiddleware } = require("http-proxy-middleware");
const axios = require("axios");
const fs = require("fs");
const csv = require("fast-csv");
const unzipper = require("unzipper");
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

// At the top of your file, add this to store the credentials
let storedCredentials = {
  flattrade: {
    usersession: "",
    userid: "",
  },
  shoonya: {
    usersession: "",
    userid: "",
  }
};
// Update the POST endpoint to store the credentials
app.post("/api/set-flattrade-credentials", (req, res) => {
  console.log("Received POST request to set credentials");
  const { usersession, userid } =
    req.body;

  // Store the credentials 
  storedCredentials.flattrade = {
    usersession,
    userid
  };

  res.json({ message: "Flattrade Credentials updated successfully" });
  console.log(`${new Date().toLocaleTimeString()}  Updated Flattrade credentials`);
});
// Add a new POST endpoint to set Shoonya credentials
app.post("/api/set-shoonya-credentials", (req, res) => {
  console.log(
    "Received POST request to set Shoonya credentials"
  );
  const { usersession, userid } =
    req.body;

  // Store the Shoonya credentials and security IDs
  storedCredentials.shoonya = {
    usersession,
    userid
  };

  res.json({ message: "Shoonya Credentials updated successfully" });
  console.log(`${new Date().toLocaleTimeString()}  Updated Shoonya credentials`);
});

// Update the GET endpoint to use the stored credentials
app.get("/flattrade-websocket-data", (req, res) => {
  // console.log("Received GET request for flattrade websocket data");

  // Use the stored credentials
  const websocketData = {
    usersession: storedCredentials.flattrade.usersession,
    userid: storedCredentials.flattrade.userid,
  };

  res.json(websocketData);
  console.log(`${new Date().toLocaleTimeString()}  Sending Flattrade websocket data`);
});
// Add a new GET endpoint to retrieve Shoonya websocket data
app.get("/shoonya-websocket-data", (req, res) => {
  // console.log("Received GET request for Shoonya websocket data");

  // Use the stored Shoonya credentials and security IDs
  const websocketData = {
    usersession: storedCredentials.shoonya.usersession,
    userid: storedCredentials.shoonya.userid,
  };

  res.json(websocketData);
  console.log("Sending Shoonya websocket data:");
});
// All Flattrade API Endpoints
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
    res
    .status(500)
    .json({ message: "Error fetching Flattrade fund limits", error: error.message });
    console.error("Error fetching Flattrade fund limits:", error);
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
    console.log(`\nFlattrade Order Place details:`, { exch, tsym, qty, prc, prd, trantype, prctyp, ret }, response.data);
  } catch (error) {
    res
    .status(500)
    .json({ message: "Error placing Flattrade Place order", error: error.message });
    console.error("Error placing Flattrade Place order:", error);
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
      console.log("\nFinished processing file");
      console.log(`Call Strikes: ${callStrikes.length}`);
      console.log(`Put Strikes: ${putStrikes.length}`);
      console.log(`Expiry Dates: ${expiryDates.size}`);

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
      res.status(500).json({ message: "Failed to process Flattrade CSV file" });
      console.error("Error processing Flattrade CSV file:", error);
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
    res.status(500).json({
      message: "Error fetching Flattrade orders and trades",
      error: error.message,
    });
    console.error("Error fetching Flattrade orders and trades:", error);
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
    console.log(`\n Flattrade Cancel Order:`, { norenordno }, response.data);
  } catch (error) {
    res
    .status(500)
    .json({ message: "Error cancelling Flattrade order", error: error.message });
    console.error("Error cancelling Flattrade order:", error);
  }
});

// All Shoonya API Endpoints
// Broker Shoonya - Proxy configuration for Shoonya API
app.use(
  "/shoonyaApi",
  createProxyMiddleware({
    target: "https://api.shoonya.com",
    changeOrigin: true,
    pathRewrite: {
      "^/shoonyaApi": "", // remove /shoonyaApi prefix when forwarding to target
    },
  })
);
// Broker Shoonya - Get Funds
app.post("/shoonyaFundLimit", async (req, res) => {
  const jKey = req.query.SHOONYA_API_TOKEN;
  const clientId = req.query.SHOONYA_CLIENT_ID;

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
      "https://api.shoonya.com/NorenWClientTP/Limits",
      payload,
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );
    res.json(response.data);
  } catch (error) {
    res
    .status(500)
    .json({ message: "Error fetching Shoonya fund limits", error: error.message });
    console.error("Error fetching Shoonya fund limits:", error);
  }
});
// Broker Shoonya - Get Symbols
app.get("/shoonyaSymbols", (req, res) => {
  const bfoSymbolMapping = {
    SENSEX: "BSXOPT",
    BANKEX: "BKXOPT",
    SENSEX50: "SX50OPT",
  };

  const { exchangeSymbol, masterSymbol } = req.query;
  const callStrikes = [];
  const putStrikes = [];
  const expiryDates = new Set();

  let zipFilePath;
  if (exchangeSymbol === "BFO") {
    zipFilePath = path.join(__dirname, "BFO_symbols.txt.zip");
  } else if (exchangeSymbol === "NFO") {
    zipFilePath = path.join(__dirname, "NFO_symbols.txt.zip");
  } else {
    return res
      .status(400)
      .json({ message: "Invalid exchangeSymbol. Must be 'BFO' or 'NFO'." });
  }

  fs.createReadStream(zipFilePath)
    .pipe(unzipper.Parse())
    .on("entry", (entry) => {
      const fileName = entry.path;
      if (fileName.endsWith(".txt")) {
        entry
          .pipe(csv.parse({ headers: true, delimiter: "," }))
          .on("data", (row) => {
            let symbolMatches;
            if (exchangeSymbol === "BFO") {
              const mappedSymbol =
                bfoSymbolMapping[masterSymbol] || masterSymbol;
              symbolMatches = row["Symbol"].startsWith(mappedSymbol);
            } else {
              symbolMatches = row["Symbol"] === masterSymbol;
            }

            if (row["Exchange"] === exchangeSymbol && symbolMatches) {
              const strikeData = {
                tradingSymbol: row["TradingSymbol"],
                securityId: row["Token"],
                expiryDate: row["Expiry"],
                strikePrice: row["StrikePrice"],
              };
              if (row["OptionType"] === "CE") {
                callStrikes.push(strikeData);
              } else if (row["OptionType"] === "PE") {
                putStrikes.push(strikeData);
              }
              expiryDates.add(row["Expiry"]);
            }
          })
          .on("end", () => {
            console.log("\nFinished processing file");
            console.log(`Call Strikes: ${callStrikes.length}`);
            console.log(`Put Strikes: ${putStrikes.length}`);
            console.log(`Expiry Dates: ${expiryDates.size}`);

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
              expiryDates: sortedExpiryDates,
            });
          });
      } else {
        entry.autodrain();
      }
    })
    .on("error", (error) => {
      res
      .status(500)
      .json({ message: "Failed to process Shoonya zip file", error: error.message });
      console.error(`Error processing Shoonya zip file ${zipFilePath}:`, error);
    });
});
// Broker Shoonya - Route to place an order to include securityId from the request
app.post("/shoonyaPlaceOrder", async (req, res) => {
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
      "https://api.shoonya.com/NorenWClientTP/PlaceOrder",
      payload,
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );
    res.json(response.data);
    console.log(`\nFlattrade Order Place details:`, { exch, tsym, qty, prc, prd, trantype, prctyp, ret }, response.data);
  } catch (error) {
    res
    .status(500)
    .json({ message: "Error placing Shoonya Place order", error: error.message });
    console.error("Error placing Shoonya Place order:", error);
  }
});
// Broker Shoonya - Get Orders and Trades
app.get("/shoonyaGetOrdersAndTrades", async (req, res) => {
  const jKey = req.query.SHOONYA_API_TOKEN;
  const clientId = req.query.SHOONYA_CLIENT_ID;

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
      "https://api.shoonya.com/NorenWClientTP/OrderBook",
      orderBookPayload,
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    // Fetch Trade Book
    const tradeBookRes = await axios.post(
      "https://api.shoonya.com/NorenWClientTP/TradeBook",
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
    res.status(500).json({
      message: "Error fetching Shoonya orders and trades",
      error: error.message,
    });
    console.error("Error fetching Shoonya orders and trades:", error);
  }
});
// Broker Shoonya - Route to cancel an order
app.post("/shoonyaCancelOrder", async (req, res) => {
  const { norenordno, uid } = req.body;
  const jKey = req.query.SHOONYA_API_TOKEN;

  if (!jKey) {
    return res
      .status(400)
      .json({ message: "Token is missing. Please generate a token first." });
  }

  const jData = JSON.stringify({ norenordno, uid });
  const payload = `jKey=${jKey}&jData=${jData}`;

  try {
    const response = await axios.post(
      "https://api.shoonya.com/NorenWClientTP/CancelOrder",
      payload,
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );
    res.json(response.data);
    console.log(`\n Flattrade Cancel Order:`, { norenordno }, response.data);
  } catch (error) {
    res
    .status(500)
    .json({ message: "Error cancelling Shoonya order", error: error.message });
    console.error("Error cancelling Shoonya order:", error);
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
