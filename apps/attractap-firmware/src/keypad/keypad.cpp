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

    uint8_t pressedKeyNum = this->keyPad.getKey();
    if (pressedKeyNum == I2C_KEYPAD_FAIL)
    {
        return;
    }

    if (pressedKeyNum == I2C_KEYPAD_THRESHOLD)
    {
        return;
    }

    if (pressedKeyNum != I2C_KEYPAD_NOKEY)
    {
        this->last_pressed_key_num = pressedKeyNum;
        return;
    }

    char key = this->keymap[this->last_pressed_key_num];
    this->last_pressed_key_num = I2C_KEYPAD_NOKEY;

    if (key == '#')
    {
        State::pushEventToApi(State::ApiInputEventType::API_INPUT_EVENT_KEYPAD_CONFIRM_PRESSED, this->value);
        this->value = "";
        State::setKeypadValue(this->value);
        return;
    }

    if (key == 'D')
    {
        State::pushEventToApi(State::ApiInputEventType::API_INPUT_EVENT_KEYPAD_CANCEL_PRESSED);
        this->value = "";
        State::setKeypadValue(this->value);
        return;
    }

    this->value += key;
    State::setKeypadValue(this->value);
}

char Keypad::readKey()
{
    uint8_t pressedKeyNum = this->keyPad.getKey();

    if (pressedKeyNum == this->last_pressed_key_num)
    {
        return '\0'; // Return null character instead of undefined 'null'
    }

    char key = this->keymap[pressedKeyNum];

    logger.debug(("Pressed key number: " + String(pressedKeyNum)).c_str());
    logger.debug(("Key pressed (" + String(key) + ")").c_str());

    // TODO: refactor so its non-blocking
    while (this->keyPad.getKey() != this->last_pressed_key_num)
    {
        delay(10);
    }

    logger.debug(("Key released (" + String(key) + ")").c_str());

    return key;
}
