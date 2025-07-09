#pragma once

#include <Arduino.h>
#include <ImprovWiFiLibrary.h>
#include "persistence.hpp"
#include "network_interface.hpp"

class ImprovManager
{
public:
    ImprovManager(NetworkInterface *networkInterface);
    void setup();
    void loop();
    void updateDeviceInfo();

private:
    ImprovWiFi improvSerial;
    NetworkInterface *networkInterface;

    // Callback methods for the Improv library
    static void onImprovWiFiErrorCb(ImprovTypes::Error error);
    static void onImprovWiFiConnectedCb(const char *ssid, const char *password);

    // Reference to the instance for use in callbacks
    static ImprovManager *instance;
};