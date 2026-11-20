# Matter: Administration Page

<!-- llms-description: The Matter administration page under Devices: its tabs, who sees what, degraded states, the device lifecycle UI, live updates and what is still coming. -->

> [!NOTE]
> Only available when the **Matter** plugin is installed. See [Installing Plugins](plugins/installing-plugins.md).

**Devices → Matter** is the one place to look after Matter in Attraccess. It has a single entry in the sidebar and
several tabs below it. The address of each tab can be bookmarked or shared; the browser's back and forward buttons and a
reload keep your place.

```text
 Matter
 ┌───────────────────────────────────────────────────────────────────────────────────────┐
 │ ⚠ Matter sidecar unreachable                                                          │
 │   Unreachable since 12:03. [Open Infrastructure] [Retry now]                          │
 ├───────────────────────────────────────────────────────────────────────────────────────┤
 │ Devices │ Infrastructure │ Thread Network │ Commissioning │ Health │ Software Updates │
 ├───────────────────────────────────────────────────────────────────────────────────────┤
 │ Show: [All active ▾]   ( ) Include archived and removed                               │
 │ ┌─────────────────────────────────────────────────────────────────────────────────┐   │
 │ │ Plug (7)   [Unclaimed] [Reachable]                                              │   │
 │ │ ⚠ Unclaimed device – cannot be used in flows until claimed.                     │   │
 │ │ Acme / Plug · Software 1.0.3 · 2 endpoints · last seen 12:01                    │   │
 │ │ [Claim] [Archive] [Force remove] [Details]                                      │   │
 │ └─────────────────────────────────────────────────────────────────────────────────┘   │
 └───────────────────────────────────────────────────────────────────────────────────────┘
```

On a phone the tabs become a drop-down list above the content.

## Who sees what

The page opens for users with `matter.devices.read` or `thread.network.read`. Each tab then checks its own key, and users
only see the tabs they may use. A link to a tab you may not see takes you to the first tab you may. The keys are described
in [Matter: Permissions](plugins/matter/permissions.md).

| Tab              | Visible with                                   | Actions need                                                                                          |
| ---------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Devices          | `matter.devices.read`                          | `matter.devices.manage`: claim, repair, relink, archive, restore, force remove, names, reconciliation |
| Infrastructure   | `matter.devices.read`                          | `matter.devices.manage`: settings, fabric, recovery key, backup, restore                              |
| Thread Network   | `thread.network.read`                          | `thread.network.manage` (no action yet)                                                               |
| Commissioning    | `matter.devices.commission`                    | –                                                                                                     |
| Health           | `matter.devices.read` or `thread.network.read` | – (Thread cards need `thread.network.read`)                                                           |
| Software Updates | `matter.devices.read`                          | `matter.devices.manage` (approve and apply, later)                                                    |

Read-only users see no edit or lifecycle button at all, and Attraccess never sends a request their permissions would be
refused for.

## Degraded states

While the sidecar is not connected, a banner on every tab says why and where to fix it: **not set up**, **connecting**,
**unreachable**, **token rejected**, **incompatible** or **misconfigured**. It shows since when, when the next attempt
happens, and links to **Infrastructure**. Users with `matter.devices.manage` also get **Retry now**, which reconnects at
once instead of waiting for the next attempt. A warning about an unencrypted connection (plain `http` to another
machine) appears in the same place.

The rest of the page stays usable: the device list shows what Attraccess last knew, and a failing request only affects the
section it belongs to. If the whole Matter page ever crashes, Attraccess contains it; the rest of the application keeps
working.

## Devices

The list shows each device with its name (or product name and node ID), lifecycle state, whether it is reachable, vendor
and product, software and hardware version, the number of endpoints and when it was last seen. **Show** filters by state;
archived and removed devices are hidden unless you include them.

Devices that need a decision come first and are explained:

