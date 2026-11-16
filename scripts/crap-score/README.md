# CRAP score limit

[crap-score](https://github.com/ahilke/js-crap-score) combines function complexity
with statement coverage: `complexity² × (1 − coverage)³ + complexity`. Higher
scores identify functions that may benefit from tests or refactoring.

```sh
pnpm crap-score                                  # nx run-many -t crap-score
pnpm nx run frontend:crap-score                   # one project
pnpm crap-score:affected --base=origin/main       # nx affected -t crap-score
pnpm precommit                                    # affected lint, typecheck, test and crap-score
pnpm precommit:all                                # every target in the workspace
```

Coverage comes from the projects' own unit test targets. Their Jest and Vitest
configs always write Istanbul JSON coverage, and Node `node:test` suites run
through `scripts/crap-score/node-test.mjs`, to
`coverage/<project root>/<target>/` (`coverage/root/` for the root project). Each
target declares that directory as an Nx output, so a cache hit restores it.

A project's `crap-score` target lists those test targets in `dependsOn`. It reads
exactly their coverage directories, fails if one wrote none, and writes
`coverage/crap/<project>/crap-report.json`, `summary.json` and `html/index.html`
(the root project's directory is `@attraccess__source`). Nx hashes the
dependencies' coverage files (`dependentTasksOutputFiles`) together with the
scorer, so a changed test result, scorer or limit reruns the analysis.
Istanbul keys coverage by absolute path, and Nx's cache is shared between checkouts
and worktrees, so a cache hit can restore coverage another checkout wrote. The adapter
re-anchors those paths at the current workspace before scoring; without that, every
cached file would read as 0% covered. Every
function has an inclusive maximum score of **30**: exactly 30 passes, anything
above fails the target and reports the project, source path, function, line,
score, complexity and statement coverage. Reports are written before enforcement,
so they remain available when the limit fails.

Project selection is Nx's own. The PR and merge-queue workflow runs
`nx affected -t crap-score` and uploads `crap-score-reports` for 14 days; the
`precommit-check` gate blocks on it. `pnpm precommit` runs
`nx affected --uncommitted -t lint,typecheck,test,crap-score`, excluding hardware
and companion projects. Projects tagged `host:fhs` (the WAGO plugin, whose tests
run device shell scripts against `/bin` and `/usr/bin` tools) are also excluded,
with a notice, on hosts without that layout such as NixOS. CI runs all of them.

Before running anything, the hook rejects unstaged or untracked JS/TS files and
analysis configuration, including partially staged files, because Nx reads the
worktree. This keeps a worktree-only fix from validating a different staged
snapshot. Stage or discard those changes and retry.

## Scope

Every current JavaScript/TypeScript app, library and tool has a `crap-score`
target, including plugin frontends, the companion renderer and WAGO runtime.
Files outside a nested Nx project, including standalone tools, root configuration,
shared plugin scripts and examples, belong to the root target. The Attractap
firmware target scores its Node tooling (for example `tools/check-version.mjs`);
its C/C++ sources, the desktop simulator and the Python/Nix Attractap lab cannot
be analyzed by this JS/TS tool and retain their native checks.

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
under pnpm's isolated dependency layout. Vitest uses Istanbul. The frontend's
unit tests run without React Compiler, whose source maps omit the function columns
needed to match coverage to complexity; the app build still uses it. Missing
function-end columns are restored from the original source when there is one
unambiguous match, preserving execution counts and nested callbacks. Upstream
analysis errors fail the task instead of publishing a silently incomplete report.

When adding a JS/TS project, give its unit test targets coverage output in
`coverage/<project root>/<target>/` and add a `crap-score` target that runs
`node scripts/crap-score/run.mjs <project root>` and depends on them. Native
C/C++ remains outside this JavaScript/TypeScript check.

Run the adapter's regression checks with:

```sh
node --test scripts/crap-score/*.test.mjs
```

`run.test.mjs` covers coverage merging and scoring; `enforce.test.mjs` covers the
threshold boundary, function completeness, reading test-target coverage,
staged-snapshot checks and the hook and CI entry points.

## Node runners and source identity

Node's own coverage has no Istanbul function ranges, so `node:test` targets run
through `node-test.mjs <project root> <coverage directory> <test files...>`. It
loads a module hook that instruments the project's JavaScript sources; child
processes inherit it through `NODE_OPTIONS`. Tests that deliberately replace their
environment forward only the coverage variables when this mode is active. Copied
CLI scripts are attributed to their maintained source only when their complete
contents match exactly one source file; fixture executables do not contribute
coverage.

Original source function ranges canonicalize transformed function identities
before deduplication. Missing functions receive zero counts without adding a
second set of zero-count statements to functions already measured by a runner.
Coverage from Node, Jest and Vitest is combined before scoring.

The pinned scorer patch matches Istanbul's zero-based source coordinates to
ESLint's one-based coordinates using declaration identity and exact function ends.
Nested same-line and curried callbacks retain separate complexity values and
locations. TypeScript re-export getters and enum wrappers are compiler scaffolding,
not source functions; real functions in the same files remain included. The patch
also waits for every HTML function page before report completion.
