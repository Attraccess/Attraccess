# Attractap Lite LED Guide

The Attractap Lite is a compact RFID/NFC reader without a display. It uses a circular ring of 24 WS2812 LEDs to communicate device status and feedback. This guide explains what each LED pattern means so you can interpret the device state at a glance.

## Overview

The LED ring shows:

- **Persistent states** — Ongoing animations that reflect the current device mode
- **One-time triggers** — Brief flashes that indicate a specific event (success, error, or attention)

## LED States (Persistent Animations)

These animations run continuously while the device is in a given state.

| State | Color | Animation | Meaning |
|-------|-------|------------|---------|
| **Configuration Required** | Orange | Single dot moving around the ring (circular) or gentle pulsing (linear) | The device is not fully configured. Complete setup in Attraccess (e.g. connect to API, assign resources). |
| **Initializing** | Blue | Arc of 6 LEDs moving around the ring (circular) or gentle pulsing (linear) | The device is booting or connecting to the network and API. |
| **Ready / Wait for Card** | Green | Arc of 4–8 LEDs moving around the ring (circular) or gentle pulsing (linear) | The device is ready. Present an NFC card to authenticate. |
| **Authenticating** | Cyan | Single bright dot moving quickly around the ring (circular) or quick pulsing (linear) | A card is being read and authenticated. |
| **No Resources** | Orange | Alternating on/off flash of the ring | No resources are assigned to this device. Assign at least one resource in Attraccess. |
| **Firmware Update** | Rainbow | Rainbow colors cycling around the ring | A firmware update is in progress. Do not power off. |

## LED Triggers (One-Time Feedback)

These are short overlays that interrupt the current state animation for a few hundred milliseconds, then return to the previous state.

| Trigger | Color | Duration | Meaning |
|---------|-------|----------|---------|
| **Success** | Solid green | ~400 ms | Card authentication succeeded. Access granted. |
| **Error** | Red flashing | ~600 ms (3 flashes) | Authentication failed (invalid card, wrong key, or other error). |
| **Indicate** | Yellow flashing | ~400 ms | Card has been held on the reader for a long time. Remove the card and try again if needed. |

## Quick Reference

| What you see | What it means |
|--------------|---------------|
| Orange moving dot or pulsing | Configuration needed or no resources assigned |
| Blue arc or pulsing | Device is starting up or connecting |
| Green arc or pulsing | Ready — tap your card |
| Cyan moving dot or pulsing | Card is being read |
| Orange alternating flash | No resources assigned |
| Rainbow cycling | Firmware update in progress |
| Solid green flash | Success — access granted |
| Red flashing | Error — authentication failed |
| Yellow flashing | Card held too long — remove and retry |

## Hardware Notes

- **Attractap Lite** uses a 24-LED circular ring (`USE_CIRCULAR_LED_RING`) with circular animations.
- Other variants may use a linear strip with equivalent states but different animation styles (e.g. pulsing instead of moving arcs).
- LED behavior is only available on devices built with `HAS_WS2812_LED` (Attractap Lite Ethernet).
