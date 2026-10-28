#pragma once

#include <cstdint>
#include <functional>

#include <string>

#include "../IScreen.hpp"
#include "../../../logger/logger.hpp"
#include "../../../utils.hpp"

// Mass introduction scan screen (ATT-1151). An introducer armed this reader from the web UI; every
// cardholder who taps here is introduced to the target resource or group. Visually follows the
// supervision screen: countdown bar, muted title, prominent target name, a running "N introduced"
// counter with the remaining time, a phase-driven status line, a hint and a cancel button. Each
// card result stays visible briefly before the screen returns to waiting for the next card.
class MassIntroductionScreen : public IScreen
{
public:
    MassIntroductionScreen() : logger("MassIntroductionScreen") {}
    void init() override;
    void onScreenLeave() override;
    void loop() override;
    lv_obj_t *getScreen() override;
    std::string getName() override;
    void destroy() override;

    enum Status
    {
        STATUS_WAITING,             // ready for the next card
        STATUS_VERIFYING,           // card read, verifying with the server
        STATUS_INTRODUCED,          // participant newly introduced
        STATUS_ALREADY_INTRODUCED,  // participant held the introduction already
        STATUS_ERROR,               // card rejected or could not be verified
    };

    struct View
    {
        uint32_t deadlineMs = 0;
        // Full session length, so the bar shows the share of time left.
        uint32_t durationMs = 0;
        std::string targetName;
        std::string introducerName;
        std::string participantName;
        uint32_t participantCount = 0;
        FirmwareI18n::Text statusMessage;
        Status status = STATUS_WAITING;
    };

    void render(const View &view);
    void setOnCancelCallback(std::function<void()> callback);
    // Call right before showing the screen. The server opens it without warning, so a finger may
    // already be on the panel; a click whose press began before the screen is never a cancel
    // (same guard as SupervisionScreen, ATT-867).
    void armCancelGuard();

private:
    Logger logger;
    lv_obj_t *screen = nullptr;

    lv_obj_t *timeoutBar = nullptr;
    lv_obj_t *titleLabel = nullptr;
    lv_obj_t *targetNameLabel = nullptr;
    lv_obj_t *progressLabel = nullptr;
    lv_obj_t *statusLabel = nullptr;
    lv_obj_t *hintLabel = nullptr;
    lv_obj_t *cancelButton = nullptr;
    View view;

    std::function<void()> onCancelCallback;
    static void onCancelButtonEvent(lv_event_t *e);
    static constexpr uint32_t CANCEL_GUARD_MS = 1000;
    uint32_t cancelGuardStartedMs = 0;
    bool cancelPressAccepted = false;

    // Countdown and counter text only change once per second; skip redundant label writes.
    int32_t shownRemainingSeconds = -1;
    uint32_t shownParticipantCount = UINT32_MAX;
    void updateCountdown(bool force);
    void applyStatus();
};
