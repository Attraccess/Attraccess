#include "application.hpp"
#include "platform.hpp"

#ifdef HAS_LVGL_DISPLAY
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
                                  this->nfc.getFactoryKey(),
                                  this->apiResetNfcCardData.keyBytes,
                                  this->nfc.getFactoryKey(),
                                  INfc::CARD_KEY_VERSION_FREE);
    this->api.sendResetNfcCard(ok);
    if (ok) {
      this->beeper.successBeep();
      Display::resetScreen.setStatus(ResetScreen::STATUS_SUCCESS);
      this->resetPhase = RESET_PHASE_SUCCESS;
    } else {
      this->beeper.errorBeep();
      Display::resetScreen.setStatus(ResetScreen::STATUS_ERROR);
      Display::resetScreen.setStatusMessage(
          "Karte konnte nicht\nzurückgesetzt werden");
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
