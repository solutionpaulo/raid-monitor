const express = require('express');
const request = require('supertest');
const fs = require('fs');

process.env.DEMO_MODE = 'true';
process.env.LOG_LEVEL = 'error';
const testDbPath = '/tmp/raid-monitor-test.db';
process.env.TEST_DB_PATH = testDbPath;

try { fs.unlinkSync(testDbPath); } catch (_) {}
try { fs.unlinkSync(testDbPath + '-shm'); } catch (_) {}
try { fs.unlinkSync(testDbPath + '-wal'); } catch (_) {}

const { initDatabase, getDb } = require('../src/database/init');
const apiRoutes = require('../src/routes/api');
const sseRoutes = require('../src/routes/sse');
const { basicAuth } = require('../src/auth');
const { collectData } = require('../src/monitor/collector');
const { startScheduler, stopScheduler } = require('../src/monitor/scheduler');

let app;

beforeAll(async () => {
  await initDatabase();

  app = express();
  app.use(express.json());
  app.use(basicAuth);
  app.use('/api', apiRoutes);
  app.use('/api', sseRoutes);
});

afterAll((done) => {
  stopScheduler();
  // Wait for any pending operations, then close db
  setTimeout(() => {
    const db = getDb();
    if (db) {
      db.close(() => done());
    } else {
      done();
    }
  }, 500);
});

describe('GET /api/status', () => {
  it('returns pending when no checks yet', async () => {
    const res = await request(app).get('/api/status');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('pending');
  });
});

describe('POST /api/check', () => {
  it('forces a manual check', async () => {
    startScheduler(collectData);
    // Wait for initial check to complete
    await new Promise((r) => setTimeout(r, 1000));

    const res = await request(app).post('/api/check');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('overallStatus');
    expect(res.body).toHaveProperty('id');
    expect(res.body.overallStatus).toBe('healthy');
  });
});

describe('GET /api/stats', () => {
  it('returns dashboard statistics', async () => {
    const res = await request(app).get('/api/stats');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('totalChecks');
    expect(res.body).toHaveProperty('uptimePercent');
    expect(res.body).toHaveProperty('pendingAlerts');
    expect(res.body).toHaveProperty('timeline');
    expect(res.body.demoMode).toBe(true);
  });
});

describe('GET /api/history', () => {
  it('returns paginated history', async () => {
    const res = await request(app).get('/api/history?limit=5&offset=0');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('honors limit parameter (max 200)', async () => {
    const res = await request(app).get('/api/history?limit=300');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeLessThanOrEqual(200);
  });
});

describe('GET /api/history/:id', () => {
  it('returns 404 for non-existent check', async () => {
    const res = await request(app).get('/api/history/99999');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });
});

describe('GET /api/settings', () => {
  it('returns current settings', async () => {
    const res = await request(app).get('/api/settings');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('checkIntervalSeconds');
    expect(res.body).toHaveProperty('demoMode', true);
    expect(res.body).toHaveProperty('smtpEnabled');
  });
});

describe('GET /api/alerts', () => {
  it('returns alerts list', async () => {
    const res = await request(app).get('/api/alerts');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('filters by acknowledged status', async () => {
    const res = await request(app).get('/api/alerts?acknowledged=false');
    expect(res.status).toBe(200);
  });
});

describe('PUT /api/alerts/ack-all', () => {
  it('acknowledges all alerts', async () => {
    const res = await request(app).put('/api/alerts/ack-all');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
  });
});

describe('GET /api/maintenance/logs', () => {
  it('returns maintenance logs', async () => {
    const res = await request(app).get('/api/maintenance/logs');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('POST /api/maintenance/repair validation', () => {
  it('returns 400 when fields are missing', async () => {
    const res = await request(app)
      .post('/api/maintenance/repair')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });
});
