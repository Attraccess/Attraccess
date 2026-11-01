#include "ui_builder.hpp"

#include <stdio.h>
#include <string.h>

#include "../fonts/attractap_fonts.hpp"
#include "../../platform.hpp"
#include "../i18n.hpp"
#include "../theme.hpp"
#include "ui_slot_cache.hpp"
#include "ui_slots.hpp"

namespace ui
{
    namespace
    {
        constexpr size_t MAX_COUNTDOWNS = 16;

        struct Countdown
        {
            lv_obj_t *label;
            int64_t toMs;
            int64_t serverNowMs;
            uint32_t receivedAtMillis;
            char last[12];
        };
        Countdown g_countdowns[MAX_COUNTDOWNS];
        lv_timer_t *g_timer = nullptr;

        void onCountdownDelete(lv_event_t *e)
        {
            lv_obj_t *label = static_cast<lv_obj_t *>(lv_event_get_target(e));
            for (Countdown &c : g_countdowns)
                if (c.label == label) c.label = nullptr;
        }

        void registerCountdownScalars(lv_obj_t *label, int64_t toMs, int64_t serverNowMs, uint32_t receivedAtMillis,
                                      uint32_t nowMillis)
        {
            for (Countdown &c : g_countdowns)
            {
                if (c.label) continue;
                c = Countdown{label, toMs, serverNowMs, receivedAtMillis, {}};
                lv_obj_add_event_cb(label, onCountdownDelete, LV_EVENT_DELETE, nullptr);
                char text[12];
                formatCountdown((toMs - serverNowMs) - static_cast<int64_t>(nowMillis - receivedAtMillis), text,
                                sizeof text);
                strncpy(c.last, text, sizeof c.last - 1);
                FirmwareI18n::setDynamicLabel(label, text) /* i18n-data: Countdown digits; no prose. */;
                return;
            }
            FirmwareI18n::setDynamicLabel(label, "--:--") /* i18n-data: Countdown placeholder; no prose. */;
        }

        void registerCountdown(lv_obj_t *label, const SlotRecord &rec, const Node &node, uint32_t nowMillis)
        {
            registerCountdownScalars(label, node.toMs, rec.serverNowMs, rec.receivedAtMillis, nowMillis);
        }

        const lv_font_t *fontFor(TextStyle style)
        {
            switch (style)
            {
            case TextStyle::Title: return &attractap_font_montserrat_latin1_20;
            case TextStyle::Small: return &attractap_font_montserrat_latin1_14;
            default: return &attractap_font_montserrat_latin1_18;
            }
        }

        const char *symbolFor(Icon icon)
        {
            switch (icon)
            {
            case Icon::Ok: return LV_SYMBOL_OK;
            case Icon::Warning: return LV_SYMBOL_WARNING;
            case Icon::Bell: return LV_SYMBOL_BELL;
            case Icon::Lock: return LV_SYMBOL_EYE_CLOSE; // LVGL has no padlock glyph
            case Icon::Clock: return LV_SYMBOL_REFRESH;  // nor a clock; closest built-in glyph
            }
            return LV_SYMBOL_OK;
        }

        void styleContainer(lv_obj_t *obj, const Node &node)
        {
            lv_obj_remove_style_all(obj);
            lv_obj_remove_flag(obj, LV_OBJ_FLAG_SCROLLABLE);
            lv_obj_set_width(obj, node.fill ? lv_pct(100) : LV_SIZE_CONTENT);
            lv_obj_set_height(obj, LV_SIZE_CONTENT);
            lv_obj_set_flex_flow(obj, node.type == NodeType::Row ? LV_FLEX_FLOW_ROW : LV_FLEX_FLOW_COLUMN);
            lv_obj_set_flex_align(obj, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_START);
            lv_obj_set_style_pad_row(obj, node.gap, LV_PART_MAIN);
            lv_obj_set_style_pad_column(obj, node.gap, LV_PART_MAIN);
            lv_obj_set_style_pad_all(obj, node.pad, LV_PART_MAIN);
            if (node.tone != Tone::None)
            {
                lv_obj_set_style_bg_color(obj, toneSoftColor(node.tone), LV_PART_MAIN);
                lv_obj_set_style_bg_opa(obj, LV_OPA_COVER, LV_PART_MAIN);
                lv_obj_set_style_radius(obj, DisplayTheme::Radius, LV_PART_MAIN);
            }
        }

