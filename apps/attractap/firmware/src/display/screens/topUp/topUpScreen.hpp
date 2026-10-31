#pragma once

#include <cstdint>
#include <functional>
#include <string>

#include "../IScreen.hpp"

// Asks how much to top up after an action failed with INSUFFICIENT_BALANCE on a
// reader that has a payment terminal. Routed like every other screen, so any
// server-driven transition (logout, timeout, disconnect) simply replaces it.
class TopUpScreen : public IScreen
{
public:
    void init() override;
    void onScreenLeave() override;
    void loop() override;
    lv_obj_t *getScreen() override;
    std::string getName() override;
    void destroy() override;

    // Clears the amount and any validation error; call before each presentation.
    void reset();
    // `onTopUp` receives the validated amount in cents.
    void setCallbacks(std::function<void(uint32_t amountCents)> onTopUp, std::function<void()> onCancel);

private:
    lv_obj_t *screen = nullptr;
    lv_obj_t *amountInput = nullptr;
    lv_obj_t *errorLabel = nullptr;
    lv_obj_t *keyboard = nullptr;
    std::function<void(uint32_t)> onTopUp;
    std::function<void()> onCancel;

    static void onTopUpClick(lv_event_t *e);
    static void onCancelClick(lv_event_t *e);
    static void onInputEvent(lv_event_t *e);
    static void onKeyboardEvent(lv_event_t *e);
};
