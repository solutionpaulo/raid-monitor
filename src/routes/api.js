const express = require('express');
const router = express.Router();
const queries = require('../database/queries');
const { forceCheck, getSchedulerStatus } = require('../monitor/scheduler');
const { runDiskpart } = require('../executor/runner');
const { getRepairScript } = require('../executor/scripts');
const config = require('../config');
const log = require('../logger');

// GET /api/status - Current status (latest check)
router.get('/status', async (req, res) => {
  const latest = await queries.getLatestCheck();
  const scheduler = getSchedulerStatus();

  if (!latest) {
    return res.json({
      status: 'pending',
      message: 'No checks performed yet',
      scheduler,
    });
  }

  res.json({
    ...latest,
    scheduler,
  });
});

// POST /api/check - Force immediate check
router.post('/check', async (req, res) => {
  try {
    const result = await forceCheck();
    if (result && result.error) {
      return res.status(409).json({ error: result.error });
    }
    if (!result) {
      return res.status(500).json({ error: 'Check failed' });
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/maintenance/repair - Execute RAID repair
router.post('/maintenance/repair', async (req, res) => {
  const { volumeId, diskId, type } = req.body;

  if (volumeId === undefined || diskId === undefined || !type) {
    return res.status(400).json({ error: 'Missing volumeId, diskId or type' });
  }

  log.info(`[Maintenance] Starting repair for Volume ${volumeId} using Disk ${diskId} (Type: ${type})`);

  try {
    let output = '';
    let status = 'success';

    if (config.demoMode) {
      await new Promise(r => setTimeout(r, 2000));
      output = 'DISKPART> select disk 4\nDisk 4 is now the selected disk.\nDISKPART> convert dynamic\nDiskPart successfully converted the selected disk to dynamic format.\nDISKPART> select volume 1\nVolume 1 is the selected volume.\nDISKPART> repair disk=4\nDiskPart successfully repaired the volume.';
    } else {
      const script = getRepairScript(volumeId, diskId, type);
      output = await runDiskpart(script);
    }

    await queries.insertMaintenanceLog({
      action: `repair_${type}`,
      volumeId,
      targetDiskId: diskId,
      status,
      output
    });

    res.json({ success: true, output });
    
    // Trigger a fresh check after repair
    setTimeout(() => forceCheck(), 2000);
    
  } catch (err) {
    log.error('[Maintenance] Repair failed: ' + err.message);
    await queries.insertMaintenanceLog({
      action: `repair_${type}`,
      volumeId,
      targetDiskId: diskId,
      status: 'failed',
      output: err.message
    });
    res.status(500).json({ error: err.message });
  }
});

// GET /api/maintenance/logs - Get repair history
router.get('/maintenance/logs', async (req, res) => {
  const logs = await queries.getMaintenanceLogs();
  res.json(logs);
});

// GET /api/history - Check history (paginated)
router.get('/history', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
  const offset = parseInt(req.query.offset || '0', 10);
  const history = await queries.getCheckHistory(limit, offset);
  res.json(history);
});

// GET /api/history/:id - Specific check details
router.get('/history/:id', async (req, res) => {
  const check = await queries.getCheckById(parseInt(req.params.id, 10));
  if (!check) {
    return res.status(404).json({ error: 'Check not found' });
  }
  res.json(check);
});

// GET /api/alerts - Recent alerts
router.get('/alerts', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
  let ackFilter = null;
  if (req.query.acknowledged === 'true') ackFilter = true;
  if (req.query.acknowledged === 'false') ackFilter = false;
  const alerts = await queries.getAlerts(limit, ackFilter);
  res.json(alerts);
});

// PUT /api/alerts/:id/ack - Acknowledge an alert
router.put('/alerts/:id/ack', async (req, res) => {
  await queries.acknowledgeAlert(parseInt(req.params.id, 10));
  res.json({ success: true });
});

// PUT /api/alerts/ack-all - Acknowledge all alerts
router.put('/alerts/ack-all', async (req, res) => {
  await queries.acknowledgeAllAlerts();
  res.json({ success: true });
});

// GET /api/stats - Dashboard statistics
router.get('/stats', async (req, res) => {
  const stats = await queries.getStats();
  const scheduler = getSchedulerStatus();
  res.json({ ...stats, scheduler, demoMode: config.demoMode });
});

// GET /api/settings - Current settings
router.get('/settings', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.json({
    checkIntervalSeconds: config.checkIntervalSeconds,
    host: config.host,
    port: config.port,
    demoMode: config.demoMode,
    smtpEnabled: config.smtpEnabled,
    webhookEnabled: config.webhookEnabled,
    retentionDays: config.retentionDays,
  });
});

module.exports = router;
