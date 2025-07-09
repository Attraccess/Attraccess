#include "keypad.hpp"

void Keypad::setup()
{
    if (this->keyPad.begin() == false)
    {
        Serial.println("\nERROR: cannot communicate to keypad.\nPlease reboot.\n");
        while (1)
        {
            delay(1000);
        }
    }
}

char Keypad::readKey()
{
    uint8_t pressedKeyNum = this->keyPad.getKey();

    if (pressedKeyNum == this->released_key_num)
    {
        return '\0'; // Return null character instead of undefined 'null'
    }

    char key = this->keymap[pressedKeyNum];

    Serial.println("Pressed key number: " + String(pressedKeyNum));
    Serial.println("Key pressed (" + String(key) + ")");

    while (this->keyPad.getKey() != this->released_key_num)
    {
        delay(10);
    }

    Serial.println("Key released (" + String(key) + ")");

    return key;
}