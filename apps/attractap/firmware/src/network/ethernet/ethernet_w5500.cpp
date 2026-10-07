#include "ethernet.hpp"
#include "platform.hpp"
#include "esp_system.h"
#include "esp_mac.h"
#include "esp_eth_mac_w5500.h"
#include "esp_eth_phy_w5500.h"
#include <string>

esp_err_t Ethernet::ethernet_init(esp_eth_handle_t *eth_handles, uint8_t *eth_port_cnt)
{
    logger.info("Initializing W5500 Ethernet driver");

    // SPI should already be initialized
    if (!spi_ready)
    {
        logger.error("SPI not initialized");
        return ESP_FAIL;
    }

    // Initialize W5500 configuration (the driver adds the SPI device itself)
    eth_w5500_config_t w5500_config = ETH_W5500_DEFAULT_CONFIG(spi_host, &spi_devcfg);

    // Configure interrupt pin (if available)
    if (PIN_W5500_INT >= 0)
    {
        logger.info(("Configuring interrupt pin GPIO" + std::to_string(PIN_W5500_INT)).c_str());
        w5500_config.base.int_gpio_num = PIN_W5500_INT;
    }
    else
    {
        logger.info("No interrupt pin configured - using polling mode");
        w5500_config.base.int_gpio_num = -1; // Disable interrupt, use polling
    }

    // Initialize Ethernet MAC
    eth_mac_config_t mac_config = ETH_MAC_DEFAULT_CONFIG();
    esp_eth_mac_t *mac = esp_eth_mac_new_w5500(&w5500_config, &mac_config);
    if (mac == nullptr)
    {
        logger.error("Failed to create MAC");
        return ESP_FAIL;
    }

    // Initialize Ethernet PHY
    eth_phy_config_t phy_config = ETH_PHY_DEFAULT_CONFIG();
    phy_config.phy_addr = 1;
    phy_config.reset_gpio_num = (PIN_W5500_RESET >= 0) ? PIN_W5500_RESET : -1;
    esp_eth_phy_t *phy = esp_eth_phy_new_w5500(&phy_config);
    if (phy == nullptr)
    {
        logger.error("Failed to create PHY");
        return ESP_FAIL;
    }

    // Initialize Ethernet driver
    esp_eth_config_t eth_config = ETH_DEFAULT_CONFIG(mac, phy);
    esp_err_t ret = esp_eth_driver_install(&eth_config, eth_handles);
    if (ret != ESP_OK)
    {
        logger.errorf("Failed to install Ethernet driver: %s", esp_err_to_name(ret));
        return ret;
    }

    // Set MAC address - generate a local unicast MAC address based on ESP32 chip ID
    uint8_t mac_addr[6];

    // Get the base MAC address from ESP32's eFuse (this doesn't require netif)
    esp_efuse_mac_get_default(mac_addr);

    // Ensure it's a locally administered unicast address
    mac_addr[0] = (mac_addr[0] & 0xFC) | 0x02; // Set locally administered bit, clear multicast bit

    ret = esp_eth_ioctl(*eth_handles, ETH_CMD_S_MAC_ADDR, mac_addr);
    if (ret != ESP_OK)
    {
        logger.errorf("Failed to set MAC address: %s", esp_err_to_name(ret));
        return ret;
    }

    logger.infof("MAC address set to: %02x:%02x:%02x:%02x:%02x:%02x",
                 mac_addr[0], mac_addr[1], mac_addr[2], mac_addr[3], mac_addr[4], mac_addr[5]);

    *eth_port_cnt = 1;
    logger.info("W5500 Ethernet driver initialized successfully");
    return ESP_OK;
}
