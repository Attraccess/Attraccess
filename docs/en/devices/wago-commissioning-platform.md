# CC100 commissioning platform software

As of **2026-09-06**, commissioning is destructive. Existing applications and
workloads may stop working or be erased. Attraccess does not preserve, back up,
or restore preexisting CODESYS applications, retained PLC data, other workloads,
or their host settings. The [earlier preservation decision and vendor-source
findings](wago-fw31-support.md) remain history. Tests use temporary files and fake
device transports; **no physical I/O, firmware-reboot or management-hardening
acceptance is claimed**. ATT-984 remains a release gate.

## Guided delivery

The existing delivery request carries `confirmInstall: true` and fresh temporary
SSH credentials. One consequence confirmation authorizes destructive preparation;
there is no separate workload-preservation, Docker or mandatory WBM gate.

Delivery validates the pinned SSH identity, signed offline runtime and broker
requirements, then prepares the controller under its operation lock:

1. Verify the CC100 `751-9301` FW31 identity, required firmware-installed tools
   and expected vendor getter results.
   Read `/etc/os-release` as text; reject duplicate/conflicting fields.
   BSP `VERSION_ID="2024.12.0"` alone is insufficient.
2. Always stop and permanently disable CODESYS, including an active PLC or a
   stopped PLC enabled at boot. Verify process and boot state before granting I/O.
   Failure stops commissioning before enrollment or runtime launch.
3. Prepare the firmware-installed vendor Docker runtime and activate it as needed.
   Do not pull a replacement engine or image from an external registry.
   Unsupported packages, missing tools and ambiguous service states fail closed.
4. Establish persistent access limited to the required digital registers and
   recheck output ownership and runtime-account permissions.
5. Complete restricted enrollment and locked signed runtime delivery, then wait
   for permanent discovery and independent readiness verification.

`codesysState=disabled` is recorded only after successful verified preparation.
Preparation failures produce `delivery_failed`; credentials and consent are not
reused. Retry requires fresh credentials and destructive-install approval.
Inspecting prerequisites remains read-only and optional; saved reports never
authorize preparation without the current request and its server-side checks.

