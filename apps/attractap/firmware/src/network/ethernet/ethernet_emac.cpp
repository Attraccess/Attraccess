#ifdef ETH_RMII_EMAC

#include "ethernet.hpp"
#include "esp_eth_mac_esp.h"
#include "../../bridge/bridge_logic.hpp"

// Internal EMAC over RMII (GL-S10): the ESP32 drives the 50 MHz reference clock out on GPIO17, and the PHY's
// power/reset line is GPIO5. LAN8720 (v1.x) and IP101 (v2.x) both run with the generic IEEE 802.3 PHY driver at
// whatever MDIO address they answer on; the PHY ID goes to the log.
esp_err_t Ethernet::emac_init(esp_eth_handle_t *handle)
{
    logger.info("Initializing internal EMAC (RMII)");

    eth_esp32_emac_config_t emac_config = ETH_ESP32_EMAC_DEFAULT_CONFIG();
    emac_config.smi_gpio.mdc_num = PIN_ETH_MDC;
    emac_config.smi_gpio.mdio_num = PIN_ETH_MDIO;
    emac_config.clock_config.rmii.clock_mode = EMAC_CLK_OUT;
    emac_config.clock_config.rmii.clock_gpio = PIN_ETH_RMII_CLK_OUT;
    eth_mac_config_t mac_config = ETH_MAC_DEFAULT_CONFIG();
    esp_eth_mac_t *mac = esp_eth_mac_new_esp32(&emac_config, &mac_config);
    if (mac == nullptr)
    {
        logger.error("Failed to create EMAC");
        return ESP_FAIL;
    }

    eth_phy_config_t phy_config = ETH_PHY_DEFAULT_CONFIG();
    phy_config.phy_addr = ESP_ETH_PHY_ADDR_AUTO;
    phy_config.reset_gpio_num = PIN_ETH_PHY_POWER;
    esp_eth_phy_t *phy = esp_eth_phy_new_generic(&phy_config);
    if (phy == nullptr)
    {
        mac->del(mac);
        logger.error("Failed to create PHY");
        return ESP_FAIL;
    }

    esp_eth_config_t eth_config = ETH_DEFAULT_CONFIG(mac, phy);
    esp_err_t ret = esp_eth_driver_install(&eth_config, handle);
    if (ret != ESP_OK)
    {
        phy->del(phy);
        mac->del(mac);
        logger.errorf("Failed to install Ethernet driver: %s", esp_err_to_name(ret));
        return ret;
    }

    uint32_t phy_addr = 0;
    uint32_t id1 = 0, id2 = 0;
    esp_eth_phy_reg_rw_data_t read1 = {.reg_addr = 2, .reg_value_p = &id1};
    esp_eth_phy_reg_rw_data_t read2 = {.reg_addr = 3, .reg_value_p = &id2};
    if (esp_eth_ioctl(*handle, ETH_CMD_G_PHY_ADDR, &phy_addr) == ESP_OK &&
        esp_eth_ioctl(*handle, ETH_CMD_READ_PHY_REG, &read1) == ESP_OK &&
        esp_eth_ioctl(*handle, ETH_CMD_READ_PHY_REG, &read2) == ESP_OK)
    {
        logger.infof("PHY %s (ID %04x:%04x) at MDIO address %u",
                     bridge::phyName(static_cast<uint16_t>(id1), static_cast<uint16_t>(id2)),
                     static_cast<unsigned>(id1), static_cast<unsigned>(id2), static_cast<unsigned>(phy_addr));
    }
    else
    {
        logger.error("Could not read the PHY ID");
    }
    // The EMAC uses the chip's own Ethernet MAC address from eFuse.
    return ESP_OK;
}

#endif
