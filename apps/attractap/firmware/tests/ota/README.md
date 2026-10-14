# OTA regression tests

The firmware test target also runs the production OTA state machine on the host.
It checks that NFC is suspended before flash preparation, preparation failures
reboot instead of stranding a suspended reader, and reconnects resume the same
image without erasing it again. Run these checks independently with:

```sh
cmake -S apps/attractap/firmware/tests/ota -B apps/attractap/firmware/tests/ota/build
cmake --build apps/attractap/firmware/tests/ota/build
ctest --test-dir apps/attractap/firmware/tests/ota/build --output-on-failure
```

The hardware fixture below exercises the actual reader's WebSocket, flash writes,
reboot, and OTA resume.
A host test cannot reproduce NFC/Wi-Fi coexistence or Wi-Fi/TCP memory pressure.
Use an isolated test network: the fixture accepts only the specified reader ID,
without validating its token. It never prints credentials.

Stop the dev API before binding its port. The reader must already be configured
with this machine's LAN address and the fixture's port. Use the **app-only** OTA
binary, not the merged bootloader/partition image. Each cycle offers the image
again, even if the reader already runs that version, and alternates OTA slots.

From the repository root:

```sh
node apps/attractap/firmware/tests/ota/hardware-soak.mjs \
  --firmware apps/attractap/firmware/firmware_output/attractap_touch_v2_wifi_ota.bin \
  --reader-id 3 --port 3000 --cycles 3 --disconnect-at 65536 \
  --offer-delay-ms 1500
```

The run fails if the first request never arrives, a transfer exceeds its deadline,
chunks arrive out of order, or the reader reports the wrong version after a
completed transfer. `--disconnect-at` drops one socket during the first transfer
and requires the reader to reconnect and resume. Capture USB serial logs alongside
this run to verify successful image validation and alternating boot partitions;
the WebSocket protocol reports version, but does not report the boot partition.

`--offer-delay-ms` lets normal NFC polling start before the update is offered.
Without that delay, a fast local server can start OTA before NFC and hide the
0% regression. On the affected Touch V2 reader, 1.6.5 stopped delivering IP
traffic while card polling remained active, including when OTA flash operations
were bypassed. Stopping NFC polling allowed repeated complete transfers. Firmware
1.6.6 suspends polling and explicitly switches off the PN532 RF field before
preparing flash, and keeps NFC suspended across reconnect/resume until reboot.
Suspension also rejects card authentication and enrollment calls, so delayed
callbacks cannot use NFC while an update is in progress.
Already affected readers may need one USB installation: the OTA receiver runs
the currently installed firmware throughout a transfer. This change protects
OTA; idle Wi-Fi loss during normal card polling was also observed on the affected
reader and remains unresolved. A physical card tap was not available to validate.

Afterward restart the normal dev servers with `pnpm serve`. Their authentication
and resource list restore the reader's configured name and resources. This test
does not change the reader's stored network settings or credentials.
