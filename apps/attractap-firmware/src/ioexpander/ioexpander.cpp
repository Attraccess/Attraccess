#include "ioexpander.hpp"

void IOExpander::setup()
{
    i2cAddress = IOEXPANDER_I2C_ADDR;
    delay(10); // Allow IO expander to complete power-on reset
    logger.infof("Using IO expander at 0x%02X", i2cAddress);

    // V4 IO expander at 0x24: only reg 0x02 (output) is reliably writable.
    // Config register does not need explicit writes — pins default to outputs.
    // The DFR1185 I2C address translator on the bus makes register reads
    // unreliable, so we write without read-back verification.

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
    initialized = true;
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
    writeRegister(IOEXP_REG_OUTPUT, outputState);
}

void IOExpander::resetTouchPanel()
{
    if (!initialized)
    {
        return;
    }

    setPin(IOEXP_BIT_TP_RST, false);
    delay(20);
    setPin(IOEXP_BIT_TP_RST, true);
    delay(50);
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
    writeRegister(IOEXP_REG_OUTPUT, outputState);
}

void IOExpander::fullRefresh()
{
    if (!initialized)
    {
        return;
    }
    // Re-write output register after other I2C activity (GT911 probing, NFC init)
    // which can corrupt IO expander state on V4 hardware due to the DFR1185
    // I2C address translator sharing the bus.
    // CONFIG register is not writable on the V4 IO expander — pins default to outputs.
    writeRegister(IOEXP_REG_OUTPUT, outputState);
}

bool IOExpander::writeRegister(uint8_t reg, uint8_t value)
{
    Wire.beginTransmission(i2cAddress);
    Wire.write(reg);
    Wire.write(value);
    return Wire.endTransmission() == 0;
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
