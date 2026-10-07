#include "application.hpp"
#include "platform.hpp"

void Application::processState() {
#ifdef HAS_WS2812_LED
  this->updateLedState();
#endif

  if (processConfigurationState()) return;
  if (processConnectionState()) return;
  if (processCardFlowState()) return;
  if (processAuthenticationState()) return;
  renderResourceState();
}
#ifdef HAS_WS2812_LED
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
  default:
    ledState = LedController::LED_STATE_WAIT_FOR_CARD;
    break;
  }
  this->led.setState(ledState);
}
#endif
