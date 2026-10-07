#include "ioexpander.hpp"
#include "../platform.hpp"
#include "../utils.hpp"

void IOExpander::setPin(uint8_t bit, bool high)
{
    if (!initialized || outputMutex == nullptr || xSemaphoreTake(outputMutex, portMAX_DELAY) != pdTRUE)
    {
        return;
    }

#ifdef IO_EXPANDER_16BIT
    // setPin() operates on port 0 (bits 0–7) only.
    // Port 1 state is managed via fullRefresh() / refreshOutput().
    if (bit > 7)
    {
        logger.warnf("setPin: bit=%d is out of range for port 0 (0–7) — port 1 pins cannot be set individually", bit);
        xSemaphoreGive(outputMutex);
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
    writeRegister(IOEXP_REG_OUTPUT, outputState);
    xSemaphoreGive(outputMutex);
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

void IOExpander::powerOff()
{
#ifdef IO_EXPANDER_16BIT
    if (!initialized || outputMutex == nullptr || xSemaphoreTake(outputMutex, portMAX_DELAY) != pdTRUE)
    {
        logger.warn("powerOff: called before init — ignoring power-off request");
        return;
    }
    logger.info("Power off: driving SYS_EN low (reg 0x03 bit 5)");
    outputState1 &= ~(uint8_t(1 << IOEXP_BIT_SYS_EN));
    writeRegister(IOEXP_REG_OUTPUT_1, outputState1);
    xSemaphoreGive(outputMutex);
#else
    logger.warn("powerOff: no SYS_EN latch on this hardware — ignoring");
#endif
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
