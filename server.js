require('dotenv').config(); // This line loads the environment variables from the .env file

const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');
const axios = require('axios');
const sdk = require('dhanhq'); // Import the DhanHQ SDK
const fs = require('fs');
const csv = require('csv-parser');

const app = express();

app.use(cors()); // Enable CORS for all routes
app.use(express.json()); // To parse JSON bodies

// Initialize the DhanHQ client
const ACCESS_TOKEN = process.env.DHAN_API_TOKEN;
const DHAN_CLIENT_ID = process.env.DHAN_CLIENT_ID;

const client = new sdk.DhanHqClient({
  accessToken: ACCESS_TOKEN,
  env: 'DEV'
});

// Root route to prevent "Cannot GET /" error
app.get('/', (req, res) => {
  res.send('Welcome to the Proxy Server');
});

// Proxy configuration for Dhan API
app.use('/api', createProxyMiddleware({
  target: 'https://api.dhan.co',
  changeOrigin: true,
  pathRewrite: {
    '^/api': '',
  },
  onProxyReq: (proxyReq, req, res) => {
    // Log the headers to verify they are set correctly
    console.log('Proxying request to:', proxyReq.path);
    console.log('Request headers:', req.headers);
  },
  onProxyRes: (proxyRes, req, res) => {
    console.log('Received response with status:', proxyRes.statusCode);
  },
  onError: (err, req, res) => {
    console.error('Proxy Error:', err);
    res.status(500).json({ message: 'Error in proxying request' });
  }
}));

// Custom route to handle API requests and bypass CORS
app.get('/fundlimit', async (req, res) => {
  try {
    const options = {
      method: 'GET',
      url: 'https://api.dhan.co/fundlimit',
      headers: {
        'access-token': process.env.DHAN_API_TOKEN, // Set the API token from environment variables
        'Accept': 'application/json'
      }
    };
    const response = await axios(options);
    res.json(response.data);
  } catch (error) {
    console.error('Failed to fetch fund limit:', error);
    res.status(500).json({ message: 'Failed to fetch fund limit' });
  }
});


// Modified route to fetch symbols from CSV including securityId
app.get('/symbols', (req, res) => {
  const { selectedExchange, masterSymbol, drvExpiryDate } = req.query;
  const results = [];

  if (!selectedExchange) {
    return res.status(400).json({ message: 'No selectedExchange provided' });
  }

  if (!masterSymbol) {
    return res.status(400).json({ message: 'No masterSymbol provided' });
  }

  fs.createReadStream('./api-scrip-master.csv')
    .pipe(csv())
    .on('data', (data) => {
      if (data.SEM_EXM_EXCH_ID === selectedExchange &&
          data.SEM_INSTRUMENT_NAME === "OPTIDX" &&
          data.SEM_EXCH_INSTRUMENT_TYPE === "OP" &&
          data.SEM_TRADING_SYMBOL.includes(masterSymbol) &&
          (!drvExpiryDate || data.SEM_EXPIRY_DATE === drvExpiryDate)) { // Apply drvExpiryDate filter only if provided
        results.push({
          tradingSymbol: data.SEM_TRADING_SYMBOL,
          drvExpiryDate: data.SEM_EXPIRY_DATE,
          securityId: data.SEM_SMST_SECURITY_ID
        });
      }
    })
    .on('end', () => {
      console.log('Symbols fetched:', results); // Log the results
      res.json(results);
    })
    .on('error', (error) => {
      console.error('Error reading CSV file:', error);
      res.status(500).json({ message: 'Failed to read symbols from CSV' });
    });
});

// Modified route to place an order to include securityId from the request
app.post('/placeOrder', async (req, res) => {
  const { exchangeSegment, symbol, quantity, orderType, productType, price, validity, transactionType, drvOptionType, drvExpiryDate, securityId } = req.body;

  const options = {
    method: 'POST',
    url: 'https://api.dhan.co/orders',
    headers: {
      'access-token': process.env.DHAN_API_TOKEN,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    data: {
      "dhanClientId": String(process.env.DHAN_CLIENT_ID),
      "transactionType": transactionType,
      "exchangeSegment": exchangeSegment,
      "productType": "INTRADAY",
      "orderType": "LIMIT",
      "validity": "DAY",
      "tradingSymbol": symbol,
      "securityId": securityId, // Use the securityId from the request
      "quantity": quantity,
      "price": price,
      "drvExpiryDate": drvExpiryDate,
      "drvOptionType": drvOptionType
    }
  };

  try {
    const response = await axios(options);
    res.json(response.data);
  } catch (error) {
    console.error('Error placing order:', error);
    res.status(500).json({ message: 'Failed to place order' });
  }
});

// Example route using the DhanHQ SDK
app.get('/holdings', async (req, res) => {
  try {
    const response = await client.getHoldings();
    res.json(response);
  } catch (error) {
    console.error('Failed to fetch holdings:', error);
    res.status(500).json({ message: 'Failed to fetch holdings' });
  }
});

// New endpoint to fetch DHAN_CLIENT_ID
app.get('/dhanClientId', (req, res) => {
  res.json({ dhanClientId: DHAN_CLIENT_ID });
});

// New endpoint for Kill Switch
app.use(express.json()); // Make sure this middleware is used before any routes

app.post('/killSwitch', async (req, res) => {
  const killSwitchStatus = req.query.killSwitchStatus; // Get from query parameters

  console.log('Received killSwitchStatus:', killSwitchStatus); // Log the received status

  if (!['ACTIVATE', 'DEACTIVATE'].includes(killSwitchStatus)) {
    return res.status(400).json({ message: 'Invalid killSwitchStatus value. Must be either "ACTIVATE" or "DEACTIVATE".' });
  }

  const options = {
    method: 'POST',
    url: 'https://api.dhan.co/killSwitch',
    headers: {
      'access-token': process.env.DHAN_API_TOKEN,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    params: { // Send as query parameters to the Dhan API
      killSwitchStatus
    }
  };

  try {
    const response = await axios(options);
    res.json(response.data);
  } catch (error) {
    console.error('Failed to activate Kill Switch:', error);
    res.status(500).json({ message: 'Failed to activate Kill Switch', error: error.response.data });
  }
});

// Route to get orders
app.get('/getOrders', async (req, res) => {
  const options = {
    method: 'GET',
    url: 'https://api.dhan.co/orders',
    headers: {
      'access-token': process.env.DHAN_API_TOKEN, // Set the API token from environment variables
      'Accept': 'application/json'
    }
  };

  try {
    const response = await axios(options);
    res.json(response.data);
  } catch (error) {
    console.error('Failed to fetch orders:', error);
    res.status(500).json({ message: 'Failed to fetch orders' });
  }
});

// New route to fetch positions
app.get('/positions', async (req, res) => {
  const options = {
    method: 'GET',
    url: 'https://api.dhan.co/positions',
    headers: {
      'access-token': process.env.DHAN_API_TOKEN, // Use the API token from environment variables
      'Accept': 'application/json'
    }
  };

  try {
    const response = await axios(options);
    res.json(response.data);
  } catch (error) {
    console.error('Failed to fetch positions:', error);
    res.status(500).json({ message: 'Failed to fetch positions' });
  }
});

app.listen(3000, () => {
  console.log('Proxy server running on http://localhost:3000');
});