// Composition root: wires API/NFC/display callbacks, spawns tasks, runs loop
// FEATURE: application

#include "../application.hpp"
#include "../../serial/serialCommandHandler.hpp"
#include "../../platform.hpp"
#include <cstring>
#include <string>
#ifdef ESP_PLATFORM
#include "esp_heap_caps.h"
#include "esp_task_wdt.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#endif

void Application::setupApiCallbacks()
{
#ifdef HAS_LVGL_DISPLAY
  this->supervision.setup();
  this->api.onDeviceName(
      [this](std::string deviceName) { Display::setDeviceName(deviceName); });
#endif
#ifdef HAS_LVGL_DISPLAY
  this->api.setUsageStatsCallback([this](const API::UsageStats &stats) {
    lv_lock();
    if (this->unlocked && this->resourceIsSelected && stats.resourceId == this->selectedResourceId &&
        this->cardAuthenticationData.username == this->resourceList.authenticatedUsername)
      Display::resourceDetailsScreen.setUsageStats(stats);
    lv_unlock();
  });
#endif

  this->api.setResourceListUpdateCallback(
      [this](const API::ResourceList &resourceList) {
#ifdef HAS_LVGL_DISPLAY
        lv_lock();
        this->handleResourceListUpdate(resourceList);
        lv_unlock();
#else
        if (resourceList.count > 0) {
          this->selectedResourceId = resourceList.items[0].id;
          this->resourceIsDoor = resourceList.items[0].type == 1;
        }
#endif
      });

#ifdef HAS_WS2812_LED
  this->api.setLedBrightnessChangedCallback(
      [this](uint8_t brightness) { this->led.setBrightness(brightness); });
#endif

  this->api.setCardAuthenticationDetailsResponseCallback(
      [this](API::CardAuthenticationDetailsResponse response) {
#ifdef HAS_LVGL_DISPLAY
        if (!this->cardAuthenticationPending || this->unlocked) return;
#endif
        if (response.error.length() > 0) {
          this->logger.errorf("Authentication failed: %s",
                              response.error.c_str());
          this->beeper.errorBeep();
          this->nfc.enableCardDetection();
#ifdef HAS_LVGL_DISPLAY
          Display::asyncCall([](void *data) { static_cast<Application *>(data)->finishCardAuthentication(false); }, this);
#else
          this->externalState = EXTERNAL_STATE_AUTHENTICATE_CARD;
#endif
          return;
        }

        if (response.keyLen != 16) {
          this->logger.error("Invalid key bytes provided");
          this->beeper.errorBeep();
          this->nfc.enableCardDetection();
#ifdef HAS_LVGL_DISPLAY
          Display::asyncCall([](void *data) { static_cast<Application *>(data)->finishCardAuthentication(false); }, this);
#else
          this->externalState = EXTERNAL_STATE_AUTHENTICATE_CARD;
#endif
          return;
        }

        this->cardAuthenticationData = response;
#ifdef HAS_LVGL_DISPLAY
        if (this->currentProjectsUser != response.username) {
          this->clearProjectSelection();
        }
        this->currentProjectsUser = response.username;
        this->requestProjectsPage(1);
#endif

        this->externalState = EXTERNAL_STATE_AUTHENTICATE_CARD;
      });

}

// Composition root: wires API/NFC/display callbacks, spawns tasks, runs loop
// FEATURE: application

#ifdef ESP_PLATFORM
#include "esp_heap_caps.h"
#include "esp_task_wdt.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#endif

void Application::setupErrorCallbacks()
{
#ifdef HAS_LVGL_DISPLAY
  // Insufficient balance special-case (with SumUp capability flag)
  this->api.setInsufficientBalanceCallback([this](bool sumUpEnabled) {
    this->beeper.errorBeep();

    struct Payload {
      Application *self;
      bool enabled;
    };
    Payload *pl = new Payload{this, sumUpEnabled};
    if (!pl)
      return;
    Display::asyncCall(
        [](void *u) {
          auto *p = (Payload *)u;
          if (!p || !p->self) {
            if (p)
              delete p;
            return;
          }
          p->self->finishReaderAction(false);
          p->self->handleFormsCancel();
          Display::resourceDetailsScreen.hideActionProgress();
          if (p->enabled) {
            Display::showInsufficientBalancePopup(
                [self = p->self](uint32_t amountCents) {
                  self->api.requestBillingTopup(amountCents);
                },
                []() {});
          } else {
            Display::showErrorPopup("Fehler", translateReaderError("INSUFFICIENT_BALANCE"));
          }
          delete p;
        },
        pl);
  });
#endif

  // Generic error fallback for all other errors
  this->api.setErrorCallback([this](const char *title, const char *message) {
    this->beeper.errorBeep();

#ifdef HAS_LVGL_DISPLAY
    if (this->state == APPLICATION_STATE_LOCKED)
#else
    if (this->state == APPLICATION_STATE_WAIT_FOR_CARD)
#endif
    {
      this->nfc.enableCardDetection();
    }

#ifdef HAS_LVGL_DISPLAY
    // Ensure UI operations on LVGL thread
    struct ErrPayload {
      Application *self;
      std::string t;
      std::string m;
    };
    ErrPayload *p = new ErrPayload();
    if (!p)
      return;
    p->self = this;
    p->t = title;
    p->m = message;
    Display::asyncCall(
        [](void *u) {
          auto *pl = (ErrPayload *)u;
          if (!pl || !pl->self) {
            if (pl)
              delete pl;
            return;
          }
          if (pl->self->cardAuthenticationPending) pl->self->finishCardAuthentication(false);
          pl->self->finishReaderAction(false);
          pl->self->handleFormsCancel();
          Display::showErrorPopup(pl->t, pl->m);
          if (pl && pl->self) {
            pl->self->pendingActionType = PENDING_ACTION_NONE;
            pl->self->hasPendingFormRequest = false;
            pl->self->formFlowSubmitted = false;
            Display::resourceDetailsScreen.hideFormsModal();
          }
          delete pl;
        },
        p);
#endif
  });

}

