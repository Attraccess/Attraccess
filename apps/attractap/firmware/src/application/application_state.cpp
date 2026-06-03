// Main state machine: screen routing, connectivity gating, LED state mapping
// FEATURE: application-state

#include "application.hpp"

void Application::processState() {
#ifdef HAS_WS2812_LED
  this->updateLedState();
#endif

  AttraccessApiConfig attraccessApiConfig = Settings::getAttraccessApiConfig();
  bool connectionIsConfigured = !attraccessApiConfig.hostname.isEmpty() &&
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

    return;
  }

    if (this->state == APPLICATION_STATE_CONFIGURATION_REQUIRED)
    {
        return;
    }

#ifdef HAS_LVGL_DISPLAY
  if (!this->bootDone &&
      millis() - this->bootTime > APPLICATION_BOOT_SCREEN_DURATION) {
    this->logger.debug("Boot screen duration reached, hiding boot screen");
    this->bootDone = true;
  }

  if (!this->bootDone) {
    return;
  }

  bool pinIsSet = Settings::getDeviceConfig().passCode != "0000";
  if (!pinIsSet) {
    if (this->state == APPLICATION_STATE_PIN_NOT_SET) {
      return;
    }

    this->logger.debug("PIN is not set, showing pin screen");
    this->state = APPLICATION_STATE_PIN_NOT_SET;

    Display::transitionToScreen(&Display::setPinScreen);
    return;
  }
#endif

  State::ApiState apiState = State::getApiState();
  State::NetworkState networkState = State::getNetworkState();
  State::WebsocketState websocketState = State::getWebsocketState();
  if (!apiState.authenticated ||
      (!networkState.ethernet_connected && !networkState.wifi_connected) ||
      !websocketState.connected) {
#ifdef HAS_LVGL_DISPLAY
    this->resetSessionOnDisconnect();
#endif
        if (this->state == APPLICATION_STATE_INIT)
        {
            return;
        }

        // User intentionally opened settings from the init screen — don't force back to init.
        if (this->state == APPLICATION_STATE_CONFIGURATION_REQUIRED)
        {
            return;
        }

    this->logger.debug(
        "API state is not authenticated, network state is not connected, "
        "websocket state is not connected, showing init screen");
    this->state = APPLICATION_STATE_INIT;

#ifdef HAS_LVGL_DISPLAY
    Display::transitionToScreen(&Display::initScreen);
#endif
    return;
  }

#ifdef HAS_LVGL_DISPLAY
  if (this->externalState ==
      EXTERNAL_STATE_ENROLL_NEW_CARD_GET_AVAILABLE_KEY_NO) {
    if (this->state == APPLICATION_STATE_ENROLLMENT) {
      uint32_t now = millis();
      if (now - this->apiEnrollNewCardGetAvailableKeyNoStartTimeMs > 30000) {
        this->logger.error(
            "Enroll new card get available key number timeout reached");
        this->externalState = EXTERNAL_STATE_NONE;
        return;
      }

      uint8_t uid[7] = {0};
      uint8_t uidLength = 0;
      uint8_t keyNo = 0;
      bool success = this->nfc.getAvailableKeyNo(uid, &uidLength, &keyNo);

      if (success) {
        this->api.sendEnrollNewCardAvailableKeyNo(uid, uidLength, keyNo);
        this->externalState = EXTERNAL_STATE_NONE;
      }
      return;
    }

    this->nfc.disableCardDetection();
#ifdef HAS_LVGL_DISPLAY
    Display::enrollmentScreen.setUserName(
        this->apiEnrollNewCardGetAvailableKeyNoData.username);
#endif
    this->apiEnrollNewCardGetAvailableKeyNoStartTimeMs = millis();
#ifdef HAS_LVGL_DISPLAY
    Display::enrollmentScreen.setEnrollmentTimeoutTime(
        this->apiEnrollNewCardGetAvailableKeyNoStartTimeMs + 30000);
    Display::transitionToScreen(&Display::enrollmentScreen);
#endif

    this->state = APPLICATION_STATE_ENROLLMENT;

    return;
  }

  if (this->externalState == EXTERNAL_STATE_ENROLL_NEW_CARD) {
    if (this->state == APPLICATION_STATE_ENROLLMENT) {
      return;
    }

    this->nfc.enableCardDetection();
    this->state = APPLICATION_STATE_ENROLLMENT;
    return;
  }
