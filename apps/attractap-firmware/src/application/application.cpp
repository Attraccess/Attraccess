#include "application.hpp"

void Application::networkTask(void *parameter)
{
    while (true)
    {
        Network::loop();
        vTaskDelay(100 / portTICK_PERIOD_MS);
    }
}

void Application::setup()
{
    Settings::setup();
    Network::setup();
    this->ioExpander.setup();
    Display::setup();
    this->nfc.setup();
    this->api.setup();

    this->api.onDeviceName([this](String deviceName)
                           { Display::setDeviceName(deviceName); });

    this->api.setResourceListUpdateCallback([this](JsonArray resourceList)
                                            { this->handleResourceListUpdate(resourceList); });

    this->api.setCardAuthenticationDetailsResponseCallback([this](uint8_t keyNo, const uint8_t *keyBytes, uint8_t keyLen, String error)
                                                           { this->handleCardAuthenticationDetails(keyNo, keyBytes, keyLen, error); });

    Display::resourceDetailsScreen.setButtonClickCallback([this](ResourceDetailsScreen::ButtonClickEventData evt)
                                                          { this->handleResourceDetailsButtonClick(evt); });

    this->api.setEnrollNewCardGetAvailableKeyNoCallback([this](String username, uint8_t *uid, uint8_t *uidLength, uint8_t *keyNo)
                                                        { 
                                                            Display::enrollmentScreen.setUserName(username);
                                                            Display::enrollmentScreen.setEnrollmentTimeoutTime(millis() + 30000);
                                                            Display::transitionToScreen(&Display::enrollmentScreen);
                                                            this->state = APPLICATION_STATE_ENROLLMENT;
                                                            return this->nfc.getAvailableKeyNo(uid, uidLength, keyNo); });

    this->api.setEnrollNewCardCallback([this](uint8_t keyNo, String key)
                                       {
                                         uint8_t keyBytes[16] = {0};
                                         stringToHexArray(key, keyBytes, 16);
                                         bool success = this->nfc.changeKey(keyNo, this->nfc.FACTORY_KEY, this->nfc.FACTORY_KEY, keyBytes);
                                         if (success)
                                         {
                                            this->ioExpander.successBeep();
                                             // TODO: show a short success message before leaving enrollment
                                         } else {
                                            this->ioExpander.errorBeep();
                                         }

                                         // TODO: why is a nfc card entry created before this succeeds?

                                         this->state = APPLICATION_STATE_RESOURCE_LIST;
                                         Display::transitionToScreen(&Display::resourceListScreen);
                                         return success; });

    xTaskCreate(Application::networkTask, "NetworkTask", 4096, nullptr, tskIDLE_PRIORITY, nullptr);

    Display::setTouchCallback([this](int16_t x, int16_t y)
                              { this->handleTouch(x, y); });

    this->bootTime = millis();
}

void Application::loop()
{
    Display::loop();
    nfc.loop();
    this->api.loop();

    this->processState();
}

