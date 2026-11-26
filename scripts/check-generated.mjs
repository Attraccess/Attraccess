#!/usr/bin/env node
/* eslint-disable no-console -- CLI diagnostics are intentional. */
// Generated files must not be older than their sources. Timestamps cannot tell (Git sets them on checkout), so
// every group of generated files records a hash of its sources when it is generated, and this check compares that
// hash with the sources as they are staged.
//
// A group is declared in a `generated-outputs.json` anywhere in the repository:
//   { "<group>": { "sources": [globs], "outputs": [globs], "command": "how to regenerate" } }
// Globs are relative to the repository root; `*` matches within a path segment, `**` across segments.
// The stamps live next to it in `generated-stamps.json`: { "<group>": "<sha256 of the sources' Git blob ids>" }.
//
//   node scripts/check-generated.mjs --stamp <group>...   record the sources as they are in the worktree
//                                                          (the generators call this when they have written)
//   node scripts/check-generated.mjs --staged             pre-commit: every group whose sources, outputs or
//                                                          stamps are staged must match the staged sources
//   node scripts/check-generated.mjs --all                every group, against the index
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const git = (args, input) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', input, maxBuffer: 1 << 28 });

function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      re += glob[i + 2] === '/' ? '(?:.*/)?' : '.*';
      i += glob[i + 2] === '/' ? 2 : 1;
    } else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else if (c === '{') {
      const end = glob.indexOf('}', i);
      re += `(?:${glob
        .slice(i + 1, end)
        .split(',')
        .map(escape)
        .join('|')})`;
      i = end;
    } else re += escape(c);
  }
  return new RegExp(`^${re}$`);
}
function escape(s) {
  return s.replace(/[.+^${}()|[\]\\]/g, '\\$&');
}
const matcher = (globs) => {
  const res = globs.map(globToRegExp);
  return (file) => res.some((re) => re.test(file));
};

function manifests() {
  return git(['ls-files', '--cached', '--others', '--exclude-standard', '*generated-outputs.json'])
    .split('\n')
    .filter(Boolean)
    .map((file) => {
      const dir = path.posix.dirname(file);
      const groups = JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
      return { file, stamps: path.posix.join(dir, 'generated-stamps.json'), groups };
    });
}

/** sha256 over "path blob" lines of the files that match the sources: from the index, or hashed from the worktree. */
function sourceHash(sources, fromIndex) {
  const isSource = matcher(sources);
  let entries;
  if (fromIndex) {
    entries = git(['ls-files', '-s'])
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [meta, file] = line.split('\t');
        return [file, meta.split(' ')[1]];
      })
      .filter(([file]) => isSource(file));
  } else {
    const files = git(['ls-files', '--cached', '--others', '--exclude-standard'])
      .split('\n')
      .filter((file) => file && isSource(file) && fs.existsSync(path.join(ROOT, file)));
    const blobs = files.length ? git(['hash-object', '--stdin-paths'], files.join('\n')).trim().split('\n') : [];
    entries = files.map((file, i) => [file, blobs[i]]);
  }
  entries.sort(([a], [b]) => (a < b ? -1 : 1));
  const hash = createHash('sha256');
  for (const [file, blob] of entries) hash.update(`${file} ${blob}\n`);
  return { hash: hash.digest('hex'), count: entries.length };
}

function readStamps(file, fromIndex) {
  try {
    const text = fromIndex ? git(['show', `:${file}`]) : fs.readFileSync(path.join(ROOT, file), 'utf8');
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function stamp(names) {
  for (const name of names) {
    const manifest = manifests().find((m) => m.groups[name]);
    if (!manifest) throw new Error(`check-generated: no group "${name}" in any generated-outputs.json`);
    const stamps = readStamps(manifest.stamps, false);
    const { hash, count } = sourceHash(manifest.groups[name].sources, false);
    stamps[name] = hash;
    const sorted = Object.fromEntries(Object.entries(stamps).sort(([a], [b]) => (a < b ? -1 : 1)));
    fs.writeFileSync(path.join(ROOT, manifest.stamps), `${JSON.stringify(sorted, null, 2)}\n`);
    console.log(`check-generated: stamped ${name} (${count} source files) in ${manifest.stamps}`);
  }
}

function check(onlyStaged) {
  const staged = onlyStaged
    ? git(['diff', '--cached', '--name-only', '--diff-filter=ACMRD']).split('\n').filter(Boolean)
    : null;
  const problems = [];
  for (const manifest of manifests()) {
    const stamps = readStamps(manifest.stamps, true);
    for (const [name, group] of Object.entries(manifest.groups)) {
      if (staged) {
        const touches = matcher([...group.sources, ...group.outputs, manifest.stamps, manifest.file]);
        if (!staged.some(touches)) continue;
      }
      const { hash } = sourceHash(group.sources, true);
      if (stamps[name] !== hash) {
        problems.push(
          `  ${name}: its sources changed since its files were generated.\n` +
            `    Regenerate with: ${group.command}\n` +
            `    and stage the outputs and ${manifest.stamps}. If the change cannot affect the outputs:\n` +
            `    node scripts/check-generated.mjs --stamp ${name}`,
        );
      }
    }
  }
  if (problems.length) {
    console.error(`check-generated: generated files are older than their sources:\n${problems.join('\n')}`);
    process.exit(1);
  }
}

const [mode, ...rest] = process.argv.slice(2);
if (mode === '--stamp' && rest.length) stamp(rest);
else if (mode === '--staged') check(true);
else if (mode === '--all') check(false);
else {
  console.error('Usage: node scripts/check-generated.mjs --stamp <group>... | --staged | --all');
  process.exit(2);
}
