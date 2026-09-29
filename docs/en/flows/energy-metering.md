# Energy Metering & Billing per kWh

Attraccess can bill the electricity a machine consumes during a usage session. Two things are needed:

1. A **per kWh rate** in the resource's billing settings (see [Billing Configuration](billing/configuration.md#energy-per-kwh)).
2. A **meter definition** in the resource's [flow](flows/overview.md), built from four nodes in the **Billing** group of the node catalog.

The flow tells Attraccess how to read your meter (HTTP, MQTT, a plugin, ...). Attraccess handles the rest: session lifecycle, arithmetic, billing and display.

> [!NOTE]
> Ordinary **Resource Usage Started** / **Resource Usage Stopped** flows (switching a relay, sending an MQTT message, ...) need no metering nodes. The metering nodes are separate branches that only deal with reading the meter.

## The Metering Nodes

| Node | Type | Purpose |
|------|------|---------|
| **Metering start** | Trigger | Runs when a billed session begins (or is taken over). Put the steps that prepare the meter here. |
| **Metering ready** | Action | Confirms that the meter is prepared. Ends the start branch. |
| **Metering collection** | Trigger | Runs for interim readings while a session runs and for the final reading when it ends. |
| **Report energy** | Action | Hands a reading back to Attraccess. Ends the collection branch. |

### Metering start

| Setting | Default | Description |
|---------|---------|-------------|
| **Timeout (seconds)** | 30 | How long Attraccess waits for the branch to reach **Metering ready**. |

### Metering ready

