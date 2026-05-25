const {
  parseListVolume,
  parseListDisk,
  parseDiskpartOutput,
  determineOverallStatus,
} = require('../src/monitor/parser');

describe('parseListVolume', () => {
  it('returns empty array for empty input', () => {
    expect(parseListVolume('')).toEqual([]);
    expect(parseListVolume(null)).toEqual([]);
    expect(parseListVolume(undefined)).toEqual([]);
  });

  it('parses a simple volume listing', () => {
    const input =
      '  Volume ###  Ltr  Label        Fs     Type        Size     Status     Info\n' +
      '  ----------  ---  -----------  -----  ----------  -------  --------  ------\n' +
      '  Volume 0    C    System       NTFS   Mirror      100 GB   Healthy   \n' +
      '  Volume 1    D    Data         NTFS   RAID-5      2000 GB  Healthy   \n';
    const result = parseListVolume(input);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      number: 0, letter: 'C', label: 'System',
      filesystem: 'NTFS', type: 'Mirror', size: '100 GB',
      status: 'Healthy', isRaid: true, isHealthy: true,
    });
    expect(result[1]).toMatchObject({
      number: 1, letter: 'D', label: 'Data',
      type: 'RAID-5', size: '2000 GB',
      status: 'Healthy', isRaid: true, isHealthy: true,
    });
  });

  it('marks degraded volumes correctly', () => {
    const input =
      '  Volume ###  Ltr  Label        Fs     Type        Size     Status     Info\n' +
      '  ----------  ---  -----------  -----  ----------  -------  --------  ------\n' +
      '  Volume 0    C    System       NTFS   Mirror      100 GB   Failed Rd  \n';
    const result = parseListVolume(input);
    expect(result[0].isHealthy).toBe(false);
    expect(result[0].status).toBe('Failed Rd');
  });

  it('detects non-RAID volumes', () => {
    const input =
      '  Volume ###  Ltr  Label        Fs     Type        Size     Status     Info\n' +
      '  ----------  ---  -----------  -----  ----------  -------  --------  ------\n' +
      '  Volume 0    C    System       NTFS   Simple      100 GB   Healthy   \n';
    const result = parseListVolume(input);
    expect(result[0].isRaid).toBe(false);
  });

  it('handles volumes with info column', () => {
    const input =
      '  Volume ###  Ltr  Label        Fs     Type        Size     Status     Info\n' +
      '  ----------  ---  -----------  -----  ----------  -------  --------  ------\n' +
      '  Volume 0    C    System       NTFS   Mirror      100 GB   Healthy    Boot\n';
    const result = parseListVolume(input);
    expect(result[0].info).toBe('Boot');
  });

  it('stops parsing at next disk section', () => {
    const input =
      '  Volume ###  Ltr  Label        Fs     Type        Size     Status     Info\n' +
      '  ----------  ---  -----------  -----  ----------  -------  --------  ------\n' +
      '  Volume 0    C    System       NTFS   Mirror      100 GB   Healthy   \n' +
      '\n' +
      '  Disk ###  Status         Size     Free     Dyn  Gpt\n' +
      '  --------  -------------  -------  -------  ---  ---\n' +
      '  Disk 0    Online         232 GB   0 B      *    *\n';
    const result = parseListVolume(input);
    expect(result).toHaveLength(1);
  });
});

describe('parseListDisk', () => {
  it('returns empty array for empty input', () => {
    expect(parseListDisk('')).toEqual([]);
    expect(parseListDisk(null)).toEqual([]);
  });

  it('parses disk listing correctly', () => {
    const input =
      '  Disk ###  Status         Size     Free     Dyn  Gpt\n' +
      '  --------  -------------  -------  -------  ---  ---\n' +
      '  Disk 0    Online         232 GB   0 B      *    Dynamic\n' +
      '  Disk 1    Online         931 GB   0 B            \n';
    const result = parseListDisk(input);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      number: 0, status: 'Online', size: '232 GB',
      free: '0 B', isDynamic: true,
    });
    expect(result[1]).toMatchObject({
      number: 1, status: 'Online', size: '931 GB',
      free: '0 B', isDynamic: false,
    });
  });

  it('detects non-dynamic disks', () => {
    const input =
      '  Disk ###  Status         Size     Free     Dyn  Gpt\n' +
      '  --------  -------------  -------  -------  ---  ---\n' +
      '  Disk 0    Online         232 GB   0 B            \n';
    const result = parseListDisk(input);
    expect(result[0].isDynamic).toBe(false);
  });
});

describe('determineOverallStatus', () => {
  it('returns healthy when all RAID volumes are healthy', () => {
    const volumes = [
      { isRaid: true, status: 'Healthy', isHealthy: true },
      { isRaid: true, status: 'OK', isHealthy: true },
    ];
    expect(determineOverallStatus(volumes)).toBe('healthy');
  });

  it('returns no-raid when no RAID volumes exist', () => {
    const volumes = [
      { isRaid: false, status: 'Healthy', isHealthy: true },
    ];
    expect(determineOverallStatus(volumes)).toBe('no-raid');
  });

  it('returns degraded when at least one RAID volume is not healthy', () => {
    const volumes = [
      { isRaid: true, status: 'Healthy', isHealthy: true },
      { isRaid: true, status: 'Rebuild', isHealthy: false },
    ];
    expect(determineOverallStatus(volumes)).toBe('degraded');
  });

  it('returns failed when a RAID volume has Failed Rd status', () => {
    const volumes = [
      { isRaid: true, status: 'Failed Rd', isHealthy: false },
    ];
    expect(determineOverallStatus(volumes)).toBe('failed');
  });

  it('returns failed when a RAID volume has No Redundancy', () => {
    const volumes = [
      { isRaid: true, status: 'No Redundancy', isHealthy: false },
    ];
    expect(determineOverallStatus(volumes)).toBe('failed');
  });

  it('returns empty array result as no-raid', () => {
    expect(determineOverallStatus([])).toBe('no-raid');
  });
});

describe('parseDiskpartOutput', () => {
  it('parses both volumes and disks from full output', () => {
    const input =
      '  Volume ###  Ltr  Label        Fs     Type        Size     Status     Info\n' +
      '  ----------  ---  -----------  -----  ----------  -------  --------  ------\n' +
      '  Volume 0    C    System       NTFS   Mirror      100 GB   Healthy   \n' +
      '  Volume 1    D    Data         NTFS   RAID-5      2000 GB  Healthy   \n' +
      '\n' +
      '  Disk ###  Status         Size     Free     Dyn  Gpt\n' +
      '  --------  -------------  -------  -------  ---  ---\n' +
      '  Disk 0    Online         232 GB   0 B      *    \n' +
      '  Disk 1    Online         931 GB   0 B      *    \n';
    const result = parseDiskpartOutput(input);
    expect(result.volumes).toHaveLength(2);
    expect(result.disks).toHaveLength(2);
  });

  it('handles output without disk section', () => {
    const input =
      '  Volume ###  Ltr  Label        Fs     Type        Size     Status     Info\n' +
      '  ----------  ---  -----------  -----  ----------  -------  --------  ------\n' +
      '  Volume 0    C    System       NTFS   Mirror      100 GB   Healthy   \n';
    const result = parseDiskpartOutput(input);
    expect(result.volumes).toHaveLength(1);
    expect(result.disks).toEqual([]);
  });
});
