# Attractap Firmware — Performance-Analyse (ESP32-S3)

Analyse durchgeführt mit 6 parallelen Analyse-Agenten (Build/Flash, Runtime/Task-Scheduler, Rendering/LVGL, Memory/Heap, Network/TLS/OTA, Peripherals/NFC), ergänzt durch direkte Quell-Verifikation. Stand: Firmware v1.5.7, IDF v5.5 Ziel; lokale Toolchain inzwischen auf **v6.0.2** aktualisiert und Firmware-Quelle migriert (Build grün, siehe Abschnitt 6).

**Legende:** ✅ VERIFIED = direkt in Quelle/Konfiguration beobachtet · 🔶 HYPOTHESIS = abgeleitet, auf Hardware zu messen

---

## 1. Architektur-Baseline (✅ verifiziert)

| Eigenschaft | Wert | Beleg |
|---|---|---|
| SoC / Takt | ESP32-S3, 240 MHz | `sdkconfig.defaults:9` |
| Flash | 16 MB QIO @ 80 MHz | `sdkconfig.defaults:6-8` |
| PSRAM | Octal @ 80 MHz (per `CONFIG_SPIRAM_MODE_OCT`) | `sdkconfig.defaults:13-14` |
| Panel | 480×480 RGB, 16bpp, 12 MHz pclk ≈ 42 Hz | `rgb_gt911_driver.cpp:156-189` |
| Framebuffer | 1× PSRAM (~461 KB), keine Bounce-Buffer | `rgb_gt911_driver.cpp:172-189` |
| LVGL | 9.3.0, Software-Render, PARTIAL, 1× 19,2 KB DMA-Buffer | `display.cpp:191-199`, `lv_conf.h` |
| LVGL-Pool | 64 KB intern (SRAM), `LV_USE_STDLIB_MALLOC=LV_STDLIB_BUILTIN` (v9: eigener Pool, kein System-`malloc`) | `lv_conf.h:31-32` |
| Refresh / Touch | 15 ms (~66 Hz) — über Panel-Kadenz | `lv_conf.h:41` |
| FreeRTOS | 1 kHz Tick; main Task 16 KB, Core 1, Prio 1 | `sdkconfig.defaults:25-29` |
| I2C | Shared Bus (PN532+GT911+Expander), 400 kHz, 50 ms Timeout | `utils.hpp:18,24` |
| NFC-Poll | Auf main Loop, blocking 100 ms, `I2CBusGuard` | `nfc.hpp:146`, `nfc.cpp:196-207` |
| mbedTLS | RX 8192 / TX 4096, PSRAM-Allokation | `sdkconfig.defaults:16,60-61` |
| Optimierung | `-O2` PERF in allen Produktionsbuilds | `sdkconfig.defaults:35` |

---

## 2. Prioritierte Findings nach Analyse-Perspektive

### Agent A — Build / Flash-Konfiguration

