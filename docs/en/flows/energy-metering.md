# Meters and consumption billing
<!-- llms-description: Named meters per resource for electricity, water or any value, with cumulative counters, session boundaries and optional billing. -->

Each resource can have several named meters. A meter can count anything: electricity, water, material, heartbeats or other values. Attraccess does not store a unit or convert new readings.

## Create and select a meter

Create a meter using **Meters → Create meter** on the resource overview. Only a name is required. Every metering flow node must select a meter belonging to the resource. The node editor also has a **Create meter** button.

The overview shows each meter's **lifetime consumption**, including readings outside sessions, and consumption attributed to the **current session**. The live billing card shows each session meter and its cost.

## Reporting values

**Report meter** accepts a numeric value or a Handlebars template such as `{{reading.value}}`. Choose a reporting mode:

- **total**: a cumulative counter reading. The first reading outside a session establishes a baseline; later increases add to lifetime consumption. Repeating the same total does not count it twice. Decreases are rejected.
- **increment**: an amount to add. Each new flow execution adds that amount to lifetime consumption and, if a session is running, to its consumption. Replaying the same node within one flow execution is idempotent.

Both modes work from ordinary flows (for example MQTT or button triggers), without a metering request or an active session. Use consistent values and reporting modes for a physical counter; do not send the same consumption as both a total and an increment.

Values are non-negative decimals, calculated exactly to nine decimal places. An optional **Observed at** template supplies the source's ISO timestamp. Invalid values, decreasing counters, stale readings and future timestamps are rejected rather than treated as zero.

## Cumulative counters and session boundaries

For accurate session attribution and billing, define these branches for each cumulative meter:

```
Metering start → read or reset the counter → Metering ready
Metering collection → read the counter → Report meter
```

Select the same meter in all four nodes. In **Metering ready**, supply the counter's **Baseline value** when using a lifetime counter. Leave it empty only if your start branch resets the physical counter to zero. Reinitializing a baseline after a physical reset preserves the previously recorded lifetime consumption.

**Metering collection** runs at its configured interval, even outside sessions. `0` disables periodic collection. It also obtains a fresh final reading when a session ends. Timeout, final attempts and retry delay control collection failures.

An increment-only meter can use **Report meter** in ordinary flows without start or collection branches. The stored increments are attributed and settled when the session ends; no device reading is requested. Cumulative reports without those branches track lifetime consumption only: a pushed total can include idle use since the previous report, so it cannot safely establish a session boundary.

## Optional billing

Configure a price **per measured value** for each meter in the resource's billing settings. `0` disables billing while metering still works. Multiple meters can contribute separate line items to one session bill.

Each meter's name and rate are captured when a session starts. Later name or rate changes do not change its bill. Amount = session consumption × captured rate, rounded half-up once to the currency minor unit. The user's billing factor applies as usual. Consumption outside a session increases lifetime consumption without charging a user.

A billed cumulative meter must have a complete start and collection definition before a session can begin. A tracking-only meter's start failure does not block resource usage; that meter is skipped for the session. An unavailable final reading allows the session and base bill to finish, leaving that meter's charge **pending**. Operators can retry collection or waive the charge. A retry must return a stored reading with **Observed at** equal to the session's end timestamp; a current counter could include idle use and is rejected. A later session, reset, or an accepted idle increase makes the old charge unrecoverable; it can then only be waived. Successful retries create correction transactions without changing the original bill.

## Meters on shared machines

On a machine whose **Max parallel sessions** limit is above 1, several people can run sessions at the same time. Each meter's **Allocation** setting decides how its consumption is attributed. You find it in the meter settings of the resource's billing configuration. It has two values:

- **Shared and split** (default, for new and existing meters): the consumption is measured once for the machine and split fairly between the people using it.
- **Measured per session**: every session gets its own measuring point.

The mode is captured per session at its start, so changing it does not affect running sessions. Changes are recorded in the audit log. With a limit of 1, nothing changes.

### Shared and split

Every start and stop of a session on the machine closes the current time segment and opens a new one. At each boundary the meter is read:

- The first session on an idle machine initializes the meter with the **Metering start** branch, as before.
- Every later boundary while sessions are active is a normal collect reading via the **Metering collection** branch (payload `kind: "boundary"`). It does not reset the meter.
- The last stop does the final collection.

Each closed segment records its time range, the consumption between its two boundary readings and which sessions were active. Its consumption is split equally among those sessions. Periodic (interim) readings update the live view but never create boundaries. Boundaries of one machine are strictly ordered.

Example: a machine uses 8 kWh at 30 credits per kWh. A is alone for 2 kWh, A and B are together for 2 kWh, B is alone for 4 kWh. A pays 2 + 1 = 3 kWh = 90 credits, B pays 1 + 4 = 5 kWh = 150 credits.

