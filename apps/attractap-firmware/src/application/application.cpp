#include "application.hpp"
#include "../app/runtime/telemetry/loop_metrics.hpp"
#include "../debug/loopTiming.hpp"
#ifdef ESP_PLATFORM
#include "esp_heap_caps.h"
#include "freertos/task.h"
#endif

void Application::bindEventHandlers() {
  this->eventBus.onResourceListUpdated(
      [this](const app::events::ResourceListUpdatedEvent &event) {
#ifdef HAS_LVGL_DISPLAY
        this->handleResourceListUpdate(event.resourceList);
#else
        if (event.resourceList.count > 0) {
          this->selectedResourceId = event.resourceList.items[0].id;
          this->resourceIsDoor = event.resourceList.items[0].type == 1;
        }
#endif
      });

  this->eventBus.onCardAuthDetails(
      [this](const app::events::CardAuthDetailsEvent &event) {
        AuthController::CardDetailsDecision d =
            this->authController.handleCardDetails(event.response,
                                                   this->currentProjectsUser);
        if (d.shouldBeepError) {
          if (event.response.error.length() > 0) {
            this->logger.errorf("Authentication failed: %s",
                                event.response.error.c_str());
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
          return;
        }

        this->cardAuthenticationData = event.response;
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
      });

#ifdef HAS_LVGL_DISPLAY
  this->eventBus.onEnrollGetAvailableKeyNo(
      [this](const app::events::EnrollGetAvailableKeyNoEvent &event) {
        this->apiEnrollNewCardGetAvailableKeyNoData = {
            .username = event.username,
        };
        this->externalState = EXTERNAL_STATE_ENROLL_NEW_CARD_GET_AVAILABLE_KEY_NO;
      });

  this->eventBus.onEnrollNewCard(
      [this](const app::events::EnrollNewCardEvent &event) {
        uint8_t keyBytes[16] = {0};
        stringToHexArray(event.key, keyBytes, 16);
        this->apiEnrollNewCardData = {
            .keyNo = event.keyNo,
            .keyBytes = {0},
        };
        memcpy(this->apiEnrollNewCardData.keyBytes, keyBytes, 16);
        this->externalState = EXTERNAL_STATE_ENROLL_NEW_CARD;
      });

  this->eventBus.onProjectsResponse(
      [this](const app::events::ProjectsResponseEvent &event) {
        this->projectsOfUserResponse = event.response;
        this->projectsCurrentPage = event.response.page;
        this->projectsTotalCount = event.response.total;
        this->projectsHasMore = event.response.hasMore;
        this->projectsOfUserResponseUpdated = true;
      });

  this->eventBus.onResourceFormsRequest(
      [this](const app::events::ResourceFormsRequestEvent &event) {
        this->pendingFormRequest = event.request;
        this->handleFormsRequest(this->pendingFormRequest);
      });
#endif

  this->eventBus.onFirmwareMeta([this](const app::events::FirmwareMetaEvent &event) {
    UpdateController::FirmwareMetaEventDecision decision =
        this->updateController.evaluateFirmwareMetaEvent(true);
    if (decision.shouldSetExternalFirmwareUpdateState) {
      this->externalState = EXTERNAL_STATE_FIRMWARE_UPDATE;
    }
    if (decision.shouldStoreAvailableVersion) {
      this->availableFirmwareVersion = event.availableVersion;
    }
  });

  this->eventBus.onFirmwareProgress(
      [this](const app::events::FirmwareProgressEvent &event) {
        UpdateController::FirmwareProgressEventDecision decision =
            this->updateController.evaluateFirmwareProgressEvent(true);
        if (decision.shouldLogProgress) {
          this->logger.debugf("Got firmware update pct %d", event.progressPct);
        }
        if (decision.shouldSetExternalFirmwareUpdateState) {
          this->externalState = EXTERNAL_STATE_FIRMWARE_UPDATE;
        }
        if (decision.shouldStoreProgress) {
          this->firmwareUpdateProgressPct = event.progressPct;
        }
      });
}

void Application::processAppEvents() { this->eventBus.poll(); }

void Application::logAppEventQueueHealth() { this->eventBus.logHealth(); }

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

  this->settings.setup();
  this->serialCommand.setup();
  this->network.setup();
  this->beeper.setup();

#ifdef HAS_LVGL_DISPLAY
  this->ui.setup();
#endif

  if (!this->nfc.setup()) {
#ifdef HAS_LVGL_DISPLAY
    this->state = APPLICATION_STATE_NFC_INIT_FAILED;
    this->ui.showNfcInitErrorPopup(
        "NFC Error", "NFC hardware not found. Check connection and retry.",
        [this]() { this->retryNfcSetup(); }, [this]() { this->system.restart(); });
#else
    this->logger.error("NFC hardware not found, restarting in 5 seconds");
    this->system.delayMs(5000);
    this->system.restart();
#endif
  }
  this->api.setup();
  if (!this->eventBus.setup()) {
    this->logger.error("EventBus queue init failed");
  }
  this->bindEventHandlers();

#ifdef HAS_LVGL_DISPLAY
  this->api.onDeviceName(
      [this](String deviceName) { this->ui.setDeviceName(deviceName); });
#endif
  this->api.setResourceListUpdateCallback(
      [this](const API::ResourceList &resourceList) {
        app::events::ResourceListUpdatedEvent event;
        event.resourceList = resourceList;
        this->eventBus.publish(event);
      });

  this->api.setCardAuthenticationDetailsResponseCallback(
      [this](API::CardAuthenticationDetailsResponse response) {
        app::events::CardAuthDetailsEvent event;
        event.response = response;
        this->eventBus.publish(event);
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
    app::events::FirmwareMetaEvent event;
    event.availableVersion = availableVersion;
    this->eventBus.publish(event);
  });

  this->api.setFirmwareUpdateProgressCallback([this](int percent) {
    app::events::FirmwareProgressEvent event;
    event.progressPct = percent;
    this->eventBus.publish(event);
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
      [this](String pin) { this->settings.setDevicePin(pin); });

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
    app::events::EnrollGetAvailableKeyNoEvent event;
    event.username = username;
    this->eventBus.publish(event);
  });

  this->api.setEnrollNewCardCallback([this](uint8_t keyNo, String key) {
    app::events::EnrollNewCardEvent event;
    event.keyNo = keyNo;
    event.key = key;
    this->eventBus.publish(event);
  });

  this->api.setProjectsOfUserResponseCallback(
      [this](const API::ProjectsOfUserResponse &projectsOfUserResponse) {
        app::events::ProjectsResponseEvent event;
        event.response = projectsOfUserResponse;
        this->eventBus.publish(event);
      });

  this->api.setResourceFormsRequestCallback(
      [this](const API::ResourceUsageFormRequest &request) {
        app::events::ResourceFormsRequestEvent event;
        event.request = request;
        this->eventBus.publish(event);
      });
