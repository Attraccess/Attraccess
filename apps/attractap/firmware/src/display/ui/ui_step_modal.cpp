#include "ui_step_modal.hpp"

#include "../fonts/attractap_fonts.hpp"
#include "../i18n.hpp"
#include "../theme.hpp"
#include "ui_builder.hpp"

namespace ui
{
    namespace
    {
        Tone toneOf(uint8_t t)
        {
            switch (t)
            {
            case 1: return Tone::Primary;
            case 2: return Tone::Success;
            case 3: return Tone::Warning;
            case 4: return Tone::Danger;
            default: return Tone::None;
            }
        }

        lv_obj_t *makeColumn(lv_obj_t *parent)
        {
            lv_obj_t *o = lv_obj_create(parent);
            lv_obj_remove_style_all(o);
            lv_obj_remove_flag(o, LV_OBJ_FLAG_SCROLLABLE);
            lv_obj_set_width(o, lv_pct(100));
            lv_obj_set_height(o, LV_SIZE_CONTENT);
            lv_obj_set_flex_flow(o, LV_FLEX_FLOW_COLUMN);
            return o;
        }
    }

    void StepModal::onClicked(lv_event_t *e)
    {
        auto *b = static_cast<Binding *>(lv_event_get_user_data(e));
        if (!b || !b->self || !b->self->callback_) return;
        // Copy first: the callback may hide() and invalidate the binding.
        const std::string stepId = b->self->stepId_;
        const std::string action = b->action;
        const bool isChoice = b->isChoice;
        auto cb = b->self->callback_;
        cb(stepId, action, isChoice);
    }

    lv_obj_t *StepModal::addButton(lv_obj_t *parent, const char *action, bool isChoice, bool primary,
                                   const std::string &label, int grow)
    {
        if (bindingCount_ >= sizeof(bindings_) / sizeof(bindings_[0])) return nullptr;
        Binding &binding = bindings_[bindingCount_++];
        binding = Binding{this, action, isChoice};
        lv_obj_t *btn = lv_button_create(parent);
        if (grow > 0) lv_obj_set_flex_grow(btn, grow);
        else lv_obj_set_width(btn, lv_pct(100));
        lv_obj_set_height(btn, LV_SIZE_CONTENT);
        lv_obj_set_style_pad_all(btn, 12, LV_PART_MAIN);
        if (primary) DisplayTheme::button(btn);
        else DisplayTheme::secondaryButton(btn);
        lv_obj_t *l = lv_label_create(btn);
        lv_obj_set_style_text_font(l, &attractap_font_montserrat_latin1_18, LV_PART_MAIN);
        lv_obj_set_align(l, LV_ALIGN_CENTER);
        FirmwareI18n::setDynamicLabel(l, label.c_str()) /* i18n-data: Plugin step button label (Latin-1, at most 31 bytes). */;
        lv_obj_add_event_cb(btn, onClicked, LV_EVENT_CLICKED, &binding);
        return btn;
    }

    void StepModal::hide()
    {
        if (overlay_) lv_obj_delete(overlay_);
        overlay_ = nullptr;
        stepId_.clear();
        bindingCount_ = 0;
    }

