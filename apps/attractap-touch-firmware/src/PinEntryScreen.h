#ifndef PIN_ENTRY_SCREEN_H
#define PIN_ENTRY_SCREEN_H

#include <Arduino.h>
#include <lvgl.h>

class PinEntryScreen
{
public:
    // Callback function type for PIN validation
    typedef std::function<void(bool success)> PinValidationCallback;
    typedef std::function<void()> PinCancelCallback;

    PinEntryScreen();
    ~PinEntryScreen();

    void begin();
    void show();
    void hide();
    void update();

    // Set callbacks for PIN validation and cancel events
    void setPinValidationCallback(PinValidationCallback callback);
    void setPinCancelCallback(PinCancelCallback callback);

    // Check if the screen is currently visible
    bool isVisible() const;

    // Clear the PIN entry field
    void clearPinEntry();

private:
    static const String DEFAULT_PIN;
    static const uint8_t MAX_PIN_ATTEMPTS = 3;
    static const uint32_t LOCKOUT_DURATION = 30000; // 30 seconds

    // UI components
    lv_obj_t *screen;
    lv_obj_t *pinLabel;
    lv_obj_t *pinTextArea;
    lv_obj_t *pinKeyboard;

    // State
    bool visible;
    String enteredPin;
    uint8_t pinAttempts;
    uint32_t lockoutEndTime;

    // Callbacks
    PinValidationCallback onPinValidation;
    PinCancelCallback onPinCancel;

    // Private methods
    void createUI();
    void handlePinEntry();
    bool isPinCorrect(const String &pin);
    void showLockoutMessage();

    // Event handlers
    static void onPinTextAreaClicked(lv_event_t *e);
    static void onPinKeyboardEvent(lv_event_t *e);
};

#endif // PIN_ENTRY_SCREEN_H