#include "ethernet.hpp"
#include "platform.hpp"
#include "esp_system.h"
#include "esp_mac.h"
#include "esp_eth_mac_w5500.h"
#include "esp_eth_phy_w5500.h"
#include <string>

esp_err_t Ethernet::initializeNetwork()
{
    logger.info("Initializing Ethernet network stack");

    // Initialize SPI first
    esp_err_t ret = initSPI();
    if (ret != ESP_OK)
    {
        logger.error((std::string("Failed to initialize SPI: ") + esp_err_to_name(ret)).c_str());
        return ret;
    }

    // Initialize Ethernet driver
    uint8_t eth_port_cnt = 0;
    ret = ethernet_init(&eth_handle, &eth_port_cnt);
    if (ret != ESP_OK)
    {
        logger.error((std::string("Failed to initialize Ethernet driver: ") + esp_err_to_name(ret)).c_str());
        return ret;
    }

    // Note: esp_netif_init() and esp_event_loop_create_default() are handled by Network::initSharedComponents()
    // These should not be called here to avoid double initialization

    // Create instance of esp-netif for Ethernet
    esp_netif_config_t cfg = ESP_NETIF_DEFAULT_ETH();
    eth_netif = esp_netif_new(&cfg);
    if (eth_netif == nullptr)
    {
        logger.error("Failed to create netif");
        return ESP_FAIL;
    }

    esp_netif_set_hostname(eth_netif, (Settings::getHostname() + "-eth").c_str());

    eth_netif_glue = esp_eth_new_netif_glue(eth_handle);
    // Attach Ethernet driver to TCP/IP stack
    ret = esp_netif_attach(eth_netif, eth_netif_glue);
    if (ret != ESP_OK)
    {
        logger.error((std::string("Failed to attach netif: ") + esp_err_to_name(ret)).c_str());
        return ret;
    }

    // Register user defined event handlers
    ret = esp_event_handler_register(ETH_EVENT, ESP_EVENT_ANY_ID, &eth_event_handler, nullptr);
    if (ret != ESP_OK)
    {
        logger.error((std::string("Failed to register ETH event handler: ") + esp_err_to_name(ret)).c_str());
        return ret;
    }

    ret = esp_event_handler_register(IP_EVENT, IP_EVENT_ETH_GOT_IP, &got_ip_event_handler, nullptr);
    if (ret != ESP_OK)
    {
        logger.error((std::string("Failed to register IP event handler: ") + esp_err_to_name(ret)).c_str());
        return ret;
    }

    // Start DHCP client for the Ethernet interface
    ret = esp_netif_dhcpc_start(eth_netif);
    if (ret != ESP_OK && ret != ESP_ERR_ESP_NETIF_DHCP_ALREADY_STARTED)
    {
        logger.error((std::string("Failed to start DHCP client: ") + esp_err_to_name(ret)).c_str());
        return ret;
    }
    logger.info("DHCP client started");

    // Start Ethernet driver state machine
    ret = esp_eth_start(eth_handle);
    if (ret != ESP_OK)
    {
        logger.error((std::string("Failed to start Ethernet: ") + esp_err_to_name(ret)).c_str());
        return ret;
    }

    setState(ETHERNET_STATE_CONNECTING);
    logger.info("Ethernet network initialization completed");

    return ESP_OK;
}
