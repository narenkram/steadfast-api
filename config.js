const config = {
  development: {
    port: 3000,
    host: "localhost",
    corsOrigin: "http://localhost:5173",
  },
  production: {
    port: process.env.PORT || 3000,
    host: "0.0.0.0",
    corsOrigin: [
      "https://steadfastapp.in",
      "https://www.steadfastapp.in",
      "https://api.steadfastapp.in",
    ],
  },
};

module.exports = config[process.env.NODE_ENV || "development"];
