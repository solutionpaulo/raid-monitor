/**
 * Notifications module - Toast and Web Notifications.
 */

const Notifications = {
  _permission: 'default',

  /** Request Web Notification permission. */
  async requestPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
      this._permission = await Notification.requestPermission();
    } else if ('Notification' in window) {
      this._permission = Notification.permission;
    }
  },

  /** Send a browser notification. */
  sendBrowserNotification(title, body, tag) {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, {
        body,
        icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">💾</text></svg>',
        tag: tag || 'raid-alert',
        requireInteraction: true,
      });
    }
  },

  /** Show a toast notification in the dashboard. */
  showToast(message, type = 'info', duration = 5000) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, duration);
  },

  /** Show alert notification (toast + browser). */
  showAlert(severity, message) {
    this.showToast(message, severity, 8000);

    const titles = {
      critical: '🔴 RAID FAILURE',
      warning: '🟡 RAID Degraded',
      recovery: '🟢 RAID Recovered',
    };
    this.sendBrowserNotification(titles[severity] || 'RAID Monitor', message, `raid-${Date.now()}`);
  },
};
