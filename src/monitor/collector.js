const { runDiskpart, runPowerShell, parsePowerShellJson } = require('../executor/runner');
const { DISKPART_COMMANDS, PS_PHYSICAL_DISKS, PS_DISK_SPACE, PS_DISK_DRIVES, PS_SERVER_INFO } = require('../executor/scripts');
const { parseDiskpartOutput, determineOverallStatus } = require('./parser');
const queries = require('../database/queries');
const config = require('../config');
const log = require('../logger');
const { broadcastSSE } = require('../sse');
const { handleStatusChange } = require('./alerter');

// Last known status for change detection
let lastOverallStatus = null;

/**
 * Identify disks available for RAID repair.
 * Candidates are disks that are Online and have no volumes or are explicitly listed as free.
 */
function findAvailableDisks(disks) {
  return disks.filter(d => 
    d.status.toLowerCase() === 'online' && 
    !d.info.toLowerCase().includes('missing') &&
    (d.free === d.size || d.info.toLowerCase().includes('dynamic') || d.isDynamic)
  );
}

/**
 * Generate demo data for development/testing.
 */
function generateDemoData() {
  const statuses = ['Healthy', 'Healthy', 'Healthy', 'Healthy', 'Rebuild', 'Failed Rd'];
  const randomStatus = () => statuses[Math.floor(Math.random() * statuses.length)];
  const mainStatus = randomStatus();

  return {
    volumes: [
      { number: 0, letter: 'C', label: 'System', filesystem: 'NTFS', type: 'Mirror', size: '100 GB', status: 'Healthy', info: 'System', isRaid: true, isHealthy: true },
      { number: 1, letter: 'D', label: 'Data', filesystem: 'NTFS', type: 'RAID-5', size: '2000 GB', status: mainStatus, info: '', isRaid: true, isHealthy: mainStatus === 'Healthy' },
      { number: 2, letter: 'E', label: 'Backup', filesystem: 'NTFS', type: 'Mirror', size: '500 GB', status: 'Healthy', info: '', isRaid: true, isHealthy: true },
      { number: 3, letter: 'F', label: 'Logs', filesystem: 'NTFS', type: 'Simple', size: '50 GB', status: 'Healthy', info: '', isRaid: false, isHealthy: true },
    ],
    disks: [
      { number: 0, status: 'Online', size: '232 GB', free: '0 B', info: '', isDynamic: true },
      { number: 1, status: 'Online', size: '931 GB', free: '0 B', info: 'Dynamic', isDynamic: true },
      { number: 2, status: 'Online', size: '931 GB', free: '0 B', info: 'Dynamic', isDynamic: true },
      { number: 3, status: 'Online', size: '931 GB', free: '0 B', info: 'Dynamic', isDynamic: true },
      { number: 4, status: 'Online', size: '465 GB', free: '465 GB', info: '', isDynamic: false }, // Candidate
    ],
    space: [
      { DeviceID: 'C:', SizeGB: 100, FreeSpaceGB: 45.3, VolumeName: 'System' },
      { DeviceID: 'D:', SizeGB: 2000, FreeSpaceGB: 823.7, VolumeName: 'Data' },
      { DeviceID: 'E:', SizeGB: 500, FreeSpaceGB: 312.1, VolumeName: 'Backup' },
      { DeviceID: 'F:', SizeGB: 50, FreeSpaceGB: 38.9, VolumeName: 'Logs' },
    ],
    drives: [
      { Model: 'Samsung SSD 870 EVO 250GB', SizeGB: 232.89, Status: 'OK', InterfaceType: 'SCSI', Partitions: 2, MediaType: 'Fixed hard disk media' },
      { Model: 'WDC WD10EZEX-00BN5A0', SizeGB: 931.51, Status: 'OK', InterfaceType: 'SCSI', Partitions: 1, MediaType: 'Fixed hard disk media' },
      { Model: 'WDC WD10EZEX-00BN5A0', SizeGB: 931.51, Status: 'OK', InterfaceType: 'SCSI', Partitions: 1, MediaType: 'Fixed hard disk media' },
      { Model: 'WDC WD10EZEX-00BN5A0', SizeGB: 931.51, Status: 'OK', InterfaceType: 'SCSI', Partitions: 1, MediaType: 'Fixed hard disk media' },
      { Model: 'Seagate ST500DM002', SizeGB: 465.76, Status: 'OK', InterfaceType: 'SCSI', Partitions: 0, MediaType: 'Fixed hard disk media' },
    ],
    physicalDisks: [
      { FriendlyName: 'Samsung SSD 870 EVO 250GB', HealthStatus: 'Healthy', OperationalStatus: 'OK', MediaType: 'SSD', BusType: 'SATA', SizeGB: 232.89 },
      { FriendlyName: 'WDC WD10EZEX-00BN5A0', HealthStatus: 'Healthy', OperationalStatus: 'OK', MediaType: 'HDD', BusType: 'SATA', SizeGB: 931.51 },
      { FriendlyName: 'WDC WD10EZEX-00BN5A0', HealthStatus: 'Healthy', OperationalStatus: 'OK', MediaType: 'HDD', BusType: 'SATA', SizeGB: 931.51 },
      { FriendlyName: 'WDC WD10EZEX-00BN5A0', HealthStatus: 'Warning', OperationalStatus: 'Degraded', MediaType: 'HDD', BusType: 'SATA', SizeGB: 931.51 },
      { FriendlyName: 'Seagate ST500DM002', HealthStatus: 'Healthy', OperationalStatus: 'OK', MediaType: 'HDD', BusType: 'SATA', SizeGB: 465.76 },
    ],
    serverInfo: {
      Hostname: 'SVR-DEMO-01',
      OS: 'Microsoft Windows Server 2019 Standard',
      UptimeDays: 45.32,
      UptimeFormatted: '45d 7h 42m',
      TotalMemoryGB: 32.0,
      FreeMemoryGB: 18.7,
    },
  };
}

