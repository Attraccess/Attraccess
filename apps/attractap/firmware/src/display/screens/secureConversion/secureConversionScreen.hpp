#pragma once

#include <string>

#include "../IScreen.hpp"
#include "../../../api/conversion/conversion_ui.hpp"

// "Secure this reader" (ATT-1208): a routed full-screen layout the application shows while the conversion client
// works. Transfer and verify show progress; the burn and the bootloader write (brick window 1, then the restart into
// brick window 2) show a "Don't unplug" warning. No popups: leaving the phase leaves the screen.
class SecureConversionScreen : public IScreen
{
public:
    void init() override;
    void onScreenLeave() override {}
    void loop() override {}
    lv_obj_t *getScreen() override { return screen; }
    std::string getName() override { return "SecureConversion"; }
    void destroy() override;

    void show(ConversionUi::Phase phase, int percent);

private:
    void apply();

    lv_obj_t *screen = nullptr;
    lv_obj_t *title = nullptr;
    lv_obj_t *step = nullptr;
    lv_obj_t *progressBar = nullptr;
    lv_obj_t *warning = nullptr;
    lv_obj_t *hint = nullptr;
    ConversionUi::Phase phase = ConversionUi::Phase::Transfer;
    int percent = 0;
    bool applied = false;
};
