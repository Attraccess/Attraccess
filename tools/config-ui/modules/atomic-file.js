'use strict';
const fs = require('fs');
const path = require('path');

// Keep the previous file intact if writing runs out of space or fails midway.
function writeAtomicFile(filePath, content, mode) {
  try {
    fs.accessSync(filePath, fs.constants.W_OK);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporary, content, { encoding: 'utf-8', mode, flag: 'wx' });
    fs.renameSync(temporary, filePath);
  } finally {
    try {
      fs.unlinkSync(temporary);
    } catch {
      // The rename normally removed this path. Cleanup must not mask a write error.
    }
  }
}

module.exports = { writeAtomicFile };
