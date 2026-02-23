---
name: camera-visual-debug
description: Capture a snapshot from the USB camera to visually debug the ESP32 touchscreen device placed in front of it. Use when the user asks to see the device, take a snapshot, visually debug the display, or when you need to inspect what is shown on the ESP32 touchscreen.
---

# Camera Visual Debug for ESP32 Touchscreen

The ESP32 touchscreen device is positioned in front of a USB camera. Use this workflow to capture what the camera sees and analyze the display.

## Workflow

1. **Capture a snapshot**:
   ```bash
   ./scripts/snapshot.sh
   ```
   On success, the script outputs only the absolute path of the image (e.g. `/tmp/camera-snapshot.XXXXXX/frame.png`).

2. **Read the image** using the path from step 1 to analyze the display, verify UI state, or debug visual issues.

## Prerequisites

One of: `ffmpeg`, `fswebcam`, or `gstreamer1.0-tools` (Ubuntu: `sudo apt install ffmpeg`).

## Optional: Different camera device

If the camera is not `/dev/video0`:
```bash
./scripts/snapshot.sh /dev/video1
```
