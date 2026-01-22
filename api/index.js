const express = require('express');
const cors = require('cors');

const app = express();

// CORS
app.use(cors({ origin: true, credentials: true }));

// Parse JSON
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Root
app.get('/', (req, res) => {
  res.json({ name: 'Poolside Code API', status: 'running' });
});

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Not found', path: req.path });
});

module.exports = app;
