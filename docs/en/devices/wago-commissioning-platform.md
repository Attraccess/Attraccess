# CC100 commissioning platform software

This implements the digital deployment contract introduced in `eafdbe04`,
reviewed against `origin/att-1056-digital-io` at `f3248534`: `HARDWARE.md`,
`manifest.json`, and `src/onboard-profile.ts`. Tests use temporary register files
and fake Docker/service commands. **No hardware, relay, broker, firmware-reboot,
or persistent-permission qualification is claimed.** ATT-984 remains a release gate.

## Hardware deployment

The installer requires an exact CC100 platform field and firmware 31 release
identity. `VERSION_ID="2024.12.0"` alone is insufficient; a matching release
`VERSION` must also be present. It reads `/etc/os-release` as text, rejects duplicate
or conflicting version fields and never sources it. See [FW31 support boundaries](wago-fw31-support.md).

Every new container receives:

```text
--user 10001:10001 --cap-drop ALL --security-opt no-new-privileges
--env WAGO_HARDWARE_PROFILE=cc100-751-9301-fw31-digital-v1
--mount type=bind,src=/sys/devices/platform/soc/44009000.spi/spi_master/spi0/spi0.0/din,dst=/run/attraccess-wago/io/din,readonly
--mount type=bind,src=/sys/kernel/dout_drv/DOUT_DATA,dst=/run/attraccess-wago/io/dout
```

The second bind is read/write by Docker default. Both sources must be existing
regular files, not directories or final-component symlinks. `--mount` deliberately
omits `bind-create-src`: Docker fails on missing sources rather than making
directories. No root fallback, privileged mode, extra device access, broad host
mount, or socket mount is emitted. The existing state-volume, nested CA mount,
environment staging, delivery token, flock, snapshot, recovery receipt and
acceptance flow are retained.

Read-only preflight detects util-linux `setpriv` and verifies that it can run with
UID/GID 10001, no supplementary groups, an empty capability bounding/inheritable/
ambient set, and no-new-privileges. In that context, shell `test -r` checks DIN;
`test -r` and `test -w` check DOUT. No register is opened for writing and no test
value is written. Missing or incompatible privilege tooling produces
`permission-tool-unavailable`; denied access produces `uid10001-access-denied`.
Host path traversal checks can be stricter than access through the container
mount. There is no permissive fallback or automatic chmod/chown/ACL change to
hardware. Qualify the firmware-specific persistent method for granting only DIN
read and DOUT read/write access to UID 10001, including after reboot.

Preflight enumerates CODESYS process names and all containers, including stopped
containers, and inspects their bind sources. Exact output-file, ancestor-directory,
and canonical symlink-alias binds conflict. Only the exact `attraccess-wago`
predecessor is excluded because the locked installer stops it before replacement.
Query failures fail the check. `clear` means these observations found no competing
owner; it cannot prove absence of a direct host register writer or prevent an
external administrator racing the operation. Exclusive ownership remains a
qualification and operating requirement. Recheck retained `state.readiness` after
deployment; configuration acceptance alone does not prove usable hardware.

Docker CLI calls explicitly select the local Unix endpoint and discard inherited
remote-context environment variables. These are generated remote scripts, never
instructions to use a developer machine's Docker daemon.

## Docker inspection and reviewed provisioning

The report distinguishes a working daemon, an installed but stopped runtime,
missing vendor binaries, and ambiguous/unsupported tool state. It independently
reports whether `/etc/config-tools/config_docker` exists and is executable.
Presence of that tool is not evidence of a safe firmware-specific transition.

The former `start-installed-runtime` action is disabled. Actual WAGO source
implements start/stop/restart, without the previously assumed LSB stopped status.
Start changes a Docker network namespace; stop invokes every networking event.
A daemon-only journal cannot restore this operation. Inspection therefore does
not invoke any init action; an unavailable installed daemon reports
`unsupported-lifecycle-dependencies`. A normal vendor `daemon.json` is not a
reason by itself to classify binaries as missing.

