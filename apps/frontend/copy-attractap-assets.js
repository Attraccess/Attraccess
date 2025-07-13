const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const assetsDir = path.resolve(__dirname, 'public/_attractap_assets');
const origins = [
  { name: 'attractap', path: path.resolve(__dirname, '../attractap-firmware/firmware_output') },
  { name: 'attractap-touch', path: path.resolve(__dirname, '../attractap-touch-firmware/firmware_output') },
];

// Remove the assets directory if it exists
if (fs.existsSync(assetsDir)) {
  fs.rmSync(assetsDir, { recursive: true, force: true });
}
// Recreate the assets directory
fs.mkdirSync(assetsDir, { recursive: true });

// Copy all files from each origin to _attractap_assets
const combinedFirmwareIndex = {
  firmwares: [],
};
origins.forEach((origin) => {
  const targetDir = path.resolve(`${assetsDir}/${origin.name}`);
  // ensure target directory exists
  fs.mkdirSync(targetDir, { recursive: true });
  // copy all files from origin to target
  execSync(`cp -r "${origin.path}"/* "${targetDir}/"`);

  const firmwareIndex = JSON.parse(fs.readFileSync(`${origin.path}/index.json`, 'utf8'));
  console.log(`adding ${firmwareIndex.firmwares.length} firmwares from ${origin.name} to combined manifest`);

  for (const firmware of firmwareIndex.firmwares) {
    combinedFirmwareIndex.firmwares.push({
      ...firmware,
      manifest_path: `/_attractap_assets/${origin.name}/${firmware.manifest_path}`.replace('//', '/'),
    });

    const firmwareManifest = JSON.parse(fs.readFileSync(`${origin.path}/${firmware.manifest_path}`, 'utf8'));
    fs.writeFileSync(
      `${targetDir}/${firmware.manifest_path}`,
      JSON.stringify(
        {
          ...firmwareManifest,
          builds: firmwareManifest.builds.map((build) => ({
            ...build,
            parts: build.parts.map((part) => ({
              ...part,
              path: `/_attractap_assets/${origin.name}/${part.path}`.replace('//', '/'),
            })),
          })),
        },
        null,
        2
      )
    );
  }
});

// create index.json in target directory
fs.writeFileSync(`${assetsDir}/index.json`, JSON.stringify(combinedFirmwareIndex, null, 2));

console.log('Copied attractap firmware assets successfully.');