The current path requires local Docker client/daemon binaries and the firmware's
Docker/runtime tools. An `install-vendor-runtime` report selects the vendor
`config_docker install` command; in the captured FW31 implementation this only
checks activation state and downloads or extracts nothing. Its install-status
getter is not a binary/version inventory. Absent binaries/tools remain unsupported.
A running, boot-enabled Docker daemon is not unconditionally deactivated or
reinstalled. Before vendor install/activation, preparation independently checks
the boot medium and rejects an empty result or `sd-card`. It verifies that the
executable `S99_docker` resolves to `/etc/init.d/dockerd`, the activation getter
returns `active`, and the daemon reports Docker `25.0.4`.
See the [exact-source findings](wago-fw31-support.md#exact-extension-source-and-captured-fw31-evidence)
for captured behavior and the remaining dependency-provenance limits.

## Hardware and reboot boundary

The installer follows the [runtime hardware contract](../../../apps/plugins/wago/cc100-runtime/HARDWARE.md)
and deploys with:

```text
--user 10001:10001 --cap-drop ALL --security-opt no-new-privileges
--network host --restart no
--env WAGO_HARDWARE_PROFILE=cc100-751-9301-fw31-digital-v1
--mount type=bind,src=/sys/devices/platform/soc/44009000.spi/spi_master/spi0/spi0.0/din,dst=/run/attraccess-wago/io/din,readonly
--mount type=bind,src=/sys/kernel/dout_drv/DOUT_DATA,dst=/run/attraccess-wago/io/dout
```

Both sources must exist as the expected regular files, not substitute directories
or final-component symlinks. No root fallback, privileged mode, broad `/sys`,
`/dev`, host-root or Docker-socket mount is permitted. The protected runtime
state directory and separate read-only private CA mount retain their TLS contract.

The persistent boot hook `/etc/rc.d/S99_zz_attraccess_wago start` verifies CODESYS
disablement, ownership and narrow register access before starting Attraccess.
Docker's restart policy is `no`. A root-owned host supervisor permits at most five
crash restarts per supervisor run, repeating the complete host gate before each
start. It also checks the running writer on each cycle, with a two-second pause
between cycles. Observation errors, conflicts and retry exhaustion disable runtime
enablement and attempt bounded containment. Failed or unverifiable stopping remains
a failure requiring recovery; it is never reported as successful containment.
Startup also requires a bounded acknowledgement from a supervisor holding its
own lock; launching a background process alone is not a successful start receipt.

A Docker-daemon restart does not itself start the container. While runtime
enablement remains present, the supervisor or checked hook can resume it through
the full gate and within its limits. A failed observation during a daemon outage
can instead latch containment by removing `/etc/attraccess-wago/runtime-enabled`.
After that latch, neither hook startup nor controller reboot re-enables the runtime.
Hook `start` currently exits `0` without starting when enablement is absent; this
is a disabled no-op, not a successful runtime start.

Resolve the cause and use the existing
[wizard cleanup/recommissioning route](wago-cc100-commissioning.md#recover-after-latched-containment).
For current guided sessions, the UI exposes cleanup only with retained runtime
ownership; `/recover` reconciles its tokened journal and credentials. An unclaimed
session can then retry delivery, while a claimed session requires registration
removal and a new session. Only a fresh approved installation recreates enablement.
There is no re-enable button or marker-edit step. Missing ownership or failed
cleanup remains a blocker. Boot ordering and fixture success do not establish
physical reboot behavior. The
[2026-09-06 security supersession](wago-fw31-support.md#security-follow-up-on-2026-09-06)
records the replaced intermediate restart policy.

Preflight verifies permissions as UID/GID 10001, without supplementary groups or
capabilities, using compatible privilege tooling and no-new-privileges. It tests
DIN read and DOUT read/write access without writing register test values.
Missing tooling, missing registers and unverifiable permissions fail closed.
Persistent software setup still requires physical reboot validation.

Preparation explicitly stops both vendor runtime selections before forcing
selection `0`. It verifies absent PLC processes, a regular `rtsversion` containing
exactly `0`, absent `S98_runtime`, and no other enabled boot entry resolving to a
known PLC/runtime executable. The checks repeat after a persistence flush and
before runtime starts.

Output ownership inspection checks CODESYS processes/boot state and all containers,
including stopped containers. Exact output-file, ancestor-directory and canonical
symlink-alias mounts and other privileged containers conflict. Only the exact
`attraccess-wago` predecessor is excluded because the locked installer controls
its replacement. Before granting permissions, that predecessor must be verified
stopped with restart disabled.

The host guard rejects host account/group use of UID/GID 10001, unrelated processes
using that numeric identity, unverified user-namespace mappings and open writable
DOUT descriptors, including paths aliasing the same device/inode. An owned runtime
process is exempt only after full Docker ID, namespace mapping and cgroup checks.
Unknown or failed observations block startup. These are repeated observations,
not protection against every privileged host writer racing a check; exclusive
ownership remains an operating and physical-qualification requirement.

Configuration directories and locks must have the expected root ownership,
restrictive permissions and file types. Boot publication uses a unique regular
staging file in the validated boot directory. Unsafe existing paths are rejected.

Docker commands select the controller's local Unix endpoint and discard inherited
remote-context settings. They never target the developer machine's daemon.

## Reports, cleanup and security

The version-1 report contains exactly eight newline-terminated fields:

```text
version=1
platform=supported
hardware=accessible
exclusivity=clear
docker=running
configDocker=present
provision=none
qualification=required
```

Current provisioning states include `prepare-controller` and
`install-vendor-runtime`. Supported preparation can resolve `codesys-active`,
`codesys-boot-enabled` and `uid10001-access-denied`; these observations are not
unconditional UI blockers. Unsupported firmware/components, missing registers,
unknown ownership and independent output writers remain blockers.
Historical `qualification=required` reports and old provisioning states remain
readable. `software-supported` means the report found a preparation path through
the expected vendor tools/getters; it is not a byte/build attestation of the
entire FW31 dependency set or physical qualification. An already running daemon
with no preparation path can still report `qualification=required`, as above.
Incomplete or unknown report fields are not an empty workload.

The platform activation endpoint retains the existing
`reviewedDockerActivation: true` contract for explicitly reviewed destructive
preparation. The guided UI uses the single delivery action. Server-issued
ownership tokens and preparation states are persisted before remote mutation;
timeouts remain indeterminate until explicit reconciliation. Clients do not
supply scripts, internal tokens or trusted inspection reports.

**Clean up failed installation** uses the existing recovery endpoint with fresh
SSH credentials and explicit cleanup approval. It reconciles the runtime
installation, credentials and preparation journal. **Clean up controller
preparation** handles preparation-only failures; runtime cleanup takes precedence
when runtime installation began. Neither action restores preexisting PLC programs,
workloads, data or Docker host settings, nor re-enables CODESYS. Foreign or
inconsistent integrity records remain errors. A delivery token saved before
upload can reconcile a missing runtime journal through matching destructive
preparation ownership. Preparation failures before remote journal publication
have an explicit cleanup path; durable tokened receipts make lost-response and
coordinator-save retries repeatable. The absence of a journal is not a claim that
previous workloads were restored. Legacy journals retain integrity checks.
For a journaled installation, cleanup verifies restart is disabled and the owned
container is stopped or absent before recording success. Runtime removal also
verifies absence afterward. A missing/unreachable daemon or failed Docker query
is not proof of a stopped writer; the error and recovery ownership are retained.

Pinned SSH, signed artifacts, TLS and enrollment revocation remain enforced.
Management-key enrollment and **Recover saved access** retain their separate
security/recovery contract. Full management hardening remains unsupported where
its vendor dependency and lockout-safe recovery requirements are unmet; that
status does not make supported Docker/I/O preparation unavailable.

Container start, cleanup or `codesysState=disabled` alone is not completion.
Require a fresh permanent heartbeat, enrollment revocation, matching applied
configuration and current runtime `state.readiness`. Physical qualification and
the remaining management baseline must be shown accurately.

## Source evidence and decision history

WAGO's [direct I/O guide](https://github.com/WAGO/cc100-howtos/blob/main/HowTo_Access_Onboard_IO/README.md)
documents the exact registers, packed decimal access and least-significant bit
mapping. The official [CC100 firmware SDK](https://github.com/WAGO/cc100-firmware-sdk/tree/b2a09cc66ad07af54a34701d6cfc90f31aca5cd0)
provides the vendor Docker, runtime and boot contracts inspected during the
original review. That revision is FW30-V04.08.09, not blanket FW31 evidence.
The later exact-source audit separately inspected hashed, captured FW31 Docker,
runtime and boot files. Its findings supersede assumptions about archive extraction
from the older SDK variants; the current [support ledger](wago-fw31-support.md#exact-extension-source-and-captured-fw31-evidence)
records the capture provenance and distinguishes it from the unofficial extension.

Vendor activation can change boot links, routing, firewall and storage; the
vendor deactivate/remove actions are not general inverses. The destructive
product decision removes the obligation to restore old workloads/settings. It
does not remove component compatibility checks, durable operation ownership,
postcondition verification, minimum I/O privileges or physical acceptance.
The [FW31 support record](wago-fw31-support.md) preserves the original findings
and explicitly identifies their supersession.
