# Firmware Updates

Attractap readers support OTA (Over-The-Air) firmware updates. This means you can update reader firmware remotely through the Attraccess backend without physically accessing the device.

## How Firmware Updates Work

1. A new firmware version is uploaded to the Attraccess backend
2. The firmware is assigned to one or more reader devices
3. The reader downloads and installs the update over the network
4. The reader restarts with the new firmware

> [!NOTE]
> During a firmware update, the reader is temporarily unavailable. The update typically takes less than a minute.

## Managing Firmware

### Viewing Available Firmware

1. Navigate to **Attractap** in the sidebar
2. Click on **Firmware**
3. You see a list of all uploaded firmware versions

<!-- TODO: Screenshot of the firmware list -->

### Uploading New Firmware

1. Navigate to **Attractap** > **Firmware**
2. Click **Upload Firmware**
3. Fill in the firmware details:

| Field | Description |
|-------|-------------|
| **Version** | Version number of the firmware (e.g. "1.2.0") |
| **Variant** | Hardware variant this firmware is for (Lite, Touch, etc.) |
| **File** | The firmware binary file (.bin) |
| **Release Notes** | Optional description of changes in this version |

4. Click **Upload**

> [!NOTE]
> Different hardware variants require different firmware files. Make sure you select the correct variant when uploading.

### Pushing Updates to Readers

1. Navigate to **Attractap** > **Readers**
2. Select the reader(s) you want to update
3. Choose the target firmware version
4. Click **Update Firmware**
5. The update is pushed to the selected reader(s)

<!-- TODO: Screenshot of the firmware update dialog -->

## Firmware Variants

Each hardware variant requires its own firmware build:

| Hardware Variant | Firmware Variant |
|-----------------|-----------------|
| Attractap Lite Ethernet | `lite-ethernet` |
| Attractap Touch WiFi | `touch-wifi` |
| Attractap Touch Ethernet | `touch-ethernet` |

> [!TIP]
> Always test a firmware update on a single reader before pushing it to all devices.

## Update Status

After pushing an update, you can monitor the progress in the Readers list:

| Status | Description |
|--------|-------------|
| **Up to date** | Reader is running the latest assigned firmware |
| **Update pending** | Update has been pushed but not yet installed |
| **Updating** | Reader is currently downloading and installing the update |
| **Update failed** | Update could not be installed -- check reader connectivity |

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Update stays in "pending" state | Verify the reader is connected to the network and can reach the backend |
| Update fails repeatedly | Ensure you uploaded the correct firmware variant for the reader hardware |
| Reader unresponsive after update | Wait a few minutes for the reader to restart. If it does not recover, a manual reflash may be required |

## See Also

- [Overview](attractap/overview.md) -- What is Attractap?
- [Hardware](attractap/hardware.md) -- Hardware variants and components
- [Setup](attractap/setup.md) -- Register and configure readers