void Application::processState()
{
    if (this->state == APPLICATION_STATE_CUSTOM)
    {
        return;
    }

    if (!this->bootDone && millis() - this->bootTime > APPLICATION_BOOT_SCREEN_DURATION)
    {
        this->logger.debug("Boot screen duration reached, hiding boot screen");
        this->bootDone = true;
    }

    if (!this->bootDone)
    {
        return;
    }

    bool pinIsSet = Settings::getDeviceConfig().passCode != "0000";
    if (!pinIsSet)
    {
        if (this->state == APPLICATION_STATE_PIN_NOT_SET)
        {
            return;
        }

        this->logger.debug("PIN is not set, showing pin screen");
        this->state = APPLICATION_STATE_PIN_NOT_SET;
        Display::setPinScreen.setOnPinConfirmedCallback([this](String pin)
                                                        { Settings::saveDeviceConfig(pin); });

        Display::transitionToScreen(&Display::setPinScreen);
        return;
    }

    NetworkConfig networkConfig = Settings::getNetworkConfig();
    AttraccessApiConfig attraccessApiConfig = Settings::getAttraccessApiConfig();
    bool connectionIsConfigured = !networkConfig.ssid.isEmpty() && networkConfig.ssid != "" && !attraccessApiConfig.hostname.isEmpty() && attraccessApiConfig.hostname != "" && attraccessApiConfig.port > 0;

    if (!connectionIsConfigured)
    {
        if (this->state == APPLICATION_STATE_CONFIGURATION_REQUIRED)
        {
            return;
        }

        this->logger.debug("Connection is not configured, showing connection configuration screen");
        this->state = APPLICATION_STATE_CONFIGURATION_REQUIRED;
        Display::connectionConfigurationScreen.setOnSaveCallback([this](const ConnectionConfigurationScreen::ConnectionConfig &cfg)
                                                                 { this->handleConnectionConfigurationSave(cfg); });
        Display::connectionConfigurationScreen.disablePinLock();
        Display::transitionToScreen(&Display::connectionConfigurationScreen);
        return;
    }

    State::ApiState apiState = State::getApiState();
    State::NetworkState networkState = State::getNetworkState();
    State::WebsocketState websocketState = State::getWebsocketState();
    if (!apiState.authenticated || (!networkState.ethernet_connected && !networkState.wifi_connected) || !websocketState.connected)
    {
        if (this->state == APPLICATION_STATE_INIT)
        {
            return;
        }

        this->logger.debug("API state is not authenticated, network state is not connected, websocket state is not connected, showing init screen");
        this->state = APPLICATION_STATE_INIT;
        Display::initScreen.setOnOpenSettingsCallback([this]()
                                                      {
                                                        this->state = APPLICATION_STATE_CUSTOM;
                                                        Display::connectionConfigurationScreen.enablePinLock();
                                                        Display::connectionConfigurationScreen.setOnSaveCallback([this](const ConnectionConfigurationScreen::ConnectionConfig &cfg)
                                                                 { this->handleConnectionConfigurationSave(cfg);
                                                                    Display::transitionToScreen(&Display::initScreen);
                                                                    this->state = APPLICATION_STATE_INIT;
                                                                 });
                                                        Display::connectionConfigurationScreen.setOnCancelPinLockCallback([this]()
                                                                                                                  { 
                                                                                                                    Display::transitionToScreen(&Display::initScreen);
                                                                                                                    this->state = APPLICATION_STATE_INIT; });
                                                        Display::transitionToScreen(&Display::connectionConfigurationScreen); });

        Display::transitionToScreen(&Display::initScreen);
        return;
    }

    if (this->resourceCount == 0)
    {
        if (this->state == APPLICATION_STATE_NO_RESOURCES)
        {
            return;
        }

        this->logger.debug("Resource count is 0, showing no resources screen");
        this->state = APPLICATION_STATE_NO_RESOURCES;
        Display::transitionToScreen(&Display::noResourcesScreen);
        return;
    }

    if (this->resourceCount == 1 && !this->resourceIsSelected)
    {
        this->logger.debug("Resource count is 1 and resource is not selected, selecting resource");
        this->selectResource(resourceList[0].as<JsonObject>());
        return;
    }

    if (this->resourceCount > 0 && !this->resourceIsSelected)
    {
        if (this->state == APPLICATION_STATE_RESOURCE_LIST)
        {
            return;
        }

        this->logger.debug("Resource count is greater than 0 and resource is not selected, showing resource list");
        this->state = APPLICATION_STATE_RESOURCE_LIST;
        Display::resourceListScreen.setResourceSelectionCallback([this](JsonObject resource)
                                                                 { this->selectResource(resource); });
        Display::transitionToScreen(&Display::resourceListScreen);
        return;
    }

    uint32_t now = millis();
    if (!this->unlocked)
    {
        if (this->state == APPLICATION_STATE_LOCKED)
        {

            if (now - this->timeOfResourceSelectionMs > this->RESOURCE_SELECTION_TIMEOUT_MS)
            {
                this->logger.debug("Resource selection timeout reached, showing resource list");
                this->resourceIsSelected = false;
            }
            return;
        }

        this->logger.debug("Card is not detected, showing lockscreen");
        this->state = APPLICATION_STATE_LOCKED;

        auto cardDetectionCallback = [this](uint8_t *uid, uint8_t uidLength)
        {
            this->logger.infof("Card detected: %s", hexToString(uid, uidLength).c_str());

            // TODO: ask server for key of this card
            // TODO: use key of card to authenticate

            this->api.requestCardAuthenticationData(uid, uidLength);
        };
        this->nfc.setCardDetectionCallback(cardDetectionCallback);
        Display::transitionToScreen(&Display::lockscreen, [this]()
                                    { 
                                        this->logger.debug("Lockscreen transition complete, enabling card detection");
                                        this->nfc.enableCardDetection(); });
        return;
    }

    if (this->state == APPLICATION_STATE_UNLOCKED)
    {
        if (now - this->timeOfUnlockedMs > this->UNLOCKED_TIMEOUT_MS)
        {
            this->logger.debug("Unlocked timeout reached, locking");
            this->unlocked = false;
            this->resourceIsSelected = this->resourceCount == 1;
        }
        return;
    }

    this->logger.debug("Resource is unlocked, showing resource details screen");
    this->state = APPLICATION_STATE_UNLOCKED;
    this->restartSessionTimeout();
    Display::transitionToScreen(&Display::resourceDetailsScreen);
}

