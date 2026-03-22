#include "ioexpander.hpp"

void IOExpander::setup()
{
    i2cAddress = IOEXPANDER_I2C_ADDR;
    delay(10); // Allow IO expander to complete power-on reset
    logger.infof("Using IO expander at 0x%02X", i2cAddress);

#ifdef IO_EXPANDER_16BIT
    // V4 hardware: XL9555 / PCA9555-compatible 16-bit IO expander.
    // Config registers default to 0xFF (ALL INPUTS).
    // We MUST write 0x00 to set pins as outputs before output writes take effect.

    // Step 1: Configure all pins as outputs (triple-write for reliability)
    if (!writeRegisterReliable(IOEXP_REG_CONFIG, 0x00))
    {
        logger.error("Failed to write CONFIG port 0 (reg 0x06)");
    }
    else
    {
        logger.info("CONFIG port 0 = 0x00 (all outputs)");
    }

    if (!writeRegisterReliable(IOEXP_REG_CONFIG_1, 0x00))
    {
        logger.error("Failed to write CONFIG port 1 (reg 0x07)");
    }
    else
    {
        logger.info("CONFIG port 1 = 0x00 (all outputs)");
    }

    // Step 2: Set output values matching Waveshare official demo
    outputState = IOEXP_PORT0_DEFAULT; // 0xDF — all high except beeper
    if (!writeRegisterReliable(IOEXP_REG_OUTPUT, outputState))
    {
        logger.error("Failed to write OUTPUT port 0 (reg 0x02)");
    }
    else
    {
        logger.infof("OUTPUT port 0 = 0x%02X", outputState);
    }

    outputState1 = IOEXP_PORT1_DEFAULT; // 0x3A
    if (!writeRegisterReliable(IOEXP_REG_OUTPUT_1, outputState1))
    {
        logger.error("Failed to write OUTPUT port 1 (reg 0x03)");
    }
    else
    {
        logger.infof("OUTPUT port 1 = 0x%02X", outputState1);
    }

#else
    // V3 hardware: TCA9554 8-bit IO expander
    // Set initial output: TP_RST released, backlight on, LCD out of reset, beeper off
    uint8_t out = 0x00;
    out |= (uint8_t(1 << IOEXP_BIT_TP_RST));
    out |= (uint8_t(1 << IOEXP_BIT_BACKLIGHT));
    out |= (uint8_t(1 << IOEXP_BIT_LCD_RST));

    if (!writeRegister(IOEXP_REG_OUTPUT, out))
    {
        logger.error("Failed to write IO expander OUTPUT register");
    }
    else
    {
        logger.infof("IO expander OUTPUT set to 0x%02X", out);
    }

    outputState = out;
#endif

    initialized = true;
    logger.info("IO expander initialized");

    // Dump all registers for diagnostics
    dumpRegisters();
}

void IOExpander::setPin(uint8_t bit, bool high)
{
    if (!initialized)
    {
        return;
    }

    if (high)
    {
        outputState |= (uint8_t(1 << bit));
    }
    else
    {
        outputState &= ~(uint8_t(1 << bit));
    }

    logger.debugf("setPin: bit=%d high=%d → outputState=0x%02X", bit, high, outputState);
    writeRegisterReliable(IOEXP_REG_OUTPUT, outputState);
}

void IOExpander::resetTouchPanel()
{
    if (!initialized)
    {
        return;
    }

    logger.info("Resetting touch panel (TP_RST LOW 20ms → HIGH 50ms)");
    setPin(IOEXP_BIT_TP_RST, false);
    delay(20);
    setPin(IOEXP_BIT_TP_RST, true);
    delay(50);
    logger.info("Touch panel reset complete");
}

void IOExpander::beeperOn()
{
#ifdef IO_EXPANDER_16BIT
    // Re-write config register before beep — I2C bus traffic from GT911/NFC
    // can corrupt the IO expander config, reverting pins to inputs.
    // This ensures bit 5 is actually an output when we try to drive it.
    writeRegisterReliable(IOEXP_REG_CONFIG, 0x00);
#endif
    setPin(IOEXP_BIT_BEEPER, true);
}

void IOExpander::beeperOff()
{
#ifdef IO_EXPANDER_16BIT
    // Also re-write config register before turning off — if this write fails,
    // the beeper stays stuck ON (explains "constant beeping" symptom).
    writeRegisterReliable(IOEXP_REG_CONFIG, 0x00);
#endif
    setPin(IOEXP_BIT_BEEPER, false);
}

void IOExpander::setDisplayBacklight(bool on)
{
    setPin(IOEXP_BIT_BACKLIGHT, on);
}

