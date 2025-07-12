#include "KeyboardManager.h"

KeyboardManager::KeyboardManager()
    : keyboard(nullptr),
      parentScreen(nullptr),
      targetTextArea(nullptr),
      smartCapsEnabled(true),
      keyboardWasUppercase(false)
{
}

KeyboardManager::~KeyboardManager()
{
    destroy();
}

void KeyboardManager::attachToTextArea(lv_obj_t *parent, lv_obj_t *textarea)
{
    if (!parent || !textarea)
        return;

    parentScreen = parent;
    targetTextArea = textarea;

    // Clean up existing keyboard if any
    destroy();
}

void KeyboardManager::show()
{
    if (!parentScreen || !targetTextArea)
        return;

    if (!keyboard)
    {
        createKeyboard();
    }
    else
    {
        lv_obj_clear_flag(keyboard, LV_OBJ_FLAG_HIDDEN);
        lv_keyboard_set_textarea(keyboard, targetTextArea);
    }
}

void KeyboardManager::hide()
{
    if (keyboard)
    {
        lv_obj_add_flag(keyboard, LV_OBJ_FLAG_HIDDEN);
    }
}

void KeyboardManager::destroy()
{
    if (keyboard)
    {
        lv_obj_del(keyboard);
        keyboard = nullptr;
    }
    keyboardWasUppercase = false;
}

bool KeyboardManager::isVisible() const
{
    return keyboard && !lv_obj_has_flag(keyboard, LV_OBJ_FLAG_HIDDEN);
}

void KeyboardManager::setSmartCapsEnabled(bool enabled)
{
    smartCapsEnabled = enabled;
}

bool KeyboardManager::isSmartCapsEnabled() const
{
    return smartCapsEnabled;
}

lv_obj_t *KeyboardManager::getKeyboard() const
{
    return keyboard;
}

void KeyboardManager::createKeyboard()
{
    if (!parentScreen || !targetTextArea)
        return;

    keyboard = lv_keyboard_create(parentScreen);
    lv_keyboard_set_textarea(keyboard, targetTextArea);

    // Set keyboard to full display width and proper height
    lv_obj_set_size(keyboard, 240, 120);               // Full width (240px) with appropriate height
    lv_obj_align(keyboard, LV_ALIGN_BOTTOM_MID, 0, 0); // Position at bottom center

    // Style the keyboard for better appearance
    lv_obj_set_style_bg_color(keyboard, lv_color_hex(0x2A2A2A), 0);
    lv_obj_set_style_border_width(keyboard, 1, 0);
    lv_obj_set_style_border_color(keyboard, lv_color_hex(0x444444), 0);

    // Add event callbacks
    lv_obj_add_event_cb(keyboard, onKeyboardReady, LV_EVENT_READY, this);
    lv_obj_add_event_cb(keyboard, onKeyboardValueChanged, LV_EVENT_VALUE_CHANGED, this);

    keyboardWasUppercase = false;
}

void KeyboardManager::handleSmartCaps()
{
    if (!smartCapsEnabled || !keyboard || !targetTextArea)
        return;

    // Get current keyboard mode
    lv_keyboard_mode_t currentMode = lv_keyboard_get_mode(keyboard);

    // Check if we're currently in uppercase mode and we previously detected uppercase
    if (currentMode == LV_KEYBOARD_MODE_TEXT_UPPER && keyboardWasUppercase)
    {
        // Get current text to check if a letter was just added
        const char *currentText = lv_textarea_get_text(targetTextArea);

        if (currentText && strlen(currentText) > 0)
        {
            // Check if the last character is an uppercase letter
            char lastChar = currentText[strlen(currentText) - 1];
            if (lastChar >= 'A' && lastChar <= 'Z')
            {
                // Switch back to lowercase after typing one uppercase letter
                lv_keyboard_set_mode(keyboard, LV_KEYBOARD_MODE_TEXT_LOWER);
                keyboardWasUppercase = false;
            }
        }
    }

    // Track if we're entering uppercase mode
    if (currentMode == LV_KEYBOARD_MODE_TEXT_UPPER)
    {
        keyboardWasUppercase = true;
    }
    else if (currentMode == LV_KEYBOARD_MODE_TEXT_LOWER)
    {
        keyboardWasUppercase = false;
    }
}

void KeyboardManager::onKeyboardReady(lv_event_t *e)
{
    KeyboardManager *manager = (KeyboardManager *)lv_event_get_user_data(e);
    if (manager)
    {
        manager->hide();
    }
}

void KeyboardManager::onKeyboardValueChanged(lv_event_t *e)
{
    KeyboardManager *manager = (KeyboardManager *)lv_event_get_user_data(e);
    if (manager)
    {
        manager->handleSmartCaps();
    }
}