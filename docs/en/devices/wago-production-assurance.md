# WAGO production assurance preparation

This delivery prepares production assurance with bounded protocol handling,
repeatable software measurements and review procedures. It does not qualify a
physical controller or certify a safety function. CC100 **751-9301, FW31** is the
intended baseline. ATT-1057 baseline hardening, ATT-984 physical/operator acceptance
and ATT-973 product/safety boundaries remain separate requirements. A ticket marked
Done is not evidence that a device passed those requirements.

Commissioning is destructive. Attraccess does not preserve, back up or restore
preexisting CODESYS programs, retained PLC data, applications, workloads or host
settings. Recovery must never re-enable CODESYS. Pulses, guards, disconnect policies
and output feedback are operational controls, not certified emergency-stop or
personnel-protection circuits. Isolate hazardous energy before any exercise.

## Threat model

Assets include enrollment and permanent credentials, managed SSH keys, broker
permissions, signed runtime artifacts, accepted configurations, output state,
command identities, sequence checkpoints, encryption recovery material and audit
records. Trust begins with a verified controller SSH fingerprint, the supported
firmware identity, trusted artifact signing keys and verified MQTT/management TLS.
The host administrator, its encryption secret and the broker administrator are
privileged; namespace ACLs cannot protect against their compromise.

| Boundary and abuse | Existing controls and added bounds | Executable evidence | Residual risk or untested assumption |
| --- | --- | --- | --- |
| Enrollment: stolen temporary credentials, reused claim, permanent identity confused with discovery identity | Temporary lifetime, expiry, explicit destructive consent, claim ownership, separate operational identity and credential epoch; bounded claim bytes/strings/pending work | Runtime identity expiry/enrollment/rotation tests; assurance enrollment identity test | QR/SSH credentials and local commissioning workstation remain sensitive; physical recovery unrun |
| Broker: cross-controller read/write, wildcard escalation, retained-secret disclosure, active stolen session | Provider-owned queue and topic policies, distinct usernames/client IDs, enrollment namespace separation, revocation; management identity protected | Assurance security tests use two actual provisioned controller identities and a third enrollment identity, retained reads, anonymous CONNECT and active/new-session revocation | Broker-wide quotas, connection limits, network/firewall policy and vhost ownership belong to deployment; shared fixture credentials prove none of this |
| TLS: impersonated MQTT/management endpoint, private-CA failure, insecure override | Strict certificate validation, explicit private trust roots, DNS identity, management account separation | Real loopback MQTT and management TLS with trusted CA, missing trust, wrong name, rejected insecure management setting and denied controller management login | Expired/revoked production certificates, customer PKI renewal, real-controller trust and network interception require independent review |
| Protocol: huge/deep input, malformed JSON, wildcard IDs, unbounded queued work | Shared byte/string/collection/depth/node limits; synchronous admission before decoding or chaining state updates; fixed diagnostics | Boundary and runtime admission tests; real-broker malformed/oversized tests | Limits are application admission controls, not protection against broker/socket floods before application delivery |
| Configuration: modified snapshot, stale revision, invalid routing, partial save | Existing schema validation, hash comparison, revision ordering, atomic state save and output/configuration barriers; bounded traversal before hashing | Runtime configuration tests, assurance wrong-hash/stale configuration and recovery tests | Configuration hashes detect inconsistency; authenticity still depends on TLS, broker ACLs and the host administrator |
| Commands: replay, expiry while queued, duplicate actuation, unrelated packed-bit damage | Persisted command identities/expiry, expected revision, per-channel admission and output barriers; bounded ingress | Runtime commands and packed-register tests; assurance duplicate/expired/restart tests; ordinary production-fleet fixture | Delivery timeout means outcome may be unknown; acknowledgement is not physical feedback; command history with legacy unknown expiry cannot be evicted safely |
| Host/plugin: arbitrary workload, excess permissions, secret diagnostics, forged package | Plugin import isolation, managed operation ownership, signed/digest-checked updates, host gate before I/O, redacted diagnostics | Plugin/module-boundary tests, commissioning acceptance, signed-update and audit tests | Shared host compromise, supply chain, firmware kernel/container isolation and real SSH recovery require independent testing |
| Recovery: incomplete backup, stale state accepted as current, old identity survives replacement | Separate encrypted host state and controller storage; original encryption key; fresh authenticated operation after restore; explicit old-identity revocation | Assurance consistent SQLite/runtime/encrypted-secret restore, wrong-key rejection, replacement and outage tests | Software restoration does not demonstrate physical reboot, wiring, customer backup integrity or restoration of preexisting workloads |

