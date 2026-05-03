# ATT-275 — Drop sed workaround in react-query-client codegen

Date: 2026-05-03
Linear: ATT-275
Branch: `att-275-drop-sed-workaround-in-react-query-client-codegen-upgrade`

## Problem

`libs/react-query-client/project.json` post-processes generated `infiniteQueries.ts` with a portable `sed -i.bak` chain to flip three hardcoded strings:

| Source string                  | Replacement              |
| ------------------------------ | ------------------------ |
| `pageParam as string`          | `pageParam as number`    |
| `initialPageParam: "1"`        | `initialPageParam: 1`    |
| `nextPage: string;`            | `nextPage: number;`      |

Reason: `@7nohe/openapi-react-query-codegen@1.6.2` hardcodes string-typed page params in its infinite-query template. Our OpenAPI schema declares `page: number`, so the cast collides with `FindManyData.page?: number` and breaks `tsc`.

The sed is brittle (string-coupled to upstream template), runs on every codegen, and exists only because v1 has no config knob.

## Goal

Eliminate the sed step. Generated `infiniteQueries.ts` must contain numeric `pageParam` directly out of `openapi-rq`, with `nx build|test|typecheck react-query-client` green and `apps/frontend` typechecking against the new client.

## Approach (as implemented)

Pin `@7nohe/openapi-react-query-codegen` at `1.6.2` and patch its generator at install time via `pnpm.patchedDependencies`, then drop the `sed` chain.

The patch lives at `patches/@7nohe__openapi-react-query-codegen@1.6.2.patch` and applies three localised edits to `dist/createUseQuery.mjs`:

