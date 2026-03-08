#pragma once
#include <Arduino.h>
#include <Wire.h>
#include "../logger/logger.hpp"

#define IOEXPANDER_I2C_ADDR_V3 (0x20)
#define IOEXPANDER_I2C_ADDR_V4 (0x24)

#define IOEXP_BIT_TP_RST (0)
#define IOEXP_BIT_BACKLIGHT (1)
#define IOEXP_BIT_LCD_RST (2)
#define IOEXP_BIT_BEEPER (5)

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
    void resetTouchPanel();
    void setPin(uint8_t bit, bool high);
    void refreshOutput();
    void fullRefresh();
    bool hasAddressConflict() const;

private:
    Logger logger = Logger("IOExp");
    uint8_t i2cAddress = 0;
    uint8_t outputState = 0x00;
    bool initialized = false;

    bool writeRegister(uint8_t reg, uint8_t value);
    bool readRegister(uint8_t reg, uint8_t &value);
    bool probeAddress(uint8_t addr);
};
