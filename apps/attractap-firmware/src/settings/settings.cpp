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
    loadFromPreferences();
    validateLoadedConfig();

    logger.info("Setup complete.");
}

void Settings::loadFromPreferences()
{
    preferences.begin("settings", true);

    _deviceConfig.passCode = preferences.getString("device.passCode", "0000");
    _deviceConfig.beeperEnabled = preferences.getBool("device.beeper", true);

    _networkConfig.ssid = preferences.getString("wifi.ssid", "");
    _networkConfig.password = preferences.getString("wifi.pass", "");

    _attraccessApiConfig.hostname = preferences.getString("api.host", "");
    _attraccessApiConfig.port = preferences.getUShort("api.port", 0);
    _attraccessApiConfig.useSSL = preferences.getBool("api.useSSL", false);

    _attraccessAuthConfig.apiKey = preferences.getString("api.key", "");
    _attraccessAuthConfig.readerId = preferences.getUInt("api.readerId", 0);

    _hostname = preferences.getString("hostname", "");

    preferences.end();
}

void Settings::validateLoadedConfig()
{
    if (_deviceConfig.passCode.length() == 0)
    {
        _deviceConfig.passCode = "0000";
    }
}

void Settings::persistString(const char *key, const String &value)
{
    preferences.begin("settings", false);
    preferences.putString(key, value);
    preferences.end();
}

void Settings::persistBool(const char *key, bool value)
{
    preferences.begin("settings", false);
    preferences.putBool(key, value);
    preferences.end();
}

void Settings::persistUShort(const char *key, uint16_t value)
{
    preferences.begin("settings", false);
    preferences.putUShort(key, value);
    preferences.end();
}

void Settings::persistUInt(const char *key, uint32_t value)
{
    preferences.begin("settings", false);
    preferences.putUInt(key, value);
    preferences.end();
}

DeviceConfig Settings::getDeviceConfig()
{
    return _deviceConfig;
}

void Settings::setDevicePin(String passCode)
{
    logger.info("Setting device pin...");
    _deviceConfig.passCode = passCode;
    persistString("device.passCode", passCode);
    logger.info("Device pin set.");
}

void Settings::setBeeperEnabled(bool beeperEnabled)
{
    logger.info("Saving device config...");
    _deviceConfig.beeperEnabled = beeperEnabled;
    persistBool("device.beeper", beeperEnabled);
    logger.info("Device beeper enabled set.");
}

NetworkConfig Settings::getNetworkConfig()
{
    return _networkConfig;
}

void Settings::saveNetworkConfig(String ssid, String password)
{
    logger.info("Saving network config...");
    _networkConfig.ssid = ssid;
    _networkConfig.password = password;
    persistString("wifi.ssid", ssid);
    persistString("wifi.pass", password);
}

AttraccessApiConfig Settings::getAttraccessApiConfig()
{
    return _attraccessApiConfig;
}

void Settings::saveAttraccessApiConfig(String hostname, uint16_t port, bool useSSL)
{
    logger.info("Saving attraccess api config...");
    _attraccessApiConfig.hostname = hostname;
    _attraccessApiConfig.port = port;
    _attraccessApiConfig.useSSL = useSSL;
    persistString("api.host", hostname);
    persistUShort("api.port", port);
    persistBool("api.useSSL", useSSL);
}

AttraccessAuthConfig Settings::getAttraccessAuthConfig()
{
    return _attraccessAuthConfig;
}

void Settings::saveAttraccessAuthConfig(String apiKey, uint32_t readerId)
{
    logger.info("Saving attraccess auth config...");
    _attraccessAuthConfig.apiKey = apiKey;
    _attraccessAuthConfig.readerId = readerId;
    persistString("api.key", apiKey);
    persistUInt("api.readerId", readerId);
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
        persistString("hostname", _hostname);
    }

    return _hostname;
}
