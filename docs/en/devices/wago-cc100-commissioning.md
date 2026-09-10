# Guided WAGO CC100 Commissioning

> **Work in progress.** This is the operator walkthrough for the current guided commissioning implementation. It is not a hardware release procedure: [ATT-984](https://linear.app/attraccess/issue/ATT-984/validate-the-four-wago-package-assemblies) remains the hardware-in-the-loop release gate. Keep the controller disconnected from production equipment until that evidence is complete.

Use this guide to commission a WAGO CC100 `751-9301` into an on-premises, air-gapped Attraccess installation. The local Attraccess server and controller must be on the same private network.

## Safety boundary

The CC100 runtime is not safety rated. It is not an emergency stop, personnel-protection function, or replacement for certified safety circuits. Keep safety circuits independent of the controller and verify the physical assembly under ATT-984 before release.

## What Attraccess does and does not do

Attraccess uses an SSH-only commissioning flow. WAGO Web-Based Management (WBM) is **not** part of normal commissioning:

- The browser does not automate, proxy, or bypass WBM, its certificate handling, or its credentials.
- Attraccess does not discover controllers on a subnet. Entering a private controller IP address is advisory only; it is not proof of identity.
- Before authorizing delivery, compare the selected controller's physical label and service-network location with the target controller, then obtain its SSH fingerprint from a trusted inventory or an authorized technician over an independent channel. Copying the scanned fingerprint back into the form is not independent identity authentication. Do not assume the CC100 displays its SSH fingerprint.
- USB-C service access and WBM are break-glass recovery paths only. Use WAGO's firmware-specific recovery instructions locally when SSH is unavailable; do not use WBM to work around an Attraccess commissioning error.

The installed WAGO plugin verifies the pinned host key and its signed runtime release, prepares the supported platform, transfers the release over SSH and starts enrollment. Preparation uses the firmware-installed vendor Docker tools and establishes persistent access to only the required digital registers. The captured FW31 vendor `install` action downloads or extracts no engine; missing Docker binaries remain unsupported. The controller never needs an image registry or Internet connection for installation.

**Destructive commissioning (2026-09-06):** existing applications and workloads may stop working or be erased. Attraccess does not preserve, back up, or restore preexisting CODESYS applications, retained PLC data, other workloads or their host settings. It always stops and permanently disables CODESYS, verifying both process and boot state before granting I/O. If this cannot be verified, installation fails before enrollment/runtime launch. The [earlier preservation decision](wago-fw31-support.md) is retained as superseded history.

## Preconditions

- Confirm the controller order number is `751-9301` and it is on a private IPv4 network: `10.0.0.0/8`, `172.16.0.0/12`, or `192.168.0.0/16`.
- Confirm the supported firmware baseline in **WAGO controllers**. The current default baseline is WAGO CC100 firmware `31`; BSP version `2024.12.0` alone does not identify that firmware. See [FW31 support boundaries](wago-fw31-support.md) for source compatibility and qualification limits.
- Configure the target local MQTT server with the transport and TLS settings required by the deployment. Attraccess uses those settings for the commissioned runtime.
- Initial installation uses the factory **root** SSH account unless **Use different SSH credentials** is selected. The FW31 **admin** account can log in over SSH but is not permitted to run commissioning commands with `sudo`.
- Custom SSH identities need root or non-interactive `sudo` access. The API verifies access and inspects controller prerequisites automatically before preparation. Credentials are cleared from the UI after submission or closing and retained encrypted by the server for an explicit retry. Enrollment does not change the root password or establish management hardening.
- Install the WAGO plugin release that includes the CC100 runtime. The plugin verifies its packaged `.tar`, checksum and signature before it becomes available; no runtime download, upload, selection, server path, environment variable, signing key, JSON or command line is needed from the operator.
- Ensure the controller can reach the selected local MQTT broker. No external registry, DNS, or Internet access is required or used.

## Commission a controller

1. Open **WAGO controllers** and select **Commission controller**.
2. Enter a **Controller name**, then select **Continue**.
3. Enter the **Controller IP address** and select the local **MQTT server**. Verify the physical controller label and its network location, then select **Scan controller for review**. The session pins the signed runtime bundled with the installed WAGO plugin; later server upgrades do not change this job or its retries.
4. Compare the scanned Ed25519 fingerprint with an independent trusted record and select **Confirm host key**. Alternatively, explicitly attest the physical label and a service network with only that controller attached. This alternative is first-key pinning on an isolated connection, not independent cryptographic authentication; do not use it on a shared LAN.
5. Review the pinned release and **Destructive installation** warning. Installation automatically inspects firmware, register access, output ownership and Docker status before changing the controller. Active or boot-enabled CODESYS and missing runtime permissions are conditions preparation must resolve. Unsupported firmware/components, missing registers and independent output writers still block installation.
6. For a controller with changed factory access, select **Use different SSH credentials** and enter its **Temporary SSH username** and **Temporary SSH password**. Otherwise initial installation uses factory root access. Make connected equipment safe for interruption, select the consequence confirmation and **Install runtime**. This approves permanent CODESYS disablement and possible loss of existing applications/data without backup or restoration by Attraccess. Closing or submitting clears credentials and consent from the form.
7. Enrollment proceeds automatically through delivery, supervisor verification, permanent MQTT credentials, bootstrap revocation, initial configuration and runtime readiness. **Enrollment complete** is 100%. The server continues reconciliation even if the browser closes. **Configure inputs and outputs** is an optional subsequent workflow, not a requirement to finish enrollment.

The saved progress describes each installation stage. Uploading all bytes is not completion: the controller reports checksum verification, image loading, startup and supervisor checks separately. Finalization waits on the controller lock with a bounded timeout rather than repeatedly racing the supervisor over SSH. Restarting Attraccess does not automatically start another destructive installation; **Retry installation** reconciles retained installation/preparation receipts and uses the saved encrypted SSH credential without separate cleanup controls.

### Delivery diagnostics

Failures identify the operation and observed cause: SSH authentication rejection, a denied `sudo` operation, a refused connection, a missing controller command, a failed CODESYS/Docker operation, or insufficient storage with required and available KiB. The API saves firmware, Docker and I/O prerequisite observations automatically during installation. Read-only inspection failures do not require controller-operation recovery. Failures after remote mutations retain the operation lease when completion is uncertain, while preserving the original failure in the HTTP response and saved session.

Delivery uploads the verified bundle once into a private, session-owned directory on `/tmp` and streams its image member directly into Docker. `/etc` and `/var/lib` hold only small configuration and journal files. Preflight budgets the bundle on `/tmp`, Docker's loading reserve on its discovered storage filesystem, and 16 MiB of headroom per filesystem. Both archive-extraction and Docker-load failures stop installation; successful delivery or explicit recovery removes the owned temporary upload. Existing signed bundles and session pins remain usable with this delivery path.

The release packager also gzip-compresses the Docker image payload before signing new releases, reducing transfer size further. Docker loads either compressed or uncompressed image members directly.

During delivery, Attraccess rechecks the pinned SSH key with strict host-key checking and verifies the runtime bundle checksum and signature on the local server. Installation journals protect operation integrity and cleanup; they are not a backup service for preexisting workloads. A new enrollment receives fresh runtime storage rather than silently reusing revoked credentials. Environment files are staged with mode `0600`; private CA trust uses a separate read-only bind mount from a protected host directory.

CODESYS disablement is configured to persist across reboot. Host supervision rechecks disablement, exclusive ownership and narrow register access before every runtime start, including bounded crash retries. Docker automatic restart is disabled. The supervisor also checks a running runtime and attempts to stop it if ownership cannot be verified. Failed checks or exhausted retries latch the runtime disabled. Resolving the cause or rebooting alone does not clear that latch; use [cleanup and recommissioning](#recover-after-latched-containment). Software verification of that mechanism does not replace physical reboot and I/O acceptance.

## MQTT claim and Ready state

After runtime delivery, the controller uses a restricted enrollment credential to announce through the selected local MQTT broker. Attraccess sends permanent controller-scoped credentials. Publication of that claim is not proof that the runtime has reconnected or that the enrollment credential has been revoked.

The server revisits discovery received during delivery, so an early announcement cannot be lost at the state transition. A new controller receives an inert configuration with no logical outputs; existing published configuration and unreviewed user drafts are not overwritten. The session becomes **Enrollment complete** only after a fresh permanent heartbeat, enrollment revocation, applied Desired/Reported Configuration and a matching fresh runtime `state.readiness` probe. A stale or mismatched probe is not ready. Management hardening and physical qualification remain separate: completed enrollment is not a hardened-device or physical acceptance claim.

### Management security

The **Management security** panel provides inspection, review, apply and recovery. Inspection reports firmware, SSH implementation and possible management listeners without changing access. The built-in provider supports reversible additive key enrollment for an existing non-root OpenSSH account or a detected running Dropbear 2025.88 account. It creates a unique key with forwarding and PTY disabled, encrypts its private material in Attraccess, arms rollback and verifies a separate pinned key-only connection. Private key material is passed through a dedicated short-lived agent rather than written to a temporary key file. Existing account privileges and other login methods remain enabled.

Adding a key leaves existing passwords/default access unchanged and does **not** count as hardened. Remaining WBM/service exposure and unqualified privileges are explicit residuals. A full baseline cannot be applied until its firmware-31 commands, minimum privileges and reboot-safe recovery are qualified. The framework orders key verification before restriction and supplies the verified key for post-restriction checks; it never invents vendor commands. No mandatory WBM setup gate is introduced.

### Configuration Readiness Limitation

The complete no-code configuration journey is owned by ATT-1058 and must be verified in the integrated build. The following endpoints are **developer integration references only**, requiring `resources.update`; their use does not satisfy ATT-984:

1. Save the complete Desired Configuration to `POST /api/wago/controllers/:id/configuration/draft` with `{ "snapshot": { ... } }`. A draft saved through the UI is also valid input to the following steps.
2. Validate it with `POST /api/wago/controllers/:id/configuration/validate`. Stop and correct every returned validation error.
3. Review the resulting changes with `POST /api/wago/controllers/:id/configuration/review`. Confirm the returned `diff` is intended and retain the returned draft `reviewedHash`.
4. Publish the reviewed draft with `POST /api/wago/controllers/:id/configuration/publish`. Record the returned `revision` and `contentHash`; Attraccess publishes that Desired Configuration to the controller.
5. Poll `GET /api/wago/controllers/:id/configuration/revisions` until the recorded revision has `state: "applied"`, a non-empty `reportedAt`, and the same `contentHash` returned at publish. If its state is `rejected`, stop, correct the complete Desired Configuration, and repeat the workflow with a new revision.

Also confirm a current heartbeat and the expected runtime version. An applied configuration report proves acceptance of that revision, not physical hardware readiness or output feedback. Do not operate equipment based on an API response alone. Verify the integrated diagnostics and configuration screens in the exact tested build, and record physical/nontechnical evidence using [WAGO Acceptance Evidence](wago-acceptance-evidence.md).

## Recovery

| Situation                                   | Operator action                                                                                                                                                                                                                        |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| IP is rejected                              | Use a valid private IPv4 address and confirm it belongs to the physically selected CC100.                                                                                                                                              |
| SSH key cannot be scanned or does not match | Stop. Recheck the controller label, address, and trusted fingerprint. A changed key must not be accepted blindly. Use local USB-C/WBM recovery only to restore the controller's supported SSH access.                                  |
| SSH authentication or `sudo` fails          | Correct the customer-supplied temporary credential or its privilege. Select **Retry installation** only after the controller is reachable.                                                                                             |
| Model or firmware is unsupported            | Do not proceed. Restore the supported firmware through the customer-operated WAGO recovery process, then start a new session.                                                                                                          |
| Docker activation fails                     | Collect the session error and controller logs. Repair Docker using the WAGO-supported local procedure; do not install an alternative container engine.                                                                                 |
| Bundled runtime is unavailable              | Stop. Install a complete WAGO plugin release that includes the approved signed runtime. Do not bypass verification or copy an image from a registry.                                                                                   |
| Delivery fails                              | Open **View progress**, record the displayed failure reason, restore reachability or prerequisites, then select **Retry installation**. If credential revocation needs attention, resolve that condition before retrying.              |
| Controller does not connect or claim        | Verify local MQTT reachability and broker selection, then inspect the controller runtime logs through the secured SSH path. The enrollment credential expires after 15 minutes; cancel the session and create a new one if it expires. |
| Initial configuration is rejected           | Correct the complete Desired Configuration, then validate, review, and publish a new revision through the configuration API. Do not edit the controller state file by hand.                                                            |

Select **Cancel enrollment** only to abandon the session. It revokes the enrollment credential and deletes the Attraccess commissioning session. Removing a controller from Attraccess also revokes its MQTT access, but does not uninstall the runtime from the CC100.

**Retry installation** automatically reconciles a retained installation, preparation journal and bootstrap credentials before continuing. No separate cleanup approval or repeated credential entry is needed. Cleanup cannot reverse broker-side credential revocation, restore preexisting applications/data or host settings, or re-enable CODESYS. An incomplete cleanup retains its ownership record for the next retry.

Cleanup remains failed if Attraccess cannot verify that the owned runtime stopped or was removed. An unreachable Docker daemon does not prove the container stopped. Once the supported local service is observable, **Retry installation** repeats the automatic cleanup; the failure record remains until verification succeeds. If a server restart revoked the bootstrap identity, retry reinstalls with fresh credentials rather than accepting a running container that can no longer enroll.

### Recover after latched containment

An ordinary Docker-daemon restart can recover through host supervision while
runtime enablement remains present. Failed checks or exhausted retries remove
that enablement and latch startup disabled. An offline heartbeat alone does not
identify which case occurred. Rebooting does not clear the latch.

After resolving the cause, use the existing wizard controls for a current guided
installation with retained recovery ownership:

1. For an unclaimed failed session, open **View progress** and select **Retry
   installation**. Attraccess reconciles retained runtime/preparation ownership,
   cleans up the interrupted attempt and installs using fresh bootstrap credentials.
2. If the controller was already claimed, **Remove
   controller**, then select **Commission controller** and complete a new session.
   Registration removal also removes its configuration; configure and verify the
   new installation before use.

Installation recreates enablement only through the verified preparation/delivery
flow. This route needs no shell or re-enable control. Cleanup cannot succeed without
valid retained ownership and observable container stop/removal; if the cleanup
ownership is unavailable or recovery remains unverified, keep the installation
blocked and obtain support rather than bypassing the latch. A successful hook exit
is not proof of a running runtime; fresh readiness and physical qualification
remain separate requirements.

If Attraccess restarts during claim publication, a saved `claimed` controller record alone does not prove permanent credentials were delivered. **Claim recovery required** blocks automatic reinstallation and preserves the verifier until explicit recovery. After recovering a claimed or interrupted-claim installation, remove its existing controller registration and create a new commissioning session; the UI does not offer an unusable retry with a cleared verifier.

**Clean up controller preparation** handles preparation-only failures with fresh credentials and explicit approval. If runtime installation began, use **Clean up failed installation** first. Cleanup does not undo vendor Docker networking/storage changes or restore previous workloads. Historical journals still require valid ownership and integrity checks; missing or inconsistent records do not prove cleanup succeeded. **Recover saved access** remains the separate management-key recovery action. Registration removal is serialized with these operations and retains unresolved records. Merely inspecting management never makes cancellation require rollback.

An interrupted coordinator has a durable operation lease. It is never silently stolen on restart. The UI shows the safe recovery time; after the previous instance has stopped, explicit recovery uses fresh credentials to check that device locks are idle before releasing the expired lease. This releases coordination ownership only, not runtime or management snapshots.

## Current release limitations

### Integration contract

- Installation and recovery endpoints require `{ confirmInstall: true }`; an optional `temporarySsh: { username, password }` overrides the factory/enrolled credential for that request. The recovery endpoint is `POST /api/wago/commissioning/sessions/:id/recover`.
- `GET /api/wago/commissioning/sessions/:id/verification` returns non-secret `controllerId`, `permanentConnection`, `enrollmentRevoked`, `configurationApplied`, `managementHardening`, `hardwareReadiness`, `softwareReady`, `physicalQualification` and `ready` fields. Configuration application alone is not hardware readiness. `ready` stays false while physical qualification is required.
- Runtime uses a fresh `/var/lib/attraccess-wago` per enrollment. Private CA trust uses `NODE_EXTRA_CA_CERTS=/var/lib/attraccess-wago/mqtt-ca.pem` with an additional read-only bind mount; runtime code must not replace or bypass that trust. Cleanup journals do not promise preservation of previous workloads.
- ATT-1056 must supply qualified device permissions/mounts and runtime health evidence before commissioning can advertise physical readiness. The installer does not invent GPIO mappings or add privileged hardware access.
- A durable fingerprint-scoped lease serializes cooperating coordinator processes, and one remote `flock` spans transfer/staging/replacement. Guard checks propagate through broker enrollment, claim, revocation and removal continuations. This is serialization, not a cross-system database/broker/SSH transaction.
- Compose ATT-983 / PR #1802's shared `context.audit` bridge; this code supplies no second audit sink. Automatic claim carries the persisted authenticated initiator. For HTTP unclaim, keep its single audit wrapper inside `removeControllerSafely(id, assertOwned => audit.run(..., () => wago.remove(id, assertOwned)))`, not before lease acquisition. Audit receipt availability is independent of operation success; no durable storage is invented when the host reports unavailable.

Current software behavior and remaining release limits:

- Additive, verified key enrollment for an existing non-root OpenSSH or detected Dropbear 2025.88 account is implemented. Firmware-specific account creation, password/default credential removal and root-login restrictions are not implemented; complete dependency gates and lockout-safe restoration are still required.
- The signed runtime is packaged with every WAGO plugin release. Release engineering verifies its checksum, SSHSIG, manifest compatibility and immutable image reference before the plugin registers it. The publishing workflow requires ATT-1056's profile-aware runtime to be integrated before producing these releases.
- Preexisting CODESYS/workload preservation and restoration are outside product scope. Unique minimum-privilege SSH management access and the remaining management-service baseline still require implementation and firmware-31 qualification; their status must not be presented as a blanket Docker/I/O blocker.
- Container start is not success evidence. Fresh permanent heartbeat and matching runtime readiness/configuration probes are required, followed by physical qualification.
- The current runtime deployment remains subject to the image digest, least-privilege model, and hardware verification evidence documented in [WAGO CC100 Docker Runtime](wago-cc100-runtime.md).

Do not use these gaps as reasons to bypass host-key, bundle, or MQTT credential verification. Escalate them through the release process and attach hardware evidence to [ATT-984](https://linear.app/attraccess/issue/ATT-984/validate-the-four-wago-package-assemblies).
