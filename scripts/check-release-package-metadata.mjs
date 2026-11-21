#!/usr/bin/env node
/* eslint-disable no-console -- CLI diagnostics are intentional. */
// Create Release publishes the nx release projects with npm provenance. npm rejects a provenance bundle when the
// package.json has no repository.url matching the GitHub repository (422 "repository.url is ''"), and nx then stops
// publishing the projects that depend on it. Every published project must therefore name this repository.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPOSITORY_URL = 'git+https://github.com/Attraccess/Attraccess.git';
const PROJECT_PARENTS = ['apps', 'libs'];

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

/** Maps nx project names to their directories (relative to root), from project.json or package.json names. */
function projectDirectories(root) {
  const directories = new Map();
  const candidates = [
    '.',
    ...PROJECT_PARENTS.flatMap((parent) =>
      existsSync(path.join(root, parent))
        ? readdirSync(path.join(root, parent), { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry) => `${parent}/${entry.name}`)
        : [],
    ),
  ];
  for (const directory of candidates) {
    for (const file of ['project.json', 'package.json']) {
      const manifest = path.join(root, directory, file);
      const name = existsSync(manifest) ? readJson(manifest).name : undefined;
      if (name && !directories.has(name)) directories.set(name, directory);
    }
  }
  return directories;
}

/** Returns the problems found in the package.json files of the published nx release projects (empty when fine). */
export function checkReleasePackageMetadata(root = process.cwd()) {
  const projects = readJson(path.join(root, 'nx.json')).release?.projects ?? [];
  const directories = projectDirectories(root);
  const problems = [];
  for (const project of projects) {
    const directory = directories.get(project);
    if (directory === undefined) {
      problems.push(`nx.json release project "${project}" has no project.json or package.json under apps/ or libs/.`);
      continue;
    }
    const packageFile = path.posix.join(directory, 'package.json');
    if (!existsSync(path.join(root, packageFile))) continue;
    const manifest = readJson(path.join(root, packageFile));
    if (manifest.private === true) continue;
    const repository = manifest.repository;
    const expected =
      `"repository": {"type": "git", "url": "${REPOSITORY_URL}", "directory": "${directory}"}` +
      ', which npm provenance requires';
    if (typeof repository !== 'object' || repository === null) {
      problems.push(`${packageFile}: add ${expected}.`);
    } else if (repository.url !== REPOSITORY_URL || repository.directory !== directory) {
      problems.push(`${packageFile}: set ${expected}; found ${JSON.stringify(repository)}.`);
    }
  }
  return problems;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const problems = checkReleasePackageMetadata();
  for (const problem of problems) console.error(problem);
  if (problems.length) process.exitCode = 1;
}
