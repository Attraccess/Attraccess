#include "display/i18n.hpp"
#include "durationInputScreen.hpp"
#include "../../fonts/attractap_fonts.hpp"
#include "../../shared/durationText.hpp"
#include "../../shared/resultLayout.hpp"
#include "../../shared/screenChrome.hpp"

namespace
{
    constexpr int32_t RowGap = 10;
    constexpr int32_t StepperButton = 64;
    constexpr int32_t ChipWidth = 78;
    constexpr int32_t ChipHeight = 44;
    constexpr int32_t ControlHeight = 52;
}

void DurationInputScreen::configure(const std::string &name, uint32_t max, std::function<void(uint32_t)> confirmCallback,
                                    std::function<void()> cancelCallback)
{
    resourceName = name;
    maxMinutes = max;
    value = SessionDuration::initialMinutes(max);
    onConfirm = std::move(confirmCallback);
    onCancel = std::move(cancelCallback);
    if (screen) build();
}

void DurationInputScreen::init()
{
    if (screen) return;
    screen = ScreenChrome::createScreen();
    build();
}

void DurationInputScreen::step(int32_t deltaMinutes)
{
    value = SessionDuration::stepped(value, deltaMinutes, maxMinutes);
    refresh();
}

void DurationInputScreen::pick(uint32_t minutes)
{
    if (!SessionDuration::isAllowed(minutes, maxMinutes)) return;
    value = minutes;
    refresh();
}

bool DurationInputScreen::pickEnabled(uint8_t index) const
{
    return index < SessionDuration::QUICK_PICK_COUNT &&
           SessionDuration::isAllowed(SessionDuration::QUICK_PICKS_MINUTES[index], maxMinutes);
}

void DurationInputScreen::confirm()
{
    if (!SessionDuration::isAllowed(value, maxMinutes)) return;
    if (onConfirm) onConfirm(value);
}

void DurationInputScreen::cancel()
{
    if (onCancel) onCancel();
}

void DurationInputScreen::onAction(lv_event_t *e)
{
    auto *action = static_cast<Action *>(lv_event_get_user_data(e));
    if (action->pick) action->self->pick(action->pick);
    else action->self->step(action->delta);
}

