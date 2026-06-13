// Two-card supervision sub-flow: wait for a supervisor card (or web approval), verify, start session
// FEATURE: application-supervision

#include "application.hpp"

#ifdef HAS_LVGL_DISPLAY

void Application::beginSupervision() {
  this->supervisionPhase = SUPERVISION_PHASE_WAIT_FOR_CARD;
  this->supervisionCardDetected = false;
  this->supervisionKeyReady = false;
  this->supervisionResolvedByWeb = false;
  this->supervisionFailed = false;
  this->supervisionCardRejected = false;
  this->supervisionCancelRequested = false;
  this->supervisionTerminalError = false;
  this->supervisionHintReady = false;
  this->autoStartAfterSupervision = false;
  this->supervisionErrorMessage[0] = '\0';
  this->supervisionStartTimeMs = millis();
  this->supervisionPhaseChangedMs = this->supervisionStartTimeMs;

  // Re-arm detection so the next presented (supervisor) card is picked up reliably, even if the
  // requester's card is still on the reader (mirrors the enrollment/reset re-arm rationale).
  this->nfc.resetCardPresence();
  this->nfc.enableCardDetection();

  Display::supervisionScreen.setRequesterName(this->cardAuthenticationData.username);
  Display::supervisionScreen.setTimeoutTime(this->supervisionStartTimeMs +
                                            SUPERVISION_TIMEOUT_MS);
  Display::supervisionScreen.setStatus(SupervisionScreen::STATUS_WAITING);
  Display::supervisionScreen.setSupervisorHint(
      "Tutor-Karte auflegen oder per\nApp/Web bestaetigen");
  Display::transitionToScreen(&Display::supervisionScreen);

  this->state = APPLICATION_STATE_SUPERVISION;
  this->externalState = EXTERNAL_STATE_NONE;

  // Ask the server to open the request and broadcast it to eligible supervisors (web channel).
  this->api.requestSupervision(this->selectedResourceId);
}

void Application::exitSupervision(bool unlockResource, bool autoStart) {
  this->supervisionPhase = SUPERVISION_PHASE_NONE;
  this->supervisionCardDetected = false;
  this->supervisionKeyReady = false;
  this->supervisionResolvedByWeb = false;
  this->supervisionFailed = false;
  this->supervisionCardRejected = false;
  this->supervisionCancelRequested = false;
  this->externalState = EXTERNAL_STATE_NONE;
  this->unlocked = unlockResource;
  this->autoStartAfterSupervision = autoStart;
  // Hand back to the generic screen routing; the next processState() iteration transitions to the
  // right screen (unlocked => resource details, otherwise lock / list).
  this->state = APPLICATION_STATE_INIT;
}

