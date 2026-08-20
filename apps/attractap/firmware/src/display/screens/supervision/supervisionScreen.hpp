#pragma once

#include <functional>

#include <string>

#include "../IScreen.hpp"
#include "../../../logger/logger.hpp"
#include "../../../utils.hpp"

// Two-card supervision screen (ATT-493). Shown after a non-introduced user taps at a resource that
// requires supervision. Visually mirrors EnrollmentScreen/ResetScreen (ATT-506): sticky until
// success/cancel/timeout, high-contrast text, phase-driven status line, prominent requester name,
// a styled 30s countdown bar and a cancel button.
//
// It tells the user to either place a supervisor's card on the reader OR have the supervisor
// approve from their phone/PC — the same pending request is resolved by whichever channel acts
// first.
class SupervisionScreen : public IScreen
{
public:
    SupervisionScreen() : logger("SupervisionScreen") {}
    void init();
    void onScreenLeave();
    void loop() override;
    lv_obj_t *getScreen() override;
    std::string getName() override;
    void destroy() override;

    enum Status
    {
        STATUS_WAITING,   // place the supervisor card, or approve via web
        STATUS_VERIFYING, // supervisor card read, verifying / starting session
        STATUS_SUCCESS,   // approved, session started
        STATUS_ERROR,     // something went wrong (e.g. card not authorised)
    };

    void setTimeoutTime(uint32_t timeoutTime);
    void setRequesterName(std::string requesterName);
    void setStatus(Status status);
    // Override the status line text (used for specific error messages). Cleared automatically on the
    // next setStatus() call that isn't STATUS_ERROR.
    void setStatusMessage(const std::string &message);
    // Secondary hint listing who may approve (supervisor names) plus the web fallback note.
    void setSupervisorHint(const std::string &hint);
    void setOnCancelCallback(std::function<void()> callback);
    // Call right before showing the screen. This is the only sticky screen opened by an on-screen
    // button press, so the finger that pressed "Sitzung starten" is usually still down while it
    // fades in — and entering the flow re-arms the PN532 on the shared I2C bus right as the fade
    // repaints the whole panel. That starves the GT911 of fresh samples for longer than the ATT-541
    // ghost-release hold window, so one continuous press is split into release + fresh press. The
    // second half of that split lands on the cancel button, which occupies the same lower-centre
    // area as the button just pressed, and cancelled the supervision about a second after it
    // started. Clicks whose press began inside the guard window are that split press (ATT-867).
    void armCancelGuard();

private:
    Logger logger;
    lv_obj_t *screen = nullptr;

    lv_obj_t *timeoutBar = nullptr;
    lv_obj_t *requesterNameLabel = nullptr;
    lv_obj_t *statusLabel = nullptr;
    lv_obj_t *hintLabel = nullptr;
    lv_obj_t *cancelButton = nullptr;
    std::string requesterNameCache;
    std::string statusMessageOverride;
    std::string hintCache;
    Status status = STATUS_WAITING;

    std::function<void()> onCancelCallback;
    static void onCancelButtonEvent(lv_event_t *e);
    // Guard window for the split press described at armCancelGuard(). Twice the 500ms screen fade,
    // so the second half lands well inside it even for a slow transition; a deliberate cancel means
    // reading the screen first and comes much later.
    static constexpr uint32_t CANCEL_GUARD_MS = 1000;
    uint32_t cancelGuardStartedMs = 0;
    bool cancelPressAccepted = false;

    uint32_t timeoutTime = 0;
    void updateTimeoutBar();
    void applyStatus();
};
