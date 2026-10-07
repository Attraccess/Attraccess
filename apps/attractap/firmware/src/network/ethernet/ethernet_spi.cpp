#include "ethernet.hpp"
#include "platform.hpp"
#include "esp_system.h"
#include "esp_mac.h"
#include "esp_eth_mac_w5500.h"
#include "esp_eth_phy_w5500.h"
#include <string>


esp_err_t Ethernet::initSPI()
{
    logger.info("Initializing SPI for W5500");

    // If SPI device is already initialized, we're done
    if (spi_ready)
    {
        logger.info("SPI device already initialized");
        return ESP_OK;
    }

    // Install GPIO ISR service (only if interrupt pin is configured)
    esp_err_t ret = ESP_OK;
    if (PIN_W5500_INT >= 0)
    {
        ret = gpio_install_isr_service(0);
        if (ret != ESP_OK && ret != ESP_ERR_INVALID_STATE)
        {
            logger.error((std::string("Failed to install GPIO ISR service: ") + esp_err_to_name(ret)).c_str());
            return ret;
        }
        logger.info("GPIO ISR service installed for interrupt mode");
    }

    // Configure W5500 reset pin (if available)
    // NOTE: guard via preprocessor with an explicit defined() check, not `if`,
    // because PIN_W5500_RESET is a compile-time constant; `1ULL << -1` would be
    // UB even under a runtime check, and an undefined macro would be a
    // preprocessing error on configs that omit it (Sourcery review PR #1691).
#if defined(PIN_W5500_RESET) && PIN_W5500_RESET >= 0
    {
        logger.info(("Configuring reset pin GPIO" + std::to_string(PIN_W5500_RESET)).c_str());
        uint64_t pin_mask = (1ULL << PIN_W5500_RESET);
        gpio_config_t reset_gpio_config = {
            .pin_bit_mask = pin_mask,
            .mode = GPIO_MODE_OUTPUT,
            .pull_up_en = GPIO_PULLUP_DISABLE,
            .pull_down_en = GPIO_PULLDOWN_DISABLE,
            .intr_type = GPIO_INTR_DISABLE,
        };
        ret = gpio_config(&reset_gpio_config);
        if (ret != ESP_OK)
        {
            logger.error((std::string("Failed to configure reset GPIO: ") + esp_err_to_name(ret)).c_str());
            return ret;
        }

        // Reset W5500 (active low reset)
        gpio_set_level((gpio_num_t)PIN_W5500_RESET, 0);
        vTaskDelay(pdMS_TO_TICKS(10)); // Hold reset for 10ms
        gpio_set_level((gpio_num_t)PIN_W5500_RESET, 1);
        vTaskDelay(pdMS_TO_TICKS(10)); // Wait for chip to come out of reset
        logger.info("W5500 hardware reset completed");
    }
#else
    {
        logger.info("No reset pin configured - relying on power-on reset");
        vTaskDelay(pdMS_TO_TICKS(100)); // Give some time for power-on reset to complete
    }
#endif

    // Initialize SPI bus
    spi_bus_config_t buscfg = {
        .mosi_io_num = PIN_ETH_SPI_MOSI,
        .miso_io_num = PIN_ETH_SPI_MISO,
        .sclk_io_num = PIN_ETH_SPI_SCK,
        .quadwp_io_num = -1,
        .quadhd_io_num = -1,
        .data4_io_num = -1,
        .data5_io_num = -1,
        .data6_io_num = -1,
        .data7_io_num = -1,
        .data_io_default_level = false,
        .max_transfer_sz = 0,
        .flags = SPICOMMON_BUSFLAG_MASTER,
        .isr_cpu_id = ESP_INTR_CPU_AFFINITY_AUTO,
        .intr_flags = 0,
    };

#ifdef DISPLAY_TOUCHSCREEN_LVGL
    // Use VSPI (SPI3_HOST) for Ethernet to avoid conflicts with TFT/Touch (HSPI)
    ret = spi_bus_initialize(SPI3_HOST, &buscfg, SPI_DMA_CH_AUTO);
#else
    ret = spi_bus_initialize(SPI2_HOST, &buscfg, SPI_DMA_CH_AUTO);
#endif
    if (ret != ESP_OK && ret != ESP_ERR_INVALID_STATE)
    {
        logger.error((std::string("Failed to initialize SPI bus: ") + esp_err_to_name(ret)).c_str());
        return ret;
    }
    else if (ret == ESP_ERR_INVALID_STATE)
    {
        logger.info("SPI bus already initialized, continuing with device setup");
    }
    else
    {
        logger.info("SPI bus initialized successfully");
    }

    // SPI device parameters — the IDF 5.x W5500 driver adds/removes the SPI
    // device itself, so only the configuration is prepared here.
    spi_devcfg = {};
    spi_devcfg.command_bits = 16;
    spi_devcfg.address_bits = 8;
    spi_devcfg.mode = 0;
    spi_devcfg.clock_speed_hz = 20 * 1000 * 1000; // 20MHz
    spi_devcfg.spics_io_num = PIN_ETH_SPI_CS;
    spi_devcfg.queue_size = 20;

#ifdef DISPLAY_TOUCHSCREEN_LVGL
    spi_host = SPI3_HOST;
#else
    spi_host = SPI2_HOST;
#endif
    spi_ready = true;

    logger.info("SPI initialization completed");
    return ESP_OK;
}
