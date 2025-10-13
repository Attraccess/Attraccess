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
    Display::setup();
    this->nfc.setup();
    SerialSetup::setup(&this->cliService);
    this->api.setup();

    this->api.setResourceListUpdateCallback([this](JsonArray resourceList)
                                            { this->handleResourceListUpdate(resourceList); });

    xTaskCreate(Application::networkTask, "NetworkTask", 4096, nullptr, tskIDLE_PRIORITY, nullptr);

    this->bootTime = millis();
}

void Application::loop()
{
    Display::loop();
    nfc.loop();
    cliService.loop();
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
        Display::transitionToScreen(&Display::initScreen);
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
                                                                 { this->selectedResource = resource;
                                                                   this->resourceIsSelected = true;
                                                                   this->logger.infof("Resource selected: %s", resource["name"].as<String>().c_str()); });
        Display::transitionToScreen(&Display::resourceListScreen);
        return;
    }

    if (!this->unlocked)
    {
        if (this->state == APPLICATION_STATE_UNLOCKED)
        {
            return;
        }

        if (this->state == APPLICATION_STATE_LOCKED)
        {
            return;
        }

        this->state = APPLICATION_STATE_LOCKED;
        Display::transitionToScreen(&Display::lockscreen, [this]()
                                    { this->nfc.enableCardDetection(); });
        auto cardDetectionCallback = [this]()
        {
            bool authenticated = this->nfc.authenticate(1, NFC::FACTORY_KEY);
            if (authenticated)
            {
                this->logger.info("Authentication successful");
                this->unlocked = true;
            }
            else
            {
                this->logger.info("Authentication failed, retrying in 3 seconds");
                delay(3000);
                this->unlocked = false;
                this->nfc.enableCardDetection();
            }
        };
        this->nfc.setCardDetectionCallback(cardDetectionCallback);
        return;
    }

    if (this->state == APPLICATION_STATE_UNLOCKED)
    {
        return;
    }

    this->state = APPLICATION_STATE_UNLOCKED;
    Display::transitionToScreen(&Display::unlockedScreen);
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
        this->selectedResource = resourceList[0].as<JsonObject>();
        this->resourceIsSelected = true;
    }
}