        lv_obj_t *buildNode(lv_obj_t *parent, const SlotRecord &rec, const Node &node, uint32_t nowMillis)
        {
            switch (node.type)
            {
            case NodeType::Col:
            case NodeType::Row:
            {
                lv_obj_t *o = lv_obj_create(parent);
                styleContainer(o, node);
                return o;
            }
            case NodeType::Text:
            {
                lv_obj_t *l = lv_label_create(parent);
                FirmwareI18n::setDynamicLabel(l, rec.text(node)) /* i18n-data: Plugin text, localized by the plugin and sanitized to Latin-1 by the host. */;
                lv_label_set_long_mode(l, LV_LABEL_LONG_MODE_WRAP);
                lv_obj_set_style_text_font(l, fontFor(node.style), LV_PART_MAIN);
                lv_obj_set_style_text_color(l, node.style == TextStyle::Small ? DisplayTheme::muted() : DisplayTheme::text(),
                                            LV_PART_MAIN);
                if (node.fill) lv_obj_set_width(l, lv_pct(100));
                else lv_obj_set_style_max_width(l, lv_pct(100), LV_PART_MAIN);
                return l;
            }
            case NodeType::Badge:
            {
                lv_obj_t *b = lv_obj_create(parent);
                lv_obj_remove_style_all(b);
                lv_obj_remove_flag(b, LV_OBJ_FLAG_SCROLLABLE);
                lv_obj_set_size(b, LV_SIZE_CONTENT, LV_SIZE_CONTENT);
                lv_obj_set_style_bg_color(b, toneSoftColor(node.tone), LV_PART_MAIN);
                lv_obj_set_style_bg_opa(b, LV_OPA_COVER, LV_PART_MAIN);
                lv_obj_set_style_radius(b, DisplayTheme::Radius, LV_PART_MAIN);
                lv_obj_set_style_pad_hor(b, 8, LV_PART_MAIN);
                lv_obj_set_style_pad_ver(b, 2, LV_PART_MAIN);
                lv_obj_t *l = lv_label_create(b);
                FirmwareI18n::setDynamicLabel(l, rec.text(node)) /* i18n-data: Plugin text, localized by the plugin and sanitized to Latin-1 by the host. */;
                lv_obj_set_style_text_font(l, &attractap_font_montserrat_latin1_14, LV_PART_MAIN);
                lv_obj_set_style_text_color(l, toneColor(node.tone), LV_PART_MAIN);
                return b;
            }
            case NodeType::Icon:
            {
                lv_obj_t *l = lv_label_create(parent);
                FirmwareI18n::setDynamicLabel(l, symbolFor(node.icon)) /* i18n-data: Language-neutral LVGL icon glyph. */;
                lv_obj_set_style_text_font(l, &lv_font_montserrat_20, LV_PART_MAIN);
                lv_obj_set_style_text_color(l, toneColor(node.tone), LV_PART_MAIN);
                return l;
            }
            case NodeType::Button:
            {
                // Buttons are only allowed in steps; slots never contain them (the parser rejects them).
                lv_obj_t *b = lv_button_create(parent);
                lv_obj_t *l = lv_label_create(b);
                FirmwareI18n::setDynamicLabel(l, rec.text(node)) /* i18n-data: Plugin button label, localized by the plugin. */;
                lv_obj_center(l);
                if (node.secondary) DisplayTheme::secondaryButton(b);
                else DisplayTheme::button(b);
                return b;
            }
            case NodeType::Progress:
            {
                lv_obj_t *bar = lv_bar_create(parent);
                lv_obj_set_size(bar, lv_pct(100), 8);
                lv_bar_set_range(bar, 0, 100);
                lv_bar_set_value(bar, node.value, LV_ANIM_OFF);
                lv_obj_set_style_bg_color(bar, DisplayTheme::primarySoft(), LV_PART_MAIN);
                lv_obj_set_style_bg_opa(bar, LV_OPA_COVER, LV_PART_MAIN);
                lv_obj_set_style_bg_color(bar, toneColor(node.tone == Tone::None ? Tone::Primary : node.tone),
                                          LV_PART_INDICATOR);
                lv_obj_set_style_bg_opa(bar, LV_OPA_COVER, LV_PART_INDICATOR);
                return bar;
            }
            case NodeType::Countdown:
            {
                lv_obj_t *l = lv_label_create(parent);
                lv_obj_set_style_text_font(l, &attractap_font_montserrat_latin1_28, LV_PART_MAIN);
                lv_obj_set_style_text_color(l, toneColor(node.tone), LV_PART_MAIN);
                registerCountdown(l, rec, node, nowMillis);
                return l;
            }
            case NodeType::Spacer:
            {
                lv_obj_t *s = lv_obj_create(parent);
                lv_obj_remove_style_all(s);
                lv_obj_set_size(s, 1, node.height);
                return s;
            }
            }
            return nullptr;
        }
    }

