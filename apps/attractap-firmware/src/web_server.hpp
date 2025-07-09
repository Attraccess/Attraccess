#pragma once

#include <Arduino.h>
#include <WebServer.h>
#include <LittleFS.h>
#include <ArduinoJson.h>
#include "persistence.hpp"
#include "network_interface.hpp"

class ConfigWebServer
{
public:
    ConfigWebServer(NetworkInterface *network);
    void setup();
    void loop();

private:
    WebServer server;
    NetworkInterface *network;
    bool authenticated = false;

    // Authentication handler
    bool handleAuthentication();

    // File system handlers
    bool handleFileRead(String path);

    // API Request handlers
    void handleApiAuthCheck();
    void handleApiAuthLogin();
    void handleApiAuthLogout();
    void handleApiConfig();
    void handleApiConfigSave();
    void handleApiStatus();

    // CORS headers
    void setCorsHeaders();

    // Utility methods
    String getContentType(String filename);
};