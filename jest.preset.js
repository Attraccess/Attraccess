const nxPreset = require('@nx/jest/preset').default;

// Jest's 5 s default fails healthy tests on a loaded machine (parallel worktrees, coverage
// runs, slow CI hosts). Configs that need longer still set their own testTimeout.
module.exports = { ...nxPreset, testTimeout: 30_000 };
