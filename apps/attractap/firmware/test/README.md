# Unattended firmware testing

ATT-267 uses the current **ESP-IDF 6.0.2** firmware, rather than the ticket's
obsolete PlatformIO commands. Real hardware is permitted; human NFC card taps
are never part of the automated suite.

## Coverage

| Layer                          | Runs              | Assertions                                                                                                                                                                                                                                                              |
| ------------------------------ | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Serial C++ unit tests          | Host, CMake/Unity | 32 original tests retained against `serialCommandHandler.cpp`: parser, PIN lifecycle, network/API configuration/status and SSID serialization. Only platform IO/settings/network dependencies are stubbed.                                                              |
| Existing C++ integration tests | Host              | SupervisionFlow and production LVGL screens/theme/render repeatability remain in `attractap-firmware:test`.                                                                                                                                                             |
| Harness tests                  | Host, Vitest      | Fresh-message boundaries, timeout/failure handling, connection isolation, production WS envelope and binary chunks.                                                                                                                                                     |
| Provisioning/transport         | ESP32             | Real USB serial, default NVS state, first PIN, PIN gate, physical WiFi scan/connect or Ethernet DHCP, API configuration, registration/authentication, heartbeat and reconnect.                                                                                          |
| API integration                | ESP32             | Production C++ action serializers and typed response parsers: start/stop, lock/unlock/unlatch, resource lists/active-session data, card-key data, supervision request/key/resolution, enrollment/reset key handoff and cancellation, projects, billing, two-page forms. |
| OTA/diagnostics                | ESP32             | Contiguous 4096-byte requests covering the whole app image, real flash writes and reboot, a distinct compiled firmware identity, retained provisioning/authentication, deliberate panic and subsequent crash report/acknowledgement.                                    |

The API driver is compiled only with `-DATTRACTAP_HIL=ON` (default OFF). Authorized
`hil.*` serial commands invoke **public production API methods**, over the real
ESP websocket transport. `hil.enable` replaces the application API callbacks with
typed serial probes. This isolates API integration tests from UI/NFC input;
the probes report parsed callback values, not merely an ACK (ACK precedes
dispatch and by itself cannot prove a handler worked). Default firmware does
not link the driver or expose `hil.*` commands.

The synthetic UID is input to the API serializer. It does **not** emulate PN532,
authenticate a physical card, or write/erase NFC keys. Successful physical
enrollment/reset, RF/crypto card authentication, full card-to-UI interaction,
touchscreen input, and physical door movement are outside unattended coverage.
Enrollment/reset tests validate key handoff and real cancellation messages; they
do not manufacture a successful NFC write. Existing SupervisionFlow tests cover
the orchestration state machine separately.

Protocol fixtures follow the source: backend sends `READER_REGISTER` credentials,
reader sends `READER_AUTHENTICATE`, backend sends `READER_AUTHENTICATED`; form
actions/types are lowercase; OTA metadata uses `available.totalSize` and chunks
are raw binary frames. Crash coredumps are optional in production due to the
32KiB/heap upload limits; mandatory reset/heap/uptime/version diagnostics are
asserted, and any transmitted coredump must decode to nonempty bytes.

## Host commands

From the repository root after dependency bootstrap:

```bash
pnpm nx run attractap-firmware:test
pnpm exec tsc -p apps/attractap/firmware/test/tsconfig.json
pnpm exec vitest run --root apps/attractap/firmware --config test/vitest.config.ts
```

## Dedicated hardware runner

Register a Linux GitHub Actions runner with labels `self-hosted`, `attractap-hw`,
and its **physical variant**, e.g. `attractap-touch-v2`. Use a correctly matched
board for each of the four matrix variants. Do not label one V3 board as all
variants. Run exactly one runner service per physical USB device; GitHub's
runner queue then serializes access across PRs without cancelling older pending
jobs. The matrix has `max-parallel: 1`. No operator interaction occurs during a run.

Install Node/pnpm and ESP-IDF's Linux system prerequisites. The workflow's
existing setup action installs the pinned ESP-IDF toolchain and dependencies.
Give the runner service access to the USB device and set these service-level
environment variables:

| Variable                | Required       | Meaning                                                                                                       |
| ----------------------- | -------------- | ------------------------------------------------------------------------------------------------------------- |
| `ATTRACTAP_SERIAL_PORT` | Always         | Stable USB-Serial-JTAG path, ideally `/dev/serial/by-id/...`. Must reappear at the same path after OTA/panic. |
| `HIL_HOST`              | Always         | Runner LAN IP/DNS reachable by ESP32; **not localhost**.                                                      |
| `HIL_WIFI_SSID`         | WiFi variants  | Lab AP SSID visible in scans.                                                                                 |
| `HIL_WIFI_PASSWORD`     | Secured lab AP | Lab password; omit for open AP.                                                                               |
| `HIL_WS_PORT`           | Optional       | Fixed unoccupied port permitted by the firewall; otherwise an ephemeral TCP port is selected.                 |

Ethernet variants need a connected W5500, DHCP and routing to the runner. Permit
incoming connections from the device to the mock server. Use isolated test
hardware: each run erases **all flash**, including provisioning.

To run locally, install the toolchain using
`INSTALL_ESP_IDF=true ./scripts/setup-dev-dependencies.sh`, then:

```bash
source .tools/esp-idf/export.sh
export ATTRACTAP_SERIAL_PORT=/dev/serial/by-id/your-reader
export HIL_HOST=192.168.1.20
export HIL_VARIANT=attractap-touch-v2
export HIL_WIFI_SSID=attractap-lab
pnpm nx run attractap-firmware:test-hil
```

`test/run-hil.sh` builds baseline and OTA images, erases flash, flashes baseline,
and starts Vitest. It checks required inputs/device availability first and exits
nonzero when missing; hardware tests are never silently skipped. Serial commands
are bounded to the firmware's 256-byte input buffer. The serial bridge reopens
USB after reboots. Every expectation has a timeout and fresh-message boundary;
WS messages are scoped to their connection generation.

## CI results and acceptance

`pull-requests.yml` detects changed paths using git SHAs for both PRs and merge
queues. Firmware, harness, toolchain/workflow, or dependency changes require all
four real-device jobs. JUnit XML and serial logs are uploaded even on test
failure. Provisioning payload echoes are excluded from persisted serial logs.
The always-running firmware test gate requires host-test success and hardware
success when affected; it is a dependency of the existing precommit gate.
Unchanged PRs may skip hardware, but failed/cancelled/missing hardware jobs do
not satisfy the gate when required. Keep the repository's precommit check
required in branch protection.

**Unverified acceptance steps for this implementation session:** no Attractap
USB device is exposed locally, and the GitHub runner-list endpoint returns 403.
No real-device test result is claimed. Before acceptance, obtain a passing HIL
JUnit artifact for each physical variant, verify USB recovery across OTA/panic,
and confirm the required precommit gate blocks a failing hardware job. Hardware
availability and repository branch-protection configuration have not been
verified by this session.
