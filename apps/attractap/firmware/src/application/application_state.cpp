#include "application.hpp"
#include "../platform.hpp"

void Application::processState() {
#ifdef HAS_WS2812_LED
  this->updateLedState();
#endif

  if (processConfigurationState()) return;
  if (processConnectionState()) return;
  if (processCardFlowState()) return;
  if (processAuthenticationState()) return;
  renderResourceState();
}
#ifdef HAS_WS2812_LED
void Application::updateLedState() {
  LedController::LedState ledState;
  switch (this->state) {
  case APPLICATION_STATE_CONFIGURATION_REQUIRED:
    ledState = LedController::LED_STATE_CONFIG_REQUIRED;
    break;
  case APPLICATION_STATE_INIT:
    ledState = LedController::LED_STATE_INIT;
    break;
  case APPLICATION_STATE_AUTHENTICATE_CARD:
    ledState = LedController::LED_STATE_AUTHENTICATE_CARD;
    break;
  case APPLICATION_STATE_NO_RESOURCES:
    ledState = LedController::LED_STATE_NO_RESOURCES;
    break;
  case APPLICATION_STATE_WAIT_FOR_CARD:
    ledState = LedController::LED_STATE_WAIT_FOR_CARD;
    break;
  case APPLICATION_STATE_FIRMWARE_UPDATE:
    ledState = LedController::LED_STATE_FIRMWARE_UPDATE;
    break;
  default:
    ledState = LedController::LED_STATE_WAIT_FOR_CARD;
    break;
  }
  this->led.setState(ledState);
}
#endif

bool Application::processConfigurationState()
{
#ifdef DEMO_MODE
  // In demo mode, handle a pending card scan for the settings screen.
  if (this->demoPendingScanReady) {
    this->demoPendingScanReady = false;
    this->nfc.disableCardDetection();
    Display::demoSettingsScreen.onCardScanned(this->demoScanUid);
    this->demoScanUid.clear();
    return true;
  }
  // In demo mode the settings screen is always accessible and connection
  // config / PIN prompts are suppressed.
  if (this->state == APPLICATION_STATE_CONFIGURATION_REQUIRED) {
    return true;
  }
#else
  AttraccessApiConfig attraccessApiConfig = Settings::getAttraccessApiConfig();
  bool connectionIsConfigured = !attraccessApiConfig.hostname.empty() &&
                                attraccessApiConfig.hostname != "" &&
                                attraccessApiConfig.port > 0;

    if (!connectionIsConfigured)
    {
        if (this->state != APPLICATION_STATE_CONFIGURATION_REQUIRED)
        {
            this->logger.debug("Connection not configured, showing config screen");
            this->state = APPLICATION_STATE_CONFIGURATION_REQUIRED;

#ifdef HAS_LVGL_DISPLAY
      Display::connectionConfigurationScreen.disablePinLock();
      Display::transitionToScreen(&Display::connectionConfigurationScreen);
#endif
    }

    return true;
  }

    if (this->state == APPLICATION_STATE_CONFIGURATION_REQUIRED)
    {
        return true;
    }
#endif // DEMO_MODE

#ifdef HAS_LVGL_DISPLAY
  if (!this->bootDone &&
      millis() - this->bootTime > APPLICATION_BOOT_SCREEN_DURATION) {
    this->logger.debug("Boot screen duration reached, hiding boot screen");
    this->bootDone = true;
  }

  if (!this->bootDone) {
    return true;
  }

#ifndef DEMO_MODE
  bool pinIsSet = Settings::getDeviceConfig().passCode != "0000";
  if (!pinIsSet) {
    if (this->state == APPLICATION_STATE_PIN_NOT_SET) {
      return true;
    }

    this->logger.debug("PIN is not set, showing pin screen");
    this->state = APPLICATION_STATE_PIN_NOT_SET;

    Display::transitionToScreen(&Display::setPinScreen);
    return true;
  }
#endif // !DEMO_MODE
#endif // HAS_LVGL_DISPLAY

  return false;
}