    void StepModal::show(const StepRequest &step, uint32_t nowMillis)
    {
        hide();
        stepId_ = step.stepId;

        lv_obj_t *overlay = lv_obj_create(lv_layer_top());
        overlay_ = overlay;
        lv_obj_remove_style_all(overlay);
        lv_obj_remove_flag(overlay, LV_OBJ_FLAG_SCROLLABLE);
        lv_obj_add_flag(overlay, LV_OBJ_FLAG_CLICKABLE);
        lv_obj_set_size(overlay, lv_pct(100), lv_pct(100));
        lv_obj_set_style_bg_color(overlay, DisplayTheme::text(), LV_PART_MAIN);
        lv_obj_set_style_bg_opa(overlay, 170, LV_PART_MAIN);

        lv_obj_t *panel = lv_obj_create(overlay);
        lv_obj_remove_style_all(panel);
        lv_obj_set_size(panel, lv_pct(100), lv_pct(100));
        DisplayTheme::applySurface(panel);
        lv_obj_set_style_pad_all(panel, 16, LV_PART_MAIN);
        lv_obj_set_flex_flow(panel, LV_FLEX_FLOW_COLUMN);
        lv_obj_remove_flag(panel, LV_OBJ_FLAG_SCROLLABLE);

        // Header: the X cancels, like the forms modal.
        lv_obj_t *header = lv_obj_create(panel);
        lv_obj_remove_style_all(header);
        lv_obj_remove_flag(header, LV_OBJ_FLAG_SCROLLABLE);
        lv_obj_set_width(header, lv_pct(100));
        lv_obj_set_height(header, LV_SIZE_CONTENT);
        lv_obj_set_flex_flow(header, LV_FLEX_FLOW_ROW);
        lv_obj_set_flex_align(header, LV_FLEX_ALIGN_END, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
        if (bindingCount_ < 8)
        {
            Binding &binding = bindings_[bindingCount_++];
            binding = Binding{this, "cancel", false};
            lv_obj_t *x = lv_button_create(header);
            lv_obj_set_size(x, 34, 34);
            DisplayTheme::secondaryButton(x);
            lv_obj_t *xl = lv_label_create(x);
            FirmwareI18n::setLabel(xl, FirmwareI18n::Text::literal(LV_SYMBOL_CLOSE) /* i18n-data: Language-neutral LVGL icon glyph. */);
            lv_obj_center(xl);
            lv_obj_add_event_cb(x, onClicked, LV_EVENT_CLICKED, &binding);
        }

        lv_obj_t *content = makeColumn(panel);
        lv_obj_set_flex_grow(content, 1);
        lv_obj_set_style_pad_row(content, 10, LV_PART_MAIN);
        lv_obj_set_style_pad_top(content, 6, LV_PART_MAIN);

        const Tone tone = toneOf(step.tone);
        lv_obj_t *title = lv_label_create(content);
        lv_obj_set_width(title, lv_pct(100));
        lv_label_set_long_mode(title, LV_LABEL_LONG_MODE_WRAP);
        lv_obj_set_style_text_font(title, &attractap_font_montserrat_latin1_24, LV_PART_MAIN);
        lv_obj_set_style_text_color(title, tone == Tone::None ? DisplayTheme::text() : toneColor(tone), LV_PART_MAIN);
        FirmwareI18n::setDynamicLabel(title, step.title.c_str()) /* i18n-data: Plugin step title, localized by the plugin. */;

        if (!step.body.empty())
        {
            lv_obj_t *body = lv_label_create(content);
            lv_obj_set_width(body, lv_pct(100));
            lv_label_set_long_mode(body, LV_LABEL_LONG_MODE_WRAP);
            lv_obj_set_style_text_font(body, &attractap_font_montserrat_latin1_18, LV_PART_MAIN);
            lv_obj_set_style_text_color(body, DisplayTheme::muted(), LV_PART_MAIN);
            FirmwareI18n::setDynamicLabel(body, step.body.c_str()) /* i18n-data: Plugin step body, localized by the plugin. */;
        }
        if (step.countdownToMs > 0)
        {
            lv_obj_t *countdown = lv_label_create(content);
            lv_obj_set_style_text_font(countdown, &attractap_font_montserrat_latin1_28, LV_PART_MAIN);
            lv_obj_set_style_text_color(countdown, tone == Tone::None ? DisplayTheme::text() : toneColor(tone), LV_PART_MAIN);
            registerCountdownLabel(countdown, step.countdownToMs, step.serverNowMs, step.receivedAtMillis, nowMillis);
        }

        if (step.kind == StepKind::Choose)
        {
            lv_obj_t *choices = makeColumn(content);
            lv_obj_set_style_pad_row(choices, 8, LV_PART_MAIN);
            for (uint8_t i = 0; i < step.choiceCount; i++)
                addButton(choices, step.choices[i].id.c_str(), true, i == 0, step.choices[i].label, 0);
            return;
        }

        // Footer: Cancel (secondary, grow 1) on the left, the primary action (grow 2) on the right.
        lv_obj_t *footer = lv_obj_create(panel);
        lv_obj_remove_style_all(footer);
        lv_obj_remove_flag(footer, LV_OBJ_FLAG_SCROLLABLE);
        lv_obj_set_width(footer, lv_pct(100));
        lv_obj_set_height(footer, LV_SIZE_CONTENT);
        lv_obj_set_flex_flow(footer, LV_FLEX_FLOW_ROW);
        lv_obj_set_style_pad_top(footer, 10, LV_PART_MAIN);
        lv_obj_set_style_pad_column(footer, 8, LV_PART_MAIN);
        const bool info = step.kind == StepKind::Info;
        if (!info)
        {
            lv_obj_t *cancel = addButton(footer, "cancel", false, false, step.cancelLabel, 1);
            if (cancel && step.cancelLabel.empty())
                FirmwareI18n::setLabel(lv_obj_get_child(cancel, 0), FirmwareI18n::Message::Cancel);
        }
        lv_obj_t *primary = addButton(footer, info ? "ok" : "confirm", false, true, step.confirmLabel, info ? 1 : 2);
        if (primary && step.confirmLabel.empty())
            FirmwareI18n::setLabel(lv_obj_get_child(primary, 0), info ? FirmwareI18n::Message::Ok : FirmwareI18n::Message::Start);
    }
}