| # | Finding | Evidenz | Tag |
|---|---|---|---|
| A1 | **Bild-Header in mehreren TUs dupliziert:** `lockscreen_background_image.hpp` (691,2 KB const-Array, C++ internal linkage) wird von 4 TUs referenziert (`lockscreen.cpp:14`, `noResourcesScreen.cpp:14`, `resourceDetailsScreen.cpp:21`, `resourceListScreen.cpp:15`) → 4 Kopien, alle referenziert; `logo_400w_png` wird von 4 TUs eingebunden, aber nur von 2 referenziert (`firmwareUpdateScreen.cpp:59`, `initscreen.cpp:71`); `logo_40h` von 2 TUs referenziert. Überzählige Kopien (mit `--gc-sections`, ESP-IDF-Default): 3×691,2 KB + 1×141 KB + 1×~15,6 KB ≈ **2,2 MB**; ohne gc-sections ≈ 2,5 MB. Bei 6,25-MB-App-Partition (`partitions.csv:4`) signifikant | Header-Struktur + Referenzzählung | ✅ (genaue Zahl 🔶 via `nm`/map prüfbar) |
| A2 | **Bildformat `NATIVE_WITH_ALPHA` (planar RGB565A8 in LVGL 9.3 bei 16 bpp):** Lockscreen-Alpha-Ebene ist **vollständig deckend (100 % 0xFF)** → Re-Encode als reines RGB565 für den Lockscreen gültig: −230 KB/Kopie + Fast-Copy-Pfad. Logos (`logo_400w_png`, `logo_40h`) haben **echte Transparenz** (≈76 % transparente Pixel) → dort kein Re-Encode. Stride muss **w·2** sein (planar), nicht w·3 — wurde im Zuge der Migration korrigiert. | Vollständige Alpha-Analyse (planar: letzte w·h Bytes) | ✅ (Lockscreen) / ❌ (Logos) |
| A3 | **LVGL-Renderpuffer nur 1/24 Frame** (480×20 px, single-buffered, `buf2=NULL`) → Render und Flush serialisieren, 24 Runden pro Full-Frame | `display.cpp:191-199` | ✅ |
| A4 | Keine per-Source `-O`-Overrides, kein LTO; PERF gilt überall | grep `target_compile_options`/`-flto` leer | ✅ |
| A5 | PSRAM 120 MHz **nicht möglich** (octal, experimentell/instabil); Flash 120 MHz nur mit HPM-fähigem Chip (experimental, mittleres-hohes Risiko, geringer Nutzen — CPU/cache-gebunden) | IDF v5.5 Kconfigs | ✅ (Kconfig) / Empfehlung |
| A6 | LVGL 64-KB-interner Pool (`LV_USE_STDLIB_MALLOC=LV_STDLIB_BUILTIN`) statt PSRAM; Fonts (Montserrat-Set) vollständig einkompiliert | `lv_conf.h:31-32,93-103` | ✅ |
| A7 | Kein `IRAM_ATTR` im gesamten `src/` — für ISRs während Flash-Schreibvorgängen (OTA/NVS) relevant, sonst unkritisch | grep leer | ✅ |

### Agent B — Runtime / Task-Scheduler

| # | Finding | Evidenz | Tag |
|---|---|---|---|
| B1 | **NFC-Poll auf dem UI-main-Loop hält `I2CBusLock` bis zu 100 ms** pro Zyklus; LvglTask (Prio 4) blockiert auf dem Mutex **während er `lv_lock` hält** → Touch + Rendering frieren bis zu 100 ms ein | `application.cpp:683`, `nfc.cpp:196-207`, `nfc.hpp:146`, `rgb_gt911_driver.cpp:259-267` | ✅ |
| B2 | **Karte gehalten → volle AES-Präsenz-Auth bei jedem Loop-Durchlauf** (`ntag424_Authenticate`, ~6 APDUs / ~30 I2C-Transaktionen / ~150 ms); Worst-Case (wedged slave) mehrere Sekunden Bus-Hold | `nfc.cpp:158-176`, `Adafruit_PN532_NTAG424.cpp:2106-2382` | ✅ (Worst-case 🔶) |
| B3 | **`processState()` führt NFC-Auth/changeKey + blocking Beeps innerhalb `lv_lock` aus** (errorBeep ≈ 700 ms: 3× `singleBeep` mit je `delay(100)` + 2× `delay(200)`) → UI friert während Enrollment/Auth | `application.cpp:690-692`, `beeper.cpp:30-37,52-73`, `application_state.cpp:255,610-613` | ✅ |
| B4 | `ws_tx` Task **Prio 5 > LvglTask 4**, unpinned, 5 s Send-Timeout | `websocket.hpp:136-137`, `display.cpp:249` | ✅ |
| B5 | **Pro Loop-Iteration mehrfache NVS open/read/close** (Settings-Getter by-value) | `application_state.cpp:27,66`, `websocket.cpp:106,143`, `settings.cpp:102-111` | ✅ |
| B6 | Serial-WiFi-Scan busy-wait bis 10 s **ohne WDT-Reset** auf main Loop | `serialCommandHandler.cpp:293-297` | ✅ |
| B7 | `LOG_MEMORY_DEBUG` nirgends definiert (totes Instrument); keine FreeRTOS-Run-Statistik aktiviert | `main.cpp:23-36`, sdkconfig | ✅ |
| B8 | Kein dedizierter NFC-Task (ATT-554-Revert); kein Deadlock (leaf-lock-Ordnung konsistent) | `application.cpp:679-683`, `utils.hpp:57-64` | ✅ |

### Agent C — Rendering / LVGL

