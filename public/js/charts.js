/**
 * Charts module - Canvas-based uptime timeline and disk space visuals.
 */

const Charts = {
  /**
   * Draw the 24h uptime timeline on a canvas.
   * @param {string} canvasId - Canvas element ID
   * @param {Array} timeline - Array of {status, time} objects
   */
  drawTimeline(canvasId, timeline) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const padding = 2;
    const barH = h - padding * 2;

    // Clear
    ctx.clearRect(0, 0, w, h);

    if (!timeline || timeline.length === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#5a5e72';
      ctx.font = '12px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Sem dados nas últimas 24h', w / 2, h / 2 + 4);
      return;
    }

    const colors = {
      healthy: '#00d68f',
      degraded: '#ffaa00',
      failed: '#ff3d71',
      error: '#ff3d71',
      'no-raid': '#5a5e72',
      pending: '#5a5e72',
    };

    const barCount = timeline.length;
    const gap = Math.min(2, Math.max(0.5, w / barCount * 0.1));
    const barW = Math.max(1, (w - gap * (barCount - 1)) / barCount);

    timeline.forEach((item, i) => {
      const x = i * (barW + gap);
      const color = colors[item.status] || colors.pending;

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(x, padding, barW, barH, 2);
      ctx.fill();
    });

    // Draw time markers
    ctx.fillStyle = '#5a5e72';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';

    if (timeline.length > 10) {
      const step = Math.floor(timeline.length / 5);
      for (let i = 0; i < timeline.length; i += step) {
        const x = i * (barW + gap) + barW / 2;
        const time = new Date(timeline[i].time);
        const label = `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}`;
        ctx.fillText(label, x, h - 1);
      }
    }
  },

  /**
   * Calculate disk usage percentage.
   */
  calcUsage(sizeGB, freeGB) {
    if (!sizeGB || sizeGB === 0) return 0;
    return Math.round(((sizeGB - freeGB) / sizeGB) * 100);
  },
};
