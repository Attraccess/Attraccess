const { NxAppWebpackPlugin } = require('@nx/webpack/app-plugin');
const { DefinePlugin } = require('webpack');
const { join } = require('path');
const apiPkg = require('./package.json');

module.exports = {
  output: {
    path: join(__dirname, '../../dist/apps/api'),
  },
  plugins: [
    new NxAppWebpackPlugin({
      target: 'node',
      compiler: 'tsc',
      main: './src/main.ts',
      tsConfig: './tsconfig.app.json',
      assets: ['./src/assets'],
      optimization: false,
      outputHashing: 'none',
      generatePackageJson: true,
      deleteOutputPath: true,
    }),
    new DefinePlugin({
      'process.env.ATTRACCESS_VERSION': JSON.stringify(apiPkg.version || '0.0.0'),
    }),
  ],
};
