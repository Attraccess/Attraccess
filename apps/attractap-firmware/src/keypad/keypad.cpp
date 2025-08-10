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
        if (pressedKeyNum < I2C_KEYPAD_NOKEY)
        {
            this->last_pressed_key_num = pressedKeyNum;
            this->logger.debug(String("Key down: " + String(pressedKeyNum) + " " + this->keymap[pressedKeyNum]).c_str());
        }
        return;
    }

    if (this->last_pressed_key_num == I2C_KEYPAD_NOKEY)
    {
        // No prior keypress; ignore spurious release
        return;
    }

    uint8_t releasedIndex = this->last_pressed_key_num;
    this->last_pressed_key_num = I2C_KEYPAD_NOKEY;

    if (releasedIndex >= I2C_KEYPAD_NOKEY)
    {
        return;
    }

    char key = this->keymap[releasedIndex];

    if (key == '#')
    {
        this->logger.debug(String("Key confirm: " + this->value).c_str());
        State::pushEventToApi(State::ApiInputEventType::API_INPUT_EVENT_KEYPAD_CONFIRM_PRESSED, this->value);
        this->value = "";
        State::setKeypadValue(this->value);
        return;
    }

    if (key == 'D')
    {
        this->logger.debug(String("Key cancel: " + this->value).c_str());
        State::pushEventToApi(State::ApiInputEventType::API_INPUT_EVENT_KEYPAD_CANCEL_PRESSED);
        this->value = "";
        State::setKeypadValue(this->value);
        return;
    }

    this->logger.debug(String("Key pressed: " + String(key)).c_str());
    this->value += key;
    State::setKeypadValue(this->value);
}
