const { transformSync } = require('esbuild');

// JOSE 6 is ESM-only. Keep its modern class semantics when loading it in CJS Jest.
module.exports = {
  process(sourceText, sourcePath) {
    return transformSync(sourceText, { sourcefile: sourcePath, format: 'cjs', target: 'node24', sourcemap: 'inline' });
  },
};
