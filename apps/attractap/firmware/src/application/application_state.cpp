// Main state machine: screen routing, connectivity gating, LED state mapping
// FEATURE: application-state

#include "application.hpp"
#include "platform.hpp"

void Application::processState() {
#ifdef HAS_WS2812_LED
  this->updateLedState();
#endif

#ifdef DEMO_MODE
  // In demo mode, handle a pending card scan for the settings screen.
  if (this->demoPendingScanReady) {
    this->demoPendingScanReady = false;
    this->nfc.disableCardDetection();
    Display::demoSettingsScreen.onCardScanned(this->demoScanUid);
    this->demoScanUid.clear();
    return;
  }
  // In demo mode the settings screen is always accessible and connection
  // config / PIN prompts are suppressed.
  if (this->state == APPLICATION_STATE_CONFIGURATION_REQUIRED) {
    return;
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

    return;
  }

    if (this->state == APPLICATION_STATE_CONFIGURATION_REQUIRED)
    {
        return;
    }
#endif // DEMO_MODE

#ifdef HAS_LVGL_DISPLAY
  if (!this->bootDone &&
      millis() - this->bootTime > APPLICATION_BOOT_SCREEN_DURATION) {
    this->logger.debug("Boot screen duration reached, hiding boot screen");
    this->bootDone = true;
  }

  if (!this->bootDone) {
    return;
  }

#ifndef DEMO_MODE
  bool pinIsSet = Settings::getDeviceConfig().passCode != "0000";
  if (!pinIsSet) {
    if (this->state == APPLICATION_STATE_PIN_NOT_SET) {
      return;
    }

    this->logger.debug("PIN is not set, showing pin screen");
    this->state = APPLICATION_STATE_PIN_NOT_SET;

    Display::transitionToScreen(&Display::setPinScreen);
    return;
  }
#endif // !DEMO_MODE
#endif // HAS_LVGL_DISPLAY

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
            return;
        }

        // User intentionally opened settings from the init screen — don't force back to init.
        if (this->state == APPLICATION_STATE_CONFIGURATION_REQUIRED)
        {
            return;
        }

    this->logger.debug(
        "API state is not authenticated, network state is not connected, "
        "websocket state is not connected, showing init screen");
    this->state = APPLICATION_STATE_INIT;

#ifdef HAS_LVGL_DISPLAY
    Display::transitionToScreen(&Display::initScreen);
#endif
    return;
  }

#ifdef HAS_LVGL_DISPLAY
  // Enrollment is a sticky, self-contained sub-flow. Once started it owns the
  // screen until success, cancel or timeout — the generic routing below must
  // never run while enrolling, otherwise the enrollment screen gets stolen.
  if (this->externalState ==
          EXTERNAL_STATE_ENROLL_NEW_CARD_GET_AVAILABLE_KEY_NO &&
      this->state != APPLICATION_STATE_ENROLLMENT) {
    this->beginEnrollment();
    return;
  }

  if (this->state == APPLICATION_STATE_ENROLLMENT) {
    this->processEnrollment();
    return;
  }

  // Card reset is a sticky, self-contained sub-flow just like enrollment — it
  // owns the screen until success, cancel or timeout so the generic routing
  // below can never steal the reset screen.
  if (this->externalState == EXTERNAL_STATE_RESET_NFC_CARD &&
      this->state != APPLICATION_STATE_RESET) {
    this->beginReset();
    return;
  }

  if (this->state == APPLICATION_STATE_RESET) {
    this->processReset();
    return;
  }

  // The server can arm supervision without anyone tapping first (ATT-816): the requester picked this
  // reader in the web UI. Enrollment and reset return before this point, so the flag may sit unread
  // for as long as one of those runs — check it against the server's TTL rather than assuming the
  // request is still live, and tell the server when we cannot serve it.
  if (this->supervision.takePendingWebStart(
          millis(), this->state == APPLICATION_STATE_SUPERVISION ||
                         this->state == APPLICATION_STATE_UNLOCKED ||
                         this->state == APPLICATION_STATE_AUTHENTICATE_CARD)) {
    this->state = APPLICATION_STATE_SUPERVISION;
    this->externalState = EXTERNAL_STATE_NONE;
    return;
  }

  // Two-card supervision is a sticky, self-contained sub-flow like enrollment/reset — it owns the
  // screen until success, cancel or timeout.
  if (this->state == APPLICATION_STATE_SUPERVISION) {
    SupervisionFlow::Outcome outcome = this->supervision.tick(millis());
    if (outcome != SupervisionFlow::Outcome::None) {
      this->externalState = EXTERNAL_STATE_NONE;
      this->state = APPLICATION_STATE_INIT;
      this->unlocked = outcome == SupervisionFlow::Outcome::Unlock ||
                        outcome == SupervisionFlow::Outcome::UnlockAndStartSession;
      if (this->unlocked) {
        this->restartSessionTimeout();
      }
      if (outcome == SupervisionFlow::Outcome::UnlockAndStartSession) {
        Display::resourceDetailsScreen.showActionProgress("Starte Sitzung");
        this->beginActionPause();
        this->pendingActionType = PENDING_ACTION_START_SESSION;
        this->pendingActionResourceId = this->selectedResourceId;
        this->pendingActionProjectId = 0;
        this->hasPendingFormRequest = false;
        this->api.startResourceUsageSession(this->selectedResourceId);
      }
    }
    return;
  }
