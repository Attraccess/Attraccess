#!/usr/bin/env bash
# Capture a frame from the USB camera for visual debugging.
# The AI assistant can read the output image to "see" what the camera sees.
#
# Prerequisites: Install one of these (Ubuntu/Debian):
#   sudo apt install ffmpeg        # Recommended
#   sudo apt install fswebcam     # Alternative
#   sudo apt install gstreamer1.0-tools  # Alternative

set -e

OUTPUT_DIR="${1:-camera-debug}"
OUTPUT_FILE="${OUTPUT_DIR}/frame.png"
DEVICE="${2:-/dev/video0}"

mkdir -p "$OUTPUT_DIR"

capture_ffmpeg() {
  ffmpeg -y -f v4l2 -i "$DEVICE" -frames:v 1 -q:v 2 "$OUTPUT_FILE" 2>/dev/null
}

capture_fswebcam() {
  fswebcam -q -r 1280x720 --no-banner "$OUTPUT_FILE" 2>/dev/null
}

capture_gstreamer() {
  gst-launch-1.0 v4l2src device="$DEVICE" num-buffers=1 ! \
    videoconvert ! pngenc ! filesink location="$OUTPUT_FILE" 2>/dev/null
}

if command -v ffmpeg &>/dev/null; then
  echo "Capturing with ffmpeg..."
  capture_ffmpeg
elif command -v fswebcam &>/dev/null; then
  echo "Capturing with fswebcam..."
  capture_fswebcam
elif command -v gst-launch-1.0 &>/dev/null; then
  echo "Capturing with GStreamer..."
  capture_gstreamer
else
  echo "Error: No capture tool found. Install one of:"
  echo "  sudo apt install ffmpeg"
  echo "  sudo apt install fswebcam"
  echo "  sudo apt install gstreamer1.0-tools"
  exit 1
fi

echo "Saved to: $OUTPUT_FILE"
echo "The AI can now read this image for visual debugging."