#endif

  auto cardDetectionCallback = [this](uint8_t *uid, uint8_t uidLength) {
    this->logger.infof("Card detected: %s",
                       hexToString(uid, uidLength).c_str());

#ifndef HAS_LVGL_DISPLAY
    this->cardDetected = true;
    this->cardRemoved = false;
    this->cardPresentationWasLong = false;
    this->cardDetectionTimeMs = this->system.nowMs();
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

  this->runtimeWorkers.start(this->network, this->api, this->nfc);

#ifdef HAS_LVGL_DISPLAY
  this->bootTime = this->system.nowMs();
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

  this->serialCommand.loop();

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
  metricsWindow.maybeLogAndReset(this->system.nowMs());
#endif
}

#ifdef HAS_LVGL_DISPLAY
void Application::retryNfcSetup() {
  if (this->nfc.setup()) {
    this->state = APPLICATION_STATE_INIT;
  } else {
    this->ui.showNfcInitErrorPopup(
        "NFC Error", "NFC hardware not found. Check connection and retry.",
        [this]() { this->retryNfcSetup(); }, [this]() { this->system.restart(); });
  }
}
#endif

bool Application::handleConfigurationAndConnectivityGates() {
  AttraccessApiConfig attraccessApiConfig = this->settings.getAttraccessApiConfig();
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
    return true;
  }

  ConnectivitySnapshot connectivitySnapshot = this->connectivityState.getSnapshot();
  ConnectivityController::ConnectivityStateDecision connectivityDecision =
      this->connectivityController.evaluateConnectivityState(
          connectivitySnapshot.apiAuthenticated,
          connectivitySnapshot.networkConnected,
          connectivitySnapshot.websocketConnected,
          this->state == APPLICATION_STATE_INIT,
          this->state == APPLICATION_STATE_CONFIGURATION_REQUIRED,
#ifdef HAS_LVGL_DISPLAY
          true
#else
          false
#endif
      );
  if (!connectivityDecision.shouldHandleDisconnectedState) {
    return false;
  }
