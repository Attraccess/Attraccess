/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: 'org.attraccess.companion',
  productName: 'Attraccess Companion',
  // ponytail: resolved at build time so it stays in sync with the installed version
  electronVersion: require('../../node_modules/electron/package.json').version,
  directories: {
    // gitignored via apps/companion/.gitignore; CI and copy-companion-into-assets.js both read from here
    output: 'dist',
  },
  files: ['out/**/*', 'src/**/*', 'renderer/dist/**/*'],
  extraMetadata: {
    main: 'out/main.js',
  },
  mac: {
    target: [{ target: 'dmg', arch: 'universal' }],
    artifactName: 'companion_mac_universal.dmg',
  },
  win: {
    target: [{ target: 'nsis', arch: ['x64'] }],
    artifactName: 'companion_win_x64.exe',
  },
  linux: {
    target: [
      { target: 'AppImage', arch: ['x64'] },
      { target: 'AppImage', arch: ['arm64'] },
    ],
    artifactName: 'companion_linux_${arch}.AppImage',
  },
  nsis: {
    oneClick: true,
    perMachine: false,
  },
};
