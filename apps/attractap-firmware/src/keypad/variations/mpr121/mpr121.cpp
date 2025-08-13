#include "mpr121.hpp"
#include <Wire.h>
#include "../../../settings/settings.hpp"

#ifndef KEYPAD_I2C_ADDRESS
#define KEYPAD_I2C_ADDRESS 0x5A
#endif

uint8_t MPR121::detectWorkingAddress()
{
    // Try provided address first
    uint8_t candidates[4] = {KEYPAD_I2C_ADDRESS, 0x5A, 0x5B, 0x5C};
    for (uint8_t i = 0; i < 4; i++)
    {
        uint8_t addr = candidates[i];
        if (addr == 0x00)
        {
            continue;
        }

        if (this->capSensor.begin(addr))
        {
            return addr;
        }
    }
    return 0x00;
}

bool MPR121::setup()
{
    this->logger.info("MPR121 setup");

    this->i2cAddress = this->detectWorkingAddress();
    if (this->i2cAddress == 0x00)
    {
        this->logger.error("MPR121 not found on I2C");
        return false;
    }

    this->logger.info((String("MPR121 initialized at 0x") + String(this->i2cAddress, HEX)).c_str());

    // Try to apply persisted thresholds if present; otherwise remain unconfigured until CLI sets them
    {
        uint8_t t = 0, r = 0;
        if (Settings::getMpr121Thresholds(t, r) && t > 0 && r > 0)
        {
            this->capSensor.setAutoconfig(true);
            this->capSensor.setThresholds(t, r);
            this->isConfigured = true;
            this->lastTouchThreshold = t;
            this->lastReleaseThreshold = r;
            this->logger.infof("Applied persisted thresholds t=%d r=%d", t, r);
        }
        else
        {
            this->isConfigured = false;
            this->logger.info("No persisted thresholds yet; keypad will idle until configured via CLI");
        }
    }

    this->isInitialized = true;
    return true;
}

char MPR121::checkForKeyPress()
{
    if (!this->isInitialized || !this->isConfigured)
    {
        return IKeypad::KEYPAD_NO_KEY;
    }

    uint16_t t0 = this->capSensor.touched();
    uint16_t t1 = this->capSensor.touched();
    // simple debounce: only accept stable reading over two consecutive polls
    this->currentlyTouched = (t0 == t1) ? t1 : this->lastTouched;

    if (this->currentlyTouched != this->lastTouched)
    {
        this->logger.debugf("touchMask: now=0x%03x prev=0x%03x", this->currentlyTouched, this->lastTouched);
    }

    for (uint8_t i = 0; i < 12; i++)
    {
        // it if *is* touched and *wasnt* touched before, alert!
        if ((this->currentlyTouched & _BV(i)) && !(this->lastTouched & _BV(i)))
        {
            this->logger.infof("Key %d pressed", i);
        }
        // if it *was* touched and now *isnt*, alert!
        if (!(this->currentlyTouched & _BV(i)) && (this->lastTouched & _BV(i)))
        {
            this->logger.infof("Key %d released", i);
            // Update state before returning to avoid repeated releases
            this->lastTouched = this->currentlyTouched;
            return this->keymap[i];
        }
    }
    // reset our state
    this->lastTouched = this->currentlyTouched;
    return IKeypad::KEYPAD_NO_KEY;
}