Existing tokened journals are retained. Any `start-intent` or `started` marker
blocks recovery acknowledgement and journal deletion, including old `restored`
receipts and interrupted cleanup. A failed vendor start can leave namespace effects
while the daemon is absent. Missing journals also leave recovery unresolved. No vendor
stop is called. Only a prepared journal without either start marker can be reconciled
after stopped-state, firmware/service context and token checks. The base implementation
never wrote historical snapshots: current context for a prepared legacy journal is
recorded separately in `reconciliation/`. Missing only one modern snapshot is
corruption, not a legacy journal. The `accepted` helper has no production caller
and cannot provide product closure for existing activations.

## Source evidence

The actual official SDK scripts, build rules, bundled Dropbear/kernel source and
compiled config-tool source were inspected at WAGO commit
`b2a09cc66ad07af54a34701d6cfc90f31aca5cd0` (FW30-V04.08.09). A byte-identical MPL
init fixture executes with external effects stubbed in the test suite. FW30 is
not assumed compatible with FW31. [FW31 support boundaries](wago-fw31-support.md)
records each documented operation, non-inverse side effects, dependency blockers
and minimal read-only captures. Hardware proof remains separate from these code
and source-identity requirements.

## Parent service integration contract

All new exports are from `apps/plugins/wago/backend/wago-hardware-deployment.ts`:

| Export                                                           | Use                                                                                        |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `wagoHardwareDeploymentReportScript(testRoot = '')`              | Read-only inspection over pinned SSH; require exit 0.                                      |
| `parseWagoHardwareDeploymentReport(output)`                      | Strict version-1 parser; rejects incomplete, duplicate or unknown fields.                  |
| `WagoHardwareDeploymentReport`                                   | Typed report contract below.                                                               |
| `WAGO_DOCKER_PROVISION_REVIEW_FLAG`                              | Literal `reviewedDockerActivation`.                                                        |
| `WagoDockerProvisionReview`                                      | `{ reviewedDockerActivation: boolean, action: 'start-installed-runtime', token: string }`. |
| `wagoDockerProvisionScript(review, testRoot = '')`               | Legacy signature; refuses activation with the source dependency blocker.                   |
| `wagoDockerProvisionRecoveryScript(token, testRoot = '')`        | Acknowledge an already stopped daemon; retain unresolved legacy journals.                   |
| `wagoDockerProvisionFinishScript(token, outcome, testRoot = '')` | Acknowledge a verified prepared journal; start effects block deletion. `accepted` has no production caller. |
| `wagoHardwareDeploymentPreflightScript(testRoot = '')`           | Read-only fail-closed install prerequisites. Already embedded in installer.                |
| `wagoHardwareDeploymentDockerArgs(testRoot = '')`                | Fixed hardware arguments. Already embedded in installer.                                   |

`testRoot` exists solely for local isolated fixtures. Production must omit it.
All existing runtime installer exports retain their signatures. Use the same
server-issued token for provisioning and delivery; the installer rejects a foreign
or incomplete provisioning journal. Do not accept client-authored scripts or
trust a client-provided inspection report. The parent must persist the reviewed
action/token and recovery requirement before invoking provisioning, handle SSH
timeout as indeterminate, retain recovery credentials, and surface unsupported
statuses without claiming completion.

Example report (exactly eight newline-terminated `key=value` fields):

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

`platform`: `supported | unsupported-firmware`.
`hardware`: `accessible | missing-register | uid10001-access-denied | permission-tool-unavailable`.
`exclusivity`: `clear | codesys-active | codesys-boot-enabled | output-container-conflict | unknown`.
`docker`: `running | installed-stopped | vendor-package-missing | unsupported-tool-state`.
`configDocker`: `present | missing`.
`provision`: `none | review-start-installed-runtime | unsupported-fw31-package-activation | unsupported-tool-state | unsupported-lifecycle-dependencies`.
`qualification` is always `required`. Reports describe independent observations;
the provision action still revalidates its gates under lock. A nonzero exit makes
the entire report incomplete and must never be interpreted as an empty workload.

Runtime recovery must precede Docker reconciliation because it needs the daemon.
The coordinator and UI expose explicit inspection and recovery. Recorded Docker
start effects remain blocked until their source-grounded restoration is implemented;
successful runtime delivery does not acknowledge or erase them.
