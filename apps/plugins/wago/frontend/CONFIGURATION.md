# WAGO configuration

The controller list and commissioning completion link to `/wago/controllers/:controllerId/configuration`. The host authorizes the route with `resources.update`. The page renders the live front panel; `/wago/controllers/:controllerId/configuration/history` shows revisions, rollback and rejection details.

Channel and physical-point IDs remain stable through renaming and reassignment. Names and preset applications live in `presetProvenance` as `{ editor: { names, presets } }`. This metadata is stored with drafts and revisions but is excluded from controller payloads and content hashes. Unsupported hardware assignments remain intact.

If there is no saved draft, the latest applied revision is read through `configuration/baseline`. Opening the page never creates a draft.

Saving validates the complete candidate and sends the identity of the draft that was loaded: its timestamp, snapshot and provenance, or null when creating the first draft. The backend compares this identity inside the configuration lock before persisting, including metadata-only changes at the same timestamp. Older clients may omit the identity.

Review and publication are separate server steps after saving. A metadata-aware review hash binds confirmation to the saved draft. Flow-impact warnings require explicit acknowledgement; failed reference lookups and invalid configurations block publication. History polls every two seconds and distinguishes pending delivery, publication, controller acceptance and rejection. Rejection details use the rejected revision's names and snapshot. Rejection acknowledgement remains available in history.

Rollback previews retain source/current content hashes and a snapshot-and-metadata draft identity. A confirmed rollback publishes a new immutable revision and reconciles the saved draft, including delivery failures. Historical revisions remain unchanged. Operational guards are not certified electrical safety functions; an applied configuration is not physical I/O qualification.

Validation:

```sh
pnpm exec vitest run --config apps/plugins/wago/frontend/vitest.config.mts
pnpm exec jest --config apps/plugins/wago/jest.config.ts --runInBand
pnpm exec tsc -p apps/plugins/wago/frontend/tsconfig.json --noEmit
pnpm nx run plugin-wago:build
```

Backend tests check draft concurrency and applied-revision baselines. These tests do not qualify physical hardware.