| # | Finding | Evidenz | Tag |
|---|---|---|---|
| C1 | **500-ms-Fade-Transition invalidiert den ganzen Screen ~33× pro Übergang** (je ~460 KB Software-Render+Flush) | `display.hpp:94-96`, `display_router.cpp:57` | ✅ |
| C2 | **66 Hz Refresh+Touch über Panel-Kadenz (42 Hz)** — ~2× unnötige CPU/I2C-Last; 30 ms (~33 Hz) halbiert beides | `lv_conf.h:41`, `rgb_gt911_driver.cpp:156` | ✅ |
| C3 | **Background-Bild (RGB565+A8) wird per-Pixel aus Flash alpha-geblendet** bei jeder Full-Screen-Invalidierung | `lockscreen_background_image.hpp` + 4 Screens als `bg_image` | ✅ |
| C4 | Per-Tick-Update-Pfad ist **bereits sauber** (`setLabelTextIfChanged`, `lv_bar_set_value` early-return — ATT-554-Fixes vorhanden) | `resourceDetailsSession.cpp:24`, `lv_bar.c` v9.3.0 | ✅ |
| C5 | Objekt-Churn nur bei Daten-Rebuilds (`lv_obj_clean`+create: resourceList, resourceDetails buttons, Forms-Modal) → 64-KB-Pool-Fragmentierung | `resourceListScreen.cpp:60`, `resourceDetailsScreen.cpp:547`, `resourceDetailsForms.cpp:470` | ✅ |
| C6 | Flush = synchroner CPU-`memcpy` in PSRAM-FB, kein DMA/Bounce; Tearing via `CONFIG_LCD_RGB_RESTART_IN_VSYNC` umgangen (Symptom-Workaround, kein Perf-Fix) | `display_input.cpp:8-15`, `rgb_gt911_driver.cpp:232-240` | ✅ |
| C7 | Lock-Topologie korrekt (`LV_USE_OS=LV_OS_FREERTOS`, alle UI-Mutationen unter `lv_lock`) | `lv_conf.h:49`, `application.cpp:690-692` | ✅ |
| C8 | Perf-Monitor kompilierbar via `-D ATTRACTAP_LV_PERF_MONITOR=1`, default aus | `lv_conf.h:81-87` | ✅ |

### Agent D — Memory / Heap

| # | Finding | Evidenz | Tag |
|---|---|---|---|
| D1 | **Per-Tick `std::string`-Churn (~3-4 Allocs/ms):** `getAttraccessApiConfig()` by-value ×2 + State-Getter-Kopien pro Loop-Durchlauf; Hostnames > SSO (15 Zeichen) → echte malloc/free | `settings.cpp:102-105`, `state.cpp:109-142`, `websocket.cpp:141-174`, `application_state.cpp:27,81-83` | ✅ |
| D2 | **Screens werden bei jedem Wechsel zerstört+neu aufgebaut** (`shouldAutoUnload` default true, keine Overrides) → LVGL-64-KB-Pool-Churn + `pendingDestroyScreens`-Vector | `IScreen.hpp:49`, `display_router.cpp:70-81` | ✅ |
| D3 | **Freie sdkconfig-Knöpfe:** kein `CONFIG_SPIRAM_TRY_ALLOCATE_WIFI_LWIP`, kein `CONFIG_SPIRAM_MALLOC_ALWAYSINTERNAL=8192`, kein `CONFIG_HEAP_POISONING_LIGHT` (Default: comprehensive → Overhead pro free()) | `sdkconfig.defaults` | ✅ Flags / 🔶 Defaults |
| D4 | mbedTLS-in-PSRAM für diese Last (KB-Frames, 5-s-Heartbeat) akzeptabel; keine Änderung nötig | `sdkconfig.defaults:16,60-61` | ✅ |
| D5 | Bild-Blobs sind **flash-resident, kein Runtime-Copy** — nicht in PNG-Decode konvertieren | `lockscreen.cpp:14` u.a. | ✅ |
| D6 | Feste Cross-Task-Buffer korrekt (kein Torn Read); große transiente Allocs (>16 KB → PSRAM) abgesichert | `application.hpp:128,214-215`, `api_diag.cpp` | ✅ |
| D7 | **PSRAM free/largest wird nie geloggt** (nur `MALLOC_CAP_INTERNAL`) → PSRAM-Erschöpfung unsichtbar | `websocket.cpp:451-456`, `application_bootdiag.cpp:90-128` | ✅ |

### Agent E — Network / TLS / OTA

