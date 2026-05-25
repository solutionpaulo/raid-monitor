const nodemailer = require('nodemailer');
const config = require('../config');
const queries = require('../database/queries');
const { broadcastSSE } = require('./collector');
const log = require('../logger');

// Cooldown tracking: prevent alert spam (5 min cooldown per status)
const alertCooldowns = new Map();
const COOLDOWN_MS = 5 * 60 * 1000;

/**
 * Handle a status change event.
 * @param {string} oldStatus
 * @param {string} newStatus
 * @param {object[]} volumes - Current volume data
 */
async function handleStatusChange(oldStatus, newStatus, volumes) {
  // Check cooldown
  const cooldownKey = `${oldStatus}->${newStatus}`;
  const lastAlert = alertCooldowns.get(cooldownKey);
  if (lastAlert && Date.now() - lastAlert < COOLDOWN_MS) {
    log.debug(`[Alerter] Cooldown active for ${cooldownKey}, skipping`);
    return;
  }
  alertCooldowns.set(cooldownKey, Date.now());

  const affectedVolumes = volumes.filter((v) => v.isRaid && !v.isHealthy);
  const isRecovery = newStatus === 'healthy';
  const severity = isRecovery ? 'recovery' : newStatus === 'failed' ? 'critical' : 'warning';

  let message;
  if (isRecovery) {
    message = `✅ RAID recovered! All volumes are now healthy. (was: ${oldStatus})`;
  } else if (newStatus === 'failed') {
    const volNames = affectedVolumes.map((v) => `${v.letter}: ${v.label} (${v.type})`).join(', ');
    message = `🔴 RAID FAILURE detected! Volumes: ${volNames}`;
  } else {
    const volNames = affectedVolumes.map((v) => `${v.letter}: ${v.label} - ${v.status}`).join(', ');
    message = `🟡 RAID degraded! Volumes: ${volNames}`;
  }

  log.warn(`[Alerter] ${message}`);

  // Save alert to database
  const alertId = await queries.insertAlert({
    severity,
    message,
    volumeInfo: affectedVolumes,
  });

  // Broadcast via SSE
  broadcastSSE('alert', {
    id: alertId,
    severity,
    message,
    volumes: affectedVolumes,
    time: new Date().toISOString(),
  });

  // Send notifications
  try {
    if (config.smtpEnabled) {
      await sendEmailAlert(severity, message, affectedVolumes);
      await queries.markAlertNotified(alertId);
    }
    if (config.webhookEnabled) {
      await sendWebhookAlert(severity, message, affectedVolumes);
      await queries.markAlertNotified(alertId);
    }
  } catch (err) {
    log.error('[Alerter] Notification failed: ' + err.message);
  }
}

/**
 * Send an email alert via SMTP.
 */
async function sendEmailAlert(severity, message, volumes) {
  const transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: {
      user: config.smtp.user,
      pass: config.smtp.pass,
    },
  });

  const severityEmoji = { critical: '🔴', warning: '🟡', recovery: '🟢' };
  const subject = `${severityEmoji[severity] || '⚪'} RAID Monitor - ${severity.toUpperCase()}`;

  let html = `<h2>${message}</h2>`;
  if (volumes && volumes.length > 0) {
    html += '<table border="1" cellpadding="8" style="border-collapse:collapse">';
    html += '<tr><th>Volume</th><th>Label</th><th>Type</th><th>Size</th><th>Status</th></tr>';
    volumes.forEach((v) => {
      const color = v.isHealthy ? '#00d68f' : '#ff3d71';
      html += `<tr><td>${v.letter}:</td><td>${v.label}</td><td>${v.type}</td><td>${v.size}</td><td style="color:${color};font-weight:bold">${v.status}</td></tr>`;
    });
    html += '</table>';
  }
  html += `<p style="color:#888;margin-top:16px">RAID Monitor • ${new Date().toLocaleString()}</p>`;

  await transporter.sendMail({
    from: config.smtp.from,
    to: config.smtp.to,
    subject,
    html,
  });

  log.info(`[Alerter] Email sent to ${config.smtp.to}`);
}

/**
 * Send a webhook alert (JSON POST).
 */
async function sendWebhookAlert(severity, message, volumes) {
  const payload = {
    severity,
    message,
    volumes,
    timestamp: new Date().toISOString(),
    source: 'RAID Monitor',
  };

  const response = await fetch(config.webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Webhook returned ${response.status}: ${response.statusText}`);
  }

  log.info(`[Alerter] Webhook sent to ${config.webhookUrl}`);
}

module.exports = { handleStatusChange };