void Application::handleConnectionConfigurationSave(const ConnectionConfigurationScreen::ConnectionConfig &cfg)
{
    // split cfg.host into hostname and port (if no port present, use 443)
    String hostname = cfg.host;
    String port = "443";
    if (cfg.host.indexOf(":") != -1)
    {
        hostname = cfg.host.substring(0, cfg.host.indexOf(":"));
        port = cfg.host.substring(cfg.host.indexOf(":") + 1);
    }
    Settings::saveNetworkConfig(cfg.ssid, cfg.password);
    Settings::saveAttraccessApiConfig(hostname, port.toInt(), cfg.useSSL);
    if (cfg.devicePin.length() > 0)
    {
        Settings::saveDeviceConfig(cfg.devicePin);
    }
};

void Application::handleResourceListUpdate(JsonArray resourceList)
{
    this->logger.infof("Resource list updated: %d resources", resourceList.size());
    this->resourceCount = resourceList.size();

    // Create a persistent deep copy of the resource list so we can safely access it later
    this->resourceListDoc.clear();
    JsonArray dest = this->resourceListDoc.to<JsonArray>();
    for (JsonVariant v : resourceList)
    {
        dest.add(v); // deep copy each element
    }
    this->resourceList = dest;

    // Update UI with the original incoming list (safe during this call)
    Display::resourceListScreen.setResourceList(resourceList);

    // If a resource is already selected, try to find it in the new list and refresh the details screen.
    if (this->resourceIsSelected)
    {
        this->logger.info("Resource is selected, trying to find it in the new list");
        for (JsonVariant v : this->resourceList)
        {
            JsonObject obj = v.as<JsonObject>();
            if (obj["id"].is<uint32_t>() && obj["id"].as<uint32_t>() == this->selectedResourceId)
            {
                this->logger.infof("Resource found in the new list, refreshing the details screen: %s", obj["name"].as<String>().c_str());
                this->selectResource(obj);
                break;
            }
        }
    }
}

void Application::handleCardAuthenticationDetails(uint8_t keyNo, const uint8_t *keyBytes, uint8_t keyLen, String error)
{
    this->logger.infof("Card authentication details: KeyNo: %u", keyNo);

    if (this->state != APPLICATION_STATE_LOCKED)
    {
        this->logger.error("Card authentication details received in state other than APPLICATION_STATE_LOCKED");
        this->ioExpander.errorBeep();
        return;
    }

    if (error.length() > 0)
    {
        // TODO: indicate to user that authentication failed
        this->logger.errorf("Authentication failed: %s", error.c_str());
        this->ioExpander.errorBeep();
        this->nfc.enableCardDetection();
        return;
    }

    if (keyBytes == nullptr || keyLen != 16)
    {
        this->logger.error("Invalid key bytes provided");
        this->ioExpander.errorBeep();
        this->nfc.enableCardDetection();
        return;
    }

    this->logger.infof("Trying to authenticate with keyNo: %u", keyNo);
    bool authenticated = this->nfc.authenticate(keyNo, const_cast<uint8_t *>(keyBytes));

    if (!authenticated)
    {
        this->logger.error("Authentication failed");
        this->ioExpander.errorBeep();
        this->nfc.enableCardDetection();
        return;
    }

    this->ioExpander.successBeep();
    this->logger.info("Authentication successful");
    this->unlocked = true;
}

