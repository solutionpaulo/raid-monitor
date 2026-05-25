/**
 * Install/Uninstall RAID Monitor as a Windows Service.
 * Uses node-windows package.
 *
 * Usage:
 *   node scripts/install-service.js install
 *   node scripts/install-service.js uninstall
 */

const path = require('path');
const action = process.argv[2];

if (!action || !['install', 'uninstall'].includes(action)) {
  console.log('Usage: node scripts/install-service.js [install|uninstall]');
  process.exit(1);
}

let Service;
try {
  Service = require('node-windows').Service;
} catch (e) {
  console.error('node-windows not installed. Run: npm install node-windows');
  process.exit(1);
}

const svc = new Service({
  name: 'RAID Monitor',
  description: 'Monitor de Software RAID - Windows Server Dynamic Disks',
  script: path.join(__dirname, '..', 'server.js'),
  env: [
    { name: 'NODE_ENV', value: 'production' },
  ],
});

if (action === 'install') {
  svc.on('install', () => {
    console.log('Service installed successfully!');
    svc.start();
    console.log('Service started.');
  });
  svc.on('alreadyinstalled', () => {
    console.log('Service is already installed.');
  });
  svc.on('error', (err) => {
    console.error('Error:', err);
  });
  svc.install();
} else {
  svc.on('uninstall', () => {
    console.log('Service uninstalled successfully.');
  });
  svc.on('error', (err) => {
    console.error('Error:', err);
  });
  svc.uninstall();
}
