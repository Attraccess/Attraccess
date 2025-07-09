#pragma once

#include "network_interface.hpp"
#include <Arduino.h>
#include "configuration.hpp"
#include "display.hpp"

#ifdef NETWORK_ETHERNET
#ifdef NETWORK_WIFI
#error "Only one network connection type can be defined"
#endif
#endif

#ifndef NETWORK_ETHERNET
#ifndef NETWORK_WIFI
#error "No network connection type defined"
#endif
#endif

// Forward declarations
class NetworkInterface;

#ifdef NETWORK_ETHERNET
#include "network_ethernet.hpp"
#elif defined(NETWORK_WIFI)
#include "network_wifi.hpp"
#endif

#define HEALTH_CHECK_INTERVAL_MS 2000 // Check every 2 seconds

class Network
{
public:
    Network(Display *display);
    ~Network();

    void setup();
    void loop();
    bool isHealthy();
    NetworkInterface &getInterface() { return *interface; }

private:
    unsigned long lastHealthCheck = 0;
    Display *display;
    bool was_healthy = false;

#ifdef NETWORK_ETHERNET
    NetworkEthernet eth_interface;
    NetworkInterface *interface = &eth_interface;
#elif defined(NETWORK_WIFI)
    NetworkWifi wifi_interface;
    NetworkInterface *interface = &wifi_interface;
#endif
};
