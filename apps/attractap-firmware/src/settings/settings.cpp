#include "settings.hpp"

Preferences Settings::preferences;
Logger Settings::logger("Settings");

NetworkConfig Settings::_networkConfig;
AttraccessApiConfig Settings::_attraccessApiConfig;
AttraccessAuthConfig Settings::_attraccessAuthConfig;

void Settings::setup()
{
    logger.info("Setting up...");

    // load settings from preferences
    preferences.begin("settings", true);
    _networkConfig.ssid = preferences.getString("wifi.ssid", "");
    _networkConfig.password = preferences.getString("wifi.pass", "");

    _attraccessApiConfig.hostname = preferences.getString("api.host", "");
    _attraccessApiConfig.port = preferences.getUShort("api.port", 0);
    _attraccessApiConfig.useSSL = preferences.getBool("api.useSSL", false);

    _attraccessAuthConfig.apiKey = preferences.getString("api.key", "");
    _attraccessAuthConfig.readerId = preferences.getUInt("api.readerId", 0);

    preferences.end();

    logger.info("Setup complete.");
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