void IOExpander::refreshOutput()
{
    if (!initialized)
    {
        return;
    }
    writeRegisterReliable(IOEXP_REG_OUTPUT, outputState);
#ifdef IO_EXPANDER_16BIT
    writeRegisterReliable(IOEXP_REG_OUTPUT_1, outputState1);
#endif
}

void IOExpander::fullRefresh(bool verbose)
{
    if (!initialized)
    {
        return;
    }

    if (verbose)
    {
        logger.info("fullRefresh: re-writing all IO expander registers");
    }

#ifdef IO_EXPANDER_16BIT
    // Re-write config registers in case I2C bus corruption reset them to defaults
    writeRegisterReliable(IOEXP_REG_CONFIG, 0x00);
    writeRegisterReliable(IOEXP_REG_CONFIG_1, 0x00);
    // Re-write both output ports
    writeRegisterReliable(IOEXP_REG_OUTPUT, outputState);
    writeRegisterReliable(IOEXP_REG_OUTPUT_1, outputState1);
#else
    writeRegisterReliable(IOEXP_REG_OUTPUT, outputState);
#endif

    if (verbose)
    {
        logger.infof("fullRefresh done: port0=0x%02X"
#ifdef IO_EXPANDER_16BIT
                     " port1=0x%02X"
#endif
                     , outputState
#ifdef IO_EXPANDER_16BIT
                     , outputState1
#endif
        );

        dumpRegisters();
    }
}

void IOExpander::dumpRegisters()
{
    logger.info("=== IO Expander Register Dump ===");

#ifdef IO_EXPANDER_16BIT
    const char *regNames[] = {
        "INPUT_0 ", "INPUT_1 ", "OUTPUT_0", "OUTPUT_1",
        "POLAR_0 ", "POLAR_1 ", "CONFIG_0", "CONFIG_1"};
    for (uint8_t reg = 0; reg <= 0x07; reg++)
    {
        uint8_t val = 0;
        bool ok = readRegister(reg, val);
        if (ok)
        {
            logger.infof("  Reg 0x%02X (%s) = 0x%02X (0b%d%d%d%d%d%d%d%d)",
                         reg, regNames[reg], val,
                         (val >> 7) & 1, (val >> 6) & 1, (val >> 5) & 1, (val >> 4) & 1,
                         (val >> 3) & 1, (val >> 2) & 1, (val >> 1) & 1, val & 1);
        }
        else
        {
            logger.infof("  Reg 0x%02X (%s) = READ FAILED", reg, regNames[reg]);
        }
    }
#else
    const char *regNames[] = {"INPUT   ", "OUTPUT  ", "POLAR   ", "CONFIG  "};
    for (uint8_t reg = 0; reg <= 0x03; reg++)
    {
        uint8_t val = 0;
        bool ok = readRegister(reg, val);
        if (ok)
        {
            logger.infof("  Reg 0x%02X (%s) = 0x%02X", reg, regNames[reg], val);
        }
        else
        {
            logger.infof("  Reg 0x%02X (%s) = READ FAILED", reg, regNames[reg]);
        }
    }
#endif

    logger.info("=== End Register Dump ===");
}

bool IOExpander::writeRegisterReliable(uint8_t reg, uint8_t value)
{
    // Write the same register 3 times with 1ms delays between writes.
    // On a noisy I2C bus (shared with GT911 touch + PN532 NFC via DFR1185),
    // individual writes can silently fail. Triple-write dramatically increases
    // the probability that at least one write succeeds.
    bool anyOk = false;
    for (int attempt = 0; attempt < 3; attempt++)
    {
        if (writeRegister(reg, value))
            anyOk = true;
        delay(1);
    }
    return anyOk;
}

bool IOExpander::writeRegister(uint8_t reg, uint8_t value)
{
    Wire.beginTransmission(i2cAddress);
    Wire.write(reg);
    Wire.write(value);
    uint8_t err = Wire.endTransmission();
    if (err != 0)
    {
        logger.infof("writeRegister(0x%02X, 0x%02X) FAILED err=%d (0=ok,2=NACK addr,3=NACK data,5=timeout)",
                     reg, value, err);
    }
    return err == 0;
}

bool IOExpander::readRegister(uint8_t reg, uint8_t &value)
{
    Wire.beginTransmission(i2cAddress);
    Wire.write(reg);
    if (Wire.endTransmission(false) != 0)
    {
        return false;
    }

    if (Wire.requestFrom((int)i2cAddress, 1) != 1)
    {
        return false;
    }
    value = Wire.read();
    return true;
}
