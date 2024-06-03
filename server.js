require('dotenv').config(); // This line loads the environment variables from the .env file

const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();

app.use(cors()); // Enable CORS for all routes

// Root route to prevent "Cannot GET /" error
app.get('/', (req, res) => {
  res.send('Welcome to the Proxy Server');
});

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

app.listen(3000, () => {
  console.log('Proxy server running on http://localhost:3000');
});