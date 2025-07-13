const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const assetsDir = path.resolve(__dirname, 'src/assets/attractap-firmwares');
const origins = [
  { name: 'attractap', path: path.resolve(__dirname, '../attractap-firmware/firmware_output') },
  { name: 'attractap-touch', path: path.resolve(__dirname, '../attractap-touch-firmware/firmware_output') },
];

// Clear assets directory if it exists
if (fs.existsSync(assetsDir)) {
  fs.readdirSync(assetsDir).forEach((file) => {
    const curPath = path.join(assetsDir, file);
    if (fs.lstatSync(curPath).isDirectory()) {
      fs.rmSync(curPath, { recursive: true, force: true });
    } else {
      fs.unlinkSync(curPath);
    }
  });
  console.log(`Cleared assets directory: ${assetsDir}`);
}
// Create assets directory if it doesn't exist
if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
  console.log(`Created assets directory: ${assetsDir}`);
}

// Combined firmwares object
const combinedFirmwares = {
  firmwares: [],
};

// Process each origin
origins.forEach((origin) => {
  console.log(`Processing ${origin.name} from ${origin.path}`);

  if (!fs.existsSync(origin.path)) {
    console.warn(`Warning: ${origin.path} does not exist, skipping...`);
    return;
  }

  // Read firmwares.json if it exists
  const firmwaresJsonPath = path.join(origin.path, 'firmwares.json');
  if (fs.existsSync(firmwaresJsonPath)) {
    const firmwaresContent = fs.readFileSync(firmwaresJsonPath, 'utf8');
    let firmwaresData;
    try {
      firmwaresData = JSON.parse(firmwaresContent);
    } catch (e) {
      console.error(`Error parsing ${firmwaresJsonPath}:`, e);
      return;
    }
    if (firmwaresData && Array.isArray(firmwaresData.firmwares)) {
      // Add firmwares to combined list
      combinedFirmwares.firmwares.push(...firmwaresData.firmwares);

      // Copy each firmware file listed in 'filename'
      firmwaresData.firmwares.forEach((firmware) => {
        if (!firmware.filename) {
          console.warn(`Warning: firmware entry missing 'filename' field:`, firmware);
          return;
        }
        const sourceFile = path.join(origin.path, firmware.filename);
        if (fs.existsSync(sourceFile) && fs.statSync(sourceFile).isFile()) {
          const destFile = path.join(assetsDir, firmware.filename);
          fs.copyFileSync(sourceFile, destFile);
          console.log(`Copied: ${firmware.filename}`);
        } else {
          console.warn(`Warning: ${sourceFile} does not exist or is not a file`);
        }
      });
    } else {
      console.warn(`Warning: No 'firmwares' array found in ${firmwaresJsonPath}`);
    }
  } else {
    console.warn(`Warning: ${firmwaresJsonPath} does not exist, skipping...`);
  }

  // Copy all other files from the firmware output directory (excluding .json)
  const files = fs.readdirSync(origin.path);
  files.forEach((file) => {
    const sourceFile = path.join(origin.path, file);
    const stat = fs.statSync(sourceFile);

    if (stat.isFile() && !file.endsWith('.json')) {
      const destFile = path.join(assetsDir, file);
      if (!fs.existsSync(destFile)) {
        fs.copyFileSync(sourceFile, destFile);
        console.log(`Copied additional file: ${file}`);
      }
    } else if (stat.isDirectory()) {
      const destDir = path.join(assetsDir, file);
      if (!fs.existsSync(destDir)) {
        execSync(`cp -r "${sourceFile}" "${destDir}"`);
        console.log(`Copied additional directory: ${file}`);
      }
    }
  });
});

// Write combined firmwares.json
const combinedFirmwaresPath = path.join(assetsDir, 'firmwares.json');
fs.writeFileSync(combinedFirmwaresPath, JSON.stringify(combinedFirmwares, null, 2));
console.log(`Created combined firmwares.json with ${combinedFirmwares.firmwares.length} firmwares`);

console.log('Asset copying completed successfully!');
