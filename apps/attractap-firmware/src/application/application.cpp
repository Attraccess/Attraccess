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

    this->api.setResourceListUpdateCallback([this](JsonArray resourceList)
                                            { this->handleResourceListUpdate(resourceList); });

    this->api.setCardAuthenticationDetailsResponseCallback([this](uint8_t keyNo, const uint8_t *keyBytes, uint8_t keyLen, String error)
                                                           { this->handleCardAuthenticationDetails(keyNo, keyBytes, keyLen, error); });

    xTaskCreate(Application::networkTask, "NetworkTask", 4096, nullptr, tskIDLE_PRIORITY, nullptr);

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

        Display::transitionToScreen(&Display::initScreen, true);
        return;
    }

    if (this->resourceCount == 0)
    {
        if (this->state == APPLICATION_STATE_NO_RESOURCES)
        {
            return;
        }

        this->state = APPLICATION_STATE_NO_RESOURCES;
        Display::transitionToScreen(&Display::noResourcesScreen);
        return;
    }

    if (this->resourceCount > 0 && !this->resourceIsSelected)
    {
        if (this->state == APPLICATION_STATE_RESOURCE_LIST)
        {
            return;
        }

        this->state = APPLICATION_STATE_RESOURCE_LIST;
        Display::resourceListScreen.setResourceSelectionCallback([this](JsonObject resource)
                                                                 { this->selectResource(resource); });
        Display::transitionToScreen(&Display::resourceListScreen);
        return;
    }

    if (!this->unlocked)
    {
        if (this->state == APPLICATION_STATE_LOCKED)
        {
            return;
        }

        this->state = APPLICATION_STATE_LOCKED;
        Display::transitionToScreen(&Display::lockscreen, false, [this]()
                                    { this->nfc.enableCardDetection(); });

        auto cardDetectionCallback = [this](uint8_t *uid, uint8_t uidLength)
        {
            this->logger.infof("Card detected: %s", hexToString(uid, uidLength).c_str());

            // TODO: ask server for key of this card
            // TODO: use key of card to authenticate

            this->api.requestCardAuthenticationData(uid, uidLength);
        };
        this->nfc.setCardDetectionCallback(cardDetectionCallback);
        return;
    }

    uint32_t now = millis();
    if (this->state == APPLICATION_STATE_UNLOCKED)
    {
        if (now - this->timeOfUnlockedMs > this->UNLOCKED_TIMEOUT_MS)
        {
            this->unlocked = false;
            this->state = APPLICATION_STATE_INIT;
        }
        return;
    }

    this->state = APPLICATION_STATE_UNLOCKED;
    Display::resourceDetailsScreen.setSessionTimeoutTime(now + this->UNLOCKED_TIMEOUT_MS);
    Display::transitionToScreen(&Display::resourceDetailsScreen);
    this->timeOfUnlockedMs = now;
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
    this->resourceCount = resourceList.size();
    Display::resourceListScreen.setResourceList(resourceList);
    if (this->resourceCount == 1)
    {
        this->selectResource(resourceList[0].as<JsonObject>());
    }
}

void Application::handleCardAuthenticationDetails(uint8_t keyNo, const uint8_t *keyBytes, uint8_t keyLen, String error)
{
    this->logger.infof("Card authentication details: KeyNo: %u", keyNo);

    if (this->state != APPLICATION_STATE_LOCKED)
    {
        this->logger.error("Card authentication details received in state other than APPLICATION_STATE_LOCKED");
        return;
    }

    if (error.length() > 0)
    {
        // TODO: indicate to user that authentication failed
        this->logger.errorf("Authentication failed: %s", error.c_str());
        this->nfc.enableCardDetection();
        return;
    }

    if (keyBytes == nullptr || keyLen != 16)
    {
        this->logger.error("Invalid key bytes provided");
        this->nfc.enableCardDetection();
        return;
    }

    this->logger.infof("Trying to authenticate with keyNo: %u", keyNo);
    bool authenticated = this->nfc.authenticate(keyNo, const_cast<uint8_t *>(keyBytes));
    this->ioExpander.beep();

    if (!authenticated)
    {
        this->logger.error("Authentication failed");
        delay(100);
        this->ioExpander.beep();
        delay(100);
        this->ioExpander.beep();
        this->nfc.enableCardDetection();
        return;
    }

    this->logger.info("Authentication successful");
    this->unlocked = true;
}

void Application::selectResource(JsonObject resource)
{
    this->logger.infof("Resource selected: %s", resource["name"].as<String>().c_str());
    this->resourceIsSelected = true;

    uint32_t id = resource["id"].as<uint32_t>();
    String name = resource["name"].as<String>();
    String description = resource["description"].as<String>();
    String type = resource["type"].as<String>();
    String thumbnail = resource["imageFilename"].as<String>();

    ResourceDetailsScreen::resource_type_t resourceType = ResourceDetailsScreen::RESOURCE_TYPE_MACHINE;
    if (type == "door")
    {
        resourceType = ResourceDetailsScreen::RESOURCE_TYPE_DOOR;
    }

    Display::resourceDetailsScreen.setInfo(resourceType, name, description);
}