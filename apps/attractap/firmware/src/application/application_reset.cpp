// Card reset on the Touch: wait for the card, let the server reset it through the card relay, show the result.
// FEATURE: application-reset

#include "application.hpp"
#include "../state/state.hpp"
#include "../platform.hpp"

#ifdef HAS_LVGL_DISPLAY

void Application::beginReset() {
  if (this->unlocked || this->cardAuthenticationPending) this->logoutReader(); // as in beginEnrollment()
  this->unlocked = false;
  State::setUserLanguage(false);
  // Mirrors beginEnrollment(): WAIT_FOR_CARD rides the normal card-detection
  // loop (reliable re-arm across removals); detection is disabled only for the
  // authenticate + write once a card is actually picked.
  this->resetCardDetected = false;
  this->nfc.resetCardPresence();
  this->nfc.enableCardDetection();
  this->resetPhase = RESET_PHASE_WAIT_FOR_CARD;
  this->resetCancelRequested = false;
  this->resetSucceeded = false;
  this->resetErrorPending = false;
  this->resetStartTimeMs = millis();
  this->resetPhaseChangedMs = this->resetStartTimeMs;

  Display::resetScreen.setUserName(this->apiResetNfcCardData.displayName);
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
  State::setUserLanguage(false);
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
    this->cardRelay.cancel();
    this->api.sendResetNfcCardCancel();
    this->exitReset();
    return;
  }

  // Overall timeout — but never interrupt the brief success confirmation.
  if (this->resetPhase != RESET_PHASE_SUCCESS &&
      now - this->resetStartTimeMs > RESET_TIMEOUT_MS) {
    this->logger.error("Reset timeout reached");
    this->cardRelay.cancel();
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
    // The server resets the card through the relay and only then forgets it.
    this->api.sendCardDetected("reset", this->resetCardUid, this->resetCardUidLength);
    Display::resetScreen.setStatus(ResetScreen::STATUS_WRITING);
    this->resetPhase = RESET_PHASE_WRITING;
    this->resetPhaseChangedMs = now;
    break;
  }

  case RESET_PHASE_WRITING: {
    if (this->resetSucceeded) {
      this->resetSucceeded = false;
      this->beeper.successBeep();
      Display::resetScreen.setStatus(ResetScreen::STATUS_SUCCESS);
      this->resetPhase = RESET_PHASE_SUCCESS;
      this->resetPhaseChangedMs = now;
    } else if (this->resetErrorPending || now - this->resetPhaseChangedMs > CARD_WRITE_TIMEOUT_MS) {
      // The server did not confirm the factory state: the card record stays, present it again.
      const bool serverReason = this->resetErrorPending;
      this->resetErrorPending = false;
      this->cardRelay.cancel();
      this->beeper.errorBeep();
      Display::resetScreen.setStatus(ResetScreen::STATUS_ERROR);
      Display::resetScreen.setStatusMessage(serverReason ? FirmwareI18n::readerError(this->resetErrorMessage)
                                                         : FirmwareI18n::Text(FirmwareI18n::Message::CouldNotResetCard));
      this->resetPhase = RESET_PHASE_ERROR;
      this->resetPhaseChangedMs = now;
    }
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
