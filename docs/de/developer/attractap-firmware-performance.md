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
| PSRAM | Octal, 80 MHz. `malloc()` versucht nur bei Anforderungen bis 1 KB zuerst den internen RAM (`CONFIG_SPIRAM_MALLOC_ALWAYSINTERNAL`). Code und Nur-Lese-Daten laufen aus dem PSRAM (`CONFIG_SPIRAM_XIP_FROM_PSRAM`), der Cache bleibt also beim Schreiben des Flash an | `sdkconfig.defaults` |
| Panel | 480×480 RGB565, 12 MHz Pixeltakt (etwa 42 Hz, aus den Panel-Timings berechnet, nicht gemessen), ein PSRAM-Framebuffer plus zwei Bounce-Buffer mit je 16 Zeilen im internen DMA-RAM (etwa 30 KB) | `src/display/driver/gt911/rgb_gt911_driver.cpp` |
| LVGL | 9.3.0, Software-Rendering mit zwei Draw-Units (`LV_DRAW_SW_DRAW_UNIT_CNT`, eigene Zeichen-Threads von LVGL), Partial-Modus, zwei Zeichenpuffer mit 480×240 im PSRAM (Fallback: ein Puffer mit 480×20). Der Flush ist ein synchrones CPU-Kopieren in den Framebuffer | `main/idf_component.yml`, `include/lv_conf.h`, `src/display/display.cpp`, `src/display/display_input.cpp` |
| LVGL-Speicherpool | 128 KB, LVGLs eingebauter Allokator (`LV_STDLIB_BUILTIN`) | `include/lv_conf.h` |
| Refresh / Touch | Refresh alle 24 ms (`LV_DEF_REFR_PERIOD`); Touch wird alle 10 ms abgetastet; ein GT911-Poll ohne frischen Messwert behält den letzten Touch-Zustand bis zu 300 ms (`TOUCH_STALE_HOLD_MS`) | `include/lv_conf.h`, `src/display/display.cpp`, `src/display/driver/gt911/rgb_gt911_driver.hpp` |
| Screens | `lockscreen` und `initscreen` bleiben geladen. Alle anderen Screens werden beim Verlassen entladen, außer ein Screen, der unter einem kurzlebigen Screen (Status, Bestätigung, Formulare) geparkt ist; er bleibt geladen, bis der Benutzer zurückkehrt. Screen-Wechsel laufen ohne Animation | `src/display/screens/IScreen.hpp`, `src/display/display_router.cpp`, `src/display/display.hpp` |
| Bilder | Rohe `.rgb565`- und `.rgb565a8`-Dateien, einmalig über `logos.S.in` in den Nur-Lese-Speicher gelinkt. Die C++-Header sind je etwa 0,5 KB groß. Der Lockscreen ist ein 450 KB großes, deckendes RGB565-Bild; die beiden Logos behalten eine Alpha-Ebene | `src/display/images/`, `main/CMakeLists.txt` |
| FreeRTOS | 1-kHz-Tick. Main-Task: 18 KB Stack, Core 1. `LvglTask`: Priorität 4, Core 1, 12 KB. WebSocket-Client-Task: Priorität 3. `ws_tx`: Priorität 3. `ws_conn` (Verbinden und Wiederverbinden): Priorität 2. Beeper-Worker: Priorität 1 | `sdkconfig.defaults`, `src/display/display.cpp`, `src/websocket/` |
| I2C | Ein gemeinsamer Bus für PN532, GT911 und IO-Expander, 400 kHz, 50 ms Transfer-Timeout | `src/utils.hpp` |
| NFC-Polling | Auf der Main-Loop. Erkennungs-Poll-Timeout 30 ms (`NFC::detectionPollTimeoutMs`, gilt für jedes der beiden Bereitschafts-Waits eines Polls, ein Poll kann den Bus also bis zu etwa 60 ms halten), PN532-`waitready` in 2-ms-Schritten, aufliegende Karte wird alle 250 ms (`NFC::presenceCheckIntervalMs`) mit einem einfachen, nicht authentifizierten Befehl geprüft | `src/rfid/rfid.hpp`, `src/rfid/rfid.cpp`, `src/rfid/pn532/driver.cpp` |
| Kartenoperationen | Laufen über das Karten-Relay auf dem Server. Der Reader führt NTAG424-Authentifizierung und Schlüsselwechsel nicht mehr selbst aus | `src/application/card_relay.hpp` |
| WLAN | Modem-Sleep aus (`WIFI_PS_NONE`) | `src/network/wifi/wifi.cpp` |
| WebSocket | Client-Puffer 4096 Bytes, `network_timeout_ms` 10 s, TCP-Keepalive 5 s / 5 s / 3. Neuer Versuch alle 10 s, solange die Zertifikatsliste durchlaufen wird; nach einem gescheiterten Durchlauf oder einfachen Verbindungsversuch verdoppelt sich der Backoff (20 s, 40 s), höchstens 60 s. `ConnectWatchdog` erneuert die WLAN-Verbindung nach 30 s ohne Serververbindung und startet nach 90 s neu | `src/websocket/connection.cpp`, `src/websocket/websocket.hpp`, `src/websocket/connect_watchdog.hpp` |
| mbedTLS | Record-Puffer 8192 ein / 4096 aus. Standard-Builds legen den gesamten mbedTLS-Speicher im PSRAM an (`CONFIG_MBEDTLS_EXTERNAL_MEM_ALLOC`). Der Allokator des Secure-Profils legt nur die Record-Puffer in den PSRAM, Schlüssel, Kontexte und Handshake-Zustand in den internen RAM. TLS 1.3 ist in mbedTLS aktiviert; die Sitzung gekoppelter Reader ist darauf festgelegt und läuft in einem eigenen Task mit PSRAM-Stack, die äußere `wss://`-Verbindung handelt 1.2 oder 1.3 mit dem Server aus | `sdkconfig.defaults`, `sdkconfig.secure`, `src/api/security/tls_memory.c`, `src/api/security/session_tls.cpp` |
| Optimierung | `-O2` (`CONFIG_COMPILER_OPTIMIZATION_PERF`) in allen Produktions-Builds. Keine LTO-Option gesetzt. Kein `IRAM_ATTR` in `src/` | `sdkconfig.defaults` |

