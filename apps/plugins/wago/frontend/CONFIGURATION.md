# WAGO configuration workspace

The controller list and commissioning completion link to `/wago/controllers/:controllerId/configuration`. The host authorizes the route with `resources.update`. `ConfigurationEditor` owns the working draft; the route wrapper owns navigation.

Channels use a list and a CC100 terminal map backed by the same snapshot. Only the selected channel is edited. Guided creation collects purpose, terminal, name and behavior before adding anything to the working draft. Optional wiring labels, conditions, feedback and ranges are disclosed separately. External devices have separate connection, device and profile views; register details expand per measurement or action. Built-in profiles remain read-only and explicitly unqualified.

Form sections use the page background so HeroUI's filled inputs remain distinguishable from their surroundings. Cards are reserved for informational content.

Channel and physical-point IDs remain stable through renaming, reassignment and preset application. Names and preset applications live in `presetProvenance` as `{ editor: { names, presets } }`. This metadata is stored with drafts and revisions but is excluded from controller payloads and content hashes. Unsupported hardware assignments remain intact.

If there is no saved draft, the editor reads the latest applied revision through `configuration/baseline`. Opening the page never creates a draft. Local edits survive section changes and route unmounts in the current query-client session. Browser unload prompts protect unsaved edits; the workspace back button offers explicit discard confirmation. A refreshed remote draft never overwrites dirty local edits.

Saving validates the complete candidate and sends the identity of the draft that was loaded: its timestamp, snapshot and provenance, or null when creating the first draft. The backend compares this identity inside the configuration lock before persisting, including metadata-only changes at the same timestamp. Older clients may omit the identity. Preset preview and selective copying always receive the local snapshot and have no save or publication side effects.

Review and publication are separate from editing. A metadata-aware review hash binds confirmation to the saved draft. Flow-impact warnings require explicit acknowledgement; failed reference lookups and invalid configurations block publication. History polls every two seconds and distinguishes pending delivery, publication, controller acceptance and rejection. Rejection details use the rejected revision's names and snapshot. Rejection acknowledgement remains available in history.

Rollback previews retain source/current content hashes and a snapshot-and-metadata draft identity. A confirmed rollback publishes a new immutable revision and reconciles the saved draft before editing resumes, including delivery failures. Historical revisions remain unchanged. Operational guards are not certified electrical safety functions; an applied configuration is not physical I/O qualification. The diagnostics section uses the shared polling and freshness model.

The accepted disposable prototype is archived on local branch `prototype/wago-configuration-20260910`; production code has no prototype entry point or sample data.

Validation:

```sh
pnpm exec vitest run --config apps/plugins/wago/frontend/vitest.config.mts
pnpm exec jest --config apps/plugins/wago/jest.config.ts --runInBand
pnpm exec tsc -p apps/plugins/wago/frontend/tsconfig.json --noEmit
pnpm nx run plugin-wago:build
bash apps/plugins/wago/frontend/tests/run_browser_tests.sh
```

Browser tests exercise the production editor in desktop and mobile Chromium with isolated HTTP fixtures. They check explicit save, preset copying, publication, rejection, immutable rollback, Modbus rebinding and register validation, diagnostics recovery, and horizontal overflow. Backend tests check draft concurrency and applied-revision baselines. These tests do not qualify physical hardware.
