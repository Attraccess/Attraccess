const { NxAppWebpackPlugin } = require('@nx/webpack/app-plugin');
const { DefinePlugin } = require('webpack');
const { join } = require('path');
const apiPkg = require('./package.json');

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
      'process.env.ATTRACCESS_VERSION': JSON.stringify(apiPkg.version || '0.0.0'),
    }),
  ],
};
