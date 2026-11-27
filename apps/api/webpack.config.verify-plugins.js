const { NxAppWebpackPlugin } = require('@nx/webpack/app-plugin');
const { DefinePlugin } = require('webpack');
const { join } = require('path');
const semver = require('semver');
const apiPkg = require('./package.json');

// The host under test is this checkout, which ships as the next release: a plugin that needs something added since the
// last release declares that version as its minimum, before the release has raised package.json.
const upcomingVersion = semver.inc(apiPkg.version || '0.0.0', 'prerelease');

module.exports = {
  output: {
    path: join(__dirname, '../../dist/apps/api-verify-plugins'),
  },
  plugins: [
    new NxAppWebpackPlugin({
      target: 'node',
      compiler: 'tsc',
      main: './src/main.verify-packed-plugins.ts',
      tsConfig: './tsconfig.app.json',
      optimization: false,
      outputHashing: 'none',
      generatePackageJson: false,
      deleteOutputPath: true,
    }),
    new DefinePlugin({
      'process.env.ATTRACCESS_VERSION': JSON.stringify(upcomingVersion),
    }),
  ],
};
