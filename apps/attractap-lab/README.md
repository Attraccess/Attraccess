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

## Reader power

The lab can switch a reader's power. The place's `power` tag says how:

| `power` tag | Reader              | Switched by                                          | Driver              |
| ----------- | ------------------- | ---------------------------------------------------- | ------------------- |
| `button`    | Touch V1            | The NFC emulator, pressing the reader's power button | `ReaderPowerDriver` |
| `switch`    | Touch V2            | The lab host, with a USB power switch in the cable   | `SwitchPowerDriver` |
| `always-on` | Any, without wiring | Nothing; USB powers the reader                       | none                |

```nix
coordinator.places.attractap-touch-v2-1.tags = {
  board = "attractap";
  variant = "attractap-touch-v2";
  power = "switch";
};
```

`attractap_lab.workflow.reader_power(target)` returns the place's driver, or
None for `always-on`, and where pressing a button needs an NFC emulator but the
place exports no `NfcEmulatorSerial`. A place without a `power` tag (or an
environment without a `RemotePlace`, such as local resources) gets
`ReaderPowerDriver` when it has an emulator, which
leaves a reader that is on alone. The tag wins over a power driver listed in
the environment file. Both drivers confirm each switch by the reader's serial
port (`USBSerialPort`) appearing or disappearing, and `get()` reports that
port.

`attractap_lab.workflow.power_on(target)` turns the reader on only when it is
off, binding the emulator itself when a `button` place's environment lists
only the reader's drivers. `flash_reader(target, image)` powers the reader on before flashing
(see below for the Touch V1), and `smoke`, the HIL reader fixture and the
janitor's parking power on the same way. In a session, or while holding a
place, `attractap-lab-power on|off|cycle|get` picks the driver from the tag and
needs no environment file:

```sh
labgrid-client -p attractap-touch-1 session --purpose 'ATT-1234: cold boot' -- \
  sh -c 'attractap-lab-power off && attractap-lab-power on'
```

For `button`, the emulator needs firmware with `button.press`; older firmware
answers `unknown_command`.

### Power button (Touch V1)