#endif

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
      return;
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
    return;
  }

  if (this->externalState == EXTERNAL_STATE_FIRMWARE_UPDATE) {
    if (this->state == APPLICATION_STATE_FIRMWARE_UPDATE) {
#ifdef HAS_LVGL_DISPLAY
      Display::firmwareUpdateScreen.setProgress(
          this->firmwareUpdateProgressPct);
      Display::firmwareUpdateScreen.setAvailableVersion(
          this->availableFirmwareVersion);
#endif
      return;
    }

#ifdef HAS_LVGL_DISPLAY
    Display::transitionToScreen(&Display::firmwareUpdateScreen);
#endif
    this->state = APPLICATION_STATE_FIRMWARE_UPDATE;
#ifdef HAS_WS2812_LED
    this->updateLedState();
#endif
    return;
  }

#ifdef HAS_LVGL_DISPLAY
  uint32_t now = millis();
  if (this->resourceCount == 0) {
    if (this->state == APPLICATION_STATE_NO_RESOURCES) {
      return;
    }

    this->logger.debug("Resource count is 0, showing no resources screen");
    this->state = APPLICATION_STATE_NO_RESOURCES;

    Display::transitionToScreen(&Display::noResourcesScreen);
    return;
  }

  if (this->resourceCount > 0 && !this->resourceIsSelected) {
    Display::resourceListScreen.setAuthenticated(this->unlocked);
    if (this->resourceListUpdated) {
      // Update UI with the list.
      Display::resourceListScreen.setResourceList(this->resourceList);
      this->resourceListUpdated = false;
    }

    if (this->state == APPLICATION_STATE_RESOURCE_LIST) {
      if (this->unlocked) {
        uint32_t effectivePause = this->accumulatedPauseMs;
        if (this->actionInProgressCount > 0) {
          effectivePause += (now >= this->pauseStartMs) ? now - this->pauseStartMs : 0;
        }
        uint32_t effectiveElapsed = now - this->timeOfUnlockedMs;
        effectiveElapsed = effectiveElapsed > effectivePause
                               ? effectiveElapsed - effectivePause
                               : 0;
        if (effectiveElapsed > this->UNLOCKED_TIMEOUT_MS) {
          this->logger.debug("Unlocked timeout reached, locking");
          this->unlocked = false;
          this->selectedResourceId = 0;
          Display::resourceListScreen.setAuthenticated(false);
        }
      }
      return;
    }

    this->logger.debug("Showing resource list");
    this->state = APPLICATION_STATE_RESOURCE_LIST;
    this->nfc.enableCardDetection();
#ifdef HAS_LVGL_DISPLAY
    Display::transitionToScreen(&Display::resourceListScreen);
#endif
    return;
  }

  if (this->selectedResourceChanged) {
    for (uint16_t i = 0; i < this->resourceList.count; ++i) {
      if (this->resourceList.items[i].id == this->selectedResourceId) {
        API::ResourceBrief resource = this->resourceList.items[i];

        Display::lockscreen.setResourceName(resource.name);
        Display::lockscreen.setUsageInfo(resource.hasActiveUsage,
                                         resource.activeUser,
                                         resource.isUnderMaintenance);

        // Directly pass the native struct to the screen so it can avoid String
        // conversions
        Display::resourceDetailsScreen.setResourceAndUsageDetails(resource);

        break;
      }
    }
    this->selectedResourceChanged = false;
  }

  if (!this->unlocked) {
    if (this->state == APPLICATION_STATE_LOCKED) {

      if (now - this->timeOfResourceSelectionMs >
          this->RESOURCE_SELECTION_TIMEOUT_MS) {
        this->logger.debug("Resource details timeout reached, showing resource list");
        this->resourceIsSelected = false;
      }
      return;
    }

    this->logger.debug("Card is not detected, showing lockscreen");
    this->state = APPLICATION_STATE_LOCKED;
#ifdef HAS_LVGL_DISPLAY
    Display::transitionToScreen(&Display::lockscreen, [this]() {
      this->logger.debug(
          "Lockscreen transition complete, enabling card detection");
      this->nfc.enableCardDetection();
    });
#else
    this->nfc.enableCardDetection();
#endif
    return;
  }

  if (this->state == APPLICATION_STATE_UNLOCKED) {
    // Subtract any accumulated pause time while actions were in-progress.
    // accumulatedPauseMs only gets the elapsed delta added once an action
    // finishes (endActionPause). While an action is still running -- most
    // notably while the user fills out a resource usage form -- include the
    // in-progress pause here too, so the logout timeout stays frozen for the
    // whole duration instead of expiring mid-form.
    uint32_t effectivePause = this->accumulatedPauseMs;
    if (this->actionInProgressCount > 0) {
      effectivePause +=
          (now >= this->pauseStartMs) ? (now - this->pauseStartMs) : 0;
    }
    uint32_t effectiveElapsed = now - this->timeOfUnlockedMs;
    if (effectiveElapsed > effectivePause) {
      effectiveElapsed -= effectivePause;
    } else {
      effectiveElapsed = 0;
    }
    if (effectiveElapsed > this->UNLOCKED_TIMEOUT_MS) {
      this->logger.debug("Unlocked timeout reached, locking");
      this->unlocked = false;
       this->resourceIsSelected = false;
    }

    if (this->projectsOfUserResponseUpdated) {
#ifdef HAS_LVGL_DISPLAY
      Display::resourceDetailsScreen.setProjects(this->projectsOfUserResponse);
      Display::resourceDetailsScreen.setSelectedProject(
          this->selectedProjectId, this->selectedProjectName.c_str());
#endif
      this->projectsOfUserResponseUpdated = false;
    }

    return;
  }

  this->logger.debug("Card authenticated, enabling resource list actions");
  this->state = APPLICATION_STATE_RESOURCE_LIST;
  this->restartSessionTimeout();
  Display::resourceListScreen.setAuthenticated(true);
  Display::transitionToScreen(&Display::resourceListScreen);
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

