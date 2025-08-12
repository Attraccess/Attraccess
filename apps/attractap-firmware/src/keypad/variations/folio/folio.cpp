#include "folio.hpp"

bool Folio::setup()
{
    bool ok = this->keyPad.begin();
    if (!ok)
    {
        this->logger.error("I2CKeyPad device not found or not responding");
        return false;
    }
    return true;
}

char Folio::checkForKeyPress()
{
    uint8_t pressedKeyNum = this->keyPad.getKey();
    if (pressedKeyNum == I2C_KEYPAD_FAIL)
    {
        return IKeypad::KEYPAD_NO_KEY;
    }

    if (pressedKeyNum == I2C_KEYPAD_THRESHOLD)
    {
        return IKeypad::KEYPAD_NO_KEY;
    }

    if (pressedKeyNum != I2C_KEYPAD_NOKEY)
    {
        if (pressedKeyNum < I2C_KEYPAD_NOKEY)
        {
            this->last_pressed_key_num = pressedKeyNum;
            this->logger.debug(String("Key down: " + String(pressedKeyNum) + " " + this->keymap[pressedKeyNum]).c_str());
        }
        return IKeypad::KEYPAD_NO_KEY;
    }

    if (this->last_pressed_key_num == I2C_KEYPAD_NOKEY)
    {
        // No prior keypress; ignore spurious release
        return IKeypad::KEYPAD_NO_KEY;
    }

    uint8_t releasedIndex = this->last_pressed_key_num;
    this->last_pressed_key_num = I2C_KEYPAD_NOKEY;

    if (releasedIndex >= I2C_KEYPAD_NOKEY)
    {
        return IKeypad::KEYPAD_NO_KEY;
    }

    return this->keymap[releasedIndex];
}