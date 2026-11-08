import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Release channels: nightlies own `next`, Attraccess releases own `latest`. `alpha` is frozen legacy.
export const CHANNELS = { next: { nightly: true }, latest: { nightly: false } };

export function assertChannel(channel) {
  if (!Object.hasOwn(CHANNELS, channel))
    throw new Error(
      `--channel must be one of ${Object.keys(CHANNELS).join(', ')}, got "${channel}" (alpha is retired).`,
    );
  return channel;
}

export function isNightlyVersion(version) {
  return /-nightly\./.test(version ?? '');
}

/** Only a full commit SHA counts as a recorded commit; anything else (a ref name, garbage) is treated as missing. */
export function asCommit(value) {
  return typeof value === 'string' && /^[0-9a-f]{40}$/.test(value) ? value : null;
}

/**
 * The version a channel publishes for a package.json version: the prerelease suffix is dropped, and nightlies
 * append `-nightly.<run>.<attempt>` (`0.2.0-alpha.0` becomes `0.2.0` on `latest`, `0.2.0-nightly.1180.1` on `next`).
 */
export function channelVersion(version, channel, { runNumber, runAttempt } = {}) {
  const base = version.replace(/-.+$/, '');
  if (!CHANNELS[assertChannel(channel)].nightly) return base;
  if (!runNumber) throw new Error('GITHUB_RUN_NUMBER is required to publish a nightly plugin package.');
  return `${base}-nightly.${runNumber}.${runAttempt || '1'}`;
}

export function versionExistsMessage(name, version) {
  return (
    `${name}@${version} already exists on npm. Releases publish the package.json version without its prerelease ` +
    'suffix, so raise the major, minor or patch number of the plugin (changing only the prerelease suffix is not enough).'
  );
}

/**
 * Whether the commit recorded for a channel is strictly newer than `head`. Used right before a publish or retag
 * so an older, slow run never moves the channel backwards. When fetching history failed and the recorded commit
 * is unknown locally, it may be a newer commit this checkout can't see, so this refuses instead of guessing.
 */
export function isNewerPublished({ head, commit, git, historyFetched = true }) {
  if (!commit || commit === head) return false;
  if (!git.hasCommit(commit)) {
    if (!historyFetched)
      throw new Error(
        `Could not fetch origin/main and recorded commit ${commit} is unknown; refusing to move the tag.`,
      );
    return false;
  }
  return git.isAncestor(head, commit);
}

/**
 * Decides per plugin whether the channel needs a publish.
 *
 * @param {object} input
 * @param {{ project: string, name: string }[]} input.projects
 * @param {string} input.head
 * @param {(name: string) => { version: string, commit: string | null, neverReleased?: boolean } | null} input.readState channel state; null = package missing
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
    if (state.neverReleased) return decide(true, `${state.version} is a nightly build, so nothing was released yet`);
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
      ? `${p.publishedVersion}${p.publishedCommit ? ` @ ${p.publishedCommit.slice(0, 7)}` : ''}`
      : 'unpublished';
    const target = p.publish && p.version ? ` as ${p.version}` : '';
    lines.push(`  ${p.publish ? 'PUBLISH' : 'skip   '}  ${p.name}${target}  (${p.reason}; ${channel}=${from})`);
  }
  return lines.join('\n');
}

export const npmView = (spec, field) => {
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
  assertChannel(channel);
  const version = view(name, `dist-tags.${channel}`);
  if (!version) return null;
  if (!CHANNELS[channel].nightly && isNightlyVersion(version)) return { version, commit: null, neverReleased: true };
  const spec = `${name}@${version}`;
  return { version, commit: asCommit(view(spec, 'gitHead')) ?? asCommit(view(spec, 'attraccess.publishedCommit')) };
}

export const localGit = {
  hasCommit: (commit) =>
    spawnSync('git', ['cat-file', '-e', '--end-of-options', `${commit}^{commit}`], { stdio: 'ignore' }).status === 0,
  isAncestor: (a, b) =>
    spawnSync('git', ['merge-base', '--is-ancestor', '--end-of-options', a, b], { stdio: 'ignore' }).status === 0,
};

/**
 * A run's checkout predates commits merged while it was queued. Fetch main so "is the published commit newer
 * than HEAD" can see them; without it a newer commit would look like it is missing from history. Parallel
 * publishes fetch at the same time and can collide on the ref lock, so it retries. Returns whether it worked.
 */