bool Application::processConnectionState()
{
  State::ApiState apiState = State::getApiState();
  State::NetworkState networkState = State::getNetworkState();
  State::WebsocketState websocketState = State::getWebsocketState();
  if (!apiState.authenticated ||
      (!networkState.ethernet_connected && !networkState.wifi_connected) ||
      !websocketState.connected) {
#ifdef HAS_LVGL_DISPLAY
    this->resetSessionOnDisconnect();
    // Drop any pending/active enrollment. The trigger is set asynchronously by
    // the websocket task; if a disconnect races it, a stale trigger would
    // relaunch a dead enrollment screen on reconnect (server session is gone),
    // looping USER_NOT_SET errors until timeout. Clear it here, before the
    // INIT early-return below.
    if (this->externalState == EXTERNAL_STATE_ENROLL_NEW_CARD_GET_AVAILABLE_KEY_NO ||
        this->enrollPhase != ENROLL_PHASE_NONE) {
      this->externalState = EXTERNAL_STATE_NONE;
      this->enrollPhase = ENROLL_PHASE_NONE;
    }
    // Same rationale for a pending/active reset: a stale trigger would relaunch
    // a dead reset screen on reconnect (the server session is gone).
    if (this->externalState == EXTERNAL_STATE_RESET_NFC_CARD ||
        this->resetPhase != RESET_PHASE_NONE) {
      this->externalState = EXTERNAL_STATE_NONE;
      this->resetPhase = RESET_PHASE_NONE;
    }
    this->supervision.onDisconnect();
#endif
        if (this->state == APPLICATION_STATE_INIT)
        {
            return true;
        }

        // User intentionally opened settings from the init screen — don't force back to init.
        if (this->state == APPLICATION_STATE_CONFIGURATION_REQUIRED)
        {
            return true;
        }

    this->logger.debug(
        "API state is not authenticated, network state is not connected, "
        "websocket state is not connected, showing init screen");
    this->state = APPLICATION_STATE_INIT;

#ifdef HAS_LVGL_DISPLAY
    Display::transitionToScreen(&Display::initScreen);
#endif
    return true;
  }

  return false;
}

bool Application::processCardFlowState()
{
#ifdef HAS_LVGL_DISPLAY
  if (this->sessionSummaryActive) {
    // Late card-auth replies cannot interrupt a member's completed stop.
    if (this->externalState == EXTERNAL_STATE_AUTHENTICATE_CARD)
      this->externalState = EXTERNAL_STATE_NONE;
    if (this->externalState != EXTERNAL_STATE_NONE) {
      const auto interrupt = this->externalState;
      this->dismissSessionSummary();
      this->externalState = interrupt;
    } else {
      if (this->sessionSummaryDismissRequested || (this->sessionSummaryVisible &&
          millis() - this->sessionSummaryShownAt >= 3500)) this->dismissSessionSummary();
      else return true;
    }
  }
  // Enrollment is a sticky, self-contained sub-flow. Once started it owns the
  // screen until success, cancel or timeout — the generic routing below must
  // never run while enrolling, otherwise the enrollment screen gets stolen.
  if (this->externalState ==
          EXTERNAL_STATE_ENROLL_NEW_CARD_GET_AVAILABLE_KEY_NO &&
      this->state != APPLICATION_STATE_ENROLLMENT) {
    this->beginEnrollment();
    return true;
  }

  if (this->state == APPLICATION_STATE_ENROLLMENT) {
    this->processEnrollment();
    return true;
  }

  // Card reset is a sticky, self-contained sub-flow just like enrollment — it
  // owns the screen until success, cancel or timeout so the generic routing
  // below can never steal the reset screen.
  if (this->externalState == EXTERNAL_STATE_RESET_NFC_CARD &&
      this->state != APPLICATION_STATE_RESET) {
    this->beginReset();
    return true;
  }

  if (this->state == APPLICATION_STATE_RESET) {
    this->processReset();
    return true;
  }

  // The server can arm supervision without anyone tapping first (ATT-816): the requester picked this
  // reader in the web UI. Enrollment and reset return before this point, so the flag may sit unread
  // for as long as one of those runs — check it against the server's TTL rather than assuming the
  // request is still live, and tell the server when we cannot serve it.
  if (this->supervision.takePendingWebStart(
          millis(), this->state == APPLICATION_STATE_SUPERVISION ||
                         this->cardAuthenticationPending || this->unlocked ||
                         this->state == APPLICATION_STATE_AUTHENTICATE_CARD)) {
    this->state = APPLICATION_STATE_SUPERVISION;
    this->externalState = EXTERNAL_STATE_NONE;
    return true;
  }

  // Two-card supervision is a sticky, self-contained sub-flow like enrollment/reset — it owns the
  // screen until success, cancel or timeout.
  if (this->state == APPLICATION_STATE_SUPERVISION) {
    SupervisionFlow::Outcome outcome = this->supervision.tick(millis());
    if (outcome != SupervisionFlow::Outcome::None) {
      this->externalState = EXTERNAL_STATE_NONE;
      this->state = APPLICATION_STATE_INIT;
      const bool hadLogin = this->unlocked;
      this->unlocked = hadLogin || outcome == SupervisionFlow::Outcome::Unlock ||
                       outcome == SupervisionFlow::Outcome::UnlockAndStartSession;
      if (outcome == SupervisionFlow::Outcome::UnlockAndStartSession) {
        this->pendingUiStartedAt = millis();
        this->showReaderActionProgress(FirmwareI18n::Message::StartingUsage);
        if (this->actionInProgressCount == 0) this->beginActionPause();
        this->pendingActionType = PENDING_ACTION_START_SESSION;
        this->pendingActionResourceId = this->selectedResourceId;
        this->pendingActionProjectId = this->selectedProjectId;
        this->pendingActionIsTakeover = false;
        this->hasPendingFormRequest = false;
        this->api.startResourceUsageSession(this->selectedResourceId, this->selectedProjectId);
      } else if (hadLogin) {
        this->finishReaderAction(outcome == SupervisionFlow::Outcome::Unlock);
      }

    }
    return true;
  }
#endif

  return false;
}

