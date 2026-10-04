# Meters and consumption billing

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

An increment-only meter can use **Report meter** in ordinary flows without start or collection branches. The stored increments are attributed and settled when the session ends; no device reading is requested.

## Optional billing

Configure a price **per measured value** for each meter in the resource's billing settings. `0` disables billing while metering still works. Multiple meters can contribute separate line items to one session bill.

Each meter's name and rate are captured when a session starts. Later name or rate changes do not change its bill. Amount = session consumption × captured rate, rounded half-up once to the currency minor unit. The user's billing factor applies as usual. Consumption outside a session increases lifetime consumption without charging a user.

A billed cumulative meter must have a complete start and collection definition before a session can begin. An unavailable final reading allows the session and base bill to finish, leaving that meter's charge **pending**. Operators can retry collection or waive the charge. A later session, reset, or an accepted idle increase makes the old charge unrecoverable; it can then only be waived. Successful retries create correction transactions without changing the original bill.

## Existing electricity setups

Existing energy settings become a meter named **Energy (kWh)**. Historical bills and metering evidence are preserved. Migrated flow nodes retain their original unit conversion as a compatibility setting, so an existing Wh or joule source continues to produce kWh values. New meters and nodes use the values exactly as supplied; prepare any conversion in your source or flow.

Lifetime totals migrated from the old implementation contain the recorded session consumption. Earlier idle consumption was never recorded and cannot be reconstructed.
