#pragma once

#include <cstdint>
#include <functional>
#include <string>

#include "../IScreen.hpp"

// Full-screen result: a round badge, a title, an optional message and a way
// back. One layout per kind of result; all are routed screens, so whatever
// replaces them (logout, timeout, disconnect, ...) leaves nothing behind.
class StatusScreen : public IScreen
{
public:
    enum class Variant
    {
        Error,   // sign-in failed and similar: red cross, OK, 6 s
        Success, // usage started / ended: green check, resource name, tap anywhere, 2.5 s
        Billing, // session total: amount, OK, 8 s
        Warning, // status unavailable, no payment possible: "!", OK, 6 s
        Generic  // something went wrong: triangle, code chip, Back
    };

    struct Config
    {
        Variant variant = Variant::Error;
        FirmwareI18n::Text title;
        FirmwareI18n::Text message; // Success: the resource name
        FirmwareI18n::Text detail;  // Billing: the amount. Generic: the error code
        FirmwareI18n::Text buttonLabel;
        bool button = true;
        uint32_t autoReturnMs = 0; // 0: only the button leaves
        // Called when the screen is done; set by Display to return to the origin.
        std::function<void()> onDismiss;
    };

    static Config error(const FirmwareI18n::Text &title, const FirmwareI18n::Text &message);
    static Config success(const FirmwareI18n::Text &title, const FirmwareI18n::Text &resourceName);
    static Config billing(const FirmwareI18n::Text &amount, const FirmwareI18n::Text &resourceName);
    static Config warning(const FirmwareI18n::Text &title, const FirmwareI18n::Text &message, bool button = true);
    static Config generic(const FirmwareI18n::Text &message, const std::string &code);

    void init() override;
    void onScreenLeave() override;
    void loop() override;
    lv_obj_t *getScreen() override;
    std::string getName() override;
    void destroy() override;
    bool parksOrigin() const override { return true; }

    // Shows `config`, replacing what the screen currently shows.
    void configure(Config config);
    Variant variant() const { return config.variant; }

private:
    lv_obj_t *screen = nullptr;
    lv_obj_t *bar = nullptr;
    Config config;
    uint32_t shownAt = 0;
    uint32_t lastBarUpdate = 0;
    bool dismissed = false;

    void build();
    void dismiss();
};
