# Payloads, Variables & Templates

Each flow node receives data from the previous node and produces data for the next one. This data is called the **payload**. Templates read that payload to build messages, URLs or other settings. **Flow variables** store values that must survive a flow run.

## Three Different Kinds of Data

| Data               | Lifetime                                        | How to use it                                                             |
| ------------------ | ----------------------------------------------- | ------------------------------------------------------------------------- |
| **Node settings**  | Saved with the flow                             | Configure a node, such as its MQTT server or wait duration                |
| **Payload**        | Passed along the current branch                 | Read a path such as `payload.temperature`; change it with **Set Payload** |
| **Flow variables** | Stored in the database across runs and restarts | Write with **Set Variables**; read in templates or with **Get Variables** |

A payload is usually a JSON object. The word `payload` is also the name of a field containing an MQTT message's content. It is not a prefix for every value: `resource.name` is at the root, while `payload.temperature` is inside the received MQTT content.

## What a Trigger Provides

The starting data depends on the trigger. For object payloads, Attraccess adds `resource.id`, `resource.name`, `resource.type` and `resource.metadata`. Metadata contains the resource's configured custom data and can be `null`.

| Trigger                                | Useful payload paths                                                                                                                                                                   |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Button**, **No Activity**            | Resource context only; no user or message data                                                                                                                                         |
| **Usage Started / Stopped**            | Usage fields at the root: `id`, `startTime`, `endTime`, `startNotes`, `endNotes`, `user.id`, `user.username`, `formSubmissions`                                                        |
| **Usage Takeover**                     | Outgoing usage fields, plus `newUser`, `oldUser` and `takeOverTime`                                                                                                                    |
| **Door Unlocked / Locked / Unlatched** | `event.timestamp`, `usage.start`, `usage.end`, `user.id`, `user.username`, `user.externalIdentifier`                                                                                   |
| **MQTT Message Received**              | `serverId`, `topic`, `payload`                                                                                                                                                         |
| **Variable Changed**                   | `change.scope`, `change.key`, `change.previousValue`, `change.newValue`, `change.changedAt`, `change.sourceResourceId`; watched values under `variables.resource` / `variables.global` |
| **Companion events**                   | Event fields at the root, such as `idleSeconds`, `appName` or `vendorId`; see the [node reference](flows/node-types.md)                                                                |
| **Metering Start / Collection**        | `metering.sessionId`, `metering.operationId`, `metering.resourceId`, `metering.usageId`, `metering.kind`, `metering.requestedAt`                                                       |

Usage form answers are addressed by form ID and field ID, for example `formSubmissions.12.answers.34.value`. Only submitted forms are present. Notes, end times and optional user fields may be empty or absent. Usage and door triggers have different shapes; inspect the actual run before choosing paths.

For an MQTT message on `workshop/laser/status` containing `{"temperature":42,"running":true}`, downstream nodes receive an object like:

```json
{
  "serverId": 1,
  "topic": "workshop/laser/status",
  "payload": {
    "temperature": 42,
    "running": true
  },
  "resource": {
    "id": 7,
    "name": "Laser cutter",
    "type": "machine",
    "metadata": {
      "mqttTopic": "workshop/laser/command"
    }
  }
}
```

MQTT content is parsed as JSON when possible, including numbers, booleans and arrays. Otherwise `payload` is the raw text, such as `ON`.

## Paths and Templates

A **path** selects a value. A **template** produces text. Use the form expected by the setting:

| Setting                          | Example                                | Meaning                               |
| -------------------------------- | -------------------------------------- | ------------------------------------- |
| **If → Payload Path**            | `payload.temperature`                  | Read the temperature directly         |
| **Set Payload → Key**            | `reading.temperature`                  | Write a nested field                  |
| **Get Variables → Payload path** | `limits.temperature`                   | Copy the stored value into this field |
| **MQTT Send → Payload**          | `Temperature: {{payload.temperature}}` | Render text using the current data    |

Do not put `{{ }}` around an **If** path. Its comparison value is either literal text or another payload path, depending on **Comparison value is a payload path**. It is not a template.

### Template Syntax

