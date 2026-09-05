# ATT-1058 Fixture-Only Browser Tests

Run from the worktree root:

```sh
PYTHON=/opt/homebrew/opt/python@3.14/bin/python3.14 \
  bash apps/plugins/wago/frontend/tests/run_browser_tests.sh
```

Use any Python interpreter with Playwright and its Chromium browser installed.
The wrapper builds the current production configuration editor into
`output/playwright/att-1058/harness` and runs only `test_configuration_browser.py`.
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

Nine browser scenarios run at 1440x1000 desktop and 390x844 touch/mobile:

1. First input/output setup, names, physical assignments, save and reload.
2. Selected preset preview/copy and custom pulse duration without implicit save/publish.
3. Explicit save, review, publish and simulated applied report.
4. Simulated rejected report with readable channel labels.
5. Rollback as a new revision, preserving history and requiring impact acknowledgement.
6. Readable review labels, no JSON editor/internal paths, and dialog viewport bounds.
7. Removing the first of two channels shows only the removed stable identity in review.
8. A metadata-only draft change after rollback preview rejects confirmation without overwriting the draft.
9. Embedded diagnostics refresh failure hides cached online status, recovers, and preserves unsaved edits without saving or publishing; the panel fits both viewports.

Together with isolation, rollback-identity, and metadata-aware review contract tests,
the runner executes 21 tests. Rollback requests must carry the previewed draft
identity; review identities include metadata and remain separate from content hashes. All editor
interactions use browser clicks, typed fields, and checkboxes, not React state
manipulation. Screenshots are evidence, not pixel-diff baselines. Fixture validation,
publication and persistence do not establish backend validation, server durability,
real controller acceptance, physical readiness, or host integration correctness.

## Evidence

Each browser case writes to `output/playwright/att-1058/<class>/<test>/`:
`final.png`, `page.txt`, `aria.txt`, `requests.json`, `network.json`,
`page-errors.json`, `unexpected.json`, and `trace.zip`.
Screenshots disable animations. Failed Chromium launches are errors, never skips.
