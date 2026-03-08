#include "ioexpander.hpp"

bool IOExpander::probeAddress(uint8_t addr)
{
    Wire.beginTransmission(addr);
    return Wire.endTransmission() == 0;
}

void IOExpander::setup()
{
    if (probeAddress(IOEXPANDER_I2C_ADDR_V3))
    {
        i2cAddress = IOEXPANDER_I2C_ADDR_V3;
        logger.infof("Found IO expander at 0x%02X (V3)", i2cAddress);
    }
    else if (probeAddress(IOEXPANDER_I2C_ADDR_V4))
    {
        i2cAddress = IOEXPANDER_I2C_ADDR_V4;
        logger.infof("Found IO expander at 0x%02X (V4)", i2cAddress);
    }
    else
    {
        logger.error("IO expander not found at 0x20 or 0x24");
        return;
    }

    uint8_t cfg = 0xFF;
    cfg &= ~(uint8_t(1 << IOEXP_BIT_TP_RST));
    cfg &= ~(uint8_t(1 << IOEXP_BIT_BACKLIGHT));
    cfg &= ~(uint8_t(1 << IOEXP_BIT_LCD_RST));
    cfg &= ~(uint8_t(1 << IOEXP_BIT_BEEPER));
    if (!writeRegister(TCA9554_REG_CONFIG, cfg))
    {
        logger.error("Failed to write CONFIG register");
        return;
    }
    logger.infof("CONFIG set to 0x%02X", cfg);

    uint8_t out = 0x00;
    out |= (uint8_t(1 << IOEXP_BIT_TP_RST));
    out |= (uint8_t(1 << IOEXP_BIT_BACKLIGHT));
    out &= ~(uint8_t(1 << IOEXP_BIT_BEEPER));
    if (!writeRegister(TCA9554_REG_OUTPUT, out))
    {
        logger.error("Failed to write OUTPUT register");
        return;
    }
    logger.infof("OUTPUT set to 0x%02X", out);

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
    writeRegister(TCA9554_REG_OUTPUT, outputState);
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
    writeRegister(TCA9554_REG_OUTPUT, outputState);
}

void IOExpander::fullRefresh()
{
    if (!initialized)
    {
        return;
    }
    writeRegister(TCA9554_REG_OUTPUT, outputState);

    uint8_t cfg = 0xFF;
    cfg &= ~(uint8_t(1 << IOEXP_BIT_TP_RST));
    cfg &= ~(uint8_t(1 << IOEXP_BIT_BACKLIGHT));
    cfg &= ~(uint8_t(1 << IOEXP_BIT_LCD_RST));
    cfg &= ~(uint8_t(1 << IOEXP_BIT_BEEPER));
    writeRegister(TCA9554_REG_CONFIG, cfg);
}

bool IOExpander::hasAddressConflict() const
{
    return i2cAddress == IOEXPANDER_I2C_ADDR_V4;
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
