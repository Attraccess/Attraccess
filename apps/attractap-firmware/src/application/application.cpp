#include "application.hpp"
#include "../app/runtime/telemetry/loop_metrics.hpp"
#include "../debug/loopTiming.hpp"
#include "../serial/serialCommandHandler.hpp"
#ifdef ESP_PLATFORM
#include "esp_heap_caps.h"
#include "freertos/task.h"
#endif

void Application::networkTask(void *parameter) {
  (void)parameter;
  while (true) {
    Network::loop();
    vTaskDelay(100 / portTICK_PERIOD_MS);
  }
}

void Application::apiTask(void *parameter) {
  auto *self = static_cast<Application *>(parameter);
  if (!self) {
    vTaskDelete(nullptr);
    return;
  }
  while (true) {
    self->api.loop();
    vTaskDelay(5 / portTICK_PERIOD_MS);
  }
}

void Application::nfcTask(void *parameter) {
  auto *self = static_cast<Application *>(parameter);
  if (!self) {
    vTaskDelete(nullptr);
    return;
  }
  while (true) {
    self->nfc.loop();
    vTaskDelay(5 / portTICK_PERIOD_MS);
  }
}

bool Application::enqueueAppEvent(AppEventType type, void *payload) {
  if (!this->appEventQueue) {
    this->freeAppEventPayload(type, payload);
    return false;
  }
  AppEvent evt = {.type = type, .payload = payload};
  TickType_t sendWaitTicks = this->isBestEffortEvent(type) ? 0 : pdMS_TO_TICKS(5);
  if (xQueueSend(this->appEventQueue, &evt, sendWaitTicks) != pdTRUE) {
    this->appEventEnqueueDropCount++;
    this->logger.warnf("Dropping app event type=%d (queue full)",
                       static_cast<int>(type));
    this->freeAppEventPayload(type, payload);
    return false;
  }
  this->appEventEnqueueOkCount++;
  UBaseType_t queued = uxQueueMessagesWaiting(this->appEventQueue);
  if (queued > this->appEventQueueHighWater) {
    this->appEventQueueHighWater = queued;
  }
  return true;
}

bool Application::isBestEffortEvent(AppEventType type) const {
  return type == APP_EVENT_RESOURCE_LIST_UPDATED ||
         type == APP_EVENT_PROJECTS_RESPONSE ||
         type == APP_EVENT_FIRMWARE_PROGRESS;
}

void Application::freeAppEventPayload(AppEventType type, void *payload) {
  if (!payload) {
    return;
  }
  switch (type) {
  case APP_EVENT_RESOURCE_LIST_UPDATED:
    delete static_cast<API::ResourceList *>(payload);
    break;
  case APP_EVENT_CARD_AUTH_DETAILS:
    delete static_cast<API::CardAuthenticationDetailsResponse *>(payload);
    break;
  case APP_EVENT_ENROLL_GET_AVAILABLE_KEY_NO:
    delete static_cast<EnrollGetAvailableEventPayload *>(payload);
    break;
  case APP_EVENT_ENROLL_NEW_CARD:
    delete static_cast<EnrollNewCardEventPayload *>(payload);
    break;
  case APP_EVENT_PROJECTS_RESPONSE:
    delete static_cast<API::ProjectsOfUserResponse *>(payload);
    break;
  case APP_EVENT_RESOURCE_FORMS_REQUEST:
    delete static_cast<API::ResourceUsageFormRequest *>(payload);
    break;
  case APP_EVENT_FIRMWARE_META:
    delete static_cast<FirmwareMetaEventPayload *>(payload);
    break;
  case APP_EVENT_FIRMWARE_PROGRESS:
    delete static_cast<FirmwareProgressEventPayload *>(payload);
    break;
  }
}

void Application::processAppEvents() {
  if (!this->appEventQueue) {
    return;
  }

  AppEvent evt;
  while (xQueueReceive(this->appEventQueue, &evt, 0) == pdTRUE) {
    switch (evt.type) {
    case APP_EVENT_RESOURCE_LIST_UPDATED: {
      auto *payload = static_cast<API::ResourceList *>(evt.payload);
#ifdef HAS_LVGL_DISPLAY
      if (payload) {
        this->handleResourceListUpdate(*payload);
      }
#else
      if (payload && payload->count > 0) {
        this->selectedResourceId = payload->items[0].id;
        this->resourceIsDoor = payload->items[0].type == 1;
      }
#endif
      break;
    }
    case APP_EVENT_CARD_AUTH_DETAILS: {
      auto *payload =
          static_cast<API::CardAuthenticationDetailsResponse *>(evt.payload);
      if (payload) {
        AuthController::CardDetailsDecision d =
            this->authController.handleCardDetails(*payload,
                                                   this->currentProjectsUser);
        if (d.shouldBeepError) {
          if (payload->error.length() > 0) {
            this->logger.errorf("Authentication failed: %s",
                                payload->error.c_str());
          } else {
            this->logger.error("Invalid key bytes provided");
          }
          this->beeper.errorBeep();
        }
        if (d.shouldEnableCardDetection) {
          this->nfc.enableCardDetection();
        }
        if (!d.valid) {
          this->externalState = EXTERNAL_STATE_AUTHENTICATE_CARD;
          break;
        }

        this->cardAuthenticationData = *payload;
#ifdef HAS_LVGL_DISPLAY
        if (d.shouldClearProjectSelection) {
          this->clearProjectSelection();
        }
        this->currentProjectsUser = d.username;
        if (d.shouldRequestProjects) {
          this->requestProjectsPage(1);
        }
#endif
        if (d.shouldSetExternalAuthenticateState) {
          this->externalState = EXTERNAL_STATE_AUTHENTICATE_CARD;
        }
      }
      break;
    }
#ifdef HAS_LVGL_DISPLAY
    case APP_EVENT_ENROLL_GET_AVAILABLE_KEY_NO: {
      auto *payload = static_cast<EnrollGetAvailableEventPayload *>(evt.payload);
      if (payload) {
        this->apiEnrollNewCardGetAvailableKeyNoData = {
            .username = payload->username,
        };
        this->externalState = EXTERNAL_STATE_ENROLL_NEW_CARD_GET_AVAILABLE_KEY_NO;
      }
      break;
    }
    case APP_EVENT_ENROLL_NEW_CARD: {
      auto *payload = static_cast<EnrollNewCardEventPayload *>(evt.payload);
      if (payload) {
        uint8_t keyBytes[16] = {0};
        stringToHexArray(payload->key, keyBytes, 16);
        this->apiEnrollNewCardData = {
            .keyNo = payload->keyNo,
            .keyBytes = {0},
        };
        memcpy(this->apiEnrollNewCardData.keyBytes, keyBytes, 16);
        this->externalState = EXTERNAL_STATE_ENROLL_NEW_CARD;
      }
      break;
    }
    case APP_EVENT_PROJECTS_RESPONSE: {
      auto *payload = static_cast<API::ProjectsOfUserResponse *>(evt.payload);
      if (payload) {
        this->projectsOfUserResponse = *payload;
        this->projectsCurrentPage = payload->page;
        this->projectsTotalCount = payload->total;
        this->projectsHasMore = payload->hasMore;
        this->projectsOfUserResponseUpdated = true;
      }
      break;
    }
    case APP_EVENT_RESOURCE_FORMS_REQUEST: {
      auto *payload = static_cast<API::ResourceUsageFormRequest *>(evt.payload);
      if (payload) {
        this->pendingFormRequest = *payload;
        this->handleFormsRequest(this->pendingFormRequest);
      }
      break;
    }
#endif
    case APP_EVENT_FIRMWARE_META: {
      auto *payload = static_cast<FirmwareMetaEventPayload *>(evt.payload);
      UpdateController::FirmwareMetaEventDecision decision =
          this->updateController.evaluateFirmwareMetaEvent(payload != nullptr);
      if (payload && decision.shouldSetExternalFirmwareUpdateState) {
        this->externalState = EXTERNAL_STATE_FIRMWARE_UPDATE;
      }
      if (payload && decision.shouldStoreAvailableVersion) {
        this->availableFirmwareVersion = payload->availableVersion;
      }
      break;
    }
    case APP_EVENT_FIRMWARE_PROGRESS: {
      auto *payload = static_cast<FirmwareProgressEventPayload *>(evt.payload);
      UpdateController::FirmwareProgressEventDecision decision =
          this->updateController.evaluateFirmwareProgressEvent(payload != nullptr);
      if (payload && decision.shouldLogProgress) {
        this->logger.debugf("Got firmware update pct %d", payload->progressPct);
      }
      if (payload && decision.shouldSetExternalFirmwareUpdateState) {
        this->externalState = EXTERNAL_STATE_FIRMWARE_UPDATE;
      }
      if (payload && decision.shouldStoreProgress) {
        this->firmwareUpdateProgressPct = payload->progressPct;
      }
      break;
    }
    }

    this->freeAppEventPayload(evt.type, evt.payload);
  }
}

