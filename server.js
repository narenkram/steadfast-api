require('dotenv').config(); // This line loads the environment variables from the .env file

const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');
const axios = require('axios');
const sdk = require('dhanhq'); // Import the DhanHQ SDK

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

// Route to place an order
app.post('/placeOrder', async (req, res) => {
  const { symbol, quantity, orderType, productType, price, validity } = req.body;

  const options = {
    method: 'POST',
    url: 'https://api.dhan.co/orders',
    headers: {
      'access-token': process.env.DHAN_API_TOKEN,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    data: {
      "dhanClientId": String(process.env.DHAN_CLIENT_ID), // Explicitly cast to string
      "transactionType": "BUY",
      "exchangeSegment": "NSE_FNO",
      "productType": "INTRADAY",
      "orderType": "LIMIT",
      "validity": "DAY",
      "tradingSymbol": "NIFTY-Jun2024-21700-CE",
      "securityId": "36957",
      "quantity": 25,
      "price": 10,
      "drvExpiryDate": "2024-06-06 14:30:00",
      "drvOptionType": "CALL"
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


app.listen(3000, () => {
  console.log('Proxy server running on http://localhost:3000');
});