bool Application::processAuthenticationState()
{
#ifndef HAS_LVGL_DISPLAY
  if (this->cardDetected && !this->cardRemoved) {
    unsigned long currentPresentationDurationMs =
        millis() - this->cardDetectionTimeMs;
    if (currentPresentationDurationMs > NFC_CARD_LONG_PRESENTATION_TIME_MS &&
        !this->cardPresentationWasLong) {
      this->beeper.indicateBeep();
#ifdef HAS_WS2812_LED
      this->led.triggerIndicate();
#endif
      this->cardPresentationWasLong = true;
    }
  }
#endif

#ifdef HAS_LVGL_DISPLAY
  // This must run before the AUTHENTICATE_CARD early return (card lifted while
  // waiting for its key). Otherwise that wait would never expire.
  if (this->cardAuthenticationPending && millis() - this->cardAuthenticationStartedAt > 30000) {
    this->finishCardAuthentication(false);
    Display::showErrorPopup(FirmwareI18n::Message::SignInFailed, FirmwareI18n::Message::PleaseTapTheNfcCardAgain);
  }
#endif


  // A late or duplicate card-auth response (double-tap on the lockscreen sends
  // two requests; the websocket task sets the trigger asynchronously) must not
  // hijack the state machine while the user is already unlocked. Otherwise
  // state flips to AUTHENTICATE_CARD with the resource-details screen still
  // shown and the early-return below wedges the UI: buttons are guarded on
  // state == UNLOCKED and the logout timeout is never evaluated (ATT-718).
  if (this->externalState == EXTERNAL_STATE_AUTHENTICATE_CARD &&
      this->unlocked) {
    this->logger.debug(
        "Dropping card-auth trigger while unlocked (stale/duplicate response)");
    this->externalState = EXTERNAL_STATE_NONE;
  }

  if (this->externalState == EXTERNAL_STATE_AUTHENTICATE_CARD) {
    if (this->state == APPLICATION_STATE_AUTHENTICATE_CARD) {
      return true;
    }

#ifdef HAS_LVGL_DISPLAY
    Display::resourceDetailsScreen.setUserDetails(
        ResourceDetailsScreen::UserDetails{
            .username = this->cardAuthenticationData.username,
            .canManageResource = this->cardAuthenticationData.canManageResource,
            .hasIntroduction = this->cardAuthenticationData.hasIntroduction,
            .isIntroducer = this->cardAuthenticationData.isIntroducer,
            .requiresSupervisor = this->cardAuthenticationData.requiresSupervisor});
#endif

    this->state = APPLICATION_STATE_AUTHENTICATE_CARD;

#ifndef HAS_LVGL_DISPLAY
    // For non-display mode, process authentication immediately since the card
    // is still present and won't trigger another detection event
    this->processCardAuthenticationData();
#else
    this->nfc.enableCardDetection();
    // The card that triggered the auth-data request is still on the reader.
    // handleCardDetection() only emits a detection event on an absent->present
    // transition, so it will not re-fire while the card stays put. Authenticate
    // immediately instead of forcing the user to remove and re-present the card
    // (the double-tap bug). If the card was already lifted, fall back to the
    // detection callback on the next presentation.
    if (this->nfc.isCardPresent()) {
      this->processCardAuthenticationData();
    }
#endif
    return true;
  }

  if (this->externalState == EXTERNAL_STATE_FIRMWARE_UPDATE) {
    if (this->state == APPLICATION_STATE_FIRMWARE_UPDATE) {
#ifdef HAS_LVGL_DISPLAY
      Display::firmwareUpdateScreen.setProgress(
          this->firmwareUpdateProgressPct);
      Display::firmwareUpdateScreen.setAvailableVersion(
          this->availableFirmwareVersion);
#endif
      return true;
    }

#ifdef HAS_LVGL_DISPLAY
    Display::transitionToScreen(&Display::firmwareUpdateScreen);
#endif
    this->state = APPLICATION_STATE_FIRMWARE_UPDATE;
#ifdef HAS_WS2812_LED
    this->updateLedState();
#endif
    return true;
  }

  return false;
}

