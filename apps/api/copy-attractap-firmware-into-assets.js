const fs = require('fs');
const path = require('path');
const crypto = require('node:crypto');

/* eslint-disable no-console */

const assetsDir = path.resolve(__dirname, 'src/assets/attractap-firmwares');
const origins = [
  { name: 'attractap', path: path.resolve(__dirname, '../attractap/firmware/firmware_output') },
  { name: 'attractap-touch', path: path.resolve(__dirname, '../attractap-touch-firmware/firmware_output') },
];

function contained(root, filename) {
  if (typeof filename !== 'string' || !/^[A-Za-z0-9_.-]+$/.test(filename)) throw new Error('Invalid firmware filename');
  const result = path.join(root, filename);
  if (!fs.lstatSync(result).isFile() || fs.lstatSync(result).isSymbolicLink())
    throw new Error('Invalid firmware artifact');
  return result;
}

function canonical(value) {
  if (value && typeof value === 'object' && !Array.isArray(value))
    return (
      '{' +
      Object.keys(value)
        .sort()
        .map((key) => JSON.stringify(key) + ':' + canonical(value[key]))
        .join(',') +
      '}'
    );
  return JSON.stringify(value);
}

function checkQualification(firmware, root, trustFile = process.env.ATTRACTAP_QUALIFICATION_PUBLIC_KEY_FILE) {
  if (!firmware || typeof firmware !== 'object' || typeof firmware.filename !== 'string' || !firmware.filename)
    throw new Error('Invalid firmware entry');
  const binaries = [firmware.filename, firmware.filenameOTA].filter(Boolean);
  const artifacts = {};
  let signed = false;
  for (const filename of binaries) {
    const artifact = contained(root, filename);
    if (fs.statSync(artifact).size > 16 * 1024 * 1024) throw new Error('Firmware exceeds supported flash geometry');
    const bytes = fs.readFileSync(artifact);
    if (bytes.length > 16 * 1024 * 1024) throw new Error('Firmware exceeds supported flash geometry');
    for (let offset = 0; offset + 4 <= bytes.length; offset += 4096)
      if (bytes.readUInt32LE(offset) === 0x000002e7) signed = true;
    artifacts[filename] = crypto.createHash('sha256').update(bytes).digest('hex');
  }
  const production = firmware.securityProfile === 'production' || signed;
  if (!production) {
    if (firmware.securityProfile && !['bridge', 'development'].includes(firmware.securityProfile))
      throw new Error('Unknown firmware security profile');
    return;
  }
  if (firmware.securityProfile !== 'production' || !trustFile || !firmware.qualificationFile)
    throw new Error('Production firmware requires independently signed hardware qualification');
  const trustDirectory = fs.lstatSync(path.dirname(trustFile));
  const trust = fs.lstatSync(trustFile);
  if (
    !trustDirectory.isDirectory() ||
    trustDirectory.uid !== process.getuid() ||
    (trustDirectory.mode & 0o777) !== 0o700 ||
    !trust.isFile() ||
    trust.uid !== process.getuid() ||
    (trust.mode & 0o777) !== 0o600 ||
    trust.isSymbolicLink()
  )
    throw new Error('Unsafe qualification trust');
  const receiptBytes = fs.readFileSync(contained(root, firmware.qualificationFile));
  if (receiptBytes.length > 16384) throw new Error('Qualification exceeds limit');
  const receipt = JSON.parse(receiptBytes.toString('utf8'));
  const body = receipt.payload;
  const now = Math.floor(Date.now() / 1000);
  const expected = [
    'version',
    'model',
    'evidenceClass',
    'result',
    'reviewer',
    'qualifiedAt',
    'expiresAt',
    'inventoryDigest',
    'evidenceDigest',
    'artifacts',
  ];
  if (
    !body ||
    Object.keys(body).length !== expected.length ||
    expected.some((key) => !(key in body)) ||
    body.version !== 1 ||
    body.model !== 'existing-board-v1' ||
    body.evidenceClass !== 'hardware' ||
    body.result !== 'passed' ||
    !/^[A-Za-z0-9@._ -]{1,100}$/.test(body.reviewer) ||
    !Number.isSafeInteger(body.qualifiedAt) ||
    !Number.isSafeInteger(body.expiresAt) ||
    !(
      0 <= body.qualifiedAt &&
      body.qualifiedAt <= now &&
      now < body.expiresAt &&
      body.expiresAt <= body.qualifiedAt + 366 * 86400
    ) ||
    !/^[a-f0-9]{64}$/.test(body.inventoryDigest) ||
    !/^[a-f0-9]{64}$/.test(body.evidenceDigest) ||
    !body.artifacts ||
    Array.isArray(body.artifacts) ||
    Object.entries(body.artifacts).some(
      ([name, digest]) => !/^[A-Za-z0-9_.-]{1,128}$/.test(name) || !/^[a-f0-9]{64}$/.test(digest),
    ) ||
    Object.entries(artifacts).some(([name, digest]) => body.artifacts[name] !== digest)
  )
    throw new Error('Qualification does not match firmware');
  const key = crypto.createPublicKey(fs.readFileSync(trustFile));
  if (
    key.asymmetricKeyType !== 'rsa' ||
    key.asymmetricKeyDetails.modulusLength < 3072 ||
    !crypto.verify(
      'sha256',
      Buffer.from('ATTR-QUAL-V1\n' + canonical(body), 'ascii'),
      { key, padding: crypto.constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 },
      Buffer.from(receipt.signature, 'base64'),
    )
  )
    throw new Error('Invalid qualification signature');
}

function copyFirmwareAssets(destination = assetsDir, sources = origins) {
  // Validate every catalog before replacing the last usable asset set. Only
  // explicitly listed files are copied; unlisted binaries/directories never pass.
  const catalogs = sources
    .filter((origin) => fs.existsSync(origin.path))
    .map((origin) => {
      const file = path.join(origin.path, 'firmwares.json');
      if (!fs.existsSync(file)) return { origin, firmwares: [] };
      const firmwares = JSON.parse(fs.readFileSync(file, 'utf8')).firmwares;
      if (!Array.isArray(firmwares)) throw new Error('Invalid firmware catalog');
      for (const firmware of firmwares) checkQualification(firmware, origin.path);
      return { origin, firmwares };
    });
  const stage = fs.mkdtempSync(destination + '.staging-');
  const combined = [];
  try {
    for (const { origin, firmwares } of catalogs)
      for (const firmware of firmwares) {
        for (const filename of [
          firmware.filename,
          firmware.filenameOTA,
          firmware.elfFilename,
          firmware.qualificationFile,
        ].filter(Boolean)) {
          const source = contained(origin.path, filename);
          const target = path.join(stage, filename);
          if (fs.existsSync(target) && !fs.readFileSync(target).equals(fs.readFileSync(source)))
            throw new Error('Conflicting firmware filenames');
          fs.copyFileSync(source, target);
        }
        combined.push(firmware);
      }
    fs.writeFileSync(path.join(stage, 'firmwares.json'), JSON.stringify({ firmwares: combined }, null, 2));
    fs.rmSync(destination, { recursive: true, force: true });
    fs.renameSync(stage, destination);
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }
  return combined;
}

module.exports = { checkQualification, copyFirmwareAssets };
if (require.main === module) {
  fs.mkdirSync(path.dirname(assetsDir), { recursive: true });
  console.log(`Copied ${copyFirmwareAssets().length} firmware definitions`);
}