void Application::selectResource(JsonObject resource)
{
    this->logger.infof("Resource selected: %s", resource["name"].as<String>().c_str());
    this->resourceIsSelected = true;
    this->selectedResourceId = resource["id"].as<uint32_t>();
    this->restartResourceSelectionTimeout();

    String type = resource["type"].as<String>();
    ResourceDetailsScreen::resource_type_t resourceType = ResourceDetailsScreen::RESOURCE_TYPE_MACHINE;
    if (type == "door")
    {
        resourceType = ResourceDetailsScreen::RESOURCE_TYPE_DOOR;
    }

    String name = resource["name"].as<String>();
    String description = resource["description"].as<String>();

    bool hasActiveUsageSession = resource["activeUsageSession"]["user"]["id"].is<uint32_t>() && resource["activeUsageSession"]["user"]["id"].as<uint32_t>() > 0;
    if (!hasActiveUsageSession)
    {
        Display::resourceDetailsScreen.setInfo(resourceType, name, description);
    }
    else
    {
        String currentUser = resource["activeUsageSession"]["user"]["username"].as<String>();
        String sessionStartTimeStr = resource["activeUsageSession"]["startTime"].as<String>();
        time_t sessionStartTime = parseIso8601ToTimeT(sessionStartTimeStr);

        Display::resourceDetailsScreen.setInfo(resourceType, name, description, sessionStartTime, currentUser);
    }
}

void Application::handleTouch(int16_t x, int16_t y)
{
    if (this->state == APPLICATION_STATE_UNLOCKED)
    {
        this->restartSessionTimeout();
    }
}

void Application::restartSessionTimeout()
{
    uint32_t now = millis();
    Display::resourceDetailsScreen.setSessionTimeoutTime(now + this->UNLOCKED_TIMEOUT_MS);
    this->timeOfUnlockedMs = now;
}

void Application::handleResourceDetailsButtonClick(ResourceDetailsScreen::ButtonClickEventData evt)
{
    this->logger.infof("Resource details button clicked: %d", evt.buttonClickType);

    if (this->state != APPLICATION_STATE_UNLOCKED)
    {
        return;
    }

    switch (evt.buttonClickType)
    {
    case ResourceDetailsScreen::BUTTON_CLICK_TYPE_START_SESSION:
        this->api.startResourceUsageSession(this->selectedResourceId);
        break;
    case ResourceDetailsScreen::BUTTON_CLICK_TYPE_STOP_SESSION:
        this->api.stopResourceUsageSession(this->selectedResourceId);
        break;
    case ResourceDetailsScreen::BUTTON_CLICK_TYPE_LOCK_DOOR:
        this->api.lockDoor(this->selectedResourceId);
        break;
    case ResourceDetailsScreen::BUTTON_CLICK_TYPE_UNLOCK_DOOR:
        this->api.unlockDoor(this->selectedResourceId);
        break;
    case ResourceDetailsScreen::BUTTON_CLICK_TYPE_UNLATCH_DOOR:
        this->api.unlatchDoor(this->selectedResourceId);
        break;
    case ResourceDetailsScreen::BUTTON_CLICK_TYPE_FLOW_BUTTON:
        // this->api.triggerFlowButton();
        // TODO: implement flow button
        break;
    }
}

void Application::restartResourceSelectionTimeout()
{
    uint32_t now = millis();
    this->timeOfResourceSelectionMs = now;
}