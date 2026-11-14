import { execFileSync } from 'node:child_process';

// Generated or vendored code that the repository lint checks skip.
export const excludedDirectory =
  /(^|\/)(node_modules|dist|build|coverage|managed_components|generated|\.tools|\.nx)(\/|$)/;
export const generatedClients = /^libs\/(react-query-client|companion-ws-client)\/src\/lib\//;

export function git(args, options = {}) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024, ...options });
}

// Batch by object ID so filenames containing whitespace or newlines remain safe.
export function readBlobs(files) {
  const result = new Map();
  if (files.length === 0) return result;
  const output = git(['cat-file', '--batch'], { input: files.map(({ oid }) => oid).join('\n') + '\n', encoding: null });
  let offset = 0;
  for (const { file } of files) {
    const end = output.indexOf(10, offset);
    const [, type, size] = output.subarray(offset, end).toString().split(' ');
    if (type !== 'blob') throw new Error(`Could not read Git blob for ${file}.`);
    const start = end + 1;
    offset = start + Number(size);
    result.set(file, output.subarray(start, offset).toString('utf8'));
    offset += 1;
  }
  return result;
}
