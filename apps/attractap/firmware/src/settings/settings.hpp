#pragma once

#include <cstdint>
#include <string>

#include "kvstore.hpp"
#include "../logger/logger.hpp"

struct DeviceConfig
{
    std::string passCode = "0000";
    bool beeperEnabled = true;
    uint8_t ledBrightness = 255;
};

struct NetworkConfig
{
    std::string ssid = "";
    std::string password = "";
};

struct AttraccessApiConfig
{
    std::string hostname = "";
    uint16_t port = 0;
    bool useSSL = false;
};

class Settings
{
public:
    static void setup();

    static DeviceConfig getDeviceConfig();
    static void setDevicePin(const std::string &passCode);
    static void setBeeperEnabled(bool beeperEnabled);
    static uint8_t getLedBrightness();
    static void setLedBrightness(uint8_t brightness);

    static NetworkConfig getNetworkConfig();
    static void saveNetworkConfig(const std::string &ssid, const std::string &password);

    static AttraccessApiConfig getAttraccessApiConfig();
    static void saveAttraccessApiConfig(const std::string &hostname, uint16_t port, bool useSSL);

    static void saveDefaultLanguage(const std::string &language);

    static std::string getHostname();

private:
    static void eraseRetiredTokenKeys();
    static KVStore preferences;
    static Logger logger;

    static DeviceConfig _deviceConfig;
    static NetworkConfig _networkConfig;
    static AttraccessApiConfig _attraccessApiConfig;
    static std::string _cachedDefaultLanguage;

    static std::string _hostname;
};
