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
  // ponytail: the app has no runtime deps (secrets use electron's built-in safeStorage), so
  // there is nothing to rebuild and pnpm's production-install (which trashes workspace dev-deps) is skipped
  npmRebuild: false,
  // artifactName pattern matches what copy-companion-into-assets.js and the CI expect
  artifactName: 'companion_${os}_${arch}.${ext}',
  mac: {
    target: [{ target: 'dmg', arch: ['universal'] }],
  },
  // Without an Apple cert electron-builder skips signing entirely, leaving the lipo'd
  // universal binary with only the linker's ad-hoc signature: `Identifier=Electron`,
  // `Info.plist=not bound`, `Sealed Resources=none`. macOS then can't tie a TCC grant
  // (Accessibility) to our bundle id, so the app keeps re-asking for permission the
  // user already gave. An explicit ad-hoc sign binds the real bundle id and seals the
  // bundle. electron-builder's own signing runs after afterPack, so a real Developer ID
  // cert simply overwrites this.
  // ponytail: ad-hoc cdhash still changes on every build, so grants die on self-update —
  // a Developer ID cert (stable designated requirement) is the only fix for that.
  afterPack: async (context) => {
    if (context.electronPlatformName !== 'darwin') return;
    if (context.appOutDir.endsWith('-temp')) return; // per-arch pack, merged copy gets signed instead
    const { join } = require('path');
    const { execFileSync } = require('child_process');
    const app = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
    execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
  },
  win: {
    target: [{ target: 'nsis', arch: ['x64'] }],
  },
  linux: {
    target: [{ target: 'AppImage', arch: ['x64', 'arm64'] }],
  },
};
