# WAGO Browser Acceptance Tests

The commissioning browser suite builds a static harness, serves it through a
Playwright router and drives it in desktop and touch/mobile Chromium. No application
source, dependency manifests, generated API clients, or database files are modified.
Build output and browser evidence are not source files to commit. The frontend
Vitest suites run separately through `plugin-wago:test-frontend`.

## Commissioning

Run the separate commissioning acceptance target from the worktree root:

```sh
PYTHON=/opt/homebrew/opt/python@3.14/bin/python3.14 \
  pnpm nx run plugin-wago:test-commissioning-acceptance
```

This target typechecks acceptance and frontend tests, runs HTTP acceptance, builds
the static commissioning harness, then runs `test_commissioning_browser.py`
through `acceptance/commissioning/browser.spec.ts`. It executes one journey at
each viewport size: `CommissioningDesktop` (1440x1000) and `CommissioningMobile`
(390x844), for two Python tests.

This harness permits selected requests to its runner-owned ephemeral loopback API.
It uses production commissioning controllers/services with an in-memory database
and fixture device/enrollment transports. Unknown endpoints and other origins are blocked. It does not use a
shared database, broker or device, host login, or plugin federation. The fixture
closes its application/database and removes its temporary directory. The static
build and owned acceptance API are not development servers; if a development
server is needed separately, use `pnpm serve` and discover its resolved ports.

The journey checks signed import failure/retry, retained release selection, pinned
identity, optional preflight, exactly one destructive-install checkbox, and
installation disabled until fresh credentials and consequence approval exist.
Interrupted delivery exercises **Clean up failed installation**: failed cleanup
shows **Recovery requires attention**, clears its password, and requires fresh
credentials/approval for retry. Successful cleanup shows **Runtime installation
cleaned up**; reinstall requires fresh credentials and destructive consent. The
journey also covers resumed progress, simulated discovery, configuration
navigation, separate **Recover saved access** failure/retry and physical
qualification remaining pending. These UI assertions do not execute physical
host supervision or establish that real hardware stopped.

## Evidence

Commissioning evidence is under
`output/playwright/att-973-commissioning/<class>/`,
including `destructive-install-confirmation.png`, `recovery-failed.png` and the
final screenshot, text, accessibility, request/error audit and local trace files.
Screenshots disable animations. Failed Chromium launches are errors, never skips.
`WAGO_BROWSER_ARTIFACTS_ROOT` redirects the artifact root for an isolated run;
use it consistently for the harness build and browser runner. Do not overwrite
another run's existing evidence.

The composed fleet release gate is `pnpm nx run plugin-wago:fleet-acceptance`.
It runs the default plugin/runtime tests, typechecks, lint and builds, followed by
isolated simulator, production RabbitMQ graph, desktop/mobile browser, and evidence
validator suites. Run it before merging a composed fleet release. It requires the
OrbStack Docker context and a Python installation with Playwright Chromium; set
`PYTHON` to that interpreter if needed. It creates only dedicated local fixtures.
Frontend test typechecking requires a zero exit and no diagnostics; there is no
commissioning-error allowlist. A fresh checkout needs the repository's generated
client prerequisites before typechecking. Generated files remain uncommitted.
These checks do not qualify physical hardware or supply durable audit storage.

CI explicitly runs `plugin-wago:typecheck-acceptance`,
`plugin-wago:test-typecheck-frontend-gate`, `plugin-wago:typecheck-frontend-tests`
and `plugin-wago:production-fleet`. The gate self-tests rejection of diagnostics
and runs the strict wrapper; `typecheck-frontend-tests` runs raw frontend test
`tsc`. The old `typecheck-frontend-tests-baseline` target is absent.

`production-fleet` depends on `typecheck-acceptance` and
`test-production-fleet-cleanup`. Its six cleanup regressions cover failed startup,
foreign ownership, foreign name, absent container, and failed removal with either
recovered or already-known container identity. They assert removal targets only
the exact owned container, no removal is attempted for a foreign/absent target,
and the runner's temporary directory is removed even when Docker fails. A failed
startup/removal remains a failed run. These use a fake Docker executable; they
are separate from controller installation cleanup and hardware-stop verification.

### 2026-09-06 validation history

The independent validator's snapshot captured at `2026-09-06T17:11:46.494036Z`
passed the full fleet gate, including 61 frontend unit tests, raw frontend test
typechecking, the two repository commissioning browser cases and 35 configuration/
command tests. Six additional validation-only commissioning cases covered active
CODESYS success, preparation-only failure and failed disablement at both viewport
sizes: eight commissioning cases in total. Those extra scenarios live in that
isolated validation evidence, not the repository runner described above.

This result supersedes the earlier local sandbox/listen and generated-client
failures for that tested snapshot. It predates the subsequent host-supervisor,
identity/descriptor and containment security changes. It does not verify those
changes or hardware; rerun against the final source and retain a new snapshot
record. The former two-error baseline documentation was corrected after validation.
The configuration tests among those 35 were removed with the old configuration
editor (ATT-1216).
