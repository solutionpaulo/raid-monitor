/**
 * PowerShell and diskpart scripts for data collection and maintenance.
 */

/** Diskpart commands to list volumes and disks */
const DISKPART_COMMANDS = ['list volume', 'list disk'];

/** 
 * Generate diskpart script for RAID repair/rebuild.
 * @param {number} volNum - Volume number
 * @param {number} diskNum - Target disk number
 * @param {string} type - 'mirror' or 'raid5'
 */
function getRepairScript(volNum, diskNum, type) {
  const cmd = type === 'raid5' ? `repair disk=${diskNum}` : `add disk=${diskNum}`;
  return [
    `select disk ${diskNum}`,
    `convert dynamic`, // Ensure target is dynamic
    `select volume ${volNum}`,
    cmd,
    `exit`
  ];
}

/** PowerShell: Get physical disk health (SMART) */
const PS_PHYSICAL_DISKS = `
Get-PhysicalDisk | Select-Object FriendlyName, HealthStatus, OperationalStatus, MediaType, @{N='SizeGB';E={[math]::Round($_.Size/1GB,2)}}, BusType | ConvertTo-Json -Compress
`.trim();

/** PowerShell: Get logical disk space */
const PS_DISK_SPACE = `
Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | Select-Object DeviceID, @{N='SizeGB';E={[math]::Round($_.Size/1GB,2)}}, @{N='FreeSpaceGB';E={[math]::Round($_.FreeSpace/1GB,2)}}, VolumeName | ConvertTo-Json -Compress
`.trim();

/** PowerShell: Get disk drive info */
const PS_DISK_DRIVES = `
Get-CimInstance Win32_DiskDrive | Select-Object Model, @{N='SizeGB';E={[math]::Round($_.Size/1GB,2)}}, Status, InterfaceType, Partitions, MediaType | ConvertTo-Json -Compress
`.trim();

/** PowerShell: Get server info */
const PS_SERVER_INFO = `
$os = Get-CimInstance Win32_OperatingSystem
$uptime = (Get-Date) - $os.ConvertToDateTime($os.LastBootUpTime)
@{
  Hostname = $env:COMPUTERNAME;
  OS = $os.Caption;
  UptimeDays = [math]::Round($uptime.TotalDays, 2);
  UptimeFormatted = '{0}d {1}h {2}m' -f $uptime.Days, $uptime.Hours, $uptime.Minutes;
  TotalMemoryGB = [math]::Round($os.TotalVisibleMemorySize/1MB, 2);
  FreeMemoryGB = [math]::Round($os.FreePhysicalMemory/1MB, 2);
} | ConvertTo-Json -Compress
`.trim();

module.exports = {
  DISKPART_COMMANDS,
  getRepairScript,
  PS_PHYSICAL_DISKS,
  PS_DISK_SPACE,
  PS_DISK_DRIVES,
  PS_SERVER_INFO,
};
