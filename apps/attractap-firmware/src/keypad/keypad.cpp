#include "keypad.hpp"

void Keypad::setup()
{
    this->keyPad.begin();

    xTaskCreate(Keypad::taskFn, "Keypad", 2048, this, 1, NULL);
}

void Keypad::taskFn(void *parameter)
{
    Keypad *instance = (Keypad *)parameter;

    while (true)
    {
        instance->loop();
        vTaskDelay(pdMS_TO_TICKS(100));
    }
}

void Keypad::loop()
{
    if (this->keyPad.begin() == false)
    {
        static unsigned long lastKeyPadSetupErrorLog = 0;
        if (millis() - lastKeyPadSetupErrorLog > 10000)
        {
            logger.error("cannot communicate to keypad");
            lastKeyPadSetupErrorLog = millis();
        }
        return;
    }

    char key = this->readKey();

    if (key == '\0')
    {
        return;
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

    logger.debug(("Pressed key number: " + String(pressedKeyNum)).c_str());
    logger.debug(("Key pressed (" + String(key) + ")").c_str());

    // TODO: refactor so its non-blocking
    while (this->keyPad.getKey() != this->released_key_num)
    {
        delay(10);
    }

    logger.debug(("Key released (" + String(key) + ")").c_str());

    return key;
}
