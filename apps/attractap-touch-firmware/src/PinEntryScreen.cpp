#include "PinEntryScreen.h"

const String PinEntryScreen::DEFAULT_PIN = "123456";

PinEntryScreen::PinEntryScreen()
    : screen(nullptr),
      pinLabel(nullptr),
      pinTextArea(nullptr),
      pinKeyboard(nullptr),
      visible(false),
      enteredPin(""),
      pinAttempts(0),
      lockoutEndTime(0),
      onPinValidation(nullptr),
      onPinCancel(nullptr)
{
}

PinEntryScreen::~PinEntryScreen()
{
    if (screen)
    {
        lv_obj_del(screen);
        screen = nullptr;
    }
}

void PinEntryScreen::begin()
{
    // UI will be created when first shown
}

void PinEntryScreen::show()
{
    if (!screen)
    {
        createUI();
    }

    clearPinEntry();
    lv_scr_load(screen);
    visible = true;

    Serial.println("PinEntryScreen: PIN entry screen shown");
}

void PinEntryScreen::hide()
{
    visible = false;

    if (onPinCancel)
    {
        onPinCancel();
    }
}

void PinEntryScreen::update()
{
    // Handle PIN lockout timer
    if (lockoutEndTime > 0 && millis() >= lockoutEndTime)
    {
        lockoutEndTime = 0;
        pinAttempts = 0;

        // Re-enable PIN entry
        if (pinTextArea)
        {
            lv_obj_clear_state(pinTextArea, LV_STATE_DISABLED);
            lv_label_set_text(pinLabel, "Enter 6-digit PIN:");
        }
    }
}

void PinEntryScreen::setPinValidationCallback(PinValidationCallback callback)
{
    onPinValidation = callback;
}

void PinEntryScreen::setPinCancelCallback(PinCancelCallback callback)
{
    onPinCancel = callback;
}

bool PinEntryScreen::isVisible() const
{
    return visible;
}

void PinEntryScreen::clearPinEntry()
{
    enteredPin = "";
    if (pinTextArea)
    {
        lv_textarea_set_text(pinTextArea, "");
    }
}

void PinEntryScreen::createUI()
{
    if (screen)
        return;

    screen = lv_obj_create(NULL);
    lv_obj_set_style_bg_color(screen, lv_color_hex(0x000000), 0);

    // Title
    lv_obj_t *title = lv_label_create(screen);
    lv_label_set_text(title, "Settings Access");
    lv_obj_set_style_text_font(title, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(title, lv_color_hex(0xFFFFFF), 0);
    lv_obj_align(title, LV_ALIGN_TOP_MID, 0, 15);

    // PIN instruction label
    pinLabel = lv_label_create(screen);
    lv_label_set_text(pinLabel, "Enter 6-digit PIN:");
    lv_obj_set_style_text_color(pinLabel, lv_color_hex(0xCCCCCC), 0);
    lv_obj_align(pinLabel, LV_ALIGN_TOP_MID, 0, 45);

    // PIN text area (password mode)
    pinTextArea = lv_textarea_create(screen);
    lv_textarea_set_placeholder_text(pinTextArea, "••••••");
    lv_textarea_set_password_mode(pinTextArea, true);
    lv_textarea_set_one_line(pinTextArea, true);
    lv_textarea_set_max_length(pinTextArea, 6);
    lv_obj_set_size(pinTextArea, 150, 40);
    lv_obj_align(pinTextArea, LV_ALIGN_TOP_MID, 0, 75);
    lv_obj_set_style_text_align(pinTextArea, LV_TEXT_ALIGN_CENTER, 0);
    lv_obj_set_style_text_font(pinTextArea, &lv_font_montserrat_14, 0);
    lv_obj_add_event_cb(pinTextArea, onPinTextAreaClicked, LV_EVENT_CLICKED, this);

    // Create native numeric keyboard
    pinKeyboard = lv_keyboard_create(screen);
    lv_keyboard_set_mode(pinKeyboard, LV_KEYBOARD_MODE_NUMBER);
    lv_obj_set_size(pinKeyboard, 240, 120);                 // Full width like other keyboards
    lv_obj_align(pinKeyboard, LV_ALIGN_BOTTOM_MID, 0, -10); // Position at bottom
    lv_keyboard_set_textarea(pinKeyboard, pinTextArea);

    // Style the keyboard for consistency
    lv_obj_set_style_bg_color(pinKeyboard, lv_color_hex(0x2A2A2A), 0);
    lv_obj_set_style_border_width(pinKeyboard, 1, 0);
    lv_obj_set_style_border_color(pinKeyboard, lv_color_hex(0x444444), 0);

    // Add keyboard event handlers for native OK/Cancel functionality
    lv_obj_add_event_cb(pinKeyboard, onPinKeyboardEvent, LV_EVENT_READY, this);
    lv_obj_add_event_cb(pinKeyboard, onPinKeyboardEvent, LV_EVENT_CANCEL, this);
}

void PinEntryScreen::handlePinEntry()
{
    if (lockoutEndTime > 0)
    {
        showLockoutMessage();
        return;
    }

    if (!pinTextArea)
        return;

    const char *pinText = lv_textarea_get_text(pinTextArea);
    String enteredPin = String(pinText);

    if (enteredPin.length() < 6)
    {
        lv_label_set_text(pinLabel, "PIN must be 6 digits");
        return;
    }

    if (isPinCorrect(enteredPin))
    {
        // Correct PIN
        pinAttempts = 0;
        clearPinEntry();

        if (onPinValidation)
        {
            onPinValidation(true);
        }
    }
    else
    {
        // Incorrect PIN
        pinAttempts++;
        clearPinEntry();

        if (pinAttempts >= MAX_PIN_ATTEMPTS)
        {
            // Lockout user
            lockoutEndTime = millis() + LOCKOUT_DURATION;
            lv_obj_add_state(pinTextArea, LV_STATE_DISABLED);
            showLockoutMessage();
        }
        else
        {
            String message = "Wrong PIN! Attempts left: " + String(MAX_PIN_ATTEMPTS - pinAttempts);
            lv_label_set_text(pinLabel, message.c_str());
        }
    }
}

bool PinEntryScreen::isPinCorrect(const String &pin)
{
    return pin.equals(DEFAULT_PIN);
}

void PinEntryScreen::showLockoutMessage()
{
    if (lockoutEndTime > 0)
    {
        uint32_t remainingTime = (lockoutEndTime - millis()) / 1000;
        String message = "Too many attempts! Wait " + String(remainingTime) + "s";
        lv_label_set_text(pinLabel, message.c_str());
    }
}

// Event handlers
void PinEntryScreen::onPinTextAreaClicked(lv_event_t *e)
{
    PinEntryScreen *screen = (PinEntryScreen *)lv_event_get_user_data(e);
    // Focus on text area for native keyboard input
}

void PinEntryScreen::onPinKeyboardEvent(lv_event_t *e)
{
    PinEntryScreen *screen = (PinEntryScreen *)lv_event_get_user_data(e);
    if (!screen)
        return;

    lv_event_code_t code = lv_event_get_code(e);

    if (code == LV_EVENT_READY)
    {
        // User pressed the OK/Enter key - process PIN entry
        Serial.println("PinEntryScreen: Keyboard OK pressed - processing PIN");
        screen->handlePinEntry();
    }
    else if (code == LV_EVENT_CANCEL)
    {
        // User pressed Cancel/Close key - exit settings
        Serial.println("PinEntryScreen: Keyboard Cancel pressed - hiding settings");
        screen->hide();
    }
}