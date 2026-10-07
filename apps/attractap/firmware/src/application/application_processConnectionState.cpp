#include "application.hpp"
#include "platform.hpp"

bool Application::processConnectionState()
{
  State::ApiState apiState = State::getApiState();
  State::NetworkState networkState = State::getNetworkState();
  State::WebsocketState websocketState = State::getWebsocketState();
  if (!apiState.authenticated ||
      (!networkState.ethernet_connected && !networkState.wifi_connected) ||
      !websocketState.connected) {
#ifdef HAS_LVGL_DISPLAY
    this->resetSessionOnDisconnect();
    // Drop any pending/active enrollment. The trigger is set asynchronously by
    // the websocket task; if a disconnect races it, a stale trigger would
    // relaunch a dead enrollment screen on reconnect (server session is gone),
    // looping USER_NOT_SET errors until timeout. Clear it here, before the
    // INIT early-return below.
    if (this->externalState == EXTERNAL_STATE_ENROLL_NEW_CARD_GET_AVAILABLE_KEY_NO ||
        this->enrollPhase != ENROLL_PHASE_NONE) {
      this->externalState = EXTERNAL_STATE_NONE;
      this->enrollPhase = ENROLL_PHASE_NONE;
    }
    // Same rationale for a pending/active reset: a stale trigger would relaunch
    // a dead reset screen on reconnect (the server session is gone).
    if (this->externalState == EXTERNAL_STATE_RESET_NFC_CARD ||
        this->resetPhase != RESET_PHASE_NONE) {
      this->externalState = EXTERNAL_STATE_NONE;
      this->resetPhase = RESET_PHASE_NONE;
    }
    this->supervision.onDisconnect();
#endif
        if (this->state == APPLICATION_STATE_INIT)
        {
            return true;
        }

        // User intentionally opened settings from the init screen — don't force back to init.
        if (this->state == APPLICATION_STATE_CONFIGURATION_REQUIRED)
        {
            return true;
        }

    this->logger.debug(
        "API state is not authenticated, network state is not connected, "
        "websocket state is not connected, showing init screen");
    this->state = APPLICATION_STATE_INIT;

#ifdef HAS_LVGL_DISPLAY
    Display::transitionToScreen(&Display::initScreen);
#endif
    return true;
  }

  return false;
}
