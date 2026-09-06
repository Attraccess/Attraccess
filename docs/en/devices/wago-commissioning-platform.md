# CC100 commissioning platform software

This implements the digital deployment contract introduced in `eafdbe04`,
reviewed against `origin/att-1056-digital-io` at `f3248534`: `HARDWARE.md`,
`manifest.json`, and `src/onboard-profile.ts`. Tests use temporary register files
and fake Docker/service commands. **No hardware, relay, broker, firmware-reboot,
or persistent-permission qualification is claimed.** ATT-984 remains a release gate.

## Hardware deployment

The installer requires the CC100 platform and firmware 31 (including the existing
commissioning BSP identity `VERSION_ID="2024.12.0"`). It reads `/etc/os-release`
as text; it never sources it. Other identities fail closed.

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

Only the `start-installed-runtime` plan is executable. Its explicit review flag is
`reviewedDockerActivation: true`. Under the same `install.lock`, it rechecks the
platform, rejects CODESYS, requires both Docker binaries, requires the existing
`/etc/init.d/dockerd status` to return stopped status 3, and rejects a live dockerd,
custom `/etc/docker/daemon.json`, or existing container storage under either
`/home/docker/containers` or `/var/lib/docker/containers`. Unsupported status
semantics, configured storage, or previous workloads require further platform
support rather than guessing. These conservative checks do not qualify arbitrary
customized init scripts or daemon arguments; those remain outside this baseline.

The reviewed action calls the vendor-documented `/etc/init.d/dockerd start` and
verifies `docker info`. It does not install a package, enable boot-time startup,
stop PLC programs, or edit network configuration. It retains a tokened
`/etc/attraccess-wago/docker-provision` journal recording the stopped prior state
and start intent before invoking the service. A failed or interrupted start may
have started Docker and therefore requires explicit recovery. No automatic
success or rollback is inferred from a command failure.

Recovery must follow runtime recovery and acknowledgement. It refuses to stop
Docker if any containers remain, calls `/etc/init.d/dockerd stop`, verifies stopped
status and absence of dockerd, and retains a `restored` receipt. Repeated recovery
is read-only once restored. Failed recovery keeps the journal for retry. Persist
the outcome before acknowledging and deleting this receipt. Acceptance removes
the successful provisioning journal without stopping Docker. The prior disabled
boot configuration is never changed; reboot persistence is not promised.

## Vendor evidence and unsupported fresh-firmware path

Evidence was retrieved on 2026-09-05/06:

- [WAGO docker-ipk repository](https://github.com/WAGO/docker-ipk) lists CC100
  751-9301 and documents `docker info` and the installed daemon's
  `/etc/init.d/dockerd stop` / `start` commands in its storage migration guide.
  Its older IPK tutorial does not establish a FW31 provisioning transaction.
- [WAGO CC100 howtos](https://github.com/WAGO/cc100-howtos) identifies its onboard
  I/O example as FW21. The runtime contract uses that documented layout; physical
  FW31 validation remains separate.
- [util-linux setpriv manual](https://man7.org/linux/man-pages/man1/setpriv.1.html)
  documents the UID/GID, groups, capabilities and no-new-privileges options used
  for permission probing. Runtime detection is required; installation is not
  assumed.
- [Docker bind mount documentation](https://docs.docker.com/engine/storage/bind-mounts/)
  documents `--mount` missing-source failure and default read/write access.

Searches also surfaced community posts naming `config_docker activate` and
`config_docker remove`. No official CC100 FW31 command contract establishing the
package, configuration, persistent activation state, and non-destructive inverse
was retrieved. In particular, `remove` must not be guessed to mean only “stop”.
The software therefore does not execute either command and does not invent an
IPK/opkg installation command or require a WBM click. A controller missing both
binaries reports `vendor-package-missing` with
`unsupported-fw31-package-activation`; partial installations and unrecognized
service states report `unsupported-tool-state`. To support fresh-firmware package
activation, obtain the official FW31 tool/state contract and a verified restoration
procedure, then add that distinct reviewed action with interruption fixtures.

## Parent service integration contract

All new exports are from `apps/plugins/wago/backend/wago-hardware-deployment.ts`:

| Export                                                           | Use                                                                                        |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `wagoHardwareDeploymentReportScript(testRoot = '')`              | Read-only inspection over pinned SSH; require exit 0.                                      |
| `parseWagoHardwareDeploymentReport(output)`                      | Strict version-1 parser; rejects incomplete, duplicate or unknown fields.                  |
| `WagoHardwareDeploymentReport`                                   | Typed report contract below.                                                               |
| `WAGO_DOCKER_PROVISION_REVIEW_FLAG`                              | Literal `reviewedDockerActivation`.                                                        |
| `WagoDockerProvisionReview`                                      | `{ reviewedDockerActivation: boolean, action: 'start-installed-runtime', token: string }`. |
| `wagoDockerProvisionScript(review, testRoot = '')`               | Generate explicitly reviewed activation; token is 32 lowercase hex characters.             |
| `wagoDockerProvisionRecoveryScript(token, testRoot = '')`        | Restore the stopped prior daemon state and retain receipt.                                 |
| `wagoDockerProvisionFinishScript(token, outcome, testRoot = '')` | `outcome` is `accepted` or `restored`; consume the corresponding verified journal.         |
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
`exclusivity`: `clear | codesys-active | output-container-conflict | unknown`.
`docker`: `running | installed-stopped | vendor-package-missing | unsupported-tool-state`.
`configDocker`: `present | missing`.
`provision`: `none | review-start-installed-runtime | unsupported-fw31-package-activation | unsupported-tool-state`.
`qualification` is always `required`. Reports describe independent observations;
the provision action still revalidates its gates under lock. A nonzero exit makes
the entire report incomplete and must never be interpreted as an empty workload.

After successful delivery, accept the runtime only after coordinator readiness
checks, then finish provisioning as `accepted`. To abandon a deployment, restore
the runtime first, persist and acknowledge its restored receipt, then restore
Docker and persist/acknowledge the provisioning receipt. This ordering preserves
the daemon needed for runtime recovery. No service, controller, frontend, or
management-adapter integration is implemented by these files.
