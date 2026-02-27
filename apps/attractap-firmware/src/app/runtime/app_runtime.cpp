#include "app_runtime.hpp"
#include "../../utils.hpp"
#include "telemetry/loop_metrics.hpp"
#include "../../debug/loopTiming.hpp"
#ifdef ESP_PLATFORM
#include "esp_ota_ops.h"
#include "esp_partition.h"
#include "freertos/task.h"
#endif
#ifdef HAS_LVGL_DISPLAY
#include "lvgl.h"
#endif

namespace app::runtime {

AppRuntime::AppRuntime(
    INfcPort &nfc, IApiPort &api, IBeeperPort &beeper, ISettingsPort &settings,
    ISystemPort &system, INetworkPort &network,
    ISerialCommandPort &serialCommand,
    IConnectivityStatePort &connectivityState,
    AuthController &authController,
    ConnectivityController &connectivityController,
    ResourceController &resourceController,
    SessionController &sessionController, UpdateController &updateController,
    app::events::EventBus &eventBus, RuntimeWorkers &runtimeWorkers
#ifdef HAS_LVGL_DISPLAY
    ,
    IUiPort &ui
#endif
    )
    : nfc_(nfc), api_(api), beeper_(beeper), settings_(settings), system_(system),
      network_(network), serialCommand_(serialCommand),
      connectivityState_(connectivityState), authController_(authController),
      connectivityController_(connectivityController),
      resourceController_(resourceController),
      sessionController_(sessionController), updateController_(updateController),
      eventBus_(eventBus), runtimeWorkers_(runtimeWorkers)
#ifdef HAS_LVGL_DISPLAY
      ,
      ui_(ui)
#endif
{
  state_.state = AppRuntimeState::APPLICATION_STATE_INIT;
}

void AppRuntime::handleResourceListUpdated(
    const app::events::ResourceListUpdatedEvent &event) {
#ifdef HAS_LVGL_DISPLAY
  handleResourceListUpdate(event.resourceList);
#else
  if (event.resourceList.count > 0) {
    state_.selectedResourceId = event.resourceList.items[0].id;
    state_.resourceIsDoor = event.resourceList.items[0].type == 1;
  }
#endif
}

void AppRuntime::handleCardAuthDetails(
    const app::events::CardAuthDetailsEvent &event) {
  AuthController::CardDetailsDecision d =
      authController_.handleCardDetails(event.response, state_.currentProjectsUser);
  if (d.shouldBeepError) {
    if (event.response.error.length() > 0) {
      logger_.errorf("Authentication failed: %s", event.response.error.c_str());
    } else {
      logger_.error("Invalid key bytes provided");
    }
    beeper_.errorBeep();
  }
  if (d.shouldEnableCardDetection) {
    nfc_.enableCardDetection();
  }
  if (!d.valid) {
    state_.externalState = AppRuntimeState::EXTERNAL_STATE_AUTHENTICATE_CARD;
    return;
  }

  state_.cardAuthenticationData = event.response;
#ifdef HAS_LVGL_DISPLAY
  if (d.shouldClearProjectSelection) {
    clearProjectSelection();
  }
  state_.currentProjectsUser = d.username;
  if (d.shouldRequestProjects) {
    requestProjectsPage(1);
  }
#endif
  if (d.shouldSetExternalAuthenticateState) {
    state_.externalState = AppRuntimeState::EXTERNAL_STATE_AUTHENTICATE_CARD;
  }
}

#ifdef HAS_LVGL_DISPLAY
void AppRuntime::handleEnrollGetAvailableKeyNo(
    const app::events::EnrollGetAvailableKeyNoEvent &event) {
  state_.apiEnrollNewCardGetAvailableKeyNoData = {.username = event.username};
  state_.externalState =
      AppRuntimeState::EXTERNAL_STATE_ENROLL_NEW_CARD_GET_AVAILABLE_KEY_NO;
}

void AppRuntime::handleEnrollNewCard(
    const app::events::EnrollNewCardEvent &event) {
  uint8_t keyBytes[16] = {0};
  stringToHexArray(event.key, keyBytes, 16);
  state_.apiEnrollNewCardData = {
      .keyNo = event.keyNo,
      .keyBytes = {0},
  };
  memcpy(state_.apiEnrollNewCardData.keyBytes, keyBytes, 16);
  state_.externalState = AppRuntimeState::EXTERNAL_STATE_ENROLL_NEW_CARD;
}

void AppRuntime::handleProjectsResponse(
    const app::events::ProjectsResponseEvent &event) {
  state_.projectsOfUserResponse = event.response;
  state_.projectsCurrentPage = event.response.page;
  state_.projectsTotalCount = event.response.total;
  state_.projectsHasMore = event.response.hasMore;
  state_.projectsOfUserResponseUpdated = true;
}

void AppRuntime::handleResourceFormsRequest(
    const app::events::ResourceFormsRequestEvent &event) {
  state_.pendingFormRequest = event.request;
  handleFormsRequest(state_.pendingFormRequest);
}
#endif

void AppRuntime::handleFirmwareMeta(const app::events::FirmwareMetaEvent &event) {
  UpdateController::FirmwareMetaEventDecision decision =
      updateController_.evaluateFirmwareMetaEvent(true);
  if (decision.shouldSetExternalFirmwareUpdateState) {
    state_.externalState = AppRuntimeState::EXTERNAL_STATE_FIRMWARE_UPDATE;
  }
  if (decision.shouldStoreAvailableVersion) {
    state_.availableFirmwareVersion = event.availableVersion;
  }
}

void AppRuntime::handleFirmwareProgress(
    const app::events::FirmwareProgressEvent &event) {
  UpdateController::FirmwareProgressEventDecision decision =
      updateController_.evaluateFirmwareProgressEvent(true);
  if (decision.shouldLogProgress) {
    logger_.debugf("Got firmware update pct %d", event.progressPct);
  }
  if (decision.shouldSetExternalFirmwareUpdateState) {
    state_.externalState = AppRuntimeState::EXTERNAL_STATE_FIRMWARE_UPDATE;
  }
  if (decision.shouldStoreProgress) {
    state_.firmwareUpdateProgressPct = event.progressPct;
  }
}

void AppRuntime::setup() {
#ifdef ESP_PLATFORM
  const esp_partition_t *running = esp_ota_get_running_partition();
  esp_ota_img_states_t ota_state;
  if (esp_ota_get_state_partition(running, &ota_state) == ESP_OK) {
    if (ota_state == ESP_OTA_IMG_PENDING_VERIFY) {
      esp_ota_mark_app_valid_cancel_rollback();
    }
  }
#endif

  settings_.setup();
  serialCommand_.setup();
  network_.setup();
  beeper_.setup();

#ifdef HAS_LVGL_DISPLAY
  ui_.setup();
#endif

  if (!nfc_.setup()) {
#ifdef HAS_LVGL_DISPLAY
    state_.state = AppRuntimeState::APPLICATION_STATE_NFC_INIT_FAILED;
    ui_.showNfcInitErrorPopup(
        "NFC Error", "NFC hardware not found. Check connection and retry.",
        [this]() { retryNfcSetup(); }, [this]() { system_.restart(); });
#else
    logger_.error("NFC hardware not found, restarting in 5 seconds");
    system_.delayMs(5000);
    system_.restart();
#endif
  }
  api_.setup();
  if (!eventBus_.setup()) {
    logger_.error("EventBus queue init failed");
  }
  eventRouter_.bind(eventBus_, *this);

#ifdef HAS_LVGL_DISPLAY
  api_.onDeviceName(
      [this](String deviceName) { ui_.setDeviceName(deviceName); });
#endif
  api_.setResourceListUpdateCallback(
      [this](const API::ResourceList &resourceList) {
        app::events::ResourceListUpdatedEvent event;
        event.resourceList = resourceList;
        eventBus_.publish(event);
      });

  api_.setCardAuthenticationDetailsResponseCallback(
      [this](API::CardAuthenticationDetailsResponse response) {
        app::events::CardAuthDetailsEvent event;
        event.response = response;
        eventBus_.publish(event);
      });

#ifdef HAS_LVGL_DISPLAY
  api_.setInsufficientBalanceCallback([this](bool sumUpEnabled) {
    beeper_.errorBeep();
    struct Payload {
      AppRuntime *self;
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
          p->self->ui_.resourceDetailsHideActionProgress();
          if (p->enabled) {
            p->self->ui_.showInsufficientBalancePopup(
                [self = p->self](uint32_t amountCents) {
                  self->api_.requestBillingTopup(amountCents);
                },
                []() {});
          } else {
            p->self->ui_.showErrorPopup("Fehler", "INSUFFICIENT_BALANCE");
          }
          delete p;
        },
        pl);
  });
#endif

