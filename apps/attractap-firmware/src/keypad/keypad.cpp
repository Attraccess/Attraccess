#include "keypad.hpp"
#include "keypad_config.hpp"

#if KEYPAD == KEYPAD_I2C_FOLIO
#include "variations/folio/folio.hpp"
#endif
#if KEYPAD == KEYPAD_I2C_MPR121
#include "variations/mpr121/mpr121.hpp"
#endif

void Keypad::setup()
{
    xTaskCreate(Keypad::taskFn, "Keypad", 3072, this, TASK_PRIORITY_KEYPAD, NULL);
}

void Keypad::taskFn(void *parameter)
{
    Keypad *instance = (Keypad *)parameter;

    bool keypadSetupSuccess = false;
#if KEYPAD == KEYPAD_I2C_FOLIO
    instance->keypad = new Folio();
    keypadSetupSuccess = instance->keypad->setup();
#elif KEYPAD == KEYPAD_I2C_MPR121
    instance->keypad = new MPR121();
    keypadSetupSuccess = instance->keypad->setup();
#else
    instance->logger.error("Keypad not configured");
    vTaskDelete(NULL);
    return; // not reached
#endif

    if (!keypadSetupSuccess)
    {
        instance->logger.error("Keypad setup failed, continuing without keypad");
        if (instance->keypad != nullptr)
        {
            delete instance->keypad;
            instance->keypad = nullptr;
        }
        vTaskDelete(NULL);
        return; // not reached
    }

    while (true)
    {
        instance->loop();
        vTaskDelay(150 / portTICK_PERIOD_MS);
    }
}

void Keypad::loop()
{
    if (this->keypad == nullptr)
    {
        return;
    }

    this->updateState();

    if (!this->enableKeyChecking)
    {
        return;
    }

    char key = this->keypad->checkForKeyPress();

    if (key == IKeypad::KEYPAD_NO_KEY)
    {
        return;
    }

    if (key == IKeypad::KEYPAD_CONFIRM)
    {
        this->logger.debug(String("Key confirm: " + this->value).c_str());
        State::pushEventToApi(State::ApiInputEventType::API_INPUT_EVENT_KEYPAD_CONFIRM_PRESSED, this->value);
        this->value = "";
        State::setKeypadValue(this->value);
        return;
    }

    if (key == IKeypad::KEYPAD_CANCEL)
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

void Keypad::updateState()
{
    uint32_t lastApiEventTime = State::getLastApiEventTime();
    if (lastApiEventTime < this->lastApiStateCheckTime)
    {
        return;
    }

    this->lastApiStateCheckTime = lastApiEventTime;

    State::ApiEventData apiEvent = State::getApiEventData();

    switch (apiEvent.state)
    {
    case State::API_EVENT_STATE_CONFIRM_ACTION:
    case State::API_EVENT_STATE_RESOURCE_SELECTION:
        this->enableKeyChecking = true;
        break;
    default:
        this->enableKeyChecking = false;
        break;
    }
}
