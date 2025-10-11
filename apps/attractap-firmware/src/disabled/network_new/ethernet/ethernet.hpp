#pragma once

#include "esp_eth.h"
#include "esp_event.h"
#include "esp_netif.h"
#include "driver/spi_master.h"
#include "driver/gpio.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "task_priorities.h"
#include "state/state.hpp"
#include "../../logger/logger.hpp"
#include "../../settings/settings.hpp"

class Ethernet
{
public:
    enum EthernetState
    {
        ETHERNET_STATE_INIT,
        ETHERNET_STATE_CONNECTING,
        ETHERNET_STATE_CONNECTED_WAITING_FOR_IP,
        ETHERNET_STATE_CONNECTED,
        ETHERNET_STATE_DISCONNECTED,
        ETHERNET_STATE_CONNECT_FAILED
    };

    static void setup();
    static esp_err_t initializeNetwork();

    static void deinit();

private:
    static void taskFn(void *parameter);
    static void loop();

    static esp_ip4_addr_t getIPAddress();

    static void eth_event_handler(void *arg, esp_event_base_t event_base, int32_t event_id, void *event_data);
    static void got_ip_event_handler(void *arg, esp_event_base_t event_base, int32_t event_id, void *event_data);
    static esp_err_t initSPI();
    static esp_err_t ethernet_init(esp_eth_handle_t *eth_handles, uint8_t *eth_port_cnt);
    static esp_err_t w5500_read_version_register(spi_device_handle_t spi_device, uint8_t *version);
    static void cleanupPartialInit();

    static EthernetState _state;
    static void setState(EthernetState state);

    static esp_netif_t *eth_netif;
    static esp_eth_handle_t eth_handle;
    static esp_eth_netif_glue_handle_t eth_netif_glue;
    static spi_device_handle_t spi_handle;
    static uint32_t retry_count;
    static uint32_t last_retry_time;
    static uint32_t dhcp_start_time;
    static bool initialization_in_progress;
    static const uint32_t MAX_RETRY_COUNT;
    static const uint32_t BASE_RETRY_DELAY_MS;
    static const uint32_t DHCP_TIMEOUT_MS;
    static Logger logger;
};