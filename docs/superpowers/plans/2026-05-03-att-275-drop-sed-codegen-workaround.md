# ATT-275 — Drop sed workaround in react-query-client codegen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the `sed` post-processing chain on `infiniteQueries.ts` by patching the `@7nohe/openapi-react-query-codegen` v1 generator at install-time via `pnpm patch`, so it emits numeric `pageParam`/`nextPage`/`initialPageParam` natively.

**Architecture:** Add two filesystem-level Jest tests that pin the contract (generated file uses numeric page params; `project.json` contains no `sed`). Run them red against `main`. Then patch v1's `dist/createUseQuery.mjs` via `pnpm patch` (three localised changes: `initialPageParam` literal kind, `pageParam as` cast keyword, `nextPage:` type keyword), drop the `sed` chain, regenerate. Run tests green.

**Tech Stack:** Nx 22, pnpm 9.15, Jest + ts-jest, `@7nohe/openapi-react-query-codegen` v1.6.2 (with `pnpm.patchedDependencies` override).

**Why not v2?** v2.1.0 is a breaking restructure: replaces `ApiError`/`CancelablePromise`/`OpenAPI` (used in 20+ frontend files) with a `@hey-api/client-fetch` runtime. It also still emits `initialPageParam: "1"` quoted (only fixes 2 of 3 hardcoded strings). Adapting all consumers belongs in its own ticket. v1 + pnpm patch keeps this PR scoped to ATT-275.

**Spec:** `docs/superpowers/specs/2026-05-03-att-275-drop-sed-codegen-workaround-design.md`

**Linear:** ATT-275
**Branch:** `att-275-drop-sed-workaround-in-react-query-client-codegen-upgrade`

---

## Pre-flight

### Task 0: Worktree setup

**Files:** none modified yet.

- [ ] **Step 0.1: Pull latest `main`**

```bash
cd /Users/jappy/code/attraccess/Attraccess
git fetch origin
git checkout main
git pull --ff-only origin main
```

Expected: `main` matches `origin/main`.

- [ ] **Step 0.2: Create worktree off `origin/main`**

Use the `superpowers:using-git-worktrees` skill if isolation is required, or run:

```bash
git worktree add -b att-275-drop-sed-workaround-in-react-query-client-codegen-upgrade \
  ../Attraccess-att-275 origin/main
cd ../Attraccess-att-275
pnpm install
```

Expected: clean worktree on the new branch, `node_modules` populated.

- [ ] **Step 0.3: Verify baseline state**

```bash
grep -q "sed -i.bak" libs/react-query-client/project.json && echo "sed present (expected)"
grep -q '"@7nohe/openapi-react-query-codegen": "\^1.6.2"' package.json && echo "v1 present (expected)"
```

Expected: both echoes print.

---

## Phase 1 — Add failing tests (TDD)

### Task 1: Project config contract test

**Files:**
- Create: `libs/react-query-client/src/__tests__/project-config.test.ts`

- [ ] **Step 1.1: Write the failing test**

```typescript
// Asserts react-query-client codegen target has no sed post-processing
// FEATURE: Codegen contract — drop sed workaround (ATT-275)

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PROJECT_JSON = resolve(__dirname, '../../project.json');

interface ProjectConfig {
  targets: {
    generate: {
      options: {
        command: string;
      };
    };
  };
}

describe('react-query-client project.json — codegen target', () => {
  const config = JSON.parse(readFileSync(PROJECT_JSON, 'utf8')) as ProjectConfig;
  const command = config.targets.generate.options.command;

  it('has a string command', () => {
    expect(typeof command).toBe('string');
  });

  it('starts with the openapi-rq generator invocation', () => {
    expect(command).toMatch(/^pnpm openapi-rq /);
  });

  it('does not invoke sed', () => {
    expect(command).not.toMatch(/\bsed\b/);
  });

  it('does not reference .bak backup files', () => {
    expect(command).not.toContain('.bak');
  });

  it('does not target infiniteQueries.ts for post-processing', () => {
    expect(command).not.toContain('infiniteQueries.ts');
  });

  it('does not chain post-processing shell commands after the generator', () => {
    expect(command).not.toMatch(/&&\s*(sed|rm|awk|perl)\b/);
  });
});
```

- [ ] **Step 1.2: Run test to verify it fails**

```bash
pnpm nx test react-query-client --testFile=src/__tests__/project-config.test.ts --no-cache
```

Expected: 4 of 6 assertions FAIL (`does not invoke sed`, `does not reference .bak`, `does not target infiniteQueries.ts`, `does not chain post-processing`).

- [ ] **Step 1.3: Commit**

```bash
git add libs/react-query-client/src/__tests__/project-config.test.ts
git commit -m "test(react-query-client): pin no-sed codegen contract (ATT-275)"
```

---

### Task 2: Generated `infiniteQueries.ts` contract test

**Files:**
- Create: `libs/react-query-client/src/__tests__/codegen-output.test.ts`

- [ ] **Step 2.1: Write the failing test**