#ifdef HAS_LVGL_DISPLAY
void Application::beginEnrollment() {
  // WAIT_FOR_CARD rides the normal card-detection loop, which re-arms the
  // reader reliably across removals/re-presentations. (The earlier poll-only
  // approach wedged the PN532 after the auth performed for an already-enrolled
  // card, so a freshly presented card was never seen until timeout — ATT-503.)
  // Detection is disabled again only for the auth/write once a card is picked.
  this->enrollCardDetected = false;
  this->nfc.resetCardPresence();
  this->nfc.enableCardDetection();
  this->enrollPhase = ENROLL_PHASE_WAIT_FOR_CARD;
  this->enrollKeyMaterialReady = false;
  this->enrollCancelRequested = false;
  this->enrollErrorPending = false;
  this->enrollErrorMessage[0] = '\0';
  this->apiEnrollNewCardGetAvailableKeyNoStartTimeMs = millis();
  this->enrollPhaseChangedMs = this->apiEnrollNewCardGetAvailableKeyNoStartTimeMs;

  Display::enrollmentScreen.setUserName(
      this->apiEnrollNewCardGetAvailableKeyNoData.username);
  Display::enrollmentScreen.setEnrollmentTimeoutTime(
      this->apiEnrollNewCardGetAvailableKeyNoStartTimeMs + ENROLLMENT_TIMEOUT_MS);
  Display::enrollmentScreen.setStatus(EnrollmentScreen::STATUS_WAITING);
  Display::transitionToScreen(&Display::enrollmentScreen);

  this->state = APPLICATION_STATE_ENROLLMENT;
  this->externalState = EXTERNAL_STATE_NONE;
}

