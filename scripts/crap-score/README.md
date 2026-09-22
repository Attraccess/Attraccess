# CRAP change-risk reports

[crap-score](https://github.com/ahilke/js-crap-score) combines function complexity
with statement coverage: `complexity² × (1 − coverage)³ + complexity`. Higher
scores identify functions that may benefit from tests or refactoring.

```sh
pnpm crap-score                                  # all 23 JS/TS projects
pnpm nx run frontend:crap-score                   # one project
pnpm crap-score:affected --base=origin/main       # changed projects and dependents
```

Each target runs the project's existing Jest, Vitest and Node unit suites with JSON
coverage (Istanbul for Vitest), then writes `coverage/crap/<project>/crap-report.json`, `summary.json`,
and `html/index.html`. The root project's directory is `@attraccess__source`.
Nx caches the reports together with the task result. Coverage lives separately
from ordinary test/e2e output, so those tasks cannot overwrite it.

The PR and merge-queue workflow runs affected targets and uploads
`crap-score-reports` for 14 days. Test failures and reporting failures block the
existing `precommit-check` gate. Scores themselves are **informational**: there
is no baseline or arbitrary maximum that would immediately fail legacy code.
The terminal and summary JSON (`atLeast30`) show the number of functions at or above
30 and the highest score: the clean-baseline target is strictly below 30. This is an additional coverage-enabled
unit-test run; ordinary tests and Docker/hardware acceptance remain independent.

## Scope

Every current JavaScript/TypeScript app, library and tool has a `crap-score`
target, including plugin frontends, the companion renderer, WAGO runtime and
TypeScript circuit designs. Files outside a nested Nx project, including standalone tools, root configuration,
shared plugin/hardware scripts and examples, belong to the root target. The C/C++ Attractap firmware and desktop
simulator cannot be analyzed by this JS/TS tool and retain their existing checks.

Source discovery includes Git-tracked and unignored new JS/TS files. Tests,
fixtures, declarations, generated clients and build output are excluded. Nested
Nx projects are analyzed by their own target. Configuration files remain in scope. Files and functions absent from the unit-test
coverage report are instrumented with zero execution counts; this also covers
projects without tests. Thus an untested file does not disappear from the report.
E2E, shell and device tests do not contribute coverage to these unit reports.

The bundled third-party OpenSCAD runtime at
`apps/frontend/public/openscad/openscad.wasm.js` is explicitly excluded; other
maintained public scripts remain in scope. Duplicate function mappings are
collapsed by their complete source range, retaining the maximum observed call
count. Same-line anonymous callbacks and same-named methods remain distinct.

The adapter merges backend and frontend coverage for plugins, limits coverage to
the owning project, and assigns unique function identifiers because upstream
otherwise overwrites functions with identical names. `@typescript-eslint/parser`
is an explicit dependency because upstream resolves it from the working directory
under pnpm's isolated dependency layout. Vitest uses Istanbul here. For this coverage run, the frontend disables React
Compiler via `CRAP_SCORE_COVERAGE=1`: its optimized source maps omit function
columns needed to match coverage to complexity. Ordinary unit tests retain the
compiler. Missing function-end columns are restored from the original source
when there is one unambiguous match, preserving execution counts and nested
callbacks. Upstream analysis errors fail the task instead of
publishing a silently incomplete report.

When adding a JS/TS project, add the same `crap-score` run-command target with its
project directory. Jest configs are detected automatically. For a new Vitest
suite, add its existing configuration to `suites()` in `run.mjs`. Add any required
code-generation dependencies to the target as with the ordinary test target.

Run the adapter's regression checks with:

```sh
node --test scripts/crap-score/run.test.mjs
```

## Node runners and source identity

Owned `.test.mjs`/`.spec.mjs` files importing `node:test` run with a Node module
hook that collects Istanbul coverage in `node/`. Child processes inherit the
hook through `NODE_OPTIONS`. Tests that deliberately replace their environment
forward only the coverage variables when this mode is active. Copied CLI scripts
are attributed to their maintained source only when their complete contents
match exactly one source file; fixture executables do not contribute coverage.
The root Vitest suite also includes the port-allocation tests in `scripts/`.

Original source function ranges canonicalize transformed function identities
before deduplication. Missing functions receive zero counts without adding a
second set of zero-count statements to functions already measured by a runner.
Coverage from Node, Jest and Vitest is combined before scoring.
