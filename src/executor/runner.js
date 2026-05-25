const { execFile, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const log = require('../logger');

/**
 * Check if running on Windows.
 */
function isWindows() {
  return os.platform() === 'win32';
}

/**
 * Detect available PowerShell executable.
 * Prefers pwsh.exe (PowerShell 7) over powershell.exe (Windows PowerShell).
 */
function detectPowerShell() {
  if (!isWindows()) return null;
  try {
    execSync('where pwsh.exe', { stdio: 'pipe' });
    return 'pwsh.exe';
  } catch (_) {
    return 'powershell.exe';
  }
}

const powerShellCmd = detectPowerShell();

/**
 * Executes diskpart commands locally.
 * Requires admin privileges on Windows.
 * @param {string[]} commands - Array of diskpart commands
 * @returns {Promise<string>} stdout output
 */
function runDiskpart(commands) {
  return new Promise((resolve, reject) => {
    if (!isWindows()) {
      return reject(new Error('diskpart is only available on Windows'));
    }

    const tmpFile = path.join(os.tmpdir(), `raid-monitor-dp-${Date.now()}.txt`);
    const script = commands.join('\r\n') + '\r\n';

    fs.writeFileSync(tmpFile, script, 'utf-8');

    execFile('diskpart', ['/s', tmpFile], { timeout: 30000 }, (error, stdout, stderr) => {
      // Clean up temp file
      try { fs.unlinkSync(tmpFile); } catch (_) { /* ignore */ }

      if (error) {
        reject(new Error(`diskpart failed: ${error.message}\n${stderr}`));
        return;
      }
      resolve(stdout);
    });
  });
}

/**
 * Executes a PowerShell script locally.
 * @param {string} script - PowerShell script to execute
 * @returns {Promise<string>} stdout output
 */
function runPowerShell(script) {
  return new Promise((resolve, reject) => {
    if (!powerShellCmd) {
      return reject(new Error('PowerShell is not available on this platform'));
    }

    const args = [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy', 'Bypass',
      '-Command',
      script,
    ];

    execFile(powerShellCmd, args, { timeout: 30000 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`PowerShell failed: ${error.message}\n${stderr}`));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

/**
 * Parses a JSON string from PowerShell output.
 * Handles single objects and arrays.
 * @param {string} output - Raw PowerShell output
 * @returns {object|array} Parsed data
 */
function parsePowerShellJson(output) {
  if (!output || !output.trim()) return [];
  try {
    const parsed = JSON.parse(output);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch (e) {
    log.error('Failed to parse PowerShell JSON: ' + e.message);
    return [];
  }
}

module.exports = { runDiskpart, runPowerShell, parsePowerShellJson, isWindows };
