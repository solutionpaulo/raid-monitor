const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const log = require('../logger');

let db = null;

/**
 * Initialize SQLite database and create tables if needed.
 */
function initDatabase() {
  return new Promise((resolve, reject) => {
    const dbPath = process.env.TEST_DB_PATH || path.join(__dirname, '..', '..', 'raid-monitor.db');
    
    db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        log.error('[DB] Error opening database: ' + err.message);
        return reject(err);
      }
      
      log.info('[DB] Connected to SQLite database at ' + dbPath);
      
      // Enable WAL mode and create tables
      db.serialize(() => {
        db.run('PRAGMA journal_mode = WAL');
        db.run('PRAGMA busy_timeout = 5000');
        
        db.run(`
          CREATE TABLE IF NOT EXISTS checks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            overall_status TEXT NOT NULL,
            volumes_json TEXT,
            disks_json TEXT,
            space_json TEXT,
            drives_json TEXT,
            physical_disks_json TEXT,
            server_info_json TEXT,
            response_time_ms INTEGER,
            checked_at DATETIME DEFAULT (datetime('now', 'localtime'))
          )
        `);

        // Add column for existing databases (safe to run even if column exists)
        db.run("ALTER TABLE checks ADD COLUMN physical_disks_json TEXT", () => {});

        db.run(`
          CREATE TABLE IF NOT EXISTS alerts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            severity TEXT NOT NULL,
            message TEXT NOT NULL,
            volume_info TEXT,
            notified INTEGER DEFAULT 0,
            acknowledged INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT (datetime('now', 'localtime'))
          )
        `);

        db.run(`
          CREATE TABLE IF NOT EXISTS maintenance_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            action TEXT NOT NULL,
            volume_id INTEGER,
            target_disk_id INTEGER,
            status TEXT,
            output TEXT,
            executed_at DATETIME DEFAULT (datetime('now', 'localtime'))
          )
        `);

        db.run(`
          CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
          )
        `, (err) => {
          if (err && !err.message.includes('already exists')) {
            return reject(err);
          }
          
          // Create indices
          db.run('CREATE INDEX IF NOT EXISTS idx_checks_date ON checks(checked_at)');
          db.run('CREATE INDEX IF NOT EXISTS idx_alerts_date ON alerts(created_at)');
          db.run('CREATE INDEX IF NOT EXISTS idx_alerts_ack ON alerts(acknowledged)');
          
          resolve(db);
        });
      });
    });
  });
}

/**
 * Get the database instance.
 */
function getDb() {
  if (!db) throw new Error('Database not initialized. Call initDatabase() first.');
  return db;
}

module.exports = { initDatabase, getDb };