| # | Finding | Evidenz | Tag |
|---|---|---|---|
| E1 | **WiFi Modem-Sleep nie deaktiviert** (kein `esp_wifi_set_ps` irgendwo) → Latenz auf jedem Handshake/Heartbeat/Reconnect | `wifi.cpp:120-193` (nur `esp_wifi_start` bei :185), grep leer | ✅ (IDF-Default 🔶) |
| E2 | **Kein `network_timeout_ms` gesetzt** + Cert-Sweep (20 Certs × 2 Versuche × 10 s Pacing) → Worst-Case ~13 min Retry-Zyklus | `websocket.cpp:287-313`, `ca_index.hpp:5`, `websocket.hpp:74` | ✅ (Default 🔶) |
| E3 | **WS-Text-Frames > 4 KB werden als Fragmente geparst und verworfen** (`processIncomingMessage` ignoriert `payload_len`/`payload_offset`) | `websocket.cpp:293,512-518`, `api.cpp:67-73`, `ota_updater.cpp:126-131` | ✅ (Server-Verhalten 🔶) |
| E4 | `requestConnect()` wird **jeden Tick (~1000×/s)** geweckt (no-op in Backoff) | `websocket.cpp:58-64,117-119,434-449` | ✅ |
| E5 | Outbound-JSON: Heap-Alloc pro Message + ACK pro Inbound (niedrige Rate, ok); Parse auf WS-Task in statischem Doc (gut) | `api.cpp:289-327`, `websocket.cpp:570-585` | ✅ |
| E6 | Kein Reconnect-Storm (Backoff 10→60 s, coalescing); kein Blocking-Network auf UI-Core (außer seltenem `disableConnectionAttempts`) | `websocket.cpp:434-510,673-702` | ✅ |
| E7 | OTA: 4-KB-Chunks, ein Chunk in flight, Resume auf `bytesWritten` — solide; `esp_ota_write` (Sector-Erase) blockiert nur den WS-Task | `ota_updater.cpp:96,147,232-266` | ✅ |
| E8 | Cert-PEMs: statisch in Flash, kein Re-Parse pro Verbindung (nur mbedTLS-Handshake) | `ca_data.cpp:4`, `AdaptiveCertManager.cpp:84-98,245-298` | ✅ |

### Agent F — Peripherals / NFC

| # | Finding | Evidenz | Tag |
|---|---|---|---|
| F1 | **NFC-Detection-Poll hält Bus 100-200 ms** (2× `waitready`, 10-ms-Granularität) → Touch ausgehungert (300-ms-Stale-Hold-Workaround dokumentiert) | `nfc.hpp:146`, `Adafruit_PN532_NTAG424.cpp:3771-3790`, `rgb_gt911_driver.hpp:43-55` | ✅ |
| F2 | **Präsenz-Auth bei gehaltener Karte unbegrenzt** — auf ~250 ms drosseln oder billigen 1-APDU-Probe verwenden (⚠️ Probe muss AES-authentifiziert bleiben, nicht auf ungeschützte Lese-Befehle wie `GetVersion`/`ReadData` ausweichen — sonst spoofbar) | `nfc.cpp:158-176` | ✅ |
| F3 | **I2C läuft tatsächlich mit 400 kHz**, Kommentar „reverted to 100 kHz" ist veraltet/widersprüchlich (klären, was Feld-stabil ist) | `utils.hpp:9-18` (`ATTRACTAP_I2C_CLOCK_HZ = 400000`) | ✅ |
| F4 | **Tap-Latenz ~150-300 ms, dominiert von `waitready`-10-ms-Polling**; AES-Crypto <1 ms (HW-AES, `CONFIG_MBEDTLS_CMAC_C=y`); NDEF-Read nie genutzt (Auth-only) | `Adafruit_PN532_NTAG424.cpp:2106-2382,2248-2329`, `ntag424_ReadData` ohne Caller | ✅ |
| F5 | LED-Animation billig (integer-only, idle-Prio, 50 ms); ioexpander ereignisgesteuert (vernachlässigbar) | `led.cpp:355-364`, `ioexpander.cpp:184-212` | ✅ |
| F6 | Unconditional Serial-Prints in `ntag424_apdu_send` (jede APDU) + `ntag424_ChangeKey` — bei Enrollment-Latenz relevant | `Adafruit_PN532_NTAG424.cpp:1352-1353,2520` | ✅ |

---

## 3. Prioritierte Empfehlungen (Effort / Impact / Risiko)

### 🟢 Quick Wins (sdkconfig + Flags, niedriger Aufwand)

