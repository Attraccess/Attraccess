#pragma once

#include <Arduino.h>
#include <I2CKeyPad.h>
#include "configuration.hpp"

class Keypad
{
public:
    Keypad() : keyPad(I2C_KEYPAD_ADDRESS) {}

    void setup();
    char readKey();

    void setOnKeyPressed(void (*callback)(char key));

private:
    static void task_function(void *pvParameters);
    void loop();

    I2CKeyPad keyPad;
    char keymap[17] = "DCBA#9630852*741";
    char released_key_num = 16;

    void (*keyPressedHandler)(char key);
};