# WAGO Acceptance Evidence

**Release blocked until reviewed physical and participant evidence exists.** This guide supports ATT-984 and ATT-985; it is not a supported-beta announcement. Passing automated tests, a connected controller or a complete evidence form does not demonstrate the operator journey.

## Before Any Hardware Session

Use a CC100 `751-9301`, firmware `31`, safe low-voltage fixtures and qualified wiring where required. Keep emergency-stop and personnel-protection circuits independent. Operational guards, disconnect policies and acknowledgements are not safety-rated functions.

Record the starting controller state and confirm a recoverable backup before changing credentials or installation. A backup of the Attraccess server alone does **not** include device-side permanent MQTT credentials, SSH access or runtime state. If the controller is unavailable or its credentials remain unbacked, record that blocker and do not proceed with destructive recovery or call acceptance complete. Never attach credential files, raw broker payloads, full configuration dumps or unreviewed logs to tickets.

## Observe the Actual Journey

A nontechnical or lightly technical participant other than the implementer must perform the journey. Record obstacles, failed attempts and any developer intervention rather than correcting them silently. A terminal, JSON editor, API client or manual secret-copy step is a failure of the required no-code journey, even if an engineer can make the hardware work afterwards.

Use only controls present in the exact tested build. The existing [commissioning walkthrough](wago-cc100-commissioning.md) documents its source baseline; its limitations must be reconciled after integrating commissioning, visual configuration, diagnostics and hardware changes. Do not use screenshots or instructions for unmerged or absent screens as acceptance evidence.

For each required check, record the observed behavior and link a timestamped recording, screenshot, test report or reviewer-approved artifact. Include both desktop and mobile. Explain how the selected input, output and physical Modbus measurement were independently observed. An output acknowledgement alone is not physical feedback.

## Required Evidence

The offline completeness checker exports the authoritative list as `requiredChecks` in `scripts/check-wago-acceptance.mjs`. It includes commissioning/hardening, permanent enrollment/revocation, visual digital I/O and Modbus, configuration readiness, first flow with acknowledgement, packed-bit independence and concurrent outputs, restart/reboot, rejection/rollback, expired/duplicate commands, operational policies/guards, interrupted commissioning and credential recovery, re-enrollment, Modbus failure and stale waits, desktop/mobile, shared conformance, and audit redaction.

Retain one JSON evidence record outside the source tree with these fields:

| Field | Required content |
| --- | --- |
| `schemaVersion` | `1` |
| `environment` | `physical`; simulator-only evidence is rejected |
| `controller` | `model: "751-9301"`, `firmware: "31"`, `hardwareId`, `startingState`, `wiringEvidence` |
| `build` | Full 40-character `pluginCommit` and `runtimeCommit`; `frontendDigest`, `backendDigest`, `runtimeDigest` in `sha256:<64 hex>` form; `protocolVersion`, `signedBundleEvidence`, `visualArtifactProvisioningEvidence` |
| `modbus` | Actual `model`, `transport`, `profileVersion`, `qualificationEvidence`; do not substitute an unqualified reference assembly |
| `participant` | Non-secret participant `id` and `experience` (`nontechnical` or `lightly-technical`) |
| `implementerId` | Distinct from participant |
| `noCodeJourney` | `true` only if the entire required journey needed no terminal/code/JSON/API/manual secrets |
| `developerIntervention` | `false` for acceptance |
| `safeFixtureConfirmed` | `true` after the fixture and safety boundary are verified |
| `obstacles` | Array of observed participant obstacles, including an explicit empty array if none |
| `blockers` | Array; must be explicitly empty before completeness passes |
| `checks` | One entry per exported check ID with `id`, `result`, `observed`, `evidenceRef`, `recordedAt` |

`result` must be `pass` for every required check. Use `fail` or `not-run` honestly for unfinished work; the checker exits unsuccessfully. `evidenceRef` is a reference to reviewable evidence, not a credential or raw payload. References are not fetched or authenticated by the checker. The file should remain small and contain summaries, not recordings or telemetry.

Release engineers, not the operator participant, can run the offline check:

```sh
node --test scripts/check-wago-acceptance.test.mjs
node scripts/check-wago-acceptance.mjs /path/to/reviewed-evidence.json
```

The checker never connects to hardware, changes Linear, signs artifacts or publishes anything. Its tests use synthetic fixtures and are not ATT-984 hardware evidence. A successful result means required fields are present, **not** that the observations are true or the release is authorized. A human reviewer must inspect every linked artifact, verify matching builds and resolve participant obstacles before approving the gate.

## Publication Boundary

ATT-985 remains blocked by physical/nontechnical acceptance and ATT-983 audit coverage. Attach the reviewed evidence to those tickets. Publish only the device/profile/transport combinations actually qualified, compatible frontend/backend and signed ARMv7 runtime artifacts, and documentation checked against the tested screens. Normal operator installation must provide the runtime bundle through packaging or visual import, not server environment variables or shell/file-path instructions.

Broader four-assembly qualification, billing, telemetry history and arbitration are deferred. They must not be advertised as proven capabilities of this first slice.
