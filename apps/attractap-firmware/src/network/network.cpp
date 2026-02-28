#include "network.hpp"
#include "esp_err.h"
#include "esp_log.h"
#include <time.h>

#if defined(CONFIG_IDF_TARGET_ESP32P4)
#include "esp_hosted.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#endif

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

    setupHostedTransport();

    // Initialize both network interfaces
    logger.info("Starting WiFi interface");
    Wifi::setup();

#if !defined(CONFIG_IDF_TARGET_ESP32P4)
    logger.info("Starting Ethernet interface");
    Ethernet::setup();
#endif

    setupTimeSync();

    logger.info("initialization complete");
}

void Network::setupHostedTransport()
{
#if defined(CONFIG_IDF_TARGET_ESP32P4)
    // P4 uses C6 coprocessor for WiFi via ESP-Hosted; must init transport before WiFi
    logger.info("Initializing ESP-Hosted (P4↔C6 transport)");
    int hosted_ret = esp_hosted_init();
    if (hosted_ret != 0) {
        logger.error("ESP-Hosted init failed - WiFi will not work");
        return;
    }

    xTaskCreate(
        [](void *) {
            int r = esp_hosted_connect_to_slave();
            if (r == 0) {
                ESP_LOGI("Network", "ESP-Hosted transport ready");
            } else {
                ESP_LOGE("Network", "ESP-Hosted connect failed");
            }
            vTaskDelete(NULL);
        },
        "hosted_conn", 4096, NULL, 5, NULL);
    delay(2500);  // Give C6 time to respond before WiFi init
#endif
}

void Network::setupTimeSync()
{
    logger.info("Configuring SNTP time server...");
    configTime(0, 0, "pool.ntp.org", "time.nist.gov");
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

void Network::loop()
{
    Wifi::loop();
#if !defined(CONFIG_IDF_TARGET_ESP32P4)
    Ethernet::loop();
#endif
}