# Firmware Updates

Attractap readers support OTA (Over-The-Air) firmware updates. This means reader firmware is updated remotely through the Attraccess backend without physically accessing the device.

## How Firmware Updates Work

Reader firmware ships with Attraccess itself: every Attraccess release bundles the firmware build for each hardware variant. There is nothing to upload and no update to schedule.

1. A reader connects to the backend and reports its firmware name, variant and version
2. The backend compares that version with the one bundled in the running Attraccess release
3. If the two differ, the backend sends the bundled image to the reader over the same connection
4. The reader installs the update and restarts with the new firmware

The way to update your readers is therefore to update Attraccess. Once the backend runs a release carrying newer reader firmware, every reader picks it up the next time it connects.

> [!NOTE]
> During a firmware update, the reader is temporarily unavailable. The update typically takes less than a minute.

## Checking Reader Firmware

1. Open the **Devices** group in the sidebar
2. Click on **Attractap Readers**
3. Each reader row names its firmware and variant and carries a version chip

That chip is the entire firmware display:

| Chip | Meaning |
|------|---------|
| `v1.2.0` | The reader runs the firmware bundled with this Attraccess release |
| `v1.1.0 -> v1.2.0`, highlighted | A different version is bundled; the reader will take it on its next connection |

<!-- TODO: Screenshot of the reader list showing an available firmware update -->

> [!NOTE]
> The web interface has no firmware upload and no manual "update this reader" control. Both would be ways to run a reader on firmware that does not match the backend it talks to, which is exactly what bundling the firmware with the release prevents.

## Firmware Variants

Each hardware variant requires its own firmware build:

| Hardware Variant | Firmware Variant |
|-----------------|-----------------|
| Attractap Lite Ethernet | `lite-ethernet` |
| Attractap Touch WiFi | `touch-wifi` |
| Attractap Touch Ethernet | `touch-ethernet` |

A reader is only ever offered the build matching the variant it reports, so a reader cannot be updated with the wrong image.

> [!TIP]
> All readers of a variant follow the release together -- there is no per-reader rollout. To try a new firmware before your members meet it, point a single spare reader at a test instance running the new Attraccess version.

## Troubleshooting

| Problem | Solution |
|---------|----------|
| A reader keeps showing an available update | Verify it is connected to the network and can reach the backend -- the update is only offered while it is connected |
| The update never completes | Make sure the reader's connection stays up for the whole transfer; the reader retries the next time it connects |
| Reader unresponsive after update | Wait a few minutes for the reader to restart. If it does not recover, a manual reflash may be required |

## See Also

- [Overview](attractap/overview.md) -- What is Attractap?
- [Hardware](attractap/hardware.md) -- Hardware variants and components
- [Setup](attractap/setup.md) -- Register and configure readers