#ifdef HAS_LVGL_DISPLAY
  if (connectivityDecision.shouldResetSessionOnDisconnect) {
    this->resetSessionOnDisconnect();
  }
#endif
  if (connectivityDecision.shouldEnterInitState) {
    this->logger.debug("API/network/websocket disconnected, showing init screen");
    this->state = APPLICATION_STATE_INIT;
  }
#ifdef HAS_LVGL_DISPLAY
  if (connectivityDecision.shouldTransitionToInitScreen) {
    this->ui.transitionToInitScreen();
  }
#endif
  return true;
}

#ifdef HAS_LVGL_DISPLAY
bool Application::handleDisplayBootAndPinGates() {
  if (!this->bootDone &&
      this->system.nowMs() - this->bootTime > APPLICATION_BOOT_SCREEN_DURATION) {
    this->logger.debug("Boot screen duration reached, hiding boot screen");
    this->bootDone = true;
  }

  if (!this->bootDone) {
    return true;
  }

  bool pinIsSet = this->settings.getDeviceConfig().passCode != "0000";
  if (pinIsSet) {
    return false;
  }
  if (this->state == APPLICATION_STATE_PIN_NOT_SET) {
    return true;
  }

  this->logger.debug("PIN is not set, showing pin screen");
  this->state = APPLICATION_STATE_PIN_NOT_SET;
  this->ui.transitionToSetPinScreen();
  return true;
}

bool Application::handleEnrollmentTransitions() {
  AuthController::EnrollGetAvailableTransitionDecision enrollGetAvailableDecision =
      this->authController.evaluateEnrollGetAvailableTransition(
          this->externalState == EXTERNAL_STATE_ENROLL_NEW_CARD_GET_AVAILABLE_KEY_NO,
          this->state == APPLICATION_STATE_ENROLLMENT, this->system.nowMs(),
          this->apiEnrollNewCardGetAvailableKeyNoStartTimeMs, 30000);
  if (enrollGetAvailableDecision.shouldHandle) {
    if (enrollGetAvailableDecision.shouldTimeout) {
      this->logger.error("Enroll new card get available key number timeout reached");
      this->externalState = EXTERNAL_STATE_NONE;
      return true;
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
      return true;
    }
    if (enrollGetAvailableDecision.shouldPrepareEnrollment) {
      this->nfc.disableCardDetection();
      this->ui.enrollmentSetUserName(
          this->apiEnrollNewCardGetAvailableKeyNoData.username);
      this->apiEnrollNewCardGetAvailableKeyNoStartTimeMs = this->system.nowMs();
      this->ui.enrollmentSetTimeoutTime(
          this->apiEnrollNewCardGetAvailableKeyNoStartTimeMs + 30000);
      this->ui.transitionToEnrollmentScreen();
    }
    if (enrollGetAvailableDecision.shouldEnterEnrollmentState) {
      this->state = APPLICATION_STATE_ENROLLMENT;
    }
    return true;
  }

  AuthController::EnrollNewCardTransitionDecision enrollNewCardDecision =
      this->authController.evaluateEnrollNewCardTransition(
          this->externalState == EXTERNAL_STATE_ENROLL_NEW_CARD,
          this->state == APPLICATION_STATE_ENROLLMENT);
  if (!enrollNewCardDecision.shouldHandle) {
    return false;
  }
  if (enrollNewCardDecision.shouldEnableCardDetection) {
    this->nfc.enableCardDetection();
  }
  if (enrollNewCardDecision.shouldEnterEnrollmentState) {
    this->state = APPLICATION_STATE_ENROLLMENT;
  }
  return true;
}
#else
void Application::handleNonDisplayPresentationSignal() {
  SessionController::NonDisplayPresentationDecision nonDisplayPresentation =
      this->sessionController.evaluateNonDisplayPresentation(
          this->cardDetected, this->cardRemoved, this->system.nowMs(),
          this->cardDetectionTimeMs,
          NFC_CARD_LONG_PRESENTATION_TIME_MS, this->cardPresentationWasLong);
  if (nonDisplayPresentation.shouldIndicateLongPresentation) {
    this->beeper.indicateBeep();
  }
  if (nonDisplayPresentation.shouldMarkLongPresentation) {
    this->cardPresentationWasLong = true;
  }
}
#endif

