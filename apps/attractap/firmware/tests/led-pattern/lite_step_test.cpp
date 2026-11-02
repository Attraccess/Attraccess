// Host test: the Lite card-confirm flow and the pattern -> LED/beeper calls production makes (LedFeedback::play).
#include "../../src/application/lite_step.hpp"

#include <cstdio>
#include <string>
#include <vector>

static int failures = 0;
#define CHECK(cond)                                                              \
    do {                                                                         \
        if (!(cond)) { std::fprintf(stderr, "FAIL %s:%d: %s\n", __FILE__, __LINE__, #cond); failures++; } \
    } while (0)

// Records the LedController / Beeper calls LedFeedback::play makes.
struct Calls
{
    std::vector<std::string> log;
    std::string joined() const
    {
        std::string out;
        for (const auto &c : log) out += (out.empty() ? "" : ",") + c;
        return out;
    }
};
struct FakeLeds
{
    Calls &calls;
    void triggerError() { calls.log.push_back("error"); }
    void triggerSuccess() { calls.log.push_back("success"); }
    void triggerReserved(bool thenBlocked) { calls.log.push_back(thenBlocked ? "reserved+blocked" : "reserved"); }
    void beginConfirmWait(uint32_t ms) { calls.log.push_back("confirm-wait:" + std::to_string(ms)); }
    void triggerWarning() { calls.log.push_back("warning"); }
};
struct FakeBeeper
{
    Calls &calls;
    void errorBeep() { calls.log.push_back("beep:error"); }
    void successBeep() { calls.log.push_back("beep:success"); }
    void singleBeep() { calls.log.push_back("beep:single"); }
};

static std::string play(LedFeedback::Pattern p, uint32_t window = 0, bool thenBlocked = false)
{
    Calls calls;
    FakeLeds leds{calls};
    FakeBeeper beeper{calls};
    LedFeedback::play(leds, beeper, p, window, thenBlocked);
    return calls.joined();
}

static ui::StepRequest cardConfirm(const char *id, int64_t ttlMs, uint32_t receivedAt = 0)
{
    ui::StepRequest s;
    s.requestId = 5;
    s.stepId = id;
    s.kind = ui::StepKind::CardConfirm;
    s.serverNowMs = 1000;
    s.expiresAtMs = 1000 + ttlMs;
    s.receivedAtMillis = receivedAt;
    return s;
}

int main()
{
    using LedFeedback::Pattern;
    CHECK(play(Pattern::Blocked) == "error,beep:error");
    CHECK(play(Pattern::Ok) == "success,beep:success");
    CHECK(play(Pattern::Reserved) == "reserved,beep:single");
    CHECK(play(Pattern::ConfirmWait, 20000) == "confirm-wait:20000,beep:single");
    CHECK(play(Pattern::Warning) == "warning,beep:single");

    // START_BLOCKED: the no-screen block policy shows reserved, then blocked; a plugin block only blocked.
    bool thenBlocked = false;
    CHECK(LiteStep::blockedPattern("CONFIRMATION_REQUIRED", thenBlocked) == Pattern::Reserved && thenBlocked);
    CHECK(play(Pattern::Reserved, 0, thenBlocked) == "reserved+blocked,beep:single");
    CHECK(LiteStep::blockedPattern("RESERVED", thenBlocked) == Pattern::Blocked && !thenBlocked);
    CHECK(LiteStep::blockedPattern("", thenBlocked) == Pattern::Blocked && !thenBlocked);

    // Second short tap by the same user confirms with the step id.
    LiteStep step;
    CHECK(step.open(cardConfirm("aaaaaaaaaaaaaaaaaaaaaa", 30000), "anna", 0));
    CHECK(step.isOpenStep("aaaaaaaaaaaaaaaaaaaaaa") && step.remainingMs(10000) == 20000);
    CHECK(!step.open(cardConfirm("bbbbbbbbbbbbbbbbbbbbbb", 30000), "anna", 0)); // one at a time
    CHECK(step.takeForTap("anna", 10000) == "aaaaaaaaaaaaaaaaaaaaaa" && !step.isOpen());

    // Another user's tap never confirms; it closes the window and starts without the step.
    CHECK(step.open(cardConfirm("cccccccccccccccccccccc", 30000), "anna", 0));
    CHECK(step.takeForTap("ben", 1000).empty() && !step.isOpen());
    CHECK(step.takeForTap("anna", 1000).empty()); // gone for good

    // An expired window confirms nothing.
    CHECK(step.open(cardConfirm("dddddddddddddddddddddd", 5000), "anna", 0));
    CHECK(!step.expired(4999) && step.expired(5000));
    CHECK(step.takeForTap("anna", 5000).empty());

    // Refused: other kinds, invalid or already expired steps.
    ui::StepRequest confirm = cardConfirm("eeeeeeeeeeeeeeeeeeeeee", 30000);
    confirm.kind = ui::StepKind::Confirm;
    CHECK(!step.open(confirm, "anna", 0));
    ui::StepRequest dropped = cardConfirm("ffffffffffffffffffffff", 30000);
    dropped.dropped = true;
    CHECK(!step.open(dropped, "anna", 0));
    CHECK(!step.open(cardConfirm("gggggggggggggggggggggg", 1000, 0), "anna", 1000));
    CHECK(!step.close());

    if (failures) return 1;
    std::puts("lite step ok");
    return 0;
}
