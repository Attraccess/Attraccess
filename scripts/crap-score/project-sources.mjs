import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const workspace = fileURLToPath(new URL('../../', import.meta.url));

export function isSource(file) {
  return (
    /\.[cm]?[jt]sx?$/.test(file) &&
    // Upstream OpenSCAD WebAssembly runtime, distributed unchanged with the app.
    file !== 'apps/frontend/public/openscad/openscad.wasm.js' &&
    !/(^|\/)(__tests__|__mocks__|test|tests|test-utils|fixtures|generated|node_modules|dist|package)(\/|$)/.test(
      file,
    ) &&
    !/\.(spec|test|d)\.[cm]?[jt]sx?$/.test(file) &&
    !/(^|\/)(test-setup|jest\.setup)\.[jt]s$/.test(file) &&
    !/^libs\/(react-query-client|companion-ws-client)\/src\/lib\//.test(file)
  );
}

export function ownedFiles(root, tracked) {
  const projects = tracked
    .filter((file) => /(^|\/)project\.json$/.test(file))
    .map((file) => path.dirname(file))
    .filter((directory) => directory !== '.')
    .sort((a, b) => b.length - a.length);
  return tracked.filter((file) => (projects.find((directory) => file.startsWith(`${directory}/`)) ?? '.') === root);
}
