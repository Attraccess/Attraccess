# WAGO

<!-- llms-description: The WAGO plugin connects WAGO CC100 controllers over MQTT to switch outputs, read inputs and Modbus meters and trigger flows; overview and prerequisites. -->

> [!NOTE]
> Only available when the **WAGO** plugin is installed. See [Installing Plugins](plugins/installing-plugins.md).

The **WAGO** plugin connects WAGO CC100 PLC controllers to Attraccess through an MQTT server. It lets you commission a
controller from the browser, name its inputs and outputs, read Modbus meters, and use the controller in flows (switch
an output, react to an input or an event).

> [!WARNING]
> **Not a safety function.** The WAGO integration controls outputs for operational purposes only. It is not safety
> rated, not an emergency stop and not personnel protection. Read the [safety boundary](plugins/wago/safety-boundary.md)
> before connecting any equipment. Physical use is unqualified until
> [ATT-984](https://linear.app/attraccess/issue/ATT-984/validate-the-four-wago-package-assemblies).

## Prerequisites

- A paid Attraccess license that includes the **`wago`** license module. The WAGO plugin is a commercial add-on: the key
  for non-profit use does **not** unlock it, and there is no free use. Without the module the plugin is not loaded and
  appears in **Settings → Plugins** as **License missing**. After you save a valid license key with the module,
  Attraccess restarts and loads the plugin. See [Installing Plugins](plugins/installing-plugins.md#license-missing). Licenses:
  [contact@attraccess.org](mailto:contact@attraccess.org).
- Attraccess 1.11.0 or newer and the `wago` plugin, installed as described in
  [Installing Plugins](plugins/installing-plugins.md). It needs the `PLUGIN_STORAGE`, `ACCESS_MQTT_SERVERS`,
  `TRIGGER_FLOWS` and `MANAGE_SECRETS` permissions.
- An [MQTT server](devices/mqtt/server-setup.md) configured in Attraccess, reachable by the controller.
- WAGO CC100 hardware (`751-9301`, firmware 31) on the same private network as Attraccess. See
  [production support](plugins/wago/production-support.md) for the tested compatibility.
- Optional: Modbus devices on the controller's RS-485 interface, for example a WAGO 879-3020 meter.

## Where it appears

- **WAGO** in the **Devices** group of the sidebar: controller list, commissioning, configuration, live controls,
  diagnostics and revision history.
- WAGO nodes in the [flow editor](flows/node-types.md), including the WAGO event trigger (see
  [Global Flows](flows/global-flows.md)).

## Start here

| Page                                                              | Covers                                                       |
| ----------------------------------------------------------------- | ------------------------------------------------------------ |
| [Guided CC100 Commissioning](plugins/wago/cc100-commissioning.md) | Commission a controller step by step                         |
| [CC100 Docker Runtime](plugins/wago/cc100-runtime.md)             | Front panel configuration, live controls, runtime deployment |
| [Production Support](plugins/wago/production-support.md)          | Tested compatibility, broker settings, limits                |
| [Recovery Runbooks](plugins/wago/recovery-runbooks.md)            | Credential compromise, broker outage, controller replacement |
| [Threat Model and Pen-Test Brief](plugins/wago/threat-model.md)   | Actors, trust boundaries, attack surfaces                    |
| [Safety Boundary](plugins/wago/safety-boundary.md)                | What the integration is not, with a wording checklist        |

## Reference pages

- [Modbus RTU with the 879-3020 meter](plugins/wago/879-3020-modbus-rtu.md)
- [Measurement contract](plugins/wago/measurement-contract.md)
- [Diagnostics](plugins/wago/diagnostics.md)
- [Credential rotation](plugins/wago/credential-rotation.md)
- [Audit integration](plugins/wago/audit-integration.md)
- [FW31 support boundaries](plugins/wago/fw31-support.md)
- [Commissioning platform software](plugins/wago/commissioning-platform.md)
- [Acceptance evidence](plugins/wago/acceptance-evidence.md)
