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

void Application::networkTask(void *parameter) {
#ifdef ESP_PLATFORM
  esp_task_wdt_add(NULL);
#endif
  while (true) {
#ifdef ESP_PLATFORM
    esp_task_wdt_reset();
#endif
    Network::loop();
    vTaskDelay(100 / portTICK_PERIOD_MS);
  }
}

#ifdef HAS_WS2812_LED
void Application::ledTask(void *parameter) {
  Application *app = static_cast<Application *>(parameter);
  while (true) {
    app->led.loop();
    vTaskDelay(50 / portTICK_PERIOD_MS);
  }
}
#endif

void Application::setup() {
  // Confirm OTA image on first boot after update to avoid rollback
  const esp_partition_t *running = esp_ota_get_running_partition();
  esp_ota_img_states_t ota_state;
  if (esp_ota_get_state_partition(running, &ota_state) == ESP_OK) {
    if (ota_state == ESP_OTA_IMG_PENDING_VERIFY) {
      // Minimal diagnostic succeeded; mark image valid
      esp_ota_mark_app_valid_cancel_rollback();
    }
  }

  Settings::setup();
  this->setupBootDiagnostics();
  SerialCommandHandler::setup();
#ifndef DEMO_MODE
  Network::setup();
#else
  DemoStore::setup();
  // Preset a non-empty hostname so processState() skips the "not configured" branch
  Settings::saveAttraccessApiConfig("demo-local", 80, false);
  // Skip PIN screen
  Settings::setDevicePin("demo");
#endif

#ifdef HAS_IO_EXPANDER
    this->ioExpander.setup();
    this->beeper.setup(&this->ioExpander);
#ifdef HAS_LVGL_DISPLAY
    Display::setup(&this->ioExpander);
#endif
#else
  this->beeper.setup();
#ifdef HAS_LVGL_DISPLAY
  Display::setup();
#endif
#endif

#ifdef HAS_WS2812_LED
  this->led.setup();
  xTaskCreate(Application::ledTask, "LedTask", 2048, this,
              tskIDLE_PRIORITY, nullptr);
#endif

  this->nfc.setup();

  this->api.setup();

#ifdef HAS_LVGL_DISPLAY
  this->supervision.setup();
  this->api.onDeviceName(
      [this](std::string deviceName) { Display::setDeviceName(deviceName); });
#endif
  this->api.setResourceListUpdateCallback(
      [this](const API::ResourceList &resourceList) {
#ifdef HAS_LVGL_DISPLAY
        struct ResourceListAsyncPayload {
          Application *self;
          API::ResourceList list;
        };

        this->handleResourceListUpdate(resourceList);
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
        if (response.error.length() > 0) {
          this->logger.errorf("Authentication failed: %s",
                              response.error.c_str());
          this->beeper.errorBeep();
          this->nfc.enableCardDetection();
          this->externalState = EXTERNAL_STATE_AUTHENTICATE_CARD;
          return;
        }

        if (response.keyLen != 16) {
          this->logger.error("Invalid key bytes provided");
          this->beeper.errorBeep();
          this->nfc.enableCardDetection();
          this->externalState = EXTERNAL_STATE_AUTHENTICATE_CARD;
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
          p->self->endActionPause();
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
    if (this->state == APPLICATION_STATE_LOCKED ||
        (this->state == APPLICATION_STATE_RESOURCE_LIST && !this->unlocked))
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
          pl->self->endActionPause();
          Display::resourceDetailsScreen.hideActionProgress();
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

#ifdef HAS_LVGL_DISPLAY
  // Generic action result handling: stop overlay and show success toast
  this->api.setActionResultCallback([this](const char *type, bool success) {
    struct ActionResultPayload {
      Application *self;
      bool ok;
      std::string eventType;
    };
    ActionResultPayload *p = new ActionResultPayload();
    if (!p) {
      return;
    }
    p->self = this;
    p->ok = success;
    if (type) {
      p->eventType = type;
    }
    Display::asyncCall(
        [](void *u) {
          ActionResultPayload *pl = static_cast<ActionResultPayload *>(u);
          if (pl && pl->self) {
            pl->self->endActionPause();
          }
          Display::resourceDetailsScreen.hideActionProgress();
          if (pl && pl->ok) {
            Display::resourceDetailsScreen.showSuccessToast("Erfolgreich");
          }
          if (pl && pl->self && pl->ok) {
            pl->self->onActionResult(pl->eventType);
          }
          if (pl) {
            delete pl;
          }
        },
        p);
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

  Display::resourceListScreen.setResourceDetailsCallback(
      [this](const API::ResourceBrief &resource) {
         this->selectResource(resource);
      });
  Display::resourceListScreen.setResourceActionCallback(
      [this](const API::ResourceBrief &resource) {
        this->handleResourceListAction(resource);
      });

  Display::setTouchCallback(
      [this](int16_t x, int16_t y) { this->handleTouch(x, y); });

  this->api.setEnrollNewCardGetAvailableKeyNoCallback([this](std::string username) {
    this->apiEnrollNewCardGetAvailableKeyNoData = {
        username = username,
    };
    this->externalState = EXTERNAL_STATE_ENROLL_NEW_CARD_GET_AVAILABLE_KEY_NO;
  });

  this->api.setEnrollNewCardCallback([this](uint8_t keyNo, std::string key) {
    uint8_t keyBytes[16] = {0};
    stringToHexArray(key, keyBytes, 16);

    this->apiEnrollNewCardData.keyNo = keyNo;
    memset(this->apiEnrollNewCardData.keyBytes, 0, 16);
    memcpy(this->apiEnrollNewCardData.keyBytes, keyBytes, 16);

    // Just flag readiness; processEnrollment() performs the write on the main
    // loop while the card is still held (no card-detection edge required).
    this->enrollKeyMaterialReady = true;
  });

  this->api.setEnrollNewCardErrorCallback([this](std::string error) {
    // Runs on the websocket task. Copy into the fixed buffer, then publish via
    // the volatile flag (set last) so the main loop reads a complete message.
    if (error == "CARD_ALREADY_ENROLLED") {
      strlcpy(this->enrollErrorMessage, "Karte ist bereits\nregistriert",
              sizeof(this->enrollErrorMessage));
    } else {
      strlcpy(this->enrollErrorMessage, translateReaderError(error).c_str(),
              sizeof(this->enrollErrorMessage));
    }
    this->enrollErrorPending = true;
  });

  Display::enrollmentScreen.setOnCancelCallback(
      [this]() { this->enrollCancelRequested = true; });

  this->api.setResetNfcCardCallback(
      [this](std::string username, uint8_t keyNo, std::string key) {
        uint8_t keyBytes[16] = {0};
        stringToHexArray(key, keyBytes, 16);

        this->apiResetNfcCardData.username = username;
        this->apiResetNfcCardData.keyNo = keyNo;
        memset(this->apiResetNfcCardData.keyBytes, 0, 16);
        memcpy(this->apiResetNfcCardData.keyBytes, keyBytes, 16);

        // The reset state machine takes over on the main loop (beginReset()).
        this->externalState = EXTERNAL_STATE_RESET_NFC_CARD;
      });

  Display::resetScreen.setOnCancelCallback(
      [this]() { this->resetCancelRequested = true; });

  // --- Two-card supervision (ATT-493) ---------------------------------------
  Display::supervisionScreen.setOnCancelCallback(
      [this]() { this->supervision.requestCancel(); });

  this->api.setSupervisionRequestResultCallback(
      [this](API::SupervisionRequestResult result) {
        this->supervision.onRequestResult(result);
      });

  this->api.setSupervisorCardAuthenticationResponseCallback(
      [this](API::SupervisorCardAuthenticationResponse response) {
        this->supervision.onCardAuthentication(response);
      });

  // Server-armed supervision (ATT-816). The flow queues the websocket payload;
  // the main loop decides whether this reader can enter the screen.
  this->api.setSupervisionStartCallback(
      [this](API::SupervisionStartCommand command) {
        this->supervision.armWebInitiated(command);
      });

  this->api.setSupervisionResolvedCallback(
      [this](API::SupervisionResolvedResult result) {
        this->supervision.onResolved(result);
      });

  this->api.setProjectsOfUserResponseCallback(
      [this](const API::ProjectsOfUserResponse &projectsOfUserResponse) {
        this->projectsOfUserResponse = projectsOfUserResponse;
        this->projectsCurrentPage = projectsOfUserResponse.page;
        this->projectsTotalCount = projectsOfUserResponse.total;
        this->projectsHasMore = projectsOfUserResponse.hasMore;
        this->projectsOfUserResponseUpdated = true;
      });

  this->api.setResourceFormsRequestCallback(
      [this](const API::ResourceUsageFormRequest &request) {
        // DO NOT copy the large struct here - websocket task has limited
        // stack/heap. Just set a flag; the LVGL async handler will do the copy
        // on the main thread.
        (void)request; // The data is in api.getFormRequestScratch()
        this->pendingFormRequestReady = true;
        // Schedule the copy + UI update on LVGL thread
        Display::asyncCall(
            [](void *u) {
              auto *self = static_cast<Application *>(u);
              if (self && self->pendingFormRequestReady) {
                self->pendingFormRequestReady = false;
                // Copy from API's scratch buffer on the main thread (safe
                // stack/heap)
                self->pendingFormRequest = self->api.getFormRequestScratch();
                self->handleFormsRequest(self->pendingFormRequest);
              }
            },
            this);
      });

  this->api.setResourceFormFieldsCallback(
      [this](const API::ResourceUsageFormFieldsPage &page) {
        (void)page; // The data is in api.getFormFieldsScratch()
        this->pendingFormFieldsReady = true;
        Display::asyncCall(
            [](void *u) {
              auto *self = static_cast<Application *>(u);
              if (self && self->pendingFormFieldsReady) {
                self->pendingFormFieldsReady = false;
                self->pendingFormFields = self->api.getFormFieldsScratch();
                self->handleFormFields(self->pendingFormFields);
              }
            },
            this);
      });

  this->api.setResourceFormPageResultCallback(
      [this](const API::ResourceUsageFormPageResult &result) {
        (void)result; // The data is in api.getFormPageResultScratch()
        this->pendingFormPageResultReady = true;
        Display::asyncCall(
            [](void *u) {
              auto *self = static_cast<Application *>(u);
              if (self && self->pendingFormPageResultReady) {
                self->pendingFormPageResultReady = false;
                self->pendingFormPageResult = self->api.getFormPageResultScratch();
                self->handleFormPageResult(self->pendingFormPageResult);
              }
            },
            this);
      });
#endif

  auto cardDetectionCallback = [this](uint8_t *uid, uint8_t uidLength) {
    this->logger.infof("Card detected: %s",
                       hexToString(uid, uidLength).c_str());

#ifdef DEMO_MODE
    if (this->demoPendingScanActive) {
        this->demoScanUid = hexToString(uid, uidLength);
        this->demoPendingScanActive = false;
        this->demoPendingScanReady = true;
        return;
    }
#endif

#ifndef HAS_LVGL_DISPLAY
    this->cardDetected = true;
    this->cardRemoved = false;
    this->cardPresentationWasLong = false;
    this->cardDetectionTimeMs = millis();
#endif

#ifdef HAS_LVGL_DISPLAY
    if (this->state == APPLICATION_STATE_LOCKED ||
        (this->state == APPLICATION_STATE_RESOURCE_LIST && !this->unlocked))
#else
    if (this->state == APPLICATION_STATE_WAIT_FOR_CARD)
#endif
    {
      this->api.requestCardAuthenticationData(uid, uidLength,
                                              this->unlocked ? this->selectedResourceId : 0);
      return;
    }

#ifdef HAS_LVGL_DISPLAY
    if (this->state == APPLICATION_STATE_ENROLLMENT) {
      // A card entered the field while waiting to enroll. Flag it; the
      // enrollment state machine picks the writable key on the main loop. We
      // ride the normal detection loop here precisely because it re-arms the
      // reader reliably across removals/re-presentations (ATT-503).
      this->enrollCardDetected = true;
      return;
    }

    if (this->state == APPLICATION_STATE_RESET) {
      // A card entered the field while waiting to reset. Same rationale as
      // enrollment: flag it and let the reset state machine authenticate + write
      // the factory key back on the main loop.
      this->resetCardDetected = true;
      return;
    }

    if (this->state == APPLICATION_STATE_SUPERVISION) {
      this->supervision.onCardDetected(uid, uidLength);
      return;
    }
#endif

    if (this->state == APPLICATION_STATE_AUTHENTICATE_CARD) {
      this->processCardAuthenticationData();
      return;
    }
  };
  this->nfc.setCardDetectionCallback(cardDetectionCallback);

#ifndef HAS_LVGL_DISPLAY
  this->nfc.setCardRemovalCallback([this](uint32_t presentationTimeMs) {
    this->logger.debugf("Card removed after %d ms", presentationTimeMs);
    this->cardRemoved = true;

    // log inmportant vars (cardDetected, cardRemoved, cardPresentationTimeMs,
    // state)
    this->logger.debugf("cardDetected: %d", this->cardDetected);
    this->logger.debugf("cardRemoved: %d", this->cardRemoved);
    this->logger.debugf("unlocked: %d", this->unlocked);
    this->logger.debugf("state: %d", this->state);
  });
#endif

#ifndef DEMO_MODE
  xTaskCreate(Application::networkTask, "NetworkTask", 4096, nullptr,
              tskIDLE_PRIORITY, nullptr);
#endif

#ifdef ESP_PLATFORM
  esp_task_wdt_add(NULL);
#endif

#ifdef HAS_LVGL_DISPLAY
  this->bootTime = millis();
#else
  this->state = APPLICATION_STATE_INIT;
#endif
}

void Application::loop() {
#ifdef ESP_PLATFORM
  esp_task_wdt_reset();
#endif

  this->snapshotBootDiagnostics();

  SerialCommandHandler::loop();

#ifdef HAS_LVGL_DISPLAY
  Display::loop();
#endif

  // NFC polling back on the main loop (ATT-554 item 6 reverted for isolation:
  // the dedicated NFC task + concurrent bus use is the prime suspect for the
  // field I2C wedge). Blocking PN532 time costs only this loop — rendering and
  // touch live on LvglTask.
  this->nfc.loop();

  this->api.loop();

#ifdef HAS_LVGL_DISPLAY
  // processState mutates LVGL (screen transitions, popups, screen setters);
  // rendering runs on LvglTask, so serialize with lv_lock (recursive).
  lv_lock();
  this->processState();
  lv_unlock();
#else
  this->processState();
#endif

#ifdef ESP_PLATFORM
  vTaskDelay(pdMS_TO_TICKS(1));
#endif
}
