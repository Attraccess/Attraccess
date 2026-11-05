#pragma once

#include <cstdint>
#include <functional>
#include <string>

#include "../IScreen.hpp"
#include "../../shared/buttonError.hpp"

// Asks how much to top up after an action failed with INSUFFICIENT_BALANCE on a
// reader that has a payment terminal. A routed screen over the one the user was
// on: any server-driven transition (logout, timeout, disconnect) replaces it.
// The amount is typed on a fixed numeric keypad that is part of the layout.
class TopUpScreen : public IScreen
{
public:
    void init() override;
    void onScreenLeave() override;
    void loop() override;
    lv_obj_t *getScreen() override;
    std::string getName() override;
    void destroy() override;
    bool parksOrigin() const override { return true; }

    // Clears the amount and any error; call before a new top-up. A refused request
    // reopens the screen without it, so the typed amount is still there to retry.
    void reset();
    // `onTopUp` receives the validated amount in cents.
    void setCallbacks(std::function<void(uint32_t amountCents)> onTopUp, std::function<void()> onCancel);
    // Shows `text` in place on the "Top up" button (invalid amount, rejected request).
    void showError(const FirmwareI18n::Text &text);

private:
    lv_obj_t *screen = nullptr;
    lv_obj_t *amountLabel = nullptr;
    lv_obj_t *topUpButton = nullptr;
    std::string digits;
    ButtonError buttonError;
    std::function<void(uint32_t)> onTopUp;
    std::function<void()> onCancel;

    void updateAmount();
    void submit();
    static void onKey(lv_event_t *e);
};
