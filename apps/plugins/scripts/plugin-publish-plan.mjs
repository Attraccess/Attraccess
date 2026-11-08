import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Release channels: nightlies own `next`, Attraccess releases own `latest`. `alpha` is frozen legacy.
export const CHANNELS = { next: { nightly: true }, latest: { nightly: false } };

export function isNightlyVersion(version) {
  return /-nightly\./.test(version ?? '');
}

/** The commit a published manifest was built from (see publish-plugin.mjs). */
export function recordedCommit(manifest) {
  return manifest?.gitHead || manifest?.attraccess?.publishedCommit || null;
}

/**
 * Whether the commit recorded for a channel is strictly newer than `head`. Used right before a publish
 * so an older, slow run never moves the channel backwards.
 */
export function isNewerPublished({ head, commit, git }) {
  if (!commit || commit === head || !git.hasCommit(commit)) return false;
  return git.isAncestor(head, commit);
}

/**
 * Decides per plugin whether the channel needs a publish.
 *
 * @param {object} input
 * @param {{ project: string, name: string }[]} input.projects
 * @param {string} input.head
 * @param {(name: string) => { version: string, commit: string | null } | null} input.readState channel state; null = package missing
 * @param {{ hasCommit(c: string): boolean, isAncestor(a: string, b: string): boolean }} input.git
 * @param {(base: string) => Set<string>} input.affectedSince nx project names affected between base and head
 */
export function planPublish({ projects, head, readState, git, affectedSince }) {
  return projects.map(({ project, name }) => {
    const state = readState(name);
    const entry = { project, name, publishedVersion: state?.version ?? null, publishedCommit: state?.commit ?? null };
    const decide = (publish, reason, base = null) => ({ ...entry, publish, reason, base });

    if (!state) return decide(true, 'package is not on npm yet');
    const g = state.commit;
    if (!g) return decide(true, `${state.version} has no recorded commit`);
    if (!git.hasCommit(g)) return decide(true, `recorded commit ${g.slice(0, 7)} is not in local history`);
    if (g === head) return decide(false, 'already published for this commit');
    if (git.isAncestor(head, g)) return decide(false, 'newer commit already published');
    if (git.isAncestor(g, head)) {
      return affectedSince(g).has(project)
        ? decide(true, `changed since ${g.slice(0, 7)}`, g)
        : decide(false, `unchanged since ${g.slice(0, 7)}`, g);
    }
    return decide(true, `history diverged from recorded commit ${g.slice(0, 7)}`);
  });
}

export function formatPlan(plan, channel) {
  const lines = [`Plugin publish plan for dist-tag "${channel}":`];
  for (const p of plan) {
    const from = p.publishedVersion
      ? `${p.publishedVersion} @ ${p.publishedCommit?.slice(0, 7) ?? 'no commit'}`
      : 'unpublished';
    lines.push(`  ${p.publish ? 'PUBLISH' : 'skip   '}  ${p.name}  (${p.reason}; ${channel}=${from})`);
  }
  return lines.join('\n');
}

const npmView = (spec, field) => {
  try {
    const out = execFileSync('npm', ['view', spec, field, '--json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return out.trim() ? JSON.parse(out) : null;
  } catch (error) {
    if (/E404|404 Not Found/.test(`${error.stderr}${error.stdout}`)) return null;
    throw error;
  }
};

/** Reads what npm has on a dist-tag. A nightly on the release channel counts as "never released". */
export function readChannelState(name, channel, view = npmView) {
  const version = view(name, `dist-tags.${channel}`);
  if (!version) return null;
  if (!CHANNELS[channel].nightly && isNightlyVersion(version)) return { version, commit: null };
  const manifest = view(`${name}@${version}`, 'gitHead') ?? view(`${name}@${version}`, 'attraccess.publishedCommit');
  return { version, commit: typeof manifest === 'string' ? manifest : null };
}

export const localGit = {
  hasCommit: (commit) => spawnSync('git', ['cat-file', '-e', `${commit}^{commit}`], { stdio: 'ignore' }).status === 0,
  isAncestor: (a, b) => spawnSync('git', ['merge-base', '--is-ancestor', a, b], { stdio: 'ignore' }).status === 0,
};

/**
 * A run's checkout predates commits merged while it was queued. Fetch main so "is the published commit newer
 * than HEAD" can see them; without it a newer commit would look like it is missing from history.
 */
export function refreshHistory() {
  const result = spawnSync('git', ['fetch', '--quiet', 'origin', 'main'], { stdio: 'inherit' });
  if (result.status !== 0) console.warn('Could not fetch origin/main; ancestry checks use the local history only.');
}

const run = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });

function listPluginProjects() {
  const names = JSON.parse(
    run('pnpm', [
      '--silent',
      'nx',
      'show',
      'projects',
      '--projects',
      'tag:type:plugin',
      '--withTarget',
      'publish',
      '--json',
    ]),
  );
  return names.map((project) => {
    const { root } = JSON.parse(run('pnpm', ['--silent', 'nx', 'show', 'project', project, '--json']));
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    return { project, name: pkg.name };
  });
}

// Workflow-only changes never make a plugin affected (same exclusion the publish step always had).
function affectedSince(base, head) {
  const files = run('git', ['diff', '--name-only', base, head, '--', '.', ':(exclude).github/workflows/**'])
    .split('\n')
    .filter(Boolean);
  if (files.length === 0) return new Set();
  return new Set(
    JSON.parse(
      run('pnpm', ['--silent', 'nx', 'show', 'projects', '--affected', `--files=${files.join(',')}`, '--json']),
    ),
  );
}

function main(argv) {
  const arg = (flag) => argv.find((a) => a.startsWith(`--${flag}=`))?.slice(flag.length + 3);
  const channel = arg('channel') ?? 'next';
  if (!CHANNELS[channel]) throw new Error(`--channel must be one of ${Object.keys(CHANNELS).join(', ')}`);
  const dryRun = argv.includes('--dry-run');
  refreshHistory();
  const head = arg('head') ?? run('git', ['rev-parse', 'HEAD']).trim();

  const plan = planPublish({
    projects: listPluginProjects(),
    head,
    readState: (name) => readChannelState(name, channel),
    git: localGit,
    affectedSince: (base) => affectedSince(base, head),
  });

  const summary = formatPlan(plan, channel);
  console.log(summary);
  if (arg('out')) writeFileSync(arg('out'), `${JSON.stringify({ channel, head, plan }, null, 2)}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\`\`\`\n${summary}\n\`\`\`\n`);

  const projects = plan.filter((p) => p.publish).map((p) => p.project);
  if (dryRun || projects.length === 0) return 0;
  return spawnSync('pnpm', ['nx', 'run-many', '--target=publish', `--projects=${projects.join(',')}`, '--parallel=3'], {
    stdio: 'inherit',
  }).status;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exit(main(process.argv.slice(2)));