| State     | Meaning                                                                                | What you can do                                                  |
| --------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Unclaimed | The device is in the fabric, but nobody has taken it over. It cannot be used in flows. | **Claim** (with an optional name), **Archive**, **Force remove** |
| Detached  | The record lost its device (no longer listed, or the fabric changed). Not usable.      | **Repair**, **Relink**, **Archive**, **Force remove**            |
| Claimed   | In use.                                                                                | **Repair**, **Force remove** (on the detail page)                |
| Archived  | Hidden from the list, not usable.                                                      | **Restore**, **Force remove**                                    |
| Removed   | Gone from Attraccess; history is kept.                                                 | –                                                                |

Unclaimed and detached devices offer nothing but these actions: no command and no "use" button. **Relink** asks you to
choose the unclaimed device that replaced the detached one. If vendor, product or serial number differ, you confirm that
in a second step. **Force remove** asks for a confirmation that says it only removes the device from Attraccess: it does
not factory-reset the device and does not remove it from the Matter fabric. See
[Matter: Data Model and Lifecycle](plugins/matter/data-model.md) for what each action does.

**Reconciliation** shows the result of the last comparison with the sidecar's inventory, and **Run reconciliation now**
starts one.

### One device

**Details** opens the device on its own page (`/matter/devices/<id>`) with a link back to the list. It shows

- the identity the device reports: vendor, product, serial number, hardware and software version, attestation,
- name, description and location, editable for a claimed device (at most 100, 500 and 100 characters),
- the endpoints as a tree, each with its profile in plain words (such as "Door lock" or "Switch"), an editable name, the
  bridge it sits behind and whether the bridge sees it, and its current state with **Current** or **Stale** markers and
  the time of the observation,
- where the device is used in flows (not available yet: the page says "Not used in any flow"),
- a collapsed **Diagnostics** section with raw device types, cluster, attribute and command IDs and the capabilities as
  JSON. You never need it to use a device; it is meant for support.

## Infrastructure

The connection status (state, sidecar, matter.js and wire versions, compatibility, capabilities), the **connection
settings** and the **fabric and backup** section. While the sidecar is not connected, the versions are marked **last
known**. The settings form checks the URL (`http` or `https`), the token (32 to 512 printable characters) and the CA
certificate (PEM) while you type. If another administrator saves different settings while you edit, the form tells you,
keeps your edits and asks you to reload before you can save, so nothing is overwritten silently. **Clear CA certificate**
can be undone until you save. The token is never shown again after saving. Everything else about the connection is in
[Matter: Operator Guide](plugins/matter/operator.md), the fabric and backups in
[Matter: Backup and Recovery](plugins/matter/backup-restore.md).

## Thread Network, Commissioning and Software Updates

These tabs exist so that the address and the permission are in place, but the functions come with later plugin versions.
Each says so, based on what the sidecar reports (feature families `thread`, `commissioning` and `ota`):

- **Thread Network** explains that Thread is not set up and gives guidance for sharing the 2.4 GHz band between Thread,
  Zigbee and Wi-Fi. Sections for the dataset, Border Routers, radio co-processors and SMLIGHT diagnostics are
  placeholders.
- **Commissioning** will be a guided flow on its own page (prepare the device, enter or scan the code, watch the progress,
  name and claim). Until then it only explains the steps and collects no setup code.
- **Software Updates** lists the software each device runs now. Finding, approving and applying updates comes with OTA
  support.

## Health

One page with connection, compatibility, fabric, backup, reconciliation and event counters, the feature families the sidecar
supports and, for users with `thread.network.read`, a Thread placeholder. A card that is not healthy links to the tab where
you can fix it. The connection cards follow the status, which the page checks every 5 seconds; fabric, backup and
reconciliation refresh every 30 seconds. Both pause while the browser tab is in the background.

## Live updates

The device list, a device and its state update without reloading the page: Attraccess pushes a short "something changed"
signal and the page reads the new data through the normal, permission-checked API. If live updates are unavailable, the page
says that what you see may be out of date and refreshes itself about every 15 seconds until they work again.