/**
 * Run a full data collection cycle.
 * @returns {object} Collected and parsed data
 */
async function collectData() {
  const startTime = Date.now();

  broadcastSSE('check-start', { time: new Date().toISOString() });

  let data;

  if (config.demoMode) {
    // Simulate a small delay
    await new Promise((r) => setTimeout(r, 300 + Math.random() * 700));
    data = generateDemoData();
  } else {
    // Execute all commands in parallel
    const [diskpartRaw, physicalRaw, spaceRaw, drivesRaw, serverRaw] = await Promise.allSettled([
      runDiskpart(DISKPART_COMMANDS),
      runPowerShell(PS_PHYSICAL_DISKS),
      runPowerShell(PS_DISK_SPACE),
      runPowerShell(PS_DISK_DRIVES),
      runPowerShell(PS_SERVER_INFO),
    ]);

    const diskpartOutput = diskpartRaw.status === 'fulfilled' ? diskpartRaw.value : '';
    const parsed = parseDiskpartOutput(diskpartOutput);

    data = {
      volumes: parsed.volumes,
      disks: parsed.disks,
      space: spaceRaw.status === 'fulfilled' ? parsePowerShellJson(spaceRaw.value) : [],
      drives: drivesRaw.status === 'fulfilled' ? parsePowerShellJson(drivesRaw.value) : [],
      physicalDisks: physicalRaw.status === 'fulfilled' ? parsePowerShellJson(physicalRaw.value) : [],
      serverInfo: serverRaw.status === 'fulfilled' ? parsePowerShellJson(serverRaw.value)[0] || {} : {},
    };
  }

  const responseTimeMs = Date.now() - startTime;
  const overallStatus = determineOverallStatus(data.volumes);

  // Identify available disks for repair
  const availableDisks = findAvailableDisks(data.disks);

  // Save to database
  const checkId = await queries.insertCheck({
    overallStatus,
    volumes: data.volumes,
    disks: data.disks,
    space: data.space,
    drives: data.drives,
    physicalDisks: data.physicalDisks,
    serverInfo: data.serverInfo,
    responseTimeMs,
  });

  const result = {
    id: checkId,
    overallStatus,
    ...data,
    availableDisks,
    responseTimeMs,
    checkedAt: new Date().toISOString(),
  };

  // Broadcast to SSE clients
  broadcastSSE('status-update', result);
  broadcastSSE('check-complete', { id: checkId, status: overallStatus, time: result.checkedAt });

  // Check for status changes and trigger alerts
  if (lastOverallStatus !== null && lastOverallStatus !== overallStatus) {
    await handleStatusChange(lastOverallStatus, overallStatus, data.volumes);
  }
  lastOverallStatus = overallStatus;

  return result;
}

module.exports = { collectData, generateDemoData };
