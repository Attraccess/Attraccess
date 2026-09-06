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

The server verifies the pinned host key and an imported signed runtime release, checks the platform, transfers the release over SSH and starts enrollment. Docker must already be running; automatic lifecycle changes remain blocked pending complete source-gated restoration support. The controller never needs an image registry or Internet connection for installation.

## Preconditions

- Confirm the controller order number is `751-9301` and it is on a private IPv4 network: `10.0.0.0/8`, `172.16.0.0/12`, or `192.168.0.0/16`.
- Confirm the supported firmware baseline in **WAGO controllers**. The current default baseline is WAGO CC100 firmware `31`; BSP version `2024.12.0` alone does not identify that firmware. See [FW31 support boundaries](wago-fw31-support.md) for missing software operations and the vendor evidence required.
- Configure the target local MQTT server with TLS and certificate verification enabled. Use the certificate DNS name as the broker hostname. Import the issuing CA PEM bundle in MQTT settings for a private CA; expired/not-yet-valid certificates require checking clocks and certificate renewal, not disabling verification.
- Obtain a temporary SSH username and password from the customer. These are entered for the delivery attempt and are not stored in the commissioning session, UI, or audit log.
- Ensure the temporary SSH identity can run the required commands. Non-root identities require `sudo` access. Credentials are never prefilled or guessed, and must be entered again for each install or recovery attempt.
- Obtain the signed runtime bundle from the official WAGO runtime build artifacts or your software distributor. Extract the download and select its `.tar`, `.sha256` and `.sig` files in **CC100 runtime release**. No server file path, environment variable, signing key, JSON or command line is needed. Only the built-in release signing key is trusted.
- Ensure the controller can reach the selected local MQTT broker. No external registry, DNS, or Internet access is required or used.

## Commission a controller

1. Open **WAGO controllers** and select **Commission controller**.
2. Enter a **Controller name**, then select **Continue**.
3. Enter the **Controller IP address**, select the local **MQTT server** and import/select the signed runtime release. Scanning is disabled while import is in progress. Verify the physical controller label and its network location, then select **Scan controller for review**. The session pins the selected digest; another administrator importing a release cannot change this job or its retries.
4. Compare the scanned Ed25519 fingerprint with an independent trusted record and select **Confirm host key**. Alternatively, explicitly attest the physical label and a service network with only that controller attached. This alternative is first-key pinning on an isolated connection, not independent cryptographic authentication; do not use it on a shared LAN.
5. **Inspect installation prerequisites** can show firmware, register access, output ownership and Docker status without changing the controller. If the supported action is **Start installed Docker runtime**, review and approve it with fresh credentials. Missing vendor packages or unqualified firmware transitions are reported, not guessed or redirected to WBM.
6. Enter the customer-supplied **Temporary SSH username** and **Temporary SSH password**, review the pinned release and replacement warning, and explicitly confirm installation. Select **Install runtime**. Installation repeats the preflight checks. Closing or submitting clears the password and consent; no system SSH-agent or factory-password fallback is used.
7. Watch the saved session in the controllers table or select **View progress**. Once claimed, **Configure inputs and outputs** opens the existing visual configuration editor and resets the commissioning drawer for the next controller.

The saved progress describes identity, package and controller preflight, transfer, enrollment, configuration and runtime installation. Restarting Attraccess never retries SSH with remembered or factory credentials.

During delivery, Attraccess rechecks the pinned SSH key with strict host-key checking and verifies the runtime bundle checksum and signature on the local server. The replacement installer retains the previous container, persistent data, environment and running state. A new enrollment receives fresh runtime storage rather than silently reusing revoked credentials. Environment files are staged with mode `0600`; private CA trust uses a separate read-only bind mount from a protected host directory.

An active CODESYS workload cannot be replaced until its firmware-specific backup/restore procedure is qualified. This is a recoverability blocker, not a mandatory WBM setup step. Do not stop a workload outside the reviewed installation action to bypass this blocker.

## MQTT claim and Ready state

After runtime delivery, the controller uses a restricted enrollment credential to announce through the selected local MQTT broker. Attraccess sends permanent controller-scoped credentials. Publication of that claim is not proof that the runtime has reconnected or that the enrollment credential has been revoked.

The session remains **Verification required**. The UI separately checks a fresh permanent heartbeat, enrollment revocation, applied Desired/Reported Configuration and a fresh matching runtime `state.readiness` probe. A stale or mismatched probe is not ready. Management status is read from its saved security transaction. Physical qualification remains required; no successful install, key enrollment or MQTT claim is hardware acceptance evidence.

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
| SSH authentication or `sudo` fails          | Correct the customer-supplied temporary credential or its privilege. Select **Retry delivery** only after the controller is reachable.                                                                                                 |
| Model or firmware is unsupported            | Do not proceed. Restore the supported firmware through the customer-operated WAGO recovery process, then start a new session.                                                                                                          |
| Docker activation fails                     | Collect the session error and controller logs. Repair Docker using the WAGO-supported local procedure; do not install an alternative container engine.                                                                                 |
| Bundle checksum or signature fails          | Stop. Replace the local artifact with the approved signed release. Do not bypass verification or copy an image from a registry.                                                                                                        |
| Delivery fails                              | Open **View progress**, record the displayed failure reason, restore reachability or prerequisites, then select **Retry delivery**. If credential revocation needs attention, resolve that condition before retrying.                  |
| Controller does not connect or claim        | Verify local MQTT reachability and broker selection, then inspect the controller runtime logs through the secured SSH path. The enrollment credential expires after 15 minutes; cancel the session and create a new one if it expires. |
| Initial configuration is rejected           | Correct the complete Desired Configuration, then validate, review, and publish a new revision through the configuration API. Do not edit the controller state file by hand.                                                            |

