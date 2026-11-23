#include "display/i18n.hpp"
#include "extendSessionScreen.hpp"
#include "../../fonts/attractap_fonts.hpp"
#include "../../shared/durationText.hpp"
#include "../../shared/resultLayout.hpp"
#include "../../shared/screenChrome.hpp"
#include "../../../platform.hpp"

namespace
{
    constexpr int32_t StepWidth = 136;
    constexpr int32_t StepHeight = 48;
}

void ExtendSessionScreen::configure(const API::ResourceBrief &resource, std::function<void(uint32_t, bool)> extendCallback,
                                    std::function<void()> backCallback)
{
    onExtend = std::move(extendCallback);
    onBack = std::move(backCallback);
    lastRemaining = UINT32_MAX;
    update(resource);
    if (screen) build();
}

void ExtendSessionScreen::update(const API::ResourceBrief &resource)
{
    hasAutoEnd = resource.hasAutoEnd;
    hasMaxSessionTime = resource.hasMaxSessionTime;
    autoEndInSeconds = resource.autoEndInSeconds;
    extendLimitInSeconds = resource.extendLimitInSeconds;
    receivedMs = resource.autoEndReceivedMs;
    autoEndEpoch = resource.autoEndEpoch;
    utcOffsetMinutes = resource.autoEndUtcOffsetMinutes;
    refresh(true);
}

bool ExtendSessionScreen::stepEnabled(uint8_t index, uint32_t nowMs) const
{
    return hasAutoEnd && index < SessionDuration::EXTEND_STEP_COUNT &&
           SessionDuration::canExtendBy(autoEndInSeconds, extendLimitInSeconds, receivedMs, nowMs,
                                        SessionDuration::EXTEND_STEPS_MINUTES[index]);
}

bool ExtendSessionScreen::toMaxEnabled(uint32_t nowMs) const
{
    return hasAutoEnd && SessionDuration::canExtendToMax(hasMaxSessionTime, autoEndInSeconds, extendLimitInSeconds,
                                                         receivedMs, nowMs);
}

void ExtendSessionScreen::extendBy(uint8_t index)
{
    if (!stepEnabled(index, millis())) return;
    if (onExtend) onExtend(SessionDuration::EXTEND_STEPS_MINUTES[index], false);
}

void ExtendSessionScreen::extendToMax()
{
    if (!toMaxEnabled(millis())) return;
    if (onExtend) onExtend(0, true);
}

void ExtendSessionScreen::onStep(lv_event_t *e)
{
    auto *action = static_cast<Action *>(lv_event_get_user_data(e));
    action->self->extendBy(action->index);
}

void ExtendSessionScreen::init()
{
    if (screen) return;
    screen = ScreenChrome::createScreen();
    build();
}

void ExtendSessionScreen::build()
{
    lv_obj_clean(screen);
    lv_obj_t *column = ResultLayout::createColumn(screen);
    lv_obj_set_style_pad_row(column, 8, 0);

    ResultLayout::createText(column, FirmwareI18n::Message::ExtendSession, &attractap_font_montserrat_latin1_28,
                             DisplayTheme::text(), 1);
    remainingLabel = ResultLayout::createText(column, FirmwareI18n::Text(), &attractap_font_montserrat_latin1_36,
                                              DisplayTheme::primary(), 1);
    stopsAtLabel = ResultLayout::createText(column, FirmwareI18n::Text(), &attractap_font_montserrat_latin1_18,
                                            DisplayTheme::muted(), 1);

    // Six steps, three per row.
    for (uint8_t row = 0; row < 2; ++row)
    {
        lv_obj_t *line = ResultLayout::createButtonRow(column);
        for (uint8_t col = 0; col < 3; ++col)
        {
            const uint8_t index = row * 3 + col;
            actions[index] = {this, index};
            lv_obj_t *button = lv_button_create(line);
            DisplayTheme::button(button);
            lv_obj_set_size(button, StepWidth, StepHeight);
            lv_obj_t *label = lv_label_create(button);
            lv_obj_set_style_text_font(label, &attractap_font_montserrat_latin1_24, 0);
            FirmwareI18n::setLabel(label, FirmwareI18n::Text::format(FirmwareI18n::Message::ExtendStep,
                                                                    {DurationText::number(SessionDuration::EXTEND_STEPS_MINUTES[index] / 60)}));
            lv_obj_center(label);
            lv_obj_add_event_cb(button, &ExtendSessionScreen::onStep, LV_EVENT_CLICKED, &actions[index]);
            stepButtons[index] = button;
        }
    }

    toMaxButton = ResultLayout::createButton(column, FirmwareI18n::Message::ExtendToMax, DisplayTheme::primary(), false,
                                             [](lv_event_t *e) { static_cast<ExtendSessionScreen *>(lv_event_get_user_data(e))->extendToMax(); },
                                             this);
    const int32_t wide = 3 * StepWidth + 2 * ResultLayout::ButtonGap;
    lv_obj_set_width(toMaxButton, wide);
    // The label was cut to the standard button width; give it the wide one and set the text again.
    lv_obj_t *toMaxLabel = lv_obj_get_child(toMaxButton, 0);
    lv_obj_set_width(toMaxLabel, wide - 24);
    lv_obj_update_layout(toMaxLabel);
    FirmwareI18n::setLabel(toMaxLabel, FirmwareI18n::Message::ExtendToMax);
    noteLabel = ResultLayout::createText(column, FirmwareI18n::Text(), &attractap_font_montserrat_latin1_16,
                                         DisplayTheme::warning(), 1);
    ResultLayout::createButton(column, FirmwareI18n::Message::Back, DisplayTheme::primary(), true,
                               [](lv_event_t *e) {
                                   auto *self = static_cast<ExtendSessionScreen *>(lv_event_get_user_data(e));
                                   if (self->onBack) self->onBack();
                               },
                               this);
    refresh(true);
    lv_obj_update_layout(screen);
}

