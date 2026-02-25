#pragma once

/**
 * Loop timing instrumentation for debugging touch/UI lag.
 * Enable with -D DEBUG_LOOP_TIMING in build_flags.
 *
 * When a loop iteration exceeds LOOP_SLOW_THRESHOLD_MS, logs a breakdown
 * to Serial so you can identify which component is blocking.
 */
#if defined(DEBUG_LOOP_TIMING) && defined(HAS_LVGL_DISPLAY)

#include <Arduino.h>

#define LOOP_SLOW_THRESHOLD_MS 70

struct LoopTiming {
  uint32_t display_ms = 0;
  uint32_t serial_ms = 0;
  uint32_t nfc_ms = 0;
  uint32_t api_ms = 0;
  uint32_t processState_ms = 0;
  uint32_t total_ms = 0;

  void logIfSlow() {
    if (total_ms >= LOOP_SLOW_THRESHOLD_MS) {
      Serial.printf(
          "[LoopTiming] slow=%ums disp=%u ser=%u nfc=%u api=%u proc=%u\n",
          (unsigned)total_ms, (unsigned)display_ms, (unsigned)serial_ms,
          (unsigned)nfc_ms, (unsigned)api_ms, (unsigned)processState_ms);
    }
  }
};

inline uint32_t loopTimingNow() { return millis(); }

#else

struct LoopTiming {
  void logIfSlow() {}
};

inline uint32_t loopTimingNow() { return 0; }

#endif
