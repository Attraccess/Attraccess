// The Lite's LED ring: what it shows for the application state (ATT-1371: and the Bluetooth setup).
// FEATURE: application-led

#ifdef HAS_WS2812_LED

#include "application.hpp"
#include "../bt_setup/bt_setup.hpp"
#include "../led/led_bt_setup.hpp"

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
  case APPLICATION_STATE_PENDING_APPROVAL: {
    // The ring shows the pattern the admin compares; a stale one must not match another reader.
    ledState = LedController::LED_STATE_ENROLLMENT_PENDING;
    const State::EnrollmentState enrollment = State::getEnrollmentState();
    this->led.setEnrollmentPattern(enrollment.hasPattern && !enrollment.stale, enrollment.pattern);
    break;
  }
  default:
    ledState = LedController::LED_STATE_WAIT_FOR_CARD;
    break;
  }
  // The Bluetooth setup replaces "Configuration Required" and "Initializing" while its window is open; the pairing
  // pattern keeps the ring (led_bt_setup.hpp).
  const LedBtSetup::Base base = ledState == LedController::LED_STATE_CONFIG_REQUIRED ? LedBtSetup::Base::ConfigRequired
                                : ledState == LedController::LED_STATE_INIT         ? LedBtSetup::Base::Init
                                : ledState == LedController::LED_STATE_ENROLLMENT_PENDING
                                    ? LedBtSetup::Base::PairingPending
                                    : LedBtSetup::Base::Other;
  if (LedBtSetup::shows(base, bt_setup::isOpen())) ledState = LedController::LED_STATE_BT_SETUP;
  this->led.setState(ledState);

  // Flash the result of a pairing request exactly once.
  const uint8_t outcome = State::consumeEnrollmentOutcome();
  if (outcome == State::ENROLLMENT_OUTCOME_ACCEPTED) {
    this->led.triggerSuccess();
  } else if (outcome == State::ENROLLMENT_OUTCOME_FAILED) {
    this->led.triggerError();
  }
  // A paired reader's secure session failed (server not verifiable, or repeated handshake
  // failures): the error flash, once per failed attempt; the ring keeps connecting meanwhile.
  if (State::consumeSessionProblemNotice()) {
    this->led.triggerError();
  }
  // A card the server did not verify: the error flash, as for a wrong-key card on firmware 1.x.
  if (this->cardRejectedLedPending) {
    this->cardRejectedLedPending = false;
    this->led.triggerError();
  }
}

#endif