Template-enabled settings use [Handlebars expressions](https://handlebarsjs.com/guide/expressions.html).

| Template                          | Result with the MQTT example above  |
| --------------------------------- | ----------------------------------- |
| `{{resource.name}}`               | `Laser cutter`                      |
| `{{payload.temperature}}`         | `42`                                |
| `{{resource.metadata.mqttTopic}}` | `workshop/laser/command`            |
| `{{payload.missing}}`             | Empty text                          |
| `{{json payload}}`                | `{"temperature":42,"running":true}` |

Nested values use dots. Literal keys containing dots use brackets: a variable whose key is `machine.mode` is read with `{{variables.resource.[machine.mode]}}`. A numeric form-answer path can be written as `{{formSubmissions.[12].answers.[34].value}}`.

Handlebars supports [built-in helpers](https://handlebarsjs.com/guide/builtin-helpers.html), for example:

```handlebars
{{#if payload.running}}RUNNING{{else}}STOPPED{{/if}}
```

Use **If** nodes for flow comparisons and branching. Templates render text; they do not evaluate JavaScript expressions such as `{{payload.temperature > 40}}`.

### Escaping and JSON

`{{value}}` HTML-escapes characters such as `&` and quotes. `{{{value}}}` emits raw text. For JSON messages and HTTP bodies, use Attraccess's **`json` helper**, which serializes a value and emits it without HTML escaping:

```handlebars
{ "resourceId":
{{json resource.id}}, "resourceName":
{{json resource.name}}, "reading":
{{json payload}}
}
```

Do not add quotes around `{{json resource.name}}`: the helper already supplies JSON string quotes. It handles objects, arrays, numbers, booleans and `null`. Ensure referenced values exist; missing fields can leave the rendered JSON invalid. Triple braces alone do not escape text for JSON or encode a value for a URL.

Put a space or newline between a template's closing `}}` and a JSON object's closing `}`. Writing them together as `}}}` can cause a Handlebars parse error.

## Arithmetic and Unit Conversion

Template-enabled fields support four arithmetic helpers. Each takes exactly two operands, in left-to-right order:

| Helper     | Example            | Result |
| ---------- | ------------------ | ------ |
| `add`      | `{{add 2 3}}`      | `5`    |
| `subtract` | `{{subtract 2 3}}` | `-1`   |
| `multiply` | `{{multiply 2 3}}` | `6`    |
| `divide`   | `{{divide 3 2}}`   | `1.5`  |

Operands can be literal numbers, payload paths or stored-variable paths, such as `{{divide payload.energy_wh variables.resource.scale}}`. Numbers and numeric strings such as `"1500"` are accepted. Use a decimal point, not a decimal comma. These helpers are available wherever a node setting supports templates; **If** paths and literal settings still do not evaluate templates.

### Example: Convert Wh to kWh

Suppose the received MQTT content is `{"energy_wh":1500}`. In **Set Payload**, configure:

| Key                  | Value template                      |
| -------------------- | ----------------------------------- |
| `reading.energy_kwh` | `{{divide payload.energy_wh 1000}}` |
| `reading.unit`       | `kWh`                               |

The result has `reading.energy_kwh: "1.5"` and `reading.unit: "kWh"`. **Set Payload** still writes text. Use **Set Variables** with the same value template to store the result as a JSON number, then **Get Variables** if you need that number in the payload.

To send the conversion directly as a JSON number in an MQTT message or HTTP body, use:

```handlebars
{ "energy_kwh": {{json (divide payload.energy_wh 1000)}} }
```

This produces `{ "energy_kwh": 1.5 }`. After an acknowledged HTTP request with response `{"energy_wh":1500}`, use `energy_wh` instead of `payload.energy_wh`.

For consumption billing, select or create **Energy (kWh)** in **Report Meter**, choose **total**, and use **Value** `{{divide payload.energy_wh 1000}}`. Meters do not store or convert units: choose names and rates that match the reported values. To keep the original values, report `{{payload.energy_wh}}` to a meter named **Energy (Wh)** and price each reported value accordingly. See [Meters](flows/energy-metering.md) for cumulative readings, increments and session tracking.

### Combining Operations

Use parentheses for nested helpers. For example, convert Celsius to Fahrenheit with:

```handlebars
{{add (divide (multiply payload.temperature_c 9) 5) 32}}
```

For `temperature_c: 20`, the result is `68`. Parentheses pass the inner numeric result to the outer helper; they do not evaluate arbitrary JavaScript. `{{payload.energy_wh / 1000}}` is not valid arithmetic syntax, and `{{payload.energy_wh}} / 1000` only produces text such as `1500 / 1000`.

### Invalid Values and Precision

Missing values, empty text, booleans, `null`, objects, arrays and nonnumeric strings cause a node error. Division by zero and non-finite results such as overflow also cause an error instead of rendering a misleading value. The node's normal failure behavior applies; **Set Payload** stops the flow on such an error.

Arithmetic uses JavaScript floating-point numbers. Decimal calculations can show rounding artifacts, such as `{{add 0.1 0.2}}` producing `0.30000000000000004`. When possible, pass the original decimal value or numeric string directly to **Report Meter** and configure its rate for those values. Meter tracking and billing use exact arithmetic with nine decimal places.

### Exact Scaling and Value Mappings

Use `{{scaleDecimal payload.count "1/1000"}}` to scale decimal values without floating-point intermediates. The factor can be a decimal or a fraction, such as `"5/18"`. The result is text, rounded to nine decimal places, with half values rounded away from zero. Set `precision=2` for two decimal places (supported range: 0–18), or `min=0` to reject negative input before rounding.

Use `{{mapValue payload.kind '{"box":"12","bag":"3"}'}}` to look up a value in a JSON object. Keys are trimmed; `foldCase=true` tries the exact key first, then its lowercase form. Missing mappings cause a node error. For example, `{{scaleDecimal payload.count (mapValue payload.kind '{"box":"12","bag":"3"}')}}` converts counts of boxes or bags to individual pieces.

`{{render "{{#if ready}}{{count}}{{else}}0{{/if}}"}}` evaluates a template string against the current payload. It lets an existing complete template become an operand inside another helper. These helpers work in all template-enabled node settings and contain no built-in unit definitions.

## Changing the Payload

**Set Payload** preserves existing fields and writes each configured **Key → Value** entry. Keys are literal paths; values are templates. With the MQTT example:

| Key                   | Value                                         |
| --------------------- | --------------------------------------------- |
| `reading.temperature` | `{{payload.temperature}}`                     |
| `command`             | `{{#if payload.running}}ON{{else}}OFF{{/if}}` |

This adds `reading.temperature` as the **string** `"42"` and `command` as `"ON"`. Even `true`, `42` or `{{json payload}}` becomes text in **Set Payload**, not a boolean, number or object.

All entries in one **Set Payload** node read the same incoming payload. An entry cannot read a value created by an earlier entry in that node. Use a second node when a template depends on the first node's result.

### Nodes That Replace Data

| Node                               | Downstream payload                                                            |
| ---------------------------------- | ----------------------------------------------------------------------------- |
| **HTTP Request**, acknowledged     | Response body directly; `{"energy_wh":1500}` is read as `{{energy_wh}}`       |
| **HTTP Request**, dispatch         | Original payload; no response body                                            |
| **Wait for MQTT Message**, success | `{ "topic": "…", "payload": … }`; no previous fields or `serverId`            |
| **Add Billing Item**               | The item: `name`, `description`, `externalReference`, `unitPrice`, `quantity` |
| **Lock PC / Unlock PC**            | Incoming fields, with `companion` replaced by `{ "delivered": true/false }`   |

Resource context is added again when the result is an object. Stored variables remain accessible in templates. Arrays, text and other non-object HTTP responses do not receive the added resource or variable context.

If later nodes need earlier event data, store the required values in **Set Variables** before a replacing node and read them afterward. Simply adding fields with **Set Payload** before an HTTP request does not preserve them across an acknowledged response.

When an output connects to several nodes, its branches run concurrently. Connecting those branches to the same node runs that node once per incoming edge; it does not merge their payloads or wait to combine them. Avoid relying on ordering between branches.

## Persistent Flow Variables

Open **Variables** in the flow editor to inspect, create, edit or delete stored values. The dialog lets you choose Text, Number, Boolean, Object, Array or Null.

| Scope        | Visibility                           | Template                                   |
| ------------ | ------------------------------------ | ------------------------------------------ |
| **Resource** | Flows belonging to the same resource | `{{variables.resource.targetTemperature}}` |
| **Global**   | Flows across all resources           | `{{variables.global.workshopOpen}}`        |

Resource and global keys are separate. Both can contain a key named `mode`. Keys are literal names, so storing `machine.mode` does not create a nested object.

For object payloads, templates can read stored variables without a **Get Variables** node. These values are loaded around each node execution. They are additional template context and are not normally fields in the payload shown in logs. **If** reads only the payload, so use **Get Variables** to copy a variable into the payload before comparing it.

### Writing Typed Values

**Set Variables** renders both the key and the value, then tries to parse the value as JSON. If parsing fails, it stores the rendered text.

| Value template     | Stored value                                           |
| ------------------ | ------------------------------------------------------ |
| `42`               | Number `42`                                            |
| `true`             | Boolean `true`                                         |
| `null`             | Null                                                   |
| `{"limit":40}`     | Object                                                 |
| `["ready","busy"]` | Array                                                  |
| `ready`            | Text `ready`                                           |
| `"42"`             | Text `42`                                              |
| `{{json payload}}` | The received MQTT content with its JSON type preserved |

Use `{{json someTextField}}` to preserve arbitrary text as a JSON string. Values within one **Set Variables** node render against its incoming context; use separate nodes if a later assignment must read an updated stored variable. Writes replace the stored value, and concurrent runs can overwrite each other's updates; this is not an atomic counter operation.

### Reading and Reacting to Changes

**Get Variables** copies a stored value, preserving its type, into a configured payload path. A missing key produces an undefined value and a warning in the server log; it does not fail the node. Check or initialize required values before using them.

**Variable Changed** starts a new run when a watched value is created or changes. Writing the same value again does not trigger it; deleting a variable does not trigger it. **Any change** includes writes from the same resource. **Only changes from other resources** (`exclude-self`) skips writes originating from the trigger's resource, not just from the same node. Avoid a cycle that repeatedly changes the watched value.

## Example: Compare a Reading with a Stored Limit

1. In **Variables**, create a resource variable `targetTemperature` of type **Number**, value `40`.
2. Add **MQTT Message Received** for your server and topic `workshop/laser/status`.
3. Connect **Get Variables**: scope **Resource**, key `targetTemperature`, payload path `limits.temperature`.
4. Connect **If**: payload path `payload.temperature`, operator `>`, enable **Comparison value is a payload path**, comparison value `limits.temperature`.
5. Connect **True** to **MQTT Send Message**. Choose the server, topic `workshop/laser/alarm` and payload `{"temperature": {{json payload.temperature}}, "limit": {{json limits.temperature}} }`.

With the example reading of `42`, the True branch sends `{"temperature":42,"limit":40}`. **If** uses numeric conversion for `>`, `<`, `>=` and `<=`; equality and inequality compare string representations.

## Inspecting and Troubleshooting a Run

Open **Flow logs**, choose a recording duration and click **Start recording** before triggering the flow. Inspect the node entries' `input` and `output` data to find the exact paths and see where fields change. Logs are collected while recording and remain in the page until you leave or reload.

| Symptom                                       | Check                                                                                                                   |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| A template renders empty                      | Field exists in this node's input; correct trigger shape and variable scope                                             |
| A JSON message is invalid                     | Use `json`, avoid extra quotes around it, and ensure each referenced value exists                                       |
| An object becomes `[object Object]`           | Serialize it with `{{json payload}}`                                                                                    |
| **If** always takes the wrong branch          | Use paths without braces; check the comparison-path switch and numeric values                                           |
| Original event fields disappear               | An acknowledged HTTP request, MQTT wait or billing node replaced the payload                                            |
| A field appears as `"true"` instead of `true` | **Set Payload** writes strings; use **Set Variables** and **Get Variables** for typed values                            |
| A failure connection never runs               | Set **On failure** to **Continue through failure output**; see [failure behavior](flows/node-types.md#failure-behavior) |

## See Also

- [Node Types](flows/node-types.md) — Settings, template support and payload behavior for every core node
- [Flow Editor](flows/flow-editor.md) — Build and connect your flow
- [Meters](flows/energy-metering.md) — Reading and reporting meter values
