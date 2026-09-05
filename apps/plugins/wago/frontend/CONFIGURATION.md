# Visual configuration integration

The digital editor uses the existing version 1 snapshot contract. Onboard `751-9301` physical channels 0–3 map to DO1–DO4; 4–11 map to DI1–DI8, as confirmed by ATT-1056. Terminal choices enforce direction, exclusive assignment, and capacity. External hardware points and metered configurations remain intact but are not editable through the digital controls. New metered presets remain hidden until the ATT-979/1059 editor is integrated.

Channel and physical-point IDs are generated once and retained during renaming, reassignment and preset copying. User names and selected preset applications live in `presetProvenance` as `{ editor: { names, presets } }`. Explicit saving persists this envelope on the draft; publishing copies it to the immutable revision, and rollback restores it. Migration `1780010580000` adds nullable revision provenance without altering existing history. Rolling back older revisions without metadata clears names and provenance instead of inheriting newer preset history. This editor-only envelope is not included in controller content hashes or messages.

Preset preview accepts an optional local `snapshot`. Copying selected changes with a local snapshot returns a serialized snapshot without writing the draft or publishing. The UI always supplies that snapshot. Existing clients that omit it retain the saved-draft apply behavior. Explicit Save draft persists both snapshot and editor metadata. Validation runs before the UI save; backend publication also validates direction, references, and capability settings.

Publication sends a metadata-aware review identity so another editor cannot replace its review unnoticed. Rollback sends the previewed source and current content hashes plus a draft identity covering snapshot and metadata, and publishes a new revision; stale confirmation is rejected before draft mutation. Flow-impact acknowledgement never bypasses validation. Review, rollback preview and publication query saved WAGO flow nodes, including unchanged commands pinned to a revision and commands dependent on reassigned guard/feedback inputs. Lookup failure fails closed rather than claiming that no flows are affected. Impact warnings require explicit confirmation before force-publishing. Failed rollback attempts refresh the persisted draft before editing can resume.

Revision history polls every two seconds. Reported rejection fields use the rejected revision's snapshot for readable channel/field labels. An applied revision is configuration acceptance only. Hardware readiness stays explicitly unknown until ATT-981's `ControllerDiagnostics` / `WagoStatus` and verified producer evidence are integrated; do not introduce a second readiness model.

ATT-983 audit integration remains necessary: capture preset before/after counts and provenance inside the configuration lock, and connect forced-publication and rejection-acknowledgement hooks. Editor metadata alone is not durable audit evidence. ATT-979/1059 retains ownership of Modbus model, transport, and profile fields; compose that editor into the same local snapshot/save lifecycle after its contract lands.

Local checks:

```sh
pnpm exec jest --config apps/plugins/wago/jest.config.ts --runInBand
pnpm exec vitest run --config apps/plugins/wago/frontend/vitest.config.mts
NX_DAEMON=false NX_SKIP_REMOTE_CACHE=true pnpm exec nx build plugin-wago
```

The Vitest workflow mounts real HeroUI controls, mocks the plugin API, and rejects unexpected network calls. It runs as a dependency of the plugin test target and covers explicit save, pending-preset/save exclusion, and publication locking. Terminal and service tests cover all terminal indices, direction/capacity/collision checks, reference validation, selective copying, stale hashes, and immutable rollback. See `tests/README.md` for desktop/mobile Chromium tests and their fixture boundaries. None of these checks establish hardware qualification.