## Message and work budgets

`shared/protocol-limits.ts` is bundled into the plugin and standalone runtime.
Protocol/configuration version and canonical hash format remain unchanged. Snapshot
validation on both sides reserves 1,024 envelope bytes within the configuration
limit, and the structure guard also bounds aggregate encoded string/key bytes
before canonical serialization.

| Limit | Value | Where enforced |
| --- | --- | --- |
| Claims, commands, credential updates | 8,192 bytes | Runtime admission before decoding/queueing; backend command acknowledgements |
| Operational packets and configuration reports | 262,144 bytes | Backend subscriptions, protocol parser, diagnostic/report entry points |
| Desired configuration envelope | 1,048,576 bytes | Runtime admission before decoding |
| String / object key | 4,096 / 128 UTF-16 code units | Shared structure guard before domain validation |
| Topic/configuration/command identifier | 1–128 code units | No whitespace, controls, slash, MQTT wildcards |
| Operational prefix | 512 code units | No empty segments or MQTT wildcards; ordinary MQTT prefix characters remain supported |
| Claim username | 255 code units | Preserves the provider username limit, including `wago-controller-` plus a 128-character hardware ID |
| Collection | 4,096 entries per array/object | Shared guard before costly traversal |
| Nesting / visited values | 16 / 65,536 | Shared guard; cycles rejected, ordinary shared references accepted |
| Runtime concurrent messages | 8 each for claims/configuration/credentials; 256 commands | Admission counts running and queued operations; excess is dropped synchronously |
| Plugin concurrent MQTT callbacks | 64 total | Admission before calling async handlers; synchronous consumers retain their own bounded queues |

Persistent replay history is limited to 4,096 distinct command identities. When
full, new commands receive `replay_history_full` before persistence or actuation;
unexpired and legacy unknown-expiry reservations are preserved. Capacity returns
only as known expiries pass. Configuration validation also reserves encoded-byte
room for observed/commanded output maps, manual output ownership IDs and an
8,192-byte state envelope, including up to 4,096 encoded bytes of readiness
errors. If those errors exceed the diagnostic budget, state carries a
`diagnostics_truncated` summary while retaining readiness and hardware-availability
flags calculated from every failure. Individual channel faults remain separate
publications. Accepted configurations can therefore report both healthy and
failure states within the shared operational limit, including commissioning
readiness.

Assurance reports count matching oversized runtime MQTT packets before listener
delivery. Each wire event increments `transportOversizedRejected` once, even when
several callbacks subscribe to its topic. The total includes retired transports
after runtime replacement. Parser, diagnostics and admission rejection counters
retain their separate counting boundaries.

`runtimeRejected` separately counts runtime JSON parsing, structural-limit and
validation/policy failures across commands, desired configuration, discovery and
credential rotation. Each rejected handler invocation increments one category,
including commands rejected with an acknowledgement. These fixed counters
saturate at the largest safe integer, contain no payloads or identifiers and are
returned as snapshots by `messageStatistics`. Assurance reports retain the counts
across runtime replacement. They are processing observations, not unique MQTT
packets; do not add them to backend parser/diagnostics observations to infer a
unique rejected-packet total. Transport and admission drops remain separate.

These are defensive software ceilings, not throughput recommendations. They cover
existing fixtures and a valid 4,096-point/4,096-channel boundary snapshot. The first
excessive string, byte, collection or depth is rejected. Excess traffic produces
bounded counters rather than secret-bearing payload diagnostics. Oversized or
admission-rejected commands may receive no acknowledgement; callers must treat a
timeout as uncertain and inspect fresh state before retrying. Existing output
queues, acknowledgement deadlines and stale-publication cleanup still apply.

