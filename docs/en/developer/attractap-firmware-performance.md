# Attractap Firmware Performance
<!-- llms-description: Current performance baseline of the Attractap ESP32-S3 firmware and the status of every recommendation from the August 2026 analysis, with links to the open tickets. -->

This page records where the Attractap firmware stands on performance and which recommendations are still open. It replaces the August 2026 analysis (see [History](#history)), whose numbers described firmware v1.5.7.

**Verified against:** `main` at commit `fda6e5071` (2026-11-22).

**Method:** static review of the sources and sdkconfig files under `apps/attractap/firmware`. No timing was measured on hardware for this page. Timings and ratings below are estimates from the code structure, not measurements. Open items are tracked in Linear, so this page does not need to list work in detail.

## Architecture baseline

Paths are relative to `apps/attractap/firmware`.

| Area | Current value | Where |
|---|---|---|
| ESP-IDF | v6.0.2 | `esp-idf-version.txt` |
| SoC / CPU | ESP32-S3, 240 MHz | `sdkconfig.defaults` |
| Flash | 16 MB, QIO, 80 MHz; two OTA app partitions of 6.25 MB each | `sdkconfig.defaults`, `partitions.csv` |
| PSRAM | Octal, 80 MHz. `malloc()` tries internal RAM first only up to 1 KB (`CONFIG_SPIRAM_MALLOC_ALWAYSINTERNAL`). Code and read-only data run from PSRAM (`CONFIG_SPIRAM_XIP_FROM_PSRAM`), so the cache stays on while flash is written | `sdkconfig.defaults` |
| Panel | 480×480 RGB565, 12 MHz pixel clock (about 42 Hz, from the old analysis, not re-measured), one PSRAM framebuffer plus two 16-row bounce buffers in internal DMA RAM (about 30 KB) | `src/display/driver/gt911/rgb_gt911_driver.cpp` |
| LVGL | 9.3.0, software rendering, partial mode, two 480×240 draw buffers in PSRAM (fallback: one 480×20 buffer). Flush is a synchronous CPU copy into the framebuffer | `main/idf_component.yml`, `src/display/display.cpp`, `src/display/display_input.cpp` |
| LVGL memory pool | 128 KB, LVGL's built-in allocator (`LV_STDLIB_BUILTIN`) | `include/lv_conf.h` |
| Refresh / touch | Refresh every 24 ms (`LV_DEF_REFR_PERIOD`); touch is sampled every 10 ms; GT911 stale-hold 300 ms | `include/lv_conf.h`, `src/display/display.cpp`, `rgb_gt911_driver.hpp` |
| Screens | `lockscreen` and `initscreen` stay loaded; every other screen is destroyed and rebuilt on each switch. Screen changes use no animation | `src/display/screens/IScreen.hpp`, `src/display/display.hpp` |
| Images | Raw `.rgb565` / `.rgb565a8` files linked once into read-only data through `logos.S.in`. The C++ headers are about 0.5 KB each. The lockscreen is a 450 KB opaque RGB565 image; the two logos keep an alpha plane | `src/display/images/`, `main/CMakeLists.txt` |
| FreeRTOS | 1 kHz tick. Main task: 18 KB stack, core 1. `LvglTask`: priority 4, core 1, 12 KB. WebSocket client task: priority 3. `ws_tx`: priority 3. `ws_conn` (connect and reconnect): priority 2. Beeper worker: priority 1 | `sdkconfig.defaults`, `src/display/display.cpp`, `src/websocket/` |
| I2C | One shared bus for PN532, GT911 and the IO expander, 400 kHz, 50 ms transfer timeout | `src/utils.hpp` |
| NFC polling | On the main loop. Detection poll 30 ms (`NFC::detectionPollTimeoutMs`), PN532 `waitready` in 2 ms steps, held card probed every 250 ms (`NFC::presenceCheckIntervalMs`) with one plain command | `src/rfid/rfid.hpp`, `src/rfid/rfid.cpp`, `src/rfid/pn532/driver.cpp` |
| Card operations | Done on the server through the card relay. The reader no longer runs NTAG424 authentication or key changes itself | `src/application/card_relay.hpp` |
| Wi-Fi | Modem sleep off (`WIFI_PS_NONE`) | `src/network/wifi/wifi.cpp` |
| WebSocket | Client buffer 4096 bytes, `network_timeout_ms` 10 s, TCP keepalive 5 s / 5 s / 3, reconnect back-off from 10 s | `src/websocket/connection.cpp`, `websocket.hpp` |
| mbedTLS | Record buffers 8192 in / 4096 out, allocated in PSRAM (`CONFIG_MBEDTLS_EXTERNAL_MEM_ALLOC`). TLS 1.3 is enabled for the paired-reader session, which runs on its own PSRAM-stack task | `sdkconfig.defaults`, `src/api/security/` |
| Optimization | `-O2` (`CONFIG_COMPILER_OPTIMIZATION_PERF`) for all production builds. No LTO option is set. No `IRAM_ATTR` in `src/` | `sdkconfig.defaults` |

### What changed since August and moves the baseline

- Paired readers run a TLS 1.3 session inside the WebSocket (ATT-1207). Its worker and buffers live in PSRAM.
- The BLE proxy (ATT-1033) brings NimBLE up only on demand and releases it after 30 s without BLE work, so it costs about 24 KB of internal RAM only while it is in use.
- The RGB panel now keeps 16 bounce rows in internal RAM and runs code from PSRAM to keep the picture steady during flash writes (display work from #2260).
- Card authentication moved to the server. The firmware no longer contains the NTAG424 crypto, so several old findings about it no longer apply.

### Findings that still hold

- NFC polling still runs on the main loop and holds the I2C bus for up to 30 ms per pass.
- `Websocket::loop()` still copies strings and wakes the connect task on every pass (about once per millisecond).
- The serial Wi-Fi scan command still blocks the main loop for up to 10 s.
- WebSocket text frames above the 4096-byte client buffer are still handed on as fragments.
- Some source comments are stale or point to the old report file, which never landed on `main`.
- PSRAM free size is still not part of the periodic heap log, and `LOG_MEMORY_DEBUG` is still not defined anywhere. Both are tracked in ATT-1276.

## Recommendations

IDs come from the August report. Impact, effort and risk are the original estimates, not measurements. Ticket links go to Linear. Work tracked in ATT-1276 is described there; its pull request may merge before or after this page is read.

**Status key:** Done, Partly done, Open (ticket), Covered by ATT-1276, Dropped.

### Quick wins

| ID | Recommendation | Impact / effort / risk | Status | Evidence or link |
|---|---|---|---|---|
| Q1 | Turn Wi-Fi modem sleep off | High / 1 line / low | Done | `wifi.cpp` (`esp_wifi_set_ps`), [#1692](https://github.com/Attraccess/Attraccess/pull/1692) |
| Q2 | Bound unreachable-host connect time with `network_timeout_ms` | Medium / 1 line / low | Done | 10 s in `connection.cpp` (the report proposed 5 s), [#1692](https://github.com/Attraccess/Attraccess/pull/1692) |
| Q3 | Run `ws_tx` below the render task | Medium / trivial / low | Done | `TX_TASK_PRIORITY = 3` in `websocket.hpp`, reconnects on `ws_conn` priority 2, [#1692](https://github.com/Attraccess/Attraccess/pull/1692), ATT-554 |
| Q4 | Shorter NFC detection poll and finer `waitready` steps | High / low / medium | Done | 30 ms and 2 ms steps in `rfid.hpp` and `pn532/driver.cpp`, [#1693](https://github.com/Attraccess/Attraccess/pull/1693) |
| Q5 | Lower the LVGL refresh and touch rate | Medium / trivial / low-medium | Done (other values) | Refresh 24 ms, touch 10 ms instead of the proposed 30 ms, [#1694](https://github.com/Attraccess/Attraccess/pull/1694) |
| Q6 | Heap settings: PSRAM for Wi-Fi/lwIP, lower `ALWAYSINTERNAL`, lighter heap poisoning | High / sdkconfig / medium | Partly done | `ALWAYSINTERNAL` is 1024 in `sdkconfig.defaults` (lower than the proposed 8192). Wi-Fi/lwIP allocation: [ATT-1276](https://linear.app/attraccess/issue/ATT-1276). Heap poisoning: dropped, it is a safety net and no measurement shows a need to weaken it |
| Q7 | Wake the connect task only on a state change | Low / low / low | Open | [ATT-1391](https://linear.app/attraccess/issue/ATT-1391) |
| Q8 | Clear up the I2C clock comment (400 kHz versus 100 kHz) | Low / trivial / low | Open | The clock is 400 kHz but the comment in `utils.hpp` still says it was reverted. [ATT-1392](https://linear.app/attraccess/issue/ATT-1392) |
| Q9 | Gate the unconditional serial prints in the NTAG424 code | Low / low / low | Dropped | The NTAG424 code was removed from the firmware when card checks moved to the server ([#2039](https://github.com/Attraccess/Attraccess/pull/2039), ATT-1145) |
| Q10 | Observability: run-time stats, `LOG_MEMORY_DEBUG`, PSRAM numbers in the log | High / low / none | Covered by ATT-1276 | [ATT-1276](https://linear.app/attraccess/issue/ATT-1276) |

### Medium

| ID | Recommendation | Impact / effort / risk | Status | Evidence or link |
|---|---|---|---|---|
| M1 | Keep card authentication and beeps out of `lv_lock` | High / medium / medium | Done (other form) | Card work runs through the server card relay and no longer in `processState()`. Beeps are asynchronous (M6) |
| M2 | Throttle the presence check of a held card | High / low / low | Partly done | Throttled to 250 ms and reduced to one command ([#1693](https://github.com/Attraccess/Attraccess/pull/1693)). The probe is now key-independent by design, because the reader holds no card keys, so the old AES caveat no longer applies. Cards that do not answer the probe: [ATT-1380](https://linear.app/attraccess/issue/ATT-1380) |
| M3 | Remove per-pass string churn | Medium / low / low | Open | [ATT-1391](https://linear.app/attraccess/issue/ATT-1391) |
| M4 | Keep hot screens loaded | Medium / medium / low-medium | Done | `shouldAutoUnload()` returns `false` for `lockscreen` and `initscreen` |
| M5 | LVGL performance monitor as the baseline tool | Measurement / trivial / none | Covered by ATT-1276 | The code path exists (`ATTRACTAP_LV_PERF_MONITOR` in `lv_conf.h` and `display.cpp`), but no build option sets it yet. The perf variant is in [ATT-1276](https://linear.app/attraccess/issue/ATT-1276) |
| M6 | Non-blocking beeps | Medium / medium / low | Done | Beeper worker task with a pattern queue in `beeper.cpp`, [#1695](https://github.com/Attraccess/Attraccess/pull/1695) |
| M7 | Serial Wi-Fi scan: watchdog and shorter cap | Medium / low / low | Open | [ATT-1390](https://linear.app/attraccess/issue/ATT-1390) |
| M8 | Cache settings in RAM | Low-medium / low / low | Done | `settings.cpp` keeps the API config and language cached |

### Architecture level

| ID | Recommendation | Impact / effort / risk | Status | Evidence or link |
|---|---|---|---|---|
| A-1 | Store each image once | High / low / low | Done | Raw image files linked once via `logos.S.in`, [#1696](https://github.com/Attraccess/Attraccess/pull/1696) |
| A-2 | Re-export the opaque lockscreen as plain RGB565 | Medium / low-medium / low | Done | `lockscreen.rgb565` (450 KB), [#1696](https://github.com/Attraccess/Attraccess/pull/1696). The logos keep their alpha plane |
| A-3 | Shorten or remove the fade transition | High / trivial / low | Done | `TRANSITION_ANIMATION = LV_SCR_LOAD_ANIM_NONE` in `display.hpp`, [#1694](https://github.com/Attraccess/Attraccess/pull/1694) |
| A-4 | Larger or double draw buffer | Medium-high / medium / medium | Done | Two 480×240 buffers in PSRAM, partial mode. LVGL direct mode and asynchronous flush were not pursued: no measurement asks for them, and the anti-drift work (ATT-717) would need re-validation |
| A-5 | Dedicated NFC task | High / medium-high / medium-high | Open | [ATT-1393](https://linear.app/attraccess/issue/ATT-1393). Measure first: the ATT-554 I2C wedge came from concurrent bus use |
| A-6 | I2C lock per transaction instead of per conversation | High / medium / medium-high | Open | [ATT-1393](https://linear.app/attraccess/issue/ATT-1393), same caveat as A-5 |
| A-7 | Reuse widgets instead of `lv_obj_clean` and rebuild | Medium / medium-high / low-medium | Dropped | Churn is limited to data rebuilds, and the pool doubled to 128 KB (A-8). No measurement shows a problem |
| A-8 | Larger LVGL pool or PSRAM allocator, fewer fonts | Medium / medium / medium | Done (pool size) | `LV_MEM_SIZE` 128 KB in `lv_conf.h`, [#1694](https://github.com/Attraccess/Attraccess/pull/1694). Moving the pool to PSRAM and trimming fonts were not done and are not planned |
| A-9 | Flash at 120 MHz | Low-medium / medium / high | Dropped | Not recommended: experimental, chip and temperature risk, little gain for a CPU-bound workload |
| A-10 | `IRAM_ATTR` hardening for ISRs | Low / medium / medium | Dropped | Superseded: code runs from PSRAM, so the cache stays on during flash writes |

## Measuring on hardware

Do all of this on a bench reader, not a fielded one. Nothing here is done automatically by CI.

1. **Debug build.** Use the debug overlay: `idf.py -B build/dbg -DATTRACTAP_VARIANT=<variant> -DSDKCONFIG_DEFAULTS="sdkconfig.defaults;sdkconfig.debug" build`. It switches the compiler to `-Og` with assertions on, so absolute timings are not comparable with release builds.
2. **LVGL performance monitor.** The code is compiled in when `ATTRACTAP_LV_PERF_MONITOR` is defined (`include/lv_conf.h`, `src/display/display.cpp`). It logs FPS and render and flush times to the serial console. No firmware CMake option sets the macro today; a ready-made variant is part of ATT-1276 (when merged).
3. **Run-time stats and `debug.stats`.** FreeRTOS run-time statistics, the `debug.stats` serial command and PSRAM numbers in the heap log are tracked in ATT-1276 (when merged).
4. **Heap log.** The WebSocket task logs internal free, largest block and minimum free heap every 30 seconds (`Websocket::logHeapStats`). Watch the minimum over 24 hours to see fragmentation.
5. **What to compare before and after a change:** frame time with the performance monitor, touch latency while a card is polled and while one is held, tap-to-result latency, reconnect cycle time, and the internal heap minimum.

## History

The first version of this analysis was written in August 2026 by Marcel Verdult in [pull request #1698](https://github.com/Attraccess/Attraccess/pull/1698). Most of its quick wins were implemented in the pull requests linked above.
