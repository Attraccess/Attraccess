#!/usr/bin/env node

/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');

// Script to extract dependencies from package.json and create dependencies.json
// This script reads the root package.json and creates a detailed list of all dependencies

// Process a single dependency using npm registry API
async function processDependency(name, version) {
  try {
    console.log('Processing:', name);

    // Get package info from npm registry API directly
    const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}`, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'dependencies-extractor/1.0.0',
      },
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const npmInfo = await response.json();

    // Get the latest version info if available
    const latestInfo = npmInfo.versions?.[npmInfo['dist-tags']?.latest] || npmInfo;

    // Extract required information
    const depInfo = {
      name: name,
      version: version,
      author: latestInfo.author
        ? typeof latestInfo.author === 'string'
          ? latestInfo.author
          : latestInfo.author.name || 'Unknown'
        : npmInfo.author
          ? typeof npmInfo.author === 'string'
            ? npmInfo.author
            : npmInfo.author.name || 'Unknown'
          : 'Unknown',
      license: latestInfo.license || npmInfo.license || 'Unknown',
      url:
        latestInfo.homepage ||
        npmInfo.homepage ||
        latestInfo.repository?.url ||
        npmInfo.repository?.url ||
        latestInfo.repository ||
        npmInfo.repository ||
        `https://www.npmjs.com/package/${name}`,
    };

    // Clean up git URLs
    if (depInfo.url && typeof depInfo.url === 'string' && depInfo.url.startsWith('git+')) {
      depInfo.url = depInfo.url.replace('git+', '').replace('.git', '');
    }

    // Handle repository objects
    if (typeof depInfo.url === 'object' && depInfo.url?.url) {
      depInfo.url = depInfo.url.url;
      if (depInfo.url.startsWith('git+')) {
        depInfo.url = depInfo.url.replace('git+', '').replace('.git', '');
      }
    }

    return depInfo;
  } catch (error) {
    console.error(`Warning: Could not get info for ${name}:`, error.message);

    // Fallback info
    return {
      name: name,
      version: version,
      author: 'Unknown',
      license: 'Unknown',
      url: `https://www.npmjs.com/package/${name}`,
    };
  }
}

// Process dependencies in batches with concurrency control
async function processDependenciesInBatches(dependencies, batchSize = 15) {
  const results = [];
  const entries = Object.entries(dependencies);

  console.log(`Processing ${entries.length} dependencies in batches of ${batchSize}...`);

  for (let i = 0; i < entries.length; i += batchSize) {
    const batch = entries.slice(i, i + batchSize);
    console.log(
      `Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(entries.length / batchSize)} (${
        batch.length
      } items)...`,
    );

    // Process current batch in parallel
    const batchPromises = batch.map(([name, version]) => processDependency(name, version));

    const batchResults = await Promise.allSettled(batchPromises);

    // Extract successful results and handle failures
    batchResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        const [name, version] = batch[index];
        console.error(`Failed to process ${name}:`, result.reason?.message || 'Unknown error');
        // Add fallback info for failed dependencies
        results.push({
          name: name,
          version: version,
          author: 'Unknown',
          license: 'Unknown',
          url: `https://www.npmjs.com/package/${name}`,
        });
      }
    });

    // Small delay between batches to be respectful to npm registry
    if (i + batchSize < entries.length) {
      await new Promise((resolve) => setTimeout(resolve, 50)); // Reduced delay since HTTP requests are faster
    }
  }

  return results;
}

async function extractDependencies() {
  try {
    // Get the workspace root
    const workspaceRoot = process.cwd();
    const packageJsonPath = path.join(workspaceRoot, 'package.json');
    const outputFile = path.join(workspaceRoot, 'apps/frontend/public/dependencies.json');

    // Check if package.json exists
    if (!fs.existsSync(packageJsonPath)) {
      console.error(`Error: package.json not found at ${packageJsonPath}`);
      process.exit(1);
    }

    // Create output directory if it doesn't exist
    const outputDir = path.dirname(outputFile);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    console.log(`Extracting dependencies from ${packageJsonPath}...`);

    // Read package.json
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

    // Get all dependencies (both regular and dev)
    const allDeps = {
      ...(packageJson.dependencies || {}),
      ...(packageJson.devDependencies || {}),
    };

    console.log('Found', Object.keys(allDeps).length, 'dependencies');

    // Process dependencies in parallel batches
    const startTime = Date.now();
    const dependencies = await processDependenciesInBatches(allDeps);
    const endTime = Date.now();

    // Sort dependencies by name
    dependencies.sort((a, b) => a.name.localeCompare(b.name));

    // Write to output file
    fs.writeFileSync(outputFile, JSON.stringify(dependencies, null, 2));

    console.log(`Dependencies list written to ${outputFile}`);
    console.log(`Total dependencies: ${dependencies.length}`);
    console.log(`Processing time: ${((endTime - startTime) / 1000).toFixed(2)} seconds`);
    console.log('✅ Dependencies extraction complete!');
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Run the script
extractDependencies();