The existing diagnostic cache separately retains at most 256 controllers and 256
channels per collection; a larger valid configuration does not enlarge that cache.

Do not configure at a ceiling just because validation accepts it. Physical terminal
counts and supported Modbus profiles remain unchanged. The measurement harness uses
two logical outputs per software controller; it cannot establish the rate of a
real CC100, Modbus device, host network or electrical assembly.

## Reproducible software measurements

Use Node 24+ and the repository's pinned pnpm. Explicitly select an isolated Docker
context. The runner owns a unique container, namespace, temporary database/state,
credentials and loopback-only ports. It rejects inherited fixture endpoints,
`DATABASE_URL` and `STORAGE_ROOT`; it never contacts an application broker. Cleanup
checks the container name, ID and owner labels, including partial startup. SIGINT
and SIGTERM terminate the test child and retain failed/interrupted lifecycle evidence.

```sh
WAGO_FLEET_DOCKER_CONTEXT=orbstack \
  node apps/plugins/wago/scripts/test-production-assurance.mjs

WAGO_FLEET_DOCKER_CONTEXT=orbstack WAGO_ASSURANCE_PROFILE=sustained \
  WAGO_ASSURANCE_OUTPUT=/absolute/path/outside/source/new-evidence-directory \
  node apps/plugins/wago/scripts/test-production-assurance.mjs
```

`production-assurance` is an uncached Nx target; `production-fleet` remains the
ordinary short integration regression. When using Nx with an application `.env`,
set `NX_LOAD_DOT_ENV_FILES=false` so that inherited application settings are not
silently supplied to an isolated runner. Pull-request CI runs the short profile
explicitly with cache disabled and a dedicated runner Docker context, disables
application environment loading and retains evidence even when the run fails.

| Input | Default and allowed range |
| --- | --- |
| `WAGO_ASSURANCE_PROFILE` | `ci` (16 seconds offered load), `sustained` (3,600 seconds minimum) |
| `WAGO_ASSURANCE_SECONDS` | 12–86,400 for CI; 3,600–86,400 for sustained |
| `WAGO_ASSURANCE_CONTROLLERS` | 2; 2–32 independently provisioned identities |
| `WAGO_ASSURANCE_RATE` | 4; 1–100 aggregate commands/second |
| `WAGO_ASSURANCE_SEED` | 988; 1–2,147,483,647, determines controller selection |
| `WAGO_ASSURANCE_FAULTS` | `runtime,plugin,broker`; ordered recovery exercises before load |
| `WAGO_ASSURANCE_MEMORY_MIB` | 1,024; 64–4,096 for sampled test-process RSS |
| `WAGO_ASSURANCE_MAX_PENDING` | 64; 1–256 offered commands in flight |
| `WAGO_ASSURANCE_BROKER_MEMORY_MIB` / `WAGO_ASSURANCE_BROKER_CPUS` | 1,024 MiB / 2 CPUs; 256–4,096 MiB / 1–8 CPUs; container PID ceiling 512 |
| `WAGO_ASSURANCE_OUTPUT` | New directory outside source; default unique `/tmp/wago-assurance-*` |

The runner increases load through quarter, half and full requested rate, then
repeats the highest passing stage. The configured full rate is a declared budget,
not an automatically discovered maximum. Raise it in bounded subsequent runs to
investigate a limiting condition. A budget or stage failure stays visible; only a
repeated passing stage can support a recommendation. A stage must generate at
least 99% of its scheduled offers and acknowledge at least 99% of its requested
rate over actual stage time, including drain. Reports record expected offers,
missed offers as generation failures, the 1% tolerance and achieved commands/second.
Matching operational packets count as received before decoding; protocol rejection
and diagnostics callback rejection are reported separately. Recovery exercises restart
runtime/plugin instances and stop/start the RabbitMQ application. They do not
restart the Docker host. Some Docker engines remap ephemeral ports on container
restart, so host/container reboot testing is a separate deployment exercise.