1. **`pageParam` cast** — force `ts.SyntaxKind.NumberKeyword` (was a brittle ternary on `p.type?.getText() === "number"` that misses union types like `number | undefined`).
2. **`initialPageParam` literal** — switch `ts.factory.createStringLiteral(initialPageParam)` → `ts.factory.createNumericLiteral(initialPageParam)`.
3. **`nextPage` type keyword** — force `ts.SyntaxKind.NumberKeyword` on the inferred page-shape cast (same ternary fall-through as #1).

After patching, the v1 generator emits numeric page params natively in `infiniteQueries.ts`, so the `sed` chain becomes redundant.

### Why not v2.1.0 (rejected)

Initial plan was to upgrade to `@7nohe/openapi-react-query-codegen@^2.0.0` (renovate branch `origin/renovate/7nohe-openapi-react-query-codegen-2.x` already open with `93e3d0e1`). On probing v2.1.0 we found:

1. **Breaking restructure of public surface.** v2 replaces the entire HTTP runtime: it drops `ApiError`, `CancelablePromise`, `OpenAPI`, `ApiRequestOptions` (used in 20+ files in `apps/frontend/src/...`) and substitutes a `@hey-api/client-fetch` runtime under `requests/client/`. Adapting all consumers is out of scope for ATT-275 and belongs in its own ticket.
2. **v2 still hardcodes `initialPageParam: "1"` as a quoted string.** `node_modules/@7nohe/openapi-react-query-codegen/dist/createUseQuery.mjs` line 245 calls `ts.factory.createStringLiteral(initialPageParam)` regardless of the `--initialPageParam` CLI value. So even after a v2 upgrade we would still need a `sed`/post-process for at least one of the three substitutions, defeating the acceptance criterion.
3. **`--operationId` flag was removed in v2** (replaced by inverted `--noOperationId`). Existing project.json command would become invalid.

The v2 attempt and revert are preserved in branch history (`d0da768b` → `6397fab6`) as an audit trail.

## Architecture / file impact (as implemented)

Modified files:

- `package.json` — adds `pnpm.patchedDependencies["@7nohe/openapi-react-query-codegen@1.6.2"]` pointing at the patch file. Version specifier stays at `^1.6.2`.
- `pnpm-lock.yaml` — adds the patch hash; no other dependency churn.
- `libs/react-query-client/project.json` — drop the `&& sed ... && sed ... && sed ...` tail from `targets.generate.options.command`. Final command: `pnpm openapi-rq --operationId --input=dist/apps/api-swagger/swagger.json --enums=typescript --output=libs/react-query-client/src/lib`.
- `libs/react-query-client/jest.config.ts` — add `/// <reference types="node" />` so it compiles under TypeScript 6 (pre-existing repo bug, exposed for the first time by this lib gaining its first tests; see "TS6 jest.config.ts globals" below).
- `libs/react-query-client/src/lib/queries/infiniteQueries.ts` — regenerated. Byte-identical to the previous sed-processed output (verified by diff vs `origin/main`).

New files:

- `patches/@7nohe__openapi-react-query-codegen@1.6.2.patch` — three-edit patch on `dist/createUseQuery.mjs`.
- `libs/react-query-client/src/__tests__/codegen-output.test.ts` — Jest contract test asserting generator output meets contract. (Final location: `src/__tests__/`, more idiomatic for Nx + Jest discovery; spec originally proposed `test/`.)
- `libs/react-query-client/src/__tests__/project-config.test.ts` — Jest contract test asserting `project.json` contains no `sed` post-processing.

## TS6 `jest.config.ts` globals (incidental fix)

The repo-wide TypeScript 6 upgrade (commit `925e75c3` on `origin/main`) is stricter about ambient globals: `module.exports = ...` in `jest.config.ts` no longer compiles via `ts-node` (TS2591). Every project's `jest.config.ts` shares this issue, but `nx affected --target=test` only runs tests for projects whose source changed, so the bug stayed hidden until ATT-275 added the first-ever test files in `react-query-client`. Adding `/// <reference types="node" />` to this lib's `jest.config.ts` is the smallest local fix that lets the new contract tests run in CI. Other libs are out of scope for this ticket but will need the same treatment when they next gain tests.

## Test strategy (TDD)

Tests written **before** dependency bump; they fail against current `main` and pass after the upgrade + sed removal.

### Test 1 — `codegen-output.test.ts`

Reads `libs/react-query-client/src/lib/queries/infiniteQueries.ts` from disk and asserts:

| Assertion                                              | Why                                                                       |
| ------------------------------------------------------ | ------------------------------------------------------------------------- |
| File exists                                            | Codegen ran                                                               |
| Does **not** match `/pageParam as string/`             | Acceptance criterion 1                                                    |
| Does **not** match `/initialPageParam:\s*["']1["']/`   | Acceptance criterion 1                                                    |
| Does **not** match `/nextPage:\s*string\b/`            | Acceptance criterion 1                                                    |
| Matches `/pageParam as number/`                        | Numeric cast present                                                      |
| Matches `/initialPageParam:\s*1\b/`                    | Numeric initial value                                                     |
| Matches `/nextPage\??:\s*number\b/`                    | Numeric type in inferred shape                                            |
| Does **not** import `glob` or contain leftover `.bak`  | No sed artifacts ever touched the file                                    |

### Test 2 — `project-config.test.ts`

Reads `libs/react-query-client/project.json` and asserts:

| Assertion                                                          | Why                                  |
| ------------------------------------------------------------------ | ------------------------------------ |
| `targets.generate.options.command` is a string                     | Schema sanity                        |
| Command does not contain substring `sed`                           | Acceptance criterion 2               |
| Command does not contain `.bak`                                    | No sed artifact                      |
| Command does not contain `infiniteQueries.ts` (only generator)     | No targeted post-processing          |
| Command starts with `pnpm openapi-rq`                              | Generator entry unchanged            |

### Test 3 — Build/typecheck (existing, run as verification gate)

- `pnpm nx build react-query-client` — green.
- `pnpm nx test react-query-client` — green (includes the two new tests above).
- `pnpm nx typecheck react-query-client` — green.
- `pnpm nx typecheck frontend` — green (consumer of the regenerated client).

## Rollout (as executed)

1. Pull latest `origin/main`.
2. Create worktree on branch `att-275-drop-sed-workaround-in-react-query-client-codegen-upgrade` from `origin/main`.
3. Add the two new test files (failing).
4. Probe v2 — reject for the reasons above; revert.
5. Apply `pnpm patch` to v1.6.2's `createUseQuery.mjs`; commit `patches/` + the new `pnpm.patchedDependencies` block.
6. Strip `sed` from `project.json`.
7. Add `/// <reference types="node" />` to `jest.config.ts` (incidental TS6 unblock).
8. Run `pnpm nx reset && pnpm nx run react-query-client:generate`.
9. Run all four verification commands (test/build/typecheck/lint) plus `nx typecheck frontend`.
10. Commit per Conventional Commits, push, open PR linked to ATT-275.

## Risks (resolved or accepted)

| Risk                                                                       | Outcome                                                                 |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| v2 still emits `string` page param                                         | Confirmed during probe. Pivoted to v1 + pnpm patch. ✅                  |
| v2 changes other generator output (breaking consumers)                     | Confirmed. Pivot avoids consumer migration. ✅                          |
| Patch becomes stale on future `@7nohe/openapi-react-query-codegen` bumps   | pnpm verifies the patch hash on every install; bump fails loudly.       |
| Other libs' jest configs may break under TS6 when next touched             | Out of scope; left for a follow-up sweep when those libs gain tests.    |

## Acceptance (from ATT-275)

- [x] `nx run react-query-client:generate` produces `infiniteQueries.ts` with numeric `pageParam` without any post-processing.
- [x] No `sed` step in `libs/react-query-client/project.json`.
- [x] `nx build react-query-client` and `nx test react-query-client` pass.