void Application::exitEnrollment() {
  this->enrollPhase = ENROLL_PHASE_NONE;
  this->externalState = EXTERNAL_STATE_NONE;
  this->unlocked = false;
  // Hand back to the generic screen routing; next processState() iteration
  // re-evaluates and transitions to the correct idle screen (lock / list /
  // no-resources), re-enabling card detection on the way.
  this->state = APPLICATION_STATE_INIT;
}

void Application::processEnrollment() {
  uint32_t now = millis();

  // Explicit cancel (device touch button) wins over everything else.
  if (this->enrollCancelRequested) {
    this->enrollCancelRequested = false;
    this->logger.debug("Enrollment cancelled by user");
    this->api.sendEnrollNewCardCancel();
    this->exitEnrollment();
    return;
  }

  // Overall timeout — but never interrupt the brief success confirmation.
  if (this->enrollPhase != ENROLL_PHASE_SUCCESS &&
      now - this->apiEnrollNewCardGetAvailableKeyNoStartTimeMs >
          ENROLLMENT_TIMEOUT_MS) {
    this->logger.error("Enrollment timeout reached");
    this->api.sendEnrollNewCardCancel();
    this->exitEnrollment();
    return;
  }

  // Server-reported error (e.g. card already enrolled). Surface it, then the
  // ERROR dwell loop retries within the remaining time.
  if (this->enrollErrorPending) {
    this->enrollErrorPending = false;
    this->beeper.errorBeep();
    Display::enrollmentScreen.setStatus(EnrollmentScreen::STATUS_ERROR);
    Display::enrollmentScreen.setStatusMessage(this->enrollErrorMessage);
    this->enrollPhase = ENROLL_PHASE_ERROR;
    this->enrollPhaseChangedMs = now;
    return;
  }

  switch (this->enrollPhase) {
  case ENROLL_PHASE_WAIT_FOR_CARD: {
    // The detection loop flags a card via the card-detection callback; until
    // then there is nothing to do but keep the screen up.
    if (!this->enrollCardDetected) {
      break;
    }
    this->enrollCardDetected = false;

    // Take exclusive control of the PN532 for the authenticate + write that
    // follow, so the detection loop doesn't probe the card underneath us.
    this->nfc.disableCardDetection();

    uint8_t uid[7] = {0};
    uint8_t uidLength = 0;
    uint8_t keyNo = 0;
    if (this->nfc.getAvailableKeyNo(uid, &uidLength, &keyNo)) {
      this->api.sendEnrollNewCardAvailableKeyNo(uid, uidLength, keyNo);
      this->enrollPhase = ENROLL_PHASE_REQUESTED_KEY;
      this->enrollPhaseChangedMs = now;
    } else {
      // Card slipped away or has no writable key. Surface the failure instead
      // of silently re-arming, otherwise DESFire setup/auth failures look like
      // the reader ignored the card.
      this->beeper.errorBeep();
      Display::enrollmentScreen.setStatus(EnrollmentScreen::STATUS_ERROR);
      Display::enrollmentScreen.setStatusMessage(
          "Karte konnte nicht\nvorbereitet werden");
      this->enrollPhase = ENROLL_PHASE_ERROR;
      this->enrollPhaseChangedMs = now;
      this->nfc.resetCardPresence();
    }
    break;
  }

  case ENROLL_PHASE_REQUESTED_KEY: {
    // Key material arrives asynchronously via the API callback, which only
    // sets a flag — the actual write happens here on the main loop.
    if (this->enrollKeyMaterialReady) {
      this->enrollKeyMaterialReady = false;
      Display::enrollmentScreen.setStatus(EnrollmentScreen::STATUS_WRITING);
      this->enrollPhase = ENROLL_PHASE_WRITING;
      this->enrollPhaseChangedMs = now;
    }
    break;
  }

  case ENROLL_PHASE_WRITING: {
    bool ok = this->nfc.changeKey(
        this->apiEnrollNewCardData.keyNo, this->nfc.FACTORY_KEY,
        this->nfc.FACTORY_KEY, this->apiEnrollNewCardData.keyBytes,
        NFC::CARD_KEY_VERSION_ENROLLED);
    this->api.sendEnrollNewCard(ok);
    if (ok) {
      this->beeper.successBeep();
      Display::enrollmentScreen.setStatus(EnrollmentScreen::STATUS_SUCCESS);
      this->enrollPhase = ENROLL_PHASE_SUCCESS;
    } else {
      this->beeper.errorBeep();
      Display::enrollmentScreen.setStatus(EnrollmentScreen::STATUS_ERROR);
      Display::enrollmentScreen.setStatusMessage(
          "Karte konnte nicht\ngeschrieben werden");
      this->enrollPhase = ENROLL_PHASE_ERROR;
    }
    this->enrollPhaseChangedMs = now;
    break;
  }

  case ENROLL_PHASE_SUCCESS: {
    if (now - this->enrollPhaseChangedMs > ENROLL_SUCCESS_DWELL_MS) {
      this->exitEnrollment();
    }
    break;
  }

  case ENROLL_PHASE_ERROR: {
    // Per ATT-503 the screen must not disappear on error. Show it briefly,
    // then drop back to waiting so the user can re-present the card. Re-arm the
    // detection loop so the next (possibly different) card is picked up cleanly.
    if (now - this->enrollPhaseChangedMs > ENROLL_ERROR_DWELL_MS) {
      Display::enrollmentScreen.setStatus(EnrollmentScreen::STATUS_WAITING);
      this->enrollPhase = ENROLL_PHASE_WAIT_FOR_CARD;
      this->enrollCardDetected = false;
      this->nfc.resetCardPresence();
      this->nfc.enableCardDetection();
    }
    break;
  }

  default:
    break;
  }
}

