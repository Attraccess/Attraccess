# Matter: Commissioning, Sharing and Removal

<!-- llms-description: Add an IP-reachable Matter device to the Attraccess fabric, share it with another ecosystem and remove it: codes, steps, attestation, multi-admin. -->

> [!NOTE]
> Only available when the **Matter** plugin is installed. See [Installing Plugins](plugins/installing-plugins.md).

This page covers devices that are already on your network (Ethernet or Wi-Fi). Thread and Bluetooth commissioning are not part of it. It builds on the [administration page](plugins/matter/admin-ui.md), the [operator guide](plugins/matter/operator.md) and [Permissions](plugins/matter/permissions.md).

## Commissioning a device

Open **Devices → Matter → Commissioning**. The tab needs `matter.devices.commission`. It is a full page with four steps:

1. **Prepare device.** Power it on, connect it to the network and, if it was set up before, put it into pairing mode or get a sharing code from its other controller.
2. **Enter or scan code.** Use one of the input forms below, then **Start commissioning**.
3. **Progress.** Each protocol step is listed with its live state: **Finding the device**, **Secure pairing with the setup code** (PASE), **Reading the device**, **Checking the device certificate** (attestation), **Adding the device to the Attraccess fabric**, **Connecting securely** (CASE) and **Reading the device's endpoints**. **Cancel** stops the attempt after a confirmation.
4. **Name and finish.** Give the device a name and location and, if you like, names for its endpoints, then **Save and finish**. **Skip naming** is fine too; the device is already registered.

The device is created as **claimed** by the user who commissioned it. There is no separate claim step. A user with only `matter.devices.commission` can still name the device in step 4.

### Input forms

The code step offers three tabs. All of them lead to the same request:

- **Scan with camera.** The browser decodes the QR code. Browsers allow the camera only in a secure context, that is over HTTPS or on `localhost`. Over plain HTTP the tab says the camera is not available; use one of the other tabs.
- **Upload image.** Pick a picture of the QR code. It is decoded in your browser and never uploaded.
- **Type or paste.** Paste the QR payload (`MT:…`) or type the manual code: 11 or 21 digits. Spaces and hyphens are ignored.