Running time (operating time) is split the same way: the machine's operating time inside each segment is split equally among the sessions active in that segment. The per-use fee and the session time (the person's own session duration, rounded up to whole minutes) are never split. Every person's charges are on their own billing transaction and count toward their own project, including automatic later corrections.

A session that never shared a segment with another session is billed exactly as before (running time rounded up to whole minutes). As soon as a session shared any segment, its running time is charged on exact shares, because rounding up per person would create credit.

#### Rounding

Shares are kept exact (meter values in units of 1e-9, time in milliseconds). Rounding happens only when charging, once per segment and per charge type (each meter, running time):

1. The segment's credit total is the sum over all participants of their exact share times their own captured rate, rounded half-up once to whole credits.
2. That total is split into whole-credit charges with the largest-remainder method. Ties go to the session that started earlier, then to the lower session ID.

The charged shares of a segment therefore always add up exactly to the segment total; no credit is lost or created. For example, 3 people sharing 1 credit: one pays 1 credit, the others 0. 3 people sharing 2 credits: two pay 1.

A person's charge for a meter or for running time is the sum of their whole-credit segment shares. The billing factor (percentage) is then applied per person to the gross total as before.

#### Failed readings at a boundary

- **At a start**, the start is refused with the error `METER_INITIALIZATION_FAILED`, the same as when a billed meter fails to initialize. The running sessions are not affected.
- **At a stop**, the stop always succeeds. The segment is merged with the next one and runs until the next successful reading. The merged segment is split equally among everybody who was active at any point in it. People who already stopped get their share charged automatically as a correction transaction on their original charge once the merged segment closes; until then their receipt shows the meter line as **pending**.
- If the machine becomes idle and the final reading also fails, the existing pending, retry and waive handling applies to every affected session.

#### Meters that cannot be split

Increment-only meters (only a **Report meter** node in increment mode, without start and collection branches) and meters without a collection branch cannot be read on demand, so they cannot be split in **Shared and split** mode. On a machine whose limit of parallel sessions is above 1, the meter status shows a configuration problem for such a meter.

- With a rate above 0, a start that would overlap another running session is refused with the error `METER_SHARING_UNSUPPORTED`.
- With a rate of 0 (tracking only), the meter is skipped for that session.

Switch such meters to **Measured per session**, or set the rate to 0. With a limit of 1 they behave exactly as before.

### Measured per session

Every session gets its own measuring point: it is initialized with its own **Metering start**, read with its own **Metering collection** and settled on its own, exactly like a single session. Other sessions never block or take it over. Use this mode when each person has their own physical counter or when the meter cannot be split.

### Reports outside a metering run

On a machine with more than one running session, a reading pushed by a **Report meter** node outside a metering run must name its session. Inside a session lifecycle flow (start, stop, takeover) the lifecycle's own session is used. Otherwise, set the **Usage ID** template on the **Report meter** node to a template that renders a session ID, for example `{{ usageId }}` of the flow payload. A pushed reading that cannot be tied to exactly one active session is rejected with a flow error and never guessed. With a limit of 1 and one running session, the reading belongs to that session as before.

### What people see

For a shared session, the meter and running-time lines show the person's share (for example "0.8 kWh - your share of 2.4 kWh") and their credits with a **shared** marker, plus a breakdown listing each segment the person was in: time range, number of people, the segment's total quantity and credits, and the person's share. The breakdown appears in the billing history transaction details, the session receipt email and the session's billing view. The live session billing view shows the share so far (closed segments plus the open segment's current consumption divided by the current number of sessions) and marks it as provisional. Solo sessions look as before.

## Existing electricity setups

Existing energy settings become a meter named **Energy (kWh)**. Historical bills and metering evidence are preserved. The migration rewrites existing flow values and counter baselines into ordinary template conversions, so an existing Wh or joule source continues to produce kWh values. Metering itself receives only numeric values and has no energy-specific runtime path. New meters and nodes use the values exactly as supplied; prepare any conversion in your source or flow.

Lifetime totals migrated from the old implementation contain the recorded session consumption. Earlier idle consumption was never recorded and cannot be reconstructed.

The generic model fully replaces energy billing: legacy rates and exact bill quantities are migrated into meter snapshots and bill items, and the energy-specific database columns are removed. Historical transaction amounts and audit references remain unchanged. Rollback to the preceding generic-meter version preserves converted evidence. Returning to the energy-only model is rejected once it cannot preserve meter history; restore a pre-migration backup instead.

Flow conversion expressions require the generic template helpers in this version. Downgrading past that migration is refused when those expressions would stop working; restore a pre-migration backup instead.
