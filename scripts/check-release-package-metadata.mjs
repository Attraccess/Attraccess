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
const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist', 'build', 'coverage']);

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

/** Lists the directories below apps/ and libs/ at any depth, shallowest first, without build output. */
function candidateDirectories(root) {
  const directories = ['.'];
  const queue = PROJECT_PARENTS.filter((parent) => existsSync(path.join(root, parent)));
  while (queue.length) {
    const directory = queue.shift();
    directories.push(directory);
    for (const entry of readdirSync(path.join(root, directory), { withFileTypes: true }))
      if (entry.isDirectory() && !entry.name.startsWith('.') && !SKIPPED_DIRECTORIES.has(entry.name))
        queue.push(`${directory}/${entry.name}`);
  }
  return directories;
}

/** Maps nx project names to their directories (relative to root), from project.json or package.json names. */
function projectDirectories(root) {
  const directories = new Map();
  for (const directory of candidateDirectories(root)) {
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
