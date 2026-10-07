#include "application.hpp"
#include "platform.hpp"

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
        this->apiEnrollNewCardData.keyNo, this->nfc.getFactoryKey(),
        this->nfc.getFactoryKey(), this->apiEnrollNewCardData.keyBytes,
        INfc::CARD_KEY_VERSION_ENROLLED);
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

#endif
