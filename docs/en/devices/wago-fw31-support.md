# CC100 FW31 software support boundaries

## 2026-09-06 supersession: destructive commissioning

The product decision on **2026-09-06** supersedes the prior-workload preservation
and restoration requirements recorded below. Commissioning takes over the CC100:
existing applications and workloads may stop working or be erased. Attraccess
does not preserve, back up, or restore preexisting CODESYS programs, retained PLC
data, other workloads, or their host settings. There is one destructive-install
consequence confirmation; no separate PLC backup approval or mandatory WBM gate.

The current delivery contract always stops and permanently disables CODESYS and
verifies both process and boot state **before granting digital I/O**. Failure to
verify prevents enrollment/runtime launch. This applies even when CODESYS was
already stopped. Supported vendor Docker activation/install and persistent narrow
I/O preparation are part of delivery; unsupported components, missing registers,
and independent output writers still fail closed. See the current
[platform contract](wago-commissioning-platform.md) and
[operator walkthrough](wago-cc100-commissioning.md).

Cleanup reconciles the failed installation and its credentials; it does not undo
the destructive takeover or re-enable CODESYS. Integrity journals, pinned SSH,
signed offline artifacts, TLS enrollment, fresh credentials/consent on retry, and
management-access recovery remain required. Full management hardening and physical
acceptance are separate and are **not complete** merely because installation or
software fixtures succeed.

The source observations below remain decision history, including destructive
vendor side effects and the limits of FW30 evidence. Their old preservation gates
and blanket statements that Docker/I/O preparation is unimplemented are superseded,
not instructions for the current operator workflow. Source compatibility checks
remain necessary; the product decision is not proof that arbitrary firmware or
unknown component versions are supported.

### Security follow-up on 2026-09-06

The later security revision supersedes the intermediate `on-failure:5` Docker
restart design. Current deployment uses Docker restart policy `no` and a root-owned
host supervisor. Each of at most five crash restarts per supervisor run repeats
the full CODESYS, ownership and narrow-permission gate; running writers are also
checked periodically. Observation failures, conflicts and retry exhaustion disable
enablement and attempt bounded containment. An unavailable daemon or unverified
container stop remains a failure with recovery ownership retained.

