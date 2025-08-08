#pragma once

#include <Arduino.h>
#include "esp_netif.h"
#include "wifi/wifi.hpp"
#include "ethernet/ethernet.hpp"
#include "../logger/logger.hpp"

/**
 * Network management class that handles both WiFi and Ethernet connections
 * Manages shared ESP-IDF components and provides a unified network interface
 */
class Network
{
public:
    // Main interface
    static void setup();

private:
    static void initSharedComponents();

    // Initialization flag
    static bool _sharedComponentsInitialized;
    static Logger logger;
};