All settings are optional and are [Handlebars](https://handlebarsjs.com/) templates.

| Setting | Description |
|---------|-------------|
| **Baseline value** / **Baseline unit** | Only for **lifetime counters that cannot be reset**: the counter reading right now. Later totals are counted from it. Leave empty when you reset the meter. |
| **Source** | A label for the physical meter (shown as evidence). |

### Metering collection

| Setting | Default | Description |
|---------|---------|-------------|
| **Timeout (seconds)** | 30 | How long Attraccess waits for the branch to reach **Report energy**. |
| **Interim interval (minutes)** | 1 | How often an interim reading is taken while a session runs. `0` disables interim readings. Interim readings are shown live and are never billed. |
| **Final attempts** | 3 | How many times Attraccess tries to get a fresh final reading when a session ends. |
| **Final retry delay (seconds)** | 5 | Pause between final attempts. |

### Report energy

All settings are [Handlebars](https://handlebarsjs.com/) templates.

| Setting | Required | Description |
|---------|----------|-------------|
| **Value** | Yes | The **total** energy consumed since the metering start. |
| **Unit** | Yes | The energy unit of the value. |
| **Observed at** | No | When the meter took the reading (ISO time). Defaults to the moment of reporting. |
| **Source** | No | A label for the physical meter. |

Supported energy units: `Wh`, `kWh`, `MWh`, `mWh`, `J`, `kJ`, `MJ`, and the words `watt-hour`, `kilowatt-hour`, `milliwatt-hour`, `megawatt-hour`, `joule`, `kilojoule`, `megajoule`.

## Concepts You Need to Know

### Energy, not power

Billing uses **energy** (kWh: how much was consumed). **Power** (kW: how fast energy is being used right now) cannot be billed. A machine drawing 2 kW for half an hour has consumed 1 kWh. Power units such as `W`, `kW` or `mW` are rejected with an explanation, because a power sample is not consumed energy. Point your flow at the meter's energy counter, not its live power reading.

### The value is a total since the metering start

**Report energy** must return the **total energy consumed since the metering start**, not an increment since the last reading. Repeated collections never add up: only the single final total is billed, once.

### Metering start is a logical reset

Starting a metering session is a logical boundary, not necessarily a hardware reset. There are two setups:

| Meter type | Start branch | Report |
|------------|--------------|--------|
| **Resettable session counter** | Reset the device, then **Metering ready** (no baseline). | The counter value as it is. |
| **Lifetime counter** (cannot be reset) | Read the counter and pass it to **Metering ready** as **Baseline value** and **Baseline unit**. | The current counter value. Attraccess subtracts the baseline. |

A counter that decreases during a session, or that falls below the lifetime baseline, is rejected.

## Session Lifecycle

**Start.** Attraccess prepares the meter *before* the normal start effects run. If the **Metering start** branch fails, times out or never reaches **Metering ready**, the session does not start. There is never a billed session without a meter.

**During the session.** Every interim interval, **Metering collection** runs. The latest value is shown live (see [Live Values](#live-values)) but is not billed.

**Stop.** The normal stop effects run first, then the final collection runs. A final reading must be **fresh**, meaning observed after the session stopped. A stale reading is rejected.

**Final reading unavailable.** If no valid final total can be obtained after the configured attempts, the usage still ends and the base charge (fixed and time-based fees) is settled. The energy charge is shown as **pending** in the resource's billing card, with two actions:

- **Retry** -- runs the final collection again. It only works while no later session has used the meter; otherwise the charge is marked **failed**.
- **Waive** -- writes the energy charge off without billing it. Also available for failed charges.

Missing or invalid data never becomes a zero charge. A valid reading of 0 kWh is a valid zero charge, recorded as a zero-value energy line item.

**Takeover.** When a user takes over a running session, the outgoing session's final total is read first. Only then is the meter prepared for the new session.

## How the Amount Is Calculated

- The rate is **captured when a session starts**. Later rate changes do not affect a running session.
- Amount = kWh x rate, calculated with exact integer arithmetic and rounded half-up to the currency minor unit **once**. Example: 1.5 kWh at 0.30 EUR/kWh = 0.45 EUR.
- The bill gets an **energy** line item that records the kWh, the captured rate and a reference to the metering evidence (the readings and the meter source).
- The user's billing factor applies to the energy item like to every other item.

## Live Values

While a metered session is running, the **billing card in the resource's [Overview](resources/resource-details.md)** shows the latest meter value in kWh, when it was read, and the energy cost so far. It updates about every interim interval. These are informational; only the final total is billed.

## Example Setup

### Variant A: Generic HTTP source

The meter has an HTTP API: a `POST` resets it, a `GET` returns JSON such as `{"energy_wh": 1500}`.

**Start branch**

```
Metering start  ->  HTTP request  ->  Metering ready
```

- **HTTP request**: method `POST`, URL of the device's reset endpoint. Keep the completion behavior on **Acknowledged** so the flow waits for the response.
- **Metering ready**: no settings needed. Optionally set **Source** (e.g. `Shelly kitchen`).

**Collection branch**

```
Metering collection  ->  HTTP request  ->  Report energy
```

- **HTTP request**: method `GET`, URL of the device's reading endpoint, completion behavior **Acknowledged**.
- **Report energy**: **Value** `{{energy_wh}}`, **Unit** `Wh`.

> [!NOTE]
> After an **HTTP request** with **Acknowledged** behavior, the parsed response body replaces the flow data. JSON fields are therefore available directly (`{{energy_wh}}`), not under a `response` prefix. With **Dispatch**, the response is not available.

If the device only has a lifetime counter and no reset, replace the start branch with `Metering start -> HTTP request (GET) -> Metering ready`, and set **Baseline value** `{{energy_wh}}` and **Baseline unit** `Wh` on **Metering ready**.

### Variant B: WAGO plugin source (lifetime counter)

The [WAGO plugin](devices/wago-cc100-commissioning.md) exposes a channel that reports a cumulative energy measurement. Use its **WAGO read state** node (category `measurement`); it puts the latest reading into the flow data as `wago`. The fields used here are `wago.value`, `wago.unit` (for example `milliwatt-hour`), `wago.timestamp` (ISO time) and `wago.available`.

**Start branch**

```
Metering start  ->  WAGO read state  ->  Metering ready
```

- **WAGO read state**: select the controller, the energy channel and the category `measurement`.
- **Metering ready**: **Baseline value** `{{wago.value}}`, **Baseline unit** `{{wago.unit}}`.

**Collection branch**

```
Metering collection  ->  WAGO read state  ->  Report energy
```

- **Report energy**: **Value** `{{wago.value}}`, **Unit** `{{wago.unit}}`, **Observed at** `{{wago.timestamp}}`.

Connect only the **output** handle of **WAGO read state**. When the data is unavailable (controller offline or stale), the node uses its **unavailable** handle. Leave it unconnected: the branch then does not report, and Attraccess treats it as a failed start or an unavailable reading, never as zero.

> [!TIP]
> Attraccess converts the unit for you, so you can pass `milliwatt-hour` straight through. Reporting `wago.timestamp` as **Observed at** lets Attraccess check that the final reading is fresh.

## See Also

- [Billing Configuration](billing/configuration.md) -- Setting the per kWh rate
- [Node Types](flows/node-types.md) -- All flow nodes
- [Flow Editor](flows/flow-editor.md) -- Building flows
- [Transactions](billing/transactions.md) -- Viewing charges
