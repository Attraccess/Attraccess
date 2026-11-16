const nxPreset = require('@nx/jest/preset').default;

// Jest's 5 s default fails healthy tests on a loaded machine (parallel worktrees, coverage
// runs, slow CI hosts). Configs that need longer still set their own testTimeout.
// Workers keep every module and coverage map they load, so long suites grow them to several
// GB each; recycle a worker once it passes this limit between test files.
module.exports = { ...nxPreset, testTimeout: 30_000, workerIdleMemoryLimit: '1GB' };
