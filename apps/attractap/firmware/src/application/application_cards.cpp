// NFC card authentication: verify key, beep/LED feedback, unlock on success
// FEATURE: application-card-flow

#include "application.hpp"
#include "../state/state.hpp"

void Application::processCardAuthenticationData() {
  this->logger.infof("Trying to authenticate with keyNo: %u",
                     this->cardAuthenticationData.keyNo);
  if (this->cardAuthenticationData.keyLen != 16) {
    this->logger.error("Invalid key bytes provided");
    this->beeper.errorBeep();
#ifdef HAS_WS2812_LED
    this->led.triggerError();
#endif
    this->nfc.enableCardDetection();
#ifdef HAS_LVGL_DISPLAY
    this->finishCardAuthentication(false);
    Display::showErrorPopup("Anmeldung fehlgeschlagen", "Bitte eine gültige NFC-Karte auflegen.");
#else
    this->externalState = EXTERNAL_STATE_AUTHENTICATE_CARD;
#endif
    return;
  }

  bool authenticated =
      this->nfc.authenticate(this->cardAuthenticationData.keyNo,
                             this->cardAuthenticationData.keyBytes);

  if (!authenticated) {
    this->logger.error("Authentication failed");
    this->beeper.errorBeep();
#ifdef HAS_WS2812_LED
    this->led.triggerError();
#endif
    this->nfc.enableCardDetection();
#ifdef HAS_LVGL_DISPLAY
    this->finishCardAuthentication(false);
    Display::showErrorPopup("Anmeldung fehlgeschlagen", "Bitte eine gültige NFC-Karte auflegen.");
#else
    this->externalState = EXTERNAL_STATE_AUTHENTICATE_CARD;
#endif
    return;
  }

  this->beeper.successBeep();
#ifdef HAS_WS2812_LED
  this->led.triggerSuccess();
#endif
  this->logger.info("Authentication successful");

  this->externalState = EXTERNAL_STATE_NONE;

  this->unlocked = true;
  State::setUserLanguage(this->cardAuthenticationData.language);
#ifdef HAS_LVGL_DISPLAY
  this->finishCardAuthentication(true);
#endif

#ifndef HAS_LVGL_DISPLAY
  // Enable card detection to detect card removal in non-display mode
  this->nfc.enableCardDetection();
#endif
}
