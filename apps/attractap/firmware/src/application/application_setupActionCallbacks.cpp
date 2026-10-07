// Composition root: wires API/NFC/display callbacks, spawns tasks, runs loop
// FEATURE: application

#include "application.hpp"
#include "../serial/serialCommandHandler.hpp"
#include "platform.hpp"
#include <cstring>
#include <string>
#ifdef ESP_PLATFORM
#include "esp_heap_caps.h"
#include "esp_task_wdt.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#endif


void Application::setupActionCallbacks()
{
#ifdef HAS_LVGL_DISPLAY
  // Generic action result handling: stop overlay and show success toast
  this->api.setActionResultCallback([this](const API::ActionResult &result) {
    struct Payload { Application *self; API::ActionResult result; };
    auto *payload = new Payload{this, result};
    Display::asyncCall([](void *data) {
      auto *payload = static_cast<Payload *>(data);
      auto *self = payload->self;
      const auto &result = payload->result;
      if (self->unlocked && self->pendingUiAction == result.type && self->api.isCurrentResourceAction(result.requestId)) {
        self->finishReaderAction(result.success);
        if (result.success) {
          self->onActionResult(result.type);
          if (!result.billingTotal.empty()) {
            self->restartSessionTimeout();
            Display::showBillingSummary(result.billingTotal);
          }
        }
        else {
          self->handleFormsCancel();
          if (result.error == "INSUFFICIENT_BALANCE" && result.sumUpEnabled) {
            Display::showInsufficientBalancePopup([self](uint32_t cents) { self->api.requestBillingTopup(cents); }, [] {});
          } else {
            Display::showErrorPopup("Aktion fehlgeschlagen", result.error.empty() ? "Bitte erneut versuchen." : translateReaderError(result.error));
          }
        }
      }
      delete payload;
    }, payload);
  });
#endif

  this->api.setFirmwareUpdateMetaCallback([this](std::string availableVersion) {
    this->externalState = EXTERNAL_STATE_FIRMWARE_UPDATE;
    this->availableFirmwareVersion = availableVersion;
  });

  this->api.setFirmwareUpdateProgressCallback([this](int percent) {
    this->logger.debugf("Got firmware update pct %d", percent);
    this->externalState = EXTERNAL_STATE_FIRMWARE_UPDATE;
    this->firmwareUpdateProgressPct = percent;
  });

}
