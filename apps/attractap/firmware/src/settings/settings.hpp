#pragma once

#include <Arduino.h>
#include <Preferences.h>
#include "../logger/logger.hpp"

struct DeviceConfig
{
    String passCode = "0000";
    bool beeperEnabled = true;
    uint8_t ledBrightness = 255;
};

struct NetworkConfig
{
    String ssid = "";
    String password = "";
};

struct AttraccessApiConfig
{
    String hostname = "";
    uint16_t port = 0;
    bool useSSL = false;
};

struct AttraccessAuthConfig
{
    String apiKey = "";
    uint32_t readerId = 0;
};

class Settings
{
public:
    static void setup();

    static DeviceConfig getDeviceConfig();
    static void setDevicePin(String passCode);
    static void setBeeperEnabled(bool beeperEnabled);
    static uint8_t getLedBrightness();
    static void setLedBrightness(uint8_t brightness);

    static NetworkConfig getNetworkConfig();
    static void saveNetworkConfig(String ssid, String password);

    static AttraccessApiConfig getAttraccessApiConfig();
    static void saveAttraccessApiConfig(String hostname, uint16_t port, bool useSSL);

    static AttraccessAuthConfig getAttraccessAuthConfig();
    static void saveAttraccessAuthConfig(String apiKey, uint32_t readerId);
    static void clearAttraccessAuthConfig();

    static String getHostname();

private:
    static Preferences preferences;
    static Logger logger;

    static DeviceConfig _deviceConfig;
    static NetworkConfig _networkConfig;
    static AttraccessApiConfig _attraccessApiConfig;
    static AttraccessAuthConfig _attraccessAuthConfig;

    static String _hostname;
};