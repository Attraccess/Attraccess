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
      assert.ok(jobs.containerize.needs.includes(deliverable) || jobs['precommit-check']?.needs.includes(deliverable));
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

test('frontend SDK typecheck generates the API client that the shared plugin UI re-exports', () => {
  // The SDK has no project edge to plugins-frontend-ui, so ^generate cannot reach the client.
  // project.json only declares the dependency; @nx/vite infers the executor.
  const sdk = nodes['plugins-frontend-sdk'];
  const typecheck = { executor: 'nx:run-commands', ...sdk.data.targets.typecheck };
  const inferred = { ...sdk, data: { ...sdk.data, targets: { ...sdk.data.targets, typecheck } } };
  const selected = createTaskGraph(
    { ...graph, nodes: { ...nodes, [sdk.name]: inferred } },
    {},
    [sdk.name],
    ['typecheck'],
    undefined,
    {},
  );
  assert.ok(selected.dependencies['plugins-frontend-sdk:typecheck'].includes('react-query-client:generate'));
});
