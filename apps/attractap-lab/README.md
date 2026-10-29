# Attractap hardware lab

A headless Linux app exposing USB-connected readers through labgrid. The app
provides a reusable NixOS module, an optional web dashboard, two small labgrid drivers and a shared agent/CI
workflow. Hostname, Tailscale, SSH policy, disks and OS updates belong to the
consuming machine configuration.

## Install on NixOS

Add this flake input to your own configuration and commit its lockfile:

```nix
inputs.attraccess = {
  url = "github:Attraccess/Attraccess?dir=apps/attractap-lab";
  inputs.nixpkgs.follows = "nixpkgs";
};
```

Import `inputs.attraccess.nixosModules.attractap-lab` into a Linux host. Use a
supported stable nixpkgs; this app is checked against its pinned NixOS 26.05.
Keep client and host labgrid versions aligned (currently 26.x).

For concurrent agents, the [JappyJan/labgrid fork](https://github.com/JappyJan/labgrid/tree/stable-26)
adds a native `labgrid-client session` command, compatible with the existing
26.x coordinator/exporter. Build firmware before reserving a reader:

```sh
labgrid-client -x attractap-lab:20408 session --filter board=attractap \
  --purpose 'ATT-1154: firmware smoke check' --wait-timeout 300 -- \
  attractap-lab --config apps/attractap-lab/example-env.yaml --image /path/to/merged.bin
```

The outer session allocates and exclusively claims one compatible reader under
a unique identity. `attractap-lab` and the Python `claim` helper reuse that
claim inside the child, cleaning drivers without releasing the outer claim.
`LG_PLACE` selects the allocated reader and `LG_ARTIFACTS` selects a unique
artifact directory containing session metadata. Keep the complete hardware
sequence in that child; native labgrid commands share its identity. Ordinary
failure, SIGINT and SIGTERM stop child processes and clean up reservations and
claims. SIGKILL/machine failure require deliberate recovery. Never automatically
force-release another claim. The fork includes a global agent skill under
`skills/labgrid`.

```nix
services.attractap-lab = {
  enable = true;
  ssh.authorizedKeys = [ "ssh-ed25519 REPLACE_WITH_PUBLIC_KEY" ];
  coordinator = {
    enable = true;
    listenAddress = "0.0.0.0:20408";
    # <firmware variant>-<n>, after apps/attractap/firmware/variants/.
    places.attractap-touch-v2-1 = {
      matches = [ "lab-host/attractap-touch-v2-1/*" ];
      tags = {
        board = "attractap";
        variant = "attractap-touch-v2";
      };
    };
  };
  exporter = {
    enable = true;
    name = "lab-host";
    hostname = "lab-host";
    settings.attractap-touch-v2-1 = {
      USBSerialPort.match.ID_SERIAL_SHORT = "REPLACE_WITH_READER_SERIAL";
      USBFlashableDevice.match = {
        SUBSYSTEM = "tty";
        ID_SERIAL_SHORT = "REPLACE_WITH_READER_SERIAL";
      };
      HTTPVideoStream.url = "http://127.0.0.1:8080/snapshot";
    };
  };
  cameras.overview = {
    device = "/dev/v4l/by-id/REPLACE_WITH_WEBCAM-video-index0";
    port = 8080;
    extraArgs = [ "--format=MJPEG" "--resolution=1920x1080" "--desired-fps=5" ];
  };
};
```

Configure Tailscale on the host and permit trusted clients to reach SSH and
coordinator TCP port 20408. The module opens no firewall ports. The exporter
uses labgrid's isolated mode: dynamic serial ports and loopback camera access
travel through SSH. Clients need passwordless SSH to the exporter as `labgrid`:

```sshconfig
Host lab-host lab-host.*
  User labgrid
  IdentityFile ~/.ssh/id_ed25519
  StrictHostKeyChecking yes
```

Verify the host's SSH key through an existing trusted connection before adding
it to known_hosts. `--hostname` controls advertised resource addresses; labgrid
also advertises the exporter's system FQDN as its SSH proxy. Both must resolve
and match the client SSH configuration.

The `labgrid` account can control exported hardware. Labgrid claims coordinate
trusted participants; direct SSH/serial access is not isolated per claimant.
Limit host access to the intended users and CI identities.

## Connect the real hardware

Find the reader with `ls -l /dev/serial/by-id` and
`udevadm info --query=property --name=/dev/ttyACM0` (use its actual device node).
Replace both serial placeholders with the same stable USB property. If serial
numbers are not unique, use native labgrid udev matching with a stable USB path.
Check the identity in both normal firmware and bootloader modes.

Use `v4l2-ctl --list-devices` and `--list-formats-ext` to choose the webcam's
capture node, resolution and MJPEG support. Mount it rigidly.

Each reader gets its own exporter group and place. Repeat the same
`HTTPVideoStream` URL in multiple reader groups to share the camera without
making different readers contend for one video resource. Name each place
`<firmware variant>-<n>` and tag its `variant`; the hardware workflow selects
the place from the firmware image's variant. Screen capture uses
the stream as served: either point each group at a view already cropped to its
reader's screen, or add `crop: "width:height:x:y"` (camera pixels) to
`ScreenCaptureDriver` in a copy of `example-env.yaml` per reader. A shared
client environment needs per-place views, because the same crop applies to
whichever place a session allocates.

`exporter.settings` and `coordinator.places` use native labgrid schemas. Places
are authoritative when configured: syncing removes places absent from that
map. Set `places = null` to manage them with labgrid's CLI instead. For separate
hosts, enable only the needed role and set `exporter.coordinatorAddress` and
`exporter.hostname` to reachable private addresses.

For unattended power recovery, select a supported switch or per-port USB hub
and add its native labgrid power resource/driver to the same reader group.
`uhubctl` is installed; use `extraUdevRules` for narrowly scoped permissions
required by the actual hub. No power hardware is assumed in the example.

## NFC card emulator

A place can also export the [NFC card emulator](../attractap/nfc-emulator/README.md)
(ESP32-S3 Supermini + PN532) mounted in front of its reader, so one claim
holds both. Add the emulator's USB identity to the reader's exporter group
under its own resource names:

```nix
exporter.settings.attractap-touch-v2-1 = {
  # ...the reader's USBSerialPort, USBFlashableDevice and HTTPVideoStream...
  NfcEmulatorSerial = {
    cls = "USBSerialPort";
    match.ID_SERIAL_SHORT = "REPLACE_WITH_EMULATOR_SERIAL";
  };
  NfcEmulatorFlash = {
    cls = "USBFlashableDevice";
    match = { SUBSYSTEM = "tty"; ID_SERIAL_SHORT = "REPLACE_WITH_EMULATOR_SERIAL"; };
  };
};
```

A place with two serial ports needs explicit bindings, so `example-env.yaml`
and the janitor bind the reader's drivers to `USBSerialPort` and
`USBFlashableDevice` by name. The janitor therefore never erases the emulator.
Use `example-emulator-env.yaml` for sessions that drive the emulator:

```python
from attractap_lab.drivers import NfcEmulatorDriver

with claim("example-emulator-env.yaml", "attractap-touch-v2-1") as target:
    emulator = target.get_driver(NfcEmulatorDriver)
    emulator.command("profiles.select", {"id": "supervisor"})
    emulator.command("present")
```

`NfcEmulatorDriver` waits until the emulator answers after connecting, and
raises `NfcEmulatorError` with the firmware's error code. Plain `SerialDriver`,
`ConsoleProtocol`, `ESPToolDriver` and `ResetProtocol` lookups keep resolving
to the reader. `NfcEmulatorFlashDriver` flashes the emulator's merged image.
Emulator profiles persist across sessions; runtime state (selection,
presentation, faults, overrides) resets when the emulator reboots.

## Reader Wi-Fi without revealing the secret

Readers start empty after every release, so each session has to put its
reader on the lab Wi-Fi. Enable `readerWifi` and store the credentials on the
host, readable by root only:

```nix
services.attractap-lab.readerWifi.enable = true;
```

```sh
ssh root@lab-host 'umask 077; cat > /var/lib/attractap-lab/reader-wifi.json' <<'EOF'
{"ssid": "Lab WiFi", "password": "..."}
EOF
```

Lab users (the shared `labgrid` account) can then run
`attractap-lab-reader-wifi --place PLACE --auth-code PIN` on the host, but
cannot read the file: the command runs as root through a single sudo rule. It
refuses places that no session holds (or that the janitor is parking), and
writes the `network.wifi.credentials.set` command straight to the reader's
tty. The reader's `RESP` reply, which does not contain the password, arrives
on the session's console. Inside a session, call
`attractap_lab.workflow.send_reader_wifi(target, pin)`; it runs the command on
the exporter host over labgrid's SSH connection. Set the reader's PIN first
(`CMND auth.code.set {"newCode":"..."}`).

## Hardware-in-the-loop tests

`hil/` holds pytest tests that run real reader firmware against the NFC card
emulator: card detection, enrollment (DESFire EV2/EV3, NTAG424), login,
supervision, key reset, and rejected, faulty or removed cards.

```sh
. .tools/esp-idf/export.sh   # or set READER_IMAGE / EMULATOR_IMAGE
pnpm nx run attractap-lab:hil            # all tests
pnpm nx run attractap-lab:hil -- -k enroll
```

The runner builds both firmware images, starts an API on a free port with a
throwaway database (`STORAGE_ROOT`), and runs pytest inside one labgrid
session on `LG_PLACE_NAME` (default `attractap-touch-v2-1`). The reader gets
the lab Wi-Fi through `attractap-lab-reader-wifi`, so the host needs
`readerWifi`, and connects to the API at the address of this machine on the
route to the reader (override with `API_HOST`). `LAB_PYTHON` defaults to the
interpreter of the installed `labgrid-client`, which must provide labgrid and
pytest. Logs, the emulator trace and camera photos land in
`apps/attractap-lab/hil-artifacts/lab-artifacts/<session>`. These tests are
not part of `pnpm nx run attractap-lab:test`, which runs without hardware.

### In CI

`.github/workflows/attractap-lab-hil.yml` runs these tests from the release
workflow and on every push to `main`. It is off until the repository variable
`ATTRACTAP_LAB_HIL_ENABLED` is `true` (a repository variable, because the job's
`if:` runs before the `attractap-lab` environment loads); the
workflow file lists all variables (lab host, coordinator port, place,
Tailscale tags, relay address/port, labgrid package) and the secrets it reuses
from the hardware smoke workflow (`TS_OAUTH_CLIENT_ID`, `TS_AUDIENCE`,
`LAB_SSH_PRIVATE_KEY`, `LAB_SSH_KNOWN_HOSTS`).

A runner joins the tailnet, but readers only reach the lab's LAN. The runner
therefore relays its API through the lab host: enable
`services.attractap-lab.readerApiRelay` (default port 20480), which lets the
`labgrid` account open exactly that remote forward, and allow the port from
the readers' LAN in the host firewall. Set `ATTRACTAP_LAB_API_RELAY_HOST` to
the lab host's address on that LAN.

## Reader touchscreen and screenshots

Reader firmware built with `-DATTRACTAP_TEST_HOOKS=ON` (and, for the lab,
`-DATTRACTAP_BEEPER_DEFAULT=OFF`; see the firmware README, "Test hooks")
accepts serial commands that tap, press and swipe the touchscreen, list the
widgets on screen and stream screenshots. `attractap_lab.reader_screen` wraps
them for tests:

```python
from attractap_lab.drivers import ESPToolDriver
from attractap_lab.reader_screen import ReaderTestHooks

with claim("example-emulator-env.yaml", os.environ["LG_PLACE"]) as target:
    target.get_driver(ESPToolDriver).flash("tv2-hooks-merged.bin")
    target.deactivate(target.get_driver(ESPToolDriver))
    hooks = ReaderTestHooks(target.get_driver("SerialDriver"), "4711")
    hooks.ensure_auth_code()                  # erased readers have no PIN yet
    hooks.wait_for(screen="ConnectionConfigurationScreen")
    hooks.tap_text("Device", timeout=10)      # waits for the widget first
    hooks.swipe(240, 400, 240, 150)
    hooks.screenshot().save("screen.png")
    hooks.wait_for_log(r"Transitioning to screen: ResourceList", timeout=30)
```

`command(topic, payload)` sends any reader command with the PIN and returns
its reply, raising `ReaderCommandError` (with `.code`) for error replies and
resending commands that got no reply. `widgets()`, `screen()`,
`find(text, match)`, `wait_for(text, screen=..., timeout=...)`,
`tap(x, y)`, `press(x, y, hold_ms)`, `release()`, `swipe(...)` and
`tap_text(text, match, index)` map to the `ui.*` topics; widget dictionaries
carry `text`, `texts`, `cx`/`cy` and `hittable`. `read_log()` and
`wait_for_log(pattern)` return the reader's other console lines.
`screenshot()` returns a `Screenshot` (`width`, `height`, `rgb`, `pixel(x, y)`,
`png()`, `save(path)`) and retries corrupt transfers. The pure functions
`decode_rle565`, `assemble_screenshot`, `encode_png`, `matches` and `find`
need no hardware.

## Web dashboard

Enable the pinned upstream [labgrid-plugins dashboard](https://tfcollins.github.io/labgrid-plugins/user-guide/web-dashboard.html)
on the coordinator host:

```nix
services.attractap-lab.dashboard = {
  enable = true;
  # Defaults to loopback; use a trusted-network address to access it remotely.
  listenAddress = "0.0.0.0";
  port = 8081;
};
```

The dashboard uses native nginx and a Python API service, with a prebuilt static
frontend. It does not replace the coordinator or require Docker. The internal
API binds only to loopback (port 8001). Restrict HTTP access to the tailnet in the
host firewall; the module opens no ports. Use an HTTPS reverse proxy if serving
outside an encrypted private network.

Read-only pages show live exporters, resources, places, reservations and history.
Sign in as `admin` to manage users and acquire/release places. The initial password
is generated on first start; retrieve it through trusted SSH:

```sh
ssh root@lab-host 'cat /var/lib/attractap-lab-dashboard/initial-admin-password'
```

Change it in the dashboard's user management screen. Existing users/passwords
are preserved across updates; the initial password file is not a password reset.
The upstream known default account is never created. Back up the private
`/var/lib/attractap-lab-dashboard` directory for accounts and history.

The package carries a focused patch for labgrid 26 ownership checks: dashboard
users cannot release external agent/CI claims, including with admin force-release.
Use native `labgrid-client` for deliberate recovery. Only admins can edit place
definitions, and acquired places cannot be deleted. With declarative
`coordinator.places`, Nix remains authoritative and overwrites dashboard inventory
edits on the next synchronization.

Places with an `HTTPVideoStream` resource show a live camera view on their page
to signed-in users, connected only while shown. The API relays the stream from
the coordinator host, so the URL must be reachable there; a uStreamer-style
`/snapshot` URL is watched as its sibling `/stream`.

Browser serial consoles are explicitly disabled: upstream's TCP bridge does not
support our RFC2217/SSH transport. Use native labgrid console access instead.
ADI-specific FPGA recovery and SD-mux routes are omitted. Power hardware is not
assumed; dashboard power actions additionally require suitable native resources
and outgoing SSH credentials for the API service user.

The API follows coordinator restarts through systemd so its live state reconnects.
`pnpm nx run attractap-lab:test` checks the complete nginx/API/coordinator path,
authentication, claim exclusion and restart recovery in the NixOS VM.

## Reader parking (janitor)

The optional janitor erases every reader as soon as it is released and flashes
a lab-only parking image that turns off the screen, LEDs, beeper and NFC. The
next session starts from an empty chip and can flash anything; idle readers
stay dark. Enable it on the host running both coordinator and exporter:

```nix
services.attractap-lab.janitor = {
  enable = true;
  # Keyed by place `variant` tag; places without an image are left alone.
  images.attractap-touch-v2 = ./attractap_touch_v2_park.bin;
};
```

Build the images with `pnpm nx run attractap-firmware:build-lab`
(`firmware_output_lab/`). They are never part of an Attraccess release.

While anyone holds a reader, the janitor keeps a reservation for it at priority
1000 (sessions use 0). Labgrid allocates a released reader inside the release
itself, so the janitor always gets it before waiting sessions. It then claims
the reader as `attractap-lab-janitor/janitor`, checks its eFuses, runs
`esptool write-flash --erase-all` with the parking image and releases once the
image prints `ATTRACTAP_PARKED` on the UART. Parking takes roughly 10–20 s. On
startup and after coordinator restarts, every managed reader is parked once.

Full erase also wipes NVS: each session must provision Wi-Fi/API settings
again, and a previously paired reader registers as a new one.

eFuses cannot be erased. Before erasing, the janitor requires factory values
for secure boot, flash encryption, key purposes, download mode and USB/JTAG
disables, and compares raw eFuse blocks with the first dump recorded for the
chip (`/var/lib/attractap-lab-janitor/efuse-baselines`). A changed eFuse
quarantines the reader immediately; other failures retry, then quarantine after
`janitor.attempts`. Quarantined readers stay claimed by the janitor without a
reservation, so sessions skip them and maintenance does not wait for them:

```sh
ssh root@lab-host attractap-lab-janitor status
ssh root@lab-host attractap-lab-janitor clear attractap-touch-v2-1  # after repair: park, then release
```

Each attempt keeps `efuse.txt` and `serial.log` under
`/var/lib/attractap-lab-janitor/runs/PLACE/`; `journalctl -u attractap-lab-janitor`
shows decisions. The janitor reaches the local exporter over SSH like any
client, with a host-local key authorized only for the `labgrid` account.

The parking image never deep-sleeps: that would power down USB-Serial-JTAG and
make the reader unreachable until someone presses reset.

## Agent and CI workflow

On Linux, from the monorepo root:

```sh
export LG_COORDINATOR=lab-host:20408
pnpm nx run attractap-lab:smoke -- \
  --config apps/attractap-lab/example-env.yaml --place attractap-touch-v2-1 \
  --image /path/to/merged-firmware.bin --output /tmp/attractap-touch-v2-1
```

Without Nx, use `nix run path:./apps/attractap-lab -- ...`. For an existing Python
environment, install `apps/attractap-lab` with pip and invoke `attractap-lab`.
The Nix host package targets Linux; macOS is not an exporter platform.

The workflow claims the place exclusively, transfers the merged image using
labgrid's `ManagedFile`, runs esptool on the exporter, resets into firmware,
records bounded `serial.log`, captures `screen.png`, then releases.
Both success and ordinary failure/cancellation clean up drivers and claims.
A busy place fails immediately. `--expect TEXT` checks a literal serial marker.
Serial reconnect follows reset, so the earliest boot messages may be missed;
use a marker emitted after reconnect. Screen capture provides evidence, not an
automatic assertion that the UI is correct. Offline µStreamer placeholder frames
are rejected; a missing webcam fails capture instead of producing false evidence.

Python and pytest use the same resource/driver lifecycle:

```python
from attractap_lab.workflow import claim, smoke

def test_reader(tmp_path):
    with claim("reader.yaml", "attractap-touch-v2-1") as target:
        smoke(target, "firmware.bin", tmp_path, expect="connected")
```

For a reboot without flashing, use `target.get_driver("ResetProtocol").reset()`
inside a fresh claim. The driver uses esptool's native `run` and hard reset;
close any active serial driver first. Native labgrid clients can also use this
registered reset protocol with the same environment file.

Inspect and recover abandoned claims with the native tools:

```sh
labgrid-client places
labgrid-client -p attractap-touch-v2-1 show
labgrid-client -p attractap-touch-v2-1 release --kick
```

Confirm the previous operation has stopped before forced takeover. Native
labgrid reservation commands remain available; automatic claim expiry is not
implemented. Coordinator restart drops claims, so do not restart it during
hardware operations.

The manual **Attractap lab hardware smoke** GitHub workflow downloads an
existing firmware build artifact and performs this same workflow. Configure its
`attractap-lab` environment with `LAB_HOST`, `LAB_SSH_PRIVATE_KEY`, verified
`LAB_SSH_KNOWN_HOSTS`, and Tailscale federated identity secrets
`TS_OAUTH_CLIENT_ID`/`TS_AUDIENCE`. Grant its `tag:ci` identity private lab access.
Use a firmware filename matching the physical reader; merged images flash at
offset zero. Artifacts retain logs and captures even on failure.

## Operations and checks

Use `systemctl status attractap-lab-{coordinator,exporter,places}` and
`journalctl -u attractap-lab-exporter` over SSH. Camera units are named
`attractap-lab-camera-NAME`. Missing placeholder devices stay unavailable or
retry; they are not treated as successful hardware validation.

Coordinator state persists in `/var/lib/attractap-lab-coordinator`. Firmware
uploads use `/var/cache/labgrid` with seven-day age cleanup. Back up mutable
state separately from Nix generations.

`attractap-lab-maintenance -- COMMAND...` acquires all existing places before
running a command and conditionally releases its own claims afterward. Busy
labs (claims or allocated reservations, including active parking) defer
maintenance; janitor-quarantined readers are skipped. The janitor parks the
readers again after maintenance releases them. These locks do not survive coordinator restart: host
deployment must also gate incoming coordinator access until activation and
health checks finish. The personal Mac mini configuration implements that gate.

```sh
pnpm nx run attractap-lab:check  # Evaluate the module and Linux checks.
pnpm nx run attractap-lab:build  # Build the Linux application.
pnpm nx run attractap-lab:test   # Package lifecycle tests and NixOS VM test.
```

Build/test require Linux or a configured Linux builder. The package test runs
real coordinator/exporter processes, serial TCP and FFmpeg against simulated
USB/SSH hardware. The VM test covers service startup, absent readers,
contention, coordinator restart and command availability. Actual flashing, USB
reconnection, power recovery, camera quality and cold boot must be validated on
the physical host once connected.
