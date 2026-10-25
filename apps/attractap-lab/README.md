# Attractap hardware lab

A headless Linux app exposing USB-connected readers through labgrid. The app
provides a reusable NixOS module, two small labgrid drivers and a shared agent/CI
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

```nix
services.attractap-lab = {
  enable = true;
  ssh.authorizedKeys = [ "ssh-ed25519 REPLACE_WITH_PUBLIC_KEY" ];
  coordinator = {
    enable = true;
    listenAddress = "0.0.0.0:20408";
    places.reader-1 = {
      matches = [ "lab-host/reader-1/*" ];
      tags.board = "attractap";
    };
  };
  exporter = {
    enable = true;
    name = "lab-host";
    hostname = "lab-host";
    settings.reader-1 = {
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
capture node, resolution and MJPEG support. Mount it rigidly and set the
reader's crop in a copy of `example-env.yaml`. The placeholder crop is
`width:height:x:y`, in camera pixels; it must be calibrated before screen tests.

Each reader gets its own exporter group and place. Repeat the same
`HTTPVideoStream` URL in multiple reader groups to share the camera without
making different readers contend for one video resource. Keep crop settings
in the corresponding client environment.

`exporter.settings` and `coordinator.places` use native labgrid schemas. Places
are authoritative when configured: syncing removes places absent from that
map. Set `places = null` to manage them with labgrid's CLI instead. For separate
hosts, enable only the needed role and set `exporter.coordinatorAddress` and
`exporter.hostname` to reachable private addresses.

For unattended power recovery, select a supported switch or per-port USB hub
and add its native labgrid power resource/driver to the same reader group.
`uhubctl` is installed; use `extraUdevRules` for narrowly scoped permissions
required by the actual hub. No power hardware is assumed in the example.

## Agent and CI workflow

On Linux, from the monorepo root:

```sh
export LG_COORDINATOR=lab-host:20408
pnpm nx run attractap-lab:smoke -- \
  --config apps/attractap-lab/example-env.yaml --place reader-1 \
  --image /path/to/merged-firmware.bin --output /tmp/reader-1
```

Without Nx, use `nix run path:./apps/attractap-lab -- ...`. For an existing Python
environment, install `apps/attractap-lab` with pip and invoke `attractap-lab`.
The Nix host package targets Linux; macOS is not an exporter platform.

The workflow claims the place exclusively, transfers the merged image using
labgrid's `ManagedFile`, runs esptool on the exporter, resets into firmware,
records bounded `serial.log`, captures a cropped `screen.png`, then releases.
Both success and ordinary failure/cancellation clean up drivers and claims.
A busy place fails immediately. `--expect TEXT` checks a literal serial marker.
Serial reconnect follows reset, so the earliest boot messages may be missed;
use a marker emitted after reconnect. Screen capture provides evidence, not an
automatic assertion that the UI is correct.

Python and pytest use the same resource/driver lifecycle:

```python
from attractap_lab.workflow import claim, smoke

def test_reader(tmp_path):
    with claim("reader.yaml", "reader-1") as target:
        smoke(target, "firmware.bin", tmp_path, expect="connected")
```

For a reboot without flashing, use `target.get_driver("ResetProtocol").reset()`
inside a fresh claim. The driver uses esptool's native `run` and hard reset;
close any active serial driver first. Native labgrid clients can also use this
registered reset protocol with the same environment file.

Inspect and recover abandoned claims with the native tools:

```sh
labgrid-client places
labgrid-client -p reader-1 show
labgrid-client -p reader-1 release --kick
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
labs defer maintenance. These locks do not survive coordinator restart: host
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