| # | Maßnahme | Impact | Effort | Risiko | Tag |
|---|---|---|---|---|---|
| Q1 | `esp_wifi_set_ps(WIFI_PS_NONE)` nach `esp_wifi_start()` in `wifi.cpp:185` | **Hoch** (Handshake/Reconnect/OTA-Latenz) | 1 Zeile | Niedrig (Netzgerät; +RF-Strom) | ✅ (IDF-Default 🔶) |
| Q2 | `websocket_cfg.network_timeout_ms = 5000` in `websocket.cpp:287` | Mittel (fail-fast Reconnect) | 1 Zeile | Niedrig-Mittel | ✅ |
| Q3 | `ws_tx`-Prio 5 → ≤ 4 (`websocket.hpp:136`) | Mittel (kein Preempt des Renderers) | trivial | Niedrig | ✅ |
| Q4 | NFC-Poll: `detectionPollTimeoutMs` 100 → 20-30 ms (`nfc.hpp:146`) + `waitready`-Granularität 10 → 2 ms | **Hoch** (Touch/UI reagiert) | Niedrig | Mittel (≥20 ms halten, PN532-Busy) | ✅ |
| Q5 | `LV_DEF_REFR_PERIOD` 15 → 30 ms (`lv_conf.h:41`) | Mittel (halbiert Render+Touch-I2C) | trivial | Niedrig-Mittel (Touch 33 Hz — GT911 toleriert Stale) | ✅ |
| Q6 | `CONFIG_SPIRAM_TRY_ALLOCATE_WIFI_LWIP=y`, `CONFIG_SPIRAM_MALLOC_ALWAYSINTERNAL=8192`, `CONFIG_HEAP_POISONING_LIGHT` (Release) — ⚠️ Hinweis: `comprehensive` Poisoning ist ein Buffer-Overrun/UAF-Erkennungsnetz; auf `LIGHT` nur umstellen, wenn der Security-Trade-off akzeptiert ist | **Hoch** (interner Heap-Headroom) | sdkconfig | Mittel (WiFi/TLS-Soak) | ✅ Flags / 🔶 Defaults |
| Q7 | `requestConnect()` nur bei State-Change notifizieren (Backoff-gated) | Niedrig (idle-CPU) | Niedrig | Niedrig | ✅ |
| Q8 | F3-Kommentar/Clock klären (400 kHz vs. 100 kHz) | Niedrig | trivial | Niedrig (nur Klärung) | ✅ |
| Q9 | Unconditional Serial-Prints in NTAG424-Pfaden hinter `#ifdef` | Niedrig (Enrollment-Latenz) | Niedrig | Niedrig | ✅ |
| Q10 | Observability: `CONFIG_FREERTOS_USE_TRACE_FACILITY/STATS_FORMATTING_FUNCTIONS/VTASKLIST_INCLUDE_COREID`; `LOG_MEMORY_DEBUG=1` definieren; PSRAM free/largest in 30-s-Log + Boot-Record | **Hoch** (Diagnose auf HW) | Niedrig | Kein | ✅ |

### 🟡 Medium (Task-/I2C-/Redraw-Umbau)

| # | Maßnahme | Impact | Effort | Risiko | Tag |
|---|---|---|---|---|---|
| M1 | **Karten-Auth + Beeps aus `lv_lock` herausziehen** (`application.cpp:690-692` splitten; LVGL-Mutationen nur am Ende kurz locken) | **Hoch** (UI friert nicht mehr) | Mittel | Mittel | ✅ |
| M2 | **Präsenz-Auth drosseln** (nur alle ~250 ms, oder 1-APDU-Probe statt EV2First — ⚠️ AES-authentifiziert bleiben, nicht auf ungeschützte Lese-Befehle ausweichen) | **Hoch** (Bus frei bei Karten-Hold) | Niedrig | Niedrig | ✅ |
| M3 | Per-Tick-String-Churn eliminieren: `getAttraccessApiConfig()` by-const-ref/cache, State-Getter feste `char[]`, `publishConnectionStatus` ~100 ms drosseln | Mittel (Fragmentation+CPU) | Niedrig | Niedrig | ✅ |
| M4 | Hot Screens persistent machen (`shouldAutoUnload()→false` für lockscreen/init) → LVGL-Pool-Churn weg | Mittel | Mittel | Niedrig-Mittel | ✅ |
| M5 | `-D ATTRACTAP_LV_PERF_MONITOR=1` Baseline (FPS/CPU-On-Screen) vor/nach jeder Änderung | **Messung** | trivial | Kein | ✅ |
| M6 | Blocking Beeps → esp_timer-gesteuert (kein `delay(100)` in `singleBeep`) | Mittel | Mittel | Niedrig | ✅ |
| M7 | Serial-WiFi-Scan: WDT-Reset + Cap 5 s oder auf NetworkTask | Mittel | Niedrig | Niedrig | ✅ |
| M8 | NVS-Settings-Cache mit Dirty-Flag (RAM-Reads statt per-Tick NVS) | Niedrig-Mittel | Niedrig | Niedrig | ✅ |

