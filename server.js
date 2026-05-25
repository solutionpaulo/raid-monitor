const express = require('express');
const path = require('path');
const { initDatabase, getDb } = require('./src/database/init');
const { startScheduler, stopScheduler } = require('./src/monitor/scheduler');
const { collectData } = require('./src/monitor/collector');
const apiRoutes = require('./src/routes/api');
const sseRoutes = require('./src/routes/sse');
const config = require('./src/config');
const queries = require('./src/database/queries');
const log = require('./src/logger');

const app = express();
let server = null;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api', apiRoutes);
app.use('/api', sseRoutes);

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Initialize and start
async function start() {
  log.info('');
  log.info('  ╔══════════════════════════════════════╗');
  log.info('  ║      RAID Monitor - Dynamic Disks    ║');
  log.info('  ╚══════════════════════════════════════╝');
  log.info('');

  // Initialize database
  await initDatabase();

  // Periodic data cleanup
  const cleanupInterval = setInterval(() => {
    try {
      queries.cleanupOldData(config.retentionDays);
    } catch (err) {
      log.error('[Cleanup] ' + err.message);
    }
  }, 24 * 60 * 60 * 1000); // Run once per day

  // Start scheduler
  startScheduler(collectData);

  // Start HTTP server
  server = app.listen(config.port, config.host, () => {
    log.info('');
    log.info(`  Dashboard: http://${config.host}:${config.port}`);
    log.info(`  Check interval: ${config.checkIntervalSeconds}s`);
    log.info(`  Demo mode: ${config.demoMode ? 'ON' : 'OFF'}`);
    log.info(`  Email alerts: ${config.smtpEnabled ? 'ON' : 'OFF'}`);
    log.info(`  Webhook alerts: ${config.webhookEnabled ? 'ON' : 'OFF'}`);
    log.info('');
  });

  // Graceful shutdown
  const shutdown = async (signal) => {
    log.info(`\n[Shutdown] Received ${signal}, shutting down gracefully...`);
    stopScheduler();
    clearInterval(cleanupInterval);
    if (server) {
      server.close(() => {
        log.info('[Shutdown] HTTP server closed');
      });
    }
    const db = getDb();
    if (db) {
      db.close((err) => {
        if (err) log.error('[Shutdown] Error closing DB: ' + err.message);
        else log.info('[Shutdown] Database closed');
        process.exit(0);
      });
    } else {
      process.exit(0);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((err) => {
  log.error('Failed to start: ' + err);
  process.exit(1);
});
