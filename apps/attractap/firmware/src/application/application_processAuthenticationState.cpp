#include "application.hpp"
#include "platform.hpp"

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
    Display::showErrorPopup("Anmeldung fehlgeschlagen", "Bitte RFID-Karte erneut auflegen.");
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
