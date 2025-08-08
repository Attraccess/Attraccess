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
    char readKey();

    I2CKeyPad keyPad;
    char keymap[17] = "DCBA#9630852*741";
    char last_pressed_key_num = 16;
    Logger logger;

    String value;
};