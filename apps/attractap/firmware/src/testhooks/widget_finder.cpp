#include "widget_finder.hpp"

#include <cstring>

#include "lvgl_private.h"

namespace WidgetFinder
{
    namespace
    {
        bool hasInteractiveClass(const lv_obj_t *obj)
        {
            static const lv_obj_class_t *const classes[] = {
                &lv_button_class,
#if LV_USE_SWITCH
                &lv_switch_class,
#endif
#if LV_USE_CHECKBOX
                &lv_checkbox_class,
#endif
#if LV_USE_SLIDER
                &lv_slider_class,
#endif
#if LV_USE_DROPDOWN
                &lv_dropdown_class,
#endif
#if LV_USE_TEXTAREA
                &lv_textarea_class,
#endif
#if LV_USE_ROLLER
                &lv_roller_class,
#endif
#if LV_USE_ARC
                &lv_arc_class,
#endif
            };
            for (const lv_obj_class_t *cls : classes)
            {
                if (lv_obj_has_class(obj, cls))
                {
                    return true;
                }
            }
            return false;
        }

        bool isButtonMatrix(const lv_obj_t *obj)
        {
            return lv_obj_has_class(obj, &lv_buttonmatrix_class);
        }

        // Something a finger can operate: clickable and either a known input
        // widget or an object with its own event handler (custom buttons and
        // cards). Screens and layers are containers, never targets.
        bool isTouchable(lv_obj_t *obj)
        {
            if (!lv_obj_get_parent(obj) || !lv_obj_has_flag(obj, LV_OBJ_FLAG_CLICKABLE))
            {
                return false;
            }
            return isButtonMatrix(obj) || hasInteractiveClass(obj) || lv_obj_get_event_count(obj) > 0;
        }

        void addText(std::vector<std::string> &texts, const char *text)
        {
            std::string normalized = normalize(text);
            if (!normalized.empty())
            {
                texts.push_back(normalized);
            }
        }

        void collectTexts(lv_obj_t *obj, std::vector<std::string> &texts)
        {
            uint32_t count = lv_obj_get_child_count(obj);
            for (uint32_t i = 0; i < count; i++)
            {
                lv_obj_t *child = lv_obj_get_child(obj, static_cast<int32_t>(i));
                // Clipped children (e.g. other tab pages) are not on screen.
                if (lv_obj_has_flag(child, LV_OBJ_FLAG_HIDDEN) || isTouchable(child) || !lv_obj_is_visible(child))
                {
                    continue;
                }
                if (lv_obj_has_class(child, &lv_label_class))
                {
                    addText(texts, lv_label_get_text(child));
                }
                collectTexts(child, texts);
            }
        }

        // The part of `area` that parents and the display do not clip away.
        bool visiblePart(lv_obj_t *obj, const lv_area_t &area, lv_display_t *display, lv_area_t &out)
        {
            lv_area_t visible = area;
            for (lv_obj_t *parent = lv_obj_get_parent(obj); parent; parent = lv_obj_get_parent(parent))
            {
                if (lv_obj_has_flag(parent, LV_OBJ_FLAG_OVERFLOW_VISIBLE))
                {
                    continue;
                }
                lv_area_t clipped;
                if (!lv_area_intersect(&clipped, &visible, &parent->coords))
                {
                    return false;
                }
                visible = clipped;
            }
            lv_area_t screen = {0, 0, lv_display_get_horizontal_resolution(display) - 1,
                                lv_display_get_vertical_resolution(display) - 1};
            return lv_area_intersect(&out, &visible, &screen);
        }

        lv_obj_t *hitTest(lv_display_t *display, lv_point_t point)
        {
            // Same order as LVGL's pointer_search_obj().
            lv_obj_t *roots[] = {lv_display_get_layer_sys(display), lv_display_get_layer_top(display),
                                 lv_display_get_screen_active(display), lv_display_get_layer_bottom(display)};
            for (lv_obj_t *root : roots)
            {
                if (!root)
                {
                    continue;
                }
                lv_obj_t *hit = lv_indev_search_obj(root, &point);
                if (hit)
                {
                    return hit;
                }
            }
            return nullptr;
        }

        // The touch lands on `obj` itself or a passive child of it, not on
        // something covering it or a nested touchable widget.
        bool reaches(lv_obj_t *hit, lv_obj_t *obj)
        {
            for (lv_obj_t *cur = hit; cur; cur = lv_obj_get_parent(cur))
            {
                if (cur == obj)
                {
                    return true;
                }
                if (isTouchable(cur))
                {
                    return false;
                }
            }
            return false;
        }

        struct Walk
        {
            lv_display_t *display;
            std::vector<Widget> &out;

            bool place(Widget &widget)
            {
                lv_area_t visible;
                if (!visiblePart(widget.obj, widget.area, display, visible))
                {
                    return false;
                }
                widget.center = {(visible.x1 + visible.x2) / 2, (visible.y1 + visible.y2) / 2};
                widget.hittable = reaches(hitTest(display, widget.center), widget.obj);
                return true;
            }

            void addKeys(lv_obj_t *obj)
            {
                auto *matrix = reinterpret_cast<lv_buttonmatrix_t *>(obj);
                for (uint32_t i = 0; i < matrix->btn_cnt; i++)
                {
                    if (lv_buttonmatrix_has_button_ctrl(obj, i, LV_BUTTONMATRIX_CTRL_HIDDEN))
                    {
                        continue;
                    }
                    Widget key{};
                    key.obj = obj;
                    key.key = static_cast<int32_t>(i);
                    key.type = "key";
                    addText(key.texts, lv_buttonmatrix_get_button_text(obj, i));
                    key.area = matrix->button_areas[i];
                    lv_area_move(&key.area, obj->coords.x1, obj->coords.y1);
                    key.disabled = lv_obj_has_state(obj, LV_STATE_DISABLED) ||
                                   lv_buttonmatrix_has_button_ctrl(obj, i, LV_BUTTONMATRIX_CTRL_DISABLED);
                    key.checked = lv_buttonmatrix_has_button_ctrl(obj, i, LV_BUTTONMATRIX_CTRL_CHECKED);
                    if (place(key))
                    {
                        out.push_back(std::move(key));
                    }
                }
            }

