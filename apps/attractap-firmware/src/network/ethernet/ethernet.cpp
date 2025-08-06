#include "ethernet.hpp"
#include <Arduino.h>
#include "esp_system.h"

// Static member definitions
Ethernet::EthernetState Ethernet::_state = ETHERNET_STATE_INIT;
void (*Ethernet::onStateChangedCallback)(EthernetState state, const esp_ip4_addr_t &ip) = nullptr;
esp_netif_t *Ethernet::eth_netif = nullptr;
esp_eth_handle_t Ethernet::eth_handle = nullptr;
esp_eth_netif_glue_handle_t Ethernet::eth_netif_glue = nullptr;
spi_device_handle_t Ethernet::spi_handle = nullptr;
uint32_t Ethernet::retry_count = 0;
uint32_t Ethernet::last_retry_time = 0;
uint32_t Ethernet::dhcp_start_time = 0;
bool Ethernet::initialization_in_progress = false;
const uint32_t Ethernet::MAX_RETRY_COUNT = 5;
const uint32_t Ethernet::BASE_RETRY_DELAY_MS = 1000;
const uint32_t Ethernet::DHCP_TIMEOUT_MS = 30000; // 30 second DHCP timeout

void Ethernet::setup()
{
    Serial.println("[INFO][Ethernet] Starting Ethernet");

    xTaskCreate(taskFn, "EthernetTask", 4096, nullptr, 9, nullptr);
}

esp_err_t Ethernet::initializeNetwork()
{
    Serial.println("[INFO][Ethernet] Initializing Ethernet network stack");

    // Initialize SPI first
    esp_err_t ret = initSPI();
    if (ret != ESP_OK)
    {
        Serial.printf("[ERROR][Ethernet] Failed to initialize SPI: %s\n", esp_err_to_name(ret));
        return ret;
    }

    // Initialize Ethernet driver
    uint8_t eth_port_cnt = 0;
    ret = ethernet_init(&eth_handle, &eth_port_cnt);
    if (ret != ESP_OK)
    {
        Serial.printf("[ERROR][Ethernet] Failed to initialize Ethernet driver: %s\n", esp_err_to_name(ret));
        return ret;
    }

    // Initialize TCP/IP network interface (should be called only once in application)
    ret = esp_netif_init();
    if (ret != ESP_OK && ret != ESP_ERR_INVALID_STATE)
    {
        Serial.printf("[ERROR][Ethernet] Failed to initialize netif: %s\n", esp_err_to_name(ret));
        return ret;
    }

    // Create default event loop
    ret = esp_event_loop_create_default();
    if (ret != ESP_OK && ret != ESP_ERR_INVALID_STATE)
    {
        Serial.printf("[ERROR][Ethernet] Failed to create event loop: %s\n", esp_err_to_name(ret));
        return ret;
    }

    // Create instance of esp-netif for Ethernet
    esp_netif_config_t cfg = ESP_NETIF_DEFAULT_ETH();
    eth_netif = esp_netif_new(&cfg);
    if (eth_netif == nullptr)
    {
        Serial.println("[ERROR][Ethernet] Failed to create netif");
        return ESP_FAIL;
    }

    eth_netif_glue = esp_eth_new_netif_glue(eth_handle);
    // Attach Ethernet driver to TCP/IP stack
    ret = esp_netif_attach(eth_netif, eth_netif_glue);
    if (ret != ESP_OK)
    {
        Serial.printf("[ERROR][Ethernet] Failed to attach netif: %s\n", esp_err_to_name(ret));
        return ret;
    }

    // Register user defined event handlers
    ret = esp_event_handler_register(ETH_EVENT, ESP_EVENT_ANY_ID, &eth_event_handler, nullptr);
    if (ret != ESP_OK)
    {
        Serial.printf("[ERROR][Ethernet] Failed to register ETH event handler: %s\n", esp_err_to_name(ret));
        return ret;
    }

    ret = esp_event_handler_register(IP_EVENT, IP_EVENT_ETH_GOT_IP, &got_ip_event_handler, nullptr);
    if (ret != ESP_OK)
    {
        Serial.printf("[ERROR][Ethernet] Failed to register IP event handler: %s\n", esp_err_to_name(ret));
        return ret;
    }

    // Start DHCP client for the Ethernet interface
    ret = esp_netif_dhcpc_start(eth_netif);
    if (ret != ESP_OK && ret != ESP_ERR_ESP_NETIF_DHCP_ALREADY_STARTED)
    {
        Serial.printf("[ERROR][Ethernet] Failed to start DHCP client: %s\n", esp_err_to_name(ret));
        return ret;
    }
    Serial.println("[INFO][Ethernet] DHCP client started");

    // Start Ethernet driver state machine
    ret = esp_eth_start(eth_handle);
    if (ret != ESP_OK)
    {
        Serial.printf("[ERROR][Ethernet] Failed to start Ethernet: %s\n", esp_err_to_name(ret));
        return ret;
    }

    setState(ETHERNET_STATE_CONNECTING);
    Serial.println("[INFO][Ethernet] Ethernet network initialization completed");

    return ESP_OK;
}