void ExtendSessionScreen::refresh(bool force)
{
    if (!screen || !remainingLabel) return;
    const uint32_t now = millis();
    const uint32_t remaining = SessionDuration::remainingSeconds(autoEndInSeconds, receivedMs, now);
    if (!force && remaining == lastRemaining) return;
    lastRemaining = remaining;

    setDynamicLabelTextIfChanged(remainingLabel, hasAutoEnd ? DurationText::countdown(remaining).c_str() : "--:--") /* i18n-data: Supplied number, address, timestamp, duration or numeric progress; the enclosing UI message owns its caption. */;
    const std::string clock = SessionDuration::clockString(autoEndEpoch, utcOffsetMinutes);
    setLabelTextIfChanged(stopsAtLabel, clock.empty() ? FirmwareI18n::Text()
        : FirmwareI18n::Text::format(FirmwareI18n::Message::ExtendStopsAt, {FirmwareI18n::Text::literal(clock) /* i18n-data: Supplied number, address, timestamp, duration or numeric progress; the enclosing UI message owns its caption. */}));

    bool any = false;
    for (uint8_t i = 0; i < SessionDuration::EXTEND_STEP_COUNT; ++i)
    {
        const bool enabled = stepEnabled(i, now);
        any = any || enabled;
        if (enabled) lv_obj_remove_state(stepButtons[i], LV_STATE_DISABLED);
        else lv_obj_add_state(stepButtons[i], LV_STATE_DISABLED);
    }
    const bool toMax = toMaxEnabled(now);
    any = any || toMax;
    // "To maximum" only exists for a machine with a maximum.
    lv_obj_set_flag(toMaxButton, LV_OBJ_FLAG_HIDDEN, !hasMaxSessionTime);
    if (toMax) lv_obj_remove_state(toMaxButton, LV_STATE_DISABLED);
    else lv_obj_add_state(toMaxButton, LV_STATE_DISABLED);
    const bool maxReached = !any && hasMaxSessionTime;
    lv_obj_set_flag(noteLabel, LV_OBJ_FLAG_HIDDEN, !maxReached);
    setLabelTextIfChanged(noteLabel, maxReached ? FirmwareI18n::Text(FirmwareI18n::Message::ExtendMaxReached) : FirmwareI18n::Text());
}

void ExtendSessionScreen::loop() { refresh(false); }
lv_obj_t *ExtendSessionScreen::getScreen() { return screen; }
std::string ExtendSessionScreen::getName() { return "ExtendSessionScreen"; }
void ExtendSessionScreen::onScreenLeave() {}

void ExtendSessionScreen::destroy()
{
    if (screen) lv_obj_delete(screen);
    screen = nullptr;
    remainingLabel = stopsAtLabel = noteLabel = toMaxButton = nullptr;
    stepButtons.fill(nullptr);
}
