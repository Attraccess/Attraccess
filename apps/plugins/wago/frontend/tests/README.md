# ATT-1058 Fixture-Only Browser Tests

Run from the worktree root:

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

## Isolation

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

Twelve configuration browser scenarios run at 1440x1000 desktop and 390x844 touch/mobile:

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

Together with isolation, rollback-identity, and metadata-aware review contract tests,
the configuration suite executes 27 tests. Rollback requests must carry the previewed draft
identity; review identities include metadata and remain separate from content hashes. All editor
interactions use browser clicks, typed fields, and checkboxes, not React state
manipulation. Screenshots are evidence, not pixel-diff baselines. Fixture validation,
publication and persistence do not establish backend validation, server durability,
real controller acceptance, physical readiness, or host integration correctness.

## Isolated Command Forms

Two command scenarios run at both viewport sizes (4 more tests; **31 total**):

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

## Evidence

Each browser case writes to `output/playwright/att-1058/<class>/<test>/`:
`final.png`, `page.txt`, `aria.txt`, `requests.json`, `network.json`,
`page-errors.json`, `unexpected.json`, and `trace.zip`.
Screenshots disable animations. Failed Chromium launches are errors, never skips.