            void add(lv_obj_t *obj)
            {
                Widget widget{};
                widget.obj = obj;
                widget.key = -1;
                const lv_obj_class_t *cls = lv_obj_get_class(obj);
                widget.type = (cls && cls->name) ? cls->name : "obj";
                if (lv_obj_has_class(obj, &lv_label_class))
                {
                    addText(widget.texts, lv_label_get_text(obj));
                }
#if LV_USE_TEXTAREA
                // An empty field shows its placeholder instead.
                if (lv_obj_has_class(obj, &lv_textarea_class) && !*lv_textarea_get_text(obj))
                {
                    addText(widget.texts, lv_textarea_get_placeholder_text(obj));
                }
#endif
#if LV_USE_DROPDOWN
                if (lv_obj_has_class(obj, &lv_dropdown_class))
                {
                    char selected[64];
                    lv_dropdown_get_selected_str(obj, selected, sizeof(selected));
                    addText(widget.texts, selected);
                }
#endif
                collectTexts(obj, widget.texts);
                lv_obj_get_coords(obj, &widget.area);
                widget.disabled = lv_obj_has_state(obj, LV_STATE_DISABLED);
                widget.checked = lv_obj_has_state(obj, LV_STATE_CHECKED);
                if (place(widget))
                {
                    out.push_back(std::move(widget));
                }
            }

            void visit(lv_obj_t *obj)
            {
                if (lv_obj_has_flag(obj, LV_OBJ_FLAG_HIDDEN))
                {
                    return;
                }
                // Later children draw on top, so they come first.
                for (int32_t i = static_cast<int32_t>(lv_obj_get_child_count(obj)) - 1; i >= 0; i--)
                {
                    visit(lv_obj_get_child(obj, i));
                }
                if (!isTouchable(obj) || !lv_obj_is_visible(obj))
                {
                    return;
                }
                if (isButtonMatrix(obj))
                {
                    addKeys(obj);
                }
                else
                {
                    add(obj);
                }
            }
        };
    }

    std::string Widget::text() const
    {
        std::string joined;
        for (const std::string &part : texts)
        {
            if (!joined.empty())
            {
                joined += ' ';
            }
            joined += part;
        }
        return joined;
    }

    std::vector<Widget> collect(lv_display_t *display)
    {
        std::vector<Widget> widgets;
        if (!display)
        {
            return widgets;
        }
        Walk walk{display, widgets};
        lv_obj_t *roots[] = {lv_display_get_layer_sys(display), lv_display_get_layer_top(display),
                             lv_display_get_screen_active(display), lv_display_get_layer_bottom(display)};
        for (lv_obj_t *root : roots)
        {
            if (root)
            {
                walk.visit(root);
            }
        }
        return widgets;
    }

    std::string normalize(const char *text)
    {
        std::string out;
        if (!text)
        {
            return out;
        }
        bool pendingSpace = false;
        for (const char *p = text; *p; p++)
        {
            char c = *p;
            if (c == ' ' || c == '\n' || c == '\r' || c == '\t')
            {
                pendingSpace = !out.empty();
                continue;
            }
            if (pendingSpace)
            {
                out += ' ';
                pendingSpace = false;
            }
            out += c;
        }
        return out;
    }

    bool parseMatch(const char *name, Match &out)
    {
        if (!name || strcmp(name, "exact") == 0)
        {
            out = Match::Exact;
            return true;
        }
        if (strcmp(name, "contains") == 0)
        {
            out = Match::Contains;
            return true;
        }
        return false;
    }

    // Drops LVGL symbol glyphs (Unicode private use area U+E000-U+F8FF,
    // e.g. the gear in LV_SYMBOL_SETTINGS " Settings").
    static std::string withoutSymbols(const std::string &text)
    {
        std::string out;
        for (size_t i = 0; i < text.size(); i++)
        {
            unsigned char lead = static_cast<unsigned char>(text[i]);
            unsigned char next = i + 1 < text.size() ? static_cast<unsigned char>(text[i + 1]) : 0;
            if (i + 2 < text.size() && (lead == 0xEE || (lead == 0xEF && next >= 0x80 && next <= 0xA3)))
            {
                i += 2;
                continue;
            }
            out += text[i];
        }
        return normalize(out.c_str());
    }

    static bool sameText(const std::string &wanted, const std::string &text)
    {
        return wanted == text || wanted == withoutSymbols(text);
    }

    bool matches(const Widget &widget, const std::string &query, Match mode)
    {
        std::string wanted = normalize(query.c_str());
        if (wanted.empty())
        {
            return false;
        }
        std::string joined = widget.text();
        if (mode == Match::Contains)
        {
            return joined.find(wanted) != std::string::npos;
        }
        if (sameText(wanted, joined))
        {
            return true;
        }
        for (const std::string &part : widget.texts)
        {
            if (sameText(wanted, part))
            {
                return true;
            }
        }
        return false;
    }

    const Widget *find(const std::vector<Widget> &widgets, const std::string &query, Match mode, size_t index)
    {
        for (const Widget &widget : widgets)
        {
            if (widget.hittable && matches(widget, query, mode))
            {
                if (index == 0)
                {
                    return &widget;
                }
                index--;
            }
        }
        return nullptr;
    }
}
