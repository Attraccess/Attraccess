# CE compliance checklist

A PCB cannot be "CE conform" on its own: the CE mark applies to the finished
reader (board, display, enclosure, power supply, firmware and documents). This
page lists what applies and what the board design already does for it.

It is a working checklist compiled in November 2026, not legal advice. Confirm
standards, versions and test scope with the test lab before quoting.

## Which rules apply

| Rule | Applies | Notes |
|---|---|---|
| Radio Equipment Directive 2014/53/EU (RED) | yes | The reader contains radios: Wi-Fi/Bluetooth (wifi and lan version) and the 13.56 MHz NFC reader (always). RED covers safety and EMC as well, so there is no separate LVD or EMC declaration. |
| RED cybersecurity, Delegated Regulation (EU) 2022/30 | yes | In force since 1 August 2025 for internet-connected radio equipment. It is repealed from 11 December 2027, when the Cyber Resilience Act takes over. |
| Cyber Resilience Act (EU) 2024/2847 | yes | Vulnerability reporting duties from 11 September 2026, full application 11 December 2027. Access control readers are listed as "important products, class I" (Implementing Regulation (EU) 2025/2392). |
| RoHS 2011/65/EU, REACH | yes | Collect supplier declarations for all parts and the PCB. |
| WEEE / ElektroG | yes | Register with stiftung ear before selling in Germany. |
| USB-C common charger rule (EU) 2022/2380 | no | Only covers listed portable device categories. |

## Standards usually applied

| Aspect | Standard | Covers |
|---|---|---|
| Radio, 2.4 GHz | EN 300 328 | Wi-Fi and Bluetooth LE |
| Radio, 13.56 MHz | EN 300 330 | NFC reader |
| EMC | EN 301 489-1, -3 (NFC), -17 (Wi-Fi/BLE) | plus EN 55032 / EN 55035 for the Ethernet port, as the lab decides |
| Safety | EN IEC 62368-1 | PoE, DC and USB supply, enclosure, temperature |
| RF exposure | EN IEC 62311 | low-power assessment |
| Cybersecurity | EN 18031-1 (network), EN 18031-2 (personal data) | self-declaration is only possible if the standard is met without its listed restrictions, for example no option to run without a password |

Not verified: the exact harmonised versions at the time of testing, and the
surge and ESD levels the lab will apply to the Ethernet port.

## What the pre-certified Wi-Fi module saves

The ESP32-C6-MINI-1 has RED certificates (Espressif, December 2025). They do
not transfer to the reader: the manufacturer of the reader still declares
conformity of the whole product. In practice the lab can reuse the module's
conducted radio results if the module is used as its datasheet says (unchanged
antenna, keep-out respected; with the MINI-1U only an antenna type and gain
that its certificate lists), and tests radiated spurious emissions, EMC and
safety on the finished reader. The NFC radio has no such shortcut and is tested
in full.

## What the board design does

| Topic | Measure on the board |
|---|---|
| Wi-Fi antenna | Module at the board edge above the display, copper-free keep-out under the antenna on all layers. |
| Return paths | Solid ground plane on layer 2 under all signals. Layer 3 is a 3.3 V pour that also carries signal tracks; it is kept free of tracks under the MCU. |
| Switching regulators | AP63203 with spread spectrum; small loops, input and output capacitors next to the ICs. |
| Display bus | 33 ohm series resistors on all RGB and sync lines; reduce GPIO drive strength in firmware if needed. |
| Clocks | Series resistors on the 50 MHz RMII clock, the SDIO clock and the flash clock. |
| USB | TVS and ESD array at the connector, PTC fuse, ferrite bead in the supply. |
| Ethernet / PoE | Isolated PD module, 48 V side kept in its own area with 2 mm clearance, ferrite beads and TVS at the PoE input, capacitor across the barrier, RC from jack shield to ground. |
| NFC | EMC low-pass (560 nH / 220 pF) between transmitter and antenna, damping resistors, no closed copper ring around the loop. |
| DC input | PTC fuse, reverse-polarity diode and TVS before the converter; converter with spread spectrum, placed away from the NFC antenna. The DC run does not go around the NFC loop. |
| Supply faults | USB, DC and PoE are diode-ORed, so no source feeds another. |
| Mounting | No tracks under screw heads on the outer layers. |

## Open points for the product

- Enclosure material and flammability rating (EN 62368-1), creepage around the
  PoE area inside the enclosure.
- External supply: the manual has to require a limited power source for the
  DC input (12 V or 24 V). USB is a service port and is not offered to users. Decide whether a supply
  is sold with the reader; if so it is part of the tested product.
- DC cable length: long DC cables can bring fast-transient and surge tests on
  that port. State the allowed length and ask the lab what follows from it.
- User documentation: frequency bands and maximum RF power, manufacturer
  address, safety notes in German, declaration of conformity (or the short form
  with a link).
- Type label with CE mark, model, serial number and the crossed-out bin symbol.
- Cybersecurity: secure boot and flash encryption on the ESP32-P4 (RSA), signed
  firmware updates, no default credentials, a documented support period and a
  process for vulnerability reports. The co-processor firmware on the ESP32-C6
  is part of the product and needs the same update process.
- Technical file: schematics, layout, BOM, test reports, risk assessment,
  software bill of materials.

## Test lab

Ask two or three accredited labs for a quote and name the exact configuration:
ESP32-C6-MINI-1 module (and the MINI-1U with the chosen external antenna, if
that version is sold), NFC reader with PCB antenna, Ethernet with PoE, DC
supply, both assembly versions. Testing the lan version with Wi-Fi fitted
usually covers the wifi version as the simpler case; confirm that with the lab.
