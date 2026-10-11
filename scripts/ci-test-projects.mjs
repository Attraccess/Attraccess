import { spawn } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function selectTests(nodes, group) {
  if (!['core', 'plugins', 'software'].includes(group)) throw new Error(`Unknown test group: ${group}`);
  const projects = [];
  const targets = new Set();
  for (const [name, { data }] of Object.entries(nodes)) {
    const tags = data.tags ?? [];
    if (tags.includes('scope:hardware') || tags.includes('scope:companion')) continue;
    const plugin = tags.includes('type:plugin');
    if ((group === 'core' && plugin) || (group === 'plugins' && !plugin)) continue;
    const tests = Object.keys(data.targets ?? {}).filter(
      (target) => target === 'e2e' || target === 'pack-test' || /^test($|-)/.test(target),
    );
    if (tests.length) projects.push(name);
    for (const target of tests) targets.add(target);
  }
  return { projects: projects.sort(), targets: [...targets].sort() };
}

export async function main(args = process.argv.slice(2)) {
  const group = args.find((arg) => arg.startsWith('--group='))?.slice('--group='.length) ?? 'core';
  const { createProjectGraphAsync } = await import('@nx/devkit');
  const { nodes } = await createProjectGraphAsync();
  const { projects, targets } = selectTests(nodes, group);
  if (!projects.length) throw new Error(`No test projects selected for ${group}`);
  const child = spawn(
    'pnpm',
    [
      'nx',
      'run-many',
      `--targets=${targets.join(',')}`,
      `--projects=${projects.join(',')}`,
      '--parallel=3',
      '--outputStyle=stream',
    ],
    { stdio: 'inherit' },
  );
  const forward = (signal) => child.kill(signal);
  const interrupt = () => forward('SIGINT');
  const terminate = () => forward('SIGTERM');
  process.on('SIGINT', interrupt);
  process.on('SIGTERM', terminate);
  try {
    return await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code) => resolve(code ?? 1));
    });
  } finally {
    process.off('SIGINT', interrupt);
    process.off('SIGTERM', terminate);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
