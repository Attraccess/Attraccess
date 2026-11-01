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
      [this](std::string deviceName) {
#ifdef DEMO_MODE
        // The demo transport owns its built-in name; supplied names stay literal.
        Display::setDemoDeviceName();
#else
        Display::setDeviceName(deviceName);
#endif
      });
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
          State::setUserLanguage(false);
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
          State::setUserLanguage(false);
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
        // Through the screen, so the refresh keeps the active search and stays the request it awaits.
        lv_lock();
        Display::projectSelectScreen.refreshProjects();
        lv_unlock();
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
            p->self->openTopUp();
          } else {
            p->self->showStatus(StatusScreen::warning(FirmwareI18n::Message::InsufficientBalance, FirmwareI18n::readerError("INSUFFICIENT_BALANCE")));
          }
          delete p;
        },
        pl);
  });
#endif

  // Errors the server reports for events that have no result callback of their own. `eventType`
  // is the event that carried the error; only errors that belong to something on screen get UI.
  this->api.setErrorCallback([this](const char *eventType, const char *code) {
#ifdef HAS_LVGL_DISPLAY
    this->logger.errorf("Reader error on %s: %s", eventType, code);
    struct ErrPayload {
      Application *self;
      std::string eventType;
      std::string code;
    };
    auto *p = new ErrPayload{this, eventType, code};
    Display::asyncCall(
        [](void *u) {
          auto *pl = static_cast<ErrPayload *>(u);
          pl->self->handleReaderError(pl->eventType, pl->code);
          delete pl;
        },
        p);
#else
    this->logger.errorf("Reader error on %s: %s", eventType, code);
    this->beeper.errorBeep();
    if (this->state == APPLICATION_STATE_WAIT_FOR_CARD) {
      this->nfc.enableCardDetection();
    }
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
  // Action results: the completion, billing or failure screen, or the error on the button.
  this->api.setActionResultCallback([this](const API::ActionResult &result) {
    struct Payload { Application *self; API::ActionResult result; };
    auto *payload = new Payload{this, result};
    Display::asyncCall([](void *data) {
      auto *payload = static_cast<Payload *>(data);
      auto *self = payload->self;
      const auto &result = payload->result;
      // While a usage form is open the server refuses its fields or pages as a START error
      // without a request id, also in stop flows: that is the form failing, not the action.
      if (self->unlocked && self->hasPendingFormRequest && !result.success && self->api.isCurrentResourceAction(result.requestId) &&
          (result.type == "START_RESOURCE_USAGE_SESSION" || result.type == "STOP_RESOURCE_USAGE_SESSION")) {
        self->handleFormFlowError(result);
        delete payload;
        return;
      }
      if (self->unlocked && self->pendingUiAction == result.type && self->api.isCurrentResourceAction(result.requestId)) {
        if (result.success && result.type == "STOP_RESOURCE_USAGE_SESSION" &&
            self->pendingActionType == PENDING_ACTION_STOP_SESSION && result.hasDuration &&
            result.hasOwnership && result.endedOwnSession) {
          self->beginSessionSummary(result);
          delete payload;
          return;
        }
        const uint32_t resourceId = self->pendingUiResourceId;
        const std::string resourceName = self->resourceNameOf(resourceId);
        const bool returnToList = self->returnToListAfterAction;
        self->finishReaderAction(result.success);
        if (result.success) {
          self->completedResourceName = resourceName;
          self->onActionResult(result.type);
          if (!result.billingTotal.empty()) {
            self->restartSessionTimeout();
            self->billingSummaryShown = true;
            self->showStatus(StatusScreen::billing(FirmwareI18n::Text::literal(result.billingTotal) /* i18n-data: Server-supplied formatted billing total; preserve exact amount and currency. */,
                                                   FirmwareI18n::Text::literal(resourceName) /* i18n-data: Server-supplied resource name; preserve exact contents. */),
                             returnToList);
          }
        }
        else {
          self->handleFormsCancel();
          self->reportActionFailure(result, resourceId, returnToList);
        }
      }
      delete payload;
    }, payload);
  });
#endif

  this->api.setFirmwareUpdateMetaCallback([this](std::string availableVersion) {
    // Card polling can disrupt Wi-Fi on the reader. Keep NFC stopped through
    // reconnect/resume as well as the initial transfer.
    this->firmwareUpdateActive = true;
    const bool nfcStopped = this->nfc.suspend();
#ifdef HAS_LVGL_DISPLAY
    if ((this->enrollPhase != ENROLL_PHASE_NONE && this->enrollPhase != ENROLL_PHASE_SUCCESS) ||
        this->externalState == EXTERNAL_STATE_ENROLL_NEW_CARD_GET_AVAILABLE_KEY_NO)
      this->api.sendEnrollNewCardCancel();
    if ((this->resetPhase != RESET_PHASE_NONE && this->resetPhase != RESET_PHASE_SUCCESS) ||
        this->externalState == EXTERNAL_STATE_RESET_NFC_CARD)
      this->api.sendResetNfcCardCancel();
    this->enrollPhase = ENROLL_PHASE_NONE;
    this->resetPhase = RESET_PHASE_NONE;
    this->cardAuthenticationPending = false;
    this->enrollKeyMaterialReady = false;
    this->enrollErrorPending = false;
#endif
    this->externalState = EXTERNAL_STATE_FIRMWARE_UPDATE;
    this->availableFirmwareVersion = availableVersion;
    return nfcStopped;
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

  Display::resourceDetailsScreen.setProjectSelectionCallback(
      [this](uint32_t projectId, const std::string &projectName) {
        this->handleProjectSelection(projectId, projectName);
      });
  Display::resourceDetailsScreen.setOpenProjectsCallback([this]() { this->openProjects(); });
  Display::projectSelectScreen.setProjectsPageRequestCallback(
      [this](uint32_t page, const std::string &search) { return this->requestProjectsPage(page, search); });
  Display::projectSelectScreen.setCallbacks(
      [this](uint32_t projectId, const std::string &projectName) {
        this->handleProjectSelection(projectId, projectName);
        Display::returnFromTransient();
      },
      []() { Display::returnFromTransient(); });
  Display::formsScreen.setFormPageNextCallback(
      [this](const API::FormPageSubmission &page) {
        this->handleFormPageNext(page);
      });
  Display::formsScreen.setFormPageBackCallback(
      [this]() { this->handleFormPageBack(); });
  Display::formsScreen.setFormsCancelCallback(
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
    return !this->sessionSummaryActive && !this->cardAuthenticationPending && this->pendingUiAction.empty() &&
           !this->waitingForResourceRefresh && !this->hasPendingFormRequest &&
           this->state != APPLICATION_STATE_SUPERVISION && this->state != APPLICATION_STATE_MASS_INTRODUCTION;
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