esp_err_t Ethernet::initSPI()
{
    Serial.println("[INFO][Ethernet] Initializing SPI for W5500");

    // If SPI device is already initialized, we're done
    if (spi_handle != nullptr)
    {
        Serial.println("[INFO][Ethernet] SPI device already initialized");
        return ESP_OK;
    }

    // Install GPIO ISR service (only if interrupt pin is configured)
    esp_err_t ret = ESP_OK;
    if (PIN_W5500_INT >= 0)
    {
        ret = gpio_install_isr_service(0);
        if (ret != ESP_OK && ret != ESP_ERR_INVALID_STATE)
        {
            Serial.printf("[ERROR][Ethernet] Failed to install GPIO ISR service: %s\n", esp_err_to_name(ret));
            return ret;
        }
        Serial.println("[INFO][Ethernet] GPIO ISR service installed for interrupt mode");
    }

    // Configure W5500 reset pin (if available)
    if (PIN_W5500_RESET >= 0)
    {
        Serial.printf("[INFO][Ethernet] Configuring reset pin GPIO%d\n", PIN_W5500_RESET);
        gpio_config_t reset_gpio_config = {
            .pin_bit_mask = (1ULL << PIN_W5500_RESET),
            .mode = GPIO_MODE_OUTPUT,
            .pull_up_en = GPIO_PULLUP_DISABLE,
            .pull_down_en = GPIO_PULLDOWN_DISABLE,
            .intr_type = GPIO_INTR_DISABLE,
        };
        ret = gpio_config(&reset_gpio_config);
        if (ret != ESP_OK)
        {
            Serial.printf("[ERROR][Ethernet] Failed to configure reset GPIO: %s\n", esp_err_to_name(ret));
            return ret;
        }

        // Reset W5500 (active low reset)
        gpio_set_level((gpio_num_t)PIN_W5500_RESET, 0);
        vTaskDelay(pdMS_TO_TICKS(10)); // Hold reset for 10ms
        gpio_set_level((gpio_num_t)PIN_W5500_RESET, 1);
        vTaskDelay(pdMS_TO_TICKS(10)); // Wait for chip to come out of reset
        Serial.println("[INFO][Ethernet] W5500 hardware reset completed");
    }
    else
    {
        Serial.println("[INFO][Ethernet] No reset pin configured - relying on power-on reset");
        vTaskDelay(pdMS_TO_TICKS(100)); // Give some time for power-on reset to complete
    }

    // Initialize SPI bus
    spi_bus_config_t buscfg = {
        .mosi_io_num = PIN_ETH_SPI_MOSI,
        .miso_io_num = PIN_ETH_SPI_MISO,
        .sclk_io_num = PIN_ETH_SPI_SCK,
        .quadwp_io_num = -1,
        .quadhd_io_num = -1,
        .max_transfer_sz = 0,
    };

    ret = spi_bus_initialize(SPI2_HOST, &buscfg, SPI_DMA_CH_AUTO);
    if (ret != ESP_OK && ret != ESP_ERR_INVALID_STATE)
    {
        Serial.printf("[ERROR][Ethernet] Failed to initialize SPI bus: %s\n", esp_err_to_name(ret));
        return ret;
    }
    else if (ret == ESP_ERR_INVALID_STATE)
    {
        Serial.println("[INFO][Ethernet] SPI bus already initialized, continuing with device setup");
    }
    else
    {
        Serial.println("[INFO][Ethernet] SPI bus initialized successfully");
    }

    // Initialize SPI device
    spi_device_interface_config_t devcfg = {
        .command_bits = 16,
        .address_bits = 8,
        .dummy_bits = 0,
        .mode = 0,
        .duty_cycle_pos = 0,
        .cs_ena_pretrans = 0,
        .cs_ena_posttrans = 0,
        .clock_speed_hz = 20 * 1000 * 1000, // 20MHz
        .input_delay_ns = 0,
        .spics_io_num = PIN_ETH_SPI_CS,
        .flags = 0,
        .queue_size = 20,
        .pre_cb = nullptr,
        .post_cb = nullptr,
    };

    ret = spi_bus_add_device(SPI2_HOST, &devcfg, &spi_handle);
    if (ret != ESP_OK)
    {
        Serial.printf("[ERROR][Ethernet] Failed to add SPI device: %s\n", esp_err_to_name(ret));
        return ret;
    }

    Serial.println("[INFO][Ethernet] SPI initialization completed");
    return ESP_OK;
}

