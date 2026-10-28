// Hardware-lab parking image: leaves a reader dark and idle between lab
// sessions while keeping USB-Serial-JTAG enumerated for the next flash.
//
// Built only through variants/*-park.cmake, which set ATTRACTAP_RELEASE OFF so
// build_firmwares.py never ships it. The attractap-lab janitor flashes it after
// a full chip erase and waits for the ATTRACTAP_PARKED marker below.
//
// No deep sleep: it powers down the USB-Serial-JTAG peripheral, so the reader
// would disappear from the lab host until someone presses reset.

#include <cstdint>
#include <cstdio>

#include "driver/gpio.h"
#include "driver/i2c_master.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#include "ioexpander/ioexpander.hpp"
#include "rfid/pn532/commands.hpp"

#if defined(HAS_WS2812_LED)
#include "led_strip.h"
#endif

#ifndef ATTRACTAP_PARK_HARDWARE
#error "Build the parking image through a variants/*-park.cmake variant"
#endif

namespace
{
constexpr int kI2cTimeoutMs = 50;
constexpr int kMarkerIntervalMs = 2000;

i2c_master_bus_handle_t i2cBus = nullptr;

void delayMs(uint32_t ms)
{
    vTaskDelay(pdMS_TO_TICKS(ms));
}

void driveLow(int pin)
{
    if (pin < 0)
    {
        return;
    }
    gpio_config_t cfg = {};
    cfg.pin_bit_mask = 1ULL << pin;
    cfg.mode = GPIO_MODE_OUTPUT;
    gpio_config(&cfg);
    gpio_set_level(static_cast<gpio_num_t>(pin), 0);
}

i2c_master_dev_handle_t addI2cDevice(uint8_t address)
{
    if (!i2cBus)
    {
        i2c_master_bus_config_t busConfig = {};
        busConfig.i2c_port = I2C_NUM_0;
        busConfig.sda_io_num = static_cast<gpio_num_t>(PIN_NFC_I2C_SDA);
        busConfig.scl_io_num = static_cast<gpio_num_t>(PIN_NFC_I2C_SCL);
        busConfig.clk_source = I2C_CLK_SRC_DEFAULT;
        busConfig.glitch_ignore_cnt = 7;
        busConfig.flags.enable_internal_pullup = true;
        if (i2c_new_master_bus(&busConfig, &i2cBus) != ESP_OK)
        {
            return nullptr;
        }
    }
    i2c_device_config_t deviceConfig = {};
    deviceConfig.dev_addr_length = I2C_ADDR_BIT_LEN_7;
    deviceConfig.device_address = address;
    deviceConfig.scl_speed_hz = 100000;
    i2c_master_dev_handle_t device = nullptr;
    if (i2c_master_bus_add_device(i2cBus, &deviceConfig, &device) != ESP_OK)
    {
        return nullptr;
    }
    return device;
}

#if defined(HAS_IO_EXPANDER)
i2c_master_dev_handle_t expander = nullptr;

bool writeExpander(uint8_t reg, uint8_t value)
{
    uint8_t buffer[2] = {reg, value};
    return i2c_master_transmit(expander, buffer, sizeof(buffer), kI2cTimeoutMs) == ESP_OK;
}

// Same pin map as src/ioexpander: hold touch controller and panel in reset,
// backlight and beeper off. Outputs are written before switching the pins to
// outputs so they never glitch high.
bool parkExpander()
{
    if (!expander)
    {
        expander = addI2cDevice(IOEXPANDER_I2C_ADDR);
        if (!expander)
        {
            return false;
        }
    }
    constexpr uint8_t activeLines =
        (1 << IOEXP_BIT_TP_RST) | (1 << IOEXP_BIT_BACKLIGHT) | (1 << IOEXP_BIT_LCD_RST) | (1 << IOEXP_BIT_BEEPER);
#if defined(IO_EXPANDER_16BIT)
    // Unrelated port 0 lines and all of port 1 keep the reader defaults. Port 1
    // includes SYS_EN: a battery-backed board must stay powered and reachable.
    return writeExpander(IOEXP_REG_OUTPUT, IOEXP_PORT0_DEFAULT & ~activeLines) &&
           writeExpander(IOEXP_REG_OUTPUT_1, IOEXP_PORT1_DEFAULT) &&
           writeExpander(IOEXP_REG_CONFIG, 0x00) &&
           writeExpander(IOEXP_REG_CONFIG_1, 0x00);
#else
    // The 8-bit expander has no other lines; every active line is high-active.
    static_assert((0x00 & activeLines) == 0, "all parked lines low");
    return writeExpander(IOEXP_REG_OUTPUT, 0x00) &&
           writeExpander(IOEXP_REG_CONFIG, 0x00);
#endif
}
#endif

// PN532 PowerDown (user manual 7.2.11), waking only on I2C so the next
// firmware's begin()/SAMConfig() brings it back. Best effort: the RF field is
// off either way once the PN532 leaves a command, and there is no reset line.
bool powerDownNfc()
{
    i2c_master_dev_handle_t pn532 = addI2cDevice(PN532_I2C_ADDRESS);
    if (!pn532)
    {
        return false;
    }
    const uint8_t command[] = {PN532_HOSTTOPN532, PN532_COMMAND_POWERDOWN, 0x80 /* wake on I2C */};
    uint8_t frame[5 + sizeof(command) + 2] = {PN532_PREAMBLE, PN532_STARTCODE1, PN532_STARTCODE2,
                                              uint8_t(sizeof(command)), uint8_t(0x100 - sizeof(command))};
    uint8_t checksum = 0;
    for (size_t i = 0; i < sizeof(command); i++)
    {
        frame[5 + i] = command[i];
        checksum += command[i];
    }
    frame[5 + sizeof(command)] = uint8_t(0x100 - checksum);
    frame[6 + sizeof(command)] = PN532_POSTAMBLE;

    // A sleeping PN532 may drop the frame that wakes it; repeat until it ACKs.
    for (int attempt = 0; attempt < 3; attempt++)
    {
        if (i2c_master_transmit(pn532, frame, sizeof(frame), kI2cTimeoutMs) == ESP_OK)
        {
            for (int poll = 0; poll < 10; poll++)
            {
                delayMs(5);
                uint8_t ack[7] = {};
                if (i2c_master_receive(pn532, ack, sizeof(ack), kI2cTimeoutMs) == ESP_OK &&
                    ack[0] == PN532_I2C_READY && ack[3] == 0xFF && ack[4] == 0x00)
                {
                    // Read the response so the PN532 completes the command.
                    delayMs(5);
                    uint8_t response[16] = {};
                    i2c_master_receive(pn532, response, sizeof(response), kI2cTimeoutMs);
                    return true;
                }
            }
        }
        delayMs(50);
    }
    return false;
}

#if defined(HAS_WS2812_LED)
bool clearLedRing()
{
    led_strip_config_t stripConfig = {};
    stripConfig.strip_gpio_num = PIN_WS2812_DATA;
    stripConfig.max_leds = WS2812_LED_COUNT;
    stripConfig.led_model = LED_MODEL_WS2812;
    stripConfig.color_component_format = LED_STRIP_COLOR_COMPONENT_FMT_GRB;
    led_strip_rmt_config_t rmtConfig = {};
    rmtConfig.resolution_hz = 10 * 1000 * 1000;
    led_strip_handle_t strip = nullptr;
    if (led_strip_new_rmt_device(&stripConfig, &rmtConfig, &strip) != ESP_OK)
    {
        return false;
    }
    const bool cleared = led_strip_clear(strip) == ESP_OK;
    led_strip_del(strip);
    return cleared;
}
#endif

// Returns the first hardware line that could not be parked, or nullptr.
const char *park()
{
#if defined(BEEPER_PIN) && !defined(HAS_IO_EXPANDER)
    driveLow(BEEPER_PIN);
#endif
#if defined(PIN_W5500_RESET)
    driveLow(PIN_W5500_RESET);
#endif
#if defined(HAS_WS2812_LED)
    if (!clearLedRing())
    {
        return "led-ring";
    }
#endif
#if defined(HAS_IO_EXPANDER)
    if (!parkExpander())
    {
        return "io-expander";
    }
#endif
    return nullptr;
}
} // namespace

extern "C" void app_main(void)
{
    const bool nfcOff = powerDownNfc();
    const char *failed = park();
    for (;;)
    {
        if (failed)
        {
            printf("ATTRACTAP_PARK_FAILED hardware=%s line=%s\n", ATTRACTAP_PARK_HARDWARE, failed);
            failed = park();
        }
        else
        {
            printf("ATTRACTAP_PARKED hardware=%s nfc=%s\n", ATTRACTAP_PARK_HARDWARE, nfcOff ? "off" : "unknown");
        }
        fflush(stdout);
        delayMs(kMarkerIntervalMs);
    }
}
