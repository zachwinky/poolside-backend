const express = require('express');
const app = express();

app.use(express.json());

app.all('*', (req, res) => {
  res.json({
    message: 'Poolside API is working!',
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString()
  });
});

module.exports = app;