esp_err_t Ethernet::ethernet_init(esp_eth_handle_t *eth_handles, uint8_t *eth_port_cnt)
{
    Serial.println("[INFO][Ethernet] Initializing W5500 Ethernet driver");

    // SPI should already be initialized
    if (spi_handle == nullptr)
    {
        Serial.println("[ERROR][Ethernet] SPI not initialized");
        return ESP_FAIL;
    }

    // Initialize W5500 configuration
    eth_w5500_config_t w5500_config = ETH_W5500_DEFAULT_CONFIG(spi_handle);

    // Configure interrupt pin (if available)
    if (PIN_W5500_INT >= 0)
    {
        Serial.printf("[INFO][Ethernet] Configuring interrupt pin GPIO%d\n", PIN_W5500_INT);
        w5500_config.int_gpio_num = PIN_W5500_INT;
    }
    else
    {
        Serial.println("[INFO][Ethernet] No interrupt pin configured - using polling mode");
        w5500_config.int_gpio_num = -1; // Disable interrupt, use polling
    }

    // Initialize Ethernet MAC
    eth_mac_config_t mac_config = ETH_MAC_DEFAULT_CONFIG();
    esp_eth_mac_t *mac = esp_eth_mac_new_w5500(&w5500_config, &mac_config);
    if (mac == nullptr)
    {
        Serial.println("[ERROR][Ethernet] Failed to create MAC");
        return ESP_FAIL;
    }

    // Initialize Ethernet PHY
    eth_phy_config_t phy_config = ETH_PHY_DEFAULT_CONFIG();
    phy_config.phy_addr = 1;
    phy_config.reset_gpio_num = (PIN_W5500_RESET >= 0) ? PIN_W5500_RESET : -1;
    esp_eth_phy_t *phy = esp_eth_phy_new_w5500(&phy_config);
    if (phy == nullptr)
    {
        Serial.println("[ERROR][Ethernet] Failed to create PHY");
        return ESP_FAIL;
    }

    // Initialize Ethernet driver
    esp_eth_config_t eth_config = ETH_DEFAULT_CONFIG(mac, phy);
    esp_err_t ret = esp_eth_driver_install(&eth_config, eth_handles);
    if (ret != ESP_OK)
    {
        Serial.printf("[ERROR][Ethernet] Failed to install Ethernet driver: %s\n", esp_err_to_name(ret));
        return ret;
    }

    // Set MAC address - generate a local unicast MAC address based on ESP32 chip ID
    uint8_t mac_addr[6];
    esp_read_mac(mac_addr, ESP_MAC_ETH);

    // Ensure it's a locally administered unicast address
    mac_addr[0] = (mac_addr[0] & 0xFC) | 0x02; // Set locally administered bit, clear multicast bit

    ret = esp_eth_ioctl(*eth_handles, ETH_CMD_S_MAC_ADDR, mac_addr);
    if (ret != ESP_OK)
    {
        Serial.printf("[ERROR][Ethernet] Failed to set MAC address: %s\n", esp_err_to_name(ret));
        return ret;
    }

    Serial.printf("[INFO][Ethernet] MAC address set to: %02x:%02x:%02x:%02x:%02x:%02x\n",
                  mac_addr[0], mac_addr[1], mac_addr[2], mac_addr[3], mac_addr[4], mac_addr[5]);

    *eth_port_cnt = 1;
    Serial.println("[INFO][Ethernet] W5500 Ethernet driver initialized successfully");
    return ESP_OK;
}