The later spec correction also supersedes the intermediate instruction to invoke
the boot hook after any supervisor failure. Ordinary daemon-only restart permits
checked startup only while enablement remains present. Containment removes that
enablement; hook `start` currently exits `0` without restarting, and reboot does
not clear the latch. Current guided sessions retain the tokened
[wizard cleanup/recommissioning route](wago-cc100-commissioning.md#recover-after-latched-containment):
cleanup, then retry an unclaimed installation or remove the claimed registration
and commission anew. Only installation recreates enablement; no manual marker
creation or new UI/API re-enable operation is claimed. Missing recovery ownership
or unverified cleanup remains a blocker.

The host guard rejects UID/GID 10001 account/group collisions, unrelated processes
using that identity, unverified namespace mappings and unowned writable DOUT
descriptors, including inode aliases. Owned runtime exemptions require full Docker
ID, namespace and cgroup checks. Configuration/lock paths and staged boot publication
must satisfy root-ownership, permission and file-type checks. This is software
enforcement with observation/race limits, not physical or safety qualification.

The independent fleet gate and eight desktop/mobile commissioning cases passed
on the snapshot captured **2026-09-06T17:11:46.494036Z**, checked for source freshness
at **17:17:33.628037Z**. Those results predate this security revision and do not
verify it. A refreshed gate and browser run are required for the final source;
neither run supplies hardware, FW31 reboot or full management-hardening evidence.

### Exact extension source and captured FW31 evidence

The 2026-09-06 exact-source audit examined the unofficial student extension
[`WAGO-education.vscode-wago-cc100`](https://marketplace.visualstudio.com/items?itemName=WAGO-education.vscode-wago-cc100),
source version/tag **0.2.10 / v0.2.10**, at commit
[`02a0956faeb33ed2a22d7b7f2627ad62411d327b`](https://github.com/wago-enterprise-education/vscode-wago-cc100/tree/02a0956faeb33ed2a22d7b7f2627ad62411d327b).
Its description lists FW28/FW30, not FW31. Acquired source blobs were checked
against their Git object IDs. Marketplace VSIX byte equality with this source or
the GitHub release remains **unknown**; release metadata is not an acquired VSIX.

Its [V02 upload path](https://github.com/wago-enterprise-education/vscode-wago-cc100/blob/02a0956faeb33ed2a22d7b7f2627ad62411d327b/src/extensionCore/projectVersions/V02.ts#L1129-L1228)
attempts to stop `codesys3`, calls `/etc/config-tools/config_runtime runtime-version=0`, then
`/etc/config-tools/config_docker activate` with a fixed one-second delay. Image
layers are obtained on the development host, uploaded as `/home/image.tar`, and
loaded with `docker load`; this is not an engine installer or device-side pull.
Attraccess intentionally does not copy the
[SSH wrapper's ignored exit status/stderr](https://github.com/wago-enterprise-education/vscode-wago-cc100/blob/02a0956faeb33ed2a22d7b7f2627ad62411d327b/src/extension/connectionManager.ts#L865-L887),
[unawaited script callbacks](https://github.com/wago-enterprise-education/vscode-wago-cc100/blob/02a0956faeb33ed2a22d7b7f2627ad62411d327b/src/extension/connectionManager.ts#L244-L270),
the missing stop/boot verification, or
[`res/scripts/dockerCommand.sh`](https://github.com/wago-enterprise-education/vscode-wago-cc100/blob/02a0956faeb33ed2a22d7b7f2627ad62411d327b/res/scripts/dockerCommand.sh)'s
broad writable analog/serial/config-tool mounts and `unless-stopped` startup.
That script has no explicit UID override; its effective image UID is unverified.
The extension reset re-enables CODESYS and is not Attraccess cleanup.

Separately, the audit read existing offline device files captured at
**2026-09-06T12:28:12.112768Z**, identifying **751-9301 / 04.09.01(31) / Docker
25.0.4**. This supersedes the earlier statement that only FW30 shell evidence was
available. Captured `/etc/config-tools/config_docker` lines 70–77 merely check
activation state for `install`: they **download or extract nothing and install
no binaries**. `activate` moves an existing `S99_docker` boot entry and changes vendor
routing/firewall state before starting the daemon. `remove` deletes `/home/docker`;
neither it nor deactivation is application cleanup. The captured file's SHA-256 is
`5da3a5422a53be78507a8db51b9a8f3ef57750059a104261a49540364c8aeb82`,
matching the original capture fingerprint. Missing Docker binaries remain unsupported.

Captured runtime scripts likewise require independent process, `rtsversion=0`
and boot-entry checks: selection 0 alone can be a no-op, and version switching
can delete `/home/codesys/*`. Some sourced helpers and complete compiled/driver
build provenance remain unavailable; this is not evidence that those helpers
are absent on the device. Current software checks release identity, required
tools, getter results and postconditions, not a complete FW31 byte/build attestation.
The current preparation source explicitly stops both vendor runtime selections,
then calls `config_runtime --wait runtime-version=0 force-new-version=yes restart-server=NO`.
It checks absent PLC processes, a regular `rtsversion` containing exactly `0`,
absent `S98_runtime` and alternate enabled boot entries resolving to known PLC
executables, repeating disablement checks after `sync`. It independently checks
the boot medium before vendor install/activation, rejecting empty or `sd-card`
results, and requires executable `S99_docker` to resolve to `/etc/init.d/dockerd`,
an `active` getter result and Docker server version `25.0.4`. These source changes
supersede their earlier listing as implementation follow-ups; hardware behavior
and validation of the final revision remain separate.
The audit performed no new device operations and proves neither sysfs permission
persistence, physical I/O, reboot behavior nor management hardening.

## Decision history before the 2026-09-06 scope change

Fresh CC100 751-9301 commissioning remains incomplete. Hardware tests cannot
substitute for the missing lifecycle and access-control transactions below. The
operator interface remains guided commissioning; engineering captures below are
not manual operator setup instructions.

### Implemented subset (historical)

Host and shell checks require unambiguous CC100 FW31 identity. A BSP label alone
is insufficient. Runtime delivery retains interrupted-delivery recovery, minimum
container privileges, exact digital-register mounts and competing-container checks.
Both a running CODESYS process and its saved `S98_runtime` boot link block
installation without changing PLC data.

The management UI supports additive keys for an existing non-root OpenSSH account
or a **Dropbear 2025.88** peer identified on the same successfully authenticated,
pinned SSH connection. OpenSSH's identification record is parsed in memory and
discarded; absent, duplicate or conflicting records remain unknown. Root process
executable access is not needed. Unknown versions, mixed daemons and root accounts
are rejected. Other Dropbear processes are not assigned the connected peer's version.
The record format comes from [OpenSSH's identification exchange](https://github.com/openssh/openssh-portable/blob/V_10_0_P2/kex.c).
It is used only after that same SSH client exits successfully with strict host-key
checking and authentication. Connection sharing is disabled.
Each new key disables agent, port and X11 forwarding and PTY allocation. The
journal provides atomic addition, expiry, interruption recovery and concurrent-edit
refusal. A fresh pinned connection must authenticate with only the new key. A
custom authorized-key directory or PAM rejection fails verification and invokes
recovery. This proves account command access, not a least-privilege executor;
shell commands retain that account's privileges. Full baseline support is
explicitly `UNSUPPORTED`; enrollment does not claim root/password or WBM restrictions.

The old installed-Docker start action is disabled. Its assumed LSB `status=3`
contract is contradicted by vendor source, and its daemon-only journal cannot
reverse networking hooks. Inspection never invokes an init status action and
accepts the existence of the normal vendor `daemon.json`. A stopped installed
runtime reports `unsupported-lifecycle-dependencies`. Saved reports cannot enable
the obsolete activation action; the coordinator rejects it before saving a token
or contacting the controller. Existing tokens are preserved.

Journals containing `start-intent` or `started` remain unresolved even when Docker
is stopped or an old receipt says `restored`: the vendor start can leave
`WAGO_DOCKER_IPT` after a failed daemon launch. Recovery and finish retain these
journals with `unresolved-lifecycle-effects`; no vendor stop is inferred. A missing
journal also cannot prove restoration. Only a prepared journal with neither start
marker can be passively reconciled. Modern firmware/service snapshots must match;
base journals never contained those snapshots, so current context is recorded
separately in `reconciliation/`, without inventing historical evidence. Partial
modern snapshots are not treated as legacy. The `accepted` finish helper has no
production caller and provides no guided lifecycle closure.

### Actual source and unresolved contracts (historical)

Inspected source: official [WAGO SDK FW30-V04.08.09](https://github.com/WAGO/cc100-firmware-sdk/tree/b2a09cc66ad07af54a34701d6cfc90f31aca5cd0),
commit `b2a09cc66ad07af54a34701d6cfc90f31aca5cd0`. This is **not FW31 compatibility
evidence**. Matching deployed dependency bytes or identifiable compatible versions
can establish a gate; the firmware label or a top-level hash alone cannot. The
[FW31 release notes](https://downloadcenter.wago.com/api/uploads/2026_05_04_Release_Notes_751_9x0x_88b4755930.pdf)
identify 751-9301 release 04.09.01(31) and CODESYS 3.5.21.5, not the complete
installed script/build dependency set.

| Operation | Actual source contract | Exact unresolved boundary |
| --- | --- | --- |
| Docker activation | [Home variant](https://github.com/WAGO/cc100-firmware-sdk/blob/b2a09cc66ad07af54a34701d6cfc90f31aca5cd0/ptxproj/projectroot/etc/config-tools/config_docker_home) extracts the vendor archive into `/home/wago-docker`; [root variant](https://github.com/WAGO/cc100-firmware-sdk/blob/b2a09cc66ad07af54a34701d6cfc90f31aca5cd0/ptxproj/projectroot/etc/config-tools/config_docker_root) assumes root-installed binaries. `activate` moves `S99_docker`, enables routing if disabled and enables/adds a Docker MAC whitelist rule. | Need matching tool/getter pair, archive/build identity, helpers/events, and prior boot/routing/firewall state. `deactivate` leaves forwarding enabled and can disable a previously enabled rule; `remove` deletes Docker data. Neither is an inverse. |
| Daemon lifecycle | [Init script](https://github.com/WAGO/cc100-firmware-sdk/blob/b2a09cc66ad07af54a34701d6cfc90f31aca5cd0/ptxproj/projectroot/etc/init.d/dockerd) implements start/stop/restart. Start changes `WAGO_DOCKER_IPT`; stop dispatches every networking event. Final echoes can mask failure. | Complete event identity and restoration are missing. The byte-identical executable fixture proves these effects; mocked LSB semantics cannot authorize activation. |
| Boot and permissions | [rcS](https://github.com/WAGO/cc100-firmware-sdk/blob/b2a09cc66ad07af54a34701d6cfc90f31aca5cd0/ptxproj/projectroot/etc/init.d/rcS) runs `run-parts -a start /etc/rc.d`. The [bundled kernel](https://github.com/WAGO/cc100-firmware-sdk/blob/b2a09cc66ad07af54a34701d6cfc90f31aca5cd0/ptxproj/src/linux-6.6.94-rt56-w05.08.01-gaa7927dc8052.tgz) defines DOUT 0644 and DIN read-only. | A persistent grant needs numeric GID allocation, exact attributes, protected paths and boot identity, with an explicit container-start failure gate. Ordering a hook before Docker does not stop later hooks after failure. Grant/restore code is not implemented. |
| CODESYS preservation | [config_runtime](https://github.com/WAGO/cc100-firmware-sdk/blob/b2a09cc66ad07af54a34701d6cfc90f31aca5cd0/ptxproj/projectroot/etc/config-tools/config_runtime) can delete `/home/codesys/*` when selecting runtime 0. [Runtime init](https://github.com/WAGO/cc100-firmware-sdk/blob/b2a09cc66ad07af54a34701d6cfc90f31aca5cd0/ptxproj/projectroot/etc/init.d/runtime) stop avoids that reset but may SIGKILL. | No consistent retained-memory checkpoint contract was established. Deployed init has build substitutions; a template hash is insufficient. Preserve application target, selection and boot link. |
| Backup/restore | [save_partition.sh](https://github.com/WAGO/cc100-firmware-sdk/blob/b2a09cc66ad07af54a34701d6cfc90f31aca5cd0/ptxproj/projectroot/usr/sbin/save_partition.sh) backs much of `/home`, excluding Docker; [restore_partition.sh](https://github.com/WAGO/cc100-firmware-sdk/blob/b2a09cc66ad07af54a34701d6cfc90f31aca5cd0/ptxproj/projectroot/usr/sbin/restore_partition.sh) deletes `/home/*`, including excluded directories. | This is not a quiescent PLC checkpoint or a scoped Docker rollback. `reboot=0` only suppresses final reboot. |
| Unique keys | [Bundled Dropbear 2025.88](https://github.com/WAGO/cc100-firmware-sdk/blob/b2a09cc66ad07af54a34701d6cfc90f31aca5cd0/ptxproj/src/dropbear-2025.88.tar.bz2): `svr-authpubkey.c` resolves home; `svr-authpubkeyoptions.c` implements restrictions; `svr-runopts.c` and `common-runopts.c` implement `-V`. | Implemented additive subset requires successful new-key authentication. It does not create an account or restrict host privileges. |
| Root/password restriction | [config_ssh](https://github.com/WAGO/cc100-firmware-sdk/blob/b2a09cc66ad07af54a34701d6cfc90f31aca5cd0/ptxproj/projectroot/etc/config-tools/config_ssh) documents `root-access-state=disabled password-request-state=disabled`. [Dropbear init](https://github.com/WAGO/cc100-firmware-sdk/blob/b2a09cc66ad07af54a34701d6cfc90f31aca5cd0/ptxproj/projectroot/etc/init.d/dropbear) maps these to `-w`/`-s`. | Init sources a shell config/helper, can generate host keys and runs SSH events. Their FW31 identity, reboot-safe rollback, fresh negative authentication probes and narrow privileged executor are missing. Stock [CC100 sudoers](https://github.com/WAGO/cc100-firmware-sdk/blob/b2a09cc66ad07af54a34701d6cfc90f31aca5cd0/ptxproj/projectroot.cc100/etc/sudoers) does not provide arbitrary `sudo sh -c`. |
| WBM/services | [config_port](https://github.com/WAGO/cc100-firmware-sdk/blob/b2a09cc66ad07af54a34701d6cfc90f31aca5cd0/ptxproj/projectroot/etc/config-tools/config_port) delegates HTTP/FTP/FTPS to `config_ssl`, SNMP to `config_snmp`; [config_iocheckport](https://github.com/WAGO/cc100-firmware-sdk/blob/b2a09cc66ad07af54a34701d6cfc90f31aca5cd0/ptxproj/projectroot/etc/config-tools/config_iocheckport) edits/restarts inetd. | HTTP disable switches Lighttpd to HTTPS; WBM remains available. Separate service configuration, reload/events and recovery are required; these commands alone do not establish a full exposure baseline. |

The Docker investigation reached compiled dependencies as well:
[GetActivePartitionMedium](https://github.com/WAGO/cc100-firmware-sdk/blob/b2a09cc66ad07af54a34701d6cfc90f31aca5cd0/ptxproj/local_src/config-tools/get_filesystem_data_common.c#L740)
invokes `get_device_data medium`. Firewall code has additional rules, schemas,
scripts and events. CC100 `board_specific_defines` contains the build substitution
`@CT_EXTENSION_PREFIX@`. Source-template hashes and unknown FW31 compiled-binary
hashes cannot establish matching installed implementations.

### Minimal additional read-only capture (historical)

The smallest offline input is the official `Firmware_CC100_040901_31.zip`,
277551981 bytes, publisher SHA-256
`8fd32f96c3aa180aea72b71286e2e624e16b157c7d4ff5e96519acb5bdd41451`.
[WAGO's artifact metadata](https://downloadcenter.wago.com/api/ArtifactDetails/moln38txl7pphd17yug/en)
identifies this image/WAGOupload archive. The independent release investigation
obtained an empty `href` from anonymous `/api/download` and verified that the
official frontend requires authenticated Premium access before download. A later
independent review received HTTP 403 for metadata and could not reconfirm that
earlier response. No archive
bytes or credentials were obtained. An authorized download into a temporary directory
would permit digest verification and selective non-executing image inspection,
without device access. A publisher checksum is not a locally verified checksum.

The exact missing deployed bytes/build identities are tied to these source calls:

- Docker home script [line 23](https://github.com/WAGO/cc100-firmware-sdk/blob/b2a09cc66ad07af54a34701d6cfc90f31aca5cd0/ptxproj/projectroot/etc/config-tools/config_docker_home#L23)
  sources the tool library; line 65 calls the compiled filesystem helper; lines
  76, 104–109 and 186–198 extract binaries, move the boot link, configure routing
  and apply firewall rules. `config_tool_defines` [line 58](https://github.com/WAGO/cc100-firmware-sdk/blob/b2a09cc66ad07af54a34701d6cfc90f31aca5cd0/ptxproj/projectroot/etc/config-tools/config_tool_defines#L58)
  additionally sources the board-specific generated file. The filesystem helper's
  [line 780](https://github.com/WAGO/cc100-firmware-sdk/blob/b2a09cc66ad07af54a34701d6cfc90f31aca5cd0/ptxproj/local_src/config-tools/get_filesystem_data_common.c#L780)
  invokes `get_device_data`; matching only the shell entry point cannot gate this path.
- Dropbear init [lines 19 and 100–132](https://github.com/WAGO/cc100-firmware-sdk/blob/b2a09cc66ad07af54a34701d6cfc90f31aca5cd0/ptxproj/projectroot/etc/init.d/dropbear#L19)
  sources daemon config and the init helper, optionally runs `setup_ssh_keys`,
  and dispatches SSH events. Their actual FW31 content/absence and the effective
  account/PAM/sudo policy are needed before a lockout-safe restriction transaction.
- Boot init [line 23](https://github.com/WAGO/cc100-firmware-sdk/blob/b2a09cc66ad07af54a34701d6cfc90f31aca5cd0/ptxproj/projectroot/etc/init.d/rcS#L23)
  runs all rc.d entries; [build rules 78–91](https://github.com/WAGO/cc100-firmware-sdk/blob/b2a09cc66ad07af54a34701d6cfc90f31aca5cd0/ptxproj/rules/initmethod-bbinit.make#L78)
  select alternative init files and render inittab. The actual selected/rendered
  FW31 files, boot links and permission ownership are the missing persistence gate,
  rather than a guessed compatibility hash of an unrendered template.
- Runtime init [lines 304–305 and 370–382](https://github.com/WAGO/cc100-firmware-sdk/blob/b2a09cc66ad07af54a34701d6cfc90f31aca5cd0/ptxproj/projectroot/etc/init.d/runtime#L304)
  can SIGKILL, substitutes the runtime cgroup operation and dispatches CODESYS events.
  Neither those templates nor the archive alone proves a retained-memory checkpoint;
  that needs the corresponding runtime's documented retention/backup contract.

These known FW30 contracts support further implementation once the complete gate
can be specified. They are not assertions that the commands are intrinsically
unsafe or that hardware testing must precede software. The current code does not
yet implement those lifecycle, permission or restriction transactions.

For a separately authorized pinned SSH session only; no controller was accessed.
Start with identity and these dependency fingerprints. A mismatch needs only that
vendor script's source and newly identified dependencies, not a complete dump.

```sh
awk '/^(VERSION|VERSION_ID|PTXDIST_PLATFORM_NAME)=/' /etc/os-release
uname -r
ps -eo comm=
sha256sum /etc/config-tools/config_docker /etc/config-tools/get_docker_config \
  /etc/config-tools/config_tool_lib /etc/config-tools/config_tool_defines \
  /etc/config-tools/board_specific_defines /etc/config-tools/config_routing \
  /etc/config-tools/config_routing_lib /etc/config-tools/get_filesystem_data \
  /etc/config-tools/get_device_data /etc/config-tools/firewall \
  /etc/init.d/dockerd /opt/wago-docker/sbin/iptables \
  /usr/bin/docker /usr/bin/dockerd /etc/init.d/rcS /etc/inittab
ls -ldn /etc/rc.d/S99_docker /etc/rc.d/disabled/S99_docker \
  /etc/rc.d/S98_runtime /home/codesys \
  /sys/devices/platform/soc/44009000.spi/spi_master/spi0/spi0.0/din \
  /sys/kernel/dout_drv/DOUT_DATA
readlink /etc/rc.d/S99_docker
readlink /etc/rc.d/disabled/S99_docker
readlink /etc/rc.d/S98_runtime
readlink /home/codesys
awk -F: '$3 == 10001 { print "uid10001-occupied" }' /etc/passwd
awk -F: '$3 == 10001 { print "gid10001-occupied" }' /etc/group
```

Also capture numeric ownership/mode of the scripts and parent directories;
filenames/hashes of networking and firewall/iptables events; only Docker
data-root/logging, routing general state and Docker-matching MAC whitelist entries.
Do not invoke unknown binaries with guessed `--help` or run getters before
checking their source.

For SSH, hash `config_ssh`, `get_ssh_config`, `init.d/dropbear`, the resolved daemon,
`/lib/init/initmethod-bbinit-functions.sh`, optional `setup_ssh_keys` and SSH events.
Read only `ROOT_LOGIN`, `ROOT_PASSWORD_LOGIN`, `PASSWORD_LOGIN`,
`LOCAL_PORT_FORWARDING`, `REMOTE_PORT_FORWARDING`, `ANY_HOST_FORWARD` and
`DROPBEAR_PORT` from `dropbear.conf`; do not source it. Capture the intended
account's numeric UID/GIDs, home/shell and effective sudo rules without password
fields. For CODESYS, capture runtime-script and `runtimes.conf` hashes, selection
in `/etc/specific/rtsversion` and link metadata. `get_runtime_config` is not a
read-only capture: its common helper can create `runtimes.conf`.

No keys, passwords, application archives, process arguments, environments or broad
logs are needed. These captures establish implementation/state identity. Hardware
reboot, power-loss, retained-state and physical I/O proof remain separate.
