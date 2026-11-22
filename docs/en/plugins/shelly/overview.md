# Shelly

<!-- llms-description: The Shelly plugin keeps a registry of Shelly devices on your network, with discovery, Bluetooth setup of new devices, device info, admin password management and firmware updates. -->

> [!NOTE]
> Only available when the **Shelly** plugin is installed. See [Installing Plugins](plugins/installing-plugins.md).

The **Shelly** plugin keeps a registry of the Shelly devices on your network and lets you manage them from Attraccess.
The registry does not change the devices when you add or remove an entry.

## Prerequisites

- Attraccess 2.0 or newer and the `shelly` plugin, installed as described in
  [Installing Plugins](plugins/installing-plugins.md). It needs the `PLUGIN_STORAGE` permission for its own tables.
- Upgrading a 1.x (SQLite) installation does not move the plugin's data: the plugin starts empty on PostgreSQL and
  has to be set up again (see [Moving from SQLite to PostgreSQL](installation/updating.md#moving-from-sqlite-to-postgresql)).
- Shelly devices that the Attraccess server can reach over the network by IP address. A new device that is not on the
  network yet can be set up over Bluetooth (see below), but it still has to end up reachable by IP address.
- Users need the **Manage Resources** permission (`resources.update`) to open the page.
- If Attraccess runs in a container, its network is not your LAN. Enter the subnet of your devices when you
  discover them.

## Where it appears

**Shelly** in the sidebar opens the **Shelly Devices** page, a table with device, address, model, auth state and
firmware.

## What you can do

- **Set up over Bluetooth:** join a factory-reset device to your Wi-Fi from your browser, see
  [Set up a new device over Bluetooth](#set-up-a-new-device-over-bluetooth).
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

## Set up a new device over Bluetooth

A factory-reset Shelly is not on your network, so Attraccess cannot reach it by IP address. **Set up over Bluetooth**
connects to it from your browser, gives it an admin password and your Wi-Fi, and adds it to the registry.

**Requirements**

- Chrome or Edge on a desktop or Android device. Firefox and Safari do not support Web Bluetooth.
- Attraccess opened over HTTPS or on `localhost`. Browsers only allow Bluetooth on secure pages.
- A Shelly Gen2, Gen3 or Gen4 device, within Bluetooth range. Gen1 devices cannot be set up over Bluetooth. On some
  Gen2 firmware, **RPC over Bluetooth** must be enabled in the device's web interface first. Without it, join the
  device to your Wi-Fi through its own access point and use **Add device** or **Discover**.
- A 2.4 GHz Wi-Fi network. Shelly devices cannot join 5 GHz networks.

**Steps**

1. On the **Shelly Devices** page, choose **Set up over Bluetooth** and then **Select device**. Pick the Shelly in the
   browser's list (its name starts with `Shelly`). Attraccess shows its model, generation, device ID, MAC address and
   firmware. If nothing happens and a message says Bluetooth is off, switch Bluetooth on on your computer.
2. Pick your Wi-Fi network from the list the device scanned. For a hidden network, or if the scan fails, choose
   **Other network (enter name)** and type its name. Enter the Wi-Fi password; leave it empty for an open network.
3. Enter the password in **New admin password** and **Confirm admin password**. It is required: it is set on the device before the Wi-Fi, so the device is
   never on your network unprotected. The username is `admin`. If the device already has an admin password, enter its
   current password in **Current admin password** instead.
4. Optionally change the name. It defaults to the device's Bluetooth name.
5. Decide on **Switch off Bluetooth on the device after setup**, which is ticked by default. Leave it ticked unless you
   use the device as a BLU or BTHome gateway. While Bluetooth is on, anyone nearby can try to connect.
6. Choose **Start setup**. Attraccess sets the admin password, configures the Wi-Fi, waits for the device to get an IP
   address (up to 60 seconds), adds it to the registry and then switches Bluetooth off if requested. Keep the drawer
   open until it finishes.

**Good to know**

- The Wi-Fi and admin passwords go from your browser straight to the device over Bluetooth. They are not sent to the
  Attraccess server, not stored and not logged.
- If the device needs to restart to apply the Wi-Fi settings, it restarts and is not added yet. Add it with
  **Discover** or **Add device** once it is online. Bluetooth stays on in that case.
- If a device with that IP address is already in the registry, nothing is added. Bluetooth is still switched off if
  you asked for it.
- If the Bluetooth link drops, choose **Start over**. A device that already joined your Wi-Fi can be added with **Discover**.
- If the device refuses to switch Bluetooth off, it stays set up and registered. Switch Bluetooth off in the device's
  web interface. If the device does not confirm it, Attraccess says so; check Bluetooth there too.

## See also

- [Installing Plugins](plugins/installing-plugins.md)
- [Developing Plugins](plugins/developing-plugins.md)