void Ethernet::eth_event_handler(void *arg, esp_event_base_t event_base, int32_t event_id, void *event_data)
{
    uint8_t mac_addr[6] = {0};
    /* we can get the ethernet driver handle from event data */
    esp_eth_handle_t eth_handle = *(esp_eth_handle_t *)event_data;

    switch (event_id)
    {
    case ETHERNET_EVENT_CONNECTED:
        esp_eth_ioctl(eth_handle, ETH_CMD_G_MAC_ADDR, mac_addr);
        Serial.println("[INFO][Ethernet] Ethernet Link Up");
        Serial.printf("[INFO][Ethernet] Ethernet HW Addr %02x:%02x:%02x:%02x:%02x:%02x\n",
                      mac_addr[0], mac_addr[1], mac_addr[2], mac_addr[3], mac_addr[4], mac_addr[5]);
        initialization_in_progress = false; // Clear flag on successful connection
        dhcp_start_time = millis();         // Record when we start waiting for DHCP
        Serial.println("[INFO][Ethernet] Waiting for DHCP IP address...");
        setState(ETHERNET_STATE_CONNECTED_WAITING_FOR_IP);
        break;
    case ETHERNET_EVENT_DISCONNECTED:
        Serial.println("[INFO][Ethernet] Ethernet Link Down");
        initialization_in_progress = false; // Clear flag on disconnection
        setState(ETHERNET_STATE_DISCONNECTED);
        break;
    case ETHERNET_EVENT_START:
        Serial.println("[INFO][Ethernet] Ethernet Started");
        break;
    case ETHERNET_EVENT_STOP:
        Serial.println("[INFO][Ethernet] Ethernet Stopped");
        initialization_in_progress = false; // Clear flag when stopped
        setState(ETHERNET_STATE_DISCONNECTED);
        break;
    default:
        break;
    }
}

void Ethernet::got_ip_event_handler(void *arg, esp_event_base_t event_base, int32_t event_id, void *event_data)
{
    ip_event_got_ip_t *event = (ip_event_got_ip_t *)event_data;
    const esp_netif_ip_info_t *ip_info = &event->ip_info;

    Serial.println("[INFO][Ethernet] Ethernet Got IP Address");
    Serial.println("[INFO][Ethernet] ~~~~~~~~~~~");
    Serial.printf("[INFO][Ethernet] ETHIP:" IPSTR "\n", IP2STR(&ip_info->ip));
    Serial.printf("[INFO][Ethernet] ETHMASK:" IPSTR "\n", IP2STR(&ip_info->netmask));
    Serial.printf("[INFO][Ethernet] ETHGW:" IPSTR "\n", IP2STR(&ip_info->gw));
    Serial.println("[INFO][Ethernet] ~~~~~~~~~~~");

    initialization_in_progress = false; // Clear flag when fully connected
    setState(ETHERNET_STATE_CONNECTED);
}

