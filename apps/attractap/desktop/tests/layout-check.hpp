#pragma once

#include <lvgl.h>

#include <algorithm>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>

// Geometry check for a rendered screen. No visible label, button, field or
// keyboard may intersect another one (other than its own container), the chrome
// on the top layer (drawer grabber, network badge, device footer), or the edge
// of the display.
namespace LayoutCheck
{
    struct Item
    {
        lv_obj_t *object;
        lv_area_t box;
        std::string name;
    };

    inline bool shown(lv_obj_t *object)
    {
        for (; object; object = lv_obj_get_parent(object))
            if (lv_obj_has_flag(object, LV_OBJ_FLAG_HIDDEN)) return false;
        return true;
    }

    inline bool contains(lv_obj_t *outer, lv_obj_t *inner)
    {
        for (; inner; inner = lv_obj_get_parent(inner))
            if (inner == outer) return true;
        return false;
    }

    inline bool intersects(const lv_area_t &a, const lv_area_t &b)
    {
        // One pixel of slack: boxes that merely touch are not overlapping.
        return a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;
    }

    // Area the text of a label really paints, not its (often full-width) box.
    inline lv_area_t textBox(lv_obj_t *label)
    {
        lv_area_t box;
        lv_obj_get_coords(label, &box);
        // The text lives in the padded content area.
        box.x1 += lv_obj_get_style_pad_left(label, LV_PART_MAIN);
        box.x2 -= lv_obj_get_style_pad_right(label, LV_PART_MAIN);
        const char *text = lv_label_get_text(label);
        const lv_font_t *font = lv_obj_get_style_text_font(label, LV_PART_MAIN);
        const int32_t letter = lv_obj_get_style_text_letter_space(label, LV_PART_MAIN);
        const int32_t line = lv_obj_get_style_text_line_space(label, LV_PART_MAIN);
        const auto mode = lv_label_get_long_mode(label);
        const int32_t boxWidth = lv_area_get_width(&box);
        lv_point_t size;
        lv_text_get_size(&size, text, font, letter, line, mode == LV_LABEL_LONG_WRAP ? boxWidth : LV_COORD_MAX, LV_TEXT_FLAG_NONE);
        int32_t width = std::min<int32_t>(size.x, boxWidth);
        int32_t height = mode == LV_LABEL_LONG_WRAP ? size.y : std::min<int32_t>(size.y, lv_font_get_line_height(font));
        height = std::min<int32_t>(height, lv_area_get_height(&box));
        lv_area_t out = box;
        switch (lv_obj_get_style_text_align(label, LV_PART_MAIN))
        {
        case LV_TEXT_ALIGN_CENTER: out.x1 = box.x1 + (boxWidth - width) / 2; break;
        case LV_TEXT_ALIGN_RIGHT: out.x1 = box.x2 - width + 1; break;
        default: break;
        }
        out.x2 = out.x1 + width - 1;
        out.y2 = out.y1 + height - 1;
        // The line box is taller than the ink (ascender and descender room): ignore a tenth of it each side.
        const int32_t trim = lv_font_get_line_height(font) / 10;
        if (height > 2 * trim + 2)
        {
            out.y1 += trim;
            out.y2 -= trim;
        }
        return out;
    }

    inline std::string at(const lv_area_t &box)
    {
        return " [" + std::to_string(box.x1) + "," + std::to_string(box.y1) + " to " + std::to_string(box.x2) + "," + std::to_string(box.y2) + "]";
    }

    inline std::string describe(lv_obj_t *object)
    {
        if (lv_obj_check_type(object, &lv_label_class)) return std::string("label '") + lv_label_get_text(object) + "'";
        if (lv_obj_check_type(object, &lv_button_class))
        {
            for (uint32_t i = 0; i < lv_obj_get_child_count(object); ++i)
                if (lv_obj_check_type(lv_obj_get_child(object, i), &lv_label_class))
                    return std::string("button '") + lv_label_get_text(lv_obj_get_child(object, i)) + "'";
            return "button";
        }
        if (lv_obj_check_type(object, &lv_textarea_class)) return "text field";
        if (lv_obj_check_type(object, &lv_keyboard_class)) return "keyboard";
        return "widget";
    }

    inline bool clipTo(lv_area_t &box, const lv_area_t &clip)
    {
        const lv_area_t result = {std::max(box.x1, clip.x1), std::max(box.y1, clip.y1),
                                  std::min(box.x2, clip.x2), std::min(box.y2, clip.y2)};
        if (result.x1 > result.x2 || result.y1 > result.y2) return false;
        box = result;
        return true;
    }

