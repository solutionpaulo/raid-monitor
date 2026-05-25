/**
 * RAID Monitor - Main frontend application.
 * Handles SSE connection, data fetching, and DOM rendering.
 */

const App = {
  sse: null,
  sseRetryMs: 1000,
  historyOffset: 0,
  historyLimit: 20,
  availableDisks: [],
  selectedRepairVol: null,
  currentVolumes: [],

  /** Initialize the application. */
  async init() {
    await Notifications.requestPermission();
    this.bindEvents();
    this.connectSSE();
    await this.fetchInitialData();
  },

  /** Bind UI event handlers. */
  bindEvents() {
    document.getElementById('btn-check-now').addEventListener('click', () => this.forceCheck());
    document.getElementById('btn-ack-all').addEventListener('click', () => this.ackAllAlerts());
    document.getElementById('btn-load-more').addEventListener('click', () => this.loadMoreHistory());
    
    // Modal events
    document.getElementById('btn-close-modal').addEventListener('click', () => this.closeRepairModal());
    document.getElementById('btn-cancel-repair').addEventListener('click', () => this.closeRepairModal());
    document.getElementById('confirm-risk').addEventListener('change', (e) => {
      document.getElementById('btn-start-repair').disabled = !e.target.checked;
    });
    document.getElementById('btn-start-repair').addEventListener('click', () => this.executeRepair());

    // Repair button delegation (avoids XSS from inline onclick)
    document.getElementById('volumes-grid').addEventListener('click', (e) => {
      const btn = e.target.closest('.btn-repair');
      if (btn) {
        const volNumber = parseInt(btn.dataset.volNumber, 10);
        const volume = this.currentVolumes.find(v => v.number === volNumber);
        if (volume) this.openRepairModal(volume);
      }
    });
  },

  // ===== SSE =====

  connectSSE() {
    if (this.sse) { try { this.sse.close(); } catch (_) {} }

    this.sse = new EventSource('/api/events');

    this.sse.addEventListener('connected', () => {
      this.setSSEStatus(true);
      this.sseRetryMs = 1000;
    });

    this.sse.addEventListener('status-update', (e) => {
      const data = JSON.parse(e.data);
      this.renderStatus(data);
    });

    this.sse.addEventListener('alert', (e) => {
      const data = JSON.parse(e.data);
      Notifications.showAlert(data.severity, data.message);
      this.fetchAlerts();
    });

    this.sse.addEventListener('check-start', () => {
      document.getElementById('btn-check-now').classList.add('loading');
    });

    this.sse.addEventListener('check-complete', () => {
      document.getElementById('btn-check-now').classList.remove('loading');
      this.fetchStats();
      this.fetchHistory(true);
    });

    this.sse.onerror = () => {
      this.setSSEStatus(false);
      setTimeout(() => {
        this.sseRetryMs = Math.min(this.sseRetryMs * 1.5, 30000);
        this.connectSSE();
      }, this.sseRetryMs);
    };
  },

  setSSEStatus(connected) {
    const dot = document.querySelector('.sse-dot');
    const text = document.querySelector('.sse-text');
    dot.className = `sse-dot ${connected ? 'connected' : 'disconnected'}`;
    text.textContent = connected ? 'Conectado' : 'Desconectado';
  },

  // ===== Data Fetching =====

  async fetchInitialData() {
    await Promise.all([
      this.fetchStatus(),
      this.fetchStats(),
      this.fetchAlerts(),
      this.fetchHistory(),
      this.fetchSettings(),
    ]);
  },

  async fetchStatus() {
    try {
      const res = await fetch('/api/status');
      const data = await res.json();
      if (data.status !== 'pending') this.renderStatus(data);
    } catch (err) { console.error('fetchStatus:', err); }
  },

  async fetchStats() {
    try {
      const res = await fetch('/api/stats');
      const data = await res.json();
      this.renderStats(data);
    } catch (err) { console.error('fetchStats:', err); }
  },

  async fetchAlerts() {
    try {
      const res = await fetch('/api/alerts?limit=30');
      const data = await res.json();
      this.renderAlerts(data);
    } catch (err) { console.error('fetchAlerts:', err); }
  },

  async fetchHistory(reset) {
    try {
      if (reset) this.historyOffset = 0;
      const res = await fetch(`/api/history?limit=${this.historyLimit}&offset=${this.historyOffset}`);
      const data = await res.json();
      this.renderHistory(data, reset || this.historyOffset === 0);
    } catch (err) { console.error('fetchHistory:', err); }
  },

  async fetchSettings() {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      if (data.demoMode) {
        document.getElementById('demo-badge').style.display = '';
      }
    } catch (err) { console.error('fetchSettings:', err); }
  },

  // ===== Actions =====

  async forceCheck() {
    const btn = document.getElementById('btn-check-now');
    btn.classList.add('loading');
    try {
      const res = await fetch('/api/check', { method: 'POST' });
      const data = await res.json();
      if (data.error) {
        Notifications.showToast(data.error, 'warning');
      } else {
        this.renderStatus(data);
      }
    } catch (err) {
      Notifications.showToast('Erro ao verificar', 'critical');
    } finally {
      btn.classList.remove('loading');
    }
  },

  async ackAllAlerts() {
    try {
      await fetch('/api/alerts/ack-all', { method: 'PUT' });
      this.fetchAlerts();
      this.fetchStats();
      Notifications.showToast('Todos os alertas reconhecidos', 'info');
    } catch (err) {
      Notifications.showToast('Erro ao reconhecer alertas', 'critical');
    }
  },

  async ackAlert(id) {
    try {
      await fetch(`/api/alerts/${id}/ack`, { method: 'PUT' });
      this.fetchAlerts();
      this.fetchStats();
    } catch (err) { console.error('ackAlert:', err); }
  },

  loadMoreHistory() {
    this.historyOffset += this.historyLimit;
    this.fetchHistory();
  },

  // ===== Maintenance =====

  openRepairModal(volume) {
    this.selectedRepairVol = volume;
    document.getElementById('repair-vol-name').textContent = `${volume.letter}: ${volume.label || 'Volume ' + volume.number}`;
    document.getElementById('repair-modal').classList.add('active');
    document.getElementById('confirm-risk').checked = false;
    document.getElementById('btn-start-repair').disabled = true;
    
    this.populateDiskSelect();
  },

  closeRepairModal() {
    document.getElementById('repair-modal').classList.remove('active');
    this.selectedRepairVol = null;
  },

  populateDiskSelect() {
    const select = document.getElementById('select-disk');
    select.innerHTML = '';

    if (this.availableDisks.length === 0) {
      select.innerHTML = '<option value="">Nenhum disco disponível detectado</option>';
      document.getElementById('btn-start-repair').disabled = true;
      return;
    }

    this.availableDisks.forEach(disk => {
      const option = document.createElement('option');
      option.value = disk.number;
      option.textContent = `Disco ${disk.number} - ${disk.size} (${disk.status})`;
      select.appendChild(option);
    });
  },

  async executeRepair() {
    if (!this.selectedRepairVol) return;
    
    const diskId = document.getElementById('select-disk').value;
    const btn = document.getElementById('btn-start-repair');
    
    if (!diskId) {
      Notifications.showToast('Por favor, selecione um disco', 'warning');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Executando...';

    try {
      const type = this.selectedRepairVol.type.toLowerCase().includes('raid-5') ? 'raid5' : 'mirror';
      const res = await fetch('/api/maintenance/repair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          volumeId: this.selectedRepairVol.number,
          diskId: parseInt(diskId, 10),
          type
        })
      });

      const result = await res.json();
      if (result.success) {
        Notifications.showToast('Comando de reparo enviado com sucesso!', 'info');
        this.closeRepairModal();
      } else {
        Notifications.showToast('Erro no reparo: ' + result.error, 'critical');
      }
    } catch (err) {
      Notifications.showToast('Erro ao comunicar com servidor', 'critical');
    } finally {
      btn.textContent = 'Iniciar Reconstrução';
      btn.disabled = false;
    }
  },

  // ===== Rendering =====

  renderStatus(data) {
    // Global status indicator
    const dot = document.querySelector('#status-indicator .status-dot');
    const label = document.getElementById('status-label');
    const detail = document.getElementById('status-detail');

    dot.className = `status-dot ${data.overallStatus}`;

    const statusLabels = {
      healthy: 'Todos os volumes saudáveis',
      degraded: 'RAID degradado',
      failed: 'FALHA no RAID',
      'no-raid': 'Nenhum volume RAID',
      error: 'Erro na verificação',
    };
    label.textContent = statusLabels[data.overallStatus] || data.overallStatus;
    detail.textContent = data.checkedAt ? `Verificado: ${this.formatTime(data.checkedAt)}` : '';

    // Update available disks for repair modal
    this.availableDisks = data.availableDisks || [];

    // Logo pulse color
    const logo = document.getElementById('logo-pulse');
    const logoColors = { healthy: '#00d68f', degraded: '#ffaa00', failed: '#ff3d71' };
    logo.style.color = logoColors[data.overallStatus] || '#4f8cff';

    // Server info
    if (data.serverInfo) {
      document.getElementById('hostname-display').textContent = data.serverInfo.Hostname || '—';
      document.getElementById('uptime-display').textContent = data.serverInfo.UptimeFormatted ? `Up: ${data.serverInfo.UptimeFormatted}` : '—';
    }

    // Volumes
    this.renderVolumes(data.volumes || []);

    // Disks
    this.renderDisks(data.drives || []);

    // Space
    this.renderSpace(data.space || []);

    // Physical disk health
    this.renderPhysicalDisks(data.physicalDisks || []);
  },

  renderVolumes(volumes) {
    const grid = document.getElementById('volumes-grid');
    this.currentVolumes = volumes;
    const raidVolumes = volumes.filter((v) => v.isRaid);
    const allVolumes = volumes;
    document.getElementById('volumes-count').textContent = raidVolumes.length;

    if (allVolumes.length === 0) {
      grid.innerHTML = '<div class="empty-state"><p>Nenhum volume detectado</p></div>';
      return;
    }

    // Show RAID volumes first, then simple volumes
    const sorted = [...raidVolumes, ...volumes.filter((v) => !v.isRaid)];

    grid.innerHTML = sorted.map((v) => {
      const statusLower = v.status.toLowerCase();
      const statusClass = v.isHealthy ? 'healthy' : statusLower.includes('rebuild') || statusLower.includes('sync') ? 'rebuild' : statusLower.includes('fail') ? 'failed' : 'degraded';
      const raidBadge = v.isRaid ? `<span class="volume-status-badge ${statusClass}">${v.status}</span>` : `<span class="volume-status-badge" style="background:rgba(255,255,255,0.04);color:var(--text-muted)">${v.status}</span>`;
      
      const canRepair = v.isRaid && !v.isHealthy && (statusClass === 'degraded' || statusClass === 'failed');

      return `
        <div class="volume-card ${v.isRaid ? statusClass : ''}">
          <div class="volume-header">
            <div class="volume-letter">${v.letter || '?'}</div>
            ${raidBadge}
          </div>
          <dl class="volume-info">
            <dt>Label</dt><dd>${v.label || '—'}</dd>
            <dt>Tipo</dt><dd>${v.type}${v.isRaid ? ' ⚡' : ''}</dd>
            <dt>Sistema</dt><dd>${v.filesystem || '—'}</dd>
            <dt>Tamanho</dt><dd>${v.size || '—'}</dd>
            ${v.info ? `<dt>Info</dt><dd>${v.info}</dd>` : ''}
          </dl>
          ${canRepair ? `
            <button class="btn-repair" data-vol-number="${v.number}" title="Reparar Volume">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
            </button>
          ` : ''}
        </div>
      `;
    }).join('');
  },

  renderDisks(drives) {
    const grid = document.getElementById('disks-grid');
    document.getElementById('disks-count').textContent = drives.length;

    if (drives.length === 0) {
      grid.innerHTML = '<div class="empty-state"><p>Aguardando dados...</p></div>';
      return;
    }

    grid.innerHTML = drives.map((d) => {
      const statusClass = (d.Status || '').toLowerCase() === 'ok' ? 'ok' : 'warn';
      const mediaIcon = (d.MediaType || '').toLowerCase().includes('ssd') || (d.Model || '').toLowerCase().includes('ssd') ? '⚡' : '💿';

      return `
        <div class="disk-card">
          <div class="disk-model" title="${d.Model || ''}">${mediaIcon} ${d.Model || 'Unknown'}</div>
          <div class="disk-details">
            <span class="disk-tag ${statusClass}">${d.Status || '?'}</span>
            <span class="disk-tag">${d.SizeGB ? d.SizeGB + ' GB' : '?'}</span>
            <span class="disk-tag">${d.InterfaceType || '?'}</span>
          </div>
        </div>
      `;
    }).join('');
  },

  renderSpace(space) {
    const grid = document.getElementById('space-grid');
    if (space.length === 0) {
      grid.innerHTML = '<div class="empty-state"><p>Aguardando dados...</p></div>';
      return;
    }

    grid.innerHTML = space.map((s) => {
      const usedGB = (s.SizeGB - s.FreeSpaceGB).toFixed(1);
      const pct = Charts.calcUsage(s.SizeGB, s.FreeSpaceGB);
      const barClass = pct > 90 ? 'danger' : pct > 75 ? 'warn' : '';

      return `
        <div class="space-item">
          <div class="space-letter">${s.DeviceID}</div>
          <div class="space-bar-wrapper">
            <div class="space-bar-label">
              <span>${s.VolumeName || ''} — ${pct}% usado</span>
              <span>${usedGB} / ${s.SizeGB} GB</span>
            </div>
            <div class="space-bar">
              <div class="space-bar-fill ${barClass}" style="width: ${pct}%"></div>
            </div>
          </div>
        </div>
      `;
    }).join('');
  },

  renderStats(data) {
    document.getElementById('stat-uptime').textContent = data.uptimePercent !== undefined ? data.uptimePercent + '%' : '—';
    document.getElementById('stat-checks').textContent = data.totalChecks || '0';
    document.getElementById('stat-interval').textContent = data.scheduler ? data.scheduler.intervalSeconds + 's' : '—';
    document.getElementById('stat-last-check').textContent = data.lastCheckAt ? this.formatTime(data.lastCheckAt) : '—';
    document.getElementById('stat-response').textContent = '—'; // will be updated via status

    const alertsEl = document.getElementById('stat-alerts');
    const alertsCard = document.getElementById('stat-alerts-card');
    alertsEl.textContent = data.pendingAlerts || '0';
    alertsCard.classList.toggle('has-alerts', (data.pendingAlerts || 0) > 0);

    // Draw timeline
    Charts.drawTimeline('timeline-canvas', data.timeline || []);
  },

  renderPhysicalDisks(physicalDisks) {
    const grid = document.getElementById('health-grid');
    document.getElementById('health-count').textContent = physicalDisks.length;

    if (physicalDisks.length === 0) {
      grid.innerHTML = '<div class="empty-state"><p>Nenhum disco físico detectado</p></div>';
      return;
    }

    const healthLabels = {
      Healthy: { label: 'Saudável', class: 'ok' },
      Warning: { label: 'Atenção', class: 'warn' },
      Unhealthy: { label: 'Crítico', class: 'fail' },
    };

    grid.innerHTML = physicalDisks.map((d) => {
      const hl = healthLabels[d.HealthStatus] || { label: d.HealthStatus || 'Desconhecido', class: '' };
      const mediaIcon = (d.MediaType || '').toLowerCase().includes('ssd') ? '⚡' : '💿';
      const sizeTb = d.SizeGB ? (d.SizeGB / 1000).toFixed(1) + ' TB' : (d.SizeGB ? d.SizeGB + ' GB' : '—');

      return `
        <div class="health-card">
          <div class="health-header">
            <span class="health-icon">${mediaIcon}</span>
            <span class="health-name" title="${d.FriendlyName || ''}">${d.FriendlyName || 'Desconhecido'}</span>
            <span class="health-badge ${hl.class}">${hl.label}</span>
          </div>
          <div class="health-details">
            <div class="health-detail">
              <span class="health-detail-label">Status</span>
              <span class="health-detail-value ${hl.class}">${d.OperationalStatus || '—'}</span>
            </div>
            <div class="health-detail">
              <span class="health-detail-label">Tamanho</span>
              <span class="health-detail-value">${sizeTb}</span>
            </div>
            <div class="health-detail">
              <span class="health-detail-label">Tipo</span>
              <span class="health-detail-value">${d.MediaType || '—'}</span>
            </div>
            <div class="health-detail">
              <span class="health-detail-label">Conexão</span>
              <span class="health-detail-value">${d.BusType || '—'}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');
  },

  renderAlerts(alerts) {
    const list = document.getElementById('alerts-list');
    const badge = document.getElementById('alerts-badge');
    const ackBtn = document.getElementById('btn-ack-all');
    const pending = alerts.filter((a) => !a.acknowledged);

    if (pending.length > 0) {
      badge.style.display = '';
      badge.textContent = pending.length;
      ackBtn.style.display = '';
    } else {
      badge.style.display = 'none';
      ackBtn.style.display = 'none';
    }

    if (alerts.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          <p>Nenhum alerta registrado</p>
        </div>`;
      return;
    }

    list.innerHTML = alerts.map((a) => `
      <div class="alert-item ${a.severity} ${a.acknowledged ? 'acknowledged' : ''}">
        <span class="alert-severity ${a.severity}">${a.severity}</span>
        <div class="alert-content">
          <div class="alert-message">${a.message}</div>
          <div class="alert-time">${this.formatTime(a.created_at)}</div>
        </div>
        ${!a.acknowledged ? `<div class="alert-actions"><button class="btn-ack" onclick="App.ackAlert(${a.id})">Reconhecer</button></div>` : ''}
      </div>
    `).join('');
  },

  renderHistory(checks, reset) {
    const tbody = document.getElementById('history-tbody');
    if (reset) tbody.innerHTML = '';

    const rows = checks.map((c) => {
      const raidVols = (c.volumes || []).filter((v) => v.isRaid);
      const summary = raidVols.length > 0
        ? raidVols.map((v) => `${v.letter}: ${v.status}`).join(', ')
        : '—';

      return `
        <tr>
          <td>#${c.id}</td>
          <td><span class="status-pill ${c.overallStatus}">${c.overallStatus}</span></td>
          <td>${summary}</td>
          <td>${c.responseTimeMs ? c.responseTimeMs + 'ms' : '—'}</td>
          <td>${this.formatTime(c.checkedAt)}</td>
        </tr>
      `;
    }).join('');

    tbody.insertAdjacentHTML('beforeend', rows);

    // Update response time in stats from latest
    if (checks.length > 0 && this.historyOffset === 0) {
      document.getElementById('stat-response').textContent = checks[0].responseTimeMs ? checks[0].responseTimeMs + 'ms' : '—';
    }
  },

  // ===== Helpers =====

  formatTime(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) {
      // Handle SQLite datetime format "YYYY-MM-DD HH:MM:SS"
      return dateStr;
    }
    const now = new Date();
    const diffMs = now - d;
    if (diffMs < 60000) return 'agora';
    if (diffMs < 3600000) return `${Math.floor(diffMs / 60000)}min atrás`;
    if (diffMs < 86400000) return `${Math.floor(diffMs / 3600000)}h atrás`;
    return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  },
};

// Start
document.addEventListener('DOMContentLoaded', () => App.init());
