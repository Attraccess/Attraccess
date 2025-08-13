#pragma once

#include "../logger/logger.hpp"
#include "../state/state.hpp"
#include "IKeypad.hpp"
#include "task_priorities.h"

class Keypad
{
public:
    Keypad() : logger("Keypad") {}

    void setup();
    IKeypad *getImplementation() { return keypad; }

private:
    static void taskFn(void *parameter);
    void loop();

    IKeypad *keypad;
    Logger logger;
    String value;

    void updateState();
    uint32_t lastApiStateCheckTime = 0;
    bool enableKeyChecking = false;
};