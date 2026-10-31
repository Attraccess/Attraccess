// NFC card authentication result: the server checked the card, the reader shows the outcome
// FEATURE: application-card-flow

#include "application.hpp"
#include "../state/state.hpp"

// Runs once the server verified the card (it ran the card crypto through the relay and only then
// sent the user's details). The reader does no card check of its own.
void Application::processCardAuthenticationData() {
  this->beeper.successBeep();
#ifdef HAS_WS2812_LED
  this->led.triggerSuccess();
#endif
  this->logger.info("Card verified by the server");

  this->externalState = EXTERNAL_STATE_NONE;

  this->unlocked = true;
  State::setUserLanguage(true, this->cardAuthenticationData.language);
#ifdef HAS_LVGL_DISPLAY
  this->finishCardAuthentication(true);
#endif

#ifndef HAS_LVGL_DISPLAY
  // Enable card detection to detect card removal in non-display mode
  this->nfc.enableCardDetection();
#endif
}
