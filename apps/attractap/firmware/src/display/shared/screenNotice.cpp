#include "screenNotice.hpp"

#include "../fonts/attractap_fonts.hpp"
#include "../theme.hpp"

namespace
{
    constexpr int32_t NOTICE_TOP_OFFSET = 48; // below the network badge and the drawer grabber
    constexpr uint32_t INFO_DURATION_MS = 4000;
    constexpr uint32_t ERROR_DURATION_MS = 8000;
}

uint32_t ScreenNotice::defaultDurationMs(Kind kind)
{
    return kind == Kind::Error ? ERROR_DURATION_MS : INFO_DURATION_MS;
}

void ScreenNotice::clear()
{
    if (timer)
    {
        lv_timer_delete(timer);
        timer = nullptr;
    }
    if (root)
    {
        // The delete handler below resets `root` and the timer.
        lv_obj_t *doomed = root;
        root = nullptr;
        lv_obj_delete(doomed);
    }
}

void ScreenNotice::show(lv_obj_t *screenRoot, Kind kind, const FirmwareI18n::Text &title,
                        const FirmwareI18n::Text &message, uint32_t durationMs)
{
    clear();
    if (!screenRoot)
        return;

    const lv_color_t accent = kind == Kind::Error ? DisplayTheme::danger()
                              : kind == Kind::Success ? DisplayTheme::success()
                                                      : DisplayTheme::primary();
    const lv_color_t soft = kind == Kind::Error ? DisplayTheme::dangerSoft()
                            : kind == Kind::Success ? DisplayTheme::successSoft()
                                                    : DisplayTheme::primarySoft();

    root = lv_obj_create(screenRoot);
    lv_obj_remove_style_all(root);
    // Floating: the notice must not take part in, or scroll with, the screen layout.
    lv_obj_add_flag(root, LV_OBJ_FLAG_IGNORE_LAYOUT);
    lv_obj_add_flag(root, LV_OBJ_FLAG_FLOATING);
    lv_obj_add_flag(root, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_remove_flag(root, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_width(root, lv_pct(92));
    lv_obj_set_height(root, LV_SIZE_CONTENT);
    lv_obj_align(root, LV_ALIGN_TOP_MID, 0, NOTICE_TOP_OFFSET);
    DisplayTheme::applySurface(root);
    lv_obj_set_style_bg_color(root, soft, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_border_color(root, accent, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_pad_all(root, 12, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_pad_row(root, 4, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_flex_flow(root, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_flex_align(root, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);

    lv_obj_t *titleLbl = lv_label_create(root);
    FirmwareI18n::setLabel(titleLbl, title);
    lv_obj_set_width(titleLbl, lv_pct(100));
    lv_obj_set_style_text_color(titleLbl, accent, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_text_font(titleLbl, &attractap_font_montserrat_latin1_18, LV_PART_MAIN | LV_STATE_DEFAULT);

    if (!message.empty())
    {
        lv_obj_t *messageLbl = lv_label_create(root);
        FirmwareI18n::setLabel(messageLbl, message);
        lv_obj_set_width(messageLbl, lv_pct(100));
        lv_obj_set_style_text_color(messageLbl, DisplayTheme::text(), LV_PART_MAIN | LV_STATE_DEFAULT);
        lv_obj_set_style_text_font(messageLbl, &attractap_font_montserrat_latin1_14, LV_PART_MAIN | LV_STATE_DEFAULT);
    }

    lv_obj_add_event_cb(root, [](lv_event_t *e)
                        {
        auto *self = static_cast<ScreenNotice *>(lv_event_get_user_data(e));
        if (lv_event_get_code(e) == LV_EVENT_CLICKED)
        {
            self->clear();
        }
        else if (lv_event_get_code(e) == LV_EVENT_DELETE)
        {
            // The screen (or the notice itself) went away: drop what refers to it.
            self->root = nullptr;
            if (self->timer)
            {
                lv_timer_delete(self->timer);
                self->timer = nullptr;
            }
        } }, LV_EVENT_ALL, this);

    timer = lv_timer_create([](lv_timer_t *t)
                            {
        auto *self = static_cast<ScreenNotice *>(lv_timer_get_user_data(t));
        self->timer = nullptr;
        lv_timer_delete(t);
        self->clear(); },
                            durationMs ? durationMs : defaultDurationMs(kind), this);
}