void Application::logAppEventQueueHealth() {
  uint32_t now = millis();
  if (now - this->lastAppEventHealthLogMs < 5000) {
    return;
  }
  this->lastAppEventHealthLogMs = now;
  UBaseType_t queued =
      this->appEventQueue ? uxQueueMessagesWaiting(this->appEventQueue) : 0;
  this->logger.infof("APP_EVT,queued=%u,high_water=%u,enq_ok=%u,enq_drop=%u",
                     static_cast<unsigned>(queued),
                     static_cast<unsigned>(this->appEventQueueHighWater),
                     static_cast<unsigned>(this->appEventEnqueueOkCount),
                     static_cast<unsigned>(this->appEventEnqueueDropCount));
}

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
  SerialCommandHandler::setup();
  Network::setup();
  this->beeper.setup();

#ifdef HAS_LVGL_DISPLAY
  this->ui.setup();
#endif

  if (!this->nfc.setup()) {
#ifdef HAS_LVGL_DISPLAY
    this->state = APPLICATION_STATE_NFC_INIT_FAILED;
    this->ui.showNfcInitErrorPopup(
        "NFC Error", "NFC hardware not found. Check connection and retry.",
        [this]() { this->retryNfcSetup(); }, []() { ESP.restart(); });
#else
    this->logger.error("NFC hardware not found, restarting in 5 seconds");
    delay(5000);
    ESP.restart();
#endif
  }
  this->api.setup();
  this->appEventQueue = xQueueCreate(24, sizeof(AppEvent));

#ifdef HAS_LVGL_DISPLAY
  this->api.onDeviceName(
      [this](String deviceName) { this->ui.setDeviceName(deviceName); });