// Composition root: wires API/NFC/display callbacks, spawns tasks, runs loop
// FEATURE: application

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

// Composition root: wires API/NFC/display callbacks, spawns tasks, runs loop
// FEATURE: application

#ifdef ESP_PLATFORM
#include "esp_heap_caps.h"
#include "esp_task_wdt.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#endif

void Application::setupDisplayCallbacks()
{
#ifdef HAS_LVGL_DISPLAY
  Display::resourceDetailsScreen.setButtonClickCallback(
      [this](ResourceDetailsScreen::ButtonClickEventData evt) {
        this->handleResourceDetailsButtonClick(evt);
      });

  Display::resourceDetailsScreen.setProjectsPageRequestCallback(
      [this](uint32_t page) { this->requestProjectsPage(page); });
  Display::resourceDetailsScreen.setProjectSelectionCallback(
      [this](uint32_t projectId, const std::string &projectName) {
        this->handleProjectSelection(projectId, projectName);
      });
  Display::resourceDetailsScreen.setFormPageNextCallback(
      [this](const API::FormPageSubmission &page) {
        this->handleFormPageNext(page);
      });
  Display::resourceDetailsScreen.setFormPageBackCallback(
      [this]() { this->handleFormPageBack(); });
  Display::resourceDetailsScreen.setFormsCancelCallback(
      [this]() { this->handleFormsCancel(); });

  Display::setPinScreen.setOnPinConfirmedCallback(
      [this](std::string pin) { Settings::setDevicePin(pin); });

  Display::connectionConfigurationScreen.setOnCancelPinLockCallback([this]() {
    Display::transitionToScreen(&Display::initScreen);
    this->state = APPLICATION_STATE_BOOT;
    this->api.enableConnectionAttempts();
  });

  Display::connectionConfigurationScreen.setOnSaveCallback(
      [this](const ConnectionConfigurationScreen::ConnectionConfig &cfg) {
        this->handleConnectionConfigurationSave(cfg);
      });

  Display::connectionConfigurationScreen.setOnResetCertificateCallback(
      [this]() { this->api.resetCertificateTrust(); });

#ifdef HAS_POWER_BUTTON
  Display::connectionConfigurationScreen.setOnPowerOffCallback(
      [this]() { this->ioExpander.powerOff(); });
#endif

  Display::initScreen.setOnOpenSettingsCallback([this]() {
#ifdef DEMO_MODE
    Display::transitionToScreen(&Display::demoSettingsScreen);
#else
    this->state = APPLICATION_STATE_CONFIGURATION_REQUIRED;
    this->api.disableConnectionAttempts();
    Display::connectionConfigurationScreen.enablePinLock();
    Display::transitionToScreen(&Display::connectionConfigurationScreen);
#endif
  });

  // Hidden maintenance drawer (pull down from the top edge)
  Display::setDrawerAvailableCallback([this]() {
    return !this->cardAuthenticationPending && this->pendingUiAction.empty() &&
           !this->waitingForResourceRefresh && !this->hasPendingFormRequest &&
           this->state != APPLICATION_STATE_SUPERVISION;
  });
  Display::setOnOpenSettingsCallback([this]() {
#ifdef DEMO_MODE
    Display::transitionToScreen(&Display::demoSettingsScreen);
#else
    this->state = APPLICATION_STATE_CONFIGURATION_REQUIRED;
    this->api.disableConnectionAttempts();
    Display::connectionConfigurationScreen.enablePinLock();
    Display::transitionToScreen(&Display::connectionConfigurationScreen);
#endif
  });

#ifdef DEMO_MODE
  Display::demoSettingsScreen.setStartScanCallback([this]() {
    this->demoPendingScanActive = true;
    this->demoPendingScanReady = false;
    this->nfc.resetCardPresence();
    this->nfc.enableCardDetection();
  });
  Display::demoSettingsScreen.setCancelScanCallback([this]() {
    this->demoPendingScanActive = false;
    this->demoPendingScanReady = false;
    this->nfc.disableCardDetection();
  });
#ifdef HAS_POWER_BUTTON
  Display::demoSettingsScreen.setPowerOffCallback(
      [this]() { this->ioExpander.powerOff(); });
#endif
#endif

  Display::resourceListScreen.setResourceSelectionCallback(
      [this](const API::ResourceBrief &resource) {
        if (!this->pendingUiAction.empty() || this->waitingForResourceRefresh || this->cardAuthenticationPending) return;
        this->returnToListAfterAction = false;
        this->selectResource(resource);
      });
  Display::resourceListScreen.setActionCallback([this](const API::ResourceBrief &resource, ResourceListAction action) {
    this->handleResourceListAction(resource, action);
  });
  Display::resourceListScreen.setLogoutCallback([this] { this->logoutReader(); });
  Display::lockscreen.setBackCallback([this] {
    if (this->cardAuthenticationPending) return;
    this->resourceIsSelected = false;
    this->selectedResourceId = 0;
  });

  Display::setTouchCallback(
      [this](int16_t x, int16_t y) { this->handleTouch(x, y); });

#endif
}
