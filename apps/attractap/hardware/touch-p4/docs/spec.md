# Specification, revision A

What the Attractap Touch P4 reader board is built to do, on one page. Figures come
from the design notes, which give their sources; revision A is not built yet, so
they are design values, not measurements.

## Function

A wall-mounted access and machine reader for Attraccess: it reads NFC cards and
tags, shows a touch screen, and talks to the Attraccess server over Wi-Fi or
Ethernet. One ESP32-P4 runs everything; the Wi-Fi module and the NFC chip are its
co-processors.

| Assembly version | Contains |
|---|---|
| wifi | everything except Ethernet and PoE |
| lan | everything, including Ethernet with PoE |

## Supply

Each source feeds the 5 V rail through a switch that blocks reverse current, so
any combination may be connected; the highest one feeds the board.

| Source | Range | Current drawn | Protection |
|---|---|---|---|
| DC, barrel jack 5.5/2.1 mm or WAGO terminal | 12 V or 24 V supplies: the converter starts between 8.5 and 9.4 V (R103/R113), so 12 V - 10 % runs it; up to 28 V continuously; the converter stands 35 V, 40 V for 0.4 s | typical 0.23 A at 12 V (2.8 W); at the board's highest consumption 0.45 A at 12 V, 0.23 A at 24 V | PTC fuse 1.1 A hold, bidirectional TVS at the connector, 100 V reverse-polarity diode, damped filter, TVS at the converter |
| PoE (lan version) | IEEE 802.3af powered device, 37 to 57 V at the jack (isolated module DP9900M-5V) | typical 3.4 W; at the board's highest consumption about 5.6 W | the module's isolation (1500 V test), TVS and ferrite beads at its input, 3 mm creepage on the board |
| USB-C (service) | 5 V, USB 2.0 port or Type-C source | at most 0.5 A when USB is the only source (firmware limit; estimated 0.43 A) | eFuse: soft start, 1.8 to 2.2 A limit, cut-off above 5.53 to 5.74 V and below 3.9 V, reverse blocking; ESD array |

The board's highest consumption at the 5 V rail is 0.90 A by the makers' maximum
figures (1.65 A by their supply-sizing figures), with two firmware limits: the
LEDs below 100 mA together, and no beep while the NFC field is on. Internal
rails: 3.3 V (TLV62569, 2 A, 36 % headroom at the sizing figures), 1.1 V core
(TLV62569, set by the MCU).

## Environment

| | |
|---|---|
| Use | indoors, on a wall or a machine; dry, non-condensing |
| Ambient temperature | 0 to 40 °C in operation. In the closed case at 40 °C on PoE the estimate puts the display at 62 °C (limit 70 °C) and the Wi-Fi module at 79 °C |
| Board | 86.0 x 143.5 mm, six layers, 1.6 mm, ENIG, components on one side; the display is taped to the other side 1.5 mm off the board |

## Interfaces

| Interface | Part | Details |
|---|---|---|
| Display and touch | 4.0" 480 x 480 panel, ST7701S, GT911 | RGB565 parallel, 40-pin flex; touch on I2C |
| NFC | PN532, PCB loop 35 x 37 mm, 4 turns | 13.56 MHz, ISO/IEC 14443 A (MIFARE); I2C to the MCU |
| Wi-Fi and Bluetooth LE | ESP32-C5-MINI-1 module (esp-hosted over SDIO) | Wi-Fi 6 on 2.4 GHz and 5 GHz (EU channels 36 to 64 indoors only, and 100 to 140), Bluetooth LE 5; the module's own PCB antenna in the board's top left corner |
| Ethernet (lan) | IP101GRI PHY, HY931147C jack with magnetics | 10/100 Mbit/s, RMII |
| USB-C | ESP32-P4 USB Serial/JTAG | flashing, console and debugging (USB 2.0 full speed) |
| Feedback | 8 RGB LEDs SK6812MINI-E, buzzer | the LEDs shine through the board around the NFC area |
| Tamper | LIS2DH12 accelerometer, VCNL4040 proximity sensor, DRV5032 hall switch | knocks and tilt, the reader leaving its dock |
| Service | RESET and BOOT buttons, UART0 and supply test points | inside the case |

## EMC, ESD and surge targets

The reader has radios, so the RED applies; the targets are those of EN 301 489-1
with parts 3 (NFC) and 17 (Wi-Fi), EN 55032 class B for emission, and EN 55035
for the Ethernet port ([compliance.md](compliance.md)).

| Test | Target | Where |
|---|---|---|
| Electrostatic discharge, IEC 61000-4-2 | 4 kV contact, 8 kV air, criterion B | everything that can be touched: glass and its edges, LED windows, seams, screws; the connectors' shells. Per-port protection: design notes, "ESD per port" |
| Radiated immunity | 3 V/m, 80 MHz to 6 GHz | whole reader |
| Fast transients, RF common mode | 0.5 kV; 3 V | Ethernet; the DC input when its cable may be longer than 3 m |
| Surge | 0.5 kV line to ground | Ethernet with indoor cables over 30 m. The DC input is built for EN 50130-4's line-to-earth surge through 42 ohm (simulated: 39.6 V at most at the converter, limit 40 V) |
| Conducted emission | class B, 150 kHz to 30 MHz | Ethernet; the DC input when its cable may be longer than 3 m |
| PoE isolation | 1500 V RMS for 60 s, or 2250 V DC, or ten 1.5 kV 10/700 us impulses (IEEE 802.3 §33.4.1) | jack contacts to the board's ground |
