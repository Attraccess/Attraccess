#pragma once

#include <Arduino.h>
#include <I2CKeyPad.h>
#include "../logger/logger.hpp"
#include "../state/state.hpp"

class Keypad
{
public:
    Keypad() : keyPad(I2C_KEYPAD_ADDRESS), logger("Keypad") {}

    void setup();

private:
    static void taskFn(void *parameter);
    void loop();

    I2CKeyPad keyPad;
    char keymap[17] = "DCBA#9630852*741";
    uint8_t last_pressed_key_num = I2C_KEYPAD_NOKEY;
    Logger logger;

    String value;
};