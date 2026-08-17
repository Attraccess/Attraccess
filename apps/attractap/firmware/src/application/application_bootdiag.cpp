// Persistent boot/crash diagnostics: NVS boot record + periodic heap snapshot.
// Split out of application.cpp to keep the god class modular (see ATT-424).

#include "application.hpp"
#include "../state/state.hpp"
#include "platform.hpp"
#ifdef ESP_PLATFORM
#include "esp_heap_caps.h"
#include "esp_system.h"
#endif

#define BOOT_DIAG_NAMESPACE "bootdiag"
#define BOOT_DIAG_MAGIC 0x41545431
#define BOOT_DIAG_SNAPSHOT_INTERVAL_MS 60000
#define BOOT_DIAG_SILENT_HANG_MIN_UPTIME_MS 60000

#ifdef ESP_PLATFORM
static const char *resetReasonToString(esp_reset_reason_t reason) {
  switch (reason) {
  case ESP_RST_POWERON:
    return "POWERON";
  case ESP_RST_EXT:
    return "EXT";
  case ESP_RST_SW:
    return "SW";
  case ESP_RST_PANIC:
    return "PANIC";
  case ESP_RST_INT_WDT:
    return "INT_WDT";
  case ESP_RST_TASK_WDT:
    return "TASK_WDT";
  case ESP_RST_WDT:
    return "WDT";
  case ESP_RST_DEEPSLEEP:
    return "DEEPSLEEP";
  case ESP_RST_BROWNOUT:
    return "BROWNOUT";
  case ESP_RST_SDIO:
    return "SDIO";
  default:
    return "UNKNOWN";
  }
}
#endif

void Application::setupBootDiagnostics() {
#ifdef ESP_PLATFORM
  BootDiagnostics_t prior = {};
  this->bootDiagPreferences.begin(BOOT_DIAG_NAMESPACE, true);
  size_t read =
      this->bootDiagPreferences.getBytes("record", &prior, sizeof(prior));
  this->bootDiagPreferences.end();

  esp_reset_reason_t reason = esp_reset_reason();
  bool havePrior = (read == sizeof(prior) && prior.magic == BOOT_DIAG_MAGIC);

  if (havePrior) {
    // TASK_WDT / SW / panic-class resets => the firmware died -> crash-loop.
    // A clean POWERON after a long pre-freeze uptime => the device hung and
    // had to be power-cycled by hand -> silent hang.
    bool isCrash = (reason == ESP_RST_PANIC || reason == ESP_RST_TASK_WDT ||
                    reason == ESP_RST_INT_WDT || reason == ESP_RST_WDT ||
                    reason == ESP_RST_SW);
    const char *failureClass = "clean/other";
    if (isCrash) {
      failureClass = "crash-loop";
    } else if (reason == ESP_RST_POWERON &&
               prior.uptimeMs > BOOT_DIAG_SILENT_HANG_MIN_UPTIME_MS) {
      failureClass = "silent-hang";
    }

    this->logger.errorf(
        "Prior boot: reset=%s uptime=%ums freeHeap=%u largestBlock=%u ws=%d "
        "wifi=%d -> %s",
        resetReasonToString(reason), prior.uptimeMs, prior.freeInternalHeap,
        prior.largestFreeBlock, prior.websocketConnected, prior.wifiConnected,
        failureClass);

    // Preserve the prior session's last snapshot as a pending crash report so
    // the API layer can upload it on the next successful connect (ATT-474).
    // The live "record" key is overwritten with the current session just below.
    this->bootDiagPreferences.begin(BOOT_DIAG_NAMESPACE, false);
    this->bootDiagPreferences.putBytes("pending", &prior, sizeof(prior));
    this->bootDiagPreferences.end();
  } else {
    this->logger.infof("No prior boot record (reset=%s)",
                       resetReasonToString(reason));
  }

  BootDiagnostics_t current = {
      .magic = BOOT_DIAG_MAGIC,
      .resetReason = (uint8_t)reason,
      .uptimeMs = (uint32_t)millis(),
      .freeInternalHeap = (uint32_t)heap_caps_get_free_size(MALLOC_CAP_INTERNAL),
      .largestFreeBlock =
          (uint32_t)heap_caps_get_largest_free_block(MALLOC_CAP_INTERNAL),
      .websocketConnected = State::getWebsocketState().connected,
      .wifiConnected = State::getNetworkState().wifi_connected,
  };
  this->bootDiagPreferences.begin(BOOT_DIAG_NAMESPACE, false);
  this->bootDiagPreferences.putBytes("record", &current, sizeof(current));
  this->bootDiagPreferences.end();
  this->lastBootSnapshotMs = millis();
#endif
}

void Application::snapshotBootDiagnostics() {
#ifdef ESP_PLATFORM
  uint32_t now = millis();
  if (now - this->lastBootSnapshotMs < BOOT_DIAG_SNAPSHOT_INTERVAL_MS) {
    return;
  }
  this->lastBootSnapshotMs = now;

  BootDiagnostics_t rec = {
      .magic = BOOT_DIAG_MAGIC,
      .resetReason = (uint8_t)esp_reset_reason(),
      .uptimeMs = now,
      .freeInternalHeap = (uint32_t)heap_caps_get_free_size(MALLOC_CAP_INTERNAL),
      .largestFreeBlock =
          (uint32_t)heap_caps_get_largest_free_block(MALLOC_CAP_INTERNAL),
      .websocketConnected = State::getWebsocketState().connected,
      .wifiConnected = State::getNetworkState().wifi_connected,
  };
  this->bootDiagPreferences.begin(BOOT_DIAG_NAMESPACE, false);
  this->bootDiagPreferences.putBytes("record", &rec, sizeof(rec));
  this->bootDiagPreferences.end();
#endif
}