```typescript
// Asserts generated infiniteQueries.ts uses numeric page params natively
// FEATURE: Codegen contract — drop sed workaround (ATT-275)

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const INFINITE_QUERIES = resolve(
  __dirname,
  '../lib/queries/infiniteQueries.ts'
);

describe('generated infiniteQueries.ts — numeric page params', () => {
  it('exists on disk (codegen has run)', () => {
    expect(existsSync(INFINITE_QUERIES)).toBe(true);
  });

  const source = existsSync(INFINITE_QUERIES)
    ? readFileSync(INFINITE_QUERIES, 'utf8')
    : '';

  it('does not cast pageParam to string', () => {
    expect(source).not.toMatch(/pageParam\s+as\s+string/);
  });

  it('does not initialise pageParam with a string literal', () => {
    expect(source).not.toMatch(/initialPageParam:\s*["']1["']/);
  });

  it('does not declare nextPage as a string', () => {
    expect(source).not.toMatch(/nextPage\??\s*:\s*string\b/);
  });

  it('casts pageParam to number where used', () => {
    expect(source).toMatch(/pageParam\s+as\s+number/);
  });

  it('initialises pageParam with the numeric literal 1', () => {
    expect(source).toMatch(/initialPageParam:\s*1\b/);
  });

  it('declares nextPage as number in the inferred page shape', () => {
    expect(source).toMatch(/nextPage\??\s*:\s*number\b/);
  });

  it('contains no sed backup leftovers (.bak references)', () => {
    expect(source).not.toContain('.bak');
  });
});
```

- [ ] **Step 2.2: Run test to verify current state**

```bash
pnpm nx test react-query-client --testFile=src/__tests__/codegen-output.test.ts --no-cache
```

Expected: with the **existing** sed in place, this test should mostly **pass** (sed has already converted the strings). That is intentional — the test is a regression guard: it must still pass after we remove the sed because v2 emits the numeric form natively. Record the pass-count for comparison.

If any assertion fails now, investigate before continuing — the sed may not be running or the generated file is stale. Run `pnpm nx run react-query-client:generate` first if needed.

- [ ] **Step 2.3: Commit**

```bash
git add libs/react-query-client/src/__tests__/codegen-output.test.ts
git commit -m "test(react-query-client): pin numeric pageParam contract (ATT-275)"
```

---

## Phase 2 — Upgrade dependency

### Task 3: Bump `@7nohe/openapi-react-query-codegen` to v2

**Files:**
- Modify: `package.json` (line containing `"@7nohe/openapi-react-query-codegen": "^1.6.2"`)
- Modify: `pnpm-lock.yaml` (regenerated by pnpm)

- [ ] **Step 3.1: Edit `package.json`**

Change:

```json
"@7nohe/openapi-react-query-codegen": "^1.6.2",
```

to:

```json
"@7nohe/openapi-react-query-codegen": "^2.0.0",
```

- [ ] **Step 3.2: Regenerate lockfile**

```bash
pnpm install
```

Expected: lockfile updated, `@7nohe/openapi-react-query-codegen@2.1.0` resolved, `@hey-api/openapi-ts@0.92.x` and `@hey-api/codegen-core@0.7.x` added, `glob@10` peer-only entry removed (transitively, if no other consumer).

- [ ] **Step 3.3: Sanity check installed version**

```bash
pnpm list @7nohe/openapi-react-query-codegen
```

Expected output contains `@7nohe/openapi-react-query-codegen 2.1.0`.

- [ ] **Step 3.4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore(deps): bump @7nohe/openapi-react-query-codegen to ^2.0.0 (ATT-275)"
```

---

## Phase 3 — Probe v2 output, then drop sed

### Task 4: Probe v2 generator output before touching project.json

**Files:** none (read-only probe).

- [ ] **Step 4.1: Ensure swagger artefact exists**

```bash
pnpm nx run api:export-swagger
```

Expected: `dist/apps/api-swagger/swagger.json` updated.

- [ ] **Step 4.2: Run codegen with the existing (sed-in-place) command, then immediately re-run the generator alone to inspect raw v2 output**

Run the generator without sed by invoking only the first half:

```bash
pnpm openapi-rq --operationId \
  --input=dist/apps/api-swagger/swagger.json \
  --enums=typescript \
  --output=libs/react-query-client/src/lib
```

- [ ] **Step 4.3: Inspect raw output for hardcoded strings**

```bash
grep -nE 'pageParam as string|initialPageParam:\s*"1"|nextPage:\s*string' \
  libs/react-query-client/src/lib/queries/infiniteQueries.ts || \
  echo "v2 emits numeric page params natively — sed no longer needed"
