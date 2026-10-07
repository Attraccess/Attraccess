#include "ethernet.hpp"
#include "platform.hpp"
#include "esp_system.h"
#include "esp_mac.h"
#include "esp_eth_mac_w5500.h"
#include "esp_eth_phy_w5500.h"
#include <string>

void Ethernet::deinit()
{
    logger.info("Deinitializing Ethernet");

    // Clean up everything
    cleanupPartialInit();

    // Free SPI bus completely (only if we own it exclusively)
    // Note: Comment out spi_bus_free if other devices use the same SPI bus
    // spi_bus_free(SPI2_HOST);

    // Reset retry state
    retry_count = 0;
    last_retry_time = 0;
    dhcp_start_time = 0;
    initialization_in_progress = false;

    setState(ETHERNET_STATE_INIT);
}

esp_err_t Ethernet::w5500_read_version_register(spi_device_handle_t spi_device, uint8_t *version)
{
    // W5500 Version Register (VERSIONR) is at address 0x0039
    // Command format: [addr_high|control][addr_low][data...]
    // For common register read: control = 0x00

    spi_transaction_t trans = {};
    uint8_t tx_data[3] = {0x00, 0x39, 0x00}; // [addr_high|control][addr_low][dummy]
    uint8_t rx_data[3] = {0};

    trans.length = 24; // 3 bytes * 8 bits
    trans.tx_buffer = tx_data;
    trans.rx_buffer = rx_data;

    esp_err_t ret = spi_device_transmit(spi_device, &trans);
    if (ret != ESP_OK)
    {
        return ret;
    }

    *version = rx_data[2]; // Version data is in the third byte

    // W5500 should return 0x04 for version register
    if (*version != 0x04)
    {
        return ESP_FAIL; // Hardware not responding correctly
    }

    return ESP_OK;
}

void Ethernet::cleanupPartialInit()
{
    logger.info("Cleaning up partial initialization");

    // Unregister event handlers (ignore errors if not registered)
    esp_event_handler_unregister(IP_EVENT, IP_EVENT_ETH_GOT_IP, got_ip_event_handler);
    esp_event_handler_unregister(ETH_EVENT, ESP_EVENT_ANY_ID, eth_event_handler);

    // Stop and clean up Ethernet driver
    if (eth_handle != nullptr)
    {
        esp_eth_stop(eth_handle);
        esp_eth_driver_uninstall(eth_handle);
        eth_handle = nullptr;
    }

    // Clean up netif glue and netif
    if (eth_netif_glue != nullptr)
    {
        esp_eth_del_netif_glue(eth_netif_glue);
        eth_netif_glue = nullptr;
    }

    if (eth_netif != nullptr)
    {
        esp_netif_destroy(eth_netif);
        eth_netif = nullptr;
    }

    // The W5500 driver owns its SPI device and removed it during uninstall;
    // the SPI bus itself stays up for other users.
    spi_ready = false;
}
