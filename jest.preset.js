const nxPreset = require('@nx/jest/preset').default;

module.exports = {
  ...nxPreset,
  setupFiles: [require.resolve('./scripts/jest-docker-context.ts')],
};
