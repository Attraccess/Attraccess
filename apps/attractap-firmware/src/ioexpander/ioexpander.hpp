#pragma once
#include <Arduino.h>
#include <Wire.h>
#include "../logger/logger.hpp"

#ifndef IOEXPANDER_I2C_ADDR
#define IOEXPANDER_I2C_ADDR (0x20)
#endif

// Port 0 pin assignments (shared by V3 and V4)
#define IOEXP_BIT_TP_RST (0)
#define IOEXP_BIT_BACKLIGHT (1)
#define IOEXP_BIT_LCD_RST (2)
#define IOEXP_BIT_BEEPER (5)

#ifdef IO_EXPANDER_16BIT
// XL9555 / PCA9555-compatible register map (V4 hardware)
// 16-bit expander with two 8-bit ports.
// Config registers default to 0xFF (all inputs) — MUST write 0x00 to enable outputs.
#define IOEXP_REG_INPUT    0x00  // Input port 0
#define IOEXP_REG_INPUT_1  0x01  // Input port 1
#define IOEXP_REG_OUTPUT   0x02  // Output port 0
#define IOEXP_REG_OUTPUT_1 0x03  // Output port 1
#define IOEXP_REG_POLARITY 0x04  // Polarity inversion port 0
#define IOEXP_REG_POLARITY_1 0x05 // Polarity inversion port 1
#define IOEXP_REG_CONFIG   0x06  // Configuration port 0 (1=input, 0=output)
#define IOEXP_REG_CONFIG_1 0x07  // Configuration port 1 (1=input, 0=output)

// Waveshare default output values (from official V4 demo code)
#define IOEXP_PORT0_DEFAULT 0xFF  // All bits high
#define IOEXP_PORT1_DEFAULT 0x3A  // Binary 0011 1010 (bits 1,3,4,5 high)
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
    void dumpRegisters();

private:
    Logger logger = Logger("IOExp");
    uint8_t i2cAddress = 0;
    uint8_t outputState = 0x00;
#ifdef IO_EXPANDER_16BIT
    uint8_t outputState1 = 0x00;
#endif
    bool initialized = false;

    bool writeRegister(uint8_t reg, uint8_t value);
    bool readRegister(uint8_t reg, uint8_t &value);
};
