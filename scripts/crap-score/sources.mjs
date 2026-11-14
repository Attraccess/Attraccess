import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Source rules shared by the crap-score analysis and the Node test runner.
export const workspace = fileURLToPath(new URL('../../', import.meta.url));

export function isSource(file) {
  return (
    /\.[cm]?[jt]sx?$/.test(file) &&
    // Upstream OpenSCAD WebAssembly runtime, distributed unchanged with the app.
    file !== 'apps/frontend/public/openscad/openscad.wasm.js' &&
    !/(^|\/)(__tests__|__mocks__|test|tests|test-utils|fixtures|generated|node_modules|dist|package|\.nx-cache|\.nx-workspace-data|\.electron-cache|\.npm-cache)(\/|$)/.test(
      file,
    ) &&
    !/\.(spec|test|test-utils|test-fixture|d)\.[cm]?[jt]sx?$/.test(file) &&
    !/(^|\/)(test-setup|jest\.setup)\.[jt]s$/.test(file) &&
    !/^libs\/(react-query-client|companion-ws-client)\/src\/lib\//.test(file)
  );
}

const gitFiles = (args, cwd) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 })
    .split('\0')
    .filter(Boolean);

// Existing tracked and untracked (not ignored) files below `cwd`. A gitlink (mode 160000) is a directory, not a
// file: a checked-out submodule contributes its own files under its path, one that is not checked out contributes
// nothing. `submodules` lists every gitlink path, checked out or not.
export function workspaceFiles(cwd = workspace) {
  const submodules = gitFiles(['ls-files', '--stage', '-z'], cwd)
    .filter((entry) => entry.startsWith('160000 '))
    .map((entry) => entry.slice(entry.indexOf('\t') + 1));
  const files = gitFiles(['ls-files', '--cached', '--others', '--exclude-standard', '-z'], cwd).filter(
    (file) => !submodules.includes(file) && existsSync(path.resolve(cwd, file)),
  );
  for (const submodule of [...submodules]) {
    if (!existsSync(path.join(cwd, submodule, '.git'))) continue;
    const nested = workspaceFiles(path.join(cwd, submodule));
    files.push(...nested.files.map((file) => `${submodule}/${file}`));
    submodules.push(...nested.submodules.map((file) => `${submodule}/${file}`));
  }
  return { files, submodules };
}

// A submodule is a separate repository, so it bounds ownership like a project does: the workspace root never owns
// its files.
export function ownedFiles(root, tracked, submodules = []) {
  const projects = tracked
    .filter((file) => /(^|\/)project\.json$/.test(file))
    .map((file) => path.dirname(file))
    .filter((directory) => directory !== '.')
    .concat(submodules)
    .sort((a, b) => b.length - a.length);
  return tracked.filter((file) => (projects.find((directory) => file.startsWith(`${directory}/`)) ?? '.') === root);
}