### 🔴 Architektur-Level

| # | Maßnahme | Impact | Effort | Risiko | Tag |
|---|---|---|---|---|---|
| A-1 | **Bild-Arrays single-instance** (`images.cpp` + `extern` im Header) → ~2,2 MB Flash/OTA + Compile-Zeit | **Hoch** | Niedrig | Niedrig | ✅ |
| A-2 | **Lockscreen als reines RGB565 re-exportieren** (Alpha-Ebene 100 % deckend, planar verifiziert) → −230 KB Flash + Fast-Copy-Pfad. Logos bleiben RGB565A8 (echte Transparenz). | Mittel (Tooling) | Niedrig-Mittel (visuell prüfen) | ✅ Lockscreen / ❌ Logos |
| A-3 | **Fade-Transition verkürzen/entfernen** (`display.hpp:94-96`) → −33 Full-Screen-Renders pro Wechsel | **Hoch** | trivial | Niedrig (UX) | ✅ |
| A-4 | **Zweiter LVGL-Draw-Buffer / async Flush / DIRECT-Mode in PSRAM-FB** | Mittel-Hoch (Frame-Throughput) | Mittel | Mittel (Anti-Drift revalidieren) | ✅ (DIRECT 🔶) |
| A-5 | **Dedizierter NFC-Task** (Core 0, Prio 2, bestehende `I2CBusGuard`-Disziplin) statt main-Loop-Poll | **Hoch** | Mittel-Hoch | **Mittel-Hoch** (ATT-554-Wedge-Historie — zuerst Q4/Q5/M2 testen) | ✅ |
| A-6 | Per-Transaction-I2C-Locking statt Gesamt-Konversation (Touch interleavt) | **Hoch** | Mittel | **Mittel-Hoch** (widerspricht ATT-554-Doku — Feld-Revalidierung nötig) | ✅ |
| A-7 | Widget-Reuse statt `lv_obj_clean`+create in Rebuild-Pfaden | Mittel | Mittel-Hoch | Niedrig-Mittel | ✅ |
| A-8 | LVGL-Allokator → PSRAM (`LV_USE_STDLIB_MALLOC=LV_STDLIB_CLIB` bzw. `LV_STDLIB_FREERTOS`, v9) oder `LV_MEM_SIZE` erhöhen; Fonts trimmen | Mittel | Mittel | Mittel (alle Screens retesten) | ✅ |
| A-9 | Flash 120 MHz (HPM) | Niedrig-Mittel (CPU/cache-gebunden) | Mittel | **Hoch** (Chip-Support, Temperatur) — nicht empfohlen | 🔶 |
| A-10 | IRAM_ATTR-Härtung für ISRs | Niedrig | Mittel | Mittel | 🔶 |

---

## 4. Top-10-Shortlist (empfohlene Reihenfolge)

1. **`esp_wifi_set_ps(WIFI_PS_NONE)`** (Q1) — 1 Zeile, größter Latenz-Payoff für Netzwerk.
2. **NFC-Poll: 100 → 20-30 ms + `waitready`-Granularität 2 ms** (Q4) — größter UI-Responsiveness-Payoff.
3. **`LV_DEF_REFR_PERIOD` 15 → 30 ms** (Q5) — halbiert Render+Touch-Last, Panel deckt eh nur 42 Hz.
4. **`processState`-`lv_lock` splitten** (M1) — UI friert bei Auth/Enrollment nicht mehr ein.
5. **Präsenz-Auth drosseln (250 ms / 1-APDU-Probe, ⚠️ AES-authentifiziert — siehe M2)** (M2) — Bus frei bei gehaltener Karte.
6. **Bild-Arrays single-instance via C++17 `inline`** (A-1) — ~2,2 MB Flash/OTA (4×691 KB Background + Logo-Kopien kollabieren auf je 1). **Lockscreen-RGB565-Re-Encode (A-2)** zusätzlich möglich (−230 KB, Alpha-Ebene 100 % deckend); Logos nicht (echte Transparenz).
7. **Fade-Transition entfernen/kürzen** (A-3) — −33 Full-Screen-Renders pro Screen-Wechsel.
8. **sdkconfig-Heap-Knöpfe** (Q6: SPIRAM_TRY_ALLOCATE_WIFI_LWIP, ALWAYSINTERNAL=8192, POISONING_LIGHT).
9. **`ws_tx`-Prio ≤ 4 + `network_timeout_ms=5000`** (Q3+Q2).
10. **Observability aktivieren** (Q10: Run-Statistik, `LOG_MEMORY_DEBUG`, PSRAM-Log) — Voraussetzung, um 1-9 auf Hardware zu verifizieren.

