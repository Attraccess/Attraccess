#pragma once

#include <Arduino.h>
#include "esp_netif.h"
#include "wifi/wifi.hpp"
#if !defined(CONFIG_IDF_TARGET_ESP32P4)
#include "ethernet/ethernet.hpp"
#endif
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
    static void loop();

private:
    static void initSharedComponents();
    static void setupHostedTransport();
    static void setupTimeSync();

    // Initialization flag
    static bool _sharedComponentsInitialized;
    static Logger logger;
};