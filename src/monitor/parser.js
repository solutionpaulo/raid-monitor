/**
 * Parser for diskpart text output.
 * Converts positional column output into structured JSON.
 */

const RAID_TYPES = ['Mirror', 'RAID-5', 'Stripe', 'Spanned'];
const HEALTHY_STATUSES = ['Healthy', 'OK'];

/**
 * Parse `diskpart list volume` output.
 * @param {string} raw - Raw diskpart stdout
 * @returns {object[]} Parsed volume objects
 */
function parseListVolume(raw) {
  if (!raw) return [];

  const lines = raw.split('\n').map((l) => l.replace('\r', ''));
  const volumes = [];

  // Find the header separator line (---  ---  ---  ...)
  let dataStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*-{3,}\s+-{3,}/.test(lines[i])) {
      dataStart = i + 1;
      break;
    }
  }

  if (dataStart === -1) return [];

  // Find column positions from the header line (one line before separator)
  const headerLine = lines[dataStart - 2] || '';
  const colPositions = findColumnPositions(headerLine);

  for (let i = dataStart; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || /^\s*DISKPART>/.test(line)) continue;
    // Stop if we hit another section (like "list disk" output)
    if (/^\s*Disk\s+###/i.test(line)) break;
    if (/^\s*-{3,}/.test(line)) break;

    const vol = parseVolumeLine(line, colPositions);
    if (vol) volumes.push(vol);
  }

  return volumes;
}

/**
 * Find column start positions from header line.
 */
function findColumnPositions(header) {
  // Default positions based on typical diskpart output
  // "  Volume ###  Ltr  Label        Fs     Type        Size     Status     Info"
  return {
    volume: header.indexOf('Volume'),
    ltr: header.indexOf('Ltr'),
    label: header.indexOf('Label'),
    fs: header.indexOf('Fs'),
    type: header.indexOf('Type'),
    size: header.indexOf('Size'),
    status: header.indexOf('Status'),
    info: header.indexOf('Info'),
  };
}

/**
 * Parse a single volume line using column positions.
 */
function parseVolumeLine(line, cols) {
  if (line.length < 20) return null;

  // Try regex first (more reliable for varied spacing)
  const match = line.match(
    /^\s*Volume\s+(\d+)\s+([A-Za-z ])\s{2,}(.{0,11})\s{2,}(\S*)\s{2,}(\S+(?:\s*\S+)?)\s{2,}(\d+\s*\w+)\s{2,}(\S+(?:\s+\S+)?)\s*(.*)?$/
  );

  if (match) {
    const type = match[5].trim();
    const status = match[7].trim();
    return {
      number: parseInt(match[1], 10),
      letter: match[2].trim() || '',
      label: match[3].trim(),
      filesystem: match[4].trim(),
      type,
      size: match[6].trim(),
      status,
      info: (match[8] || '').trim(),
      isRaid: RAID_TYPES.some((t) => type.toLowerCase().includes(t.toLowerCase())),
      isHealthy: HEALTHY_STATUSES.some((s) => status.toLowerCase() === s.toLowerCase()),
    };
  }

  // Fallback: positional parsing
  try {
    const volMatch = line.match(/Volume\s+(\d+)/);
    if (!volMatch) return null;

    const number = parseInt(volMatch[1], 10);
    const rest = line.substring(volMatch.index + volMatch[0].length).trim();
    const parts = rest.split(/\s{2,}/);

    const letter = (parts[0] || '').trim();
    const label = (parts[1] || '').trim();
    const filesystem = (parts[2] || '').trim();
    const type = (parts[3] || '').trim();
    const size = (parts[4] || '').trim();
    const status = (parts[5] || '').trim();
    const info = (parts[6] || '').trim();

    return {
      number,
      letter: letter.length === 1 ? letter : '',
      label,
      filesystem,
      type,
      size,
      status,
      info,
      isRaid: RAID_TYPES.some((t) => type.toLowerCase().includes(t.toLowerCase())),
      isHealthy: HEALTHY_STATUSES.some((s) => status.toLowerCase() === s.toLowerCase()),
    };
  } catch (_) {
    return null;
  }
}

/**
 * Parse `diskpart list disk` output.
 * @param {string} raw - Raw diskpart stdout
 * @returns {object[]} Parsed disk objects
 */
function parseListDisk(raw) {
  if (!raw) return [];

  const lines = raw.split('\n').map((l) => l.replace('\r', ''));
  const disks = [];

  let inDiskSection = false;

  for (const line of lines) {
    if (/Disk\s+###/.test(line)) {
      inDiskSection = true;
      continue;
    }
    if (inDiskSection && /^\s*-{3,}/.test(line)) continue;
    if (!inDiskSection) continue;
    if (!line.trim() || /DISKPART>/.test(line)) {
      if (inDiskSection && disks.length > 0) break;
      continue;
    }

    const match = line.match(
      /^\s*Disk\s+(\d+)\s+(\w+)\s+(\d+\s*\w+)\s+(\d+\s*\w+)\s*(.*)?$/
    );
    if (match) {
      disks.push({
        number: parseInt(match[1], 10),
        status: match[2].trim(),
        size: match[3].trim(),
        free: match[4].trim(),
        info: (match[5] || '').trim(),
        isDynamic: (match[5] || '').toLowerCase().includes('dynamic'),
      });
    }
  }

  return disks;
}

/**
 * Parse complete diskpart output containing both volume and disk listings.
 * @param {string} raw - Full diskpart output
 * @returns {{ volumes: object[], disks: object[] }}
 */
function parseDiskpartOutput(raw) {
  // Split output into volume and disk sections
  const volumeSection = extractSection(raw, 'Volume ###');
  const diskSection = extractSection(raw, 'Disk ###');

  return {
    volumes: parseListVolume(volumeSection || raw),
    disks: parseListDisk(diskSection || raw),
  };
}

/**
 * Extract a section from diskpart output starting from a header keyword.
 */
function extractSection(raw, headerKeyword) {
  const idx = raw.indexOf(headerKeyword);
  if (idx === -1) return null;

  // Find the start (include some context before the header)
  const lineStart = raw.lastIndexOf('\n', idx);
  return raw.substring(lineStart === -1 ? idx : lineStart);
}

/**
 * Determine overall RAID health from parsed volumes.
 * @param {object[]} volumes - Parsed volume array
 * @returns {'healthy'|'degraded'|'failed'|'no-raid'}
 */
function determineOverallStatus(volumes) {
  const raidVolumes = volumes.filter((v) => v.isRaid);
  if (raidVolumes.length === 0) return 'no-raid';

  const hasFailure = raidVolumes.some((v) =>
    ['Failed Rd', 'Failed', 'No Redundancy'].some((s) =>
      v.status.toLowerCase().includes(s.toLowerCase())
    )
  );
  if (hasFailure) return 'failed';

  const hasDegraded = raidVolumes.some((v) => !v.isHealthy);
  if (hasDegraded) return 'degraded';

  return 'healthy';
}

module.exports = {
  parseListVolume,
  parseListDisk,
  parseDiskpartOutput,
  determineOverallStatus,
  RAID_TYPES,
  HEALTHY_STATUSES,
};