### Was sich seit August geändert hat und die Baseline verschiebt

- Gekoppelte Reader führen im WebSocket eine innere TLS-1.3-Sitzung aus (ATT-1207). Worker und Puffer liegen im PSRAM.
- Der BLE-Proxy (ATT-1033) startet NimBLE nur bei Bedarf und gibt es nach 30 s ohne BLE-Arbeit wieder frei. Er kostet also nur während der Nutzung etwa 24 KB internen RAM.
- Das RGB-Panel hält jetzt 16 Bounce-Zeilen im internen RAM und führt Code aus dem PSRAM aus, damit das Bild beim Flash-Schreiben ruhig bleibt (Display-Arbeit aus [#2260](https://github.com/Attraccess/Attraccess/pull/2260)).
- Die Kartenauthentifizierung ist auf den Server gewandert. Die Firmware enthält die NTAG424-Kryptografie nicht mehr, daher gelten mehrere alte Befunde dazu nicht mehr.
- Ein Connect-Watchdog (ATT-1366) begrenzt, wie lange der Reader offline bleibt: Er erneuert die WLAN-Verbindung und startet als letztes Mittel neu. Das deckelt die langen Reconnect-Zyklen, die der alte Bericht beschrieb.

### Befunde, die weiter gelten

- Das NFC-Polling läuft weiter auf der Main-Loop und hält den I2C-Bus pro Durchlauf bis zu etwa 60 ms (zwei Bereitschafts-Waits mit je 30 ms), [ATT-1393](https://linear.app/attraccess/issue/ATT-1393).
- `Websocket::loop()` kopiert weiter Strings und weckt den Connect-Task bei jedem Durchlauf (etwa einmal pro Millisekunde), [ATT-1391](https://linear.app/attraccess/issue/ATT-1391).
- Der serielle WLAN-Scan-Befehl blockiert die Main-Loop weiter bis zu 10 s, [ATT-1390](https://linear.app/attraccess/issue/ATT-1390).
- WebSocket-Textframes über dem 4096-Byte-Client-Puffer werden weiter als Fragmente weitergereicht, [ATT-1389](https://linear.app/attraccess/issue/ATT-1389).
- Einige Quellkommentare sind veraltet oder verweisen auf die alte Berichtsdatei, die nie in `main` gelandet ist, [ATT-1392](https://linear.app/attraccess/issue/ATT-1392).
- `LOG_MEMORY_DEBUG` ist nur für UI-Selftest-Lab-Builds definiert (`main/CMakeLists.txt`). Seine Stack-Werte liefert `debug.stats` auf Debug- und Lab-Builds.

## Empfehlungen

Die IDs stammen aus dem Bericht vom August. Wirkung, Aufwand und Risiko sind die ursprünglichen Schätzungen, keine Messwerte; „–“ heißt, der alte Bericht nannte keinen Wert. Ticket-Links führen zu Linear.

**Status-Legende:** Erledigt (eine Anmerkung in Klammern sagt, worin es vom Vorschlag abweicht), Teilweise erledigt, Offen, Verworfen.

### Quick Wins

| ID | Empfehlung | Wirkung / Aufwand / Risiko | Status | Beleg oder Link |
|---|---|---|---|---|
| Q1 | WLAN-Modem-Sleep ausschalten | Hoch / 1 Zeile / niedrig | Erledigt | `wifi.cpp` (`esp_wifi_set_ps`), [#1692](https://github.com/Attraccess/Attraccess/pull/1692) |
| Q2 | Verbindungszeit zu nicht erreichbaren Hosts mit `network_timeout_ms` begrenzen | Mittel / 1 Zeile / niedrig-mittel | Verworfen | Die Annahme war falsch: esp_websocket_client 1.5 setzt `network_timeout_ms` schon standardmäßig auf 10 s, die ausdrücklichen 10 s in `connection.cpp` ([#1692](https://github.com/Attraccess/Attraccess/pull/1692)) ändern also nichts. Lange Offline-Phasen begrenzt jetzt `ConnectWatchdog` (ATT-1366). Der irreführende Quellkommentar steht in [ATT-1392](https://linear.app/attraccess/issue/ATT-1392) |
| Q3 | `ws_tx` unter dem Render-Task laufen lassen | Mittel / trivial / niedrig | Erledigt | `TX_TASK_PRIORITY = 3` in `websocket.hpp`, Reconnects auf `ws_conn` mit Priorität 2, [#1692](https://github.com/Attraccess/Attraccess/pull/1692), ATT-554 |
| Q4 | Kürzerer NFC-Erkennungs-Poll und feinere `waitready`-Schritte | Hoch / niedrig / mittel | Erledigt | 30 ms in `rfid.hpp` ([#1693](https://github.com/Attraccess/Attraccess/pull/1693)), 2-ms-Schritte in `pn532/driver.cpp` ([#1691](https://github.com/Attraccess/Attraccess/pull/1691)) |
| Q5 | LVGL-Refresh- und Touch-Rate senken | Mittel / trivial / niedrig-mittel | Erledigt (nur Refresh) | Refresh 15 → 24 ms (`LV_DEF_REFR_PERIOD`; der Bericht schlug 30 ms vor). Touch hängt nicht mehr am Refresh und wurde bewusst schneller gemacht, alle 10 ms, für kürzere Tipp-Latenz (`display.cpp`), [#1694](https://github.com/Attraccess/Attraccess/pull/1694) |
| Q6 | Heap-Einstellungen: PSRAM für WLAN/lwIP, niedrigeres `ALWAYSINTERNAL`, leichteres Heap-Poisoning | Hoch / sdkconfig / mittel | Erledigt (nur `ALWAYSINTERNAL`) | `ALWAYSINTERNAL` ist 1024 in `sdkconfig.defaults` (der Bericht schlug 8192 vor), [#2260](https://github.com/Attraccess/Attraccess/pull/2260). WLAN/lwIP im PSRAM: verworfen, ein Hardware-A/B-Vergleich unter ATT-1276 zeigte keinen Gewinn an internem RAM und etwa 60 KB mehr PSRAM-Verbrauch ([#2290](https://github.com/Attraccess/Attraccess/pull/2290)). Heap-Poisoning: verworfen, die Annahme war falsch: Kein Build schaltet Poisoning ein (ESP-IDF-Standard ist aus), es gibt also nichts abzuschwächen |
| Q7 | Connect-Task nur bei Zustandsänderung wecken | Niedrig / niedrig / niedrig | Offen | [ATT-1391](https://linear.app/attraccess/issue/ATT-1391) |
| Q8 | I2C-Takt-Kommentar klären (400 kHz vs. 100 kHz) | Niedrig / trivial / niedrig | Offen | Der Takt ist 400 kHz, aber der Kommentar in `utils.hpp` sagt noch, er sei zurückgenommen. [ATT-1392](https://linear.app/attraccess/issue/ATT-1392) |
| Q9 | Unbedingte serielle Ausgaben im NTAG424-Code abschalten | Niedrig / niedrig / niedrig | Verworfen | Der NTAG424-Code wurde aus der Firmware entfernt, als die Kartenprüfung auf den Server wanderte ([#2039](https://github.com/Attraccess/Attraccess/pull/2039), ATT-1145) |
| Q10 | Beobachtbarkeit: Laufzeitstatistik, `LOG_MEMORY_DEBUG`, PSRAM-Werte im Log | Hoch / niedrig / kein | Erledigt (Debug- und Lab-Builds; ohne `LOG_MEMORY_DEBUG`) | FreeRTOS-Laufzeitstatistik in `sdkconfig.debug` und jedem Lab-Build mit Test-Hooks, der Befehl `debug.stats` (CPU-Anteil und Stack-Reserve je Task) und PSRAM im 30-s-Heap-Log, [#2290](https://github.com/Attraccess/Attraccess/pull/2290). `LOG_MEMORY_DEBUG` und PSRAM im Boot-Record gehören nicht dazu; `debug.stats` liefert die Stack-Werte, die `LOG_MEMORY_DEBUG` lieferte |

### Mittlerer Aufwand

| ID | Empfehlung | Wirkung / Aufwand / Risiko | Status | Beleg oder Link |
|---|---|---|---|---|
| M1 | Kartenauthentifizierung und Beeps aus `lv_lock` (LVGLs globaler Lock) herausnehmen | Hoch / mittel / mittel | Erledigt (andere Form) | Kartenarbeit läuft über das Karten-Relay des Servers (`cardRelay.loop()` in `src/application/application.cpp`), außerhalb von `lv_lock`; nur kurze UI-Updates nehmen den Lock. Beeps sind asynchron (M6) |
| M2 | Präsenzprüfung einer aufliegenden Karte drosseln | Hoch / niedrig / niedrig | Teilweise erledigt | Auf 250 ms gedrosselt ([#1693](https://github.com/Attraccess/Attraccess/pull/1693)) und auf einen Befehl reduziert ([#2039](https://github.com/Attraccess/Attraccess/pull/2039)). Die alte Auflage gilt weiter: Die Prüfung ist ein einfacher, nicht authentifizierter Befehl (der Reader hält keine Kartenschlüssel), daher hält jedes Gerät, das auf ISO-DEP antwortet, etwa ein Handy, die Karte als aufliegend. Eine authentifizierte Prüfung bräuchte den Server. Dies und Karten, die auf die Prüfung nicht antworten: [ATT-1380](https://linear.app/attraccess/issue/ATT-1380) |
| M3 | String-Kopien pro Durchlauf entfernen | Mittel / niedrig / niedrig | Offen | [ATT-1391](https://linear.app/attraccess/issue/ATT-1391) |
| M4 | Häufig genutzte Screens geladen halten | Mittel / mittel / niedrig-mittel | Erledigt | `shouldAutoUnload()` gibt in `src/display/screens/lockscreen/lockscreen.hpp` und `src/display/screens/init/initscreen.hpp` `false` zurück, [#1694](https://github.com/Attraccess/Attraccess/pull/1694) |
| M5 | LVGL-Performance-Monitor als Baseline-Werkzeug | Messung / trivial / kein | Erledigt | CMake-Option `-DATTRACTAP_LV_PERF_MONITOR=ON` (nur Display-Varianten), [#2290](https://github.com/Attraccess/Attraccess/pull/2290). Das Release-Gate weist damit gebaute Images ab |
| M6 | Nicht blockierende Beeps | Mittel / mittel / niedrig | Erledigt | Beeper-Worker-Task mit Pattern-Queue in `src/beeper/beeper.cpp`, [#1695](https://github.com/Attraccess/Attraccess/pull/1695) |
| M7 | Serieller WLAN-Scan: Watchdog und kürzeres Limit | Mittel / niedrig / niedrig | Offen | [ATT-1390](https://linear.app/attraccess/issue/ATT-1390) |
| M8 | Einstellungen im RAM zwischenspeichern | Niedrig-mittel / niedrig / niedrig | Erledigt | `src/settings/settings.cpp` hält API-Konfiguration und Sprache im Cache |

### Architektur-Ebene

| ID | Empfehlung | Wirkung / Aufwand / Risiko | Status | Beleg oder Link |
|---|---|---|---|---|
| A-1 | Jedes Bild nur einmal ablegen | Hoch / niedrig / niedrig | Erledigt | Rohe Bilddateien einmalig über `src/display/images/logos.S.in` gelinkt, [#1696](https://github.com/Attraccess/Attraccess/pull/1696), [#1816](https://github.com/Attraccess/Attraccess/pull/1816) |
| A-2 | Deckenden Lockscreen als reines RGB565 neu exportieren | – / mittel / niedrig-mittel | Erledigt | `lockscreen.rgb565` (450 KB), [#1696](https://github.com/Attraccess/Attraccess/pull/1696). Die Logos behalten ihre Alpha-Ebene |
| A-3 | Fade-Übergang kürzen oder entfernen | Hoch / trivial / niedrig | Erledigt | `TRANSITION_ANIMATION = LV_SCR_LOAD_ANIM_NONE` in `display.hpp`, [#1694](https://github.com/Attraccess/Attraccess/pull/1694) |
| A-4 | Größerer oder doppelter Zeichenpuffer | Mittel-hoch / mittel / mittel | Erledigt | Zwei 480×240-Puffer im PSRAM, Partial-Modus (`Display::setupFramebuffer` in `display.cpp`), [#1694](https://github.com/Attraccess/Attraccess/pull/1694). LVGL-Direct-Modus und asynchroner Flush wurden nicht verfolgt: Keine Messung verlangt sie, und die Anti-Drift-Arbeit am RGB-Panel (ATT-717) müsste neu validiert werden |
| A-5 | Eigener NFC-Task | Hoch / mittel-hoch / mittel-hoch | Offen | [ATT-1393](https://linear.app/attraccess/issue/ATT-1393). Erst messen: Der ATT-554-Hänger des I2C-Busses kam von gleichzeitiger Busnutzung |
| A-6 | I2C-Lock pro Transaktion statt pro Konversation | Hoch / mittel / mittel-hoch | Offen | [ATT-1393](https://linear.app/attraccess/issue/ATT-1393), gleiche Auflage wie A-5 |
| A-7 | Widgets wiederverwenden statt `lv_obj_clean` und Neuaufbau | Mittel / mittel-hoch / niedrig-mittel | Verworfen | Neuaufbauten beschränken sich auf Datenänderungen, und der Pool wurde auf 128 KB verdoppelt (A-8). Keine Messung zeigt ein Problem |
| A-8 | Größerer LVGL-Pool oder PSRAM-Allokator, weniger Schriften | Mittel / mittel / mittel | Erledigt (Poolgröße) | `LV_MEM_SIZE` 128 KB in `lv_conf.h`, [#1696](https://github.com/Attraccess/Attraccess/pull/1696). Pool im PSRAM und weniger Schriften wurden nicht umgesetzt und sind nicht geplant |
| A-9 | Flash mit 120 MHz | Niedrig-mittel / mittel / hoch | Verworfen | Nicht empfohlen: experimentell, Chip- und Temperaturrisiko, wenig Gewinn bei CPU-gebundener Last |
| A-10 | `IRAM_ATTR`-Härtung für ISRs | Niedrig / mittel / mittel | Verworfen | Überholt: Der Code läuft aus dem PSRAM, der Cache bleibt beim Flash-Schreiben also an |

## Auf Hardware messen

Das alles gehört auf einen Bench-Reader, nicht auf einen produktiven. Nichts davon läuft automatisch in der CI.

1. **Debug-Build.** Mit dem Debug-Overlay: `idf.py -B build/dbg -DATTRACTAP_VARIANT=<variant> -DSDKCONFIG_DEFAULTS="sdkconfig.defaults;sdkconfig.debug" build`. Es stellt den Compiler auf `-Og` mit aktiven Assertions um, die absoluten Zeiten sind also nicht mit Release-Builds vergleichbar.
2. **LVGL-Performance-Monitor.** Mit `-DATTRACTAP_LV_PERF_MONITOR=ON` bauen (nur Display-Varianten). Er loggt FPS sowie Render- und Flush-Zeiten auf die serielle Konsole (`include/lv_conf.h`, `src/display/display.cpp`).
3. **Laufzeitstatistik und `debug.stats`.** Debug-Builds und Builds mit `-DATTRACTAP_TEST_HOOKS=ON` haben die FreeRTOS-Laufzeitstatistik. `CMND debug.stats` auf der seriellen Konsole liefert je Task eine Zeile mit Laufzeit, CPU-Anteil, Stack-Reserve und Kern. Die Zähler laufen seit dem Boot, also zwei Messungen nehmen und vergleichen. Die Firmware-README („Task stats“) beschreibt die Ausgabe.
4. **Heap-Log.** `Websocket::loop()`, das auf der Main-Loop läuft, loggt alle 30 Sekunden freien internen Heap, größten Block und Minimum sowie freien PSRAM und dessen größten Block (`Websocket::logHeapStats`). Der größte freie Block zeigt die Fragmentierung; das Minimum des freien Heaps ist der Tiefstand seit dem Boot und fällt daher nur. Beides über 24 Stunden vergleichen.
5. **Was vor und nach einer Änderung zu vergleichen ist:** Frame-Zeit mit dem Performance-Monitor, Touch-Latenz während eine Karte gepollt wird und während eine aufliegt, Latenz vom Antippen bis zum Ergebnis, Dauer eines Reconnect-Zyklus und das Minimum des internen Heaps.

## Historie

Die erste Fassung dieser Analyse schrieb im August 2026 Marcel Verdult in [Pull Request #1698](https://github.com/Attraccess/Attraccess/pull/1698). Die meisten ihrer Quick Wins wurden in den oben verlinkten Pull Requests umgesetzt.
