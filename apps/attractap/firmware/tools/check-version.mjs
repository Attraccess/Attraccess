/* eslint-disable no-console -- Release gate diagnostics are intentional. */
import { fileURLToPath } from 'node:url';
// eslint-disable-next-line @nx/enforce-module-boundaries -- Shared workspace release tooling is never bundled into firmware.
import { checkReleaseVersion } from '../../../../scripts/lib/release-version.mjs';

export function isFirmwareSource(file) {
  return (
    file.startsWith('apps/attractap/firmware/') &&
    !/\.(?:md|markdown)$/.test(file) &&
    !/\.(?:spec|test)\.[^/]+$/.test(file) &&
    !/^apps\/attractap\/firmware\/(?:tests?|tools|docs|fixtures|firmware_output|build)\//.test(file)
  );
}

export function checkFirmwareVersion(base = process.env.NX_AFFECTED_BASE ?? 'origin/main') {
  return checkReleaseVersion({
    base,
    versionFile: 'apps/attractap/firmware/version.txt',
    isSource: isFirmwareSource,
    readVersion: (contents) => contents.trim(),
    label: 'Attractap firmware',
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    console.log(checkFirmwareVersion(process.argv[2]));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