#endif

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

  if (this->externalState == EXTERNAL_STATE_AUTHENTICATE_CARD) {
    if (this->state == APPLICATION_STATE_AUTHENTICATE_CARD) {
      return;
    }

#ifdef HAS_LVGL_DISPLAY
    Display::resourceDetailsScreen.setUserDetails(
        ResourceDetailsScreen::UserDetails{
            .username = this->cardAuthenticationData.username,
            .canManageResource = this->cardAuthenticationData.canManageResource,
            .hasIntroduction = this->cardAuthenticationData.hasIntroduction,
            .isIntroducer = this->cardAuthenticationData.isIntroducer});
#endif

    this->state = APPLICATION_STATE_AUTHENTICATE_CARD;

#ifndef HAS_LVGL_DISPLAY
    // For non-display mode, process authentication immediately since the card
    // is still present and won't trigger another detection event
    this->processCardAuthenticationData();
#else
    this->nfc.enableCardDetection();
#endif
    return;
  }

  if (this->externalState == EXTERNAL_STATE_FIRMWARE_UPDATE) {
    if (this->state == APPLICATION_STATE_FIRMWARE_UPDATE) {
#ifdef HAS_LVGL_DISPLAY
      Display::firmwareUpdateScreen.setProgress(
          this->firmwareUpdateProgressPct);
      Display::firmwareUpdateScreen.setAvailableVersion(
          this->availableFirmwareVersion);
#endif
      return;
    }

#ifdef HAS_LVGL_DISPLAY
    Display::transitionToScreen(&Display::firmwareUpdateScreen);
#endif
    this->state = APPLICATION_STATE_FIRMWARE_UPDATE;
#ifdef HAS_WS2812_LED
    this->updateLedState();
#endif
    return;
  }