    // `clip` is what the ancestors let through: LVGL clips a child to its parent.
    inline void collect(lv_obj_t *root, std::vector<Item> &items, lv_area_t clip)
    {
        if (!root || lv_obj_has_flag(root, LV_OBJ_FLAG_HIDDEN)) return;
        lv_area_t own;
        lv_obj_get_coords(root, &own);
        const auto add = [&](const lv_area_t &box)
        {
            lv_area_t visible = box;
            if (clipTo(visible, clip)) items.push_back({root, visible, describe(root)});
        };
        if (lv_obj_check_type(root, &lv_label_class))
        {
            if (lv_label_get_text(root)[0]) add(textBox(root));
        }
        else if (lv_obj_check_type(root, &lv_button_class) || lv_obj_check_type(root, &lv_textarea_class) ||
                 lv_obj_check_type(root, &lv_keyboard_class))
        {
            add(own);
            // A button in its error state wears a skin that covers its own caption.
            for (uint32_t i = 0; i < lv_obj_get_child_count(root); ++i)
            {
                lv_obj_t *child = lv_obj_get_child(root, i);
                if (!lv_obj_has_flag(child, LV_OBJ_FLAG_HIDDEN) && lv_obj_has_flag(child, LV_OBJ_FLAG_FLOATING))
                {
                    lv_area_t childClip = clip;
                    if (clipTo(childClip, own)) collect(child, items, childClip);
                    return;
                }
            }
        }
        lv_area_t childClip = clip;
        if (!lv_obj_has_flag(root, LV_OBJ_FLAG_OVERFLOW_VISIBLE) && !clipTo(childClip, own)) return;
        for (uint32_t i = 0; i < lv_obj_get_child_count(root); ++i) collect(lv_obj_get_child(root, i), items, childClip);
    }

    // A visible full-size child that ignores the layout (the action overlay, a text editor) covers
    // the screen under it.
    inline lv_obj_t *effectiveRoot(lv_obj_t *screen)
    {
        lv_obj_t *root = screen;
        for (uint32_t i = 0; i < lv_obj_get_child_count(screen); ++i)
        {
            lv_obj_t *child = lv_obj_get_child(screen, i);
            if (!lv_obj_has_flag(child, LV_OBJ_FLAG_HIDDEN) && (lv_obj_has_flag(child, LV_OBJ_FLAG_FLOATING) || lv_obj_has_flag(child, LV_OBJ_FLAG_IGNORE_LAYOUT)) &&
                lv_obj_get_width(child) >= 400 && lv_obj_get_height(child) >= 400)
                root = child;
        }
        return root;
    }

    // Problems found on the active screen; empty when the layout is clean.
    inline std::vector<std::string> problems(lv_obj_t *screen = lv_screen_active())
    {
        lv_obj_update_layout(screen);
        std::vector<Item> items;
        collect(effectiveRoot(screen), items, lv_area_t{0, 0, 479, 479});
        std::vector<std::string> out;
        const auto note = [&](const std::string &text) { out.push_back(text); };
        // The chrome is whatever is visible on the top layer: grabber, network badge, device footer
        // (the session summary hides all three). The drawer only counts while it is open.
        std::vector<std::pair<std::string, lv_area_t>> chrome;
        lv_obj_t *top = lv_layer_top();
        for (uint32_t i = 0; i < lv_obj_get_child_count(top); ++i)
        {
            lv_obj_t *child = lv_obj_get_child(top, i);
            if (lv_obj_has_flag(child, LV_OBJ_FLAG_HIDDEN) || lv_obj_get_width(child) >= 400 && lv_obj_get_height(child) >= 100)
                continue;
            lv_area_t box;
            lv_obj_get_coords(child, &box);
            const char *name = lv_obj_get_width(child) <= 80 && lv_obj_get_height(child) <= 10 ? "drawer grabber"
                               : lv_obj_get_width(child) <= 80                                   ? "network badge"
                                                                                                 : "device footer";
            chrome.push_back({name, box});
        }
        // Content scrolled away (the other tabs of a tab view) is not on screen at all.
        items.erase(std::remove_if(items.begin(), items.end(), [](const Item &item)
                                   { return item.box.x1 > 479 || item.box.x2 < 0 || item.box.y1 > 479 || item.box.y2 < 0; }),
                    items.end());
        for (const auto &item : items)
        {
            if (item.box.x1 < 0 || item.box.x2 > 479 || item.box.y1 < 0 || item.box.y2 > 479)
                note(item.name + at(item.box) + " leaves the display");
            for (const auto &c : chrome)
                if (intersects(item.box, c.second)) note(item.name + at(item.box) + " overlaps the " + c.first + at(c.second));
        }
        for (size_t a = 0; a < items.size(); ++a)
            for (size_t b = a + 1; b < items.size(); ++b)
            {
                if (contains(items[a].object, items[b].object) || contains(items[b].object, items[a].object)) continue;
                if (intersects(items[a].box, items[b].box)) note(items[a].name + at(items[a].box) + " overlaps " + items[b].name + at(items[b].box));
            }
        return out;
    }
}
