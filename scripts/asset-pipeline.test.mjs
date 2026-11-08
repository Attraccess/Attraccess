import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { selectTests } from './ci-test-projects.mjs';

const require = createRequire(import.meta.url);
const nxRoot = path.dirname(require.resolve('nx/package.json'));
const { parse } = createRequire(path.join(nxRoot, 'package.json'))('yaml');
const { createTaskGraph } = require(path.join(nxRoot, 'dist/src/tasks-runner/create-task-graph.js'));
const nodes = {};
for (const file of [
  'apps/api/project.json',
  'apps/companion/project.json',
  'libs/companion-ws-client/project.json',
  'apps/attractap/firmware/project.json',
  'apps/plugins/wago/project.json',
  'libs/plugins-frontend-sdk/project.json',
  'libs/react-query-client/project.json',
]) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  data.root = path.dirname(file);
  // Targets inferred by Nx plugins (the SDK's typecheck) only add dependsOn here; the graph needs an executor.
  for (const target of Object.values(data.targets ?? {})) target.executor ??= 'nx:run-commands';
  nodes[data.name] = { name: data.name, type: data.projectType === 'library' ? 'lib' : 'app', data };
}
const graph = {
  nodes,
  externalNodes: {},
  dependencies: Object.fromEntries(Object.keys(nodes).map((name) => [name, []])),
};
const tasks = (targets) => createTaskGraph(graph, {}, ['api'], targets, undefined, {}).tasks;

test('plain API serve/build and schema generation have no binary asset dependencies', () => {
  for (const target of ['serve', 'build', 'export-asyncapi', 'export-swagger']) {
    const selected = tasks([target]);
    assert.ok(!selected['companion:build']);
    assert.ok(!selected['attractap-firmware:build']);
    assert.ok(!selected['api:copy-companion-into-assets']);
    assert.ok(!selected['api:copy-attractap-firmware-into-assets']);
  }
});

test('asset preparation builds only requested deliverables, once each', () => {
  for (const [targets, kiosk, attractap] of [
    [['prepare-kiosk-assets'], true, false],
    [['prepare-attractap-assets'], false, true],
    [['prepare-all-assets'], true, true],
  ]) {
    const selected = tasks(targets);
    assert.equal(!!selected['companion:build'], kiosk);
    assert.equal(!!selected['attractap-firmware:build'], attractap);
    for (const id of ['companion:build', 'attractap-firmware:build']) {
      assert.ok(Object.keys(selected).filter((key) => key === id).length <= 1);
    }
  }
});

