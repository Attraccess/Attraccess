/* eslint-disable no-console -- CLI diagnostics are intentional. */
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';

const codeExtension =
  /\.(?:[cm]?[jt]sx?|c|cc|cpp|cxx|h|hh|hpp|hxx|m|mm|py|sh|bash|zsh|sql|scad|css|scss|sass|less|html|mjml)$/i;
const excludedDirectory = /(^|\/)(node_modules|dist|build|coverage|managed_components|generated|\.tools|\.nx)(\/|$)/;
const generatedClients = /^libs\/(react-query-client|companion-ws-client)\/src\/lib\//;

function limitFor(file) {
  if (
    !codeExtension.test(file) ||
    excludedDirectory.test(file) ||
    generatedClients.test(file) ||
    file === 'apps/frontend/public/openscad/openscad.wasm.js'
  )
    return null;
  const testDirectory = /(^|\/)(__tests__|__mocks__|tests?|test-utils|fixtures|acceptance|e2e)(\/|$)/;
  const testName = /(?:^|[/. _-])(spec|test|tests|e2e|cy)(?:[. _-]|$)/;
  return testDirectory.test(file) || testName.test(path.basename(file)) ? 299 : 199;
}

function lineCount(content) {
  if (content.length === 0) return 0;
  return content.split(/\r\n|\r|\n/).length - Number(/[\r\n]$/.test(content));
}

function git(args, options = {}) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024, ...options });
}

function entries(output, staged = false) {
  return output
    .split('\0')
    .filter(Boolean)
    .map((entry) => {
      const tab = entry.indexOf('\t');
      const [mode, second, third] = entry.slice(0, tab).split(' ');
      if (staged && third !== '0') throw new Error('Resolve merge conflicts before checking file sizes.');
      return { file: entry.slice(tab + 1), mode, oid: second === 'blob' ? third : second };
    })
    .filter(({ file, mode }) => /^100/.test(mode) && limitFor(file) !== null);
}

// Batch by object ID so filenames containing whitespace or newlines remain safe.
function blobLines(files) {
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
    result.set(file, lineCount(output.subarray(start, offset).toString('utf8')));
    offset += 1;
  }
  return result;
}

function check() {
  let staged = false;
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--staged') staged = true;
    else throw new Error('Usage: node scripts/check-file-size.mjs [--staged]');
  }
  const root = git(['rev-parse', '--show-toplevel']).trim();
  process.chdir(root);
  const current = staged ? blobLines(entries(git(['ls-files', '--stage', '-z']), true)) : new Map();
  if (!staged) {
    const files = new Set(
      git(['ls-files', '--cached', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean),
    );
    for (const file of files) {
      if (limitFor(file) === null) continue;
      try {
        if (lstatSync(file).isFile()) current.set(file, lineCount(readFileSync(file, 'utf8')));
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
  }
  const violations = [...current].filter(([file, lines]) => lines > limitFor(file));
  for (const [file, lines] of violations.sort(([a], [b]) => a.localeCompare(b))) {
    console.error(`${JSON.stringify(file)}: ${lines} lines (maximum ${limitFor(file)}).`);
  }
  if (violations.length) {
    console.error('Split or refactor oversized files. See CONTRIBUTING.md.');
    process.exitCode = 1;
  } else {
    console.log(`File size check passed (${current.size} files).`);
  }
}

try {
  check();
} catch (error) {
  console.error(`File size check failed: ${error.message}`);
  process.exitCode = 1;
}
