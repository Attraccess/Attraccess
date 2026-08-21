#pragma once
#include <cstdint>
#include "driver/i2c_master.h"
#include "freertos/semphr.h"
#include "../logger/logger.hpp"

#ifndef IOEXPANDER_I2C_ADDR
#define IOEXPANDER_I2C_ADDR (0x20)
#endif

// Port 0 pin assignments
#define IOEXP_BIT_TP_RST (0)
#define IOEXP_BIT_BACKLIGHT (1)
#define IOEXP_BIT_LCD_RST (2)

// Beeper pin: V3 (TCA9554) uses P0.5, V4 (XL9555) uses P0.6 (XIO6)
#ifdef IO_EXPANDER_16BIT
#define IOEXP_BIT_BEEPER (6)
#else
#define IOEXP_BIT_BEEPER (5)
#endif

// SYS_EN power-hold latch (16-bit V4 hardware only). Bit 5 of the second output
// register (reg 0x03) — the MCU holds it HIGH to keep the board powered; driving
// it LOW disconnects battery power. Matches Waveshare WS_CH32_IO PIN_SYS_EN
// (1 << 5) on the ESP32-S3-Touch-LCD-4. Set high in IOEXP_PORT1_DEFAULT (0x3A).
#define IOEXP_BIT_SYS_EN (5)

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
// Port 0 (0xBF = 1011 1111): all pins high except bit 6 (beeper off / active-low)
#define IOEXP_PORT0_DEFAULT 0xBF

// Port 1 (0x3A = 0011 1010): peripheral enable lines matching Waveshare V4 demo.
// XIO8  (P1.0) = 0 — reserved / unused
// XIO9  (P1.1) = 1 — RS485 DE/RE (transmit enable, idle-high)
// XIO10 (P1.2) = 0 — reserved / unused
// XIO11 (P1.3) = 1 — CAN standby released (active-low standby, so 1 = running)
// XIO12 (P1.4) = 1 — IMU power / enable
// XIO13 (P1.5) = 1 — SYS_EN power-hold latch (see IOEXP_BIT_SYS_EN below):
//                    empirically confirmed — clearing this bit cuts battery
//                    power. (Earlier speculation labelled it "RTC INTB / SD
//                    card power enable"; that was wrong.)
// XIO14 (P1.6) = 0 — reserved / unused
// XIO15 (P1.7) = 0 — reserved / unused
// TODO: verify the remaining assignments against the Waveshare ESP32-S3-Touch-LCD-4 V4 schematic
#define IOEXP_PORT1_DEFAULT 0x3A
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
    // Cut battery power by driving the SYS_EN latch low (16-bit V4 hardware only;
    // no-op elsewhere). Only powers the board off when running on battery — with
    // USB/DC connected the supply is maintained regardless.
    void powerOff();
    // Set a single pin on port 0 (bits 0–7). On the 16-bit expander, port 1 pins
    // (bits 8–15) cannot be set individually — they are only written during setup().
    void setPin(uint8_t bit, bool high);
    void dumpRegisters();

private:
    Logger logger = Logger("IOExp");
    uint8_t i2cAddress = 0;
    i2c_master_dev_handle_t dev = nullptr;
    uint8_t outputState = 0x00;
#ifdef IO_EXPANDER_16BIT
    uint8_t outputState1 = 0x00;
#endif
    bool initialized = false;
    SemaphoreHandle_t outputMutex = nullptr;

    // Writes the direction config and current output state to the hardware.
    // Called once from setup() during initialisation.
    void writeDefaultState();

    bool writeRegister(uint8_t reg, uint8_t value);
    bool readRegister(uint8_t reg, uint8_t &value);
};
