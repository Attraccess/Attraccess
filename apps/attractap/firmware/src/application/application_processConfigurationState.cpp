#include "application.hpp"
#include "platform.hpp"

bool Application::processConfigurationState()
{
#ifdef DEMO_MODE
  // In demo mode, handle a pending card scan for the settings screen.
  if (this->demoPendingScanReady) {
    this->demoPendingScanReady = false;
    this->nfc.disableCardDetection();
    Display::demoSettingsScreen.onCardScanned(this->demoScanUid);
    this->demoScanUid.clear();
    return true;
  }
  // In demo mode the settings screen is always accessible and connection
  // config / PIN prompts are suppressed.
  if (this->state == APPLICATION_STATE_CONFIGURATION_REQUIRED) {
    return true;
  }
#else
  AttraccessApiConfig attraccessApiConfig = Settings::getAttraccessApiConfig();
  bool connectionIsConfigured = !attraccessApiConfig.hostname.empty() &&
                                attraccessApiConfig.hostname != "" &&
                                attraccessApiConfig.port > 0;

    if (!connectionIsConfigured)
    {
        if (this->state != APPLICATION_STATE_CONFIGURATION_REQUIRED)
        {
            this->logger.debug("Connection not configured, showing config screen");
            this->state = APPLICATION_STATE_CONFIGURATION_REQUIRED;

#ifdef HAS_LVGL_DISPLAY
      Display::connectionConfigurationScreen.disablePinLock();
      Display::transitionToScreen(&Display::connectionConfigurationScreen);
#endif
    }

    return true;
  }

    if (this->state == APPLICATION_STATE_CONFIGURATION_REQUIRED)
    {
        return true;
    }
#endif // DEMO_MODE

#ifdef HAS_LVGL_DISPLAY
  if (!this->bootDone &&
      millis() - this->bootTime > APPLICATION_BOOT_SCREEN_DURATION) {
    this->logger.debug("Boot screen duration reached, hiding boot screen");
    this->bootDone = true;
  }

  if (!this->bootDone) {
    return true;
  }

#ifndef DEMO_MODE
  bool pinIsSet = Settings::getDeviceConfig().passCode != "0000";
  if (!pinIsSet) {
    if (this->state == APPLICATION_STATE_PIN_NOT_SET) {
      return true;
    }

    this->logger.debug("PIN is not set, showing pin screen");
    this->state = APPLICATION_STATE_PIN_NOT_SET;

    Display::transitionToScreen(&Display::setPinScreen);
    return true;
  }
#endif // !DEMO_MODE
#endif // HAS_LVGL_DISPLAY

  return false;
}
