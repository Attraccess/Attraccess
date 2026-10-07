#include "utils.hpp"
#include <string>
#include <cstdio>
#include <cstring>
#include "driver/gpio.h"
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"
#include "platform.hpp"

static SemaphoreHandle_t s_i2cBusMutex = nullptr;
static i2c_master_bus_handle_t s_i2cBus = nullptr;

bool initSharedI2CBus(int sda, int scl)
{
    if (s_i2cBus)
    {
        return true;
    }
    i2c_master_bus_config_t cfg = {};
    cfg.i2c_port = I2C_NUM_0;
    cfg.sda_io_num = (gpio_num_t)sda;
    cfg.scl_io_num = (gpio_num_t)scl;
    cfg.clk_source = I2C_CLK_SRC_DEFAULT;
    cfg.glitch_ignore_cnt = 7;
    cfg.flags.enable_internal_pullup = true; // Wire.begin() default
    return i2c_new_master_bus(&cfg, &s_i2cBus) == ESP_OK;
}

i2c_master_bus_handle_t getSharedI2CBus()
{
    return s_i2cBus;
}

i2c_master_dev_handle_t addSharedI2CDevice(uint8_t address7bit, uint32_t sclSpeedHz)
{
    if (!s_i2cBus)
    {
        return nullptr;
    }
    i2c_device_config_t devCfg = {};
    devCfg.dev_addr_length = I2C_ADDR_BIT_LEN_7;
    devCfg.device_address = address7bit;
    devCfg.scl_speed_hz = sclSpeedHz;
    i2c_master_dev_handle_t dev = nullptr;
    if (i2c_master_bus_add_device(s_i2cBus, &devCfg, &dev) != ESP_OK)
    {
        return nullptr;
    }
    return dev;
}

void I2CBusLock::init()
{
    if (!s_i2cBusMutex)
    {
        s_i2cBusMutex = xSemaphoreCreateRecursiveMutex();
    }
}

void I2CBusLock::lock()
{
    if (s_i2cBusMutex)
    {
        xSemaphoreTakeRecursive(s_i2cBusMutex, portMAX_DELAY);
    }
}

void I2CBusLock::unlock()
{
    if (s_i2cBusMutex)
    {
        xSemaphoreGiveRecursive(s_i2cBusMutex);
    }
}

void recoverI2CBus(int sda, int scl)
{
    gpio_num_t sdaPin = (gpio_num_t)sda;
    gpio_num_t sclPin = (gpio_num_t)scl;

    gpio_set_direction(sclPin, GPIO_MODE_OUTPUT);
    gpio_set_direction(sdaPin, GPIO_MODE_INPUT); // sense SDA without driving it
    gpio_set_pull_mode(sdaPin, GPIO_PULLUP_ONLY);
    for (int i = 0; i < 9; i++)
    {
        gpio_set_level(sclPin, 0);
        delayMicroseconds(10);
        gpio_set_level(sclPin, 1);
        delayMicroseconds(10);
        if (gpio_get_level(sdaPin))
            break; // slave released SDA — bus is free
    }
    // STOP condition: SDA LOW → SCL HIGH → SDA HIGH
    gpio_set_direction(sdaPin, GPIO_MODE_OUTPUT);
    gpio_set_level(sdaPin, 0);
    delayMicroseconds(10);
    gpio_set_level(sclPin, 1);
    delayMicroseconds(10);
    gpio_set_level(sdaPin, 1);
    delayMicroseconds(10);
    // Release the pads so the i2c_master driver can claim them right after
    gpio_reset_pin(sdaPin);
    gpio_reset_pin(sclPin);
}
