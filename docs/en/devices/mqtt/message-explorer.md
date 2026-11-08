# MQTT Message Explorer

The message explorer lets you watch live MQTT messages and publish test messages for any MQTT server configured in Attraccess. It works with every broker (Mosquitto, RabbitMQ, EMQX, ...). Use it to test and debug flows that use MQTT nodes.

## Who can use it

Everyone who can edit resources (permission `resources.update`) -- the same permission that is needed for the MQTT server pages and the flow editor. Other users do not see the explorer and the server refuses their requests.

> **Note:** Message payloads are visible to everyone with this permission. Do not publish secrets to topics you do not want resource editors to read.

## Where to find it

### On the MQTT server page

Open **Devices → MQTT Servers** and select a server. The **Message explorer** card shows messages from this server.

### In the flow editor

Click the **MQTT explorer** button (antenna icon) in the flow editor toolbar. The button appears when at least one MQTT server exists.

- On a desktop screen the explorer opens as a panel on the right of the canvas. The canvas stays fully usable: edit nodes, save and open node settings while the explorer is open.
- On a small screen the explorer opens as a drawer.
- The server is preselected from the flow: the MQTT server that most MQTT nodes of the flow use, including changes you have not saved yet. Use the server selector at the top of the panel to switch. Switching restarts a running subscription and clears the log.
- The topics your flow's MQTT nodes use are offered as buttons. Press one to fill the topic filter or the publish topic. Topics that contain templates (`{{ ... }}`) are skipped.
- Closing the panel ends the subscription. Opening it again starts fresh. Attraccess remembers in your browser whether the panel was open.

The explorer does not change the flow and does not affect its saved state.

## Watching messages

1. Enter a **topic filter** (default `#`, all topics) and press **Subscribe**.
2. Messages appear newest first. The log keeps the latest 500 messages.
3. Use **Pause** to stop the live stream (messages sent meanwhile are not shown), **Clear** to empty the log and **Apply filter** to start a new subscription with a changed filter.

Payloads are shown as formatted JSON, as text, or as a hex preview if they are binary. Retained messages arrive immediately after you subscribe.

### Limits

| Limit | Value |
|-------|-------|
| Topic filter | `+` and `#` wildcards, each filling a whole level (`#` only at the end), up to 256 bytes. Shared subscriptions (`$share/...`, `$queue/...`) are not allowed |
| Payload | Payloads over 64 KiB are shortened (marked **truncated**) |
| Busy topics | At most 50 messages (and about 512 KiB) are delivered every quarter second. Further messages are dropped and the explorer shows how many |

Prefer a narrow filter such as `devices/+/status` on busy brokers.

## Publishing messages

Fill in the **Topic** (no `+` or `#`), an optional **Payload**, the **QoS** and whether the message should be **retained**, then press **Publish**.

Publishing uses the same connection as the **Send MQTT message** flow node. The message therefore behaves like a real message: flows with a matching **MQTT message received** trigger run, and devices that listen on the topic react. Use it with care.

## Its own broker connection

The explorer does not use the connection that flows use. It opens its own short-lived connection to the broker, with a client ID starting with `attraccess-x-`, when the first person starts watching, and closes it shortly after the last person stops. A broad filter such as `#` therefore does not slow down your flows and does not trigger them. You may see this connection in the broker's connection list.

## Audit log

Subscribing and publishing are written to the audit log (domain **Administration**, subject **MQTT server**): the topic, and for publishing also size, QoS and retain. The payload is never recorded.

## See Also

- [MQTT Server Setup](devices/mqtt/server-setup.md)
- [Flow Editor](flows/flow-editor.md)
- [Node Types](flows/node-types.md)
