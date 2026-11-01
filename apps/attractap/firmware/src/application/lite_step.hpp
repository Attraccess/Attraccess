#pragma once

// Lite card-confirm (ATT-1187): the confirm window a plugin step opens on a reader without a screen, and the
// feedback a refused start gets. Hardware-free so tests/led-pattern drives it with fakes.

#include <string>

#include "../display/ui/ui_step.hpp"
#include "../led/led_feedback.hpp"

class LiteStep
{
public:
    // Opens the confirm window for `user`. False: refused (invalid, not card-confirm, one open, or expired).
    bool open(const ui::StepRequest &step, const std::string &user, uint32_t nowMillis)
    {
        if (step.dropped || step.kind != ui::StepKind::CardConfirm || open_ || step.remainingMs(nowMillis) <= 0)
            return false;
        step_ = step;
        user_ = user;
        open_ = true;
        return true;
    }

    // True for the step that is open right now (a resend after a lost ACK).
    bool isOpenStep(const std::string &stepId) const { return open_ && step_.stepId == stepId; }
    bool isOpen() const { return open_; }
    bool expired(uint32_t nowMillis) const { return open_ && step_.remainingMs(nowMillis) <= 0; }
    uint32_t remainingMs(uint32_t nowMillis) const
    {
        const int64_t left = step_.remainingMs(nowMillis);
        return left > 0 ? static_cast<uint32_t>(left) : 0;
    }

    // A short tap by `user` closes the window. Returns the step id that tap confirms; empty when it confirms
    // nothing (another user's tap never confirms, it starts without the step).
    std::string takeForTap(const std::string &user, uint32_t nowMillis)
    {
        std::string confirmed;
        if (open_ && user == user_ && step_.remainingMs(nowMillis) > 0) confirmed = step_.stepId;
        open_ = false;
        return confirmed;
    }

    // True if a window was open.
    bool close()
    {
        const bool was = open_;
        open_ = false;
        return was;
    }

    // START_BLOCKED feedback. The no-screen `block` policy (CONFIRMATION_REQUIRED: the plugin needs a
    // confirmation the reader cannot show) is the reserved pattern followed by the blocked one; a plugin's own
    // block is the blocked pattern.
    static LedFeedback::Pattern blockedPattern(const std::string &code, bool &thenBlocked)
    {
        thenBlocked = code == "CONFIRMATION_REQUIRED";
        return thenBlocked ? LedFeedback::Pattern::Reserved : LedFeedback::Pattern::Blocked;
    }

private:
    bool open_ = false;
    ui::StepRequest step_;
    std::string user_;
};
