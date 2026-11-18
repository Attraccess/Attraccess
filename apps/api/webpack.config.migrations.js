const { NxAppWebpackPlugin } = require('@nx/webpack/app-plugin');
const { join } = require('path');
const glob = require('glob');
const { existsSync, readFileSync } = require('fs');
const { parseEnv } = require('util');
const { resolveMigrationTrack } = require('./migration-tracks.cjs');

// The typeorm CLI reads DATABASE_TYPE from the environment or the root .env; the build selects the track the same way.
const dotenvPath = join(__dirname, '../../.env');
const dotenvValues = existsSync(dotenvPath) ? parseEnv(readFileSync(dotenvPath, 'utf8')) : {};
// An unsupported DATABASE_TYPE fails here, before webpack compiles anything.
const track = resolveMigrationTrack({ ...dotenvValues, ...process.env });

// Get all migration files of the selected backend's track
const migrationFiles = glob.sync(`${track.directory}/**/*.ts`);
const migrationEntries = migrationFiles.reduce((acc, file) => {
  const key = './' + file.replace('apps/api/src/database/', '');
  acc[key] = file;
  return acc;
}, {});

module.exports = {
  output: {
    path: join(__dirname, '../../dist/apps/migrations'),
    library: {
      type: 'commonjs2',
    },
  },
  plugins: [
    new NxAppWebpackPlugin({
      target: 'node',
      compiler: 'tsc',
      main: './src/database/datasource.ts',
      tsConfig: './tsconfig.app.json',
      // Migrations seed email defaults from the deployed assets directory.
      assets: ['./src/assets'],
      optimization: false,
      outputHashing: 'none',
      generatePackageJson: true,
      deleteOutputPath: true,
    }),
  ],
  externals: {
    typeorm: 'commonjs typeorm',
    tslib: 'commonjs tslib',
    zod: 'commonjs zod',
    pg: 'commonjs pg',
  },
  entry: {
    main: './apps/api/src/database/datasource.ts',
    ...migrationEntries,
  },
};
