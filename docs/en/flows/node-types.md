# Node Types

This reference covers all built-in flow nodes. The editor groups them by purpose, such as Billing, Messaging and Flow Control, and shows nodes supported by the resource type. Usage, activity and billing nodes are for **machines**; door triggers are for **doors**. Plugins can add further nodes with their own settings.

Read [Payloads, Variables & Templates](flows/payloads-variables-templates.md) first for paths, typed values and examples. **Template** below means a Handlebars template evaluated against the current input. Other settings are literal unless stated otherwise. Object payloads also receive resource context, and templates can read stored variables.

Template-enabled fields also support `add`, `subtract`, `multiply` and `divide`. See [Arithmetic and Unit Conversion](flows/payloads-variables-templates.md#arithmetic-and-unit-conversion) for syntax and examples.

## Input Nodes (Triggers)

Triggers start a run and pass their event data through **Output**.

### Button

Type: `input.button` · Machines

Adds a manual button to the resource detail page. **Label** is required, literal button text. The payload starts with resource context; it does not include the user who pressed the button.

Only the owner of an active usage session can press the button.

Example: connect a button labeled `Test relay` to **MQTT Send Message**.

### Resource Usage Started

Type: `input.resource.usage.started` · Machines

Runs during a usage start. No settings. Payload contains the new usage session's root fields (`id`, `startTime`, `user`, `formSubmissions`, etc.). Use `{{user.username}}` for the session owner. A flow failure can prevent the start; configure external actions' failure behavior accordingly.

### Resource Usage Stopped

Type: `input.resource.usage.stopped` · Machines

Runs during a usage stop. No settings. Payload contains the outgoing session, submitted forms and stop fields such as `endTime` and `endNotes`. Example: switch off a relay or add a billing item before settlement.

### Resource Usage Takeover

Type: `input.resource.usage.takeover` · Machines

Runs when an active session is taken over. No settings. Payload contains the outgoing usage session plus `newUser`, `oldUser` and `takeOverTime`. Use `{{newUser.username}}` for the incoming owner. A takeover uses this trigger instead of the ordinary Usage Started trigger.

### Door Unlocked

Type: `input.resource.door.unlocked` · Doors

Runs for a door-unlock action. No settings. Payload contains `event.timestamp`, `usage.start`, `usage.end`, `user.id`, `user.username` and `user.externalIdentifier`. Example: send an unlock command with **MQTT Send Message**.

### Door Locked

Type: `input.resource.door.locked` · Doors

Runs for a door-lock action. No settings. Uses the same payload shape as **Door Unlocked**. Example: send the lock command to your access controller.

### Door Unlatched

Type: `input.resource.door.unlatched` · Doors

Runs for a brief door-unlatch action. No settings. Uses the same payload shape as **Door Unlocked**. Example: send a pulse command to an electric strike.

### MQTT Message Received

Type: `input.mqtt.message.received`

| Setting                 | Description                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------- |
| **Server** (`serverId`) | Configured MQTT server                                                                |
| **Topic**               | Literal topic filter; supports `+` for one level and trailing `#` for multiple levels |

Payload is `{ serverId, topic, payload }`. MQTT content is parsed as JSON when possible, otherwise text. A message `{"running":true}` is read as `{{payload.running}}`, or as path `payload.running` in **If**. Topic filters are not templates.

### No Activity

Type: `input.resource.activity.no-activity` · Machines · Editor: **Inactivity timeout reached**

**Minimum inactivity (minutes)** (`minInactivityMinutes`) is a positive integer. Runs only while a finalized usage session is active. Checks happen once per minute, so this is not a precise timer. Payload starts with resource context only.

**Track Activity** resets the timer. After firing, the timer resets and can fire again if the session remains active. Activity timestamps are kept in memory and initialized again after a server restart. Example: connect to **End Usage Session** for automatic shutdown.

### Variable Changed

Type: `input.variable.changed`

| Setting                           | Description                                                                           |
| --------------------------------- | ------------------------------------------------------------------------------------- |
| **Watched variables** (`watches`) | One or more literal key/scope pairs (`resource` or `global`)                          |
| **Trigger source** (`source`)     | `any` (default) or `exclude-self`, which skips changes originating from this resource |

Payload contains `change: { scope, key, previousValue, newValue, changedAt, sourceResourceId }` and a snapshot of watched variables under `variables.resource` / `variables.global`. Creation counts as a change; identical writes and deletion do not trigger a run. Resource watches apply to this resource; global watches can react across resources.

Example: watch global `workshopOpen`, then copy it with **Get Variables** and branch with **If**. See [persistent variables](flows/payloads-variables-templates.md#persistent-flow-variables) for loop prevention and template access.

### Companion: Machine Idle

Type: `input.companion.idle`

Select a **Companion device** (`deviceId`). Runs when that device reports idle; the idle threshold belongs to the Companion configuration. Payload fields are `idleSeconds` and optional `platform`, at the root. Example: compare `idleSeconds` with **If**.

### Companion: Machine Active

Type: `input.companion.active`

Select a **Companion device**. Runs when it returns from idle. Payload fields are `idleSeconds` and optional `platform`, at the root. Example: record activity on the resource.

### Companion: Foreground App Changed

Type: `input.companion.foreground_app_changed`

Select a **Companion device**. Runs when its focused application changes. Payload fields are `appName`, `pid` and optional macOS `bundleId`, at the root. Example: compare path `appName` with the application name.

### Companion: USB Device Connected

Type: `input.companion.usb_device_connected`

| Setting                           | Description                                                  |
| --------------------------------- | ------------------------------------------------------------ |
| **Companion device** (`deviceId`) | Device to watch                                              |
| **Vendor ID / Product ID**        | Optional integer filters in decimal; empty matches any value |

Payload fields are `vendorId`, `productId` and optional `manufacturer`, `product`, `serialNumber`, at the root. When both filters are set, both must match. Example: react to a particular USB peripheral.

### Companion: USB Device Disconnected

Type: `input.companion.usb_device_disconnected`

Select a **Companion device** and optional decimal **Vendor ID / Product ID** filters, as for USB Device Connected. Runs on removal and uses the same payload fields; optional descriptor strings may be absent.

### Metering Start

Type: `input.resource.metering.start` · Machines · Billing

Runs to prepare the meter before a billed session starts or is taken over. **Timeout (seconds)** is 1–600, default **30**. The branch must reach **Metering Ready** or the session does not start.

Payload contains `metering: { sessionId, operationId, resourceId, usageId, kind, requestedAt }`, with `kind: "start"`. Example: read a lifetime counter with HTTP, then submit its baseline. See [Energy Metering](flows/energy-metering.md).

### Metering Collection

Type: `input.resource.metering.collect` · Machines · Billing

| Setting                         | Range / default                               |
| ------------------------------- | --------------------------------------------- |
| **Timeout (seconds)**           | 1–600 / **30**                                |
| **Interim interval (minutes)**  | 0–1440 / **1**; `0` disables interim readings |
| **Final attempts**              | 1–10 / **3**                                  |
| **Final retry delay (seconds)** | 0–120 / **5**                                 |

Runs for live interim readings and final readings at session end. Payload has the same metering fields as **Metering Start**, with `kind: "interim"` or `"final"`. The branch must reach **Report Energy**. Interim readings are never billed. See [Energy Metering](flows/energy-metering.md) for freshness and pending charges.

## Processing Nodes

### Wait

Type: `processing.wait`

**Duration** is a positive integer; **Unit** is `seconds`, `minutes` or `hours`. Pauses this branch, then forwards the unchanged payload through **Output**. Settings are literal, not templates.

### If

Type: `processing.if`

| Setting                                | Description                                                   |
| -------------------------------------- | ------------------------------------------------------------- |
| **Payload Path** (`path`)              | Literal path into the input, such as `payload.temperature`    |
| **Operator** (`comparisonOperator`)    | `=`, `!=`, `>`, `<`, `>=`, `<=`                               |
| **Comparison value**                   | Literal text, or a second path if the switch below is enabled |
| **Comparison value is a payload path** | Default **off**                                               |

Forwards unchanged payload through **True** (`output-true`) or **False** (`output-false`). Equality compares string representations; ordered comparisons convert both values to numbers. A missing path resolves to empty text; invalid numeric input becomes `NaN` and ordered comparisons are false. These fields do not render templates.

Example: path `payload.temperature`, operator `>`, literal comparison `40`. To compare a stored variable, copy it into the payload with **Get Variables** first.

### Set Payload

Type: `processing.set-payload`

Configure **Entries**, each with a literal **Key (path)** and a **Value template**. Preserves existing fields and writes rendered **strings** at those paths, then forwards through **Output**.

Example: key `reading.temperature`, value `{{payload.temperature}}`. All entries read the incoming payload, so dependent assignments need separate nodes. This node does not persist variables or parse JSON. See [Changing the Payload](flows/payloads-variables-templates.md#changing-the-payload).

### Set Variables

Type: `processing.variables.set`

Configure one or more **Variables**, each with a **Key template**, **Value template** and literal **Scope** (`resource` or `global`). Parses rendered values as JSON when valid, otherwise stores text. Forwarded payload is unchanged; stored values are available to following nodes' templates.

Example: resource key `lastReading`, value `{{json payload}}` saves MQTT content with its type preserved. Changes can trigger **Variable Changed**. Separate dependent writes into multiple nodes. See [Writing Typed Values](flows/payloads-variables-templates.md#writing-typed-values).

### Get Variables

Type: `processing.variables.get`

Configure one or more **Variables**, each with a **Key template**, literal **Scope** and literal **Payload path**. Copies the stored value, with its original type, into that path. Preserves other fields and forwards through **Output**.

Example: resource key `targetTemperature` → `limits.temperature`. A missing variable yields an undefined field and a server warning; it does not stop the flow.

### Wait for MQTT Message

Type: `processing.mqtt.waitForMessage`

| Setting                 | Description                                                                             |
| ----------------------- | --------------------------------------------------------------------------------------- |
| **Server** (`serverId`) | Configured MQTT server                                                                  |
| **Topic**               | Literal filter supporting `+` and trailing `#`; not a template                          |
| **Timeout (seconds)**   | Positive integer                                                                        |
| **Subscribe QoS**       | Optional `0`, `1`, `2`; effective delivery QoS is the lower of publisher/subscriber QoS |
| **On failure**          | See [Failure Behavior](flows/node-types.md#failure-behavior)                            |

Waits for the next matching message after subscribing. On success, **Output** receives `{ topic, payload }`, replacing prior data. MQTT content is JSON-parsed when possible. Timeout or subscription failure follows **On failure**; connect **Failure** and choose `failure-output` for a timeout branch. Example: wait for a device's response before reporting energy.

### Error

Type: `processing.error`

**Error message template** is required. Renders the message and throws a flow error. There is no output. Example: `Meter unavailable for {{resource.name}}` on an **If → False** branch.

## Output Nodes (Actions)

Actions with an **Output** connection can continue into further nodes. Billing items, activity recording and metering completion nodes have no outgoing connection in the core catalog.

### Failure Behavior

**HTTP Request**, **MQTT Send Message**, **Wait for MQTT Message** and **End Usage Session** expose **On failure** (`failureBehavior`):

| Choice                                                 | Result                                                                        |
| ------------------------------------------------------ | ----------------------------------------------------------------------------- |
| **Fail flow** (`fail-flow`)                            | Throws an error and stops this path; can abort the triggering usage operation |
| **Continue through failure output** (`failure-output`) | Routes original input plus `flowError: { kind, message }` through **Failure** |
| **Log and continue** (`log-and-continue`, default)     | Logs failure and forwards original input through **Output**                   |

`flowError.kind` is `transport-dispatch`, `acknowledgement-timeout`, `controller-rejection` or `node-failure`. Use `{{flowError.message}}` on a failure branch. A connected Failure edge alone does not enable routing to it.

HTTP and MQTT sends offer **Completion behavior**: **Acknowledged** (default) waits for the response/publish callback; **Dispatch** continues after initiation. MQTT publish acknowledgement confirms transport, not that the device performed the command. Errors arriving after an HTTP Dispatch flow has continued can only be logged, not routed or used to abort that flow.

### HTTP Request

Type: `output.http.sendRequest`

| Setting                                  | Description                                                           |
| ---------------------------------------- | --------------------------------------------------------------------- |
| **Method**                               | `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`            |
| **URL**                                  | Required URL; template support                                        |
| **Headers**                              | Literal names, templated values                                       |
| **Body**                                 | Optional text template; set `Content-Type: application/json` for JSON |
| **Timeout (seconds)** (`timeoutSeconds`) | Optional positive integer; bounds the HTTP request                    |
| **Completion behavior**                  | `acknowledged` or `dispatch`                                          |
| **On failure**                           | Shared failure policy above                                           |

Acknowledged success replaces the payload with the response body. JSON `{"energy_wh":1500}` is available as `{{energy_wh}}`, with no `response` prefix. Dispatch passes input through without a response; its default request timeout is 30 seconds. Acknowledged requests have no node timeout unless one is set.

Example body: `{"resource": {{json resource.name}}, "reading": {{json payload}} }`. Save required earlier event fields in variables before an acknowledged request.

### MQTT Send Message

Type: `output.mqtt.sendMessage`

| Setting                               | Description                                                                             |
| ------------------------------------- | --------------------------------------------------------------------------------------- |
| **Server** (`serverId`)               | Configured MQTT server                                                                  |
| **Topic**                             | Required template, e.g. `workshop/{{resource.id}}/command`                              |
| **Payload**                           | Optional message template                                                               |
| **QoS**                               | Optional `0`, `1`, `2`; empty uses the server default                                   |
| **Retain**                            | Optional; empty uses the server default                                                 |
| **Completion behavior**               | `acknowledged` or `dispatch`                                                            |
| **Acknowledgement timeout (seconds)** | Optional positive integer; empty means no node deadline for the publish acknowledgement |
| **On failure**                        | Shared failure policy above                                                             |

Forwards unchanged payload through **Output** on success. Example: `{{json payload}}` forwards received MQTT content as JSON. Server, QoS, retain and timing settings are literal.

### Set Billing Items

Type: `output.resource.billing.calculation.set-additional-items` · Machines · Editor: **Add billing item**

Each node adds **one item**, not a list.

| Setting                      | Description                                                |
| ---------------------------- | ---------------------------------------------------------- |
| **Name**                     | Required literal text                                      |
| **Unit price** (`unitPrice`) | Integer billing amount; the editor displays it as currency |
| **Quantity**                 | Positive integer; root field `quantity` overrides it       |
| **Description**              | Optional literal text                                      |
| **External reference**       | Optional; see the special override rule below              |

Uses the usage ID in root `id` when supplied, otherwise the active session on this resource. Requires pending billing or a usage lifecycle operation; fails if no eligible session/transaction exists. Matching existing items have their quantities added. Output data is the item object, replacing the original payload; the catalog exposes no outgoing connection.

The external reference uses a root string `externalReference` override when present. If that field is present **and** a nonempty reference is configured on the node, the configured reference is rendered as a template instead. Without the payload field, the configured reference stays literal. Name, description and unit price do not render templates.

Example: use **Set Payload** to map a form answer to `quantity`, then add a consumable item during **Usage Stopped**.

### End Usage Session

Type: `output.resource.usage.end-session` · Machines · Editor: **End active session**

**Notes** is an optional template. **On failure** follows the shared policy. Ends this resource's current session using its owner; a missing active session fails. Forwards unchanged payload on success. During a pending usage start/takeover, it can end that lifecycle's candidate session.

Example notes: `Automatically ended after inactivity on {{resource.name}}`. This action skips required end-form submissions and note notifications.

### Track Activity

Type: `output.resource.activity.track-activity` · Machines · Editor: **Record activity**

No settings. Records activity at server time and resets the **No Activity** timer. Leaves the payload unchanged; the catalog exposes no outgoing connection. Example: connect an observed activity MQTT trigger here. This does not assign machine operating state.

### Machine Operating State

Feed these actions from an observed signal interpreted by your flow. Sending a command or starting a usage session does not itself prove physical operation.

Repeated assignments of the same state do nothing. An operating interval stays open across session boundaries and restarts until a flow assigns idle. Changes record server time and the flow node/run. Server time earlier than the last accepted transition causes failure.

Accepted observations remain recorded if a later node fails. A failed usage start or takeover still aborts its session and billing changes. Pending usage changes interrupted by a server stop are canceled on restart; physical commands are not replayed.

### Record Operation Started

Type: `output.resource.activity.operating` · Machines

No settings. Assigns **operating**, starting an interval at server time if the machine was idle. Forwards unchanged payload through **Output**. Example: connect **If → True** after interpreting a machine's actual running signal.

### Record Operation Stopped

Type: `output.resource.activity.idle` · Machines

No settings. Assigns **idle**, closing an open operating interval at server time. Forwards unchanged payload through **Output**. Example: connect **If → False** for the same observed running signal.

### Health Heartbeat

Type: `output.resource.health.heartbeat` · Editor: **Send health heartbeat**

| Setting                                   | Description                                                       |
| ----------------------------------------- | ----------------------------------------------------------------- |
| **Identifier**                            | Optional literal subsystem label; empty uses the resource default |
| **Timeout (seconds)**                     | Positive integer                                                  |
| **Reason on timeout** (`unhealthyReason`) | Optional literal text; default `Heartbeat timed out`              |

Marks the subsystem healthy and records last-seen time. A once-per-minute check marks it unhealthy after the timeout. Timer state is held in memory and initialized again after restart. Forwards unchanged payload through **Output**. No settings render templates. Example: connect a periodic MQTT status message to this action.

### Set Health State

Type: `output.resource.health.set`

| Setting        | Description                                                       |
| -------------- | ----------------------------------------------------------------- |
| **Identifier** | Optional template; path `health.identifier` can override it       |
| **Status**     | Literal `healthy` or `unhealthy`; `health.status` can override it |
| **Reason**     | Optional template; `health.reason` can override it                |

Overrides must be nonempty strings; an invalid status fails. For healthy reports the reason is cleared. Forwards unchanged payload through **Output**. Example: **Set Payload** with key `health.status`, value `unhealthy`, and key `health.reason`, value `Device reported {{payload.error}}`, then connect here.

### Lock PC

Type: `output.companion.lock-pc`

Select a literal **Companion device** (`deviceId`). Sends a lock-screen command. Forwards input fields through **Output**, replacing any existing `companion` field with `{ delivered }`. `companion.delivered` reports whether the command was sent to a connected device, not whether the OS finished locking. An offline device yields `false`.

The desired lock state is also saved for the device's next authentication.

### Unlock PC

Type: `output.companion.unlock-pc`

Select a literal **Companion device**. Sends an unlock-screen command and saves the desired state. Payload behavior matches **Lock PC**: check `companion.delivered` for delivery. Actual unlock behavior depends on the Companion platform integration.

### Metering Ready

Type: `output.resource.metering.ready` · Machines · Billing

| Setting                            | Description                                                               |
| ---------------------------------- | ------------------------------------------------------------------------- |
| **Baseline value / Baseline unit** | Optional templates for a lifetime counter's current total and energy unit |
| **Source**                         | Optional template naming the physical meter                               |

Completes a **Metering Start** operation. Fails outside a start branch. Leave the baseline empty for resettable counters; a configured baseline that renders empty fails. The catalog exposes no outgoing connection.

Example after HTTP returning `{"energy_wh":1500}`: baseline `{{energy_wh}}`, unit `Wh`. See [Energy Metering](flows/energy-metering.md).

### Report Energy

Type: `output.resource.metering.report` · Machines · Billing

| Setting         | Description                                                                                              |
| --------------- | -------------------------------------------------------------------------------------------------------- |
| **Value**       | Required template for total energy since metering start, or current lifetime total when using a baseline |
| **Unit**        | Required template: `Wh`, `kWh`, `MWh`, `mWh`, `J`, `kJ`, `MJ`, or supported long-form energy unit        |
| **Observed at** | Optional ISO timestamp template; defaults to reporting time                                              |
| **Source**      | Optional template naming the meter                                                                       |

Completes a **Metering Collection** operation; fails outside a collection branch. Reports energy, not power or an increment. Power units (`W`, `kW`, etc.) are rejected. A configured observed-at template that renders empty fails; final readings must be fresh. The catalog exposes no outgoing connection.

Example after **Wait for MQTT Message** returning `{"energy_wh":1500}` in its content: value `{{payload.energy_wh}}`, unit `Wh`. See [Energy Metering](flows/energy-metering.md) for baselines, units and retries.

## See Also

- [Payloads, Variables & Templates](flows/payloads-variables-templates.md) — Data paths and worked examples
- [Flow Editor](flows/flow-editor.md) — Place and connect nodes
- [MQTT & IoT](devices/mqtt/overview.md) — Configure MQTT servers
- [Energy Metering](flows/energy-metering.md) — Bill electricity per kWh
- [Billing](billing/overview.md) — Billing system details