Reports record exact HEAD, dirty status, a hash including untracked implementation,
Node/runtime/plugin/protocol/broker/image versions, host resources, workload, seed,
fault recovery, offered/acknowledged/failed/timeout/discard/missing boundaries,
bounded latency windows, RSS, heap, event-loop delay and pending work. Implementation
changes during a run invalidate its evidence. Missing acknowledgement does not
establish whether a command executed. Counters from raw receipt, diagnostic
acceptance and command acknowledgement have different counting boundaries; compare
like with like. No credentials or raw payloads belong in reports.

The staged load uses plaintext MQTT and HTTP management on loopback. Separate
positive/negative cases verify MQTT and management TLS on the same owned broker;
the measured command rates do not establish TLS throughput. The workload invokes
production runtime/plugin processing in the test process. It does not boot the
controller entrypoint, perform sustained physical/Modbus polling or execute an
ARMv7 controller image.

The one-hour workload is continuous offered software load with stages; it is not
one hour of fault injection, physical operation or a penetration test. Delayed or
missing PUBACK/SUBACK recovery uses deterministic transport tests; replay,
malformed input and persistence failures also have separate acceptance tests.

Review `environment.json`, `broker.json`, `measurements.json`, `security.json`,
`traffic.json`, `recovery.json`, `rotation.json`, `upgrade-recovery.json`, `summary.txt` and `lifecycle.json` together.
`failure.json`, `source-drift.json`, a failed/interrupted lifecycle or incomplete
cleanup prevents using a recommendation. Keep reports outside the repository;
reference the reviewed evidence in delivery documentation. A short run never
substitutes for sustained evidence.

## Runtime rejection accounting validation

Commit `35d47a8d50239ba9eeef0d18f179d458c4d32864` adds fixed, payload-free
runtime rejection counts. The focused regression checks parsing, structure and
validation failures across all four incoming handlers while preserving accepted
configuration and outputs. The broker regression confirms counting, unchanged
stored state and outputs, retention across runtime replacement and successful
subsequent commands.

The short and sustained profiles each passed all 19 assurance tests with source
fingerprint `f4796062328e9f547eeff68c9c6da8681663396ad484ea619a440a8044bf9f3c`.
The sustained run used the clean commit above and acknowledged all 19,800 commands
over 3,600.005 seconds of offered workload. The 2, 4, 8 and repeated 8
commands/second stages passed without generation failures, command failures,
timeouts, overload discards or missing acknowledgements. Both profiles removed
their owned broker and temporary state. Reports are `review-fix-round4-ci` and
`review-fix-round4-sustained-8` in Factory run
`9ec4136d-070f-4f85-ab23-d75f9da50a64`; revision binding and check receipts are in
`review-fix-round4/fix-validation.json`.

Complete backend, frontend and runtime tests, relevant typechecking, lint,
formatting and builds passed. Simulator, fleet, commissioning backend and
headless desktop/mobile checks, audit hooks and runner checks also passed. The
initial environment/setup failures and interrupted combined test attempt remain
recorded separately. The existing optional packaged-release-image test remains
skipped without a selected release image. Earlier supplemental editor-label
failures were not changed or rerun. These results retain the two-controller
software-fixture envelope; physical qualification, real SSH recovery and
independent penetration and safety reviews remain outstanding.

## Fault-reporting correction validation on 2026-10-16

Commit `00ad42b164d708c6a2e80a8b0e1c908e6569e168` fixes polling change detection
when readiness diagnostics exceed the wire budget. Complete diagnostics now
contribute to a fixed-size local digest, so changed channel faults remain visible
while repeated unchanged polls still deduplicate. The 80-channel regression also
covers recovery, recurring faults and forced publication.

Both the short and sustained profiles passed all 18 assurance tests against this
clean implementation, with source fingerprint
`1a3e019f25dff941b9711b74c38ec180cea1b62e3b06fa04195b42b18dac85bb`.
Selected reports are `review-fix-round3-ci` and `review-fix-round3-sustained-8` in
Factory run `9ec4136d-070f-4f85-ab23-d75f9da50a64`; revision binding, full check
receipts and limitations are in `review-fix-round3/fix-validation.json`.
Both profiles removed their owned broker and temporary state.