bool Application::handleExternalAuthTransition() {
  if (this->externalState != EXTERNAL_STATE_AUTHENTICATE_CARD) {
    return false;
  }
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
    return true;
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
    this->processCardAuthenticationData();
  }
  if (authTransitionDecision.shouldEnableCardDetection) {
    this->nfc.enableCardDetection();
  }
  return true;
}

bool Application::handleExternalFirmwareUpdateTransition() {
  if (this->externalState != EXTERNAL_STATE_FIRMWARE_UPDATE) {
    return false;
  }
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
  if (!firmwareDecision.shouldHandle) {
    return false;
  }
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
  return true;
}

#ifdef HAS_LVGL_DISPLAY
bool Application::handleDisplayResourceAndSessionFlow() {
  ResourceController::ResourceAvailabilityDecision resourceDecision =
      this->resourceController.evaluateResourceAvailability(
          this->resourceCount, this->resourceIsSelected, this->resourceListUpdated,
          this->state == APPLICATION_STATE_NO_RESOURCES,
          this->state == APPLICATION_STATE_RESOURCE_LIST);
  if (resourceDecision.shouldShowNoResources) {
    this->logger.debug("Resource count is 0, showing no resources screen");
    this->state = APPLICATION_STATE_NO_RESOURCES;
    this->ui.transitionToNoResourcesScreen();
    return true;
  }
  if (resourceDecision.shouldAutoSelectSingleResource) {
    this->logger.debug(
        "Resource count is 1 and resource is not selected, selecting resource");
    this->selectResource(resourceList.items[0]);
    return true;
  }
  if (resourceDecision.shouldUpdateResourceListUi) {
    this->ui.resourceListSetResourceList(this->resourceList);
    this->resourceListUpdated = false;
  }
  if (resourceDecision.shouldReturnEarly) {
    return true;
  }
  if (resourceDecision.shouldShowResourceList) {
    this->logger.debug("Resource count is greater than 0 and resource is not "
                       "selected, showing resource list");
    this->state = APPLICATION_STATE_RESOURCE_LIST;
    this->ui.transitionToResourceListScreen();
    return true;
  }

  if (this->selectedResourceChanged) {
    for (uint16_t i = 0; i < this->resourceList.count; ++i) {
      if (this->resourceList.items[i].id == this->selectedResourceId) {
        API::ResourceBrief resource = this->resourceList.items[i];
        this->ui.lockscreenSetResourceName(resource.name);
        this->ui.lockscreenSetUsageInfo(resource.hasActiveUsage, resource.activeUser);
        this->ui.resourceDetailsSetResourceAndUsageDetails(resource);
        break;
      }
    }
    this->selectedResourceChanged = false;
  }

  uint32_t now = this->system.nowMs();
  if (!this->unlocked) {
    SessionController::LockedStateDecision lockedDecision =
        this->sessionController.evaluateLockedState(
            this->unlocked, this->state == APPLICATION_STATE_LOCKED, now,
            this->timeOfResourceSelectionMs, this->RESOURCE_SELECTION_TIMEOUT_MS);
    if (lockedDecision.shouldClearResourceSelection) {
      this->logger.debug("Resource selection timeout reached, showing resource list");
      this->resourceIsSelected = false;
    }
    if (lockedDecision.shouldReturnEarly) {
      return true;
    }
    if (lockedDecision.shouldTransitionToLocked) {
      this->logger.debug("Card is not detected, showing lockscreen");
      this->state = APPLICATION_STATE_LOCKED;
      this->ui.transitionToLockscreen([this]() {
        this->logger.debug(
            "Lockscreen transition complete, enabling card detection");
        this->nfc.enableCardDetection();
      });
    }
    return true;
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
      this->ui.resourceDetailsSetProjects(this->projectsOfUserResponse);
      this->ui.resourceDetailsSetSelectedProject(
          this->selectedProjectId, this->selectedProjectName.c_str());
      this->projectsOfUserResponseUpdated = false;
    }
    return true;
  }

  this->logger.debug("Resource is unlocked, showing resource details screen");
  this->state = APPLICATION_STATE_UNLOCKED;
  this->restartSessionTimeout();
  this->ui.transitionToResourceDetailsScreen();
  return true;
}
#else
bool Application::handleNonDisplayActionFlow() {
  SessionController::NonDisplayFlowDecision nonDisplayDecision =
      this->sessionController.evaluateNonDisplayFlow(
          this->state == APPLICATION_STATE_AUTHENTICATE_CARD,
          this->state == APPLICATION_STATE_WAIT_FOR_CARD, this->cardDetected,
          this->unlocked, this->cardRemoved);
  if (nonDisplayDecision.shouldReturnEarly) {
    return true;
  }
  if (nonDisplayDecision.shouldProcessAction) {
    this->logger.debug("Card detected and removed and unlocked, processing");
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
      return true;
    }

    this->state = APPLICATION_STATE_WAIT_FOR_CARD;
    this->nfc.enableCardDetection();
    return true;
  }
  if (nonDisplayDecision.shouldTransitionToWaitForCard) {
    this->logger.debug("Waiting for card detection");
    this->state = APPLICATION_STATE_WAIT_FOR_CARD;
    this->nfc.enableCardDetection();
    return true;
  }
  return false;
}
#endif

