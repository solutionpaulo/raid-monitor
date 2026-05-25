const { getDb } = require('./init');

/**
 * Wrap db.run/all/get in promises for easier use.
 */
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDb().run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDb().all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDb().get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

/**
 * Insert a new check result.
 */
async function insertCheck({ overallStatus, volumes, disks, space, drives, physicalDisks, serverInfo, responseTimeMs }) {
  const sql = `
    INSERT INTO checks (overall_status, volumes_json, disks_json, space_json, drives_json, physical_disks_json, server_info_json, response_time_ms)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;
  const result = await run(sql, [
    overallStatus,
    JSON.stringify(volumes),
    JSON.stringify(disks),
    JSON.stringify(space),
    JSON.stringify(drives),
    JSON.stringify(physicalDisks || []),
    JSON.stringify(serverInfo),
    responseTimeMs
  ]);
  return result.lastID;
}

/**
 * Get the latest check.
 */
async function getLatestCheck() {
  const row = await get('SELECT * FROM checks ORDER BY id DESC LIMIT 1');
  if (!row) return null;
  return deserializeCheck(row);
}

/**
 * Get check history with pagination.
 */
async function getCheckHistory(limit = 50, offset = 0) {
  const rows = await all('SELECT * FROM checks ORDER BY id DESC LIMIT ? OFFSET ?', [limit, offset]);
  return rows.map(deserializeCheck);
}

/**
 * Get a specific check by ID.
 */
async function getCheckById(id) {
  const row = await get('SELECT * FROM checks WHERE id = ?', [id]);
  if (!row) return null;
  return deserializeCheck(row);
}

/**
 * Get uptime statistics.
 */
async function getStats() {
  const total = await get('SELECT COUNT(*) as count FROM checks');
  const healthy = await get("SELECT COUNT(*) as count FROM checks WHERE overall_status = 'healthy'");
  const lastCheck = await get('SELECT checked_at FROM checks ORDER BY id DESC LIMIT 1');
  const alertCount = await get("SELECT COUNT(*) as count FROM alerts WHERE acknowledged = 0");

  const uptimePercent = total.count > 0 ? ((healthy.count / total.count) * 100).toFixed(2) : 0;

  const timeline = await all(`
    SELECT overall_status, checked_at FROM checks
    WHERE checked_at >= datetime('now', 'localtime', '-24 hours')
    ORDER BY checked_at ASC
  `);

  return {
    totalChecks: total.count,
    healthyChecks: healthy.count,
    uptimePercent: parseFloat(uptimePercent),
    lastCheckAt: lastCheck ? lastCheck.checked_at : null,
    pendingAlerts: alertCount.count,
    timeline: timeline.map((r) => ({ status: r.overall_status, time: r.checked_at })),
  };
}

/**
 * Insert an alert.
 */
async function insertAlert({ severity, message, volumeInfo }) {
  const sql = `
    INSERT INTO alerts (severity, message, volume_info)
    VALUES (?, ?, ?)
  `;
  const result = await run(sql, [severity, message, JSON.stringify(volumeInfo || null)]);
  return result.lastID;
}

/**
 * Get recent alerts.
 */
async function getAlerts(limit = 50, acknowledgedFilter = null) {
  let sql = 'SELECT * FROM alerts';
  const params = [];

  if (acknowledgedFilter !== null) {
    sql += ' WHERE acknowledged = ?';
    params.push(acknowledgedFilter ? 1 : 0);
  }

  sql += ' ORDER BY id DESC LIMIT ?';
  params.push(limit);

  const rows = await all(sql, params);
  return rows.map((r) => ({
    ...r,
    volumeInfo: r.volume_info ? JSON.parse(r.volume_info) : null,
    notified: !!r.notified,
    acknowledged: !!r.acknowledged,
  }));
}

/**
 * Acknowledge an alert.
 */
async function acknowledgeAlert(id) {
  await run('UPDATE alerts SET acknowledged = 1 WHERE id = ?', [id]);
}

/**
 * Acknowledge all unacknowledged alerts.
 */
async function acknowledgeAllAlerts() {
  await run('UPDATE alerts SET acknowledged = 1 WHERE acknowledged = 0');
}

/**
 * Mark an alert as notified.
 */
async function markAlertNotified(id) {
  await run('UPDATE alerts SET notified = 1 WHERE id = ?', [id]);
}

/**
 * Insert a maintenance log.
 */
async function insertMaintenanceLog({ action, volumeId, targetDiskId, status, output }) {
  const sql = `
    INSERT INTO maintenance_logs (action, volume_id, target_disk_id, status, output)
    VALUES (?, ?, ?, ?, ?)
  `;
  const result = await run(sql, [action, volumeId, targetDiskId, status, output]);
  return result.lastID;
}

/**
 * Get maintenance logs.
 */
async function getMaintenanceLogs(limit = 20) {
  const rows = await all('SELECT * FROM maintenance_logs ORDER BY id DESC LIMIT ?', [limit]);
  return rows;
}

/**
 * Clean up old data beyond retention period.
 */
async function cleanupOldData(retentionDays) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);
  const pad = (n) => String(n).padStart(2, '0');
  const cutoffStr = `${cutoff.getFullYear()}-${pad(cutoff.getMonth()+1)}-${pad(cutoff.getDate())} ${pad(cutoff.getHours())}:${pad(cutoff.getMinutes())}:${pad(cutoff.getSeconds())}`;
  await run(`DELETE FROM checks WHERE checked_at < ?`, [cutoffStr]);
  await run(`DELETE FROM alerts WHERE created_at < ? AND acknowledged = 1`, [cutoffStr]);
  await run(`DELETE FROM maintenance_logs WHERE executed_at < ?`, [cutoffStr]);
}

/**
 * Deserialize a check row from the database.
 */
function deserializeCheck(row) {
  return {
    id: row.id,
    overallStatus: row.overall_status,
    volumes: JSON.parse(row.volumes_json || '[]'),
    disks: JSON.parse(row.disks_json || '[]'),
    space: JSON.parse(row.space_json || '[]'),
    drives: JSON.parse(row.drives_json || '[]'),
    physicalDisks: JSON.parse(row.physical_disks_json || '[]'),
    serverInfo: JSON.parse(row.server_info_json || '{}'),
    responseTimeMs: row.response_time_ms,
    checkedAt: row.checked_at,
  };
}

module.exports = {
  insertCheck,
  getLatestCheck,
  getCheckHistory,
  getCheckById,
  getStats,
  insertAlert,
  getAlerts,
  acknowledgeAlert,
  acknowledgeAllAlerts,
  markAlertNotified,
  insertMaintenanceLog,
  getMaintenanceLogs,
  cleanupOldData,
};
