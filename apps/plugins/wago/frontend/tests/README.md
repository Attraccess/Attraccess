# WAGO Fixture-Only Browser Tests

Run the ATT-1058 configuration and command suites from the worktree root:

```sh
PYTHON=/opt/homebrew/opt/python@3.14/bin/python3.14 \
  bash apps/plugins/wago/frontend/tests/run_browser_tests.sh
```

Use any Python interpreter with Playwright and its Chromium browser installed.
The wrapper builds the current production configuration editor into
`output/playwright/att-1058/harness` and runs `test_configuration_browser.py`
and `test_isolated_command_browser.py` explicitly.
Pass `-k first_digital` to run just that scenario at both viewport sizes.
No application source, dependency manifests, generated API clients, or database
files are modified. Build output and browser evidence are not source files to commit.

## Configuration and Command Isolation

There is **no server process**, API, login, database, broker, or hardware connection.
The harness mounts the real `ConfigurationEditor` with React Query and HeroUI CSS,
but without the host shell, plugin federation, authentication, or flow editor.
Vite only builds static files; environment-file loading is disabled.
It does not run `pnpm serve` or read `.dev-serve-ports.json`.

Playwright intercepts every request at `https://wago-fixture.invalid`:

- HTML, JavaScript, and CSS are fulfilled from the local harness build.
- `/api/wago/*` is fulfilled by the explicit in-memory `WagoFixture`.
- Unknown fixture endpoints return an error; all other URLs are aborted.
- No request is forwarded with `route.continue_()` or `route.fetch()` by the isolated router.
- WebSockets are closed without connecting; service workers are blocked.
- Chromium background networking is disabled and DNS resolution is disabled.
- Every scenario asserts no unexpected requests or JavaScript page errors, and
  that all HTTP requests were handled as local assets or fixture responses.

The isolation contract test passes synthetic route objects for forbidden host
ports and unknown URLs to the router. It never contacts those addresses.
Existing `test_command_browser.py` is a **legacy real-host suite**, excluded from
this runner. Do not use broad `test_*browser.py` discovery for an isolated run.

## Coverage

Fourteen configuration browser scenarios run at 1440x1000 desktop and 390x844 touch/mobile:

1. First input/output setup, names, physical assignments, save and reload.
2. Selected preset preview/copy and custom pulse duration without implicit save/publish.
3. Explicit save, review, publish and simulated applied report.
4. Simulated rejected report with readable channel labels.
5. Rollback as a new revision, preserving history and requiring impact acknowledgement.
6. Readable review labels, no JSON editor/internal paths, and dialog viewport bounds.
7. Removing the first of two channels shows only the removed stable identity in review.
8. A metadata-only draft change after rollback preview rejects confirmation without overwriting the draft.
9. Embedded diagnostics refresh failure hides cached online status, recovers, and preserves unsaved edits without saving or publishing; the panel fits both viewports.
10. Metadata-only renames appear in review and rollback preview; rollback restores the prior label without changing the hardware snapshot.

11. Modbus TCP/device/named measurement setup, explicit save/publication, cumulative rebinding with stable IDs, and rollback restoring the complete snapshot.
12. Locked unqualified built-ins, custom profile duplication and selection, and invalid register address save blocking.

13. Customized input watchdog/range survives measurement rebinding, and conversion to a plain output removes the incompatible range while retaining channel identity.
14. A saved unused Modbus point can be rebound after device deletion or explicitly released; repairs preserve its physical ID.

Together with isolation, rollback-identity, and metadata-aware review contract tests,
the configuration suite executes 31 tests. Rollback requests must carry the previewed draft
identity; review identities include metadata and remain separate from content hashes. All editor
interactions use browser clicks, typed fields, and checkboxes, not React state
manipulation. Screenshots are evidence, not pixel-diff baselines. Fixture validation,
publication and persistence do not establish backend validation, server durability,
real controller acceptance, physical readiness, or host integration correctness.

## Isolated Command Forms

Two command scenarios run at both viewport sizes (4 more tests; **35 total**):

1. Labelled controller/channel/operation choices, absence of input-only choices,
   Pulse invalidation when switching to a set-only output, read-only revision,
   initialized `false` saved intact, and saved values retained on reopening.
2. An explicitly held schema response blocks Save; a simulated 503 keeps Save
   blocked; Retry recovers, preserves selection and removes obsolete timeout data.

The command harness uses the actual host `NodeEditor`, `PropertyInput`,
`schema-values`, `Select`, `StandardDrawer`, and React Flow node context.
The harness replaces only the host flow provider with an in-memory save callback,
billing configuration with static data, and unused MQTT/companion/currency
dependencies with throwing stubs. Production API URL resolution is unchanged.
Schema requests for the fixture resource are intercepted and fulfilled by
`CommandFixture`; backend schema generation/compatibility filtering is not tested.
No flow is persisted or dispatched. The legacy command suite is untouched.

The Vite boundary plugin applies only in this test build. The harness imports no
real host login or host provider, and does not initialize backend services.
Command tests share the same fail-closed router, request audit, blocked DNS,
WebSockets/service workers, screenshot and trace assertions as configuration tests.
`schema-failure.png` additionally captures the failed-schema state.

## Commissioning

Run the separate commissioning acceptance target from the worktree root:

```sh
PYTHON=/opt/homebrew/opt/python@3.14/bin/python3.14 \
  pnpm nx run plugin-wago:test-commissioning-acceptance
```

This target typechecks acceptance and frontend tests, runs HTTP acceptance, builds
the static commissioning harness, then runs `test_commissioning_browser.py`
through `acceptance/commissioning-browser.spec.ts`. It executes one journey at
each viewport size: `CommissioningDesktop` (1440x1000) and `CommissioningMobile`
(390x844), for two Python tests. It is not included in `run_browser_tests.sh`.

Unlike the configuration/command router, this harness permits selected requests
to its runner-owned ephemeral loopback API. It uses production commissioning
controllers/services with an in-memory database and fixture device/enrollment
transports. Unknown endpoints and other origins are blocked. It does not use a
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

Each browser case writes to `output/playwright/att-1058/<class>/<test>/`:
`final.png`, `page.txt`, `aria.txt`, `requests.json`, `network.json`,
`page-errors.json`, `unexpected.json`, and `trace.zip`.
Screenshots disable animations. Failed Chromium launches are errors, never skips.

Commissioning evidence is under
`output/playwright/att-973-commissioning/<class>/`,
including `destructive-install-confirmation.png`, `recovery-failed.png` and the
final screenshot, text, accessibility, request/error audit and local trace files.
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
