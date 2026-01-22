import fs from 'fs';
import * as os from 'os';
import path from 'path';

const testStorageRoot = process.env.TEST_STORAGE_ROOT
  ? path.resolve(process.env.TEST_STORAGE_ROOT)
  : fs.mkdtempSync(
      path.join(
        os.tmpdir(),
        `attraccess-api-test-${process.env.JEST_WORKER_ID ?? '0'}-`,
      ),
    );

process.env.STORAGE_ROOT = testStorageRoot;

fs.rmSync(testStorageRoot, { recursive: true, force: true });
fs.mkdirSync(testStorageRoot, { recursive: true });
