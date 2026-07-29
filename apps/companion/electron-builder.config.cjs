/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: 'org.attraccess.companion',
  productName: 'Attraccess Companion',
  // ponytail: resolved at build time so it stays in sync with the installed version
  electronVersion: require('../../node_modules/electron/package.json').version,
  directories: {
    output: 'dist',
  },
  files: ['out/**/*', 'src/**/*', 'renderer/dist/**/*'],
  extraMetadata: {
    main: 'out/main.js',
  },
  // ponytail: keytar is external to the esbuild bundle; false skips pnpm production-install (which trashes workspace dev-deps) and relies on keytar's node-pre-gyp prebuilts being ABI-compatible with the bundled electron version
  npmRebuild: false,
  // artifactName pattern matches what copy-companion-into-assets.js and the CI expect
  artifactName: 'companion_${os}_${arch}.${ext}',
  mac: {
    target: [{ target: 'dmg', arch: ['universal'] }],
  },
  win: {
    target: [{ target: 'nsis', arch: ['x64'] }],
  },
  linux: {
    target: [{ target: 'AppImage', arch: ['x64', 'arm64'] }],
  },
};
