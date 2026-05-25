require('dotenv').config();

const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '127.0.0.1',

  checkIntervalSeconds: parseInt(process.env.CHECK_INTERVAL_SECONDS || '60', 10),
  demoMode: process.env.DEMO_MODE === 'true',

  smtp: {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.ALERT_EMAIL_FROM || '',
    to: process.env.ALERT_EMAIL_TO || '',
  },

  webhookUrl: process.env.WEBHOOK_URL || '',

  retentionDays: parseInt(process.env.RETENTION_DAYS || '90', 10),

  authUsername: process.env.AUTH_USERNAME || '',
  authPassword: process.env.AUTH_PASSWORD || '',

  get smtpEnabled() {
    return !!(this.smtp.host && this.smtp.user && this.smtp.pass && this.smtp.to);
  },

  get webhookEnabled() {
    return !!this.webhookUrl;
  },
};

module.exports = config;
