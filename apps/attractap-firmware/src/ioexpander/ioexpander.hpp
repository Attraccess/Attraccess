#pragma once
#include <Arduino.h>
#include <Wire.h>

#include "../settings/settings.hpp"

// TCA9554 defaults to 0x20 when A2..A0 = 000
#define IOEXPANDER_I2C_ADDR (0x20)
// Pins on the expander (bit index 0..7)
#define I2C_EXPANDER_SDA_PIN (15)
#define I2C_EXPANDER_SCL_PIN (7)
#define BEEPER_PIN (5)
#define BACKLIGHT_PIN (1)

// TCA9554 register addresses
#define TCA9554_REG_INPUT 0x00
#define TCA9554_REG_OUTPUT 0x01
#define TCA9554_REG_POLARITY 0x02
#define TCA9554_REG_CONFIG 0x03

class IOExpander
{
public:
    void setup();
    void beeperOn();
    void beeperOff();
    void setDisplayBacklight(bool on);

private:
    uint8_t i2cAddress = IOEXPANDER_I2C_ADDR;
    uint8_t outputState = 0x00;
    bool initialized = false;

    bool writeRegister(uint8_t reg, uint8_t value);
    bool readRegister(uint8_t reg, uint8_t &value);
};