void Application::renderResourceState()
{
#ifdef HAS_LVGL_DISPLAY
  uint32_t now = millis();
  if (!this->pendingUiAction.empty() && !this->hasPendingFormRequest &&
      now - this->pendingUiStartedAt > 60000) {
    this->finishReaderAction(false);
    this->handleFormsCancel();
    Display::showErrorPopup(FirmwareI18n::Message::ActionNotConfirmed, FirmwareI18n::Message::ResourceStatusIsBeingRefreshedCheckItBeforeTryingAgain);
  }
  // Finishing an action starts a new refresh timer; do not subtract its newer
  // timestamp from the earlier sample and wrap the unsigned elapsed duration.
  now = millis();
  if (this->waitingForResourceRefresh && now - this->pendingUiStartedAt > 30000) {
    this->logoutReader();
    Display::showErrorPopup(FirmwareI18n::Message::StatusUnavailable, FirmwareI18n::Message::SignInAgainToLoadTheCurrentResourceStatus);
  }
  if (this->unlocked) {
    uint32_t effectivePause = this->accumulatedPauseMs;
    if (this->actionInProgressCount > 0) effectivePause += now - this->pauseStartMs;
    uint32_t elapsed = now - this->timeOfUnlockedMs;
    elapsed = elapsed > effectivePause ? elapsed - effectivePause : 0;
    if (elapsed > this->UNLOCKED_TIMEOUT_MS) this->logoutReader();
  }
  if (this->selectedResourceChanged) {
    this->updateSelectedResourceDetails();
    this->selectedResourceChanged = false;
  }
  if (this->projectsOfUserResponseUpdated && this->unlocked) {
    Display::resourceDetailsScreen.setProjects(this->projectsOfUserResponse);
    Display::resourceDetailsScreen.setSelectedProject(this->selectedProjectId, this->selectedProjectName.c_str());
    this->projectsOfUserResponseUpdated = false;
  }
  if (this->resourceListUpdated) {
    Display::resourceListScreen.setResourceList(this->resourceList);
    this->resourceListUpdated = false;
  }
  if (this->resourceCount == 0) {
    if (this->state != APPLICATION_STATE_NO_RESOURCES) {
      this->logoutReader();
      this->state = APPLICATION_STATE_NO_RESOURCES;
      Display::transitionToScreen(&Display::noResourcesScreen);
    }
    return;
  }
  if (!this->resourceIsSelected) {
    Display::resourceListScreen.setAuthenticatedUser(this->unlocked ? this->cardAuthenticationData.username : "");
    const auto target = this->unlocked ? APPLICATION_STATE_RESOURCE_LIST_AUTHENTICATED : APPLICATION_STATE_RESOURCE_LIST;
    if (this->state != target) {
      this->state = target;
      Display::transitionToScreen(&Display::resourceListScreen);
      if (!this->unlocked && !this->cardAuthenticationPending) this->nfc.enableCardDetection();
    }
    return;
  }
  if (!this->unlocked) {
    if (this->state == APPLICATION_STATE_LOCKED) {
      if (!this->cardAuthenticationPending && now - this->timeOfResourceSelectionMs > this->RESOURCE_SELECTION_TIMEOUT_MS) {
        this->resourceIsSelected = false;
        this->selectedResourceId = 0;
      }
      return;
    }
    this->state = APPLICATION_STATE_LOCKED;
    Display::transitionToScreen(&Display::lockscreen, [this] { this->nfc.enableCardDetection(); });
    return;
  }
  if (this->state != APPLICATION_STATE_UNLOCKED) {
    this->state = APPLICATION_STATE_UNLOCKED;
    Display::transitionToScreen(&Display::resourceDetailsScreen);
  }
#else

  // Process unlocked card actions for non-display mode
  if (this->state == APPLICATION_STATE_AUTHENTICATE_CARD) {
    if (!this->cardDetected) {
      return;
    }

    if (!this->unlocked) {
      return;
    }

    if (!this->cardRemoved) {
      return;
    }

    this->logger.debug("Card detected and removed and unlocked, processing");

    // Reset state flags before triggering action
    this->unlocked = false;
    this->cardDetected = false;
    this->cardRemoved = false;

    if (this->resourceIsDoor) {
      if (this->cardPresentationWasLong) {
        this->api.lockDoor(this->selectedResourceId);
      } else {
        this->api.unlockDoor(this->selectedResourceId);
      }
    } else {
      if (this->cardPresentationWasLong) {
        this->api.stopResourceUsageSession(this->selectedResourceId);
      } else {
        this->api.startResourceUsageSession(this->selectedResourceId);
      }
    }

    // Reset state back to waiting for card
    this->state = APPLICATION_STATE_WAIT_FOR_CARD;
    this->nfc.enableCardDetection();
    return;
  }

  if (this->state != APPLICATION_STATE_WAIT_FOR_CARD) {
    this->logger.debug("Waiting for card detection");
    this->state = APPLICATION_STATE_WAIT_FOR_CARD;
    this->nfc.enableCardDetection();
    return;
  }
#endif
}