void Application::beginReset() {
  // Mirrors beginEnrollment(): WAIT_FOR_CARD rides the normal card-detection
  // loop (reliable re-arm across removals); detection is disabled only for the
  // authenticate + write once a card is actually picked.
  this->resetCardDetected = false;
  this->nfc.resetCardPresence();
  this->nfc.enableCardDetection();
  this->resetPhase = RESET_PHASE_WAIT_FOR_CARD;
  this->resetCancelRequested = false;
  this->resetStartTimeMs = millis();
  this->resetPhaseChangedMs = this->resetStartTimeMs;

  Display::resetScreen.setUserName(this->apiResetNfcCardData.username);
  Display::resetScreen.setTimeoutTime(this->resetStartTimeMs + RESET_TIMEOUT_MS);
  Display::resetScreen.setStatus(ResetScreen::STATUS_WAITING);
  Display::transitionToScreen(&Display::resetScreen);

  this->state = APPLICATION_STATE_RESET;
  this->externalState = EXTERNAL_STATE_NONE;
}

void Application::exitReset() {
  this->resetPhase = RESET_PHASE_NONE;
  this->externalState = EXTERNAL_STATE_NONE;
  this->unlocked = false;
  // Hand back to the generic screen routing; next processState() iteration
  // re-evaluates and transitions to the correct idle screen.
  this->state = APPLICATION_STATE_INIT;
}

