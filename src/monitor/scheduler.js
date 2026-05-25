const config = require('../config');
const log = require('../logger');

let scheduledTask = null;
let isRunning = false;
let collectFn = null;

/**
 * Start the periodic check scheduler.
 * @param {Function} collectDataFn - The data collection function to call
 */
function startScheduler(collectDataFn) {
  collectFn = collectDataFn;
  const intervalSec = config.checkIntervalSeconds;

  scheduledTask = setInterval(runCheck, intervalSec * 1000);
  log.info(`[Scheduler] Running every ${intervalSec}s`);

  // Run first check immediately
  log.info('[Scheduler] Running initial check...');
  runCheck();
}

/**
 * Stop the scheduler.
 */
function stopScheduler() {
  if (scheduledTask) {
    clearInterval(scheduledTask);
    scheduledTask = null;
    log.info('[Scheduler] Stopped');
  }
}

/**
 * Run a single check. Prevents overlapping executions.
 */
async function runCheck() {
  if (isRunning) {
    log.debug('[Scheduler] Check already in progress, skipping');
    return null;
  }

  isRunning = true;
  try {
    const result = await collectFn();
    log.info(`[Scheduler] Check complete: ${result.overallStatus} (${result.responseTimeMs}ms)`);
    return result;
  } catch (err) {
    log.error('[Scheduler] Check failed: ' + err.message);
    return null;
  } finally {
    isRunning = false;
  }
}

/**
 * Force a manual check (bypasses the lock for manual triggers).
 */
async function forceCheck() {
  if (isRunning) {
    return { error: 'Check already in progress' };
  }
  return runCheck();
}

/**
 * Get scheduler status.
 */
function getSchedulerStatus() {
  return {
    running: !!scheduledTask,
    checking: isRunning,
    intervalSeconds: config.checkIntervalSeconds,
  };
}

module.exports = { startScheduler, stopScheduler, forceCheck, getSchedulerStatus };
