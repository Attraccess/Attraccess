#pragma once

#include <Arduino.h>
#include <Preferences.h>
#include "../logger/logger.hpp"

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

    static NetworkConfig getNetworkConfig();
    static void saveNetworkConfig(String ssid, String password);

    static AttraccessApiConfig getAttraccessApiConfig();
    static void saveAttraccessApiConfig(String hostname, uint16_t port, bool useSSL);

    static AttraccessAuthConfig getAttraccessAuthConfig();
    static void saveAttraccessAuthConfig(String apiKey, uint32_t readerId);
    static void clearAttraccessAuthConfig();

    static String getHostname();

    // Keypad (MPR121) thresholds
    static bool getMpr121Thresholds(uint8_t &touch, uint8_t &release);
    static void saveMpr121Thresholds(uint8_t touch, uint8_t release);

private:
    static Preferences preferences;
    static Logger logger;

    static NetworkConfig _networkConfig;
    static AttraccessApiConfig _attraccessApiConfig;
    static AttraccessAuthConfig _attraccessAuthConfig;

    static String _hostname;
};