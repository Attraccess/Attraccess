const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

/* eslint-disable no-console */

const assetsDir = path.resolve(__dirname, 'src/assets/companion-app');
const sourceDir = path.resolve(__dirname, '../companion/dist');

// Known companion binary descriptors — matches the filenames electron-builder
// is configured to produce in apps/companion.
const KNOWN_BINARIES = [
  { filename: 'companion_win_x64.exe', platform: 'win32', arch: 'x64' },
  { filename: 'companion_mac_universal.dmg', platform: 'darwin', arch: 'universal' },
  { filename: 'companion_linux_x86_64.AppImage', platform: 'linux', arch: 'x64' },
  { filename: 'companion_linux_arm64.AppImage', platform: 'linux', arch: 'arm64' },
];

// Clear and recreate assets directory
fs.rmSync(assetsDir, { recursive: true, force: true });
fs.mkdirSync(assetsDir, { recursive: true });
console.log(`Cleared and recreated assets directory: ${assetsDir}`);

if (!fs.existsSync(sourceDir)) {
  console.warn(`Warning: ${sourceDir} does not exist — no companion binaries to bundle.`);
  const empty = { version: '0.0.0', buildId: 'none', platforms: [] };
  fs.writeFileSync(path.join(assetsDir, 'companions.json'), JSON.stringify(empty, null, 2));
  console.log('Created empty companions.json');
  process.exit(0);
}

// Read version from companion package.json
let version = '0.0.0';
const companionPkg = path.resolve(__dirname, '../companion/package.json');
if (fs.existsSync(companionPkg)) {
  try {
    const pkg = JSON.parse(fs.readFileSync(companionPkg, 'utf8'));
    if (pkg.version) version = pkg.version;
  } catch (e) {
    console.warn('Warning: could not read companion package.json:', e.message);
  }
}

// Get build ID from git
let buildId = 'unknown';
try {
  buildId = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
} catch (e) {
  console.warn('Warning: could not get git SHA:', e.message);
}

const manifest = { version, buildId, platforms: [] };

KNOWN_BINARIES.forEach(({ filename, platform, arch }) => {
  const src = path.join(sourceDir, filename);
  if (!fs.existsSync(src)) {
    console.warn(`Warning: ${filename} not found in ${sourceDir}, skipping`);
    return;
  }
  const dest = path.join(assetsDir, filename);
  fs.copyFileSync(src, dest);
  const size = fs.statSync(dest).size;
  const sha256 = crypto.createHash('sha256').update(fs.readFileSync(dest)).digest('hex');
  manifest.platforms.push({ platform, arch, filename, size, sha256 });
  console.log(`Copied: ${filename} (${size} bytes, sha256: ${sha256.slice(0, 16)}…)`);
});

fs.writeFileSync(path.join(assetsDir, 'companions.json'), JSON.stringify(manifest, null, 2));
console.log(`Created companions.json with ${manifest.platforms.length} platform(s)`);
console.log('Companion asset copying completed successfully!');
