# OTA hardware regression

This exercises the actual reader's WebSocket, flash writes, reboot, and OTA resume.
A host test cannot reproduce Wi-Fi/TCP allocations running out of internal RAM.
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
  --reader-id 3 --port 3000 --cycles 3 --disconnect-at 65536
```

The run fails if the first request never arrives, a transfer exceeds its deadline,
chunks arrive out of order, or the reader reports the wrong version after a
completed transfer. `--disconnect-at` drops one socket during the first transfer
and requires the reader to reconnect and resume. Capture USB serial logs alongside
this run to verify successful image validation and alternating boot partitions;
the WebSocket protocol reports version, but does not report the boot partition.

Afterward restart the normal dev servers with `pnpm serve`. Their authentication
and resource list restore the reader's configured name and resources. This test
does not change the reader's stored network settings or credentials.
