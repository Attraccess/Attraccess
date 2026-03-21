#pragma once
#include <Arduino.h>
#include <Wire.h>
#include "../logger/logger.hpp"

#ifndef IOEXPANDER_I2C_ADDR
#define IOEXPANDER_I2C_ADDR (0x20)
#endif

#define IOEXP_BIT_TP_RST (0)
#define IOEXP_BIT_BACKLIGHT (1)
#define IOEXP_BIT_LCD_RST (2)
#define IOEXP_BIT_BEEPER (5)

// V3 boards use TCA9554 (8-bit IO expander, registers at 0x00-0x03).
// V4 boards use a PCA9555-compatible 16-bit expander (output at 0x02).
// On V4, only the output register (0x02) is reliably writable — the config
// register (0x06) is read-only, and register reads are unreliable due to
// the DFR1185 I2C address translator sharing the bus.
#ifdef IO_EXPANDER_16BIT
// PCA9555-compatible register map (V4 hardware)
#define IOEXP_REG_INPUT    0x00  // Input port 0
#define IOEXP_REG_OUTPUT   0x02  // Output port 0 (writable)
#define IOEXP_REG_POLARITY 0x04  // Polarity inversion port 0
#define IOEXP_REG_CONFIG   0x06  // Configuration port 0 (read-only on V4)
#else
// TCA9554 register map (V3 hardware)
#define IOEXP_REG_INPUT    0x00
#define IOEXP_REG_OUTPUT   0x01
#define IOEXP_REG_POLARITY 0x02
#define IOEXP_REG_CONFIG   0x03
#endif

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

private:
    Logger logger = Logger("IOExp");
    uint8_t i2cAddress = 0;
    uint8_t outputState = 0x00;
    bool initialized = false;

    bool writeRegister(uint8_t reg, uint8_t value);
    bool readRegister(uint8_t reg, uint8_t &value);
};