```

Expected: `echo` line printed (no matches).

**Decision gate:**
- If `echo` line printed → continue to Task 5.
- If matches found → STOP. v2 still hardcodes string. Open an issue at `7nohe/openapi-react-query-codegen` referencing the offending lines, comment on ATT-275 with the upstream link, abandon the PR, and revert the dep bump (`git revert HEAD`).

---

### Task 5: Drop sed from project.json

**Files:**
- Modify: `libs/react-query-client/project.json` (line 25 — `targets.generate.options.command`)

- [ ] **Step 5.1: Edit `project.json`**

Replace the entire `command` value at `targets.generate.options.command`:

From:

```
pnpm openapi-rq --operationId --input=dist/apps/api-swagger/swagger.json --enums=typescript --output=libs/react-query-client/src/lib && sed -i.bak 's/pageParam as string/pageParam as number/g; s/initialPageParam: "1"/initialPageParam: 1/g; s/nextPage: string;/nextPage: number;/g' libs/react-query-client/src/lib/queries/infiniteQueries.ts && rm libs/react-query-client/src/lib/queries/infiniteQueries.ts.bak
```

To:

```
pnpm openapi-rq --operationId --input=dist/apps/api-swagger/swagger.json --enums=typescript --output=libs/react-query-client/src/lib
```

- [ ] **Step 5.2: Verify the generate target round-trips through the new command**

```bash
pnpm nx reset
pnpm nx run react-query-client:generate
```

Expected: generation succeeds, no shell errors about `sed`.

- [ ] **Step 5.3: Re-grep generated file**

```bash
grep -nE 'pageParam as string|initialPageParam:\s*"1"|nextPage:\s*string' \
  libs/react-query-client/src/lib/queries/infiniteQueries.ts || \
  echo "OK — numeric page params"
grep -n 'pageParam as number' libs/react-query-client/src/lib/queries/infiniteQueries.ts
grep -n 'initialPageParam: 1' libs/react-query-client/src/lib/queries/infiniteQueries.ts
```

Expected: `OK — numeric page params`, plus matches for `pageParam as number` and `initialPageParam: 1`.

---

## Phase 4 — Verification

### Task 6: Run contract tests green

**Files:** none modified.

- [ ] **Step 6.1: Run both new tests**

```bash
pnpm nx test react-query-client \
  --testFile=src/__tests__/project-config.test.ts \
  --no-cache
pnpm nx test react-query-client \
  --testFile=src/__tests__/codegen-output.test.ts \
  --no-cache
```

Expected: both suites PASS, all assertions green.

- [ ] **Step 6.2: Run full library test suite**

```bash
pnpm nx test react-query-client --no-cache
```

Expected: PASS.

---

### Task 7: Build + typecheck verification

**Files:** none modified.

- [ ] **Step 7.1: Build the library**

```bash
pnpm nx build react-query-client
```

Expected: PASS, `dist/libs/react-query-client/` produced.

- [ ] **Step 7.2: Typecheck the library**

```bash
pnpm nx typecheck react-query-client
```

Expected: PASS.

- [ ] **Step 7.3: Typecheck the consumer (frontend)**

```bash
pnpm nx typecheck frontend
```

Expected: PASS. If it fails on regenerated client API surface differences, those need fixing before the PR can land — surface the failure to the user before touching consumer code.

- [ ] **Step 7.4: Lint the library**

```bash
pnpm nx lint react-query-client
```

Expected: PASS, 0 warnings.

---

### Task 8: Commit regenerated client + project.json change

**Files:**
- Modify: `libs/react-query-client/project.json`
- Modify: `libs/react-query-client/src/lib/**/*` (regenerated)

- [ ] **Step 8.1: Stage**

```bash
git add libs/react-query-client/project.json
git add libs/react-query-client/src/lib
```

- [ ] **Step 8.2: Inspect diff is sane**

```bash
git diff --staged --stat
git diff --staged libs/react-query-client/project.json
```

Expected: `project.json` shows the sed chain removed; `src/lib/**` shows the regenerated client (review for unintended structural deltas — surface anything weird before committing).

- [ ] **Step 8.3: Commit**

```bash
git commit -m "$(cat <<'EOF'
refactor(react-query-client): drop sed workaround, use openapi-rq v2 native numeric pageParam (ATT-275)

The v1.6.2 generator hardcoded string-typed page params, requiring a
post-codegen sed chain. v2.1.0 emits numeric pageParam natively, so the
sed step is removed and pinned out via two contract tests.
EOF
)"
```

---

### Task 9: Final repo health check

- [ ] **Step 9.1: Affected build + test sweep**

```bash
pnpm nx affected -t build test typecheck lint --base=origin/main --head=HEAD
```

Expected: PASS across all affected projects.

- [ ] **Step 9.2: Confirm working tree clean**

```bash
git status
```

Expected: `nothing to commit, working tree clean`.

- [ ] **Step 9.3: Push branch**

```bash
git push -u origin att-275-drop-sed-workaround-in-react-query-client-codegen-upgrade
```

Expected: branch pushed.

- [ ] **Step 9.4: Hand off to user for PR**

Surface push URL, summarise commits, await user instruction to open PR.

---

## Rollback procedure

If Task 4's decision gate fails (v2 still emits string), or any later verification fails irrecoverably:

```bash
git reset --hard origin/main
```

Then re-run install:

```bash
pnpm install
```

Worktree is back to baseline. Comment on ATT-275 with the failure mode.