export function refreshHistory() {
  for (let attempt = 1; attempt <= 3; attempt++) {
    if (spawnSync('git', ['fetch', '--quiet', 'origin', 'main'], { stdio: 'inherit' }).status === 0) return true;
    if (attempt < 3) spawnSync('sleep', [String(attempt * 2)]);
  }
  console.warn('Could not fetch origin/main; ancestry checks use the local history only.');
  return false;
}

const run = (cmd, args, options = {}) =>
  execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, ...options });

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
    return { project, name: pkg.name, packageVersion: pkg.version };
  });
}

/**
 * Nx projects affected by the changes between `base` and `head`. Workflow-only changes never make a plugin
 * affected (same exclusion the publish step always had). The file list goes through stdin: a long-unpublished
 * plugin can have thousands of changed paths, more than Linux allows in one argument.
 */
export function affectedSince(base, head, exec = run) {
  const files = exec('git', [
    'diff',
    '--name-only',
    '--no-renames',
    '--end-of-options',
    base,
    head,
    '--',
    '.',
    ':(exclude).github/workflows/**',
  ])
    .split('\n')
    .filter(Boolean);
  if (files.length === 0) return new Set();
  return new Set(
    JSON.parse(
      exec('pnpm', ['--silent', 'nx', 'show', 'projects', '--affected', '--stdin', '--json'], {
        input: files.join('\n'),
      }),
    ),
  );
}

const USAGE =
  'usage: plugin-publish-plan.mjs [--channel=next|latest] [--dry-run] [--out=<file>] [--head=<sha> (dry run only)]';

export function parseArgs(argv) {
  const options = { channel: 'next', dryRun: false, out: null, head: null };
  for (const a of argv) {
    const [flag, value] = a.split(/=(.*)/s);
    if (flag === '--dry-run' && value === undefined) options.dryRun = true;
    else if (flag === '--channel' && value) options.channel = value;
    else if (flag === '--out' && value) options.out = value;
    else if (flag === '--head' && value) options.head = value;
    else throw new Error(`Unknown argument "${a}". ${USAGE}`);
  }
  assertChannel(options.channel);
  // Children build and record the checked-out commit, so a different HEAD only makes sense for a preview.
  if (options.head && !options.dryRun) throw new Error('--head is only allowed with --dry-run.');
  return options;
}

function main(argv) {
  const { channel, dryRun, out, head: headArg } = parseArgs(argv);
  refreshHistory();
  const head = headArg ?? run('git', ['rev-parse', 'HEAD']).trim();

  const projects = listPluginProjects();
  const affected = new Map();
  const plan = planPublish({
    projects,
    head,
    readState: (name) => readChannelState(name, channel),
    git: localGit,
    affectedSince: (base) => {
      if (!affected.has(base)) affected.set(base, affectedSince(base, head));
      return affected.get(base);
    },
  });

  const runInfo = { runNumber: process.env.GITHUB_RUN_NUMBER ?? '<run>', runAttempt: process.env.GITHUB_RUN_ATTEMPT };
  for (const p of plan) {
    if (p.publish)
      p.version = channelVersion(projects.find((x) => x.project === p.project).packageVersion, channel, runInfo);
  }

  // A release must not publish some plugins and then fail on the next: find every taken version up front.
  const taken = CHANNELS[channel].nightly
    ? []
    : plan.filter((p) => p.publish && npmView(`${p.name}@${p.version}`, 'version'));

  const toPublish = plan.filter((p) => p.publish).map((p) => p.project);
  const summary = [
    formatPlan(plan, channel),
    ...taken.map((p) => `ERROR: ${versionExistsMessage(p.name, p.version)}`),
    dryRun
      ? `Dry run: ${toPublish.length} to publish, ${plan.length - toPublish.length} skipped; nothing published.`
      : `Publishing: ${toPublish.join(', ') || 'nothing'}. Each publish re-checks the dist-tag first.`,
  ].join('\n');
  console.log(summary);
  if (out) writeFileSync(out, `${JSON.stringify({ channel, head, plan }, null, 2)}\n`);
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `### Plugin publish plan (\`${channel}\`)\n\n\`\`\`\n${summary}\n\`\`\`\n`,
    );

  if (taken.length > 0) return 1;
  if (dryRun || toPublish.length === 0) return 0;
  const result = spawnSync(
    'pnpm',
    ['nx', 'run-many', '--target=publish', `--projects=${toPublish.join(',')}`, '--parallel=3'],
    // The plan's channel and commit are what each publish uses, so the two can never disagree.
    { stdio: 'inherit', env: { ...process.env, NPM_DIST_TAG: channel, GITHUB_SHA: head } },
  );
  if (result.error) throw result.error;
  return result.status ?? 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
