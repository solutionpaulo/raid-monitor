const log = require('./logger');

let sseClients = [];

function addSSEClient(res) {
  sseClients.push(res);
  res.on('close', () => {
    sseClients = sseClients.filter((c) => c !== res);
  });
}

function broadcastSSE(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach((client) => {
    try {
      client.write(payload);
    } catch (_) { /* client disconnected */ }
  });
}

function getClientCount() {
  return sseClients.length;
}

module.exports = { addSSEClient, broadcastSSE, getClientCount };
