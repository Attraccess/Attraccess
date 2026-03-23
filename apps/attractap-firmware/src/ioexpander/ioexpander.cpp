#include "ioexpander.hpp"

void IOExpander::setup()
{
    i2cAddress = IOEXPANDER_I2C_ADDR;
    delay(10); // Allow IO expander to complete power-on reset
    logger.infof("Using IO expander at 0x%02X", i2cAddress);

#ifdef IO_EXPANDER_16BIT
    // V4 hardware: XL9555 / PCA9555-compatible 16-bit IO expander.
    // Config registers default to 0xFF (ALL INPUTS).
    // Set output states to the Waveshare defaults then write all registers.
    outputState  = IOEXP_PORT0_DEFAULT; // 0xBF — all high except beeper
    outputState1 = IOEXP_PORT1_DEFAULT; // 0x3A — RS485/CAN/IMU/RTC enables
#else
    // V3 hardware: TCA9554 8-bit IO expander.
    // TP_RST released, backlight on, LCD out of reset, beeper off.
    outputState = 0x00;
    outputState |= (uint8_t(1 << IOEXP_BIT_TP_RST));
    outputState |= (uint8_t(1 << IOEXP_BIT_BACKLIGHT));
    outputState |= (uint8_t(1 << IOEXP_BIT_LCD_RST));
#endif

    writeDefaultState();

    initialized = true;
    logger.info("IO expander initialized");
}

void IOExpander::setPin(uint8_t bit, bool high)
{
    if (!initialized)
    {
        return;
    }

#ifdef IO_EXPANDER_16BIT
    // setPin() operates on port 0 (bits 0–7) only.
    // Port 1 state is managed via fullRefresh() / refreshOutput().
    if (bit > 7)
    {
        logger.warnf("setPin: bit=%d is out of range for port 0 (0–7) — port 1 pins cannot be set individually", bit);
        return;
    }
#endif

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
    setPin(IOEXP_BIT_BEEPER, true);
}

void IOExpander::beeperOff()
{
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

void IOExpander::writeDefaultState()
{
    // Writes direction config and current output state to hardware.
    // Called from setup() on first init and from fullRefresh() as a recovery re-write.
#ifdef IO_EXPANDER_16BIT
    if (!writeRegisterReliable(IOEXP_REG_CONFIG, 0x00))
        logger.error("Failed to write CONFIG port 0 (reg 0x06)");
    if (!writeRegisterReliable(IOEXP_REG_CONFIG_1, 0x00))
        logger.error("Failed to write CONFIG port 1 (reg 0x07)");
    if (!writeRegisterReliable(IOEXP_REG_OUTPUT, outputState))
        logger.error("Failed to write OUTPUT port 0 (reg 0x02)");
    if (!writeRegisterReliable(IOEXP_REG_OUTPUT_1, outputState1))
        logger.error("Failed to write OUTPUT port 1 (reg 0x03)");
    logger.infof("State written: port0=0x%02X port1=0x%02X", outputState, outputState1);
#else
    if (!writeRegisterReliable(IOEXP_REG_OUTPUT, outputState))
        logger.error("Failed to write IO expander OUTPUT register");
    else
        logger.infof("IO expander OUTPUT set to 0x%02X", outputState);
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

    writeDefaultState();

    if (verbose)
    {
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
        logger.warnf("writeRegister(0x%02X, 0x%02X) FAILED err=%d (0=ok,2=NACK addr,3=NACK data,5=timeout)",
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