**Danach (wenn 1-9 auf Hardware gemessen und bestätigt):** Architektur-Level A-5 (NFC-Task) / A-6 (Per-Transaction-Lock) erst nach Feld-Revalidierung der ATT-554-Wedge-Grenzen.

---

## 5. Messung / Instrumentierung (Vorschlag — kein Flash ohne Freigabe)

1. **Build (nach IDF v5.5-Update):**
```bash
idf.py -B build/dbg -DATTRACTAP_VARIANT=attractap-touch \
       -DSDKCONFIG_DEFAULTS="sdkconfig.defaults;sdkconfig.debug" \
       -D ATTRACTAP_LV_PERF_MONITOR=1 build
```
2. **Laufzeit:** `CONFIG_FREERTOS_USE_TRACE_FACILITY=y` + `_STATS_FORMATTING_FUNCTIONS` + `_VTASKLIST_INCLUDE_COREID` (vTaskList/vTaskGetRunTimeStats); `LOG_MEMORY_DEBUG=1` (Stack-High-Watermarks, `main.cpp:23-36`); PSRAM free/largest im 30-s-Log (`websocket.cpp:451-456`) und Boot-Record.
3. **Messgrößen auf Hardware:** Frame-Renderzeit (Perf-Monitor FPS), Touch-Poll-Latenz während NFC-Poll, Tap→Auth-Latenz, Reconnect-Zykluszeit (mit/ohne Q1/Q2), interner Heap-Verfall über 24 h (Fragmentation, Q6 vorher/nachher).

---

## 6. Toolchain-Update (Voraussetzung für Builds)

> ⓘ Lokale-Umgebungs-Beobachtung (Maschinenzustand außerhalb des Repos; zum Ausführungszeitpunkt erneut prüfen):

> ⓘ Vor der Migration (v5.4 → v6.0.2) galt: Der lokale Build schlug fehl — **installiertes ESP-IDF v5.4** (git checkout `~/esp/esp-idf`, branch v5.4) vs. **Projekt-Anforderung `idf >=5.5.0`** (`main/idf_component.yml:2`). ESP-IDF ist **nicht** per brew installiert — brew verwaltet nur `cmake`, `ninja`, `python@3.x`. Update-Pfade:

**Neueste Versionen (Stand Analyse):** neueste **stabile** Releases sind **v6.0.2** (v6-Linie; v6.1 noch beta) und **v5.5.5** (neueste v5.x). **v6 ist grundsätzlich nutzbar:** die Projekt-Anforderung `idf >=5.5.0` wird von v6.0 erfüllt; die kritischen Managed Components deklarieren kompatible IDF-Constraints (`esp_websocket_client` 1.0.0–1.8.0: `>=5.0`; `esp_lcd_st7701` 2.0.x: `>=5.4`), und `CONFIG_LCD_RGB_RESTART_IN_VSYNC` existiert auch in v6.0.2. **Aber:** v6 ist ein Major-Release mit Breaking Changes (Kconfig-Umbenennungen/-Entfernungen, API-Änderungen, ggf. neuere esp_websocket_client-Version nötig, da der Firmware-Kommentar den 1.5.x-Pin mit fehlender `esp_transport_ws_get_redir_uri` in v5.5 begründet). **Empfehlung:** für die Performance-Optimierung auf **v5.5.5** bleiben (Linie, für die die Firmware geschrieben wurde); v6.0.2 nur als separates Migrationsprojekt mit Build + Hardware-Validierung evaluieren.

