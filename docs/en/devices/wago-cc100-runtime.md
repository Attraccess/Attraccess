# WAGO CC100 Docker Runtime

> **Engineering reference, not the supported operator installation path.** This guide records the manual runtime baseline at `9e0a1c47`. It is not hardware-validated: [ATT-984](https://linear.app/attraccess/issue/ATT-984/prove-the-no-code-cc100-journey-on-hardware-with-a-nontechnical-user) is the release gate. Do not use it to control equipment until required hardware/user evidence exists. Follow [Guided Commissioning](wago-cc100-commissioning.md) for the SSH-only UI path and [Acceptance Evidence](wago-acceptance-evidence.md) for release prerequisites. Manual shell, registry, JSON mapping and credential-copy steps below do not satisfy that gate.

## Front panel configuration and live controls

The controller configuration page shows all four outputs and eight inputs. Name a terminal to use it; clearing its name removes that binding. Terminal and device settings open in side drawers. RS-485 settings are shared across devices, while each Modbus device specifies its address, profile, polling interval, and serial or TCP link. Built-in profiles are read-only; Customize creates an editable copy, including register function codes, address bases and byte/word order.

Edits stay unapplied until **Apply to controller**. **Discard** restores the applied configuration. Existing flow impacts still require confirmation. Revision history and rollback are available on the separate **Revision history** page.

Live controls require a current runtime advertising `front-panel-v1` and a matching applied revision. They always use applied channel identities and behavior, including while settings have unapplied edits. Manual commands are acknowledged MQTT commands with `source: "manual"`; the runtime reports `manualOutputChannelIds` in its retained state. The next successful flow command takes over that output. **Release** clears manual ownership without writing hardware or changing its current state; automatic pulse completion and disconnect policies still apply. Release does not restore a previous flow state.

Input inversion affects reported input state, guards and feedback. Modbus switches read coils using FC01 and holding registers using FC03; readback runs in the polling loop rather than blocking configuration acceptance or command acknowledgements. Modbus state is never inferred from a command alone. Polling uses each device's configured interval. The page refreshes received diagnostics every two seconds; this is a live polling view, not a push stream.

## Change the MQTT server or stored SSH address

For a fully managed controller, open **Details → Advanced → Change or update MQTT server**. Enter its private IPv4 address on the new network and select an Attraccess MQTT server. Selecting the current server again refreshes its current address, TLS settings and device credentials. Select **Update only the CC100 address** to verify and save the new SSH destination without provisioning MQTT credentials or restarting the runtime. The address field changes where Attraccess connects; it does not configure the CC100's network.

The first SSH connection uses the entered address and the existing pinned host fingerprint. Neither the previous controller address nor the previous broker needs to respond. The restricted management account receives only fixed helper commands; signed helper publication supplies the updated operation. **Restore previous SSH access** retires automatic management and is not part of a network change.

An MQTT change stops the runtime under the shared installation lock, updates `/etc/attraccess-wago/runtime.env` and permanent credentials in `/var/lib/attraccess-wago/state.json`, and recreates `attraccess-wago` using its installed image and captured Docker configuration. The existing mounts, devices, hardware profile, required environment and retained runtime state survive. A short-lived fixed maintenance program uses Node from that same image and the local Docker API to preserve container settings; the managed runtime itself never receives the Docker socket. Startup goes through the existing hardware gate and supervisor with restart policy `no`.

Attraccess first refreshes its shared MQTT connection using the selected server’s current settings, preserving its registered topic subscriptions. This requires the matching Attraccess API build. It clears the previous retained credential acknowledgement and requires a new authenticated device acknowledgement on the selected broker. It then saves the controller, commissioning session, credential epoch and encrypted SSH address binding consistently. The drawer reports progress and specific failures without returning credentials. An interrupted change retains an encrypted server intent and private controller journal; **Retry saved change** finishes applying the same settings and credentials, including after interruption between container deletion and creation. If applying finished but MQTT verification failed, correct the configured server address or TLS settings and retry: Attraccess provisions and saves a replacement intent before releasing the previous journal. An interrupted replacement continues with its saved credentials. Commissioning, runtime updates, credential rotation and SSH recovery remain blocked until it finishes.

Migration retains the previous broker association for credential cleanup. When that broker is available, use **Retire previous broker credentials**. Cleanup is independent of migration success, rejects a broker destination shared with the current server, and must finish before controller removal.

## Deployment Paths Must Not Be Mixed

### Build-owned assets and managed-update engineering status (ATT-1099)

The ATT-1099 draft supplies `release.json`, `wago-cc100-runtime.tar` and its
`.sha256` file with the server image under `/app/share/cc100-runtime`. These
assets are built from the checked-out source by
`.github/actions/build-cc100-runtime`. They are outside the npm plugin package,
whose host importer has a 50 MiB archive limit. The compressed Docker archive
remains the `image.tar` member of the outer tar; Docker accepts that gzip member
directly. Neither generated bundles nor management keys belong in Git.

For local development, build the complete offline ARMv7 runtime with
`pnpm nx run plugin-wago:build-runtime` (Docker Buildx with ARMv7 support is
required). Run `pnpm nx run plugin-wago:install-runtime-dev` to build and copy it
into `${STORAGE_ROOT:-storage}/cc100-runtime`; the install target depends on the
build target. Both targets are uncached and use the same packaging path as CI.
They are explicit operations; `pnpm serve` and plugin installation do not trigger
a runtime build. Restart a running API after replacing its installed assets.

`WAGO_CC100_BUILD_ASSETS_PATH` selects this directory. The catalog verifies the
bundle checksum, byte count, embedded compatibility manifest and build descriptor
before use. Custom runtime imports are not supported, and the shared storage
catalog's legacy `current` pointer is ignored. Missing or incompatible build assets
fail production plugin initialization. Development can start without assets and shows
explicit build instructions instead. The Docker image verifies asset readability
and checksum as its unprivileged application user during construction.

Packaging publishes a complete replacement of `cc100-build` for explicit rebuilds.
Restart the development server after installing replacement assets. Running
catalogs retain their selected release and immutable delivery snapshots. The
descriptor identifies the checked-out build, platform/profile/protocol compatibility,
transport checksum,
and Docker **config digest** (`imageId`). Its offline image reference is pinned
by that config digest and is not a registry-pull reference. Recompression or a
different tag/build ID with the same config digest does not constitute an upgrade.
Managed launch supplies this identity as `WAGO_RUNTIME_IMAGE_ID`; fresh permanent
heartbeats report it as `runtimeImageId`. Legacy heartbeats may omit the field.

The update transaction primitives are separate from destructive commissioning.
They bound/checksum transfers, verify Docker identity and ARMv7 compatibility,
re-run the host gate, retain a stopped predecessor, and checkpoint enrolled state
under the same `/var/lib` filesystem before starting a replacement through the
supervisor. Activation also republishes the current build's boot hook and uses its
current Docker device/bind-mount arguments, including optional RUN LED mounts.
Rollback restores the previous hook along with the previous container/state.
The root-owned journal is
`/var/lib/attraccess-wago-update-transaction`. State mountpoints/nested mounts are
rejected because restoration requires atomic renames. Acceptance retains recovery
data until a durable server acknowledgement; cleanup uses a separate resumable
ownership-marked directory. No update primitive reissues enrollment credentials,
replaces `runtime.env`/CA, or prunes unrelated containers/images.
Graceful server shutdown waits for cancelled SSH operations to release their
device-operation leases before closing the store. Durable journal intent remains
available for normal reconciliation after restart.
After crash recovery and acknowledgement, reconciliation releases the lease;
the next automatic scan starts any needed rollout with a fresh operation deadline.

Update staging writes the authenticated outer bundle directly to the journal
filesystem and streams `image.tar` through a private FIFO into Docker. Both the
extractor and Docker must succeed before image identity/platform verification.
The byte-limited receiver uses bounded `dd` blocks and observes file-size metadata
after each read, including short pipe reads, without rescanning the archive. It
supports native and FW31 terse stat formats and does not depend on optional `head -c`
or `dd iflag` support. It checks at most the expected bundle size plus one byte
under a 300-second deadline. Incomplete/oversized transfers, checksum failures,
receiver-tool failures and receiver timeouts have separate actionable errors.
Per-block observations use the stat ABI already identified by the outer guard,
with strict size bounds, rather than repeating its multi-process capture pipeline
for every short SSH read. The complete upload still receives guarded size and
checksum validation before Docker can load it.
The verified upload is removed before activation; rollback uses the retained
predecessor and state checkpoint, so it does not need either archive. Admission
requires one bundle size on `/var/lib`, three bundle sizes at Docker's discovered
data root, and 16 MiB headroom per filesystem; shared filesystems sum these
requirements. The Docker reserve is an admission policy rather than a guaranteed
image expansion bound. Activation separately checks checkpoint space. Unused
commissioning upload paths, including `/tmp`, do not affect update admission.

The scoped read-only helper operation `storage-status <management-token>` reports
each storage path, available/required KiB, filesystem and mountpoint, followed by
sizes of retained update-system upload/journal paths. It does not take the mutation
lock or delete files. Failed admission preserves validated path/capacity figures
through SSH classification and durable update status. The details drawer explains
the shortfall in MiB and whether the previous runtime recovered or recovery remains
pending. Arbitrary remote stderr and credentials are never stored or displayed.
`receiver-status <management-token>` is a read-only compatibility probe for the
legacy helper's `head -c` receiver; it reports support without acquiring the
mutation lock or changing runtime state.

Automatic reconciliation is registered for **new managed enrolments**. Existing
registrations are not migrated or silently adopted: remove and re-enrol them.
The controller table shows the before/after runtime versions and a live update
phase with an activity bar. The bar is indeterminate because the updater reports
phases rather than a transfer percentage. Different images with the same version
include a short image ID. Each table row uses at most two lines of text; failures,
retry times, SSH setup prerequisites and recovery controls are available in its
**Details** drawer. Search matches device names, IDs and saved IP addresses.
Pagination limits rendering and status polling to 25 rows at a time. Startup,
permanent runtime heartbeats and a 30-second retry sweep drive reconciliation,
with at most two updates active.
New connections and changed image identities request reconciliation immediately,
including when an earlier current-image checkpoint still has a recheck deadline.
Controllers whose image differs from this server build use the dedicated
**Software update** status. Manual commands, flow commands and current flow samples
remain unavailable during a mismatch, including after rollback to an older image.
After a server restart, **Checking software** means the running image is awaiting
confirmation; this alone does not queue an update. Controllers without a fresh
heartbeat show **Not responding**, including while an update is pending.

The runtime advertises `runtime-update-gate-v1`. It switches every configured output
off before requesting confirmation at startup and after MQTT disconnection, overriding
hold/watchdog policies and manual ownership. Until a connection-specific server
confirmation names the running image, it rejects commands and configuration changes
and suspends input/measurement polling. Retained confirmations from earlier connections
cannot release the gate. Failed output shutdowns keep readiness false and are retried
while heartbeat and update communication continue. Device-side gating requires this
runtime version; older installed images acquire it through their first automatic update.
The **Details** drawer explains classified blockers and recovery steps in English and German,
including missing runtime assets, SSH identity/authentication, CODESYS conflicts,
storage, transfer, readiness and recovery failures.
The managed-access state **verified** means only that the SSH management key was
proved. SSH cutover and reboot verification finish automatically after a fresh
permanent MQTT connection, enrolment-credential revocation, applied configuration
and runtime readiness are confirmed. The table shows a short setup status; its
**Details** drawer shows the actual pending prerequisite and progress during
SSH cutover/reboot. There is no manual continue
action. When configuration is pending, select **Configure**, review and publish the
inputs and outputs configuration, and resolve any rejection; SSH setup resumes
automatically after the controller confirms it.
Settled current controllers are rechecked over SSH at most once every five minutes;
a changed build image bypasses this deadline, and retained transaction cleanup
continues on its independent retry schedule. Peripheral Modbus read failures stay
visible as channel faults without blocking controller/runtime readiness; onboard
hardware and configuration failures still block commissioning and updates.
Database leases keyed by the pinned device identity serialize updates with
commissioning, management transitions, removal and credential operations.

Enrolment creates the dedicated non-root `attraccess` account with a unique
Ed25519 key. The private key and random root recovery password are encrypted by
the host secrets service in `plugin_wago_managed_access` before remote mutation.
The temporary bootstrap password is never saved. The encrypted envelope is bound
to the commissioning session, transaction and pinned device identity. The dedicated
account has only a fixed, no-argument sudo helper; its root-owned public-key entry
forces that helper and denies forwarding and PTY. Transport uses an isolated,
short-lived agent, pinned host keys and key-only authentication, with no private-key
temporary file or inherited agent/password fallback.

After permanent identity, enrollment revocation, applied configuration and fresh
runtime readiness are verified, commissioning accepts its installation journals.
Only then does it replace the Dropbear startup script with the Attraccess wrapper
using `-G attraccess -w -s`. A second fresh managed connection, authenticated
daemon/listening-socket policy inspection, a negative root-password probe and a
further managed connection precede commit. An independent three-minute watchdog
then remains armed while the fixed helper reboots the controller. A changed host
boot ID, fresh independent key-only connections, daemon/socket policy inspection
and root-password rejection must all pass after reboot before commit. The early
boot hook starts a fresh three-minute rollback window; a lost server restores the
previous SSH policy without remote input if cutover is not committed.
The password remains rotated and its recovery copy remains encrypted.

The server allows up to eighteen minutes for preparation, including three bounded
installation-lock waits behind supervisor checks. Its three-minute SSH verification
deadline starts after the cutover command confirms that SSH has changed. The shared device lease covers
both phases. Before SSH cutover, acceptance uses the verified, pinned bootstrap
login and a fixed server-owned script to retire only the enrolment’s journals.
This also repairs unfinished registrations with older helpers that rejected a
busy supervisor lock immediately; it does not reinstall the runtime. After
cutover, runtime updates continue to use the restricted management key.
Acceptance also refreshes the already-owned helper and rollback scripts before
cutover. FW31 BusyBox `flock` has no `-w` option, so all SSH transition locks use
`timeout -k 5 30 flock 7`. A failed attempt requests unconfirmed rollback on its
next scan; it never confirms an unknown SSH policy. Old installations whose
helper and watchdog both use `flock -w` require controller console access or
restored root SSH before these scripts can be repaired.
For an existing unconfirmed cutover where both the helper and watchdog reject
`flock -w`, WBM's normal SSH checkboxes cannot override the installed startup
wrapper. Build a targeted, administrator-installed recovery package:

```sh
node apps/plugins/wago/scripts/build-ssh-lock-recovery.mjs \
  cc100-<16-hex-character-hardware-id> storage/recovery/cc100-ssh-recovery.ipk
```

In FW31 WBM **Software Uploads**, select the package and choose **Install**.
The installed [WAGO upload plugin 2.1.1](https://github.com/WAGO/cc100-firmware-sdk/blob/b2a09cc66ad07af54a34701d6cfc90f31aca5cd0/ptxproj/src/wbm-ipk-uploads-2.1.1.tgz)
uploads and installs it in one action; it has no separate Activate button.
Use **Force install** when repeating an interrupted or failed installation of
the same package version. Installation can wait up to 310 seconds for the
controller lock, so allow about six minutes for the installation result.
Refreshing WBM does not prove completion or retain the selected file in its form.
The package requires the matching runtime hardware ID, private root-owned paths
and an unconfirmed SSH change. Version 1.0.1 also accepts the root-owned `0644`
lock created by legacy watchdogs inside the private management directory and
tightens it to `0600` without replacing its inode. Other owners, writable modes,
symbolic links and hard links are refused with specific diagnostics.
It repairs the bounded lock commands and private lock creation mask, then
invokes the existing rollback script. It refuses already-confirmed access and
retains runtime configuration and credentials. Once root SSH is restored,
automatic registration refreshes the management scripts and retries cutover.
Runtime inspection reads the installed helper hash and Docker image without
taking the hardware supervisor's writer lock. A busy hardware check therefore
does not make a running controller appear offline. Helper publication and every
runtime transaction still validate private root-owned paths and wait at most
310 seconds for the writer lock before changing anything.
Setup failures retain a fixed diagnostic for the failed step and
are shown in the controller’s Details drawer; raw SSH output and credentials
are never included.

The **Recovery tools** section contains **Reveal root password (audited)**,
an explicit administrator action.
It requires a recorded durable audit receipt before decrypting/returning the
password, sends `Cache-Control: no-store`, and never returns the SSH private key.
The secret is displayed only until hidden or the recovery section closes. Root SSH is denied
after cutover. For remote recovery/re-enrolment, **Restore previous SSH access (audited)**
uses the retained managed key to restore the prior SSH policy, proves the generated
root password on a fresh pinned connection and retires automatic management. Use
that recovered password as the next enrolment's temporary credential; the next
session generates a new key/password, rather than adopting the retired identity.
Retirement removes the dedicated account's authorized keys only after restored
root access is independently proved. A durable `retiring` state blocks automatic
updates and key retries until pinned root inspection verifies the removal, even
after a lost SSH response or server restart. Removal requires that completed
retirement, retains the recovery session and encrypted record, and refuses an
update whose rollback/acknowledgement is still pending. Unreadable encrypted
credentials report recovery-required rather than healthy managed access.

The root-owned helper exposes fixed operations and never evaluates SSH commands
or executes files extracted from a runtime bundle. Enrolment also creates a separate
per-controller installer publication authority. Its private key is encrypted in the
same bound database envelope; only its public key is installed on the controller.
The scoped SSH key alone cannot publish executable code. When the deployed build
changes its compiled installer, the server signs that exact helper for the enrolment
token. The fixed publisher verifies the signature, digest, length, syntax and root
ownership under the installation lock, refuses outstanding transactions, then
atomically replaces the helper. No API accepts installer source or returns either
private key. Unknown protocol versions fail visibly. Each runtime update then uses
the current-build boot hook and device/bind arguments, so installer fixes reach
controllers already enrolled without another commissioning attempt. The independent update watchdog restores
unaccepted updates after interruption; the reboot recovery hook runs after vendor
Docker startup and before the runtime hook, leaving runtime enablement absent if
recovery cannot be proved. Retained MQTT samples, the old boot's stream, loaded
images alone, and recompressed identical images cannot establish update success.

These are software/isolated-fixture guarantees. No bench controller was available
for this implementation, so physical FW31 cutover, reboot, I/O and recovery
qualification remain explicitly **unverified**, independently of software status.
The remote bootstrap-restoration action is not a local recovery route. No local
root recovery route has yet been qualified for FW31 when both managed SSH and the
server are unavailable. Before shipment, identify the supported physical/vendor
recovery interface and prove the generated root password works there; do not
assume root SSH, WBM or a serial console remains available.

The first usable beta targets CC100 `751-9301` firmware **31**. Broader firmware references below are hardware background, not additional supported baselines. Guided commissioning uses a locally checksum-checked offline bundle, not a controller-side registry pull or mandatory WBM setup. It names its container `attraccess-wago` and bind-mounts the controller directory `/var/lib/attraccess-wago` there. As of **2026-09-06**, commissioning is destructive: existing applications/data may stop working or be erased, with no preservation, backup or restoration of preexisting CODESYS or other workloads by Attraccess. It always stops and permanently disables CODESYS and verifies this before I/O. Supported Docker setup and persistent narrow I/O permissions belong to the installer. See the current [platform contract](wago-commissioning-platform.md).

The legacy manual example below names its container `attraccess-wago-cc100` and uses a named Docker volume instead. Those storage locations and its restart policy are **not interchangeable** with guided commissioning. Guided commissioning uses Docker restart policy `no` and a host supervisor that verifies CODESYS disablement, exclusive ownership and narrow register access before every start. Five consecutive crash starts trigger a 30-second cooldown; a healthy observation resets that count. It periodically checks the running writer and attempts containment on failed checks. The historical manual `unless-stopped` example does not provide that gate. Identify the actual installation before cleanup; do not run the manual install over a commissioned controller.

For guided installations, Docker itself never restarts `attraccess-wago`. The `runtime-enabled` marker records durable operator intent. Failed observations stop the writer but preserve that intent; after verified containment the supervisor waits 30 seconds and retries the complete gate. Lock contention waits for the owning transaction without stopping its writer. Explicit stop, replacement, and rollback still remove enablement. If stopping cannot be verified, supervision reports recovery-required instead of attempting an unchecked restart.

The last failed supervisor observation is retained in `/etc/attraccess-wago/supervisor.last-error`, a private, atomically replaced file containing UTC time, exit status, action, and up to 4096 bytes of diagnostic output. Successful recovery preserves that evidence. A failed initial boot gate also starts background supervision after verified containment. Confirm recovery through a fresh heartbeat, not merely a successful hook exit. Older hooks removed enablement on failure; installations already in that state need explicit recovery through the [wizard cleanup/recommissioning route](wago-cc100-commissioning.md#recover-after-latched-containment) or an inspected support recovery. Do not bypass the host gate with `docker start` or change Docker's restart policy.

Both paths use `/etc/attraccess-wago/runtime.env` on the **controller host**. Docker reads it through `--env-file`; it is not mounted into the container. Runtime state is `/var/lib/attraccess-wago/state.json` **inside the container**, backed by the host directory for guided commissioning or by the named volume for the manual example. Both the host environment file and runtime state can contain credentials. A local Attraccess backup is not proof that either device-side file or SSH recovery access has been backed up. Verify recoverability before credential changes and keep secrets out of support evidence.

The runtime runs on a WAGO CC100 `751-9301` with WAGO Linux firmware and Docker. It does not use CODESYS and does not accept uploaded controller code. Its current protocol version is `1.0.0`; runtime version is `0.1.0`.

## Safety boundary

This runtime is **not safety rated**. It must not be used as an emergency stop, personnel-protection function, or replacement for certified safety circuits. Keep all official emergency-stop and safety circuits independent. A runtime fault, loss of MQTT, container crash, reboot, or configuration error must be treated as an operational fault, not proof of a safe state.

## Preconditions

Before deployment, confirm all of the following:

- The controller is a `751-9301`. The published image is built for `linux/arm/v7`.
- The CC100 has a WAGO Linux firmware release with Docker support. WAGO's onboard-I/O reference requires firmware 21 (`03.09.04`) or later; record the installed firmware in the deployment record.
- An administrator has SSH access or WBM access to the CC100. Use an isolated administrative network and restrict SSH/WBM access to authorised operators.
- The controller can reach the configured MQTT broker and the registry hosting `ghcr.io`. There are no inbound runtime ports; outbound MQTT and image-registry access are required.
- Persistent storage is available for Docker and for `/var/lib/attraccess-wago`. WAGO's Docker lifecycle uses `/home/docker` for Docker data.
- A per-controller hardware ID, pairing code, MQTT URL, discovery credential, and enrollment secret have been issued by the Attraccess operator.
- The physical assembly, wiring, guards, contactors, and non-safety stop/fault/permissive signals have been reviewed. The `751-9301`, `879-3000`, and `879-1300` reference assemblies require the physical verification checklist below.

## Enable Docker

Guided commissioning prepares the existing firmware-installed Docker facility
within the single destructive-install approval. It uses the vendor activation
path when needed and verifies daemon availability and boot enablement before I/O.
The captured FW31 `config_docker install` only checks activation state; it does
not download or extract Docker. Missing client/daemon binaries remain unsupported.
Vendor activation can change saved startup, routing and firewall state; neither
deactivation nor removal restores preexisting applications. The captured init
script has no usable `status` action, so commissioning checks daemon observations
and getter results instead. See [current support boundaries](wago-fw31-support.md)
for exact-source provenance, remaining checks and the superseded preservation
decision. WBM is not a required commissioning step.

## Obtain and verify the image

The runtime manifest names this intended version tag:

```text
ghcr.io/attraccess/wago-cc100-runtime:0.1.0
```

CI publishes a commit-SHA tag for `linux/arm/v7`, verifies the published manifest, and uploads the immutable `<tag>@<digest>` reference as the `wago-cc100-runtime-image` artifact. Use that recorded digest rather than a mutable tag.

```sh
export IMAGE='ghcr.io/attraccess/wago-cc100-runtime@sha256:<published-release-digest>'
docker pull "$IMAGE"
docker image inspect "$IMAGE" --format '{{index (split (index .RepoDigests 0) "@") 1}}'
```

The inspected digest must exactly match the release digest. Retain the pulled image locally for rollback; do not delete the previous known-good image until the new image has passed the physical verification checklist.

## Prepare controller configuration

Create a root-readable environment file. It contains broker credentials and must never be committed, copied to tickets, or included in support bundles.

```sh
install -d -m 0700 /etc/attraccess-wago
umask 077
cat >/etc/attraccess-wago/runtime.env <<'EOF'
WAGO_HARDWARE_ID=<controller-hardware-id>
WAGO_MQTT_URL=mqtts://<broker-host>:8883
WAGO_MQTT_USERNAME=<initial-controller-username>
WAGO_MQTT_PASSWORD=<initial-controller-password>
WAGO_PAIRING_CODE=<controller-pairing-code>
WAGO_ENROLLMENT_SECRET=<enrollment-secret>
WAGO_MQTT_PREFIX=attraccess/wago
EOF
chmod 0600 /etc/attraccess-wago/runtime.env
```

The runtime requires `WAGO_HARDWARE_ID`, `WAGO_MQTT_URL`, and `WAGO_PAIRING_CODE`. `WAGO_MQTT_USERNAME` and `WAGO_MQTT_PASSWORD` are discovery credentials until the controller is claimed. `WAGO_ENROLLMENT_SECRET` is required for discovery enrollment. `WAGO_MQTT_PREFIX` defaults to `attraccess/wago`; use the issued namespace if it differs. The persistent state path defaults to `/var/lib/attraccess-wago/state.json` and stores the last accepted configuration, output state, bounded command history, and permanent credentials. The file is created with mode `0600`.

### I/O paths and host access

`WAGO_IO_PATHS` is a JSON object keyed as `<hardware-profile>:<channel>`. Each entry supplies an `input` and/or `output` file path. Firmware revisions can enumerate IIO devices differently, so determine these paths on the target before deployment. Do not reuse a path map from a different firmware release without verification.

WAGO documents these relevant host paths:

- Digital outputs: `/sys/kernel/dout_drv/DOUT_DATA`
- Digital inputs: `/sys/devices/platform/soc/44009000.spi/spi_master/spi0/spi0.0/din`
- Analog and Pt1000 values: the relevant `/sys/bus/iio/devices/iio:device*/...` raw files
- Calibration data: `/etc/calib`
- RS-485: `/dev/serial` on the `751-9301`; its serial mode is RS-485 only

The current image instantiates only the onboard I/O adapter. It can read or write the file paths supplied through `WAGO_IO_PATHS`, but does not read `/etc/calib` or implement calibration transforms. Its RS-485 and Modbus TCP adapter classes are not selected by the entry point, so RS-485 and Modbus deployment are not available in this artifact. The listed paths are WAGO host documentation and an input to future hardware validation, not a claim of current runtime support.

The current runtime release declares `privileged: true`. This is a temporary hardware-access model from the release manifest, not an endorsement of broad host access. The image process itself runs as UID `10001`. The exact production device and bind-mount list is not yet validated and must be supplied by the ATT-984 hardware gate.

Until then, do not claim a least-privilege deployment. The intended replacement model is:

- Bind only the specific configured sysfs/IIO files required for the controller's onboard I/O, read-only for inputs and read-write only for output files. These expose the physical I/O paths used by the adapter.
- Add a read-only `/etc/calib` mount only after a runtime release reads it to implement analog or Pt1000 calibration. This preserves WAGO's production calibration without allowing modification.
- Add only `--device /dev/serial` after a runtime release selects its RS-485 Modbus RTU adapter. This limits serial access to the documented CC100 interface rather than exposing `/dev`.
- Mount a named volume only at `/var/lib/attraccess-wago` so accepted configuration and command de-duplication survive replacement or reboot.
- Do not mount the Docker socket, host root filesystem, or an unrestricted `/dev` directory. The runtime exposes no inbound network service and currently needs only outbound MQTT.

## Start the WIP runtime

This command reflects the current manifest. Substitute the image digest and a target-specific I/O mapping only after reviewing them on the controller. The `WAGO_IO_PATHS` example is intentionally empty: no universal mapping is valid across CC100 firmware revisions.

```sh
export IMAGE='ghcr.io/attraccess/wago-cc100-runtime@sha256:<published-release-digest>'
docker volume create attraccess-wago-state
docker run -d \
  --name attraccess-wago-cc100 \
  --restart unless-stopped \
  --privileged \
  --env-file /etc/attraccess-wago/runtime.env \
  --env 'WAGO_IO_PATHS={}' \
  --mount type=volume,src=attraccess-wago-state,dst=/var/lib/attraccess-wago \
  "$IMAGE"
```

In this historical manual example, `--restart unless-stopped` starts the runtime after Docker and controller restarts unless an operator explicitly stopped it. It does not make the runtime safe after a failure and is not the current guided commissioning policy. Record the command, image digest, environment-file checksum (not its contents), container ID, firmware version, and I/O map review in the deployment record.

Check startup and retain the output:

```sh
docker ps --filter name=attraccess-wago-cc100
docker logs --tail 200 attraccess-wago-cc100
docker inspect --format '{{.State.Status}} {{.RestartCount}}' attraccess-wago-cc100
```

Runtime callback failures are written to container stderr, so `docker logs` is the primary log collection command. Add the output of `docker inspect`, `docker logs`, firmware version, and non-secret configuration metadata to a support bundle. Never include `/etc/attraccess-wago/runtime.env` or `state.json` without removing credentials.

## Enrollment and credentials

The intended enrollment flow is discovery-scoped and one-time:

1. The controller announces its hardware ID, pairing code, protocol/runtime versions, capabilities, and an enrollment secret to `attraccess/wago/discovery/<hardware-id>`.
2. The operator claims it through the corresponding discovery claim topic within the 15-minute enrollment window.
3. Attraccess returns controller-scoped MQTT credentials and operational topic details, then revokes the discovery credential.
4. The controller persists permanent credentials and reconnects with only the controller-scoped identity.

The runtime publishes a retained discovery announcement, subscribes to the claim topic, validates and persists the returned credentials before disconnecting, then reconnects with the permanent controller identity. Subsequent starts use the persisted identity and do not require the discovery identity to remain valid.

On credential compromise, decommissioning, or failed rotation:

1. Revoke the affected broker identity first.
2. Stop the container to prevent repeated failed authentication attempts.
3. Issue a new controller-scoped credential through the Attraccess provisioning process.
4. Replace `WAGO_MQTT_USERNAME` and `WAGO_MQTT_PASSWORD` in the `0600` environment file, and set `WAGO_MQTT_USE_ENV_CREDENTIALS=true` to use the complete replacement pair instead of persisted credentials.
5. Remove the stopped container and recreate it with the same reviewed image digest, state volume, and I/O mapping, using the updated `--env-file`. Docker reads `--env-file` only when creating a container; `docker start` would retain the revoked credentials.
6. Inspect logs and verify a heartbeat under the expected hardware ID.
7. Preserve the persistent volume unless recovery requires discarding the accepted configuration and command history.

## Configuration and operational inspection

With the default prefix, the runtime uses this topic root:

```text
attraccess/wago/v1/controllers/<hardware-id>/
```

It subscribes with QoS 1 to:

- `configuration/desired` for a retained desired snapshot
- `commands` for non-retained commands

It publishes with QoS 1:

- `configuration/reported` retained, including revision, content hash, and structured validation errors
- `state` retained, including connection state, accepted revision/hash, and output states
- `heartbeat` every 30 seconds with hardware ID, pairing code, protocol/runtime versions, capabilities, and a sequence value
- `measurements` every 5 seconds for configured measurement channels
- `faults` when a measurement read or device write fails
- `acknowledgements` for accepted, duplicate, or rejected commands

Desired snapshots are validated before they are persisted. A rejected snapshot publishes field-level errors in Reported Configuration and leaves the last accepted configuration in place. Inspect the retained `configuration/reported` record after every update and compare its revision and hash with Desired Configuration. Do not send commands until the expected configuration is reported.

Use only diagnostics controls present in the exact tested plugin build. This manual baseline does not establish that a controller detail screen exists; verify the integrated UI before documenting its navigation. Broker-level topic inspection is an engineering tool, not normal operator acceptance, and messages can contain secrets as well as topology and operating state.

## Resource flows

Once a controller is claimed and its configuration is applied, the flow catalog offers four WAGO nodes:

| Node                | Use                                                                                 | Outputs                                                          |
| ------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| WAGO command        | Control an output using its configured switched or pulsed behavior.                 | `output`, `failure` (according to the selected failure behavior) |
| WAGO event received | Start a flow on a channel state report, measurement, or fault.                      | `output`                                                         |
| WAGO read state     | Read the latest received state or measurement without sending a controller command. | `output`, `unavailable`                                          |
| WAGO wait for state | Wait for an available state or measurement to equal a configured value.             | `output`, `timeout`                                              |

Select the controller, the named logical channel, and the operation or event/state category. Command nodes list only output channels and pin the applied configuration revision; reopen and save them after publishing a new revision. Event/read/wait nodes also support input and measurement channels.

The channel's **Output behavior** is authoritative:

| Configured behavior       | Command node operation | Result                                                                      |
| ------------------------- | ---------------------- | --------------------------------------------------------------------------- |
| Switched                  | Turn on / turn off     | Set the output to the selected boolean state.                               |
| Pulsed                    | Trigger pulse          | Turn on for the channel's configured duration, then turn off automatically. |
| Input or measurement only | No command operation   | Use event, read, or wait nodes.                                             |

Setup presets copy starting settings into the channel. Their names do not constrain later customization: a channel created from a pulse preset can be changed to switched behavior. Pulse duration, operational guards, feedback monitoring, and disconnect behavior belong to the controller configuration. Flow nodes choose when to issue the permitted operation; they cannot override those settings or supply a different duration. Guards are checked and configured feedback is monitored for commands of either output behavior.

The existing version 1 snapshot format is retained. The `pulse` capability and positive `pulse.durationMs` together define pulsed behavior; output channels without either are switched. Inconsistent pulse settings are rejected by both API and runtime configuration validation. The command wire actions remain `set` (with a boolean `value`) and `pulse`.

**Existing flows:** set commands on pulsed channels are now invalid, including set-off. They are not automatically converted. Validation flags the node, and execution rejects it before publication. Explicitly select **Trigger pulse**, or change the channel to switched behavior, publish that configuration, and reopen the node to accept its new revision. Manual commands use the same restrictions. Updated CC100 runtimes also reject incompatible direct MQTT commands with `unsupported_operation`; deploying the plugin alone does not update a controller's installed runtime. Internal pulse shutdown and disconnect handling still turn outputs off.

Event, read, and wait nodes put their result in `wago`, preserving the incoming payload. For example, `wago.value` contains a boolean state or numeric measurement, with freshness and availability information in `wago.available`, `wago.stale`, and `wago.offline` when a sample exists. Missing samples return `wago.available: false`; read nodes route missing or unavailable samples to `unavailable`, and waits only match available samples. Measurement values and comparisons use [wire units](wago-measurement-contract.md).

State events are reports, including periodic snapshots; they are not limited to value changes. Use the event node's minimum interval to limit how frequently it starts a flow, and minimum change to filter measurements. An event can report unavailable data, so check `wago.available` when freshness matters.

For example, connect **WAGO event received → WAGO read state → a condition** to react to a contact while inspecting another channel. Use **WAGO command → WAGO wait for state** when the flow should continue only after an input reports the expected state.

## Recovery

### Broker loss

The runtime marks state disconnected when its MQTT client closes. Each configured output has a Desired Configuration disconnect policy:

- `hold`: leave the output unchanged
- `immediate`: request an immediate transition off
- `watchdog`: request an off transition after the configured timeout

These are operational controls only, not safety controls. Restore broker connectivity, inspect the retained state and latest heartbeat, then verify the physical outputs before resuming normal operation.

### Invalid configuration

Leave the runtime running. Inspect Reported Configuration for field-level errors, correct the complete Desired Configuration snapshot, and publish a new revision with its matching content hash. A rejected snapshot must not be worked around by manually changing the persistent state file.

### Container crash

```sh
docker ps -a --filter name=attraccess-wago-cc100
docker logs --tail 500 attraccess-wago-cc100
docker inspect --format '{{json .State}}' attraccess-wago-cc100
docker start attraccess-wago-cc100
```

If it repeats, stop it and preserve logs before changing the image or configuration. Check broker reachability, credentials, writable persistent storage, and every configured host I/O path.

### Controller reboot

After the CC100 returns, confirm Docker is active and the runtime publishes a new heartbeat. For guided commissioning, verify that the boot hook kept CODESYS disabled and verified narrow register access before starting Attraccess; failed checks must leave it stopped. Verify retained state and Reported Configuration before testing I/O. The persistent volume retains the accepted snapshot and bounded command history; it is not a preexisting-workload backup and does not replay acknowledged commands or pulses.

### Roll back an image or configuration

Keep the prior image digest and persistent volume until the replacement has been accepted.

```sh
docker stop attraccess-wago-cc100
docker rm attraccess-wago-cc100
docker run -d \
  --name attraccess-wago-cc100 \
  --restart unless-stopped \
  --privileged \
  --env-file /etc/attraccess-wago/runtime.env \
  --env 'WAGO_IO_PATHS=<previous-reviewed-json>' \
  --mount type=volume,src=attraccess-wago-state,dst=/var/lib/attraccess-wago \
  'ghcr.io/attraccess/wago-cc100-runtime@sha256:<previous-known-good-digest>'
```

Validate the returned image digest, heartbeat, retained configuration, and physical outputs. To roll back configuration, publish the previous complete Desired Configuration snapshot as a new revision; do not edit `state.json` by hand. Only discard the state volume under an approved recovery procedure, because it contains configuration history, command de-duplication data, and potentially credentials.

## Physical verification checklist

Record evidence against [ATT-984](https://linear.app/attraccess/issue/ATT-984/validate-the-four-wago-package-assemblies); passing this checklist is required before supported-beta release.

- Confirm controller order number `751-9301`, installed firmware, Docker activation, ARMv7 image digest, and persistent restart behaviour.
- Confirm the `879-3000` and `879-1300` assemblies have the intended power, wiring, Modbus settings, address map, readings, rollover handling, and fault reporting once a runtime release selects the Modbus adapters.
- Confirm each configured onboard digital path against the target firmware's sysfs layout. Validate analog/Pt1000 paths and `/etc/calib` only when the runtime implements calibration.
- Confirm `/dev/serial` is the RS-485 interface and that no unrelated serial or device access is granted when RS-485 support is implemented.
- Confirm the final container device list and bind mounts are minimal and document the reason for each one; remove `--privileged` before release.
- Exercise discovery, claim, credential rotation and revocation once the image implements them.
- Exercise Desired/Reported Configuration acceptance, rejection, reconnect, controller reboot, duplicate commands, pulses, guards, feedback, measurements, faults, and disconnect policies.
- Verify that the official emergency-stop and safety circuits remain independent and untouched.

## Sources

- [WAGO CC100 Docker lifecycle](https://github.com/WAGO/cc100-firmware-sdk/blob/main/ptxproj/projectroot/etc/config-tools/config_docker_home)
- [WAGO direct onboard I/O access](https://github.com/WAGO/cc100-howtos/blob/main/HowTo_Access_Onboard_IO/README.md)
- [WAGO CC100 serial interface feature detection](https://github.com/WAGO/cc100-firmware-sdk/blob/main/ptxproj/projectroot/etc/init.d/serial_features)

### Managed enrolment and reconciliation

Managed enrolment, managed-access retry and automatic reconciliation are available without additional environment configuration. Commissioning verifies controller compatibility, runtime prerequisites and encrypted management credentials before proceeding. Background reconciliation starts with the plugin and only manages controllers with an enrolled identity. New runtime connections trigger immediate reconciliation; periodic heartbeats coalesce fallback fleet scans into at most one new scan per 30 seconds. Encrypted recovery disclosure and bootstrap-restoration actions remain available to administrators. Physical FW31 qualification remains a separate release requirement: recovery, SSH rejection, watchdog/reboot and repeated-update acceptance must be tested on an isolated bench controller.

Administrators can retry a failed, blocked or recovery-required runtime update from
the **Recovery tools** section in the controller’s **Details** drawer. This advances the durable retry deadline under the shared device
lease; it preserves outstanding rollback and accepted-cleanup receipts and finishes
those before starting a newer image.
Retirement is checked again after acquiring device ownership, and conditional access
transitions cannot overwrite durable retirement intent.
