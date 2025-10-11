#include "application.hpp"

void Application::setup()
{
    Settings::setup();
    Display::setup();
    this->nfc.setup();
    SerialSetup::setup(&this->cliService);

    this->bootDone = false;
    this->bootTime = millis();
}

void Application::loop()
{
    Display::loop();
    nfc.loop();
    cliService.loop();

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

    if (this->state == APPLICATION_STATE_LOCKED)
    {
        return;
    }

    this->state = APPLICATION_STATE_LOCKED;
    Display::transitionToScreen(&Display::lockscreen);
    return;
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
    Settings::saveAttraccessApiConfig(hostname, port.toInt(), true);
};