A **sharing code** from another ecosystem (see [Multi-admin](#multi-admin)) is entered the same way as a setup code: scanned, uploaded or typed.

Attraccess checks the code in the browser first (the manual code's check digit, the `MT:` prefix). An invalid code is rejected immediately, before any request. The server checks it again.

### Setup codes are never stored

Setup and sharing codes exist only in memory. They travel in the body of a request, never in a URL, and are never written to the database, the audit log, logs, events, the browser storage or error messages. The page clears the code when the session ends or you leave it.

### When something goes wrong

Each failure has its own screen with what to do next. Nothing is left half-registered. The screens offer **Start again**, which goes back to the code step, and where it helps a button to the device or to **Devices**.

| Failure code           | Screen                                           | What it means                                                              | What to do                                                                                                                                                                                                                     |
| ---------------------- | ------------------------------------------------ | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `invalid_code`         | The setup code is not valid                      | The sidecar could not read the code                                        | Check the code and enter it again                                                                                                                                                                                              |
| `device_not_found`     | The device was not found                         | Nothing answered on the network                                            | Bring the device onto the same network as the sidecar, check that its pairing window is open, start again                                                                                                                      |
| `pase_failed`          | The code was not accepted                        | The device refused the passcode                                            | Check the code for typos, or open a new pairing window on the device; a used or expired sharing code needs a new one                                                                                                           |
| `attestation_failed`   | The device could not be verified                 | The device could not be proven genuine; the screen lists the finding types | See [Attestation](#attestation). Nothing was changed on the device                                                                                                                                                             |
| `already_commissioned` | This device is already in the Attraccess fabric  | The device already holds the Attraccess fabric. No new record is created   | The screen links to the existing record: open it, open it to repair it (detached) or open it to restore it (archived). If no record matches, run a reconciliation on **Devices**, or factory-reset the device and add it again |
| `fabric_full`          | The device has no room for another administrator | The device cannot hold another fabric                                      | Remove the device from one of its other controllers, or factory-reset it, and start again                                                                                                                                      |
| `case_failed`          | The secure connection failed                     | The device joined, but the secure reconnect (CASE) could not be completed  | Check that the device is on the network and start again                                                                                                                                                                        |
| `timeout`              | Commissioning took too long                      | The device did not finish in time                                          | Start again                                                                                                                                                                                                                    |
| `cancelled`            | Commissioning was cancelled                      | You cancelled                                                              | Start again                                                                                                                                                                                                                    |
| `interrupted`          | Commissioning was interrupted                    | The sidecar or the plugin restarted, or the connection dropped (see below) | Start again with the code. If the device had already joined, check **Devices**: it appears there as an unclaimed device                                                                                                        |
| `internal`             | Commissioning failed                             | An unexpected error stopped the attempt                                    | Start again                                                                                                                                                                                                                    |
| `needs_reconciliation` | The device joined but is not registered yet      | The device is in the fabric, but Attraccess could not record it            | Open **Devices**: after the next reconciliation the device appears there as an unclaimed device                                                                                                                                |
| `registry_failed`      | The device joined but could not be recorded      | The device is in the fabric, but Attraccess could not store it             | Open **Devices**: after the next reconciliation the device appears there as an unclaimed device                                                                                                                                |

Only one commissioning, removal or share runs at a time. A second start answers **busy**, and so do a backup, a restore or creating the fabric while one of them runs. While the fabric is in `recovery_required` (see [Backup and Recovery](plugins/matter/backup-restore.md)) nothing can be commissioned.

### Interruption means restart

A commissioning attempt is never resumed. If the sidecar restarts, the plugin restarts, the network drops or the attempt times out, it ends as **interrupted** and is audited. The device rolls back a partial setup by itself. Choose **Start again** and enter the code again. If the device was joined just before the interruption, check **Devices** first: after the next reconciliation it appears there as an **unclaimed** device.

### When the device is registered

A node is created only after the sidecar reports success **and** the plugin has read the node from the sidecar and written the node and its endpoints in one transaction. If the plugin cannot do that, the attempt ends as failed and the device shows up as an unclaimed device after the next reconciliation, never as a duplicate.

Every commissioning and every removal raises the fabric generation, so a [backup](plugins/matter/backup-restore.md) is taken automatically a short time later.

## Attestation

Attestation proves that a device is a genuine, certified product. Attraccess is **strict**: any error-level finding fails the attempt. That includes an untrusted manufacturer root (PAA), a broken certificate chain, signature or nonce, a revoked device, a test certificate and a Certification Declaration of type "test". If the trust store is unavailable and no seed exists, it fails as well. Warnings are allowed and recorded, by finding type only.

### Trust store

The sidecar ships with a snapshot of the production certificate roots of the CSA Distributed Compliance Ledger (DCL). It works offline from this seed. When the DCL is reachable, the sidecar refreshes the data (production entries only, test certificates are never accepted) and caches it in its storage. Set `MATTER_SIDECAR_DCL_REFRESH=false` to turn the refresh off. Revocation data is only as fresh as the last refresh or seed build. See the [operator guide](plugins/matter/operator.md#attestation-trust-store).

### Development override

Development devices usually carry test certificates and fail attestation. For this case an operator can enable `MATTER_SIDECAR_ALLOW_ATTESTATION_OVERRIDE=true` on the sidecar. It is off by default, and the sidecar logs a warning at start-up when it is on. **Keep it unset in production.**

With the flag on, the failed attestation screen offers **Add anyway (development override)**. It needs:

- the sidecar flag,
- `matter.devices.commission` **and** `matter.devices.manage`,
- an explicit risk confirmation for each attempt: tick **I understand the risk and want to add this device without verification** and choose **Add without verification**.

A failed attempt always ends. The override starts a **new** attempt with the confirmation. You do not enter the code again: the browser re-sends the code it still holds in memory from the failed attempt. It never stores it. The device is then registered with attestation **unverified** and the device page notes that it was overridden. The override is audited as a dangerous action with the finding types.

## Multi-admin

A Matter device can belong to several fabrics at once, for example Attraccess and a phone ecosystem.

- **Inbound.** To add a device that another ecosystem (Apple Home, Google Home, SmartThings, Home Assistant, …) already controls, use that ecosystem's "share" or "add to another app" function. It shows a sharing code. Enter it like any other code; the device must still be in its sharing window (a few minutes).
- **Outbound.** On a device's page, **Share with another controller** asks for a confirmation, then opens a commissioning window and shows a one-time manual code and QR code with a countdown. The page always opens the window for 3 minutes. The API (`POST /api/matter/nodes/:id/share` with `timeoutSec`) accepts 180 to 900 seconds and also defaults to 180. **Close window** ends it early, after which the code no longer works. The code is shown once and is neither stored nor logged. A removed device cannot be shared. Needs `matter.devices.commission`. Opening, closing and the end of the window are audited without the code.
- **Other administrators.** The device page lists the device's other fabrics read-only as **Managed outside Attraccess** (fabric index, vendor, label). Attraccess never attributes anything another fabric does to an Attraccess user.

## Removing a device

On a device's page, with `matter.devices.commission`:

| Action                                                                          | What happens                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Remove from fabric**                                                          | The sidecar asks the reachable device to remove **the Attraccess fabric only**, then forgets the node. Other ecosystems' fabrics stay untouched. If the device cannot be reached, nothing changes and the page offers Force remove from fabric. |
| **Force remove from fabric**                                                    | The sidecar forgets the node **without contacting the device**. The device may still hold Attraccess credentials: factory-reset it or remove it in its other controller.                                                                        |
| Record-only force remove (Matter administrator action, `matter.devices.manage`) | Retires only the Attraccess record, for records the sidecar no longer lists. See [Data Model](plugins/matter/data-model.md#actions).                                                                                                            |

If the device does not answer in time (`timeout`), the outcome is uncertain: the device may still complete the removal after Attraccess gave up waiting. A reconciliation follows, so check the device's page before you force remove it from the fabric.

Removal never resets the device. The node becomes `removed` with reason `removed_from_fabric` or `forced_from_fabric`, its endpoints are retired and its history (state, commands, audit) stays. A removed node cannot be claimed again. Commissioning the device again creates a new record.