The sustained run used the same two-controller software-fixture envelope and
resource budgets as the earlier run below. All 19,800 commands were acknowledged
over 3,600.006 seconds of offered workload, with no generation failures, command
failures, timeouts, overload discards or missing acknowledgements. The 2, 4, 8 and
repeated 8 commands/second stages each passed. Acknowledgement p99 was 16, 15, 13
and 13 ms respectively; peak process RSS was 333.0 MiB. These results establish
only the tested software-fixture envelope, not physical controller or sustained
Modbus capacity.

Complete uncached `plugin-wago` test, typecheck, lint and build targets passed,
including 79 backend suites (1,665 passing tests) and 25 frontend suites (277
passing tests). One existing optional Docker packaged-release-image test was
skipped because no release image was selected. All 391 runtime tests, runtime
typechecking and strict lint/formatting, runtime/simulator builds, eight simulator
checks, six fleet checks, commissioning backend and headless desktop/mobile
journeys, 22 audit-hook checks and 16 runner/checker tests also passed.
The earlier supplemental configuration-editor browser label failures below were
not rerun or fixed by this correction. Physical qualification, real SSH recovery
and independent penetration and safety reviews remain outstanding.

## Earlier software validation on 2026-10-16

The corrected implementation was frozen at commit `d185d82aaaede9972f5676528b9c99995a4fddda` for
sustained validation, with a clean working tree and source fingerprint
`986947b215c2bd9136fa499487487c55beef3bfefef04671f0f44ab96839d3ef`.
The selected reports are `review-fix-round2-ci` and
`review-fix-round2-sustained` in Factory run
`9ec4136d-070f-4f85-ab23-d75f9da50a64`. The short profile run before committing and the clean
sustained profile share that fingerprint. All 18 assurance tests passed
in each profile, and both removed their owned broker and temporary state. The
revision binding, affected regression receipts and limitations are retained in
`review-fix-round2/fix-validation.json`.

The sustained profile used seed `988`, two independently provisioned software
controllers, two logical outputs per controller, a two-CPU/1,024 MiB broker budget
and a 1,024 MiB process RSS budget. Its workload uses plaintext MQTT on loopback;
separate TLS checks do not establish TLS throughput.

| Offered aggregate commands/second | Repeated stage | Measured stage time | Acknowledged / offered | Command acknowledgement p99 |
| --- | --- | --- | --- | --- |
| 2 | no | 900.003 seconds | 1,800 / 1,800 | 15 ms |
| 4 | no | 900.001 seconds | 3,600 / 3,600 | 15 ms |
| 8 | no | 900.003 seconds | 7,200 / 7,200 | 15 ms |
| 8 | yes | 900.002 seconds | 7,200 / 7,200 | 16 ms |

The total offered workload lasted 3,600.009 seconds. All 19,800 commands were
acknowledged, with no generation failures, command failures, timeouts, overload
discards or missing acknowledgements. Peak process RSS was
313.0 MiB. Latency uses at most the last 4,096 acknowledgements per
stage. These observations support only the tested software-fixture envelope;
physical controller capacity, sustained Modbus operation and independent
penetration and safety reviews remain unverified.

Fresh affected regressions passed: 391 runtime tests, 211 backend configuration,
protocol and readiness tests, eight simulator checks, six fleet checks,
commissioning backend and desktop/mobile journeys, audit hooks, typechecks and the
runtime bundle build. The repository commit hook also passed. A supplemental
configuration-editor browser suite passed 29 of 31 tests; two review-panel display
label checks remain unresolved in unchanged frontend code. Those failures are
retained in `review-fix-round2/configuration-browser-limitation.json` and are not
claimed as passing QA.

## Historical software environment tested on 2026-10-15

The short and sustained assurance profiles and regression suites used this source
combination. These are software fixtures on a shared development host, not a
qualification of a released host version or the intended ARMv7 controller image.

