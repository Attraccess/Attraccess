#pragma once

class IKeypad
{
public:
    static constexpr char KEYPAD_NO_KEY = '\0';
    static constexpr char KEYPAD_CONFIRM = '#';
    static constexpr char KEYPAD_CANCEL = 'D';

    // Returns true on successful initialization, false otherwise
    virtual bool setup() = 0;
    virtual char checkForKeyPress() = 0;
};