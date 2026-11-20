# OTA regression tests

The firmware test target also runs the production OTA state machine on the host.
It checks that NFC is suspended before flash preparation, preparation failures
reboot instead of stranding a suspended reader, and reconnects resume the same
image without erasing it again. RF shutdown failure must abort before flash or
chunk requests.
Run these checks independently with:

```sh
cmake -S apps/attractap/firmware/tests/ota -B apps/attractap/firmware/tests/ota/build
cmake --build apps/attractap/firmware/tests/ota/build
ctest --test-dir apps/attractap/firmware/tests/ota/build --output-on-failure
```

Real-reader OTA runs (WebSocket session, flash writes, reboot, resume, heap floors) go
through the real server and run as lab HIL (`apps/attractap-lab/hil/test_ota.py`).
A host test cannot reproduce NFC/Wi-Fi coexistence or Wi-Fi/TCP memory pressure.
Readers authenticate with mutual TLS, so there is no stand-alone server fixture any more.

Background: starting OTA before NFC polling hides the 0% regression. On the affected Touch V2 reader, 1.6.5 stopped delivering IP
traffic while card polling remained active, including when OTA flash operations
were bypassed. Stopping NFC polling allowed repeated complete transfers. Firmware
1.6.6 suspends polling and explicitly switches off the PN532 RF field before
preparing flash, and keeps NFC suspended across reconnect/resume until reboot.
Suspension also rejects card authentication and enrollment calls, so delayed
callbacks cannot use NFC while an update is in progress.
Active enrollment/reset sessions are canceled, and OTA owns the screen even
when late card requests or a disconnect arrive. The desktop reader workflow
tests exercise these cases through the production application callbacks.
Already affected readers may need one USB installation: the OTA receiver runs
the currently installed firmware throughout a transfer. This change protects
OTA; idle Wi-Fi loss during normal card polling was also observed on the affected
reader and remains unresolved. A physical card tap was not available to validate.
