#include "ethernet.hpp"
#include "platform.hpp"
#include "esp_system.h"
#include "esp_mac.h"
#include "esp_eth_mac_w5500.h"
#include "esp_eth_phy_w5500.h"
#include <string>

// Static member definitions
Ethernet::EthernetState Ethernet::_state = ETHERNET_STATE_INIT;
Logger Ethernet::logger("Ethernet");
esp_netif_t *Ethernet::eth_netif = nullptr;
esp_eth_handle_t Ethernet::eth_handle = nullptr;
esp_eth_netif_glue_handle_t Ethernet::eth_netif_glue = nullptr;
spi_host_device_t Ethernet::spi_host = SPI2_HOST;
spi_device_interface_config_t Ethernet::spi_devcfg = {};
bool Ethernet::spi_ready = false;
uint32_t Ethernet::retry_count = 0;
uint32_t Ethernet::last_retry_time = 0;
uint32_t Ethernet::dhcp_start_time = 0;
bool Ethernet::initialization_in_progress = false;
const uint32_t Ethernet::MAX_RETRY_COUNT = 5;
const uint32_t Ethernet::BASE_RETRY_DELAY_MS = 1000;
const uint32_t Ethernet::DHCP_TIMEOUT_MS = 30000; // 30 second DHCP timeout

void Ethernet::setup()
{
    if (PIN_ETH_SPI_CS < 0)
    {
        logger.info("Ethernet SPI CS pin not configured, skipping Ethernet setup");
        return;
    }

    logger.info("Starting");
}

void Ethernet::loop()
{
    if (PIN_ETH_SPI_CS < 0)
    {
        return;
    }

    switch (_state)
    {
    case ETHERNET_STATE_INIT:
        // Start connection process
        setState(ETHERNET_STATE_CONNECTING);
        break;
    case ETHERNET_STATE_CONNECTING:
    {
        // Check if we've exceeded maximum retry count
        if (retry_count >= MAX_RETRY_COUNT)
        {
            logger.errorf("Maximum retry count (%u) reached. Giving up.", MAX_RETRY_COUNT);
            initialization_in_progress = false;
            setState(ETHERNET_STATE_CONNECT_FAILED);
            break;
        }

        // Don't retry if initialization is currently in progress (waiting for async events)
        if (initialization_in_progress)
        {
            break;
        }

        // Implement exponential backoff
        uint32_t current_time = millis();
        uint32_t retry_delay = BASE_RETRY_DELAY_MS * (1 << retry_count); // Exponential backoff

        if (retry_count > 0 && (current_time - last_retry_time) < retry_delay)
        {
            // Still waiting for retry delay
            break;
        }

        logger.infof("Connection attempt %u/%u", retry_count + 1, MAX_RETRY_COUNT);

        // Clean up any previous failed attempt
        cleanupPartialInit();

        // Mark initialization as in progress
        initialization_in_progress = true;

        // Try to initialize network
        if (initializeNetwork() != ESP_OK)
        {
            logger.errorf("Network initialization failed (attempt %u/%u)", retry_count + 1, MAX_RETRY_COUNT);
            initialization_in_progress = false;
            retry_count++;
            last_retry_time = current_time;
            break;
        }

        // Success! Reset retry count for next time (but keep initialization_in_progress = true)
        retry_count = 0;
        logger.info("Connection attempt successful - waiting for events");
        break;
    }
    case ETHERNET_STATE_CONNECTED_WAITING_FOR_IP:
    {
        // Check if DHCP is taking too long
        uint32_t current_time = millis();
        if (dhcp_start_time > 0 && (current_time - dhcp_start_time) > DHCP_TIMEOUT_MS)
        {
            logger.errorf("DHCP timeout after %u ms", DHCP_TIMEOUT_MS);
            logger.info("Retrying network initialization...");
            dhcp_start_time = 0;
            setState(ETHERNET_STATE_DISCONNECTED); // This will trigger a reconnection attempt
        }
        break;
    }
    case ETHERNET_STATE_DISCONNECTED:
    {
        // Auto-retry connection if we get disconnected
        logger.info("Ethernet disconnected, attempting to reconnect");
        setState(ETHERNET_STATE_CONNECTING);
        break;
    }
    case ETHERNET_STATE_CONNECT_FAILED:
    {
        // Reset retry count after a longer delay to try again
        uint32_t current_time = millis();
        if (retry_count == 0 || (current_time - last_retry_time) > (BASE_RETRY_DELAY_MS * 10))
        {
            logger.info("Resetting after connection failure, will retry");
            retry_count = 0;
            dhcp_start_time = 0;
            initialization_in_progress = false;
            setState(ETHERNET_STATE_CONNECTING);
        }
        break;
    }
    default:
        break;
    }
}
