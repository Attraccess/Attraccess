#!/usr/bin/env bash
# One-line camera snapshot: captures to a temp dir and prints the absolute path.
# Usage: ./scripts/snapshot.sh
# Output: /tmp/camera-snapshot-XXXXXX/frame.png (absolute path only, on success)
#
# Prerequisites: ffmpeg, fswebcam, or gstreamer1.0-tools

set -e

TEMP_DIR="$(mktemp -d -t camera-snapshot.XXXXXX)"
OUTPUT_FILE="${TEMP_DIR}/frame.png"
DEVICE="${1:-/dev/video0}"

capture_ffmpeg() {
  ffmpeg -y -f v4l2 -i "$DEVICE" -frames:v 1 -q:v 2 "$OUTPUT_FILE" 2>/dev/null || true
}

capture_fswebcam() {
  fswebcam -q -r 1280x720 --no-banner "$OUTPUT_FILE" 2>/dev/null || true
}

capture_gstreamer() {
  gst-launch-1.0 v4l2src device="$DEVICE" num-buffers=1 ! \
    videoconvert ! pngenc ! filesink location="$OUTPUT_FILE" 2>/dev/null || true
}

if command -v ffmpeg &>/dev/null; then
  capture_ffmpeg
elif command -v fswebcam &>/dev/null; then
  capture_fswebcam
elif command -v gst-launch-1.0 &>/dev/null; then
  capture_gstreamer
else
  echo "Error: No capture tool found. Install: ffmpeg, fswebcam, or gstreamer1.0-tools" >&2
  rmdir "$TEMP_DIR" 2>/dev/null || true
  exit 1
fi

if [[ -f "$OUTPUT_FILE" ]]; then
  echo "$(realpath "$OUTPUT_FILE")"
else
  echo "Error: Capture failed" >&2
  rmdir "$TEMP_DIR" 2>/dev/null || true
  exit 1
fi
