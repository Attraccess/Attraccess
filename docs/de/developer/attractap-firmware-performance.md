# Attractap-Firmware-Performance
<!-- llms-description: Aktuelle Performance-Baseline der Attractap-ESP32-S3-Firmware und der Status jeder Empfehlung aus der Analyse vom August 2026, mit Links zu den offenen Tickets. -->

Diese Seite hält fest, wo die Attractap-Firmware bei der Performance steht und welche Empfehlungen noch offen sind. Sie ersetzt die Analyse vom August 2026 (siehe [Historie](#historie)), deren Zahlen die Firmware v1.5.7 beschrieben.

**Geprüft gegen:** `main` bei Commit `fda6e5071` (22.11.2026).

**Methode:** statische Durchsicht der Quellen und sdkconfig-Dateien unter `apps/attractap/firmware`. Für diese Seite wurde nichts auf Hardware gemessen. Zeiten und Einstufungen unten sind Schätzungen aus der Code-Struktur, keine Messwerte. Offene Punkte werden in Linear verfolgt; diese Seite muss die Arbeit daher nicht im Detail aufführen.

## Architektur-Baseline

Pfade sind relativ zu `apps/attractap/firmware`.

| Bereich | Aktueller Wert | Wo |
|---|---|---|
| ESP-IDF | v6.0.2 | `esp-idf-version.txt` |
| SoC / CPU | ESP32-S3, 240 MHz | `sdkconfig.defaults` |
| Flash | 16 MB, QIO, 80 MHz; zwei OTA-App-Partitionen mit je 6,25 MB | `sdkconfig.defaults`, `partitions.csv` |
| PSRAM | Octal, 80 MHz. `malloc()` versucht internen RAM nur bis 1 KB zuerst (`CONFIG_SPIRAM_MALLOC_ALWAYSINTERNAL`). Code und Nur-Lese-Daten laufen aus dem PSRAM (`CONFIG_SPIRAM_XIP_FROM_PSRAM`), der Cache bleibt also beim Schreiben des Flash an | `sdkconfig.defaults` |
| Panel | 480×480 RGB565, 12 MHz Pixeltakt (etwa 42 Hz, aus der alten Analyse, nicht neu gemessen), ein PSRAM-Framebuffer plus zwei Bounce-Buffer mit je 16 Zeilen im internen DMA-RAM (etwa 30 KB) | `src/display/driver/gt911/rgb_gt911_driver.cpp` |
| LVGL | 9.3.0, Software-Rendering, Partial-Modus, zwei Zeichenpuffer mit 480×240 im PSRAM (Fallback: ein Puffer mit 480×20). Der Flush ist ein synchrones CPU-Kopieren in den Framebuffer | `main/idf_component.yml`, `src/display/display.cpp`, `src/display/display_input.cpp` |
| LVGL-Speicherpool | 128 KB, LVGLs eingebauter Allokator (`LV_STDLIB_BUILTIN`) | `include/lv_conf.h` |
| Refresh / Touch | Refresh alle 24 ms (`LV_DEF_REFR_PERIOD`); Touch wird alle 10 ms abgetastet; GT911-Stale-Hold 300 ms | `include/lv_conf.h`, `src/display/display.cpp`, `rgb_gt911_driver.hpp` |
| Screens | `lockscreen` und `initscreen` bleiben geladen; alle anderen Screens werden bei jedem Wechsel zerstört und neu aufgebaut. Screen-Wechsel laufen ohne Animation | `src/display/screens/IScreen.hpp`, `src/display/display.hpp` |
| Bilder | Rohe `.rgb565`- und `.rgb565a8`-Dateien, einmalig über `logos.S.in` in den Nur-Lese-Speicher gelinkt. Die C++-Header sind je etwa 0,5 KB groß. Der Lockscreen ist ein 450 KB großes, deckendes RGB565-Bild; die beiden Logos behalten eine Alpha-Ebene | `src/display/images/`, `main/CMakeLists.txt` |
| FreeRTOS | 1-kHz-Tick. Main-Task: 18 KB Stack, Core 1. `LvglTask`: Priorität 4, Core 1, 12 KB. WebSocket-Client-Task: Priorität 3. `ws_tx`: Priorität 3. `ws_conn` (Verbinden und Wiederverbinden): Priorität 2. Beeper-Worker: Priorität 1 | `sdkconfig.defaults`, `src/display/display.cpp`, `src/websocket/` |
| I2C | Ein gemeinsamer Bus für PN532, GT911 und IO-Expander, 400 kHz, 50 ms Transfer-Timeout | `src/utils.hpp` |
| NFC-Polling | Auf der Main-Loop. Erkennungs-Poll 30 ms (`NFC::detectionPollTimeoutMs`), PN532-`waitready` in 2-ms-Schritten, aufliegende Karte wird alle 250 ms (`NFC::presenceCheckIntervalMs`) mit einem einfachen Befehl geprüft | `src/rfid/rfid.hpp`, `src/rfid/rfid.cpp`, `src/rfid/pn532/driver.cpp` |
| Kartenoperationen | Laufen über das Karten-Relay auf dem Server. Der Reader führt NTAG424-Authentifizierung und Schlüsselwechsel nicht mehr selbst aus | `src/application/card_relay.hpp` |
| WLAN | Modem-Sleep aus (`WIFI_PS_NONE`) | `src/network/wifi/wifi.cpp` |
| WebSocket | Client-Puffer 4096 Bytes, `network_timeout_ms` 10 s, TCP-Keepalive 5 s / 5 s / 3, Reconnect-Backoff ab 10 s | `src/websocket/connection.cpp`, `websocket.hpp` |
| mbedTLS | Record-Puffer 8192 ein / 4096 aus, im PSRAM allokiert (`CONFIG_MBEDTLS_EXTERNAL_MEM_ALLOC`). TLS 1.3 ist für die Sitzung gekoppelter Reader aktiviert und läuft in einem eigenen Task mit PSRAM-Stack | `sdkconfig.defaults`, `src/api/security/` |
| Optimierung | `-O2` (`CONFIG_COMPILER_OPTIMIZATION_PERF`) in allen Produktions-Builds. Keine LTO-Option gesetzt. Kein `IRAM_ATTR` in `src/` | `sdkconfig.defaults` |

### Was sich seit August geändert hat und die Baseline verschiebt

- Gekoppelte Reader führen im WebSocket eine TLS-1.3-Sitzung aus (ATT-1207). Worker und Puffer liegen im PSRAM.
- Der BLE-Proxy (ATT-1033) startet NimBLE nur bei Bedarf und gibt es nach 30 s ohne BLE-Arbeit wieder frei. Er kostet also nur während der Nutzung etwa 24 KB internen RAM.
- Das RGB-Panel hält jetzt 16 Bounce-Zeilen im internen RAM und führt Code aus dem PSRAM aus, damit das Bild beim Flash-Schreiben ruhig bleibt (Display-Arbeit aus #2260).
- Die Kartenauthentifizierung ist auf den Server gewandert. Die Firmware enthält die NTAG424-Kryptografie nicht mehr, daher gelten mehrere alte Befunde dazu nicht mehr.

### Befunde, die weiter gelten

- Das NFC-Polling läuft weiter auf der Main-Loop und hält den I2C-Bus pro Durchlauf bis zu 30 ms.
- `Websocket::loop()` kopiert weiter Strings und weckt den Connect-Task bei jedem Durchlauf (etwa einmal pro Millisekunde).
- Der serielle WLAN-Scan-Befehl blockiert die Main-Loop weiter bis zu 10 s.
- WebSocket-Textframes über dem 4096-Byte-Client-Puffer werden weiter als Fragmente weitergereicht.
- Einige Quellkommentare sind veraltet oder verweisen auf die alte Berichtsdatei, die nie in `main` gelandet ist.
- Der freie PSRAM ist weiter nicht Teil des periodischen Heap-Logs, und `LOG_MEMORY_DEBUG` ist nirgends definiert. Beides wird in ATT-1276 verfolgt.

## Empfehlungen

Die IDs stammen aus dem Bericht vom August. Wirkung, Aufwand und Risiko sind die ursprünglichen Schätzungen, keine Messwerte. Ticket-Links führen zu Linear. Was in ATT-1276 verfolgt wird, ist dort beschrieben; dessen Pull Request kann vor oder nach dem Lesen dieser Seite gemergt werden.

**Status:** Erledigt, Teilweise erledigt, Offen (Ticket), Abgedeckt durch ATT-1276, Verworfen.

### Quick Wins

| ID | Empfehlung | Wirkung / Aufwand / Risiko | Status | Beleg oder Link |
|---|---|---|---|---|
| Q1 | WLAN-Modem-Sleep ausschalten | Hoch / 1 Zeile / niedrig | Erledigt | `wifi.cpp` (`esp_wifi_set_ps`), [#1692](https://github.com/Attraccess/Attraccess/pull/1692) |
| Q2 | Verbindungszeit zu nicht erreichbaren Hosts mit `network_timeout_ms` begrenzen | Mittel / 1 Zeile / niedrig | Erledigt | 10 s in `connection.cpp` (der Bericht schlug 5 s vor), [#1692](https://github.com/Attraccess/Attraccess/pull/1692) |
| Q3 | `ws_tx` unter dem Render-Task laufen lassen | Mittel / trivial / niedrig | Erledigt | `TX_TASK_PRIORITY = 3` in `websocket.hpp`, Reconnects auf `ws_conn` mit Priorität 2, [#1692](https://github.com/Attraccess/Attraccess/pull/1692), ATT-554 |
| Q4 | Kürzerer NFC-Erkennungs-Poll und feinere `waitready`-Schritte | Hoch / niedrig / mittel | Erledigt | 30 ms und 2-ms-Schritte in `rfid.hpp` und `pn532/driver.cpp`, [#1693](https://github.com/Attraccess/Attraccess/pull/1693) |
| Q5 | LVGL-Refresh- und Touch-Rate senken | Mittel / trivial / niedrig-mittel | Erledigt (andere Werte) | Refresh 24 ms, Touch 10 ms statt der vorgeschlagenen 30 ms, [#1694](https://github.com/Attraccess/Attraccess/pull/1694) |
| Q6 | Heap-Einstellungen: PSRAM für WLAN/lwIP, niedrigeres `ALWAYSINTERNAL`, leichteres Heap-Poisoning | Hoch / sdkconfig / mittel | Teilweise erledigt | `ALWAYSINTERNAL` ist 1024 in `sdkconfig.defaults` (niedriger als die vorgeschlagenen 8192). WLAN-/lwIP-Allokation: [ATT-1276](https://linear.app/attraccess/issue/ATT-1276). Heap-Poisoning: verworfen, es ist ein Sicherheitsnetz, und keine Messung zeigt einen Grund, es abzuschwächen |
| Q7 | Connect-Task nur bei Zustandsänderung wecken | Niedrig / niedrig / niedrig | Offen | [ATT-1391](https://linear.app/attraccess/issue/ATT-1391) |
| Q8 | I2C-Takt-Kommentar klären (400 kHz gegen 100 kHz) | Niedrig / trivial / niedrig | Offen | Der Takt ist 400 kHz, aber der Kommentar in `utils.hpp` sagt noch, er sei zurückgenommen. [ATT-1392](https://linear.app/attraccess/issue/ATT-1392) |
| Q9 | Unbedingte serielle Ausgaben im NTAG424-Code abschalten | Niedrig / niedrig / niedrig | Verworfen | Der NTAG424-Code wurde aus der Firmware entfernt, als die Kartenprüfung auf den Server wanderte ([#2039](https://github.com/Attraccess/Attraccess/pull/2039), ATT-1145) |
| Q10 | Beobachtbarkeit: Laufzeitstatistik, `LOG_MEMORY_DEBUG`, PSRAM-Werte im Log | Hoch / niedrig / keins | Abgedeckt durch ATT-1276 | [ATT-1276](https://linear.app/attraccess/issue/ATT-1276) |

### Mittel

| ID | Empfehlung | Wirkung / Aufwand / Risiko | Status | Beleg oder Link |
|---|---|---|---|---|
| M1 | Kartenauthentifizierung und Beeps aus `lv_lock` herausnehmen | Hoch / mittel / mittel | Erledigt (andere Form) | Kartenarbeit läuft über das Karten-Relay des Servers und nicht mehr in `processState()`. Beeps sind asynchron (M6) |
| M2 | Präsenzprüfung einer aufliegenden Karte drosseln | Hoch / niedrig / niedrig | Teilweise erledigt | Auf 250 ms gedrosselt und auf einen Befehl reduziert ([#1693](https://github.com/Attraccess/Attraccess/pull/1693)). Die Prüfung ist jetzt bewusst schlüsselunabhängig, weil der Reader keine Kartenschlüssel hält; die alte AES-Auflage gilt damit nicht mehr. Karten, die auf die Prüfung nicht antworten: [ATT-1380](https://linear.app/attraccess/issue/ATT-1380) |
| M3 | String-Churn pro Durchlauf entfernen | Mittel / niedrig / niedrig | Offen | [ATT-1391](https://linear.app/attraccess/issue/ATT-1391) |
| M4 | Häufig genutzte Screens geladen halten | Mittel / mittel / niedrig-mittel | Erledigt | `shouldAutoUnload()` gibt für `lockscreen` und `initscreen` `false` zurück |
| M5 | LVGL-Performance-Monitor als Baseline-Werkzeug | Messung / trivial / keins | Abgedeckt durch ATT-1276 | Der Code-Pfad existiert (`ATTRACTAP_LV_PERF_MONITOR` in `lv_conf.h` und `display.cpp`), aber keine Build-Option setzt ihn bisher. Die Perf-Variante steckt in [ATT-1276](https://linear.app/attraccess/issue/ATT-1276) |
| M6 | Nicht blockierende Beeps | Mittel / mittel / niedrig | Erledigt | Beeper-Worker-Task mit Pattern-Queue in `beeper.cpp`, [#1695](https://github.com/Attraccess/Attraccess/pull/1695) |
| M7 | Serieller WLAN-Scan: Watchdog und kürzeres Limit | Mittel / niedrig / niedrig | Offen | [ATT-1390](https://linear.app/attraccess/issue/ATT-1390) |
| M8 | Einstellungen im RAM zwischenspeichern | Niedrig-mittel / niedrig / niedrig | Erledigt | `settings.cpp` hält API-Konfiguration und Sprache im Cache |

### Architektur-Ebene

| ID | Empfehlung | Wirkung / Aufwand / Risiko | Status | Beleg oder Link |
|---|---|---|---|---|
| A-1 | Jedes Bild nur einmal ablegen | Hoch / niedrig / niedrig | Erledigt | Rohe Bilddateien einmalig über `logos.S.in` gelinkt, [#1696](https://github.com/Attraccess/Attraccess/pull/1696) |
| A-2 | Deckenden Lockscreen als reines RGB565 neu exportieren | Mittel / niedrig-mittel / niedrig | Erledigt | `lockscreen.rgb565` (450 KB), [#1696](https://github.com/Attraccess/Attraccess/pull/1696). Die Logos behalten ihre Alpha-Ebene |
| A-3 | Fade-Übergang kürzen oder entfernen | Hoch / trivial / niedrig | Erledigt | `TRANSITION_ANIMATION = LV_SCR_LOAD_ANIM_NONE` in `display.hpp`, [#1694](https://github.com/Attraccess/Attraccess/pull/1694) |
| A-4 | Größerer oder doppelter Zeichenpuffer | Mittel-hoch / mittel / mittel | Erledigt | Zwei 480×240-Puffer im PSRAM, Partial-Modus. LVGL-Direct-Modus und asynchroner Flush wurden nicht verfolgt: Keine Messung verlangt sie, und die Anti-Drift-Arbeit (ATT-717) müsste neu validiert werden |
| A-5 | Eigener NFC-Task | Hoch / mittel-hoch / mittel-hoch | Offen | [ATT-1393](https://linear.app/attraccess/issue/ATT-1393). Erst messen: Der ATT-554-I2C-Hänger kam von gleichzeitiger Busnutzung |
| A-6 | I2C-Lock pro Transaktion statt pro Konversation | Hoch / mittel / mittel-hoch | Offen | [ATT-1393](https://linear.app/attraccess/issue/ATT-1393), gleiche Auflage wie A-5 |
| A-7 | Widgets wiederverwenden statt `lv_obj_clean` und Neuaufbau | Mittel / mittel-hoch / niedrig-mittel | Verworfen | Der Churn beschränkt sich auf Daten-Neuaufbauten, und der Pool wurde auf 128 KB verdoppelt (A-8). Keine Messung zeigt ein Problem |
| A-8 | Größerer LVGL-Pool oder PSRAM-Allokator, weniger Schriften | Mittel / mittel / mittel | Erledigt (Poolgröße) | `LV_MEM_SIZE` 128 KB in `lv_conf.h`, [#1694](https://github.com/Attraccess/Attraccess/pull/1694). Pool im PSRAM und weniger Schriften wurden nicht umgesetzt und sind nicht geplant |
| A-9 | Flash mit 120 MHz | Niedrig-mittel / mittel / hoch | Verworfen | Nicht empfohlen: experimentell, Chip- und Temperaturrisiko, wenig Gewinn bei CPU-gebundener Last |
| A-10 | `IRAM_ATTR`-Härtung für ISRs | Niedrig / mittel / mittel | Verworfen | Überholt: Der Code läuft aus dem PSRAM, der Cache bleibt beim Flash-Schreiben also an |

## Auf Hardware messen

Das alles gehört auf einen Bench-Reader, nicht auf einen produktiven. Nichts davon läuft automatisch in der CI.

1. **Debug-Build.** Mit dem Debug-Overlay: `idf.py -B build/dbg -DATTRACTAP_VARIANT=<variant> -DSDKCONFIG_DEFAULTS="sdkconfig.defaults;sdkconfig.debug" build`. Es stellt den Compiler auf `-Og` mit aktiven Assertions um, die absoluten Zeiten sind also nicht mit Release-Builds vergleichbar.
2. **LVGL-Performance-Monitor.** Der Code wird einkompiliert, wenn `ATTRACTAP_LV_PERF_MONITOR` definiert ist (`include/lv_conf.h`, `src/display/display.cpp`). Er loggt FPS sowie Render- und Flush-Zeiten auf die serielle Konsole. Keine Firmware-CMake-Option setzt das Makro heute; eine fertige Variante ist Teil von ATT-1276 (sobald gemergt).
3. **Laufzeitstatistik und `debug.stats`.** FreeRTOS-Laufzeitstatistik, der serielle Befehl `debug.stats` und PSRAM-Werte im Heap-Log werden in ATT-1276 verfolgt (sobald gemergt).
4. **Heap-Log.** Der WebSocket-Task loggt alle 30 Sekunden freien internen Heap, größten Block und Minimum (`Websocket::logHeapStats`). Das Minimum über 24 Stunden zeigt die Fragmentierung.
5. **Was vor und nach einer Änderung zu vergleichen ist:** Frame-Zeit mit dem Performance-Monitor, Touch-Latenz während eine Karte gepollt wird und während eine aufliegt, Latenz vom Antippen bis zum Ergebnis, Dauer eines Reconnect-Zyklus und das Minimum des internen Heaps.

## Historie

Die erste Fassung dieser Analyse schrieb im August 2026 Marcel Verdult in [Pull Request #1698](https://github.com/Attraccess/Attraccess/pull/1698). Die meisten ihrer Quick Wins wurden in den oben verlinkten Pull Requests umgesetzt.
