#pragma once

#include <array>
#include <cstdint>
#include <functional>
#include <string>

#include "../IScreen.hpp"
#include "../../../api/api.hpp"
#include "../../../api/session_duration.hpp"

// Extension of the card holder's running session (ATT-43), reached from the session area of the resource details:
// the time left, when it stops and the extension steps. Steps past the machine's maximum are disabled; the list
// the server resends after an extension (or after one made on the web) refreshes it live.
class ExtendSessionScreen : public IScreen
{
public:
    void init() override;
    void onScreenLeave() override;
    void loop() override;
    lv_obj_t *getScreen() override;
    std::string getName() override;
    void destroy() override;
    bool parksOrigin() const override { return true; }

    // `onExtend(minutes, toMax)`: minutes is 0 for toMax. `onBack` leaves the screen.
    void configure(const API::ResourceBrief &resource, std::function<void(uint32_t, bool)> onExtend,
                   std::function<void()> onBack);
    // A fresher list arrived while the screen is open.
    void update(const API::ResourceBrief &resource);

    // Whether the control is enabled now (host tests); `index` counts the steps, `toMax` asks for "to maximum".
    bool stepEnabled(uint8_t index, uint32_t nowMs) const;
    bool toMaxEnabled(uint32_t nowMs) const;
    void extendBy(uint8_t index);
    void extendToMax();

private:
    struct Action
    {
        ExtendSessionScreen *self;
        uint8_t index;
    };

    lv_obj_t *screen = nullptr;
    // What the controls need of the own session; see API::ResourceBrief.
    bool hasAutoEnd = false;
    bool hasMaxSessionTime = false;
    uint32_t autoEndInSeconds = 0;
    uint32_t extendLimitInSeconds = 0;
    uint32_t receivedMs = 0;
    uint32_t autoEndEpoch = 0;
    int16_t utcOffsetMinutes = 0;
    std::function<void(uint32_t, bool)> onExtend;
    std::function<void()> onBack;

    std::array<Action, SessionDuration::EXTEND_STEP_COUNT> actions{};
    lv_obj_t *remainingLabel = nullptr;
    lv_obj_t *stopsAtLabel = nullptr;
    lv_obj_t *noteLabel = nullptr;
    std::array<lv_obj_t *, SessionDuration::EXTEND_STEP_COUNT> stepButtons{};
    lv_obj_t *toMaxButton = nullptr;
    uint32_t lastRemaining = UINT32_MAX;

    void build();
    void refresh(bool force);
    static void onStep(lv_event_t *e);
};
