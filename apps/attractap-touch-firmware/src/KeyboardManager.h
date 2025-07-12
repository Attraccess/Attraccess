/*
 * KeyboardManager - Reusable LVGL Keyboard Component
 *
 * Features:
 * - Smart caps functionality (auto-switch to lowercase after first uppercase letter)
 * - Easy attachment to any text area
 * - Show/hide management
 * - Configurable smart caps behavior
 * - Memory management (automatic cleanup)
 *
 * Usage:
 * 1. Create KeyboardManager instance
 * 2. Call attachToTextArea(parent, textarea)
 * 3. Call show() when text area is clicked
 * 4. Call hide() when needed
 *
 * See KeyboardManagerExample.h for detailed usage examples
 */

#ifndef KEYBOARD_MANAGER_H
#define KEYBOARD_MANAGER_H

#include <lvgl.h>

class KeyboardManager
{
public:
    KeyboardManager();
    ~KeyboardManager();

    // Main interface methods
    void attachToTextArea(lv_obj_t *parent, lv_obj_t *textarea);
    void show();
    void hide();
    void destroy();
    bool isVisible() const;

    // Configuration
    void setSmartCapsEnabled(bool enabled);
    bool isSmartCapsEnabled() const;

    // Get the underlying keyboard object (for advanced usage)
    lv_obj_t *getKeyboard() const;

private:
    lv_obj_t *keyboard;
    lv_obj_t *parentScreen;
    lv_obj_t *targetTextArea;
    bool smartCapsEnabled;
    bool keyboardWasUppercase;

    // Internal methods
    void createKeyboard();
    void handleSmartCaps();

    // Static event handlers
    static void onKeyboardReady(lv_event_t *e);
    static void onKeyboardValueChanged(lv_event_t *e);
};

#endif // KEYBOARD_MANAGER_H