#ifdef HAS_LVGL_DISPLAY
  if (this->resourceCount == 0) {
    if (this->state == APPLICATION_STATE_NO_RESOURCES) {
      return;
    }

    this->logger.debug("Resource count is 0, showing no resources screen");
    this->state = APPLICATION_STATE_NO_RESOURCES;

    Display::transitionToScreen(&Display::noResourcesScreen);
    return;
  }

  if (this->resourceCount == 1 && !this->resourceIsSelected) {
    this->logger.debug(
        "Resource count is 1 and resource is not selected, selecting resource");
    this->selectResource(resourceList.items[0]);
    return;
  }

  if (this->resourceCount > 0 && !this->resourceIsSelected) {
    if (this->resourceListUpdated) {
// Update UI with the list
#ifdef HAS_LVGL_DISPLAY
      Display::resourceListScreen.setResourceList(this->resourceList);
#endif
      this->resourceListUpdated = false;
    }

    if (this->state == APPLICATION_STATE_RESOURCE_LIST) {
      return;
    }

    this->logger.debug("Resource count is greater than 0 and resource is not "
                       "selected, showing resource list");
    this->state = APPLICATION_STATE_RESOURCE_LIST;
#ifdef HAS_LVGL_DISPLAY
    Display::transitionToScreen(&Display::resourceListScreen);
#endif
    return;
  }

  if (this->selectedResourceChanged) {
    for (uint16_t i = 0; i < this->resourceList.count; ++i) {
      if (this->resourceList.items[i].id == this->selectedResourceId) {
        API::ResourceBrief resource = this->resourceList.items[i];

        Display::lockscreen.setResourceName(resource.name);
        Display::lockscreen.setUsageInfo(resource.hasActiveUsage,
                                         resource.activeUser);

        // Directly pass the native struct to the screen so it can avoid String
        // conversions
        Display::resourceDetailsScreen.setResourceAndUsageDetails(resource);

        break;
      }
    }
    this->selectedResourceChanged = false;
  }

  uint32_t now = millis();
  if (!this->unlocked) {
    if (this->state == APPLICATION_STATE_LOCKED) {

      if (now - this->timeOfResourceSelectionMs >
          this->RESOURCE_SELECTION_TIMEOUT_MS) {
        this->logger.debug(
            "Resource selection timeout reached, showing resource list");
        this->resourceIsSelected = false;
      }
      return;
    }

    this->logger.debug("Card is not detected, showing lockscreen");
    this->state = APPLICATION_STATE_LOCKED;
#ifdef HAS_LVGL_DISPLAY
    Display::transitionToScreen(&Display::lockscreen, [this]() {
      this->logger.debug(
          "Lockscreen transition complete, enabling card detection");
      this->nfc.enableCardDetection();
    });
#else
    this->nfc.enableCardDetection();
#endif
    return;
  }

  if (this->state == APPLICATION_STATE_UNLOCKED) {
    // Subtract any accumulated pause time while actions were in-progress
    uint32_t effectiveElapsed = now - this->timeOfUnlockedMs;
    if (effectiveElapsed > this->accumulatedPauseMs) {
      effectiveElapsed -= this->accumulatedPauseMs;
    } else {
      effectiveElapsed = 0;
    }
    if (effectiveElapsed > this->UNLOCKED_TIMEOUT_MS) {
      this->logger.debug("Unlocked timeout reached, locking");
      this->unlocked = false;
      this->resourceIsSelected = this->resourceCount == 1;
    }

    if (this->projectsOfUserResponseUpdated) {
#ifdef HAS_LVGL_DISPLAY
      Display::resourceDetailsScreen.setProjects(this->projectsOfUserResponse);
      Display::resourceDetailsScreen.setSelectedProject(
          this->selectedProjectId, this->selectedProjectName.c_str());
#endif
      this->projectsOfUserResponseUpdated = false;
    }

    return;
  }

  this->logger.debug("Resource is unlocked, showing resource details screen");
  this->state = APPLICATION_STATE_UNLOCKED;
  this->restartSessionTimeout();

  Display::transitionToScreen(&Display::resourceDetailsScreen);
#else

  // Process unlocked card actions for non-display mode
  if (this->state == APPLICATION_STATE_AUTHENTICATE_CARD) {
    if (!this->cardDetected) {
      return;
    }

    if (!this->unlocked) {
      return;
    }

    if (!this->cardRemoved) {
      return;
    }

    this->logger.debug("Card detected and removed and unlocked, processing");

    // Reset state flags before triggering action
    this->unlocked = false;
    this->cardDetected = false;
    this->cardRemoved = false;

    if (this->resourceIsDoor) {
      if (this->cardPresentationWasLong) {
        this->api.lockDoor(this->selectedResourceId);
      } else {
        this->api.unlockDoor(this->selectedResourceId);
      }
    } else {
      if (this->cardPresentationWasLong) {
        this->api.stopResourceUsageSession(this->selectedResourceId);
      } else {
        this->api.startResourceUsageSession(this->selectedResourceId);
      }
    }

    // Reset state back to waiting for card
    this->state = APPLICATION_STATE_WAIT_FOR_CARD;
    this->nfc.enableCardDetection();
    return;
  }

  if (this->state != APPLICATION_STATE_WAIT_FOR_CARD) {
    this->logger.debug("Waiting for card detection");
    this->state = APPLICATION_STATE_WAIT_FOR_CARD;
    this->nfc.enableCardDetection();
    return;
  }
#endif
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
