const express = require('express');
const router = express.Router();
const { addSSEClient } = require('../sse');

// GET /api/events - Server-Sent Events endpoint
router.get('/events', (req, res) => {
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // nginx support

  // Send initial connection event
  res.write(`event: connected\ndata: ${JSON.stringify({ time: new Date().toISOString() })}\n\n`);

  // Register this client
  addSSEClient(res);

  // Heartbeat every 30 seconds to keep connection alive
  const heartbeat = setInterval(() => {
    try {
      res.write(`event: heartbeat\ndata: ${JSON.stringify({ time: new Date().toISOString() })}\n\n`);
    } catch (_) {
      clearInterval(heartbeat);
    }
  }, 30000);

  // Cleanup on disconnect
  req.on('close', () => {
    clearInterval(heartbeat);
  });
});

module.exports = router;
