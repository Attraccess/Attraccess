#pragma once

#include <Arduino.h>
#include <I2CKeyPad.h>
#include "../../../logger/logger.hpp"
#include "../../../state/state.hpp"

#include "../../IKeypad.hpp"

class Folio : public IKeypad
{
public:
    Folio() : keyPad(KEYPAD_I2C_ADDRESS), logger("Keyboard:Folio") {}

    bool setup() override;
    char checkForKeyPress() override;

private:
    I2CKeyPad keyPad;
    char keymap[17] = {IKeypad::KEYPAD_CANCEL, 'D', 'C', 'B', IKeypad::KEYPAD_CONFIRM, '9', '6', '3', '0', '8', '5', '2', '*', '7', '4', '1'};
    uint8_t last_pressed_key_num = I2C_KEYPAD_NOKEY;
    Logger logger;
    String value;
};