void Ethernet::setState(EthernetState state)
{
    if (_state != state)
    {
        _state = state;
        Serial.printf("[INFO][Ethernet] State changed to: %d\n", state);

        if (onStateChangedCallback)
        {
            esp_ip4_addr_t ip = getIPAddress();
            onStateChangedCallback(state, ip);
        }
    }
}

void Ethernet::setStateChangedCallback(void (*callback)(EthernetState state, const esp_ip4_addr_t &ip))
{
    onStateChangedCallback = callback;
}

Ethernet::EthernetState Ethernet::getState()
{
    return _state;
}

esp_ip4_addr_t Ethernet::getIPAddress()
{
    esp_ip4_addr_t ip = {0};

    if (eth_netif != nullptr)
    {
        esp_netif_ip_info_t ip_info;
        if (esp_netif_get_ip_info(eth_netif, &ip_info) == ESP_OK)
        {
            ip = ip_info.ip;
        }
    }

    return ip;
}

void Ethernet::deinit()
{
    Serial.println("[INFO][Ethernet] Deinitializing Ethernet");

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
    Serial.println("[INFO][Ethernet] Cleaning up partial initialization");

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

    // Clean up SPI device (but keep SPI bus for other devices)
    if (spi_handle != nullptr)
    {
        spi_bus_remove_device(spi_handle);
        spi_handle = nullptr;
    }
}

void Ethernet::taskFn(void *parameter)
{
    for (;;)
    {
        loop();
        vTaskDelay(100 / portTICK_PERIOD_MS);
    }
}

void Ethernet::loop()
{
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
            Serial.printf("[ERROR][Ethernet] Maximum retry count (%u) reached. Giving up.\n", MAX_RETRY_COUNT);
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

        Serial.printf("[INFO][Ethernet] Connection attempt %u/%u\n", retry_count + 1, MAX_RETRY_COUNT);

        // Clean up any previous failed attempt
        cleanupPartialInit();

        // Mark initialization as in progress
        initialization_in_progress = true;

        // Try to initialize network
        if (initializeNetwork() != ESP_OK)
        {
            Serial.printf("[ERROR][Ethernet] Network initialization failed (attempt %u/%u)\n", retry_count + 1, MAX_RETRY_COUNT);
            initialization_in_progress = false;
            retry_count++;
            last_retry_time = current_time;
            break;
        }

        // Success! Reset retry count for next time (but keep initialization_in_progress = true)
        retry_count = 0;
        Serial.println("[INFO][Ethernet] Connection attempt successful - waiting for events");
        break;
    }
    case ETHERNET_STATE_CONNECTED_WAITING_FOR_IP:
    {
        // Check if DHCP is taking too long
        uint32_t current_time = millis();
        if (dhcp_start_time > 0 && (current_time - dhcp_start_time) > DHCP_TIMEOUT_MS)
        {
            Serial.printf("[ERROR][Ethernet] DHCP timeout after %u ms\n", DHCP_TIMEOUT_MS);
            Serial.println("[INFO][Ethernet] Retrying network initialization...");
            dhcp_start_time = 0;
            setState(ETHERNET_STATE_DISCONNECTED); // This will trigger a reconnection attempt
        }
        break;
    }
    case ETHERNET_STATE_DISCONNECTED:
    {
        // Auto-retry connection if we get disconnected
        Serial.println("[INFO][Ethernet] Ethernet disconnected, attempting to reconnect");
        setState(ETHERNET_STATE_CONNECTING);
        break;
    }
    case ETHERNET_STATE_CONNECT_FAILED:
    {
        // Reset retry count after a longer delay to try again
        uint32_t current_time = millis();
        if (retry_count == 0 || (current_time - last_retry_time) > (BASE_RETRY_DELAY_MS * 10))
        {
            Serial.println("[INFO][Ethernet] Resetting after connection failure, will retry");
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