A Touch V1 (Waveshare ESP32-S3-Touch-LCD-4 V3) only powers up after a press of
its power button, and its power-bank chip turns it off again about 30 s after
its load drops below roughly 60 mA, as when the parking image darkens it. Wire
an optocoupler from the place's NFC emulator across that button (see the
[emulator README](../attractap/nfc-emulator/README.md#reader-power-button-optional))
and plug a 1-cell LiPo into the board's BAT socket: without a battery the chip
stops reacting to the button some time after switching off, until USB is
plugged in again. Tag the place `power=button`. `ReaderPowerDriver` then
switches the reader through the emulator:

```python
power = target.get_driver("PowerProtocol")  # from example-emulator-env.yaml
power.on()   # one press, then waits for the reader's serial port to appear
power.off()  # two presses, then waits for it to disappear
```

Native `labgrid-client power on|off|cycle|get` uses the same driver. A reader
already in the requested state is left alone, so `on()` is safe on any reader.
A V1 switched on from parking runs the dark parking image, so it switches
itself off again about 36 s later (measured in the lab), which a slow flash
can outlast. A reader being flashed draws little too, so the cut can also come
a few seconds after the flash's reset, before the new image lights the screen.
`flash_reader` therefore flashes it once more if it went off mid-flash, and
watches it for 15 s after the reset (`POWER_CUT_WATCH_SECONDS`), pressing the
button again whenever it is off. Once the new image has lit the screen, the
chip keeps the power on.

### USB power switch (Touch V2)

The Touch V2 has no power button, but its CH32 I/O expander can lock up after
an ESP32 reset and hold I2C SCL low until the reader loses power for about
10 s. Parking then fails (see Reader parking). Put a USB power switch running
[Tasmota](https://tasmota.github.io/) between the hub and the reader's cable,
on the readers' Wi-Fi, and tag the place `power=switch`. The lab uses a
Sinilink XY-WFUSB, flashed over its UART pads with the `XY-WFUSB` template.
Set it up from its web interface or `http://SWITCH/cm?cmnd=...`:

```text
Backlog DeviceName attractap-touch-v2-1-power; PowerOnState 1; SetOption1 1; SetOption3 0
Hostname attractap-touch-v2-1-power
```

`PowerOnState 1` powers the reader whenever the switch gets power,
`SetOption1 1` stops its button from resetting it or opening its setup access
point, and `SetOption3 0` turns MQTT off. Then declare it on the lab host:

```nix
services.attractap-lab.readerSwitch.switches.attractap-touch-v2-1 =
  "attractap-touch-v2-1-power.fritz.box";
```

The host generates a web password in the root-only `readerSwitch.passwordFile`
and sets it on every declared switch that has none, at boot and on each
deployment (`attractap-lab-reader-switch-secure.service`), so only the host
can switch the reader or open the switch's web interface. `SwitchPowerDriver`
runs `attractap-lab-reader-switch` on the host over the SSH connection labgrid
uses for the reader's port; a sudo rule runs it as root, and it refuses to
switch a place nobody holds:

```python
from attractap_lab.workflow import reader_power

power = reader_power(target)  # SwitchPowerDriver on a power=switch place
target.activate(power)
power.off()    # switches it off, then waits for the reader's port to disappear
power.cycle()  # off, 10 s (power.delay), on, then waits for the port
```

`attractap-lab-reader-switch get|secure` works without a claim. A switch that
answers with another password (reset or replaced) is reported, never
overwritten: reset its web password (`WebPassword "` in its console, over its
UART), and the host sets its own again. For native `labgrid-client power` on
such a place, list `SwitchPowerDriver: {}` instead of `ReaderPowerDriver` in a
copy of `example-emulator-env.yaml`.

`attractap-touch-v2-1` was tagged `power=always-on` before its switch was
installed. A lab host deployment must retag it `power=switch` and declare its
switch (in the host's configuration, outside this repository), or nothing
switches it and the janitor cannot power-cycle it.

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
supervision, key reset, and rejected, faulty or removed cards. The reader
image has the test hooks, so tests also use the touchscreen: they sign out
with the "Sign out" button instead of waiting for the 30 s session timeout
(only `test_session_times_out` waits for it), and start and end a session on
a second resource by touch.

```sh
. .tools/esp-idf/export.sh   # or set READER_IMAGE / EMULATOR_IMAGE
pnpm nx run attractap-lab:hil            # all tests
pnpm nx run attractap-lab:hil -- -k enroll
```

The runner builds both firmware images, starts an API on a free port with a
throwaway PostgreSQL database (created and dropped on the server
`HIL_DATABASE_ADMIN_URL`, else `DATABASE_URL`, names), and runs pytest inside one labgrid
session on `LG_PLACE_NAME` (default `attractap-touch-v2-1`). The reader image
is built for `READER_VARIANT`, by default the place name without its `-<n>`
suffix (`attractap-touch-1` runs the `attractap-touch` firmware). The tests
flash the emulator first, then turn the reader on with its power
button if it is off (a Touch V1 while idle), then flash the reader. The run seeds
`admin`/`password` into its own database, signs in, and approves the erased
reader's rotating pairing code (`Enrollment: code=XXX-XXX` on the UART) through
`POST /api/attractap/pairings/resolve` and `/pairings/:id/approve` with that
admin session; no external token is involved
(`attractap_lab.enrollment.approve`). The reader gets
the lab Wi-Fi through `attractap-lab-reader-wifi`, so the host needs
`readerWifi`, and connects to the API at the address of this machine on the
route to the reader (override with `API_HOST`). `LAB_PYTHON` defaults to the
interpreter of the installed `labgrid-client`, which must provide labgrid and
pytest. Logs, the emulator trace and camera photos land in
`apps/attractap-lab/hil-artifacts/lab-artifacts/<session>`. These tests are
not part of `pnpm nx run attractap-lab:test`, which runs without hardware.

The reader's connection is TLS inside the WebSocket, so the plaintext the
`wire` fixture reads (card session ids, personalised resource lists, APDUs)
only exists inside the API process. The runner therefore starts the API with
the `real-cards/wiretap.cjs` preload (`NODE_OPTIONS=--require …`, passed
through `pnpm serve` and nx to the API) and exports `WIRETAP_FILE`
(`hil-artifacts/wiretap.jsonl`, emptied at the start of each run). Against an
API started by hand without the preload, the tests that need the wire
(`test_z_matrix_extra.py`) skip. The file holds card APDUs in full: lab
evidence only, never commit it. Plugin BLE bytes are the exception: for
`BLE_*` messages the wiretap keeps the structure but replaces every byte field
(`value`, advertisement `data`) with `{"redacted": true, "bytes": <length>}`,
because they carry device credentials (a lock's user code and crypt token) and
CI uploads `hil-artifacts/` as an artifact.

One reader serves the whole run, so every test that uses it starts from an
idle reader (`hil/reader_reset.py`, autouse fixtures in `hil/conftest.py`):
before each test, and before a module's own fixtures, the run checks that the
reader is connected and shows the signed-out resource list, and that no usage
session is open. Only what it finds is cleaned up: open sessions are ended
through the API, notices dismissed, armed enroll/reset/supervision/mass
introduction screens cancelled, the user signed out, a revoked reader approved
again, and as the last resort the reader is rebooted. A clean check costs
about 0.2 s. Each cleanup is logged to `reader-resets.jsonl` with the test
that left the state behind. If even a reboot fails, the later tests fail at
setup at once instead of rebooting again.

The end of the pytest output (section "HIL failure order and reader resets")
names the first failure, lists the later ones in order, marks failures that
repeat one shared fixture error, and shows the resets. On GitHub Actions the
first failure is also an error annotation and the summary goes to the job
summary.

The tests in `test_nfc_cards.py` build on each other: one whose prerequisite
(an enrolled card from an earlier test) is missing fails and names it, so
run that file whole rather than picking single tests from it with `-k`.

`test_power_cycle_stays_paired` switches the reader off, waits (5 s with a
power button, the driver's 10 s with a power switch), switches it on again and
expects it to open its secure session without a new approval. It runs on
places tagged `power=button` or `power=switch` and skips the others (see Reader
power): the lab cannot switch those readers.

### Secure lab reader

> **Never write a release (non-lab) secure image to a secure lab reader**: its
> first boot switches flash encryption to release mode for good. The suite never
> burns eFuses itself (only the firmware's anti-rollback version, see below).

`READER_PROFILE=secure-lab` runs the same tests on the place
`attractap-touch-v2-secure-1`: a Touch V2 with Secure Boot v2 bound to the
public lab keys and development-mode flash encryption (ATT-1166; see
`apps/attractap/firmware/lab/secure-boot/README.md`).

```sh
. .tools/esp-idf/export.sh
READER_PROFILE=secure-lab pnpm nx run attractap-lab:hil
```

- The runner builds the reader with `-DATTRACTAP_SECURE_PROFILE=ON
-DATTRACTAP_SECURE_LAB=ON -DATTRACTAP_TEST_HOOKS=ON`. The lab profile keeps
  the USB console and serial command handler that the release profile compiles
  out.
- `tools/secure_lab_reader.py hex` signs the bootloader and app with the lab key
  and merges them into Intel HEX. It refuses anything but a lab secure build.
  `READER_SECURE_BUILD=<dir>` reuses an existing build directory; `READER_IMAGE`
  is refused for this profile.
- Before writing, the tests check the reader's eFuses against the `secure-lab`
  profile (`efuse.check`). Then they erase the chip and write the image
  encrypted (`ESPToolDriver.erase_and_flash_encrypted`), the same write the
  janitor uses to park this reader.
- `hil/test_efuse_report.py` checks the eFuse report the reader sends after its
  session is up: the server must keep this development-mode reader *not
  secured* and list `profile-not-secure` and `flash-encryption-not-release`.
  That is the expected result. Nothing in the lab burns eFuses or puts a
  release secure image on the reader; the reader identity is the P-256 key it
  pairs with.
- When the run ends, also after a failed setup, the tests write the image
  again, so no Wi-Fi, PIN or pairing stays on the reader even where the place
  has no janitor. With `janitor=park`, the janitor then parks it with the
  lab-signed parking image.
- `run.sh` refuses to start when `READER_PROFILE` does not match the place's
  `profile` tag (`plain` when it has none). A plain image leaves this reader
  unbootable, and the secure write would not fit a plain reader.
- The reader's internal heap (before pairing, after the TLS session opened, at
  the end) is written to `reader-heap.jsonl` in the run's artifacts.

If a run is killed before its own wipe, the janitor parks the reader on
release; on a place without one, run the suite again. A branch that raises
`CONFIG_BOOTLOADER_APP_SECURE_VERSION` burns the new version into the reader
(anti-rollback), so lab images from older branches stop booting on it.

### Updates over Wi-Fi, RAM stress and the QA runs

One command per profile; each saves its artifacts in
`apps/attractap-lab/hil-artifacts/lab-artifacts/<session>/`:

```sh
. .tools/esp-idf/export.sh
pnpm nx run attractap-lab:hil                              # plain Touch V2, place attractap-touch-v2-1
READER_PROFILE=secure-lab pnpm nx run attractap-lab:hil    # Secure Boot lab reader, place attractap-touch-v2-secure-1
pnpm nx run attractap-lab:hil -- -k "ota or ram"           # only the update and RAM tests
```

A QA run of a firmware change runs the full suite on the secure-lab place and at
least the update (`test_ota.py`) and RAM (`test_ram.py`) tests on the plain one.
Off the readers' LAN, add the relay variables from "In CI".

**Update tests (`test_ota.py`).** The API under test offers a lab image through
the real path (firmware info, `READER_FIRMWARE_UPDATE_REQUIRED`, chunked
download over the websocket, `esp_ota_*`). The download that installs the image
loses its Wi-Fi once: the reader has to reconnect and continue where it stopped.
`run.sh` builds the reader image
twice from the same directory, the second time with
`-DATTRACTAP_VERSION_OVERRIDE=<version>-hilota`, and starts the API with
`ATTRACTAP_FIRMWARE_ASSETS_DIR` pointing at a scratch directory whose
`firmwares.json` the tests rewrite (the API re-reads it when it changes; unset in
deployments). With a prebuilt `READER_IMAGE` the tests skip unless
`READER_OTA_IMAGE`, `READER_OTA_VERSION` and `READER_BASE_VERSION` are set;
`NO_OTA_BUILD=1` skips the second build.

- Rejected images: a wrong first byte (refused at the first chunk), a flipped
  byte in the middle (refused at the end of the download), and on a secure lab
  reader an unsigned image and one signed with a foreign key. Each time the reader
  keeps its version, restarts and pairs without a new approval.
- The good image installs; the reader boots the new version, reports it to the
  API and stays paired. The test leaves the reader on the new version.
- During the download the test asks the screen for its widget list every few
  seconds (it must answer and show the `FirmwareUpdate` screen), takes camera
  photos (`ota-flash-<seconds>s.png`) and fails on any `LCD underrun` line in the
  reader's log. `ota-update.json` has the duration, the heap high-water marks,
  the response times and the photo names.
- Secure lab images are signed in the test harness with the public lab key
  (`attractap_lab.ota_images`, espsecure). The API's signer refuses lab keys on
  purpose and takes no part.
- Not covered: rollback (the application confirms its image right after boot, so
  there is nothing to roll back to without a crashing image) and anti-rollback
  (rejecting a lower `secure_version` needs the SECURE_VERSION eFuse raised
  first, and the tests never burn eFuses).

**Crash report test (`test_crash_upload.py`, plain place only).** Plain reader
images are built with the lab-only crash trigger (`-DATTRACTAP_CRASH_TRIGGER=ON`,
firmware README "Crash trigger"). The test panics the reader with 64 KiB of
filled stacks (an ~83 KB coredump) and makes it rejoin Wi-Fi as soon as the API
logs the start of the chunked upload (a crash whose upload finished first is
repeated, at most three times). After the reconnect the upload must restart for
the same report and complete: one new report, the stored dump's
size and CRC-32 equal to what the reader announced, the crash firmware version,
and a symbolicated backtrace (`run.sh` publishes the reader's ELF as a
symbol-only firmware entry). It also fails on a watchdog, panic, allocation
failure or `LCD underrun` line, on a widget list slower than 3 s during the
upload, and on the heap high-water marks. `crash-upload.json` and
`crash-upload-backtrace.txt` hold the results.

**"Secure this reader" (`test_secure_conversion.py`, plain place only).** For a
variant with a secure profile (its variant file sets
`ATTRACTAP_SECURE_PROFILE_BUILD` to `"true"`: Touch V2), `run.sh` builds the plain
reader with `-DATTRACTAP_CONVERSION_STOP_BEFORE_BURN=ON`, builds and packages the
variant's release secure image, starts the API with
`ATTRACTAP_CONVERSION_LAB_STOP_BEFORE_BURN=true` and sets
`READER_SECURE_CONVERSION=1` for the tests. The conversion then runs up to
verify, the server ends it instead of sending the burn, and the eFuses read over
USB before and after must be equal. Touch V1 has no secure profile, so its runs
build no secure image and skip the module. `NO_CONVERSION_BUILD=1` or a supplied
`READER_IMAGE` skip it too.

**RAM tests (`test_ram.py`).** Each workload resets the reader's heap high-water
window (`system.heap.reset`), runs, and checks the lowest free internal heap and
the smallest largest free block (`windowMinFree`, `windowMinLargest`) against
`hil/heap_floors.py`, plus that the free heap comes back afterwards. Workloads:
cards the server does not know in a loop (NFC read, API round trip, error
screen), Wi-Fi reconnects that re-open the websocket and the encrypted session,
a resource list of 20 long names (the most a real reader plausibly gets; the
API sends it the 10 it shows), and a busy day (`test_busy_day`), the plausible
worst case in one heap window: 20 resources, members signing in by card and
starting and ending a session by touch, strangers' cards, an administrator
editing the reader and one Wi-Fi drop. With `HIL_BLE=1` and a test peripheral,
each session also runs a lock-sized plugin BLE exchange; that busy day is the
workload `busy-day-ble` with its own floor, because the BLE stack takes about
24 KB while it is up. Every window starts once the reader has released the BLE
stack, so the other floors hold with and without `HIL_BLE` (numbers in
`heap_floors.py`). The OTA download measures the same marks in `ota-update.json`. `HIL_RAM_ITERATIONS` scales the loops (default
20). Results of every run are in `ram-<workload>.json` and `reader-heap.jsonl`.

`test_touch_controller_answers` (`test_hardware.py`) checks that the GT911 answers
its polling (register reads grow, none fail).

### Plugin Bluetooth (opt-in)

`hil/test_ble.py` checks plugin BLE through the reader (ATT-1033, ATT-1036). It is not part of the CI matrix and
skips unless `HIL_BLE=1`. With it, `run.sh` builds the lab fixture plugin (`ble-fixture-plugin/`, never shipped;
it only uses `context.ble` and offers REST routes that run step scripts inside one session) into the plugin
directory of the API it starts. Its routes require the `system.plugins.manage` permission (the suite calls them as
the admin). The devices come from the environment:

- `BLE_PERIPHERAL_ADDRESS`: the generic GATT test peripheral (`ble-test-peripheral/`, see its README) in range of
  the reader, for example a second lab place flashed with it inside its own labgrid session for the duration of the
  run. It prints its address at boot (`ready address=...`).
- `SOLO_USER_CODE` (and optionally `SOLO_ADDRESS`, else the first lock the scan finds): a PS Locks SOLO BT in
  factory `CRYPT_OFF` mode for the real-lock smoke. The
  code is only ever passed through the environment. It stays out of the artifacts: `ble-solo.json` drops the step
  values, the wiretap records only byte lengths for BLE, and the test fails if `wiretap.jsonl` contains the bytes
  of the unlock write. Vendor names like this one belong in the lab only, never in core docs or code.
- `HIL_BLE_LONG=1` adds the 10-minute transfer (at least 256 KiB of MTU-sized writes without response, each
  acknowledged by a notification).
- `test_ble_bulk_throughput` runs with every `HIL_BLE=1` run: 256 KiB of MTU-sized writes without response at
  window 1 and window 8 (the fixture `transfer` step's `window`: unacknowledged chunks in flight). It asserts
  in-order acks and window 8 at 6 KiB/s or more; the 8 KiB/s target is recorded as `meetsTarget` in
  `ble-bulk-throughput.json`. `HIL_BLE_BULK_RUNS` repeats each window in a new session (default 1; use 3 for
  measurements), and `HIL_BLE_BULK_WINDOWS` picks the windows (default `1,8`; the floor applies to the largest).

```sh
HIL_BLE=1 BLE_PERIPHERAL_ADDRESS=AA:BB:CC:DD:EE:FF apps/attractap-lab/hil/run.sh -k ble
```

Throughput, notification rates and the internal heap before and after the first BLE init land in `ble-*.json`
in the artifacts directory.

### Reader over wss:// (opt-in)

By default the reader reaches the lab API over plain `ws://`. A production reader
on an HTTPS server uses `wss://`, and that outer TLS session takes reader RAM the
default run never measures (most on the secure profile, whose mbedTLS memory is
internal RAM). `HIL_WSS=1` runs every test, the RAM tests included, over a
validated `wss://` connection:

```sh
. .tools/esp-idf/export.sh
HIL_WSS=1 pnpm nx run attractap-lab:hil -- -k ram
HIL_WSS=1 READER_PROFILE=secure-lab pnpm nx run attractap-lab:hil -- -k ram
```

- **Lab CA.** On first use `src/attractap_lab/lab_tls.py` creates a device-lab
  root (RSA-4096, like ISRG Root X1) and an intermediate (RSA-2048) in
  `apps/attractap-lab/lab-tls/` (gitignored, `LAB_TLS_DIR` overrides it; it needs
  the `openssl` command). The CA is per checkout: delete the directory to start
  over; the next run then needs a new reader image.
- **Reader image.** `run.sh` builds the reader (and the update image) with
  `-DATTRACTAP_LAB_CA=lab-tls/ca.pem`, which puts the lab CA first in the
  firmware's certificate list (firmware README "Device-lab TLS CA"). It then
  checks that the image it flashes (`READER_IMAGE`, or the signed HEX of a
  `READER_SECURE_BUILD`) and the update image contain that same CA, and stops if
  one does not. Only lab builds (`ATTRACTAP_TEST_HOOKS=ON`) take the option, and
  the release build gate fails an image that has it.
- **TLS front.** The `api_tls` fixture issues a server certificate for the address
  the reader is given (the subjectAltName is an IP address, or a DNS name with
  `API_HOST`) and terminates TLS on `API_TLS_PORT` (a free port by default),
  forwarding the bytes to the API. The leaf and its key live in a temporary
  directory only until the front has loaded them. The reader is configured with
  `useSSL` and that port; off the readers' LAN the relay carries it. Each
  handshake's version and cipher land in `api-tls.jsonl`.
- **TLS parameters.** The front serves leaf, intermediate and root, about 4.2 KB
  in DER (production: a Let's Encrypt 3-certificate chain of about 4.3 KB), RSA
  keys (ECDHE-RSA), and session tickets, with TLS 1.2 and 1.3 on offer like a
  common reverse proxy. The firmware offers both, so a default run negotiates
  TLS 1.3, as a production reader does against such a server.
  `HIL_WSS_TLS_MAX=1.2` pins TLS 1.2 (servers without TLS 1.3); run the RAM
  tests both ways.
- **Differences from production.** The certificate list entry the reader locks
  onto is the lab CA, not ISRG Root X1 (both RSA-4096). The cipher suite and key
  exchange group are what Python's OpenSSL picks (AES-256-GCM), not your
  proxy's; an ECDSA server certificate would make the handshake cheaper. The
  reader ignores certificate dates (`CONFIG_MBEDTLS_HAVE_TIME_DATE` is off), so a
  reader without server time connects as in production.
- `test_ota_from_main_firmware_to_head` skips: main's firmware does not trust the
  lab CA.
- **RAM floors.** The plain reader keeps its `ws://` floors. The secure-lab reader
  has its own for `wss://` (`WSS_FLOORS` in `hil/heap_floors.py`): the outer TLS
  session takes another 10 to 15 KB of internal RAM there.
- **BLE notification bursts.** On the secure-lab reader a `wss://` send takes about
  8 ms, so it forwards about 120 notifications a second (150 over `ws://`).
  `test_ble_notification_burst_and_overflow` sends 200 as fast as the link allows;
  over `wss://` up to 77 of them waited in the reader's buffer of 128 (a buffer of 64
  overflowed in 1 of 4 runs).

### Bluetooth setup (opt-in)

`hil/test_bt_setup.py` checks the readers' Bluetooth setup (ATT-1371) on a Touch place. It skips unless
`HIL_BT_SETUP=1` and `BT_CENTRAL_PYTHON` points to a Python with `bleak` on a machine in Bluetooth range of the
reader (for example this Mac: `python3 -m venv /tmp/ble && /tmp/ble/bin/pip install bleak`). `hil/bt_central.py`
plays the web app: it scans for the setup service and writes the command lines over the encrypted link. Each test
flashes the reader erased. The first sets the PIN and the server over Bluetooth (Wi-Fi still from the lab host over
the serial console, so its secret never leaves the host), approves the pairing and checks that the reader closes
the link and the window about 10 s later, and that a restarted paired reader no longer advertises. With
`HIL_BLE=1` too, it runs a plugin BLE scan after the window closed. The second waits out the 10-minute window and
reopens it with the on-screen button.

```sh
HIL_BT_SETUP=1 BT_CENTRAL_PYTHON=/tmp/ble/bin/python apps/attractap-lab/hil/run.sh -k bt_setup
```

Names, replies, timings and the internal heap with the window open, after it closed and on the paired reader land
in `bt-setup-*.json`.

### In CI

`.github/workflows/attractap-lab-hil.yml` runs these tests from the release
workflow and on every push to `main`, on every reader type at once: one job
each for the Touch V2 (`attractap-touch-v2-1`) and the Touch V1
(`attractap-touch-1`), in parallel, and, once the repository variable
`ATTRACTAP_LAB_HIL_SECURE_ENABLED` is `true`, one with `READER_PROFILE=secure-lab`
on the Secure Boot lab reader (`attractap-touch-v2-secure-1`). The secure job is
a separate switch because it relays on a third host port (below): enable it after
the lab host runs with three `readerApiRelay.ports`. It is off until the repository variable
`ATTRACTAP_LAB_HIL_ENABLED` is `true` (a repository variable, because the job's
`if:` runs before the `attractap-lab` environment loads); the
workflow file lists all variables (lab host, coordinator port, Tailscale tags,
relay address/port, labgrid package) and the secrets it reuses
from the hardware smoke workflow (`TS_OAUTH_CLIENT_ID`, `TS_AUDIENCE`,
`LAB_SSH_PRIVATE_KEY`, `LAB_SSH_KNOWN_HOSTS`).

When enabled, the tests gate publishing: in both workflows the `plugins`,
`containerize` (and on release `balena` and `publish-attractap-desktop`) jobs
need them and stop if they fail or are cancelled. Runs wait for the place in
`labgrid-client session` (`ATTRACTAP_LAB_WAIT_MINUTES`) rather than in a
GitHub concurrency group, which would cancel queued runs.

A runner joins the tailnet, but readers only reach the lab's LAN. The runner
therefore relays its API through the lab host: enable
`services.attractap-lab.readerApiRelay` (default ports 20480 to 20482), which
lets the `labgrid` account open exactly those remote forwards, and allow the
ports from the readers' LAN in the host firewall. The Touch V2 job relays on
the first port, the Touch V1 job on the next one, the secure lab job on the third. Set
`ATTRACTAP_LAB_API_RELAY_HOST` to the lab host's address on that LAN.

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

`nix/dashboard-mobile.patch` makes the frontend usable on phones:
below 768 px the sidebar becomes a menu drawer, wide tables scroll inside their
panel, controls grow to 40 px touch targets and dialogs fit the screen. Wider
screens keep the upstream layout.

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
  # A place tagged variant=attractap-touch-v2-secure-lab profile=secure-lab.
  images.attractap-touch-v2-secure-lab = ./attractap_touch_v2_secure_lab_park.hex;
};
```

Build the images with `pnpm nx run attractap-firmware:build-lab`
(`firmware_output_lab/`). They are never part of an Attraccess release.

A place's `profile` tag says which reader it holds: `plain` (the default) or
`secure-lab`, a Secure Boot reader provisioned with the public lab keys and
development-mode flash encryption (ATT-1166). A secure-lab reader boots only
images signed with the lab key, so its parking image is the
`attractap-touch-v2-secure-lab-park` firmware variant: `build-lab` signs it with
the lab key and writes it as Intel HEX (`.hex`), which keeps the gaps between
partitions unwritten. The janitor writes it with `esptool write-flash --force
--erase-all --encrypt`.

While anyone holds a reader, the janitor keeps a reservation for it at priority
1000 (sessions use 0). Labgrid allocates a released reader inside the release
itself, so the janitor always gets it before waiting sessions. It then claims
the reader as `attractap-lab-janitor/janitor`, checks its eFuses, runs
`esptool write-flash --erase-all` with the parking image and releases once the
image prints `ATTRACTAP_PARKED` on the UART. Parking takes roughly 10–20 s. On
startup and after coordinator restarts, every managed reader is parked once,
and so is a reader whose place appears later, as when a deployment adds it.
A reader with switchable power that is off is switched on first; a parked Touch
V1 turns itself off again about 30 s later.

Full erase also wipes NVS: each session must provision Wi-Fi/API settings
again, and a previously paired reader needs a new approval of its pairing code
(see Hardware-in-the-loop tests and Agent and CI workflow).

eFuses cannot be erased. Before erasing, the janitor checks the security eFuses
against the place's profile. A `plain` reader needs factory values for secure
boot, flash encryption, key purposes, download mode and USB/JTAG disables. A
`secure-lab` reader needs Secure Boot with the lab key digests in KEY0/KEY1 and
the third digest slot revoked, JTAG off, flash encryption in development mode
(`DIS_DOWNLOAD_MANUAL_ENCRYPT` unburned) and download mode over USB. The janitor
also compares every raw eFuse block with the first dump recorded for the chip
(`/var/lib/attractap-lab-janitor/efuse-baselines`). On secure-lab readers the
`SECURE_VERSION` bits of BLOCK0 are left out and may only grow (anti-rollback
burns them when the reader boots an image with a higher secure version). A park image older than that version no
longer boots, so rebuild it from a branch with the new version. A mismatch
quarantines the reader immediately, also on a `power=switch` or `power=button`
place; other failures retry, then quarantine after `janitor.attempts`. On a
`power=switch` or `power=button` place the janitor power-cycles the reader
before each retry and quarantines it only once an attempt after a power cycle
failed as well. A switch is off for 10 s. A button reader (Touch V1) is
switched off with its power button through the NFC emulator and stays off for
at least 30 s; one that already switched itself off is not pressed. Then the
reader is switched on and the janitor waits for its port. If it does not come
back, or the attempt is stopped during the cycle (job timeout or service
stop), the janitor tries switching it on once more, logs the final state, and
the attempt fails. The quarantine reason then names the failed cycle, for
example `parking failed 3 times (last exit 1), also after a power cycle that
failed: The place has no switchable reader power to cycle` when the place's NFC
emulator is missing. Quarantined readers stay claimed by the janitor without a
reservation, so sessions skip them and maintenance does not wait for them:

```sh
ssh root@lab-host attractap-lab-janitor status
ssh root@lab-host attractap-lab-janitor clear attractap-touch-v2-1  # after repair: park, then release
```

Each attempt keeps `efuse.txt` and `serial.log` under
`/var/lib/attractap-lab-janitor/runs/PLACE/`, and a power-cycled attempt
`power-cycle.log`; `journalctl -u attractap-lab-janitor` shows decisions.

A parking image that cannot park prints `ATTRACTAP_PARK_FAILED`, clears the
I2C bus and retries every 2 s; the attempt fails only if `markerSeconds` pass
without `ATTRACTAP_PARKED`. The failure line names the line that failed, the
I2C error, the idle SDA/SCL levels and whether the I/O expander and the PN532
answer, for example `line=io-expander err=ESP_ERR_TIMEOUT sda=1 scl=0
expander=ESP_ERR_TIMEOUT pn532=ESP_ERR_TIMEOUT`. An idle bus reads `sda=1
scl=1`. A line still low after the bus clear is held by a slave (on the Touch
V2 most likely the CH32 I/O expander MCU), which only lets go when the reader
loses power for at least 10 s; a Touch V1's bus stuck with `scl=0` needed about
30 s off. On a `power=switch` or `power=button` place the janitor's power cycle
does that. On a place the janitor does not power-cycle (`power=always-on` or no
`power` tag), unplug the reader's USB cable for at least 30 s, then `clear` the
place.
The janitor reaches the local exporter over SSH like any client, with a
host-local key authorized only for the `labgrid` account.

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

The smoke run starts no API, so nothing approves the reader. A freshly erased
reader is expected to end on the pending-approval screen showing its rotating
pairing code (and a QR code only if it has an app URL; Lite readers show the LED
pattern) and to log `Enrollment: code=XXX-XXX`; that is a pass, not a failure.
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