void Application::processState() {
#ifdef HAS_LVGL_DISPLAY
  if (this->state == APPLICATION_STATE_NFC_INIT_FAILED) {
    return;
  }
#endif

  if (this->handleConfigurationAndConnectivityGates()) {
    return;
  }

#ifdef HAS_LVGL_DISPLAY
  if (this->handleDisplayBootAndPinGates()) {
    return;
  }
  if (this->handleEnrollmentTransitions()) {
    return;
  }
#else
  this->handleNonDisplayPresentationSignal();
#endif

  if (this->handleExternalAuthTransition()) {
    return;
  }
  if (this->handleExternalFirmwareUpdateTransition()) {
    return;
  }

#ifdef HAS_LVGL_DISPLAY
  (void)this->handleDisplayResourceAndSessionFlow();
#else
  (void)this->handleNonDisplayActionFlow();
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
  this->settings.saveNetworkConfig(cfg.ssid, cfg.password);
  this->settings.saveAttraccessApiConfig(hostname, port.toInt(), cfg.useSSL);

  this->settings.setDevicePin(cfg.devicePin);
  this->settings.setBeeperEnabled(cfg.beeperEnabled);
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
  uint32_t now = this->system.nowMs();
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
  uint32_t now = this->system.nowMs();
  this->timeOfResourceSelectionMs = now;
}

void Application::beginActionPause() {
  this->actionInProgressCount++;
  if (this->sessionController.shouldPauseSessionTimeoutOnActionBegin(
          this->actionInProgressCount)) {
    this->pauseStartMs = this->system.nowMs();
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
    uint32_t now = this->system.nowMs();
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