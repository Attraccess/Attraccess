#include "network.hpp"
#include "esp_err.h"
#include "esp_log.h"

// Static member definitions
bool Network::_sharedComponentsInitialized = false;
Logger Network::logger("Network");

void Network::setup()
{
    logger.info("Initializing");

    // Initialize shared ESP-IDF networking components
    initSharedComponents();

    // Give ESP-IDF networking stack time to fully initialize
    delay(100);

    logger.info("Shared components initialized");

    // Initialize both network interfaces
    logger.info("Starting WiFi interface");
    Wifi::setup();

    logger.info("Starting Ethernet interface");
    Ethernet::setup();

    logger.info("initialization complete");
}

void Network::initSharedComponents()
{
    if (_sharedComponentsInitialized)
    {
        logger.info("Shared components already initialized");
        return;
    }

    logger.info("Initializing shared ESP-IDF networking components");

    // Initialize TCP/IP network interface (should be called only once in application)
    esp_err_t ret = esp_netif_init();
    if (ret != ESP_OK && ret != ESP_ERR_INVALID_STATE)
    {
        logger.error((String("Failed to initialize netif: ") + esp_err_to_name(ret)).c_str());
        return;
    }

    // Create default event loop
    ret = esp_event_loop_create_default();
    if (ret != ESP_OK && ret != ESP_ERR_INVALID_STATE)
    {
        logger.error((String("Failed to create event loop: ") + esp_err_to_name(ret)).c_str());
        return;
    }

    _sharedComponentsInitialized = true;
    logger.info("Shared networking components initialized");
}
