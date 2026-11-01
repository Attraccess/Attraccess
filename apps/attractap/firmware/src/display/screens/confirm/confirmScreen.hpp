#pragma once

#include <functional>
#include <string>

#include "../IScreen.hpp"

// Full-screen confirmation of a drastic action (reboot, power off): two equal
// buttons, nothing happens on its own.
class ConfirmScreen : public IScreen
{
public:
    struct Config
    {
        FirmwareI18n::Text title;
        FirmwareI18n::Text message;
        FirmwareI18n::Text confirmLabel;
        std::function<void()> onConfirm;
        // Called for Cancel; set by Display to return to the origin.
        std::function<void()> onCancel;
    };

    void init() override;
    void onScreenLeave() override;
    void loop() override;
    lv_obj_t *getScreen() override;
    std::string getName() override;
    void destroy() override;
    bool parksOrigin() const override { return true; }

    void configure(Config config);

private:
    lv_obj_t *screen = nullptr;
    Config config;

    void build();
};
