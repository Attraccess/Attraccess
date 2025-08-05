#include "keypad.hpp"

void Keypad::task_function(void *pvParameters)
{
    Keypad *keypad = (Keypad *)pvParameters;

    while (true)
    {

        keypad->loop();
        vTaskDelay(10 / portTICK_PERIOD_MS);
    }
}

void Keypad::setup()
{
    xTaskCreate(Keypad::task_function, "Keypad", 10000, this, 1, NULL);
}

void Keypad::loop()
{
    if (this->keyPad.begin() == false)
    {
        Serial.println("\nERROR: cannot communicate to keypad.\n");
        vTaskDelay(10000 / portTICK_PERIOD_MS);
        return;
    }

    char key = this->readKey();

    if (key == '\0')
    {
        return;
    }

    if (this->keyPressedHandler)
    {
        this->keyPressedHandler(key);
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

void Keypad::setOnKeyPressed(void (*callback)(char key))
{
    this->keyPressedHandler = callback;
}