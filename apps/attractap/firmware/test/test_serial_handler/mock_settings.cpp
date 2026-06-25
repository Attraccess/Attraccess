#include "settings/settings.hpp"

// Required static member definitions — settings.cpp is excluded from the native build.
Preferences Settings::preferences;
Logger Settings::logger("Settings");
DeviceConfig Settings::_deviceConfig;
NetworkConfig Settings::_networkConfig;
AttraccessApiConfig Settings::_attraccessApiConfig;
AttraccessAuthConfig Settings::_attraccessAuthConfig;
String Settings::_hostname;

// ----- Settings method implementations -----

void Settings::setup() {}

DeviceConfig Settings::getDeviceConfig() { return _deviceConfig; }
void Settings::setDevicePin(String passCode) { _deviceConfig.passCode = passCode; }
void Settings::setBeeperEnabled(bool v) { _deviceConfig.beeperEnabled = v; }
uint8_t Settings::getLedBrightness() { return _deviceConfig.ledBrightness; }
void Settings::setLedBrightness(uint8_t v) { _deviceConfig.ledBrightness = v; }

NetworkConfig Settings::getNetworkConfig() { return _networkConfig; }
void Settings::saveNetworkConfig(String ssid, String password) {
    _networkConfig.ssid = ssid;
    _networkConfig.password = password;
}

AttraccessApiConfig Settings::getAttraccessApiConfig() { return _attraccessApiConfig; }
void Settings::saveAttraccessApiConfig(String hostname, uint16_t port, bool useSSL) {
    _attraccessApiConfig.hostname = hostname;
    _attraccessApiConfig.port = port;
    _attraccessApiConfig.useSSL = useSSL;
}

AttraccessAuthConfig Settings::getAttraccessAuthConfig() { return _attraccessAuthConfig; }
void Settings::saveAttraccessAuthConfig(String apiKey, uint32_t readerId) {
    _attraccessAuthConfig.apiKey = apiKey;
    _attraccessAuthConfig.readerId = readerId;
}
void Settings::clearAttraccessAuthConfig() { _attraccessAuthConfig = AttraccessAuthConfig{}; }

String Settings::getHostname() { return _hostname; }

// ----- Test helpers -----

// Resets all settings to power-on defaults via the public interface.
void mock_settings_reset() {
    Settings::setDevicePin("0000");
    Settings::saveNetworkConfig("", "");
    Settings::saveAttraccessApiConfig("", 0, false);
    Settings::clearAttraccessAuthConfig();
}
