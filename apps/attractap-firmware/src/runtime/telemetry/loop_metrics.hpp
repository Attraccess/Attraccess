#pragma once

#include <Arduino.h>
#include <algorithm>

#if defined(PERF_BASELINE_METRICS) && defined(HAS_LVGL_DISPLAY)

struct LoopBucketDurations {
  uint32_t display_ms = 0;
  uint32_t serial_ms = 0;
  uint32_t nfc_ms = 0;
  uint32_t api_ms = 0;
  uint32_t process_state_ms = 0;
  uint32_t total_ms = 0;
};

class LoopMetricsWindow {
public:
  LoopMetricsWindow() { this->reset(millis()); }

  void record(const LoopBucketDurations &d) {
    if (this->sample_count < WINDOW_SAMPLE_CAPACITY) {
      this->total_samples[this->sample_count] = d.total_ms;
      this->display_samples[this->sample_count] = d.display_ms;
    }
    this->sample_count++;
    this->sum_total_ms += d.total_ms;
    this->max_total_ms = max(this->max_total_ms, d.total_ms);
    this->max_display_ms = max(this->max_display_ms, d.display_ms);
    this->max_serial_ms = max(this->max_serial_ms, d.serial_ms);
    this->max_nfc_ms = max(this->max_nfc_ms, d.nfc_ms);
    this->max_api_ms = max(this->max_api_ms, d.api_ms);
    this->max_process_state_ms =
        max(this->max_process_state_ms, d.process_state_ms);
  }

  void maybeLogAndReset(uint32_t now_ms) {
    const uint32_t window_ms = now_ms - this->window_start_ms;
    if (window_ms < 5000 || this->sample_count == 0) {
      return;
    }

    const uint32_t bounded_count =
        min(this->sample_count, (uint32_t)WINDOW_SAMPLE_CAPACITY);
    const uint32_t avg_total_ms =
        (uint32_t)(this->sum_total_ms / max(this->sample_count, (uint32_t)1));
    const uint32_t total_p95_ms =
        this->computePercentile(this->total_samples, bounded_count, 95);
    const uint32_t total_p99_ms =
        this->computePercentile(this->total_samples, bounded_count, 99);
    const uint32_t display_p95_ms =
        this->computePercentile(this->display_samples, bounded_count, 95);

    Serial.printf(
        "PERF,window_ms=%u,samples=%u,total_avg_ms=%u,total_p95_ms=%u,"
        "total_p99_ms=%u,total_max_ms=%u,display_p95_ms=%u,display_max_ms=%u,"
        "serial_max_ms=%u,nfc_max_ms=%u,api_max_ms=%u,process_max_ms=%u\n",
        (unsigned)window_ms, (unsigned)this->sample_count, (unsigned)avg_total_ms,
        (unsigned)total_p95_ms, (unsigned)total_p99_ms,
        (unsigned)this->max_total_ms, (unsigned)display_p95_ms,
        (unsigned)this->max_display_ms, (unsigned)this->max_serial_ms,
        (unsigned)this->max_nfc_ms, (unsigned)this->max_api_ms,
        (unsigned)this->max_process_state_ms);

    this->reset(now_ms);
  }

private:
  static constexpr size_t WINDOW_SAMPLE_CAPACITY = 256;
  uint32_t window_start_ms = 0;
  uint32_t sample_count = 0;
  uint64_t sum_total_ms = 0;
  uint32_t max_total_ms = 0;
  uint32_t max_display_ms = 0;
  uint32_t max_serial_ms = 0;
  uint32_t max_nfc_ms = 0;
  uint32_t max_api_ms = 0;
  uint32_t max_process_state_ms = 0;
  uint16_t total_samples[WINDOW_SAMPLE_CAPACITY] = {0};
  uint16_t display_samples[WINDOW_SAMPLE_CAPACITY] = {0};

  uint32_t computePercentile(uint16_t *samples, uint32_t count,
                             uint32_t percentile) {
    if (count == 0) {
      return 0;
    }
    std::sort(samples, samples + count);
    uint32_t idx = (count - 1) * percentile / 100;
    if (idx >= count) {
      idx = count - 1;
    }
    return samples[idx];
  }

  void reset(uint32_t now_ms) {
    this->window_start_ms = now_ms;
    this->sample_count = 0;
    this->sum_total_ms = 0;
    this->max_total_ms = 0;
    this->max_display_ms = 0;
    this->max_serial_ms = 0;
    this->max_nfc_ms = 0;
    this->max_api_ms = 0;
    this->max_process_state_ms = 0;
  }
};

#endif
