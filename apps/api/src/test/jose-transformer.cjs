const { transformSync } = require('esbuild');

// JOSE 6 and otplib's @scure/@noble dependencies are ESM-only. Keep their modern class semantics
// when loading them in CJS Jest.
module.exports = {
  process(sourceText, sourcePath) {
    return transformSync(sourceText, { sourcefile: sourcePath, format: 'cjs', target: 'node24', sourcemap: 'inline' });
  },
};