> ⓘ **Nachtrag (durchgeführt):** Der Anwender hat auf **v6.0.2** aktualisiert und die Quell-Migration zur Kompilierung unter v6.0.2 wurde durchgeführt. Ergebnis: **Build grün** (`attractap.bin` 0x4aef40 / 4,9 MB, 25 % App-Partition frei). 14 Dateien angepasst, u. a.:
> - **NTAG424-Crypto → PSA Crypto API** (mbedTLS 4.x entfernte `mbedtls/aes.h`/`cmac.h` aus den public Headern; `psa/crypto.h` mit AES-128-CBC + CMAC, auto-init bei Boot)
> - **W5500-Ethernet** → Managed Component `espressif/w5500 ^2.0.0` (aus IDF-Core entfernt) + `.base`-Config-Nesting
> - **LVGL-Bild-Header** um `stride`/`flags`/`reserved_2` ergänzt (LVGL 9.3-Struct, Deklarations-Reihenfolge)
> - **RGB-Panel-Config** `bits_per_pixel` → `in_color_format`/`out_color_format` (RGB565), GPIOs als `gpio_num_t`
> - **WiFi-Disconnect-Reasons** umbenannt, `esp_timer_create_args_t`-Felder, `{}`-Init für Aggregate, `-Wno-deprecated-enum-enum-conversion` (LVGL-Selektor-Idiom)
> Security-Review: **keine Befunde**; Hardware-Flash/Validierung steht noch aus (nicht freigegeben).

**Empfohlener Update-Pfad (v5.5.5, via git/IDF-Installer — kein brew):**
```bash
cd ~/esp/esp-idf
git fetch origin --tags
git checkout v5.5.5          # neueste v5.5.x (oder v5.5.0)
git submodule update --init --recursive
./install.sh esp32s3         # Toolchain/Python-Env für v5.5 neu aufsetzen
. ./export.sh                # danach idf.py wieder nutzbar
```

**Brew-managed Build-Tools aktualisieren (optional):**
```bash
brew update
brew upgrade cmake ninja
```

**Alternativ (falls komplett über brew gewünscht — ersetzt aber die bestehende `~/esp`-Installation, inkompatibel mit dem `export.sh`-Workflow):**
```bash
brew tap espressif/idf
brew install espressif/idf/esp-idf
```

> ⚠️ Wichtig: `~/esp/esp-idf` ist ein git-Checkout — ein `brew upgrade` berührt es nicht. Nach `git checkout v5.5.5` ist `./install.sh` Pflicht, da sich Toolchain-Versionen zwischen 5.4 und 5.5 unterscheiden können.

---

## 7. Klar getrennt: VERIFIED vs. HYPOTHESIS

**✅ Verifiziert (Quelle/Konfig):** alle in den Tabellen mit ✅ markierten Punkte — beobachtet in Code/sdkconfig/Kconfigs, größtenteils doppelt durch direkte Quell-Lektüre abgesichert (u.a. NFC-Poll-Timeout 100 ms `nfc.hpp:146`, `waitready`-10-ms-Granularität, fehlendes `esp_wifi_set_ps`, `ws_tx`-Prio 5, Einzelbuffer-LVGL, I2C 400 kHz mit veraltetem Kommentar, `-O2` überall). **Korrektur:** die Bild-Blobs sind planar RGB565A8 (Stride w·2); Lockscreen-Alpha ist 100 % deckend (A-2 gültig), Logos haben echte Transparenz (A-2 dort nicht anwendbar).

**🔶 Hypothesen (auf Hardware zu messen):** IDF-Defaults (Modem-Sleep-Verhalten, `network_timeout_ms`=10 s des WS-Components, Heap-Poisoning-comprehensive, `SPIRAM_MALLOC_ALWAYSINTERNAL`=16 KB), tatsächliche Renderzeiten pro Full-Frame (>15-30 ms), Worst-Case-Bus-Hold-Dauern bei wedged PN532, ob der Server >4-KB-WS-Frames sendet, LvglTask-/Draw-Unit-Stack-Auslastung, Effekt der 33-Hz-Touch-Sampling-Rate auf GT911-Stale-Hold.

**Nicht gemessen (kein Flashing ohne Freigabe):** keine empirischen Timing-Daten; alle Timing-Angaben sind aus Quell-Struktur abgeleitet (Reihenfolge der I2C-Transaktionen, Delay-Konstanten, APDU-Zählung).

---

*Erstellt durch 6 parallele Analyse-Agenten + direkte Quell-Verifikation. Keine Quelldateien wurden verändert; die einzige Arbeits-Artefakt-Änderung war die Generierung von `src/certs/` (Build-Voraussetzung, vom build_firmwares.py-Workflow ebenfalls erzeugt).*
