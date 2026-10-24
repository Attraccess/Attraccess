const path = require('node:path');

/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: 'org.attraccess.companion',
  productName: 'Attraccess Companion',
  icon: path.join(__dirname, '../frontend/public/icon-512.png'),
  // Electron bundles its own Node runtime; .nvmrc only selects the build toolchain.
  // Electron 45 uses Node 24 and Chromium's Brotli decoder with the CVE-2026-111497 fix.
  electronVersion: require('electron/package.json').version,
  directories: {
    output: 'dist',
  },
  files: ['out/**/*', 'src/**/*', 'renderer/dist/**/*'],
  extraMetadata: {
    main: 'out/main.js',
  },
  // ponytail: the app has no runtime deps (secrets use electron's built-in safeStorage), so
  // there is nothing to rebuild and pnpm's production-install (which trashes workspace dev-deps) is skipped
  npmRebuild: false,
  // artifactName pattern matches what copy-companion-into-assets.js and the CI expect
  artifactName: 'companion_${os}_${arch}.${ext}',
  mac: {
    target: [{ target: 'dmg', arch: ['universal'] }],
  },
  win: {
    icon: path.join(__dirname, 'assets/icon.ico'),
    target: [{ target: 'nsis', arch: ['x64'] }],
  },
  linux: {
    target: [{ target: 'AppImage', arch: ['x64', 'arm64'] }],
  },
};