| Component | Tested value |
| --- | --- |
| Host source baseline | `4f39f590d99992d4021d814ea7cca090032d1cee` plus the ATT-988 implementation |
| Implementation/source fingerprint | `d7505c88237a0bdcbe97772e775f54360e8960f9ef63961161b33638f985606a` |
| Plugin package metadata | `0.1.0-alpha.0` |
| Runtime source metadata | `0.2.6` |
| Wire protocol / configuration protocol | `1.0.0` / `1` |
| Test process | Node `v24.19.0`, Darwin `25.6.0`, ARM64; 8 logical CPUs, 16 GiB host RAM |
| Broker | `rabbitmq:4.3.4-management`; RabbitMQ `4.3.4` |
| Broker image identity | `sha256:eb5295d083325da5929a5ade766684d4019ffd2bce8bc7e43d6f9a05cafc8646` |
| Broker budget / test-process RSS budget | 2 CPUs and 1,024 MiB / 1,024 MiB |

The selected evidence uses the `wago-software-assurance-v1` environment record and
`wago-software-measurements-v1` measurement record. Compare the source fingerprint
before reusing measurements after publication or another code change. Reports
are retained outside source in Factory run `9ec4136d-070f-4f85-ab23-d75f9da50a64`;
use the selected evidence directories recorded in that run's validation summary.
Preliminary failed, interrupted or source-drifted runs are not operating-envelope
evidence.

The reports below predate the review fixes to replay admission, state budgets and
load acceptance. They remain historical observations at their recorded fingerprint
and do not qualify the corrected revision. Use the current revision-bound
validation above for the corrected software-fixture envelope.

### Historical observed software envelope

The selected reports are `assurance-short-1400` and `assurance-hour-1458` in that
Factory run. Both passed all nine security, traffic, recovery and measurement tests,
kept the same implementation fingerprint and removed their owned broker/state.
The sustained profile used seed `988`, two independently provisioned software
controller identities and two logical outputs per controller.

| Offered aggregate commands/second | Offered-load duration | Acknowledged / offered | Command acknowledgement p99 |
| --- | --- | --- | --- |
| 2 | 900 seconds | 1,800 / 1,800 | 20 ms |
| 4 | 900 seconds | 3,600 / 3,600 | 23 ms |
| 8 | 900 seconds | 7,200 / 7,200 | 25 ms |
| 8, repeated | 900 seconds | 7,200 / 7,200 | 22 ms |

The stages provided 3,600.012 seconds of offered load and 19,800 acknowledged
commands. Failures, timeouts, missing completions, overload discards, observed
sequence gaps, wire-admission rejections and stale-publication discards were zero.
Two duplicate diagnostic packets were rejected. The three additional published
commands in the report belong to the preceding recovery checks. Peak sampled
test-process RSS was 349 MiB, maximum in-flight offered work was one command, and
peak sampled event-loop p99 delay was 36.31 ms. Command p99 uses the last 4,096
acknowledgements per stage, or all acknowledgements when fewer were available.

Before load, runtime restart, plugin restart and RabbitMQ application stop/start
reached fresh authenticated operation in 23 ms, 6 ms and 2,026 ms respectively.
That boundary includes a fresh heartbeat, connected state, matching configuration,
an available software adapter and an acknowledged command. The broker MQTT
reconnection portion took 1,189 ms. These are individual software observations;
recovery-time guarantees and physical recovery remain unestablished.

This evidence supports a tested software budget of **two controller identities and
eight aggregate commands/second** in the documented setup. Eight commands/second
was exercised for thirty minutes across the last two stages. Higher rates, larger
fleets, TLS throughput and physical capacity remain unmeasured; this run did not
find an absolute capacity limit. Deployment limits require corresponding evidence
for the actual host, broker, TLS mode, controller and I/O workload.

The existing optional real-Docker image-import test is conditional on
`WAGO_DOCKER_TEST_IMAGE` and was not run. Source builds and artifact fixture tests
passed; a source build is not proof of an imported ARMv7 runtime image. Physical
FW31 commissioning, real SSH/power-loss/reboot recovery and independent reviews
remain outstanding.

## Independent penetration review procedure

The independent reviewer must use a fresh isolated environment and record their
identity, exact source/artifact revisions, fixture ownership, broker versions,
certificate fingerprints, test commands, expected/actual result, sanitized evidence
reference and unresolved findings. Never run these attacks on an occupied controller
or customer broker. Use distinct controller A, controller B, enrollment E and
management M identities, not a shared administrator login for every actor.

