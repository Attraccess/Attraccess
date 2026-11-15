# Shelly
<!-- llms-description: The Shelly plugin keeps a registry of Shelly devices on your network, with discovery, device info, admin password management and firmware updates. -->

> [!NOTE]
> Only available when the **Shelly** plugin is installed. See [Installing Plugins](plugins/installing-plugins.md).

The **Shelly** plugin keeps a registry of the Shelly devices on your network and lets you manage them from Attraccess.
The registry does not change the devices when you add or remove an entry.

## Prerequisites

- Attraccess 1.11.0 or newer and the `shelly` plugin, installed as described in
  [Installing Plugins](plugins/installing-plugins.md). It needs the `DATABASE_ACCESS` permission.
- Shelly devices that the Attraccess server can reach over the network by IP address.
- Users need the **Manage Resources** permission (`resources.update`) to open the page.
- If Attraccess runs in a container, its network is not your LAN. Enter the subnet of your devices when you
  discover them.

## Where it appears

**Shelly** in the sidebar opens the **Shelly Devices** page, a table with device, address, model, auth state and
firmware.

## What you can do

- **Add device:** enter the device's IP address. Attraccess probes `GET /shelly` to detect the generation and model.
  The name is optional.
- **Discover:** the **Discover devices** drawer listens for devices announcing over mDNS, then probes every address of
  a subnet. Leave the subnet empty to scan the server's own networks. Only private ranges up to a /22 are allowed.
  Everything found is added to the registry.
- **View device info:** name, generation, timezone, uptime, network and Wi-Fi signal, and the output state with power,
  voltage and current. A device with authentication asks for its admin password first.
- **Set admin password:** set or change the admin password that protects the device's local web interface and API.
  If the device already has authentication enabled, enter the current password too.
- **Manage firmware:** check for updates on the stable and beta channel and install them. The device reboots during
  the update and is offline for a moment.
- **Re-probe device** to refresh its generation, model and auth state, and **Delete device** to remove it from the
  registry.

## See also

- [Installing Plugins](plugins/installing-plugins.md)
- [Developing Plugins](plugins/developing-plugins.md)