#endif
  this->api.setResourceListUpdateCallback(
      [this](const API::ResourceList &resourceList) {
        auto *payload = new API::ResourceList(resourceList);
        if (!payload) {
          return;
        }
        this->enqueueAppEvent(APP_EVENT_RESOURCE_LIST_UPDATED, payload);
      });

  this->api.setCardAuthenticationDetailsResponseCallback(
      [this](API::CardAuthenticationDetailsResponse response) {
        auto *payload = new API::CardAuthenticationDetailsResponse(response);
        if (!payload) {
          return;
        }
        this->enqueueAppEvent(APP_EVENT_CARD_AUTH_DETAILS, payload);
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
    lv_async_call(
        [](void *u) {
          auto *p = (Payload *)u;
          if (!p || !p->self) {
            if (p)
              delete p;
            return;
          }
          p->self->endActionPause();
          p->self->ui.resourceDetailsHideActionProgress();
          if (p->enabled) {
            p->self->ui.showInsufficientBalancePopup(
                [self = p->self](uint32_t amountCents) {
                  self->api.requestBillingTopup(amountCents);
                },
                []() {});
          } else {
            p->self->ui.showErrorPopup("Fehler", "INSUFFICIENT_BALANCE");
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
      String t;
      String m;
    };
    ErrPayload *p = new ErrPayload();
    if (!p)
      return;
    p->self = this;
    p->t = String(title);
    p->m = String(message);
    lv_async_call(
        [](void *u) {
          auto *pl = (ErrPayload *)u;
          if (!pl || !pl->self) {
            if (pl)
              delete pl;
            return;
          }
          pl->self->endActionPause();
          pl->self->ui.resourceDetailsHideActionProgress();
          pl->self->ui.showErrorPopup(pl->t, pl->m);
          if (pl && pl->self) {
            pl->self->pendingActionType = PENDING_ACTION_NONE;
            pl->self->hasPendingFormRequest = false;
            pl->self->ui.resourceDetailsHideFormsModal();
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
      String eventType;
    };
    ActionResultPayload *p = new ActionResultPayload();
    if (!p) {
      return;
    }
    p->self = this;
    p->ok = success;
    if (type) {
      p->eventType = String(type);
    }
    lv_async_call(
        [](void *u) {
          ActionResultPayload *pl = static_cast<ActionResultPayload *>(u);
          if (pl && pl->self) {
            pl->self->endActionPause();
          }
          pl->self->ui.resourceDetailsHideActionProgress();
          if (pl && pl->ok) {
            pl->self->ui.resourceDetailsShowSuccessToast("Erfolgreich");
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

  this->api.setFirmwareUpdateMetaCallback([this](String availableVersion) {
    auto *payload = new FirmwareMetaEventPayload();
    if (!payload) {
      return;
    }
    payload->availableVersion = availableVersion;
    this->enqueueAppEvent(APP_EVENT_FIRMWARE_META, payload);
  });

  this->api.setFirmwareUpdateProgressCallback([this](int percent) {
    auto *payload = new FirmwareProgressEventPayload();
    if (!payload) {
      return;
    }
    payload->progressPct = percent;
    this->enqueueAppEvent(APP_EVENT_FIRMWARE_PROGRESS, payload);
  });

#ifdef HAS_LVGL_DISPLAY
  this->ui.resourceDetailsSetButtonClickCallback(
      [this](ResourceDetailsScreen::ButtonClickEventData evt) {
        this->handleResourceDetailsButtonClick(evt);
      });

  this->ui.resourceDetailsSetProjectsPageRequestCallback(
      [this](uint32_t page) { this->requestProjectsPage(page); });
  this->ui.resourceDetailsSetProjectSelectionCallback(
      [this](uint32_t projectId, const String &projectName) {
        this->handleProjectSelection(projectId, projectName);
      });
  this->ui.resourceDetailsSetFormsSubmitCallback(
      [this](const API::FormSubmissionList &submissions) {
        this->handleFormsSubmit(submissions);
      });
  this->ui.resourceDetailsSetFormsCancelCallback(
      [this]() { this->handleFormsCancel(); });

  this->ui.setPinOnConfirmedCallback(
      [this](String pin) { Settings::setDevicePin(pin); });

  this->ui.connectionConfigOnCancelPinLock([this]() {
    ConnectivityController::CancelPinLockDecision decision =
        this->connectivityController.evaluateCancelPinLock(true);
    if (decision.shouldTransitionToInitScreen) {
      this->ui.transitionToInitScreen();
    }
    if (decision.shouldEnterBootState) {
      this->state = APPLICATION_STATE_BOOT;
    }
    if (decision.shouldEnableConnectionAttempts) {
      this->api.enableConnectionAttempts();
    }
  });

  this->ui.connectionConfigOnSaveCallback(
      [this](const ConnectionConfigurationScreen::ConnectionConfig &cfg) {
        this->handleConnectionConfigurationSave(cfg);
      });

  this->ui.initScreenOnOpenSettings([this]() {
    ConnectivityController::OpenSettingsDecision decision =
        this->connectivityController.evaluateOpenSettingsRequest(true);
    if (decision.shouldEnterConfigurationRequiredState) {
      this->state = APPLICATION_STATE_CONFIGURATION_REQUIRED;
    }
    if (decision.shouldDisableConnectionAttempts) {
      this->api.disableConnectionAttempts();
    }
    if (decision.shouldEnablePinLock) {
      this->ui.connectionConfigEnablePinLock();
    }
    if (decision.shouldTransitionToConnectionConfigurationScreen) {
      this->ui.transitionToConnectionConfigurationScreen();
    }
  });

  this->ui.resourceListSetSelectionCallback(
      [this](const API::ResourceBrief &resource) {
        this->selectResource(resource);
      });

  this->ui.setTouchCallback(
      [this](int16_t x, int16_t y) { this->handleTouch(x, y); });

  this->api.setEnrollNewCardGetAvailableKeyNoCallback([this](String username) {
    auto *payload = new EnrollGetAvailableEventPayload();
    if (!payload) {
      return;
    }
    payload->username = username;
    this->enqueueAppEvent(APP_EVENT_ENROLL_GET_AVAILABLE_KEY_NO, payload);
  });

  this->api.setEnrollNewCardCallback([this](uint8_t keyNo, String key) {
    auto *payload = new EnrollNewCardEventPayload();
    if (!payload) {
      return;
    }
    payload->keyNo = keyNo;
    payload->key = key;
    this->enqueueAppEvent(APP_EVENT_ENROLL_NEW_CARD, payload);
  });

  this->api.setProjectsOfUserResponseCallback(
      [this](const API::ProjectsOfUserResponse &projectsOfUserResponse) {
        auto *payload = new API::ProjectsOfUserResponse(projectsOfUserResponse);
        if (!payload) {
          return;
        }
        this->enqueueAppEvent(APP_EVENT_PROJECTS_RESPONSE, payload);
      });

  this->api.setResourceFormsRequestCallback(
      [this](const API::ResourceUsageFormRequest &request) {
        auto *payload = new API::ResourceUsageFormRequest(request);
        if (!payload) {
          return;
        }
        this->enqueueAppEvent(APP_EVENT_RESOURCE_FORMS_REQUEST, payload);
      });
#endif

  auto cardDetectionCallback = [this](uint8_t *uid, uint8_t uidLength) {
    this->logger.infof("Card detected: %s",
                       hexToString(uid, uidLength).c_str());

#ifndef HAS_LVGL_DISPLAY
    this->cardDetected = true;
    this->cardRemoved = false;
    this->cardPresentationWasLong = false;
    this->cardDetectionTimeMs = millis();
#endif

    bool currentlyLocked = false;
    bool currentlyWaitForCard = false;
    bool currentlyEnrollment = false;
#ifdef HAS_LVGL_DISPLAY
    currentlyLocked = this->state == APPLICATION_STATE_LOCKED;
    currentlyEnrollment = this->state == APPLICATION_STATE_ENROLLMENT;
#else
    currentlyWaitForCard = this->state == APPLICATION_STATE_WAIT_FOR_CARD;
#endif
    AuthController::CardDetectionDecision cardDetectionDecision =
        this->authController.evaluateCardDetection(
#ifdef HAS_LVGL_DISPLAY
            true,
#else
            false,
#endif
            currentlyLocked, currentlyWaitForCard, currentlyEnrollment,
            this->state == APPLICATION_STATE_AUTHENTICATE_CARD);

    if (cardDetectionDecision.shouldRequestCardAuthenticationData) {
      this->api.requestCardAuthenticationData(uid, uidLength,
                                              this->selectedResourceId);
      return;
    }

#ifdef HAS_LVGL_DISPLAY
    if (cardDetectionDecision.shouldHandleEnrollmentCard) {
      bool success = this->nfc.changeKey(
          this->apiEnrollNewCardData.keyNo, NFC::FACTORY_KEY, NFC::FACTORY_KEY,
          this->apiEnrollNewCardData.keyBytes);

      AuthController::EnrollCardWriteDecision enrollWriteDecision =
          this->authController.evaluateEnrollCardWriteResult(success);
      if (enrollWriteDecision.shouldSuccessBeep) {
        this->beeper.successBeep();
      }
      if (enrollWriteDecision.shouldErrorBeep) {
        this->beeper.errorBeep();
      }
      if (enrollWriteDecision.shouldSendEnrollResult) {
        this->api.sendEnrollNewCard(success);
      }
      if (enrollWriteDecision.shouldClearExternalState) {
        this->externalState = EXTERNAL_STATE_NONE;
      }
      return;
    }
#endif

    if (cardDetectionDecision.shouldProcessCardAuthenticationNow) {
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

  xTaskCreate(Application::networkTask, "NetworkTask", 4096, nullptr,
              tskIDLE_PRIORITY, nullptr);
  xTaskCreate(Application::apiTask, "ApiTask", 6144, this, tskIDLE_PRIORITY + 1,
              nullptr);
  xTaskCreate(Application::nfcTask, "NfcTask", 4096, this, tskIDLE_PRIORITY + 1,
              nullptr);

#ifdef HAS_LVGL_DISPLAY
  this->bootTime = millis();
#endif
}

void Application::loop() {
#if defined(DEBUG_LOOP_TIMING) || defined(PERF_BASELINE_METRICS)
  LoopTiming t;
  uint32_t t0 = loopTimingNow();
#endif

#ifdef HAS_LVGL_DISPLAY
  /* Run display/touch first so input feels responsive before any blocking work
   */
  this->ui.loop();
  taskYIELD(); /* Yield to other FreeRTOS tasks when loop is fast */
#endif

#if defined(DEBUG_LOOP_TIMING) || defined(PERF_BASELINE_METRICS)
  t.display_ms = loopTimingNow() - t0;
  t0 = loopTimingNow();
#endif

  SerialCommandHandler::loop();

#if defined(DEBUG_LOOP_TIMING) || defined(PERF_BASELINE_METRICS)
  t.serial_ms = loopTimingNow() - t0;
  t0 = loopTimingNow();
#endif

  this->processAppEvents();
  this->logAppEventQueueHealth();

  // NFC/API loops run in dedicated worker tasks in phase 2.
#if defined(DEBUG_LOOP_TIMING) || defined(PERF_BASELINE_METRICS)
  t.nfc_ms = 0;
  t.api_ms = 0;
  t0 = loopTimingNow();
#endif

  this->processState();

#if defined(DEBUG_LOOP_TIMING) || defined(PERF_BASELINE_METRICS)
  t.processState_ms = loopTimingNow() - t0;
  t.total_ms =
      t.display_ms + t.serial_ms + t.nfc_ms + t.api_ms + t.processState_ms;
#endif

#ifdef DEBUG_LOOP_TIMING
  t.logIfSlow();
#endif

#if defined(PERF_BASELINE_METRICS) && defined(HAS_LVGL_DISPLAY)
  static LoopMetricsWindow metricsWindow;
  LoopBucketDurations d = {
      .display_ms = t.display_ms,
      .serial_ms = t.serial_ms,
      .nfc_ms = t.nfc_ms,
      .api_ms = t.api_ms,
      .process_state_ms = t.processState_ms,
      .total_ms = t.total_ms,
  };
  metricsWindow.record(d);
  metricsWindow.maybeLogAndReset(millis());
#endif
}

#ifdef HAS_LVGL_DISPLAY
void Application::retryNfcSetup() {
  if (this->nfc.setup()) {
    this->state = APPLICATION_STATE_INIT;
  } else {
    this->ui.showNfcInitErrorPopup(
        "NFC Error", "NFC hardware not found. Check connection and retry.",
        [this]() { this->retryNfcSetup(); }, []() { ESP.restart(); });
  }
}
#endif

void Application::processState() {
#ifdef HAS_LVGL_DISPLAY
  if (this->state == APPLICATION_STATE_NFC_INIT_FAILED) {
    return;
  }
#endif

  AttraccessApiConfig attraccessApiConfig = Settings::getAttraccessApiConfig();
  bool connectionIsConfigured = !attraccessApiConfig.hostname.isEmpty() &&
                                attraccessApiConfig.hostname != "" &&
                                attraccessApiConfig.port > 0;

  ConnectivityController::ConnectionConfigurationDecision configDecision =
      this->connectivityController.evaluateConnectionConfiguration(
          connectionIsConfigured,
          this->state == APPLICATION_STATE_CONFIGURATION_REQUIRED,
#ifdef HAS_LVGL_DISPLAY
          true
#else
          false
#endif
      );
  if (configDecision.shouldHandle) {
    if (configDecision.shouldEnterConfigurationRequiredState) {
      this->logger.debug("Connection is not configured, showing connection "
                         "configuration screen");
      this->state = APPLICATION_STATE_CONFIGURATION_REQUIRED;
    }
    if (configDecision.shouldDisableConnectionAttempts) {
      this->api.disableConnectionAttempts();
    }
#ifdef HAS_LVGL_DISPLAY
    if (configDecision.shouldDisablePinLock) {
      this->ui.connectionConfigDisablePinLock();
    }
    if (configDecision.shouldTransitionToConnectionConfigurationScreen) {
      this->ui.transitionToConnectionConfigurationScreen();
    }
#endif
    if (configDecision.shouldReturnEarly) {
      return;
    }
    return;
  }

#ifdef HAS_LVGL_DISPLAY
  if (!this->bootDone &&
      millis() - this->bootTime > APPLICATION_BOOT_SCREEN_DURATION) {
    this->logger.debug("Boot screen duration reached, hiding boot screen");
    this->bootDone = true;
  }

  if (!this->bootDone) {
    return;
  }

  bool pinIsSet = Settings::getDeviceConfig().passCode != "0000";
  if (!pinIsSet) {
    if (this->state == APPLICATION_STATE_PIN_NOT_SET) {
      return;
    }

    this->logger.debug("PIN is not set, showing pin screen");
    this->state = APPLICATION_STATE_PIN_NOT_SET;

    this->ui.transitionToSetPinScreen();
    return;
  }
#endif

  State::ApiState apiState = State::getApiState();
  State::NetworkState networkState = State::getNetworkState();
  State::WebsocketState websocketState = State::getWebsocketState();
  ConnectivityController::ConnectivityStateDecision connectivityDecision =
      this->connectivityController.evaluateConnectivityState(
          apiState.authenticated,
          (networkState.ethernet_connected || networkState.wifi_connected),
          websocketState.connected, this->state == APPLICATION_STATE_INIT,
          this->state == APPLICATION_STATE_CONFIGURATION_REQUIRED,
#ifdef HAS_LVGL_DISPLAY
          true
#else
          false
#endif
      );
  if (connectivityDecision.shouldHandleDisconnectedState) {
#ifdef HAS_LVGL_DISPLAY
    if (connectivityDecision.shouldResetSessionOnDisconnect) {
      this->resetSessionOnDisconnect();
    }
#endif
    if (connectivityDecision.shouldReturnEarly) {
      return;
    }

    if (connectivityDecision.shouldEnterInitState) {
      this->logger.debug(
          "API/network/websocket disconnected, showing init screen");
      this->state = APPLICATION_STATE_INIT;
    }

#ifdef HAS_LVGL_DISPLAY
    if (connectivityDecision.shouldTransitionToInitScreen) {
      this->ui.transitionToInitScreen();
    }
#endif
    return;
  }

#ifdef HAS_LVGL_DISPLAY
  AuthController::EnrollGetAvailableTransitionDecision
      enrollGetAvailableDecision =
          this->authController.evaluateEnrollGetAvailableTransition(
              this->externalState ==
                  EXTERNAL_STATE_ENROLL_NEW_CARD_GET_AVAILABLE_KEY_NO,
              this->state == APPLICATION_STATE_ENROLLMENT, millis(),
              this->apiEnrollNewCardGetAvailableKeyNoStartTimeMs, 30000);
  if (enrollGetAvailableDecision.shouldHandle) {
    if (enrollGetAvailableDecision.shouldTimeout) {
      this->logger.error(
          "Enroll new card get available key number timeout reached");
      this->externalState = EXTERNAL_STATE_NONE;
      return;
    }
    if (enrollGetAvailableDecision.shouldTryGetAvailableKeyNo) {
      uint8_t uid[7] = {0};
      uint8_t uidLength = 0;
      uint8_t keyNo = 0;
      bool success = this->nfc.getAvailableKeyNo(uid, &uidLength, &keyNo);
      AuthController::EnrollAvailableKeyReadDecision keyReadDecision =
          this->authController.evaluateEnrollAvailableKeyRead(success);
      if (keyReadDecision.shouldSendAvailableKeyNo) {
        this->api.sendEnrollNewCardAvailableKeyNo(uid, uidLength, keyNo);
      }
      if (keyReadDecision.shouldClearExternalState) {
        this->externalState = EXTERNAL_STATE_NONE;
      }
      return;
    }
    if (enrollGetAvailableDecision.shouldPrepareEnrollment) {
      this->nfc.disableCardDetection();
#ifdef HAS_LVGL_DISPLAY
      this->ui.enrollmentSetUserName(
          this->apiEnrollNewCardGetAvailableKeyNoData.username);
#endif
      this->apiEnrollNewCardGetAvailableKeyNoStartTimeMs = millis();
#ifdef HAS_LVGL_DISPLAY
      this->ui.enrollmentSetTimeoutTime(
          this->apiEnrollNewCardGetAvailableKeyNoStartTimeMs + 30000);
      this->ui.transitionToEnrollmentScreen();
#endif
    }
    if (enrollGetAvailableDecision.shouldEnterEnrollmentState) {
      this->state = APPLICATION_STATE_ENROLLMENT;
    }
    return;
  }

  AuthController::EnrollNewCardTransitionDecision enrollNewCardDecision =
      this->authController.evaluateEnrollNewCardTransition(
          this->externalState == EXTERNAL_STATE_ENROLL_NEW_CARD,
          this->state == APPLICATION_STATE_ENROLLMENT);
  if (enrollNewCardDecision.shouldHandle) {
    if (enrollNewCardDecision.shouldReturnEarly) {
      return;
    }
    if (enrollNewCardDecision.shouldEnableCardDetection) {
      this->nfc.enableCardDetection();
    }
    if (enrollNewCardDecision.shouldEnterEnrollmentState) {
      this->state = APPLICATION_STATE_ENROLLMENT;
    }
    return;
  }
#endif

#ifndef HAS_LVGL_DISPLAY
  SessionController::NonDisplayPresentationDecision nonDisplayPresentation =
      this->sessionController.evaluateNonDisplayPresentation(
          this->cardDetected, this->cardRemoved, millis(),
          this->cardDetectionTimeMs, NFC_CARD_LONG_PRESENTATION_TIME_MS,
          this->cardPresentationWasLong);
  if (nonDisplayPresentation.shouldIndicateLongPresentation) {
    this->beeper.indicateBeep();
  }
  if (nonDisplayPresentation.shouldMarkLongPresentation) {
    this->cardPresentationWasLong = true;
  }
#endif

  if (this->externalState == EXTERNAL_STATE_AUTHENTICATE_CARD) {
    AuthController::ExternalAuthTransitionDecision authTransitionDecision =
        this->authController.evaluateExternalAuthenticateTransition(
            this->externalState == EXTERNAL_STATE_AUTHENTICATE_CARD,
            this->state == APPLICATION_STATE_AUTHENTICATE_CARD,
#ifdef HAS_LVGL_DISPLAY
            true
#else
            false
#endif
        );
    if (authTransitionDecision.shouldReturnEarly) {
      return;
    }

#ifdef HAS_LVGL_DISPLAY
    if (authTransitionDecision.shouldPopulateUserDetails) {
      this->ui.resourceDetailsSetUserDetails(
          ResourceDetailsScreen::UserDetails{
              .username = this->cardAuthenticationData.username,
              .canManageResource = this->cardAuthenticationData.canManageResource,
              .hasIntroduction = this->cardAuthenticationData.hasIntroduction,
              .isIntroducer = this->cardAuthenticationData.isIntroducer});
    }
#endif

    if (authTransitionDecision.shouldEnterAuthenticateState) {
      this->state = APPLICATION_STATE_AUTHENTICATE_CARD;
    }

    if (authTransitionDecision.shouldProcessCardAuthenticationNow) {
      // For non-display mode, process authentication immediately since the card
      // is still present and won't trigger another detection event
      this->processCardAuthenticationData();
    }
    if (authTransitionDecision.shouldEnableCardDetection) {
      this->nfc.enableCardDetection();
    }
    return;
  }

  if (this->externalState == EXTERNAL_STATE_FIRMWARE_UPDATE) {
    UpdateController::ExternalFirmwareUpdateDecision firmwareDecision =
        this->updateController.evaluateExternalFirmwareUpdateTransition(
            this->externalState == EXTERNAL_STATE_FIRMWARE_UPDATE,
            this->state == APPLICATION_STATE_FIRMWARE_UPDATE,
#ifdef HAS_LVGL_DISPLAY
            true
#else
            false
#endif
        );
    if (firmwareDecision.shouldHandle) {
      if (firmwareDecision.shouldUpdateProgress) {
        this->logger.debugf("Updating firmware update progress %d",
                            this->firmwareUpdateProgressPct);
#ifdef HAS_LVGL_DISPLAY
        this->ui.firmwareUpdateSetProgress(this->firmwareUpdateProgressPct);
        this->ui.firmwareUpdateSetAvailableVersion(this->availableFirmwareVersion);
#endif
      }
#ifdef HAS_LVGL_DISPLAY
      if (firmwareDecision.shouldTransitionToFirmwareScreen) {
        this->ui.transitionToFirmwareUpdateScreen();
      }
#endif
      if (firmwareDecision.shouldEnterFirmwareUpdateState) {
        this->state = APPLICATION_STATE_FIRMWARE_UPDATE;
      }
      return;
    }
  }

#ifdef HAS_LVGL_DISPLAY
  ResourceController::ResourceAvailabilityDecision resourceDecision =
      this->resourceController.evaluateResourceAvailability(
          this->resourceCount, this->resourceIsSelected, this->resourceListUpdated,
          this->state == APPLICATION_STATE_NO_RESOURCES,
          this->state == APPLICATION_STATE_RESOURCE_LIST);
  if (resourceDecision.shouldShowNoResources) {
    this->logger.debug("Resource count is 0, showing no resources screen");
    this->state = APPLICATION_STATE_NO_RESOURCES;
    this->ui.transitionToNoResourcesScreen();
    return;
  }
  if (resourceDecision.shouldAutoSelectSingleResource) {
    this->logger.debug(
        "Resource count is 1 and resource is not selected, selecting resource");
    this->selectResource(resourceList.items[0]);
    return;
  }
  if (resourceDecision.shouldUpdateResourceListUi) {
    this->ui.resourceListSetResourceList(this->resourceList);
    this->resourceListUpdated = false;
  }
  if (resourceDecision.shouldReturnEarly) {
    return;
  }
  if (resourceDecision.shouldShowResourceList) {
    this->logger.debug("Resource count is greater than 0 and resource is not "
                       "selected, showing resource list");
    this->state = APPLICATION_STATE_RESOURCE_LIST;
    this->ui.transitionToResourceListScreen();
    return;
  }

  if (this->selectedResourceChanged) {
    for (uint16_t i = 0; i < this->resourceList.count; ++i) {
      if (this->resourceList.items[i].id == this->selectedResourceId) {
        API::ResourceBrief resource = this->resourceList.items[i];

        this->ui.lockscreenSetResourceName(resource.name);
        this->ui.lockscreenSetUsageInfo(resource.hasActiveUsage,
                                        resource.activeUser);

        // Directly pass the native struct to the screen so it can avoid String
        // conversions
        this->ui.resourceDetailsSetResourceAndUsageDetails(resource);

        break;
      }
    }
    this->selectedResourceChanged = false;
  }

  uint32_t now = millis();
  if (!this->unlocked) {
    SessionController::LockedStateDecision lockedDecision =
        this->sessionController.evaluateLockedState(
            this->unlocked, this->state == APPLICATION_STATE_LOCKED, now,
            this->timeOfResourceSelectionMs, this->RESOURCE_SELECTION_TIMEOUT_MS);
    if (lockedDecision.shouldClearResourceSelection) {
      this->logger.debug(
          "Resource selection timeout reached, showing resource list");
      this->resourceIsSelected = false;
    }
    if (lockedDecision.shouldReturnEarly) {
      return;
    }
    if (lockedDecision.shouldTransitionToLocked) {
      this->logger.debug("Card is not detected, showing lockscreen");
      this->state = APPLICATION_STATE_LOCKED;
#ifdef HAS_LVGL_DISPLAY
      this->ui.transitionToLockscreen([this]() {
        this->logger.debug(
            "Lockscreen transition complete, enabling card detection");
        this->nfc.enableCardDetection();
      });
#else
      this->nfc.enableCardDetection();
#endif
    }
    return;
  }

  if (this->state == APPLICATION_STATE_UNLOCKED) {
    SessionController::UnlockedStateDecision unlockedDecision =
        this->sessionController.evaluateUnlockedState(
            this->unlocked, this->state == APPLICATION_STATE_UNLOCKED, now,
            this->timeOfUnlockedMs, this->accumulatedPauseMs,
            this->UNLOCKED_TIMEOUT_MS, this->resourceCount);
    if (unlockedDecision.shouldRelock) {
      this->logger.debug("Unlocked timeout reached, locking");
      this->unlocked = false;
      this->resourceIsSelected = unlockedDecision.keepResourceSelectedOnRelock;
    }

    if (this->projectsOfUserResponseUpdated) {
#ifdef HAS_LVGL_DISPLAY
      this->ui.resourceDetailsSetProjects(this->projectsOfUserResponse);
      this->ui.resourceDetailsSetSelectedProject(
          this->selectedProjectId, this->selectedProjectName.c_str());
#endif
      this->projectsOfUserResponseUpdated = false;
    }

    return;
  }

  this->logger.debug("Resource is unlocked, showing resource details screen");
  this->state = APPLICATION_STATE_UNLOCKED;
  this->restartSessionTimeout();

  this->ui.transitionToResourceDetailsScreen();
#else

  // Process unlocked card actions for non-display mode
  SessionController::NonDisplayFlowDecision nonDisplayDecision =
      this->sessionController.evaluateNonDisplayFlow(
          this->state == APPLICATION_STATE_AUTHENTICATE_CARD,
          this->state == APPLICATION_STATE_WAIT_FOR_CARD, this->cardDetected,
          this->unlocked, this->cardRemoved);
  if (nonDisplayDecision.shouldReturnEarly) {
    return;
  }
  if (nonDisplayDecision.shouldProcessAction) {
    this->logger.debug("Card detected and removed and unlocked, processing");

    // Reset state flags before triggering action
    this->unlocked = false;
    this->cardDetected = false;
    this->cardRemoved = false;

    SessionController::NonDisplayActionType actionType =
        this->sessionController.selectNonDisplayAction(
            this->resourceIsDoor, this->cardPresentationWasLong);
    switch (actionType) {
    case SessionController::NON_DISPLAY_ACTION_LOCK_DOOR:
      this->api.lockDoor(this->selectedResourceId);
      break;
    case SessionController::NON_DISPLAY_ACTION_UNLOCK_DOOR:
      this->api.unlockDoor(this->selectedResourceId);
      break;
    case SessionController::NON_DISPLAY_ACTION_STOP_SESSION:
      this->api.stopResourceUsageSession(this->selectedResourceId);
      break;
    case SessionController::NON_DISPLAY_ACTION_START_SESSION:
      this->api.startResourceUsageSession(this->selectedResourceId);
      break;
    case SessionController::NON_DISPLAY_ACTION_NONE:
    default:
      return;
    }

    // Reset state back to waiting for card
    this->state = APPLICATION_STATE_WAIT_FOR_CARD;
    this->nfc.enableCardDetection();
    return;
  }

  if (nonDisplayDecision.shouldTransitionToWaitForCard) {
    this->logger.debug("Waiting for card detection");
    this->state = APPLICATION_STATE_WAIT_FOR_CARD;
    this->nfc.enableCardDetection();
    return;
  }
#endif
}

#ifdef HAS_LVGL_DISPLAY
void Application::handleConnectionConfigurationSave(
    const ConnectionConfigurationScreen::ConnectionConfig &cfg) {
  // split cfg.host into hostname and port (if no port present, use 443)
  String hostname = cfg.host;
  String port = "443";
  if (cfg.host.indexOf(":") != -1) {
    hostname = cfg.host.substring(0, cfg.host.indexOf(":"));
    port = cfg.host.substring(cfg.host.indexOf(":") + 1);
  }
  Settings::saveNetworkConfig(cfg.ssid, cfg.password);
  Settings::saveAttraccessApiConfig(hostname, port.toInt(), cfg.useSSL);

  Settings::setDevicePin(cfg.devicePin);
  Settings::setBeeperEnabled(cfg.beeperEnabled);
};

void Application::handleResourceListUpdate(
    const API::ResourceList &resourceList) {
  this->logger.infof("Resource list updated: %d resources", resourceList.count);

  this->resourceList = resourceList;
  this->resourceCount = resourceList.count;
  this->resourceListUpdated = true;

  // If a resource is already selected, try to find it in the new list and
  // refresh the details screen.
  if (this->resourceIsSelected) {
    this->logger.info(
        "Resource is selected, trying to find it in the new list");
    for (uint16_t i = 0; i < this->resourceList.count; ++i) {
      const auto &obj = this->resourceList.items[i];
      if (obj.id == this->selectedResourceId) {
        this->logger.infof(
            "Resource found in the new list, refreshing the details screen: %s",
            obj.name);
        this->selectResource(obj);
        break;
      }
    }
  }
}
#endif

void Application::processCardAuthenticationData() {
  this->logger.infof("Trying to authenticate with keyNo: %u",
                     this->cardAuthenticationData.keyNo);
  bool keyLenValid = this->authController.isCardAuthKeyLengthValid(
      this->cardAuthenticationData.keyLen);

  bool authenticated = false;
  if (keyLenValid) {
    authenticated =
      this->nfc.authenticate(this->cardAuthenticationData.keyNo,
                             this->cardAuthenticationData.keyBytes);
  }

  AuthController::CardAuthenticationExecutionDecision authDecision =
      this->authController.evaluateCardAuthenticationExecution(
          keyLenValid, authenticated,
#ifdef HAS_LVGL_DISPLAY
          true
#else
          false
#endif
      );

  if (authDecision.shouldLogInvalidKey) {
    this->logger.error("Invalid key bytes provided");
  }
  if (authDecision.shouldLogAuthFailed) {
    this->logger.error("Authentication failed");
  }
  if (authDecision.shouldErrorBeep) {
    this->beeper.errorBeep();
  }
  if (authDecision.shouldEnableCardDetection) {
    this->nfc.enableCardDetection();
  }
  if (authDecision.shouldKeepExternalAuthenticateState) {
    this->externalState = EXTERNAL_STATE_AUTHENTICATE_CARD;
  }
  if (authDecision.shouldFail) {
    return;
  }

  if (authDecision.shouldSuccessBeep) {
    this->beeper.successBeep();
    this->logger.info("Authentication successful");
  }
  if (authDecision.shouldClearExternalState) {
    this->externalState = EXTERNAL_STATE_NONE;
  }
  if (authDecision.shouldUnlock) {
    this->unlocked = true;
  }
}

#ifdef HAS_LVGL_DISPLAY
void Application::selectResource(const API::ResourceBrief &resource) {
  this->logger.infof("Resource selected: %s", resource.name);
  this->resourceIsSelected = true;
  this->selectedResourceId = resource.id;
  this->restartResourceSelectionTimeout();
  this->selectedResourceChanged = true;
}

void Application::requestProjectsPage(uint32_t page) {
  if (page == 0) {
    page = 1;
  }
  this->api.requestProjectsOfUser(page);
}

void Application::clearProjectSelection() {
  this->selectedProjectId = 0;
  this->selectedProjectName = "";
  this->projectsCurrentPage = 1;
  this->projectsTotalCount = 0;
  this->projectsHasMore = false;
  this->projectsOfUserResponse.count = 0;
  this->projectsOfUserResponse.page = 1;
  this->projectsOfUserResponse.total = 0;
  this->projectsOfUserResponse.limit = API::MAX_PROJECTS_PER_PAGE;
  this->projectsOfUserResponse.hasMore = false;
  this->projectsOfUserResponseUpdated = true;
  this->ui.resourceDetailsSetSelectedProject(0, nullptr);
}

void Application::handleProjectSelection(uint32_t projectId,
                                         const String &projectName) {
  this->selectedProjectId = projectId;
  this->selectedProjectName = projectName;
  this->ui.resourceDetailsSetSelectedProject(projectId, projectName.c_str());
}

void Application::handleFormsRequest(
    const API::ResourceUsageFormRequest &request) {
  // Note: 'request' is already a reference to this->pendingFormRequest from the
  // callback, so we don't need to copy it again. Just set the flag and show the
  // modal.
  (void)request; // Suppress unused parameter warning; we use pendingFormRequest
                 // directly
  this->hasPendingFormRequest = true;
  this->ui.resourceDetailsHideActionProgress();
  // Pass the stored copy since showFormsModal stores a pointer
  this->ui.resourceDetailsShowFormsModal(this->pendingFormRequest);
}

void Application::handleFormsSubmit(
    const API::FormSubmissionList &submissions) {
  ResourceController::FormsSubmitDecision d =
      this->resourceController.evaluateFormsSubmit(this->pendingActionType);
  if (d.shouldCancelInstead) {
    this->handleFormsCancel();
    return;
  }

  if (d.shouldStoreSubmissionBuffer) {
    this->formSubmissionBuffer = submissions;
    this->hasPendingFormRequest = false;
  }
  if (d.shouldHideFormsModal) {
    this->ui.resourceDetailsHideFormsModal();
  }
  if (d.shouldShowActionProgress && d.actionProgressMessage) {
    this->ui.resourceDetailsShowActionProgress(d.actionProgressMessage);
  }

  if (d.shouldSendStartSession) {
    this->api.startResourceUsageSession(this->pendingActionResourceId,
                                        this->pendingActionProjectId,
                                        &this->formSubmissionBuffer);
  } else if (d.shouldSendStopSession) {
    this->api.stopResourceUsageSession(this->pendingActionResourceId,
                                       &this->formSubmissionBuffer);
  }
}

void Application::handleFormsCancel() {
  ResourceController::FormsCancelDecision d =
      this->resourceController.evaluateFormsCancel(this->hasPendingFormRequest);
  if (d.shouldReturnEarly) {
    return;
  }
  if (d.shouldClearPendingFormRequest) {
    this->hasPendingFormRequest = false;
  }
  if (d.shouldResetPendingAction) {
    this->pendingActionType = PENDING_ACTION_NONE;
  }
  if (d.shouldHideFormsModal) {
    this->ui.resourceDetailsHideFormsModal();
  }
  if (d.shouldHideActionProgress) {
    this->ui.resourceDetailsHideActionProgress();
  }
  if (d.shouldEndActionPause) {
    this->endActionPause();
  }
}

void Application::onActionResult(const String &eventType) {
  ResourceController::SessionActionResultDecision d =
      this->resourceController.evaluateSessionActionResult(
          eventType == "START_RESOURCE_USAGE_SESSION" ||
          eventType == "STOP_RESOURCE_USAGE_SESSION");
  if (d.shouldResetPendingAction) {
    this->pendingActionType = PENDING_ACTION_NONE;
  }
  if (d.shouldClearPendingFormRequest) {
    this->hasPendingFormRequest = false;
  }
  if (d.shouldHideFormsModal) {
    this->ui.resourceDetailsHideFormsModal();
  }
}

void Application::handleTouch(int16_t x, int16_t y) {
  if (this->state == APPLICATION_STATE_UNLOCKED) {
    this->restartSessionTimeout();
  }
}

void Application::restartSessionTimeout() {
  uint32_t now = millis();
  this->ui.resourceDetailsSetSessionTimeoutTime(
      this->sessionController.computeSessionTimeoutDeadlineMs(
          now, this->UNLOCKED_TIMEOUT_MS));
  this->timeOfUnlockedMs = now;
  this->resetPauseAccounting();
}

void Application::handleResourceDetailsButtonClick(
    ResourceDetailsScreen::ButtonClickEventData evt) {
  this->logger.infof("Resource details button clicked: %d",
                     evt.buttonClickType);

  ResourceController::ActionIntent intent = ResourceController::ACTION_INTENT_NONE;
  switch (evt.buttonClickType) {
  case ResourceDetailsScreen::BUTTON_CLICK_TYPE_START_SESSION:
    intent = ResourceController::ACTION_INTENT_START_SESSION;
    break;
  case ResourceDetailsScreen::BUTTON_CLICK_TYPE_STOP_SESSION:
    intent = ResourceController::ACTION_INTENT_STOP_SESSION;
    break;
  case ResourceDetailsScreen::BUTTON_CLICK_TYPE_LOCK_DOOR:
    intent = ResourceController::ACTION_INTENT_LOCK_DOOR;
    break;
  case ResourceDetailsScreen::BUTTON_CLICK_TYPE_UNLOCK_DOOR:
    intent = ResourceController::ACTION_INTENT_UNLOCK_DOOR;
    break;
  case ResourceDetailsScreen::BUTTON_CLICK_TYPE_UNLATCH_DOOR:
    intent = ResourceController::ACTION_INTENT_UNLATCH_DOOR;
    break;
  case ResourceDetailsScreen::BUTTON_CLICK_TYPE_FLOW_BUTTON:
    intent = ResourceController::ACTION_INTENT_FLOW_BUTTON;
    break;
  case ResourceDetailsScreen::BUTTON_CLICK_TYPE_LOGOUT:
    intent = ResourceController::ACTION_INTENT_LOGOUT;
    break;
  }

  ResourceController::ActionIntentDecision d =
      this->resourceController.evaluateActionIntent(
          intent, this->state == APPLICATION_STATE_UNLOCKED, this->resourceCount);
  if (d.shouldIgnore) {
    return;
  }

  if (d.shouldShowActionProgress && d.actionProgressMessage) {
    this->ui.resourceDetailsShowActionProgress(d.actionProgressMessage);
  }
  if (d.shouldBeginActionPause) {
    this->beginActionPause();
  }
  if (d.shouldSetPendingAction) {
    this->pendingActionType = (pending_action_t)d.pendingActionType;
  }
  if (d.pendingActionType == PENDING_ACTION_START_SESSION) {
    this->pendingActionResourceId = this->selectedResourceId;
    this->pendingActionProjectId = this->selectedProjectId;
  } else if (d.pendingActionType == PENDING_ACTION_STOP_SESSION) {
    this->pendingActionResourceId = this->selectedResourceId;
    this->pendingActionProjectId = 0;
  }
  if (d.shouldResetPendingFormRequest) {
    this->hasPendingFormRequest = false;
  }
  if (d.shouldClearResourceSelection) {
    this->resourceIsSelected = false;
  }
  if (d.shouldLock) {
    this->unlocked = false;
  }
  if (d.shouldClearProjectsUser) {
    this->currentProjectsUser = "";
  }
  if (d.shouldClearProjectSelection) {
    this->clearProjectSelection();
  }
  if (d.shouldHideFormsModal) {
    this->ui.resourceDetailsHideFormsModal();
  }

  if (d.shouldApiStartSession) {
    this->api.startResourceUsageSession(this->selectedResourceId,
                                        this->selectedProjectId);
  } else if (d.shouldApiStopSession) {
    this->api.stopResourceUsageSession(this->selectedResourceId);
  } else if (d.shouldApiLockDoor) {
    this->api.lockDoor(this->selectedResourceId);
  } else if (d.shouldApiUnlockDoor) {
    this->api.unlockDoor(this->selectedResourceId);
  } else if (d.shouldApiUnlatchDoor) {
    this->api.unlatchDoor(this->selectedResourceId);
  } else if (d.shouldApiTriggerFlowButton) {
    this->api.triggerFlowButton(this->selectedResourceId, evt.flowButtonId);
  }
}

void Application::restartResourceSelectionTimeout() {
  uint32_t now = millis();
  this->timeOfResourceSelectionMs = now;
}

void Application::beginActionPause() {
  this->actionInProgressCount++;
  if (this->sessionController.shouldPauseSessionTimeoutOnActionBegin(
          this->actionInProgressCount)) {
    this->pauseStartMs = millis();
    // Freeze the UI indicator
    this->ui.resourceDetailsSetSessionTimeoutPaused(true);
  }
}

void Application::endActionPause() {
  if (this->sessionController.shouldIgnoreActionPauseEnd(
          this->actionInProgressCount)) {
    return;
  }
  this->actionInProgressCount--;
  if (this->sessionController.shouldApplyPauseDeltaOnActionEnd(
          this->actionInProgressCount)) {
    uint32_t now = millis();
    uint32_t delta =
        this->sessionController.computePauseDeltaMs(now, this->pauseStartMs);
    this->accumulatedPauseMs += delta;
    // Extend the UI deadline by the same delta and unfreeze
    this->ui.resourceDetailsExtendSessionTimeoutBy(delta);
    this->ui.resourceDetailsSetSessionTimeoutPaused(false);
  }
}

void Application::resetPauseAccounting() {
  this->sessionController.resetPauseAccounting(
      this->pauseStartMs, this->accumulatedPauseMs, this->actionInProgressCount);
  // Ensure not paused visually
  this->ui.resourceDetailsSetSessionTimeoutPaused(false);
}

void Application::resetSessionOnDisconnect() {
  SessionController::DisconnectResetDecision disconnectResetDecision =
      this->sessionController.evaluateDisconnectReset(
          this->unlocked, this->resourceIsSelected,
          this->pendingActionType != PENDING_ACTION_NONE,
          this->hasPendingFormRequest, this->pendingFormRequestReady,
          this->currentProjectsUser.length() > 0);

  if (!disconnectResetDecision.shouldResetSession) {
    return;
  }

  this->logger.info("Connectivity lost; resetting session state");

  if (disconnectResetDecision.shouldHideActionProgress) {
    this->ui.resourceDetailsHideActionProgress();
  }
  if (disconnectResetDecision.shouldHideFormsModal) {
    this->ui.resourceDetailsHideFormsModal();
  }
  if (disconnectResetDecision.shouldResetPauseAccounting) {
    this->resetPauseAccounting();
  }

  if (disconnectResetDecision.shouldResetPendingAction) {
    this->pendingActionType = PENDING_ACTION_NONE;
    this->pendingActionResourceId = 0;
    this->pendingActionProjectId = 0;
  }
  if (disconnectResetDecision.shouldClearPendingFormRequest) {
    this->hasPendingFormRequest = false;
    this->pendingFormRequestReady = false;
  }
  if (disconnectResetDecision.shouldClearProjectSelection) {
    this->clearProjectSelection();
  }
  if (disconnectResetDecision.shouldClearProjectsUser) {
    this->currentProjectsUser = "";
  }
  if (disconnectResetDecision.shouldClearSelection) {
    this->selectedResourceId = 0;
    this->resourceIsSelected = false;
    this->selectedResourceChanged = false;
  }
  if (disconnectResetDecision.shouldLock) {
    this->unlocked = false;
  }
  if (disconnectResetDecision.shouldClearExternalState) {
    this->externalState = EXTERNAL_STATE_NONE;
  }
  if (disconnectResetDecision.shouldEnableCardDetection) {
    this->nfc.enableCardDetection();
  }
}
#endif