1. Run the short assurance target and inspect its ownership/cleanup reports. Confirm
   only loopback listener bindings and generated credentials are used. Stop if any
   supplied endpoint or credential belongs to an application.
2. Confirm allowed A telemetry and A desired-config subscription. As A, attempt B
   publication and subscription, own commands/config publication, wildcard and
   retained cross-namespace reads, and anonymous CONNECT. Require denial or absence
   of delivery to an authorized observer; a client callback alone is insufficient.
3. Revoke an active identity, then attempt both continued use and a new CONNECT.
   Exercise rotation retries, lower revisions, different epochs and restart using
   runtime identity tests and `credential-rotation-mqtt.spec.ts`. Verify the final
   acknowledgement comes from the authenticated new connection, not the old session.
4. Check MQTT and management TLS with the declared private CA. Repeat without it,
   with a wrong server name and with insecure management configuration. Require
   rejection; do not bypass trust to finish the exercise. Add expired/revoked-certificate
   and customer-root renewal cases in the independent environment.
5. Send each maximum valid message and first excessive byte/string/collection/depth.
   Send null, arrays, malformed JSON, ambiguous/wildcard IDs, hash mismatches, stale
   configuration, duplicate/out-of-order streams and expired commands. Block storage
   or acknowledgements while flooding ingress; verify bounded pending work, no
   unexpected actuation, no false readiness and no secret-bearing logs.
6. Inspect the packaged runtime and plugin, signing key trust, manifests/digests,
   least-privilege host profile and module boundaries. Independently test transfer,
   launch and readiness failures with the supported updater. Confirm operation
   ownership survives interruption and rollback does not re-enable CODESYS.
7. Stop clients and remove only the verified run-owned container, volumes and private
   temporary state. Retain sanitized failures and cleanup results. Never attach CA
   private keys, SSH keys, enrollment files, broker passwords or raw payloads.

Independent penetration review is **pending**. Automated negative tests are
preparation evidence, not independent approval.

## Independent safety-claim and compatibility review

A reviewer independent of implementation must inspect guides, package manifests,
FW31 profiles, presets, diagnostics, deployment prompts and support claims at the
same revision. Record each claim, evidence reference, hardware/firmware/transport,
reviewer disposition and unresolved consequence. Specifically check destructive
consent; permanent CODESYS disablement before I/O; pinned trust; narrow permissions;
operation ownership; no emergency-stop/personnel-protection claims; timeout/feedback
limitations; and no expansion of hardware or Modbus qualification from fixtures.

The official CNC emergency-stop circuit must remain electrically and functionally
unchanged. Attraccess must never acknowledge, reset, bridge or bypass that circuit.
A separate operational input labelled “E-stop” by the manufacturer does not change
this prohibition. Before using such an input, require an independent reviewer to
record the manufacturer wiring reference and observed separation from the official
safety circuit, and confirm that operating the input cannot reset or bypass it.
Record an explicit pass/fail observation; missing evidence blocks use of the input.

This review is **pending**. Publish qualified combinations only through the normal
release pipeline after the applicable review and physical/operator evidence. The
canceled ATT-985 is historical context, not a current release approval or a reason
to treat missing qualification as complete.

## Support boundaries and escalation

Support covers the combinations actually demonstrated in revision-bound software
reports and, separately, the combinations qualified by reviewed physical evidence.
No fixed response-time, maintenance-period or availability guarantee is made here.
See [FW31 boundaries](wago-fw31-support.md), [physical acceptance](wago-acceptance-evidence.md)
and [recovery procedures](wago-recovery.md).

For escalation provide non-secret revision/image IDs, exact model/firmware,
broker and TLS mode, namespace shape without credentials, sanitized validation
codes, sequence/freshness symptoms, last known matching revision, recovery attempt
and outcome, and reviewed evidence references. Stop actuation when freshness,
identity, host gate or output state is uncertain. Obtain fresh authenticated state
and permitted physical confirmation before resuming a dependent flow.
