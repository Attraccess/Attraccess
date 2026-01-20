import fs from 'fs';
import path from 'path';

const testStorageRoot = process.env.TEST_STORAGE_ROOT
  ? path.resolve(process.env.TEST_STORAGE_ROOT)
  : path.join(process.cwd(), 'tmp', 'api-test-storage');

process.env.STORAGE_ROOT = testStorageRoot;

fs.rmSync(testStorageRoot, { recursive: true, force: true });
fs.mkdirSync(testStorageRoot, { recursive: true });