  api_.setErrorCallback([this](const char *title, const char *message) {
    beeper_.errorBeep();

#ifdef HAS_LVGL_DISPLAY
    if (state_.state == AppRuntimeState::APPLICATION_STATE_LOCKED)
#else
    if (state_.state == AppRuntimeState::APPLICATION_STATE_WAIT_FOR_CARD)
#endif
    {
      nfc_.enableCardDetection();
    }

#ifdef HAS_LVGL_DISPLAY
    struct ErrPayload {
      AppRuntime *self;
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
          pl->self->ui_.resourceDetailsHideActionProgress();
          pl->self->ui_.showErrorPopup(pl->t, pl->m);
          if (pl && pl->self) {
            pl->self->state_.pendingActionType =
                AppRuntimeState::PENDING_ACTION_NONE;
            pl->self->state_.hasPendingFormRequest = false;
            pl->self->ui_.resourceDetailsHideFormsModal();
          }
          delete pl;
        },
        p);
#endif
  });

#ifdef HAS_LVGL_DISPLAY
  api_.setActionResultCallback([this](const char *type, bool success) {
    struct ActionResultPayload {
      AppRuntime *self;
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
          pl->self->ui_.resourceDetailsHideActionProgress();
          if (pl && pl->ok) {
            pl->self->ui_.resourceDetailsShowSuccessToast("Erfolgreich");
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

  api_.setFirmwareUpdateMetaCallback([this](String availableVersion) {
    app::events::FirmwareMetaEvent event;
    event.availableVersion = availableVersion;
    eventBus_.publish(event);
  });

  api_.setFirmwareUpdateProgressCallback([this](int percent) {
    app::events::FirmwareProgressEvent event;
    event.progressPct = percent;
    eventBus_.publish(event);
  });

#ifdef HAS_LVGL_DISPLAY
  ui_.resourceDetailsSetButtonClickCallback(
      [this](ResourceDetailsScreen::ButtonClickEventData evt) {
        handleResourceDetailsButtonClick(evt);
      });

  ui_.resourceDetailsSetProjectsPageRequestCallback(
      [this](uint32_t page) { requestProjectsPage(page); });
  ui_.resourceDetailsSetProjectSelectionCallback(
      [this](uint32_t projectId, const String &projectName) {
        handleProjectSelection(projectId, projectName);
      });
  ui_.resourceDetailsSetFormsSubmitCallback(
      [this](const API::FormSubmissionList &submissions) {
        handleFormsSubmit(submissions);
      });
  ui_.resourceDetailsSetFormsCancelCallback([this]() { handleFormsCancel(); });

  ui_.setPinOnConfirmedCallback(
      [this](String pin) { settings_.setDevicePin(pin); });

  ui_.connectionConfigOnCancelPinLock([this]() {
    ConnectivityController::CancelPinLockDecision decision =
        connectivityController_.evaluateCancelPinLock(true);
    if (decision.shouldTransitionToInitScreen) {
      ui_.transitionToInitScreen();
    }
    if (decision.shouldEnterBootState) {
      state_.state = AppRuntimeState::APPLICATION_STATE_BOOT;
    }
    if (decision.shouldEnableConnectionAttempts) {
      api_.enableConnectionAttempts();
    }
  });

  ui_.connectionConfigOnSaveCallback(
      [this](const ConnectionConfigurationScreen::ConnectionConfig &cfg) {
        handleConnectionConfigurationSave(cfg);
      });

  ui_.initScreenOnOpenSettings([this]() {
    ConnectivityController::OpenSettingsDecision decision =
        connectivityController_.evaluateOpenSettingsRequest(true);
    if (decision.shouldEnterConfigurationRequiredState) {
      state_.state = AppRuntimeState::APPLICATION_STATE_CONFIGURATION_REQUIRED;
    }
    if (decision.shouldDisableConnectionAttempts) {
      api_.disableConnectionAttempts();
    }
    if (decision.shouldEnablePinLock) {
      ui_.connectionConfigEnablePinLock();
    }
    if (decision.shouldTransitionToConnectionConfigurationScreen) {
      ui_.transitionToConnectionConfigurationScreen();
    }
  });

  ui_.resourceListSetSelectionCallback(
      [this](const API::ResourceBrief &resource) {
        selectResource(resource);
      });

  ui_.setTouchCallback([this](int16_t x, int16_t y) { handleTouch(x, y); });

  api_.setEnrollNewCardGetAvailableKeyNoCallback([this](String username) {
    app::events::EnrollGetAvailableKeyNoEvent event;
    event.username = username;
    eventBus_.publish(event);
  });

  api_.setEnrollNewCardCallback([this](uint8_t keyNo, String key) {
    app::events::EnrollNewCardEvent event;
    event.keyNo = keyNo;
    event.key = key;
    eventBus_.publish(event);
  });

  api_.setProjectsOfUserResponseCallback(
      [this](const API::ProjectsOfUserResponse &projectsOfUserResponse) {
        app::events::ProjectsResponseEvent event;
        event.response = projectsOfUserResponse;
        eventBus_.publish(event);
      });

  api_.setResourceFormsRequestCallback(
      [this](const API::ResourceUsageFormRequest &request) {
        app::events::ResourceFormsRequestEvent event;
        event.request = request;
        eventBus_.publish(event);
      });
#endif

  auto cardDetectionCallback = [this](uint8_t *uid, uint8_t uidLength) {
    logger_.infof("Card detected: %s", hexToString(uid, uidLength).c_str());

#ifndef HAS_LVGL_DISPLAY
    state_.cardDetected = true;
    state_.cardRemoved = false;
    state_.cardPresentationWasLong = false;
    state_.cardDetectionTimeMs = system_.nowMs();
#endif

    bool currentlyLocked = false;
    bool currentlyWaitForCard = false;
    bool currentlyEnrollment = false;
#ifdef HAS_LVGL_DISPLAY
    currentlyLocked =
        state_.state == AppRuntimeState::APPLICATION_STATE_LOCKED;
    currentlyEnrollment =
        state_.state == AppRuntimeState::APPLICATION_STATE_ENROLLMENT;
#else
    currentlyWaitForCard =
        state_.state == AppRuntimeState::APPLICATION_STATE_WAIT_FOR_CARD;
#endif
    AuthController::CardDetectionDecision cardDetectionDecision =
        authController_.evaluateCardDetection(
#ifdef HAS_LVGL_DISPLAY
            true,
#else
            false,
#endif
            currentlyLocked, currentlyWaitForCard, currentlyEnrollment,
            state_.state == AppRuntimeState::APPLICATION_STATE_AUTHENTICATE_CARD);

    if (cardDetectionDecision.shouldRequestCardAuthenticationData) {
      api_.requestCardAuthenticationData(uid, uidLength, state_.selectedResourceId);
      return;
    }

#ifdef HAS_LVGL_DISPLAY
    if (cardDetectionDecision.shouldHandleEnrollmentCard) {
      bool success = nfc_.changeKey(
          state_.apiEnrollNewCardData.keyNo, NFC::FACTORY_KEY, NFC::FACTORY_KEY,
          state_.apiEnrollNewCardData.keyBytes);

      AuthController::EnrollCardWriteDecision enrollWriteDecision =
          authController_.evaluateEnrollCardWriteResult(success);
      if (enrollWriteDecision.shouldSuccessBeep) {
        beeper_.successBeep();
      }
      if (enrollWriteDecision.shouldErrorBeep) {
        beeper_.errorBeep();
      }
      if (enrollWriteDecision.shouldSendEnrollResult) {
        api_.sendEnrollNewCard(success);
      }
      if (enrollWriteDecision.shouldClearExternalState) {
        state_.externalState = AppRuntimeState::EXTERNAL_STATE_NONE;
      }
      return;
    }
#endif

    if (cardDetectionDecision.shouldProcessCardAuthenticationNow) {
      processCardAuthenticationData();
      return;
    }
  };
  nfc_.setCardDetectionCallback(cardDetectionCallback);

#ifndef HAS_LVGL_DISPLAY
  nfc_.setCardRemovalCallback([this](uint32_t presentationTimeMs) {
    logger_.debugf("Card removed after %d ms", presentationTimeMs);
    state_.cardRemoved = true;
    logger_.debugf("cardDetected: %d", state_.cardDetected);
    logger_.debugf("cardRemoved: %d", state_.cardRemoved);
    logger_.debugf("unlocked: %d", state_.unlocked);
    logger_.debugf("state: %d", static_cast<int>(state_.state));
  });
#endif

  runtimeWorkers_.start(network_, api_, nfc_);

#ifdef HAS_LVGL_DISPLAY
  state_.bootTime = system_.nowMs();
#endif
}

void AppRuntime::loop() {
#if defined(DEBUG_LOOP_TIMING) || defined(PERF_BASELINE_METRICS)
  LoopTiming t;
  uint32_t t0 = loopTimingNow();
#endif

#ifdef HAS_LVGL_DISPLAY
  ui_.loop();
  taskYIELD();
#endif

#if defined(DEBUG_LOOP_TIMING) || defined(PERF_BASELINE_METRICS)
  t.display_ms = loopTimingNow() - t0;
  t0 = loopTimingNow();
#endif

  serialCommand_.loop();

#if defined(DEBUG_LOOP_TIMING) || defined(PERF_BASELINE_METRICS)
  t.serial_ms = loopTimingNow() - t0;
  t0 = loopTimingNow();
#endif

  eventRouter_.poll(eventBus_);
  eventRouter_.logHealth(eventBus_);

#if defined(DEBUG_LOOP_TIMING) || defined(PERF_BASELINE_METRICS)
  t.nfc_ms = 0;
  t.api_ms = 0;
  t0 = loopTimingNow();
#endif

  processState();

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
  metricsWindow.maybeLogAndReset(system_.nowMs());
#endif
}

#ifdef HAS_LVGL_DISPLAY
void AppRuntime::retryNfcSetup() {
  if (nfc_.setup()) {
    state_.state = AppRuntimeState::APPLICATION_STATE_INIT;
  } else {
    ui_.showNfcInitErrorPopup(
        "NFC Error", "NFC hardware not found. Check connection and retry.",
        [this]() { retryNfcSetup(); }, [this]() { system_.restart(); });
  }
}
#endif

bool AppRuntime::handleConfigurationAndConnectivityGates() {
  AttraccessApiConfig attraaccessApiConfig =
      settings_.getAttraccessApiConfig();
  bool connectionIsConfigured = !attraaccessApiConfig.hostname.isEmpty() &&
                                attraaccessApiConfig.hostname != "" &&
                                attraaccessApiConfig.port > 0;

  ConnectivityController::ConnectionConfigurationDecision configDecision =
      connectivityController_.evaluateConnectionConfiguration(
          connectionIsConfigured,
          state_.state == AppRuntimeState::APPLICATION_STATE_CONFIGURATION_REQUIRED,
#ifdef HAS_LVGL_DISPLAY
          true
#else
          false
#endif
      );
  if (configDecision.shouldHandle) {
    if (configDecision.shouldEnterConfigurationRequiredState) {
      logger_.debug("Connection is not configured, showing connection "
                    "configuration screen");
      state_.state = AppRuntimeState::APPLICATION_STATE_CONFIGURATION_REQUIRED;
    }
    if (configDecision.shouldDisableConnectionAttempts) {
      api_.disableConnectionAttempts();
    }
#ifdef HAS_LVGL_DISPLAY
    if (configDecision.shouldDisablePinLock) {
      ui_.connectionConfigDisablePinLock();
    }
    if (configDecision.shouldTransitionToConnectionConfigurationScreen) {
      ui_.transitionToConnectionConfigurationScreen();
    }
#endif
    return true;
  }

  ConnectivitySnapshot connectivitySnapshot =
      connectivityState_.getSnapshot();
  ConnectivityController::ConnectivityStateDecision connectivityDecision =
      connectivityController_.evaluateConnectivityState(
          connectivitySnapshot.apiAuthenticated,
          connectivitySnapshot.networkConnected,
          connectivitySnapshot.websocketConnected,
          state_.state == AppRuntimeState::APPLICATION_STATE_INIT,
          state_.state == AppRuntimeState::APPLICATION_STATE_CONFIGURATION_REQUIRED,
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
    resetSessionOnDisconnect();
  }
#endif
  if (connectivityDecision.shouldEnterInitState) {
    logger_.debug("API/network/websocket disconnected, showing init screen");
    state_.state = AppRuntimeState::APPLICATION_STATE_INIT;
  }
#ifdef HAS_LVGL_DISPLAY
  if (connectivityDecision.shouldTransitionToInitScreen) {
    ui_.transitionToInitScreen();
  }
#endif
  return true;
}

#ifdef HAS_LVGL_DISPLAY
bool AppRuntime::handleDisplayBootAndPinGates() {
  if (!state_.bootDone &&
      system_.nowMs() - state_.bootTime > APPLICATION_BOOT_SCREEN_DURATION) {
    logger_.debug("Boot screen duration reached, hiding boot screen");
    state_.bootDone = true;
  }

  if (!state_.bootDone) {
    return true;
  }

  bool pinIsSet = settings_.getDeviceConfig().passCode != "0000";
  if (pinIsSet) {
    return false;
  }
  if (state_.state == AppRuntimeState::APPLICATION_STATE_PIN_NOT_SET) {
    return true;
  }

  logger_.debug("PIN is not set, showing pin screen");
  state_.state = AppRuntimeState::APPLICATION_STATE_PIN_NOT_SET;
  ui_.transitionToSetPinScreen();
  return true;
}

bool AppRuntime::handleEnrollmentTransitions() {
  AuthController::EnrollGetAvailableTransitionDecision enrollGetAvailableDecision =
      authController_.evaluateEnrollGetAvailableTransition(
          state_.externalState ==
              AppRuntimeState::EXTERNAL_STATE_ENROLL_NEW_CARD_GET_AVAILABLE_KEY_NO,
          state_.state == AppRuntimeState::APPLICATION_STATE_ENROLLMENT,
          system_.nowMs(),
          state_.apiEnrollNewCardGetAvailableKeyNoStartTimeMs, 30000);
  if (enrollGetAvailableDecision.shouldHandle) {
    if (enrollGetAvailableDecision.shouldTimeout) {
      logger_.error(
          "Enroll new card get available key number timeout reached");
      state_.externalState = AppRuntimeState::EXTERNAL_STATE_NONE;
      return true;
    }
    if (enrollGetAvailableDecision.shouldTryGetAvailableKeyNo) {
      uint8_t uid[7] = {0};
      uint8_t uidLength = 0;
      uint8_t keyNo = 0;
      bool success = nfc_.getAvailableKeyNo(uid, &uidLength, &keyNo);
      AuthController::EnrollAvailableKeyReadDecision keyReadDecision =
          authController_.evaluateEnrollAvailableKeyRead(success);
      if (keyReadDecision.shouldSendAvailableKeyNo) {
        api_.sendEnrollNewCardAvailableKeyNo(uid, uidLength, keyNo);
      }
      if (keyReadDecision.shouldClearExternalState) {
        state_.externalState = AppRuntimeState::EXTERNAL_STATE_NONE;
      }
      return true;
    }
    if (enrollGetAvailableDecision.shouldPrepareEnrollment) {
      nfc_.disableCardDetection();
      ui_.enrollmentSetUserName(
          state_.apiEnrollNewCardGetAvailableKeyNoData.username);
      state_.apiEnrollNewCardGetAvailableKeyNoStartTimeMs = system_.nowMs();
      ui_.enrollmentSetTimeoutTime(
          state_.apiEnrollNewCardGetAvailableKeyNoStartTimeMs + 30000);
      ui_.transitionToEnrollmentScreen();
    }
    if (enrollGetAvailableDecision.shouldEnterEnrollmentState) {
      state_.state = AppRuntimeState::APPLICATION_STATE_ENROLLMENT;
    }
    return true;
  }

  AuthController::EnrollNewCardTransitionDecision enrollNewCardDecision =
      authController_.evaluateEnrollNewCardTransition(
          state_.externalState == AppRuntimeState::EXTERNAL_STATE_ENROLL_NEW_CARD,
          state_.state == AppRuntimeState::APPLICATION_STATE_ENROLLMENT);
  if (!enrollNewCardDecision.shouldHandle) {
    return false;
  }
  if (enrollNewCardDecision.shouldEnableCardDetection) {
    nfc_.enableCardDetection();
  }
  if (enrollNewCardDecision.shouldEnterEnrollmentState) {
    state_.state = AppRuntimeState::APPLICATION_STATE_ENROLLMENT;
  }
  return true;
}
#else
void AppRuntime::handleNonDisplayPresentationSignal() {
  SessionController::NonDisplayPresentationDecision nonDisplayPresentation =
      sessionController_.evaluateNonDisplayPresentation(
          state_.cardDetected, state_.cardRemoved, system_.nowMs(),
          state_.cardDetectionTimeMs, NFC_CARD_LONG_PRESENTATION_TIME_MS,
          state_.cardPresentationWasLong);
  if (nonDisplayPresentation.shouldIndicateLongPresentation) {
    beeper_.indicateBeep();
  }
  if (nonDisplayPresentation.shouldMarkLongPresentation) {
    state_.cardPresentationWasLong = true;
  }
}
#endif

bool AppRuntime::handleExternalAuthTransition() {
  if (state_.externalState != AppRuntimeState::EXTERNAL_STATE_AUTHENTICATE_CARD) {
    return false;
  }
  AuthController::ExternalAuthTransitionDecision authTransitionDecision =
      authController_.evaluateExternalAuthenticateTransition(
          state_.externalState == AppRuntimeState::EXTERNAL_STATE_AUTHENTICATE_CARD,
          state_.state == AppRuntimeState::APPLICATION_STATE_AUTHENTICATE_CARD,
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
    ui_.resourceDetailsSetUserDetails(
        ResourceDetailsScreen::UserDetails{
            .username = state_.cardAuthenticationData.username,
            .canManageResource = state_.cardAuthenticationData.canManageResource,
            .hasIntroduction = state_.cardAuthenticationData.hasIntroduction,
            .isIntroducer = state_.cardAuthenticationData.isIntroducer});
  }
#endif
  if (authTransitionDecision.shouldEnterAuthenticateState) {
    state_.state = AppRuntimeState::APPLICATION_STATE_AUTHENTICATE_CARD;
  }
  if (authTransitionDecision.shouldProcessCardAuthenticationNow) {
    processCardAuthenticationData();
  }
  if (authTransitionDecision.shouldEnableCardDetection) {
    nfc_.enableCardDetection();
  }
  return true;
}

bool AppRuntime::handleExternalFirmwareUpdateTransition() {
  if (state_.externalState != AppRuntimeState::EXTERNAL_STATE_FIRMWARE_UPDATE) {
    return false;
  }
  UpdateController::ExternalFirmwareUpdateDecision firmwareDecision =
      updateController_.evaluateExternalFirmwareUpdateTransition(
          state_.externalState == AppRuntimeState::EXTERNAL_STATE_FIRMWARE_UPDATE,
          state_.state == AppRuntimeState::APPLICATION_STATE_FIRMWARE_UPDATE,
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
    logger_.debugf("Updating firmware update progress %d",
                   state_.firmwareUpdateProgressPct);
#ifdef HAS_LVGL_DISPLAY
    ui_.firmwareUpdateSetProgress(state_.firmwareUpdateProgressPct);
    ui_.firmwareUpdateSetAvailableVersion(state_.availableFirmwareVersion);
#endif
  }
#ifdef HAS_LVGL_DISPLAY
  if (firmwareDecision.shouldTransitionToFirmwareScreen) {
    ui_.transitionToFirmwareUpdateScreen();
  }
#endif
  if (firmwareDecision.shouldEnterFirmwareUpdateState) {
    state_.state = AppRuntimeState::APPLICATION_STATE_FIRMWARE_UPDATE;
  }
  return true;
}

#ifdef HAS_LVGL_DISPLAY
bool AppRuntime::handleDisplayResourceAndSessionFlow() {
  ResourceController::ResourceAvailabilityDecision resourceDecision =
      resourceController_.evaluateResourceAvailability(
          state_.resourceCount, state_.resourceIsSelected,
          state_.resourceListUpdated,
          state_.state == AppRuntimeState::APPLICATION_STATE_NO_RESOURCES,
          state_.state == AppRuntimeState::APPLICATION_STATE_RESOURCE_LIST);
  if (resourceDecision.shouldShowNoResources) {
    logger_.debug("Resource count is 0, showing no resources screen");
    state_.state = AppRuntimeState::APPLICATION_STATE_NO_RESOURCES;
    ui_.transitionToNoResourcesScreen();
    return true;
  }
  if (resourceDecision.shouldAutoSelectSingleResource) {
    logger_.debug(
        "Resource count is 1 and resource is not selected, selecting resource");
    selectResource(state_.resourceList.items[0]);
    return true;
  }
  if (resourceDecision.shouldUpdateResourceListUi) {
    ui_.resourceListSetResourceList(state_.resourceList);
    state_.resourceListUpdated = false;
  }
  if (resourceDecision.shouldReturnEarly) {
    return true;
  }
  if (resourceDecision.shouldShowResourceList) {
    logger_.debug("Resource count is greater than 0 and resource is not "
                  "selected, showing resource list");
    state_.state = AppRuntimeState::APPLICATION_STATE_RESOURCE_LIST;
    ui_.transitionToResourceListScreen();
    return true;
  }

  if (state_.selectedResourceChanged) {
    for (uint16_t i = 0; i < state_.resourceList.count; ++i) {
      if (state_.resourceList.items[i].id == state_.selectedResourceId) {
        API::ResourceBrief resource = state_.resourceList.items[i];
        ui_.lockscreenSetResourceName(resource.name);
        ui_.lockscreenSetUsageInfo(resource.hasActiveUsage, resource.activeUser);
        ui_.resourceDetailsSetResourceAndUsageDetails(resource);
        break;
      }
    }
    state_.selectedResourceChanged = false;
  }

  uint32_t now = system_.nowMs();
  if (!state_.unlocked) {
    SessionController::LockedStateDecision lockedDecision =
        sessionController_.evaluateLockedState(
            state_.unlocked,
            state_.state == AppRuntimeState::APPLICATION_STATE_LOCKED, now,
            state_.timeOfResourceSelectionMs,
            state_.RESOURCE_SELECTION_TIMEOUT_MS);
    if (lockedDecision.shouldClearResourceSelection) {
      logger_.debug("Resource selection timeout reached, showing resource list");
      state_.resourceIsSelected = false;
    }
    if (lockedDecision.shouldReturnEarly) {
      return true;
    }
    if (lockedDecision.shouldTransitionToLocked) {
      logger_.debug("Card is not detected, showing lockscreen");
      state_.state = AppRuntimeState::APPLICATION_STATE_LOCKED;
      ui_.transitionToLockscreen([this]() {
        logger_.debug(
            "Lockscreen transition complete, enabling card detection");
        nfc_.enableCardDetection();
      });
    }
    return true;
  }

  if (state_.state == AppRuntimeState::APPLICATION_STATE_UNLOCKED) {
    SessionController::UnlockedStateDecision unlockedDecision =
        sessionController_.evaluateUnlockedState(
            state_.unlocked,
            state_.state == AppRuntimeState::APPLICATION_STATE_UNLOCKED, now,
            state_.timeOfUnlockedMs, state_.accumulatedPauseMs,
            state_.UNLOCKED_TIMEOUT_MS, state_.resourceCount);
    if (unlockedDecision.shouldRelock) {
      logger_.debug("Unlocked timeout reached, locking");
      state_.unlocked = false;
      state_.resourceIsSelected =
          unlockedDecision.keepResourceSelectedOnRelock;
    }
    if (state_.projectsOfUserResponseUpdated) {
      ui_.resourceDetailsSetProjects(state_.projectsOfUserResponse);
      ui_.resourceDetailsSetSelectedProject(
          state_.selectedProjectId, state_.selectedProjectName.c_str());
      state_.projectsOfUserResponseUpdated = false;
    }
    return true;
  }

  logger_.debug("Resource is unlocked, showing resource details screen");
  state_.state = AppRuntimeState::APPLICATION_STATE_UNLOCKED;
  restartSessionTimeout();
  ui_.transitionToResourceDetailsScreen();
  return true;
}
#else
bool AppRuntime::handleNonDisplayActionFlow() {
  SessionController::NonDisplayFlowDecision nonDisplayDecision =
      sessionController_.evaluateNonDisplayFlow(
          state_.state == AppRuntimeState::APPLICATION_STATE_AUTHENTICATE_CARD,
          state_.state == AppRuntimeState::APPLICATION_STATE_WAIT_FOR_CARD,
          state_.cardDetected, state_.unlocked, state_.cardRemoved);
  if (nonDisplayDecision.shouldReturnEarly) {
    return true;
  }
  if (nonDisplayDecision.shouldProcessAction) {
    logger_.debug("Card detected and removed and unlocked, processing");
    state_.unlocked = false;
    state_.cardDetected = false;
    state_.cardRemoved = false;

    SessionController::NonDisplayActionType actionType =
        sessionController_.selectNonDisplayAction(
            state_.resourceIsDoor, state_.cardPresentationWasLong);
    switch (actionType) {
    case SessionController::NON_DISPLAY_ACTION_LOCK_DOOR:
      api_.lockDoor(state_.selectedResourceId);
      break;
    case SessionController::NON_DISPLAY_ACTION_UNLOCK_DOOR:
      api_.unlockDoor(state_.selectedResourceId);
      break;
    case SessionController::NON_DISPLAY_ACTION_STOP_SESSION:
      api_.stopResourceUsageSession(state_.selectedResourceId);
      break;
    case SessionController::NON_DISPLAY_ACTION_START_SESSION:
      api_.startResourceUsageSession(state_.selectedResourceId);
      break;
    case SessionController::NON_DISPLAY_ACTION_NONE:
    default:
      return true;
    }

    state_.state = AppRuntimeState::APPLICATION_STATE_WAIT_FOR_CARD;
    nfc_.enableCardDetection();
    return true;
  }
  if (nonDisplayDecision.shouldTransitionToWaitForCard) {
    logger_.debug("Waiting for card detection");
    state_.state = AppRuntimeState::APPLICATION_STATE_WAIT_FOR_CARD;
    nfc_.enableCardDetection();
    return true;
  }
  return false;
}
#endif

void AppRuntime::processState() {
#ifdef HAS_LVGL_DISPLAY
  if (state_.state == AppRuntimeState::APPLICATION_STATE_NFC_INIT_FAILED) {
    return;
  }
#endif

  if (handleConfigurationAndConnectivityGates()) {
    return;
  }

#ifdef HAS_LVGL_DISPLAY
  if (handleDisplayBootAndPinGates()) {
    return;
  }
  if (handleEnrollmentTransitions()) {
    return;
  }
#else
  handleNonDisplayPresentationSignal();
#endif

  if (handleExternalAuthTransition()) {
    return;
  }
  if (handleExternalFirmwareUpdateTransition()) {
    return;
  }

#ifdef HAS_LVGL_DISPLAY
  (void)handleDisplayResourceAndSessionFlow();
#else
  (void)handleNonDisplayActionFlow();
#endif
}

#ifdef HAS_LVGL_DISPLAY
void AppRuntime::handleConnectionConfigurationSave(
    const ConnectionConfigurationScreen::ConnectionConfig &cfg) {
  String hostname = cfg.host;
  String port = "443";
  if (cfg.host.indexOf(":") != -1) {
    hostname = cfg.host.substring(0, cfg.host.indexOf(":"));
    port = cfg.host.substring(cfg.host.indexOf(":") + 1);
  }
  settings_.saveNetworkConfig(cfg.ssid, cfg.password);
  settings_.saveAttraccessApiConfig(hostname, port.toInt(), cfg.useSSL);
  settings_.setDevicePin(cfg.devicePin);
  settings_.setBeeperEnabled(cfg.beeperEnabled);
}

void AppRuntime::handleResourceListUpdate(
    const API::ResourceList &resourceList) {
  logger_.infof("Resource list updated: %d resources", resourceList.count);

  state_.resourceList = resourceList;
  state_.resourceCount = resourceList.count;
  state_.resourceListUpdated = true;

  if (state_.resourceIsSelected) {
    logger_.info("Resource is selected, trying to find it in the new list");
    for (uint16_t i = 0; i < state_.resourceList.count; ++i) {
      const auto &obj = state_.resourceList.items[i];
      if (obj.id == state_.selectedResourceId) {
        logger_.infof(
            "Resource found in the new list, refreshing the details screen: %s",
            obj.name);
        selectResource(obj);
        break;
      }
    }
  }
}
#endif

void AppRuntime::processCardAuthenticationData() {
  logger_.infof("Trying to authenticate with keyNo: %u",
                state_.cardAuthenticationData.keyNo);
  bool keyLenValid = authController_.isCardAuthKeyLengthValid(
      state_.cardAuthenticationData.keyLen);

  bool authenticated = false;
  if (keyLenValid) {
    authenticated = nfc_.authenticate(state_.cardAuthenticationData.keyNo,
                                     state_.cardAuthenticationData.keyBytes);
  }

  AuthController::CardAuthenticationExecutionDecision authDecision =
      authController_.evaluateCardAuthenticationExecution(
          keyLenValid, authenticated,
#ifdef HAS_LVGL_DISPLAY
          true
#else
          false
#endif
      );

  if (authDecision.shouldLogInvalidKey) {
    logger_.error("Invalid key bytes provided");
  }
  if (authDecision.shouldLogAuthFailed) {
    logger_.error("Authentication failed");
  }
  if (authDecision.shouldErrorBeep) {
    beeper_.errorBeep();
  }
  if (authDecision.shouldEnableCardDetection) {
    nfc_.enableCardDetection();
  }
  if (authDecision.shouldKeepExternalAuthenticateState) {
    state_.externalState = AppRuntimeState::EXTERNAL_STATE_AUTHENTICATE_CARD;
  }
  if (authDecision.shouldFail) {
    return;
  }

  if (authDecision.shouldSuccessBeep) {
    beeper_.successBeep();
    logger_.info("Authentication successful");
  }
  if (authDecision.shouldClearExternalState) {
    state_.externalState = AppRuntimeState::EXTERNAL_STATE_NONE;
  }
  if (authDecision.shouldUnlock) {
    state_.unlocked = true;
  }
}

#ifdef HAS_LVGL_DISPLAY
void AppRuntime::selectResource(const API::ResourceBrief &resource) {
  logger_.infof("Resource selected: %s", resource.name);
  state_.resourceIsSelected = true;
  state_.selectedResourceId = resource.id;
  restartResourceSelectionTimeout();
  state_.selectedResourceChanged = true;
}

void AppRuntime::requestProjectsPage(uint32_t page) {
  if (page == 0) {
    page = 1;
  }
  api_.requestProjectsOfUser(page);
}

void AppRuntime::clearProjectSelection() {
  state_.selectedProjectId = 0;
  state_.selectedProjectName = "";
  state_.projectsCurrentPage = 1;
  state_.projectsTotalCount = 0;
  state_.projectsHasMore = false;
  state_.projectsOfUserResponse.count = 0;
  state_.projectsOfUserResponse.page = 1;
  state_.projectsOfUserResponse.total = 0;
  state_.projectsOfUserResponse.limit = API::MAX_PROJECTS_PER_PAGE;
  state_.projectsOfUserResponse.hasMore = false;
  state_.projectsOfUserResponseUpdated = true;
  ui_.resourceDetailsSetSelectedProject(0, nullptr);
}

void AppRuntime::handleProjectSelection(uint32_t projectId,
                                        const String &projectName) {
  state_.selectedProjectId = projectId;
  state_.selectedProjectName = projectName;
  ui_.resourceDetailsSetSelectedProject(projectId, projectName.c_str());
}

void AppRuntime::handleFormsRequest(
    const API::ResourceUsageFormRequest &request) {
  (void)request;
  state_.hasPendingFormRequest = true;
  ui_.resourceDetailsHideActionProgress();
  ui_.resourceDetailsShowFormsModal(state_.pendingFormRequest);
}

void AppRuntime::handleFormsSubmit(
    const API::FormSubmissionList &submissions) {
  ResourceController::FormsSubmitDecision d =
      resourceController_.evaluateFormsSubmit(state_.pendingActionType);
  if (d.shouldCancelInstead) {
    handleFormsCancel();
    return;
  }

  if (d.shouldStoreSubmissionBuffer) {
    state_.formSubmissionBuffer = submissions;
    state_.hasPendingFormRequest = false;
  }
  if (d.shouldHideFormsModal) {
    ui_.resourceDetailsHideFormsModal();
  }
  if (d.shouldShowActionProgress && d.actionProgressMessage) {
    ui_.resourceDetailsShowActionProgress(d.actionProgressMessage);
  }

  if (d.shouldSendStartSession) {
    api_.startResourceUsageSession(state_.pendingActionResourceId,
                                   state_.pendingActionProjectId,
                                   &state_.formSubmissionBuffer);
  } else if (d.shouldSendStopSession) {
    api_.stopResourceUsageSession(state_.pendingActionResourceId,
                                  &state_.formSubmissionBuffer);
  }
}

void AppRuntime::handleFormsCancel() {
  ResourceController::FormsCancelDecision d =
      resourceController_.evaluateFormsCancel(state_.hasPendingFormRequest);
  if (d.shouldReturnEarly) {
    return;
  }
  if (d.shouldClearPendingFormRequest) {
    state_.hasPendingFormRequest = false;
  }
  if (d.shouldResetPendingAction) {
    state_.pendingActionType = AppRuntimeState::PENDING_ACTION_NONE;
  }
  if (d.shouldHideFormsModal) {
    ui_.resourceDetailsHideFormsModal();
  }
  if (d.shouldHideActionProgress) {
    ui_.resourceDetailsHideActionProgress();
  }
  if (d.shouldEndActionPause) {
    endActionPause();
  }
}

void AppRuntime::onActionResult(const String &eventType) {
  ResourceController::SessionActionResultDecision d =
      resourceController_.evaluateSessionActionResult(
          eventType == "START_RESOURCE_USAGE_SESSION" ||
          eventType == "STOP_RESOURCE_USAGE_SESSION");
  if (d.shouldResetPendingAction) {
    state_.pendingActionType = AppRuntimeState::PENDING_ACTION_NONE;
  }
  if (d.shouldClearPendingFormRequest) {
    state_.hasPendingFormRequest = false;
  }
  if (d.shouldHideFormsModal) {
    ui_.resourceDetailsHideFormsModal();
  }
}

void AppRuntime::handleTouch(int16_t x, int16_t y) {
  if (state_.state == AppRuntimeState::APPLICATION_STATE_UNLOCKED) {
    restartSessionTimeout();
  }
}

void AppRuntime::restartSessionTimeout() {
  uint32_t now = system_.nowMs();
  ui_.resourceDetailsSetSessionTimeoutTime(
      sessionController_.computeSessionTimeoutDeadlineMs(
          now, state_.UNLOCKED_TIMEOUT_MS));
  state_.timeOfUnlockedMs = now;
  resetPauseAccounting();
}

void AppRuntime::handleResourceDetailsButtonClick(
    ResourceDetailsScreen::ButtonClickEventData evt) {
  logger_.infof("Resource details button clicked: %d", evt.buttonClickType);

  ResourceController::ActionIntent intent =
      ResourceController::ACTION_INTENT_NONE;
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
      resourceController_.evaluateActionIntent(
          intent,
          state_.state == AppRuntimeState::APPLICATION_STATE_UNLOCKED,
          state_.resourceCount);
  if (d.shouldIgnore) {
    return;
  }

  if (d.shouldShowActionProgress && d.actionProgressMessage) {
    ui_.resourceDetailsShowActionProgress(d.actionProgressMessage);
  }
  if (d.shouldBeginActionPause) {
    beginActionPause();
  }
  if (d.shouldSetPendingAction) {
    state_.pendingActionType =
        (AppRuntimeState::pending_action_t)d.pendingActionType;
  }
  if (d.pendingActionType ==
      static_cast<int>(AppRuntimeState::PENDING_ACTION_START_SESSION)) {
    state_.pendingActionResourceId = state_.selectedResourceId;
    state_.pendingActionProjectId = state_.selectedProjectId;
  } else if (d.pendingActionType ==
             static_cast<int>(AppRuntimeState::PENDING_ACTION_STOP_SESSION)) {
    state_.pendingActionResourceId = state_.selectedResourceId;
    state_.pendingActionProjectId = 0;
  }
  if (d.shouldResetPendingFormRequest) {
    state_.hasPendingFormRequest = false;
  }
  if (d.shouldClearResourceSelection) {
    state_.resourceIsSelected = false;
  }
  if (d.shouldLock) {
    state_.unlocked = false;
  }
  if (d.shouldClearProjectsUser) {
    state_.currentProjectsUser = "";
  }
  if (d.shouldClearProjectSelection) {
    clearProjectSelection();
  }
  if (d.shouldHideFormsModal) {
    ui_.resourceDetailsHideFormsModal();
  }

  if (d.shouldApiStartSession) {
    api_.startResourceUsageSession(state_.selectedResourceId,
                                   state_.selectedProjectId);
  } else if (d.shouldApiStopSession) {
    api_.stopResourceUsageSession(state_.selectedResourceId);
  } else if (d.shouldApiLockDoor) {
    api_.lockDoor(state_.selectedResourceId);
  } else if (d.shouldApiUnlockDoor) {
    api_.unlockDoor(state_.selectedResourceId);
  } else if (d.shouldApiUnlatchDoor) {
    api_.unlatchDoor(state_.selectedResourceId);
  } else if (d.shouldApiTriggerFlowButton) {
    api_.triggerFlowButton(state_.selectedResourceId, evt.flowButtonId);
  }
}

void AppRuntime::restartResourceSelectionTimeout() {
  uint32_t now = system_.nowMs();
  state_.timeOfResourceSelectionMs = now;
}

void AppRuntime::beginActionPause() {
  state_.actionInProgressCount++;
  if (sessionController_.shouldPauseSessionTimeoutOnActionBegin(
          state_.actionInProgressCount)) {
    state_.pauseStartMs = system_.nowMs();
    ui_.resourceDetailsSetSessionTimeoutPaused(true);
  }
}

void AppRuntime::endActionPause() {
  if (sessionController_.shouldIgnoreActionPauseEnd(
          state_.actionInProgressCount)) {
    return;
  }
  state_.actionInProgressCount--;
  if (sessionController_.shouldApplyPauseDeltaOnActionEnd(
          state_.actionInProgressCount)) {
    uint32_t now = system_.nowMs();
    uint32_t delta =
        sessionController_.computePauseDeltaMs(now, state_.pauseStartMs);
    state_.accumulatedPauseMs += delta;
    ui_.resourceDetailsExtendSessionTimeoutBy(delta);
    ui_.resourceDetailsSetSessionTimeoutPaused(false);
  }
}

void AppRuntime::resetPauseAccounting() {
  sessionController_.resetPauseAccounting(
      state_.pauseStartMs, state_.accumulatedPauseMs,
      state_.actionInProgressCount);
  ui_.resourceDetailsSetSessionTimeoutPaused(false);
}

void AppRuntime::resetSessionOnDisconnect() {
  SessionController::DisconnectResetDecision disconnectResetDecision =
      sessionController_.evaluateDisconnectReset(
          state_.unlocked, state_.resourceIsSelected,
          state_.pendingActionType != AppRuntimeState::PENDING_ACTION_NONE,
          state_.hasPendingFormRequest, state_.pendingFormRequestReady,
          state_.currentProjectsUser.length() > 0);

  if (!disconnectResetDecision.shouldResetSession) {
    return;
  }

  logger_.info("Connectivity lost; resetting session state");

  if (disconnectResetDecision.shouldHideActionProgress) {
    ui_.resourceDetailsHideActionProgress();
  }
  if (disconnectResetDecision.shouldHideFormsModal) {
    ui_.resourceDetailsHideFormsModal();
  }
  if (disconnectResetDecision.shouldResetPauseAccounting) {
    resetPauseAccounting();
  }

  if (disconnectResetDecision.shouldResetPendingAction) {
    state_.pendingActionType = AppRuntimeState::PENDING_ACTION_NONE;
    state_.pendingActionResourceId = 0;
    state_.pendingActionProjectId = 0;
  }
  if (disconnectResetDecision.shouldClearPendingFormRequest) {
    state_.hasPendingFormRequest = false;
    state_.pendingFormRequestReady = false;
  }
  if (disconnectResetDecision.shouldClearProjectSelection) {
    clearProjectSelection();
  }
  if (disconnectResetDecision.shouldClearProjectsUser) {
    state_.currentProjectsUser = "";
  }
  if (disconnectResetDecision.shouldClearSelection) {
    state_.selectedResourceId = 0;
    state_.resourceIsSelected = false;
    state_.selectedResourceChanged = false;
  }
  if (disconnectResetDecision.shouldLock) {
    state_.unlocked = false;
  }
  if (disconnectResetDecision.shouldClearExternalState) {
    state_.externalState = AppRuntimeState::EXTERNAL_STATE_NONE;
  }
  if (disconnectResetDecision.shouldEnableCardDetection) {
    nfc_.enableCardDetection();
  }
}
#endif

} // namespace app::runtime