    lv_color_t toneColor(Tone tone)
    {
        switch (tone)
        {
        case Tone::Success: return DisplayTheme::success();
        case Tone::Warning: return DisplayTheme::warning();
        case Tone::Danger: return DisplayTheme::danger();
        case Tone::Primary: return DisplayTheme::onPrimarySoft();
        default: return DisplayTheme::text();
        }
    }

    lv_color_t toneSoftColor(Tone tone)
    {
        switch (tone)
        {
        case Tone::Success: return DisplayTheme::successSoft();
        case Tone::Warning: return DisplayTheme::warningSoft();
        case Tone::Danger: return DisplayTheme::dangerSoft();
        case Tone::Primary: return DisplayTheme::primarySoft();
        default: return DisplayTheme::surfaceSecondary();
        }
    }

    bool poolHasRoomFor(int nodes)
    {
        lv_mem_monitor_t mon;
        lv_mem_monitor(&mon);
        if (mon.total_size == 0) return true; // libc allocator (host builds): no bounded pool to protect
        return mon.free_size >= POOL_FLOOR_BYTES + static_cast<uint32_t>(nodes) * NODE_COST_BYTES;
    }

    lv_obj_t *buildRecord(lv_obj_t *parent, const SlotRecord &rec, uint32_t nowMillis, bool framed)
    {
        if (!parent || rec.removal || rec.nodeCount == 0 || !poolHasRoomFor(rec.nodeCount)) return nullptr;

        lv_obj_t *root = lv_obj_create(parent);
        lv_obj_remove_style_all(root);
        lv_obj_remove_flag(root, LV_OBJ_FLAG_SCROLLABLE);
        lv_obj_set_width(root, lv_pct(100));
        lv_obj_set_height(root, LV_SIZE_CONTENT);
        if (framed)
        {
            // Neutral host frame: plugin content can't pose as a core status panel.
            lv_obj_set_style_bg_color(root, DisplayTheme::surface(), LV_PART_MAIN);
            lv_obj_set_style_bg_opa(root, LV_OPA_COVER, LV_PART_MAIN);
            lv_obj_set_style_border_color(root, DisplayTheme::border(), LV_PART_MAIN);
            lv_obj_set_style_border_width(root, 1, LV_PART_MAIN);
            lv_obj_set_style_radius(root, DisplayTheme::Radius, LV_PART_MAIN);
            lv_obj_set_style_pad_all(root, 8, LV_PART_MAIN);
        }

        // Pre-order records: a node's parent always precedes it, so one pass with a parent table builds all.
        lv_obj_t *objs[MAX_NODES] = {};
        for (uint8_t i = 0; i < rec.nodeCount; i++)
        {
            const Node &node = rec.nodes[i];
            lv_obj_t *p = node.parent == NO_PARENT ? root : objs[node.parent];
            objs[i] = p ? buildNode(p, rec, node, nowMillis) : nullptr;
            if (!objs[i])
            {
                lv_obj_delete(root); // per-slot isolation: drop only this contribution
                return nullptr;
            }
        }
        return root;
    }

    void registerCountdownLabel(lv_obj_t *label, int64_t toMs, int64_t serverNowMs, uint32_t receivedAtMillis,
                                uint32_t nowMillis)
    {
        registerCountdownScalars(label, toMs, serverNowMs, receivedAtMillis, nowMillis);
    }

    void tickCountdowns(uint32_t nowMillis)
    {
        for (Countdown &c : g_countdowns)
        {
            if (!c.label) continue;
            const int64_t remaining = (c.toMs - c.serverNowMs) - static_cast<int64_t>(nowMillis - c.receivedAtMillis);
            char text[12];
            formatCountdown(remaining, text, sizeof text);
            if (strcmp(text, c.last) != 0)
            {
                strncpy(c.last, text, sizeof c.last - 1);
                FirmwareI18n::setDynamicLabel(c.label, text) /* i18n-data: Countdown digits; no prose. */;
            }
        }
    }

    size_t countdownLabelCount()
    {
        size_t n = 0;
        for (const Countdown &c : g_countdowns) n += c.label != nullptr;
        return n;
    }

    void startCountdownTimer()
    {
        if (g_timer) return;
        g_timer = lv_timer_create([](lv_timer_t *) {
            const uint32_t now = millis();
            // Expiry is local (millis deltas against serverNowMs): no message is needed to clear a slot.
            if (slotCache().expire(now) > 0) notifySlotsExpired();
            tickCountdowns(now);
        }, 1000, nullptr);
    }
}
