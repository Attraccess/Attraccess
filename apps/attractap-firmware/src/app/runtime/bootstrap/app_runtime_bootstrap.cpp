#include "../app_runtime.hpp"
#include "../../../utils.hpp"

#ifdef ESP_PLATFORM
#include "esp_ota_ops.h"
#include "esp_partition.h"
#endif

#ifdef HAS_LVGL_DISPLAY
#include "lvgl.h"
#endif

namespace app::runtime {

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
      [this](const app::contracts::ResourceList &resourceList) {
        eventBus_.publishResourceListUpdated(resourceList);
      });

  api_.setCardAuthenticationDetailsResponseCallback(
      [this](app::contracts::CardAuthenticationDetails response) {
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
      [this](const app::contracts::FormSubmissionList &submissions) {
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
      [this](const app::contracts::ResourceBrief &resource) {
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
      [this](const app::contracts::ProjectsOfUserResponse &projectsOfUserResponse) {
        app::events::ProjectsResponseEvent event;
        event.response = projectsOfUserResponse;
        eventBus_.publish(event);
      });

  api_.setResourceFormsRequestCallback(
      [this](const app::contracts::ResourceUsageFormRequest &request) {
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

} // namespace app::runtime
