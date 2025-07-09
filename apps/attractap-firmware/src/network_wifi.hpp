#pragma once

#include "network_interface.hpp"

#include <WiFi.h>
#include "persistence.hpp"
#include "configuration.hpp"

class NetworkWifi : public NetworkInterface
{
public:
    void setup() override;
    bool isHealthy() override;
    void loop() override;
    IPAddress getCurrentIp() override;
    void end() override;

    WiFiClient &getClient() override;

    // Method to reconnect with new credentials
    void reconnect();

private:
    WiFiClient client;
    bool useConfigCredentials = false;
};