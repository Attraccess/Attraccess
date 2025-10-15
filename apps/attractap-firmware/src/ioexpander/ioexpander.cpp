#include "ioexpander.hpp"

void IOExpander::setup()
{
    return;
    // Configure TCA9554: set desired pins as outputs, others as inputs
    // Read current configuration
    uint8_t cfg = 0xFF; // default all inputs
    readRegister(TCA9554_REG_CONFIG, cfg);

    // Clear bits (0 = output) for our output pins
    cfg &= ~(uint8_t(1 << BEEPER_PIN));
    cfg &= ~(uint8_t(1 << BACKLIGHT_PIN));
    writeRegister(TCA9554_REG_CONFIG, cfg);

    // Initialize outputs: beeper LOW, backlight HIGH (default ON)
    uint8_t out = 0x00;
    readRegister(TCA9554_REG_OUTPUT, out);
    out &= ~(uint8_t(1 << BEEPER_PIN));
    out |= (uint8_t(1 << BACKLIGHT_PIN));
    writeRegister(TCA9554_REG_OUTPUT, out);

    outputState = out;
    initialized = true;
}

void IOExpander::beep()
{
    return;
    if (!initialized)
    {
        return;
    }

    outputState |= (uint8_t(1 << BEEPER_PIN));
    writeRegister(TCA9554_REG_OUTPUT, outputState);
    delay(100);
    outputState &= ~(uint8_t(1 << BEEPER_PIN));
    writeRegister(TCA9554_REG_OUTPUT, outputState);
}

void IOExpander::setDisplayBacklight(bool on)
{

    if (!initialized)
    {
        return;
    }

    if (on)
    {
        outputState |= (uint8_t(1 << BACKLIGHT_PIN));
    }
    else
    {
        outputState &= ~(uint8_t(1 << BACKLIGHT_PIN));
    }
    writeRegister(TCA9554_REG_OUTPUT, outputState);
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