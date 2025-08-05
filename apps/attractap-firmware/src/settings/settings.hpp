#pragma once

#include <Arduino.h>
#include <Preferences.h>

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

private:
    static Preferences preferences;

    static NetworkConfig _networkConfig;
    static AttraccessApiConfig _attraccessApiConfig;
    static AttraccessAuthConfig _attraccessAuthConfig;
};