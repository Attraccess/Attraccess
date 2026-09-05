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

The server verifies the host key, activates Docker, verifies a locally stored signed runtime bundle, transfers it over SSH, starts the runtime, and completes MQTT enrollment and claim. It never contacts an image registry or the Internet during commissioning.

## Preconditions

- Confirm the controller order number is `751-9301` and it is on a private IPv4 network: `10.0.0.0/8`, `172.16.0.0/12`, or `192.168.0.0/16`.
- Confirm the supported firmware baseline in **WAGO controllers**. The current default baseline is WAGO CC100 firmware `31`; the implementation also recognizes reported version `2024.12.0` for that baseline.
- Configure the target local MQTT server with TLS and certificate verification enabled. Use the certificate DNS name as the broker hostname. Import the issuing CA PEM bundle in MQTT settings for a private CA; expired/not-yet-valid certificates require checking clocks and certificate renewal, not disabling verification.
- Obtain a temporary SSH username and password from the customer. These are entered for the delivery attempt and are not stored in the commissioning session, UI, or audit log.
- Ensure the temporary SSH identity can run the required commands. Non-root identities require `sudo` access. Credentials are never prefilled or guessed, and must be entered again for each install or recovery attempt.
- Ensure the local Attraccess server is configured with an immutable `@sha256:` runtime image reference and the locally stored runtime bundle, checksum, and signature. Commissioning is disabled without all of these artifacts.
- Ensure the controller can reach the selected local MQTT broker. No external registry, DNS, or Internet access is required or used.

## Commission a controller

1. Open **WAGO controllers** and select **Commission controller**.
2. Enter a **Controller name**, then select **Continue**.
3. Enter the **Controller IP address** and select the local **MQTT server**. Verify the physical controller label and its network location before selecting **Start automatic commissioning**.
4. Attraccess scans the controller's Ed25519 SSH key and shows **Verify the controller SSH key**. Compare **Scanned SSH host-key fingerprint** with the physical controller or trusted inventory record, enter it exactly, and select **Confirm host key**.
5. Enter the customer-supplied **Temporary SSH username** and **Temporary SSH password**, review the interruption/replacement warning and explicitly confirm the installation. Select **Install runtime**. Closing or submitting clears the password and consent.
6. Watch the saved session in the controllers table or select **View progress**. It is safe to close the drawer while the session progresses.

The saved progress describes identity, package and controller preflight, transfer, enrollment, configuration and runtime installation. Restarting Attraccess never retries SSH with remembered or factory credentials.

During delivery, Attraccess rechecks the pinned SSH key with strict host-key checking and verifies the runtime bundle checksum and signature on the local server. The replacement installer retains the previous container, persistent data, environment and running state. A new enrollment receives fresh runtime storage rather than silently reusing revoked credentials. Environment files are staged with mode `0600`; private CA trust uses a separate read-only bind mount from a protected host directory.

An active CODESYS workload cannot be replaced until its firmware-specific backup/restore procedure is qualified. This is a recoverability blocker, not a mandatory WBM setup step. Do not stop a workload outside the reviewed installation action to bypass this blocker.

## MQTT claim and Ready state

After runtime delivery, the controller uses a restricted enrollment credential to announce through the selected local MQTT broker. Attraccess sends permanent controller-scoped credentials. Publication of that claim is not proof that the runtime has reconnected or that the enrollment credential has been revoked.

The session remains **Verification required**. The UI separately checks a fresh permanent heartbeat, enrollment revocation and applied Desired/Reported Configuration. Management hardening and physical hardware readiness remain explicitly unverified. No successful install or MQTT claim makes this firmware baseline production-ready.

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

## Current release limitations

### Integration contract

- Installation and recovery endpoints require `{ confirmInstall: true, temporarySsh: { username, password } }` for that explicit request only. The recovery endpoint is `POST /api/wago/commissioning/sessions/:id/recover`.
- `GET /api/wago/commissioning/sessions/:id/verification` returns non-secret `permanentConnection`, `enrollmentRevoked`, `configurationApplied`, `managementHardening`, `hardwareReadiness` and `ready` fields. The last three deliberately remain unverified/false until qualified checks are implemented. Configuration application alone is not hardware readiness.
- Runtime uses a fresh `/var/lib/attraccess-wago` per enrollment. The prior directory remains in the recovery journal. Private CA trust uses `NODE_EXTRA_CA_CERTS=/var/lib/attraccess-wago/mqtt-ca.pem` with an additional read-only bind mount; runtime code must not replace or bypass that trust.
- ATT-1056 must supply qualified device permissions/mounts and runtime health evidence before commissioning can advertise physical readiness. The installer does not invent GPIO mappings or add privileged hardware access.
- One remote `flock` spans transfer, staging and replacement. Broker provisioning is not transactional with SSH across multiple Attraccess processes; do not run concurrent commissioning coordinators against the same controller.

This guide describes the composed implementation before visual integration, not future intended behavior. The following are not yet implemented and must not be assumed:

- Attraccess does not create a unique non-root management identity, rotate SSH credentials, or disable root/password SSH login after delivery.
- Signed runtime artifacts still require server-side configuration; normal artifact packaging/visual import is an outstanding no-code release blocker.
- Active CODESYS workload preservation, unique minimum-privilege SSH management access and the remaining management-service baseline require firmware-31 qualification.
- Delivery starts the container but does not perform a container-health check before MQTT enrollment. Operators must verify the Ready criteria above.
- The current runtime deployment remains subject to the image digest, least-privilege model, and hardware verification evidence documented in [WAGO CC100 Docker Runtime](wago-cc100-runtime.md).

Do not use these gaps as reasons to bypass host-key, bundle, or MQTT credential verification. Escalate them through the release process and attach hardware evidence to [ATT-984](https://linear.app/attraccess/issue/ATT-984/validate-the-four-wago-package-assemblies).
