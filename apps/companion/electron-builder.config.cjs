/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: 'de.attraccess.companion',
  productName: 'Attraccess Companion',
  // ponytail: resolved at build time so it stays in sync with the installed version
  electronVersion: require('../../node_modules/electron/package.json').version,
  directories: {
    output: '../../dist/apps/companion',
  },
  files: ['out/**/*', 'src/**/*'],
  extraMetadata: {
    main: 'out/main.js',
  },
  mac: { target: 'dir' },
  win: { target: 'dir' },
  linux: { target: 'dir' },
};