void Application::processSupervision() {
  uint32_t now = millis();

  // Explicit cancel (device touch button) wins over everything else.
  if (this->supervisionCancelRequested) {
    this->supervisionCancelRequested = false;
    this->logger.debug("Supervision cancelled by user");
    this->api.cancelSupervision();
    this->exitSupervision(false, false);
    return;
  }

  // Secondary hint from the server's request acknowledgement (eligible supervisor names).
  if (this->supervisionHintReady) {
    this->supervisionHintReady = false;
    Display::supervisionScreen.setSupervisorHint(String(this->supervisionHintMessage));
  }

  // Web approval resolved the request: the session is already started server-side. Show success and
  // hand off to the unlocked session screen WITHOUT auto-starting (that would double-start).
  if (this->supervisionResolvedByWeb &&
      this->supervisionPhase != SUPERVISION_PHASE_SUCCESS) {
    this->supervisionResolvedByWeb = false;
    this->beeper.successBeep();
    this->nfc.disableCardDetection();
    Display::supervisionScreen.setStatus(SupervisionScreen::STATUS_SUCCESS);
    this->supervisionPhase = SUPERVISION_PHASE_SUCCESS;
    this->supervisionPhaseChangedMs = now;
    return;
  }

  // Terminal failure (no supervisors available / web rejected / server-side expiry): show, then exit.
  if (this->supervisionFailed) {
    this->supervisionFailed = false;
    this->beeper.errorBeep();
    Display::supervisionScreen.setStatus(SupervisionScreen::STATUS_ERROR);
    Display::supervisionScreen.setStatusMessage(String(this->supervisionErrorMessage));
    this->supervisionPhase = SUPERVISION_PHASE_ERROR;
    this->supervisionTerminalError = true;
    this->supervisionPhaseChangedMs = now;
    return;
  }

  // Recoverable rejection (the presented card is not an authorised supervisor): show briefly, then
  // return to waiting so another card can be tried.
  if (this->supervisionCardRejected) {
    this->supervisionCardRejected = false;
    this->beeper.errorBeep();
    Display::supervisionScreen.setStatus(SupervisionScreen::STATUS_ERROR);
    Display::supervisionScreen.setStatusMessage(String(this->supervisionErrorMessage));
    this->supervisionPhase = SUPERVISION_PHASE_ERROR;
    this->supervisionTerminalError = false;
    this->supervisionPhaseChangedMs = now;
    return;
  }

  // Overall timeout — but never interrupt the brief success confirmation. Kept consistent with the
  // server-side 30s TTL and the web popup countdown.
  if (this->supervisionPhase != SUPERVISION_PHASE_SUCCESS &&
      now - this->supervisionStartTimeMs > SUPERVISION_TIMEOUT_MS) {
    this->logger.error("Supervision timeout reached");
    this->api.cancelSupervision();
    this->exitSupervision(false, false);
    return;
  }

  switch (this->supervisionPhase) {
  case SUPERVISION_PHASE_WAIT_FOR_CARD: {
    if (!this->supervisionCardDetected) {
      break;
    }
    this->supervisionCardDetected = false;
    // Take exclusive control of the PN532 for the upcoming crypto auth.
    this->nfc.disableCardDetection();
    this->api.requestSupervisorCardAuthenticationData(
        this->supervisionCardUid, this->supervisionCardUidLength,
        this->selectedResourceId);
    this->supervisionPhase = SUPERVISION_PHASE_REQUESTED_AUTH;
    this->supervisionPhaseChangedMs = now;
    break;
  }

  case SUPERVISION_PHASE_REQUESTED_AUTH: {
    // Key material arrives asynchronously via the API callback (flag only); the on-card crypto auth
    // runs here on the main loop while the supervisor card is still held.
    if (!this->supervisionKeyReady) {
      break;
    }
    this->supervisionKeyReady = false;
    Display::supervisionScreen.setStatus(SupervisionScreen::STATUS_VERIFYING);

    bool ok = this->nfc.authenticate(this->apiSupervisorCardData.keyNo,
                                     this->apiSupervisorCardData.keyBytes);
    if (ok) {
      // Supervisor card is genuine and authorised. Hand off to the unlocked session screen and
      // auto-start there; the server attaches the supervisor recorded for this socket.
      this->beeper.successBeep();
      this->exitSupervision(true, true);
    } else {
      this->beeper.errorBeep();
      Display::supervisionScreen.setStatus(SupervisionScreen::STATUS_ERROR);
      Display::supervisionScreen.setStatusMessage(
          "Karte konnte nicht\ngelesen werden");
      this->supervisionPhase = SUPERVISION_PHASE_ERROR;
      this->supervisionTerminalError = false;
      this->supervisionPhaseChangedMs = now;
    }
    break;
  }

  case SUPERVISION_PHASE_STARTING:
    // exitSupervision() already handed control to the session screen; nothing to do here.
    break;

  case SUPERVISION_PHASE_SUCCESS: {
    if (now - this->supervisionPhaseChangedMs > SUPERVISION_SUCCESS_DWELL_MS) {
      // Web-approval success: the session is live server-side, just show the unlocked screen.
      this->exitSupervision(true, false);
    }
    break;
  }

  case SUPERVISION_PHASE_ERROR: {
    if (now - this->supervisionPhaseChangedMs > SUPERVISION_ERROR_DWELL_MS) {
      if (this->supervisionTerminalError) {
        this->exitSupervision(false, false);
      } else {
        // Recoverable: re-arm detection and wait for another card within the remaining time.
        Display::supervisionScreen.setStatus(SupervisionScreen::STATUS_WAITING);
        this->supervisionPhase = SUPERVISION_PHASE_WAIT_FOR_CARD;
        this->supervisionCardDetected = false;
        this->nfc.resetCardPresence();
        this->nfc.enableCardDetection();
      }
    }
    break;
  }

  default:
    break;
  }
}

#endif
