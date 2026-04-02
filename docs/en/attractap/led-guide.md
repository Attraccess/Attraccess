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
| **Configuration Required** | Red / Orange | Three evenly-spaced dots alternating between red and orange (circular) or gentle orange pulsing (linear) | The device is not fully configured. Complete setup in Attraccess (e.g. connect to API, assign resources). |
| **Initializing** | Blue | Bright dot with 8-LED fading tail moving around the ring (circular) or gentle pulsing (linear) | The device is booting or connecting to the network and API. |
| **Ready / Wait for Card** | Green | Six alternating segments breathing in and out of phase (circular) or gentle pulsing (linear) | The device is ready. Present an NFC card to authenticate. |
| **Authenticating** | Cyan | Fast-moving dot with 6-LED fading tail (circular) or quick pulsing (linear) | A card is being read and authenticated. |
| **No Resources** | Orange | Alternating on/off flash of the entire ring | No resources are assigned to this device. Assign at least one resource in Attraccess. |
| **Firmware Update** | Blue / White | Static alternating blue and white pixels | A firmware update is in progress. Do not power off. |

## LED Triggers (One-Time Feedback)

These are short overlays that interrupt the current state animation for a few hundred milliseconds, then return to the previous state.

| Trigger | Color | Duration | Meaning |
|---------|-------|----------|---------|
| **Success** | Solid green | ~400 ms | Card authentication succeeded. Access granted. |
| **Error** | Red flashing | ~600 ms (3 flashes) | Authentication failed (invalid card, wrong key, or other error). |
| **Indicate** | Yellow flashing | ~400 ms (4 pulses) | Card has been held on the reader for a long time. Remove the card and try again if needed. |

## Quick Reference

| What you see | What it means |
|--------------|---------------|
| Red / orange alternating dots | Configuration needed |
| Blue dot with fading tail moving around | Device is starting up or connecting |
| Green breathing segments | Ready — tap your card |
| Cyan fast-moving dot with tail | Card is being read |
| Orange full-ring flash | No resources assigned |
| Alternating blue and white pixels (static) | Firmware update in progress |
| Solid green flash | Success — access granted |
| Red flashing | Error — authentication failed |
| Yellow flashing | Card held too long — remove and retry |

## Hardware Notes

- **Attractap Lite** uses a 24-LED circular ring (`USE_CIRCULAR_LED_RING`) with circular animations.
- Other variants may use a linear strip with equivalent states but different animation styles (e.g. pulsing instead of moving dots).
- LED behavior is only available on devices built with `HAS_WS2812_LED` (Attractap Lite Ethernet).
