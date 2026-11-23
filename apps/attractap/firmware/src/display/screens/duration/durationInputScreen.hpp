#pragma once

#include <array>
#include <cstdint>
#include <functional>
#include <string>

#include "../IScreen.hpp"
#include "../../../api/session_duration.hpp"

// Full-screen input of how long the machine will be used at most (ATT-43), shown before a start on a machine that
// requires an estimate. Hours and minutes steppers and quick picks; values above the machine's maximum cannot be
// reached. Cancel aborts the start. A routed screen shown over the one the user came from.
class DurationInputScreen : public IScreen
{
public:
    void init() override;
    void onScreenLeave() override;
    void loop() override;
    lv_obj_t *getScreen() override;
    std::string getName() override;
    void destroy() override;
    bool parksOrigin() const override { return true; }

    // `maxMinutes` 0: the machine has no maximum. Resets the value to one hour (or the maximum if shorter).
    void configure(const std::string &resourceName, uint32_t maxMinutes, std::function<void(uint32_t)> onConfirm,
                   std::function<void()> onCancel);

    uint32_t minutes() const { return value; }
    // The controls act on the value exactly as a tap does (host tests).
    void step(int32_t deltaMinutes);
    void pick(uint32_t minutes);
    void confirm();
    void cancel();
    bool pickEnabled(uint8_t index) const;

private:
    struct Action
    {
        DurationInputScreen *self;
        int32_t delta;     // stepper: minutes to add
        uint32_t pick;     // quick pick: minutes to set, 0 for steppers
    };

    lv_obj_t *screen = nullptr;
    std::string resourceName;
    uint32_t maxMinutes = 0;
    uint32_t value = 60;
    std::function<void(uint32_t)> onConfirm;
    std::function<void()> onCancel;

    std::array<Action, 4 + SessionDuration::QUICK_PICK_COUNT> actions{};
    lv_obj_t *valueLabel = nullptr;
    lv_obj_t *hoursLabel = nullptr;
    lv_obj_t *minutesLabel = nullptr;
    lv_obj_t *maxLabel = nullptr;
    lv_obj_t *hoursUp = nullptr;
    lv_obj_t *hoursDown = nullptr;
    lv_obj_t *minutesUp = nullptr;
    lv_obj_t *minutesDown = nullptr;
    std::array<lv_obj_t *, SessionDuration::QUICK_PICK_COUNT> quickPicks{};
    lv_obj_t *startButton = nullptr;

    void build();
    void refresh();
    lv_obj_t *createStepper(lv_obj_t *parent, const FirmwareI18n::Text &caption, int32_t step, lv_obj_t **valueOut,
                            lv_obj_t **upOut, lv_obj_t **downOut, size_t actionIndex);
    static void onAction(lv_event_t *e);
};
