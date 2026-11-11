# Matter: Data Model and Lifecycle

<!-- llms-description: Matter device data model: terminology, nodes, endpoints, lifecycle, state semantics, reconciliation, admin actions and data retention. -->

> **Uninstalling the Matter plugin deletes all Matter data in Attraccess.** The host runs every plugin down-migration on uninstall, which drops all `plugin_matter_*` tables: the device records, your names, descriptions and locations, and the connection settings. The Matter fabric in the sidecar is **not** touched, so after a reinstall the previously commissioned nodes reappear as **Unclaimed** and have to be claimed again. Flow nodes that referenced the old records lose their references. This is the one exception to "Matter data is never silently dropped". Disabling and upgrading the plugin keep all data (see [Disable, upgrade and uninstall](#disable-upgrade-and-uninstall)).

This page describes how Attraccess records Matter devices, what the stored state means, and which administrator actions exist. It builds on the [architecture](devices/matter/architecture.md). There is no device UI yet: the data is available to administrators (permission `system.plugins.manage`) through the REST endpoints listed [below](#rest-endpoints), and later features (device pages, flow nodes, commands) build on it.

## Terminology

| English               | Deutsch                  | Meaning                                                                                                                   |
| --------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Node                  | Node                     | One commissioned Matter device as Attraccess knows it. Identified by the fabric and the node ID.                          |
| Endpoint              | Endpoint                 | An independently addressable part of a node, such as one socket of a power strip. Identified by node and endpoint ID.     |
| Bridged device        | Überbrücktes Gerät       | A device behind a Matter bridge. It appears as an endpoint of the bridge and has its own unique ID.                       |
| Cluster               | Cluster                  | A group of attributes and commands an endpoint supports, such as On/Off.                                                  |
| Capability profile    | Fähigkeitsprofil         | What an endpoint can do (such as `onOff`), derived from its clusters, plus one primary profile such as `on_off_actuator`. |
| Requested State       | Angeforderter Zustand    | The value Attraccess asked a device to take. It is a request, not a fact.                                                 |
| Accepted Command      | Angenommener Befehl      | The sidecar took the command. It does **not** mean the device did it.                                                     |
| Reported State        | Gemeldeter Zustand       | The last value the device reported, with the time it was observed.                                                        |
| Stale                 | Veraltet                 | The last report is older than the time it should have been refreshed within. Shown as freshness `stale`.                  |
| External State Change | Externe Zustandsänderung | The device reported a different value although no command was pending: someone used the device directly.                  |
| Fault                 | Störung                  | The device or sidecar reported a fault for a value. The value's quality is `fault` until a good report arrives.           |
| Uncertain Actuation   | Unsichere Ausführung     | A physical command timed out. Whether it took effect is unknown. It is never retried automatically.                       |
| Unclaimed             | Nicht übernommen         | The sidecar lists the node, but no administrator has taken it over. Quarantined: nothing can use it.                      |
| Claimed               | Übernommen               | An administrator took the node over.                                                                                      |
| Detached              | Getrennt                 | The record exists in Attraccess, but the sidecar does not list it (any more) in the expected fabric. Nothing is deleted.  |
| Archived              | Archiviert               | Set aside by an administrator. Reconciliation leaves it alone.                                                            |
| Removed               | Entfernt                 | Retired. The row stays as history. The same identity can appear again later as a new record.                              |

## Who is authoritative for what

- The **sidecar** is authoritative for the fabric: which nodes and endpoints exist and their protocol identity (vendor, product, serial number, software version, attestation, clusters).
- **Attraccess** is authoritative for names, descriptions, locations, lifecycle decisions, the audit log and the stable IDs.

Reconciliation never writes to the sidecar and never overwrites a name, description or location. An administrator's edit never changes protocol identity.

## Stable references

Every node and endpoint has an Attraccess-generated UUID. Flow nodes and the audit log refer to these UUIDs, never to raw Matter IDs, so a reference survives a [relink](#actions). Matter's 64-bit IDs are stored as decimal strings. A node ID is only unique **within a fabric**, so a node is always identified by the fabric **and** the node ID; the same node ID on another fabric is a different node.

The data model has no column that links a Matter record to an Attraccess resource. Such links live only in flow node configuration.

## Lifecycle

| State       | Meaning                                            | Leaves with                                                                       |
| ----------- | -------------------------------------------------- | --------------------------------------------------------------------------------- |
| `unclaimed` | Listed by the sidecar, not taken over (quarantine) | Claim, archive, force-remove, or reconciliation when the sidecar stops listing it |
| `claimed`   | Taken over by an administrator                     | Force-remove, or reconciliation when the sidecar stops listing it                 |
| `detached`  | Known to Attraccess, not listed by the sidecar     | Reconciliation or repair (when it is listed again), relink, archive, force-remove |
| `archived`  | Set aside; reconciliation never changes it         | Restore (to `detached`), force-remove                                             |
| `removed`   | Retired; the row is kept as history                | Nothing                                                                           |

A detached node records why: `absent_from_sidecar` (the sidecar no longer lists it), `fabric_absent` (the sidecar has no fabric) or `fabric_mismatch` (the sidecar runs a different fabric, see [below](#restored-databases-and-replaced-sidecars)).

```text
 sidecar lists a new node ─► unclaimed ──claim──► claimed
                                │  ▲                │
              not listed ───────┘  │ listed again   │ not listed
                                ▼  │                ▼
                              detached ◄───────────┘
                               │    │
                       archive │    │ relink (from an unclaimed node)
                               ▼    ▼
                           archived  claimed (same UUID, new identity)

 force-remove (any state except removed) ─► removed
 restore (archived) ─► detached
```

Reconciliation never claims a node on its own, never deletes a record and never silently adds one.

## Reconciliation

Reconciliation compares the sidecar's node list with Attraccess's records. It runs when the connection reaches `connected`, when the event stream asks for it, after a successful commissioning, and on demand (`POST /matter/reconciliation`). Runs never overlap: triggers that arrive during a run are merged into one follow-up run. There is no timer.

It changes something **only** when the sidecar answers `inventory.list` with `authoritative: true`. In every other case nothing changes and the result is recorded:

| `lastResult`                | When                                                                                    |
| --------------------------- | --------------------------------------------------------------------------------------- |
| `applied`                   | An authoritative inventory was applied                                                  |
| `skipped_unavailable`       | The sidecar is not connected, is degraded, or does not support inventory yet (as today) |
| `skipped_non_authoritative` | The sidecar answered with `authoritative: false` (a partial view)                       |
| `failed`                    | A timeout or another error                                                              |

With an authoritative inventory:

1. A node the sidecar lists that Attraccess does not know becomes **unclaimed** (audit `matter.node_quarantined`).
2. A claimed or unclaimed record the sidecar does not list becomes **detached** (`matter.node_detached`).
3. A detached record whose exact identity (fabric and node ID) is listed again is **re-attached**, back to claimed or unclaimed (`matter.node_reattached`).
4. An archived record is never changed. If it reappears, the run summary only notes it.
5. Endpoints, clusters and capabilities are refreshed. Vanished ones are marked removed, never deleted. A bridged endpoint whose bridged unique ID changed is retired (reason `replaced`) and a new record is created, so a flow reference never silently points at different hardware.

Running it again against the same answer changes nothing and writes no audit entries.

### Restored databases and replaced sidecars

If the Attraccess database is restored from another time, or the sidecar storage is reset or replaced, the sidecar reports a fabric that differs from the one Attraccess knew. Then:

- The old fabric becomes `absent`; its claimed and unclaimed nodes become **detached** with `fabric_mismatch`.
- The new fabric's nodes become **unclaimed**. They are **never matched automatically**, even when node IDs or serial numbers are equal, because that could bind a flow to the wrong physical device. Matching is explicit only, through [relink](#actions).
- The audit log gets `matter.fabric_mismatch_detected`.

If the sidecar has no fabric at all, every live node becomes detached with `fabric_absent`.

If the Attraccess database is **older** than the sidecar, the nodes it does not know are quarantined as unclaimed. If it is **newer**, the nodes the sidecar no longer lists are detached.

## Actions

All actions need `system.plugins.manage`, validate their input, are audited and answer `409` for a transition that is not allowed and `404` for an unknown ID.

| Action       | From                                      | Does                                                                                                                                                                                                                                                                                              |
| ------------ | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claim        | `unclaimed`                               | Takes the node over, with an optional name.                                                                                                                                                                                                                                                       |
| Relink       | `detached` (target), `unclaimed` (source) | Moves the source's protocol identity, endpoints, clusters and state onto the detached record. Its UUID, names and flow references stay. The source becomes `removed` (merged). If vendor, product or serial number differ, the call answers `409` unless `confirmIdentityMismatch: true` is sent. |
| Repair       | `unclaimed`, `claimed`, `detached`        | Re-reads one node from the sidecar and refreshes identity, endpoints and capabilities. Re-attaches a detached node the sidecar reports with the same identity. Changes nothing, and answers `503` or `409`, if the sidecar cannot answer.                                                         |
| Archive      | `detached`, `unclaimed`                   | Sets the node aside.                                                                                                                                                                                                                                                                              |
| Restore      | `archived`                                | Back to `detached`. The next reconciliation re-attaches it if the sidecar lists it.                                                                                                                                                                                                               |
| Force-remove | any state except `removed`                | Retires the record and its endpoints. History stays. **Attraccess only:** the sidecar is not touched, so if it still lists the node, the next reconciliation quarantines it again as a **new** unclaimed record. Needs `confirm: true`.                                                           |
| Edit         | any state except `removed`                | Changes name, description or location (and nothing else).                                                                                                                                                                                                                                         |

## State

Each endpoint has one row per state key such as `onOff.onOff`, updated in place. High-frequency reports only update that row. They create no history and no audit entries.

| Field                | Meaning                                                                                                                                                    |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `reported`           | The last value, when it was observed and received, where it came from (`subscription_report`, `read`, `command_response`) and its quality                  |
| `freshness`          | `fresh`, `stale` or `unknown` (never reported), computed when you read it. Stale after 10 minutes, or twice the subscription's maximum interval when known |
| `requested`          | The value asked for, when, by whom, with the request ID and correlation ID                                                                                 |
| `command`            | `none`, `requested`, `accepted`, `reported`, `uncertain` or `failed`, with the accepted and reported times                                                 |
| `confirmed`          | `true` only when a report equal to the requested value arrived **after** the request                                                                       |
| `externalChange`     | A report that differs from the last one while no command was pending                                                                                       |
| `fault`              | A fault code, message and time, cleared by the next good report                                                                                            |
| `uncertainActuation` | `true` while the command is `uncertain`                                                                                                                    |

**Accepted never means done.** An accepted command is shown as accepted until the device reports the requested value. A report older than the stored one is ignored (out-of-order delivery). Events for unknown, removed or archived endpoints are ignored and only counted. A timeout of a physical command becomes `uncertain` and is never retried automatically; it stays uncertain until a matching report or a new request.

The record of requested commands is bounded: the newest 1,000 rows, and nothing older than 30 days.

## Disable, upgrade and uninstall

| Event                                                                                             | What happens to the Matter data                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plugin disabled or not loaded (plugins disabled globally, a failed load, a boot-guard quarantine) | Nothing is changed or deleted. No reconciliation runs, and stored state simply becomes stale by its timestamps. On the next load, a reconciliation runs after the connection is up.                         |
| Plugin upgrade                                                                                    | Only additive migrations run. All data is kept.                                                                                                                                                             |
| **Plugin uninstall**                                                                              | **All Matter tables and rows are dropped**, including the connection settings. The fabric in the sidecar is unaffected. After a reinstall, nodes reappear as unclaimed; names and flow references are lost. |

Export what you need before you uninstall, and plan to claim your nodes again afterwards.

## REST endpoints

All endpoints are under `/api/matter/…` and need `system.plugins.manage` (a dedicated Matter permission follows in [ATT-1003](https://linear.app/attraccess/issue/ATT-1003)). None of them sends a command to a device.

| Endpoint                                                                                 | Purpose                                                       |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `GET /matter/nodes?lifecycleState=&includeInactive=`                                     | List nodes (archived and removed are hidden unless requested) |
| `GET /matter/nodes/:id`                                                                  | One node with endpoints, clusters and capabilities            |
| `PATCH /matter/nodes/:id`, `PATCH /matter/endpoints/:id`                                 | Edit `displayName`, `description`, `location`                 |
| `POST /matter/nodes/:id/claim`, `relink`, `repair`, `archive`, `restore`, `force-remove` | The actions above                                             |
| `GET /matter/endpoints/:id/state`                                                        | The state entries of an endpoint                              |
| `GET /matter/reconciliation`, `POST /matter/reconciliation`                              | Last result; run a reconciliation now                         |

## Audit

The audit domain `matter` records `node_quarantined`, `node_detached`, `node_reattached`, `node_claimed`, `node_relinked`, `node_repaired`, `node_archived`, `node_restored`, `node_force_removed`, `node_metadata_updated`, `endpoint_metadata_updated` and `fabric_mismatch_detected`. Entries carry only IDs, enums and flags, never device free text or secrets. Actions that reconciliation takes on its own are attributed to the administrator who last saved the connection settings. Telemetry is never audited.