test('an explicitly requested firmware build fails when ESP-IDF is unavailable', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'firmware-prerequisite-'));
  try {
    const harness = `
import importlib.util, sys
spec = importlib.util.spec_from_file_location('firmware_builder', sys.argv[1])
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)
builder.FIRMWARE_DIR = sys.argv[2]
builder.find_idf_export = lambda: None
builder.shutil.which = lambda command: None
builder.main([])
`;
    const result = spawnSync(
      'python3',
      ['-B', '-c', harness, path.resolve('apps/attractap/firmware/build_firmwares.py'), directory],
      { encoding: 'utf8' },
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /ESP-IDF not found/);
    assert.match(result.stderr, /INSTALL_ESP_IDF=true/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

const workflow = (name) => parse(fs.readFileSync(`.github/workflows/${name}.yml`, 'utf8'));
const action = (name) => parse(fs.readFileSync(`.github/actions/${name}/action.yml`, 'utf8'));

test('every main pipeline tests all deliverables and bundles artifacts built in the same run', () => {
  for (const name of ['pull-requests', 'docker-nightly-latest', 'release']) {
    const { jobs } = workflow(name);
    for (const deliverable of ['build-companion', 'build-attractap-firmware', 'build-attractap-desktop']) {
      assert.ok(jobs[deliverable].uses, `${name}: ${deliverable} must always run`);
      assert.equal(jobs[deliverable].if, undefined);
      const consumer = name === 'docker-nightly-latest' ? jobs['publish-gate'] : jobs.containerize;
      assert.ok(consumer.needs.includes(deliverable) || jobs['precommit-check']?.needs.includes(deliverable));
    }
    assert.ok(jobs.test.steps.some((step) => step.run === 'node scripts/ci-test-projects.mjs --group=core'));
    assert.ok(jobs.plugins.steps.some((step) => step.run === 'node scripts/ci-test-projects.mjs --group=plugins'));
    assert.ok(jobs.plugins.steps.some((step) => step.uses === './.github/actions/setup-browser-tests'));
    const uses = jobs.containerize.steps.map((step) => step.uses);
    assert.ok(uses.includes('./.github/actions/download-attractap-firmware'));
    assert.ok(uses.includes('./.github/actions/download-companion'));
    assert.ok(!uses.includes('./.github/actions/build-attractap-firmware'));
  }
  const { jobs } = workflow('release');
  assert.ok(jobs.balena.needs.includes('build-attractap-firmware'));
  assert.ok(jobs.balena.steps.some((step) => step.uses === './.github/actions/download-attractap-firmware'));
});

test('nightly publishes plugins and the image from one gate and never moves nightly-latest backwards', () => {
  const nightly = workflow('docker-nightly-latest');
  const { jobs } = nightly;
  assert.equal(nightly.concurrency, undefined, 'a concurrency group would cancel queued runs');
  for (const [name, job] of Object.entries(jobs)) assert.equal(job.concurrency, undefined, name);
  assert.ok(!jobs.plugins.steps.some((step) => /publish/.test(step.run ?? '')), 'pack/test job must not publish');

  const publishers = ['publish-plugins', 'containerize'];
  const onlyIfGatePassed = "${{ !cancelled() && needs.publish-gate.result == 'success' }}";
  for (const name of publishers) {
    assert.deepEqual(jobs[name].needs, ['publish-gate'], name);
    // Without it, a skipped job further up (HIL variable off) would skip the publisher too.
    assert.equal(jobs[name].if, onlyIfGatePassed, name);
    assert.ok(
      jobs[name].steps.some((step) => step.uses?.startsWith('actions/checkout') && step.with?.['fetch-depth'] === 0),
      `${name} needs full history for the ancestry checks`,
    );
  }
  // The gate needs every other job, so a new build or test job can't bypass it.
  const gated = Object.keys(jobs).filter((name) => name !== 'publish-gate' && !publishers.includes(name));
  assert.deepEqual([...jobs['publish-gate'].needs].sort(), gated.sort());
  assert.ok(gated.includes('attractap-lab-hil'));
  // failed or cancelled blocks, skipped (HIL variable off) does not
  assert.equal(
    jobs['publish-gate'].if,
    "always() && !contains(needs.*.result, 'failure') && !contains(needs.*.result, 'cancelled')",
  );

  const steps = jobs['publish-plugins'].steps;
  const publish = steps.find((step) => /plugin-publish-plan\.mjs/.test(step.run ?? ''));
  assert.equal(publish.run, 'node apps/plugins/scripts/plugin-publish-plan.mjs --channel=next');
  assert.deepEqual(Object.keys(publish.env), ['NODE_AUTH_TOKEN'], 'the plan sets the dist-tag itself');
  const build = steps.find((step) => /--target=build/.test(step.run ?? ''));
  assert.ok(steps.indexOf(build) < steps.indexOf(publish), 'plugins build before the npm token is present');
  assert.equal(build.env, undefined);

  const image = jobs.containerize.steps.find((step) => step.uses === './.github/actions/docker-build-push');
  for (const registry of ['ghcr.io/${{ env.GHCR_IMAGE_NAME }}', '${{ env.DOCKERHUB_IMAGE_NAME }}']) {
    assert.ok(image.with.tags.includes(`${registry}:nightly-\${{ steps.vars.outputs.SHORT_SHA }}`), registry);
  }
  assert.match(image.with.labels, /org\.opencontainers\.image\.revision=\$\{\{ github\.sha \}\}/);
  const promoteIndex = jobs.containerize.steps.findIndex((step) => /promote-nightly-image\.mjs/.test(step.run ?? ''));
  assert.ok(jobs.containerize.steps.indexOf(image) < promoteIndex);
  for (const step of jobs.containerize.steps.slice(0, promoteIndex)) {
    assert.ok(!JSON.stringify(step).includes('nightly-latest'), 'nightly-latest only moves after the revision check');
  }
  assert.equal(jobs.containerize.steps[promoteIndex].env.IMAGE_DIGEST, `\${{ steps.${image.id}.outputs.digest }}`);
});

test('release publishes plugins on latest; no workflow publishes from the pushed range or to alpha', () => {
  const { plugins } = workflow('release').jobs;
  const step = plugins.steps.find((s) => /plugin-publish-plan\.mjs/.test(s.run ?? ''));
  assert.equal(step.run, 'node apps/plugins/scripts/plugin-publish-plan.mjs --channel=latest');
  assert.deepEqual(Object.keys(step.env), ['NODE_AUTH_TOKEN'], 'the plan sets the dist-tag itself');
  assert.ok(plugins.steps.some((s) => s.uses?.startsWith('actions/checkout') && s.with?.['fetch-depth'] === 0));
  for (const file of fs.readdirSync('.github/workflows')) {
    const text = fs.readFileSync(`.github/workflows/${file}`, 'utf8');
    assert.ok(
      !/NPM_DIST_TAG|NPM_NIGHTLY|--tag[ =]['"]?alpha/.test(text),
      `${file} must leave the dist-tag to the plan`,
    );
    assert.ok(!/--target=publish/.test(text), `${file} must publish through plugin-publish-plan.mjs`);
    if (/plugin-publish-plan/.test(text)) assert.ok(!text.includes('github.event.before'), file);
  }
});

test('deliverable workflows avoid overlapping automatic PR builds and require downloaded artifacts', () => {
  for (const name of ['companion', 'attractap-firmware', 'build-attractap-desktop', 'hardware']) {
    const events = workflow(name).on;
    assert.equal(events.pull_request, undefined);
    assert.equal(events.push, undefined);
  }
  const companion = workflow('build-companion-binaries');
  assert.ok(companion.jobs['build-companion-linux'].steps.some((step) => /test,test-renderer/.test(step.run ?? '')));
  for (const job of Object.values(companion.jobs)) {
    assert.equal(job.steps.filter((step) => step.run === 'pnpm nx run companion:build').length, 1);
  }
  for (const step of action('download-companion').runs.steps) {
    assert.notEqual(step['continue-on-error'], true);
  }
  assert.ok(
    action('build-attractap-firmware').runs.steps.some((step) => step.run === 'pnpm nx run attractap-firmware:test'),
  );
});

test('manual builds use the dispatch ref without accepting a separate checkout ref', () => {
  const { jobs, on: events } = workflow('balena-manual');
  assert.equal(events.workflow_dispatch.inputs.branch, undefined);
  for (const name of ['attractap-firmware', 'build-attractap-desktop', 'build-companion-binaries']) {
    const reusable = workflow(name);
    assert.equal(reusable.on.workflow_call?.inputs?.ref, undefined);
    for (const job of Object.values(reusable.jobs)) {
      for (const step of job.steps) {
        if (step.uses === 'actions/checkout@v7') assert.equal(step.with?.ref, undefined);
      }
    }
  }
  for (const job of ['test', 'balena']) {
    const checkout = jobs[job].steps.find((step) => step.uses === 'actions/checkout@v7');
    assert.equal(checkout.with?.ref, undefined);
  }
  for (const job of ['build-companion', 'build-attractap-firmware', 'build-attractap-desktop']) {
    assert.equal(jobs[job].with?.ref, undefined);
    assert.ok(jobs.balena.needs.includes(job));
  }
  assert.ok(jobs.balena.needs.includes('test'));
});

test('CI discovers specialized tests and avoids repeating shared dependencies', () => {
  const project = (tags, targets) => ({
    data: { tags, targets: Object.fromEntries(targets.map((target) => [target, {}])) },
  });
  const fixtures = {
    api: project(['scope:core'], ['test', 'e2e', 'build']),
    first: project(['type:plugin'], ['test', 'test-frontend', 'pack-test']),
    second: project(['type:plugin'], ['test', 'test-frontend', 'test-runtime', 'e2e']),
    firmware: project(['scope:hardware'], ['test', 'build']),
    companion: project(['scope:companion'], ['test', 'test-renderer']),
  };
  assert.deepEqual(selectTests(fixtures, 'core'), { projects: ['api'], targets: ['e2e', 'test'] });
  assert.deepEqual(selectTests(fixtures, 'plugins'), {
    projects: ['first', 'second'],
    targets: ['e2e', 'pack-test', 'test', 'test-frontend', 'test-runtime'],
  });
  assert.deepEqual(selectTests(fixtures, 'software').projects, ['api', 'first', 'second']);
  assert.throws(() => selectTests(fixtures, 'unknown'), /Unknown test group/);
});

test('WAGO frontend typechecks generate the API client before compiling shared plugin UI', () => {
  const selected = createTaskGraph(
    graph,
    {},
    ['plugin-wago'],
    ['typecheck-frontend-tests', 'test-typecheck-frontend-gate'],
    undefined,
    {},
  );
  for (const target of ['typecheck-frontend-tests', 'test-typecheck-frontend-gate']) {
    assert.ok(selected.dependencies[`plugin-wago:${target}`].includes('react-query-client:generate'));
  }
});

// The SDK drops its graph edge to plugins-frontend-ui (see its project.json), so nothing else orders this.
test('plugin SDK typecheck generates the API client before compiling shared plugin UI', () => {
  const selected = createTaskGraph(graph, {}, ['plugins-frontend-sdk'], ['typecheck'], undefined, {});
  assert.ok(selected.dependencies['plugins-frontend-sdk:typecheck'].includes('react-query-client:generate'));
});

test('ESP-IDF projects are scope:hardware, so toolchain-free CI runs skip them', () => {
  const files = spawnSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).stdout.split('\0');
  const espIdf = files
    .filter((file) => /(^|\/)project\.json$/.test(file))
    .map((file) => JSON.parse(fs.readFileSync(file, 'utf8')))
    .filter((project) => /\bidf\.(sh|py)\b|build_firmwares\.py/.test(JSON.stringify(project.targets ?? {})));
  assert.ok(espIdf.some((project) => project.name === 'attractap-nfc-emulator'));
  for (const project of espIdf) {
    assert.ok(project.tags?.includes('scope:hardware'), `${project.name} needs ESP-IDF, so it must be scope:hardware`);
  }
  // scope:hardware also leaves the emulator out of the core test job; its host tests run with the firmware's.
  assert.ok(
    action('build-attractap-firmware').runs.steps.some(
      (step) => step.run === 'pnpm nx run attractap-nfc-emulator:test',
    ),
  );
});
