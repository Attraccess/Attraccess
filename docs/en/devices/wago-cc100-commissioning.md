# Guided WAGO CC100 Commissioning

> **Work in progress.** This is the operator walkthrough for the current guided commissioning implementation. It is not a hardware release procedure: [ATT-984](https://linear.app/attraccess/issue/ATT-984/validate-the-four-wago-package-assemblies) remains the hardware-in-the-loop release gate. Keep the controller disconnected from production equipment until that evidence is complete.

Use this guide to commission a WAGO CC100 `751-9301` into an on-premises, air-gapped Attraccess installation. The local Attraccess server and controller must be on the same private network.

## Safety boundary

The CC100 runtime is not safety rated. It is not an emergency stop, personnel-protection function, or replacement for certified safety circuits. Keep safety circuits independent of the controller and verify the physical assembly under ATT-984 before release.

## What Attraccess does and does not do

Attraccess uses an SSH-only commissioning flow. WAGO Web-Based Management (WBM) is **not** part of normal commissioning:

- The browser does not automate, proxy, or bypass WBM, its certificate handling, or its credentials.
- Attraccess does not discover controllers on a subnet. Entering a private controller IP address is advisory only; it is not proof of identity.
- Before authorizing delivery, compare the selected controller's physical label and service-network location with the target controller, then compare its SSH host-key fingerprint with the value available from that physical controller or a trusted inventory record.
- USB-C service access and WBM are break-glass recovery paths only. Use WAGO's firmware-specific recovery instructions locally when SSH is unavailable; do not use WBM to work around an Attraccess commissioning error.

The server verifies the host key, activates Docker, verifies a locally stored signed runtime bundle, transfers it over SSH, starts the runtime, and completes MQTT enrollment and claim. It never contacts an image registry or the Internet during commissioning.

## Preconditions

- Confirm the controller order number is `751-9301` and it is on a private IPv4 network: `10.0.0.0/8`, `172.16.0.0/12`, or `192.168.0.0/16`.
- Confirm the supported firmware baseline in **WAGO controllers**. The current default baseline is WAGO CC100 firmware `31`; the implementation also recognizes reported version `2024.12.0` for that baseline.
- Configure the target local MQTT server in Attraccess before creating a session.
- Obtain a temporary SSH username and password from the customer. These are entered for the delivery attempt and are not stored in the commissioning session, UI, or audit log.
- Ensure the temporary SSH identity can run the required commands. Non-root identities require `sudo` access. Do not treat the UI's currently prefilled `root` / `wago` values as approved credentials; replace them with customer-supplied credentials.
- Ensure the local Attraccess server is configured with an immutable `@sha256:` runtime image reference and the locally stored runtime bundle, checksum, and signature. Commissioning is disabled without all of these artifacts.
- Ensure the controller can reach the selected local MQTT broker. No external registry, DNS, or Internet access is required or used.

## Commission a controller

1. Open **WAGO controllers** and select **Commission controller**.
2. Enter a **Controller name**, then select **Continue**.
3. Enter the **Controller IP address** and select the local **MQTT server**. Verify the physical controller label and its network location before selecting **Start automatic commissioning**.
4. Attraccess scans the controller's Ed25519 SSH key and shows **Verify the controller SSH key**. Compare **Scanned SSH host-key fingerprint** with the physical controller or trusted inventory record, enter it exactly, and select **Confirm host key**.
5. Enter the customer-supplied **Temporary SSH username** and **Temporary SSH password**, then select **Start secure delivery**.
6. Watch the saved session in the controllers table or select **View progress**. It is safe to close the drawer while the session progresses.

The displayed stages are **Verifying controller identity**, **Checking runtime package**, **Stopping CODESYS** when it is active, **Activating Docker**, **Transferring runtime**, **Creating enrollment**, **Writing runtime configuration**, and **Starting runtime**.

During delivery, Attraccess rechecks the pinned SSH key with strict host-key checking, inspects the CC100 model and firmware, activates Docker with `/etc/config-tools/config_docker activate`, and verifies the runtime bundle checksum and signature on the local server. It transfers the bundle through the host-key-pinned SSH session, uses `docker load`, and replaces the `attraccess-wago` container. It writes controller identity and restricted enrollment MQTT credentials to `/etc/attraccess-wago/runtime.env` with mode `0600`.

If CODESYS is active, the current implementation stops it before commissioning. Confirm this interruption is acceptable for the installation before starting delivery.

## MQTT claim and Ready state

After runtime delivery, the session shows **Waiting for the controller to connect**. The controller uses a restricted, one-time enrollment credential to announce through the selected local MQTT broker. Attraccess then shows **Claiming automatically**, applies permanent controller-scoped credentials, and revokes the enrollment credential.

The session is **Claimed** when its progress says **Commissioning complete** and **The controller is claimed and ready to configure**. Claiming is not sufficient to operate equipment.

### Verify configuration readiness

The current **WAGO controllers** UI can save a configuration draft, but does not expose validation, review, publishing, revision history, or Reported Configuration verification. An authorized operator must complete the first configuration through the supported API before operating equipment. These endpoints require the `resources.update` permission:

1. Save the complete Desired Configuration to `POST /api/wago/controllers/:id/configuration/draft` with `{ "snapshot": { ... } }`. A draft saved through the UI is also valid input to the following steps.
2. Validate it with `POST /api/wago/controllers/:id/configuration/validate`. Stop and correct every returned validation error.
3. Review the resulting changes with `POST /api/wago/controllers/:id/configuration/review`. Confirm the returned `diff` is intended and retain the returned draft `reviewedHash`.
4. Publish the reviewed draft with `POST /api/wago/controllers/:id/configuration/publish`. Record the returned `revision` and `contentHash`; Attraccess publishes that Desired Configuration to the controller.
5. Poll `GET /api/wago/controllers/:id/configuration/revisions` until the recorded revision has `state: "applied"`, a non-empty `reportedAt`, and the same `contentHash` returned at publish. If its state is `rejected`, stop, correct the complete Desired Configuration, and repeat the workflow with a new revision.

Also confirm a current heartbeat and the expected runtime version in the controllers table. Do not operate equipment until all of this readiness verification has completed through the API; there is currently no controller detail view that can perform it.

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

## Current release limitations

This guide describes the implementation on `main`, not future intended behavior. The following are not yet implemented and must not be assumed:

- Attraccess does not create a unique non-root management identity, rotate SSH credentials, or disable root/password SSH login after delivery.
- Delivery replaces the `attraccess-wago` container but does not snapshot and automatically restore a previous container configuration on failure.
- Delivery starts the container but does not perform a container-health check before MQTT enrollment. Operators must verify the Ready criteria above.
- The current runtime deployment remains subject to the image digest, least-privilege model, and hardware verification evidence documented in [WAGO CC100 Docker Runtime](wago-cc100-runtime.md).

Do not use these gaps as reasons to bypass host-key, bundle, or MQTT credential verification. Escalate them through the release process and attach hardware evidence to [ATT-984](https://linear.app/attraccess/issue/ATT-984/validate-the-four-wago-package-assemblies).
