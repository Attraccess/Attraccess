// Persistent boot/crash diagnostics: NVS boot record + periodic heap snapshot.
// Split out of application.cpp to keep the god class modular (see ATT-424).

#include "application.hpp"
#include "../state/state.hpp"
#include "../platform.hpp"
#include "../api/diagnostics/reset-reason.hpp"
#include "../api/diagnostics/crash-record.hpp"
#ifdef ESP_PLATFORM
#include "../api/diagnostics/crash-report.hpp"
#include <cstdio>
#include <cstring>
#include "esp_heap_caps.h"
#include "esp_system.h"
#endif

#define BOOT_DIAG_SNAPSHOT_INTERVAL_MS 60000
#define BOOT_DIAG_SILENT_HANG_MIN_UPTIME_MS 60000


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
    // Watchdog / panic-class resets => the firmware died -> crash-loop.
    // A clean POWERON after a long pre-freeze uptime => the device hung and
    // had to be power-cycled by hand -> silent hang.
    bool isCrash = crashResetIsCrash((uint8_t)reason);
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
        crashResetReasonToString((uint8_t)reason), prior.uptimeMs, prior.freeInternalHeap,
        prior.largestFreeBlock, prior.websocketConnected, prior.wifiConnected,
        failureClass);

    bool shouldReport = isCrash ||
                        (reason == ESP_RST_POWERON &&
                         prior.uptimeMs > BOOT_DIAG_SILENT_HANG_MIN_UPTIME_MS);
    this->bootDiagPreferences.begin(BOOT_DIAG_NAMESPACE, false);
    if (shouldReport) {
      static_assert(sizeof(BootDiagnostics_t) == sizeof(CrashBootRecord),
                    "the pending crash record embeds the boot record");
      PendingCrashBootRecord pending = {};
      memcpy(&pending.record, &prior, sizeof(prior));
      pending.resetReason = (uint8_t)reason;
      pending.version = BOOT_DIAG_PENDING_VERSION;
      pending.phase = (uint8_t)CrashUploadPhase::MetadataPending;
      // The image that crashed is still the one running: the report keeps its
      // version even when an OTA update lands before the upload.
      snprintf(pending.firmwareVersion, sizeof(pending.firmwareVersion), "%s",
               FIRMWARE_VERSION);

      // Tie the dump to this crash only when this crash wrote it (ATT-1144).
      // A dump an earlier record already claimed stays with that one.
      const CrashDumpFingerprint dump = crashFlashDumpFingerprint();
      CrashDumpFingerprint claimed = {};
      if (this->bootDiagPreferences.getBytes(BOOT_DIAG_DUMP_CLAIMED_KEY, &claimed,
                                             sizeof(claimed)) != sizeof(claimed)) {
        claimed = {};
      }
      if (crashupload::shouldAttachDump(isCrash, dump, claimed)) {
        pending.dump = dump;
        this->bootDiagPreferences.putBytes(BOOT_DIAG_DUMP_CLAIMED_KEY, &dump,
                                           sizeof(dump));
        this->logger.infof("Coredump of this crash: %u bytes", (unsigned)dump.size);
      } else if (dump.present()) {
        this->logger.infof("Coredump in flash (%u bytes) is not from this reset",
                           (unsigned)dump.size);
      }

      // Preserve actual failures for upload after the next successful connect
      // (ATT-474) as one blob so its reset reason cannot be paired with a
      // different snapshot after a partial NVS write.
      this->bootDiagPreferences.putBytes(BOOT_DIAG_PENDING_KEY, &pending,
                                         sizeof(pending));
      this->bootDiagPreferences.remove(BOOT_DIAG_PENDING_REASON_KEY);
    } else if (reason == ESP_RST_SW) {
      // The reset is intentionally ignored. Keep a prior unacknowledged crash,
      // but discard this reboot's marker so it cannot relabel that crash.
      this->bootDiagPreferences.remove(BOOT_DIAG_REBOOT_REASON_KEY);
    }
    this->bootDiagPreferences.end();
  } else {
    this->logger.infof("No prior boot record (reset=%s)",
                       crashResetReasonToString((uint8_t)reason));
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
