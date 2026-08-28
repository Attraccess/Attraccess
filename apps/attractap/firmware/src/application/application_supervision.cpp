// Two-card supervision sub-flow: wait for a supervisor card (or web approval), verify, start session
// FEATURE: application-supervision

#include "application.hpp"
#include "platform.hpp"

#ifdef HAS_LVGL_DISPLAY

// Shared setup for both entry points: clear the flow flags, re-arm card detection and put the
// supervision screen up. Re-arming matters because the requester's card may still be on the reader
// (mirrors the enrollment/reset re-arm rationale).
void Application::enterSupervisionScreen(const std::string &requesterName, const std::string &hint) {
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

  this->nfc.resetCardPresence();
  this->nfc.enableCardDetection();

  Display::supervisionScreen.setRequesterName(requesterName);
  Display::supervisionScreen.setTimeoutTime(this->supervisionStartTimeMs +
                                            SUPERVISION_TIMEOUT_MS);
  Display::supervisionScreen.setStatus(SupervisionScreen::STATUS_WAITING);
  Display::supervisionScreen.setSupervisorHint(hint);
  // Card-tap entry opens this screen straight from a button press, so the cancel button must ignore
  // clicks that come out of that same press (ATT-867).
  Display::supervisionScreen.armCancelGuard();
  Display::transitionToScreen(&Display::supervisionScreen);

  this->state = APPLICATION_STATE_SUPERVISION;
  this->externalState = EXTERNAL_STATE_NONE;
}

// Server-armed entry (ATT-816). The requester started in the web UI and is not at the reader, so
// their name comes from the server and no request is opened here — the server already made one.
// Deliberately does NOT touch selectedResourceId: that is the reader's own long-lived selection,
// driven by selectResource(), and the requester's resource may not even be linked to this reader.
// processSupervision() uses supervisionResourceId() for the two calls that need an id.
void Application::beginWebInitiatedSupervision() {
  this->supervisionWebInitiated = true;
  this->enterSupervisionScreen(this->supervisionRequesterName,
                               "Aufsichts-Karte auflegen");
}

// The resource this supervision flow is about — the server's for a web-initiated arm, the reader's
// own selection for the card-tap flow.
uint32_t Application::supervisionResourceId() const {
  return this->supervisionWebInitiated ? this->supervisionRequestedResourceId
                                       : this->selectedResourceId;
}

void Application::beginSupervision() {
  this->supervisionWebInitiated = false;
  this->enterSupervisionScreen(this->cardAuthenticationData.username,
                               "Aufsichts-Karte auflegen oder per\nApp/Web bestaetigen");

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
  this->supervisionWebInitiated = false;
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
    Display::supervisionScreen.setSupervisorHint(this->supervisionHintMessage);
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
    Display::supervisionScreen.setStatusMessage(this->supervisionErrorMessage);
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
    Display::supervisionScreen.setStatusMessage(this->supervisionErrorMessage);
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
        this->supervisionResourceId());
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
    if (ok && this->supervisionWebInitiated) {
      // The requester is not here — starting a session on this reader would attribute it to nobody.
      // Confirm the auth instead and let the server approve the pending web request; the outcome
      // comes back as SUPERVISION_RESOLVED.
      this->beeper.successBeep();
      this->api.confirmSupervisorCardAuth(this->supervisionResourceId());
      Display::supervisionScreen.setStatus(SupervisionScreen::STATUS_VERIFYING);
      this->supervisionPhase = SUPERVISION_PHASE_STARTING;
      this->supervisionPhaseChangedMs = now;
    } else if (ok) {
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
    // Card-tap flow: exitSupervision() already handed control to the session screen.
    // Web-initiated flow: waiting for the server's SUPERVISION_RESOLVED, which arrives as
    // supervisionResolvedByWeb (success) or supervisionFailed, both handled above.
    break;

  case SUPERVISION_PHASE_SUCCESS: {
    if (now - this->supervisionPhaseChangedMs > SUPERVISION_SUCCESS_DWELL_MS) {
      // Web-approval success: the session is live server-side, just show the unlocked screen.
      // For a web-initiated flow nobody is authenticated at this reader, so hand back to the normal
      // screen routing instead of opening an unlocked session for an absent user.
      this->exitSupervision(!this->supervisionWebInitiated, false);
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