Select **Cancel enrollment** only to abandon the session. It revokes the enrollment credential and deletes the Attraccess commissioning session. Removing a controller from Attraccess also revokes its MQTT access, but does not uninstall the runtime from the CC100.

**Recover saved runtime** is a separate reviewed operation requiring fresh SSH credentials. It restores the retained container, environment and data and preserves the prior running/stopped state. It cannot reverse broker-side credential revocation or restore access for a controller removed from Attraccess. A failed or interrupted rollback retains its recovery journal for another explicit attempt. Recovery snapshots are not automatically discarded merely because the container started.

If Attraccess restarts during claim publication, a saved `claimed` controller record alone does not prove permanent credentials were delivered. **Claim recovery required** blocks automatic reinstallation and preserves the verifier until explicit recovery. After recovering a claimed or interrupted-claim installation, remove its existing controller registration and create a new commissioning session; the UI does not offer an unusable retry with a cleared verifier.

**Recover Docker provisioning** checks the saved journal after runtime recovery. It does not run vendor lifecycle commands. Any recorded start attempt remains unresolved: a stopped daemon does not prove that networking or boot effects were restored. Missing journals also retain the recovery requirement. Only a prepared journal with no recorded start attempt can be acknowledged after stopped-state and context checks. **Recover saved access** restores the management-key snapshot. Registration removal is serialized with these operations and retains their recovery records rather than deleting the only rollback token. Merely inspecting management never makes cancellation require rollback.

An interrupted coordinator has a durable operation lease. It is never silently stolen on restart. The UI shows the safe recovery time; after the previous instance has stopped, explicit recovery uses fresh credentials to check that device locks are idle before releasing the expired lease. This releases coordination ownership only, not runtime or management snapshots.

## Current release limitations

### Integration contract

- Installation and recovery endpoints require `{ confirmInstall: true, temporarySsh: { username, password } }` for that explicit request only. The recovery endpoint is `POST /api/wago/commissioning/sessions/:id/recover`.
- `GET /api/wago/commissioning/sessions/:id/verification` returns non-secret `controllerId`, `permanentConnection`, `enrollmentRevoked`, `configurationApplied`, `managementHardening`, `hardwareReadiness`, `softwareReady`, `physicalQualification` and `ready` fields. Configuration application alone is not hardware readiness. `ready` stays false while physical qualification is required.
- Runtime uses a fresh `/var/lib/attraccess-wago` per enrollment. The prior directory remains in the recovery journal. Private CA trust uses `NODE_EXTRA_CA_CERTS=/var/lib/attraccess-wago/mqtt-ca.pem` with an additional read-only bind mount; runtime code must not replace or bypass that trust.
- ATT-1056 must supply qualified device permissions/mounts and runtime health evidence before commissioning can advertise physical readiness. The installer does not invent GPIO mappings or add privileged hardware access.
- A durable fingerprint-scoped lease serializes cooperating coordinator processes, and one remote `flock` spans transfer/staging/replacement. Guard checks propagate through broker enrollment, claim, revocation and removal continuations. This is serialization, not a cross-system database/broker/SSH transaction.
- Compose ATT-983 / PR #1802's shared `context.audit` bridge; this code supplies no second audit sink. Automatic claim carries the persisted authenticated initiator. For HTTP unclaim, keep its single audit wrapper inside `removeControllerSafely(id, assertOwned => audit.run(..., () => wago.remove(id, assertOwned)))`, not before lease acquisition. Audit receipt availability is independent of operation success; no durable storage is invented when the host reports unavailable.

This guide describes the composed implementation before visual integration, not future intended behavior. The following are not yet implemented and must not be assumed:

- Additive, verified key enrollment for an existing non-root OpenSSH or detected Dropbear 2025.88 account is implemented. Firmware-specific account creation, password/default credential removal and root-login restrictions are not implemented; complete dependency gates and lockout-safe restoration are still required.
- The signed packager and visual importer are implemented. Existing server-configured two-member bundles retain their legacy delivery path, but new visual imports use the signed manifest format and hardware profile contract. The publishing workflow requires ATT-1056's profile-aware runtime to be integrated before producing these releases.
- Active CODESYS workload preservation, unique minimum-privilege SSH management access and the remaining management-service baseline require firmware-31 qualification.
- Container start is not success evidence. Fresh permanent heartbeat and matching runtime readiness/configuration probes are required, followed by physical qualification.
- The current runtime deployment remains subject to the image digest, least-privilege model, and hardware verification evidence documented in [WAGO CC100 Docker Runtime](wago-cc100-runtime.md).

Do not use these gaps as reasons to bypass host-key, bundle, or MQTT credential verification. Escalate them through the release process and attach hardware evidence to [ATT-984](https://linear.app/attraccess/issue/ATT-984/validate-the-four-wago-package-assemblies).
