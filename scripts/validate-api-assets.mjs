import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const companionPlatforms = [
  ['win32', 'x64'],
  ['darwin', 'universal'],
  ['linux', 'x64'],
  ['linux', 'arm64'],
];

function artifact(directory, filename) {
  if (typeof filename !== 'string' || !filename || path.basename(filename) !== filename) {
    throw new Error(`Invalid artifact filename: ${filename}`);
  }
  const file = path.join(directory, filename);
  if (!fs.statSync(file).isFile() || fs.statSync(file).size === 0) {
    throw new Error(`Artifact is missing or empty: ${file}`);
  }
  return file;
}

export function validateCompanion(directory, allPlatforms = false) {
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'companions.json'), 'utf8'));
  if (!Array.isArray(manifest.platforms) || !manifest.platforms.length) {
    throw new Error('No Companion installers bundled');
  }
  for (const entry of manifest.platforms) {
    const file = artifact(directory, entry.filename);
    const content = fs.readFileSync(file);
    if (content.length !== entry.size || createHash('sha256').update(content).digest('hex') !== entry.sha256) {
      throw new Error(`Companion installer size or checksum mismatch: ${entry.filename}`);
    }
  }
  const host = companionPlatforms.find(
    ([platform, arch]) =>
      platform === process.platform && (arch === process.arch || arch === 'universal' || platform === 'win32'),
  );
  if (!allPlatforms && !host) throw new Error(`Unsupported Companion build host: ${process.platform}/${process.arch}`);
  for (const [platform, arch] of allPlatforms ? companionPlatforms : [host]) {
    if (!manifest.platforms.some((entry) => entry.platform === platform && entry.arch === arch)) {
      throw new Error(`Missing Companion installer for ${platform}/${arch}`);
    }
  }
}

export function validateAttractap(directory) {
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'firmwares.json'), 'utf8'));
  if (!Array.isArray(manifest.firmwares) || !manifest.firmwares.length) {
    throw new Error('No Attractap firmware bundled');
  }
  for (const entry of manifest.firmwares) {
    artifact(directory, entry.filename);
    artifact(directory, entry.filenameOTA);
    if (entry.elfFilename) artifact(directory, entry.elfFilename);
    if (entry.secureImage) validateSecureImage(directory, entry);
  }
}

const sha256Hex = /^[0-9a-f]{64}$/;

function validateSecureImage(directory, entry) {
  const image = entry.secureImage;
  const app = artifact(directory, image.appFilename);
  const bootloader = artifact(directory, image.bootloaderFilename);
  if (image.appFilename === entry.filename || image.appFilename === entry.filenameOTA) {
    throw new Error(`Secure image must not reuse a plain firmware file: ${image.appFilename}`);
  }
  if (!Number.isInteger(image.secureVersion) || image.secureVersion < 1) {
    throw new Error(`Invalid secureVersion for ${image.appFilename}`);
  }
  if (typeof image.profileMarker !== 'string' || !image.profileMarker) {
    throw new Error(`Missing profile marker for ${image.appFilename}`);
  }
  if (!fs.readFileSync(app).includes(image.profileMarker)) {
    throw new Error(`Secure app does not carry its profile marker: ${image.appFilename}`);
  }
  for (const [file, hash] of [
    [app, image.appSha256],
    [bootloader, image.bootloaderSha256],
  ]) {
    if (createHash('sha256').update(fs.readFileSync(file)).digest('hex') !== hash) {
      throw new Error(`Secure image checksum mismatch: ${path.basename(file)}`);
    }
  }
  if (!sha256Hex.test(image.partitionTableSha256 ?? '')) {
    throw new Error(`Invalid partition table hash for ${image.appFilename}`);
  }
}

export function hashAssets(directory) {
  const hash = createHash('sha256');
  for (const name of ['companion-app', 'attractap-firmwares']) {
    const root = path.join(directory, name);
    if (!fs.existsSync(root)) continue;
    for (const filename of fs.readdirSync(root, { recursive: true }).sort()) {
      const file = path.join(root, filename);
      if (fs.statSync(file).isFile()) {
        hash.update(`${name}/${filename}\0`);
        hash.update(fs.readFileSync(file));
      }
    }
  }
  return hash.digest('hex');
}

export function main(args = process.argv.slice(2)) {
  const directory =
    args.find((arg) => arg.startsWith('--assets-dir='))?.slice('--assets-dir='.length) ?? 'apps/api/src/assets';
  if (args.includes('--hash')) {
    console.log(hashAssets(directory));
    return;
  }
  if (args.includes('--companion=local') || args.includes('--companion=all')) {
    validateCompanion(path.join(directory, 'companion-app'), args.includes('--companion=all'));
  }
  if (args.includes('--attractap')) validateAttractap(path.join(directory, 'attractap-firmwares'));
  const source = args.find((arg) => arg.startsWith('--compare-to='))?.slice('--compare-to='.length);
  if (source && hashAssets(source) !== hashAssets(directory)) {
    throw new Error('Bundled API assets differ from the supplied build artifacts');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    main();
  } catch (error) {
    console.error(`Asset validation failed: ${error.message}`);
    process.exitCode = 1;
  }
}
