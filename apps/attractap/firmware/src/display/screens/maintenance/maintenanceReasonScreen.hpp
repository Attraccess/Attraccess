#pragma once

#include <functional>
#include <string>

#include "../IScreen.hpp"
#include "../../i18n.hpp"

// The reason of a maintenance request: a text area with the on-screen keyboard, Cancel and a confirm button that is
// enabled from three characters on. Used by "Report a problem" and by the check before a session ends.
class MaintenanceReasonScreen : public IScreen
{
public:
    // The server accepts up to 2000 characters; the reader keeps it short for its memory.
    static constexpr uint32_t MaxCharacters = 500;
    static constexpr uint32_t MinCharacters = 3;

    struct Config
    {
        std::string resourceName;
        FirmwareI18n::Text confirmLabel;
        // The reason without surrounding spaces.
        std::function<void(const std::string &)> onConfirm;
        std::function<void()> onCancel;
        // What the text area starts with: a reason that could not be sent before.
        std::string initialText;
    };

    void init() override;
    void onScreenLeave() override {}
    void loop() override {}
    lv_obj_t *getScreen() override { return screen; }
    std::string getName() override { return "MaintenanceReasonScreen"; }
    void destroy() override;
    bool parksOrigin() const override { return true; }

    // Starts with `config.initialText`, usually empty.
    void configure(Config config);

    // As typed or tapped by the user (host tests).
    void setText(const std::string &text);
    std::string reason() const;
    bool canConfirm() const;
    void confirm();
    void cancel();

private:
    lv_obj_t *screen = nullptr;
    lv_obj_t *textArea = nullptr;
    lv_obj_t *confirmButton = nullptr;
    lv_obj_t *keyboard = nullptr;
    Config config;

    void build();
    void refresh();
};
