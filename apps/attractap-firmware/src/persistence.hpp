#pragma once

#include <Arduino.h>
#include <PersistSettings.h>

#include "configuration.hpp"

struct ApiConfig
{
    char hostname[32];
    uint16_t port;
    bool has_auth = false;

    // reader id
    uint32_t readerId = 0;

    // api key
    char apiKey[17] = "0000000000000000";
};

struct WiFiConfig
{
    char ssid[33] = "";     // Max 32 chars + null terminator
    char password[65] = ""; // Max 64 chars + null terminator
    bool configured = false;
};

struct WebConfig
{
    char admin_password[33] = "attraccess"; // Default admin password
};

struct PersistenceData
{
    // version
    static const uint8_t version = 4; // Increased version due to new admin password

    // api server
    ApiConfig api = ApiConfig();

    // WiFi configuration
    WiFiConfig wifi = WiFiConfig();

    // Web configuration
    WebConfig web = WebConfig();
};

class Persistence
{
public:
    static void setup();

    static PersistSettings<PersistenceData> getSettings();

    static void saveSettings(PersistSettings<PersistenceData> settings);

    // Helper methods for WiFi
    static bool isWiFiConfigured();
    static void saveWiFiCredentials(const char *ssid, const char *password);
    static const char *getWiFiSSID();
    static const char *getWiFiPassword();

    // Helper methods for Admin Password
    static const char *getAdminPassword();
    static void saveAdminPassword(const char *password);
};
