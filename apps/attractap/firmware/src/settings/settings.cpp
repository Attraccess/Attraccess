#include "settings.hpp"

Preferences Settings::preferences;
Logger Settings::logger("Settings");

DeviceConfig Settings::_deviceConfig;
NetworkConfig Settings::_networkConfig;
AttraccessApiConfig Settings::_attraccessApiConfig;
AttraccessAuthConfig Settings::_attraccessAuthConfig;
String Settings::_hostname;

void Settings::setup()
{
    logger.info("Setting up...");

    // load settings from preferences
    preferences.begin("settings", true);

    _deviceConfig.passCode = preferences.getString("device.passCode", "0000");
    _deviceConfig.beeperEnabled = preferences.getBool("device.beeper", true);
    _deviceConfig.ledBrightness = preferences.getUChar("device.ledBrt", 255);

    _networkConfig.ssid = preferences.getString("wifi.ssid", "");
    _networkConfig.password = preferences.getString("wifi.pass", "");

    _attraccessApiConfig.hostname = preferences.getString("api.host", "");
    _attraccessApiConfig.port = preferences.getUShort("api.port", 0);
    _attraccessApiConfig.useSSL = preferences.getBool("api.useSSL", false);

    _attraccessAuthConfig.apiKey = preferences.getString("api.key", "");
    _attraccessAuthConfig.readerId = preferences.getUInt("api.readerId", 0);

    _hostname = preferences.getString("hostname", "");

    preferences.end();

    logger.info("Setup complete.");
}

DeviceConfig Settings::getDeviceConfig()
{
    return _deviceConfig;
}

void Settings::setDevicePin(String passCode)
{
    logger.info("Setting device pin...");
    _deviceConfig.passCode = passCode;
    preferences.begin("settings", false);
    preferences.putString("device.passCode", passCode);
    preferences.end();
    logger.info("Device pin set.");
}

void Settings::setBeeperEnabled(bool beeperEnabled)
{
    logger.info("Saving device config...");
    _deviceConfig.beeperEnabled = beeperEnabled;
    preferences.begin("settings", false);
    preferences.putBool("device.beeper", beeperEnabled);
    preferences.end();
    logger.info("Device beeper enabled set.");
}

uint8_t Settings::getLedBrightness()
{
    return _deviceConfig.ledBrightness;
}

void Settings::setLedBrightness(uint8_t brightness)
{
    logger.info("Saving LED brightness...");
    _deviceConfig.ledBrightness = brightness;
    preferences.begin("settings", false);
    preferences.putUChar("device.ledBrt", brightness);
    preferences.end();
    logger.info("LED brightness set.");
}

NetworkConfig Settings::getNetworkConfig()
{
    return _networkConfig;
}

void Settings::saveNetworkConfig(String ssid, String password)
{
    logger.info("Saving network config...");
    preferences.begin("settings", false);

    preferences.putString("wifi.ssid", ssid);
    _networkConfig.ssid = ssid;

    preferences.putString("wifi.pass", password);
    _networkConfig.password = password;

    preferences.end();
}

AttraccessApiConfig Settings::getAttraccessApiConfig()
{
    return _attraccessApiConfig;
}

void Settings::saveAttraccessApiConfig(String hostname, uint16_t port, bool useSSL)
{
    logger.info("Saving attraccess api config...");
    preferences.begin("settings", false);

    preferences.putString("api.host", hostname);
    _attraccessApiConfig.hostname = hostname;

    preferences.putUShort("api.port", port);
    _attraccessApiConfig.port = port;

    preferences.putBool("api.useSSL", useSSL);
    _attraccessApiConfig.useSSL = useSSL;

    preferences.end();
}

AttraccessAuthConfig Settings::getAttraccessAuthConfig()
{
    return _attraccessAuthConfig;
}

void Settings::saveAttraccessAuthConfig(String apiKey, uint32_t readerId)
{
    logger.info("Saving attraccess auth config...");
    preferences.begin("settings", false);

    preferences.putString("api.key", apiKey);
    _attraccessAuthConfig.apiKey = apiKey;

    preferences.putUInt("api.readerId", readerId);
    _attraccessAuthConfig.readerId = readerId;

    preferences.end();
}

void Settings::clearAttraccessAuthConfig()
{
    logger.info("Clearing attraccess auth config...");
    preferences.begin("settings", false);

    preferences.remove("api.key");
    _attraccessAuthConfig.apiKey = "";

    preferences.remove("api.readerId");
    _attraccessAuthConfig.readerId = 0;

    preferences.end();
}

String Settings::getHostname()
{
    if (_hostname.isEmpty())
    {
        String randomSuffix = String(random(1000, 9999));
        _hostname = String(FIRMWARE_FRIENDLY_NAME) + "-" + String(FIRMWARE_VARIANT_FRIENDLY_NAME) + "-" + randomSuffix;
        preferences.begin("settings", false);
        preferences.putString("hostname", _hostname);
        preferences.end();
    }

    return _hostname;
}