// One stepper: [-]  value  [+] with a caption above. Touch targets are 64 x 52.
lv_obj_t *DurationInputScreen::createStepper(lv_obj_t *parent, const FirmwareI18n::Text &caption, int32_t stepMinutes,
                                             lv_obj_t **valueOut, lv_obj_t **upOut, lv_obj_t **downOut,
                                             size_t actionIndex)
{
    lv_obj_t *column = lv_obj_create(parent);
    lv_obj_remove_style_all(column);
    lv_obj_set_size(column, LV_SIZE_CONTENT, LV_SIZE_CONTENT);
    lv_obj_remove_flag(column, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_remove_flag(column, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_set_flex_flow(column, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_flex_align(column, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    lv_obj_set_style_pad_row(column, 4, 0);

    lv_obj_t *captionLabel = lv_label_create(column);
    lv_obj_set_style_text_font(captionLabel, &attractap_font_montserrat_latin1_16, 0);
    lv_obj_set_style_text_color(captionLabel, DisplayTheme::muted(), 0);
    FirmwareI18n::setLabel(captionLabel, caption);

    lv_obj_t *row = lv_obj_create(column);
    lv_obj_remove_style_all(row);
    lv_obj_set_size(row, LV_SIZE_CONTENT, LV_SIZE_CONTENT);
    lv_obj_remove_flag(row, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_remove_flag(row, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_set_flex_flow(row, LV_FLEX_FLOW_ROW);
    lv_obj_set_flex_align(row, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    lv_obj_set_style_pad_column(row, 8, 0);

    auto makeButton = [&](const char *glyph, int32_t delta, size_t index) {
        actions[index] = {this, delta, 0};
        lv_obj_t *button = lv_button_create(row);
        DisplayTheme::secondaryButton(button);
        lv_obj_set_size(button, StepperButton, ControlHeight);
        lv_obj_t *label = lv_label_create(button);
        lv_obj_set_style_text_font(label, &attractap_font_montserrat_latin1_28, 0);
        FirmwareI18n::setLabel(label, FirmwareI18n::Text::literal(glyph) /* i18n-data: Language-neutral numeric placeholder or close-control mark. */);
        lv_obj_center(label);
        lv_obj_add_event_cb(button, &DurationInputScreen::onAction, LV_EVENT_CLICKED, &actions[index]);
        return button;
    };
    *downOut = makeButton("-", -stepMinutes, actionIndex);
    *valueOut = lv_label_create(row);
    lv_obj_set_style_text_font(*valueOut, &attractap_font_montserrat_latin1_28, 0);
    lv_obj_set_style_text_color(*valueOut, DisplayTheme::text(), 0);
    lv_obj_set_style_text_align(*valueOut, LV_TEXT_ALIGN_CENTER, 0);
    lv_obj_set_width(*valueOut, 56);
    *upOut = makeButton("+", stepMinutes, actionIndex + 1);
    return column;
}

void DurationInputScreen::build()
{
    lv_obj_clean(screen);
    lv_obj_t *column = ResultLayout::createColumn(screen);
    lv_obj_set_style_pad_row(column, RowGap, 0);

    ResultLayout::createText(column, FirmwareI18n::Message::DurationTitle, &attractap_font_montserrat_latin1_24,
                             DisplayTheme::text(), 2);
    ResultLayout::createText(column, FirmwareI18n::Message::DurationHint, &attractap_font_montserrat_latin1_16,
                             DisplayTheme::muted(), 3);

    valueLabel = ResultLayout::createText(column, DurationText::minutes(value), &attractap_font_montserrat_latin1_36,
                                          DisplayTheme::primary(), 1);

    lv_obj_t *steppers = lv_obj_create(column);
    lv_obj_remove_style_all(steppers);
    lv_obj_set_size(steppers, LV_SIZE_CONTENT, LV_SIZE_CONTENT);
    lv_obj_remove_flag(steppers, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_remove_flag(steppers, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_set_flex_flow(steppers, LV_FLEX_FLOW_ROW);
    lv_obj_set_style_pad_column(steppers, 24, 0);
    createStepper(steppers, FirmwareI18n::Message::DurationHoursLabel, SessionDuration::HOUR_STEP_MINUTES, &hoursLabel,
                  &hoursUp, &hoursDown, 0);
    createStepper(steppers, FirmwareI18n::Message::DurationMinutesLabel, SessionDuration::MINUTE_STEP_MINUTES,
                  &minutesLabel, &minutesUp, &minutesDown, 2);

    lv_obj_t *chips = lv_obj_create(column);
    lv_obj_remove_style_all(chips);
    lv_obj_set_size(chips, LV_SIZE_CONTENT, LV_SIZE_CONTENT);
    lv_obj_remove_flag(chips, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_remove_flag(chips, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_set_flex_flow(chips, LV_FLEX_FLOW_ROW);
    lv_obj_set_style_pad_column(chips, 6, 0);
    for (uint8_t i = 0; i < SessionDuration::QUICK_PICK_COUNT; ++i)
    {
        actions[4 + i] = {this, 0, SessionDuration::QUICK_PICKS_MINUTES[i]};
        lv_obj_t *chip = lv_button_create(chips);
        DisplayTheme::secondaryButton(chip);
        lv_obj_set_size(chip, ChipWidth, ChipHeight);
        lv_obj_t *label = lv_label_create(chip);
        lv_obj_set_style_text_font(label, &attractap_font_montserrat_latin1_18, 0);
        FirmwareI18n::setLabel(label, DurationText::minutes(SessionDuration::QUICK_PICKS_MINUTES[i]));
        lv_obj_center(label);
        lv_obj_add_event_cb(chip, &DurationInputScreen::onAction, LV_EVENT_CLICKED, &actions[4 + i]);
        quickPicks[i] = chip;
    }

    maxLabel = ResultLayout::createText(column, FirmwareI18n::Text(), &attractap_font_montserrat_latin1_16,
                                        DisplayTheme::warning(), 1);

    lv_obj_t *buttons = ResultLayout::createButtonRow(column);
    ResultLayout::createButton(buttons, FirmwareI18n::Message::Cancel, DisplayTheme::primary(), true,
                               [](lv_event_t *e) { static_cast<DurationInputScreen *>(lv_event_get_user_data(e))->cancel(); },
                               this);
    startButton = ResultLayout::createButton(
        buttons, FirmwareI18n::Message::Start, DisplayTheme::primary(), false,
        [](lv_event_t *e) { static_cast<DurationInputScreen *>(lv_event_get_user_data(e))->confirm(); }, this);
    refresh();
    lv_obj_update_layout(screen);
}

void DurationInputScreen::refresh()
{
    if (!screen) return;
    const auto split = SessionDuration::splitMinutes(value);
    setLabelTextIfChanged(valueLabel, DurationText::minutes(value));
    setLabelTextIfChanged(hoursLabel, DurationText::number(split.hours));
    setLabelTextIfChanged(minutesLabel, DurationText::number(split.minutes));

    auto enable = [](lv_obj_t *object, bool enabled) {
        if (enabled) lv_obj_remove_state(object, LV_STATE_DISABLED);
        else lv_obj_add_state(object, LV_STATE_DISABLED);
    };
    enable(hoursUp, SessionDuration::stepped(value, SessionDuration::HOUR_STEP_MINUTES, maxMinutes) != value);
    enable(hoursDown, SessionDuration::stepped(value, -static_cast<int32_t>(SessionDuration::HOUR_STEP_MINUTES), maxMinutes) != value);
    enable(minutesUp, SessionDuration::stepped(value, SessionDuration::MINUTE_STEP_MINUTES, maxMinutes) != value);
    enable(minutesDown, SessionDuration::stepped(value, -static_cast<int32_t>(SessionDuration::MINUTE_STEP_MINUTES), maxMinutes) != value);
    for (uint8_t i = 0; i < SessionDuration::QUICK_PICK_COUNT; ++i) enable(quickPicks[i], pickEnabled(i));
    enable(startButton, SessionDuration::isAllowed(value, maxMinutes));

    // The maximum is always shown when there is one; the colour warns once the value sits on it.
    const FirmwareI18n::Text maxText = maxMinutes == 0 ? FirmwareI18n::Text()
        : FirmwareI18n::Text::format(FirmwareI18n::Message::DurationMaxLine, {DurationText::minutes(maxMinutes)});
    setLabelTextIfChanged(maxLabel, maxText);
    lv_obj_set_style_text_color(maxLabel, maxMinutes != 0 && value >= SessionDuration::upperBound(maxMinutes) ? DisplayTheme::warning() : DisplayTheme::muted(), 0);
}

lv_obj_t *DurationInputScreen::getScreen() { return screen; }
void DurationInputScreen::loop() {}
std::string DurationInputScreen::getName() { return "DurationInputScreen"; }
void DurationInputScreen::onScreenLeave() {}

void DurationInputScreen::destroy()
{
    if (screen) lv_obj_delete(screen);
    screen = nullptr;
    valueLabel = hoursLabel = minutesLabel = maxLabel = nullptr;
    hoursUp = hoursDown = minutesUp = minutesDown = startButton = nullptr;
    quickPicks.fill(nullptr);
}
