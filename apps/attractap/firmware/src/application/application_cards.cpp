// NFC card authentication: verify key, beep/LED feedback, unlock on success
// FEATURE: application-card-flow

#include "application.hpp"

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
    this->externalState = EXTERNAL_STATE_AUTHENTICATE_CARD;
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
    this->externalState = EXTERNAL_STATE_AUTHENTICATE_CARD;
    return;
  }

  this->beeper.successBeep();
#ifdef HAS_WS2812_LED
  this->led.triggerSuccess();
#endif
  this->logger.info("Authentication successful");

  this->externalState = EXTERNAL_STATE_NONE;

#ifdef HAS_LVGL_DISPLAY
  // Two-card supervision (ATT-493): the user's own card is genuine, but the server says this tap
  // must be authorised by a supervisor before a session can start. Hand off to the supervision
  // sub-flow instead of unlocking. The session starts once a supervisor card is tapped here, or the
  // supervisor approves from the web.
  if (this->cardAuthenticationData.requiresSupervisor) {
    this->beginSupervision();
    return;
  }
#endif

  this->unlocked = true;

#ifndef HAS_LVGL_DISPLAY
  // Enable card detection to detect card removal in non-display mode
  this->nfc.enableCardDetection();
#endif
}