void Application::processReset() {
  uint32_t now = millis();

  // Explicit cancel (device touch button) wins over everything else.
  if (this->resetCancelRequested) {
    this->resetCancelRequested = false;
    this->logger.debug("Reset cancelled by user");
    this->api.sendResetNfcCardCancel();
    this->exitReset();
    return;
  }

  // Overall timeout — but never interrupt the brief success confirmation.
  if (this->resetPhase != RESET_PHASE_SUCCESS &&
      now - this->resetStartTimeMs > RESET_TIMEOUT_MS) {
    this->logger.error("Reset timeout reached");
    this->api.sendResetNfcCardCancel();
    this->exitReset();
    return;
  }

  switch (this->resetPhase) {
  case RESET_PHASE_WAIT_FOR_CARD: {
    // The detection loop flags a card via the card-detection callback; until
    // then there is nothing to do but keep the screen up.
    if (!this->resetCardDetected) {
      break;
    }
    this->resetCardDetected = false;

    // Take exclusive control of the PN532 for the authenticate + write that
    // follow, so the detection loop doesn't probe the card underneath us.
    this->nfc.disableCardDetection();
    Display::resetScreen.setStatus(ResetScreen::STATUS_WRITING);
    this->resetPhase = RESET_PHASE_WRITING;
    this->resetPhaseChangedMs = now;
    break;
  }

  case RESET_PHASE_WRITING: {
    // Authenticate as the (still factory) application master key, then change
    // the stored slot from the card's current key back to the factory key.
    bool ok = this->nfc.changeKey(this->apiResetNfcCardData.keyNo,
                                  this->nfc.FACTORY_KEY,
                                  this->apiResetNfcCardData.keyBytes,
                                  this->nfc.FACTORY_KEY,
                                  NFC::CARD_KEY_VERSION_FREE);
    this->api.sendResetNfcCard(ok);
    if (ok) {
      this->beeper.successBeep();
      Display::resetScreen.setStatus(ResetScreen::STATUS_SUCCESS);
      this->resetPhase = RESET_PHASE_SUCCESS;
    } else {
      this->beeper.errorBeep();
      Display::resetScreen.setStatus(ResetScreen::STATUS_ERROR);
      Display::resetScreen.setStatusMessage(
          "Karte konnte nicht\nzurueckgesetzt werden");
      this->resetPhase = RESET_PHASE_ERROR;
    }
    this->resetPhaseChangedMs = now;
    break;
  }

  case RESET_PHASE_SUCCESS: {
    if (now - this->resetPhaseChangedMs > RESET_SUCCESS_DWELL_MS) {
      this->exitReset();
    }
    break;
  }

  case RESET_PHASE_ERROR: {
    // Keep the screen up briefly, then drop back to waiting so the user can
    // re-present the card. Re-arm detection so the next card is picked cleanly.
    if (now - this->resetPhaseChangedMs > RESET_ERROR_DWELL_MS) {
      Display::resetScreen.setStatus(ResetScreen::STATUS_WAITING);
      this->resetPhase = RESET_PHASE_WAIT_FOR_CARD;
      this->resetCardDetected = false;
      this->nfc.resetCardPresence();
      this->nfc.enableCardDetection();
    }
    break;
  }

  default:
    break;
  }
}
#endif

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
